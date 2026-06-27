# IMS — Industrial NOC Monitoring System

Docker-based server monitoring stack: SNMP → Node-RED → TimescaleDB → Grafana, with Prometheus + Alertmanager alerting.

## Key Commands

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Clean restart (destroys volumes, reinitializes DB)
docker compose down -v && docker compose up -d

# Restart specific services (after config changes)
docker compose restart node-red grafana alertmanager prometheus

# View logs
docker compose logs -f node-red
docker compose logs --tail=50

# Validate config before deploying
docker compose config

# Validate Prometheus config
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml

# Check Prometheus targets
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/targets"

# Check DB data
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, COUNT(*) FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"
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

- **TimescaleDB** (port 5432 internal) — PostgreSQL + time-series extension
- **PgBouncer** (port 6432) — connection pooler, all DB access goes through here
- **Node-RED** (port 1880) — SNMP polling pipeline, writes to DB via `pg` module
- **Grafana** (port 3000) — dashboards, provisioned from `monitoring/grafana/`
- **Prometheus** (port 9090) — metrics scraping
- **Alertmanager** (port 9093) — alert routing with inhibition rules
- **SNMP Simulator** (port 1161/udp) — simulated server metrics for testing
- **Blackbox Exporter** (port 9115) — SLA probes (HTTP, TCP, ICMP)

## Critical Gotchas

### Node-RED Flows

- **`flows-ubuntu.json` is source of truth**; `nodered_data/flows.json` is runtime copy (gitignored)
- **After editing flows**: copy `flows-ubuntu.json` → `nodered_data/flows.json`, then restart Node-RED
- **NEVER use PowerShell `ConvertTo-Json`** to edit `flows-ubuntu.json` — it corrupts `\n` escape sequences in `func` fields, causing SyntaxError in Node-RED
- **Node-RED `func` fields are single-line JSON strings** — edits must preserve `\n` escape sequences, never introduce literal line breaks
- **Node-RED function nodes run in sandboxed VM** — `require()` is unavailable; use `global.get()` for installed packages
- **`snmp walker` nodes unreliable** with snmpsimd (GETNEXT doesn't respect subtree boundaries) — use direct SNMP GET with function nodes instead

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

### Prometheus / Alerting

- **`scrape_timeout: 10s`** on all blackbox jobs alongside `scrape_interval: 30s`
- Alertmanager v0.27.0 syntax: uses `target_matchers` (not `target_matchers_re`)
- Duplicate alert rules with same labels cause `promtool` warnings — keep one per group

### Grafana

- Dashboards are read-only mounted; edit JSON files in `monitoring/grafana/dashboards/`
- Use `jsonb_each()` with `CROSS JOIN LATERAL` for per-interface bandwidth queries
- PostgreSQL `ROUND()` only accepts `NUMERIC`, not `DOUBLE PRECISION` — cast with `::NUMERIC`

### SNMP Simulator

- Temperature range 65-92°C (breathing), rate=4; base OID `.7.0` required for walk anchor
- eth0 flapping (rate=1) is by design for InterfaceDown alert testing
- eth0 64-bit counters require max ≤5B to avoid null (type 129)
- Container uses community string `public` (file: `Netk@.snmprec`)

## Node-RED Flow Architecture

4-Thread Parallel Walker:
1. Fork → CPU walker, Storage walker, SNMP GET Network function node, Temp walker
2. Join barrier (count=4, timeout=8)
3. Parser (try-catch wrapped) → PostgreSQL INSERT via parameterized queries (`msg.params`)

Parser features:
- Fail-safe identity: `(msg.machine_id || msg.topic || '').replace(/'/g, "''")`
- Deep copy for flow context: `JSON.parse(JSON.stringify())` on read/write
- Explicit memory cleanup: `msg.payload = null` + `flatData.length = 0`
- Temperature stores last reading (not max) for realistic fluctuation

## Grafana Dashboards

JSON dashboards in `monitoring/grafana/dashboards/`:
- `ims-noc-overview.json` — executive fleet view
- `ims-main.json` — system overview
- `ims-engineering-drilldown.json` — per-machine deep dive
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

## Testing

K6 stress tests in `tests/k6/`:
```bash
# DB write stress
k6 run tests/k6/db-write-stress.js

# Grafana query stress
k6 run tests/k6/grafana-query-stress.js

# Full pipeline E2E
k6 run tests/k6/pipeline-stress.js
```

Requires K6 installed separately (`choco install k6` / `brew install k6`).

## Git Ignore Rules

- `secrets/`, `.env` — credentials never committed
- `*_data/` — all Docker volumes ignored
- `nodered_data/flows.json` — runtime file, not committed (use `flows-ubuntu.json` instead)
- `nodered_data/node_modules/` — Node-RED packages

## SRE Verification Protocol

After any change:
1. `docker compose down -v && docker compose up -d`
2. Wait 40 seconds for full startup
3. Check all 8 containers are running: `docker compose ps`
4. Check Prometheus targets: all blackbox targets UP
5. Check DB: telemetry flowing, aggregates populated (~3 min)
6. Check Grafana: dashboards load without errors
7. Check Alertmanager: no false TargetDown alerts
