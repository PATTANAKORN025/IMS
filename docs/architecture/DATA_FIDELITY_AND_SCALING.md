<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Data Fidelity & Scale Management Architecture

This document outlines the architectural challenges and solutions for the IMS system as it scales to support 1,000+ devices. The primary focus is maintaining millisecond-level data accuracy, preventing alert fatigue, and ensuring simulator realism compared to real-world environments.

---

## 1. Scaling Risks & Latency

As the system expands to handle massive fleets, **Network Latency** and **Event Loop Blocking** in the ingestion layer (Node-RED) become primary bottlenecks, compromising data resolution.

### <img src="../assets/icons/alert-triangle.svg" width="18" height="18" align="center" /> The Problem

- If timestamping occurs at the server side (Node-RED or PostgreSQL), any data delayed in network transit or queued up will receive an inaccurate timestamp.
- Network jitter degrades millisecond-level resolution, causing incorrect event sequencing.

### <img src="../assets/icons/check.svg" width="18" height="18" align="center" /> Architectural Solution

1. **Edge-Level Timestamping:**
   End devices/sensors are strictly required to attach timestamps to their own payloads (using ISO8601 precision). IMS natively trusts the `time` reported by the edge.
2. **TimescaleDB Micro-batching:**
   PgBouncer is utilized for connection pooling, and Node-RED is architected to aggregate data into batches before executing `INSERT` statements. This reduces transaction overhead and prevents database locks.
3. **Worker Thread Isolation:**
   Node-RED workflows are isolated into independent worker threads (e.g., separating the SNMP parser from HTTP LDI ingestion). This ensures CPU-bound tasks do not block incoming I/O.

---

## 2. Simulator vs. Real-World Fidelity

Testing a system with simulated data often yields artificially perfect results that fail to reflect the chaotic reality of industrial environments.

### <img src="../assets/icons/alert-triangle.svg" width="18" height="18" align="center" /> The Problem

- The legacy SNMP simulator generated perfect sine waves, making it impossible to rigorously test TimescaleDB caching, compression thresholds, or alert triggers dependent on data spikes.

### <img src="../assets/icons/check.svg" width="18" height="18" align="center" /> Architectural Solution

1. **Chaos Engineering in the Simulator:**
   `Jitter`, `Random Drops`, and `Spikes` were engineered into the simulator (configurable via the simulator's `docker-compose.yml`) to inject network noise mirroring real-world conditions.
2. **Real-World Data Replay:**
   The system natively supports ingesting raw data dumps from actual factory floors via Pcap or JSON loaders. This validates pipeline processing capability and ensures Grafana dashboards render correctly under highly volatile conditions.

---

## 3. Realistic Alarm Management & Alert Fatigue

The objective of IMS is to trigger alerts strictly for anomalies "that carry business impact." Excessive alerting inevitably leads to alert fatigue among engineers.

### <img src="../assets/icons/alert-triangle.svg" width="18" height="18" align="center" /> The Problem

- High-resolution data (millisecond precision) frequently oscillates across threshold boundaries (flapping), generating false positives and flooding LINE/MS Teams with thousands of messages per minute.

### <img src="../assets/icons/check.svg" width="18" height="18" align="center" /> Architectural Solution

1. **Prometheus `FOR` Clauses:**
   All alert rules enforce duration conditions. For instance, `CPU > 90% FOR 5m` requires the anomaly to persist continuously for 5 minutes before it is escalated as a real issue (filtering out transient spikes).
2. **Alertmanager Grouping & Deduplication:**
   Alertmanager groups alerts by `machine_id` and `severity`. If a single machine experiences cascading errors within the same window, the system consolidates them into a single notification payload.
3. **Exponential Backoff for Notifications:**
   If an issue remains unresolved, the system dynamically spaces out repeat notifications (e.g., every 15 minutes, 1 hour, 4 hours) rather than spamming.

---

## 4. Historical Data Drift Management

TimescaleDB relies on Continuous Aggregates (CAGGs) to preemptively rollup data for rapid dashboard rendering.

### <img src="../assets/icons/alert-triangle.svg" width="18" height="18" align="center" /> The Problem

- Edge devices may experience offline periods and eventually transmit backlogged data (Late-Arriving Data). If this data arrives after the CAGG has executed its rollup, the hourly/daily summaries become permanently drifted from the raw truth.

### <img src="../assets/icons/check.svg" width="18" height="18" align="center" /> Architectural Solution

1. **Watermark Policies & Refresh Windows:**
   The `refresh_continuous_aggregate` policy is configured to generously overlap with late-arriving data windows (e.g., automatically re-refreshing yesterday's data at midnight).
2. **Data Interpolation in Grafana:**
   In the event of data gaps caused by network drops, Grafana queries leverage `interpolate()` or `$__interval` padding to prevent visual chart breakage.
3. **Reconciliation Audits:**
   Automated validation scripts continuously cross-check CAGG tables against Raw tables to verify high-fidelity data parity.

---

## 5. System Value & Efficiency

Investment in these advanced engineering solutions translates directly to tangible **Return on Investment (ROI)**:

- **Zero False-Positive Maintenance:** Engineers no longer waste man-hours physically inspecting machines due to transient sensor fluctuations.
- **Storage Cost Efficiency:** Millisecond telemetry represents massive data volume. Leveraging TimescaleDB Compression (up to 90% reduction) allows the business to retain years of historical data without astronomical storage procurement costs.
- **Audit-Ready Fidelity:** The combination of edge-timestamping and zero data drift ensures IMS telemetry is legally and operationally rigorous enough to serve as evidence during strict Quality Audits.
