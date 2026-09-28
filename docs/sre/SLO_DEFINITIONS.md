<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS Site Reliability Engineering (SRE): SLI & SLO Definitions</h1>
  <p><b>Service level indicators built only on metrics the stack exports today, their objectives, and what is not yet measured</b></p>
  <p>
    <a href="SLO_DEFINITIONS.md">English</a> |
    <a href="../../th/docs/sre/SLO_DEFINITIONS.md">ไทย</a> |
    <a href="../../zh-CN/docs/sre/SLO_DEFINITIONS.md">简体中文</a>
  </p>
</div>

---

> **Rule for this page:** every query below runs against the stack as shipped. Prometheus scrapes blackbox probes and Node-RED's `/metrics`. Ingestion latency lives in TimescaleDB (`ingest_ts`, migration 081). Nothing else is scraped: Grafana, nginx and PgBouncer export no metrics to Prometheus. SLIs that would need them are listed in section 4 as **not measured**.

---

## 1. Measured SLIs and objectives

Objectives use a rolling 30-day window. They are targets set for this plant, not contractual guarantees.

| SLI | Source | Objective (SLO) | 30-day error budget |
| --- | --- | --- | --- |
| **Platform availability**: blackbox HTTP probes of Grafana, Node-RED, Prometheus and Alertmanager succeed | Prometheus `probe_success{job="blackbox-http"}` | ≥ 99.9% | 43.2 minutes of failed probes per target |
| **Write success**: ingestion inserts that do not fail | Prometheus `ims_pipeline_inserts_total`, `ims_pipeline_inserts_failed_total` | ≥ 99.9% | 0.1% of inserts |
| **Pipeline freshness**: seconds since the last successful flush | Prometheus `ims_pipeline_last_flush_timestamp_seconds` | < 120 s for 99% of minutes | 432 minutes over 120 s |
| **Ingestion latency**: source timestamp to database commit, LDI rows | TimescaleDB `ldi_data.ingest_ts - ldi_data.time` | p99 < 2 s | 1% of rows slower |
| **SNMP polling alive**: device polls happening | Prometheus `ims_pipeline_devices_polled_total` | rate > 0 at all times | alert, not budgeted |

---

## 2. Queries

### 2.1 Platform availability

```promql
avg_over_time(probe_success{job="blackbox-http"}[30d]) * 100
```

### 2.2 Write success

$$\text{SLI}_{\text{write}} = 1 - \frac{\Delta\,\text{inserts\_failed}}{\Delta\,\text{inserts}}$$

```promql
(1 - sum(increase(ims_pipeline_inserts_failed_total[30d]))
     / clamp_min(sum(increase(ims_pipeline_inserts_total[30d])), 1)) * 100
```

### 2.3 Pipeline freshness

```promql
time() - max(ims_pipeline_last_flush_timestamp_seconds)
```

### 2.4 Ingestion latency (SQL, not PromQL)

```sql
SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY extract(epoch FROM ingest_ts - time)) AS p99_seconds,
       count(*) AS rows
FROM public.ldi_data
WHERE time > now() - interval '1 hour' AND ingest_ts IS NOT NULL;
```

The "Platform — 04 Ingestion Pipeline Latency & Telemetry SLO" dashboard plots the same measurement.

### 2.5 SNMP polling alive

```promql
sum(rate(ims_pipeline_devices_polled_total[5m]))
```

---

## 3. Alerts that already guard these SLIs

`monitoring/prometheus/rules/ims-alerts.yml` ships these rules:

| Rule | Condition | Guards |
| --- | --- | --- |
| `ServiceDown` | `probe_success == 0` | availability |
| `SLABreachWarning` | `(1 - avg_over_time(probe_success[1h])) * 100 > 0.01` | availability |
| `PipelineDataStalled` | `rate(ims_pipeline_inserts_total[5m]) == 0` | freshness |
| `PipelineHighErrorRate` | `rate(ims_pipeline_inserts_failed_total[5m]) > 0.1` | write success |
| `PipelineDataDegraded` | insert rate under half its 1-hour average | write volume |

Multi-window burn-rate alerts (for example 14.4× over 1 h and 5 min) are a **proposed** next step. No burn-rate rule file exists yet. Build them on the queries in section 2, never on metrics the stack does not export.

---

## 4. Not measured yet

| Wanted SLI | What is missing |
| --- | --- |
| Dashboard query latency | Grafana's `/metrics` is not scraped |
| Front-door HTTP error rate | nginx exports no metrics (no `stub_status` or exporter) |
| Connection-pool saturation | no PgBouncer exporter |
| Alert delivery latency (LINE / Teams) | Alertmanager notification metrics are scraped, but no SLI is defined on them yet |

---

## 5. Error budget policy

| Budget left (30 days) | Response |
| --- | --- |
| > 50% | Normal changes. |
| 25–50% | Changes to Node-RED flows and migrations need a second reviewer. |
| < 25% | Only fixes. Non-urgent changes wait. |
| Exhausted | Stop feature work until the SLI recovers. Write a postmortem within 48 hours (`docs/sre/postmortems/TEMPLATE.md`). |

---

## 6. Check from the command line

```bash
curl -s -G http://127.0.0.1:9090/api/v1/query \
  --data-urlencode 'query=time() - max(ims_pipeline_last_flush_timestamp_seconds)' | jq '.data.result[0].value[1]'

curl -s -G http://127.0.0.1:9090/api/v1/query \
  --data-urlencode 'query=avg_over_time(probe_success{job="blackbox-http"}[1h])' \
  | jq -r '.data.result[] | "\(.metric.instance) \(.value[1])"'
```

Prometheus binds to `127.0.0.1` only, so run these on the host.
