# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Working Memory — IMS

## Project
**IMS** = Industrial Monitoring System for **APEX Circuit** — Docker-based NOC telemetry stack.
Phase 12 (Apex SRE Optimization) — Status: STABLE / WORLD-CLASS PRODUCTION READY
Last checkpoint: 2026-06-24

**Data flow:** snmpsim → Node-RED (5-thread parallel SNMP GET) → PgBouncer → TimescaleDB → Grafana. Prometheus + Alertmanager + Blackbox Exporter handle alerting & SLA probes. A single `docker-compose.yaml` orchestrates all 8 services; there is no app build step — config + flows + SQL only.

## Stack
| Service | Port | Role |
|---------|------|------|
| TimescaleDB | 5432 (internal) | Time-series DB (PostgreSQL 16) |
| PgBouncer | 6432 (internal) | Connection pooler → all DB access goes here |
| Node-RED | 1880 | SNMP polling pipeline |
| Grafana | 3000 | Dashboards |
| Prometheus | 9090 | Metrics |
| Alertmanager | 9093 | Alert routing |
| SNMP Simulator | 1161/udp | Dev/test simulator |
| Blackbox Exporter | 9115 | SLA probes |

## Commands
Run from repo root. `docker compose` works in PowerShell or bash.

```bash
docker compose up -d                              # start all 8 services
docker compose down                               # stop
docker compose down -v && docker compose up -d    # CLEAN reset: wipes volumes, re-runs postgres/init/*.sql
docker compose restart node-red grafana alertmanager prometheus   # reload after config edits
docker compose ps                                 # health/status (expect 8 containers)
docker compose logs -f node-red                   # follow one service's logs
docker compose config                             # validate compose + .env interpolation
```

**Deploy Node-RED flow changes** (Rules 7 & 8 — `flows.json` is gitignored; edit `flows-ubuntu.json`):
```powershell
Copy-Item flows-ubuntu.json nodered_data/flows.json   # plain copy — NEVER ConvertTo-Json
docker compose restart node-red
```

**Validate / inspect:**
```bash
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/targets"   # all blackbox targets must be UP
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, COUNT(*) FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"
```

**Tests** — K6 load/chaos (needs `choco install k6`); run one file at a time:
```bash
k6 run tests/k6/pipeline-stress.js       # full E2E
k6 run tests/k6/db-write-stress.js       # DB write path
k6 run tests/k6/grafana-query-stress.js  # dashboard queries
k6 run tests/k6/chaos-stress.js          # chaos / failure injection
```

After any change, follow the **7-step SRE Verification Protocol** in `AGENTS.md`: clean reset → wait 40s → 8 containers up → Prometheus targets UP → telemetry flowing → aggregates populate (~3 min) → no false alerts.

## Ironclad Rules
1. DB schema = `public` only — never `ims.*`
2. Node-RED SNMP = 5-thread parallel SNMP GET (not walker nodes, they're unreliable with snmpsim)
3. Parse = O(N) single-pass, `split('.').pop()`, no regex
4. Memory cleanup = `flatData.length = 0` + `msg.payload = null` on every cycle
5. Grafana queries = use continuous aggregates, never raw table; use `$__timeGroupAlias`; cast `::NUMERIC` before `ROUND()`
6. PgBouncer = `AUTH_TYPE: plain`, transaction pooling — no prepared statements
7. `flows-ubuntu.json` is source of truth; copy to `nodered_data/flows.json` before restart
8. Never edit `flows-ubuntu.json` with PowerShell `ConvertTo-Json` — corrupts `\n` in func fields

## Key File Locations
- `docker-compose.yaml` — 8-service orchestration (resource limits, healthchecks, Docker secrets)
- `flows-ubuntu.json` — Node-RED flows (source of truth)
- `nodered_data/flows.json` — runtime copy (gitignored)
- `postgres/init/*.sql` — **schema source of truth** (`public.machine_telemetry` hypertable + continuous aggregates); runs only on a clean volume
- `monitoring/grafana/dashboards/` — dashboard JSON files (edit here, not in UI)
- `monitoring/prometheus/` — `prometheus.yml` + `rules/ims-alerts.yml`
- `monitoring/alertmanager/alertmanager.yml` — alert routing + inhibition
- `monitoring/snmpsim/Netk@.snmprec` — simulated SNMP responses (community `public`)
- `tests/k6/` — K6 load/chaos tests
- `secrets/` — credential files (never committed)
- `MEMORY.md` — full architecture reference
- `AGENTS.md` — AI agent onboarding / key commands / SRE verification protocol
- `checkpoint.md` — phase history and backlog

> ⚠ **`README.md` is stale** — it documents an `ims.*` schema, a `recorded_at` column, and `telemetry_1h`/`telemetry_1d` aggregates. The authoritative schema is `public.*` with a `time` column and `telemetry_minute_summary`/`telemetry_hourly_summary` (see Rule 1 and `postgres/init/*.sql`). Trust the SQL, not the README.

## LDI Private MIB OIDs (`.1.3.6.1.4.1.99999.1.1.x`)
1=Throughput 2=Temp 3=Humidity 4=PE% 5=JE% 6=Power 7=Vibration 8=Uptime

## Alert Thresholds
CPU >75% warn / >90% crit | RAM >80% / >90% | Disk >85% / >95% | Temp >70°C / >85°C

## Terms
| Term | Meaning |
|------|---------|
| LDI | Manufacturing line — uses enterprise MIB `.1.3.6.1.4.1.99999` |
| PE | Process Efficiency (%) |
| JE | Junction Efficiency (%) |
| NOC | Network Operations Center (dashboard tier) |
| SRE | Site Reliability Engineering |
| AIOps | AI-driven ops (3-sigma anomaly detection) |
| snmpsim | SNMP Simulator container (`tandrup/snmpsim`) |
| hypertable | TimescaleDB time-partitioned table |
| CA | Continuous Aggregate (`telemetry_minute_summary`, `telemetry_hourly_summary`) |
