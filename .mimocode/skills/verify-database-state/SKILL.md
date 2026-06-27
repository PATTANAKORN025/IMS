---
name: verify-database-state
description: Verify TimescaleDB state after configuration changes or data pipeline updates
---

# Verify Database State

Check that TimescaleDB is healthy and telemetry data is being written correctly.

## When to Use

After restarting services, modifying Node-RED flows, or troubleshooting data pipeline issues.

## Quick Verification

```bash
# Wait for services to stabilize
Start-Sleep -Seconds 25

# Check recent telemetry data
docker exec ims-timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, time, cpu_load_percent FROM public.machine_telemetry ORDER BY time DESC LIMIT 5;"
```

## Full Verification Steps

1. Check database connection:
```bash
docker exec ims-timescaledb psql -U ims_admin -d ims -c "SELECT 1 as alive;"
```

2. Check recent data (last 5 minutes):
```bash
docker exec ims-timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, count(*) as rows FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"
```

3. Check continuous aggregate:
```bash
docker exec ims-timescaledb psql -U ims_admin -d ims -c "SELECT * FROM public.telemetry_minute_summary ORDER BY bucket DESC LIMIT 3;"
```

4. Check for errors in telemetry:
```bash
docker exec ims-timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, sum(net_rx_errors) as errors FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '1 hour' GROUP BY machine_id;"
```

## Schema Reference

- Table: `public.machine_telemetry` (hypertable)
- Continuous Aggregate: `public.telemetry_minute_summary`
- View: `public.v_uptime_summary`
- Columns: time, machine_id, cpu_cores, cpu_load_percent, ram_total_mb, ram_used_mb, disk_total_gb, disk_used_gb, net_rx_bytes, net_tx_bytes, net_rx_errors, net_rx_drops, net_if_status, temp_c, interface_metrics (JSONB)

## Troubleshooting

If no data appears:
1. Check Node-RED logs: `docker compose logs --tail=50 node-red`
2. Check PgBouncer connection: `docker exec ims-pgbouncer psql -h timescaledb -U ims_admin -d ims -c "SELECT 1"`
3. Verify SNMP simulator: `docker exec ims-snmpsim snmpwalk -v2c -c Netk@ localhost:161 1.3.6.1.2.1.25.3.3.1.2`
