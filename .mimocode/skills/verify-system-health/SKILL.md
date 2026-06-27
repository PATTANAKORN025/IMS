---
name: verify-system-health
description: Comprehensive health check of all IMS services — containers, database, pipeline, and alerts
---

# Verify System Health

Run a full end-to-end health check across all IMS components after deployment or troubleshooting.

## When to Use

- After `docker compose up -d` or `docker compose down -v && docker compose up -d`
- After editing Node-RED flows, Grafana dashboards, or alert rules
- When troubleshooting "No Data" or false alerts
- Before presenting demos or screenshots

## Quick Health Check (30 seconds)

```bash
# 1. All containers running?
docker compose ps --format "table {{.Name}}\t{{.Status}}"

# 2. Data flowing? (wait 25s after restart)
Start-Sleep -Seconds 25
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, COUNT(*) as rows, MAX(time) as latest FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"

# 3. No Node-RED errors?
docker compose logs --tail=10 node-red 2>&1 | Select-String -Pattern "error|Error|ERROR" -NotMatch
```

## Full Health Check

### 1. Container Status

```bash
docker compose ps --format "table {{.Name}}\t{{.Status}}"
```

All containers should show `Up` or `healthy`. Watch for:
- `Restarting` — check logs for that container
- `Exit` — container crashed

### 2. Database Connection

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT 1 as alive;"
```

### 3. Telemetry Data Flow

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT machine_id,
       COUNT(*) as rows_5min,
       MAX(time) as latest,
       ROUND(AVG(cpu_load_percent)::NUMERIC, 1) as avg_cpu,
       ROUND(AVG(temp_c)::NUMERIC, 0) as avg_temp
FROM public.machine_telemetry
WHERE time > NOW() - INTERVAL '5 minutes'
GROUP BY machine_id;"
```

Expected: Row count > 0, `latest` within 30 seconds, reasonable CPU/temp values.

### 4. Continuous Aggregate

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "
CALL refresh_continuous_aggregate('public.telemetry_minute_summary', NULL, NULL);
SELECT * FROM public.telemetry_minute_summary ORDER BY bucket DESC LIMIT 2;"
```

### 5. Node-RED Pipeline Logs

```bash
docker compose logs --tail=20 node-red 2>&1
```

Look for:
- `Started flows` — pipeline running
- No `TypeError` or `Pipeline Error` messages
- No `ETIMEOUT` or `ECONNREFUSED`

### 6. Alertmanager Health

```bash
docker compose logs --tail=5 alertmanager 2>&1 | Select-String -Pattern "error|Error" -NotMatch
```

Should not see `Loading configuration file failed`.

### 7. Interface Metrics (JSONB)

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT machine_id, interface_metrics
FROM public.machine_telemetry
ORDER BY time DESC LIMIT 1;"
```

Verify per-interface data (eth0, wlan0) with rx_mbps, tx_mbps, errors, drops, status.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| All panels "No Data" | Step 3 — is data flowing? If not, check Node-RED logs |
| Specific machine "No Data" | Check inject node interval and machine_id match |
| Alertmanager restarting | Check config YAML syntax: `docker compose logs alertmanager --tail=20` |
| High memory usage | Check Node-RED: `docker stats ims-node-red` |
| False TargetDown alerts | Verify blackbox-exporter has `cap_add: NET_RAW` in docker-compose.yaml |
