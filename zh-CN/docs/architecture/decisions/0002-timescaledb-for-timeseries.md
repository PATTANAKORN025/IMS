# 2. 使用 TimescaleDB 存储时间序列数据

日期: 2026-08-26

## 状态 (Status)
已接受 (Accepted)

## 背景 (Context)
IMS 必须每秒接收来自 LDI 机器的超过 100,000 个事件，并保留它们以进行长期分析。我们评估了 InfluxDB 和 TimescaleDB。

## 决策 (Decision)
我们选择了 **TimescaleDB**。

## 后果 (Consequences)
- **优点**: 完整的 SQL 支持、原生的连续聚合、与我们现有的 PostgreSQL 工具 (PgBouncer, pgAdmin) 无缝集成。
- **缺点**: 与 InfluxDB 相比，磁盘使用开销更高。
- **缓解措施**: 我们将严格执行分块时间间隔 (chunk time intervals) 和数据保留策略。
