<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS Manufacturing Domain Extensibility & Process Architecture</h1>
  <p><b>Multi-process expansion patterns, LDI reference architecture, database schema separation, and onboarding checklist</b></p>
  <p>
    <a href="MANUFACTURING_DOMAIN.md">English</a> |
    <a href="../../th/docs/architecture/MANUFACTURING_DOMAIN.md">ไทย</a> |
    <a href="../../zh-CN/docs/architecture/MANUFACTURING_DOMAIN.md">简体中文</a>
  </p>
</div>

---

> **Purpose:** Document the architectural blueprint behind IMS's manufacturing process integrations (LDI photolithography, CNC drilling, VCP electroplating) so onboarding the *next* process type (e.g., Automated Optical Inspection - AOI, chemical etching, surface mount - SMT) is purely additive — a new migration, a new alarm master, and a new dashboard trio — without refactoring or breaking existing production pipelines.
>
> **Provenance:** Every pattern described below reflects the real, working implementation across LDI, CNC drilling, and VCP plating lines, verified against the live schema and dashboard inventory.
>
> **Extensibility:** Ensures zero-downtime scalability across diverse manufacturing stages while maintaining strict separation of concerns.

---

## 1. Domain Extensibility Architecture Topology

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: Process domains and how a new one is added
  accDescr: LDI lives in the ims database with its registry in public.devices; drilling and VCP live in eap_backup, with the drilling registry in machine_master; a new process adds its own tables, aggregates and dashboards without changing the shared platform.
  subgraph PLATFORM["Shared platform"]
    PGB["PgBouncer · SCRAM"]:::app
    LINT["CI linters<br/>dashboard · query budget · alarm sync"]:::app
    GRAF["Grafana · one folder per domain"]:::viz
  end
  subgraph LDI["LDI · database ims"]
    LREG[("public.devices")]:::store
    LTBL[("ldi_data · ldi_alarm_log")]:::store
    LAGG[("ldi_data_1m · 15m · 1h · hourly")]:::store
  end
  subgraph DRL["Drilling · database eap_backup"]
    DREG[("machine_master")]:::store
    DTBL[("machine_event · agent_log")]:::store
    DVIEW[("drilling.event · drilling.telemetry")]:::store
  end
  subgraph VCP["VCP · database eap_backup"]
    VTBL[("vcp_upp · vcp_alarm · vcp_status_change")]:::store
    VVIEW[("eap_api_vcp_* views")]:::store
  end
  subgraph NEW["New process (example: AOI)"]
    NTBL[("&lt;process&gt;_data · hypertable")]:::future
    NAGG[("&lt;process&gt;_data_1m")]:::future
  end
  LREG --> LTBL --> LAGG --> GRAF
  DREG --> DTBL --> DVIEW --> GRAF
  VTBL --> VVIEW --> GRAF
  NTBL -.-> NAGG -.-> GRAF

  subgraph LEGEND["Legend · arrows = data flow"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_app["IMS service"]:::app ~~~ LG_viz["Grafana / UI"]:::viz ~~~ LG_store["Data store"]:::store ~~~ LG_future["Not built yet"]:::future
    end
  end
  GRAF ~~~ LEGEND
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

## 2. The 5-Tier Expansion Pattern

| Architectural Tier | LDI Photolithography (Reference Implementation) | Generic Pattern for Next Process (e.g. AOI / Etching) |
|---|---|---|
| **1. Device Identity** | `public.devices.device_type = 'ldi'`, `public.devices.process_type = 'ldi'` (migration 067/068). Non-manufacturing gear has `process_type = NULL`. | Register tools with distinct `device_type` (e.g. `'aoi'`) and `process_type` (`'aoi'`, `'etching'`). Columns are independent: allows future tools to share transport while isolating process logic. |
| **2. Telemetry Storage** | `public.ldi_data` — hypertable with LDI columns (`pe1..pe6`, `je1..je4`, `thickness`, `scan_speed`), keyed by `(machine_id, time)`. | One hypertable per process type, keyed by `(device_id, time)` with FK to `public.devices`. Column definitions are domain-specific by design (e.g. defect counts for AOI, acid bath concentration for Etching). |
| **3. Alarm Master** | `public.ldi_alarm_ms_code` (code, severity, description) and `public.ldi_alarm_log` event stream. Enforced by `alarm-sync-linter.js`. | One alarm catalog table per process (`<process>_alarm_ms_code`), using identical schema structure, FK constraints, and automated linter registration. |
| **4. SPC / RCA Views** | `public.v_machine_spc_fleet` and `public.v_ldi_rca_recent_window` (migration 064), filtering by `device_type = 'ldi'`. | Create process-specific sibling views (`v_<process>_spc_fleet`) sharing the standardized Cpk/RCA calculation engine and background job schedule (`add_job`). |
| **5. Dashboard Trio** | **Operator Andon** (`ims-ldi-operator-andon.json`), **Engineering Analytics** (`ims-ldi-engineering-analytics.json`), and **Manufacturing Overview** (`ims-ldi-manufacturing.json`). | Deploy the required Trio under `monitoring/grafana/dashboards/manufacturing/` tagged `["manufacturing", "<process>"]`, satisfying `dashboard-linter.js` Check 18. |

---

## 3. Production Onboarding DDL Template

To onboard a new manufacturing process, execute an additive migration following this standard template:

```sql
-- Migration 087: Onboard New Process (e.g. Automated Optical Inspection - AOI)
-- 1. Register Equipment in Unified Master Catalog
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, process_type, location, enabled)
VALUES 
  ('AOI-01', 'aoi-station-01.factory.local', '10.20.30.51', 'aoi', 'aoi', 'Floor 2 - SMT Line 1', TRUE),
  ('AOI-02', 'aoi-station-02.factory.local', '10.20.30.52', 'aoi', 'aoi', 'Floor 2 - SMT Line 2', TRUE)
ON CONFLICT (device_id) DO NOTHING;

-- 2. Create Domain-Specific Telemetry Table & Hypertable
CREATE TABLE IF NOT EXISTS public.aoi_telemetry (
  "time" TIMESTAMPTZ NOT NULL,
  machine_id VARCHAR(64) NOT NULL REFERENCES public.devices(device_id),
  inspection_cycle_ms NUMERIC(10,2),
  defect_count INT DEFAULT 0,
  false_alarm_rate NUMERIC(5,2),
  optical_lighting_lux NUMERIC(8,2),
  lot_id VARCHAR(64)
);

SELECT create_hypertable('public.aoi_telemetry', 'time', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

-- 3. Configure Native Columnar Compression
ALTER TABLE public.aoi_telemetry SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'machine_id',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('public.aoi_telemetry', INTERVAL '7 days');

-- 4. Create Alarm Master Dictionary & Event Log
CREATE TABLE IF NOT EXISTS public.aoi_alarm_ms_code (
  alarm_code VARCHAR(32) PRIMARY KEY,
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.aoi_alarm_log (
  event_id BIGSERIAL PRIMARY KEY,
  "time" TIMESTAMPTZ NOT NULL,
  machine_id VARCHAR(64) NOT NULL REFERENCES public.devices(device_id),
  alarm_code VARCHAR(32) NOT NULL REFERENCES public.aoi_alarm_ms_code(alarm_code),
  status VARCHAR(16) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  acknowledged_by VARCHAR(64),
  resolved_by VARCHAR(64)
);
```

---

## 4. Onboarding Checklist for a New Process Type

1. **Migration:** Register the equipment in `public.devices` with the appropriate `device_type` and a new `process_type`. Create the domain hypertable and columnar compression policy in the same migration.
2. **Alarm Master:** Seed the `<process>_alarm_ms_code` dictionary and `<process>_alarm_log` event table.
3. **Continuous Aggregates & Views:** Add CAGG rollups (`cagg_<process>_1m`) and process-specific SPC/RCA views.
4. **Dashboard Trio:** Build the Operator Andon, Engineering Analytics, and Manufacturing Overview dashboards; place them in `monitoring/grafana/dashboards/manufacturing/` tagged `["manufacturing", "<process>"]`.
5. **Quality Gates:** Register the new process in `tests/lint/alarm-sync-linter.js` and run `scripts/pre-commit.js` to ensure 100% compliance.
6. **Documentation Sync:** Run `node scripts/generate-dashboard-inventory.js` and `node scripts/generate-schema-inventory.js` to update inventory catalogs automatically.

---

[⬅️ Back to Architecture Overview](ARCHITECTURE.md) | [<img src="../assets/icons/home.svg" width="18" align="center" /> Main Repository](../../README.md)
