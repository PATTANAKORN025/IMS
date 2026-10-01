<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>Equipment Integration Layer Architecture (EAP)</h1>
  <p><b>Equipment Automation Program (EAP) adapter patterns, multi-protocol telemetry ingestion, SECS/GEM contracts, and device registry</b></p>
  <p>
    <a href="EAP_ARCHITECTURE.md">English</a> |
    <a href="../../th/docs/architecture/EAP_ARCHITECTURE.md">ไทย</a> |
    <a href="../../zh-CN/docs/architecture/EAP_ARCHITECTURE.md">简体中文</a>
  </p>
</div>

---

> **EAP = Equipment Automation Program** — SECS/GEM-style equipment integration, per the scope confirmed 2026-08-10 (not "Enterprise Application Platform"). See `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §3 for the foundational specification.
>
> **Reality check, stated up front:** IMS is monitoring-only. It reads telemetry and raises alarms; it never writes commands, downloads recipes, or holds equipment state. There is no physical SECS/GEM-capable tool anywhere in this system today — LDI machines are SNMP-polled/simulated, not SECS/GEM-connected. This doc does **not** claim SECS/GEM compliance, does not implement HSMS session handling, and does not simulate SECS/GEM equipment. It documents the working adapters and defines the contract for future physical shopfloor integrations.
>
> **Provenance:** The SNMP and HTTP/JSON adapter descriptions below are verified directly against `nodered_data/flows/ingestion.json`, `nodered_data/flows/ldi_ingestion.json`, and `scripts/mock/eap-mock-data.js`.

---

## 1. Multi-Adapter Architecture Topology

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: Equipment integration adapters
  accDescr: Three adapters exist: SNMP polling and HTTP ingestion in Node-RED, which look machines up in public.devices, and direct reads of the eap_backup database; LDI alarms come from the alarm simulator or a real-data import; a SECS/GEM adapter is specified but not built.
  S1["Servers & switches · SNMP v2c"]:::ext
  S2["LDI machines · HTTP JSON"]:::ext
  S3["Plant EAP database · drilling & VCP"]:::ext
  S4["SECS/GEM equipment"]:::future
  A1["Adapter 1 · SNMP poller<br/>ingestion.json · 30 s"]:::flow
  A2["Adapter 2 · HTTP ingestion<br/>ldi_ingestion.json"]:::flow
  A3["Adapter 3 · direct database read<br/>drilling-timescaledb data source"]:::app
  A4["Adapter 4 · SECS/GEM<br/>specification only"]:::future
  ASRC["Alarm source<br/>ldi_alarm_simulator.json · import-real-data.sh"]:::flow
  DEV[("public.devices<br/>equipment registry")]:::store
  HSYS[("sys_metrics · net_metrics")]:::store
  HLDI[("ldi_data")]:::store
  ALM[("ldi_alarm_log · ldi_alarm_ms_code")]:::store
  EAPDB[("eap_backup<br/>machine_event · vcp_upp · vcp_alarm")]:::store
  GRAF["Grafana · 22 dashboards"]:::viz
  S1 --> A1 --> HSYS
  S2 --> A2 --> HLDI
  DEV -.->|"lookup"| A1
  DEV -.->|"lookup"| A2
  S3 -.->|"restored copy"| EAPDB
  EAPDB --> A3 --> GRAF
  ASRC --> ALM
  S4 -.-> A4 -.-> DEV
  HSYS --> GRAF
  HLDI --> GRAF
  ALM --> GRAF

  subgraph LEGEND["Legend · arrows = data flow"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_ext["External system"]:::ext ~~~ LG_flow["Node-RED flow"]:::flow ~~~ LG_app["IMS service"]:::app ~~~ LG_store["Data store"]:::store ~~~ LG_viz["Grafana / UI"]:::viz
    end
    subgraph LEGEND_1[" "]
      direction LR
      LG_future["Not built yet"]:::future
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

## 2. The Four Adapter Contracts

Every adapter's job is identical regardless of transport protocol: map telemetry and alarm events from physical or simulated devices into `public.devices` and the appropriate telemetry hypertable, using `device_id` as the primary join key across all downstream dashboards, SPC/RCA views, and alarm logs.

### Adapter 1 — SNMP (IT/OT Infrastructure)
* **Location:** `nodered_data/flows/ingestion.json` ("IMS Ingestion Pipeline" tab).
* **Equipment Model:** `public.devices` rows with `device_type IN ('server','workstation','network')`, holding `hostname`, `ip_address`, `snmp_community`, `snmp_port`, `poll_interval`.
* **Data Collection Plan:** Every 30 seconds, `fork_5_ways` dispatches parallel SNMP v2c walkers (CPU, Storage, Network, Temperature, LDI OIDs) per registered device.
* **Event / Alarm Collection:** None at the protocol level — this adapter is telemetry-only; alarms are derived downstream from threshold comparisons.
* **Mapping:** `sre_parser` maintains per-device state and batch-inserts into `sys_metrics`, `net_metrics`, and `ldi_metrics`.

### Adapter 2 — HTTP/JSON (LDI Manufacturing Telemetry)
* **Location:** `nodered_data/flows/ldi_ingestion.json` ("IMS LDI Ingestion" tab).
* **Equipment Model:** `public.devices` rows with `device_type='ldi'`, `process_type='ldi'` (migrations 067/068).
* **Data Collection Plan:** Equipment POSTs JSON array batches to `POST /ldi-telemetry` (authenticated via `x-api-key`). Each record carries `eqp_id` (maps to `device_id`), PE1-6, JE1-4, panel thickness, scan speed, and resist dosage.
* **Event / Alarm Collection:** Dedicated producer writes to `public.ldi_alarm_log`, correlated by `device_id` + `event_id`.
* **Mapping:** Direct batch `INSERT INTO public.ldi_data ON CONFLICT (log_id, "time") DO NOTHING`.

### Adapter 3 — EAP Stand-In Adapter (CNC Drilling & VCP Plating)
* **Location:** `scripts/mock/eap-mock-data.js` and `database/mock/eap_backup-schema.sql`.
* **Equipment Model:** Drilling machines (`drl001`–`drl010`) and VCP plating lines (`vcp001`–`vcp005`).
* **Data Collection Plan:** Generates realistic physical machine cycles:
  - **Drilling:** Program start, spindle speed (RPM), feed rate, spindle masking, tool hit count degradation, and shift reports.
  - **VCP:** Line movement (RUN, IDLE, DOWN), rectifier amperage, bath temperature thermodynamics, and flight-bar synchronization ($\text{plating\_time} \times \text{line\_speed} = 54$).
* **Mapping:** Inserts into `eap_backup` tables (`machine_event`, `vcp_upp`, `catalog.object_registry`) powering 4 drilling and 3 VCP Grafana dashboards.

### Adapter 4 — SECS/GEM (Future Physical Tool Integration)
No runtime code exists today for Adapter 4. When a physical SECS/GEM tool is connected to the plant floor, it must satisfy this formal interface contract:

| EAP Concept | Required Adapter Implementation | Downstream Architectural Target |
|---|---|---|
| **Equipment Registration** | Register tool identity in `public.devices` (`device_id`, `device_type`, `process_type`). | `public.devices` catalog |
| **Collection Events (CEID)** | Translate SECS-II event reports into structured alarm rows keyed by `device_id`. | `<process>_alarm_ms_code` & log |
| **Status Variables (SVID/ECID)** | Translate SECS-II variable reports into hypertable rows keyed by `(device_id, time)`. | `public.<process>_data` hypertable |
| **Explicit Versioning** | Implement versioned adapter payload schema (`adapter-contract-v1`). | API Gateway & Ingestion Validator |

---

## 3. Industrial Security Boundaries (IEC 62443)

Connecting physical shopfloor machinery crosses the plant-floor operational technology boundary:
* **Boundary 1 (front door):** the nginx reverse proxy. It serves **plain HTTP today; TLS termination is not configured**. `/alarm-api/` and `/factory-twin-3d/` require a valid Grafana session (`auth_request`); `/ldi-telemetry` and `/inject` require the `X-API-Key` header, which Node-RED checks, and are rate-limited.
* **Boundary 2 (internal services):** services reach TimescaleDB through PgBouncer in transaction pooling mode on the internal Docker network, each with its own role (see `docs/data/DATA_GOVERNANCE.md`). `alarm-api` uses parameterised queries.
* **Boundary 3 (Shopfloor Equipment Network):** Future Adapter 4 deployments require dedicated OT firewall isolation, mutual TLS / IP whitelisting, and read-only physical taps to ensure IMS cannot transmit write commands to production tools.

---

[⬅️ Back to Architecture Overview](ARCHITECTURE.md) | [<img src="../assets/icons/home.svg" width="18" align="center" /> Main Repository](../../README.md)
