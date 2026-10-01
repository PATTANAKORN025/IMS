<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>พจนานุกรมและโครงสร้างข้อมูล Telemetry ทางอุตสาหกรรม IMS (Ontology)</h1>
  <p><b>มาตรฐานการตั้งชื่อ, หน่วยวัดทางวิศวกรรม, โครงสร้าง JSON Schema และการแมปฐานข้อมูลครอบคลุมทั้ง 4 โดเมนการผลิตและระบบโครงสร้างพื้นฐาน</b></p>
  <p>
    <a href="../../../docs/data/TELEMETRY_ONTOLOGY.md">English</a> |
    <a href="TELEMETRY_ONTOLOGY.md">ไทย</a> |
    <a href="../../../zh-CN/docs/data/TELEMETRY_ONTOLOGY.md">简体中文</a>
  </p>
</div>

---

## 1. มาตรฐานการตั้งชื่อและหน่วยวัดทางฟิสิกส์ (SI Standards)

เพื่อรับประกันการทำงานร่วมกันได้ข้ามระบบ (Interoperability) และลดความกำกวมของข้อมูลจากผู้ผลิตเครื่องจักรหลายค่าย (LDI, เครื่องเจาะ CNC Drilling, สายชุบ VCP Plating และเครื่องแม่ข่ายเซิร์ฟเวอร์) ข้อมูล Telemetry ทั้งหมดที่เข้าสู่ระบบ IMS ต้องปฏิบัติตามมาตรฐานการตั้งชื่อดังต่อไปนี้:

- ชื่อ Metric ต้องใช้ตัวพิมพ์เล็กและตัวเลข คั่นด้วย snake_case (`[a-z0-9_]+`)
- ชื่อ Metric **ต้อง** มี Suffix (คำต่อท้าย) ระบุหน่วยวัดทางวิศวกรรมฟิสิกส์ที่ชัดเจนเสมอ:
  - **อุณหภูมิ (Temperature)**: `*_celsius`
  - **ความดันและแรงดูดสุญญากาศ (Pressure & Vacuum)**: `*_kpa`, `*_bar`
  - **ความเร็วและอัตราการหมุน (Velocity & Speed)**: `*_rpm`, `*_mm_per_sec`, `*_m_per_min`
  - **การสั่นสะเทือนและความเร่ง (Vibration & Acceleration)**: `*_mm_per_sec2`, `*_g`
  - **กระแสไฟฟ้าและความต่างศักย์ (Current & Voltage)**: `*_amp`, `*_volt`, `*_amp_per_dm2`
  - **พลังงานและปริมาณแสง (Energy & Exposure Dosage)**: `*_mj_per_cm2`
  - **มิติเชิงเส้นและระยะคลาดเคลื่อน (Linear Dimensions & Offsets)**: `*_mm`, `*_um`
  - **เวลาและระยะเวลา (Time & Duration)**: `*_sec`, `*_ms`, `*_min`
  - **สถานะการทำงาน (Operational State)**: `*_state` (boolean / integer enum), `*_status` (string token)
  - **ปริมาณเครือข่ายและความจุ (Network & Storage)**: `*_bytes`, `*_octets`, `*_packets`, `*_percent`

---

## 2. โครงสร้าง Telemetry เครื่อง Laser Direct Imaging (LDI)

ข้อมูล Telemetry ความถี่สูง (High-frequency time-series) ส่งจากเครื่องสร้างภาพลวดลายวงจรด้วยเลเซอร์ตรง (Optical Exposure Machines)

- **เส้นทางการรับข้อมูล (Ingestion Path)**: `POST /ldi-telemetry` (ผ่าน Nginx reverse proxy)
- **ตาราง Hypertable ปลายทาง**: `public.ldi_data` (กำหนด chunk interval 1 วัน)

### ตัวอย่าง JSON Ingestion Payload

```json
{
  "time": "2026-09-28T04:00:00Z",
  "factory": "F1",
  "process": "LDI",
  "eqp_id": "LDI-01",
  "mo": "MO-001234",
  "fpn": "PN-5678",
  "layer_name": "L1",
  "resist_dosage": 45.5,
  "scale_x": 1.002,
  "scale_y": 0.998,
  "temperature": 24.5,
  "humidity": 45.0,
  "scan_speed": 120.0,
  "air_vacuum": -15.2,
  "thickness": 1.2,
  "board_no": 1,
  "total_board": 100,
  "total_time": 450.5,
  "state": true,
  "pe_1": 1.1,
  "je_1": 2.2,
  "log_id": "LOG-10001"
}
```

### พจนานุกรมข้อมูลและข้อจำกัด (Data Dictionary & Constraints)

| ชื่อฟิลด์ | ชนิดข้อมูล | ชนิดข้อมูล Postgres | หน่วยทางวิศวกรรม | ช่วงค่าปกติ | คำอธิบาย |
|:----------|:-----------|:--------------------|:-----------------|:------------|:---------|
| `time` | ISO 8601 | `TIMESTAMPTZ` | UTC timestamp | Live time | เวลาที่บันทึกข้อมูล Telemetry |
| `factory` | String | `VARCHAR(16)` | Text ID | `F1` | รหัสโรงงานผลิต |
| `process` | String | `VARCHAR(32)` | Text ID | `LDI`, `DF INNER` | ขั้นตอนกระบวนการผลิต |
| `eqp_id` | String | `VARCHAR(32)` | Equipment ID | `LDI-01`..`LDI-10` | รหัสประจำเครื่องจักร |
| `mo` | String | `VARCHAR(64)` | Work Order | `MO-000001`+ | เลขที่ใบสั่งผลิต (Manufacturing Order) |
| `fpn` | String | `VARCHAR(64)` | Part Number | `PN-0001`+ | รหัสชิ้นส่วนผลิตภัณฑ์ (Factory Part Number) |
| `layer_name`| String | `VARCHAR(32)` | Layer ID | `L1`..`L12` | ชั้นเลเยอร์ของแผ่น PCB |
| `resist_dosage` | Float | `REAL` | $\text{mJ/cm}^2$ | 35.0 - 55.0 | พลังงานแสงในการฉายแสงโฟโตเรซิสต์ |
| `scale_x` | Float | `REAL` | Ratio | 0.995 - 1.005 | อัตราส่วนการขยาย/หดสเกลแกน X |
| `scale_y` | Float | `REAL` | Ratio | 0.995 - 1.005 | อัตราส่วนการขยาย/หดสเกลแกน Y |
| `temperature` | Float | `REAL` | $^\circ\text{C}$ | 22.0 - 26.0 | อุณหภูมิแวดล้อมภายในห้องฉายแสง |
| `humidity` | Float | `REAL` | $\% \text{RH}$ | 40.0 - 55.0 | ความชื้นสัมพัทธ์ในห้องฉายแสง |
| `scan_speed` | Float | `REAL` | $\text{mm/s}$ | 80.0 - 160.0 | ความเร็วการเคลื่อนที่ของหัวฉายแสงเลเซอร์ |
| `air_vacuum` | Float | `REAL` | $\text{kPa}$ | -25.0 - -10.0 | แรงดูดสุญญากาศสำหรับจับยึดแผ่นงาน |
| `thickness` | Float | `REAL` | $\text{mm}$ | 0.4 - 3.2 | ความหนาของแผ่นงาน PCB Core |
| `board_no` | Integer | `INTEGER` | Counter | 1 - 500 | ลำดับแผ่นงานในล็อตการผลิต |
| `total_board`| Integer | `INTEGER` | Count | 10 - 1000 | จำนวนแผ่นงานทั้งหมดในล็อต |
| `total_time` | Float | `REAL` | วินาที | 100.0 - 3600.0| เวลารวมสะสมในการฉายแสงชิ้นงาน |
| `state` | Boolean | `BOOLEAN` | True/False | `true` (running) | สถานะการทำงานของเครื่องจักร |
| `pe_1` | Float | `REAL` | $\mu\text{m}$ | -5.0 - 5.0 | ค่าความคลาดเคลื่อนตำแหน่งแกน (Position Error 1) |
| `je_1` | Float | `REAL` | $\mu\text{m}$ | 0.0 - 4.0 | ค่าความสั่นไหวของลำแสง (Jitter Error 1) |
| `log_id` | String | `VARCHAR(64)` | Unique ID | `LOG-10001`+ | รหัสอ้างอิงบันทึกล็อกสำหรับการติดตามผล |

---

## 3. โครงสร้างข้อมูลเครื่องเจาะแผ่นวงจร CNC (CNC Mechanical Drilling)

ข้อมูลเหตุการณ์, การสึกหรอของดอกสว่าน และการสั่นสะเทือนของหัวสปินเดิลในกลุ่มเครื่องเจาะ CNC

- **ตำแหน่งจัดเก็บข้อมูล**: ฐานข้อมูล `eap_backup` (ตาราง: `public.machine_event`)
- **ชุดสร้างข้อมูลจำลอง**: `scripts/mock/eap-mock-data.js`

### พจนานุกรมค่าตัวชี้วัดและเหตุการณ์ (Operational Metrics & Event Dictionary)

| เมทริก / ฟิลด์ | ชนิดข้อมูล | หน่วยทางวิศวกรรม | ช่วงค่าปกติ | คำอธิบาย |
|:---------------|:-----------|:-----------------|:------------|:---------|
| `machine_id` | String | ตัวอักษรและตัวเลข | `DRL-01`..`DRL-12` | รหัสประจำเครื่องเจาะ |
| `spindle_id` | Integer | รหัสตัวเลข | 1 - 6 | ลำดับหัวสปินเดิลประจำแท่น |
| `spindle_rpm` | Integer | RPM | 15,000 - 200,000 | ความเร็วรอบการหมุนของหัวเจาะ |
| `feed_rate_mm_per_min` | Float | $\text{mm/min}$ | 500 - 3,500 | ความเร็วในการกดดอกสว่านลงแกน Z |
| `vibration_rms_mm_per_sec` | Float | $\text{mm/s}$ | 0.1 - 4.5 | ค่าความสั่นสะเทือน RMS ความถี่สูงของสปินเดิล |
| `hit_count` | Integer | ตัวนับจำนวน | 0 - 3,500 | จำนวนรูเจาะสะสมของดอกสว่านปัจจุบัน |
| `tool_diameter_mm` | Float | $\text{mm}$ | 0.10 - 6.35 | ขนาดเส้นผ่านศูนย์กลางของดอกสว่าน |
| `bearing_temp_celsius` | Float | $^\circ\text{C}$ | 28.0 - 55.0 | อุณหภูมิปลอกลูกปืนหัวเจาะ |
| `motor_load_percent` | Float | $\%$ | 10.0 - 85.0 | โหลดกระแสของมอเตอร์ขับเคลื่อนสปินเดิล |
| `event_code` | String | ตัวอักษรและตัวเลข | `TOOL_CHANGE`, `ALARM` | รหัสการเปลี่ยนสถานะหรือเหตุการณ์เครื่อง |

---

## 4. โครงสร้าง Telemetry สายชุบทองแดงแนวดิ่ง (Vertical Continuous Plating - VCP)

ข้อมูลเซนเซอร์ในบ่อชุบเคมี, ความเร็วสายพานลำเลียง และพารามิเตอร์ทางไฟฟ้าของเรกติไฟเออร์

- **ตำแหน่งจัดเก็บข้อมูล**: ฐานข้อมูล `eap_backup` (ตาราง: `public.vcp_upp`)

### พารามิเตอร์บ่อเคมีและพารามิเตอร์ทางกายภาพ (Chemical Bath & Physical Parameters)

| พารามิเตอร์ | ชนิดข้อมูล | หน่วย | ค่าตามข้อกำหนดมาตรฐาน | คำอธิบาย |
|:------------|:-----------|:------|:----------------------|:---------|
| `line_id` | String | ตัวอักษร | `VCP-01`..`VCP-03` | รหัสสายชุบแนวดิ่งต่อเนื่อง |
| `line_speed_m_per_min` | Float | $\text{m/min}$ | 0.8 - 2.5 | ความเร็วในการลำเลียงชิ้นงานผ่านบ่อ |
| `plating_time_min` | Float | นาที | 20.0 - 60.0 | ระยะเวลาที่แผ่นงานแช่อยู่ในบ่อชุบ |
| `rectifier_current_amp` | Float | แอมแปร์ | 100 - 1,200 | กระแสไฟฟ้าตรงที่จ่ายจากเครื่องแปลงกระแส |
| `current_density_asd` | Float | $\text{A/dm}^2$ | 1.0 - 3.5 | ความหนาแน่นกระแสต่อพื้นที่ผิวสัมผัส |
| `bath_copper_g_per_l` | Float | $\text{g/L}$ | 18.0 - 24.0 | ความเข้มข้นของไอออนทองแดง $\text{Cu}^{2+}$ |
| `bath_acid_g_per_l` | Float | $\text{g/L}$ | 180.0 - 220.0 | ความเข้มข้นของกรดซัลฟิวริก $\text{H}_2\text{SO}_4$ |
| `bath_chloride_ppm` | Float | $\text{ppm}$ | 40 - 80 | ระดับสารเติมแต่งคลอไรด์ไอออน $\text{Cl}^-$ |
| `bath_temp_celsius` | Float | $^\circ\text{C}$ | 22.0 - 28.0 | อุณหภูมิน้ำยาในบ่อชุบเคลือบผิว |
| `dosing_pump_status` | Boolean | True/False | `true` (dosing active) | สถานะการทำงานของปั๊มเติมสารเคมีอัตโนมัติ |

---

## 5. พจนานุกรม SNMP สำหรับโครงสร้างพื้นฐานไอที (Enterprise Infrastructure)

พจนานุกรมการสำรวจ OID ผ่านโปรโตคอล SNMP สำหรับเครื่องแม่ข่าย Linux และสวิตช์เครือข่าย Juniper EX

- **เส้นทางการรับข้อมูล**: สำรวจผ่านโหนด Node-RED bulk SNMP walker (`UDP 161`)
- **ตาราง Hypertables ปลายทาง**: `public.sys_metrics`, `public.net_metrics` (กำหนด chunk interval 1 วัน)

### ข้อมูลเครื่องแม่ข่ายคอมพิวท์ (`sys_metrics`)

| ชื่อเมทริก | SNMP OID | ชนิดข้อมูล | หน่วย | คำอธิบาย |
|:-----------|:---------|:-----------|:------|:---------|
| `sys_cpu_utilization_percent` | `1.3.6.1.4.1.2021.11.11.0` | Gauge | $\%$ (0-100) | ปริมาณการใช้งานหน่วยประมวลผลรวม |
| `sys_mem_total_bytes` | `1.3.6.1.4.1.2021.4.5.0` | Gauge | Bytes | ขนาดหน่วยความจำหลักทางกายภาพทั้งหมด |
| `sys_mem_available_bytes` | `1.3.6.1.4.1.2021.4.6.0` | Gauge | Bytes | ความจุหน่วยความจำที่พร้อมใช้งาน |
| `sys_disk_used_percent` | `1.3.6.1.4.1.2021.9.1.9.1` | Gauge | $\%$ (0-100) | สัดส่วนการใช้งานพื้นที่จัดเก็บบนพาร์ทิชันหลัก |
| `sys_load_1m` | `1.3.6.1.4.1.2021.10.1.3.1` | Gauge | Ratio | อัตราภาระงานเฉลี่ยของระบบใน 1 นาที |

### ข้อมูลสวิตช์เครือข่าย (`net_metrics`)

| ชื่อเมทริก | SNMP MIB | ชนิดข้อมูล | หน่วย | คำอธิบาย |
|:-----------|:---------|:-----------|:------|:---------|
| `if_in_octets` | `IF-MIB::ifHCInOctets` | Counter64 | Bytes (Octets) | ปริมาณข้อมูลเครือข่ายขาเข้าสะสม |
| `if_out_octets` | `IF-MIB::ifHCOutOctets` | Counter64 | Bytes (Octets) | ปริมาณข้อมูลเครือข่ายขาออกสะสม |
| `if_in_errors` | `IF-MIB::ifInErrors` | Counter32 | Packets | จำนวนเฟรมแพ็กเก็ตที่เกิดข้อผิดพลาดขาเข้า |
| `if_out_discards` | `IF-MIB::ifOutDiscards` | Counter32 | Packets | จำนวนแพ็กเก็ตขาออกที่ถูกทิ้งเนื่องจากบัฟเฟอร์เต็ม |
| `if_oper_status` | `IF-MIB::ifOperStatus` | Integer | Enum (1=Up, 2=Down) | สถานะสัญญาณเชื่อมต่อทางกายภาพของอินเทอร์เฟซ |

---

## 6. การแมปการสรุปผลล่วงหน้า TimescaleDB Continuous Aggregates (CAGGs)

เพื่อเพิ่มความเร็วในการสืบค้นข้อมูลย้อนหลังจากแถวข้อมูลนับล้าน ข้อมูลดิบใน Hypertable จะถูกคำนวณสรุปรวมล่วงหน้า:

| ตารางข้อมูลดิบ | มุมมอง Continuous Aggregate | ช่วงเวลาบัคเก็ต (Bucket) | รอบการรีเฟรช | ระยะเวลาเก็บรักษา |
|:---------------|:----------------------------|:-------------------------|:-------------|:-------------------|
| `public.ldi_data` | `public.ldi_data_1m` | 1 นาที | ทุก 1 นาที | 14 วัน |
| `public.ldi_data` | `public.ldi_data_15m` | 15 นาที | ทุก 15 นาที | 90 วัน |
| `public.ldi_data` | `public.ldi_data_1h` | 1 ชั่วโมง | ทุก 1 ชั่วโมง | 2 ปี |
| `public.sys_metrics` | `public.sys_hourly` | 1 ชั่วโมง | ทุก 1 ชั่วโมง | กำหนดได้ตามนโยบาย |
| `public.net_metrics` | `public.net_hourly` | 1 ชั่วโมง | ทุก 1 ชั่วโมง | กำหนดได้ตามนโยบาย |
| `public.ldi_metrics` | `public.ldi_hourly` | 1 ชั่วโมง | ทุก 1 ชั่วโมง | กำหนดได้ตามนโยบาย |

```sql
-- ตัวอย่างคำสั่ง SQL วิเคราะห์ข้อมูลผ่าน Continuous Aggregate 15 นาที
SELECT
  bucket AS "time",
  eqp_id AS machine_id,
  ROUND(avg_temperature::numeric, 2) AS temperature,
  ROUND(avg_scan_speed::numeric, 2) AS scan_speed
FROM public.ldi_data_15m
WHERE eqp_id = 'LDI-01'
  AND bucket > NOW() - INTERVAL '24 hours'
ORDER BY bucket ASC;
```
