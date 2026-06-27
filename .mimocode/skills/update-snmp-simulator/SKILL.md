---
name: update-snmp-simulator
description: Update SNMP simulator configuration with new rates/counter values and restart to apply changes
---

# Update SNMP Simulator

Update the SNMP simulator MIB file with new counter rates, restart the simulator, and verify data is flowing correctly.

## When to Use

- Changing network throughput rates for testing
- Adjusting error/drop rates for alert testing
- Fixing Counter64 overflow issues
- Adding new OIDs or modifying existing ones

## Steps

### 1. Edit the MIB file

Edit `monitoring/snmpsim/Netk@.snmprec` with the desired changes.

**Counter64 (64-bit) format:**
```
1.3.6.1.2.1.31.1.1.1.6.1|65:numeric|min=100000,max=50000000000,rate=12500000
```

**Integer format:**
```
1.3.6.1.2.1.2.2.1.8.1|2:numeric|min=1,max=2,rate=1
```

**String format:**
```
1.3.6.1.2.1.2.2.1.2.1|4|eth0
```

**Rate guidelines:**
- `rate=12500000` = ~100 Mbps effective
- `rate=6500000` = ~52 Mbps effective
- `rate=1500000` = ~12 Mbps effective
- Avoid rates > 50000000 for Counter64 to prevent overflow

### 2. Restart SNMP Simulator

```bash
docker compose restart snmpsim
```

### 3. Wait for stabilization (10 seconds)

```bash
Start-Sleep -Seconds 10
```

### 4. Verify simulator is running

```bash
docker compose logs --tail=10 snmpsim
```

Expected: No `value evaluation error` messages. If you see errors, the rate is too high.

### 5. Verify data is flowing

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, rx_mbps, tx_mbps FROM public.machine_telemetry ORDER BY time DESC LIMIT 2;"
```

Expected: `rx_mbps` and `tx_mbps` should show non-zero values.

### 6. Verify no Counter64 overflow errors

```bash
docker compose logs snmpsim 2>&1 | Select-String -Pattern "value evaluation error" | Select-Object -First 5
```

Expected: No output (no errors).

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `value evaluation error for tag '65'` | Counter64 rate too high | Reduce `max` or `rate` values |
| `rx_mbps = 0` | Rate too low or elapsedSec < 2 | Increase rate or wait 30 seconds |
| Simulator not responding | Container crashed | Check logs, restart container |

## File Location

- Source: `monitoring/snmpsim/Netk@.snmprec`
- This file is mounted read-only into the container

## Notes

- SNMP Simulator uses `snmpsimd` which auto-generates index files
- Adding `--force-index-rebuild` to docker-compose.yaml forces index regeneration on restart
- Counter values accumulate over time; after restart, values reset to `min`
