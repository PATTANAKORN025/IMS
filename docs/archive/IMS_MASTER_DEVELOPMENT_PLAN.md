# IMS — Master Development Plan

> **ARCHIVED — historical snapshot, dated 2026-08-04.** Not living documentation; numbers below (dashboard counts, migration counts, panel counts, etc.) reflect the system as it existed on that date and are known to be stale relative to the current system. Kept for historical record per docs/archive/README.md. For current information, see docs/architecture/ARCHITECTURE.md and docs/architecture/DASHBOARD_INVENTORY.md.

> Comprehensive development roadmap across all domains — Grounded in empirical project data as of 2026-08-04.
> Synthesized via the `/brainstorming` skill + analytical extraction from PRODUCT.md, TASKS.md, ARCHITECTURE.md, SECURITY.md, knowledge.md.

---

## 1. Executive Summary

**IMS (Industrial Monitoring System)** serves as the Enterprise-grade NOC monitoring infrastructure for APEX Circuit — currently operating within **Phase 12 (Apex SRE Optimization)**, denoting a definitively **Production-ready / Stable** state.

### Current State Assessment (2026-08-04)

| Domain | Details |
| ---------------- | ----------------------------------------------------------------------------------------- |
| **Architecture** | SNMP v2c → Node-RED → PgBouncer → TimescaleDB → Grafana + Prometheus/Alertmanager |
| **Devices** | 1000+ devices (Linux servers, Juniper EX4000 switches, LDI PCB manufacturing machines) |
| **Dashboards** | 9 dashboards (NOC Overview, Engineering, Capacity, Meta-Monitoring, 5× LDI Manufacturing) |
| **Alerting** | Prometheus + Alertmanager → LINE Notify + MS Teams |
| **AI Tooling** | 12 MCP servers, 90 skills, 8 plugins (MiMo Code + Claude Code + OpenCode + Copilot) |
| **Tests** | Unit tests, K6 stress tests, Playwright visual regression, dashboard linter |
| **CI/CD** | Unimplemented — `flows.json` is deployed via manual execution |

---

## 2. Current State Assessment

### 2.1 Completed Objectives

| Category | Item | Status |
| -------------- | --------------------------------------------------------------------- | ------ |
| **Pipeline** | Zero-Leak Pipeline (4-thread parallel SNMP walker) | Done |
| **Pipeline** | Network 64-bit Analytics (eth0/wlan0 Mbps) | Done |
| **Pipeline** | Stateful Parser v9 (per-device flow context) | Done |
| **Pipeline** | Circuit Breaker (2 failures → HALF_OPEN probe) | Done |
| **Pipeline** | Retry Queue with age-based eviction | Done |
| **Storage** | TimescaleDB V2 Normalized Schema (sys_metrics, net_metrics, ldi_data) | Done |
| **Storage** | Continuous Aggregates (hourly → daily → weekly) | Done |
| **Storage** | Retention Policies (raw 14d, hourly 90d, daily 2yr, weekly forever) | Done |
| **Storage** | PgBouncer Transaction Pooling | Done |
| **Dashboards** | NOC Overview (fleet envelope, health score) | Done |
| **Dashboards** | Engineering Drill-Down (per-machine diagnostics) | Done |
| **Dashboards** | Capacity Planning (forecasting, Z-Score) | Done |
| **Dashboards** | Meta-Monitoring (pipeline health) | Done |
| **Dashboards** | 5× LDI Manufacturing (analytics, snapshot, operator, data readiness) | Done |
| **Alerting** | Prometheus Alert Rules (14 rules) | Done |
| **Alerting** | Alertmanager Inhibition Rules | Done |
| **Alerting** | LINE Notify + MS Teams Webhook | Done |
| **LDI** | LDI Production Schema (ldi_data, ldi_alarm_log, SPC engine) | Done |
| **LDI** | LDI Device Simulator + Alarm Simulator | Done |
| **Security** | Gitleaks scanning | Done |
| **Security** | Docker secrets management | Done |
| **Tooling** | 90 skills (26 local + 41 mattpocock + 9 vercel + 14 superpowers) | Done |
| **Tooling** | 12 MCP servers (MiMo/Claude/OpenCode/Copilot) | Done |

### 2.2 Pending Backlog Items

| # | Item | Priority | Effort | Impact |
| --- | ---------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------- |
| 1 | **CI/CD Pipeline** — GitHub Actions for automated `flows.json` deployment | P0 | Medium | Critical |
| 2 | **K6 Stress Test** — 10,000 req/sec → Ascertain PgBouncer throughput ceiling | P0 | Medium | Critical |
| 3 | **Disk Forecasting** — Predictive disk-full panel within Capacity Planning | P1 | Low | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> Moderate |
| 4 | **Connect Real Servers** — Swap simulator IPs within Node-RED | P1 | High | Critical |
| 5 | **Webhook Alerts** — Configure legitimate LINE Notify / Slack webhooks | P1 | Low | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> Moderate |

### 2.3 Known Issues (Sourced from SECURITY.md)

| # | Issue | Severity | Status |
| --- | ------------------------------------- | -------- | ----------------- |
| 1 | PgBouncer port exposed on host | Medium | Known |
| 2 | Node-RED Admin UI has no auth | High | Known |
| 3 | SNMP community string in plain text | Medium | Known |
| 4 | PgBouncer uses AUTH_TYPE: plain | Medium | Known (trade-off) |
| 5 | GitHub PAT hardcoded in mimocode.json | High | Known |

---

## 3. Master Development Roadmap

### Phase 13: Production Hardening (Weeks 1–2)

**Objective:** Transition the system from dev-ready to definitively production-ready.

#### 3.1 CI/CD Pipeline — GitHub Actions

**Problem Statement:** `flows.json` is currently deployed manually (`make deploy-flows`), devoid of automation → yielding high susceptibility to human error, slow rollback execution, and an absence of audit trails.

**Implementation Plan:**

| Step | Task | Target File | Details |
| ---- | ------------------------------------------ | ----------------- | -------------------------------------------------------------- |
| 1 | Construct `.github/workflows/deploy-flows.yml` | New | Trigger: push to `main` modifying `nodered_data/flows/*.json` |
| 2 | Append `validate-flows` job | workflows | Execute `make validate-flows` prior to deployment |
| 3 | Append `snapshot-flows` job | workflows | Backup `flows.json` prior to deployment (`make snapshot-flows`) |
| 4 | Append `deploy-flows` job | workflows | Execute `make deploy-flows` via SSH or API |
| 5 | Append `verify-pipeline` job | workflows | Execute `make verify` post-deployment → fail = trigger rollback |
| 6 | Append `rollback` job | workflows | Upon verification failure → autonomously restore from snapshot |

**Architecture:**

```text
push to main (flows/*.json changed)
  → validate-flows (make validate-flows)
  → snapshot-flows (make snapshot-flows)
  → deploy-flows (make deploy-flows)
  → verify-pipeline (make verify)
  → [if fail] rollback (restore snapshot)
```

**Success Criteria:**

- Autonomously deploys `flows.json` upon every qualifying push.
- Successful execution of validation, snapshotting, and verification prior to final deployment.
- Autonomous rollback execution upon verification failure.
- Deployment history leaves an immutable audit trail within GitHub Actions.

---

#### 3.2 Node-RED Admin Auth

**Problem Statement:** The Node-RED Editor UI lacks authentication → completely exposed on port 1880.

**Implementation Plan:**

| Step | Task | Target File | Details |
| ---- | ---------------------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| 1 | Generate bcrypt hash | shell | Execute `docker run --rm nodered/node-red npx node-red-admin hash-pw <password>` |
| 2 | Configure `NODE_RED_ADMIN_USER=admin` | `.env` | Inject username |
| 3 | Configure `NODE_RED_ADMIN_PASSWORD_HASH=$2b$...` | `.env` | Inject bcrypt hash |
| 4 | Refactor `settings.js` | `nodered_data/settings.js` | Embed `adminAuth` configuration block referencing environment variables |
| 5 | Restart Node-RED | `make restart` | Validate authentication prompt |

**Success Criteria:**

- Node-RED Editor strictly requires authentication prior to access.
- Retains unauthenticated access exclusively via the internal Docker network (exempting pipelines from authentication).

---

### Phase 14: Production Readiness (Weeks 3–4)

**Objective:** Validate performance under realistic workloads and prepare for live production server integration.

#### 3.3 K6 Stress Test — 10,000 req/sec

**Problem Statement:** The PgBouncer throughput ceiling remains undefined → system load capacity limits are entirely theoretical.

**Implementation Plan:**

| Step | Task | Target File | Details |
| ---- | ----------------------------- | ------------------------------- | ---------------------------------------------- |
| 1 | Develop K6 script for 10K VUs | `tests/k6/throughput-stress.js` | Ramp sequence: 50 → 200 → 1000 → 5000 → 10000 VUs |
| 2 | Measure core telemetry | — | p95 latency, error rate, total throughput (rows/sec) |
| 3 | Optimize PgBouncer configuration | `docker-compose.yaml` | Set MAX_CLIENT_CONN=500, DEFAULT_POOL_SIZE=50 |
| 4 | Optimize TimescaleDB configuration | `database/migrations/` | Set shared_buffers=2GB, work_mem=256MB |
| 5 | Re-execute stress test post-tuning | `tests/k6/throughput-stress.js` | Quantify performance delta |
| 6 | Document empirical results | `docs/PERFORMANCE.md` | Record baseline vs. optimized metrics |

**Success Criteria:**

- Successfully sustains 10,000 req/sec without breaching a 0.1% error rate threshold.
- Maintains a p95 latency of < 500ms.
- Prevents PgBouncer connection pool overflow scenarios.

---

#### 3.4 Connect Real Servers

**Problem Statement:** Currently reliant upon an SNMP simulator → lacks empirical validation against physical servers.

**Implementation Plan:**

| Step | Task | Target File | Details |
| ---- | ------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------- |
| 1 | Construct `.env.production` | New | Embed SNMP_COMMUNITY strings and legitimate device IPs |
| 2 | Refactor `docker-compose.prod.yaml`| `docker-compose.prod.yaml` | Source production environment variables |
| 3 | Refactor device registry | `database/migrations/` | Execute INSERT statements for physical server parameters |
| 4 | Validate SNMP connectivity | `scripts/snmp-discover.js` | Confirm SNMP v2c compatibility with physical hardware |
| 5 | Execute canary deployment | — | Initiate against 5 isolated machines → verify → proceed to full rollout |
| 6 | Monitor pipeline telemetry | `monitoring/grafana/dashboards/infrastructure/ims-meta-monitoring.json` | Observe ingestion and error rates meticulously |

**Success Criteria:**

- Stable SNMP polling operations executed against physical hardware.
- Absolute zero data loss sustained throughout the transition phase.
- Circuit breaker mechanisms operate nominally against physical server endpoints.

---

### Phase 15: Advanced Features (Month 2)

**Objective:** Augment predictive analytics capabilities and refine the alerting framework.

#### 3.5 Disk Forecasting Panel

**Problem Statement:** Devoid of a predictive disk-full panel → preemptive visibility into storage saturation timelines is nonexistent.

**Implementation Plan:**

| Step | Task | Target File | Details |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| 1 | Formulate SQL query for linear regression | `monitoring/grafana/dashboards/infrastructure/ims-capacity-planning.json` | Compute slope + intercept spanning a 7-day historical window |
| 2 | Construct "Days Until Full" panel | — | Project the exact timeframe to complete disk saturation |
| 3 | Implement threshold alerts | — | Assign <7 days = Warning, <3 days = Critical |
| 4 | Construct "Disk Usage Forecast Chart" panel | — | Visualize trend lines coupled with projection vectors |
| 5 | Validate against synthetic data | — | Engineer synthetic payloads mimicking imminent disk saturation |

**Success Criteria:**

- Panel accurately computes and renders "Days Until Full".
- Alerts trigger precisely when the forecast breaches the <7 days threshold.
- Graphs exhibit unambiguous projection lines.

---

#### 3.6 Real Webhook Alerts

**Problem Statement:** LINE Notify / Slack configurations are merely placeholders → genuine alerts are not dispatched.

**Implementation Plan:**

| Step | Task | Target File | Details |
| ---- | ----------------------------- | ----------------------- | ---------------------------- |
| 1 | Provision authentic LINE Notify token | LINE Developers Platform| Provision channel + access token |
| 2 | Configure `ALERT_WEBHOOK_TOKEN` | `.env` | Inject authentic token |
| 3 | Provision authentic Slack webhook | Slack App Directory | Generate an Incoming Webhook |
| 4 | Configure `TEAMS_WEBHOOK_URL` | `.env` | Inject authentic URL |
| 5 | Execute alert validation | `scripts/test-alert.sh` | Dispatch test payload via webhook architecture |
| 6 | Verify notification delivery | LINE/Slack applications | Confirm receipt of dispatched notifications |

**Success Criteria:**

- Alerts successfully dispatched to LINE Notify.
- Alerts successfully dispatched to Slack.
- Embedded Runbook links function flawlessly.

---

### Phase 16: Observability & Documentation (Month 3)

**Objective:** Evolve the system into a self-documenting entity capable of comprehensive self-monitoring.

#### 3.7 Pipeline Self-Monitoring Dashboard

**Implementation Plan:**

| Step | Task | Details |
| ---- | ------------------------------- | ---------------------------------------- |
| 1 | Expose Node-RED metrics endpoint | Configure `/metrics` endpoint for Prometheus consumption |
| 2 | Configure Prometheus scrape logic | Define 10s polling interval against Node-RED |
| 3 | Construct pipeline health dashboard | Visualize ingestion rates, error ratios, and latency metrics |
| 4 | Implement deadman switch alert | Trigger alert if zero data is ingested over a 3-minute window |

#### 3.8 Documentation Overhaul

**Implementation Plan:**

| Step | Task | Details |
| ---- | ---------------------- | --------------------------------- |
| 1 | Overhaul ARCHITECTURE.md | Accurately reflect current operational topology |
| 2 | Construct RUNBOOK.md | Detail remediation procedures for common failure states |
| 3 | Construct ONBOARDING.md | Tailor documentation for new engineering hires |
| 4 | Construct API.md | Document Node-RED webhook endpoints comprehensively |

---

## 4. Risk Assessment

### 4.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
| ------------------------------------------ | ----------- | ------ | ------------------------------------- |
| PgBouncer bottleneck at 10K+ req/sec | Medium | High | Mitigated via Phase 14 stress testing and rigorous tuning |
| SNMP v2c lacks production-grade security | High | Medium | Execute migration to SNMPv3 during Phase 17 |
| Node-RED presents a single point of failure | Low | High | Mitigated via Docker restart policies and health checks |
| TimescaleDB storage growth scales excessively | Medium | Medium | Mitigated via strict retention policies and continuous compression |
| Grafana dashboard obfuscates data via CAGG queries | Low | Medium | Enforce mandatory peer review of all queries prior to deployment |

### 4.2 Operational Risks

| Risk | Probability | Impact | Mitigation |
| ------------------------------------ | ----------- | -------- | --------------------------------- |
| Erroneous `flow.json` deployment → pipeline collapse | Medium | High | Mitigated via CI/CD, snapshotting, and autonomous rollback |
| Secret exposure originating from `.env` | Low | Critical | Mitigated via Gitleaks, stringent `.gitignore` policies, and continuous auditing |
| Absence of genuine alerts → silent failure states | High | Critical | Execute Phase 14: comprehensive webhook configuration |
| Intermittent server connection stability | Medium | Medium | Mitigated via circuit breakers and resilient retry queues |

---

## 5. Success Metrics

### 5.1 System Performance

| Metric | Current | Target (Phase 14) | Target (Phase 16) |
| -------------------- | ------------- | ----------------- | ----------------- |
| Devices monitored | 1000+ (sim) | 1000+ (real) | 5000+ |
| Polling interval | 30s | 30s | 10s |
| Ingestion throughput | ~330 rows/min | ~3300 rows/min | ~16500 rows/min |
| p95 query latency | Unknown | <500ms | <200ms |
| Dashboard refresh | 10s | 10s | 5s |
| Alert response time | Unknown | <30s | <15s |

### 5.2 Operational Metrics

| Metric | Current | Target |
| ------------------------ | ---------------- | --------------------------------- |
| CI/CD pipeline | None | GitHub Actions |
| Deploy time (flows.json) | ~5 min (manual) | <1 min (automated) |
| Rollback time | ~10 min (manual) | <30s (automated) |
| Alert channels | Placeholder | LINE + Slack + Teams |
| Documentation coverage | Partial | Full (RUNBOOK + ONBOARDING + API) |

### 5.3 Security Metrics

| Metric | Current | Target |
| ----------------- | ----------------- | ---------------- |
| Node-RED auth | None | bcrypt adminAuth |
| SNMP version | v2c | v3 (Phase 17) |
| Secret exposure | GitHub PAT leaked | All rotated |
| CVE response time | Unknown | <24h |

---

## 6. Implementation Priority Matrix

```text
                        HIGH IMPACT
                            │
           ┌────────────────┼────────────────┐
           │  P0: CI/CD     │  P0: K6 Stress │
           │  P0: Node-RED  │  P1: Real      │
           │    Auth        │    Servers     │
    EASY ──┼────────────────┼────────────────┼── HARD
           │  P1: Disk      │  P2: Pipeline  │
           │    Forecasting │    Self-Monitor│
           │  P1: Webhook   │  P2: SNMPv3    │
           │    Alerts      │                │
           └────────────────┼────────────────┘
                            │
                        LOW IMPACT
```

---

## 7. Timeline

| Phase | Duration | Core Initiatives | Deliverables |
| ------------ | ----------- | ------------------------------------ | ------------------------------------------ |
| **Phase 13** | Weeks 1–2 | CI/CD + Node-RED Auth | Functional GitHub Actions workflows + secured Node-RED access |
| **Phase 14** | Weeks 3–4 | K6 Stress + Real Servers + Webhooks | Finalized performance reporting + live production deployment |
| **Phase 15** | Month 2 | Disk Forecasting + Advanced Features | Fully integrated predictive panels + operational live alerts |
| **Phase 16** | Month 3 | Self-Monitoring + Documentation | Functional pipeline dashboard + comprehensive documentation suite |

---

## 8. Next Immediate Actions (This Week)

| # | Action | Assignee | Due Date | Blockers |
| --- | ------------------------------------------ | -------- | ----------- | ------------------ |
| 1 | Construct `.github/workflows/deploy-flows.yml` | — | Monday | GitHub repository access |
| 2 | Generate bcrypt hash for Node-RED | — | Monday | Docker environment access |
| 3 | Configure `NODE_RED_ADMIN_*` in `.env` | — | Tuesday | Pending bcrypt hash from Action #2 |
| 4 | Develop K6 throughput stress script | — | Wednesday | — |
| 5 | Execute baseline K6 stress test | — | Thursday | Pending script from Action #4 |
| 6 | Construct `.env.production` template | — | Friday | Pending legitimate server IP allocation |

---

<div align="center">

**IMS Master Development Plan — Version 1.0**

_Created: 2026-08-04 | Author: Buffy (Freebuff AI)_

_Reviewed by: `/brainstorming` skill + comprehensive project context analysis_

</div>
