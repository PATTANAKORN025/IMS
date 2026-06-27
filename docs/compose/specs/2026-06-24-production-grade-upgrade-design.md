# Production-Grade Upgrade Design

## [S1] Problem

The IMS monitoring stack works but has scalability and UX limitations:
- **Insert overhead**: Each 10s poll inserts one row per machine. At 1,000 machines, that's 100 INSERTs/poll cycle — unnecessary DB connection overhead.
- **Dashboard layout**: Bandwidth panel shows Download and Upload on same axis with negative values for Upload — hard to read at a glance.
- **Mock data flatness**: SNMP simulator produces static-rate counters without realistic counter wraps or jitter, so the parser's counter-wrap handling is never tested.
- **No inactive port filtering**: Dashboard shows all interfaces including DOWN ports, cluttering the view.

## [S2] Solution Overview

Four focused changes to the existing stack. No new services, no new dependencies.

| Area | What Changes | What Stays |
|------|-------------|------------|
| Data Pipeline | Node-RED batches telemetry before INSERT | SNMP GET collection, 4-thread walker |
| Dashboard | Symmetrical bandwidth layout, inactive port filtering | All existing panels, SRE colors |
| Mock Data | Realistic accumulating counters with wraps | Current OID structure |
| Security | Secrets validation, connection pool tuning | Docker Secrets, PgBouncer |

**Not changing**: Z-Score stays in Grafana SQL, SNMP GET stays (no BulkWalk), no new services added.

## [S3] Batch Processing Design

### Current Flow
```
Poll (10s) → Parser → 1 INSERT per machine → DB
```

### New Flow
```
Poll (10s) → Parser → APPEND to batch array → When batch complete → Single INSERT with N rows → DB
```

### Implementation

**File**: `flows-ubuntu.json` — `sre_parser` function node

**Changes to parser**:
1. On each machine's parsed data, append to `flow.get('insert_batch_' + mid)` array
2. When batch array reaches threshold (or after all machines processed in poll cycle):
   - Build single INSERT with multiple VALUES: `INSERT INTO ... VALUES ($1,...), ($2,...), ...`
   - Flatten all params into single `msg.params` array
   - Send to PostgreSQL node
   - Clear batch array
3. Deep copy batch array on read/write (existing `JSON.parse(JSON.stringify())` pattern)

**Batch size**: 1 row per machine per poll cycle. For 100 machines = 100 rows per batch INSERT.

**Connection pool impact**: Reduces INSERT operations by ~90% (100 machines × 1 poll/10s = 10 INSERTs/min instead of 100).

### Safety

- Batch array cleared after each INSERT to prevent memory growth
- If batch fails, individual machine data is lost (acceptable for telemetry — next poll replaces it)
- Existing try-catch wrapping handles INSERT failures gracefully

## [S4] Dashboard Redesign

### Panel 502: Ethernet/WiFi Bandwidth (Per-Interface)

**Symmetrical layout**:
- Query A (Download): Positive Mbps values, Dark Blue #1F60C4 (eth0), Purple #8E24AA (wlan0)
- Query B (Upload): Negative Mbps values (mirrored below axis), Light Blue #5794F2 (eth0), Magenta #E02F44 (wlan0)
- Y-axis: 0 in center, Download above, Upload below

**Inactive port filtering**:
- Query A: `AND (t.value->>'rx_mbps')::NUMERIC > 0` (already in place)
- Query B: `AND (t.value->>'tx_mbps')::NUMERIC > 0` (add this)

**Value mappings**: Override Upload series to show absolute values in tooltip (no negative signs).

**Overrides**:
- eth0 Download: Color #1F60C4, Fill Opacity 40%, z-index 1
- eth0 Upload: Color #5794F2, Fill Opacity 40%, z-index 1
- wlan0 Download: Color #8E24AA, Fill Opacity 40%, z-index 2
- wlan0 Upload: Color #E02F44, Fill Opacity 40%, z-index 2

## [S5] Dynamic Mock Data

### Update `monitoring/snmpsim/Netk@.snmprec`

```
# eth0: 10Gbps backbone, fluctuating 300-800 Mbps
1.3.6.1.2.1.31.1.1.1.6.1|65:numeric|min=100000000,max=5000000000,rate=45000000
1.3.6.1.2.1.31.1.1.1.10.1|65:numeric|min=50000000,max=2000000000,rate=15000000

# wlan0: WiFi, fluctuating 50-150 Mbps
1.3.6.1.2.1.31.1.1.1.6.2|65:numeric|min=10000000,max=800000000,rate=8500000
1.3.6.1.2.1.31.1.1.1.10.2|65:numeric|min=5000000,max=400000000,rate=3500000

# Temperature: breathing 65-92°C (already in place)
# eth0 flapping: rate=1 for InterfaceDown testing (already in place)
```

**Counter wrap simulation**: Reduce eth0 max to ~4.5B (below 2^32) occasionally to trigger counter wrap handling in parser. The parser already handles this with `if(rxDiff < 0) rxDiff += 18446744073709552000`.

## [S6] Security & Testing

### Security Verification

- `flows-ubuntu.json`: Uses `PGPASSWORD` env var via `passwordEnv` field — ✅ no hardcoded passwords
- Grafana dashboards: Use `${machine_id}` template variable — ✅ no hardcoded values
- `.env` and `secrets/` in `.gitignore` — ✅ credentials not committed

### Testing Plan

1. **Batch INSERT verification**: After implementation, query DB to confirm batch inserts work:
   ```sql
   SELECT COUNT(*), MIN(time), MAX(time) FROM public.machine_telemetry
   WHERE time > NOW() - INTERVAL '5 minutes';
   ```
   Expected: Multiple rows per poll cycle, all with same timestamp batch.

2. **Counter wrap test**: Verify parser handles negative diff correctly:
   - eth0 max=4.5B triggers wrap when counter exceeds 2^32
   - Parser should add 18446744073709552000 to negative diff
   - Resulting Mbps should be positive and reasonable

3. **K6 load test**: Update `tests/k6/pipeline-stress.js` to simulate 1,000 machines:
   ```bash
   k6 run tests/k6/pipeline-stress.js --env TARGET_SERVERS=1000
   ```

4. **Dashboard verification**: Import updated dashboard JSON, verify:
   - Symmetrical bandwidth display (Download above 0, Upload below 0)
   - Inactive ports hidden from view
   - Tooltip shows absolute values for Upload

## [S7] Implementation Order

1. **Mock data update** (lowest risk, immediate test value)
   - Update `Netk@.snmprec` with new counter ranges
   - Restart snmpsim, verify counters fluctuate

2. **Batch processing** (core pipeline change)
   - Modify `sre_parser` to accumulate and batch INSERT
   - Test with single machine first, then scale

3. **Dashboard redesign** (visual change)
   - Update panel 502 SQL queries and overrides
   - Verify symmetrical display and port filtering

4. **Security verification** (validation pass)
   - Confirm no hardcoded secrets
   - Run K6 load test at 1,000 machines
   - Full SRE verification protocol
