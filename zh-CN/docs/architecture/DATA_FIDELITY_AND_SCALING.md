<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# 数据保真度与规模管理架构 (Data Fidelity & Scale Management)

本文档描述了 IMS 系统在支持 1,000+ 台设备时的架构挑战与解决方案 (Architectural Solutions)，重点关注保持毫秒级数据保真度、防止警报疲劳 (Alert Fatigue) 的警报管理，以及模拟数据与真实数据之间的一致性。

---

## 1. 规模扩展风险与过度延迟 (Scaling Risks & Latency)

当系统扩展以支持大量设备时，面临的主要问题是数据接入 (Ingestion, Node-RED) 端的 **Network Latency** (网络延迟) 和 **Event Loop Blocking** (事件循环阻塞)，这会导致瓶颈并影响数据保真度。

### <img src="../../../docs/assets/icons/alert-triangle.svg" width="18" height="18" align="center" /> 存在的问题 (The Problem)

- 如果在服务器端 (Node-RED 或 PostgreSQL) 使用时间戳 (Timestamping)，在网络中延迟或卡在队列中的数据将获得错误的时间戳。
- 当发生网络抖动 (Network Jitter) 时，毫秒级数据 (Millisecond Resolution) 将失去精度，并导致事件排序 (Event Sequencing) 混乱。

### <img src="../../../docs/assets/icons/check.svg" width="18" height="18" align="center" /> 架构解决方案 (Architectural Solution)

1. **边缘级时间戳 (Edge-Level Timestamping):**
   强制终端设备 (Edge Devices/Sensors) 始终为其负载 (Payload) 附加时间戳 (遵循 ISO8601 精度标准)。IMS 系统将主要信任来自边缘端的 `time`。
2. **TimescaleDB 微批处理 (Micro-batching):**
   使用 PgBouncer 管理连接池 (Connection Pooling)，并设计 Node-RED 在执行 `INSERT` 之前将数据收集为批次 (Batch)，这有助于减少事务开销 (Transaction Overhead) 并防止数据库锁定 (Database Locks)。
3. **工作线程隔离 (Worker Thread Isolation):**
   将 Node-RED 中的工作流分离为独立的 Worker Threads（例如，将 SNMP 解析器与 HTTP LDI 分离），以防止 CPU 密集型任务阻塞 I/O 数据接入。

---

## 2. 模拟器与真实世界数据的保真度 (Simulator vs. Real-World Fidelity)

使用模拟数据 (Simulated Data) 测试系统通常会产生过于完美的结果，无法反映工业工厂中设备的真实行为。

### <img src="../../../docs/assets/icons/alert-triangle.svg" width="18" height="18" align="center" /> 存在的问题 (The Problem)

- 传统的 SNMP Simulator 生成完美的正弦波数据，这使得无法准确测试缓存系统 (Caching)、TimescaleDB 中的数据压缩 (Compression) 以及由数据突增 (Data Spike) 引发的警报系统。

### <img src="../../../docs/assets/icons/check.svg" width="18" height="18" align="center" /> 架构解决方案 (Architectural Solution)

1. **模拟器中的混沌工程 (Chaos Engineering in Simulator):**
   将 `Jitter` (抖动)、`Random Drops` (随机丢包) 和 `Spikes` (突增) 引入模拟器（通过模拟器的 `docker-compose.yml` 配置），以生成类似于真实网络环境的噪声 (Noise)。
2. **真实数据重放 (Real-World Data Replay):**
   系统可以从实际工厂获取原始转储数据 (Raw Dump)，并通过 Pcap 或 JSON Loader 进行重放，以测试 Pipeline 的处理能力，并验证即使在数据波动的情况下 Dashboard (Grafana) 也能正确显示。

---

## 3. 现实的警报管理与防警报疲劳 (Realistic Alarm Management & Alert Fatigue)

IMS 系统的目标是仅在发生“影响业务的”异常时才发出警报。过多的警报将导致工程师产生警报疲劳 (Alert Fatigue)。

### <img src="../../../docs/assets/icons/alert-triangle.svg" width="18" height="18" align="center" /> 存在的问题 (The Problem)

- 毫秒级的高保真数据经常在阈值线上下波动 (Flapping)，导致假阳性 (False Positives)，并在每分钟向 LINE/MS Teams 发送数千条警报。

### <img src="../../../docs/assets/icons/check.svg" width="18" height="18" align="center" /> 架构解决方案 (Architectural Solution)

1. **Prometheus `FOR` 子句 (Clauses):**
   所有警报规则必须包含时间条件，例如 `CPU > 90% FOR 5m`，这意味着异常值必须持续 5 分钟才会被视为实际问题（减少短暂突发带来的噪音）。
2. **Alertmanager 分组与去重 (Grouping & Deduplication):**
   使用 Alertmanager 根据 `machine_id` 和 `severity` (严重程度) 对警报进行分组 (Group By)。如果同一台机器在同一时间范围内发生多个错误，系统将仅合并发送 1 条警报消息。
3. **通知的指数退避 (Exponential Backoff):**
   如果问题仍未解决，系统不会连续重复发送消息，而是逐渐延长间隔时间（例如 15 分钟，1 小时，4 小时）。

---

## 4. 历史数据漂移管理 (Historical Data Drift Management)

TimescaleDB 使用连续聚合 (Continuous Aggregates, CAGGs) 预先汇总 (Rollup) 数据，以便在 Dashboard 上快速检索。

### <img src="../../../docs/assets/icons/alert-triangle.svg" width="18" height="18" align="center" /> 存在的问题 (The Problem)

- 某些边缘设备可能会断开连接并向系统发送迟到数据 (Late-Arriving Data)。如果该数据在 CAGG 完成汇总后到达，每小时或每天级别的数据将偏离实际情况（数据漂移，Data Drift）。

### <img src="../../../docs/assets/icons/check.svg" width="18" height="18" align="center" /> 架构解决方案 (Architectural Solution)

1. **水位线策略与刷新窗口 (Watermark Policies & Refresh Windows):**
   配置 `refresh_continuous_aggregate` 以覆盖可能发生迟到数据的时间窗口（例如，在午夜再次刷新昨天的数据）。
2. **Grafana 中的数据插值 (Data Interpolation):**
   如果因网络丢包导致数据间隙 (Gap)，Grafana 中的查询将使用 `interpolate()` 函数或在 TimescaleDB 中填充 `$__interval`，以防止图表出现意外中断。
3. **对账审计 (Reconciliation Audits):**
   通过脚本检查 CAGG 表和原始数据 (Raw tables) 之间的差异，以确保数据高度一致。

---

## 5. 系统价值与效率 (System Value & Efficiency)

对这些高级工程解决方案的投入，直接影响了业务的**投资回报率 (Return on Investment, ROI)**：

- **减少浪费的时间 (Zero False-Positive Maintenance):** 工程师无需仅仅因为传感器的短暂波动而去检查机器（大幅减少了工时，Man-hours）。
- **节省存储成本 (Storage Cost Efficiency):** 毫秒级数据非常庞大。系统通过使用 TimescaleDB 压缩 (Compression, 压缩率高达 90%) 保持保真度，使得企业可以保存多年的历史数据，而无需在额外存储上花费巨资。
- **审计就绪的可靠性 (Audit-Ready Fidelity):** 边缘端时间戳的精度加上无数据漂移 (Data Drift)，使得 IMS 系统的数据可以放心地用作质量审计 (Quality Audits) 的证据。
