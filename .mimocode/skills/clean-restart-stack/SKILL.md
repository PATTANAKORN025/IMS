---
name: clean-restart-stack
description: Full clean restart of the IMS Docker stack — destroys volumes, reinitializes DB, and verifies all services
---

# Clean Restart Stack

Tear down the entire IMS stack, destroy all data volumes, and bring everything back fresh. Use after schema migrations, flow rewrites, or when the system is in an inconsistent state.

## When to Use

- After editing `postgres/init/001-init-timescaledb.sql` (schema changes)
- After major Node-RED flow rewrites
- When multiple services are in error states
- When data is stale/corrupted and needs fresh start
- Before demos or screenshots (clean state)

## Quick Clean Restart

```bash
docker compose down -v && docker compose up -d
```

## Full Clean Restart with Verification

```bash
# 1. Tear down everything + volumes
docker compose down -v

# 2. Start fresh
docker compose up -d

# 3. Wait for full startup (40 seconds)
Start-Sleep -Seconds 40

# 4. Verify all containers
docker compose ps

# 5. Verify telemetry flowing
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, COUNT(*) as rows, MAX(time) as latest FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"

# 6. Verify continuous aggregates
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, avg_rx_mbps, max_temp_c FROM public.telemetry_minute_summary ORDER BY bucket DESC LIMIT 4;"

# 7. Verify Grafana
docker compose exec grafana curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health

# 8. Verify Alertmanager
docker compose exec grafana curl -s -o /dev/null -w "%{http_code}" http://alertmanager:9093/-/healthy
```

## Expected Results

| Check | Expected |
|-------|----------|
| Containers | 8/8 Up (snmpsim, timescaledb, pgbouncer, node-red, grafana, prometheus, alertmanager, blackbox) |
| Telemetry rows | > 0 for each machine |
| Continuous aggregates | Non-null avg_rx_mbps, max_temp_c |
| Grafana health | HTTP 200 |
| Alertmanager health | HTTP 200 |

## Partial Restart (No Data Loss)

When you don't need a full clean restart:

```bash
# Restart specific services only
docker compose restart node-red grafana alertmanager

# Wait 25 seconds, then verify
Start-Sleep -Seconds 25
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, COUNT(*), MAX(time) FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"
```

## Gotcha: PgBouncer Port

Inside Docker network, services connect to `ims-pgbouncer:5432` (internal port), not `:6432` (mapped port). This is configured in `flows-ubuntu.json` pg_config node and `docker-compose.yaml`.

## Gotcha: First Data Delay

After clean restart, it takes ~25-30 seconds for Node-RED to reconnect to PgBouncer and start the SNMP polling pipeline. First telemetry rows appear ~10 seconds after that. Continuous aggregates refresh after ~3 minutes of raw data.
