<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>เทมเพลต Blameless Post-Mortem และการทบทวนเหตุการณ์ขัดข้องระดับองค์กร</h1>
  <p><b>การวิเคราะห์สาเหตุที่แท้จริง (RCA), การเรียงลำดับเหตุการณ์, การประเมินผลกระทบต่อ SLO Error Budget และการกำกับดูแลแผนปฏิบัติการป้องกัน</b></p>
  <p>
    <a href="../../../../docs/sre/postmortems/TEMPLATE.md">English</a> |
    <a href="TEMPLATE.md">ไทย</a> |
    <a href="../../../../zh-CN/docs/sre/postmortems/TEMPLATE.md">简体中文</a>
  </p>
</div>

---

> **ปรัชญาหลักของ Post-Mortem (วัฒนธรรมไร้การกล่าวโทษ):**  
> เรายึดมั่นใน **Blameless Culture** (ตามมาตรฐาน Google SRE / Etsy) โดยเชื่อมั่นว่าวิศวกรทุกคนตัดสินใจและปฏิบัติหน้าที่อย่างดีที่สุดด้วยข้อมูลที่มีในขณะนั้น การทำ Post-mortem มีขึ้นเพื่อตรวจสอบ **ช่องโหว่เชิงระบบ, ขอบเขตสถาปัตยกรรม, ความล้มเหลวของระบบอัตโนมัติ และเครื่องมือปฏิบัติการ** โดยไม่มีการจับผิดหรือลงโทษบุคคล

---

## 1. ข้อมูลภาพรวมเหตุการณ์และข้อมูลจำเพาะ (Incident Overview)

| คุณลักษณะเหตุการณ์ | ค่าที่ระบุ |
|---|---|
| **ชื่อเหตุการณ์** | `[INC-YYYYMMDD-SEVX] ระบุชื่อเหตุการณ์ที่กระชับและชัดเจน` |
| **ระดับความรุนแรง** | **SEV-1** (ระบบหยุดทำงานวิกฤต) \| **SEV-2** (ประสิทธิภาพลดลงอย่างรุนแรง) \| **SEV-3** (เหตุการณ์ผิดปกติเล็กน้อย) |
| **วันที่เกิดเหตุการณ์** | `YYYY-MM-DD` |
| **ผู้บัญชาการเหตุการณ์ (IC)** | `@incident-commander` |
| **วิศวกร SRE หัวหน้าทีมสอบสวน** | `@sre-lead` |
| **ผู้รับผิดชอบการสื่อสาร** | `@comms-lead` |
| **บริการที่ได้รับผลกระทบ** | `ims-timescaledb`, `ims-node-red`, `ims-pgbouncer`, `ims-grafana` |
| **สถานะปัจจุบัน** | `[ ร่างเอกสาร | อยู่ระหว่างการตรวจทาน | อนุมัติและเริ่มแผนงาน | ปิดสมบูรณ์ ]` |

---

## 2. บทสรุปสำหรับผู้บริหารและการประเมินผลกระทบ (Summary & Impact)

### บทสรุปสำหรับผู้บริหาร (Executive Summary)
*(ระบุสรุปความยาว 2-3 ย่อหน้า อธิบายสิ่งที่ล้มเหลว, สิ่งกระตุ้นให้เกิดปัญหา, ขอบเขตความเสียหาย และวิธีที่กู้คืนระบบกลับมา)*

### ผลกระทบต่อธุรกิจและการปฏิบัติการ (Business & Operational Impact)
* **ระยะเวลาที่เกิดเหตุการณ์ทั้งหมด:** `XX ชั่วโมง YY นาที`
* **ระยะเวลาที่ข้อมูลโทรมาตรหยุดชะงัก (Blackout):** `XX นาที`
* **จำนวนข้อมูลโทรมาตรที่สูญหาย / ตกหล่น:** `~X,XXX รายการ`
* **สายการผลิตที่ได้รับผลกระทบ:** `[เช่น สายการผลิต LDI Photolithography 1–4, หัวเจาะ CNC Drilling 01–12]`
* **การใช้นโยบายงบประมาณข้อผิดพลาด (SLO Error Budget):**
  - Ingestion Availability SLO (99.9% ต่อเดือน): ใช้งบประมาณไป **XX.X%** ของงบ 30 วัน
  - Query Latency SLO (P95 < 500ms): ใช้งบประมาณไป **YY.Y%**

$$\text{Error Budget Burn Rate} = \frac{\text{Observed Error Rate}}{\text{Allowed Error Rate}} = \frac{1 - \text{SLI}}{1 - \text{SLO}}$$
*(อัตราการเผาผลาญ Error Budget = อัตราข้อผิดพลาดที่เกิดขึ้นจริง / อัตราข้อผิดพลาดที่ยอมรับได้)*

---

## 3. ดัชนีชี้วัดวงจรชีวิตของเหตุการณ์ (Incident Lifecycle Metrics)

```text
เวลาตรวจพบ (TTD)       เวลารับทราบปัญหา (TTA)      เวลาบรรเทาผลกระทบ (TTM)      เวลาแก้ไขสมบูรณ์ (TTR)
    [ 4 นาที ] ------------ [ 2 นาที ] ------------- [ 18 นาที ] ------------ [ 35 นาที ]
```

* **เวลาตรวจพบ (Time to Detect - TTD):** `4 นาที` (นับจากเกิดปัญหาจนกระทั่ง Alertmanager ส่งการแจ้งเตือน)
* **เวลารับทราบปัญหา (Time to Acknowledge - TTA):** `2 นาที` (นับจากได้รับแจ้งเตือนจนกระทั่งวิศวกร On-call เริ่มตรวจสอบ)
* **เวลาบรรเทาผลกระทบ (Time to Mitigate - TTM):** `18 นาที` (นับจากเริ่มตรวจจนกระทั่งระบบกลับมาทำงานได้ชั่วคราว)
* **เวลาแก้ไขเสร็จสิ้นสมบูรณ์ (Time to Resolve - TTR):** `35 นาที` (นับจากเริ่มตรวจจนกระทั่งปล่อยแพตช์ถาวรและเคลียร์คิวข้อมูลสำเร็จ)

---

## 4. ลำดับเหตุการณ์และแผนภาพกระบวนการ (Incident Timeline)

บันทึกเวลาทั้งหมดต้องระบุทั้งเวลาสากล **UTC** และเวลาประเทศไทย **ICT (UTC+7)**

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
sequenceDiagram
  accTitle: ตัวอย่าง timeline ของเหตุการณ์ (ให้แทนด้วยของจริง)
  accDescr: timeline ตัวอย่างของเหตุการณ์ connection pool เต็ม: ตรวจพบจากการแจ้งเตือน ประกาศเหตุการณ์ แก้ไข และกู้คืน
  autonumber
  participant Mon as Prometheus / Alertmanager
  participant On as SRE เวร
  participant Pipe as Node-RED
  participant DB as PgBouncer / TimescaleDB
  participant IC as ผู้บัญชาการเหตุการณ์
  Note over Mon,IC: ตัวอย่างเท่านั้น — ให้แทนด้วย timeline จริง
  Pipe->>DB: insert จำนวนมากพร้อมกัน
  DB-->>Pipe: pool เต็ม
  Mon->>On: การแจ้งเตือนทำงาน
  On->>IC: ประกาศเหตุการณ์
  IC->>DB: ตรวจ pool และแก้ไข
  DB-->>Pipe: commit กลับมาทำงาน
  IC->>On: แก้ไขแล้ว เฝ้าติดตาม
```

### บันทึกเหตุการณ์ตามเวลาอย่างละเอียด
* `14:02 ICT (07:02 UTC)` — เครื่องจักรเชื่อมต่อเครือข่ายกลับเข้ามาพร้อมส่งข้อมูลสะสมจำนวนมาก
* `14:04 ICT (07:04 UTC)` — การเชื่อมต่อไปยัง `ims-pgbouncer` ชนเพดานที่กำหนดไว้ (`max_client_conn`)
* `14:06 ICT (07:06 UTC)` — Prometheus ตรวจพบความล่าช้าและส่งแจ้งเตือน `HighIngestionLatency` ไปยัง Alertmanager
* `14:08 ICT (07:08 UTC)` — วิศวกร SRE On-call รับทราบเหตุการณ์และเปิดวอร์รูมแก้ไขปัญหา
* `14:15 ICT (07:15 UTC)` — ตรวจพบว่าคิวรีที่ไม่มีดัชนีส่งผลให้การทำธุรกรรมค้างและยึดช่องการเชื่อมต่อไว้
* `14:24 ICT (07:24 UTC)` — ใช้คำสั่ง `docker exec ims-pgbouncer kill -HUP 1` เพื่อขยายขนาด Pool อย่างเร่งด่วน
* `14:39 ICT (07:39 UTC)` — ข้อมูลในคิวถูกเขียนลงฐานข้อมูลจนหมด และ Ingestion Latency กลับสู่ระดับปกติที่ 180ms

---

## 5. การวิเคราะห์หาสาเหตุที่แท้จริง (5 Whys Root Cause Analysis)

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TD
  accTitle: ตัวอย่าง 5 Whys (ให้แทนด้วยการวิเคราะห์จริง)
  accDescr: ตัวอย่างลำดับคำถาม 5 Whys จนถึงสาเหตุหลัก
  W1["1 · ทำไมแดชบอร์ดไม่อัปเดต"]:::app
  W2["2 · ทำไมการรับข้อมูลหยุด"]:::app
  W3["3 · ทำไมการเชื่อมต่อถูกปฏิเสธ"]:::app
  W4["4 · ทำไม pool เต็ม"]:::app
  W5["5 · สาเหตุหลัก: ไม่คืน connection ในเส้นทาง error"]:::notify
  W1 --> W2 --> W3 --> W4 --> W5
  classDef actor fill:#475569,stroke:#1e293b,color:#ffffff,stroke-width:1px
  classDef ext fill:#57534e,stroke:#292524,color:#ffffff,stroke-width:1px
  classDef ingress fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff,stroke-width:1px
  classDef app fill:#0f766e,stroke:#134e4a,color:#ffffff,stroke-width:1px
  classDef flow fill:#0e7490,stroke:#164e63,color:#ffffff,stroke-width:1px
  classDef store fill:#b45309,stroke:#78350f,color:#ffffff,stroke-width:1px
  classDef viz fill:#4338ca,stroke:#312e81,color:#ffffff,stroke-width:1px
  classDef obs fill:#6d28d9,stroke:#4c1d95,color:#ffffff,stroke-width:1px
  classDef notify fill:#b91c1c,stroke:#7f1d1d,color:#ffffff,stroke-width:1px
  classDef future fill:#f8fafc,stroke:#94a3b8,color:#475569,stroke-width:1px,stroke-dasharray:4 3
```

1. **ทำไมแดชบอร์ด Grafana จึงแสดงข้อมูลโทรมาตรค้าง?**  
   พาเนล Real-time ไม่ได้รับแถวข้อมูลใหม่จากตาราง `public.ldi_data`
2. **ทำไมข้อมูลโทรมาตรจึงค้างอยู่ใน Node-RED?**  
   ไปป์ไลน์ Node-RED ติดปัญหา Backpressure เนื่องจากเกิด Timeout ในการ Insert ข้อมูลลงฐานข้อมูล
3. **ทำไม PgBouncer จึงปฏิเสธการเชื่อมต่อ?**  
   จำนวน Client Connection ที่กำลังใช้งานอยู่ชนขีดจำกัดสูงสุดของ `default_pool_size`
4. **ทำไม Connection Pool จึงถูกใช้งานจนหมด?**  
   การเชื่อมต่อถูกเปิดค้างไว้ระหว่างที่รอการเชื่อมต่อเครือข่ายใหม่จากต้นทาง
5. **ทำไมการเชื่อมต่อจึงค้างอยู่ไม่ยอมปิด (สาเหตุที่แท้จริง)?**  
   โค้ดในบล็อกจัดการข้อผิดพลาด (Exception Handler) ของตัวห่อหุ้มฐานข้อมูลใน Node-RED ขาดคำสั่ง `client.release()` เมื่อเกิด Socket Abort

---

## 6. คำสั่งคิวรีสำหรับวินิจฉัยปัญหา (PromQL & SQL)

คิวรีที่ทีมวิศวกรใช้ในการวินิจฉัยปัญหาขณะเกิดเหตุการณ์จริง:

```promql
# 1. ความสดของไปป์ไลน์: จำนวนวินาทีนับจากการ flush สำเร็จครั้งล่าสุด
time() - max(ims_pipeline_last_flush_timestamp_seconds)

# 2. สัดส่วน insert ที่ล้มเหลว (ไม่มี exporter ของ PgBouncer ให้ใช้ SHOW POOLS ดูสถานะ pool)
sum(rate(ims_pipeline_inserts_failed_total[5m])) / clamp_min(sum(rate(ims_pipeline_inserts_total[5m])), 1e-9)

# 3. buffer ล้น (ข้อมูลที่ถูกทิ้งก่อน insert)
sum(rate(ims_pipeline_buffer_overflows_total[5m]))
```

```sql
-- ตรวจสอบทรานแซกชันที่กำลังทำงานค้างอยู่ในฐานข้อมูล
SELECT pid, now() - xact_start AS duration, query, state
FROM pg_stat_activity
WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC
LIMIT 10;
```

---

## 7. บทเรียนที่ได้รับและการทบทวนย้อนหลัง (Retrospective)

### สิ่งที่ทำได้ดี (What Went Well)
* ระบบแจ้งเตือนอัตโนมัติของ Prometheus ส่งสัญญาณเตือนได้ภายใน 4 นาที
* ระบบ Watchdog ป้องกันไม่ให้เกิดปัญหาหน่วยความจำรั่วไหลใน `ims-timescaledb`
* การประสานงานระหว่างทีมหน้างาน OT ในโรงงานและทีม IT/SRE เป็นไปอย่างราบรื่น

### สิ่งที่ควรปรับปรุง (What Went Wrong)
* เอกสาร Runbook ขาดคำสั่งตัวอย่างที่ชัดเจนในการสั่ง Hot-reload ค่าคอนฟิกของ PgBouncer โดยไม่ต้องรีสตาร์ตคอนเทนเนอร์
* โค้ดส่วนจัดการ Error ใน Node-RED ขาดการทดสอบ Unit Test ครอบคลุมเคสผิดปกติ

### จุดที่เราโชคดี (Where We Got Lucky)
* ปัญหาเกิดขึ้นในช่วงเปลี่ยนกะการทำงานพอดี ทำให้ไม่มีแผงวงจร PCB เสียหายจากการผลิต
* เครือข่ายสำรอง (Secondary Interface) ช่วยป้องกันไม่ให้เกตเวย์หลุดการเชื่อมต่อไปทั้งหมด

---

## 8. แผนปฏิบัติการแก้ไขและป้องกันปัญหา (Corrective Action Items)

| รหัสรายการ | หมวดหมู่ | รายละเอียดแผนงานที่ต้องปฏิบัติ | ลำดับความสำคัญ | ผู้รับผิดชอบ | กำหนดเสร็จ | ตั๋วอ้างอิง |
|---|---|---|---|---|---|---|
| **ACT-01** | **ป้องกัน (Prevent)** | แก้ไขคำสั่งคืน Connection ใน Node-RED Error Handler พร้อมเพิ่ม Regression Test | `P0` | `@engineer-dev` | `YYYY-MM-DD` | `PR #XXX` |
| **ACT-02** | **ตรวจจับ (Detect)** | เพิ่ม Alert Rule ใน Prometheus แจ้งเตือนเมื่อ PgBouncer มีการรอคิว (`waiting_clients > 10`) | `P1` | `@sre-lead` | `YYYY-MM-DD` | `ISSUE-YYY` |
| **ACT-03** | **บรรเทา (Mitigate)** | เพิ่มคู่มือคำสั่ง PgBouncer Hot-reload (`RELOAD` / `kill -HUP`) ลงใน Incident Playbook | `P1` | `@sre-lead` | `YYYY-MM-DD` | `DOCS-ZZZ` |
| **ACT-04** | **กระบวนการ (Process)** | จัดการซ้อม Chaos Drill จำลองเหตุการณ์ Pool เต็มในทั้ง 4 โดเมนเครื่องจักร | `P2` | `@qa-team` | `YYYY-MM-DD` | `DR-TEST-AAA` |

---

[⬅️ กลับสู่ดัชนี SRE](../SLO_DEFINITIONS.md) | [<img src="../../../../docs/assets/icons/home.svg" width="18" align="center" /> หน้าหลักคลังข้อมูล](../../../README.md)
