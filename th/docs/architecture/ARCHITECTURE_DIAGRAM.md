<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>แผนภาพสถาปัตยกรรมและโทโพโลยีระบบ IMS (Visual Architecture Reference)</h1>
  <p><b>โมเดล C4 เชิงลึก, ลำดับขั้นตอนการทำงาน (Sequence Flows), ความปลอดภัยของเกตเวย์ และโครงสร้างลำดับชั้นการจัดเก็บข้อมูลสำหรับระบบ IMS</b></p>
  <p>
    <a href="../../../docs/architecture/ARCHITECTURE_DIAGRAM.md">English</a> |
    <a href="ARCHITECTURE_DIAGRAM.md">ไทย</a> |
    <a href="../../../zh-CN/docs/architecture/ARCHITECTURE_DIAGRAM.md">简体中文</a>
  </p>
</div>

---

> [!TIP]
> **ไฟล์ข้อกำหนด Mermaid โดยตรง**: สำหรับการเรนเดอร์ใน IDE หรือไปป์ไลน์ CI สามารถเข้าถึงไฟล์ Mermaid ดิบได้ที่ [ims-system-architecture.mermaid](../../../docs/architecture/ims-system-architecture.mermaid)

## 1. แผนภาพบริบทของระบบ (C4 Model - Level 1: System Context)

แผนภาพบริบทแสดงภาพรวมการมีปฏิสัมพันธ์ระหว่างผู้ใช้งาน, เครื่องจักรในกระบวนการผลิต, เครื่องแม่ข่ายโครงสร้างพื้นฐานไอที, สวิตช์เครือข่าย และระบบส่งข้อความภายนอก กับระบบ Telemetry หลักของ IMS

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: C4 ระดับ 1: บริบทของระบบ
  accDescr: ผู้ใช้ 4 บทบาทใช้งาน IMS ผ่านเบราว์เซอร์ IMS รับข้อมูล LDI ผ่าน HTTP ดึงข้อมูลเซิร์ฟเวอร์และสวิตช์ผ่าน SNMP อ่านฐานข้อมูล Drilling และ VCP ของโรงงาน และส่งการแจ้งเตือนไปยัง LINE และ Microsoft Teams

  subgraph PEOPLE["ผู้ใช้งาน"]
    NOC["ผู้ปฏิบัติงาน NOC<br/>[บุคคล]<br/>สุขภาพโครงสร้างพื้นฐาน"]:::actor
    PE["วิศวกรกระบวนการ<br/>[บุคคล]<br/>LDI yield, SPC, RCA"]:::actor
    DRL["ผู้เชี่ยวชาญ Drilling<br/>[บุคคล]<br/>เหตุการณ์และ alarm ของเครื่อง"]:::actor
    VCPT["ช่างชุบ<br/>[บุคคล]<br/>bath, กระแส, ความเร็วไลน์"]:::actor
  end

  IMS["IMS<br/>[ระบบซอฟต์แวร์]<br/>รับข้อมูล จัดเก็บ 22 แดชบอร์ด แจ้งเตือน"]:::app

  subgraph EXT["ระบบภายนอก"]
    LDIM["เครื่อง LDI<br/>[ภายนอก]<br/>JSON ผ่าน HTTP"]:::ext
    NET["เซิร์ฟเวอร์และสวิตช์<br/>[ภายนอก]<br/>SNMP v2c agent"]:::ext
    EAPSRC["ฐานข้อมูล EAP ของโรงงาน<br/>[ภายนอก]<br/>ข้อมูล Drilling และ VCP"]:::ext
    MSG["LINE · Microsoft Teams<br/>[ภายนอก]"]:::notify
  end

  NOC -->|"HTTP :3000"| IMS
  PE -->|"HTTP :3000"| IMS
  DRL -->|"HTTP :3000"| IMS
  VCPT -->|"HTTP :3000"| IMS
  LDIM -->|"POST /ldi-telemetry · X-API-Key"| IMS
  NET -->|"SNMP v2c · UDP 161 · ถูกดึงข้อมูล"| IMS
  EAPSRC -.->|"กู้คืนเข้า eap_backup"| IMS
  IMS -->|"HTTPS"| MSG

  subgraph LEGEND["คำอธิบายสัญลักษณ์ · ลูกศร = ทิศทางข้อมูล"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_actor["บุคคล"]:::actor ~~~ LG_app["บริการของ IMS"]:::app ~~~ LG_ext["ระบบภายนอก"]:::ext ~~~ LG_notify["การแจ้งเตือน"]:::notify
    end
  end
  MSG ~~~ LEGEND
  style LEGEND fill:transparent,stroke:#94a3b8,stroke-dasharray:3 3
  style LEGEND_0 fill:transparent,stroke:transparent
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

## 2. แผนภาพโครงสร้างคอนเทนเนอร์ (C4 Model - Level 2: Container Diagram)

แผนภาพนี้แสดงรายละเอียดการทำงานของเซอร์วิสทั้ง 16 ตัวในเครือข่าย Docker Compose พร้อมการแมปพอร์ตและเส้นทางการรับส่งข้อมูล:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: C4 ระดับ 2: คอนเทนเนอร์ 16 ตัว
  accDescr: บริการ Docker Compose ทั้ง 16 ตัวและการเชื่อมต่อ: nginx เป็นพอร์ตเดียวที่เปิดทุก interface บริการข้อมูลอยู่บน ims-internal การเฝ้าระวังอยู่บน ims-monitoring และ archiver เข้าถึง Docker ผ่าน socket proxy บนเครือข่าย ims-docker-api ที่แยกออกเท่านั้น

  USER["ผู้ใช้ · เบราว์เซอร์"]:::actor
  EDGE["เครื่อง LDI · อุปกรณ์ SNMP"]:::ext

  subgraph INGRESS["พอร์ต host 3000 ทุก interface"]
    PROXY["proxy · nginx 1.31<br/>ims-proxy"]:::ingress
  end

  subgraph APP["แอปพลิเคชัน · ims-internal"]
    GRAF["grafana 13.1.2<br/>22 แดชบอร์ด"]:::viz
    RENDER["renderer<br/>image renderer"]:::app
    ALARM["alarm-api :4000<br/>Express"]:::app
    TWIN["factory-twin-3d :4100<br/>Express"]:::app
    NR["node-red :1880<br/>ไฟล์โฟลว์ 5 ไฟล์"]:::flow
    SNMPSIM["snmpsim<br/>agent จำลอง"]:::app
  end

  subgraph DATA["ข้อมูล · ims-internal"]
    MIG["db-migrate<br/>รันครั้งเดียว, migration 013–094"]:::app
    PGB["pgbouncer :5432<br/>SCRAM"]:::app
    TSDB[("timescaledb :5432<br/>ims · eap_backup")]:::store
    PGADMIN["pgadmin<br/>127.0.0.1:5050"]:::app
  end

  subgraph MONNET["การเฝ้าระวัง · ims-monitoring"]
    PROM["prometheus<br/>127.0.0.1:9090"]:::obs
    AM["alertmanager<br/>127.0.0.1:9093"]:::obs
    BBOX["blackbox-exporter<br/>127.0.0.1:9115"]:::obs
  end

  subgraph DOCKERAPI["ims-docker-api · ภายใน ไม่มีทางออก"]
    ARCH["observability-archiver<br/>อยู่บน ims-internal ด้วย"]:::app
    SOCK["docker-socket-proxy<br/>endpoint อ่านอย่างเดียว"]:::app
  end

  USER -->|"HTTP :3000"| PROXY
  EDGE -->|"POST /ldi-telemetry"| PROXY
  EDGE -->|"SNMP v2c"| NR
  SNMPSIM -->|"SNMP v2c"| NR
  PROXY --> GRAF
  PROXY -->|"auth_request /alarm-api/"| ALARM
  PROXY -->|"auth_request /factory-twin-3d/"| TWIN
  PROXY -->|"/ldi-telemetry · /inject"| NR
  GRAF <-->|"ขอ render / callback"| RENDER
  GRAF -->|"timescaledb"| PGB
  GRAF -->|"drilling-timescaledb"| TSDB
  ALARM -->|"alarm_api_writer"| PGB
  TWIN --> PGB
  NR -->|"nodered_writer"| PGB
  ARCH -->|"observability_archiver"| TSDB
  PGB --> TSDB
  MIG --> TSDB
  PGADMIN --> TSDB
  NR -->|"/metrics"| PROM
  BBOX -->|"ผลการ probe"| PROM
  PROM --> AM
  AM -->|"/alert-webhook"| NR
  GRAF -->|"/alert-webhook"| NR
  ARCH -->|"HTTP :2375"| SOCK

  subgraph LEGEND["คำอธิบายสัญลักษณ์ · ลูกศร = ทิศทางข้อมูล"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_actor["บุคคล"]:::actor ~~~ LG_ext["ระบบภายนอก"]:::ext ~~~ LG_ingress["ทางเข้า / เกตเวย์"]:::ingress ~~~ LG_flow["โฟลว์ Node-RED"]:::flow ~~~ LG_app["บริการของ IMS"]:::app
    end
    subgraph LEGEND_1[" "]
      direction LR
      LG_store["ที่เก็บข้อมูล"]:::store ~~~ LG_viz["Grafana / UI"]:::viz ~~~ LG_obs["การเฝ้าระวัง"]:::obs
    end
    LEGEND_0 ~~~ LEGEND_1
  end
  SOCK ~~~ LEGEND
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

## 3. แผนภาพองค์ประกอบภายในไปป์ไลน์ Node-RED (C4 Model - Level 3: Components)

รายละเอียดโมดูลย่อยและการไหลของข้อมูลภายในคอนเทนเนอร์ `ims-node-red`:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: C4 ระดับ 3: องค์ประกอบใน Node-RED
  accDescr: ไฟล์โฟลว์ทั้ง 5 ไฟล์ใน nodered_data/flows และสิ่งที่แต่ละไฟล์เขียน: การดึง SNMP พร้อม circuit breaker และคิว retry แบบไฟล์ การรับข้อมูล LDI แบบเขียนผ่าน staging ตัวจำลองสองตัว และการส่งการแจ้งเตือน

  subgraph F1["ingestion.json"]
    T30["Poll Fleet · ทุก 30 วินาที"]:::flow
    REG["ทะเบียนอุปกรณ์<br/>public.devices · รีเฟรช 5 นาที"]:::flow
    CB["circuit breaker<br/>เปิดหลังล้มเหลว 2 ครั้ง · พัก 5 นาที"]:::flow
    FORK["fork_5_ways<br/>CPU · storage · network · temp · LDI"]:::flow
    PARSER["SRE AIOps Parser v9<br/>state ต่ออุปกรณ์ · บัฟเฟอร์ batch"]:::flow
    RETRY["คิว retry<br/>/data/retry_queue.json · ระบาย 30 วินาที"]:::flow
    INJ["POST /inject<br/>ตัวสร้างข้อมูล load test"]:::flow
    MET["GET /metrics<br/>ims_pipeline_* · ims_circuit_breaker_*"]:::flow
  end

  subgraph F2["ldi_ingestion.json"]
    LPOST["POST /ldi-telemetry"]:::flow
    AUTH["ตรวจ X-API-Key → 401"]:::flow
    VAL["JSON array 36 คอลัมน์<br/>ต้องมี eqp_id + log_id → 400 / 413"]:::flow
    STG["stage batch → 503 เมื่อล้มเหลว"]:::flow
    INS["insert ldi_data → 502 เมื่อล้มเหลว"]:::flow
    DONE["ลบแถว staging → 200"]:::flow
  end

  subgraph F3["ตัวจำลอง"]
    SIMLDI["ldi_simulator.json<br/>tick 2 วินาที · แบบจำลอง OU"]:::flow
    SIMALM["ldi_alarm_simulator.json<br/>tick 10 วินาที · insert ผ่าน staging"]:::flow
  end

  subgraph F4["alerting.json"]
    HOOK["POST /alert-webhook"]:::flow
    BEARER["ตรวจ Bearer token"]:::flow
    FMT["จัดรูปแบบข้อความ LINE / Teams Adaptive Card"]:::flow
  end

  PGB["PgBouncer :5432 · nodered_writer"]:::app
  TSDB[("TimescaleDB · ims")]:::store
  NOTIFY["LINE · MS Teams"]:::notify
  PROM["Prometheus"]:::obs

  T30 --> REG --> CB --> FORK --> PARSER
  INJ --> FORK
  PARSER -->|"sys_metrics · net_metrics · ldi_metrics"| PGB
  PARSER -.->|"เมื่อ insert ล้มเหลว"| RETRY
  RETRY -->|"retry สูงสุด 5 ครั้ง"| PGB
  LPOST --> AUTH --> VAL --> STG --> INS --> DONE
  STG -->|"ingest_staging"| PGB
  INS -->|"ldi_data"| PGB
  SIMLDI -->|"127.0.0.1:1880/ldi-telemetry"| LPOST
  SIMALM -->|"ingest_staging · ldi_alarm_log · ldi_alarm_lifecycle"| PGB
  HOOK --> BEARER --> FMT --> NOTIFY
  PGB --> TSDB
  MET --> PROM

  subgraph LEGEND["คำอธิบายสัญลักษณ์ · ลูกศร = ทิศทางข้อมูล"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_flow["โฟลว์ Node-RED"]:::flow ~~~ LG_app["บริการของ IMS"]:::app ~~~ LG_store["ที่เก็บข้อมูล"]:::store ~~~ LG_obs["การเฝ้าระวัง"]:::obs ~~~ LG_notify["การแจ้งเตือน"]:::notify
    end
  end
  PROM ~~~ LEGEND
  style LEGEND fill:transparent,stroke:#94a3b8,stroke-dasharray:3 3
  style LEGEND_0 fill:transparent,stroke:transparent
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

## 4. ลำดับการไหลของข้อมูล Telemetry ความถี่สูง (High-Throughput Sequence Flow)

เส้นทางของข้อมูลการผลิตจากหัวเปิดรับแสงของเครื่องจักร LDI ไปจนถึงการแสดงผลบนหน้าจอแดชบอร์ดแบบ Sub-second:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
sequenceDiagram
  accTitle: การรับข้อมูล LDI แบบเขียนผ่าน staging
  accDescr: batch จะได้รับการตอบรับหลัง commit แล้วเท่านั้น: Node-RED บันทึกลง ingest_staging ก่อน แล้ว insert ลง ldi_data ลบสำเนา staging และตอบ 200 กรณีล้มเหลวตอบ 400, 401, 413, 503 หรือ 502 และหาก insert ล้มเหลวสำเนา staging จะยังอยู่เพื่อกู้คืน
  autonumber
  participant M as เครื่อง LDI
  participant P as nginx (ims-proxy)
  participant N as ldi_ingestion.json
  participant B as PgBouncer
  participant T as TimescaleDB
  M->>P: POST /ldi-telemetry · X-API-Key · JSON array
  Note over P: จำกัด 50 r/s ต่อ client, burst 100
  P->>N: ส่งต่อไป node-red:1880
  alt key ผิด / body ผิด / แถวเกิน
    N-->>M: 401 · 400 · 413
  else batch ถูกต้อง
    N->>B: INSERT INTO ingest_staging RETURNING id
    B->>T: เขียน batch ที่ stage
    alt staging ล้มเหลว
      N-->>M: 503 · ไม่รับข้อมูล
    else stage แล้ว
      N->>B: INSERT INTO ldi_data … ON CONFLICT DO NOTHING
      B->>T: เขียนแถว (เวลาจากต้นทาง)
      alt insert ล้มเหลว
        N->>B: UPDATE ingest_staging SET attempts + 1
        N-->>M: 502 · เก็บสำเนา staging ไว้
      else commit แล้ว
        N->>B: DELETE FROM ingest_staging WHERE id
        N-->>M: 200 OK
      end
    end
  end
  Note over T: CAGG policy รีเฟรช ldi_data_1m ทุกนาที
```

---

## 5. ลำดับขั้นตอนการจัดการวงจรชีวิตการแจ้งเตือน (Alarm Lifecycle Sequence)

ขั้นตอนการทำงานตั้งแต่ระบบตรวจพบความผิดปกติ การรับทราบโดยโอเปอเรเตอร์ จนถึงการแก้ไขปัญหาเสร็จสิ้น:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
sequenceDiagram
  accTitle: การ acknowledge และ resolve alarm
  accDescr: ผู้ปฏิบัติงาน acknowledge และวิศวกร resolve alarm จาก Alarm Console โดย nginx ตรวจ session ของ Grafana ก่อนที่ alarm-api จะอัปเดต ldi_alarm_lifecycle และผู้กระทำคือผู้ที่ล็อกอินใน session เสมอ
  autonumber
  actor O as ผู้ปฏิบัติงาน / วิศวกร
  participant P as nginx
  participant G as Grafana /api/user
  participant A as alarm-api
  participant D as ldi_alarm_lifecycle
  Note over D: แถว alarm ใหม่เริ่มที่ OPEN (trigger)
  O->>P: POST /alarm-api/alarms/ack · {logdate_ms, logid}
  P->>G: auth_request · session cookie
  alt ไม่มี session ที่ถูกต้อง
    P-->>O: 401
  else บทบาท Viewer
    A-->>O: 403
  else Editor / Admin
    P->>A: ส่งต่อ + ชื่อผู้ใช้ของ session
    A->>D: UPDATE … SET status = 'ACKNOWLEDGED' WHERE status = 'OPEN'
    A-->>O: 200 · หรือ 409 ถ้าไม่ใช่ OPEN
  end
  O->>P: POST /alarm-api/alarms/resolve · {logdate_ms, logid, resolution_note}
  P->>G: auth_request
  P->>A: ส่งต่อ
  A->>D: UPDATE … SET status = 'RESOLVED' WHERE status IN ('OPEN', 'ACKNOWLEDGED')
  A-->>O: 200 · หรือ 409 ถ้า RESOLVED แล้ว
```

---

## 6. กลไกตัดวงจรป้องกันความผิดพลาดของโพรโทคอล SNMP (Circuit Breaker)

ปกป้องสวิตช์เครือข่ายจากการส่งข้อมูลท่วมท้นเมื่ออุปกรณ์ปลายทางไม่ตอบสนอง:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
sequenceDiagram
  accTitle: Circuit breaker ของ SNMP
  accDescr: การ poll ทุก 30 วินาทีตรวจ breaker ของแต่ละอุปกรณ์ที่เก็บใน flow context ของ Node-RED: ล้มเหลวติดกัน 2 ครั้งจะเปิด breaker, breaker ที่เปิดจะข้ามอุปกรณ์ และหลัง 5 นาที poll ครั้งถัดไปจะเป็น probe หนึ่งครั้งเพื่อปิดหรือเปิด breaker อีกครั้ง
  autonumber
  participant T as Poll Fleet (30 s)
  participant C as breaker · flow context cb_DEVICE
  participant W as SNMP walker
  participant D as อุปกรณ์
  participant P as Parser v9
  T->>C: checkDevice()
  alt CLOSED
    C-->>W: อนุญาต
    W->>D: GETBULK (UDP 161, timeout 6000 ms)
    alt มีการตอบกลับ
      D-->>W: varbinds
      W->>C: recordSuccess() · failures = 0
      W->>P: metrics → batch insert
    else หมดเวลา
      W->>C: recordFailure() · failures + 1
      Note over C: ล้มเหลวครั้งที่ 2 ติดกัน → OPEN, trips + 1
      W->>P: offline heartbeat → metrics เป็นศูนย์
    end
  else OPEN ยังไม่ถึง 5 นาที
    C-->>T: ข้ามอุปกรณ์รอบนี้
  else OPEN ครบ 5 นาที
    C->>C: HALF_OPEN
    C-->>W: อนุญาต probe หนึ่งครั้ง
    W->>D: GETBULK
    alt probe สำเร็จ
      W->>C: recordSuccess() → CLOSED
    else probe ล้มเหลว
      W->>C: recordFailure() → OPEN
    end
  end
  Note over C: ส่งออกเป็น ims_circuit_breaker_state / _trips_total ที่ GET /metrics
```

---

## 7. ลำดับชั้นการจัดเก็บข้อมูลและการรวมผลต่อเนื่อง (TimescaleDB Topology)

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: Hypertable, continuous aggregate และ retention
  accDescr: Hypertable ข้อมูลดิบป้อน continuous aggregate 7 ตัว แต่ละกล่องแสดงรอบการรีเฟรชและ retention ตามที่ตั้งไว้ในฐานข้อมูลจริง โดย aggregate รายชั่วโมงของโครงสร้างพื้นฐาน 3 ตัวไม่มี retention policy

  subgraph RAW["Hypertable ข้อมูลดิบ"]
    LDI[("ldi_data<br/>chunk 1 วัน · บีบอัดหลัง 7 วัน · เก็บ 180 วัน")]:::store
    INF[("sys_metrics · net_metrics · ldi_metrics<br/>chunk 1 วัน · บีบอัดหลัง 7 วัน · เก็บ 30 วัน")]:::store
    ALM[("ldi_alarm_log<br/>chunk 7 วัน · เก็บ 365 วัน")]:::store
  end

  subgraph LDICAGG["Aggregate ของ LDI"]
    C1M[("ldi_data_1m<br/>ทุก 1 นาที · หน้าต่าง 2 ชม. · เก็บ 30 วัน")]:::store
    C15[("ldi_data_15m<br/>ทุก 15 นาที · หน้าต่าง 3 ชม. · เก็บ 90 วัน")]:::store
    C1H[("ldi_data_1h<br/>ทุก 1 ชม. · หน้าต่าง 1 วัน · เก็บ 2 ปี")]:::store
    CHR[("ldi_data_hourly<br/>ทุก 1 ชม. · หน้าต่าง 3 วัน · real-time · เก็บ 2 ปี")]:::store
  end

  subgraph INFCAGG["Aggregate ของโครงสร้างพื้นฐาน"]
    SH[("sys_hourly · net_hourly · ldi_hourly<br/>ทุก 30 นาที · หน้าต่าง 6 ชม. · ไม่มี retention policy")]:::store
  end

  LDI --> C1M --> C15 --> C1H
  LDI --> CHR
  INF --> SH

  subgraph LEGEND["คำอธิบายสัญลักษณ์ · ลูกศร = ทิศทางข้อมูล"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_store["ที่เก็บข้อมูล"]:::store
    end
  end
  SH ~~~ LEGEND
  style LEGEND fill:transparent,stroke:#94a3b8,stroke-dasharray:3 3
  style LEGEND_0 fill:transparent,stroke:transparent
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

## 8. แผนผังระบบนิเวศแดชบอร์ดตาม 4 แผนกงาน (Dashboard Ecosystem)

แดชบอร์ด Grafana ทั้ง 22 ตัวถูกจัดหมวดหมู่อย่างเป็นระเบียบตาม 4 แผนกงาน:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: แดชบอร์ดที่ provision ทั้ง 22 ตัวแยกตามโฟลเดอร์
  accDescr: โฟลเดอร์ Grafana 4 โฟลเดอร์พร้อมชื่อและ UID ของแดชบอร์ด โดย Drilling และ VCP อ่านฐานข้อมูล eap_backup ผ่าน data source drilling-timescaledb ส่วน LDI และ Platform อ่านฐานข้อมูล ims ผ่าน PgBouncer
  EAP[("eap_backup · drilling-timescaledb")]:::store
  IMS[("ims · timescaledb ผ่าน PgBouncer")]:::store
  subgraph DRL["01 · Drilling (CNC)"]
    DRL0["01 Fleet Digital Twin & Overview<br/><code>001</code>"]:::viz
    DRL1["02 Shift Production & OEE Tracking<br/><code>ims-drilling-history</code>"]:::viz
    DRL2["03 Machine Investigation & Spindle Diagnostics<br/><code>ims-drilling-machine-detail</code>"]:::viz
    DRL3["04 Fleet Anomaly & Root Cause Analysis<br/><code>ims-drilling-5-anomaly</code>"]:::viz
  end
  EAP --> DRL
  subgraph VCP["04 · การชุบ (VCP)"]
    VCP0["01 Plating Fleet Overview & Process Analytics<br/><code>ims-vcp-overview</code>"]:::viz
    VCP1["02 Plating Line Operations Console<br/><code>ims-vcp-operations-console</code>"]:::viz
    VCP2["03 Real-Time Plating Line Wall Display<br/><code>ims-vcp-realtime-wall</code>"]:::viz
  end
  EAP --> VCP
  subgraph LDI["02 · Lithography (LDI)"]
    LDI0["01 Fleet Executive Overview<br/><code>ims-easy-overview</code>"]:::viz
    LDI1["02 Operator Andon Board (Shopfloor Kiosk)<br/><code>ims-ldi-operator-andon</code>"]:::viz
    LDI2["03 Factory 3D Digital Twin & Spatial Layout<br/><code>ims-ldi-factory-digital-twin</code>"]:::viz
    LDI3["04 Manufacturing Fleet Command Center<br/><code>ims-ldi-manufacturing</code>"]:::viz
    LDI4["05 Machine Deep-Dive Snapshot<br/><code>ims-ldi-machine-snapshot</code>"]:::viz
    LDI5["06 Process Engineering Analytics & SPC<br/><code>ims-ldi-engineering-analytics</code>"]:::viz
    LDI6["07 Live Alarm Management Console<br/><code>ims-ldi-alarm-console</code>"]:::viz
    LDI7["08 Alarm Response Metrics & MTTA/MTTR<br/><code>ims-ldi-alarm-response</code>"]:::viz
    LDI8["09 Alarm Code Dictionary & Corrective Actions<br/><code>ims-ldi-alarm-dictionary</code>"]:::viz
    LDI9["10 Telemetry Signal Quality & Integration Readiness<br/><code>ldi-data-readiness</code>"]:::viz
  end
  IMS --> LDI
  subgraph PLT["03 · Platform และ NOC"]
    PLT0["01 Network Operations Center (NOC) Overview<br/><code>ims-noc-overview</code>"]:::viz
    PLT1["02 Host & Network Infrastructure Engineering Drill-Down<br/><code>ims-engineering</code>"]:::viz
    PLT2["03 AIOps Predictive Capacity & Resource Forecasting<br/><code>ims-capacity</code>"]:::viz
    PLT3["04 Ingestion Pipeline Latency & Telemetry SLO<br/><code>ims-ingestion-latency</code>"]:::viz
    PLT4["05 Pipeline Reliability & SRE Meta-Monitoring<br/><code>ims-meta-monitoring</code>"]:::viz
  end
  IMS --> PLT

  subgraph LEGEND["คำอธิบายสัญลักษณ์ · ลูกศร = ทิศทางข้อมูล"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_store["ที่เก็บข้อมูล"]:::store ~~~ LG_viz["Grafana / UI"]:::viz
    end
  end
  PLT ~~~ LEGEND
  style LEGEND fill:transparent,stroke:#94a3b8,stroke-dasharray:3 3
  style LEGEND_0 fill:transparent,stroke:transparent
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

## 9. คำสั่งตรวจสอบสถาปัตยกรรมระบบจริง (Verification Commands)

```bash
# 1. ตรวจสอบสถานะของคอนเทนเนอร์ทั้ง 14 ตัวและพอร์ตที่เปิดใช้งาน
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 2. ตรวจสอบจำนวนการเชื่อมต่อใน Pool ของ PgBouncer
docker exec -i ims-timescaledb psql -U ims_admin -p 5432 -h ims-pgbouncer -d ims -c "SHOW POOLS;"

# 3. ตรวจสอบการกระจายตัวของ Chunks และขนาดการบีบอัดข้อมูลใน TimescaleDB
docker exec -i ims-timescaledb psql -U ims_admin -d ims -c "
SELECT hypertable_name, num_chunks, total_size, compressed_total_size
FROM timescaledb_information.hypertables
ORDER BY total_size DESC;"

# 4. ตรวจสอบนโยบายการคำนวณ Continuous Aggregate ที่ทำงานอยู่
docker exec -i ims-timescaledb psql -U ims_admin -d ims -c "
SELECT view_name, schedule_interval, max_interval_per_job
FROM timescaledb_information.continuous_aggregate_stats;"
```
