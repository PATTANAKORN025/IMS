<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Data Retention Policy

> **Audience:** SRE/ฝ่ายปฏิบัติการ, QA/การตรวจสอบ, ฝ่ายกำกับดูแลการปฏิบัติตามกฎระเบียบ (compliance)
>
> **Provenance:** ตารางด้านล่างเป็น **ผลลัพธ์การคิวรีแบบสด (live query)** จากฐานข้อมูลที่กำลังทำงานอยู่ (`timescaledb_information.jobs`) ไม่ได้มาจากการอ้างอิงประวัติไฟล์ migration — โปรดดูเหตุผลว่าทำไมความแตกต่างนี้จึงสำคัญในส่วน Governance Gap ดึงข้อมูลเมื่อวันที่ 2026-08-10

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

ข้อมูล `ldi_data` ดิบจะถูกบีบอัดหลังจาก 7 วัน (ยังสามารถคิวรีได้ เพียงแค่ถูกบีบอัดตามคอลัมน์เพื่อประสิทธิภาพในการจัดเก็บ) และจะถูกลบออกทางกายภาพหลังจาก 180 วัน เชนของ rollup (`ldi_data_1m` → `15m` → `1h`) และวิว `ldi_data_hourly` ที่แยกต่างหากจะถูกเก็บไว้นานกว่ามาก (30 วัน / 90 วัน / 2 ปี / 2 ปี ตามลำดับ) ดังนั้นการวิเคราะห์แนวโน้มในอดีตจึงยังคงเป็นไปได้แม้ว่าข้อมูลดิบตัวอย่างจะหายไปแล้วก็ตาม — ดู `docs/architecture/DATA_FLOW.md` สำหรับวิธีการทำงานร่วมกันของ rollup chain

## Configuration variances: `postgres/init/` and `database/migrations/`

**ระบุพบระหว่างการตรวจสอบเอกสาร** เส้นทางการกำหนดค่าเริ่มต้นและส่วนเพิ่ม (incremental) ได้กำหนดนโยบายการเก็บรักษาข้อมูลที่แตกต่างกัน:

- `postgres/init/001-init-timescaledb.sql` (เส้นทาง bootstrap สำหรับการปรับใช้ใหม่) กำหนดระยะเวลาการเก็บรักษา `sys_metrics`/`net_metrics`/`ldi_metrics` เป็น **30 วัน**
- `database/migrations/016-aggressive-retention.sql` (เส้นทาง migration แบบส่วนเพิ่ม ซึ่งนำไปใช้กับการปรับใช้ที่กำลังทำงานอยู่) กำหนดเวลาให้ _สามตารางเดียวกัน_ เป็น **14 วัน**
- `postgres/init/032-ldi-data-scaling-policies.sql` กำหนดเวลาของ `ldi_data` เป็น 180 วัน และ `ldi_alarm_log` เป็น 365 วัน — **นโยบายสองข้อนี้ไม่ปรากฏใน `database/migrations/` เลย**

ค่าสดด้านบน (30 วันสำหรับ sys/net/ldi_metrics) ตรงกับ `postgres/init/` ไม่ใช่ migration 016 — ซึ่งหมายความว่า **ฐานข้อมูลที่ทำงานอยู่เฉพาะนี้ถูก bootstrap ใหม่แทนที่จะถูกสร้างขึ้นโดยการใช้ migration ทุกตัวตามลำดับ** และนโยบายแบบ "aggressive" 14 วันของ migration 016 น่าจะไม่เคยถูกนำมาใช้จริงที่นี่ นี่คือความคลาดเคลื่อนที่ยังไม่ได้แก้ไขระหว่างเส้นทางการเริ่มต้นสองเส้นทาง: สมาชิกในทีมที่อ่านเฉพาะ `database/migrations/` (ประวัติลำดับที่ถูกจัดทำเป็นเอกสาร) จะไม่ทราบเกี่ยวกับนโยบาย `ldi_data`/`ldi_alarm_log` เลย และจะเชื่อว่าการเก็บรักษาข้อมูลของ sys/net/ldi_metrics คือ 14 วัน ในขณะที่ความจริงแล้วคือ 30 วัน **ให้ตรวจสอบนโยบายการเก็บรักษาข้อมูลกับฐานข้อมูลที่ใช้งานจริงเสมอ ไม่ใช่ประวัติของ migration** — คิวรีที่ด้านบนของเอกสารนี้คือการตรวจสอบที่เชื่อถือได้

ความคลาดเคลื่อนนี้ถูกระบุไว้ที่นี่ (อาจจำเป็นต้องปรับปรุงเพื่อให้ `postgres/init/` และ `database/migrations/` ตรงกันด้วย migration ใหม่ หรือเพิ่มการตรวจสอบ CI เพื่อเปรียบเทียบคำสั่ง SQL สำหรับการกำหนดนโยบายของทั้งสองเส้นทาง — ทั้งสองอย่างคือการเปลี่ยนแปลงทางวิศวกรรมจริงที่อยู่นอกเหนือจากการตรวจสอบเฉพาะเอกสาร) ได้ถูกจัดเก็บไว้ใน System Constraints & Technical Boundaries ของ `ARCHITECTURE.md`

## Compliance notes

- ไม่มีตารางใดในระบบนี้ที่ปัจจุบันมีการกำหนดค่าการเก็บรักษาข้อมูลสำหรับวัตถุประสงค์ในการปฏิบัติตามกฎระเบียบ (เช่น ข้อกำหนดหลักฐานการตรวจสอบ (audit-trail) หลายปีที่กำหนดไว้) — ตัวเลข 2 ปีด้านบน (`ldi_data_1h`, `ldi_data_hourly`) เป็นทางเลือกทางวิศวกรรมเกี่ยวกับประโยชน์ของ rollup ไม่ใช่นโยบายที่ขับเคลื่อนโดยการปฏิบัติตามกฎระเบียบ
- หากการตรวจสอบของลูกค้าต้องการการเก็บรักษาข้อมูลขั้นต่ำโดยเฉพาะสำหรับบันทึกการผลิตของ LDI ข้อจำกัดที่มีผลในปัจจุบันคือ **ข้อมูลดิบ `ldi_data` 180 วัน** — ข้อมูล rollups จะถูกเก็บไว้นานกว่าแต่จะสูญเสียความละเอียดในระดับรายตัวอย่าง (ค่าที่อ่านได้แต่ละค่าของ PE1-6/JE1-4)

## Related documents

- `docs/architecture/DATA_FLOW.md` — CAGG rollup chain ที่นโยบายเหล่านี้นำไปประยุกต์ใช้
- `docs/operations/BACKUP_RESTORE.md` — การเก็บรักษาข้อมูลไม่ใช่นโยบายการสำรองข้อมูล (backup); ให้ดูเอกสารดังกล่าวสำหรับการกู้คืนข้อมูลตามจุดเวลาจริง (point-in-time recovery)
