<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页 (Home)</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引 (Docs Index)</b></a>
</div>
<br/>

# Final Acceptance Matrix (最终验收矩阵)

> 下述指标中，没有任何一项声称“100% 真实”或“100% 准确” —— 措辞如下：已验证 (verified)、已观察到 (observed)、已测量 (measured)、未知 (unknown)、样本不足 (insufficient sample)、已模拟 (simulated)、已推断 (inferred)、尚未验证 (not yet validated)。每一行都引用了它所来自的证据文档；没有一个是凭记忆断言的。

| 指标 (Metric) | 目标 (Target) | 实际情况 (Actual) | 证据 (Evidence) | 状态 (Status) |
| --- | --- | --- | --- | --- |
| 数据丢失 (`sys_metrics`/`net_metrics`/`ldi_data`) | 0 | 修复后 34 分钟的窗口内为 0；0 次缓冲区溢出，0 次断路器跳闸 | `DATA_INTEGRITY_VALIDATION_2026-08-15.md` | **已验证** (短时间窗口内) |
| 重复率 (`sys_metrics`，真实机群) | 0% | 66.9% → 0.0% | `SPEC_SYS_METRICS_DUPLICATE_INSERT.md` | **已验证**，已修复 |
| 重复率 (`sys_metrics`，在规模测试并发下) | 0% | 在 500 个设备发生并发重叠轮询的情况下，重复率为 74.4% | `SCALE_TEST_2026-08-15.md` | **观察到在真实机群不会产生的条件下的回归** —— 新的竞态条件，尚未修复 |
| 时间戳精度 (Timestamp precision) | 有记录，未过度声明 | `ldi_data`/`ldi_alarm_log`：毫秒级（JS 的 `Date`），尽管架构是 `timestamptz(6)`，但不是微秒级。`sys_metrics`/`net_metrics`/`ldi_metrics`：真正的微秒级（Postgres 的 `NOW()`） | `SPEC_TIMESTAMP_INTEGRITY.md` | **已验证且已记录在案**，此前仅凭架构类型隐含过度声明了 |
| 时间戳排序 (Timestamp ordering) | 0 个乱序，0 个未来时间 | 在 `ldi_data`、`sys_metrics`、`ldi_alarm_log` 中，`ingest_ts` < 事件时间的行数为 0；未来时间戳为 0 | `SPEC_TIMESTAMP_INTEGRITY.md` | **已验证** |
| 写入 P95 (`ldi_data`，真实流量) | 有界，有记录 | 22ms | `SPEC_TIMESTAMP_INTEGRITY.md` (重新运行 `tests/e2e/ingestion-latency-check.js`) | **已测量** |
| 写入 P99 (`ldi_data`，真实流量) | 有界，有记录 | 38ms | 同上 | **已测量** |
| 写入 P95 (规模测试，250 个并发设备) | -- | 1.09s | `SCALE_TEST_2026-08-15.md` | **已测量** —— 真正的拐点，不是违反目标（尚未为该层级设定目标） |
| 写入 P95 (规模测试，500 个并发设备) | -- | 2.93s，3.68% 请求失败/超时 | `SCALE_TEST_2026-08-15.md` | **已测量** —— 发现真正的上限介于 250-500 之间 |
| API 延迟 (alarm-api, Grafana) | -- | 本计划中未测量 | -- | **尚未验证** |
| 仪表板加载 P95 | -- | 本计划中未测量 | -- | **尚未验证** |
| CPU (`ims-node-red`，空闲/轻负载) | 稳定 | 在 ≤100 个并发设备时为 0-5% | `SCALE_TEST_2026-08-15.md` | **已测量** |
| CPU (`ims-node-red`，500 并发) | -- | 118-135% (单核饱和) | `SCALE_TEST_2026-08-15.md` | **已测量** —— 确认瓶颈 |
| CPU (`ims-timescaledb`，所有层级) | 稳定 | 始终低于 10%，即使在 500 并发时也是如此 | `SCALE_TEST_2026-08-15.md` | **已测量** —— 数据库层具有巨大的余量 |
| RAM 稳定性 (`ims-node-red`) | 短时间窗口内无泄漏 | 在一次 500 设备测试运行中，从 129MiB 变为 339MiB | `SCALE_TEST_2026-08-15.md` | **仅在约 3 分钟内观察到** —— 样本不足以声称泄漏与否；2 小时/6 小时/12 小时的耐力跑（进行中）才能实际验证这一点 |
| 数据库连接数 | 稳定，有界 | 在所有 5 个规模层级中为 20-26 | `SCALE_TEST_2026-08-15.md` | **已测量** |
| PgBouncer 池利用率 | -- | 管理控制台 (`SHOW POOLS`) 无法从此环境访问；容器 CPU 保持 <2% 作为代理指标 | `SCALE_TEST_2026-08-15.md` | **未直接测量** —— 真实的工具链空白，已坦率说明 |
| 规模上限 | 找出实际瓶颈 | 在 250 台设备之前可靠；在 500 台设备时降级（96.32% 成功率）。瓶颈：Node-RED CPU，而不是数据库。未确立比“250-500 之间的某处”更窄的上限 | `SCALE_TEST_2026-08-15.md` | **已测量**，未完全确定（需要 350/400 个中间层进行测量） |
| 告警率 / 组合真实性 | 噪音主导（逼真） | 80.7% 的噪音 / 19.3% 条件驱动（在 2026-08-11 的审计中为 8.6%/91.4%） | `SIMULATOR_REALISM_AUDIT_2026-08-15.md` | **已验证**，这是一个早于本会话的重大修复且之前未记录 |
| 重复告警 (通知级别) | 0 | 发现 1 个潜在风险（alertmanager `continue: true` + 重复的 URL 接收器），未主动触发，现已修复 | `SPEC_ALARM_HYGIENE_COMPLETION.md`，提交记录 `be8db54` | **已修复** |
| 关键告警行为 | 可达到，真实 | 现在存在 43 个严重程度 (Critical) 的代码（2026-08-11 审计时为 0），并且已经在实时中触发过 | `READ_ONLY_AUDIT_2026-08-15.md` | **已验证**（从本次会话的早期验证交叉引用而来，未在此处重新测量） |
| 告警生命周期完整性 | 可审计 | 782/782 生命周期的行均是 `OPEN` —— 在近 2 天的真实运行期间 0 个变为 `ACKNOWLEDGED`/`RESOLVED` | `SPEC_ALARM_HYGIENE_COMPLETION.md` | **已验证，且为实际运营上的空白** —— 这不是仪表板坏了，而是真实反映了迄今为止零个操作员交互的事实 |
| 恢复时间 (故障注入) | -- | 未执行 —— 仅为计划 | `FAULT_INJECTION_PLAN.md` | **尚未验证** —— 故意按照说明操作 |
| 意外重启 (本次会话) | 0 次意外 | 0 —— 本次会话的每次重启要么是深思熟虑的、批准的部署步骤（阶段 A1，P0.1，P0.2，alertmanager 修复），要么是诊断出的主机电源事件（尝试 7，早于本计划） | `SOAK_TEST_LOG.md` | 对于可靠性计划窗口期间 **已验证**；历史遗漏 (如下) 则早于此 |
| 历史遗漏 (Historical gaps) | 已协调 | 发现 2 个：一个找到了根本原因（主机重启，有证据），一个标记为 **UNKNOWN** (未知)（当时的取证工具还不存在 —— 不是猜测出来的） | `HISTORICAL_DATA_RECONCILIATION_2026-08-15.md` | **已验证 / 部分未知，直言不讳** |
| 模拟器真实性 | 证据分级 | 真空(vacuum)/温度(temp)/PE/JE：正常偏差（从 23-45% 的超规格 (OOS) 修复到约 0-0.7%，以前未记录）。湿度 (Humidity)：仍有 9.85% OOS，特定于机器的模拟器工件，尚未重新校准。扫描速度 (scan_speed)/pe_setting/je_setting：固定的配方/设定点。厚度 (thickness)：未分类（没有找到记录在案的规格限制）。电源 (power)/振动 (vibration)：降级（已确认未被任何决策仪表板使用） | `SIMULATOR_REALISM_AUDIT_2026-08-15.md` | **混合** —— 绝大多数通过验证认定健康，找到 1 个未修补的确切盲区（humidity，湿度），以及在当前文档规范下存在一个本质上尚未分类的参数（thickness，厚度） |
| 已知未解决的风险 | 已记录 | 请参阅下面的列表 | -- | -- |

## Known unresolved risks (已知的未解决风险) (未在本计划中修复，直言不讳)

1. **PgBouncer `client_idle_timeout` 池崩溃 Bug** (`SPEC_PG_POOL_RESILIENCE.md`) —— **于 2026-08-15 修复并部署** (`fe7fa87`)。已向 `node-red` 和 `alarm-api` 均添加了 `pool.on('error', ...)`，没有退化。实际的闲置超时存活场景本身尚未受到独立的强迫运行和验证 —— 而是留作浸泡尝试 10 (进行中) 以及故障注入场景 3 的任务。
2. **阶段 A1 (Phase A1) 门循环竞态条件** (`SCALE_TEST_2026-08-15.md`) —— 新出现的问题，仅在规模测试并发下才被发现，并不影响真实机群的实际操作模式，尚未修复。
3. **湿度 (Humidity) 超规格率** (9.85%，特定于机器) —— 早期遥测数据重新校准中 (无论由谁在何时所做)，明显漏掉的一个参数。
4. **告警控制台 (Alarm Console) 的交互率为零** —— 不是系统的故障缺陷，而是一项真实的运营事实：在有人实际运用确认 (Ack) /解决 (Resolve) 的工作流程之前，平均响应时间 (MTTA)/平均修复时间 (MTTR) 是无法被验证其意义的。
5. **升级机制语义 (Escalation semantics)** —— 已确认该系统中根本不存在 (仅通过 Alertmanager 的 `repeat_interval` 进行周期性的重新提示，这并不是真正的升级)。需要其自身的专门设计过程。
6. **心跳面板 (Heartbeat panel)** 尚未迁居 (告警卫生事项 3) —— 仍然具备功能，只是未被迁往到建议放置的界面中去。
7. **厚度 (Thickness)** —— 遍查本库，没能找到一份留档备考的容差/规范阈限；倘若没有参考规范，那就不能为其归类到底是逼真还是失真。
8. **API 和仪表板的加载延迟** 没在本项目内施测测量 —— 虽然存有 `tests/k6/grafana-query-stress.js` 脚本文件，但还需要为其排出一个特定周期测试。
9. **PgBouncer 自己的池利用统计数据** 不可以通过现处的本环境被直通获取 —— 在监控方面是真正缺少相应的工具箱，而不仅是一个没有测度过的指标。
10. `ims-node-red` 在 **持续时间内 RAM 稳定性** —— 其只在极短时间约 3 分钟跨度里受测过 (那只是它缩放承受规模测试自身长短而得的数据) —— 它究竟在这好几个钟头里面该被消耗成无底洞与否？目前那些在执行着的拉锯耐久测试 (2小时/6小时/12小时级别) 将为我们最终揭晓该真实数据答案。

## 本计划 不 声称的内容 (What this program does NOT claim)

按照明确指示规定：在这个文件中抑或其援引的一切证明文档中，均并无半个字以“100%原味真实”亦或“100%完美精确”自居。每一处所打下的修复补丁皆是以真真切切在修改前后通过所测数据加以比宽；每一番查核统统都秉持有什么做什么、以及有什么没法做的坦荡态度；上边这一长溜单子均本着把那些开门见山尚待解决、并未避重就轻一笔带过的诚实陈列之举。
