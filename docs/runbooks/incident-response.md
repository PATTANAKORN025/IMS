# Incident Response Runbook

## Alert → Action Matrix

| Alert Name | Severity | First Action | Escalation |
|---|---|---|---|
| **ServiceDown** | critical | `docker compose up -d <service>` | If persists >5 min: check logs `docker compose logs --tail=50 <service>` |
| **InterfaceDown** | critical | Check cable/switch port. Run `docker compose restart node-red` | If eth0 flapping: expected in simulator (rate=1) |
| **HighCpuLoad** | warning/critical | Check `top` inside container: `docker exec <container> top` | If sustained: restart container or investigate workload |
| **HighMemoryUsage** | warning/critical | Check `free -m` inside container | If >90%: restart container |
| **DiskSpaceLow** | warning/critical | `docker system prune -f` to clear Docker cache | If persists: expand volume or adjust retention policy |
| **HighTemperature** | warning/critical | Check physical server environment (AC, ventilation) | If >90°C: emergency shutdown |
| **NetworkErrors** | warning | Check cable quality, switch port errors | If sustained: replace cable or switch port |
| **NodeREDDown** | critical | `docker compose restart node-red` | If crashes repeatedly: check `docker compose logs node-red` for OOM |
| **PgBouncerDown** | critical | `docker compose restart pgbouncer` | Check TimescaleDB is healthy first |
| **TelemetryGap** | warning | Check Node-RED logs for SNMP timeouts | If >5 min gap: restart full stack `docker compose down && up -d` |
| **TargetDown** | warning | Check Prometheus targets: `curl localhost:9090/api/v1/targets` | Verify blackbox-exporter DNS name is correct |
| **SLABreachWarning** | info | Check uptime percentage in Prometheus | Review if single-instance architecture meets SLA requirements |

## Step-by-Step: Full Stack Restart

```bash
# 1. Stop everything
docker compose down

# 2. Start fresh
docker compose up -d

# 3. Wait 40 seconds for full startup
sleep 40

# 4. Verify all containers
docker compose ps

# 5. Check data flow (wait 25s for first poll cycle)
sleep 25
docker compose exec timescaledb psql -U ims_admin -d ims \
  -c "SELECT machine_id, COUNT(*) FROM public.machine_telemetry
       WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"

# 6. Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | python -c "
import json,sys
d=json.load(sys.stdin)
for t in d['data']['activeTargets']:
    print(f\"{t['labels']['job']}: {t['health']}\")
"
```

## Step-by-Step: Database Recovery

```bash
# If database is corrupted or empty
docker compose down -v  # Destroys all data
docker compose up -d
sleep 40
# Re-run migrations if needed
docker compose exec -T timescaledb psql -U ims_admin -d ims < database/migrations/001-fix-ldi-types-add-disk-desc.sql
```

## Step-by-Step: Node-RED Flow Recovery

```bash
# If flows are corrupted
cp node-red/flows/ingestion.json nodered_data/flows.json
# Note: alerting.json needs separate handling — merge into single file for Node-RED
docker compose restart node-red
```

## Escalation Contacts

- **Level 1** (Auto): Docker auto-restart, alert webhook notification
- **Level 2** (IT Team): Manual container restart, log analysis
- **Level 3** (MIS-G): Full stack rebuild, database recovery
