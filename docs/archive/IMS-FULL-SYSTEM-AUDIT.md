# IMS — Full-System Audit Report

> **ARCHIVED — historical snapshot, dated 2026-08-05.** Not living documentation; numbers below (dashboard counts, migration counts, panel counts, etc.) reflect the system as it existed on that date and are known to be stale relative to the current system. Kept for historical record per docs/archive/README.md. For current information, see docs/architecture/ARCHITECTURE.md and docs/architecture/DASHBOARD_INVENTORY.md.

### หลักฐานจากการตรวจ dashboard จริง 8 หน้า · 2026-08-05

---

## วิธีการตรวจ (Methodology)

| ชั้น                        | วิธี                                  | ครอบคลุม                             |
| --------------------------- | ------------------------------------- | ------------------------------------ |
| **A. Static**               | อ่านโค้ด SQL / JSON / flow            | 9 dashboards · 126 panels · 65 nodes |
| **B. Automated**            | 19 unit tests · 12 linter checks      | schema, layout, alarm sync           |
| **C. Visual (ชั้นนี้ใหม่)** | ตรวจ dashboard ที่ render จริง 8 หน้า | สิ่งที่ A และ B มองไม่เห็น           |

**ข้อค้นพบสำคัญเชิงวิธีการ:** ชั้น C พบข้อบกพร่อง **12 จุดที่ชั้น A และ B ผ่านหมด**
เพราะ query ที่ syntax ถูกต้องและ schema ตรง ยังคืนค่า NULL หรือค่าที่ขัดแย้งกันได้
→ **ระบบตรวจอัตโนมัติที่มีอยู่ยังขาดชั้น "ตรวจผลลัพธ์จริง"**

---

# P0 — ตัวเลขขัดแย้งกันเอง (ร้ายแรงที่สุด)

## P0-1 · Yield ของระบบเดียวกัน สองหน้าจอให้คำตอบต่างกัน 87 percentage points

| Dashboard         | ตัวเลขที่แสดง                | สูตรที่ใช้จริง                            |
| ----------------- | ---------------------------- | ----------------------------------------- |
| **NOC Overview**  | **87.10%** (แดง — วิกฤต)     | `ABS(pe_1) > 10 OR ABS(je_1) > 10`        |
| **Manufacturing** | **99.6%** (เขียว — ดีเยี่ยม) | `GREATEST(ABS(pe_1..pe_6)) <= pe_setting` |

**สาเหตุ — สูตรผิดกันคนละแบบ 3 จุด:**

1. **NOC ใช้ threshold `10` ตายตัว** ขณะที่ค่าจริงของ `pe_setting` คือ **25 / 50 / 75** แล้วแต่ผลิตภัณฑ์
   → NOC ตัดสินว่า "เสีย" ทั้งที่ยังอยู่ในสเปกจริง
2. **NOC ดูแค่ `pe_1` และ `je_1`** ไม่ได้ดูทั้ง 6 จุด → ไม่ใช่ค่าที่ใช้ตัดสินคุณภาพจริง
3. **NOC วัด "ความเสี่ยง" แต่ Manufacturing วัด "ผลผลิต"** — เป็นคนละนิยาม แต่ผู้อ่านเข้าใจว่าเรื่องเดียวกัน

**ผลกระทบทางธุรกิจ:** ถ้าผู้บริหารเปิด NOC จะเห็นว่าโรงงานมีปัญหาคุณภาพ 87%
ถ้าเปิด Manufacturing จะเห็นว่าดีเยี่ยม 99.6% — **ตัดสินใจผิดพลาดได้ทันที**
และเมื่อพบว่าขัดแย้ง ความน่าเชื่อถือของ**ทั้งระบบ**จะหายไปพร้อมกัน

**แก้:** ให้ NOC เรียกใช้ตรรกะเดียวกับ Manufacturing ผ่าน view กลาง

```sql
CREATE OR REPLACE VIEW public.v_ldi_yield_1h AS
SELECT ROUND(100.0 * COUNT(*) FILTER (
         WHERE GREATEST(ABS(pe_1),ABS(pe_2),ABS(pe_3),
                        ABS(pe_4),ABS(pe_5),ABS(pe_6)) <= pe_setting)
       / NULLIF(COUNT(*) FILTER (WHERE pe_1 IS NOT NULL), 0)::NUMERIC, 1) AS yield_pct
FROM public.ldi_data
WHERE "time" > NOW() - INTERVAL '1 hour' AND COALESCE(pe_setting,0) > 2.0;
```

แล้วทั้งสอง dashboard query จาก view นี้ — **ตัวเลขจะตรงกันเสมอโดยโครงสร้าง ไม่ใช่โดยความบังเอิญ**

---

# P0-2 · RCA Truth Test รายงานว่า "ไม่มีความสัมพันธ์" — และมันพูดถูก

หลักฐานจาก Engineering Analytics & SPC:

| Alarm Category   | Alarm-Window % | Baseline % | **Lift** | Events | ผลตีความ          |
| ---------------- | -------------- | ---------- | -------- | ------ | ----------------- |
| ALIGNMENT/PE-JE  | 49.0%          | 44.8%      | **1.09** | 251    | แทบไม่ต่างจากสุ่ม |
| VACUUM (91009)   | 96.8%          | 100.0%     | **0.97** | 95     | **ต่ำกว่า 1**     |
| THERMAL (91008)  | 13.8%          | 16.6%      | **0.83** | 29     | ต่ำกว่า 1         |
| HUMIDITY (91008) | 3.4%           | 9.9%       | **0.34** | 29     | ต่ำกว่ามาก        |
| MOTION (70004)   | 0.0%           | 0.0%       | **0.00** | 19     | ไม่มีข้อมูล       |

**การอ่านผล:** `Lift = 1` แปลว่าไม่มีความสัมพันธ์เลย · `Lift < 1` แปลว่าสัมพันธ์**กลับทาง**

**นี่ไม่ใช่บั๊กของ RCA — RCA ทำงานถูกต้องและกำลังบอกความจริงที่สำคัญ:**

> ข้อมูลจำลองสร้าง alarm แบบสุ่มตามความถี่ **โดยไม่ผูกกับค่าพารามิเตอร์จริง**
> ดังนั้น alarm "vacuum" จึงไม่ได้เกิดตอน `air_vacuum` ผิดปกติจริง

**คุณค่าที่ได้:** RCA Truth Test พิสูจน์ตัวเองแล้วว่า**จับความสัมพันธ์ปลอมได้**
ถ้ามันรายงาน Lift สูงบนข้อมูลที่ไม่มีความสัมพันธ์จริง แปลว่าเครื่องมือพัง — แต่มันไม่ทำ

**สิ่งที่ต้องทำ:** แก้ **simulator** ไม่ใช่แก้ RCA

```javascript
// ldi_simulator.js — ให้ alarm เกิดจากค่าพารามิเตอร์จริง
if (rec.air_vacuum > -10 && p.process === "DF INNER") emitAlarm("91009");
if (maxPE > rec.pe_setting * 0.9) emitAlarm("90005");
if (rec.temperature < 20 || rec.temperature > 24) emitAlarm("91008");
```

หลังแก้ Lift ควรขึ้นไป **> 2** ถ้ายังไม่ขึ้น แปลว่ามีบั๊กจริงใน RCA ที่ต้องหา

---

# P1 — Panel ที่ไม่แสดงข้อมูล (นับได้ 15 จุด)

## Engineering Drill-Down — เสียหายหนักที่สุด (10 panels)

```text
CPU Load · RAM Usage · Storage Saturation · Temperature      → "No data"
Memory Saturation · Network Bandwidth · Temperature Sensors   → "No data"
LDI Throughput · LDI Junction Efficiency · LDI Quality Scatter → "No data"
CPU Anomaly Score · Temperature Anomaly Score → "Data does not have a time field"
```

**สาเหตุที่ต่างกัน 2 กลุ่ม:**

- **"No data"** — query ถูกต้องแต่ไม่มีแถวตรงเงื่อนไข (ตัวแปร Machine/Interface ยังไม่ถูกเลือก)
- **"Data does not have a time field"** — query คืนผลลัพธ์แต่**ไม่มีคอลัมน์ `time`** ทั้งที่ panel เป็น timeseries → บั๊กจริงใน SQL

## AIOps & Capacity Forecast — 3 ใน 4 KPI เสีย

```text
DISK: Days Until Full  → No data
RAM:  Days Until Full  → No data
CPU:  Days Until Saturation → No data
Days Until Full (Resource Battery) → No data
Fleet Health Score 91.30% →  ทำงาน
```

## NOC Overview — ตัวเลขที่ไม่น่าเชื่อถือ

```text
CPU Load (Fleet Envelope)  → 0.00% แบนราบทั้งเส้น   ← ไม่ควรเป็น 0
RAM Saturation             → "AWAITING TELEMETRY"
Temperature Fleet Envelope → 65.0°C แบนราบ          ← เป็น temp ของ server ไม่ใช่ LDI
```

## Operator Andon — 2 panels ว่างเปล่าสนิท

```text
LIVE PRODUCTION            → ไม่มีเนื้อหาเลย
PE/JE VS SPEC LIMIT        → ไม่มีเนื้อหาเลย
```

**กระทบมากเป็นพิเศษ** เพราะ Andon คือจอที่คนงานใช้จริงตลอดกะ และ 2 panel นี้
คือส่วนที่บอกว่า "กำลังผลิตอะไรอยู่" กับ "คุณภาพงานเป็นยังไง"

---

# <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P2 — คุณภาพข้อมูลที่ตรวจพบเอง

หลักฐานจาก LDI Data Readiness (dashboard นี้ทำงานได้ดีมาก):

## ปัญหาจริงที่ระบบตรวจเจอเอง

| ตัวชี้วัด                 | ค่า           | ประเมิน                                                                                                              |
| ------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| Machine ID Match          | **100%**      | แก้จาก 20% เดิมได้แล้ว                                                                                               |
| Alarm Master Match        | **100%**      | แก้จาก 0% เดิมได้แล้ว                                                                                                |
| Telemetry Age / Alarm Age | 0.0 hour      | ข้อมูลสด                                                                                                             |
| **Board ID Completeness** | **8.0%**      | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> ตรงกับข้อมูลจริงที่ NULL 100% |
| **PE / JE4 Coverage**     | **45% / 45%** | ถูกต้อง (DF INNER ไม่วัด PE)                                                                                         |

## Duplicate Board Keys — พบเฉพาะ 2 เครื่อง

```text
LDI-01:  43,667 rows → 43,510 unique → 157 duplicate board keys
LDI-04:  28,683 rows → 28,562 unique → 121 duplicate
LDI-02,03,05..10:                        0 duplicate
```

**น่าสงสัยมาก** — ถ้าเป็นบั๊กของ generator ควรเกิดทุกเครื่องเท่ากัน
การที่เกิดเฉพาะ LDI-01 และ LDI-04 บ่งชี้ว่ามี logic บางอย่างต่างกัน
(ทั้งคู่เป็น DF INNER แต่ LDI-02, LDI-03 ก็ DF INNER เหมือนกันและไม่มีปัญหา)

**ต้องสืบ:** `UNIQUE INDEX idx_logid (log_id, time DESC)` ควรกันซ้ำได้อยู่แล้ว
→ แปลว่าซ้ำที่ระดับ `(mo, board_no)` ไม่ใช่ `log_id` = **อาจเป็นการนับ board ซ้ำจริง**

## Inferred Sensor Capability — ระบบตั้งข้อสังเกตเอง

```text
LDI-01..04:  Vacuum "CONSTANT - VERIFY"   Scan Speed "CONSTANT - VERIFY"
LDI-05..10:  Vacuum "ALL ZERO - VERIFY"
```

ระบบทำเครื่องหมายว่า "ค่าคงที่ตลอด — ควรตรวจสอบ" ซึ่ง**ถูกต้องตามข้อมูลจริง**
(recipe setting เป็นค่าคงที่จริง ไม่ใช่ค่าที่วัดได้) — แต่ควรเปลี่ยนข้อความเป็น
`"CONSTANT (recipe setting — expected)"` เพื่อไม่ให้เข้าใจผิดว่าเป็นปัญหา

## LDI-03 / LDI-04 แสดงสถานะ "stale" ใน NOC

ขณะที่ Data Readiness บอกว่า Telemetry Age = 0.0 hour → **ขัดแย้งกัน**
เป็นบั๊กของ NOC ที่ใช้ threshold ความสดต่างจาก Data Readiness

---

# <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P3 — หน่วยและการแสดงผล

```text
"255.03 currency-thb"   ← ควรเป็น ฿255.03
"574.00 currencyTHB"    ← ควรเป็น ฿574.00
Donut legend: "value value value"  ← ไม่มีชื่อ series
```

**ที่แก้ได้ดีแล้ว:** `µm`, `°C`, `%H`, `mm/s`, `kPa`, `mJ/cm²` แสดงถูกต้องทุกจุดใน
Machine Snapshot และ Manufacturing — บั๊ก `lengthum` หายไปหมดแล้ว

---

# สิ่งที่ทำงานได้ดีจริง (อย่าแก้)

| Dashboard             | สถานะ                                                                                             | หลักฐาน                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Machine Snapshot**  | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> สมบูรณ์    | ทุก panel มีข้อมูล · หน่วยถูกทุกตัว · PE/JE PASS · Cpk แยก PE/JE · Event timeline ระดับมิลลิวินาที |
| **Manufacturing**     | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> ดีมาก      | KPI ครบ · ตารางมีข้อมูล · compliance เขียวเป็นหลัก · RCA summary ท้ายหน้า                          |
| **Engineering & SPC** | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> ดี         | PE/JE 6+4 เส้นแยกได้ · histogram PE vs JE ซ้อนกัน · Cpk PE 1.253 / JE 2.710                        |
| **Data Readiness**    | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> ดีเยี่ยม   | ตรวจเจอปัญหาจริง 3 อย่างด้วยตัวเอง                                                                 |
| **Andon**             | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> ครึ่งเดียว | KPI + 10 machine tiles ทำงานดี · แต่ 2 panels ว่าง                                                 |

**จุดที่น่าประทับใจที่สุด:** Machine Capability Ranking แสดง **Cpk (PE) 1.253 กับ Cpk (JE) 2.710
แยกกันคนละคอลัมน์** พร้อม Worst Cpk และ Confidence — พิสูจน์ว่า JE Cpk ที่แยก base
ออกจาก PE ทำงานได้จริงตามที่ออกแบบ

---

# แผนตรวจสอบต่อเนื่อง (Audit Framework)

## เพิ่ม Layer C เข้าระบบอัตโนมัติ — จุดที่ขาดที่สุด

ระบบมี unit test + linter ครบแล้ว แต่**ไม่มีอะไรตรวจว่า panel คืนข้อมูลจริงหรือไม่**

```javascript
// tests/e2e/panel-data-check.js  (ใหม่)
// รัน query ของทุก panel จริงกับฐานข้อมูล แล้วตรวจว่าคืนแถว
for (const panel of allPanels) {
  const rows = await pg.query(resolveMacros(panel.rawSql));
  if (rows.length === 0) fail(`${dashboard}/${panel.title}: query คืน 0 แถว`);
  if (panel.type === "timeseries" && !rows.fields.includes("time"))
    fail(`${dashboard}/${panel.title}: timeseries ไม่มีคอลัมน์ time`);
}
```

**เกณฑ์ผ่าน:** ทุก panel คืน ≥1 แถว และ timeseries ทุกตัวมีคอลัมน์ `time`
→ check นี้จะจับ 15 panel ที่เสียอยู่ตอนนี้ได้ทั้งหมดโดยอัตโนมัติ

## เพิ่ม Cross-Dashboard Consistency Check

```sql
-- ตัวเลขชื่อเดียวกันบนหลาย dashboard ต้องมาจาก view เดียวกัน
-- ห้าม hardcode threshold ที่ควรมาจาก pe_setting/je_setting
```

**เกณฑ์ผ่าน:** ไม่มี query ไหนใช้ตัวเลข threshold ตายตัวสำหรับ PE/JE
(ต้องอ้าง `pe_setting` / `je_setting` จากฐานข้อมูลเสมอ)

---

# ลำดับลงมือ

| #   | งาน                                           | ความรุนแรง                                                                                | ผู้ได้ประโยชน์                           |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | **รวมสูตร Yield เป็น view เดียว**             | P0                                                                                        | ผู้บริหาร — เลิกเห็นตัวเลขขัดแย้ง        |
| 2   | **แก้ simulator ให้ alarm ผูกกับพารามิเตอร์** | P0                                                                                        | Process Engineer — RCA ใช้พิสูจน์ได้จริง |
| 3   | แก้ 2 panels ว่างใน Andon                     | P1                                                                                        | คนงานหน้าเครื่อง                         |
| 4   | แก้ 15 panels "No data"                       | P1                                                                                        | ทุกฝ่าย                                  |
| 5   | สืบ duplicate board keys (LDI-01/04)          | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P2 | QA — ตัวเลขนับบอร์ดอาจผิด                |
| 6   | เพิ่ม E2E panel-data check เข้า CI            | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P2 | ทีมพัฒนา — กันเกิดซ้ำ                    |
| 7   | แก้ currency unit + donut legend              | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P3 | ความเรียบร้อย                            |

---

# สรุปสำหรับแต่ละฝ่าย

**ผู้บริหาร:** ระบบใช้งานได้จริง 5 จาก 9 หน้า · มี 1 ปัญหาที่ต้องแก้ทันที
คือตัวเลข Yield ขัดแย้งกัน 87% vs 99.6% ซึ่งกระทบการตัดสินใจโดยตรง

**SRE / IT:** 15 panels ไม่คืนข้อมูล · ต้องเพิ่ม E2E check เพราะ linter ปัจจุบัน
ตรวจ syntax ผ่านหมดแต่ไม่ตรวจว่ามีข้อมูลจริง

**QA:** พบ duplicate board keys 157 และ 121 รายการบน LDI-01/LDI-04
ต้องสืบว่าเป็นการนับซ้ำจริงหรือบั๊กของข้อมูลจำลอง

**Process Engineer:** RCA Truth Test ทำงานถูกต้องและรายงานตรงว่า
ยังไม่มีความสัมพันธ์ที่พิสูจน์ได้ (Lift ≈ 1) — ต้องรอข้อมูลจริงหรือแก้ simulator ก่อน
จึงจะใช้สรุปสาเหตุได้ · Cpk (PE) 1.253 อยู่ในเกณฑ์ "ใช้ได้" แต่ต่ำกว่า 1.33 ที่เป็นมาตรฐาน
