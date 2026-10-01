<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>Enterprise Blameless Post-Mortem & Incident Review Template</h1>
  <p><b>Standardized root-cause analysis, timeline reconstruction, SLO error budget impact, and corrective action governance</b></p>
  <p>
    <a href="TEMPLATE.md">English</a> |
    <a href="../../../th/docs/sre/postmortems/TEMPLATE.md">ไทย</a> |
    <a href="../../../zh-CN/docs/sre/postmortems/TEMPLATE.md">简体中文</a>
  </p>
</div>

---

> **Post-Mortem Philosophy:**  
> We operate under a strict **Blameless Culture** (Google SRE / Etsy standard). We assume every engineer acted in good faith with the best information available at the time. Post-mortems investigate **systemic vulnerabilities, architectural boundaries, automation failures, and operational tooling**, never individual human error.

---

## 1. Incident Overview & Metadata

| Incident Attribute | Value |
|---|---|
| **Incident Title** | `[INC-YYYYMMDD-SEVX] Short Descriptive Incident Title` |
| **Severity Level** | **SEV-1** (Critical Outage) \| **SEV-2** (Major Degradation) \| **SEV-3** (Minor Incident) |
| **Incident Date** | `YYYY-MM-DD` |
| **Incident Commander** | `@incident-commander` |
| **Lead SRE / Investigator** | `@sre-lead` |
| **Communication Lead** | `@comms-lead` |
| **Impacted Services** | `ims-timescaledb`, `ims-node-red`, `ims-pgbouncer`, `ims-grafana` |
| **Current Status** | `[ Draft | Review In Progress | Approved & Action Items Active | Closed ]` |

---

## 2. Executive Summary & Impact Analysis

### Executive Summary
*(Provide a concise, 2-to-3 paragraph summary detailing what failed, the immediate trigger, the blast radius, and how recovery was achieved.)*

### Business & Operational Impact
* **Total Incident Duration:** `XX hours YY minutes`
* **Telemetry Downtime / Data Blackout:** `XX minutes`
* **Dropped / Unbuffered Ingestion Events:** `~X,XXX events`
* **Affected Equipment Lines:** `[e.g., LDI Photolithography Lines 1–4, CNC Drilling Spindles 01–12]`
* **SLO Error Budget Consumption:**
  - Ingestion Availability SLO (99.9% monthly): Consumed **XX.X%** of 30-day budget.
  - Query Latency SLO (P95 < 500ms): Consumed **YY.Y%** of budget.

$$\text{Error Budget Burn Rate} = \frac{\text{Observed Error Rate}}{\text{Allowed Error Rate}} = \frac{1 - \text{SLI}}{1 - \text{SLO}}$$

---

## 3. Incident Lifecycle Metrics

```text
Detection (TTD)      Acknowledgement (TTA)      Mitigation (TTM)      Full Resolution (TTR)
    [ 4 min ] ------------ [ 2 min ] ------------- [ 18 min ] ------------ [ 35 min ]
```

* **Time to Detect (TTD):** `4 minutes` (From fault onset to automated Alertmanager firing)
* **Time to Acknowledge (TTA):** `2 minutes` (From alert dispatch to on-call engineer triage)
* **Time to Mitigate (TTM):** `18 minutes` (From triage to system stabilization / traffic bypass)
* **Time to Resolve (TTR):** `35 minutes` (From triage to permanent fix deployment and queue flush)

---

## 4. Incident Timeline & Sequence Flow

All timestamps must be recorded in **UTC and Indochina Time (ICT / UTC+7)**.

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
sequenceDiagram
  accTitle: Example incident timeline (replace with the real one)
  accDescr: Illustrative timeline for a connection-pool exhaustion incident: detection by alert, declaration, mitigation and recovery.
  autonumber
  participant Mon as Prometheus / Alertmanager
  participant On as On-call SRE
  participant Pipe as Node-RED
  participant DB as PgBouncer / TimescaleDB
  participant IC as Incident commander
  Note over Mon,IC: Illustrative example — replace with the real timeline
  Pipe->>DB: insert burst
  DB-->>Pipe: pool exhausted
  Mon->>On: alert fires
  On->>IC: declare incident
  IC->>DB: inspect pools, apply mitigation
  DB-->>Pipe: commits resume
  IC->>On: mitigated, monitoring
```

### Detailed Event Log
* `14:02 ICT (07:02 UTC)` — Ingestion batch burst commences following machine network reconnect.
* `14:04 ICT (07:04 UTC)` — `ims-pgbouncer` client connections hit configured ceiling (`max_client_conn`).
* `14:06 ICT (07:06 UTC)` — Prometheus triggers `HighIngestionLatency` warning to Alertmanager.
* `14:08 ICT (07:08 UTC)` — On-call SRE acknowledges alert and opens incident command channel.
* `14:15 ICT (07:15 UTC)` — SRE discovers unindexed query causing slow transaction holding connection slots.
* `14:24 ICT (07:24 UTC)` — Emergency pool scaling applied via `docker exec ims-pgbouncer kill -HUP 1`.
* `14:39 ICT (07:39 UTC)` — Queue fully flushed; end-to-end ingestion latency stabilizes at 180ms.

---

## 5. Root Cause Analysis (5 Whys)

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TD
  accTitle: Example 5 whys (replace with the real analysis)
  accDescr: Illustrative chain of five whys ending in a root cause.
  W1["1 · Why were dashboards stale?"]:::app
  W2["2 · Why did ingestion stall?"]:::app
  W3["3 · Why were connections refused?"]:::app
  W4["4 · Why was the pool exhausted?"]:::app
  W5["5 · Root cause: connection not released on an error path"]:::notify
  W1 --> W2 --> W3 --> W4 --> W5
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

1. **Why did Grafana dashboards display stale telemetry?**  
   The real-time panels were not receiving new rows from `public.ldi_data`.
2. **Why was telemetry stalled in Node-RED?**  
   The Node-RED ingestion pipeline was backpressuring due to database insert timeouts.
3. **Why was PgBouncer rejecting database connections?**  
   The active client connection count hit the hard limit of `default_pool_size`.
4. **Why did the client connection pool exhaust?**  
   Connections were held open indefinitely during upstream network retries.
5. **Why were connections held open indefinitely (Root Cause)?**  
   An error-handling code path in the custom Node-RED database wrapper failed to call `client.release()` upon HTTP client socket abort.

---

## 6. Diagnostic Telemetry & PromQL Queries

The following queries were utilized during active triage to diagnose the failure:

```promql
# 1. Pipeline freshness: seconds since the last successful flush
time() - max(ims_pipeline_last_flush_timestamp_seconds)

# 2. Insert failure ratio (no PgBouncer exporter is deployed; use SHOW POOLS for pool state)
sum(rate(ims_pipeline_inserts_failed_total[5m])) / clamp_min(sum(rate(ims_pipeline_inserts_total[5m])), 1e-9)

# 3. Buffer overflows (records dropped before insert)
sum(rate(ims_pipeline_buffer_overflows_total[5m]))
```

```sql
-- Database Active Transaction Inspection
SELECT pid, now() - xact_start AS duration, query, state
FROM pg_stat_activity
WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC
LIMIT 10;
```

---

## 7. Lessons Learned & Retrospective

### What Went Well
* Automated Prometheus alerting fired within 4 minutes of threshold violation.
* Health check watchdogs prevented memory corruption in `ims-timescaledb`.
* Blameless coordination between OT plant engineering and IT/SRE teams.

### What Went Wrong
* Runbook lacked explicit command syntax for hot-reloading PgBouncer configuration without container restart.
* Node-RED connection pool error-handling branch lacked automated unit test coverage.

### Where We Got Lucky
* Incident occurred during scheduled shift changeover; zero finished PCB panels were discarded.
* Secondary network interface prevented complete gateway disconnection.

---

## 8. Preventative & Corrective Action Items

| Item ID | Category | Action Item Description | Priority | Owner | Target Date | Verification Ticket |
|---|---|---|---|---|---|---|
| **ACT-01** | **Prevent** | Fix connection release in Node-RED error handler and add regression unit test | `P0` | `@engineer-dev` | `YYYY-MM-DD` | `PR #XXX` |
| **ACT-02** | **Detect** | Add Prometheus alert rule for PgBouncer pool saturation (`waiting_clients > 10`) | `P1` | `@sre-lead` | `YYYY-MM-DD` | `ISSUE-YYY` |
| **ACT-03** | **Mitigate** | Document PgBouncer hot-reload procedure (`RELOAD` / `kill -HUP`) in Incident Playbook | `P1` | `@sre-lead` | `YYYY-MM-DD` | `DOCS-ZZZ` |
| **ACT-04** | **Process** | Conduct DR chaos drill simulating pool exhaustion across all 4 machine domains | `P2` | `@qa-team` | `YYYY-MM-DD` | `DR-TEST-AAA` |

---

[⬅️ Back to SRE Index](../SLO_DEFINITIONS.md) | [<img src="../../assets/icons/home.svg" width="18" align="center" /> Main Repository](../../../README.md)
