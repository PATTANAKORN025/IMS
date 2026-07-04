# IMS Troubleshooting Guide

> SRE Runbook for operating the IMS monitoring stack at 3 AM.

## Quick Health Check

Run these commands in order to assess system state:

```bash
# 1. Container status
docker compose ps

# 2. Node-RED startup confirmation
docker logs ims-node-red 2>&1 | tail -5

# 3. Telemetry flow (should show rows for each machine)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
  "SELECT machine_id, COUNT(*) as rows, MAX(time) as latest \
   FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '5 minutes' \
   GROUP BY machine_id;"

# 4. Prometheus targets (all should be UP)
curl -s http://localhost:9090/api/v1/targets | python3 -c \
  "import sys,json; d=json.load(sys.stdin); \
   up=sum(1 for t in d['data']['activeTargets'] if t['health']=='up'); \
   print(f'{up}/{len(d[\"data\"][\"activeTargets\"])} targets UP')"
```

## Failure Modes

| Symptom | Likely Cause | Diagnostic | Resolution |
|---------|-------------|-----------|------------|
| **Node-RED crash-looping** | DB connection failure or missing npm modules | `docker logs ims-node-red --tail=50` | Check PgBouncer: `docker logs ims-pgbouncer --tail=20`. Verify `.env` has `POSTGRES_PASSWORD`. Rebuild if missing modules: `docker compose build --no-cache node-red && docker compose up -d node-red` |
| **Node-RED "Started flows" but no data** | SNMP target unreachable or wrong community string | `docker exec ims-node-red node -e "const s=require('net-snmp').createSession('ims-snmpsim','Netk@',{port:161,version:2});s.get(['1.3.6.1.2.1.1.3.0'],(e,v)=>{console.log(e||v);s.close()})"` | Verify snmpsim is running: `docker logs ims-snmpsim --tail=5`. Check community string matches `Netk@` |
| **Grafana "No Data" on panels** | CAGG not refreshed yet or wrong time range | `docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT COUNT(*) FROM public.telemetry_minute_summary WHERE bucket > NOW() - INTERVAL '1 hour';"` | CAGGs take ~3 min to populate after restart. Wait and refresh. If count=0, check Node-RED logs for INSERT errors |
| **Grafana "Panel plugin not found: clock"** | Plugin not installed or stale volume | `docker compose exec grafana grafana-cli plugins ls` | Wipe Grafana volume: `docker compose rm -fs grafana && docker volume rm ims_grafana_data && docker compose up -d grafana` |
| **High CPU on TimescaleDB** | CAGG refresh storm or unoptimized queries | `docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5;"` | Check Grafana dashboard refresh rates. Capacity dashboard should be 5m, not 10s. Kill long queries: `SELECT pg_terminate_backend(pid);` |
| **PgBouncer "server login has been failing"** | Stale auth cache after password change | `docker logs ims-pgbouncer --tail=20 \| grep -i "login\|error"` | Restart PgBouncer: `docker compose restart pgbouncer`. Verify `DATABASE_URL` env var matches TimescaleDB credentials |
| **Retry queue growing** (`/data/retry_queue.json`) | DB inserts failing repeatedly | `docker exec ims-node-red cat /data/retry_queue.json \| python3 -c "import sys,json; q=json.load(sys.stdin); print(f'Queue: {len(q)} entries, latest error: {q[-1][\"error\"] if q else \"none\"}')"` | Check PgBouncer connectivity. Max 5 retries per entry, max 500 entries. Queue drains automatically every 30s |
| **Alertmanager "TargetDown" for blackbox** | Wrong Docker DNS name in prometheus.yml | `curl -s http://localhost:9090/api/v1/targets \| python3 -c "import sys,json; [print(t['labels'].get('job','?'), t['health']) for t in json.load(sys.stdin)['data']['activeTargets']]"` | Blackbox targets MUST use service name `blackbox-exporter:9115`, NOT container name `ims-blackbox` or `blackbox:9115` |
| **Docker "port already in use"** | Windows NAT port conflict | `netstat -ano \| findstr :1880` | Run: `net stop winnat && net start winnat` to reset Windows NAT |

## Common Operations

### Restart a single service
```bash
docker compose restart node-red    # Restart pipeline
docker compose restart grafana     # Reload dashboard JSON
docker compose restart prometheus  # Reload alert rules
```

### Deploy flow changes
```bash
make deploy-flows    # Merge split flows → POST to Admin API
```

### Check database state
```bash
# Row count per machine (last 5 min)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
  "SELECT machine_id, COUNT(*) FROM public.machine_telemetry \
   WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"

# CAGG freshness
docker compose exec timescaledb psql -U ims_admin -d ims -c \
  "SELECT MAX(bucket) as latest FROM public.telemetry_minute_summary;"
```

### Backup and restore
```bash
make backup                    # Backup to backups/backup_YYYYMMDD.sql
make restore FILE=backups/backup_20260701.sql
```

### Full clean restart (destroys all data)
```bash
docker compose down -v && docker compose up -d
# Wait 40s for startup, then:
make deploy-flows
```

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `POSTGRES_DB` | Yes | `ims` | Database name |
| `POSTGRES_USER` | Yes | `ims_admin` | Database user |
| `POSTGRES_PASSWORD` | Yes | — | Database password |
| `GRAFANA_ADMIN_USER` | Yes | `admin` | Grafana admin username |
| `GRAFANA_ADMIN_PASSWORD` | Yes | — | Grafana admin password |
| `NODE_RED_CREDENTIAL_SECRET` | Yes | — | Encrypts stored flow credentials |
| `LINE_CHANNEL_ACCESS_TOKEN` | No | — | LINE Messaging API token |
| `LINE_USER_ID` | No | — | LINE user ID for alerts |
| `TEAMS_WEBHOOK_URL` | No | — | MS Teams incoming webhook URL |

## Escalation Path

1. Check `docker compose ps` — any container not running?
2. Check logs of the failing container — `docker logs <container> --tail=50`
3. Check DB connectivity — `docker compose exec timescaledb pg_isready`
4. Check network — `docker compose exec node-red ping pgbouncer`
5. If all else fails: `docker compose down -v && docker compose up -d && make deploy-flows`
