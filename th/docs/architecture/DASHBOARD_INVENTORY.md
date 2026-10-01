# รายการแดชบอร์ด (Dashboard Inventory)

> **ไฟล์ที่ถูกสร้างขึ้นอัตโนมัติ — ห้ามแก้ไขด้วยตนเอง** สร้างใหม่ด้วย:
> `node scripts/generate-dashboard-inventory.js`
>
> แหล่งข้อมูลหลัก: `monitoring/grafana/dashboards/{drilling,infrastructure,manufacturing,vcp}/*.json` (title, uid, panel
> count, description — ทั้งหมดอ่านโดยตรงจาก JSON ไม่มีการพิมพ์ด้วยตนเอง)
> การนับจำนวน panel ใช้การคำนวณที่เหมือนกันกับ
> `tests/lint/dashboard-linter.js` (`data.panels.length`) ดังนั้นไฟล์นี้และ
> ผลลัพธ์ในคอนโซลของ linter จะไม่มีทางขัดแย้งกัน การตรวจสอบของ CI
> (`node scripts/generate-dashboard-inventory.js --check`) จะทำให้การบิลด์ล้มเหลว
> หากไฟล์นี้ไม่ตรงกับสิ่งที่แดชบอร์ดระบุไว้ในปัจจุบัน
>
> สร้างล่าสุด: 2026-10-01 | แดชบอร์ดทั้งหมด: 22 | พาเนลทั้งหมด: 225

## 01 · ฝ่ายปฏิบัติการเจาะ (Drilling Operations) (4)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-drilling-5-anomaly` | Drilling — 04 Fleet Anomaly & Root Cause Analysis | 8 | การตรวจจับความผิดปกติของกลุ่มเครื่องจักร, การสั่นสะเทือนของสปินเดิลที่อยู่นอกข้อกำหนด, และการวิเคราะห์หาสาเหตุที่แท้จริง (RCA) แบบหลายปัจจัยของกลุ่มเครื่องเจาะ CNC |
| `001` | Drilling — 01 Fleet Digital Twin & Overview | 1 | แฝดดิจิทัล 3D สดของพื้นที่โรงงานและภาพรวมการทำงานระดับสูงของเครื่องเจาะ CNC ทั้งหมด |
| `ims-drilling-machine-detail` | Drilling — 03 Machine Investigation & Spindle Diagnostics | 5 | คอนโซลวินิจฉัยเชิงลึกสำหรับเครื่องเจาะรายเครื่อง: ความเร็วรอบสปินเดิล (RPM), โหลดของมอเตอร์, อัตราป้อน (Feed rate), และการสึกหรอของดอกเจาะ |
| `ims-drilling-history` | Drilling — 02 Shift Production & OEE Tracking | 3 | ปริมาณผลผลิตตามกะ, จำนวนครั้งการเจาะ (Hit count), ผลผลิตแผงวงจร, และการติดตามประสิทธิผลโดยรวมของเครื่องจักร (OEE) สำหรับการเจาะ |

## 02 · ฝ่ายปฏิบัติการพิมพ์ลายวงจร / การผลิต LDI (10)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-easy-overview` | LDI — 01 Fleet Executive Overview | 8 | วิธีที่ง่ายที่สุดในการดูกลุ่มอุปกรณ์ LDI ทั้งหมดพร้อมกัน: ไม่ต้องตั้งค่าตัวแปรเทมเพลต ไม่ต้องกำหนดค่าตัวกรอง แค่เปิดขึ้นมา สร้างจากวิว/ฟังก์ชันที่แชร์กันในระบบทั้งหมด (v_ldi_machine_latest_full, v_ldi_alarm_c... |
| `ims-ldi-alarm-console` | LDI — 07 Live Alarm Management Console | 2 | เวิร์กโฟลว์การรับทราบ/แก้ไขการเตือนแบบตอบโต้ -- เขียนสถานะจริงลงใน public.ldi_alarm_lifecycle เป็นส่วนเสริมของแดชบอร์ดอ่านอย่างเดียว LDI — 02 Operator Andon Board (ตู้หน้าจอทีวีติดผนัง ไม่มีองค์ประกอบแบบตอบโต้) |
| `ims-ldi-alarm-dictionary` | LDI — 09 Alarm Code Dictionary & Corrective Actions | 3 | แดชบอร์ดค้นหาข้อมูลอ้างอิง: คำจำกัดความ Alarm Master ฉบับเต็มจากผู้ผลิต + การเกิดจริงล่าสุดสำหรับ Alarm Code ใดๆ ไม่ได้เป็นส่วนหนึ่งของโฟลว์การนำทางสำหรับผู้ปฏิบัติงาน/วิศวกร -- เปิดผ่านลิงก์เจาะลึกจากคอลัมน์ Alarm Code... |
| `ims-ldi-alarm-response` | LDI — 08 Alarm Response Metrics & MTTA/MTTR | 8 | ทีมตอบสนองต่อการเตือนเร็วพอหรือไม่? MTTA/MTTR จริงจาก public.ldi_alarm_lifecycle -- ไม่มีข้อมูลจำลอง กลุ่มเป้าหมายคือหัวหน้ากะ / เจ้าของการผลิต เช่นเดียวกับ Manufacturing Command Center |
| `ims-ldi-engineering-analytics` | LDI — 06 Process Engineering Analytics & SPC | 16 | เลเยอร์ 3 ไทม์ไลน์กระบวนการ: RCA แบบหลายพารามิเตอร์ที่ซิงโครไนซ์กัน temperature → humidity → scan_speed → air_vacuum → scale_x/y → pe_1~6 → je_1~4 → state ครอสแฮร์ที่ใช้ร่วมกัน + ทูลทิป (tooltip) การปรับสเกลแกนแบบคงที่ |
| `ims-ldi-factory-digital-twin` | LDI — 03 Factory 3D Digital Twin & Spatial Layout | 1 | แฝดดิจิทัล 3D ของโรงงานและเลย์เอาต์พื้นที่ แสดงเครื่อง LDI จริงทั้ง 10 เครื่อง (LDI-01..LDI-10) แบ่งตาม 5 โซนจริง (public.devices.location) |
| `ims-ldi-machine-snapshot` | LDI — 05 Machine Deep-Dive Snapshot | 14 | สแนปชอตของเครื่องแบบ 360° ณ เสี้ยววินาทีที่คลิกจากไทม์ไลน์กระบวนการ แสดงบริบทของงาน, ตัวแปรทางกายภาพ, การจัดตำแหน่ง PE, Cpk และความใกล้เคียงของการเตือน |
| `ims-ldi-manufacturing` | LDI — 04 Manufacturing Fleet Command Center | 33 | แดชบอร์ดศูนย์บัญชาการการผลิต 4 เลเยอร์: HUD ผู้บริหาร + โทรมาตรเครื่องจักร + บริบทการผลิต + สตรีมการแจ้งเตือน การตั้งชื่อตามสคีมา ครอสแฮร์ที่ใช้ร่วมกัน การปรับสเกลแกนคงที่ |
| `ims-ldi-operator-andon` | LDI — 02 Operator Andon Board (Shopfloor Kiosk) | 11 | บอร์ด Andon สำหรับผู้ปฏิบัติงานหน้างาน (Kiosk) มาตรฐาน ISA-101 ไม่ต้องโต้ตอบ ไม่ต้องเลื่อนหน้าจอ ความละเอียด 1280x720 ตัวเลือกตัวแปรเทมเพลตและแถวลิงก์เจาะลึกถูกซ่อนไว้ |
| `ldi-data-readiness` | LDI — 10 Telemetry Signal Quality & Integration Readiness | 17 | แดชบอร์ดตรวจสอบคุณภาพสัญญาณและความพร้อมในการบูรณาการระบบ อิงจากแถวข้อมูลจริงใน PostgreSQL ไม่มีข้อมูลจำลอง |

## 03 · โครงสร้างพื้นฐานระบบและ NOC (5)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-capacity` | Platform — 03 AIOps Predictive Capacity & Resource Forecasting | 16 | คาดการณ์จำนวนวันก่อนทรัพยากรเต็มสำหรับ CPU, RAM และดิสก์ ผ่าน 30-day linear regression พร้อมตรวจจับความผิดปกติด้วย Z-Score (>3sigma) เน้นที่โครงสร้างพื้นฐาน |
| `ims-engineering` | Platform — 02 Host & Network Infrastructure Engineering Drill-Down | 25 | เจาะลึกระดับเซิร์ฟเวอร์: เกจและอนุกรมเวลา CPU/RAM/ดิสก์/อุณหภูมิ/เครือข่ายสำหรับเครื่องที่เลือก พร้อมทั้งพาเนลปริมาณงาน/คุณภาพ LDI และ Z-Score anomaly |
| `ims-ingestion-latency` | Platform — 04 Ingestion Pipeline Latency & Telemetry SLO | 13 | อ่านอย่างเดียว หลักฐานความหน่วงจริงจาก source_ts -> ingest_ts จากคอลัมน์ ingest_ts ของ migration 081 ไม่มีข้อมูลจำลอง เป็นส่วนเสริมของ tests/e2e/ingestion-latency-check.js |
| `ims-meta-monitoring` | Platform — 05 Pipeline Reliability & SRE Meta-Monitoring | 16 | ตรวจวัดความน่าเชื่อถือของไปป์ไลน์การนำเข้าข้อมูลเอง: อัตราการแทรกแถว/วินาที, อัตราความสำเร็จของแบทช์, ความลึกคิวรีไทร, สถานะเซอร์กิตเบรกเกอร์ และอัตราการโพลอุปกรณ์ |
| `ims-noc-overview` | Platform — 01 Network Operations Center (NOC) Overview | 7 | โครงสร้างพื้นฐานเท่านั้น (เซิร์ฟเวอร์) -- เมตริกกระบวนการ/คุณภาพของ LDI จะอยู่บนแดชบอร์ด Manufacturing และ Machine Snapshot |

## 04 · ฝ่ายปฏิบัติการชุบเคลือบทองแดง / สายการผลิต VCP (3)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-vcp-operations-console` | VCP — 02 Plating Line Operations Console | 7 | คอนโซลควบคุมสายการชุบ VCP: สถานะล่าสุดของแต่ละไลน์, ล็อตงานที่กำลังชุบ, อุณหภูมิอ่างชุบ 7 ขั้นตอน, กระแสและแรงดันไฟฟ้าของ 18 สถานี, และบันทึกการแจ้งเตือน |
| `ims-vcp-overview` | VCP — 01 Plating Fleet Overview & Process Analytics | 10 | ภาพรวมกลุ่มไลน์ชุบและการวิเคราะห์กระบวนการ: ชั่วโมงตามสถานะ, ค่าเบี่ยงเบนอุณหภูมิอ่างชุบและกระแสไฟสถานี, ความต้านทานเซลล์, การเบี่ยงเบนปั๊ม, การปฏิบัติตามสูตร และการแจ้งเตือน |
| `ims-vcp-realtime-wall` | VCP — 03 Real-Time Plating Line Wall Display | 1 | การแสดงผลจอภาพติดผนังแบบเรียลไทม์: การ์ดสถานะของแต่ละไลน์พร้อมงานปัจจุบัน, อุณหภูมิอ่าง, เร็กติไฟเออร์ชุบ 18 ตัว (กระแส/แรงดันฝั่ง A/B), ปั๊มหมุนเวียน 18 ตัว |
