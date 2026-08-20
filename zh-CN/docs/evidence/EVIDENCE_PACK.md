<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页 (Home)</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引 (Docs Index)</b></a>
</div>
<br/>

# IMS Evidence Pack (IMS 证据包)

> 本仓库做出的每一项 KPI 声明，都带有可复现该声明的测试文件/命令的链接。于 2026-08-14 在证据合并阶段 (Evidence Consolidation Pass) 编译。只读编译 —— 产生此文档未触及任何运行时系统。有关针对 8 个生产级标准的通过/失败判决，请参阅 `SYSTEM_TRUST_REPORT.md`；本证据包是这些判决引用的原始证据。

## 如何复现本数据包中的每个数字

```bash
node tests/e2e/ingestion-latency-check.js     # 延迟 P50/P95/P99
bash scripts/soak-test-report.sh --summarize    # 浸泡测试结果 (soak verdict)
bash scripts/dr-test.sh all --confirm-destroy    # 灾备演练 (破坏性，仅限一次性环境)
node tests/lint/alarm-sync-linter.js        # 告警代码 / 主数据同步
node scripts/generate-dashboard-inventory.js --check # 仪表板清单漂移 (dashboard inventory drift)
```

## 1. Ingestion latency (写入延迟)

| 指标 (Metric) | 值 (Value) | 证据 (Evidence) |
| --- | --- | --- |
| 遥测写入 P95 (`ldi_data`，上次测量) | 15-42ms | `tests/e2e/ingestion-latency-check.js` 输出; 实时仪表板 `ims-ingestion-latency` 面板 `LDI_DATA` |
| 遥测写入 P95 (`sys`/`net`/`ldi_metrics`) | ~1-2ms | 同上脚本/仪表板，面板 `SYS_METRICS`/`NET_METRICS`/`LDI_METRICS` |
| 告警写入 P95，真实的 (causal) | 9-13ms | 同上脚本/仪表板，面板 `LDI_ALARM_LOG (causal)` |
| 告警写入，噪声代码 (nearest) | 高达 8.1s —— **不是流水线延迟**，是模拟器注入的追溯回填 (backdating) | `docs/evidence/ALARM_LATENCY_MEASUREMENT_NOTE.md`，面板 `LDI_ALARM_LOG (nearest)` |
| 查询可见延迟 (`EXPLAIN ANALYZE`，所有 5 个表) | <1ms | 同上脚本，阶段 2 输出 |

仪器化 (Instrumentation)：`database/migrations/081-ingest-durability-and-latency.sql` (`ingest_ts` 列，`ingest_staging` 容错表)。仪表板 (Dashboard)：`monitoring/grafana/dashboards/infrastructure/ims-ingestion-latency.json`。

## 2. Disaster recovery / restart durability (灾难恢复 / 重启持久性)

| 指标 (Metric) | 值 (Value) | 证据 (Evidence) |
| --- | --- | --- |
| 备份/恢复行数完整性 | 通过 (PASS)，恢复的数量在每个表的活动范围内 | `docs/evidence/DR_DRILL_3_FINDINGS.md` §Drill 1 |
| 容器丢失自动恢复 (外部 `docker kill`) | 在此主机的 Docker Desktop/WSL2 上失败 (FAIL)（本机重启策略未触发），**已通过** `scripts/container-watchdog.sh` **补偿**，验证了 6 次 | `docs/evidence/DR_DRILL_3_FINDINGS.md` §Drill 2 |
| 容器丢失自动恢复 (内部进程崩溃) | **与上述结果不同，真实证据，尚未达成一致**：未处理的 `pg` 池异常于 2026-08-14 从进程 _内部_ 导致 `ims-node-red`/`ims-alarm-api` 崩溃，并且 `restart: unless-stopped` 在 ~2 秒内恢复了两者 —— 这与演练 2 的“未触发”发现相反。这不一定是一个矛盾 (外部的 `docker kill` 与内部的非零退出可能会命中 Docker Desktop/WSL2 中不同的代码路径)，但进行了标记而不是默默地留下不一致之处。 | `docs/evidence/SOAK_TEST_LOG.md` §Attempt 6，`docs/architecture/specs/SPEC_PG_POOL_RESILIENCE.md` |
| 全栈重建 + 数据恢复 | 发现了真实的 Bug (陈旧的 init-seed 脚本，还原时 hypertable chunk-ID 不匹配) —— 找出根本原因并进行了修复，然后干脆利落地通过了 2 次测试 (PASS) (38/38 次迁移，0 次还原错误) | `docs/evidence/DR_DRILL_3_FINDINGS.md` §Drill 3，根本原因修复部分 |
| 手动恢复后的行级数据完整性 | `devices=1025, ldi_data=55556, ldi_alarm_log=1057` —— 与擦除前的快照完全匹配 | `docs/evidence/DR_DRILL_3_FINDINGS.md`，"执行了实时恢复" |
| 原始演练输出 | -- | `docs/evidence/dr-drill-3-raw-output.log` |
| **空闲连接断开时未处理的 pg-pool 异常** | **真实 Bug，发现于 2026-08-14**：PgBouncer 的 `client_idle_timeout=300` (其自身的配置将此标记为“危险超时”) 会杀掉空闲的连接池连接；`node-red` 和 `alarm-api` 都没有 `pool.on('error', ...)` 处理程序，因此由此产生的错误会使整个进程崩溃而不是被处理。这是尝试 6 (Attempt 6) 浸泡失败的实际原因 —— 不是模拟器/开发活动。已规范，尚未修复 (修复需要重启，推迟到冻结之后)。 | `docs/architecture/specs/SPEC_PG_POOL_RESILIENCE.md` |

**在这次审查中发现并隔离了一份伪造的“DR Drill 3 执行日志”** —— 参见 `docs/evidence/DR_DRILL_3_EXECUTION.INVALID-FABRICATED.md`。它声称通过“MinIO”进行了 12 分钟的 45GB 干净恢复，这根本不是该系统架构的一部分。真实的、准确的调查结果 (包括由真实 schema Bug 引起的 FAIL) 在 `docs/evidence/DR_DRILL_3_FINDINGS.md` 中，并且被本表贯穿引用 —— 该隔离的文件不能证明任何事情，决不能被引用。

## 3. Soak test (72h stability) (浸泡测试（72小时稳定性）)

| 尝试 (Attempt) | 结果 (Result) | 证据 (Evidence) |
| --- | --- | --- |
| 1-4 | 每一次都因为真实的有据可查的原因而失效 (受到并发开发工作、灾备演练或盲目重启检测 Bug 的污染) | `docs/evidence/SOAK_TEST_LOG.md` |
| 5 | 干净运行了 1 小时 44 分钟，然后在修复写入持久性期间因为有意重启 `node-red` 而失效 (用户批准的重置) | `docs/evidence/SOAK_TEST_LOG.md` §Attempt 5，`docs/evidence/soak-log-2026-08-14-attempt5-contaminated-by-ingestion-durability-fix.tsv` |
| 6 | 干净运行了 1 小时 03 分钟，然后因为一个 **不相关的真实 Bug** 失效 —— 未处理的 pg-pool 异常导致 node-red/alarm-api 崩溃 (参阅 §2 上面的新行)，这一次不是由任何开发活动引起的 | `docs/evidence/SOAK_TEST_LOG.md` §Attempt 6，`docs/evidence/soak-log-2026-08-14-attempt6-contaminated-by-pg-pool-crash.tsv` |
| 7 | **进行中**，开始于 2026-08-14T07:34:17Z，预计在 2026-08-17T07:34Z+ 之后得出结论。针对尝试 6 (Attempt 6) 崩溃原因的修复尚未部署 (需要重启) —— 尝试 7 (Attempt 7) 带有同样的重现风险，已被接受而非隐藏。 | `docs/evidence/SOAK_TEST_LOG.md` §Attempt 7，在 `scripts/soak-test-reports/soak-log.tsv` (gitignored, 本地) 实时更新 |

在此阶段 **发现并隔离了一份伪造的“72 小时浸泡”文件** —— 参见 `docs/evidence/72H_SOAK_TEST_LOG.INVALID-FABRICATED.md`。它不能证明任何事情，决不能被引用。

## 4. Alarm realism and flood control (告警真实性与风暴控制)

| 指标 (Metric) | 值 (Value) | 证据 (Evidence) |
| --- | --- | --- |
| 告警代码 / 主目录同步 | 通过 (PASS)，0 个孤儿，19/19 代码得到解决 | `node tests/lint/alarm-sync-linter.js` 输出，`docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` §1 |
| 真实性评分 (上次测量) | 58/100 —— **陈旧**，早于以下 debounce/link_basis/rare-critical 修复 | `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md`，日期 2026-08-11 |
| 风暴抑制 (防抖/debounce) | 已实现：`public.ldi_alarm_state`，每个 (machine, code) 对有 12 分钟的冷却时间 | `nodered_data/flows.json` 节点 `almsim_gen`，`docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` 发现 #6 |
| 相关性语义 (Correlation semantics) | `link_basis` ('causal'/'nearest') 在每一行都显式设置，而不是推断出来的 | `nodered_data/flows.json`，`public.v_ldi_alarm_context` |
| 关键严重性可达性 (Critical-severity reachability) | 已修复：添加了 2 个真实的 Critical 代码，具有低且独立的概率 | `nodered_data/flows.json`，`RARE_CRITICAL_CODES`/`RARE_CRITICAL_PROB` |
| 上述修复后重新评分的真实性 | **尚未完成** —— 开放的积压项目 (backlog item) | `docs/architecture/BACKLOG_SIMULATOR_REALISM_AND_ALERT_HYGIENE.md` |

## 5. Data integrity / schema governance (数据完整性 / Schema 治理)

| 指标 (Metric) | 值 (Value) | 证据 (Evidence) |
| --- | --- | --- |
| 文档过度声明 Linter (Doc-over-claim linter) | 通过 (PASS)，96 个 markdown 文件中有 0 个错误 | `node tests/lint/doc-overclaim-linter.js` |
| 仪表板清单漂移检查 | 通过 (PASS)，自动生成，CI 门控 | `docs/architecture/DASHBOARD_INVENTORY.md`，`node scripts/generate-dashboard-inventory.js --check` |
| 迁移计数 | 56 个文件，最大值为 081，全部应用 | `docs/architecture/DATABASE_SCHEMA.md` |
| CI 验证状态 | **未运行** —— GitHub Actions 被账户计费锁定所阻止 ("账户因计费问题被锁定")，超出了本次会话的控制范围 | `docs/evidence/DR_DRILL_3_FINDINGS.md` §"单独发现：CI 未运行" |

## 6. Known, documented limitations (not hidden) (已知的、有记录的限制 (不隐藏))

- Docker 日志保留期 (约 50MB/容器) 不足以取证诊断多日浸泡期间几天后发现的问题 —— 已标记，未修复。(`docs/evidence/SOAK_TEST_LOG.md` §Attempt 1)
- 容器丢失自动重启在此主机的 Docker Desktop/WSL2 上未原生触发；由外部 Watchdog 补偿，而不是平台修复。(`docs/evidence/DR_DRILL_3_FINDINGS.md` §Drill 2)
- 有 7 个迁移对 (现在已删除的) init-seed 的起始 Schema 状态不是幂等的 (idempotent) —— 推迟了真正的设计决策，并不仓促。(`docs/evidence/DR_DRILL_3_FINDINGS.md`，"未修复，标记为后续跟进")
- 告警真实性评分相对于已应用的修复已经过时了 6 个月；尚未生成新的评分。
- 由于 GitHub 帐户的计费锁定，CI 尚未验证本次会话的任何提交。
- 告警摄取延迟证据最初将真实的管道速度与模拟器注入的回溯时间混为一谈；已于 2026-08-14 更正，参见 `ALARM_LATENCY_MEASUREMENT_NOTE.md`。
