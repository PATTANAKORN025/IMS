---
name: deploy-node-red-flow
description: Deploy Node-RED flow changes, restart, and verify telemetry data is flowing
---

# Deploy Node-RED Flow

Copy the runtime flow file to the version-controlled file, restart, and verify end-to-end data flow.

## When to Use

After editing Node-RED flows (via UI or programmatically), deploy changes and confirm the pipeline is healthy.

## Steps

### 1. Copy and validate JSON

**CORRECT direction: source of truth → runtime copy.** The reverse direction overwrites edits.

```bash
cp flows-ubuntu.json nodered_data/flows.json
python -c "import json; json.load(open('flows-ubuntu.json'))" && echo "VALID" || echo "INVALID"
```

If invalid, fix JSON syntax before proceeding.

### 2. Restart Node-RED

```bash
docker compose restart node-red
```

### 3. Wait for stabilization (25-30 seconds)

Node-RED needs time to reconnect to PgBouncer and start the SNMP walker pipeline.

```bash
Start-Sleep -Seconds 25
```

### 4. Verify pipeline started

```bash
docker compose logs --tail=20 node-red | Select-String -Pattern "started|Started"
```

Expected: `Started flows` message. If you see `TypeError` or `Pipeline Error`, check the flow JSON for syntax issues.

### 5. Verify telemetry data is flowing

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, COUNT(*) as rows, MAX(time) as latest FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"
```

Expected: Row count > 0 for each machine, `latest` within last 30 seconds.

### 6. Quick health summary (optional)

```bash
docker compose ps --format "table {{.Name}}\t{{.Status}}"
```

All containers should show `Up` or `healthy`. Alertmanager should not be in a restart loop.

## Notes

- `nodered_data/flows.json` is gitignored (runtime file)
- `flows-ubuntu.json` is the source of truth for version control
- **CORRECT direction**: `flows-ubuntu.json` → `nodered_data/flows.json` (source → runtime)
- **WRONG direction** (causes data loss): `nodered_data/flows.json` → `flows-ubuntu.json` (runtime → source overwrites edits)
- If editing flows programmatically, edit `flows-ubuntu.json` directly, then copy to `nodered_data/flows.json`
- Full clean redeploy (destroys data): `docker compose down -v && docker compose up -d`
