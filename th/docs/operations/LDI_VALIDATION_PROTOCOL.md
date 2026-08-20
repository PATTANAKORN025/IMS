<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# โปรโตคอลการตรวจสอบและเตรียมความพร้อมระบบ LDI

> **วัตถุประสงค์:** รับรองระบบนิเวศการตรวจสอบ LDI (Laser Direct Imaging) สำหรับการปรับใช้งานในสายการผลิต โปรโตคอลนี้จะตรวจสอบความสมบูรณ์ของข้อมูล, ความถูกต้องของการแสดงผล, ความเสถียรของระบบ และความพร้อมของผู้ปฏิบัติงาน
>
> **แหล่งที่มา:** ทุกพารามิเตอร์และเกณฑ์การผ่านด้านล่างได้รับการตรวจสอบโดยตรงกับระบบที่ทำงานอยู่เมื่อวันที่ 2026-08-10 (เอาต์พุตการทดสอบ, JSON แดชบอร์ด, เป้าหมาย Makefile, สคริปต์ k6, `.env`) มากกว่าการตั้งสมมติฐาน ฉบับร่างก่อนหน้านี้ของโปรโตคอลนี้มีพารามิเตอร์หลายตัวที่ไม่ตรงกับการดำเนินการจริง (พฤติกรรมเป้าหมาย Make ที่ผิดพลาด, จานสีที่ใช้ก่อนการผสานระบบการออกแบบปัจจุบัน, เกณฑ์ k6 ที่ไม่ตรงกับสคริปต์ใดๆ ในที่เก็บข้อมูล, ช่วงเวลาการรีเฟรช Andon ที่ล้าสมัย, และเกณฑ์การผ่านการแจ้งเตือนที่ไม่สามารถสำเร็จได้ด้วย `.env` ที่จัดส่งมาพร้อมกับที่เก็บข้อมูลนี้) เวอร์ชันนี้แทนที่ฉบับร่างนั้น; ไม่มีอะไรในที่นี้ที่เป็นเพียงความปรารถนา

---

## <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Status:** Healthy ระยะที่ 1: การตรวจสอบความสมบูรณ์ของข้อมูลและพาร์เซอร์ (Unit Testing)

**เป้าหมาย:** ตรวจสอบให้แน่ใจว่าเพย์โหลด JSON ที่เสียหาย, ขาดหาย หรือมีรูปแบบผิดปกติจากเครื่อง LDI จริงจะไม่ทำให้ไปป์ไลน์ Node-RED ล่ม หรือทำให้ฐานข้อมูลเสียหาย

**วิธีการ:** เรียกใช้ชุด `v2-parser.test.js` (`node tests/unit/v2-parser.test.js`) ซึ่งจำลองกรณีที่เป็นขอบเขตสุดขั้ว:

- เพย์โหลดว่างเปล่า (จำลองเครือข่ายหลุด)
- ตัวนับ 32 บิตวนกลับ (เมื่ออัปไทม์ของเครื่องจักรเกิน 49 วัน)
- ความพยายามในการฉีด SQL ภายในค่าเพย์โหลด

**หลักฐาน (รันซ้ำเมื่อ 2026-08-10, ชื่อการทดสอบตรงตามที่ยืนยันว่ามีอยู่ใน `tests/unit/v2-parser.test.js`):**

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

เพื่อความครอบคลุมของไปป์ไลน์ทั้งหมด ระยะเดียวกันนี้ควรพิจารณารวมถึงไฟล์การทดสอบหน่วยอื่นอีกสี่ไฟล์ของที่เก็บข้อมูล (ทั้งหมดถูกรันแยกต่างหากและผ่านเมื่อ 2026-08-10):

| ไฟล์                                     | ผลลัพธ์              |
| ---------------------------------------- | ------------------- |
| `tests/unit/parser.test.js`              | 22 passed, 0 failed |
| `tests/unit/v2-parser.test.js`           | 27 passed, 0 failed |
| `tests/unit/counter-wraparound.test.js`  | 14 passed, 0 failed |
| `tests/unit/boundary-validation.test.js` | 33 passed, 0 failed |
| `tests/unit/circuit-breaker.test.js`     | 3 passed, 0 failed  |

_สถานะ: ผ่าน 100% (99/99 จากไฟล์การทดสอบหน่วยทั้งห้าไฟล์)_

---

## <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Status:** Healthy ระยะที่ 2: ความสมบูรณ์ของแดชบอร์ด (Visual & Schema Linter)

**เป้าหมาย:** ยืนยันว่าแดชบอร์ดชุด LDI ทั้ง 5 ชุด (`ims-ldi-manufacturing`, `ims-ldi-operator-andon`, `ims-ldi-engineering-analytics`, `ims-ldi-machine-snapshot`, `ldi-data-readiness`) แสดงผลโดยไม่มีแผงทับซ้อน สีที่หลุดกรอบ หรือคิวรี SQL ที่ผิดพลาด

**วิธีการ:** เรียกใช้ชุดการตรวจสอบ linter จริงโดยตรง (นี่คือสิ่งที่บังคับใช้รายการตรวจสอบด้านล่างจริง -- `make validate-dashboards` ตรวจสอบเพียงคลาสแคบๆ เดียวของข้อความโค้ดฐานสิบหกที่เสียหาย และ **ไม่** เรียกใช้ linter ทั้งสองตัว ดังนั้นอย่าพึ่งพาสิ่งนี้สำหรับการลงนามการตรวจสอบ):

```bash
node tests/lint/dashboard-linter.js  # grid overlap, color tokens, contrast, panel structure
node tests/lint/alarm-sync-linter.js  # simulator alarm codes resolve against the live Alarm Master
node tests/lint/orphan-object-linter.js # every DB object is referenced by something
node tests/lint/query-budget-linter.js # no raw-table range scans
node tests/lint/rca-mapping-coverage.js # every alarm category maps to an RCA bucket
node scripts/generate-dashboard-inventory.js --check # panel counts match the dashboard JSON
node scripts/generate-schema-inventory.js --check  # schema doc matches the live database
```

**รายการตรวจสอบ:**

- [x] **การตรวจสอบ Grid-24:** แผงทั้งหมดรวมกันได้ 24 คอลัมน์กว้าง ไม่มีการทับซ้อน (`dashboard-linter.js` การตรวจสอบ 9)
- [x] **การตรวจสอบโทเค็นสี:** สีที่กำหนดค่าฮาร์ดโค้ดทั้งหมดตรงกับพาเล็ต 8 โทเค็นที่ได้รับอนุมัติ (`dashboard-linter.js` การตรวจสอบ 15) -- `#22c55e` (ok), `#f59e0b` (warning), `#ef4444` (critical), `#00f2fe` (info), `#3b82f6` (accent), `#64748b` (no_data), `#4a5568` (forecast), `#eab308` (severity-minor) ไม่ใช่ชุด 4 สีจากร่างก่อนหน้านี้ ซึ่งใช้ก่อนการผสาน "พาเล็ตสีสากลเดียว" และมี `#10B981` ซึ่งเป็นสีที่ไม่อยู่ในชุดที่บังคับใช้ในปัจจุบันเลย
- [x] **ประสิทธิภาพของคิวรี:** `v_machine_spc_fleet` เป็น materialized view (การย้ายถิ่นฐาน 064) ซึ่งรีเฟรชทุก 60 วินาทีผ่านงานแบ็คกราวด์ของ TimescaleDB วัดค่า P95 ของชุด LDI ได้: **5.30ms** (ไม่ใช่แค่ "ต่ำกว่า 100ms" -- ยืนยันผ่าน `EXPLAIN ANALYZE` กับฐานข้อมูลจริง 2026-08-10)

_สถานะ: ผ่าน 100% (ข้อผิดพลาด 0 รายการจาก linter 5 ตัว + การตรวจสอบสินค้าคงคลังทั้งสองรายการ)_

---

## <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Status:** Warning ระยะที่ 3: การทดสอบความเครียดในการโหลดสูง (K6 Pipeline Simulation)

**เป้าหมาย:** ตรวจสอบว่าเลเยอร์การนำเข้าของ Node-RED และ PgBouncer สามารถรับมือกับโหลดพร้อมกันอย่างต่อเนื่องได้โดยไม่ทำข้อมูลตกหล่นหรือมีความล่าช้าเกินที่ยอมรับได้

**วิธีการ:** `make test-load` ซึ่งเรียกใช้งาน `tests/k6/pipeline-stress.js` โดยเฉพาะ (ที่เก็บข้อมูลนี้มีสคริปต์ k6 7 สคริปต์; นี่คือตัวที่เป้าหมาย Make นี้เรียกใช้จริง)

**พารามิเตอร์จริง (อ่านโดยตรงจากสคริปต์ ไม่ได้สมมติ):**

- ผู้ใช้เสมือน: ไต่ระดับ `20 → 50 → TARGET_SERVERS` (ตัวแปรสภาพแวดล้อม **ค่าเริ่มต้น 100** ไม่ใช่ค่าคงที่ "50 ก้าวขึ้นไปที่ 200")
- เกณฑ์: `pipeline_success rate > 0.95` (ยอมรับความล้มเหลวได้สูงสุด 5% ไม่ใช่ "อัตราการตกหล่น 0%") และ `e2e_duration p(95) < 10000ms` (**10 วินาที** ไม่ใช่ 500ms)
- เป้าหมาย: เอนด์พอยต์ `/inject` รุ่นเก่า ที่มี ID สังเคราะห์ `E2E-SERVER-*` -- นี่เป็นการทดสอบโครงสร้างพื้นฐาน Node-RED / PgBouncer / TimescaleDB **ที่ใช้ร่วมกัน** ซึ่งไปป์ไลน์ LDI ก็ทำงานอยู่ด้านบนนั้นเช่นกัน ไม่ใช่เอนด์พอยต์ `/ldi-telemetry` เฉพาะสำหรับ LDI โดยตรง **ไม่มีสคริปต์ในที่เก็บข้อมูลนี้ในปัจจุบันที่ทดสอบการโหลด `/ldi-telemetry` โดยเฉพาะ** -- นี่คือช่องโหว่ปัจจุบันที่แท้จริง ไม่ใช่สิ่งที่จะปกปิดได้
- PgBouncer: `DEFAULT_POOL_SIZE=20` (docker-compose.yaml) -- รายละเอียดนี้ในฉบับร่างก่อนหน้านี้มีความแม่นยำ

สำหรับการเรียกใช้เชิงปฏิปักษ์เพิ่มเติม (ใช้ใน CI, `.github/workflows/ci.yml`) `tests/k6/chaos-stress.js` ไต่ระดับเป็น 1000 VU โดยมีการฉีดข้อผิดพลาดโดยเจตนา 5% และเพย์โหลดผิดปกติ 10% เกณฑ์คือ `pipeline_success rate > 0.90` และ `pipeline_duration p(95) < 200ms`

_สถานะ: สคริปต์ทั้งสองมีอยู่จริง รันได้ และผ่านเทียบกับเกณฑ์ของมันเอง (ไม่ใช่ของฉบับร่างก่อนหน้านี้) แนะนำให้รัน `make test-load` และแนบผลลัพธ์จริงก่อนการอนุมัติ และถือว่า "ไม่มีการทดสอบโหลด `/ldi-telemetry` โดยเฉพาะ" เป็นรายการที่ค้างอยู่ มากกว่าจะถือว่าผ่านโดยปริยาย_

---

## <img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Status:** Warning ระยะที่ 4: การใช้งานจริง (End-to-End Live Test)

**เป้าหมาย:** การตรวจสอบขั้นตอนสุดท้ายโดยให้มนุษย์เข้ามามีส่วนร่วมในสายการผลิตจริง

**วิธีการ (ขั้นตอนปฏิบัติงานมาตรฐาน - SOP):**

1. **การทดสอบ Operator Andon:** ถอดสายเครือข่ายออกจากเครื่อง LDI ที่ไม่ได้ใช้ในการผลิต (เช่น `LDI-01` -- ID เครื่องจักรจริงคือ `LDI-01` ถึง `LDI-10` สองหลัก ไม่ใช่ `LDI-001`)

- _เกณฑ์การผ่าน:_ แผง [LDI Operator Andon](http://localhost:3000/d/ims-ldi-operator-andon/set2-operator-andon) ต้องแสดงเครื่องนั้นเป็น `NO_DATA` (สีเทา) ภายในระยะเวลารอบการรีเฟรชหนึ่งรอบบวกกับการประมวลผล -- รอบการรีเฟรชของแผงคือ **5 วินาที** (ไม่ใช่ 10 วินาที) และไทล์สถานะอ่านค่าแฟล็ก `is_stale` ของ `v_ldi_machine_latest_full` (ไม่มีการอ่านค่าในช่วง 5 นาทีที่ผ่านมา = `NO_DATA`) ดังนั้นหน้าต่างการผ่านที่เป็นจริงจะใกล้เคียงกับ **~7-10 วินาที** ไม่ใช่ 12

1. **การทดสอบความผิดปกติของผลผลิต:** นำข้อมูลความร้อนสูงจำลองเข้าสู่เครื่องทดสอบ LDI

- _เกณฑ์การผ่าน:_ แผงอุณหภูมิของ [LDI Engineering Analytics](http://localhost:3000/d/ims-ldi-engineering-analytics/set2-engineering-analytics) ต้องแสดงความผิดปกติ **อย่าทดสอบ "Z-Score Anomaly spike" ที่นี่** -- ไม่มีแผง Z-Score/ความผิดปกติทางสถิติบนแดชบอร์ดนี้ (ตรวจสอบ JSON จริงแล้ว; แผง Z-Score มีอยู่เฉพาะในแดชบอร์ด Capacity Planning และ Engineering Drill-Down ที่เน้นโครงสร้างพื้นฐาน สำหรับ CPU/อุณหภูมิ ไม่ใช่เมตริกเฉพาะสำหรับ LDI) การแจ้งเตือนอุณหภูมิ LDI ที่แท้จริงคือ กฎพื้นฐาน Grafana ที่เป็น **เกณฑ์คงที่** "LDI Temperature High — above 24°C spec limit" (`monitoring/grafana/provisioning/alerting/ldi-rules.yml`) -- ยืนยันว่า _กฎนั้น_ ทำงานแทน
- _เกณฑ์การผ่าน (การส่งมอบการแจ้งเตือน):_ ยืนยันว่า Alertmanager ส่งต่อการแจ้งเตือน และกระแสข้อมูล `alerting.json` ของ Node-RED จัดรูปแบบเพย์โหลดสำหรับ LINE Messaging API / MS Teams (ตรวจสอบการแสดงผลการแก้ไขจุดบกพร่องของโฟลว์ / บันทึกของ Node-RED เพื่อดูข้อความที่จัดรูปแบบ) **อย่ากีดกันการลงนามรอข้อความที่ส่งถึง LINE/Teams จริง** -- `LINE_CHANNEL_ACCESS_TOKEN` และ `TEAMS_WEBHOOK_URL` หายไปจาก `.env` ของที่เก็บข้อมูลนี้โดยการออกแบบ (ไม่สามารถจัดส่งข้อมูลรับรองจริงในที่เก็บข้อมูลได้) ดังนั้นการจัดส่งแบบ End-to-End เป็นไปไม่ได้ในทางสถาปัตยกรรมจนกว่าผู้ปฏิบัติงานจะกำหนดค่าข้อมูลรับรองจริงตาม Checklist ความปลอดภัยก่อนการผลิตใน `docs/admin/ADMIN_MANUAL.md` ถือว่า "การจัดรูปแบบเพย์โหลดสำเร็จ ความพยายามและการส่งมอบถูกบันทึกสำเร็จ" เป็นเกณฑ์การผ่านที่แท้จริงสำหรับสถานะเริ่มต้นของที่เก็บข้อมูลนี้

1. **การซิงค์ความพร้อมของข้อมูล:** เปิด [LDI Data Readiness](http://localhost:3000/d/ldi-data-readiness/ldi-data-readiness)

- _เกณฑ์การผ่าน:_ ไม่มีเมตริก "อัตราส่วนความสมบูรณ์ของข้อมูล" เดียว -- ตรวจสอบแผงจริง: **Telemetry Age**, **Alarm Age**, **Machine ID Match**, **Alarm Master Match**, **Board ID Completeness**, **PE / JE4 Coverage**, รวมถึงตาราง Machine Data Coverage Matrix และตาราง "Mapping Gaps (Global)" ทั้งสองตาราง ทั้งหมดควรแสดงเป็นสีเขียว / ชะโงกเป็นศูนย์ สำหรับการลงนามตรวจสอบที่สมบูรณ์

_สถานะ: ขั้นตอนได้รับการแก้ไขและพร้อมสำหรับการดำเนินการ ยังไม่รันแบบครบวงจรกับฮาร์ดแวร์จริง ณ วันที่ของเอกสารนี้_

---

**ลงนามอนุมัติ:** ทีม SRE / หัวหน้าสถาปนิก IMS
**วันที่:** 10 สิงหาคม 2026
**การแก้ไข:** แก้ไขเทียบกับการตรวจสอบระบบจริง 2026-08-10 (ดูหมายเหตุแหล่งที่มาด้านบน)
