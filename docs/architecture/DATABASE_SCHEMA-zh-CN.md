<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# 数据库模式清单 (Database Schema Inventory)

> **自动生成的文件 — 请勿手动编辑。** 重新生成请使用：
> `node scripts/generate-schema-inventory.js`
>
> 事实来源 (Source of truth)：实时数据库本身的 `information_schema` 和 `timescaledb_information.*` 目录 — 直接通过查询获取，绝不手动输入。如果此文件与数据库当前报告的内容不一致，CI 检查 (`node scripts/generate-schema-inventory.js --check`) 将导致构建失败。要求 `timescaledb` 容器正在运行且已完全迁移。
>
> 最后生成时间: 2026-08-19 | 已应用迁移: 57 (013-082) | 数据表: 12 | 连续聚合 (Continuous aggregates): 7 | 普通视图 (Plain views): 11 | 物化视图 (Materialized views): 3

## 数据表 (Tables)

| 数据表                    | 列数 | 超表 (Hypertable)? |
| ------------------------- | ---- | ------------------ |
| `container_restart_audit` | 6    | —                  |
| `devices`                 | 12   | —                  |
| `ingest_staging`          | 9    | —                  |
| `ldi_alarm_lifecycle`     | 9    | —                  |
| `ldi_alarm_log`           | 10   | 是                 |
| `ldi_alarm_ms_code`       | 10   | —                  |
| `ldi_alarm_state`         | 5    | —                  |
| `ldi_data`                | 37   | 是                 |
| `ldi_metrics`             | 10   | 是                 |
| `net_metrics`             | 11   | 是                 |
| `schema_migrations`       | 4    | —                  |
| `sys_metrics`             | 15   | 是                 |

## 连续聚合 (Continuous Aggregates, TimescaleDB)

| 连续聚合          | 物化超表 (Materialized Hypertable) |
| ----------------- | ---------------------------------- |
| `ldi_data_15m`    | `_materialized_hypertable_19`      |
| `ldi_data_1h`     | `_materialized_hypertable_20`      |
| `ldi_data_1m`     | `_materialized_hypertable_18`      |
| `ldi_data_hourly` | `_materialized_hypertable_17`      |
| `ldi_hourly`      | `_materialized_hypertable_6`       |
| `net_hourly`      | `_materialized_hypertable_5`       |
| `sys_hourly`      | `_materialized_hypertable_4`       |

## 物化视图 (普通 PostgreSQL，通过 TimescaleDB 后台任务刷新)

- `v_ldi_rca_recent_window`
- `v_ldi_rca_truth_test`
- `v_machine_spc_fleet`

## 普通视图 (Plain Views)

- `v_fleet_health`
- `v_fleet_score`
- `v_ldi_alarm_category`
- `v_ldi_alarm_context`
- `v_ldi_event_timeline`
- `v_ldi_machine_latest_full`
- `v_ldi_machine_snapshot`
- `v_ldi_nelson_rules_detection`
- `v_machine_spc_ranking`
- `v_process_stability`
- `v_uptime_summary`
