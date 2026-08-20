<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Soak Test — Evidence Log

## Attempt 1 (2026-08-10T08:34:21Z → 2026-08-13T07:20:15Z, 70.8h) — 无效，非干净浸泡测试

原始数据：`docs/evidence/soak-log-2026-08-10-to-13-contaminated.tsv`（90 个样本）。

`bash scripts/soak-test-report.sh --summarize` 结论：**FAIL（失败）**。作为证据保留，未删除，因为失败是真实的，并且自身能够解释原因：

- **记录了 9 次容器重启事件。** `awk -F'\t' 'NR>1 && $5=="yes"{print $1}'` 显示 9 次中有 5 次发生在 2026-08-13，这一天此会话正在同一运行堆栈上进行积极的开发（在构建/修复警报控制台写入路径时反复重新创建 `proxy`，`alarm-api`，`grafana`）。此窗口被有意的工作污染，不是有机的稳定性问题 — 作为“安静系统”浸泡是无效的。
- **28 个样本显示字面的 `NaN`**，跨越采集失败/溢出列，集中在大约 14 小时的时间段内（2026-08-11T14:00:08Z → 2026-08-11T17:20:14Z）加上散落的单个事件。根据脚本的根本原因：`curl -sf http://localhost:1880/metrics` 在这些样本期间没有返回任何内容，因此它诚实地记录了 `NaN` 而不是伪造了 `0`。
- **根本原因调查，2026-08-13**：尝试过。`docker logs ims-node-red --since 2026-08-11T13:30:00Z --until 2026-08-11T17:30:00Z` 返回 **0 行** — Docker 的日志驱动（`json-file`，`max-size: 10m`，`max-file: 5`，通过 `docker inspect` 确认）在两天后检查时，早已轮换过了该窗口期。确定这段时间内 `/metrics` 为何不可达所需的证据已不复存在。
- 确认端点**当前并未处于不稳定状态**：2026-08-13 的 3/3 次手动 `curl` 检查都在 ~0.2 秒内各自返回了 `200`。
- **真实且未解决的缺陷**：当前存储库的 Docker 日志保留期限（每个容器约 50MB）不足以用于针对跨越数天的浸泡测试期间、且在事发数天后才被发现的问题进行取证诊断。此问题尚未修复 —— 要么意味着在浸泡窗口期内需临时延长保留期，要么需要部署一个依赖度较低、无需依赖容器日志保留期限的轻量级连续健康检查日志系统。已标记，未解决。

## Attempt 2 (2026-08-13T07:28:26Z → 07:50:17Z, 4 个样本) — 无效，被灾难恢复演练 3 (DR Drill 3) 污染

原始数据：`docs/evidence/soak-log-2026-08-13-attempt2-contaminated-by-dr-drill.tsv`。

被灾难恢复演练 3 终止（见 `DR_DRILL_3_FINDINGS.md`）：演练的 `full-recreate` 步骤在 07:43Z 期间，于此时段内运行了 `docker compose down -v`。07:50:17Z 的样本显示 `any_container_restarted=yes` 且发生 `NaN` 插入（node-red 宕机）。已归档，未删除，理由与 Attempt 1 相同。

## Attempt 3 (2026-08-13T07:54:17Z → 08:58:28Z) — 无效，被 DR Drill 3 根本原因修复迭代污染

原始数据：`docs/evidence/soak-log-2026-08-13-attempt3-contaminated-by-dr-fix-iteration.tsv`。

为了查明上述 Drill 3 发现的根本原因，需要针对这个相同的环境反复运行 `docker compose down -v`（超过 7 次）来重现和验证修复 —— 参见 `docs/evidence/DR_DRILL_3_FINDINGS.md`。这对于该工作是必要的，但这使得此时段的数据作为“安静系统”的浸泡测试毫无意义。已归档，未删除，理由与 Attempt 1 和 2 相同。

## Attempt 4 (2026-08-13T08:58:28Z → 2026-08-14T02:50:23Z, 24 个样本) — 无效，重启检测失灵

原始数据：`docs/evidence/soak-log-2026-08-13-attempt4-contaminated-by-undetected-manual-restarts.tsv`。

重启检测逻辑比较了样本之间的 `docker inspect --format='{{.RestartCount}}'`。该计数器只有在守护程序自己的 `restart: unless-stopped` 策略在崩溃后触发时才会增加 —— 对于故意的 `docker compose restart` / `docker restart` 它**不会**改变。在这个窗口期间，`ims-node-red` 被重启了两次（2026-08-14T02:00Z 和 02:13Z，部署 net_metrics 根本原因修复），以及在实时重启检测测试期间又重启了一次（02:50:23Z，故意强制检查以确认其触发）。这三次都是此次浸泡测试本应监控的容器的真实重启，而日志对前两次真实重启却显示 `restarted=no` —— 证据在悄无声息中出现错误，而不仅仅是不完整。

**根本原因已修复**：`scripts/soak-test-report.sh` 现在除了追踪 `RestartCount` 外，还追踪 `docker inspect --format='{{.State.StartedAt}}'`。如果其中任何一个发生变化，则将其标记为 `restarted=yes` —— 无论由于何种原因，`StartedAt` 在每次重启时都会发生变化。已进行实时验证：强制传入过期的状态文件，在下一个样本中正确生成了 `restarted=yes`（`docs/evidence/soak-log-2026-08-13-attempt4-contaminated-by-undetected-manual-restarts.tsv`，最后一行）。

## Attempt 5 (2026-08-14T02:50:39Z → 04:35:14Z, ~1h45m, 8 个样本) — 无效，被提取持久性修复工作污染

原始数据：`docs/evidence/soak-log-2026-08-14-attempt5-contaminated-by-ingestion-durability-fix.tsv`。

前 ~1h44m 表现正常（7个样本，全程 `restarted=no`）。在第 8 个样本（`2026-08-14T04:35:14Z`，`any_container_restarted=yes`）受到污染，由于在此期间部署了迁移 081（`ingest_ts`）和迭代 `sre_parser` INSERT 修复，故意运行了 `docker compose restart node-red`（见 `feat(e2e): real end-to-end ingestion latency measurement` 和 `feat: add read-only ingestion latency dashboard` 提交）。在排查实时类型不匹配导致的性能退化时，同一会话中又进行了多次 `node-red` 重启。用户明确批准现在开始进行此项工作，并接受浸泡测试重置（“现在开始队列工作，接受浸泡重置”）— 重置是故意的，而不是浸泡机制本身的失败。已存档，未删除，原因与 Attempt 1-4 相同。

## Attempt 6 (2026-08-14T04:48:35Z → 05:51:52Z, ~1h03m, 3 个样本) — 无效，真正的未处理崩溃漏洞，而非故意开发活动

原始数据：`docs/evidence/soak-log-2026-08-14-attempt6-contaminated-by-pg-pool-crash.tsv`。

前 ~1h03m 正常，然后在 `2026-08-14T05:51:52Z` 出现 `any_container_restarted=yes`。**与之前所有被判定为无效的尝试不同，这次并非由本次会话的自身开发活动引起。**通过 `public.container_restart_audit` 和 `docker logs` 追溯到了根本原因：`ims-node-red` 和 `ims-alarm-api` 同时崩溃，其原因是它们 `pg` 连接池抛出了未捕获的 `client_idle_timeout` 异常。PgBouncer 的 `client_idle_timeout = 300`（其自身配置中注释为“危险的超时”）强行关闭了闲置的池连接，而这两个服务均未配备 `pool.on('error', ...)` 处理程序，因此导致的错误引发了整个进程崩溃，未能被优雅处理。Docker 的 `restart: unless-stopped` 策略在约 2 秒内恢复了两个容器；无数据丢失迹象。完整根本原因和修复设计：`docs/architecture/specs/SPEC_PG_POOL_RESILIENCE.md`。已归档，不删除，理由同尝试 1-5。

**这是一个真实的、先前未诊断出的错误**，可能解释了早期浸泡尝试中的不稳定性，以及为调查本次会话启动的初始 16 小时事件（未确认—— Docker 日志保留期限没保存那么久——但故障特征相符）。这是目前积压工作中的最高优先级项目，特别是因为它能在没人触碰任何内容的情况下使浸泡尝试失效。

## Attempt 7 (2026-08-14T07:34:17Z → 08:20:14Z, ~46min, 4 个样本) — 无效，主机在中途关机

原始数据：`docs/evidence/soak-log-2026-08-14-attempt7-contaminated-by-host-shutdown.tsv`。

收集的所有 4 个样本均正常（期间 `restarted=no`，db_size_mb 正常从 34 增长到 36）。之后就没有记录了 -- 计划任务 `IMS-SoakTest` 的 `LastRunTime` 是 `2026-08-14T15:20:13+07:00`（与最后一个样本匹配），事后查询时 `NumberOfMissedRuns: 1`。主机的 `LastBootUpTime`（`wmic os get lastbootuptime`）是 `2026-08-15T08:09:30+07:00` = `2026-08-15T01:09:30Z` -- 在最后一个样本之后**约 17 个小时**。每个 `ims-*` 容器的 `StartedAt` 聚集在 `2026-08-15T01:15:45Z`-`01:17:26Z`，即启动后几秒钟内，这与 Docker 的 `restart: unless-stopped` 策略一致，即在主机本身重新启动后恢复堆栈。主机宕机的原因（睡眠、Windows 更新、手动关机）未确定 -- 未检查 Windows 事件日志 -- 但实际情况模式（任务直接停止触发，然后是全新的启动时间戳，然后每个容器在启动后和彼此间隔 2 秒内启动）指向主机电源事件，而不是容器级别的崩溃。

**为何它仍算作无效 (INVALID) 而非 "总计增加 4 个正常样本":** 浸泡测试的声称是_连续的_无人值守的监控，且发生 0 次意外重启。这期间长达 17 小时的断电无采样空档是证据的断层，并不是证明平稳运行 17 小时的证据 -- 不能排除在那段时间里发生了什么。计划任务被证实依旧是 `Enabled: True`, `StartWhenAvailable: True`，触发器完好，所以它会自行恢复; 任务本身不需要修补。

发现在同一次开机时，还有两个与 IMS 堆栈无关的容器也在运行 (`ghcr.io/github/github-mcp-server`, `mcp/sonarqube`) -- 这些是本会话自有的 MCP 工具容器 (GitHub MCP server, SonarQube MCP)，而不是第二个来路不明的进程。注意这点仅仅是因为它们在同一 `docker ps` 的扫描中出现，并且短暂地被怀疑为可能存在并行的工作空间冲突 (concurrent-workspace) 信号；现已排除。

未部署关于尝试 6 (Attempt 6) 中的 pg 连接池 (pg-pool) 崩溃缺陷修复 -- 由于目前的冻结规定，没有更改任何运行时系统来调查或终结本次尝试（上述命令都是只读性质的：`docker ps`, `docker inspect`, `Get-ScheduledTask*`, `wmic`）。已存档，未删除，原因同尝试 1-6。

## Attempt 8 (2026-08-15T01:49Z → 终结于已批准的 Phase A1 修复，采集样本为 0) — 无效，被蓄意采取的补救措施所取代，其自身采集机制也悄然停摆

没有存档原始的 `.tsv` -- 截至 2026-08-15T03:30Z，即 Attempt 8 预估起始后近 1 小时 41 分钟，`scripts/soak-test-reports/soak-log.tsv` 依然只显示其表头行。`IMS-SoakTest` 任务在重启后的确立即显示状态为 `Enabled: True`，但它显然在这一时间段内根本没有实际采集任何样本 -- 这是个真实的、独立的发现（任务虽已启用却未运行），在此标出，但**并非本轮审查对象**；这已经超出了 Attempt 8 最终被只读审查和修复工作取代的范畴。

**该尝试为何有意至此终结：**在此窗口期间，一项只读审计（由用户指令执行，未触及 Soak Attempt 8）发现了一个新产生的、真正的、高影响范围的漏洞 -- `sys_metrics` 在每次真实轮询周期中都在无声无息地接收 3-4 倍的重复行数据（占表中所有行的 66.7%，通过 `SELECT COUNT(*), COUNT(*)-COUNT(DISTINCT (device_id,time))` 确认），逐节点追踪到了 `sre_parser` 的批处理缓冲逻辑：对于 3 个 walker 类型的完成（cpu/storage/temp），它在每一个上面都推送了一整行数据，而不是在每个真实周期只推送一次。用户明确批准继续进行修复（"Phase A1"），而不是完成错误版本的 72h 浸泡测试，理由是对已知的错误采集路径进行 72 小时的浸泡，只会得到错误事物的证据。此修复程序位于 `nodered_data/flows.json`（`sre_parser` 节点），需要重新部署 Node-RED 方可生效——终结本次浸泡测试是这一决定的直接、已知的结果，并不意外。

部署细节和完整的完整前/后测量信息在 `docs/architecture/specs/SPEC_SYS_METRICS_DUPLICATE_INSERT.md`。摘要：在 2026-08-15T03:31:09Z 执行 `docker compose restart node-red`，干净的重启，在约 4.5 分钟的部署后窗口期显示，重复率由 66.9% → 0.0%，采样节奏维持在纯粹的 30s（匹配真实的轮询触发条件，没有缺漏），毫秒以下的摄入延迟，流水线错误为零，没有任何资源衰退的迹象。

**暂时没刻意去进行带编号的新一轮浸泡尝试。** 因为现在还有不少待批准上线的补丁（RAM 积累问题、`ubuntu.snmprec` 的磁盘配置、警报处理）正处于排队状态，这些补丁都需要分别上线并独立测定（按照用户的严格指示，绝不能把它们打包混在一起，从而确保每一次修复都能自行证明其成效）。在这之前就开始做真正的 72 小时浸泡的话是不划算的，因为一开局可能就会遭遇下次需要重启的情况，从而直接作废。Attempt 8 结束到下一次正式尝试之间的这段时间，纯属用于系统开发或打补丁修复的节点，它并非浸泡测试的时间，因此也是据此进行记录的。

## 采集机制根本原因已被发现并修复 (2026-08-15)

在 Attempt 8 期间 `IMS-SoakTest` 计划任务静默的问题（上文已标记但当时未调查）现已查明根本原因：`Get-ScheduledTask` 的触发器显示 `StartBoundary: 2026-08-10T15:35:12+07:00`, `Repetition: { Duration: P4D, Interval: PT15M, StopAtDurationEnd: True }`。**该任务原本配置为仅在初始启动后的 4 天内重复运行**——该窗口期在 `2026-08-14T15:35:12+07:00` 关闭，这与冻结的 `LastRunTime`（`2026-08-14 15:20:13`，即窗口期关闭前的最后一次 15 分钟触发）以及在 Attempt 8 期间及刚才观察到的空白的 `NextRunTime` 完全匹配。`StopAtDurationEnd: True` 意味着 Windows 任务计划程序完全按照指示行事：在经过 4 天后永远停止触发，这一过程是静默的，没有在任何地方暴露出会被 `docker ps`/`Enabled: True` 检查捕捉到的错误。这解释了 Attempt-8 的_整个_静默，而不仅仅是一个巧合的间隙。

**已修复**：通过 `Set-ScheduledTask` 将原触发器替换为新触发器（`-Once -At (Get-Date) -RepetitionInterval 15min -RepetitionDuration 365 days`）——`NextRunTime` 立刻填充了一个真实的未来时间戳，确认了修复已生效。在此设置被信任用于耐久性测试证据之前，修复后触发器下获得的首个真实样本将从端到端确认系统正常（参见下面的 Attempt 9）。

## Attempt 9（于 2026-08-15 开始，本次会话最近一次运行时变更之后）—— 2h/6h/12h 耐久性测试，进行中

这是证据驱动的可靠性测试套件 (Evidence-Driven Reliability Test Suite) (`RELIABILITY_TEST_SUITE.md`) 的 P1/P2 耐久性验证阶段——而不是 72h 浸泡测试（降级为可选的 P3 阶段）。计时起于本次会话最近的运行时变更（为了重复通知修复，对 `alertmanager` 进行重启）之后——由于每次改动运行时容器的 P0/P1 修复操作 (如阶段 A1，P0.1 内存，P0.2 磁盘，警告管理器等) 都已在这个起点之前落实完成。所以，该时钟现在正折射出最新、打全了所有补丁的状态，而非某个修正前后各占一半的混合态。

目标为：2 小时工程耐久性（首个检查点），6 小时候选发布版本，12 小时最终版本，均处于同一次连续运行过程的各个检查节点中，并非独立进行的重启。依据 `RELIABILITY_TEST_SUITE.md` 的验收条件：0 意外重启，0 无故数据丢失，0 重复率倒退情况，以及拥有稳定的内存 / CPU / DB 连接 / 数据提取节拍表现，而且也没有未知错误的累积。

**带有本批处理作业已标识的不具备阻断特性的已知风险：**只因 `SCALE_TEST_2026-08-15.md` 内，A1阶段周期门处的并发竞争机制在设备数量仅为 4，使用 30s轮询机制并未发生重叠交错情形的话，它是体现不出来的——所以我们估计它根本不会在这回耐久度运算期生事，况且这场运算也会充当证据向您进一步解释清楚到底是咋回事。

**采集机制确认能端对端运作，绝非空谈“理论上已修复”：**由于在 `2026-08-15T05:34:03Z` 等到了真正的样本落地—— `inserts_total=59994, inserts_failed_total=0, buffer_overflows_total=0, any_container_restarted=no, non_watchdog_alerts_firing=3, db_size_mb=67`。至此上一节中定点任务的抢修工作终获证实（`NextRunTime` 生成的填塞值虽然十分必要，但光有它做证据还不够——眼前这个才是真正的实锤）。

**在收集到 2 个干净样本后故意结束**（05:34:03Z，05:49:03Z，均为 `restarted=no`），以便部署 `SPEC_PG_POOL_RESILIENCE.md` 的修复程序——这是整个积压工作中未部署项目的最高优先级，并且是一个真实的崩溃风险，否则就像它导致 Attempt 6 无效一样，数小时后也会使这次相同的耐久性测试无效。最好现在再进行一次计划中的重启，并在真正最终修补的状态下启动耐久性时钟，而不是让数小时后未修补的崩溃重置运行。参见下面的 Attempt 10。

## Attempt 10（开始于 2026-08-15T05:59:41Z，在 pg-pool 弹性部署之后）—— 2h/6h/12h 耐久性，正在进行中

与 Attempt 9 相同的 P1/P2 耐久性阶段，重新开始是因为部署 `SPEC_PG_POOL_RESILIENCE.md` 需要触碰 `node-red`+`alarm-api`。这现在是**针对完全修补架构运行的第一个耐久性尝试**——本次可靠性计划的所有修复（阶段 A1 sys_metrics 去重，P0.1 RAM，P0.2 磁盘，alertmanager 重复通知，pg-pool 弹性）在此此时钟开始之前已启用，因此这里的干净结果反映的是当前完整的状态，而不是部分状态。

目标不变：2h 工程耐久性，6h 候选发布，12h 最终，相同的连续运行。验收不变（0 次意外重启，0 次无法解释的数据丢失，0 次重复率回归，稳定的内存/CPU/数据库连接/摄取节奏，无无法解释的错误累积）——另外，本次运行现在是 pg-pool 修复的真实世界证明（或反证）：运行期间的任何 `client_idle_timeout` 事件都应显示为无害的日志行，而不是 `any_container_restarted=yes`。

**2h 检查点：PASS (通过)**，确认于 2026-08-15T08:11Z。开始于 05:59:41Z，2h 标记为 07:59:41Z。收集了 9 个样本（06:04:03Z 到 08:04:03Z，15 分钟节奏，0 个缺口）。唯一的 `restarted=yes` 样本是 06:04:03Z 本身——开始此尝试的 pg-pool 部署重启，而不是期间的失败。此后的每个样本（06:19 到 08:04，连续 8 个）均显示 `restarted=no`。`inserts_total` 干净地攀升（0 -> 3,952），`inserts_failed_total` 和 `buffer_overflows_total` 始终保持为 0。目前尚未观察到 `client_idle_timeout` 崩溃（PgBouncer 的超时为 300 秒，本次运行已多次跨越该边界，未发生任何事件——pg-pool 修复的真实世界证明正在积累）。6h 检查点预计在 ~11:59:41Z，12h 预计在 ~17:59:41Z。
