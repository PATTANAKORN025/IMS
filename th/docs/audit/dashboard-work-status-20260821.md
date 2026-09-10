> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

# รายงานสถานะงาน Dashboard / Grafana / UX / Traceability

**ผู้รับผิดชอบ:** Person 1 — Dashboard / Grafana / UX / Traceability  
**ระบบที่ตรวจ:** Friend IMS Preview (`http://localhost:3300`)  
**Branch:** `feat/isolated-preview-3300`  
**วันที่สรุป:** 2026-08-21  
**สถานะโดยรวม:** กำลังดำเนินการ — ระบบใช้งานได้ แต่การ Audit และหลักฐานส่งมอบยังไม่ครบ

---

## 1. เป้าหมายของงาน

งานส่วนนี้มีเป้าหมายทำให้ Dashboard ใช้งานจริงได้โดยไม่มี Dead link, ไม่สูญเสีย Context ระหว่าง Drill-down, ไม่แสดงข้อมูลผิดเครื่อง และมีหลักฐานยืนยันทั้งด้านความถูกต้อง ประสิทธิภาพ และ Traceability

เส้นทางที่ต้องรองรับคือ:

`Command Center → Digital Twin → Factory → Zone → Machine → Snapshot`

Deliverables ที่ต้องส่งมอบ:

1. `dashboard-production-audit.md`
2. `dashboard-performance-final.md`
3. `dashboard-traceability-test.md`

ไฟล์ทั้งสามถูกสร้างแล้ว แต่ยังไม่ Sign-off เพราะยังมีรายการทดสอบที่ต้องทำต่อ

---

## 2. งานที่ทำเสร็จแล้ว

### 2.1 แยกระบบ Preview ออกจากระบบเดิม

- Clone ระบบ Friend IMS และสร้าง Preview แยกบนพอร์ต `3300`.
- ใช้ Docker project แยกเพื่อไม่กระทบ Grafana 3000 และฐานข้อมูลเดิม.
- เพิ่ม Dashboard ที่อ่านฐานข้อมูลจากพี่เลี้ยงแบบ Read-only.
- ตรวจสอบ Container หลัก ได้แก่ Grafana, TimescaleDB, Node-RED, PgBouncer, Alarm API, Prometheus, Renderer และ 3D service.

**ผลล่าสุด:** Container หลักอยู่ในสถานะ Healthy/Running และ `db-migrate` จบด้วย Exit Code 0 ซึ่งเป็นสถานะปกติ

### 2.2 Digital Twin

- แก้สีสถานะเครื่องให้ยึด Database snapshot time ไม่เปลี่ยนตามเวลาปัจจุบันจนทำให้ประวัติกลายเป็นสีเขียวทั้งหมด.
- ตรวจการแสดงเครื่อง LDI-01 ถึง LDI-10.
- ระบุขอบเขตชัดเจนว่าหน้า Standalone Factory 3D เป็น Prototype ของ Friend IMS.
- ติดป้ายเตือนว่า Layout และพิกัดเครื่องเป็นข้อมูลจำลอง ไม่ใช่ตำแหน่งสำรวจจริง.

**ข้อควรเข้าใจ:** หน้า Standalone 3D ไม่ใช่ Dashboard หลักของ Grafana 3000 และยังไม่ใช่ Layout ที่อนุมัติสำหรับ Production

### 2.3 Operator Andon

- แก้สถานะเครื่องให้ใช้เวลาอ้างอิงจากฐานข้อมูล.
- ลดปัญหาสถานะเปลี่ยนผิดเมื่อเปิดดูข้อมูลย้อนหลัง.
- ตรวจว่าจำนวนเครื่องและสีสถานะสอดคล้องกับ snapshot ในช่วงเวลาที่เลือก.

### 2.4 NOC Overview

- แก้ Fleet Health Score ที่เดิมแสดงพื้นแดงแต่ไม่มีตัวเลข.
- สาเหตุคือ Query ส่งกลับทั้งข้อความและตัวเลข ทำให้ Stat Panel เลือก field ผิด.
- แก้ Query ให้คืนเฉพาะ numeric value.
- แก้ Node-RED ingestion จากชื่อคอลัมน์ `pe_1`/`je_1` ซึ่งไม่มีใน `ldi_metrics` ให้เป็น `pressure`/`joule_effect` ตาม schema จริง.
- ยืนยันว่าข้อมูล `ldi_metrics` กลับมาไหลและ Power Cost แสดงค่าได้.

**ผลตรวจหลังแก้:** Fleet Health และ Power Cost แสดงผลบน Grafana 3300 ได้แล้ว

### 2.5 ตรวจ Infrastructure Dashboard

ตรวจผ่าน Browser จริงครบ 5 หน้า:

| Dashboard | Data Panels | ผลตรวจ |
|---|---:|---|
| IMS NOC Overview | 10 | แสดงข้อมูลครบในรอบตรวจล่าสุด |
| IMS Pipeline Health & Meta-Monitoring | 12 | ไม่พบ No data หรือ Panel error |
| IMS AIOps & Capacity Forecast | 12 | ทำงานบางส่วน; Forecast 3 Panel ยังไม่มีข้อมูล |
| IMS Engineering Drill-Down | 19 | ทำงานหลังเลือกเครื่อง; ค่าเริ่มต้นยังเป็น NO_DATA |
| IMS Ingestion Latency | 10 | มี 1 Panel ไม่มีข้อมูลจาก `ingest_ts` |

- ไม่พบ Datasource not found.
- ไม่พบ Panel plugin not found.
- ไม่พบ HTTP 500 จาก Dashboard query ในช่วง log ที่ตรวจ.
- Grafana health รายงาน `database=ok`.

### 2.6 เอกสารส่งมอบ

สร้างไฟล์แล้ว:

- `docs/audit/dashboard-production-audit.md`
- `docs/audit/dashboard-performance-final.md`
- `docs/audit/dashboard-traceability-test.md`

เอกสารใช้สถานะ `IN PROGRESS` หรือ `NOT YET SIGNED OFF` เพื่อไม่กล่าวอ้างว่าได้ตรวจครบแล้ว

---

## 3. ปัญหาที่พบและสิ่งที่เกิดขึ้น

### 3.1 Node-RED เขียน `ldi_metrics` ไม่ได้

**อาการ:** Power Cost แสดง `NO_DATA` และตาราง `ldi_metrics` ไม่มีข้อมูล  
**สาเหตุ:** Flow ใช้ชื่อคอลัมน์ `pe_1` และ `je_1` แต่ตารางจริงใช้ `pressure` และ `joule_effect`  
**การแก้ไข:** เปลี่ยน mapping และ SQL INSERT ให้ตรง schema แล้ว Restart เฉพาะ Node-RED Preview  
**ผล:** Batch insert กลับมาทำงานและ Power Cost แสดงค่าได้

### 3.2 Fleet Health เป็นพื้นแดงว่าง

**อาการ:** Panel มีพื้นหลังสีแดงขนาดใหญ่แต่ไม่แสดงตัวเลข  
**สาเหตุ:** Stat Panel reduce field ผิด เพราะ Query ส่งทั้ง field ข้อความและ numeric field  
**การแก้ไข:** ให้ Query คืนเฉพาะ numeric value และกำหนด No-value text  
**ผล:** Panel แสดงเปอร์เซ็นต์ได้ตามปกติ

### 3.3 Digital Twin แสดงเครื่องเป็นสีเขียวทั้งหมด

**อาการ:** เมื่อดูช่วงเวลา Database snapshot เครื่องกลายเป็นสีเขียวทั้งหมด แม้ตัวอย่างของเพื่อนมีเครื่อง Alarm  
**สาเหตุ:** Query/สถานะอ้างอิงข้อมูลสดหรือ Alarm window ปัจจุบันแทนเวลาของ snapshot  
**การแก้ไข:** ผูกสถานะกับเวลาอ้างอิงของฐานข้อมูล  
**ผล:** สีไม่ถูกเวลา browser ปัจจุบันเขียนทับสถานะย้อนหลัง

### 3.4 Node-RED เคยเกิด `ECONNRESET`

**อาการ:** Simulator ส่ง `/ldi-telemetry` ไม่สำเร็จชั่วคราว  
**การแก้ไข:** Restart Node-RED ของ Preview และตรวจการไหลของข้อมูลใหม่  
**ผลล่าสุด:** ไม่พบ SQL/connection error ในช่วงตรวจล่าสุด และข้อมูลหลักยังมี Timestamp ใหม่ต่อเนื่อง

### 3.5 Capacity Forecast ไม่มีค่า

Panel ที่ไม่มีค่า:

- Disk: Days Until Full
- RAM: Days Until Full
- CPU: Days Until Saturation

**สาเหตุ:** Query regression ต้องใช้ข้อมูลรายวันอย่างน้อย 3 วัน (`HAVING COUNT(*) >= 3`) แต่ฐานมีข้อมูลเพียง 2 วัน  
**สถานะ:** ไม่ใช่ Query error; ต้องรอ/เตรียม historical data เพิ่มก่อนทดสอบ

### 3.6 Engineering Drill-Down เปิดมาแล้ว NO_DATA

Panel ที่ได้รับผลกระทบ:

- CPU Load
- RAM Usage
- Storage Saturation
- Temperature

**สาเหตุ:** ตัวแปร `machine_id` ไม่มีค่าเริ่มต้นและไม่เปิด All  
**สถานะ:** Query ทำงานเมื่อเลือกเครื่อง แต่ UX ตอนเปิดหน้ายังควรปรับให้เลือกเครื่องแรกอัตโนมัติหรือแสดงข้อความแนะนำ

### 3.7 Ingestion Latency ของ `ldi_data` ไม่มีค่า

**สาเหตุ:** `ldi_data.ingest_ts` เป็น NULL ทุกแถวที่ตรวจ จึงไม่สามารถคำนวณ `ingest_ts - time`  
**สถานะ:** ต้องแก้ ingestion contract/ข้อมูลต้นทาง ไม่ควรสร้างค่าจำลองเพื่อให้กราฟดูมีข้อมูล

### 3.8 Alert Notification ยังส่งออกไม่ได้

- LINE Messaging API ยังไม่มี Token/User ID.
- Microsoft Teams ยังไม่มี Webhook URL.
- Alarm แสดงบน Grafana ได้ แต่การส่งแจ้งเตือนภายนอกยังไม่พร้อม Production.

### 3.9 Device Registry ยังปะปน

ทะเบียนอุปกรณ์ Preview มีทั้ง:

- เครื่อง LDI ที่ใช้ใน Dashboard
- Infrastructure devices
- Legacy machine IDs
- Synthetic/test devices

ต้องมี Approved Master Device List เพื่อป้องกันจำนวนเครื่องและ Filter คลาดเคลื่อน

### 3.10 Alarm trigger/reset ยังไม่ใช่นิยามจริง

ยังรอข้อมูลจาก Process owner/พี่เลี้ยงเรื่อง:

- ระดับ Alarm
- Trigger condition
- Reset condition
- Owner/escalation
- เวลาที่ถือว่า Acknowledge/Resolve สำเร็จ

ระบบปัจจุบันจึงยังไม่ควรใช้เป็นหลักฐานว่า Alarm lifecycle พร้อม Production

---

## 4. สิ่งที่ยังไม่ได้ทำครบ

- [ ] Audit Dashboard ครบ 15 หน้า
- [ ] Audit Panel ตาม inventory ครบทุก Panel
- [ ] ตรวจ Title, Datasource, Query, Variables, Thresholds และ Alerting ทุก Panel
- [ ] ตรวจ Dead link และ Grafana 404 ทุกเส้นทาง
- [ ] ตรวจ Drill-down ครบ Command Center → Digital Twin → Factory → Zone → Machine → Snapshot
- [ ] ตรวจ Machine/Factory/Zone/Time/Log ID context ทุกลิงก์
- [ ] ทดสอบ Responsive 1280, 1366, 1440, 4K และ TV Wall
- [ ] วัด Dashboard/Query p50, p95 และ max
- [ ] แนบ Screenshot link verification ครบทุกเส้นทาง
- [ ] ยืนยัน Alarm trigger/reset กับ Process owner
- [ ] ทดสอบ Acknowledge/Resolve พร้อมชื่อผู้ดำเนินการ เวลา และประวัติ
- [ ] ทดสอบระบบบน Linux host และ Bind-mount permission

---

## 5. งานลำดับถัดไปที่แนะนำ

### Priority 0 — Traceability

1. สร้าง Link inventory ของทั้ง 15 Dashboard.
2. เปิดทดสอบทุกลิงก์ด้วย Browser จริง.
3. บันทึก Source, URL, Expected Context, Actual Context และ Screenshot.
4. แก้ Dead link/404/Context mismatch ก่อนงานด้านความสวยงาม.

### Priority 1 — Comprehensive Dashboard Audit

1. Generate panel inventory จาก JSON.
2. ตรวจ Query และ Variable substitution.
3. ตรวจ No-data behavior และ Threshold semantics.
4. แยกข้อมูลจริง, synthetic และ unsupported metrics ให้ชัด.

### Priority 2 — Performance & Responsive

1. วัด p50/p95/max แบบ cold cache และ warm cache.
2. ทดสอบ viewport ทุกขนาดที่กำหนด.
3. เก็บ Grafana/DB logs และ screenshot เป็นหลักฐาน.

### Priority 3 — Production Sign-off

1. รับนิยาม Alarm trigger/reset.
2. ยืนยัน Master Device List และ Factory/Zone mapping.
3. ตั้งค่า Notification credentials.
4. ทำ Linux deployment/permission test.
5. เปลี่ยนเอกสาร Final เป็น PASS เฉพาะรายการที่มีหลักฐานครบ.

---

## 6. Commit ที่เกี่ยวข้อง

| Commit | รายการ |
|---|---|
| `e784ff0` | เพิ่มระบบ Preview แยกบนพอร์ต 3300 |
| `4c96e04` | เพิ่ม Dashboard อ่าน Mentor database แบบ Read-only |
| `ec4ee9c` | รักษาสีสถานะ Digital Twin ตาม Database snapshot |
| `b0581e2` | จัดเวลาอ้างอิงของ Andon ให้ตรงฐานข้อมูล |
| `67767fd` | แก้ NOC Fleet Health และ Power metrics |
| `799e85d` | เพิ่มเอกสาร Dashboard audit deliverables |

---

## 7. สรุปสำหรับรายงานหัวหน้า

> ระบบ Preview 3300 เปิดใช้งานได้และ Core services ทำงานปกติ ปัญหาหลักของ Digital Twin, Andon และ NOC ได้รับการแก้ไขแล้ว รวมถึงแก้เส้นทางข้อมูล Power metrics ให้ตรงกับ Database schema อย่างไรก็ตาม งาน Person 1 ยังไม่เสร็จสมบูรณ์ เพราะยังต้อง Audit Dashboard/Panel ให้ครบ ตรวจ Drill-down และ Context ทุกเส้นทาง วัด Performance/Responsive และรับนิยาม Alarm Trigger/Reset ที่เป็นทางการก่อน Production sign-off

---

## 8. สถานะการอนุมัติ

**Current result:** `IN PROGRESS`  
**Production ready:** `NO`  
**Blocking reason:** Evidence coverage, Alarm definition, data-contract gaps and full traceability/performance testing are incomplete
