<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# <img src="../../docs/assets/icons/aperture.svg" width="24" align="center" /> IMS Dashboard Ecosystem: Macro-to-Micro Architecture

**Industrial Monitoring System (IMS)** utilizes a **"Cyberpunk HUD" dashboard ecosystem** designed to completely eliminate alarm fatigue and bridge the gap between enterprise IT and physical Operational Technology (OT).

This document serves as the master catalog, structurally organized by **Altitude (Macro to Micro)**—ensuring the right data reaches the right persona at the exact moment of decision.

---

## 🗺️ Ecosystem Topology

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
mindmap
  root((IMS dashboards))
    T1(Tier 1 · executive & fleet)
      LDI 01 Fleet Executive Overview
      Platform 01 NOC Overview
      LDI 04 Manufacturing Fleet Command Center
      Drilling 01 Fleet Digital Twin & Overview
      VCP 01 Plating Fleet Overview
    T2(Tier 2 · system health)
      LDI 03 Factory 3D Digital Twin
      Platform 03 AIOps Capacity
      Platform 05 Meta-Monitoring
      Drilling 02 Shift Production & OEE
    T3(Tier 3 · deep analytics)
      Platform 02 Engineering Drill-Down
      LDI 06 Engineering Analytics & SPC
      Platform 04 Ingestion Latency
      Drilling 04 Fleet Anomaly & RCA
    T4(Tier 4 · shop floor)
      LDI 05 Machine Snapshot
      LDI 02 Operator Andon
      LDI 10 Data Readiness
      Drilling 03 Machine Investigation
      VCP 03 Real-Time Wall
      VCP 02 Operations Console
    T5(Tier 5 · alarm triage)
      LDI 07 Alarm Console
      LDI 08 Alarm Response
      LDI 09 Alarm Dictionary
```

> [!TIP]
> **Performance Architecture:** None of these dashboards query raw telemetry for timeframes exceeding 24 hours. They are explicitly powered by **TimescaleDB Continuous Aggregates (CAGGs)**, guaranteeing sub-second load times regardless of query depth or user concurrency. All dashboards conform to the **Grid-24 Discipline**. Full technical specifications and panel counts are documented in the **[Dashboard Inventory](../architecture/DASHBOARD_INVENTORY.md)**.

---

## <img src="../../docs/assets/icons/globe.svg" width="18" align="center" /> Tier 1: Executive & Fleet Command (30,000 ft - MACRO)

_**Goal**: Instant glance-value for business leaders. Focuses on holistic health, up/down states, and overarching OEE._
**Audience**: C-Level Executives, Plant Managers, NOC Commanders

| Dashboard | Description | Preview |
|-----------|-------------|---------|
| **IMS NOC Overview** | Unified Fleet Health Score (0-100), Top 10 critical node leaderboards, and anomaly timeline. | <img src="../../assets/noc-overview.png" width="250"/> |
| **LDI Manufacturing** | Real-time Overall Equipment Effectiveness (OEE), physical yield rates, and production bottlenecks. | <img src="../../assets/ldi-manufacturing.png" width="250"/> |
| **IMS Easy Overview** | Simplified business-level KPI tracking. Global system uptime and gross manufacturing output. | <img src="../../assets/ims-easy-overview.png" width="250"/> |
| **Drilling Fleet Overview** | Fleet-wide CNC spindle utilization, tool usage, running states, and machine alarm distribution. | *(Synthetic EAP data source)* |
| **VCP Overview** | Multi-line VCP plating overview, active flight bars, line speed, and bath parameter health. | *(Synthetic EAP data source)* |

---

## <img src="../../docs/assets/icons/activity.svg" width="18" align="center" /> Tier 2: System Health & Predictability (10,000 ft)

_**Goal**: Predictive Operations (AIOps). Fixing problems days before they manifest as outages._
**Audience**: IT Directors, Maintenance Planners, SREs

| Dashboard | Description | Preview |
|-----------|-------------|---------|
| **Capacity Planning** | Predictive forecasting. Linear regression lines calculating exact "days until 100% capacity". | <img src="../../assets/capacity-planning.png" width="250"/> |
| **Meta-Monitoring** | "Monitoring the monitor." Ingestion pipeline throughput, SNMP states, and query budgets. | <img src="../../assets/meta-monitoring.png" width="250"/> |
| **Factory Digital Twin** | Real-time physical proxy of the PCB production floor. Spatial mapping of machine states. | *(Requires specialized 3D plugin)* |
| **Drilling Shift Production** | Production yield tracking across day/night shifts, total drilled panels, and run-time forecasting. | *(Synthetic EAP data source)* |

---

## <img src="../../docs/assets/icons/crosshair.svg" width="18" align="center" /> Tier 3: Engineering & Deep Analytics (1,000 ft)

_**Goal**: Root cause correlation between IT infrastructure limits and OT manufacturing yields._
**Audience**: SysAdmins, Process Engineers, Data Scientists

| Dashboard | Description | Preview |
|-----------|-------------|---------|
| **Engineering Drill-Down** | Context-switching micro-metrics. Z-Score Anomaly Detection against 24h rolling baselines. | <img src="../../assets/engineering-drilldown.png" width="250"/> |
| **LDI Analytics** | Deep process engineering. Correlates OT factors (temperature fluctuations) against PCB yield defects. | <img src="../../assets/ldi-engineering.png" width="250"/> |
| **Ingestion Latency** | Measures the exact propagation delay between a sensor ping and PostgreSQL commit (PgBouncer). | *(CAGG aggregation active)* |
| **Drilling Anomaly Analysis** | Multi-dimensional correlation between tool breakage, spindle speed deviation, and machine alarms. | *(Synthetic EAP data source)* |

---

## <img src="../../docs/assets/icons/server.svg" width="18" align="center" /> Tier 4: Tactical Operations (Ground Level)

_**Goal**: Binary, zero-latency decision making for the personnel operating the physical hardware._
**Audience**: Floor Operators, Line Supervisors, Quality Inspectors

| Dashboard | Description | Preview |
|-----------|-------------|---------|
| **Operator Andon** | Ultra-simplified, high-contrast status board. Pure Red/Green visual cues. If red, stop the line. | <img src="../../assets/ldi-andon.png" width="250"/> |
| **Machine Snapshot** | Live heartbeat of a single machine. Current recipe loaded, laser power, sensor readouts. | <img src="../../assets/ldi-machine.png" width="250"/> |
| **Data Readiness** | Data integrity verification. Tracks null values, schema corruption, and sensor offline states. | <img src="../../assets/ldi-data-readiness.png" width="250"/> |
| **Drilling Machine Investigation** | Single-spindle drill-down, XY table motion telemetry, tool wear life, and sensor events. | *(Synthetic EAP data source)* |
| **VCP Realtime Wall** | Flight-deck real-time wall screen for VCP plating line, showing rectifier currents, amp-minutes, and bath temperatures. | *(Synthetic EAP data source)* |
| **VCP Operations Console** | Plating cell rectifier control, flight bar progress, bath heating/dosing telemetry. | *(Synthetic EAP data source)* |

---

## <img src="../../docs/assets/icons/zoom-in.svg" width="18" align="center" /> Tier 5: Incident Management & Resolution (Sub-Surface - MICRO)

_**Goal**: Triaging, acknowledging, and permanently resolving anomalies using standardized playbooks._
**Audience**: L1/L2 Support Teams, Incident Commanders

| Dashboard | Description | Target Flow |
|-----------|-------------|-------------|
| **LDI Alarm Console** | Active alarm queues, grouping of correlated anomalies, real-time triage. | `Alertmanager -> Console` |
| **LDI Alarm Response** | Post-mortem tracking. SLA compliance, MTTR, escalation frequencies. | `Console -> Resolution` |
| **LDI Alarm Dictionary** | Definitive mapping system linking hex codes to human-readable playbooks. | `Database -> Playbook` |

> [!IMPORTANT]
> **Data Integrity Constraint:** Any dashboard displaying aggregated data (Tiers 1-3) MUST pull exclusively from Continuous Aggregates. Only Tier 4 and 5 dashboards are authorized to query raw telemetry tables.
