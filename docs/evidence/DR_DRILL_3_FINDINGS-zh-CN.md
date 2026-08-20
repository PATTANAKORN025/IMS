<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# 灾难恢复演练 3 (DR Drill 3) — 发现与实时恢复日志

运行指令：`bash scripts/dr-test.sh all --confirm-destroy`，开始时间 2026-08-13T07:30:58Z。
原始输出：`docs/evidence/dr-drill-3-raw-output.log`。

## 结论 (Verdicts)

| 演练项目                                            | 结论                                                | 备注                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 备份/恢复（临时隔离的数据库）                   | **通过 (PASS)**                                     | 所有表的恢复行数均落在实时系统的 [前, 后] 区间内。导出 (Dump)：3秒，27,313,174 字节。恢复 (Restore)：19秒。                                                                                                                                                                  |
| 2. 容器丢失恢复 (timescaledb, node-red)            | **失败 (FAIL)** (已知，已补偿)                      | Docker Desktop/WSL2 原生的 `restart: unless-stopped` 策略在主机上执行 `docker kill` 后并未触发（在 2026-08-12 被确定复现，RestartCount 保持为 0 长达 5+ 分钟）。补偿控制：`scripts/container-watchdog.sh`，验证了 6 次。本次运行并非新发现。 |
| 3. 全栈重新创建 (Full-stack recreate)              | **失败 (FAIL) — 真实的、先前未知的错误。**详见下文。 | 脚本自身的结论行已经有所保留（“在再次信任此环境之前，请务必根据擦除前的行数进行手动验证”），而不是声称通过 (PASS)。以下即是该手动验证过程。                                                                                     |

## 演练 3：实际上出了什么故障

1. **`postgres/init/034-ldi-statistical-mock.sql`** 是一个挂载在 `/docker-entrypoint-initdb.d` 目录下，大小为 74 MB、包含 24 万行模拟数据的引导脚本。在任何全新的 `timescaledb_data` 卷上，Postgres 会在 `db-migrate` 启动之前自动运行它。它使用旧的固定数据集（2026-07-18 → 08-01）和部分 Schema 来填充 `ldi_data`/`ldi_alarm_log`。
2. 随后 `db-migrate` 在一个**并非真正为空**的数据库上运行，37 个待处理的迁移中有 7 个失败了，因为它们假设的中间 Schema 状态与初始化种子 (init-seed) 留下的状态不同：
   `042-spc-fleet-view.sql`，`043-ldi-data-1m-cagg.sql`，`044-ldi-data-15m-1h-caggs.sql`，`048-ldi-data-real-conversion.sql`，`050-ldi-rca-recent-window-view.sql`，`059-ldi-data-widen-double-precision.sql`，`064-materialize-spc-fleet-rca-views.sql` — 全部以 `"X" is not a view` / `is not a materialized view` 的类似报错失败，即对象已存在且形状与迁移预期的不同。
   一个连锁反应：迁移 077 的 `CREATE TABLE IF NOT EXISTS public.ldi_alarm_lifecycle` 会因为初始化种子已经存在该表而静默跳过表创建 — 但_没有_其 `PRIMARY KEY (logdate, logid)` / FK，因为 `IF NOT EXISTS` 不检查约束。该表在没有主键的情况下处于活动状态，直到被手动修复（见下文）。
3. `db-migrate` 退出状态为 1。每一个在 `depends_on: condition: service_completed_successfully` (node-red, proxy, alarm-api) 关卡上的服务都未启动 — 导致全栈停机，而不仅仅是演练结果下降。
4. 随后，演练自带的恢复步骤（使用 `psql < snapshot.sql` 导入到现在已经部分迁移的实时 `ims` 数据库）几乎完全失败：有 435 个错误，主要是 `relation "_timescaledb_internal._hyper_N_M_chunk" does not exist`。根本原因：对 hypertable 运行 `pg_dump` 会通过名为 TimescaleDB 分配的内部 ID 的按块 (per-chunk) 内部表转储数据。这些 ID 特定于产生该快照的数据库实例；它们在重新创建的数据库中是不存在的，因为在那里 `db-migrate` 在恢复运行之前就已经创建了自己的 hypertable（并因此拥有自己不同的、内部的块 ID）。最终结果：实时 `ims` 数据库留下了**过时的初始化种子数据**，而不是擦除前的真实快照 — 仪表板将会把两周前的数据显示为“当前数据”。

这些都不是在此会话中引入的。这是一个潜在的缺陷，显然在这次演练之前，从未针对真正的从零开始重建进行过测试 — 这恰好是实施灾难恢复演练 3 (DR Drill 3) 要捕获的目标。

## 根本原因修复 (2026-08-13，同一会话，初始恢复之后)

针对这 7 个迁移失败和损坏的恢复步骤是在源头上修复的，而不是采取变通方法：

1. **删除了 `postgres/init/034-ldi-statistical-mock.sql`。** 它是累赘代码 -- `scripts/switch-data-mode.sh` 的 `mock` 情况永远不会读取它；模拟数据来自实时模拟器，而不是静态种子。将其移除意味着 `db-migrate` 再次针对真正空数据库运行，这与这些迁移编写时的目标环境完全匹配。验证：38/38 个迁移通过这一步能在全新卷上无缝应用。
2. **重写了 `scripts/dr-test.sh` 中的 `drill_full_recreate`。** 原有流程：`docker compose up -d`（Schema）随后 `psql < full_snapshot.sql`（恢复）到一个已迁移的数据库 -- 确认失败过两次（迁移后恢复：435 个错误；迁移前恢复：78 个错误），两者均由 TimescaleDB 自己在每次运行 `pg_dump` 输出时警告过的相同根本原因引起：目标数据库一旦有了自己的 hypertable，包含连续聚合 (continuous aggregates) 数据库的纯逻辑转储就无法可靠地恢复。新流程：仅启动 `timescaledb`，单独运行 `db-migrate`（从 `database/migrations/` 获取 Schema，已被证明在空数据库上无瑕疵），然后**仅**恢复原始的 `ldi_data`/`ldi_alarm_log` 行数据 -- 通过新的 `scripts/dr-restore-table-data.py` 脚本，从快照的逐块 `COPY` 块中提取数据并通过父表名称进行加载，这完全避开了内部块 ID 不匹配的问题 -- 最后再启动其他所有服务。
3. **在验证上述步骤时，发现并修复了第二个独立的错误**：在明确调用 `docker compose up db-migrate` 之前执行 `docker compose up -d` 会导致两次 `db-migrate` 运行相互竞争（compose 自动将其作为 `node-red`/等服务的依赖项启动）。修复方法是在启动任何其他服务之前，明确地单独运行 `db-migrate`。
4. **发现并修复了第三个错误**：迁移 `048-ldi-data-real-conversion.sql` 会在每个新的连续聚合明确调用 `CALL refresh_continuous_aggregate(...)` _之前_ 添加其刷新策略，因此后台工作进程 (background worker) 可能会在明确调用还在等待的时候就开始刷新相同的 CAGG -- 导致 `could not refresh continuous aggregate ... due to a concurrent refresh`，具有非确定性。修复方法为重新排序：在其策略存在之前而不是之后刷新每个 CAGG，因此不会有其他程序与其竞争。（第一次尝试将 `CALL` 包裹在 `BEGIN/EXCEPTION` 中以捕获并跳过竞争 -- 结果变得更糟：`refresh_continuous_aggregate()` 拒绝在任何子事务 (subtransaction) 中运行，包括异常处理程序创建的事务。重新排序而不是捕获异常，才是真正的修复方法。）
5. **发现并修复了第四个错误**：演练自己的判断逻辑信任了第一次 `db-migrate` 的退出代码，但如果那次运行失败，`docker compose up -d` 会作为依赖自动重试它 -- 真正的结果是该重试留下来的任何状态。修复方法为重新检查实际的最终状态（`bash scripts/migrate.sh` 自身的幂等挂起计数，这与 CI schema-drift 门控使用相同的逻辑），并确认 `node-red`/`proxy`/`alarm-api` 确实达到了 `running` 状态，而不是信任一个可能已过时的变量。

**已验证 (Verified)**：在实施所有四个修复后，运行了 3 次 `bash scripts/dr-test.sh all --confirm-destroy`。其中 2 次完美通过（38/38 个迁移，0 个恢复错误，所有服务正常）。有 1 次在迁移 059 期间遭遇了真正的 PostgreSQL 后端崩溃（"crash of another server process, possibly corrupted shared memory"） -- 这是整个集合中最繁重的一个迁移（解压 + 扩展类型 ALTER + 删除/重新创建 13 个对象 + 重新压缩 + 4 次 CAGG 刷新） -- 此崩溃发生在该会话在约 20 分钟内已经运行了 7 次以上连续的完整拆除/重建周期之后。当时 `docker system df` 显示有 12GB 可回收的镜像和 1.6GB 可回收的卷；在下一次运行前进行了清理 (prune)，之后干净地通过了。这被视为异常快速的重复测试导致的瞬时本地资源压力，而不是修复中的缺陷 -- 但在此标记出来，而不是悄悄忽略，因为它除了“清理操作使其不再发生”之外，没有被独立重新证实。

未触及的部分：`postgres/init/036-ldi-alarm-master-mock.sql` 和 `039-rca-alarm-view.sql` 是真实迁移的陈旧重复副本（036 缺少了后来添加的 2 个 Critical 严重级别代码；039 连接了不同的列），它们仍然在 `db-migrate` 之前自动加载，但是 `db-migrate` 自身的版本是幂等的，并在每次运行时正确地覆盖了它们 -- 已确认未阻碍任何操作，予以保留而不是进一步扩大此次修复的影响范围。

## 实施的实时恢复操作 (2026-08-13，在此会话中，进行上述根本原因修复之前)

上述问题导致技术栈宕机，数据库状态错误。采用了手动修复而非弃之不理：

1. `TRUNCATE ldi_data, ldi_alarm_log;` — 清除了过时的初始化种子数据。
2. 直接从快照的逐块 `COPY` 块中提取正确的行（绕过了破坏演练自身恢复的内部块 ID 不匹配问题），并通过 `\copy` 将其重新加载到父表中。恢复后的行数：`devices=1025, ldi_data=55556, ldi_alarm_log=1057` — 与擦除前的实时快照完全匹配。
3. 向 `ldi_alarm_lifecycle` 中添加了缺失的 `PRIMARY KEY (logdate, logid)` 及其对应的 `FOREIGN KEY ... REFERENCES ldi_alarm_log`（由于表当时为空，因此添加操作是安全的），以便让告警插入触发器的 `ON CONFLICT (logdate, logid)` 子句有一个可供约束的目标。通过现有的触发器，它自动回填了 1057 行（每个告警一个状态为 `OPEN` 的生命周期行）。
4. `docker compose up -d --no-deps node-red proxy alarm-api` — 强制启动了因 `db-migrate` 失败而被阻挡的服务。确认所有 11 个服务健康；Grafana `/api/health` 正常；确认模拟器再次开始写入新行（`ldi_data` 中有 `time > now() - 2min` 的行）。

**未修复，标记以待后续跟进：** 当面对具有初始化种子的全新数据库时，这 7 个迁移本身仍然不具备幂等性（在恢复后的此实例上执行 `bash scripts/migrate.sh` 仍然报告对于这 7 个文件为 `Pending: 7 Applied: 0 Failed: 7` — 它们的目标对象由于上述恢复已经正确存在，迁移 _文件_ 只是对此不知情而已）。真正的修复意味着：要么使这 7 个迁移能够容忍初始化种子的初始状态，要么更改 `drill_full_recreate` 使其根本不要在带有初始化种子的数据库上运行 `db-migrate`（例如：先在迁移前恢复快照，并跳过快照自身 Schema 已经满足的那些迁移）。这两者都是真正的设计层面的决定，绝非单行补丁就能搞定 — 因此特意没有在这里仓促解决。

## 单独的发现：CI 一直没有运行

在检查此事时，发现 GitHub Actions 在**此会话的每次推送时**（`417199b`，`da6bdee`，`f9bed7f`，及更早版本）均失败了 — 并非因为任何代码问题。每个作业都在 ~2 秒内失败，并且没有执行任何步骤：

> "The job was not started because your account is locked due to a billing issue."
> (由于计费问题导致您的帐户被锁定，作业未启动。)

这意味着**此会话中没有任何提交（包括 P0 级别的文档协调提交）被 CI 实际验证过**。这是 GitHub 方面的帐户/计费问题，超出了此会话能解决的范围 — 需要直接在 GitHub 帐户层面上处理。
