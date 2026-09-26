<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# System Administration & SRE Guide

> **Administration Manual for the IT Team (MIS-G) for IMS Maintenance**
> Covers Docker management, device registration, alert management, and troubleshooting.

---

<div align="center">

<img src="../assets/icons/check-circle.svg" width="14" align="center"/> **Admin:** SRE Guide
<img src="../assets/icons/check-circle.svg" width="14" align="center"/> **Version:** 1.2
<img src="../assets/icons/check-circle.svg" width="14" align="center"/> **Audience:** IT Team

</div>

---

## Table of Contents

1. [System Management](#system-management)
2. [Adding New Devices](#adding-new-devices)
3. [Alert Management](#alert-management)
4. [Troubleshooting](#troubleshooting)
5. [Backup & Recovery](#backup--recovery)
6. [Performance Monitoring](#performance-monitoring)

---

## System Management

### Container Overview

The system operates entirely on Docker Compose: `docker-compose.yaml` defines 15 services (14 long-running services and 1 one-shot migration runner that exits upon completion). There is no `profiles:` gating, so `make up` and `make up-prod` start all of them, the SNMP simulator and pgAdmin included:

| Container              | Service                | Port                        | Purpose                                                                                                                                           |
| ---------------------- | ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ims-timescaledb`      | TimescaleDB            | 5432 (loopback only)        | Time-series database                                                                                                                              |
| `ims-pgbouncer`        | PgBouncer              | 5432 (internal)             | Connection pooler                                                                                                                                 |
| `ims-db-migrate`       | Migration runner       | — (one-shot)                | Applies `database/migrations/*.sql`, gates `node-red` and `alarm-api` startup                                                                     |
| `ims-node-red`         | Node-RED               | 1880 (loopback only)        | Data pipeline                                                                                                                                     |
| `ims-proxy`            | nginx reverse proxy    | **3000**                    | The single UI entry point: routes `/` to Grafana, `/alarm-api/`, `/factory-twin-3d/`, and `/ldi-telemetry` + `/inject` to Node-RED. Gates `/alarm-api/` behind an `auth_request` check against Grafana's own session. |
| `ims-grafana`          | Grafana                | internal only, no host port | Dashboard — reachable only through `ims-proxy` now, not directly                                                                                  |
| `ims-alarm-api`        | alarm-api              | internal only, no host port | Write path for `public.ldi_alarm_lifecycle` (Acknowledge/Resolve from `IMS LDI - Alarm Console`). Reachable only through `ims-proxy`.             |
| `ims-grafana-renderer` | Grafana Image Renderer | 8081 (internal)             | PNG rendering for panel export/alerts                                                                                                             |
| `ims-prometheus`       | Prometheus             | 9090 (loopback only)        | Metrics & alerting                                                                                                                                |
| `ims-alertmanager`     | Alertmanager           | 9093 (loopback only)        | Alert routing                                                                                                                                     |
| `ims-blackbox`         | Blackbox Exporter      | 9115 (loopback only)        | SLA probes                                                                                                                                        |
| `ims-snmpsim`          | SNMP Simulator         | 161/udp (internal)          | Simulated SNMP devices for development and demos                                                                                                  |
| `ims-factory-twin-3d`  | Factory Twin 3D        | 4100 (internal)             | Floor 1 digital twin, served through `ims-proxy` at `/factory-twin-3d/`                                                                           |
| `ims-observability-archiver` | Log/metrics archiver | — (no port)             | Periodically archives container and DB observability snapshots to `./ops-logs`. Mounts `/var/run/docker.sock` read-only — treat it as privileged. |
| `ims-pgadmin4`         | pgAdmin 4              | **5050, all interfaces**    | Database administration UI. The only service besides `ims-proxy` published on every interface — firewall it or bind it to `127.0.0.1` outside a lab. |

> `ims-db-migrate` exits with status 0 after applying pending migrations -- seeing it as `Exited (0)` in `docker compose ps` is expected, not a failure. `node-red` and `alarm-api` won't start until it completes successfully.

### Common Operations

```bash
# Check the status of all containers
docker compose ps

# Start all systems
docker compose up -d

# Shut down all systems
docker compose down

# Clean Restart -- DESTROYS ALL DATA (every volume). Disposable environments only.
docker compose down -v && docker compose up -d

# Restart a specific service experiencing issues
docker compose restart node-red
docker compose restart pgbouncer
docker compose restart grafana
docker compose restart proxy
docker compose restart alarm-api
docker compose restart prometheus alertmanager

# View real-time logs (Last 50 lines)
docker compose logs -f --tail 50 node-red
docker compose logs -f --tail 50 pgbouncer

# Monitor resource utilization
docker stats --no-stream
```

> [!NOTE]
>
> > Following a `docker compose down -v`, a 40-second waiting period is required to allow all systems to start up completely prior to inspection.

### Service Health Checks

```bash
# Database
docker compose exec timescaledb pg_isready -U ims_admin -d ims

# Node-RED
curl -s http://localhost:1880/

# Grafana
curl -s http://localhost:3000/api/health

# Prometheus
curl -s http://localhost:9090/-/healthy

# Alertmanager
curl -s http://localhost:9093/-/healthy
```

### Database Migrations

`database/migrations/` currently has 57 sequenced files (`013` through `082`, with some numbers skipped/archived — earlier numbers `001-012` were folded into `postgres/init/001-init-timescaledb.sql`, the fresh-deploy bootstrap path). Applied automatically by the one-shot `ims-db-migrate` service on every `docker compose up`; `node-red` and `alarm-api` won't start until it exits successfully.

```bash
# Manually re-run migrations without bringing up the rest of the stack
bash scripts/migrate.sh

# Expect this exact line on a healthy, up-to-date database:
# Pending: 0 Applied: 0 Failed: 0
# "Pending: N" means N migration files exist that schema_migrations doesn't
# have a row for yet -- scripts/migrate.sh will apply them in order.

# Check what's actually been applied
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT version, filename, applied_at FROM public.schema_migrations ORDER BY version DESC LIMIT 10;"
```

All migrations are written to be idempotent (`CREATE ... IF NOT EXISTS`, guarded `DO $$ ... $$` blocks) so re-running `scripts/migrate.sh` against an already-current database is always a safe no-op. See `docs/architecture/ARCHITECTURE.md`'s "Migration Governance" section for why there is deliberately exactly one migration runner, not three.

---

## Pre-Production Security Checklist

> [!CAUTION]
> Before deploying to production, ALL default credentials MUST be changed. Failure to do so exposes the system to unauthorized access.

| Credential               | Default Value      | Location                                            | Action Required                                                                                                                                                                                |
| ------------------------ | ------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INGEST_API_KEY`         | public example value | `.env` → `ims-node-red` env | **CHANGE** — anyone who can reach `/ldi-telemetry` or `/inject` (host port 3000 through nginx, or 1880 on loopback) can inject spoofed telemetry |
| `POSTGRES_PASSWORD`      | public example value | `.env` | **CHANGE** — database superuser (`POSTGRES_USER`) |
| `GRAFANA_DB_PASSWORD`    | public example value | `.env` → `grafana_reader` role, PgBouncer userlist | **CHANGE** — read access to every table Grafana can query |
| `ALARM_API_DB_PASSWORD`  | public example value | `.env` → `alarm_api_writer` role (migration `078-alarm-api-writer-role.sql`) | **CHANGE** — scoped to `SELECT`+`UPDATE` on `ldi_alarm_lifecycle`, but still a real DB credential |
| `GRAFANA_ADMIN_PASSWORD` | public example value | `.env` → Grafana admin | **CHANGE** — dashboard edit + datasource access |
| `ALERT_WEBHOOK_TOKEN`, `GRAFANA_RENDERER_TOKEN` | public example value | `.env` | **CHANGE** — webhook and renderer shared secrets |
| `NODE_RED_CREDENTIAL_SECRET`, `NODE_RED_ADMIN_PASSWORD_HASH` | public example value / empty | `.env` → Node-RED | **CHANGE** before storing any credential in a flow; an empty hash leaves the editor without admin auth |
| `PGADMIN_DEFAULT_PASSWORD` | public example value | `.env` → pgAdmin | **CHANGE** — pgAdmin is published on all interfaces |

Every value in `.env.example` is public (the repository is public). Treat each one as compromised and never deploy it.

### How to Rotate

```bash
# 1. Generate new secrets (never echo them into a shared terminal log)
gen() { python -c "import secrets; print(secrets.token_urlsafe($1))"; }
NEW_API_KEY=$(gen 32); NEW_PG_PASS=$(gen 24); NEW_GRAFANA_DB_PASS=$(gen 24)
NEW_ALARM_API_DB_PASS=$(gen 24); NEW_GRAFANA_ADMIN_PASS=$(gen 24)

# 2. Change the database role passwords FIRST, while the old credentials still work.
#    The superuser password in an existing data volume is NOT changed by editing .env.
docker compose exec -T timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<SQL
ALTER ROLE CURRENT_USER WITH PASSWORD '$NEW_PG_PASS';
ALTER ROLE grafana_reader WITH PASSWORD '$NEW_GRAFANA_DB_PASS';
ALTER ROLE alarm_api_writer WITH PASSWORD '$NEW_ALARM_API_DB_PASS';
SQL

# 3. Update .env to match
sed -i "s/^INGEST_API_KEY=.*/INGEST_API_KEY=$NEW_API_KEY/" .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_PG_PASS/" .env
sed -i "s/^GRAFANA_DB_PASSWORD=.*/GRAFANA_DB_PASSWORD=$NEW_GRAFANA_DB_PASS/" .env
sed -i "s/^ALARM_API_DB_PASSWORD=.*/ALARM_API_DB_PASSWORD=$NEW_ALARM_API_DB_PASS/" .env
sed -i "s/^GRAFANA_ADMIN_PASSWORD=.*/GRAFANA_ADMIN_PASSWORD=$NEW_GRAFANA_ADMIN_PASS/" .env

# 4. Recreate the containers so they pick up the new environment
#    (pgbouncer re-seeds userlist.txt from .env on start)
docker compose up -d --force-recreate pgbouncer node-red grafana alarm-api factory-twin-3d observability-archiver

# 5. GF_SECURITY_ADMIN_PASSWORD only applies to a brand-new Grafana database;
#    on an existing one, reset the admin password explicitly:
docker compose exec grafana grafana cli admin reset-admin-password "$NEW_GRAFANA_ADMIN_PASS"

# 6. Verify
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
curl -s -X POST http://localhost:1880/inject \
 -H "Content-Type: application/json" \
 -H "x-api-key: $NEW_API_KEY" \
 -d '{"machine_id":"TEST"}'
```

### Verification Commands

```bash
# Confirm INGEST_API_KEY is enforced (should return 401 without key)
curl -s -w "\nHTTP: %{http_code}" -X POST http://localhost:1880/inject \
 -H "Content-Type: application/json" -d '{"machine_id":"TEST"}'
# Expected: HTTP 401

# Confirm Grafana requires login
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/dashboards
# Expected: 401 (not 200)
```

---

## Adding New Devices

### Step 1: Register in Database

The `public.devices` table categorizes `device_type` strictly between `'server'` (SNMP-monitored infrastructure, which is the default) and `'ldi'` (LDI manufacturing machine). Ensure the appropriate type is specified; otherwise, it will default to `'server'` and will subsequently fail to appear on any LDI dashboards:

```sql
-- Add a new infrastructure server (SNMP-polled)
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, snmp_community, snmp_port, enabled)
VALUES ('NEW-MACHINE-01', '192.168.1.100', '192.168.1.100', 'server', 'public', 161, true);

-- Add a new LDI machine (Bypasses SNMP — data is inputted via ldi_ingestion.json / simulator)
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, enabled)
VALUES ('LDI-11', 'LDI-11', '', 'ldi', true);

-- Verification
SELECT device_id, hostname, device_type, snmp_community, enabled FROM public.devices WHERE device_id IN ('NEW-MACHINE-01', 'LDI-11');
```

### Step 2: Verify SNMP Connectivity

```bash
# Test SNMP from Node-RED container
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const session = snmp.createSession('192.168.1.100', 'public', {port: 161, timeout: 5000});
session.get(['1.3.6.1.2.1.1.1.0'], (err, varbinds) => {
 if (err) console.error('ERROR:', err.message);
 else console.log('OK:', varbinds[0].value.toString());
 session.close();
});
"
```

### Step 3: Verify Data Flow

```bash
# Wait 30 seconds for the poll cycle to execute
sleep 30

# Verify data ingestion
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
 FROM public.sys_metrics s
 WHERE device_id = 'NEW-MACHINE-01'
 GROUP BY device_id;"
```

### Step 4: Add Dashboard Panel (Optional)

If a dedicated dashboard is required for the new machine:

1. Open Grafana → Dashboard → Edit
2. Add a new panel
3. Use the query: `SELECT time, cpu_load_percent FROM public.sys_metrics WHERE device_id IN (\${machine_id:sqlstring}) ORDER BY time DESC`
4. Save the dashboard

---

## Alert Management

### Alert Rules Location

- Prometheus (platform and pipeline): `monitoring/prometheus/rules/ims-alerts.yml`
- Grafana-managed (machine and LDI conditions): `monitoring/grafana/provisioning/alerting/rules.yml` and `ldi-rules.yml`, with contact points and routing in `contactpoints.yml` / `policies.yml`. Provisioned rules are read-only in the Grafana UI; edit the files and restart Grafana.

### Editing Alert Rules

Prometheus rules cover the platform itself (Prometheus/Alertmanager/targets, blackbox `ServiceDown`/latency/SLA/TLS, the `Watchdog`, and the Node-RED pipeline metrics `ims_pipeline_*` and `ims_circuit_breaker_state`). Machine-level conditions (CPU, temperature, LDI parameters) are evaluated by Grafana SQL alert rules and dashboards against TimescaleDB, not by Prometheus.

**Example: tightening an existing rule** (`PipelineHighErrorRate`, currently `> 0.1` failures/s for 5 minutes):

```yaml
      - alert: PipelineHighErrorRate
        expr: rate(ims_pipeline_inserts_failed_total[5m]) > 0.05   # was 0.1
        for: 5m
        labels:
          severity: warning
          service: node-red
        annotations:
          summary: "High INSERT failure rate on Node-RED pipeline"
          description: "{{ $value | humanize }} failures/sec over 5 minutes."
```

Every new rule needs `severity` and `service` labels (Alertmanager routing and inhibition key on them) and must pass `promtool check rules` before it is reloaded.

### Reload Configuration

```bash
# 1. Verify syntax first (the rules directory is mounted read-only at /etc/prometheus/rules)
docker compose exec prometheus promtool check rules /etc/prometheus/rules/ims-alerts.yml

# 2. Reload (Prometheus runs with --web.enable-lifecycle; the port is bound to 127.0.0.1)
curl -X POST http://localhost:9090/-/reload
```

> [!WARNING]
> A reload re-evaluates every rule immediately. With LINE/Teams credentials configured, a rule that is already firing sends a real notification.

### Inhibition Rules

`monitoring/alertmanager/alertmanager.yml` defines three inhibition rules:

| Source alert | Suppressed alerts | Must match on |
| --- | --- | --- |
| `ServiceDown` | `ServiceHighLatency`, `SLABreachWarning` | `instance` |
| any `severity="critical"` | any `severity="warning"` | `device_id` |
| `InterfaceDown` | `BandwidthSaturation` | `device_id` |

---

## Troubleshooting

### Common Issues & Solutions

| Issue                               | Root Cause                                 | Resolution                                                              |
| ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Grafana displays "No Data"          | PgBouncer connections saturated or DB down | Execute `docker restart ims-pgbouncer` and check disk space             |
| Alerts not dispatched to LINE/Teams | Credentials empty in `.env`, or webhook token mismatch | Check `LINE_CHANNEL_ACCESS_TOKEN` / `TEAMS_WEBHOOK_URL` / `ALERT_WEBHOOK_TOKEN`, then the Node-RED logs of the `POST /alert-webhook` node |
| Bandwidth graphs spike to Tbps      | 32-bit Counter Wrap                        | Handled by parser, but if encountered, ensure device supports 64-bit HC |
| Node-RED fails to start             | Syntax Error in Flow JSON                  | Review logs: `docker compose logs --tail=50 node-red`                   |
| Continuous Aggregate lacks data     | Manual refresh required                    | Execute `CALL refresh_continuous_aggregate('sys_hourly', NULL, NULL);`  |
| Container stuck in "Restarting"     | Configuration mismatch or port conflict    | Check the logs for the specific container                               |

### SRE Verification Protocol

> [!CAUTION]
> `docker compose down -v` deletes every named volume, including the TimescaleDB data. Use it only on a disposable environment, never on a stack that holds real data.

```bash
# 1. Start (or converge) the stack
docker compose up -d

# 2. Wait 40 seconds
sleep 40

# 3. Verify containers (14 long-running + ims-db-migrate, which should be Exited (0))
docker compose ps

# 4. Verify data flow
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
FROM public.sys_metrics s JOIN public.devices d ON d.device_id = s.device_id
WHERE s.time > NOW() - INTERVAL '5 minutes'
GROUP BY device_id;"

# 5. Verify Continuous Aggregates
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT bucket, avg_cpu, max_temp
FROM public.sys_hourly
ORDER BY bucket DESC LIMIT 4;"

# 6. Verify Grafana
curl -sf http://localhost:3000/api/health

# 7. Verify Prometheus Targets
curl -sf http://localhost:9090/api/v1/targets | python3 -c "
import sys, json
data = json.load(sys.stdin)
ups = sum(1 for t in data['data']['activeTargets'] if t['health'] == 'up')
total = len(data['data']['activeTargets'])
print(f'Prometheus: {ups}/{total} targets UP')
"
```

---

## Backup & Recovery

### Database Backup

Use the scripted path (`make backup` → `scripts/backup-db.sh`, `make restore FILE=<path>` → `scripts/restore-db.sh`); [Backup & Restore](../operations/BACKUP_RESTORE.md) documents the procedure and its tested caveats. For a manual dump:

```bash
# -T is required: without it docker allocates a TTY and corrupts the redirected dump
docker compose exec -T timescaledb sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_$(date +%Y%m%d).sql

# Restore into an existing database
docker compose exec -T timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backup_YYYYMMDD.sql

# Automated backup (cron, from the repository directory)
0 2 * * * cd /path/to/IMS && bash scripts/backup-db.sh
```

`scripts/backup-db.sh` writes gzipped dumps to `./backups/` (gitignored) and deletes dumps older than 30 days. Dump files contain production data: never move one to a tracked path, and restrict access to the backup directory.

### Flow Backup

```bash
# nodered_data/flows/*.json is the source of truth maintained by git
# (built into nodered_data/flows.json by scripts/build-flows.js -- don't hand-edit flows.json)
# Backup nodered_data/flows.json (runtime copy)
cp nodered_data/flows.json nodered_data/flows.json.bak

# Restore from backup
cp nodered_data/flows.json.bak nodered_data/flows.json
docker compose restart node-red
```

### Configuration Backup

```bash
# Backup docker-compose files
cp docker-compose.yaml docker-compose.yaml.bak
cp docker-compose.prod.yaml docker-compose.prod.yaml.bak
cp proxy/nginx.conf proxy/nginx.conf.bak

# Backup Prometheus config
cp monitoring/prometheus/prometheus.yml monitoring/prometheus/prometheus.yml.bak
cp monitoring/prometheus/rules/ims-alerts.yml monitoring/prometheus/rules/ims-alerts.yml.bak

# Backup Grafana dashboards
cp -r monitoring/grafana/dashboards/ monitoring/grafana/dashboards.bak/
```

---

## Performance Monitoring

### System Metrics

```bash
# Container resource usage
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Database connections
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT count(*) as active_connections
FROM pg_stat_activity
WHERE state = 'active';"

# Disk usage
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT pg_size_pretty(pg_database_size('ims')) as database_size;"

# Table sizes
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;"
```

### Prometheus Metrics

```bash
# Scrape duration
curl -s http://localhost:9090/api/v1/query?query=prometheus_scrape_duration_seconds

# Samples ingested
curl -s http://localhost:9090/api/v1/query?query=prometheus_tsdb_head_samples_appended_total

# Alert count
curl -s http://localhost:9090/api/v1/alerts | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'Active alerts: {len(data[\"data\"][\"alerts\"])}')
"
```

### Log Analysis

```bash
# Node-RED errors
docker compose logs node-red 2>&1 | grep -i "error" | tail -20

# Prometheus errors
docker compose logs prometheus 2>&1 | grep -i "error" | tail -20

# Alertmanager errors
docker compose logs alertmanager 2>&1 | grep -i "error" | tail -20

# Database slow queries
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;"
```

---

<div align="center">

**IMS Admin Manual — Version 1.2 (verified against `main`, 2026-09-26)**

_For IT Team & MIS-G_

</div>
