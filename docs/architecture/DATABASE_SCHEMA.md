# Database Schema Inventory

> **Generated file — do not hand-edit.** Regenerate with:
> `node scripts/generate-schema-inventory.js`
>
> Source of truth: the live database's own `information_schema` and
> `timescaledb_information.*` catalogs — queried directly, never
> hand-typed. A CI check (`node scripts/generate-schema-inventory.js
> --check`) fails the build if this file doesn't match what the database
> currently reports. Requires the `timescaledb` container to be running
> and fully migrated.
>
> Last generated: 2026-08-14 | Migrations applied: 56 (013-081) | Tables: 12 | Continuous aggregates: 7 | Plain views: 11 | Materialized views: 3

## Tables

| Table | Columns | Hypertable? |
|---|---|---|
| `container_restart_audit` | 6 | — |
| `devices` | 12 | — |
| `ingest_staging` | 9 | — |
| `ldi_alarm_lifecycle` | 9 | — |
| `ldi_alarm_log` | 10 | Yes |
| `ldi_alarm_ms_code` | 10 | — |
| `ldi_alarm_state` | 5 | — |
| `ldi_data` | 37 | Yes |
| `ldi_metrics` | 10 | Yes |
| `net_metrics` | 11 | Yes |
| `schema_migrations` | 4 | — |
| `sys_metrics` | 15 | Yes |

## Continuous Aggregates (TimescaleDB)

| Continuous Aggregate | Materialized Hypertable |
|---|---|
| `ldi_data_15m` | `_materialized_hypertable_19` |
| `ldi_data_1h` | `_materialized_hypertable_20` |
| `ldi_data_1m` | `_materialized_hypertable_18` |
| `ldi_data_hourly` | `_materialized_hypertable_17` |
| `ldi_hourly` | `_materialized_hypertable_6` |
| `net_hourly` | `_materialized_hypertable_5` |
| `sys_hourly` | `_materialized_hypertable_4` |

## Materialized Views (plain PostgreSQL, refreshed via TimescaleDB background jobs)

- `v_ldi_rca_recent_window`
- `v_ldi_rca_truth_test`
- `v_machine_spc_fleet`

## Plain Views

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
