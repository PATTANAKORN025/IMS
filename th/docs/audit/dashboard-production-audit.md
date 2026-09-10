> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

# Dashboard Production Audit

**Owner:** Person 1 — Dashboard / Grafana / UX / Traceability  
**Environment:** Friend IMS isolated preview (`http://localhost:3300`)  
**Branch:** `feat/isolated-preview-3300`  
**Status:** IN PROGRESS  
**Last verified:** 2026-08-24

## Objective

ตรวจ Dashboard ด้วย Browser session จริง เพื่อค้นหา Dead link, No data, Datasource/Plugin error, Query/Variable mismatch และการสูญหายของ Context ระหว่าง Drill-down

## Current verified scope

| Dashboard | Data panels | Browser result | Finding |
|---|---:|---|---|
| IMS NOC Overview | 10 | PASS | Fleet Health และ Power Cost แสดงค่าแล้ว |
| IMS Pipeline Health & Meta-Monitoring | 12 | PASS | ไม่พบ No data หรือ Panel error |
| IMS AIOps & Capacity Forecast | 12 | PARTIAL | Forecast 3 panels ยังไม่มีข้อมูลเพราะมี daily history เพียง 2 วัน แต่ Query ต้องการอย่างน้อย 3 วัน |
| IMS Engineering Drill-Down | 19 | PARTIAL | 4 stat panels แสดง NO_DATA เมื่อยังไม่ได้เลือก `machine_id` |
| IMS Ingestion Latency | 10 | PARTIAL | `ldi_data` latency ไม่มีค่า เพราะ `ingest_ts` เป็น NULL ทุกแถว |
| Mentor MIS Incident Command Center | 28 | PASS (tested flow) | 10 machines, 2 open incidents, no datasource/plugin/query error in tested browser path |
| Mentor LDI Machine Snapshot | 14 | PASS (tested flow) | Tile drill-down preserves machine and telemetry epoch; selected-minute rows remain visible |

## Fixes already verified

- Digital Twin status colors preserve database snapshot state.
- Operator Andon status uses database-time reference.
- NOC Fleet Health selects the numeric value field correctly.
- NOC Power Cost ingestion writes to schema columns `pressure` and `joule_effect` correctly.
- Grafana 3300, TimescaleDB, Node-RED, PgBouncer, Alarm API and 3D service are healthy.

## Remaining audit checklist

- [ ] ตรวจ Dashboard ครบทั้ง 15 หน้า
- [ ] ตรวจ Panel ตาม inventory ครบทุก Panel
- [ ] ตรวจ Title, Datasource, Query, Variables และ Thresholds
- [ ] ตรวจ Alert rule และ No-data behavior
- [ ] ตรวจทุก Data link และ Panel link ด้วย Browser จริง
- [ ] ตรวจ 404, blank page และ plugin-not-found
- [ ] ตรวจ Responsive ที่ 1280, 1366, 1440, 4K และ TV Wall
- [ ] แนบ Screenshot หลักฐานของรายการที่ PASS และ FAIL

## Known production blockers

1. Alarm trigger/reset definitions ยังไม่ได้รับการยืนยันจากเจ้าของ Process.
2. LINE และ Microsoft Teams credentials ยังไม่ได้ตั้งค่า.
3. Device registry มีข้อมูลจริง, synthetic และ legacy ปะปนกัน.
4. Bind-mount permissions สำหรับ Linux deployment ยังเป็นความเสี่ยงที่รับทราบ.

## Sign-off rule

สถานะจะเปลี่ยนเป็น **PASS** ได้เมื่อ checklist ครบ มี screenshot/evidence อ้างอิง และไม่มี Critical dead link หรือ datasource/plugin error คงค้าง
