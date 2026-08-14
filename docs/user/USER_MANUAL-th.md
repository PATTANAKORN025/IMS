# IMS — คู่มือผู้ใช้

> **คู่มือการใช้งานสำหรับ IT Support และ NOC Team**
> อธิบายวิธีอ่าน Dashboard, ตีความ metrics, และตอบสนองต่อ alerts

---

<div align="center">

![Manual](https://img.shields.io/badge/Manual-คู่มือผู้ใช้-green)
![Version](https://img.shields.io/badge/Version-1.1-blue)
![Audience](https://img.shields.io/badge/Audience-IT%20Support-purple)

</div>

---

## สารบัญ

1. [เริ่มต้นใช้งาน](#-เริ่มต้นใช้งาน)
2. [คู่มือ Grafana Dashboard](#-คู่มือ-grafana-dashboard)
3. [การอ่านค่า Metrics](#-การอ่านค่า-metrics)
4. [ขั้นตอนการตอบสนองต่อการแจ้งเตือน (Alerts)](#-ขั้นตอนการตอบสนองต่อการแจ้งเตือน-alerts)
5. [การทำงานทั่วไป](#-การทำงานทั่วไป)
6. [การแก้ไขปัญหา (Troubleshooting)](#-การแก้ไขปัญหา-troubleshooting)
7. [อ้างอิงด่วน](#-อ้างอิงด่วน)

---

## เริ่มต้นใช้งาน

### การเข้าถึงระบบ

| บริการ | URL | ข้อมูลการเข้าสู่ระบบ |
|---|---|---|
| **Grafana Dashboard** | `http://localhost:3000` | admin / admin |
| **Node-RED Editor** | `http://localhost:1880` | (ตามที่ตั้งค่าไว้) |
| **Prometheus** | `http://localhost:9090` | — |
| **Alertmanager** | `http://localhost:9093` | — |

### ภาพรวม Dashboard

เมื่อเข้าสู่ Grafana แล้ว จะพบ 12 dashboards:

```
 IMS Dashboards
├── Infrastructure (เซิร์ฟเวอร์/เครือข่าย)
│  ├── NOC Overview      — ภาพรวมระดับบริหารสำหรับ fleet (เฉพาะ infra -- LDI อยู่ด้านล่าง)
│  ├── Engineering Drill-Down — เจาะลึกระดับเซิร์ฟเวอร์: CPU/RAM/ดิสก์/ความร้อน/เครือข่าย
│  ├── Capacity Planning    — พยากรณ์เชิงเส้น (จำนวนวันก่อนที่ดิสก์/RAM จะเต็ม)
│  └── Meta-Monitoring     — สุขภาพของตัวไปป์ไลน์เอง (แถว/วินาที, ความสำเร็จของ batch, คิวการส่งซ้ำ)
└── LDI Manufacturing (เครื่องฉายแสง PCB เลเซอร์ LDI)
  ├── Easy Overview      — ภาพรวม fleet แบบไม่ต้องตั้งค่า ไม่ต้องตั้งตัวกรอง
  ├── LDI Manufacturing    — KPI ระดับผู้บริหาร + telemetry เครื่อง + แถบการแจ้งเตือน (ศูนย์ควบคุมหลัก)
  ├── LDI Operator Andon   — จอตั้งพื้นหน้างาน, 1280x720, ไม่มีการเลื่อนหน้าจอ, ดูได้อย่างเดียว (ไม่มีส่วนอินเทอร์แอคทีฟ)
  ├── LDI Alarm Console    — กระบวนการรับทราบ/แก้ไขปัญหา เป็นส่วนเสริมของจอ Andon ที่ดูได้อย่างเดียว
  ├── LDI Alarm Dictionary  — คู่มืออ้างอิง: ความหมายการแจ้งเตือนของผู้ผลิตฉบับเต็ม + เหตุการณ์ล่าสุด
  ├── LDI Engineering Analytics — จัดอันดับ Cpk/SPC, ทดสอบสาเหตุที่แท้จริง, การกระจายตัวของ PE/JE
  ├── LDI Machine Snapshot  — คลิกที่การแจ้งเตือน/บันทึก เพื่อดูข้อมูล ณ เสี้ยววินาทีนั้น
  └── LDI Data Readiness   — แดชบอร์ดตรวจสอบคุณภาพข้อมูลด้วยตัวเอง (เปอร์เซ็นต์ความครอบคลุม, ช่องโหว่)
```

---

## คู่มือ Grafana Dashboard

### 1. NOC Overview Dashboard

**จุดประสงค์**: ภาพรวมสำหรับผู้บริหารและ NOC team

```
┌─────────────────────────────────────────────────────────────────┐
│  IMS NOC Overview                      │
├─────────────────────────────────────────────────────────────────┤
│                                 │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│ │ ทั้งหมด    │ │ ปกติ     │ │ เตือน     │ │ วิกฤต    │ │
│ │ เครื่อง: 5   │ │ เครื่อง: 4   │ │ แจ้งเตือน: 1  │ │ แจ้งเตือน: 0  │ │
│ │  ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen)    │ │  ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen)    │ │  ![Warning](https://img.shields.io/badge/Status-Warning-yellow)    │ │     │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ การใช้งาน CPU ของ Fleet (1 ชั่วโมงล่าสุด)             │ │
│ │ [กราฟเส้นแสดง CPU ของทุกเครื่องตามเวลา]            │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ การแจ้งเตือนที่ทำงานอยู่                    │ │
│ │ [ตารางแสดงการแจ้งเตือนที่เกิดพร้อมความรุนแรง]         │ │
│ └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2. ตัวชี้วัดสถานะเซิร์ฟเวอร์ (NOC Overview / Engineering Drill-Down)

**จุดประสงค์**: ภาพรวม health ของ servers ทั้งหมด — panel ประเภทนี้กระจายอยู่บน **NOC Overview** (fleet envelope) และ **Engineering Drill-Down** (per-server deep dive), ไม่ใช่ dashboard แยกต่างหาก

| Panel | ตัวชี้วัด (Metrics) | การใช้สี |
|---|---|---|
| **CPU Usage** | `cpu_load_percent` ต่อ core | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) < 60%, ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 60-80%, > 80% |
| **Memory Usage** | `ram_used_mb / ram_total_mb` | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) < 70%, ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 70-85%, > 85% |
| **Disk Usage** | `disk_used_gb / disk_total_gb` | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) < 70%, ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 70-80%, > 80% |
| **Network Traffic** | `rx_mbps`, `tx_mbps` ต่อ interface | สีน้ำเงิน = ดาวน์โหลด (RX), สีฟ้า = อัปโหลด (TX) |
| **Temperature** | `temp_c` | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) < 65°C, ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 65-80°C, > 80°C |

### 3. Engineering Drilldown Dashboard

**จุดประสงค์**: Deep dive สำหรับ engineer แต่ละเครื่อง

```
┌─────────────────────────────────────────────────────────────────┐
│  Engineering Drilldown — [เลือกเครื่อง ▼]            │
├─────────────────────────────────────────────────────────────────┤
│                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ การรับส่งข้อมูลผ่านเครือข่าย (แบบผีเสื้อสมมาตร)           │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │   ▲ eth0 RX: ████████████ 2.4 Gbps        │ │ │
│ │ │   │ wlan0 RX: ██████ 800 Mbps           │ │ │
│ │ │ ───┼────────────────────────────────── 0 Mbps   │ │ │
│ │ │   │ wlan0 TX: ████ 400 Mbps            │ │ │
│ │ │   ▼ eth0 TX: ████████ 1.6 Gbps          │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                 │
│ ┌──────────────────────┐ ┌──────────────────────────────────┐ │
│ │ อุณหภูมิ CPU      │ │ การใช้งานดิสก์           │ │
│ │ [มาตรวัด: 72°C]    │ │ [แท่ง: /dev/sda1 45%, sdb1 62%] │ │
│ └──────────────────────┘ └──────────────────────────────────┘ │
│                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ คุณภาพ LDI แบบกระจาย (PE เทียบกับ JE)             │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ PE (µm)                      │ │ │
│ │ │  15 ┤     ╱ กล่องเกณฑ์ความคลาดเคลื่อน        │ │ │
│ │ │   │ · · ╱· · ·                │ │ │
│ │ │  0 ┤──╱────────────────── 0            │ │ │
│ │ │   │ ╱· · · ·                  │ │ │
│ │ │ -15 ┤╱     (โซนสีเขียว ±10µm)           │ │ │
│ │ │   └─┬────┬────┬────┬────┬─           │ │ │
│ │ │    -15  -5  0  5  15 JE (µm)       │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ LDI Manufacturing Telemetry               │ │
│ │ ผลผลิต: 1250 units/hr | PE: 0.85 | JE: 0.92        │ │
│ │ ความชื้น: 65% | พลังงาน: 2400W | การสั่นสะเทือน: 2.1 mm/s  │ │
│ └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**กล่องเกณฑ์ความคลาดเคลื่อนแบบกระจายของ LDI:**

กราฟ Scatter Plot แสดง PE (Position Error) vs JE (Judgment Error) ในหน่วย µm:

| โซน | สี | ความหมาย |
|---|---|---|
| ภายใน ±10µm | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) เขียว | ปกติ — หัวเลเซอร์ทำงานถูกต้อง |
| ภายนอก ±10µm | แดง | ผิดปกติ — หัวเลเซอร์เริ่มมีปัญหา |

**วิธีใช้:**
- จุดที่อยู่ในกรอบสีเขียว = คุณภาพ PCB อยู่ในเกณฑ์
- จุดที่กระโดดออกนอกกรอบสีแดง = ต้องตรวจสอบหัวเลเซอร์ทันที
- ใช้คู่กับ **LDI Throughput** panel เพื่อดูว่า production rate ยังปกติหรือไม่

### 4. แดชบอร์ดการวางแผนความจุ (Capacity Planning)

**จุดประสงค์**: การพยากรณ์สำหรับการวางแผนทรัพยากร

| Panel | แสดงข้อมูล | กรณีใช้งาน |
|---|---|---|
| **พยากรณ์ CPU** | ความชันของการถดถอยเชิงเส้น → คาดการณ์เวลาที่ CPU จะถึง 100% | วางแผนอัปเกรดเซิร์ฟเวอร์ |
| **พยากรณ์ดิสก์** | คาดการณ์วันที่ดิสก์จะเต็ม | วางแผนขยายพื้นที่จัดเก็บ |
| **แนวโน้มหน่วยความจำ** | อัตราการเพิ่มขึ้นของการใช้หน่วยความจำ | วางแผนอัปเกรด RAM |
| **ความจุเครือข่าย** | แนวโน้มการใช้งานแบนด์วิธ | วางแผนอัปเกรดเครือข่าย |

### 5. Easy Overview Dashboard

**จุดประสงค์**: ดูภาพรวมทั้ง LDI fleet ได้ทันทีโดยไม่ต้องตั้งค่าอะไรเลย — ไม่มี template variable, ไม่มี filter, เปิดแล้วเห็นเลย

ทุกตัวเลขบน dashboard นี้ดึงจาก shared view/function ชุดเดียวกับที่ dashboard อื่นใช้ (`v_ldi_machine_latest_full`, `v_ldi_alarm_context`, `f_ldi_yield_pct`, `v_machine_spc_fleet`) — ตัวเลขจะไม่มีวันขัดแย้งกันข้าม dashboard เพราะไม่มี query ซ้ำซ้อนที่คำนวณแยกกัน

### 6. ศูนย์ควบคุมการผลิต LDI (LDI Manufacturing Command Center)

**จุดประสงค์**: Dashboard หลักสำหรับสายการผลิต LDI — การออกแบบ RCA 4 ชั้น

| ชั้น | เนื้อหา |
|---|---|
| **Executive HUD** | % Yield, เครื่องที่ทำงานอยู่, สถานะ Fleet, ค่า Cpk เฉลี่ย, Availability ของ Fleet, การแจ้งเตือนวิกฤต |
| **Machine Telemetry** | การปฏิบัติตามเกณฑ์อุณหภูมิ/ความชื้น, ความเร็วการสแกน/ระบบสุญญากาศ, ความหนา/ปริมาณรังสี, มาตราส่วน X/Y |
| **Production Context** | ตารางการผลิตสด (เครื่อง/งาน/ชิ้นส่วน/เลเยอร์/ความคืบหน้า), ความสามารถในการตรวจสอบย้อนกลับบอร์ด, เวลาต่อบอร์ด |
| **Alarm Stream** | เหตุการณ์การแจ้งเตือนล่าสุด (50 รายการ), การแจ้งเตือนที่เกี่ยวข้องกันสูงสุด (24 ชั่วโมง, RCA) |

ส่วนเนื้อหาเจาะลึกถูกย่อไว้โดยค่าเริ่มต้น — คลิกที่ส่วนหัวเพื่อขยาย การทำเช่นนี้ช่วยให้ภาพรวมเริ่มต้นมีเพียงส่วนข้อมูลสำหรับผู้บริหาร (Executive KPI strip) เท่านั้น

### 7. กระดาน Andon สำหรับพนักงานควบคุม LDI (LDI Operator Andon Board)

**จุดประสงค์**: จอ kiosk หน้างาน (factory floor) — มาตรฐาน ISA-101 ไม่ต้องแตะอะไรเลย ไม่มี scroll ที่ความละเอียด 1280x720

แสดง Availability ของ Fleet, จำนวนการแจ้งเตือนวิกฤต, % การปฏิบัติตามเกณฑ์สิ่งแวดล้อม, เครื่องที่กำลังทำงานอยู่, สถานะเครื่องแต่ละตัว (OK/IDLE/NO_DATA เป็นสีพื้นหลัง) และตารางการผลิตสด

### 8. การวิเคราะห์เชิงวิศวกรรม LDI และ SPC (LDI Engineering Analytics & SPC)

**จุดประสงค์**: วิเคราะห์เชิงลึกสำหรับ engineer — จัดอันดับ Cpk/SPC, ทดสอบสาเหตุที่แท้จริง, การกระจายตัวของ PE/JE

| ส่วน | เนื้อหา |
|---|---|
| **สิ่งแวดล้อม** | อุณหภูมิเทียบกับความชื้น ทุกเครื่องพร้อมกัน |
| **กราฟควบคุม SPC** | กราฟควบคุมความหนา (เฉลี่ย ± 3σ), กราฟควบคุมมาตราส่วน X/Y |
| **การวิเคราะห์การเปลี่ยนแปลง** | ค่าเบี่ยงเบนมาตรฐาน PE/JE ตามเครื่อง, การกระจายข้อผิดพลาด PE/JE (Box Plot) |
| **RCA / ความสัมพันธ์การแจ้งเตือน** | RCA Truth Test — Lift/ความมั่นใจต่อหมวดหมู่การแจ้งเตือน (ความร้อน/ความชื้น/สุญญากาศ/การจัดตำแหน่ง/การเคลื่อนที่) |

### 9. LDI Machine Snapshot

**จุดประสงค์**: ดูสภาพเครื่องแบบละเอียดที่เสี้ยววินาที (millisecond) ที่คลิกจาก Process Timeline (drill-down จาก dashboard อื่น)

แสดงบริบทงาน ตัวแปรทางกายภาพ การจัดตำแหน่ง PE Cpk และการแจ้งเตือนที่ใกล้เคียงเวลาดังกล่าว — ใช้เมื่อต้องสืบสวนเหตุการณ์เฉพาะจุด ไม่ใช่สำหรับดูภาพรวม

### 10. แดชบอร์ดความพร้อมข้อมูล LDI (LDI Data Readiness)

**จุดประสงค์**: Dashboard ตรวจสอบคุณภาพข้อมูลด้วยตัวเอง (self-auditing) — ใช้ข้อมูลจริงจาก PostgreSQL เท่านั้น ไม่มีข้อมูลจำลอง

ใช้ตรวจสอบ board-key ซ้ำซ้อน เปอร์เซ็นต์ความครอบคลุม และอัตราการจับคู่กับระบบการแจ้งเตือนหลักก่อนที่จะเชื่อถือข้อมูลจาก dashboard อื่น

---

## การอ่านค่า Metrics

### ตัวชี้วัด CPU

| ตัวชี้วัด | หน่วย | ปกติ | เตือน | วิกฤต |
|---|---|---|---|---|
| `cpu_load_percent` | % | < 60% | 60-80% | > 80% |
| `cpu_cores` | จำนวน | — | — | — |

**วิธีอ่าน:**
- **Average CPU** — ค่าเฉลี่ยของทุก cores ในช่วงเวลาที่เลือก
- **Peak CPU** — ค่าสูงสุดที่บันทึกไว้ (อาจเกิด spike ชั่วคราว)
- **CPU per Core** — ดูว่า core ไหนกำลังถูกใช้งานหนัก

**ตัวอย่าง:**
```
เครื่อง: server-01
โหลด CPU: 72% (เตือน)
├── Core 1: 85% ️
├── Core 2: 45% 
├── Core 3: 78% ️
└── Core 4: 80% ️
→ Core 1, 3, 4 กำลังถูกใช้งานหนัก ตรวจสอบว่ามีกระบวนการ (process) ใดกำลังทำงานอยู่
```

### ตัวชี้วัดหน่วยความจำ (Memory)

| ตัวชี้วัด | หน่วย | ปกติ | เตือน | วิกฤต |
|---|---|---|---|---|
| `ram_used_mb` | MB | — | — | — |
| `ram_total_mb` | MB | — | — | — |
| **การใช้งาน %** | % | < 70% | 70-85% | > 85% |

**วิธีอ่าน:**
- **การใช้งาน %** = `(ram_used_mb / ram_total_mb) × 100`
- **พื้นที่ว่าง** = `ram_total_mb - ram_used_mb`
- Memory ที่สูงไม่จำเป็นต้องแย่ — Linux ใช้ memory สำหรับ caching

### ตัวชี้วัดเครือข่าย

| ตัวชี้วัด | หน่วย | คำอธิบาย |
|---|---|---|
| `rx_mbps` | Mbps | ความเร็วดาวน์โหลด (การรับข้อมูล) |
| `tx_mbps` | Mbps | ความเร็วอัปโหลด (การส่งข้อมูล) |
| `net_rx_errors` | จำนวน | ข้อผิดพลาดในการรับ (ปัญหาจากฮาร์ดแวร์/ไดรเวอร์) |
| `net_rx_drops` | จำนวน | แพ็กเก็ตที่สูญหาย (buffer overflow) |
| `net_if_status` | 1/2 | 1 = เปิด (UP), 2 = ปิด (DOWN) |

**วิธีอ่าน:**
- **การใช้แบนด์วิธ** = `(rx_mbps / ความเร็วของลิงก์) × 100`
- **อัตราความผิดพลาด** = `net_rx_errors / จำนวนแพ็กเก็ตทั้งหมด × 100`
- **เครือข่าย DOWN** = สาย network ขาด หรือ switch port ปิด

**ตัวอย่าง:**
```
เครื่อง: server-01
┌─────────┬──────────┬──────────┬──────────┬──────────┬────────┐
│อินเตอร์เฟส │ RX Mbps │ TX Mbps │ Error  │ Drop   │ สถานะ  │
├─────────┼──────────┼──────────┼──────────┼──────────┼────────┤
│ eth0  │ 1200   │ 850   │ 0    │ 0    │ UP │
│ wlan0  │ 320   │ 180   │ 0    │ 12    │ UP │
└─────────┴──────────┴──────────┴──────────┴──────────┴────────┘
→ wlan0 มีการตกหล่น 12 แพ็กเก็ต — ตรวจสอบสัญญาณเครือข่ายไร้สาย
```

### ตัวชี้วัดดิสก์

| ตัวชี้วัด | หน่วย | ปกติ | เตือน | วิกฤต |
|---|---|---|---|---|
| `disk_used_gb` | GB | — | — | — |
| `disk_total_gb` | GB | — | — | — |
| **การใช้งาน %** | % | < 70% | 70-80% | > 80% |

**วิธีอ่าน:**
- **การใช้งาน %** = `(disk_used_gb / disk_total_gb) × 100`
- **พื้นที่ว่าง** = `disk_total_gb - disk_used_gb`
- **IOPS** = จำนวน operations ต่อวินาที (ถ้ามีตัวชี้วัดเพิ่มเติม)

### ตัวชี้วัดอุณหภูมิ

| ตัวชี้วัด | หน่วย | ปกติ | เตือน | วิกฤต |
|---|---|---|---|---|
| `temp_c` | °C | < 65°C | 65-80°C | > 80°C |

**วิธีอ่าน:**
- **Average Temp** — อุณหภูมิเฉลี่ย
- **Max Temp** — อุณหภูมิสูงสุด (peak temperature)
- **Temperature Trend** — กำลังเพิ่มขึ้นหรือลดลง

---

## ขั้นตอนการตอบสนองต่อการแจ้งเตือน (Alerts)

### ระดับความรุนแรงของการแจ้งเตือน

| ระดับ | สี | เวลาตอบสนอง | ตัวอย่าง |
|---|---|---|---|
| **วิกฤต (Critical)** | แดง | ทันที (< 15 นาที) | InterfaceDown, ServiceDown, CriticalCPU |
| **เตือน (Warning)** | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) เหลือง | เร็ว (< 1 ชั่วโมง) | HighCPU, HighMemory, DiskSpaceLow |
| **ข้อมูล (Info)** | น้ำเงิน | ตามปกติ (< 4 ชั่วโมง) | TelemetryGap, PredictiveDiskFull |

### คู่มือรับมือกับเหตุการณ์ขัดข้อง (Incident Response Playbook)

#### สถานการณ์ที่ 1: InterfaceDown (วิกฤต)

```
อาการ:
- แจ้งเตือน: InterfaceDown บน server-01
- พาเนลเครือข่ายขึ้น "No Data" (ไม่มีข้อมูล)
- เครื่องอื่นๆ ยังสามารถส่งข้อมูลได้ปกติ

ขั้นตอนการตรวจสอบ:
1. SSH เข้าสู่ server-01 → ตรวจสอบสายเครือข่าย
2. ตรวจสอบสถานะของ switch port
3. รันคำสั่ง: ip link show eth0
4. ดูว่า interface อยู่ในสถานะ UP หรือไม่

การแก้ไข:
- ถอดสายเครือข่ายและเสียบใหม่
- ตรวจสอบการตั้งค่า switch
- รีสตาร์ทเซอร์วิสเครือข่าย: systemctl restart networking
- ตรวจสอบการทำงาน: ping ไปยัง gateway

การส่งต่อ (Escalation):
- หากสายไฟทางกายภาพปกติดี → ติดต่อทีมเครือข่าย
- หาก switch port ปิดอยู่ → ติดต่อทีม Data Center
```

#### ️ สถานการณ์ที่ 2: HighCPUUsage (เตือน)

```
อาการ:
- แจ้งเตือน: HighCPUUsage บน server-01
- พาเนล CPU ขึ้นสูงเกิน > 80%
- ระบบอาจทำงานช้าลง

ขั้นตอนการตรวจสอบ:
1. SSH เข้าสู่ server-01
2. รันคำสั่ง: top -bn1 | head -20
3. ระบุว่ากระบวนการ (process) ไหนใช้งาน CPU สูงสุด
4. ตรวจสอบดูว่ามี scheduled job ทำงานอยู่หรือไม่

การแก้ไข:
- หากเป็นระบบการทำงานที่ถูกต้อง → ติดตามผล ไม่จำเป็นต้องทำอะไร
- หากเป็น rogue process → ยุติกระบวนการ (kill) หรือลดความสำคัญ (renice)
- หากเกิด OOM (Out of Memory) → เพิ่ม Swap หรือหน่วยความจำ RAM

การส่งต่อ (Escalation):
- หากสูงต่อเนื่อง > 1 ชั่วโมง → ตรวจสอบกับทีมแอปพลิเคชัน
- หากมีผลกระทบกับเซอร์วิสอื่น → พิจารณาขยายระบบ (scaling)
```

#### ️ สถานการณ์ที่ 3: DiskSpaceLow (เตือน)

```
อาการ:
- แจ้งเตือน: DiskSpaceLow บน server-01
- พาเนลดิสก์ขึ้นสูงเกิน > 80%

ขั้นตอนการตรวจสอบ:
1. SSH เข้าสู่ server-01
2. รันคำสั่ง: df -h
3. รันคำสั่ง: du -sh /* | sort -rh | head -10
4. ระบุไฟล์/ไดเรกทอรีที่มีขนาดใหญ่

การแก้ไข:
- ล้างบันทึกระบบ (logs): journalctl --vacuum-size=500M
- ลบข้อมูลสำรองเก่าทิ้ง: find /backup -mtime +30 -delete
- บีบอัดไฟล์ที่มีขนาดใหญ่: gzip largefile.log
- ย้ายข้อมูลเก่าเข้าเก็บใน cold storage

การส่งต่อ (Escalation):
- หากดิสก์ถูกใช้งานอย่างต่อเนื่อง → วางแผนเพิ่มขยายพื้นที่จัดเก็บ
- หากถึงขั้นวิกฤต (> 95%) → ต้องเคลียร์ข้อมูลทันที
```

#### สถานการณ์ที่ 4: ServiceDown (วิกฤต)

```
อาการ:
- แจ้งเตือน: ServiceDown บน server-01
- Blackbox probe เกิดข้อผิดพลาด
- แอปพลิเคชันอาจไม่สามารถเข้าถึงได้

ขั้นตอนการตรวจสอบ:
1. ตรวจสอบสถานะเซอร์วิส: systemctl status <service>
2. ตรวจสอบบันทึกเซอร์วิส (logs): journalctl -u <service> -n 50
3. ตรวจสอบการเปิดพอร์ต: netstat -tlnp | grep <port>
4. ตรวจสอบการตั้งค่าไฟร์วอลล์: iptables -L -n

การแก้ไข:
- รีสตาร์ทเซอร์วิส: systemctl restart <service>
- ตรวจสอบการตั้งค่า (config): <service> -t (ทดสอบการตั้งค่า)
- ตรวจสอบกฎไฟร์วอลล์
- ตรวจสอบเซอร์วิสที่เกี่ยวข้อง (dependent services)

การส่งต่อ (Escalation):
- หากเซอร์วิสไม่สามารถเปิดขึ้นมาได้ → ตรวจสอบบันทึกแอปพลิเคชัน
- หากพอร์ตชนกัน → ระบุกระบวนการที่ชน
- หากเป็นปัญหาระดับระบบหลัก → ติดต่อแอดมินระบบ
```

#### ![Warning](https://img.shields.io/badge/Status-Warning-yellow) สถานการณ์ที่ 5: PipelineDataStalled (เตือน)

```
อาการ:
- แจ้งเตือน: PipelineDataStalled (แต่ก่อนเรียก TelemetryGap) บน server-01
- ไม่มีข้อมูล 3+ นาที
- เครื่องอื่นยังรายงานข้อมูลตามปกติ

ขั้นตอนการตรวจสอบ:
1. ตรวจสอบบันทึก Node-RED: docker compose logs --tail=50 node-red
2. ตรวจสอบ SNMP simulator: docker compose ps snmpsim
3. ตรวจสอบการเชื่อมต่อเครือข่าย
4. ตรวจสอบว่า machine_id ตรงกันหรือไม่

การแก้ไข:
- หาก snmpsim ขัดข้อง → docker compose restart snmpsim
- หาก Node-RED มีข้อผิดพลาด → ตรวจสอบรูปแบบโครงสร้างของ flow JSON
- หากไม่มีเครื่องอยู่ในรีจิสทรี → เพิ่มเข้าระบบฐานข้อมูล

การส่งต่อ (Escalation):
- หากเกิดปัญหาต่อเนื่อง → ตรวจสอบ SNMP community string
- หากเป็นเครื่องใหม่ → ยืนยันความเข้ากันได้ของ MIB
```

---

## การทำงานทั่วไป

### การตรวจสอบสถานะระบบ

```bash
# ดู containers ทั้งหมด
docker compose ps

# ตรวจสอบบันทึก Node-RED
docker compose logs --tail=20 node-red

# ตรวจสอบ Prometheus targets
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/targets"

# ตรวจสอบการแจ้งเตือนปัจจุบัน
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/alerts"
```

### ค้นหาข้อมูลจากฐานข้อมูลโดยตรง

```bash
# ดู telemetry ล่าสุด (5 นาทีล่าสุด)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, time, cpu_load_percent, temp_c
  FROM public.sys_metrics
  WHERE time > NOW() - INTERVAL '5 minutes'
  ORDER BY time DESC LIMIT 10;"

# ดูค่า interface
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, iface_name, rx_mbps, tx_mbps
  FROM public.net_metrics
  ORDER BY time DESC LIMIT 1;"
```

### การรีสตาร์ทเซอร์วิส

```bash
# รีสตาร์ท Node-RED (หลังจากแก้ flow)
docker compose restart node-red

# รีสตาร์ท Prometheus (หลังจากแก้ rule)
docker compose restart prometheus

# รีสตาร์ททั้งหมด (ไม่มีการสูญหายของข้อมูล)
docker compose restart node-red grafana alertmanager prometheus
```

---

## การแก้ไขปัญหา (Troubleshooting)

### ปัญหาที่พบบ่อย

| อาการ | สาเหตุที่เป็นไปได้ | วิธีแก้ไข |
|---|---|---|
| **ขึ้น "No Data" บนพาเนลทั้งหมด** | Node-RED ไม่ได้รัน | `docker compose restart node-red` |
| **ขึ้น "No Data" ในบางเครื่อง** | เครื่องไม่ได้อยู่ในรีจิสทรี | เพิ่มไปที่ตาราง `machines` |
| **Alertmanager ทำการรีสตาร์ทบ่อยครั้ง** | โครงสร้าง Config YAML ผิด | เช็ค `docker compose logs alertmanager` |
| **เป้าหมาย Blackbox ทั้งหมดตกอยู่ในสถานะ DOWN** | ชื่อเซอร์วิสผิดใน config | ใช้ `blackbox-exporter:9115` |
| **Grafana แสดงข้อมูลเก่า** | แดชบอร์ดไม่ได้ถูกโหลดซ้ำ | รีเฟรชขั้นสูง: Ctrl+Shift+R |
| **การใช้หน่วยความจำสูง** | หน่วยความจำรั่วไหลใน Node-RED | เช็ค `docker stats ims-node-red` |
| **การเชื่อมต่อฐานข้อมูลถูกปฏิเสธ** | PgBouncer มีปัญหา | `docker compose restart pgbouncer` |

### ตำแหน่งไฟล์บันทึก (Log Locations)

| เซอร์วิส | คำสั่ง | สิ่งที่ควรมองหา |
|---|---|---|
| **Node-RED** | `docker compose logs node-red` | `Started flows`, `TypeError`, `ETIMEOUT` |
| **TimescaleDB** | `docker compose logs timescaledb` | `connection refused`, `authentication failed` |
| **Prometheus** | `docker compose logs prometheus` | `failed to check config`, `target down` |
| **Alertmanager** | `docker compose logs alertmanager` | `Loading configuration file failed` |
| **Grafana** | `docker compose logs grafana` | `Failed to look up user`, `dashboard not found` |

### สคริปต์การวินิจฉัยข้อมูลด่วน

```bash
# ตรวจสอบสถานะการทำงานทั้งหมดในครั้งเดียว
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

## อ้างอิงด่วน

### คีย์ลัด (Grafana)

| คีย์ลัด | การใช้งาน |
|---|---|
| `Ctrl+S` | บันทึกแดชบอร์ด |
| `Ctrl+Z` | เลิกทำ (Undo) |
| `Ctrl+Shift+Z` | ทำซ้ำ (Redo) |
| `F` | เปิด/ปิดมุมมองเต็มหน้าจอ |
| `R` | รีเฟรชแดชบอร์ด |
| `T` | เปิดเครื่องมือเลือกเวลา |
| `D` | ค้นหาแดชบอร์ด |
| `Ctrl+Shift+P` | เปิดคอมมานด์พาเล็ต (command palette) |

### อ้างอิงการใช้สี (Color Coding)

| ตัวชี้วัด | ปกติ | เตือน | วิกฤต |
|---|---|---|---|
| **CPU** | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) เขียว | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) เหลือง → ส้ม | แดง |
| **Memory** | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) เขียว | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) ม่วง → ส้มเข้ม | แดง |
| **Disk** | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) เขียว | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) ฟ้า (Cyan) → น้ำเงิน | แดง |
| **Network RX** | น้ำเงินเข้ม (#1F60C4) | — | แดง |
| **Network TX** | สีฟ้าอ่อน (#5794F2) | — | แดง |
| **Temperature** | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) เขียว | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) เหลือง | แดง |
| **Errors** | — | — | แดง (#C4162A) |
| **Drops** | — | ![Warning](https://img.shields.io/badge/Status-Warning-orange) ส้ม (#FF9830) | แดง |

### ติดต่อผู้ดูแล

| ตำแหน่ง | ช่องทางติดต่อ | ช่องทาง |
|---|---|---|
| **NOC Team** | กลุ่ม LINE | LINE Messaging API |
| **System Admin** | MS Teams | Webhook |
| **Management** | อีเมล (ในอนาคต) | SMTP |

---

<div align="center">

**IMS คู่มือผู้ใช้ — เวอร์ชั่น 1.1**

*สำหรับฝ่าย IT Support และ NOC Team*

</div>
