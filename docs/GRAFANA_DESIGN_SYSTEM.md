# IMS Grafana Design System

> **เป้าหมาย:** ทำให้ dashboard ทั้งหมดของ IMS (NOC Overview, Engineering Drill-Down, Capacity Planning) มีมาตรฐานเดียวกัน แก้ที่นี่ที่เดียว ไม่ drift ข้ามไฟล์ และดูเป็นระบบ "ชุดเดียวกัน" ทันทีที่สลับหน้า
>
> เอกสารนี้คือ **contract** ไม่ใช่คำแนะนำ — panel ใหม่ทุกตัวต้องผ่านกฎในนี้ก่อน merge

---

## 1. หลักการออกแบบ (Design Principles)

1. **Function first, beauty follows** — ความสวยที่ไม่ช่วยให้อ่านข้อมูลเร็วขึ้นคือของตกแต่งที่ต้องตัดทิ้ง
2. **Color มีความหมายเดียวเสมอ** (Semantic, ไม่ใช่ Decorative) — กฎข้อ 3 ด้านล่าง
3. **3-Second Rule** — คนเดินผ่านจอ NOC ต้องรู้ภายใน 3 วินาทีว่า "ตอนนี้ปกติไหม" โดยไม่ต้องอ่าน label
4. **Consistency > Novelty** — panel ชนิดเดียวกันต้องหน้าตาเหมือนกันทุกที่ที่ปรากฏ (ผ่าน Library Panels)
5. **Progressive disclosure** — NOC ตอบ "ต้องเรียกใครไหม", Engineering ตอบ "ทำไม", Capacity ตอบ "จะเกิดอะไรต่อ" ห้ามผสมระดับรายละเอียดในหน้าเดียวกัน

---

## 2. Color System

### 2.1 Semantic Palette (ห้ามใช้สีนอกตารางนี้เพื่อสื่อสถานะ)

| Token | Hex Code | ความหมาย | ใช้กับ |
|---|---|---|---|
| `info` | `#00E5FF` | ข้อมูลหลัก / สถานะปกติ | RX (Download), Windows series, CPU normal |
| `accent` | `#3B82F6` | สีเน้น / Active UI elements | Navigation highlights, interactive elements |
| `healthy` | `#10B981` | สถานะดี / ปกติ | Healthy status, Ubuntu series, Throughput, Green thresholds |
| `warning` | `#F59E0B` | เฝ้าระวัง ยังไม่ฉุกเฉิน | Warning thresholds, Temperature warnings, PE metric |
| `critical` | `#EF4444` | อันตราย ต้องแก้เดี๋ยวนี้ | Critical thresholds, Max value alerts, Error states |
| `forecast` | `#4A5568` | เส้นคาดการณ์/Regression (เส้นประ) | Forecast, regression, trend projection |
| `gap` | `text-secondary` @ 40% opacity | เส้นอ้างอิง / ข้อมูลจริง | Threshold reference lines, capacity ceiling |

**กฎเหล็ก:**
- **ห้าม** ใช้สี Grafana default palette — ใช้เฉพาะ tokens ในตารางนี้เท่านั้น (Healthy: `#10B981`, Warning: `#F59E0B`, Critical: `#EF4444`, Info: `#00E5FF`, Accent: `#3B82F6`)
- **ห้าม** ผูกสี fixed เข้ากับชื่อเครื่อง/series เฉพาะเจาะจง ยกเว้นกรณีเดียว: เครื่องจริงถาวรในโรงงานที่ต้องแยกด้วยสีคงที่ — ต้องประกาศ mapping ในภาคผนวกที่เดียว
- แดง (`#EF4444`) ต้องแปลว่า critical **เสมอ** — ห้ามใช้แดงเป็นสี series เฉยๆ เพราะจะไปแย่งความหมายกับ alert
- Forecast / regression / threshold reference ใช้ `#4A5568` (forecast) เส้นประเสมอ ไม่ใช่สีสดที่แข่งกับข้อมูลจริง

### 2.2 Threshold Contract (ต้องตรงกันทุก panel ที่วัดค่าเดียวกัน)

| Metric | Warning | Critical | หมายเหตุ |
|---|---|---|---|
| CPU Load % | 80 | 90 | |
| RAM Used % | 85 | 95 | |
| Disk Used % | 80 | 90 | |
| Temperature °C | 45 | 55 | ปรับตาม spec เครื่องจริงเมื่อรู้ค่า |
| LDI PE (µm, abs) | 10 | 15 | ตาม tolerance ที่ตกลงกับฝ่าย QA |
| Fleet Health Score | < 70 | < 50 | สเกลต่อเนื่อง 0–100 (ห้ามขั้นบันได) |

ตัวเลขนี้ต้อง**เขียนครั้งเดียว**แล้ว reuse ผ่าน field config template ไม่ใช่พิมพ์ threshold ซ้ำในทุก panel — ถ้าจะเปลี่ยนค่า เปลี่ยนที่เดียวแล้ว save เป็น Library Panel field config

---

## 3. Typography & Number Formatting

| องค์ประกอบ | กฎ |
|---|---|
| Panel title | สั้น ≤ 4 คำ, Title Case, ไม่ใส่หน่วยในชื่อ (หน่วยอยู่ใน axis/legend) |
| Panel description | ใส่ทุก panel เสมอ อธิบาย "นี่คืออะไร + คำนวณยังไง" แสดงผ่าน hover (ⓘ icon) |
| Stat value font size | ≥ 32px สำหรับ KPI แถวบนสุด (อ่านจากระยะ 2–3 เมตรบนจอ NOC) |
| หน่วย (unit) | ตั้งทุก field เสมอ ห้ามปล่อยตัวเลขดิบ (`%`, `°C`, `GB`, `Mbps`) |
| Decimal | 1 ตำแหน่งพอสำหรับ % และอุณหภูมิ, 0 ตำแหน่งสำหรับ count |
| เวลา | `dateTimeFromNow` สำหรับ "last seen" (เช่น "12s ago"), absolute time เฉพาะ tooltip |
| Sentinel values | ค่าพิเศษ (เช่น 9999 = ไม่มีการเติบโต) ต้องมี value mapping เป็นข้อความเสมอ ห้ามโชว์ตัวเลขดิบที่ดูเหมือน bug |

---

## 4. Panel Type Decision Table

เลือกชนิด panel จาก**ธรรมชาติของข้อมูล** ไม่ใช่ความเคยชิน:

| ข้อมูลแบบไหน | ใช้ Panel | ตัวอย่างใน IMS |
|---|---|---|
| ค่าล่าสุด เดี่ยว + อยากเห็นเทรนด์คู่กัน | **Stat** (`graphMode: area`) | CPU ล่าสุด, RAM ล่าสุด |
| ค่าที่มีเพดาน ต้องรู้ "เหลือเท่าไหร่" | **Bar Gauge** / **Gauge** | RAM %, Disk % |
| สถานะจำนวนมากตามเวลา | **State Timeline** | Fleet uptime 24h |
| เทรนด์ต่อเนื่อง เปรียบเทียบหลาย series | **Time Series** | CPU/RAM/Network history |
| สัดส่วนของทั้งหมด ณ จุดเวลาหนึ่ง | **Pie / Donut** | Traffic breakdown ต่อ interface |
| ตารางรายละเอียด หลาย field | **Table** + gauge cell + color text | Server Fleet Status |
| Correlation ระหว่าง 2 ตัวแปร | **XY Chart** | CPU vs Temperature |
| Alert ที่กำลัง fire | **Alert List** | แถวบนสุดของ NOC |
| คำอธิบาย/ลิงก์ runbook | **Text (Markdown)** | หมายเหตุใต้ row |
| ตำแหน่งเชิงพื้นที่ในโรงงาน | **Geomap (custom image)** | ผังเครื่องจริงตามพื้นที่ผลิต |

**ข้อห้าม:** อย่ายัด time series ลง stat panel ขนาดเล็ก (6×6) เพราะมันจะไม่มีที่ให้อ่านแกน — ถ้าต้องการเทรนด์ในพื้นที่เล็ก ใช้ stat + sparkline แทน

---

## 5. Layout Grid System

### 5.1 กติกา Grid (24 columns มาตรฐาน Grafana)

```
┌─────────────────────────────────────────────────────┐
│ Row 1: KPI Strip        [4][4][4][4][4][4]  h=4      │  ← ตัวเลขเดียว บอกสถานะรวม
├─────────────────────────────────────────────────────┤
│ Row 2: Alert + Status   [Alert List: 8][Table: 16] h=8│  ← สิ่งที่ต้องดูก่อนอย่างอื่น
├─────────────────────────────────────────────────────┤
│ Row 3: Trends (collapsible row ตาม domain)   h=8-10  │  ← 1-2 timeseries ต่อแถว กว้าง 12-24
├─────────────────────────────────────────────────────┤
│ Row N: Deep Debug (collapsed by default)     h=8     │  ← raw table, ไม่ critical
└─────────────────────────────────────────────────────┘
```

### 5.2 กฎ Width/Height

| Panel type | Width (คอลัมน์) | Height |
|---|---|---|
| Stat (KPI) | 4–6 | 4 |
| Gauge / Bar Gauge | 6–8 | 6 |
| Time Series หลัก | 12–24 | 8 |
| Time Series รอง (คู่เทียบ) | 12 | 8 |
| Table | 16–24 | 8–10 |
| Alert List | 8 | 8 |
| Pie/Donut | 6–8 | 8 |

- ห้ามผสม height ต่างกันในแถวเดียวกัน (ทำให้ grid ดูเอียง) — ถ้า panel สูงไม่เท่ากัน ให้แยกคนละแถว
- ใช้ **Row** เสมอเพื่อแบ่งโซนความหมาย ตั้งชื่อ row ให้สื่อ (`🖥️ Compute`, `🌐 Network`, `🌡️ Environmental`) พร้อม emoji ตัวเดียวเป็น visual anchor
- Row ที่ไม่ critical → `collapsed: true` เป็นค่าเริ่มต้น

---

## 6. Interaction Standards

ตั้งค่าระดับ **dashboard settings** ให้เหมือนกันทุกไฟล์:

| Setting | ค่า | เหตุผล |
|---|---|---|
| Graph tooltip | `Shared crosshair` | ลาก cursor แล้วทุก panel sync ตำแหน่งเวลา — รู้สึกเป็นระบบเดียว |
| Tooltip mode (ต่อ panel ที่มีหลาย series) | `multi` | เห็นค่าทุกเส้น ณ จุดนั้นพร้อมกัน |
| `spanNulls` | `60000` (1 นาที) ไม่ใช่ `true` | รูบนกราฟ = เหตุการณ์จริง (outage) ต้องเห็น ไม่ใช่เส้นเรียบลวงตา |
| Default time range | NOC: `now-6h` / Engineering: `now-6h` / Capacity: `now-30d` | ตรงพฤติกรรมใช้งานจริงของแต่ละหน้า ไม่ default เดียวกันหมด |
| Refresh rate | NOC/Engineering: `10s` / Capacity: `5m` | ตรงความถี่ที่ข้อมูลเปลี่ยนจริง ไม่ยิง query เกินจำเป็น |
| `allowUiUpdates` (provider) | `false` | บังคับ dashboard-as-code, กัน drift จาก git |

---

## 7. Data Visualization Rules เฉพาะกราฟ

- **spanNulls แบบมีเพดานเวลา** (ข้อ 6) ไม่ใช่เชื่อมทุกช่องว่างเสมอ
- **Threshold แสดงเป็น area shading** (`thresholdsStyle: "area"` หรือ `"line+area"`) แทน dashed line เปล่า — พื้นหลังแดงจางๆ เห็นจากระยะไกลง่ายกว่าเส้นบางๆ มาก
- **ค่าที่เป็น counter สะสม (SNMP errors/drops) ต้องแปลงเป็น rate ก่อนแสดง** ด้วย `LAG() OVER (...)` ใน SQL — ห้ามโชว์เส้นสะสมที่ขึ้นตลอดกาล อ่านไม่ออกว่าตอนนี้แย่ลงไหม
- **ข้อมูลที่ต้อง mirror แกน (เช่น TX ใต้ RX)** ใช้ field override `custom.transform: "negative-Y"` ที่ visualization layer เท่านั้น — ห้ามคูณ `-1` ใน SQL เพราะ legend/tooltip จะแสดงค่าติดลบผิดความจริง
- **Forecast/regression series** ต้องเป็นเส้นประสีเทาเสมอ (ดูข้อ 2.1) และ matcher ของ override ต้องใช้ `byRegexp` ไม่ใช่ `byName` แบบ literal เมื่อชื่อ series มีตัวแปร interpolate (เช่น `${machine_id}`) เพราะ `byName` ไม่ interpolate template
- **Legend:** `displayMode: table` + `placement: bottom` + เปิด `calcs: [mean, max, last]` เมื่อมีมากกว่า 3 series — ให้ legend ทำหน้าที่เป็น mini-table แทนแค่สัญลักษณ์สี

---

## 8. Machine Identity Palette (ถ้าต้องผูกสีถาวรต่อเครื่องจริง)

> เติมตารางนี้เมื่อทราบรายชื่อเครื่องจริงที่จะ deploy ใน production ห้ามสร้าง fixed color override ที่อื่นนอกจากอ้างอิงจากตารางนี้

| Machine ID | สี | หมายเหตุ |
|---|---|---|
| _(รอข้อมูลเครื่องจริง)_ | | |

---

## 9. Reusability — Library Panels

Panel ที่ปรากฏซ้ำมากกว่า 1 dashboard **ต้อง**เป็น Library Panel (แก้ที่เดียว อัปเดตทุกที่):

- Fleet Health Score (stat)
- CPU / RAM / Disk gauge template
- Alert List (มาตรฐานเดียวกันทุกหน้า)
- Server Fleet Status table

วิธีสร้าง: ใน Grafana UI → panel menu → "Create library panel" → ตั้งชื่อ prefix `lib-` (เช่น `lib-fleet-health-stat`) → เก็บ reference ไว้ใน `monitoring/grafana/library-panels/` เป็นไฟล์ JSON แยก provision ผ่าน provider เดียวกับ dashboard

---

## 10. Checklist ก่อน Merge Panel/Dashboard ใหม่

- [ ] สีที่ใช้อยู่ในตาราง §2.1 เท่านั้น ไม่มี fixed color ผูกกับ series เฉพาะที่ไม่ใช่เครื่องจริงถาวร
- [ ] Threshold ตรงกับสัญญาใน §2.2 (ถ้า metric ใหม่ ให้เพิ่มแถวในตารางนี้ก่อน)
- [ ] มี `unit` และ `description` ครบทุก field
- [ ] Panel type เลือกตามตาราง §4 ไม่ใช่ตามความเคยชิน
- [ ] Grid width/height ตรงกฎ §5.2 ไม่ผสม height ในแถวเดียวกัน
- [ ] `spanNulls` ตั้งเป็นตัวเลข ไม่ใช่ `true`
- [ ] ถ้า panel ซ้ำกับที่อื่น → แปลงเป็น Library Panel ก่อน merge
- [ ] Query ตรงกติกา tiering (raw ≤ latest value, minute CAGG ≤ 6h, hourly CAGG > 2d)
- [ ] ทดสอบด้วย `make test-visual` แล้ว screenshot ตรงกับที่คาดหวัง

---

*เอกสารนี้คือ living document — แก้ไขผ่าน PR เดียวกับที่แก้ dashboard ที่เกี่ยวข้องเสมอ ห้ามให้ dashboard กับเอกสารนี้ drift จากกัน*
