# 服务级别目标 (SLO) 与指标 (SLI)

本文档定义了 IMS (工业监控系统) 平台的可靠性目标。

## 1. 可用性 (Availability/Uptime)
- **SLI**: 在30天的时间窗口内，通过综合监控测量的来自 Node-RED 接入端点和 Grafana UI 的成功 HTTP 响应 (200 OK) 的百分比。
- **SLO**: `99.95%` (每月允许的停机时间约为 21.6 分钟)。
- **错误预算策略 (Error Budget Policy)**: 如果预算耗尽，将冻结新功能部署；工程师时间将 100% 转移到系统稳定性上。

## 2. 接入延迟 (Ingestion Latency)
- **SLI**: 从 Node-RED 接收遥测有效载荷到它在 TimescaleDB 中可被查询所需的时间。
- **SLO**: `第 99 百分位数 < 2.0 秒`。

## 3. 查询性能 (Query Performance)
- **SLI**: 针对 TimescaleDB (连续聚合和原始表) 的 Grafana SQL 查询的执行时间。
- **SLO**: `第 95 百分位数 < 1.0 秒`; `第 99 百分位数 < 3.0 秒`。

## 4. 警报传递延迟 (Alarm Delivery Latency)
- **SLI**: 从 Prometheus 警报触发到 Webhook 成功传递 (LINE/MS Teams) 所需的时间。
- **SLO**: `第 99.9 百分位数 < 5.0 秒`。
