<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Data Retention Policy

> **Audience:** SRE/运维、QA/审计、合规。
>
> **Provenance:** 下表是针对运行中数据库（`timescaledb_information.jobs`）的**实时查询结果**，而不是源于迁移（migration）文件历史记录——请参阅 Governance Gap 部分以了解为什么这一区别在这里特别重要。查询时间：2026-08-10。

---

## Current live retention & compression policy

```text
SELECT j.hypertable_name, j.config->>'drop_after' AS drop_after
FROM timescaledb_information.jobs j WHERE j.proc_name = 'policy_retention';
```

| Hypertable                     | Retention (`drop_after`) | Compression (`compress_after`) |
| ------------------------------ | ------------------------ | ------------------------------ |
| `ldi_data` (raw LDI telemetry) | 180 days                 | 7 days                         |
| `ldi_data_1m`                  | 30 days                  | —                              |
| `ldi_data_15m`                 | 90 days                  | —                              |
| `ldi_data_1h`                  | 2 years                  | —                              |
| `ldi_data_hourly`              | 2 years                  | —                              |
| `ldi_alarm_log`                | 365 days                 | 7 days                         |
| `sys_metrics`                  | 30 days                  | 7 days                         |
| `net_metrics`                  | 30 days                  | 7 days                         |
| `ldi_metrics` (legacy)         | 30 days                  | 7 days                         |

原始的 `ldi_data` 在 7 天后被压缩（仍然可以查询，只是进行列式压缩以提高存储效率），并在 180 天后被物理删除。其汇总链（`ldi_data_1m` → `15m` → `1h`）和独立的 `ldi_data_hourly` 视图保留的时间要长得多（分别为 30 天 / 90 天 / 2 年 / 2 年），因此在原始样本消失后很久仍然可以进行历史趋势分析——请参阅 `docs/architecture/DATA_FLOW.md` 以了解汇总链是如何协同工作的。

## Configuration variances: `postgres/init/` and `database/migrations/`

**在文档审查期间发现。** 初始配置路径和增量配置路径定义了不同的保留策略：

- `postgres/init/001-init-timescaledb.sql`（全新部署的引导路径）将 `sys_metrics`/`net_metrics`/`ldi_metrics` 的保留时间设置为 **30 天**。
- `database/migrations/016-aggressive-retention.sql`（增量迁移路径，应用于已运行的部署）将_相同的三张表_的保留时间设置为 **14 天**。
- `postgres/init/032-ldi-data-scaling-policies.sql` 将 `ldi_data` 的保留时间设置为 180 天，将 `ldi_alarm_log` 设置为 365 天——**这两项策略根本没有出现在 `database/migrations/` 中。**

上述实时值（sys/net/ldi_metrics 为 30 天）与 `postgres/init/` 匹配，而不是迁移 016——这意味着**这个特定的运行数据库是全新引导的，而不是通过按顺序应用每个迁移来构建的**，而且迁移 016 的“激进” 14 天策略可能从未在此处实际应用。这是两条初始化路径之间真实存在的、尚未解决的偏差：只阅读 `database/migrations/`（记录在案的连续历史记录）的团队成员根本不会了解到 `ldi_data`/`ldi_alarm_log` 策略，并且会认为 sys/net/ldi_metrics 的保留时间是 14 天，而实际上它是 30 天。**请始终针对实时数据库验证保留策略，而不是针对迁移历史记录**——本文档顶部的查询是权威检查。

这种偏差在此处注明（需要通过新的迁移来协调 `postgres/init/` 和 `database/migrations/`，或者添加一个 CI 检查来对比这两条路径设置策略的 SQL——两者都是纯文档传递之外的真实工程变更）。已归档在 `ARCHITECTURE.md` 的“系统约束与技术边界（System Constraints & Technical Boundaries）”中。

## Compliance notes

- 该系统中目前没有表是为了满足合规性目的（例如固定的多年审计跟踪要求）而配置保留时间的——上述的 2 年数字（`ldi_data_1h`，`ldi_data_hourly`）是关于汇总实用性的工程选择，而不是合规驱动的策略。
- 如果客户审计要求对 LDI 生产记录有特定的最低保留期，那么** 180 天的原始 `ldi_data`** 是目前的约束条件——汇总数据保留的时间更长，但会丢失每个样本（PE1-6/JE1-4 独立读数）的细粒度。

## Related documents

- `docs/architecture/DATA_FLOW.md` — 这些策略适用的 CAGG 汇总链。
- `docs/operations/BACKUP_RESTORE.md` — 保留不是备份策略；有关实际的时间点恢复，请参阅该文档。
