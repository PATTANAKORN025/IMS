<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Data Flow

> **กลุ่มเป้าหมาย (Audience):** วิศวกร SRE/ทีมปฏิบัติการ (Operations), นักพัฒนาที่เข้ามาร่วมทีมใหม่, ทีม QA/ทีมตรวจสอบระบบ (Audit)
>
> **แหล่งอ้างอิงข้อมูล (Provenance):** ชื่อ Table/View และความสัมพันธ์ของ CAGG ด้านล่างทั้งหมดได้รับการตรวจสอบโดยตรงกับฐานข้อมูลที่ใช้งานจริง (`timescaledb_information.continuous_aggregates`) และ Migration จริงเมื่อวันที่ 2026-08-10

---

## โครงสร้างแบบ End-to-end: ทั้งสอง Data Pipeline

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart TB
 subgraph INFRA["Infrastructure pipeline"]
  DEV["Servers / network devices\n(SNMP v2c)"] -->|"poll every 30s"| WALK["ingestion.json\nfork_5_ways -> sre_parser"]
  WALK --> SYS[("sys_metrics")]
  WALK --> NET[("net_metrics")]
  WALK --> LDIM[("ldi_metrics\n(legacy, several columns always 0)")]
 end

 subgraph LDI["LDI manufacturing pipeline"]
  SIM["ldi_simulator.json\n2s tick"] -->|"POST /ldi-telemetry\nx-api-key auth"| ING["ldi_ingestion.json"]
  ING --> LDID[("ldi_data\nhypertable")]
  ALMSIM["ldi_alarm_simulator.json\n10s tick"] --> ALOG[("ldi_alarm_log")]
 end

 SYS --> GRAFANA["Grafana\n15 dashboards\n(Infrastructure / Manufacturing folders)"]
 NET --> GRAFANA
 LDID --> GRAFANA
 ALOG --> GRAFANA

 GRAFANA -->|"native alert rules"| WEBHOOK["Node-RED /alert-webhook"]
 PROM["Prometheus"] -->|"scrapes sys_metrics-adjacent exporters + Node-RED health"| AM["Alertmanager"]
 AM --> WEBHOOK
 WEBHOOK --> LINE["LINE Messaging API"]
 WEBHOOK --> TEAMS["MS Teams webhook"]

 style INFRA fill:#1e293b,stroke:#3b82f6,color:#e2e8f0
 style LDI fill:#1e293b,stroke:#22c55e,color:#e2e8f0
```

**ข้อควรระวังในการส่งข้อความ (Delivery caveat):** การส่งข้อความผ่าน LINE/Teams จำเป็นต้องมีการกำหนดค่า `LINE_CHANNEL_ACCESS_TOKEN` / `TEAMS_WEBHOOK_URL` โดยผู้ดูแลระบบ ซึ่งตั้งใจให้ไม่มีอยู่ในไฟล์ `.env` ของ Repository นี้ อย่างไรก็ตาม โลจิกการจัดรูปแบบและการพยายามส่งข้อความจนถึงจุดนั้นทำงานได้จริงและมีความถูกต้อง

---

## ข้อมูล Telemetry ของ LDI: สายโซ่การทำ Rollup ของ CAGG

ข้อมูลดิบ `ldi_data` จะถูกส่งไปยังเส้นทางการทำ Aggregation สองเส้นทางที่เป็นอิสระต่อกัน ซึ่งแต่ละเส้นทางมีวัตถุประสงค์การใช้งานที่แตกต่างกัน — ห้ามทึกทักเอาเองว่าเป็นการทำงานที่ซ้ำซ้อนกัน (Redundant):

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart LR
 RAW[("ldi_data\nraw, 7d compression\n180d retention")]

 RAW -->|"1m rollup"| M1[("ldi_data_1m\n30d retention")]
 M1 -->|"15m rollup"| M15[("ldi_data_15m\n90d retention")]
 M15 -->|"1h rollup"| M1H[("ldi_data_1h\n2yr retention")]

 RAW -->|"direct hourly analytics\n(avg_max_pe, peak_pe, etc.)\ncontinuous aggregation ON"| MHOURLY[("ldi_data_hourly\n2yr retention")]

 RAW -->|"materialized, 60s refresh"| SPCVIEW["v_machine_spc_fleet\nv_ldi_rca_recent_window\nv_ldi_rca_truth_test"]
```

`ldi_data_1m → 15m → 1h` คือการทำ Rollup แบบต่อเนื่อง (Chained Rollup) (แต่ละระดับจะรวบรวมข้อมูลจากระดับที่ต่ำกว่า) เพื่อประสิทธิภาพในการคิวรีข้อมูลตามช่วงเวลาบน Dashboard ส่วน `ldi_data_hourly` เป็น View แบบรายชั่วโมงที่ _แยกต่างหาก_ และถูกสร้างขึ้นมาโดยเฉพาะ ซึ่งคำนวณโดยตรงจากข้อมูลดิบพร้อมคอลัมน์สำหรับการวิเคราะห์ของตัวเอง (เช่น `avg_max_pe`, `peak_pe` และอื่นๆ) และมีการเปิดใช้งาน `timescaledb.materialized_only = false` (การรวมข้อมูลแบบต่อเนื่อง Continuous Aggregation — Migration 065) เนื่องจากเมทริกซ์เฉพาะเหล่านั้นจำเป็นต้องสะท้อนข้อมูลของช่วงเวลาปัจจุบันในชั่วโมงนั้นๆ โดยไม่ต้องรอรอบการ Refresh ครั้งต่อไป

## ข้อมูล Master ของ Alarm และระดับความรุนแรง (Severity)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart LR
 ALMSIM["ldi_alarm_simulator.json"] --> ALOG[("ldi_alarm_log\nevent stream\n365d retention")]
 MASTER[("ldi_alarm_ms_code\ncode + severity + msg\n1,820+ codes, 19 simulator-active")] -.->|"FK: alarm_code"| ALOG
 ALOG --> CTX["v_ldi_alarm_context\n(joins telemetry ±window)"]
 CTX --> RCA["v_ldi_rca_recent_window\nv_ldi_rca_truth_test"]
```

ดูเอกสาร `docs/architecture/ALARM_SEVERITY_GUIDE.md` และ `docs/architecture/LDI_RCA_GUIDE.md` สำหรับโครงสร้างการจัดหมวดหมู่ (Taxonomy) และระเบียบวิธีวิเคราะห์ความสัมพันธ์ (Correlation Methodology) ที่ถูกสร้างขึ้นบนโครงสร้างข้อมูลนี้

## เอกสารที่เกี่ยวข้อง

- `docs/architecture/ARCHITECTURE.md` — บริบทของระบบแบบเต็มรูปแบบ และรายการคอนเทนเนอร์ (Container Inventory) ทั้งหมด
- `docs/architecture/DATABASE_SCHEMA.md` — ข้อมูลอ้างอิงของ Table/Column/View ที่สร้างขึ้นโดยอัตโนมัติ
- `docs/architecture/DATA_RETENTION.md` — ตัวเลขระยะเวลาการเก็บรักษา/การบีบอัดข้อมูล (Retention/Compression) ที่แสดงด้านบน พร้อมข้อกำหนดด้านการกำกับดูแล
- `docs/architecture/EAP_ARCHITECTURE.md` — รายละเอียดเชิงลึกของ Ingestion Adapters ทั้งสองแบบ (SNMP, HTTP/JSON)
