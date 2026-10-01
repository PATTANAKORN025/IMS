<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS Engineering Onboarding Guide</h1>
  <p><b>Comprehensive operational walkthrough, architecture orientation, and troubleshooting workflows for engineers</b></p>
  <p>
    <a href="ONBOARDING.md">English</a> |
    <a href="../../th/docs/product/ONBOARDING.md">ไทย</a> |
    <a href="../../zh-CN/docs/product/ONBOARDING.md">简体中文</a>
  </p>
</div>

---

## 1. Welcome & Orientation

Welcome to the **Industrial Monitoring System (IMS)** engineering team. IMS is a mission-critical telemetry platform designed for high-precision industrial PCB manufacturing lines (Laser Direct Imaging / LDI), CNC drilling machinery, and Vertical Continuous Plating (VCP) facilities.

### Architecture Overview

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart LR
  accTitle: IMS at a glance
  accDescr: Machines send data over HTTP or are polled over SNMP; nginx and Node-RED ingest it through PgBouncer into TimescaleDB; Grafana shows 22 dashboards; Prometheus, Alertmanager and Grafana alerts reach LINE and Teams through Node-RED.
  EDGE["LDI · SNMP devices"]:::ext
  IN["nginx :3000 → Node-RED"]:::flow
  PGB["PgBouncer :5432"]:::app
  TSDB[("TimescaleDB")]:::store
  GRAF["Grafana · 22 dashboards"]:::viz
  ALERT["Prometheus → Alertmanager"]:::obs
  NOTIFY["LINE · Teams"]:::notify
  EDGE -->|"HTTP · SNMP"| IN --> PGB --> TSDB --> GRAF
  IN -->|"/metrics"| ALERT -->|"via Node-RED"| NOTIFY
  GRAF -->|"alert rules via Node-RED"| NOTIFY
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

## 2. Day-1 Developer Setup

To get your local development environment operational in under 5 minutes:

### Prerequisites

- **Docker Desktop** / Docker Engine (Compose v2 supported)
- **Node.js** (v18 or v20 LTS)
- **Make** (or run equivalent scripts via PowerShell on Windows)

### First-Time Initialization

```bash
# 1. Clone repository
git clone https://github.com/PATTANAKORN025/IMS.git
cd IMS

# 2. Configure environment
cp .env.example .env
# Edit .env and replace default passwords with secure local values

# 3. Verify toolchain prerequisites
make doctor

# 4. Start all 16 containers with mock data
make up

# 5. Verify system health and container states
make verify
```

Once running, navigate to `http://localhost:3000` to access the Grafana portal.

---

## 3. Core Operational Workflows

### Incident Triage & Drill-Down

When a manufacturing excursion or infrastructure alert fires:

1. **NOC Overview (`/d/ims-noc-overview`)**:
   - Inspect the aggregate plant telemetry for thermal, scan speed, or registration outliers.
   - Click any highlighted metric to follow the Grafana Data Link directly to the equipment drill-down.
2. **LDI Manufacturing Fleet Command Center (`/d/ims-ldi-manufacturing`)**:
   - Filter by `$machine_id` (e.g., `LDI-01` through `LDI-10`).
   - Analyze process capability indices ($C_p, C_{pk}$) and rolling 3-sigma Z-scores calculated dynamically over TimescaleDB Continuous Aggregates.
3. **Alarm Console (`/d/ims-ldi-alarm-console`)**:
   - Review open alarms logged into `public.ldi_alarm_lifecycle`.
   - Operators acknowledge active alarms; engineers resolve alarms with mandatory root cause analysis notes via `ims-alarm-api`.

---

## 4. Engineering Standards & Guardrails

- **Zero-Risk Pipeline Rule**: Never modify `nodered_data/flows.json` directly. Source split flows reside in `nodered_data/flows/*.json`. Run `make deploy-flows` to concatenate and deploy.
- **Database Schema**: All application tables and hypertables reside strictly within the `public` schema.
- **Pre-Commit Gate**: Always run `make check` (or `node scripts/pre-commit.js`) prior to opening a PR. All unit tests, linters, and verification checks must pass cleanly.

For deeper technical deep-dives, consult the [Docs Index](../README.md).
