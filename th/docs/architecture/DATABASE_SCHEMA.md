<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# รายการสคีมาฐานข้อมูล (Database Schema Inventory)

> **ไฟล์ที่สร้างขึ้นอัตโนมัติ — ห้ามแก้ไขด้วยตนเอง** สร้างใหม่โดยใช้คำสั่ง:
> `node scripts/generate-schema-inventory.js`
>
> แหล่งข้อมูลอ้างอิงหลัก (Source of truth): แค็ตตาล็อก `information_schema` และ `timescaledb_information.*` ของฐานข้อมูลจริง — โดยการดึงข้อมูลด้วยคิวรีโดยตรง และไม่มีการพิมพ์ด้วยตนเอง การตรวจสอบของ CI (`node scripts/generate-schema-inventory.js --check`) จะทำให้การบิลด์ล้มเหลวหากไฟล์นี้ไม่ตรงกับสิ่งที่ฐานข้อมูลรายงานในปัจจุบัน จำเป็นต้องให้คอนเทนเนอร์ `timescaledb` ทำงานอยู่และผ่านการไมเกรตอย่างสมบูรณ์
>
> สร้างล่าสุด: 2026-08-19 | การไมเกรตที่ใช้: 57 (013-082) | ตาราง: 12 | Continuous aggregates: 7 | มุมมองปกติ (Plain views): 11 | Materialized views: 3

## ตาราง (Tables)

| ตาราง                     | คอลัมน์ | ไฮเปอร์เทเบิล? |
| ------------------------- | ------- | -------------- |
| `container_restart_audit` | 6       | —              |
| `devices`                 | 12      | —              |
| `ingest_staging`          | 9       | —              |
| `ldi_alarm_lifecycle`     | 9       | —              |
| `ldi_alarm_log`           | 10      | ใช่            |
| `ldi_alarm_ms_code`       | 10      | —              |
| `ldi_alarm_state`         | 5       | —              |
| `ldi_data`                | 37      | ใช่            |
| `ldi_metrics`             | 10      | ใช่            |
| `net_metrics`             | 11      | ใช่            |
| `schema_migrations`       | 4       | —              |
| `sys_metrics`             | 15      | ใช่            |

## Continuous Aggregates (TimescaleDB)

| Continuous Aggregate | Materialized Hypertable       |
| -------------------- | ----------------------------- |
| `ldi_data_15m`       | `_materialized_hypertable_19` |
| `ldi_data_1h`        | `_materialized_hypertable_20` |
| `ldi_data_1m`        | `_materialized_hypertable_18` |
| `ldi_data_hourly`    | `_materialized_hypertable_17` |
| `ldi_hourly`         | `_materialized_hypertable_6`  |
| `net_hourly`         | `_materialized_hypertable_5`  |
| `sys_hourly`         | `_materialized_hypertable_4`  |

## Materialized Views (PostgreSQL ปกติ, รีเฟรชผ่านงานพื้นหลังของ TimescaleDB)

- `v_ldi_rca_recent_window`
- `v_ldi_rca_truth_test`
- `v_machine_spc_fleet`

## มุมมองปกติ (Plain Views)

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
