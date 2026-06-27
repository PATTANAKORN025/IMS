---
name: update-aiops-parser
description: Update Node-RED AIOps Parser function code, deploy flows, and verify pipeline health
---

# Update AIOps Parser

Update the AIOps Parser function code in Node-RED, deploy the changes, and verify the pipeline is healthy.

## When to Use

- Modifying telemetry parsing logic
- Adding new OID support
- Fixing calculation bugs (Mbps, errors, etc.)
- Updating SQL INSERT statements

## Steps

### 1. Write updated function to temp file

Create a temp file with the updated function code:

```javascript
// Write to temp_aiops.js
if (!msg.payload || !Array.isArray(msg.payload)) return null;
// ... your updated code ...
```

### 2. Update flows-ubuntu.json

```bash
node -e "const fs=require('fs'); const funcCode=fs.readFileSync('temp_aiops.js','utf8'); const data=JSON.parse(fs.readFileSync('flows-ubuntu.json','utf8')); const node=data.find(n=>n.id==='sre_parser'); node.func=funcCode; fs.writeFileSync('flows-ubuntu.json', JSON.stringify(data, null, 4));"
```

### 3. Copy to runtime location

```bash
Copy-Item "flows-ubuntu.json" "nodered_data\flows.json" -Force
```

### 4. Clean up temp file

```bash
Remove-Item "temp_aiops.js" -Force -ErrorAction SilentlyContinue
```

### 5. Restart Node-RED

```bash
docker compose restart node-red
```

### 6. Wait for stabilization (25 seconds)

```bash
Start-Sleep -Seconds 25
```

### 7. Verify no errors in logs

```bash
docker compose logs --tail=30 node-red | Select-String -Pattern "TypeError|BigInt|OOM|Error|undefined" -CaseSensitive:$false
```

Expected: No output (no errors).

### 8. Verify data is flowing

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, rx_mbps, tx_mbps FROM public.machine_telemetry ORDER BY time DESC LIMIT 2;"
```

Expected: Non-zero `rx_mbps` and `tx_mbps` values.

### 9. Verify function has expected features

```bash
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('flows-ubuntu.json','utf8')); const node=data.find(n=>n.id==='sre_parser'); const func=node.func; console.log('Deep Copy:', func.includes('JSON.parse(JSON.stringify')); console.log('No BigInt:', !func.includes('BigInt(')); console.log('startsWith:', func.includes('startsWith'));"
```

Expected: All checks should be `true`.

## Function Code Requirements

| Requirement | Description |
|-------------|-------------|
| Deep Copy | Use `JSON.parse(JSON.stringify())` for flow context |
| No BigInt | Use `18446744073709552000` (Number) instead of BigInt |
| startsWith() | Use `oid.startsWith()` for OID matching |
| Memory cleanup | Set `msg.payload = null` and `flatData.length = 0` |
| Jitter Logic | Calculate only when `rxDiff > 0 && elapsedSec >= 2` |
| Fail-Safe Identity | `const mid = (msg.machine_id \|\| msg.topic \|\| '')` |

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `rx_mbps = 0` | Deep Copy not working | Check `flow.get/set` calls |
| `TypeError: Cannot mix BigInt` | BigInt literal in code | Replace `123n` with `123` |
| `machine_id = undefined` | Missing Fail-Safe Identity | Add `\|\| ''` fallback |
| Data not flowing | flows.json not copied | Run step 3 again |

## File Locations

- Source: `flows-ubuntu.json` (version controlled)
- Runtime: `nodered_data/flows.json` (gitignored)
- Always edit source, then copy to runtime

## Notes

- The AIOps Parser function ID is `sre_parser`
- Function processes SNMP walker output and inserts into `public.machine_telemetry`
- After restart, first data appears ~25-30 seconds later
