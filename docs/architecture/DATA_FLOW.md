<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS Telemetry Pipeline & Data Flow Architecture</h1>
  <p><b>Multi-domain ingestion pipelines, Node-RED sandbox transformation, PgBouncer pooling, TimescaleDB CAGG rollups, and Grafana dispatch</b></p>
  <p>
    <a href="DATA_FLOW.md">English</a> |
    <a href="../../th/docs/architecture/DATA_FLOW.md">ไทย</a> |
    <a href="../../zh-CN/docs/architecture/DATA_FLOW.md">简体中文</a>
  </p>
</div>

---

> **Audience:** SRE / Operations, Data Engineers, Software Architects, QA / Compliance  
> **Telemetry Scope:** 4 Industrial Domains (IT/OT Infrastructure, LDI Photolithography, CNC Drilling Fleet, VCP Electroplating)  
> **Provenance:** Every table, view, function node, and continuous aggregate referenced below is verified against `timescaledb_information.continuous_aggregates`, migrations 013–091, and active Node-RED flows.

---

## 1. End-to-End Multi-Domain Pipeline Topology

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: End-to-end data flow
  accDescr: SNMP and LDI data enter through Node-RED and PgBouncer into the ims database, where ingest_staging protects LDI batches and continuous aggregates and compression run; drilling and VCP data sit in eap_backup; Grafana reads both and alerts leave through Node-RED.

  SNMP["Servers · switches<br/>SNMP v2c, polled every 30 s"]:::ext
  LDIM["LDI machines<br/>POST /ldi-telemetry"]:::ext
  EAPSRC["Plant EAP database<br/>drilling · VCP"]:::ext

  NRS["ingestion.json<br/>fork_5_ways → Parser v9"]:::flow
  NRL["ldi_ingestion.json<br/>validate → stage → insert"]:::flow
  PGB["PgBouncer :5432<br/>transaction pool · SCRAM"]:::app

  subgraph IMSDB["Database ims"]
    STG[("ingest_staging<br/>write-ahead table")]:::store
    HSYS[("sys_metrics · net_metrics · ldi_metrics<br/>hypertables, 1-day chunks")]:::store
    HLDI[("ldi_data<br/>hypertable, 1-day chunks")]:::store
    HALM[("ldi_alarm_log<br/>hypertable, 7-day chunks")]:::store
    CAGG[("continuous aggregates<br/>ldi_data_1m → 15m → 1h · *_hourly")]:::store
    COMP[("compressed chunks after 7 d<br/>segment by eqp_id · device_id")]:::store
  end
  subgraph EAPDB["Database eap_backup"]
    EDRL[("machine_event · agent_log")]:::store
    EVCP[("vcp_upp · vcp_alarm · vcp_status_change")]:::store
  end

  GRAF["Grafana · 22 dashboards"]:::viz
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
  EAPSRC -.->|"restored copy"| EDRL
  EAPSRC -.-> EVCP
  CAGG --> GRAF
  HLDI --> GRAF
  HALM --> GRAF
  EDRL -->|"drilling-timescaledb"| GRAF
  EVCP -->|"drilling-timescaledb"| GRAF
  NRS -->|"/metrics"| PROM
  PROM --> HOOK
  GRAF -->|"alert rules"| HOOK
  HOOK --> NOTIFY

  subgraph LEGEND["Legend · arrows = data flow"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_ext["External system"]:::ext ~~~ LG_flow["Node-RED flow"]:::flow ~~~ LG_app["IMS service"]:::app ~~~ LG_store["Data store"]:::store ~~~ LG_viz["Grafana / UI"]:::viz
    end
    subgraph LEGEND_1[" "]
      direction LR
      LG_obs["Monitoring"]:::obs ~~~ LG_notify["Notification"]:::notify
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

## 2. Ingestion Processing & Sandboxed Code Patterns

Inside the **Node-RED Ingestion Pipeline**, function nodes execute within a sandboxed V8 context where `require()` is forbidden. All external modules are accessed via `global.get()`. To prevent memory leaks during high-frequency ingestion bursts (>100,000 events/sec), all transformations strictly enforce **O(N) single-pass iteration** and **explicit garbage collection**:

```javascript
// Example: Node-RED Function Node Telemetry Normalization & GC Cleanup
const pg = global.get('pg');
const pool = global.get('pgPool');

const rawPayload = msg.payload;
if (!Array.isArray(rawPayload) || rawPayload.length === 0) {
    return null;
}

const flatData = [];
const insertTime = new Date().toISOString();

// O(N) Single-Pass Transformation
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

// Build Parameterized Batch SQL
const columns = '("time", machine_id, pe1_intensity, pe2_intensity, thickness, temperature, lot_id)';
const values = flatData.map((_, idx) => {
    const offset = idx * 7;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
}).join(', ');

const query = `
    INSERT INTO public.ldi_data ${columns}
    VALUES ${values}
    ON CONFLICT (log_id, "time") DO NOTHING;
`;

// Flatten parameters for node-postgres execution
const flattenedParams = flatData.flat();

// Explicit Garbage Collection Discipline: prevent V8 heap bloat
flatData.length = 0;
msg.payload = null;

// Dispatch to PgBouncer connection pool
msg.topic = query;
msg.params = flattenedParams;
return msg;
```

---

## 3. TimescaleDB Continuous Aggregate Rollup Chain

Raw telemetry data in `public.ldi_data` feeds two independent aggregation paths:

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart LR
  accTitle: LDI rollup chain
  accDescr: ldi_data rolls up into 1-minute, 15-minute and 1-hour aggregates in a chain, plus a separate real-time hourly aggregate; three SPC and RCA materialized views refresh every minute.
  RAW[("ldi_data<br/>180 d")]:::store
  M1[("ldi_data_1m<br/>30 d")]:::store
  M15[("ldi_data_15m<br/>90 d")]:::store
  M1H[("ldi_data_1h<br/>2 y")]:::store
  MH[("ldi_data_hourly<br/>real-time · 2 y")]:::store
  MV["v_machine_spc_fleet<br/>v_ldi_rca_recent_window<br/>v_ldi_rca_truth_test"]:::store
  RAW -->|"1 min"| M1 -->|"15 min"| M15 -->|"1 h"| M1H
  RAW -->|"1 h"| MH
  RAW -->|"refresh every 60 s"| MV
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

* **Chained Multi-Level Rollup (`1m -> 15m -> 1h`):** Successively aggregates smaller buckets to power long-range Grafana dashboards (7d, 30d, 90d) with sub-second execution times.
* **Direct Real-Time Hourly Rollup (`ldi_data_hourly`):** Configured with `timescaledb.materialized_only = false` (migration 065), computing complex metrics (`avg_max_pe`, `peak_pe`) directly from raw data while merging active in-flight chunks.

---

## 4. Alarm Processing & Root-Cause Analysis (RCA) Pipeline

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart LR
  accTitle: Alarm and root-cause pipeline
  accDescr: The alarm simulator writes ldi_alarm_log, whose equipmentid references devices; alarms join the alarm master on the code and the telemetry reading linked by related_log_id (or the latest one in the five minutes before), which feeds the RCA views.
  SIM["ldi_alarm_simulator.json"]:::flow
  DEV[("devices")]:::store
  LOG[("ldi_alarm_log<br/>365 d")]:::store
  MASTER[("ldi_alarm_ms_code<br/>1,820 codes")]:::store
  CTX["v_ldi_alarm_context<br/>reading via related_log_id, else latest within 5 min before"]:::store
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

Alarms flow into `public.ldi_alarm_log`, linking to `public.ldi_alarm_ms_code` by foreign key. Downstream views (`v_ldi_alarm_context`) automatically join machine telemetry within a $\pm 5\text{-minute}$ window around the alarm timestamp, feeding statistical root cause analysis into the operator console.

---

## 5. Architectural Constraints & Rules

1. **Database Schema Isolation:** All database objects must reside in `public`. Never create `ims.*` schemas.
2. **PgBouncer Pooling:** Strict transaction pooling; clients authenticate with SCRAM (`AUTH_TYPE: scram-sha-256`). Prepared statements and session-level locks are strictly disallowed.
3. **Idempotent Inserts:** All batch inserts must include `ON CONFLICT (log_id, "time") DO NOTHING`.
4. **Notification Secrets:** Delivery to LINE and MS Teams requires operator-supplied tokens (`LINE_CHANNEL_ACCESS_TOKEN`, `TEAMS_WEBHOOK_URL`). Never commit secrets to git.

---

[⬅️ Back to Architecture Overview](ARCHITECTURE.md) | [<img src="../assets/icons/home.svg" width="18" align="center" /> Main Repository](../../README.md)
