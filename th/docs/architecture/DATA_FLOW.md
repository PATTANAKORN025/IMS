<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>สถาปัตยกรรมการไหลของข้อมูลโทรมาตรและไปป์ไลน์ IMS (Data Flow Architecture)</h1>
  <p><b>ไปป์ไลน์รับข้อมูลหลายโดเมน, การแปลงข้อมูลใน Node-RED Sandbox, การจัดการ Connection Pool ด้วย PgBouncer, ผลรวมต่อเนื่อง TimescaleDB CAGG และการแสดงผลบน Grafana</b></p>
  <p>
    <a href="../../../docs/architecture/DATA_FLOW.md">English</a> |
    <a href="DATA_FLOW.md">ไทย</a> |
    <a href="../../../zh-CN/docs/architecture/DATA_FLOW.md">简体中文</a>
  </p>
</div>

---

> **กลุ่มเป้าหมายผู้ใช้งาน:** วิศวกร SRE / ทีมปฏิบัติการ, วิศวกรข้อมูล, สถาปนิกซอฟต์แวร์, ทีมตรวจสอบคุณภาพและความปลอดภัย  
> **ขอบเขตข้อมูลโทรมาตร:** ครอบคลุม 4 โดเมนอุตสาหกรรม (โครงสร้างพื้นฐาน IT/OT, กระบวนการผลิต LDI Photolithography, ฝูงเครื่องเจาะ CNC Drilling, สายชุบโลหะ VCP Electroplating)  
> **ที่มา:** ทุกตาราง, วิว, โหนดฟังก์ชัน และ Continuous Aggregate ได้รับการตรวจสอบตรงกับฐานข้อมูลจริง (`timescaledb_information.continuous_aggregates`), ไมเกรชัน 013–091 และ Node-RED Flows ที่กำลังรันอยู่

---

## 1. ภาพรวมสถาปัตยกรรมไปป์ไลน์ข้อมูลแบบหลายโดเมน (Pipeline Topology)

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: การไหลของข้อมูลตั้งแต่ต้นจนจบ
  accDescr: ข้อมูล SNMP และ LDI เข้าผ่าน Node-RED และ PgBouncer สู่ฐานข้อมูล ims โดย ingest_staging ปกป้อง batch ของ LDI และมี continuous aggregate กับการบีบอัดทำงานอยู่ ข้อมูล Drilling และ VCP อยู่ใน eap_backup Grafana อ่านทั้งสองฐานข้อมูล และการแจ้งเตือนออกผ่าน Node-RED

  SNMP["เซิร์ฟเวอร์ · สวิตช์<br/>SNMP v2c, poll ทุก 30 วินาที"]:::ext
  LDIM["เครื่อง LDI<br/>POST /ldi-telemetry"]:::ext
  EAPSRC["ฐานข้อมูล EAP ของโรงงาน<br/>Drilling · VCP"]:::ext

  NRS["ingestion.json<br/>fork_5_ways → Parser v9"]:::flow
  NRL["ldi_ingestion.json<br/>ตรวจสอบ → stage → insert"]:::flow
  PGB["PgBouncer :5432<br/>transaction pool · SCRAM"]:::app

  subgraph IMSDB["ฐานข้อมูล ims"]
    STG[("ingest_staging<br/>ตาราง write-ahead")]:::store
    HSYS[("sys_metrics · net_metrics · ldi_metrics<br/>hypertable, chunk 1 วัน")]:::store
    HLDI[("ldi_data<br/>hypertable, chunk 1 วัน")]:::store
    HALM[("ldi_alarm_log<br/>hypertable, chunk 7 วัน")]:::store
    CAGG[("continuous aggregate<br/>ldi_data_1m → 15m → 1h · *_hourly")]:::store
    COMP[("chunk ที่บีบอัดหลัง 7 วัน<br/>segment by eqp_id · device_id")]:::store
  end
  subgraph EAPDB["ฐานข้อมูล eap_backup"]
    EDRL[("machine_event · agent_log")]:::store
    EVCP[("vcp_upp · vcp_alarm · vcp_status_change")]:::store
  end

  GRAF["Grafana · 22 แดชบอร์ด"]:::viz
  PROM["Prometheus → Alertmanager"]:::obs
  HOOK["alerting.json · /alert-webhook"]:::flow
  NOTIFY["LINE · MS Teams"]:::notify

  SNMP --> NRS
  LDIM --> NRL
  NRS -->|"nodered_writer"| PGB
  NRL -->|"nodered_writer"| PGB
  PGB --> STG
  PGB --> HSYS
  PGB --> HLDI
  PGB --> HALM
  HLDI --> CAGG
  HSYS --> CAGG
  HLDI --> COMP
  HSYS --> COMP
  EAPSRC -.->|"สำเนาที่กู้คืน"| EDRL
  EAPSRC -.-> EVCP
  CAGG --> GRAF
  HLDI --> GRAF
  HALM --> GRAF
  EDRL -->|"drilling-timescaledb"| GRAF
  EVCP -->|"drilling-timescaledb"| GRAF
  NRS -->|"/metrics"| PROM
  PROM --> HOOK
  GRAF -->|"กฎแจ้งเตือน"| HOOK
  HOOK --> NOTIFY

  subgraph LEGEND["คำอธิบายสัญลักษณ์ · ลูกศร = ทิศทางข้อมูล"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_ext["ระบบภายนอก"]:::ext ~~~ LG_flow["โฟลว์ Node-RED"]:::flow ~~~ LG_app["บริการของ IMS"]:::app ~~~ LG_store["ที่เก็บข้อมูล"]:::store ~~~ LG_viz["Grafana / UI"]:::viz
    end
    subgraph LEGEND_1[" "]
      direction LR
      LG_obs["การเฝ้าระวัง"]:::obs ~~~ LG_notify["การแจ้งเตือน"]:::notify
    end
    LEGEND_0 ~~~ LEGEND_1
  end
  NOTIFY ~~~ LEGEND
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

## 2. รูปแบบโค้ดการแปลงข้อมูลและการจัดการหน่วยความจำใน Node-RED

ภายใน **ไปป์ไลน์รับข้อมูลของ Node-RED** โหนดฟังก์ชันทำงานภายใต้ V8 Sandbox ที่ไม่อนุญาตให้ใช้คำสั่ง `require()` โมดูลภายนอกทั้งหมดจะต้องถูกเรียกผ่าน `global.get()` เพื่อป้องกันปัญหาหน่วยความจำรั่วไหลระหว่างที่ข้อมูลหลั่งไหลเข้ามาอย่างหนาแน่น (>100,000 เหตุการณ์/วินาที) โค้ดทั้งหมดต้องทำงานแบบ **O(N) Single-Pass** พร้อมคำสั่ง **คืนหน่วยความจำขยะ (Explicit GC)** เสมอ:

```javascript
// ตัวอย่าง: โค้ดฟังก์ชันใน Node-RED สำหรับแปลงข้อมูลและคืนหน่วยความจำ
const pg = global.get('pg');
const pool = global.get('pgPool');

const rawPayload = msg.payload;
if (!Array.isArray(rawPayload) || rawPayload.length === 0) {
    return null;
}

const flatData = [];
const insertTime = new Date().toISOString();

// วนลูปประมวลผลข้อมูลรอบเดียว O(N)
for (let i = 0; i < rawPayload.length; i++) {
    const item = rawPayload[i];
    flatData.push([
        insertTime,
        item.eqp_id,
        Number(item.pe1_intensity) || 0.0,
        Number(item.pe2_intensity) || 0.0,
        Number(item.thickness) || 0.0,
        Number(item.temperature) || 0.0,
        item.lot_id || 'UNKNOWN'
    ]);
}

// สร้างคำสั่ง SQL Insert แบบ Parameterized Batch
const columns = '("time", machine_id, pe1_intensity, pe2_intensity, thickness, temperature, lot_id)';
const values = flatData.map((_, idx) => {
    const offset = idx * 7;
    return '($' + (offset + 1) + ', $' + (offset + 2) + ', $' + (offset + 3) + ', $' + (offset + 4) + ', $' + (offset + 5) + ', $' + (offset + 6) + ', $' + (offset + 7) + ')';
}).join(', ');

const query = `
    INSERT INTO public.ldi_data ${columns}
    VALUES ${values}
    ON CONFLICT (log_id, "time") DO NOTHING;
`;

const flattenedParams = flatData.flat();

// วินัยการคืนหน่วยความจำอย่างเคร่งครัด: ป้องกัน V8 Heap โตผิดปกติ
flatData.length = 0;
msg.payload = null;

// ส่งต่อไปยัง PgBouncer Connection Pool
msg.topic = query;
msg.params = flattenedParams;
return msg;
```

---

## 3. ห่วงโซ่การสรุปผลรวมต่อเนื่อง (TimescaleDB CAGG Rollup Chain)

ข้อมูลโทรมาตรดิบในตาราง `public.ldi_data` จะถูกส่งต่อไปยัง 2 เส้นทางการสรุปผลรวมที่เป็นอิสระต่อกัน:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart LR
  accTitle: ลำดับการ rollup ของ LDI
  accDescr: ldi_data ถูก rollup เป็น aggregate 1 นาที 15 นาที และ 1 ชั่วโมงต่อกันเป็นลำดับ และมี aggregate รายชั่วโมงแบบ real-time แยกอีกตัว และ materialized view ด้าน SPC และ RCA 3 ตัวรีเฟรชทุกนาที
  RAW[("ldi_data<br/>180 วัน")]:::store
  M1[("ldi_data_1m<br/>30 วัน")]:::store
  M15[("ldi_data_15m<br/>90 วัน")]:::store
  M1H[("ldi_data_1h<br/>2 ปี")]:::store
  MH[("ldi_data_hourly<br/>real-time · 2 ปี")]:::store
  MV["v_machine_spc_fleet<br/>v_ldi_rca_recent_window<br/>v_ldi_rca_truth_test"]:::store
  RAW -->|"1 min"| M1 -->|"15 min"| M15 -->|"1 h"| M1H
  RAW -->|"1 h"| MH
  RAW -->|"รีเฟรชทุก 60 วินาที"| MV
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

* **การสรุปผลรวมต่อเนื่องแบบลดหลั่น (`1m -> 15m -> 1h`):** นำข้อมูลสรุปจากระดับที่เล็กกว่ามารวมต่อ เพื่อให้การเปิดดูกราฟระยะยาว (7 วัน, 30 วัน) บน Grafana ทำงานได้รวดเร็วในระดับเสี้ยววินาที
* **การสรุปผลรวมรายชั่วโมงแบบ Real-time (`ldi_data_hourly`):** กำหนดค่า `timescaledb.materialized_only = false` เพื่อคำนวณเมตริกซับซ้อน (`avg_max_pe`, `peak_pe`) จากข้อมูลดิบโดยตรง พร้อมรวมข้อมูลล่าสุดที่ยังไม่ได้ Materialize แบบ Real-time

---

## 4. ไปป์ไลน์การประมวลผลการแจ้งเตือนและการวิเคราะห์หาสาเหตุที่แท้จริง (RCA)

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart LR
  accTitle: ไปป์ไลน์ alarm และการหาสาเหตุ
  accDescr: ตัวจำลอง alarm เขียน ldi_alarm_log ซึ่ง equipmentid อ้างอิงตาราง devices โดย alarm จะ join กับ alarm master ด้วยรหัส และกับข้อมูลในช่วง 5 นาทีก่อนหน้า ซึ่งป้อนให้ view ด้าน RCA
  SIM["ldi_alarm_simulator.json"]:::flow
  DEV[("devices")]:::store
  LOG[("ldi_alarm_log<br/>365 วัน")]:::store
  MASTER[("ldi_alarm_ms_code<br/>1,820 รหัส")]:::store
  CTX["v_ldi_alarm_context<br/>ค่าที่อ้างผ่าน related_log_id หรือค่าล่าสุดใน 5 นาทีก่อนหน้า"]:::store
  RCA["v_ldi_rca_recent_window<br/>v_ldi_rca_truth_test"]:::store
  SIM --> LOG
  LOG -.->|"FK equipmentid"| DEV
  MASTER -.->|"join errorcode = alarm_code"| CTX
  LOG --> CTX --> RCA
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

การแจ้งเตือนจะถูกบันทึกลงใน `public.ldi_alarm_log` และเชื่อมโยงกับรหัสใน `public.ldi_alarm_ms_code` ผ่าน Foreign Key โดยมีวิว `v_ldi_alarm_context` ทำหน้าที่เชื่อมข้อมูลโทรมาตรของเครื่องจักรในช่วง ±5 นาที รอบเวลาที่เกิดเหตุการณ์ เพื่อส่งต่อให้ระบบวิเคราะห์รากเหง้าปัญหา (RCA) บนหน้าจอของผู้ควบคุม

---

## 5. กฎเหล็กและข้อจำกัดทางสถาปัตยกรรม (Architectural Rules)

1. **สคีมาฐานข้อมูล:** ข้อมูลทั้งหมดต้องอยู่ในสคีมา `public` เท่านั้น ห้ามสร้างสคีมา `ims.*`
2. **PgBouncer:** ใช้โหมด Transaction และตั้งค่า `AUTH_TYPE: scram-sha-256` ห้ามใช้ Prepared Statements
3. **ความปลอดภัยในการบันทึกข้อมูล:** คำสั่ง SQL ต้องมี `ON CONFLICT (log_id, "time") DO NOTHING` เสมอ
4. **ความลับและโทเค็น:** การแจ้งเตือนไปยัง LINE และ MS Teams ต้องใช้โทเค็นที่ผู้ควบคุมระบบกำหนดเองเท่านั้น ห้ามคอมมิตลงใน Git

---

[⬅️ กลับสู่ภาพรวมสถาปัตยกรรม](ARCHITECTURE.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> หน้าหลักคลังข้อมูล](../../README.md)
