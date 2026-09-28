# Changelog

> **IMS (Industrial Monitoring System) change log**
> Format based on [Keep a Changelog](https://keepachangelog.com/)

---

<div align="center">

<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **Version:** 1.0.1
<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **Release:** Production
<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **Date:** 2026-08-21

</div>

---

## [Unreleased] — `main` as of 2026-09-28

### Added (merged to `main`, 2026-09-10 to 2026-09-28)
- **PR #20** — EAP SCADA Floor 1: the operational map defaults to REAL/UNAVAILABLE instead of simulated state, with a full audit.
- **PR #21** — CSS/UI/UX: design tokens, typography, responsive layout, motion and a committed visual-regression baseline; token-parity and status-colour drift lints run in pre-commit and CI.
- **PR #22** — `integration/andon-layout-safe` → `main`: the Factory Twin 3D and EAP work reconciled onto `main` (13 conflicts resolved, main-only commits preserved); the Operator Andon board fits without scrolling at 1920×1080 and 3840×2160, and 1280×720 is declared unsupported.
- **PR #23** — Factory Twin 3D deep runtime audit (render loop, WebGL lifecycle, measured performance) and cached private geometry/mapping/zone file reads.
- **Drilling and VCP plating** — 7 dashboards in two new Grafana folders (01 Drilling, 04 VCP), 7 VCP alert rules, the `drilling-timescaledb` data source for the `eap_backup` database, and migrations 083–086:
  - 083: database guardrails;
  - 084–086: drilling views, indexes, and domain schemas with a data catalog. These use views only and rename nothing.

  All four Grafana folders are now numbered 01–04.

  For databases without plant data, a synthetic generator now builds `eap_backup` (`docs/data/MOCK_DATA.md`); a unit test covering it runs in pre-commit and CI.

  Runtime guardrails:
  - `jit=off` and worker, timeout, and slow-query logging settings on TimescaleDB;
  - pgAdmin bound to `127.0.0.1`;
  - nginx paths for Grafana health checks and Grafana Live WebSocket;
  - two LDI Cpk alert rules paused until `v_machine_spc_ranking` is fixed.

### Documentation & Repository Hygiene
- Re-verified all living documentation and inventories against live runtime (`main`) as of 2026-09-28 across EN, TH, and ZH-CN.
- Synchronized release badge to `v1.0.1` and removed living rule files (`AGENTS.md`) from `.gitignore`.
- Regenerated and verified `DASHBOARD_INVENTORY.md` (15 dashboards, 190 panels) and `DATABASE_SCHEMA.md` (12 tables, 7 CAGGs, 57 migrations) with zero drift.
- Living documents re-verified against `main` in English, Thai and Simplified Chinese: README, `CLAUDE.md`, docs index, admin and user manuals, operations runbook, architecture, security policy, contributing guide.
- Floor 1 facility dimensions withheld from public documents; real server hostnames and mirrored personal files removed.
- Standardized trilingual global navigation (`GLOBAL_NAV`) with localized labels and relative paths across all 600+ markdown files.
- Hardened `.gitignore` rules against telemetry raw data leaks (`*.csv`, `*.parquet`, `*.dump`, `/vcp/`).
- Clarified TimescaleDB internal-only port configuration across ADMIN_MANUAL, ARCHITECTURE, and SECURITY docs (EN/TH/ZH-CN).
- Syntax-tagged 100% of code blocks across all documentation files, eliminating bare fences to ensure strict CommonMark/GFM compliance and screen-reader accessibility.
- Added full Thai and Simplified Chinese translations for `CLAUDE.md` guidance.
- Dated evidence and audit records use English-first pointer pages in `th/` and `zh-CN/`; every relative link and anchor resolves.

### Corrections to 1.0.1
- *"100% Security Compliance … scrub of entire Git history"*: the cleanup covered what was known at the time and is not a guarantee. Treat the whole history as public and rotate any secret that ever reached a commit.
- *"Full English, Thai, and Simplified Chinese translations for all documentation"*: not every document was translated; the current policy is described in `docs/README.md`.

## [1.0.1] - 2026-08-21 (World-Class Open Source Edition)

### Highlights
- **100% Security Compliance**: Surgical scrub of entire Git history (1,100+ commits) eliminating all IPs, hardware tags, and real vendor error codes.
- **V2 Normalized Architecture**: Migrated Node-RED ingestion to normalized JSON structures and schema-bound SQL inserts.
- **Extensive Pre-commit Suite**: Added robust Husky pre-commit hooks enforcing Unit tests, E2E tests, Dashboard Linters, Security Exceptions, and Documentation sync.
- **Cross-Platform Compatibility**: Resolved critical Windows/Linux CRLF node-red crashing bugs and normalized pathing.
- **Multilingual Excellence**: Full English, Thai, and Simplified Chinese translations for all documentation and READMEs.
- **Cyberpunk NOC UI**: Replaced static UI assets with an animated 60 FPS cyberpunk scanner GIF for NOC presentations.

### Security
- **CVE Exceptions Engine**: Created a programmatic, strictly-expiring gate for high-severity but unreachable vulnerabilities (e.g., Grafana Go stdlib DoS).
- **Physical Data Scrub**: Deleted all legacy data dumps and logs from the local machine preventing `.gitignore` bypass leaks.
- **Nginx Hardening**: Implemented strict rate-limiting (`limit_req_zone 100r/s`) and header size caps (`large_client_header_buffers 4 16k`) on the reverse proxy.

### Fixed
- E2E IPv6 `localhost` resolution timeout on Windows during `verify-deployment.ps1`.
- Grafana dashboard layout grid overlaps (Grid-24 discipline enforced).
- Node-RED barrier timeout race conditions inside the AIOps parser.
- Missing `sys_hourly` continuous aggregate refresh policies.
- Orphaned `as` type assertions migrated to `@total-typescript/shoehorn`.

## [1.0.0] — 2026-06-29 (Production Release)

### Highlights

- **5-Thread Parallel Walker** — CPU, Storage, Network, Temperature, LDI
- **Device Registry** — Database-driven machine management (1-1000+ machines)
- **4 Grafana Dashboards** — NOC, System, Engineering, Capacity Planning
- **38 Alert Rules** — AIOps, Predictive, SRE standard
- **K6 Load Test** — 1,000 VUs, 0% failure, p95 < 80ms
- **CI/CD Pipeline** — GitHub Actions with security scanning

### Fixed

- LDI enterprise OID mismatch (9999 vs 99999)
- `bypass_error` node wire not connecting (caused barrier timeout)
- `walk_ldi` missing from `catch_walker` scope
- `ldiTemp` calculated but not saved to database
- Counter wraparound heuristic incorrect for 64-bit counters
- Emoji escape sequence errors in alert messages
- Docker host port conflicts (snmpsim 1161, pgbouncer 6432)
- TimescaleDB migration transaction incompatibility
- Stale credential file persistence across `docker compose down -v`

### Added

- **Device Registry Pattern** — `public.machines` table with SNMP walker integration
- **LINE Notify / MS Teams Webhooks** — Real alert notifications
- **Database Migration System** — `database/migrations/` with idempotent SQL
- **23 Unit Tests** — All passing, covering parsing logic
- **CI/CD Secret Stubs** — Compose validation without real credentials
- **Gitleaks Allowlist** — `.env`, `.playwright-mcp/`, `nodered_data/`
- **Backup/Restore Scripts** — `scripts/backup-db.sh`, `scripts/restore-db.sh`
- **SECURITY.md** — Known limitations and hardening checklist
- **CHANGELOG.md** — This file
- **CONTRIBUTING.md** — Development guidelines
- **LICENSE** — MIT License
- **Makefile** — 8 targets (up, down, restart, verify, backup, restore, logs, test)
- **docker-compose.override.yaml** — Dev overrides (snmpsim)
- **docker-compose.prod.yaml** — Production overrides
- **Incident Response Runbook** — `docs/runbooks/incident-response.md`
- **Deployment Readiness Assessment** — `docs/deployment-readiness.md`
- **Scaling Plan** — `docs/scaling-plan.md`
- **Prometheus Exporter** — Node-RED self-monitoring config

### Changed

- Separated `docker-compose.yaml` into base/dev/prod
- Flow source of truth: `node-red/flows/ingestion.json` + `alerting.json`
- All walkers use `msg.host`/`msg.community` instead of hardcoded values
- `walk_storage` upgraded to dual-engine (subtree in prod, GET in dev)
- `sysUpTime` OID added to `walk_net_get` for counter wraparound detection
- LDI column types changed from INT to DOUBLE PRECISION
- Architecture upgraded to 5-Thread Parallel Walker
- All services internal-only (no host port bindings)

### Security

- `.mimocode/` and `.playwright-mcp/` untracked from git
- GitHub PAT removed from tracked files
- Node-RED adminAuth configuration ready
- PgBouncer port no longer exposed on host

---

## [0.9.0] — 2026-06-24 (Pre-Refactor Baseline)

### Added

- 5-Thread Bulletproof AIOps Parser v7
- Dual-Engine SNMP Walker (Network only)
- Alertmanager inhibition rules

---

<div align="center">

**IMS Changelog — Version 1.0**

_Follows [Keep a Changelog](https://keepachangelog.com/) format_

</div>
