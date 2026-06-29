# Changelog

รูปแบบอ้างอิงจาก [Keep a Changelog](https://keepachangelog.com/)

## [1.0.0] - 2026-06-29 (Production Release)

### Fixed
- LDI enterprise OID mismatch ระหว่างเอกสารกับโค้ด (9999 vs 99999)
- `bypass_error` node wire ไม่เชื่อมต่อ ทำให้ join barrier รอ timeout เต็มทุกครั้งที่ error
- `walk_ldi` ไม่อยู่ใน scope ของ `catch_walker`
- `ldiTemp` คำนวณแล้วไม่ถูกบันทึกลงฐานข้อมูล
- Counter wraparound heuristic ผิดสำหรับ 64-bit counter (ไม่เช็ค device reboot)
- Emoji escape sequence พิมพ์ผิดใน alert message
- Docker host port conflicts (snmpsim 1161, pgbouncer 6432)
- TimescaleDB migration transaction incompatibility (BEGIN/COMMIT with cagg)
- Stale credential file persistence across `docker compose down -v`

### Added
- Device registry pattern เชื่อม `public.machines` กับ SNMP walker (รองรับหลายเครื่องจริง)
- LINE Notify / MS Teams webhook ที่ส่งออกจริง
- Database migration system (`database/migrations/`)
- Unit tests สำหรับ parsing logic (23 tests, all passing)
- CI/CD secret stubs for compose validation
- Gitleaks allowlist for `.env`, `.playwright-mcp/`, `nodered_data/`
- `scripts/backup-db.sh` and `scripts/restore-db.sh`
- `SECURITY.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`
- `Makefile` (up, down, restart, verify, backup, restore, logs)
- `docker-compose.override.yaml` (dev) and `docker-compose.prod.yaml` (prod)
- Incident response runbook (`docs/runbooks/incident-response.md`)
- Deployment readiness assessment (`docs/deployment-readiness.md`)
- Scaling plan (`docs/scaling-plan.md`)
- Prometheus exporter config for Node-RED self-monitoring
- `node-red-contrib-prometheus-exporter` configuration

### Changed
- แยก `docker-compose.yaml` เป็น base/dev/prod
- Flow source of truth: `node-red/flows/ingestion.json` + `alerting.json`
- All walkers use `msg.host`/`msg.community` instead of hardcoded values
- `walk_storage` upgraded to dual-engine (subtree in prod, GET in dev)
- `sysUpTime` OID added to `walk_net_get` for counter wraparound detection
- LDI column types changed from INT to DOUBLE PRECISION
- Architecture upgraded to 5-Thread Parallel Walker (added LDI walker)
- Services & Ports: all internal-only (no host port bindings)
- Documentation synced: 5-thread, split flows, max-temp description

### Security
- `.mimocode/` and `.playwright-mcp/` untracked from git
- GitHub PAT removed from tracked files
- Node-RED adminAuth configuration ready
- PgBouncer port no longer exposed on host

## [0.9.0] - Phase 18 (Pre-refactor baseline)
- 5-Thread Bulletproof AIOps Parser v7
- Dual-Engine SNMP Walker (Network only)
- Alertmanager inhibition rules
