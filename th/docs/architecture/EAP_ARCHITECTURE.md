<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>สถาปัตยกรรมชั้นเชื่อมต่อเครื่องจักรอุตสาหกรรม (EAP)</h1>
  <p><b>รูปแบบอะแดปเตอร์ Equipment Automation Program (EAP), การรับข้อมูลหลายโปรโตคอล, สัญญารองรับ SECS/GEM และแคตตาล็อกเครื่องจักร</b></p>
  <p>
    <a href="../../../docs/architecture/EAP_ARCHITECTURE.md">English</a> |
    <a href="EAP_ARCHITECTURE.md">ไทย</a> |
    <a href="../../../zh-CN/docs/architecture/EAP_ARCHITECTURE.md">简体中文</a>
  </p>
</div>

---

> **EAP = Equipment Automation Program** — การเชื่อมต่อเครื่องจักรตามมาตรฐาน SECS/GEM ตามขอบเขตงานที่ได้รับยืนยัน (ไม่ใช่องค์กร "Enterprise Application Platform") ดูรายละเอียดใน `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §3
>
> **ข้อเท็จจริงของระบบ:** IMS เป็นระบบสำหรับเฝ้าระวังและมอนิเตอร์เท่านั้น (Monitoring-only) ทำหน้าที่อ่านข้อมูลโทรมาตรและส่งสัญญาณเตือน โดยไม่มีการส่งคำสั่งควบคุม, ไม่ดาวน์โหลดสูตรการผลิต (Recipes) และไม่เก็บสถานะของเครื่องจักร ปัจจุบันเครื่องจักร LDI ในระบบเชื่อมต่อผ่านโพลลิ่ง SNMP และ HTTP API เอกสารฉบับนี้ไม่ได้อ้างว่าระบบรองรับ SECS/GEM แบบสมบูรณ์ แต่เป็นการจัดทำเอกสารสำหรับอะแดปเตอร์ที่ใช้งานจริง และกำหนดสัญญามาตรฐานสำหรับเครื่องจักรในอนาคต
>
> **ที่มา:** คำอธิบายอะแดปเตอร์ SNMP และ HTTP/JSON ได้รับการตรวจสอบตรงกับ `nodered_data/flows/ingestion.json`, `nodered_data/flows/ldi_ingestion.json` และ `scripts/mock/eap-mock-data.js`

---

## 1. ภาพรวมสถาปัตยกรรมอะแดปเตอร์ EAP (EAP Topology)

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: adapter สำหรับเชื่อมต่ออุปกรณ์
  accDescr: มี adapter อยู่ 3 แบบ: การ poll SNMP และการรับข้อมูล HTTP ใน Node-RED ซึ่งค้นหาเครื่องใน public.devices และการอ่านฐานข้อมูล eap_backup โดยตรง alarm ของ LDI มาจากตัวจำลอง alarm หรือการนำเข้าข้อมูลจริง ส่วน adapter SECS/GEM มีข้อกำหนดแต่ยังไม่ได้สร้าง
  S1["เซิร์ฟเวอร์และสวิตช์ · SNMP v2c"]:::ext
  S2["เครื่อง LDI · HTTP JSON"]:::ext
  S3["ฐานข้อมูล EAP ของโรงงาน · Drilling และ VCP"]:::ext
  S4["อุปกรณ์ SECS/GEM"]:::future
  A1["Adapter 1 · SNMP poller<br/>ingestion.json · 30 วินาที"]:::flow
  A2["Adapter 2 · การรับข้อมูล HTTP<br/>ldi_ingestion.json"]:::flow
  A3["Adapter 3 · อ่านฐานข้อมูลโดยตรง<br/>data source drilling-timescaledb"]:::app
  A4["Adapter 4 · SECS/GEM<br/>มีแค่ข้อกำหนด"]:::future
  ASRC["แหล่งที่มาของ alarm<br/>ldi_alarm_simulator.json · import-real-data.sh"]:::flow
  DEV[("public.devices<br/>ทะเบียนอุปกรณ์")]:::store
  HSYS[("sys_metrics · net_metrics")]:::store
  HLDI[("ldi_data")]:::store
  ALM[("ldi_alarm_log · ldi_alarm_ms_code")]:::store
  EAPDB[("eap_backup<br/>machine_event · vcp_upp · vcp_alarm")]:::store
  GRAF["Grafana · 22 แดชบอร์ด"]:::viz
  S1 --> A1 --> HSYS
  S2 --> A2 --> HLDI
  DEV -.->|"ค้นหา"| A1
  DEV -.->|"ค้นหา"| A2
  S3 -.->|"สำเนาที่กู้คืน"| EAPDB
  EAPDB --> A3 --> GRAF
  ASRC --> ALM
  S4 -.-> A4 -.-> DEV
  HSYS --> GRAF
  HLDI --> GRAF
  ALM --> GRAF

  subgraph LEGEND["คำอธิบายสัญลักษณ์ · ลูกศร = ทิศทางข้อมูล"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_ext["ระบบภายนอก"]:::ext ~~~ LG_flow["โฟลว์ Node-RED"]:::flow ~~~ LG_app["บริการของ IMS"]:::app ~~~ LG_store["ที่เก็บข้อมูล"]:::store ~~~ LG_viz["Grafana / UI"]:::viz
    end
    subgraph LEGEND_1[" "]
      direction LR
      LG_future["ยังไม่ได้สร้าง"]:::future
    end
    LEGEND_0 ~~~ LEGEND_1
  end
  GRAF ~~~ LEGEND
  style LEGEND fill:transparent,stroke:#94a3b8,stroke-dasharray:3 3
  style LEGEND_0 fill:transparent,stroke:transparent
  style LEGEND_1 fill:transparent,stroke:transparent
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

---

## 2. รายละเอียดสัญญาของอะแดปเตอร์ทั้ง 4 รูปแบบ

หน้าที่ของทุกอะแดปเตอร์เหมือนกันทั้งหมดไม่ว่าจะเชื่อมต่อด้วยโปรโตคอลใด: รับข้อมูลโทรมาตรและเหตุการณ์การแจ้งเตือนจากอุปกรณ์จริงหรืออุปกรณ์จำลอง แล้วนำเข้าสู่ `public.devices` และตาราง Hypertable ที่สอดคล้องกัน โดยใช้ `device_id` เป็นคีย์หลักในการเชื่อมโยงข้อมูลไปยังแดชบอร์ด, วิว SPC/RCA และบันทึกประวัติทั้งหมด

### อะแดปเตอร์ 1 — SNMP (อุปกรณ์โครงสร้างพื้นฐาน IT/OT)
* **ตำแหน่งโค้ด:** `nodered_data/flows/ingestion.json` (แท็บ "IMS Ingestion Pipeline")
* **โมเดลอุปกรณ์:** แถวใน `public.devices` ที่มี `device_type IN ('server','workstation','network')` โดยเก็บ `hostname`, `ip_address`, `snmp_community`, `snmp_port`, `poll_interval`
* **แผนการเก็บข้อมูล:** ทุก 30 วินาที โหนด `fork_5_ways` จะส่งตัวอ่าน SNMP v2c แบบขนาน (CPU, พื้นที่จัดเก็บ, เครือข่าย, อุณหภูมิ, LDI OIDs)
* **การเก็บเหตุการณ์/แจ้งเตือน:** ไม่มีในระดับโปรโตคอล อะแดปเตอร์นี้เก็บเฉพาะโทรมาตร ส่วนการแจ้งเตือนจะถูกคำนวณปลายทางจากเกณฑ์ Threshold
* **การแมปข้อมูล:** `sre_parser` จัดการสถานะรายเครื่องและบันทึกข้อมูลแบบ Batch ลงใน `sys_metrics`, `net_metrics` และ `ldi_metrics`

### อะแดปเตอร์ 2 — HTTP/JSON (โทรมาตรการผลิต LDI)
* **ตำแหน่งโค้ด:** `nodered_data/flows/ldi_ingestion.json` (แท็บ "IMS LDI Ingestion")
* **โมเดลอุปกรณ์:** แถวใน `public.devices` ที่มี `device_type='ldi'`, `process_type='ldi'` (ไมเกรชัน 067/068)
* **แผนการเก็บข้อมูล:** อุปกรณ์ส่ง HTTP POST เป็น JSON Array ไปยัง `POST /ldi-telemetry` (ยืนยันตัวตนด้วย `x-api-key`) แต่ละรายการมี `eqp_id` (แมปกับ `device_id`), ค่า PE1-6, JE1-4, ความหนาแผ่น, ความเร็วสแกน และปริมาณสารเคลือบ
* **การเก็บเหตุการณ์/แจ้งเตือน:** ระบบส่งเหตุการณ์คู่ขนานเขียนลง `public.ldi_alarm_log` โดยเชื่อมโยงผ่าน `device_id` + `event_id`
* **การแมปข้อมูล:** บันทึกลง `public.ldi_data` แบบ Batch พร้อมคำสั่ง `ON CONFLICT (log_id, "time") DO NOTHING`

### อะแดปเตอร์ 3 — EAP Stand-In Adapter (งานเจาะ CNC และสายชุบ VCP)
* **ตำแหน่งโค้ด:** `scripts/mock/eap-mock-data.js` และ `database/mock/eap_backup-schema.sql`
* **โมเดลอุปกรณ์:** เครื่องเจาะ CNC (`drl001`–`drl010`) และสายชุบ VCP (`vcp001`–`vcp005`)
* **แผนการเก็บข้อมูล:** จำลองรอบการทำงานจริงของเครื่องจักร:
  - **งานเจาะ (Drilling):** การเริ่มโปรแกรม, ความเร็วรอบหัวเจาะ (RPM), อัตราป้อน (Feed Rate), Spindle Mask, อายุการใช้งานดอกสว่าน และรายงานสรุปกะ
  - **งานชุบ (VCP):** สถานะสายพาน (RUN, IDLE, DOWN), กระแสไฟฟ้าของชุดแปลงไฟ, อุณหภูมิอ่างเคมี และความสัมพันธ์ความเร็ว ($\text{plating\_time} \times \text{line\_speed} = 54$)
* **การแมปข้อมูล:** นำเข้าสู่ฐานข้อมูล `eap_backup` ในตาราง `machine_event`, `vcp_upp`, `catalog.object_registry` ส่งข้อมูลไปยังแดชบอร์ดงานเจาะ 4 ตัวและ VCP 3 ตัว

### อะแดปเตอร์ 4 — สัญญา SECS/GEM (สำหรับเครื่องจักรจริงในอนาคต)
ปัจจุบันยังไม่มีโค้ดทำงานจริงสำหรับอะแดปเตอร์นี้ เมื่อมีการนำเครื่องจักรที่รองรับ SECS/GEM จริงมาติดตั้ง จะต้องปฏิบัติตามสัญญานี้:

| แนวคิด EAP | สิ่งที่อะแดปเตอร์ต้องจัดเตรียม | เป้าหมายในสถาปัตยกรรม |
|---|---|---|
| **การลงทะเบียนอุปกรณ์** | บันทึกรหัสอุปกรณ์ใน `public.devices` (`device_id`, `device_type`, `process_type`) | แคตตาล็อก `public.devices` |
| **รายงานเหตุการณ์ (CEID)** | แปลงรายงานเหตุการณ์ SECS-II เป็นแถวการแจ้งเตือนตาม `device_id` | `<process>_alarm_ms_code` และ Log |
| **ตัวแปรสถานะ (SVID/ECID)** | แปลงรายงานตัวแปร SECS-II ลงตาราง Hypertable ตาม `(device_id, time)` | ตาราง `public.<process>_data` |
| **การควบคุมเวอร์ชัน** | กำหนดเวอร์ชันของ Schema สัญญาอย่างชัดเจน (`adapter-contract-v1`) | API Gateway และตัวตรวจ Ingestion |

---

## 3. ขอบเขตความปลอดภัยระดับอุตสาหกรรม (IEC 62443 Boundaries)

การเชื่อมต่อกับเครื่องจักรในโรงงานจริงเป็นการข้ามขอบเขตเครือข่าย Operational Technology (OT):
* **ขอบเขตที่ 1 (ทางเข้าหลัก):** nginx reverse proxy ปัจจุบัน **ให้บริการเป็น HTTP ธรรมดา ยังไม่ได้ตั้งค่า TLS** เส้นทาง `/alarm-api/` และ `/factory-twin-3d/` ต้องมี session ของ Grafana ที่ถูกต้อง (`auth_request`) ส่วน `/ldi-telemetry` และ `/inject` ต้องมี header `X-API-Key` ซึ่ง Node-RED เป็นผู้ตรวจ และมีการจำกัดอัตราคำขอ
* **ขอบเขตที่ 2 (service ภายใน):** service ต่าง ๆ เชื่อมต่อ TimescaleDB ผ่าน PgBouncer โหมด transaction pooling บนเครือข่ายภายในของ Docker โดยแต่ละ service ใช้ role ของตัวเอง (ดู `docs/data/DATA_GOVERNANCE.md`) และ `alarm-api` ใช้ query แบบ parameterised
* **ขอบเขตที่ 3 (เครือข่ายเครื่องจักรในโรงงาน):** การเชื่อมต่อของอะแดปเตอร์ 4 ในอนาคตจะต้องมีไฟร์วอลล์ OT กั้นเฉพาะ, มีการจำกัดสิทธิ์ mTLS / IP Whitelisting และอ่านข้อมูลแบบทางเดียว (Read-only tap) เพื่อป้องกันไม่ให้ส่งคำสั่งควบคุมกลับไปยังเครื่องจักรจริง

---

[⬅️ กลับสู่ภาพรวมสถาปัตยกรรม](ARCHITECTURE.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> หน้าหลักคลังข้อมูล](../../README.md)
