<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# IMS — คู่มือผู้ใช้

> **คู่มือการใช้งานสำหรับทีม IT Support และ NOC**
> อธิบายวิธีอ่านแดชบอร์ด ตีความตัวชี้วัด และขั้นตอนตอบสนองต่อการแจ้งเตือน

---

<div align="center">

<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **คู่มือ:** คู่มือผู้ใช้
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **เวอร์ชัน:** 1.2
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **ผู้อ่าน:** IT Support

</div>

---

## สารบัญ

1. [เริ่มต้นใช้งาน](#เริ่มต้นใช้งาน)
2. [คู่มือแดชบอร์ด Grafana](#คู่มือแดชบอร์ด-grafana)
3. [การอ่านตัวชี้วัด](#การอ่านตัวชี้วัด)
4. [ขั้นตอนตอบสนองต่อการแจ้งเตือน](#ขั้นตอนตอบสนองต่อการแจ้งเตือน)
5. [งานประจำที่ใช้บ่อย](#งานประจำที่ใช้บ่อย)
6. [การแก้ไขปัญหา](#การแก้ไขปัญหา)
7. [ข้อมูลอ้างอิงด่วน](#ข้อมูลอ้างอิงด่วน)

---

## เริ่มต้นใช้งาน

### การเข้าใช้ระบบ

ผู้ใช้เข้าถึงทุกอย่างผ่านประตูหน้า nginx ที่พอร์ต 3000 ของเครื่อง IMS ส่วนพอร์ตอื่นด้านล่าง bind ไว้ที่ `127.0.0.1` และใช้ได้เฉพาะผู้ดูแลระบบที่ทำงานบนเครื่อง host เท่านั้น

| บริการ | URL | การเข้าสู่ระบบ |
| --- | --- | --- |
| **แดชบอร์ด Grafana** | `http://<ims-host>:3000/` | บัญชี Grafana ของคุณ (ขอจากผู้ดูแลระบบ) ปิดการสมัครเองและการเข้าแบบไม่ระบุตัวตนไว้ |
| **Factory Twin 3D** | `http://<ims-host>:3000/factory-twin-3d/` | ใช้ session เดียวกับ Grafana |
| **Node-RED editor** | `http://127.0.0.1:1880` (บนเครื่อง host เท่านั้น) | บัญชีผู้ดูแล Node-RED |
| **Prometheus** | `http://127.0.0.1:9090` (บนเครื่อง host เท่านั้น) | — |
| **Alertmanager** | `http://127.0.0.1:9093` (บนเครื่อง host เท่านั้น) | — |

### ภาพรวมแดชบอร์ด

Grafana provision แดชบอร์ดไว้ 22 ชุดในสี่โฟลเดอร์:

```text
 IMS Dashboards
├── 01 · Drilling Operations (กลุ่มเครื่องเจาะ CNC)
│ ├── Fleet Digital Twin & Overview — สถานะสดของเครื่องเจาะทุกเครื่อง: ทำงาน, หยุด, เปลี่ยนดอก, แจ้งเตือน, ออฟไลน์
│ ├── Shift Production & OEE — จำนวน hit กะกลางวันและกลางคืน เวลาออนไลน์และเวลาหยุดรายเครื่อง ย้อนหลัง 7 วัน
│ ├── Machine Investigation — สถานะสด สัดส่วนเหตุการณ์ ไทม์ไลน์เหตุการณ์ และการแจ้งเตือนของดอกสว่าน ของเครื่องเดียว
│ └── Fleet Anomaly & Root Cause — หมวดการแจ้งเตือน เครื่องที่เกิดบ่อยที่สุด แนวโน้มดอกหักและ spindle โหลดเกิน
├── 02 · Lithography Operations — LDI (กลุ่มเครื่อง PCB laser direct imaging)
│ ├── Easy Overview        — ดูภาพรวมทั้งกลุ่มได้ทันที ไม่ต้องตั้งตัวกรอง
│ ├── LDI Manufacturing    — Command Center: KPI ผู้บริหาร + telemetry เครื่อง + สตรีม alarm
│ ├── LDI Operator Andon   — จอ kiosk หน้าไลน์ อ่านอย่างเดียว ไม่ต้องเลื่อนจอที่ 1920×1080 ขึ้นไป
│ ├── LDI Alarm Console    — ขั้นตอน Acknowledge/Resolve แบบโต้ตอบ คู่กับบอร์ด Andon ที่อ่านอย่างเดียว
│ ├── LDI Alarm Response   — MTTA/MTTR จากวงจรชีวิต alarm จริง
│ ├── LDI Alarm Dictionary — ค้นนิยาม alarm ของผู้ผลิตเครื่อง + เหตุการณ์ล่าสุด
│ ├── LDI Engineering Analytics — จัดอันดับ Cpk/SPC, RCA Truth Test, การกระจายของ PE/JE
│ ├── LDI Machine Snapshot — คลิก alarm/log ใดก็ได้เพื่อดูสถานะ ณ มิลลิวินาทีนั้น
│ ├── LDI Factory Digital Twin — แผนผัง Canvas ของเครื่อง LDI ที่ส่งข้อมูล แยกตามโซน
│ └── LDI Data Readiness   — แดชบอร์ดตรวจคุณภาพข้อมูลด้วยตัวเอง (% ความครอบคลุม, ช่องว่าง)
├── 03 · Platform Infrastructure & NOC (เซิร์ฟเวอร์/เครือข่าย)
│ ├── NOC Overview        — ภาพรวมกลุ่มเซิร์ฟเวอร์ (เฉพาะโครงสร้างพื้นฐาน; LDI อยู่ด้านล่าง)
│ ├── Engineering Drill-Down — เจาะลึกรายเซิร์ฟเวอร์: CPU/RAM/disk/อุณหภูมิ/เครือข่าย และ scatter คุณภาพ LDI
│ ├── AIOps & Capacity    — พยากรณ์จำนวนวันจนเต็ม และตรวจจับความผิดปกติด้วย Z-Score
│ ├── Meta-Monitoring     — สุขภาพของไปป์ไลน์เอง (แถว/วินาที, batch สำเร็จ, คิว retry, circuit breaker)
│ └── Ingestion Latency   — ความหน่วงจริงจากต้นทางถึงฐานข้อมูล แบบอ่านอย่างเดียว
└── 04 · Plating Operations (สายการชุบ VCP)
 ├── Fleet Overview & Process Analytics — ชั่วโมงตามสถานะ ค่าเบี่ยงเบนของบ่อและกระแส การปฏิบัติตามสูตรรายล็อต
 ├── Operations Console — สถานะสายแบบสด กระแสและแรงดันรายสถานี อุณหภูมิบ่อ บันทึกการแจ้งเตือน
 └── Real-Time Wall — จอเต็มแสดงสถานะสดของทุกสายสำหรับพื้นที่ชุบ
```

แดชบอร์ดงานเจาะและ VCP อ่านฐานข้อมูล `eap_backup` หากไม่มีข้อมูลโรงงานจะว่างเปล่า ดู [ข้อมูลสังเคราะห์สำหรับงานเจาะและ VCP](../data/MOCK_DATA.md) สำหรับคู่มือการปฏิบัติงานฉบับสมบูรณ์ การถอดรหัสสัญญาณโทรมาตร ตาราง OCAP และคำอธิบายแดชบอร์ดทั้ง 4 ชุดของแผนกเจาะ CNC โปรดดูที่ [คู่มือการใช้งานและวิเคราะห์ระบบเจาะ CNC (Drilling Operations Manual)](DRILLING_USER_MANUAL.md)

รายการฉบับเต็มที่สร้างอัตโนมัติพร้อมจำนวน panel อยู่ที่ [Dashboard Inventory](../architecture/DASHBOARD_INVENTORY.md)

---

## คู่มือแดชบอร์ด Grafana

### 1. แดชบอร์ด NOC Overview

**วัตถุประสงค์**: ภาพรวมระดับสูงสำหรับผู้บริหารและทีม NOC

![IMS NOC Overview Dashboard](../../../assets/noc-overview.png)

### 2. ตัวชี้วัดสุขภาพเซิร์ฟเวอร์ (NOC Overview / Engineering Drill-Down)

**วัตถุประสงค์**: ภาพรวมสุขภาพของเซิร์ฟเวอร์ทั้งหมด panel กลุ่มนี้กระจายอยู่ใน **NOC Overview** (ภาพรวมทั้งกลุ่ม) และ **Engineering Drill-Down** (รายเซิร์ฟเวอร์) ไม่ได้เป็นแดชบอร์ดแยก

| Panel | ตัวชี้วัด | แถบสีบน panel |
| --- | --- | --- |
| **CPU Load** | `cpu_load_percent` | เขียว < 80 %, เหลืองอำพัน 80–90 %, แดง ≥ 90 % |
| **RAM Usage / Saturation** | `ram_used_mb / ram_total_mb` | เขียว < 85 %, เหลืองอำพัน 85–95 %, แดง ≥ 95 % |
| **Storage Saturation** | `disk_used_gb / disk_total_gb` | เขียว < 80 %, เหลืองอำพัน 80–90 %, แดง ≥ 90 % |
| **Network Bandwidth** | `rx_mbps`, `tx_mbps` ราย interface | เส้นแนวโน้ม ไม่มีแถบสี |
| **Temperature** | `temp_c` | เขียว 20–24 °C, เหลืองอำพันเมื่อเกินช่วงนั้นไม่เกิน 1 °C, แดงเมื่อต่ำกว่า 19 °C หรือตั้งแต่ 25 °C |

### 3. แดชบอร์ด Engineering Drill-Down

**วัตถุประสงค์**: วิเคราะห์เจาะลึกรายเซิร์ฟเวอร์สำหรับวิศวกร

![Engineering Drilldown Dashboard](../../../assets/engineering-drilldown.png)

**LDI Quality Scatter — โซนค่าเผื่อ:**

scatter แสดง PE เทียบกับ JE รายนาที (µm) พร้อมแถบค่าเผื่อ ±10 µm:

| โซน | สี | ความหมาย |
| --- | --- | --- |
| อยู่ใน ±10 µm | แถบสีเขียว | ปกติ — หัวเลเซอร์อยู่ในค่าเผื่อ |
| นอก ±10 µm | อยู่นอกแถบ | เสี่ยงต่อคุณภาพ — ตรวจหัวเลเซอร์ |

**วิธีใช้:**

- จุดที่อยู่ในแถบสีเขียวหมายถึงคุณภาพ PCB อยู่ในค่าเผื่อที่ยอมรับได้
- จุดที่หลุดออกนอกแถบต้องตรวจหัวเลเซอร์
- เทียบกับ panel **LDI Scan Speed & Position Error** เพื่อดูว่าความเร็วสแกนหรือค่าความคลาดเคลื่อนของตำแหน่งเปลี่ยนไปในช่วงเดียวกันหรือไม่

### 4. แดชบอร์ด AIOps & Capacity

**วัตถุประสงค์**: พยากรณ์ความจุทรัพยากรเพื่อวางแผนโครงสร้างพื้นฐาน

| Panel | สิ่งที่แสดง | ใช้ทำอะไร |
| --- | --- | --- |
| **Days Until Full (Resource Battery)** | จำนวนวันที่เหลือของ disk, RAM และ CPU ตามแนวโน้มปัจจุบัน | จัดลำดับการอัปเกรด |
| **Disk Usage Trend + Linear Regression Forecast** | วันที่คาดว่าดิสก์จะเต็ม | วางแผนขยายพื้นที่จัดเก็บ |
| **CPU / RAM Load Trend (เฉลี่ย 30 วัน)** | แนวโน้มการใช้งานระยะยาว | วางแผนอัปเกรดเซิร์ฟเวอร์และ RAM |
| **CPU / Temperature Z-Score Anomaly (3σ)** | ค่าที่เบี่ยงเกินสามส่วนเบี่ยงเบนมาตรฐาน | สังเกตพฤติกรรมผิดปกติได้เร็ว |

### 5. แดชบอร์ด Easy Overview

**วัตถุประสงค์**: ดูภาพรวมกลุ่มเครื่อง LDI ทั้งหมดได้ทันทีโดยไม่ต้องตั้งค่า — ไม่มี template variable ไม่มีตัวกรอง ทุกอย่างแสดงทันทีที่เปิด

ตัวชี้วัดทุกตัวในแดชบอร์ดนี้มาจาก view และฟังก์ชันชุดเดียวกับที่แดชบอร์ดอื่นใช้ (`v_ldi_machine_latest_full`, `v_ldi_alarm_context`, `f_ldi_yield_pct`, `v_machine_spc_fleet`) ตัวเลขจึงตรงกับส่วนอื่นของระบบ ไม่มี query แยกเฉพาะกิจ

### 6. LDI Manufacturing Command Center

**วัตถุประสงค์**: แดชบอร์ดปฏิบัติการหลักของไลน์ LDI จัดเป็นมุมมอง RCA 4 ชั้น

| ชั้น | เนื้อหา |
| --- | --- |
| **Executive HUD** | Yield %, จำนวนเครื่องที่ทำงาน, สถานะกลุ่มเครื่อง, Cpk เฉลี่ย, Fleet Availability, Critical Alarms |
| **Machine Telemetry** | การผ่านเกณฑ์อุณหภูมิ/ความชื้น, Scan Speed/Air Vacuum, Thickness/Resist Dosage, Scale X/Y |
| **Production Context** | ตารางการผลิตสด (Machine/Job/Part/Layer/Progress), Board Traceability, เวลาที่คำนวณต่อบอร์ด |
| **Alarm Stream** | เหตุการณ์ alarm ล่าสุด (50 รายการ), alarm ที่สัมพันธ์กันมากที่สุด (24 ชม., RCA) |

แถวเจาะลึก (Production & Compliance, Process Metrics, Analytics & SPC, System Alarms, RCA Fleet Summary, Cycle Time & Traceability) ถูกยุบไว้โดยค่าเริ่มต้น — คลิกหัวแถวเพื่อขยาย มุมมองแรกจึงเห็นเฉพาะแถบ KPI ผู้บริหาร

### 7. LDI Operator Andon Board

**วัตถุประสงค์**: จอ kiosk หน้าไลน์ตามแนวทาง ISA-101 ไม่ต้องสัมผัสและอ่านอย่างเดียว ความละเอียดที่รองรับคือ **1920×1080 ขึ้นไป** ซึ่งบอร์ดแสดงได้พอดีโดยไม่ต้องเลื่อน ไม่รองรับ 1280×720 (เลย์เอาต์ล้นจอ)

แสดง Fleet Availability, Active Critical/Major Alarms, Environmental Compliance, Machines Running, ไทล์สถานะรายเครื่อง, pipeline heartbeat, ไทม์ไลน์การผ่านเกณฑ์อุณหภูมิ (22 ± 2 °C) และความชื้น (55 ± 5 %) และ **Action Queue** ของ alarm ระดับ Critical/Major ใน 5 นาทีล่าสุด การ Acknowledge และ Resolve ทำบน **LDI Alarm Console** ไม่ใช่บนบอร์ด Andon

### 8. LDI Engineering Analytics & SPC

**วัตถุประสงค์**: วิเคราะห์เชิงลึกสำหรับวิศวกร — จัดอันดับ Cpk/SPC, RCA Truth Test และการกระจายของ PE/JE

| ส่วน | เนื้อหา |
| --- | --- |
| **Environmental** | อุณหภูมิเทียบความชื้น ซิงก์กันทุกเครื่อง |
| **SPC Control Charts** | control chart ของ Thickness (ค่าเฉลี่ย ± 3σ), control chart ของ Scale X/Y |
| **Variation Analysis** | ส่วนเบี่ยงเบนมาตรฐานของ PE/JE รายเครื่อง, การกระจายความคลาดเคลื่อนของ PE/JE (box plot) |
| **RCA / Alarm Correlation** | RCA Truth Test — Lift/Confidence แยกตามหมวด alarm (Thermal/Humidity/Vacuum/อื่น ๆ) |

### 9. LDI Machine Snapshot

**วัตถุประสงค์**: ดูสถานะเครื่องระดับมิลลิวินาที เปิดได้โดยคลิกจาก Process Timeline หรือจากตาราง alarm และ log บนแดชบอร์ดอื่น

แสดงบริบทของงาน ตัวแปรทางกายภาพ การจัดแนว PE, Cpk และ alarm ที่เกิดใกล้กับเหตุการณ์ที่เลือก — ออกแบบมาเพื่อสืบสวนเหตุการณ์เฉพาะจุด ไม่ใช่ดูภาพรวม

### 10. LDI Data Readiness

**วัตถุประสงค์**: แดชบอร์ดตรวจคุณภาพข้อมูลด้วยตัวเอง อ่านเฉพาะแถวจริงใน PostgreSQL ไม่มีข้อมูลจำลอง

ใช้ตรวจ board key ที่ซ้ำ ตรวจ % ความครอบคลุม และยืนยันอัตราการจับคู่กับ alarm master ก่อนเชื่อตัวเลขบนแดชบอร์ดหลัก

### 11. Alarm Console, Alarm Response และ Alarm Dictionary

- **Alarm Console** — แดชบอร์ดเดียวที่โต้ตอบได้: Acknowledge และ Resolve เขียนสถานะจริงลง `public.ldi_alarm_lifecycle` ผ่าน `alarm-api`
- **Alarm Response (MTTA/MTTR)** — ความเร็วในการ acknowledge และ resolve alarm คำนวณจากตาราง lifecycle ดังกล่าว
- **Alarm Dictionary** — นิยามของรหัส alarm จากผู้ผลิตเครื่องพร้อมเหตุการณ์ล่าสุด เปิดได้จากลิงก์ Alarm Code บนแดชบอร์ดอื่น

---

## การอ่านตัวชี้วัด

### ตัวชี้วัด CPU

| ตัวชี้วัด | หน่วย | สีบน panel | กฎการแจ้งเตือน |
| --- | --- | --- | --- |
| `cpu_load_percent` | % | เขียว < 80, เหลืองอำพัน 80–90, แดง ≥ 90 | **High CPU Usage** — ค่าเฉลี่ย 5 นาที > 85 % นาน 5 นาที (warning) |
| `cpu_cores` | จำนวน | — | — |

**วิธีใช้:**

- **Average CPU** — ค่าเฉลี่ยทุก core ในช่วงเวลาที่เลือก
- **Peak CPU** — ค่าสูงสุดที่บันทึกได้ (อาจเป็นการพุ่งชั่วขณะ)
- **CPU per core** — บอกว่า core ใดรับภาระ

**ตัวอย่าง:**

```text
Machine: server-01
CPU Load: 86% (amber band, High CPU Usage alert pending)
├── Core 1: 95%
├── Core 2: 70%
├── Core 3: 88%
└── Core 4: 91%
→ Cores 1, 3 and 4 are under heavy load; investigate running processes.
```

### ตัวชี้วัดหน่วยความจำ

| ตัวชี้วัด | หน่วย | สีบน panel | กฎการแจ้งเตือน |
| --- | --- | --- | --- |
| `ram_used_mb` | MB | — | — |
| `ram_total_mb` | MB | — | — |
| **Usage %** | % | เขียว < 85, เหลืองอำพัน 85–95, แดง ≥ 95 | **High RAM Usage** — > 90 % นาน 5 นาที (warning) |

**วิธีใช้:**

- **Usage %** = `(ram_used_mb / ram_total_mb) × 100`
- **Available** = `ram_total_mb - ram_used_mb`
- การใช้หน่วยความจำสูงไม่ใช่ปัญหาในตัวเอง — Linux ใช้หน่วยความจำว่างเป็น cache

### ตัวชี้วัดเครือข่าย

| ตัวชี้วัด | หน่วย | คำอธิบาย |
| --- | --- | --- |
| `rx_mbps` | Mbps | ทราฟฟิกขาเข้า |
| `tx_mbps` | Mbps | ทราฟฟิกขาออก |
| `net_rx_errors` | จำนวน | ข้อผิดพลาดขารับ (ปัญหาฮาร์ดแวร์/ไดรเวอร์) |
| `net_rx_drops` | จำนวน | แพ็กเก็ตที่ถูกทิ้ง (บัฟเฟอร์ล้น) |
| `net_if_status` | 1/2 | 1 = UP, 2 = DOWN |

**วิธีใช้:**

- **การใช้แบนด์วิดท์** = `(rx_mbps / link_speed) × 100`
- **อัตราข้อผิดพลาด** = `net_rx_errors / total_packets × 100`
- **Interface DOWN** = สายหลุดหรือพอร์ตสวิตช์ถูกปิด กฎการแจ้งเตือนที่เกี่ยวข้อง: **Interface Down** (critical), **High Network Error Rate** (warning), **Network Packet Drops** (critical), **Bandwidth Saturation Forecast** (warning)

**ตัวอย่าง:**

**เครื่อง:** `server-01`

| Interface | RX Mbps | TX Mbps | Errors | Drops | Status |
| --- | --- | --- | --- | --- | --- |
| eth0 | 1200 | 850 | 0 | 0 | UP |
| wlan0 | 320 | 180 | 0 | 12 | UP |

→ *wlan0 มีแพ็กเก็ตถูกทิ้ง 12 แพ็กเก็ต — ตรวจสัญญาณไร้สาย*

### ตัวชี้วัดดิสก์

| ตัวชี้วัด | หน่วย | สีบน panel | กฎการแจ้งเตือน |
| --- | --- | --- | --- |
| `disk_used_gb` | GB | — | — |
| `disk_total_gb` | GB | — | — |
| **Usage %** | % | เขียว < 80, เหลืองอำพัน 80–90, แดง ≥ 90 | **High Disk Usage** — > 90 % นาน 10 นาที (critical) |

**วิธีใช้:**

- **Usage %** = `(disk_used_gb / disk_total_gb) × 100`
- **พื้นที่ว่าง** = `disk_total_gb - disk_used_gb`

### ตัวชี้วัดอุณหภูมิ

| ตัวชี้วัด | หน่วย | สีบน panel | กฎการแจ้งเตือน |
| --- | --- | --- | --- |
| `temp_c` | °C | เขียว 20–24, เหลืองอำพันเมื่อเกินช่วงไม่เกิน 1 °C, แดง < 19 หรือ ≥ 25 | **High Temperature** — ค่าสูงสุด > 80 °C นาน 5 นาที (critical) |

**วิธีใช้:**

- **อุณหภูมิเฉลี่ย** — ค่าเฉลี่ยของค่าที่อ่านได้
- **อุณหภูมิสูงสุด** — ค่าสูงสุดที่บันทึกได้
- **Z-Score anomaly** — แถว AIOps จะแสดงค่าที่ห่างจาก baseline ล่าสุดเกิน 3σ (**Temperature Z-Score Anomaly**, warning)

---

## ขั้นตอนตอบสนองต่อการแจ้งเตือน

### ระดับความรุนแรงของการแจ้งเตือน

กฎการแจ้งเตือนอยู่สองแห่ง: กฎที่ Grafana จัดการสำหรับเงื่อนไขของเครื่องและ LDI (`monitoring/grafana/provisioning/alerting/`) และกฎของ Prometheus สำหรับตัวแพลตฟอร์มเอง (`monitoring/prometheus/rules/ims-alerts.yml`)

| ระดับ | สี | เวลาตอบสนองเป้าหมาย | ตัวอย่าง |
| --- | --- | --- | --- |
| **Critical** | แดง | ทันที (< 15 นาที) | Interface Down, High Disk Usage, High Temperature, LDI Machine Offline (Stale), `ServiceDown`, `PipelineDataStalled` |
| **Warning** | เหลืองอำพัน | เร่งด่วน (< 1 ชั่วโมง) | High CPU Usage, High RAM Usage, Z-Score anomalies, `PipelineHighErrorRate`, `CircuitBreakerOpen` |

### Playbook การตอบสนองต่อเหตุการณ์

ขั้นตอนในกล่องคำสั่งด้านล่างคงไว้เป็นภาษาอังกฤษเพื่อให้ตรงกับชื่อ alert และคำสั่งที่พิมพ์จริง

#### สถานการณ์ที่ 1: Interface Down (Critical)

```text
Symptoms:
- Alert: Interface Down on server-01
- Network panels show "No Data"
- Other machines still reporting

Investigation Steps:
1. SSH to server-01 → check network cable
2. Check switch port status
3. Run: ip link show eth0
4. Check if interface is UP

Resolution:
- Reseat network cable
- Check switch configuration
- Restart network service: systemctl restart networking
- Verify: ping gateway

Escalation:
- If physical cable is fine → contact network team
- If switch port is down → contact data center team
```

#### สถานการณ์ที่ 2: High CPU Usage (Warning)

```text
Symptoms:
- Alert: High CPU Usage on server-01
- CPU panels showing > 85%
- System may be slow

Investigation Steps:
1. SSH to server-01
2. Run: top -bn1 | head -20
3. Identify top CPU-consuming processes
4. Check if scheduled job is running

Resolution:
- If legitimate workload → monitor, no action needed
- If rogue process → kill or renice
- If OOM → add swap or increase RAM

Escalation:
- If persistent > 1 hour → check with application team
- If affecting other services → consider scaling
```

#### สถานการณ์ที่ 3: High Disk Usage (Critical)

```text
Symptoms:
- Alert: High Disk Usage on server-01
- Disk panels showing > 90%

Investigation Steps:
1. SSH to server-01
2. Run: df -h
3. Run: du -sh /* | sort -rh | head -10
4. Identify large files/directories

Resolution:
- Clean logs: journalctl --vacuum-size=500M
- Remove old backups: find /backup -mtime +30 -delete
- Compress large files: gzip largefile.log
- Archive to cold storage

Escalation:
- If disk usage continues → plan storage expansion
- If critical (> 95%) → immediate cleanup required
```

#### สถานการณ์ที่ 4: ServiceDown (Critical)

```text
Symptoms:
- Alert: ServiceDown on server-01
- Blackbox probe failing
- Application may be unreachable

Investigation Steps:
1. Check service status: systemctl status <service>
2. Check service logs: journalctl -u <service> -n 50
3. Check port binding: ss -tlnp | grep <port>
4. Check firewall: iptables -L -n

Resolution:
- Restart service: systemctl restart <service>
- Check configuration: <service> -t (test config)
- Verify firewall rules
- Check dependent services

Escalation:
- If service won't start → check application logs
- If port conflict → identify conflicting process
- If system-level issue → contact system admin
```

#### สถานการณ์ที่ 5: PipelineDataStalled (Critical)

```text
Symptoms:
- Alert: PipelineDataStalled (named TelemetryGap in older documents)
- No successful database inserts for 3+ minutes
- Dashboards stop updating for every machine

Investigation Steps:
1. Check Node-RED logs: docker compose logs --tail=50 node-red
2. Check PgBouncer and TimescaleDB: docker compose ps pgbouncer timescaledb
3. Check the SNMP simulator (demo stacks): docker compose ps snmpsim
4. Check that the device is registered in public.devices

Resolution:
- If snmpsim down → docker compose restart snmpsim
- If Node-RED error → check flow JSON syntax
- If machine not in registry → add it to public.devices

Escalation:
- If persistent → check SNMP community string
- If new machine → verify MIB compatibility
```

---

## งานประจำที่ใช้บ่อย

### ตรวจสถานะระบบ

```bash
# ดูคอนเทนเนอร์ทั้งหมด
docker compose ps

# ดู log ของ Node-RED
docker compose logs --tail=20 node-red

# ดู target ของ Prometheus
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/targets"

# ดูการแจ้งเตือนที่ active
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/alerts"
```

### Query ฐานข้อมูลโดยตรง

```bash
# telemetry ล่าสุด (5 นาทีที่ผ่านมา)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, time, cpu_load_percent, temp_c
 FROM public.sys_metrics
 WHERE time > NOW() - INTERVAL '5 minutes'
 ORDER BY time DESC LIMIT 10;"

# ดูตัวชี้วัดของ interface
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, iface_name, rx_mbps, tx_mbps
 FROM public.net_metrics
 ORDER BY time DESC LIMIT 1;"
```

### รีสตาร์ต Service

```bash
# รีสตาร์ต Node-RED (หลังแก้ flow)
docker compose restart node-red

# reload กฎของ Prometheus โดยไม่รีสตาร์ต (อ่าน Admin Manual ก่อน)
curl -X POST http://localhost:9090/-/reload

# รีสตาร์ต service หลัก (ข้อมูลไม่หาย)
make restart
```

---

## การแก้ไขปัญหา

### ปัญหาที่พบบ่อย

| อาการ | สาเหตุที่เป็นไปได้ | วิธีแก้ |
| --- | --- | --- |
| **"No Data" ทุก panel** | Node-RED หรือ PgBouncer ไม่ทำงาน | `docker compose restart node-red pgbouncer` |
| **"No Data" เฉพาะบางเครื่อง** | เครื่องไม่อยู่ในทะเบียน | เพิ่มลงใน `public.devices` (ดู Admin Manual) |
| **Alertmanager รีสตาร์ตซ้ำ** | YAML ของการตั้งค่ามี syntax ผิด | ดู `docker compose logs alertmanager` |
| **blackbox target ทั้งหมด DOWN** | ชื่อ service ในการตั้งค่าผิด | ใช้ `blackbox-exporter:9115` |
| **Grafana แสดงข้อมูลเก่า** | แดชบอร์ดยังไม่ refresh | refresh แบบเต็ม: Ctrl+Shift+R |
| **ใช้หน่วยความจำสูง** | หน่วยความจำของ Node-RED เพิ่มขึ้นเรื่อย ๆ | ดู `docker stats ims-node-red` |
| **ฐานข้อมูลปฏิเสธการเชื่อมต่อ** | PgBouncer ล่ม | `docker compose restart pgbouncer` |

### ตำแหน่ง Log

| Service | คำสั่ง | สิ่งที่ต้องมองหา |
| --- | --- | --- |
| **Node-RED** | `docker compose logs node-red` | `Started flows`, `TypeError`, `ETIMEOUT` |
| **TimescaleDB** | `docker compose logs timescaledb` | `connection refused`, `authentication failed` |
| **Prometheus** | `docker compose logs prometheus` | `failed to check config`, `target down` |
| **Alertmanager** | `docker compose logs alertmanager` | `Loading configuration file failed` |
| **Grafana** | `docker compose logs grafana` | `Failed to look up user`, `dashboard not found` |
| **ประตูหน้า nginx** | `docker compose logs proxy` | `502`, `upstream`, `auth_request` |

### สคริปต์วินิจฉัยด่วน

```bash
# รันการตรวจสุขภาพทั้งหมดในครั้งเดียว
echo "=== Containers ==="
docker compose ps --format "table {{.Name}}\t{{.Status}}"

echo "=== Data Flow ==="
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(time) as latest
 FROM public.sys_metrics
 WHERE time > NOW() - INTERVAL '5 minutes'
 GROUP BY device_id;"

echo "=== Alerts ==="
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/alerts" 2>&1 | \
 python -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"data\"][\"alerts\"])} active alerts')"
```

---

## ข้อมูลอ้างอิงด่วน

### คีย์ลัด (Grafana)

กด `?` ใน Grafana เพื่อดูรายการทั้งหมดของเวอร์ชันที่ใช้อยู่

| คีย์ลัด | การทำงาน |
| --- | --- |
| `?` | แสดงคีย์ลัดทั้งหมด |
| `Ctrl+K` / `Cmd+K` | ค้นหาและ command palette |
| `Ctrl+S` | บันทึกแดชบอร์ด (เฉพาะผู้มีสิทธิ์แก้ไข) |
| `d r` | refresh ทุก panel |
| `d k` | สลับโหมด kiosk |
| `t z` | ขยายช่วงเวลาออก (zoom out) |
| `Esc` | ออกจากมุมมอง panel หรือปิดแถบด้านข้าง |

### ความหมายของสี

| สถานะ | สี | Token |
| --- | --- | --- |
| ปกติ | เขียว | `#22C55E` |
| เตือน | เหลืองอำพัน | `#F59E0B` |
| วิกฤต | แดง | `#EF4444` |

panel แสดงค่าตัวเลขคู่กับสี จึงอ่านสถานะได้โดยไม่ต้องพึ่งสีเพียงอย่างเดียว

### ช่องทางการแจ้งเตือน

| ผู้รับ | ช่องทาง | การส่ง |
| --- | --- | --- |
| **ทีม NOC** | กลุ่ม LINE | LINE Messaging API (ต้องกำหนด `LINE_CHANNEL_ACCESS_TOKEN` และ `LINE_USER_ID`) |
| **ผู้ดูแลระบบ** | Microsoft Teams | Incoming webhook (ต้องกำหนด `TEAMS_WEBHOOK_URL`) |
| **ผู้บริหาร** | อีเมล | ยังไม่ได้ตั้งค่า |

---

<div align="center">

**IMS User Manual — เวอร์ชัน 1.2 (ตรวจทานเทียบกับ `main` เมื่อ 2026-09-26)**

_สำหรับทีม IT Support และ NOC_

</div>
