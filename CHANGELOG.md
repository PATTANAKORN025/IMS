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

### Security & Correctness Fixes
- **alarm-api role check:**
  - The role was read from Grafana `/api/user`, which carries no `orgRole`, so every acknowledge/resolve returned 403, even for Admin. It is now read from `/api/user/orgs` for the session's current organisation.
  - Viewer still gets 403. A Grafana server admin may write.
  - Verified end to end through nginx against Grafana 13.1.2, and the test now runs in pre-commit and CI (`scripts/run-alarm-api-tests.js`).
- **nginx headers:**
  - `X-XSS-Protection: 0`, following current guidance.
  - Added `Permissions-Policy`.
  - Grafana's duplicate `X-Frame-Options` / `X-XSS-Protection` / `X-Content-Type-Options` are hidden, so each header reaches the browser once.
- **Pinned images:** `grafana-image-renderer` is now `v5.11.1` and `pgadmin4` is `9.18`, where both were `:latest`. These are the versions proven in the running stack.
- **Dependabot:**
  - Now covers the Dockerfiles in `nodered_data`, `pgbouncer` and `services/*`, and the images in `docker-compose.yaml`; the old `docker` entry at `/` covered nothing.
  - Minor and patch updates are grouped.
- **npm dependencies:** in-range fixes for `express`, `qs`, `body-parser`, `fast-uri`, `js-yaml` and `svgo`. `npm audit` now reports 0 across the root, `alarm-api` and `factory-twin-3d`.
- **Documentation corrections (en/th/zh-CN):**
  - Repaired LaTeX that an escaping bug had turned into TAB/form-feed characters in 18 files.
  - Rewrote `BACKUP_RESTORE`, `DATA_GOVERNANCE` and `SLO_DEFINITIONS` to match the shipped scripts, roles, live retention policies and exported metrics. They had described AES-256 backups, a `factory_telemetry` database, roles and PromQL metrics that do not exist, and compliance that was never certified.
  - Corrected the alarm-api reference: session-derived actor, 401/403, no host port.
  - Corrected the EAP security boundaries: plain HTTP today.

### Audit Fixes (2026-09-29)
- **Plant data removed from the public tree:**
  - Simulator recipe values are rounded (dosage, scan speed, temperature, humidity, vacuum, PE/JE).
  - Real machine names are replaced with `LDI-nn`, and the Machine Snapshot `log_id` default is cleared.
  - Vendor alarm texts are paraphrased (codes kept), and the two README screenshots are pixelated.
  - Drilling mock IDs are now `MOCK-DRL-nnn`.
  - Git history still holds the old values.
- **Fleet Availability:** divides by machines that are reporting, not by every enabled device row. Disabled/legacy device rows no longer pull it down.
- **Guardrails that could pass while broken:**
  - `repo-hygiene-linter` crashed on Linux (unquoted `%(objectsize)`).
  - `panel-data-check` counted a SQL error as "0 rows". It now stops on error, runs each dashboard against its own database, resolves template variables and repeat panels, and counts a skip as a failure in strict mode.
  - `orphan-object-linter` fails in CI when it cannot reach the database.
- **Migrations:** the runner stops at the first failed file. A migration that needs `eap_backup` and finds it missing is reported as deferred and runs again on the next start, instead of being recorded as applied.
- **CI:** builds a synthetic `eap_backup` before the panel check. Tests that ran in neither pre-commit nor CI now run in both, and `promtool` matches the runtime Prometheus version.
- **VCP alert rules:** `execErrState: KeepLast`, so a missing `eap_backup` does not page on day one.
- **LDI ingestion:**
  - `"0"` stays 0, and a missing `state` is NULL, not "running".
  - Rows without `eqp_id`/`log_id` are rejected with their indexes, and batches over 1,000 rows get 413.
  - A stuck DB pool is replaced instead of exiting Node-RED.
- **LDI simulators:**
  - Alarms carry their machine's process and factory.
  - Background noise is cut, and vacuum/alignment faults are more frequent, so condition-driven alarms lead.
  - Environment variation now matches the profile's standard deviation.
  - Simulated alarms are acknowledged and resolved as actor `simulator` (`LDI_SIM_AUTO_LIFECYCLE`).
  - A 24-hour replay test covers this.
- **Dashboards:** the SPC moving-average trend is one series per machine. The Engineering Drill-Down scan-speed and judgment-error panels carry correct titles and units.
- **Deployment:** `make verify` fails while any secret in `.env` still equals its public `.env.example` value (names only are printed).
- **Tooling:**
  - `make doctor`, `deploy-flows` and `test-unit` run from any make shell, and `test-unit` runs every unit test.
  - Unused Grafana plugins are no longer installed.
  - Init scripts no longer hardcode the database and owner names.

### Hardening (2026-09-29, second pass)
- **Alert webhook authentication:** `/alert-webhook` requires `Authorization: Bearer <ALERT_WEBHOOK_TOKEN>` (401 otherwise, 503 when the token is unset). Alertmanager sends it from a compose secret, and the Grafana contact point sends it too. `ALERT_WEBHOOK_TOKEN` is now required.
- **Least-privilege database roles (migration 087):** Node-RED writes as `nodered_writer` and the observability archiver as `observability_archiver`, each granted only the tables it uses; neither is the superuser any more. New required `.env` keys: `NODERED_DB_PASSWORD`, `ARCHIVER_DB_PASSWORD`.
- **Docker socket:** the archiver no longer mounts `/var/run/docker.sock`. It reads container events through `docker-socket-proxy`, which allows only read endpoints (POST is refused), on an internal network. Its tools are built into its own image instead of installed at every start.
- **Dashboard script injection:** the Alarm Console acknowledge/resolve buttons and the drilling fleet machine links no longer place database values inside `onclick` JavaScript, and the VCP wall no longer writes URL variables unescaped into links. `dashboard-linter` rejects both patterns.
- **Operator Andon:** a tile turns grey STALE when its data is more than 5 minutes old against the wall clock, so a stopped pipeline cannot leave it green. `?var-clock=replay` keeps the old replay behaviour.
- **Latest LDI state per machine (migration 088):** kept in `ldi_machine_last_state` by an insert trigger; `v_ldi_machine_latest_full` reads it with unchanged columns, so its cost no longer grows with `ldi_data`.
- **Drilling Fleet Overview:** each card shows its factory ("F3 - DRL001-M") from the new `machine_master` registry (migration 089, schema only), and the Factory filter now applies to the cards and the KPIs. A machine missing from the registry is still shown, as "F?". The horizontal scroll position survives the auto-refresh and a page reload.
- **Credential rotation:** the documented procedure switches statement logging off for the session, because `ALTER ROLE ... PASSWORD` otherwise reaches the server log when DDL logging is on.

### Documentation & Repository Hygiene
- Re-verified all living documentation and inventories against live runtime (`main`) as of 2026-09-28 across EN, TH, and ZH-CN.
- Synchronized release badge to `v1.0.1` and removed living rule files (`AGENTS.md`) from `.gitignore`.
- Regenerated and verified `DASHBOARD_INVENTORY.md` (22 dashboards, 225 panels) and `DATABASE_SCHEMA.md` (61 migrations, 013–086) with zero drift.
- Hardened `.gitignore` with global archive ignore patterns (`*.zip`, `*.tar.gz`, `*.tgz`).
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
