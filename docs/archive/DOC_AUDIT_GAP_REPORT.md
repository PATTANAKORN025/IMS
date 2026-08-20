<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Documentation Audit — Gap Report

> **Scope:** All current (non-`docs/archive/`) documentation, audited against the actual repo state — `docker-compose.yaml`, `docker-compose.prod.yaml`, `database/migrations/` (53 files, through 078), `scripts/`, `monitoring/` configs, and the 12 live dashboard JSON files. Read-only audit; no files were edited to produce this report.
>
> **Excluded from re-flagging (already audited and fixed in a prior pass this session):** `docs/architecture/ARCHITECTURE.md`, `docs/architecture/SECURITY_MODEL.md`, `docs/user/USER_MANUAL.md`, `docs/operations/ALARM_PLAYBOOK.md`, `docs/architecture/IMS_PLATFORM_BOOK.md`, `docs/architecture/DASHBOARD_INVENTORY.md` and `DATABASE_SCHEMA.md` (both auto-generated, current).
>
> **Ground truth used:** 14 Grafana dashboards (6 infra + 8 manufacturing, including the new `ims-ldi-alarm-console` and pre-existing `ims-ldi-alarm-dictionary`); 13 docker-compose services (12 long-running + 1 one-shot `db-migrate`), including the new `alarm-api` and `proxy`; migrations 013–078 (53 files); Grafana has no host port of its own anymore (fronted by `proxy`); `scripts/dr-test.sh` implements row-count _bracketing_, not exact match.

---

## P0 — Actively misleading (security/safety/data-integrity, or a broken procedure)

**`docs/admin/ADMIN_MANUAL.md:35-46`** — The Container Overview table omits `alarm-api` and `proxy` entirely, and lists `ims-grafana | Grafana | 3000` as if Grafana still directly publishes port 3000 to the host.
Current text: a 9-row table with no `proxy`/`alarm-api` rows, `ims-grafana | Grafana | 3000 | Dashboard`.
Should reflect: Grafana has no host port of its own — `proxy` (nginx) is now the sole host-published entry point (3000), fronting both Grafana and `alarm-api`, gating the latter behind an `auth_request` check against Grafana's own session. An IT admin following this table would misjudge the actual network trust boundary of a security-sensitive component (the alarm write path).

**`docs/operations/DR_TEST_PLAN.md:9`** — Drill 1's stated pass criterion contradicts both the actual implementation and this repo's own other documentation.
Current text: "compares row counts on `devices`/`ldi_data`/`ldi_alarm_log` between live and restored... Pass criterion: **exact row-count match**."
Should reflect: `scripts/dr-test.sh` (lines 46-96) explicitly implements and labels _bracketing_ — `VERDICT: PASS -- restored row counts fall within the [before-dump, after-dump] live bracket`, not exact match. `docs/operations/BACKUP_RESTORE.md` (not in this audit's flag list, but cross-checked) explicitly documents that exact-match was a real bug found during this system's own DR testing, since this is a live-ingesting system where counts always drift between dump and restore. An operator following `DR_TEST_PLAN.md`'s literal stated criterion during a real drill could misjudge a genuinely-passing restore as FAIL.

**`docs/operations/TROUBLESHOOTING.md:107-403`** — This file contains a second, structurally distinct "Incident Response Runbook" concatenated after its own troubleshooting content (line 107: `# Incident Response Runbook`), with a **different severity taxonomy** than the real `docs/operations/INCIDENT_RESPONSE.md` file.
Current text: `TROUBLESHOOTING.md` lines 136-142 define severity as **Critical / Warning / Info** (response times <15min/<1hr/<4hr); the actual `docs/operations/INCIDENT_RESPONSE.md` (a separate, real, provenance-backed file with worked examples from this system's real operational history) defines severity as **SEV-1 / SEV-2 / SEV-3 / SEV-4**. These do not map cleanly onto each other and give conflicting escalation guidance for the same incident.
Should reflect: `TROUBLESHOOTING.md` should not contain a second incident-response framework at all — it should point to `docs/operations/INCIDENT_RESPONSE.md` (which it already does correctly, from within `INCIDENT_RESPONSE.md`'s own "Related documents" section pointing back at `TROUBLESHOOTING.md` for "general SRE debugging commands" — the intended division of labor is clear, but `TROUBLESHOOTING.md` doesn't honor it; it duplicates and contradicts instead). This is a genuine risk during a real incident where responders might consult either file and get a different severity/response-time answer. Not caused by this session's changes — a pre-existing structural defect, but real and verified.

---

## P1 — Materially wrong technical claims

**`docs/admin/ADMIN_MANUAL.md:33`** — "The system operates on Docker Compose with a total of 10 services (9 long-running + 1 one-shot migration runner...)"
Actual: 12 services total (11 long-running + 1 one-shot `db-migrate`): `timescaledb, pgbouncer, prometheus, alertmanager, grafana, proxy, renderer, snmpsim, blackbox-exporter, alarm-api, node-red` + `db-migrate`.

**`docs/admin/ADMIN_MANUAL.md:100-102`** — "`database/migrations/` currently has 40 sequenced files (`013` through `064`...)"
Actual: 53 files, `013` through `078` (with some numbers skipped/archived).

**`docs/admin/ADMIN_MANUAL.md:314`** — SRE Verification Protocol step 3: "Verify containers (9 long-running + ims-db-migrate, which should be Exited (0))"
Same stale count as the `:33` finding above — should be 11 long-running + 1 one-shot.

**`docs/admin/ADMIN_MANUAL.md:122-147`** — Pre-Production Security Checklist ("ALL default credentials MUST be changed") lists only `INGEST_API_KEY`, `POSTGRES_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`.
Missing: `ALARM_API_DB_PASSWORD` — the `alarm_api_writer` DB role's credential (migration `078-alarm-api-writer-role.sql`), which follows the same `change-me-please` default pattern in `.env.example` as the three already listed. The rotation script (lines 135-150) also doesn't rotate this new role's password the way it rotates `grafana_reader`'s.

**`README.md:180`** — "12 dashboards across 2 domains: 4 infrastructure... + 6 manufacturing (LDI Manufacturing, Operator Andon, Engineering Analytics & SPC, Machine Snapshot, Data Readiness, Fleet at a Glance)."
Internal arithmetic error: 4+6=10, not 12. The manufacturing list is also missing `IMS LDI - Alarm Console` and `IMS LDI - Alarm Dictionary` (both real, currently-provisioned dashboards) — actual manufacturing count is 8.

**`README.md:188`** — "12 dashboards — 4 infrastructure, 6 manufacturing..."
Same 4+6=10≠12 error. Directly contradicted by **the same file's own line 220**: "12 dashboards (4 infrastructure + 8 manufacturing)" — which is correct. `README.md` currently states two different, mutually-contradictory dashboard breakdowns.

**`CONTRIBUTING.md:46`** — "Every migration is a new, sequentially-numbered file in `database/migrations/` (currently 013–068...)"
Actual current range: 013–078.

**`docs/product/PRODUCT.md:17`** — "...visualized through 6 dashboards (Manufacturing Command Center, Operator Andon Board, Engineering Analytics & SPC, Machine Snapshot, Data Readiness, Fleet Overview)..."
Missing `Alarm Console` and `Alarm Dictionary`; actual manufacturing dashboard count is 8, not 6.

---

## P2 — Stale but not actively harmful

**`docs/operations/TROUBLESHOOTING.md:31-50`** — The failure-mode table and "Restart a single service" command block cover `node-red`, `grafana`, `prometheus`, `pgbouncer`, `blackbox`/`snmpsim` — no entry anywhere in the file for `alarm-api` or `proxy` failure modes, despite this being the primary "SRE runbook for operating the IMS monitoring stack at 3 AM." If either new service goes down, this doc gives no guidance.

**`SECURITY.md:33`** and **`docs/operations/DEPLOYMENT_READINESS.md:115`** — Both claim "Bind Grafana to localhost only (already done in prod compose)" / "Already in prod compose."
Verified against the full `docker-compose.prod.yaml` (43 lines): there is no port override for `grafana` in that file at all — this claim appears to predate this session and was likely already inaccurate. It's now additionally superseded: Grafana has no host port at all in the base `docker-compose.yaml` (fronted by `proxy` instead) — a stronger mitigation than "localhost-bound," but not what either checklist actually describes. Both should be updated to describe the real current mitigation (proxy + `auth_request` gating) rather than a "localhost bind" that was never implemented in the file they cite.

**`docker-compose.prod.yaml`** (not a doc, but flagged per the "deployment drift" audit dimension) — Has resource-limit overrides for `node-red`, `grafana`, `timescaledb`, `prometheus`, but none for the new `alarm-api` or `proxy` services. A production deployment using this overlay gets no tuning for either new service.

---

## P3 — Cosmetic / minor

**`docs/admin/ADMIN_MANUAL.md:373-386`** — "Configuration Backup" section itemizes `docker-compose.yaml`, `docker-compose.prod.yaml`, Prometheus config, and Grafana dashboards for a `cp`-based backup ritual, but doesn't mention `proxy/nginx.conf` — a new config file in the same category (small, git-tracked, but the doc already lists similarly git-tracked files here for consistency/completeness).

---

## Explicitly checked and found clean (no drift)

- `docs/architecture/GRAFANA_DESIGN_SYSTEM.md`'s "3 dashboards" kiosk-ceiling claim (NOC, Easy Overview, Andon) — verified against `tests/lint/dashboard-linter.js`'s `MAX_HEIGHT` object; accurate.
- `docs/architecture/DATA_FLOW.md`, `docs/product/CONTEXT.md` — both already say "12 dashboards" correctly.
- All `http://localhost:3000/d/...` links across `SOP_OPERATOR.md`, `ONBOARDING_SCRIPT.md`, `LDI_VALIDATION_PROTOCOL.md`, `README.md` — not broken; `proxy` transparently forwards `GET` traffic to Grafana on the same port, so these URLs still resolve correctly for an end user in a browser.
- `docs/architecture/FUTURE_ANALYTICS.md`'s "AI-Assisted" mention — correctly contextual (explains what the panel was renamed _from_), not a live claim.
- `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md:19`'s "10 Grafana dashboards" — inside a section explicitly labeled "Baseline (verified 2026-08-10)," a dated point-in-time snapshot by the file's own convention (same category as `docs/archive/` and `docs/audit/`) — correctly left as historical record, not live drift.
- Migration-number citations spot-checked in `EAP_ARCHITECTURE.md` (067), `MANUFACTURING_DOMAIN.md` (013, 064, 067), `DATA_RETENTION.md` (016), `DATA_FLOW.md` (065) — all exist and match their described content.
- `docs/operations/BACKUP_RESTORE.md`, `docs/operations/RELEASE_CHECKLIST.md`, `docs/operations/SCALING_PLAN.md`, `docs/operations/LDI_VALIDATION_PROTOCOL.md`, `docs/architecture/EAP_ARCHITECTURE.md`, `docs/architecture/MANUFACTURING_DOMAIN.md`, `docs/architecture/OWNERSHIP.md`, `docs/architecture/DATA_RETENTION.md`, `docs/architecture/ALARM_DETAIL_STYLE_GUIDE.md`, `docs/architecture/ARCHITECTURE_DIAGRAM.md`, `docs/architecture/LDI_RCA_GUIDE.md`, `docs/architecture/LDI_SPC_GUIDE.md`, `docs/architecture/PANEL_TOKENS.md`, `docs/business/BUSINESS_VALUE_ROI.md` (already dashboard-count-corrected by a prior commit), `docs/DOCUMENTATION_QUALITY_REPORT.md`, `docs/product/ONBOARDING_SCRIPT.md`, `docs/REAL-DATA-IMPORT.md`, `CHANGELOG.md`, `ABOUT-ME.md`, `START.md`, `AGENTS.md` — read/grepped for the audit's known-changed-facts (alarm-api, proxy, dashboard/migration/service counts, OEE-as-live, Andon interactivity claims); no discrepancies found relative to current repo state.

---

## Summary

| Severity | Count |
| -------- | ----- |
| P0       | 3     |
| P1       | 7     |
| P2       | 3     |
| P3       | 1     |

**Status: all P0/P1/P2/P3 findings in this report fixed 2026-08-13** (commit `docs: reconcile runtime architecture and DR guidance`), except the pre-existing `TROUBLESHOOTING.md`/`INCIDENT_RESPONSE.md` duplication was resolved by removing the duplicate content from `TROUBLESHOOTING.md` in favor of a pointer, not by editing `INCIDENT_RESPONSE.md` (which was already correct). This report is left in place as the record of what was found and fixed, not deleted after the fact.
