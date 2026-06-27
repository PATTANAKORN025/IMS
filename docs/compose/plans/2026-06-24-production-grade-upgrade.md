# Production-Grade Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade IMS monitoring stack with batch processing, symmetrical dashboard, and realistic mock data for 1,000-machine scale.

**Architecture:** Node-RED accumulates telemetry per poll cycle and batch-INSERTs. Dashboard panel 502 redesigned for symmetrical bandwidth display with inactive port filtering. SNMP simulator updated with realistic accumulating counters.

**Tech Stack:** Node-RED (function nodes), PostgreSQL/TimescaleDB, Grafana (JSON dashboards), snmpsim, K6

## Global Constraints

- All objects in `public` schema only — no `ims.*` schema divergence
- `flows-ubuntu.json` is source of truth; `nodered_data/flows.json` is runtime copy
- After editing flows: copy `flows-ubuntu.json` → `nodered_data/flows.json`, restart Node-RED
- DO NOT use PowerShell `ConvertTo-Json` to edit flows — corrupts `\n` escape sequences
- Node-RED function `func` fields are single-line JSON strings — preserve `\n` escapes
- PostgreSQL `ROUND()` only accepts `NUMERIC`, not `DOUBLE PRECISION` — cast with `::NUMERIC`
- PgBouncer uses `transaction` pooling mode — no prepared statements
- All blackbox targets use Docker SERVICE names (`blackbox-exporter:9115`)

---

### Task 1: Update SNMP Simulator Counter Ranges

**Covers:** [S5]

**Files:**
- Modify: `monitoring/snmpsim/Netk@.snmprec` (lines 31-37)

**Interfaces:**
- Consumes: none (first task)
- Produces: Realistic counter ranges for eth0/wlan0 that test parser's counter-wrap handling

- [ ] **Step 1: Read current snmpsim config**

```bash
Get-Content monitoring\snmpsim\Netk@.snmprec
```

Verify current state: eth0 RX max=80000000000, eth0 TX max=50000000000

- [ ] **Step 2: Update counter ranges**

Edit `monitoring/snmpsim/Netk@.snmprec` — replace lines 31-37:

```
# --- 64-BIT NETWORK COUNTERS (Enterprise Grade Fluctuation) ---
# eth0 (Core Switch) - 300-800 Mbps fluctuation
1.3.6.1.2.1.31.1.1.1.6.1|65:numeric|min=100000000,max=5000000000,rate=45000000
1.3.6.1.2.1.31.1.1.1.10.1|65:numeric|min=50000000,max=2000000000,rate=15000000
# wlan0 (IoT WiFi) - 50-150 Mbps fluctuation
1.3.6.1.2.1.31.1.1.1.6.2|65:numeric|min=10000000,max=800000000,rate=8500000
1.3.6.1.2.1.31.1.1.1.10.2|65:numeric|min=5000000,max=400000000,rate=3500000
```

- [ ] **Step 3: Restart snmpsim and verify**

```bash
docker compose restart snmpsim
Start-Sleep -Seconds 10
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT rx_mbps, tx_mbps FROM public.machine_telemetry ORDER BY time DESC LIMIT 3;"
```

Expected: rx_mbps ~300-800, tx_mbps ~100-400 (values fluctuate between polls)

- [ ] **Step 4: Commit**

```bash
git add monitoring/snmpsim/Netk@.snmprec
git commit -m "feat: update snmpsim counters for realistic 300-800 Mbps fluctuation"
```

---

### Task 2: Modify Parser for Batch Processing

**Covers:** [S3]

**Files:**
- Modify: `flows-ubuntu.json` — `sre_parser` function node (line 229, `func` field)

**Interfaces:**
- Consumes: SNMP GET data from 4-thread walker (existing)
- Produces: Batch INSERT via `msg.query` and `msg.params` with multiple VALUES rows

- [ ] **Step 1: Read current parser code**

```bash
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('flows-ubuntu.json','utf8'));const p=j.find(n=>n.id==='sre_parser');console.log(p.func)"
```

Verify current structure: try-catch wrapping, parameterized INSERT with $1..$19

- [ ] **Step 2: Modify parser for batch accumulation**

Edit `flows-ubuntu.json` — find the `sre_parser` node and replace the `func` field content.

The new parser must:
1. Keep existing OID parsing logic unchanged
2. After calculating per-machine data, append to batch array instead of immediate INSERT
3. When batch array has data, build multi-row INSERT and send

**New parser code** (single-line JSON string with `\n` escapes):

```javascript
try {
if (!msg.payload || !Array.isArray(msg.payload)) return null;

const flatData = msg.payload.flat();
msg.payload = null;

let cpuTotal=0, coreCount=0;
let ramTotalMB=0, ramUsedMB=0, diskTotalGB=0, diskUsedGB=0;
let netRxBytes=0, netTxBytes=0, netRxErrors=0, netRxDrops=0, netIfStatus=1, maxTemp=0;
const disks={}, ifaces={};

for (let i = 0; i < flatData.length; i++) {
    const item = flatData[i];
    if (!item || !item.oid) continue;
    const oid = String(item.oid);
    const val = item.value;
    
    if (oid.startsWith('1.3.6.1.2.1.25.3.3.1.2.')) { const v = Number(val); if(Number.isFinite(v)){ cpuTotal+=v; coreCount++; } continue; }
    
    if (oid.startsWith('1.3.6.1.2.1.25.2.3.1.')) {
        const parts = oid.split('.'); const idx = parts.pop(); const mt = parts.pop();
        if (!disks[idx]) disks[idx] = { type: '', descr: '', au: 0, size: 0, used: 0 };
        if (mt === '2') disks[idx].type = String(val);
        else if (mt === '3') disks[idx].descr = String(val).toUpperCase();
        else if (mt === '4') disks[idx].au = Number(val) || 0;
        else if (mt === '5') disks[idx].size = Number(val) || 0;
        else if (mt === '6') disks[idx].used = Number(val) || 0;
        continue;
    }
    
    if (oid.startsWith('1.3.6.1.2.1.31.1.1.1.6.')) { const idx=oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].rx64=Number(val)||0; netRxBytes+=ifaces[idx].rx64; continue; }
    if (oid.startsWith('1.3.6.1.2.1.31.1.1.1.10.')){ const idx=oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].tx64=Number(val)||0; netTxBytes+=ifaces[idx].tx64; continue; }
    
    if (oid.startsWith('1.3.6.1.2.1.2.2.1.2.')) { const idx=oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'',rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].name=String(val); continue; }
    if (oid.startsWith('1.3.6.1.2.1.2.2.1.10.')) { const idx=oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].rx32=Number(val)||0; if(netRxBytes===0) netRxBytes+=ifaces[idx].rx32; continue; }
    if (oid.startsWith('1.3.6.1.2.1.2.2.1.16.')) { const idx=oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].tx32=Number(val)||0; if(netTxBytes===0) netTxBytes+=ifaces[idx].tx32; continue; }
    
    if (oid.startsWith('1.3.6.1.2.1.2.2.1.14.')) { const idx=oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].err+=Number(val)||0; netRxErrors+=Number(val)||0; continue; }
    if (oid.startsWith('1.3.6.1.2.1.2.2.1.13.')) { const idx=oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].drop+=Number(val)||0; netRxDrops+=Number(val)||0; continue; }
    if (oid.startsWith('1.3.6.1.2.1.2.2.1.8.')) { const idx=oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; const st=Number(val); if(st===2){ ifaces[idx].status=2; netIfStatus=2; } continue; }
    
    if (oid.startsWith('1.3.6.1.4.1.2021.13.16.2.1.7.')) { const t = Number(val); if (Number.isFinite(t)) maxTemp = t; }
}

flatData.length = 0;

for (const idx in disks) {
    const d = disks[idx];
    if (!d.au || !d.size) continue;
    const sb = d.size * d.au, ub = d.used * d.au, ds = d.descr;
    if (d.type.includes('25.2.1.2') || ds.includes('MEMORY')) { ramTotalMB += sb / 1048576; ramUsedMB += ub / 1048576; }
    else if (d.type.includes('25.2.1.4') || ds.includes('C:') || ds.includes('/')) { diskTotalGB += sb / 1073741824; diskUsedGB += ub / 1073741824; }
}

const mid = (msg.machine_id || msg.topic || '').replace(/'/g, "''");
if (!mid) {
    node.warn("Pipeline dropped: Missing machine_id");
    return null; 
}

const now = Date.now();
const prevIfaces = JSON.parse(JSON.stringify(flow.get('ifaces_prev_'+mid) || {}));
const prevTs = flow.get('ts_prev_'+mid) || (now - 10000);
const elapsedSec = (now - prevTs) / 1000;
const finalIfaces = {};
let rxAll = 0, txAll = 0;

for(const idx in ifaces){
    const iface=ifaces[idx]; 
    let rxMbps=0, txMbps=0;
    if(iface.status === 2) { 
        rxMbps=0; txMbps=0; 
    }
    else if(elapsedSec > 0 && prevIfaces[idx]) {
        const rx = iface.rx64 || iface.rx32; const tx = iface.tx64 || iface.tx32;
        const prevRx = prevIfaces[idx].rx64 || prevIfaces[idx].rx32; 
        const prevTx = prevIfaces[idx].tx64 || prevIfaces[idx].tx32;
        
        let rxDiff = rx - prevRx; let txDiff = tx - prevTx;
        
        if(rxDiff < 0) rxDiff += 18446744073709552000; if(txDiff < 0) txDiff += 18446744073709552000; rxMbps = Number(((rxDiff*8)/(elapsedSec*1000000)).toFixed(2)); txMbps = Number(((txDiff*8)/(elapsedSec*1000000)).toFixed(2)); if (!Number.isFinite(rxMbps) || rxMbps < 0) rxMbps = 0; if (!Number.isFinite(txMbps) || txMbps < 0) txMbps = 0;
    }
    finalIfaces[iface.name||'port_'+idx] = { rx_mbps:rxMbps, tx_mbps:txMbps, errors:iface.err, drops:iface.drop, status:iface.status===1?'UP':'DOWN' };
    rxAll += rxMbps; txAll += txMbps;
}

flow.set('ifaces_prev_'+mid, JSON.parse(JSON.stringify(ifaces)));
flow.set('ts_prev_'+mid, now);

const ts = new Date().toISOString();
const row = [
    ts, mid, coreCount,
    coreCount > 0 ? Number((cpuTotal/coreCount).toFixed(2)) : 0,
    Number(ramTotalMB.toFixed(2)), Number(ramUsedMB.toFixed(2)), Number((ramTotalMB - ramUsedMB).toFixed(2)),
    Number(diskTotalGB.toFixed(2)), Number(diskUsedGB.toFixed(2)), Number((diskTotalGB - diskUsedGB).toFixed(2)),
    netRxBytes, netTxBytes, netRxErrors, netRxDrops,
    netIfStatus, maxTemp, Number(rxAll.toFixed(2)), Number(txAll.toFixed(2)),
    finalIfaces
];

// Batch accumulation
const batchKey = 'insert_batch';
let batch = JSON.parse(JSON.stringify(flow.get(batchKey) || []));
batch.push(row);

// Send batch when we have data (one row per machine per poll cycle)
if (batch.length > 0) {
    const valuePlaceholders = batch.map((_, i) => {
        const base = i * 19;
        return '(' + Array.from({length: 19}, (_, j) => '$' + (base + j + 1)).join(',') + ')';
    }).join(',');
    
    msg.query = 'INSERT INTO public.machine_telemetry ("time", machine_id, cpu_cores, cpu_load_percent, ram_total_mb, ram_used_mb, ram_free_mb, disk_total_gb, disk_used_gb, disk_free_gb, net_rx_bytes, net_tx_bytes, net_rx_errors, net_rx_drops, net_if_status, temp_c, rx_mbps, tx_mbps, interface_metrics) VALUES ' + valuePlaceholders;
    
    msg.params = batch.flat();
    flow.set(batchKey, []);
    
    msg.payload = { machine_id: mid, ts: ts, rxMbps: rxAll, errors: netRxErrors, status: netIfStatus, temp: maxTemp };
    return msg;
}

return null;

} catch (err) {
    node.error('SRE Parser Crash: ' + err.message, msg);
    return null;
}
```

- [ ] **Step 3: Validate JSON syntax**

```bash
node -e "const fs=require('fs');JSON.parse(fs.readFileSync('flows-ubuntu.json','utf8'));console.log('VALID JSON')"
```

Expected: `VALID JSON`

- [ ] **Step 4: Sync flows and restart Node-RED**

```bash
Copy-Item "flows-ubuntu.json" "nodered_data\flows.json" -Force
docker compose restart node-red
```

- [ ] **Step 5: Verify batch INSERT working**

```bash
Start-Sleep -Seconds 30
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT COUNT(*), MIN(time), MAX(time) FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '2 minutes';"
```

Expected: Count > 0, MIN and MAX time within 2 minutes

- [ ] **Step 6: Commit**

```bash
git add flows-ubuntu.json
git commit -m "feat: batch INSERT processing in sre_parser for reduced DB overhead"
```

---

### Task 3: Update Dashboard Panel 502

**Covers:** [S4]

**Files:**
- Modify: `monitoring/grafana/dashboards/ims-engineering-drilldown.json` (panel 502, lines 560-741)

**Interfaces:**
- Consumes: batch INSERT data from Task 2
- Produces: Symmetrical bandwidth display with inactive port filtering

- [ ] **Step 1: Read current panel 502**

```bash
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('monitoring/grafana/dashboards/ims-engineering-drilldown.json','utf8'));const p=j.panels.find(n=>n.id===502);console.log(JSON.stringify(p,null,2))"
```

Verify current state: panel has CROSS JOIN LATERAL query, SRE color overrides

- [ ] **Step 2: Update panel 502 SQL queries**

Edit `monitoring/grafana/dashboards/ims-engineering-drilldown.json` — find panel with `"id": 502` and update the `targets` array.

**Query A (Download)** — keep existing but ensure `rx_mbps > 0` filter:
```sql
SELECT 
  mt."time", 
  t.key || ' Download' AS metric, 
  (t.value->>'rx_mbps')::NUMERIC AS "Mbps"
FROM public.machine_telemetry mt
CROSS JOIN LATERAL jsonb_each(mt.interface_metrics) AS t(key, value)
WHERE $__timeFilter(mt."time") 
  AND mt.machine_id = '${machine_id}'
  AND (t.value->>'rx_mbps')::NUMERIC > 0
ORDER BY 1
```

**Query B (Upload)** — add `tx_mbps > 0` filter for inactive port filtering:
```sql
SELECT 
  mt."time", 
  t.key || ' Upload' AS metric, 
  ((t.value->>'tx_mbps')::NUMERIC * -1) AS "Mbps"
FROM public.machine_telemetry mt
CROSS JOIN LATERAL jsonb_each(mt.interface_metrics) AS t(key, value)
WHERE $__timeFilter(mt."time") 
  AND mt.machine_id = '${machine_id}'
  AND (t.value->>'tx_mbps')::NUMERIC > 0
ORDER BY 1
```

- [ ] **Step 3: Update panel overrides for symmetrical display**

Verify overrides in panel 502 `fieldConfig.overrides`:
- eth0 Download: Color #1F60C4, Fill Opacity 40%, z-index 1
- eth0 Upload: Color #5794F2, Fill Opacity 40%, z-index 1
- wlan0 Download: Color #8E24AA, Fill Opacity 40%, z-index 2
- wlan0 Upload: Color #E02F44, Fill Opacity 40%, z-index 2

- [ ] **Step 4: Validate JSON syntax**

```bash
node -e "const fs=require('fs');JSON.parse(fs.readFileSync('monitoring/grafana/dashboards/ims-engineering-drilldown.json','utf8'));console.log('VALID JSON')"
```

Expected: `VALID JSON`

- [ ] **Step 5: Commit**

```bash
git add monitoring/grafana/dashboards/ims-engineering-drilldown.json
git commit -m "feat: symmetrical bandwidth dashboard with inactive port filtering"
```

---

### Task 4: Full System Verification

**Covers:** [S6, S7]

**Files:**
- No file modifications — verification only

**Interfaces:**
- Consumes: All changes from Tasks 1-3
- Produces: Verified working system

- [ ] **Step 1: Clean restart**

```bash
docker compose down -v && docker compose up -d
```

- [ ] **Step 2: Wait for full startup**

```bash
Start-Sleep -Seconds 40
```

- [ ] **Step 3: Verify all containers running**

```bash
docker compose ps --format "table {{.Name}}\t{{.Status}}"
```

Expected: All 8 containers show `Up` or `healthy`

- [ ] **Step 4: Verify data flowing**

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, COUNT(*) as rows, MAX(time) as latest FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"
```

Expected: Row count > 0, latest within 30 seconds

- [ ] **Step 5: Verify batch INSERT**

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT COUNT(*), MIN(time), MAX(time) FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '2 minutes';"
```

Expected: Multiple rows per poll cycle

- [ ] **Step 6: Verify counter values**

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT rx_mbps, tx_mbps, temp_c FROM public.machine_telemetry ORDER BY time DESC LIMIT 3;"
```

Expected: rx_mbps ~300-800, tx_mbps ~100-400, temp_c 65-92

- [ ] **Step 7: Verify Prometheus targets**

```bash
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/targets" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);const down=j.data.activeTargets.filter(t=>t.health!=='up');console.log('DOWN:',down.length);console.log('UP:',j.data.activeTargets.filter(t=>t.health==='up').length)"
```

Expected: DOWN: 0, UP: 12

- [ ] **Step 8: Verify Grafana dashboard**

```bash
docker compose exec grafana curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
```

Expected: 200

- [ ] **Step 9: Run K6 load test**

```bash
k6 run tests/k6/pipeline-stress.js --env TARGET_SERVERS=100
```

Expected: Success rate > 95%

- [ ] **Step 10: Final SRE verification**

```bash
docker compose logs --tail=20 node-red 2>&1 | Select-String -Pattern "error|Error|ERROR" -NotMatch
```

Expected: No error messages

- [ ] **Step 11: Commit verification results**

```bash
git add -A
git commit -m "chore: production-grade upgrade verification complete"
```
