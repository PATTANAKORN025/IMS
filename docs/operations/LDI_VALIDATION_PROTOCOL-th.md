<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าแรก</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# โปรโตคอลการตรวจสอบความพร้อมและระบบ LDI (LDI System Validation & Readiness Protocol)

> **วัตถุประสงค์:** เพื่อรับรองระบบนิเวศการตรวจสอบ LDI (Laser Direct Imaging) สำหรับการใช้งานในสภาพแวดล้อมการผลิต โปรโตคอลนี้ตรวจสอบความสมบูรณ์ของข้อมูล (Data Integrity), ความถูกต้องของการแสดงผล (Visual Accuracy), ความเสถียรของระบบ (System Stability) และความพร้อมของผู้ปฏิบัติงาน (Operator Readiness)
>
> **แหล่งที่มา:** พารามิเตอร์และเกณฑ์การผ่านทุกข้อด้านล่างนี้ ได้รับการตรวจสอบโดยตรงกับระบบที่กำลังทำงานอยู่เมื่อวันที่ 2026-08-10 (ผลการทดสอบ, JSON ของแดชบอร์ด, เป้าหมายของ Makefile, สคริปต์ k6, `.env`) แทนที่จะเป็นการคาดเดา ร่างก่อนหน้าของโปรโตคอลนี้มีพารามิเตอร์หลายตัวที่ไม่ตรงกับการใช้งานจริง (การทำงานของเป้าหมาย Make ไม่ถูกต้อง, ชุดสี (color palette) ที่มาก่อนการรวม design-system ปัจจุบัน, ค่าเกณฑ์ k6 ที่ไม่ตรงกับสคริปต์ใดๆ ใน repository, ช่วงเวลาการรีเฟรช Andon ที่ไม่อัปเดต และเกณฑ์การผ่านการแจ้งเตือนที่ไม่สามารถสำเร็จได้ด้วย `.env` ที่จัดส่งมาพร้อมกับ repository นี้) เวอร์ชันนี้มาแทนที่ร่างนั้น จะไม่มีข้อความใดที่ตั้งขึ้นมาลอยๆ ในเอกสารนี้

---

## <img src="../assets/icons/check-circle.svg" width="14" align="center"/> **สถานะ:** สมบูรณ์ (Healthy) ระยะที่ 1: ความสมบูรณ์ของข้อมูลและการตรวจสอบ Parser (Unit Testing)

**เป้าหมาย:** ตรวจสอบให้แน่ใจว่าเพย์โหลด JSON จากเครื่อง LDI จริงที่มีข้อมูลเสียหาย ขาดหาย หรือมีรูปแบบผิดปกติ จะไม่ทำให้ไปป์ไลน์ Node-RED ล่มหรือทำให้ฐานข้อมูลเสียหาย

**วิธีการ:** รันชุดทดสอบ `v2-parser.test.js` (`node tests/unit/v2-parser.test.js`) ซึ่งจำลองกรณีขอบ (edge cases) สุดขั้ว:

- เพย์โหลดว่างเปล่า (จำลองเครือข่ายหลุด)
- การวนกลับของตัวนับแบบ 32 บิต (32-bit Counter Wraparounds) (เมื่อระยะเวลาการทำงานของเครื่องเกิน 49 วัน)
- การพยายามทำ SQL Injection ภายในค่าของเพย์โหลด

**หลักฐาน (รันซ้ำเมื่อ 2026-08-10 โดยยืนยันชื่อการทดสอบแบบคำต่อคำว่ามีอยู่ใน `tests/unit/v2-parser.test.js`):**

```text
TEST 1: Empty Payload Timeout Simulation
 LDI: empty payload preserves zero state
 parseAll skips null/undefined items gracefully
 parseAll throws on non-iterable payload (parser guard catches this)

TEST 2: 32-bit Counter Wraparound Math
 32-bit wrap: counter 4294967295 → 100 calculates correct positive delta
 Cold-start: first poll returns 0 Mbps (no prev data)

TEST 3: Boundary Validations & Sanity Caps
 Temperature clamped at max 150°C
 sanitize escapes SQL injection attempts

==================================================
RESULTS: 27 passed, 0 failed out of 27
==================================================
```

เพื่อความครอบคลุมของไปป์ไลน์แบบเต็มรูปแบบ ควรพิจารณาให้ระยะเดียวกันนี้รวมถึงไฟล์ unit-test อีกสี่ไฟล์ของ repository ด้วย (ทั้งหมดถูกรันซ้ำโดยอิสระและผ่านเมื่อ 2026-08-10):

| ไฟล์                                     | ผลลัพธ์             |
| ---------------------------------------- | ------------------- |
| `tests/unit/parser.test.js`              | 22 passed, 0 failed |
| `tests/unit/v2-parser.test.js`           | 27 passed, 0 failed |
| `tests/unit/counter-wraparound.test.js`  | 14 passed, 0 failed |
| `tests/unit/boundary-validation.test.js` | 33 passed, 0 failed |
| `tests/unit/circuit-breaker.test.js`     | 3 passed, 0 failed  |

_สถานะ: ผ่าน 100% (99/99 จากไฟล์ unit-test ทั้งห้าไฟล์)_

---

## <img src="../assets/icons/check-circle.svg" width="14" align="center"/> **สถานะ:** สมบูรณ์ (Healthy) ระยะที่ 2: ความสมบูรณ์ของแดชบอร์ด (Visual & Schema Linter)

**เป้าหมาย:** ตรวจสอบให้แน่ใจว่าแดชบอร์ดในชุด LDI ทั้ง 5 แดชบอร์ด (`ims-ldi-manufacturing`, `ims-ldi-operator-andon`, `ims-ldi-engineering-analytics`, `ims-ldi-machine-snapshot`, `ldi-data-readiness`) แสดงผลโดยไม่มีพาเนลทับซ้อนกัน ใช้สีผิดไปจากที่กำหนด หรือมี SQL queries ที่เสียหาย

**วิธีการ:** รัน lint suite ของจริงโดยตรง (เครื่องมือนี้คือตัวบังคับใช้เช็คลิสต์ด้านล่างนี้ -- การใช้ `make validate-dashboards` จะตรวจสอบเฉพาะข้อผิดพลาดของรหัสสี hex ที่เสียหายกลุ่มเล็กๆ แค่กลุ่มเดียว และ**ไม่ได้**เรียกใช้ linter ทั้งสองตัว ดังนั้นอย่าพึ่งพาคำสั่งนี้เพื่อเซ็นรับรอง (sign-off)):

```bash
node tests/lint/dashboard-linter.js  # grid overlap, color tokens, contrast, panel structure
node tests/lint/alarm-sync-linter.js  # simulator alarm codes resolve against the live Alarm Master
node tests/lint/orphan-object-linter.js # every DB object is referenced by something
node tests/lint/query-budget-linter.js # no raw-table range scans
node tests/lint/rca-mapping-coverage.js # every alarm category maps to an RCA bucket
node scripts/generate-dashboard-inventory.js --check # panel counts match the dashboard JSON
node scripts/generate-schema-inventory.js --check  # schema doc matches the live database
```

**เช็คลิสต์:**

- [x] **การตรวจสอบ Grid-24:** พาเนลทั้งหมดมีความกว้างรวมกัน 24 คอลัมน์ ไม่มีการทับซ้อน (`dashboard-linter.js` Check 9)
- [x] **การตรวจสอบโทนสี (Color Token Check):** สีที่กำหนดตายตัวทั้งหมดตรงกับชุดสี 8-token ที่ได้รับการอนุมัติ (`dashboard-linter.js` Check 15) -- `#22c55e` (ok), `#f59e0b` (warning), `#ef4444` (critical), `#00f2fe` (info), `#3b82f6` (accent), `#64748b` (no_data), `#4a5568` (forecast), `#eab308` (severity-minor) ไม่ใช่ชุดสี 4 สีจากร่างก่อนหน้านี้ ซึ่งเป็นสีก่อนที่จะใช้ "ชุดสีสากลเดียว (single universal color palette)" และรวมสี `#10B981` ซึ่งเป็นสีที่ไม่ได้อยู่ในชุดสีปัจจุบันที่บังคับใช้อยู่เลย
- [x] **ประสิทธิภาพ Query:** `v_machine_spc_fleet` เป็น materialized view (migration 064) ซึ่งรีเฟรชทุกๆ 60 วินาที ผ่าน TimescaleDB background job ค่า P95 ของชุด LDI ที่วัดได้คือ: **5.30ms** (ไม่ใช่แค่ "ต่ำกว่า 100ms" -- ได้รับการตรวจสอบผ่าน `EXPLAIN ANALYZE` บนฐานข้อมูลจริง 2026-08-10)

_สถานะ: ผ่าน 100% (พบ 0 ข้อผิดพลาดจาก linter ทั้ง 5 ตัว + การตรวจสอบ inventory ทั้งสอง)_

---

## <img src="../assets/icons/check-circle.svg" width="14" align="center"/> **สถานะ:** คำเตือน (Warning) ระยะที่ 3: การทดสอบรับภาระงานสูง (High-Load Stress Testing - K6 Pipeline Simulation)

**เป้าหมาย:** ตรวจสอบว่า Node-RED ingestion layer และ PgBouncer สามารถจัดการโหลดหนักต่อเนื่องพร้อมกันโดยไม่ทำข้อมูลตกหล่นหรือมี latency เกินระดับที่ยอมรับได้

**วิธีการ:** ใช้ `make test-load` ซึ่งจะไปเรียกใช้ `tests/k6/pipeline-stress.js` โดยเฉพาะ (ใน repo มีสคริปต์ k6 ทั้งหมด 7 สคริปต์; เป้าหมาย Make นี้จะเรียกใช้สคริปต์นี้)

**พารามิเตอร์จริง (อ่านจากสคริปต์โดยตรง ไม่ได้มาจากการคาดเดา):**

- ผู้ใช้งานจำลอง (Virtual users): เพิ่มระดับขึ้นเป็น `20 → 50 → TARGET_SERVERS` (ตัวแปรสภาพแวดล้อม **ค่าเริ่มต้นคือ 100** ไม่ใช่ค่าตายตัวที่ "50 ปรับเพิ่มเป็น 200")
- เกณฑ์ที่ยอมรับ (Thresholds): `pipeline_success rate > 0.95` (อัตราล้มเหลวไม่เกิน 5% ถือว่าผ่าน ไม่ใช่ "อัตราตกหล่น 0%") และ `e2e_duration p(95) < 10000ms` (**10 วินาที** ไม่ใช่ 500ms)
- เป้าหมาย (Target): การยิงไปที่ endpoint `/inject` รุ่นเก่า ด้วยรหัส `E2E-SERVER-*` ที่สร้างจำลองขึ้นมา -- การทดสอบนี้ทำให้โครงสร้างพื้นฐาน Node-RED / PgBouncer / TimescaleDB **แบบใช้งานร่วมกัน (shared)** ซึ่ง LDI pipeline ก็ทำงานอยู่บนโครงสร้างเดียวกันนี้ ได้ทำงาน ไม่ใช่การยิงตรงไปที่ endpoint `/ldi-telemetry` ที่เป็นของ LDI โดยเฉพาะ **ปัจจุบันไม่มีสคริปต์ใดใน repo นี้ที่ทำโหลดเทส endpoint `/ldi-telemetry` โดยเฉพาะ** -- นี่คือช่องว่างจริงๆ ที่เกิดขึ้นในปัจจุบัน ไม่ใช่สิ่งที่ควรปกปิด
- PgBouncer: `DEFAULT_POOL_SIZE=20` (docker-compose.yaml) -- รายละเอียดนี้ในร่างก่อนหน้าเป็นสิ่งที่ถูกต้อง

สำหรับการทดสอบที่ท้าทายกว่า (ใช้ใน CI, `.github/workflows/ci.yml`), `tests/k6/chaos-stress.js` จะเพิ่มโหลดเป็น 1,000 VUs พร้อมทั้งจงใจจำลองข้อผิดพลาด 5% และเพย์โหลดผิดรูปแบบ 10% โดยใช้เกณฑ์ `pipeline_success rate > 0.90` และ `pipeline_duration p(95) < 200ms`

_สถานะ: สคริปต์ทั้งสองสามารถทำงานได้จริงและผ่านเกณฑ์ของตัวเอง (ไม่ใช่ของร่างก่อนหน้า) แนะนำให้รัน `make test-load` และแนบผลลัพธ์จริงก่อนการลงนาม (sign-off) พร้อมกับพิจารณา "การไม่มีการโหลดเทสสำหรับ `/ldi-telemetry` โดยเฉพาะ" เป็นเรื่องที่ยังค้างอยู่ แทนที่จะถือว่าผ่านโดยปริยาย_

---

## <img src="../assets/icons/check-circle.svg" width="14" align="center"/> **สถานะ:** คำเตือน (Warning) ระยะที่ 4: การนำไปใช้งานในกระบวนการผลิต (Production Rollout - End-to-End Live Test)

**เป้าหมาย:** การตรวจสอบขั้นตอนสุดท้ายบนพื้นที่โรงงานที่มีมนุษย์มีส่วนร่วม

**วิธีการ (มาตรฐานขั้นตอนการปฏิบัติงาน - Standard Operating Procedure):**

1. **การทดสอบ Operator Andon:** ถอดสายแลนของเครื่อง LDI ที่ไม่ใช่เครื่องในไลน์ผลิต (เช่น `LDI-01` -- รหัสเครื่องจริงๆ คือ `LDI-01` ถึง `LDI-10` เป็นแบบเลขสองหลัก ไม่ใช่ `LDI-001`)

- _เกณฑ์การผ่าน:_ หน้าจอ [LDI Operator Andon](http://localhost:3000/d/ims-ldi-operator-andon/set2-operator-andon) ต้องแสดงเครื่องนั้นเป็นสถานะ `NO_DATA` (สีเทา) ภายในระยะเวลารีเฟรช 1 รอบรวมกับเวลาประมวลผล -- รอบการรีเฟรชหน้าจอคือ **5 วินาที** (ไม่ใช่ 10 วินาที) และแผ่นป้ายแสดงสถานะ (status tile) จะอ่านจากค่าสถานะ `is_stale` ของตาราง `v_ldi_machine_latest_full` (หากไม่มีข้อมูลใหม่ใน 5 นาที = `NO_DATA`) ดังนั้นกรอบเวลาที่ใช้เป็นเกณฑ์ตัดสินใจผ่านจริงคือใกล้เคียงกับ **~7-10 วินาที** ไม่ใช่ 12

1. **การทดสอบความผิดปกติของผลผลิต (Yield Anomaly Test):** จำลองใส่ค่าอุณหภูมิที่สูงเกินจริงลงในเครื่อง LDI ทดสอบ

- _เกณฑ์การผ่าน:_ พาเนลแสดงอุณหภูมิใน [LDI Engineering Analytics](http://localhost:3000/d/ims-ldi-engineering-analytics/set2-engineering-analytics) จะต้องแสดงผลข้อมูลที่มีการเปลี่ยนแปลงอย่างผิดปกติ **อย่าทดสอบด้วย "การพุ่งสูงขึ้นแบบ Z-Score Anomaly" ที่นี่** -- แดชบอร์ดนี้ไม่มีพาเนลวิเคราะห์ Z-Score/statistical-anomaly เลย (ตรวจสอบจาก JSON จริงแล้ว พาเนล Z-Score มีอยู่เฉพาะในแดชบอร์ดด้านการรองรับและการสืบค้นเชิงลึกทางวิศวกรรมสำหรับ CPU/อุณหภูมิที่เน้นไปที่โครงสร้างพื้นฐาน ไม่ใช่เมตริกของ LDI เฉพาะ) การแจ้งเตือนอุณหภูมิของ LDI จริงๆ คือ **ค่าเกณฑ์ตายตัว (fixed threshold)** ที่กำหนดด้วย rule มาตรฐานของ Grafana ชื่อ "LDI Temperature High — above 24°C spec limit" (`monitoring/grafana/provisioning/alerting/ldi-rules.yml`) -- ต้องยืนยันว่ากฎ _นั้น_ ทำงานแทน
- _เกณฑ์การผ่าน (การส่งมอบการแจ้งเตือน):_ ยืนยันว่า Alertmanager จะสามารถกำหนดเส้นทางสำหรับการแจ้งเตือน และ flow ของ Node-RED เรื่อง `alerting.json` สามารถสร้างรูปแบบ payload ไปยัง LINE Messaging API / MS Teams ได้อย่างถูกต้อง (ตรวจสอบจาก debug output หรือ Node-RED log สำหรับข้อความที่ถูกจัดรูปแบบแล้ว) **อย่าปิดกั้นการเซ็นรับรอง (sign-off) หากข้อความไม่มีการส่งไปยัง LINE/Teams จริงๆ** -- ตัวแปร `LINE_CHANNEL_ACCESS_TOKEN` และ `TEAMS_WEBHOOK_URL` นั้นไม่มีอยู่ใน `.env` ของ repo นี้โดยจงใจ (เพราะข้อมูลสิทธิ์การเข้าถึง (credentials) ของจริงไม่สามารถใส่ใน repo ได้) ดังนั้น การส่งข้อความแบบ end-to-end จึงไม่สามารถทำได้ในระดับโครงสร้างจนกว่าผู้ปฏิบัติงานจะเข้าไปกำหนดค่าสิทธิ์การเข้าถึงจริงตามหมวด Pre-Production Security Checklist ของเอกสาร `docs/admin/ADMIN_MANUAL.md` ให้พิจารณาเพียง "จัดรูปแบบ payload ถูกต้อง และบันทึก/ส่งความพยายามส่งสำเร็จ" เป็นเกณฑ์ตัดสินใจหลักสำหรับสถานะเริ่มต้นของ repository นี้

1. **การซิงค์ข้อมูลความพร้อม (Data Readiness Sync):** เปิด [LDI Data Readiness](http://localhost:3000/d/ldi-data-readiness/ldi-data-readiness)

- _เกณฑ์การผ่าน:_ ไม่มีเมตริก "อัตราส่วนความสมบูรณ์ของข้อมูล (Data Completeness Ratio)" เพียงตัวเดียว -- ให้ตรวจสอบที่พาเนลจริงๆ: **อายุของโทรมาตร (Telemetry Age)**, **อายุของการแจ้งเตือน (Alarm Age)**, **การจับคู่รหัสเครื่อง (Machine ID Match)**, **การจับคู่ Alarm Master (Alarm Master Match)**, **ความสมบูรณ์ของรหัสบอร์ด (Board ID Completeness)**, **ความครอบคลุม PE / JE4 (PE / JE4 Coverage)**, รวมถึงเมทริกซ์ความครอบคลุมข้อมูลเครื่องจักรและตาราง "Mapping Gaps (Global)" ทั้งสองตาราง ข้อมูลทั้งหมดควรจะเป็นสีเขียว/ไม่มีช่องว่าง(zero-gap) จึงจะถือว่าผ่านการลงนาม (clean sign-off)

_สถานะ: กระบวนการได้รับการแก้ไขและพร้อมดำเนินการ ยังไม่ได้ถูกรันแบบ end-to-end กับฮาร์ดแวร์จริง ณ วันที่ของเอกสารนี้_

---

**ลงนาม (Sign-off):** SRE Team / หัวหน้าสถาปนิก (IMS Lead Architect)
**วันที่:** 10 สิงหาคม 2026
**แก้ไขปรับปรุงเมื่อ:** แก้ไขเทียบกับการตรวจสอบระบบที่ทำงานจริง เมื่อวันที่ 2026-08-10 (โปรดดูหมายเหตุแหล่งที่มาด้านบน)
