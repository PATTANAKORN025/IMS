<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# IMS Platform Book

> **Audience:** All IMS stakeholders (Developers, SREs, Plant Managers, QA).
> **Objective:** The central navigational hub for the entire documentation suite. If something here disagrees with a linked document, the linked document is authoritative.
> **Provenance:** Verified against the live system on 2026-08-10 during the Enterprise Documentation Program.

---

[⬅️ Back to Main Repository](../../README.md)

## Executive summary

IMS is a monitoring platform spanning two domains — **infrastructure** (servers, network devices) and **LDI manufacturing** (a PCB Laser Direct Imaging production line) — sharing one TimescaleDB, one Grafana instance (15 dashboards, split into `Infrastructure`/`Manufacturing` folders), and alerting through both Grafana native rules and Prometheus/Alertmanager. The manufacturing side includes real SPC (Cpk process capability) and RCA (alarm-to-parameter correlation) analytics, not just telemetry display. The two domains are logically separated (folders, tags, `CODEOWNERS`) but share infrastructure — see `docs/architecture/OWNERSHIP.md` for why a physical split wasn't justified at this system's current size.

---

## Start here, by role

### Plant management / process engineering

1. [`docs/product/PRODUCT.md`](../product/PRODUCT.md) — what the system does and for whom.
2. [`docs/architecture/LDI_SPC_GUIDE.md`](LDI_SPC_GUIDE.md) — process capability methodology.
3. [`docs/architecture/LDI_RCA_GUIDE.md`](LDI_RCA_GUIDE.md) — root-cause correlation methodology.
4. [`docs/architecture/ALARM_SEVERITY_GUIDE.md`](ALARM_SEVERITY_GUIDE.md) — the alarm taxonomy.
5. [`docs/operations/SOP_OPERATOR.md`](../operations/SOP_OPERATOR.md) — floor-operator standard operating procedures.

### SRE / operations

1. [`docs/architecture/ARCHITECTURE.md`](ARCHITECTURE.md) — system topology, container inventory, **System Constraints & Technical Boundaries** (the authoritative list of architectural considerations — review for operational context).
2. [`docs/architecture/DATA_FLOW.md`](DATA_FLOW.md) — end-to-end pipeline diagrams.
3. [`docs/operations/INCIDENT_RESPONSE.md`](../operations/INCIDENT_RESPONSE.md) — worked incident examples with real root causes.
4. [`docs/operations/ALARM_PLAYBOOK.md`](../operations/ALARM_PLAYBOOK.md) — first-response steps per alert.
5. [`docs/operations/BACKUP_RESTORE.md`](../operations/BACKUP_RESTORE.md) / [`docs/operations/DR_TEST_PLAN.md`](../operations/DR_TEST_PLAN.md) — real, evidence-backed disaster-recovery procedures.
6. [`docs/operations/TROUBLESHOOTING.md`](../operations/TROUBLESHOOTING.md) — general SRE debugging commands.
7. [`docs/admin/ADMIN_MANUAL.md`](../admin/ADMIN_MANUAL.md) — container ops, device registration, migrations.

### QA / audit / compliance

1. [`docs/architecture/DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) — auto-generated, CI-checked table/column/view reference.
2. [`docs/architecture/DASHBOARD_INVENTORY.md`](DASHBOARD_INVENTORY.md) — auto-generated, CI-checked dashboard/panel reference.
3. [`docs/architecture/DATA_RETENTION.md`](DATA_RETENTION.md) — live retention policy, including a documented governance gap.
4. [`docs/architecture/SECURITY_MODEL.md`](SECURITY_MODEL.md) + [`SECURITY.md`](../../SECURITY.md) — trust boundaries and security policy.
5. [`docs/operations/LDI_VALIDATION_PROTOCOL.md`](../operations/LDI_VALIDATION_PROTOCOL.md) — production sign-off procedure with live-verified evidence.
6. [`docs/operations/DEPLOYMENT_READINESS.md`](../operations/DEPLOYMENT_READINESS.md), [`RELEASE_CHECKLIST.md`](../operations/RELEASE_CHECKLIST.md) — pre-release gates.

### New developers

1. [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — workflow, conventions, project structure.
2. [`docs/architecture/ARCHITECTURE.md`](ARCHITECTURE.md) — read this before touching anything.
3. [`docs/architecture/DATA_FLOW.md`](DATA_FLOW.md) — how data actually moves.
4. [`docs/architecture/OWNERSHIP.md`](OWNERSHIP.md) — who owns what.
5. [`docs/architecture/GRAFANA_DESIGN_SYSTEM.md`](GRAFANA_DESIGN_SYSTEM.md) — dashboard conventions, enforced by CI.

---

## Full document map

### Architecture & domain design

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system topology, container inventory, System Constraints & Technical Boundaries.
- [`ARCHITECTURE_DIAGRAM.md`](ARCHITECTURE_DIAGRAM.md) — Mermaid C4 diagrams.
- [`DATA_FLOW.md`](DATA_FLOW.md) — end-to-end data flow diagrams.
- [`IMS_MANUFACTURING_PLATFORM_V2.md`](IMS_MANUFACTURING_PLATFORM_V2.md) — the infra/manufacturing domain-separation rollout plan and its real evidence log (Phases A/B/C, Soak Test, DR Test).
- [`MANUFACTURING_DOMAIN.md`](MANUFACTURING_DOMAIN.md) — the LDI schema/dashboard pattern and how a future process type (AOI, plating, etching, drilling) onboards.
- [`EAP_ARCHITECTURE.md`](EAP_ARCHITECTURE.md) — equipment integration adapters (SNMP, HTTP/JSON, and the unimplemented SECS/GEM contract).
- [`OWNERSHIP.md`](OWNERSHIP.md) — infra/manufacturing domain boundary, enforced via `CODEOWNERS`.
- [`SECURITY_MODEL.md`](SECURITY_MODEL.md) — trust boundaries.

### Manufacturing (LDI) domain guides

- [`LDI_SPC_GUIDE.md`](LDI_SPC_GUIDE.md) — process capability (Cpk) methodology.
- [`LDI_RCA_GUIDE.md`](LDI_RCA_GUIDE.md) — root-cause correlation (Lift/Confidence) methodology.
- [`ALARM_SEVERITY_GUIDE.md`](ALARM_SEVERITY_GUIDE.md) — the 4-tier severity taxonomy and ISA-18.2 scope.
- [`DATA_RETENTION.md`](DATA_RETENTION.md) — live retention/compression policy.
- [`FUTURE_ANALYTICS.md`](FUTURE_ANALYTICS.md) — roadmap-only concepts (predictive drift, AI/anomaly scoring, multi-factor RCA) explicitly **not implemented** — nothing here is real until it has its own golden-dataset test, same bar as every shipped SPC/RCA calculation.

### Design system

- [`GRAFANA_DESIGN_SYSTEM.md`](GRAFANA_DESIGN_SYSTEM.md) — color tokens, typography, panel conventions, enforced by `dashboard-linter.js`.
- [`PANEL_TOKENS.md`](PANEL_TOKENS.md) — unit/threshold token spec.

### Auto-generated (CI-checked, never hand-edit)

- [`DASHBOARD_INVENTORY.md`](DASHBOARD_INVENTORY.md) — `node scripts/generate-dashboard-inventory.js`
- [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) — `node scripts/generate-schema-inventory.js`

### Operations

- [`../operations/SOP_OPERATOR.md`](../operations/SOP_OPERATOR.md) — floor operator SOP.
- [`../operations/ALARM_PLAYBOOK.md`](../operations/ALARM_PLAYBOOK.md) — alert first-response.
- [`../operations/INCIDENT_RESPONSE.md`](../operations/INCIDENT_RESPONSE.md) — incident severity framework + worked examples.
- [`../operations/BACKUP_RESTORE.md`](../operations/BACKUP_RESTORE.md) — backup/restore procedure with real timings.
- [`../operations/DR_TEST_PLAN.md`](../operations/DR_TEST_PLAN.md) — disaster-recovery drills.
- [`../operations/TROUBLESHOOTING.md`](../operations/TROUBLESHOOTING.md) — general SRE debugging.
- [`../operations/SCALING_PLAN.md`](../operations/SCALING_PLAN.md) — scaling from 1 to 1000+ machines.
- [`../operations/LDI_VALIDATION_PROTOCOL.md`](../operations/LDI_VALIDATION_PROTOCOL.md) — production sign-off procedure.
- [`../operations/DEPLOYMENT_READINESS.md`](../operations/DEPLOYMENT_READINESS.md), [`RELEASE_CHECKLIST.md`](../operations/RELEASE_CHECKLIST.md) — release gates.
- [`../REAL-DATA-IMPORT.md`](../REAL-DATA-IMPORT.md) — real vs. mock data mode.

### Manuals

- [`../user/USER_MANUAL.md`](../user/USER_MANUAL.md) — dashboard guide, metric reference.
- [`../admin/ADMIN_MANUAL.md`](../admin/ADMIN_MANUAL.md) — container ops, device registration, migrations, backup/recovery.

### Governance & process

- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) — development workflow.
- [`../../SECURITY.md`](../../SECURITY.md) — security policy.
- [`../../.github/CODEOWNERS`](../../.github/CODEOWNERS) — enforced ownership boundaries.

### Product & business context

- [`../product/PRODUCT.md`](../product/PRODUCT.md) — product one-pager.
- [`../product/ONBOARDING_SCRIPT.md`](../product/ONBOARDING_SCRIPT.md) — video/GIF recording storyboard.
- [`../business/BUSINESS_VALUE_ROI.md`](../business/BUSINESS_VALUE_ROI.md) — executive ROI narrative.

### Historical record

- [`../archive/`](../archive/) — dated point-in-time snapshots (audit reports, benchmark reports, an internship retrospective). Not living documentation — see `docs/archive/README.md`.
- [`../DOCUMENTATION_QUALITY_REPORT.md`](../DOCUMENTATION_QUALITY_REPORT.md) — the audit/rewrite report this book itself was produced alongside.

---

## Terminology

See `docs/architecture/ARCHITECTURE.md`'s domain sections for full context; the short glossary:

| Term              | Meaning                                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IMS**           | The overall platform — both the infrastructure and LDI manufacturing domains.                                                                                                                                                                        |
| **LDI**           | Laser Direct Imaging — the PCB exposure process this system's manufacturing domain monitors.                                                                                                                                                         |
| **EAP**           | Equipment Automation Program — SECS/GEM-style equipment integration (see `EAP_ARCHITECTURE.md`); not "Enterprise Application Platform."                                                                                                              |
| **SPC**           | Statistical Process Control — Cpk-based process capability tracking (see `LDI_SPC_GUIDE.md`).                                                                                                                                                        |
| **RCA**           | Root Cause Analysis — alarm-to-process-parameter correlation via the Lift metric (see `LDI_RCA_GUIDE.md`), not equipment fault diagnosis.                                                                                                            |
| **Andon**         | The Operator Andon Board — a glanceable, status-only floor display, ISA-101 (HMI design) informed, not to be confused with ISA-18.2 (alarm management). Deliberately non-interactive (TV-wall kiosk); see Alarm Console for the operator write-path. |
| **Alarm Console** | `IMS LDI - Alarm Console` — the dashboard where Acknowledge/Resolve actions actually happen, writing to `public.ldi_alarm_lifecycle` via `services/alarm-api`. Companion to the read-only Andon board, not a replacement for it.                     |
| **CAGG**          | TimescaleDB Continuous Aggregate — a pre-computed rollup that updates incrementally (see `DATA_FLOW.md`'s rollup chain).                                                                                                                             |
| **Cpk**           | Process capability index — see `LDI_SPC_GUIDE.md` for the exact formula used here.                                                                                                                                                                   |
| **Lift**          | The RCA correlation strength metric — see `LDI_RCA_GUIDE.md`.                                                                                                                                                                                        |

## System Constraints & Technical Boundaries

`docs/architecture/ARCHITECTURE.md`'s System Constraints & Technical Boundaries section is the authoritative list of system constraints:

- Test-coverage considerations in the SPC golden-dataset regression suite for materialized views.
- Retention-policy variances between initialization vectors.
- Container restart-policy behaviors observed during DR testing.
- The `ldi_metrics` legacy pipeline's reserved columns.
- The precise ISA-18.2 stylistic scope.

These constraints are documented to ensure operational transparency and inform future architectural decisions.
