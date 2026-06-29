# IMS — Industrial NOC Monitoring System

Docker-based server monitoring stack: SNMP → Node-RED → TimescaleDB → Grafana, with Prometheus + Alertmanager alerting.

## Key Commands

```bash
# Start all services (dev mode — includes snmpsim)
make up
# or: docker compose -f docker-compose.yaml -f docker-compose.override.yaml up -d

# Start in production mode (no snmpsim, localhost-only ports)
make up-prod

# Stop all services
make down

# Clean restart (destroys volumes, reinitializes DB)
docker compose down -v && docker compose up -d

# Restart specific services (after config changes)
docker compose restart node-red grafana alertmanager prometheus

# Full verification
make verify

# Unit tests
make test-unit
# or: npm test --prefix tests/unit

# Load tests (requires k6 installed separately)
make test-load

# View logs
docker compose logs -f node-red
docker compose logs --tail=50

# DB backup / restore
make backup
make restore FILE=backups/backup_YYYYMMDD.sql

# Validate config before deploying
docker compose config

# Validate Prometheus config
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml

# Check Prometheus targets
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/targets"

# Check DB data
docker compose exec timescaledb psql -U ims_admin -d ims -c \
  "SELECT machine_id, COUNT(*) FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"
```

## Prerequisites

1. Copy `.env.example` to `.env` and set passwords
2. Create secrets:
   ```bash
   mkdir -p secrets
   echo "your-db-password" > secrets/postgres_password.txt
   echo "your-grafana-password" > secrets/grafana_admin_password.txt
   ```

## Architecture

- **TimescaleDB** (internal only) — PostgreSQL + time-series extension
- **PgBouncer** (internal only) — connection pooler, all DB access goes through here. **No host port mapping** — use internal DNS `pgbouncer:5432`
- **Node-RED** (127.0.0.1:1880) — SNMP polling pipeline, writes to DB via `pg` module
- **Grafana** (3000, prod: 127.0.0.1:3000) — dashboards, provisioned from `monitoring/grafana/`
- **Prometheus** (127.0.0.1:9090) — metrics scraping
- **Alertmanager** (127.0.0.1:9093) — alert routing with inhibition rules
- **SNMP Simulator** (internal only) — simulated server metrics for dev mode. **No host port mapping** — container-to-container via `ims-snmpsim:161`
- **Blackbox Exporter** (127.0.0.1:9115) — SLA probes (HTTP, TCP, ICMP)

## Compose Files

- `docker-compose.yaml` — base definition for all 8 services
- `docker-compose.override.yaml` — dev mode: enables snmpsim, sets `NODE_ENV=development`
- `docker-compose.prod.yaml` — production mode: removes snmpsim, binds Grafana to localhost only, PgBouncer no host port

## Critical Gotchas

### Node-RED Flows

- **`node-red/flows/ingestion.json` is source of truth** for ingestion pipeline; `node-red/flows/alerting.json` for alerting. Runtime copies in `nodered_data/`
- **After editing flows**: copy split files to `nodered_data/`, then restart Node-RED
- **NEVER use PowerShell `ConvertTo-Json`** to edit flow JSON — it corrupts `\n` escape sequences in `func` fields, causing SyntaxError in Node-RED
- **Node-RED `func` fields are single-line JSON strings** — edits must preserve `\n` escape sequences, never introduce literal line breaks
- **Node-RED function nodes run in sandboxed VM** — `require()` is unavailable; use `global.get()` for installed packages
- **`snmp walker` nodes unreliable** with snmpsim (GETNEXT doesn't respect subtree boundaries) — use direct SNMP GET with function nodes instead
- **For complex flow modifications**: use file-based scripts (`_tmp_*.js`) instead of `node -e` inline — PowerShell quoting issues make inline edits fragile

### Docker DNS

- **Prometheus blackbox targets MUST use Docker SERVICE names**: `blackbox-exporter:9115` not `blackbox:9115` (DNS fails) or `ims-blackbox:9115` (container name). Wrong name causes all TargetDown alerts.
- All 4 blackbox relabel_configs + self-monitor target must use the service name

### Database

- All objects in `public` schema only — no `ims.*` schema divergence
- Database: `ims`, user: `ims_admin`, connect via PgBouncer `ims-pgbouncer:5432`
- PgBouncer uses `AUTH_TYPE: plain` (scram-sha-256 fails with plain-text passwords)
- **PgBouncer uses `transaction` pooling mode** — no prepared statements
- TimescaleDB hypertable requires `time` column as partitioning key
- `interface_metrics` column is `jsonb` — use `jsonb_each()` not `jsonb_each_text()`
- Continuous aggregates take ~3 min to populate after clean restart
- **Migrations in `database/migrations/`**: idempotent SQL (IF EXISTS/IF NOT EXISTS). **Never wrap in BEGIN/COMMIT** — `CREATE MATERIALIZED VIEW ... WITH DATA` fails inside transaction blocks.

### Prometheus / Alerting

- **`scrape_timeout: 10s`** on all blackbox jobs alongside `scrape_interval: 30s`
- Alertmanager v0.27.0 syntax: uses `target_matchers` (not `target_matchers_re`)
- Duplicate alert rules with same labels cause `promtool` warnings — keep one per group

### Grafana

- Dashboards are read-only mounted; edit JSON files in `monitoring/grafana/dashboards/`
- Use `jsonb_each()` with `CROSS JOIN LATERAL` for per-interface bandwidth queries
- PostgreSQL `ROUND()` only accepts `NUMERIC`, not `DOUBLE PRECISION` — cast with `::NUMERIC`
- **Template variables**: NOC Overview + Capacity Planning have `$machine_id` (multi-select, All=`%`) and `$interface` (eth0/wlan0). Engineering has `$machine_id` (single-select) + `$interface`. All queries filter via `LIKE '${machine_id}'` for All compatibility.
- **Symmetrical network panels**: Use `axisCenteredZero: true` + Upload multiplied by `-1`. Never set `min: 0` on symmetrical panels.
- **RAM saturation panels**: Query returns percent (`AVG(ram_used)/AVG(ram_total)*100`), so `unit` must be `percent` in both `fieldConfig.defaults` AND `options`.

### SNMP Simulator

- Temperature range 65-92°C (breathing), rate=4; base OID `.7.0` required for walk anchor
- eth0 flapping (rate=1) is by design for InterfaceDown alert testing
- eth0 64-bit counters require max ≤5B to avoid null (type 129)
- Container uses community string `public` (file: `Netk@.snmprec`)
- **Counters saturate at max, do NOT wrap** — after ~94-111s, counters hit configured max and produce 0 Mbps

## Node-RED Flow Architecture

5-Thread Parallel Walker:
1. Fork → CPU walker, Storage walker, Network walker, Temp walker, LDI walker
2. Join barrier (count=5, timeout=15)
3. Parser (try-catch wrapped) → PostgreSQL INSERT via parameterized queries (`msg.params`)
4. DB insert retry buffer: `catch_db_insert` → `retry_store` (max 5 retries) → `retry_delay` (5s) → `retry_rebuild` → `db_insert`

Parser features:
- Fail-safe identity: `(msg.machine_id || msg.topic || '').replace(/'/g, "''")`
- Deep copy for flow context: `JSON.parse(JSON.stringify())` on read/write
- Explicit memory cleanup: `msg.payload = null` + `flatData.length = 0`
- Temperature stores max reading per poll cycle (intentional for manufacturing peak-temp tracking)

Node-RED npm packages (`nodered_data/package.json`):
- `pg` ^8.22.0 — PostgreSQL client (used in function nodes, NOT the dashboard node)
- `node-red-contrib-postgresql` ^0.15.4 — PostgreSQL node for flow
- `node-red-node-snmp` ^2.1.0 — SNMP nodes (walker unreliable, use function nodes with `global.get('snmp')`)
- `node-red-dashboard` ~3.6.6 — Dashboard UI

## Grafana Dashboards

JSON dashboards in `monitoring/grafana/dashboards/`:
- `ims-noc-overview.json` — executive fleet view (home dashboard)
- `ims-main.json` — system overview
- `ims-engineering-drilldown.json` — per-machine deep dive (includes LDI panels 503-507)
- `ims-capacity-planning.json` — forecasting

**SRE color convention:**
- CPU: Yellow → Orange → Red
- RAM: Purple → Dark-orange → Red
- Disk: Cyan → Blue → Red
- Network RX: Dark Blue (#1F60C4), TX: Light Blue (#5794F2)
- wlan0: Purple (#8E24AA) Download, Magenta (#E02F44) Upload
- Errors: Red (#C4162A), Drops: Orange (#FF9830)

## Alertmanager Inhibition Rules

Critical alerts suppress lower-severity alerts for the same issue:
- `InterfaceDown` suppresses all network warnings + CPU/RAM/Thermal warnings
- `ServiceDown` suppresses all warnings on same machine
- `NodeREDDown` suppresses `TelemetryGap`
- Critical suppresses Warning and Info for same alertname + machine

## Git Workflow

- **Branch naming**: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`, `refactor/<topic>`, `test/<topic>`, `security/<topic>`
- **Commits**: Conventional Commits — `<type>(<scope>): <summary>` (feat, fix, docs, chore, refactor, test, security, perf)
- **PRs**: Squash merge only, auto-delete head branches, require CI + conversation resolution before merge to main
- **Branch protection**: No force push, no direct push to main, require status checks
- **Tags**: Semantic Versioning (`v1.0.0`)

## CI/CD (`.github/workflows/ci.yml`)

Runs on push/PR to `main`. Single job `validate-architecture`:
1. Creates secret stubs (`echo "placeholder"`) — CI validates paths, not file contents
2. `docker compose config -q` — validates compose syntax
3. `promtool check config` — validates Prometheus YAML
4. `promtool check rules` — validates alert rules
5. JSON validation — Grafana dashboards + Node-RED flows via `python3 -c "import json"`
6. `gitleaks detect` — secret scan with `.gitleaks.toml` allowlist

No unit tests or integration tests in CI yet — run locally via `make test-unit`.

## Testing

Unit tests in `tests/unit/`:
```bash
make test-unit
# or: npm test --prefix tests/unit
```
- `parser.test.js` — 9 parser unit tests
- `counter-wraparound.test.js` — 14 counter-wraparound tests

K6 load tests in `tests/k6/` (requires `choco install k6` / `brew install k6`):
```bash
make test-load
# or: k6 run tests/k6/pipeline-stress.js
```

## Git Ignore Rules

- `secrets/`, `.env` — credentials never committed
- `*_data/` — all Docker volumes ignored
- `.mimocode/`, `.playwright-mcp/` — AI tooling, not project source
- `nodered_data/flows.json` — runtime file, not committed (use `node-red/flows/` instead)
- `nodered_data/settings.js`, `nodered_data/package.json` — committed (whitelisted)
- `backup_*.sql`, `backups/` — DB backups never committed
- `_tmp_*.js`, `_tmp_*.sql` — temp scripts auto-generated

## SRE Verification Protocol

After any change:
1. `docker compose down -v && docker compose up -d`
2. Wait 40 seconds for full startup
3. Check all 8 containers are running: `docker compose ps`
4. Check Prometheus targets: all blackbox targets UP
5. Check DB: telemetry flowing, aggregates populated (~3 min)
6. Check Grafana: dashboards load without errors
7. Check Alertmanager: no false TargetDown alerts
