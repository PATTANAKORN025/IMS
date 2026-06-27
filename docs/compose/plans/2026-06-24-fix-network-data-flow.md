# IMS Network Data Fix — Replace Broken SNMP Walk with GET

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 0 Mbps / 0 bytes network data bug by replacing broken SNMP walker nodes with direct SNMP GET function nodes, fixing snmpsim eth0 64-bit counter gaps, and updating Grafana SQL.

**Architecture:** The SNMP `walk_net32` and `walk_net64` nodes return 0 network data because snmpsim's GETNEXT walks ALL OIDs in the file regardless of subtree. SNMP GET works perfectly. Replace the 2 broken walkers with a single function node that uses `net-snmp` GET for all network OIDs. Keep the 3 working walkers (CPU, Storage, Temp). Update Join barrier from 5 to 4. Fix parser to handle the new data format. Fix Grafana CROSS JOIN LATERAL SQL.

**Tech Stack:** Node-RED function nodes (JavaScript), net-snmp library, snmpsim .snmprec, TimescaleDB, Grafana SQL, PostgreSQL JSONB

## Global Constraints

- All objects in `public` schema only
- `flows-ubuntu.json` is source of truth; `nodered_data/flows.json` is runtime copy (gitignored)
- After editing flows, copy `nodered_data/flows.json` → `flows-ubuntu.json`
- Deploy command: `docker compose down -v && docker compose up -d`
- Database: `ims` database, user `ims_admin`, connect via PgBouncer `ims-pgbouncer:5432`
- Zero tolerance for SQL injection — always use `safeStr()` escaping
- Node-RED function nodes run in sandboxed VM — `require()` unavailable; use `global.get()` for installed packages
- **NEVER use PowerShell ConvertTo-Json to edit flows-ubuntu.json** — corrupts `\n` escape sequences
- `func` fields are single-line JSON strings — must preserve `\n` escape sequences

---

### Task 1: Fix snmpsim eth0 64-bit Counter Gap

**Covers:** Root cause — eth0 64-bit OIDs (`.31.1.1.1.6.1`, `.31.1.1.1.10.1`) return null via GET despite being in snmprec

**Files:**
- Modify: `monitoring/snmpsim/Netk@.snmprec`

**Interfaces:**
- Consumes: None
- Produces: Working eth0 64-bit counters via SNMP GET

- [ ] **Step 1: Diagnose eth0 64-bit gap**

Run from Node-RED container to confirm:
```
docker exec ims-node-red node -e "const snmp=require('net-snmp'); const s=snmp.createSession('ims-snmpsim','Netk@',{port:161,version:snmp.Version2c}); s.get(['1.3.6.1.2.1.31.1.1.1.6.1','1.3.6.1.2.1.31.1.1.1.6.2','1.3.6.1.2.1.31.1.1.1.10.1','1.3.6.1.2.1.31.1.1.1.10.2'],(e,vbs)=>{vbs.forEach(v=>console.log(v.oid+'='+v.value+' type='+v.type)); s.close();});"
```
Expected: `.6.1`=null, `.6.2`=value, `.10.1`=null, `.10.2`=value

- [ ] **Step 2: Fix snmprec eth0 64-bit entries**

Edit `monitoring/snmpsim/Netk@.snmprec`. Change the eth0 64-bit counter lines from large max values to realistic enterprise values that snmpsim can serve:

```
# eth0 RX: ~300 Mbps effective (10Gbps link, moderate load)
1.3.6.1.2.1.31.1.1.1.6.1|65:numeric|min=100000000,max=5000000000,rate=45000000
# eth0 TX: ~120 Mbps effective
1.3.6.1.2.1.31.1.1.1.10.1|65:numeric|min=50000000,max=2000000000,rate=15000000
```

Also adjust wlan0 64-bit to realistic values:
```
# wlan0 RX: ~85 Mbps effective
1.3.6.1.2.1.31.1.1.1.6.2|65:numeric|min=10000000,max=800000000,rate=8500000
# wlan0 TX: ~35 Mbps effective
1.3.6.1.2.1.31.1.1.1.10.2|65:numeric|min=5000000,max=400000000,rate=3500000
```

- [ ] **Step 3: Restart snmpsim and verify**

```bash
docker compose restart snmpsim
sleep 5
docker exec ims-node-red node -e "const snmp=require('net-snmp'); const s=snmp.createSession('ims-snmpsim','Netk@',{port:161,version:snmp.Version2c}); s.get(['1.3.6.1.2.1.31.1.1.1.6.1','1.3.6.1.2.1.31.1.1.1.6.2','1.3.6.1.2.1.31.1.1.1.10.1','1.3.6.1.2.1.31.1.1.1.10.2'],(e,vbs)=>{vbs.forEach(v=>console.log(v.oid+'='+v.value+' type='+v.type)); s.close();});"
```
Expected: All 4 OIDs return numeric values (type 65), none null

- [ ] **Step 4: Commit**

```bash
git add monitoring/snmpsim/Netk@.snmprec
git commit -m "fix(snmpsim): reduce eth0 64-bit counter range to fix null GET responses"
```

---

### Task 2: Replace Broken SNMP Walker Nodes with SNMP GET Function Node

**Covers:** Root cause — `walk_net32` and `walk_net64` return 0 network data because snmpsim GETNEXT ignores subtree boundaries

**Files:**
- Modify: `flows-ubuntu.json` (source of truth)
- Modify: `nodered_data/flows.json` (runtime copy)

**Interfaces:**
- Consumes: None
- Produces: Network data as `msg.payload` array with items like `{oid: "...", value: ...}` — same format as snmp walker output

- [ ] **Step 1: Create the SNMP GET function node code**

The new function node `walk_network` replaces both `walk_net32` and `walk_net64`. It uses `net-snmp` library (already installed in Node-RED container) to do direct SNMP GET for all network OIDs:

```javascript
const snmp = global.get('net-snmp') || require('net-snmp');
const host = 'ims-snmpsim';
const community = 'Netk@';

const oids = [
    // Interface names
    '1.3.6.1.2.1.2.2.1.2.1',   // eth0
    '1.3.6.1.2.1.2.2.1.2.2',   // wlan0
    // Interface speed
    '1.3.6.1.2.1.2.2.1.5.1',
    '1.3.6.1.2.1.2.2.1.5.2',
    // 64-bit RX
    '1.3.6.1.2.1.31.1.1.1.6.1',
    '1.3.6.1.2.1.31.1.1.1.6.2',
    // 64-bit TX
    '1.3.6.1.2.1.31.1.1.1.10.1',
    '1.3.6.1.2.1.31.1.1.1.10.2',
    // 32-bit RX
    '1.3.6.1.2.1.2.2.1.10.1',
    '1.3.6.1.2.1.2.2.1.10.2',
    // 32-bit TX
    '1.3.6.1.2.1.2.2.1.16.1',
    '1.3.6.1.2.1.2.2.1.16.2',
    // Errors
    '1.3.6.1.2.1.2.2.1.14.1',
    '1.3.6.1.2.1.2.2.1.14.2',
    // Drops
    '1.3.6.1.2.1.2.2.1.13.1',
    '1.3.6.1.2.1.2.2.1.13.2',
    // Status
    '1.3.6.1.2.1.2.2.1.8.1',
    '1.3.6.1.2.1.2.2.1.8.2'
];

const session = snmp.createSession(host, community, {
    port: 161,
    version: snmp.Version2c,
    retries: 1,
    timeout: 3000
});

session.get(oids, function(error, varbinds) {
    session.close();
    if (error) {
        node.warn('Network SNMP GET failed: ' + error.toString());
        msg.payload = [];
        return msg;
    }
    const results = [];
    varbinds.forEach(function(vb) {
        results.push({ oid: vb.oid, value: vb.value, type: vb.type });
    });
    msg.payload = results;
    return msg;
});
```

- [ ] **Step 2: Edit flows-ubuntu.json to add walk_network node**

Add a new function node `walk_network` with id `walk_network` in the same tab. Wire it from `fork_5_ways` output index 3 (was `walk_net64`) — but actually, we need to restructure:

1. Change `fork_5_ways` outputs from 5 to 3: CPU, Storage, Network (replaces net32+net64)
2. Remove `walk_net32` and `walk_net64` nodes
3. Add `walk_network` function node (as described above)
4. Change `join_sync` count from 5 to 4 (CPU, Storage, Network, Temp)
5. Wire: `fork_5_ways` outputs → [walk_cpu, walk_storage, walk_network, walk_temp]
6. All 4 walkers → `join_sync` → `sre_parser`

Use the Edit tool on `flows-ubuntu.json` to make these changes. Do NOT use PowerShell ConvertTo-Json.

The `fork_5_ways` node needs to output 4 messages (CPU, Storage, Network, Temp) instead of 5. Update its `func`:

```javascript
const mid = msg.machine_id || msg.topic;
return [
    { machine_id: mid, topic: mid, _walker: 'cpu', payload: '' },
    { machine_id: mid, topic: mid, _walker: 'storage', payload: '' },
    { machine_id: mid, topic: mid, _walker: 'network', payload: '' },
    { machine_id: mid, topic: mid, _walker: 'temp', payload: '' }
];
```

And set `"outputs": 4` with wires going to `[walk_cpu], [walk_storage], [walk_network], [walk_temp]`.

- [ ] **Step 3: Update Join barrier count**

Change `join_sync` node: `"count": "4"` (was "5")

- [ ] **Step 4: Copy flows to runtime and restart**

```bash
Copy-Item nodered_data\flows.json flows-ubuntu.json
docker compose restart node-red
```

Wait 10 seconds, then check Node-RED logs for errors:
```bash
docker logs ims-node-red --tail 20
```
Expected: No SyntaxError, flows started successfully

- [ ] **Step 5: Verify network SNMP GET returns data**

```bash
docker exec ims-node-red node -e "const snmp=require('net-snmp'); const s=snmp.createSession('ims-snmpsim','Netk@',{port:161,version:snmp.Version2c}); s.get(['1.3.6.1.2.1.2.2.1.10.1','1.3.6.1.2.1.2.2.1.16.1','1.3.6.1.2.1.31.1.1.1.6.1','1.3.6.1.2.1.31.1.1.1.6.2'],(e,vbs)=>{vbs.forEach(v=>console.log(v.oid+'='+v.value)); s.close();});"
```
Expected: All return numeric values, no null

- [ ] **Step 6: Commit**

```bash
git add flows-ubuntu.json
git commit -m "fix(node-red): replace broken SNMP walkers with direct GET for network counters"
```

---

### Task 3: Update Parser to Handle New Network Data Format

**Covers:** Parser needs to process SNMP GET results from the new `walk_network` node

**Files:**
- Modify: `flows-ubuntu.json` (sre_parser function node)

**Interfaces:**
- Consumes: Network data as `{oid: "...", value: ...}` array from `walk_network`
- Produces: `msg.query` with INSERT SQL, `msg.payload` with telemetry summary

- [ ] **Step 1: Read current parser code**

The parser at `flows-ubuntu.json` line 268 (id: `sre_parser`) already handles `{oid, value}` format from snmp walker nodes. The new `walk_network` function node returns the SAME format. So the parser's OID matching logic (`oid.startsWith(...)`) should work unchanged.

The key difference: the new `walk_network` returns 18 OIDs (all network data) in one batch, while the old walkers returned mixed/wrong data.

Verify the parser's network OID matching handles all 18 OIDs:
- `1.3.6.1.2.1.31.1.1.1.6.` → rx64 ✓
- `1.3.6.1.2.1.31.1.1.1.10.` → tx64 ✓
- `1.3.6.1.2.1.2.2.1.2.` → name ✓
- `1.3.6.1.2.1.2.2.1.10.` → rx32 ✓
- `1.3.6.1.2.1.2.2.1.16.` → tx32 ✓
- `1.3.6.1.2.1.2.2.1.14.` → errors ✓
- `1.3.6.1.2.1.2.2.1.13.` → drops ✓
- `1.3.6.1.2.1.2.2.1.8.` → status ✓

No parser changes needed for OID matching — the existing code handles the format correctly.

- [ ] **Step 2: Verify parser Mbps calculation logic**

The parser's Mbps calculation:
```javascript
const now = Date.now();
const prevIfaces = JSON.parse(JSON.stringify(flow.get('ifaces_prev_'+mid) || {}));
const prevTs = flow.get('ts_prev_'+mid) || (now - 10000);
const elapsedSec = (now - prevTs) / 1000;
```

On first poll: `prevIfaces` is `{}`, so `prevIfaces[idx]` is undefined → rxMbps=0 (expected, no previous data)
On second poll: `prevIfaces` has data from first poll → calculation works

The Mbps formula: `((rxDiff * 8) / (elapsedSec * 1000000)).toFixed(2)` converts bytes to Mbps.

With 32-bit counters at rate=1500000 bytes/sec:
- rxDiff ≈ 1500000 * 10 = 15000000 bytes per 10s poll
- rxMbps = (15000000 * 8) / (10 * 1000000) = 12 Mbps

With 64-bit counters at rate=45000000 bytes/sec:
- rxDiff ≈ 45000000 * 10 = 450000000 bytes per 10s poll
- rxMbps = (450000000 * 8) / (10 * 1000000) = 360 Mbps

Both should produce non-zero values. The parser logic is correct.

- [ ] **Step 3: Commit (no changes needed)**

If parser code is unchanged, skip this commit. Only commit if parser modifications were needed.

---

### Task 4: Full System Validation

**Covers:** Verify end-to-end data flow: SNMP → Node-RED → DB → Grafana

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: All previous task outputs
- Produces: Verified working system

- [ ] **Step 1: Clean restart**

```bash
docker compose down -v && docker compose up -d
```

Wait 40 seconds for all services to initialize.

- [ ] **Step 2: Verify containers are healthy**

```bash
docker compose ps
```
Expected: All 8 containers Up/healthy

- [ ] **Step 3: Verify Node-RED logs**

```bash
docker logs ims-node-red --tail 30
```
Expected: No SyntaxError, "Started flows" message

- [ ] **Step 4: Verify database has data with non-zero network counters**

```bash
docker exec ims-timescaledb psql -U ims_admin -d ims -c "SELECT time, machine_id, rx_mbps, tx_mbps, net_rx_bytes, interface_metrics FROM public.machine_telemetry ORDER BY time DESC LIMIT 5;"
```
Expected:
- `rx_mbps` > 0 (not 0)
- `net_rx_bytes` > 0 (not 0)
- `interface_metrics` contains eth0 and wlan0 with non-zero rx_mbps/tx_mbps

- [ ] **Step 5: Verify interface_metrics JSONB is queryable**

```bash
docker exec ims-timescaledb psql -U ims_admin -d ims -c "SELECT interface_metrics->'eth0'->>'rx_mbps' as eth0_rx, interface_metrics->'wlan0'->>'rx_mbps' as wlan0_rx FROM public.machine_telemetry ORDER BY time DESC LIMIT 3;"
```
Expected: Non-zero numeric values for eth0_rx and wlan0_rx

- [ ] **Step 6: Verify continuous aggregates populate**

Wait 3 minutes, then:
```bash
docker exec ims-timescaledb psql -U ims_admin -d ims -c "SELECT bucket, machine_id, avg_rx_mbps FROM public.telemetry_minute_summary ORDER BY bucket DESC LIMIT 5;"
```
Expected: Non-zero avg_rx_mbps values

- [ ] **Step 7: Verify Grafana dashboard panel 502 (Bandwidth)**

The panel SQL should use CROSS JOIN LATERAL:
```sql
SELECT 
  mt."time", 
  t.iface || ' Download' AS metric, 
  (t.value->>'rx_mbps')::NUMERIC AS "Mbps" 
FROM public.machine_telemetry mt 
CROSS JOIN LATERAL jsonb_each_text(mt.interface_metrics) t(iface, value) 
WHERE $__timeFilter(mt."time") 
  AND mt.machine_id = '${machine_id}' 
  AND t.iface IN ('eth0', 'wlan0') 
UNION ALL 
SELECT 
  mt."time", 
  t.iface || ' Upload' AS metric, 
  ((t.value->>'tx_mbps')::NUMERIC * -1) AS "Mbps" 
FROM public.machine_telemetry mt 
CROSS JOIN LATERAL jsonb_each_text(mt.interface_metrics) t(iface, value) 
WHERE $__timeFilter(mt."time") 
  AND mt.machine_id = '${machine_id}' 
  AND t.iface IN ('eth0', 'wlan0') 
ORDER BY 1;
```

Verify in Grafana UI at http://localhost:3000 → IMS Engineering Drill-Down → Ethernet/WiFi Bandwidth panel shows non-zero curves.

- [ ] **Step 8: Verify Alertmanager webhook**

```bash
docker logs ims-node-red --tail 10 | Select-String "alert-webhook"
```
Expected: Alert formatting working (if any alerts fire)

- [ ] **Step 9: Final commit with all changes**

```bash
git add -A
git commit -m "fix(ims): resolve 0 Mbps bug - replace broken SNMP walks with GET, fix snmpsim counters"
```
