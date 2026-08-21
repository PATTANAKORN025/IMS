<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Business Value & ROI Analysis

> **Audience:** Executive Leadership, Project Sponsors.
> **Objective:** Outlines the business impact, ROI, and technical improvements delivered by the IMS platform.
> **Provenance (Corrected 2026-08-10):** The technical figures below (dashboard count, container count, alert rule count, load-test results, documentation count) have been updated to match the current system. The financial/ROI figures (staff hours, THB savings, payback period) are the original business inputs and are treated as the original business case.

---

<div align="center">

<img src="../assets/icons/check-circle.svg" width="14" align="center"/> **Value:** High Impact
<img src="../assets/icons/check-circle.svg" width="14" align="center"/> **ROI:** 850%+
<img src="../assets/icons/check-circle.svg" width="14" align="center"/> **Cost:** Zero License

</div>

---

## 1. Executive Summary

**IMS** represents the transition from a **Manual Monitoring** system to **Continuous Automated Monitoring with AIOps** for YSPhotec / LDI machinery on the PCB production line.

The system leverages an **Open-Source Stack** architecture that has passed Load Testing at **1,000 VUs** while maintaining defined failure budgets (>95% pipeline success rate under extreme chaos load).

---

## 2. Problem → Solution Matrix

### Before (Legacy Problems)

| Problem                       | Impact                                           | Daily Cost                     |
| ----------------------------- | ------------------------------------------------ | ------------------------------ |
| **Delayed Manual Visibility** | Requires walking rounds to check physical gauges | 2 staff × 4 rounds = 8 hrs/day |
| **Slow Downtime Detection**   | 2-4 hours to detect failure                      | Accumulated defective yields   |
| **Manual Data Entry**         | Human error ~15%                                 | Impossible to track trends     |
| **Reactive Maintenance**      | Waiting for defects before repairing             | Unplanned downtime             |

### <img src="../assets/icons/check-circle.svg" width="14" align="center"/> **Status:** Healthy After (Solutions)

| Solution                         | Result                                                                                                                                                                                                                                                                                                                    | Impact                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Continuous SNMP Polling**      | Every 30 seconds, automated telemetry collection                                                                                                                                                                                                                                                                          | Eliminates manual sampling sweeps                                            |
| **Z-Score Statistical Alerting** | Detects 3σ anomalies before machine failure                                                                                                                                                                                                                                                                               | Proactive maintenance                                                        |
| **15 Dashboards**                | 5 infrastructure (NOC, Engineering Drill-Down, Capacity, Meta-Monitoring, Ingestion Latency) + 10 manufacturing (Easy Overview, Alarm Console, Alarm Dictionary, Alarm Response (MTTA/MTTR), Engineering Analytics, Machine Snapshot, Manufacturing Command Center, Operator Andon, Data Readiness, Factory Digital Twin) | Full visibility across both infrastructure and the manufacturing line itself |
| **LINE/Teams Webhooks**          | Alert formatting and delivery-attempt logic is complete and correct; real delivery requires operator-configured credentials (`LINE_CHANNEL_ACCESS_TOKEN`, `TEAMS_WEBHOOK_URL`) not shipped in this repo                                                                                                                   | Faster response once configured                                              |
| **Predictive Analytics**         | Linear regression forecasting                                                                                                                                                                                                                                                                                             | Prevent failures                                                             |

---

## 3. ROI Metrics

### Before vs After Comparison

| Metric                  | Before (Manual)            | After (IMS)                   | Improvement                                      |
| ----------------------- | -------------------------- | ----------------------------- | ------------------------------------------------ |
| **Time to Detect**      | 1-4 hours                  | **< 10 seconds**              | 99.97% faster                                    |
| **Mean Time to Repair** | > 2 hours                  | **~15 minutes**               | 87.5% reduction                                  |
| **Manual Labor**        | 8 hrs/day (2 staff)        | **Eliminated routine checks** | 2,920 hrs/year saved                             |
| **Data Accuracy**       | ~85% (human error)         | **99.9%**                     | +17.5% accuracy                                  |
| **Data Granularity**    | 6 readings/day             | **2,880 readings/day**        | 480x more data                                   |
| **Maintenance Mode**    | Reactive (fix when broken) | **Predictive (prevent)**      | Proactive maintenance sharply mitigates downtime |

### Annual Cost Savings

| Category                 | Before                            | After               | Savings/Year      |
| ------------------------ | --------------------------------- | ------------------- | ----------------- |
| **License Fees**         | [REDACTED_CONFIDENTIAL]          | THB 0 (Open-Source) | **[REDACTED_CONFIDENTIAL]**     |
| **Manual Labor**         | [REDACTED_CONFIDENTIAL] (2,920 hrs × [REDACTED_CONFIDENTIAL]) | THB 0               | **[REDACTED_CONFIDENTIAL]**      |
| **Downtime Cost**        | [REDACTED_CONFIDENTIAL] × N          | Near zero           | **[REDACTED_CONFIDENTIAL]**      |
| **Total Annual Savings** |                                   |                     | **[REDACTED_CONFIDENTIAL]** |

### Payback Period

```text
Initial Investment: [REDACTED_CONFIDENTIAL] (intern labor + compute)
Annual Savings: [REDACTED_CONFIDENTIAL] (conservative)
Payback Period: < 1 month
ROI: 2,750% (Year 1)
```

---

## 4. Technical Achievements

| Component            | Delivered                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Docker Stack**     | 12 containers, fully orchestrated                                                                                                                                                                                                                |
| **Telemetry Schema** | Two independent pipelines — infrastructure (`sys_metrics`/`net_metrics`/`ldi_metrics`) and LDI manufacturing (`ldi_data`, 34 columns: PE1-6, JE1-4, thickness, scan_speed, resist_dosage, and more) — see `docs/architecture/DATABASE_SCHEMA.md` |
| **Alert Rules**      | 30 rules: 6 LDI-specific + 11 infrastructure (Grafana native), 13 pipeline/platform meta-monitoring rules (Prometheus/Alertmanager)                                                                                                              |
| **Dashboards**       | 15 dashboards (5 infrastructure + 10 manufacturing)                                                                                                                                                                                              |
| **Load Test**        | Up to 1,000 VUs (`chaos-stress.js`, deliberate 5% fault injection, >90% success threshold); `pipeline-stress.js` targets >95% success — not a 0%-failure guarantee, a defined acceptable-failure budget                                          |
| **CI/CD**            | GitHub Actions with security scanning (Gitleaks)                                                                                                                                                                                                 |
| **Documentation**    | 40+ documents across architecture, operations, user/admin manuals, and enterprise guides                                                                                                                                                         |

---

## 5. Internship Learning Outcomes

### Skills Acquired by Interns

| Category          | Skills                                                     |
| ----------------- | ---------------------------------------------------------- |
| **Architecture**  | 4-Layer Architecture, Microservices, Docker                |
| **Network**       | SNMP Protocol, MIB/OID, Counter Wrap Management            |
| **Database**      | TimescaleDB, PostgreSQL, Continuous Aggregates, PgBouncer  |
| **Visualization** | Grafana Dashboard Design, SRE Color Convention             |
| **Alerting**      | Prometheus, Alertmanager, Z-Score, Predictive Analytics    |
| **CI/CD**         | GitHub Actions, Automated Testing, Security Scanning       |
| **Testing**       | K6 Load Testing, Chaos Engineering, Performance Tuning     |
| **DevOps**        | Infrastructure as Code, Monitoring-as-Code, SRE Principles |

### Value of Trained Personnel

> Interns learned the **complete software engineering development lifecycle**, spanning Architecture → Development → Testing → Deployment → Monitoring.

---

## 6. Strategic Value

| Dimension       | Value                                           |
| --------------- | ----------------------------------------------- |
| **Operational** | Reduced MTTR from 2 hours to 15 minutes         |
| **Financial**   | Saves [REDACTED_CONFIDENTIAL] annually                    |
| **Knowledge**   | Established a comprehensive documentation suite |
| **Scalability** | Supports 1-1,000+ machines                      |
| **Compliance**  | Audit trail, SLA reporting ready                |

---

<div align="center">

**Prepared by:** MIS-G Department & Internship Team
**Project:** IMS (Infrastructure Monitoring System) — Apex Circuit (Thailand) Co., Ltd.
**Date:** June 2026

</div>

---

[⬅️ Back to Main Repository](../../README.md)
