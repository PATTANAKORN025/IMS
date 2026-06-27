# 💻 User Operations Manual (Grafana User Manual)

คู่มือสำหรับ **Operator**, **Technician** และ **IT Support** ในการใช้ Dashboard ตรวจสอบและวิเคราะห์สถานะเครื่องจักร YSPhotec

---

## 1. NOC Overview (ภาพรวมระบบ)

หน้าจอหลักสำหรับดูสถานะเครื่องจักรทั้งหมด

### สถานะไฟจราจร (Traffic Light Indicators)

| สี | สถานะ | ความหมาย |
|----|-------|----------|
| 🟢 **Green** | Online | เครื่องจักรทำงานปกติ |
| 🟡 **Yellow** | Warning | เครื่องจักรเข้าใกล้ขีดจำกัด (เช่น CPU สูง, อุณหภูมิสูง) |
| 🔴 **Red** | Critical | เครื่องจักรมีปัญหา หรือ uptime ต่ำกว่า 99.99% |

### วิธีใช้งาน
1. เปิดเบราว์เซอร์ → `http://localhost:3000`
2. Login ด้วย admin/admin (เปลี่ยนรหัสผ่านครั้งแรก)
3. เลือก Dashboard: **NOC Overview**
4. ดูสถานะเครื่องจักรทั้งหมดในหน้าเดียว

`[Insert Screenshot Here: NOC Overview Dashboard]`

---

## 2. Reading the Dashboards

### 2.1 Resource Usage (CPU, RAM, Disk)

| Panel | หน่วย | ปกติ | ต้องระวัง |
|-------|-------|------|----------|
| CPU Load | % | < 70% | > 75% (Warning), > 90% (Critical) |
| RAM Used | MB | < 80% ของ Total | > 80% |
| Disk Used | GB | < 70% ของ Total | > 80% |
| Temperature | °C | < 70°C | > 70°C (Warning), > 85°C (Critical) |

### 2.2 Symmetrical Network Graph (Butterfly Wing)

กราฟ Bandwidth ออกแบบเป็นรูป "ปีกผีเสื้อ" เพื่อดูความหนาแน่นของทราฟฟิกได้ทันที:

```
        Download (RX)
  eth0  ████████████████  ← สีน้ำเงินเข้ม (#1F60C4)
  wlan0 ████████████      ← สีม่วง (#8E24AA)
  ───────────────────────── 0 b/s ─────────────────────────
  wlan0 ████████████      ← สีชมพู (#E02F44)
  eth0  ████████████████  ← สีฟ้าอ่อน (#5794F2)
        Upload (TX)
```

- **แกนบน (Download):** ค่าบวก แสดงปริมาณข้อมูลที่รับ
- **แกนล่าง (Upload):** ค่าลบ (× -1) แสดงปริมาณข้อมูลที่ส่ง
- **Auto-scaling:** ระบบปรับหน่วยอัตโนมัติ (bps → Mbps → Gbps)

### 2.3 Wi-Fi Metrics (RSSI / SNR)

| Metric | ค่าปกติ | ค่าที่ควรระวัง |
|--------|---------|---------------|
| **RSSI** (Signal Strength) | -30 ถึง -50 dBm | < -70 dBm (สัญญาณอ่อน) |
| **SNR** (Signal-to-Noise) | > 25 dB | < 20 dB (สัญญาณรบกวนสูง) |

```
RSSI Scale:
-30 dBm  ████████████████████  Excellent
-50 dBm  ████████████████      Good
-70 dBm  ████████████          Fair
-80 dBm  ████████              Poor ← ต้องตรวจสอบ
-90 dBm  ████                  Very Poor
```

### 2.4 LDI Quality Scatter Plot & Tolerance Box

กราฟแสดงความแม่นยำของการจัดตำแหน่งเลเซอร์ (LDI Alignment):

```
  PE (Position Error)
    ▲
 10 │         ┌─────────────┐
    │         │  TOLERANCE  │
  0 │─────────│    BOX      │─────────
    │         │  (±10 µm)   │
-10 │         └─────────────┘
    └──────────────────────────────▶ JE (Judgment Error)
          -10          0          10
```

- **จุดอยู่ในกรอบสีแดง:** ปกติ — เครื่องจักรทำงานได้ตามมาตรฐาน
- **จุดอยู่นอกกรอบสีแดง:** ผิดปกติ — ส่งช่างไปสอบเทียบเครื่องจักร

`[Insert Screenshot Here: LDI Scatter Plot]`

---

## 3. Dashboard Navigation

| Dashboard | ใช้เมื่อ | ข้อมูลที่แสดง |
|-----------|---------|--------------|
| **NOC Overview** | ดูภาพรวมทุกเครื่อง | สถานะ, Uptime, Health |
| **System Overview** | ดูทรัพยากรเครื่อง | CPU, RAM, Disk, Temp |
| **Engineering Drilldown** | วิเคราะห์เจาะลึกเครื่อง特定 | 34 panels รวม WiFi, LDI, Network |
| **Capacity Planning** | วางแผนทรัพยากร | Disk Prediction, Trend Analysis |

---

## 4. Incident Response Workflow

เมื่อระบบ AIOps ตรวจพบความผิดปกติ จะส่ง Alert ไปที่ LINE หรือ Microsoft Teams (พร้อม Emoji 🚨, ⚠️)

### ขั้นตอนการตอบสนอง (1-2-3)

```
┌─────────────────────────────────────────────────┐
│  STEP 1: ACKNOWLEDGE (รับทราบ)                  │
│  เปิดมือถือ → ตรวจสอบ Machine_ID และ Detail    │
│  ของปัญหาที่แจ้งเตือน                           │
└─────────────────────┬───────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│  STEP 2: DRILL-DOWN (เจาะลึก)                   │
│  เปิด Grafana → เลือกเครื่องที่มีปัญหา         │
│  ใน Dropdown Menu ด้านบน                        │
└─────────────────────┬───────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│  STEP 3: ANALYZE (วิเคราะห์)                    │
│  ดูกราฟย้อนหลัง 15-30 นาที                      │
│  หาสาเหตุ (เช่น อุณหภูมิพุ่ง, WiFi หลุด)        │
│  แจ้งช่างหน้างาน                                │
└─────────────────────────────────────────────────┘
```

### ตัวอย่าง Alert Messages

| Alert | ความหมาย | สิ่งที่ต้องทำ |
|-------|---------|-------------|
| 🔥 `HighCpuLoad` | CPU โหลดสูง > 90% | ตรวจสอบ process ที่ใช้ CPU สูง |
| ⚠️ `TemperatureWarning` | อุณหภูมิ > 70°C | ตรวจสอบระบบระบายความร้อน |
| 🔴 `InterfaceDown` | Network Interface ดับ | ตรวจสอบสาย LAN / สวิตช์ |
| ⚠️ `WiFi_Signal_Degradation` | Wi-Fi SNR < 20dB | ตรวจสอบระยะห่างจาก Access Point |

---

## 5. Quick Reference

### การเข้าถึงระบบ

| บริการ | URL | พอร์ต |
|--------|-----|-------|
| Grafana | http://localhost:3000 | 3000 |
| Node-RED | http://localhost:1880 | 1880 |
| Prometheus | http://localhost:9090 | 9090 |
| Alertmanager | http://localhost:9093 | 9093 |

### ติดต่อผู้ดูแลระบบ

| กรณี | ติดต่อ |
|------|--------|
| Dashboard ไม่แสดงผล | ทีม MIS-G |
| Alert ไม่ส่ง | ทีม MIS-G |
| เครื่องจักรมีปัญหา | ช่างหน้างาน + ทีม MIS-G |
