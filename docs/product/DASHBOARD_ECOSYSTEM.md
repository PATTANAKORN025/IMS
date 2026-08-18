<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# 🌌 IMS Dashboard Ecosystem: The Macro-to-Micro Architecture

**Industrial Monitoring System (IMS)** utilizes a 15-dashboard "Cyberpunk HUD" ecosystem designed to completely eliminate alarm fatigue and bridge the gap between enterprise IT and physical Operational Technology (OT).

This document serves as the master catalog, structurally organized by **Altitude (Macro to Micro)**—ensuring the right data reaches the right persona at the exact moment of decision.

---

## 🧭 The 5-Tier Altitude Matrix

The ecosystem scales dynamically from the 30,000-foot executive view down to the sub-surface protocol level.

### 🌍 Tier 1: Executive & Fleet Command (30,000 ft - MACRO)

_Goal: Instant glance-value for business leaders and NOC commanders. Focuses on holistic health, up/down states, and overarching OEE._
_Audience: C-Level Executives, Plant Managers, NOC Commanders_

1. **IMS Easy Overview** (`ims-easy-overview.json`)
   - **Purpose:** Simplified business-level KPI tracking.
   - **Key Metrics:** Global system uptime, gross manufacturing output, and binary health statuses without dense technical noise.
2. **IMS NOC Overview** (`ims-noc-overview.json`)
   - **Purpose:** The 100-inch wall display.
   - **Key Metrics:** Unified Fleet Health Score (0-100), Top 10 critical node leaderboards, and a 24-hour anomaly timeline across the 1,000+ node infrastructure.
3. **LDI Manufacturing Command Center** (`ims-ldi-manufacturing.json`)
   - **Purpose:** The factory floor master view.
   - **Key Metrics:** Real-time Overall Equipment Effectiveness (OEE), physical yield rates, and production bottlenecks across the entire Laser Direct Imaging (LDI) fleet.

### ✈️ Tier 2: System Health & Predictability (10,000 ft)

_Goal: Predictive Operations (AIOps). Fixing problems days before they manifest as outages._
_Audience: IT Directors, Maintenance Planners, SREs_

4. **LDI Factory Digital Twin** (`ims-ldi-factory-digital-twin.json`)
   - **Purpose:** Real-time physical proxy of the PCB production floor.
   - **Key Metrics:** Spatial mapping of machine states, heatmaps of active anomalies, and physical routing constraints.
5. **IMS Capacity Planning** (`ims-capacity-planning.json`)
   - **Purpose:** Predictive forecasting utilizing continuous aggregates.
   - **Key Metrics:** Linear regression trend lines calculating exact "days until 100% capacity" for disk arrays and network bandwidth.
6. **IMS Meta-Monitoring** (`ims-meta-monitoring.json`)
   - **Purpose:** "Monitoring the monitor."
   - **Key Metrics:** Node-RED ingestion pipeline throughput, SNMP walker circuit breaker states, and TimescaleDB query budgets. Ensures the IMS platform itself never fails silently.

### 🚁 Tier 3: Engineering & Deep Analytics (1,000 ft)

_Goal: Root cause correlation between IT infrastructure limits and OT manufacturing yields._
_Audience: SysAdmins, Process Engineers, Data Scientists_

7. **IMS Engineering Drill-Down** (`ims-engineering-drilldown.json`)
   - **Purpose:** The ultimate Swiss-Army knife for SysAdmins.
   - **Key Metrics:** Context-switching via variables to view single-server micro-metrics. Employs **Z-Score Anomaly Detection** against 24-hour rolling baselines for CPU steal time, I/O Wait, and packet drops.
8. **LDI Engineering Analytics** (`ims-ldi-engineering-analytics.json`)
   - **Purpose:** Deep process engineering data science.
   - **Key Metrics:** Correlates environmental OT factors (laser temperature fluctuations, vacuum pressure drops) against structural PCB yield defects.
9. **IMS Ingestion Latency** (`ims-ingestion-latency.json`)
   - **Purpose:** Microsecond lag tracking.
   - **Key Metrics:** Measures the exact propagation delay between a sensor pinging on the factory floor and the data being successfully committed to PostgreSQL via PgBouncer.

### 🏢 Tier 4: Tactical Operations (Ground Level)

_Goal: Binary, zero-latency decision making for the personnel operating the physical hardware._
_Audience: Floor Operators, Line Supervisors, Quality Inspectors_

10. **LDI Machine Snapshot** (`ims-ldi-machine-snapshot.json`)
    - **Purpose:** Live heartbeat of a single, specified LDI machine.
    - **Key Metrics:** Current recipe loaded, active laser power, instantaneous sensor readouts.
11. **LDI Operator Andon** (`ims-ldi-operator-andon.json`)
    - **Purpose:** Ultra-simplified, high-contrast status board.
    - **Key Metrics:** Pure Red/Green visual cues. A "Call for Help" (Andon) interface. If it's green, keep working. If it's red, stop the line immediately to prevent scrap.
12. **LDI Data Readiness** (`ldi-data-readiness.json`)
    - **Purpose:** Data integrity verification.
    - **Key Metrics:** Tracks null values, schema corruption, and sensor offline states at the raw ingestion layer before the data reaches aggregation.

### 🔬 Tier 5: Incident Management & Resolution (Sub-Surface - MICRO)

_Goal: Triaging, acknowledging, and permanently resolving anomalies using standardized playbooks._
_Audience: L1/L2 Support Teams, Incident Commanders_

13. **LDI Alarm Console** (`ims-ldi-alarm-console.json`)
    - **Purpose:** Live event triaging.
    - **Key Metrics:** Active alarm queues, grouping of correlated anomalies, and real-time acknowledgment states.
14. **LDI Alarm Response** (`ims-ldi-alarm-response.json`)
    - **Purpose:** Post-mortem and team efficiency tracking.
    - **Key Metrics:** Tracking SLA compliance, Mean Time To Repair (MTTR), escalation frequencies, and shift performance.
15. **LDI Alarm Dictionary** (`ims-ldi-alarm-dictionary.json`)
    - **Purpose:** The definitive mapping system.
    - **Key Metrics:** Static lookup tables linking raw machine error hex codes directly to human-readable instructions in the `ALARM_PLAYBOOK.md`.

---

> [!NOTE]
> **Design Philosophy Reminder:** None of these dashboards query raw telemetry for timeframes exceeding 24 hours. They are explicitly powered by **TimescaleDB Continuous Aggregates (CAGGs)**, guaranteeing sub-second load times regardless of query depth or user concurrency. All dashboards conform to the **Grid-24 Discipline** for mathematically perfect layout scaling.
