# 📋 Changelog

> **บันทึกการเปลี่ยนแปลง IMS (Infrastructure Monitoring System)**
> รูปแบบอ้างอิงจาก [Keep a Changelog](https://keepachangelog.com/)

---

<div align="center">

![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![Release](https://img.shields.io/badge/Release-Production-brightgreen)
![Date](https://img.shields.io/badge/Date-2026--06--29-orange)

</div>

---

## [1.0.0] — 2026-06-29 (Production Release)

### 🎉 Highlights

- **5-Thread Parallel Walker** — CPU, Storage, Network, Temperature, LDI
- **Device Registry** — Database-driven machine management (1-1000+ machines)
- **4 Grafana Dashboards** — NOC, System, Engineering, Capacity Planning
- **38 Alert Rules** — AIOps, Predictive, SRE standard
- **K6 Load Test** — 1,000 VUs, 0% failure, p95 < 80ms
- **CI/CD Pipeline** — GitHub Actions with security scanning

### ✅ Fixed

- LDI enterprise OID mismatch (9999 vs 99999)
- `bypass_error` node wire not connecting (caused barrier timeout)
- `walk_ldi` missing from `catch_walker` scope
- `ldiTemp` calculated but not saved to database
- Counter wraparound heuristic incorrect for 64-bit counters
- Emoji escape sequence errors in alert messages
- Docker host port conflicts (snmpsim 1161, pgbouncer 6432)
- TimescaleDB migration transaction incompatibility
- Stale credential file persistence across `docker compose down -v`

### ➕ Added

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

### 🔧 Changed

- Separated `docker-compose.yaml` into base/dev/prod
- Flow source of truth: `node-red/flows/ingestion.json` + `alerting.json`
- All walkers use `msg.host`/`msg.community` instead of hardcoded values
- `walk_storage` upgraded to dual-engine (subtree in prod, GET in dev)
- `sysUpTime` OID added to `walk_net_get` for counter wraparound detection
- LDI column types changed from INT to DOUBLE PRECISION
- Architecture upgraded to 5-Thread Parallel Walker
- All services internal-only (no host port bindings)

### 🔒 Security

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

*Follows [Keep a Changelog](https://keepachangelog.com/) format*

</div>
