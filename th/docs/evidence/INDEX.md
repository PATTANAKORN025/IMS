<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# IMS Evidence Index

เอกสารนี้ทำหน้าที่เป็นทะเบียนกลางสำหรับเชื่อมโยงข้อกล่าวอ้างด้านสถาปัตยกรรม (architectural claims) กับไฟล์หลักฐานที่สามารถตรวจสอบได้ (runtime logs, นโยบายฐานข้อมูล เป็นต้น) โดยทำหน้าที่เป็นแหล่งข้อมูลอ้างอิงหลัก (single source of truth) สำหรับข้อกล่าวอ้างทั้งหมดที่ปรากฏในเอกสารคู่มือ

> **หลักฐานระดับ KPI** (ความหน่วง (latency), การกู้คืนระบบ (DR), การทดสอบระยะยาว (soak), ความสมจริงของการแจ้งเตือน (alarm realism)) อยู่ใน `EVIDENCE_PACK.md` **ผลการประเมินว่าผ่านหรือไม่ผ่าน** ตามเกณฑ์มาตรฐานการผลิต (production-grade criteria) 8 ข้อ อยู่ใน `SYSTEM_TRUST_REPORT.md`

## Core Capabilities Evidence

| Capability Claim                     | Evidence Location                                                                  | Description                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local Simulator Environment**      | [`runtime/compose-ps-20260813.txt`](../../../docs/evidence/runtime/compose-ps-20260813.txt)               | ผลลัพธ์ของคำสั่ง `docker compose ps` ยืนยันว่าระบบทำงานโดยสมบูรณ์ภายในสภาพแวดล้อมจำลอง (contained) โดยใช้ `ims-snmpsim` ปราศจากการพึ่งพาระบบการผลิตภายนอก |
| **Telemetry Ingestion via Node-RED** | [`runtime/nodered-ingestion-20260813.txt`](../../../docs/evidence/runtime/nodered-ingestion-20260813.txt) | ตัวอย่างบันทึกการทำงาน (Log excerpt) แสดงความสำเร็จของคำสั่ง `Batch INSERT` ลงในตาราง `sys_metrics` และ `ldi_alarm_log` จากการทำ bulk SNMP polling ด้วย Node-RED |
| **Continuous Aggregation**           | [`runtime/cagg-policies-20260813.txt`](../../../docs/evidence/runtime/cagg-policies-20260813.txt)         | ผลลัพธ์จากระเบียน TimescaleDB Continuous Aggregates เป็นการพิสูจน์ว่ามีการรวมข้อมูล (rollups) เป็นรายชั่วโมง, รายวัน และรายสัปดาห์ในฐานข้อมูล |

## Verification Procedures

ควรมีการอัปเดตหลักฐานเป็นระยะเมื่อมีการเปลี่ยนแปลงทางสถาปัตยกรรมที่สำคัญ ในการสร้างหลักฐานที่อัปเดตใหม่ ให้รันคำสั่งต่อไปนี้:

```bash
# Docker Stack Evidence
docker compose ps > docs/evidence/runtime/compose-ps-$(date +%Y%m%d).txt

# TimescaleDB CAGG Evidence
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT view_name, schedule_interval, config FROM timescaledb_information.jobs j JOIN timescaledb_information.continuous_aggregates c ON j.hypertable_name = c.materialization_hypertable_name;" > docs/evidence/runtime/cagg-policies-$(date +%Y%m%d).txt

# Node-RED Ingestion Evidence
docker compose logs node-red | Select-String "simulated|SNMP|inserted|Batch INSERT" -Context 0, 5 | Select-Object -First 20 > docs/evidence/runtime/nodered-ingestion-$(date +%Y%m%d).txt
```
