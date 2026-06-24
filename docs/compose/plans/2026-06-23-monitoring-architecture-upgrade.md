# Monitoring Architecture Upgrade Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/monitoring-architecture-upgrade.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade IMS monitoring system with jitter protection, semantic color hierarchy, and comprehensive alert inhibition rules

**Architecture:** Replace Node-RED function node with enhanced Flawless Walker Engine, update all Grafana dashboards with semantic colors, and replace Alertmanager inhibition rules

**Tech Stack:** Node-RED, Grafana, Alertmanager, TimescaleDB, PostgreSQL

## Global Constraints

- Node-RED flows.json must be valid JSON after modification
- Grafana dashboard JSON must be valid and importable
- Alertmanager YAML must be valid syntax
- All changes must maintain backward compatibility with existing telemetry data
- Database schema remains unchanged (machine_telemetry table)

---

### Task 1: Update Node-RED Function Node

**Covers:** Phase 1 - Jitter Protection + Context-Aware Logic

**Files:**
- Modify: `nodered_data/flows.json:82-103`

**Interfaces:**
- Consumes: SNMP data from inject nodes (machine_id, payload)
- Produces: Enhanced telemetry with jitter protection, status-aware bandwidth

- [ ] **Step 1: Read current flows.json**

```bash
cat nodered_data/flows.json
```

- [ ] **Step 2: Replace function node code**

Replace the `func` property in the `parsing_core` node with the new enhanced code:

```javascript
if (!msg.payload || !Array.isArray(msg.payload)) return null;
const flatData = msg.payload.flat();

let cpuTotal=0, coreCount=0;
let ramTotalMB=0, ramUsedMB=0;
let diskTotalGB=0, diskUsedGB=0;
let netRxBytes=0, netTxBytes=0;
let netRxErrors=0, netRxDrops=0;
let netIfStatus=1;
let maxTemp=0;
const disks={}, ifaces={};
const len=flatData.length;

// O(N) Extreme Processing
for(let i=0; i<len; i++){
    const item=flatData[i];
    if(!item||!item.oid) continue;

    // CPU
    if(item.oid.indexOf('.25.3.3.1.2.')!==-1){ const val=Number(item.value); if(Number.isFinite(val)){cpuTotal+=val; coreCount++;} continue; }
    
    // Storage
    if(item.oid.indexOf('.25.2.3.1.')!==-1){
        const parts=item.oid.split('.'); const idx=parts.pop(); const mt=parts.pop();
        if(!disks[idx]) disks[idx]={type:'',descr:'',au:0,size:0,used:0};
        if(mt==='2') disks[idx].type=String(item.value);
        if(mt==='3') disks[idx].descr=String(item.value).toUpperCase();
        if(mt==='4') disks[idx].au=Number(item.value)||0;
        if(mt==='5') disks[idx].size=Number(item.value)||0;
        if(mt==='6') disks[idx].used=Number(item.value)||0;
        continue;
    }
    
    // Network 64-bit Priority & 32-bit Fallback
    if(item.oid.indexOf('.2.2.1.2.')!==-1){ const idx=item.oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'',rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].name=String(item.value); continue; }
    if(item.oid.indexOf('.31.1.1.1.6.')!==-1){ const idx=item.oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].rx64=Number(item.value)||0; netRxBytes+=ifaces[idx].rx64; continue; }
    if(item.oid.indexOf('.31.1.1.1.10.')!==-1){ const idx=item.oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].tx64=Number(item.value)||0; netTxBytes+=ifaces[idx].tx64; continue; }
    if(item.oid.indexOf('.2.2.1.10.')!==-1){ const idx=item.oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].rx32=Number(item.value)||0; if(netRxBytes===0) netRxBytes+=ifaces[idx].rx32; continue; }
    if(item.oid.indexOf('.2.2.1.16.')!==-1){ const idx=item.oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].tx32=Number(item.value)||0; if(netTxBytes===0) netTxBytes+=ifaces[idx].tx32; continue; }
    
    // Network Health
    if(item.oid.indexOf('.2.2.1.14.')!==-1){ const idx=item.oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].err+=Number(item.value)||0; netRxErrors+=Number(item.value)||0; continue; }
    if(item.oid.indexOf('.2.2.1.13.')!==-1){ const idx=item.oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; ifaces[idx].drop+=Number(item.value)||0; netRxDrops+=Number(item.value)||0; continue; }
    if(item.oid.indexOf('.2.2.1.8.')!==-1){ const idx=item.oid.split('.').pop(); if(!ifaces[idx]) ifaces[idx]={name:'port_'+idx,rx64:0,tx64:0,rx32:0,tx32:0,err:0,drop:0,status:1}; const st=Number(item.value); if(st===2){ ifaces[idx].status=2; netIfStatus=2; } continue; }
    
    // Temperature
    if(item.oid.indexOf('.13.16.2.1.7.')!==-1){ const t=Number(item.value); if(Number.isFinite(t)&&t>maxTemp) maxTemp=t; }
}

// Memory Cleanup!
flatData.length = 0;

for(const idx in disks){
    const d=disks[idx]; if(!d.au||!d.size) continue;
    const sb=d.size*d.au, ub=d.used*d.au, ds=d.descr;
    if(d.type.includes('25.2.1.2')||ds.includes('MEMORY')){ ramTotalMB+=sb/1048576; ramUsedMB+=ub/1048576; }
    else if(d.type.includes('25.2.1.4')||ds.indexOf('C:')!==-1||ds.indexOf('/')!==-1){ diskTotalGB+=sb/1073741824; diskUsedGB+=ub/1073741824; }
}

const now = Date.now();
const mid = msg.machine_id || 'unknown';
const prevIfaces = flow.get('ifaces_prev_'+mid) || {};
const prevTs = flow.get('ts_prev_'+mid) || (now - 10000);
const elapsedSec = (now - prevTs) / 1000;
const finalIfaces = {};

let rxAll = 0, txAll = 0;

for(const idx in ifaces){
    const iface = ifaces[idx]; 
    let rxMbps = 0, txMbps = 0;
    
    // Jitter Protection & Status Logic
    if(iface.status === 2) {
        rxMbps = 0; txMbps = 0;
    } else if(elapsedSec >= 2 && prevIfaces[idx]) {
        const rx = iface.rx64 || iface.rx32; 
        const tx = iface.tx64 || iface.tx32;
        const prevRx = prevIfaces[idx].rx64 || prevIfaces[idx].rx32; 
        const prevTx = prevIfaces[idx].tx64 || prevIfaces[idx].tx32;
        
        let rxDiff = rx - prevRx; 
        let txDiff = tx - prevTx;
        
        if(rxDiff < 0) rxDiff += 18446744073709551616n;
        if(txDiff < 0) txDiff += 18446744073709551616n;
        
        rxMbps = Number(((rxDiff * 8) / (elapsedSec * 1000000)).toFixed(2));
        txMbps = Number(((txDiff * 8) / (elapsedSec * 1000000)).toFixed(2));
    } else if (prevIfaces[idx]) {
        rxMbps = prevIfaces[idx].rx_mbps || 0;
        txMbps = prevIfaces[idx].tx_mbps || 0;
    }

    finalIfaces[iface.name||'port_'+idx] = { 
        rx_mbps: rxMbps, tx_mbps: txMbps, 
        errors: iface.err, drops: iface.drop, 
        status: iface.status === 1 ? 'UP' : 'DOWN',
        speed_mbps: iface.rx64 > 0 ? 10000 : 1200
    };
    rxAll += rxMbps;
    txAll += txMbps;
}

flow.set('ifaces_prev_'+mid, ifaces);
flow.set('ts_prev_'+mid, now);

const safeNum = (v) => Number.isFinite(v) && v >= 0 && v < 1e15 ? Number(v.toFixed(2)) : 0;
const safeStr = (v) => String(v).replace(/'/g, "''");
const ts = new Date().toISOString();
const midS = safeStr(mid);
const ifaceJson = safeStr(JSON.stringify(finalIfaces));

msg.query=`INSERT INTO public.machine_telemetry("time",machine_id,cpu_cores,cpu_load_percent,ram_total_mb,ram_used_mb,ram_free_mb,disk_total_gb,disk_used_gb,disk_free_gb,net_rx_bytes,net_tx_bytes,net_rx_errors,net_rx_drops,net_if_status,temp_c,rx_mbps,tx_mbps,interface_metrics) VALUES('${ts}','${midS}',${coreCount},${coreCount>0?safeNum(cpuTotal/coreCount):0},${safeNum(ramTotalMB)},${safeNum(ramUsedMB)},${safeNum(ramTotalMB-ramUsedMB)},${safeNum(diskTotalGB)},${safeNum(diskUsedGB)},${safeNum(diskTotalGB-diskUsedGB)},${netRxBytes},${netTxBytes},${netRxErrors},${netRxDrops},${netIfStatus},${maxTemp},${safeNum(rxAll)},${safeNum(txAll)},'${ifaceJson}'::jsonb);`;

msg.payload = { machine_id: mid, ts: ts, rxMbps: rxAll, errors: netRxErrors, status: netIfStatus, temp: maxTemp };
return msg;
```

- [ ] **Step 3: Validate JSON syntax**

```bash
python -c "import json; json.load(open('nodered_data/flows.json'))"
```

Expected: No output (valid JSON)

- [ ] **Step 4: Commit changes**

```bash
git add nodered_data/flows.json
git commit -m "feat: upgrade Node-RED with jitter protection and status-aware bandwidth"
```

---

### Task 2: Update Alertmanager Inhibition Rules

**Covers:** Phase 3 - Context-Aware Alerting

**Files:**
- Modify: `monitoring/alertmanager/alertmanager.yml:72-128`

**Interfaces:**
- Consumes: Alertmanager configuration
- Produces: Updated inhibition rules for alert suppression

- [ ] **Step 1: Read current alertmanager.yml**

```bash
cat monitoring/alertmanager/alertmanager.yml
```

- [ ] **Step 2: Replace inhibition rules section**

Replace the entire `inhibit_rules:` section with:

```yaml
inhibit_rules:
  # InterfaceDown inhibits ALL telemetry warnings on same machine
  - source_matchers:
      - alertname="InterfaceDown"
    target_matchers:
      - severity="warning"
      - service="network"
    equal: ['machine_id']

  # InterfaceDown inhibits CPU/RAM/Thermal warnings
  - source_matchers:
      - alertname="InterfaceDown"
    target_matchers_re:
      alertname: "CPUHigh|MemorySaturation|ThermalRunaway"
    equal: ['machine_id']

  # ServiceDown inhibits ALL warnings on same machine
  - source_matchers:
      - alertname="ServiceDown"
    target_matchers:
      - severity="warning"
    equal: ['machine_id']

  # NodeREDDown inhibits telemetry-related warnings
  - source_matchers:
      - alertname="NodeREDDown"
    target_matchers:
      - alertname="TelemetryGap"
    equal: []

  # Critical inhibits Warning for same alertname + machine
  - source_matchers:
      - severity="critical"
    target_matchers:
      - severity="warning"
    equal: ['alertname', 'machine_id']

  # Critical inhibits Info
  - source_matchers:
      - severity="critical"
    target_matchers:
      - severity="info"
    equal: ['alertname', 'machine_id']

  # ThermalRunawayCritical inhibits ThermalRunawayWarning
  - source_matchers:
      - alertname="ThermalRunawayCritical"
    target_matchers:
      - alertname="ThermalRunawayWarning"
    equal: ['machine_id']

  # NetworkDropsCritical inhibits NetworkErrorsSpike
  - source_matchers:
      - alertname="NetworkDropsCritical"
    target_matchers:
      - alertname="NetworkErrorsSpike"
    equal: ['machine_id']
```

- [ ] **Step 3: Validate YAML syntax**

```bash
python -c "import yaml; yaml.safe_load(open('monitoring/alertmanager/alertmanager.yml'))"
```

Expected: No output (valid YAML)

- [ ] **Step 4: Commit changes**

```bash
git add monitoring/alertmanager/alertmanager.yml
git commit -m "feat: replace Alertmanager inhibition rules with comprehensive context-aware logic"
```

---

### Task 3: Update Grafana Dashboard Colors

**Covers:** Phase 2 - Semantic Color & Visual Hierarchy

**Files:**
- Modify: `monitoring/grafana/dashboards/ims-noc-overview.json`
- Modify: `monitoring/grafana/dashboards/ims-main.json`
- Modify: `monitoring/grafana/dashboards/ims-engineering-drilldown.json`
- Modify: `monitoring/grafana/dashboards/ims-capacity-planning.json`

**Interfaces:**
- Consumes: Grafana dashboard JSON files
- Produces: Updated dashboards with semantic color hierarchy

- [ ] **Step 1: Update NOC Overview dashboard**

Apply semantic colors:
- CPU panels: Yellow-Orange-Red gradient
- RAM panels: Purple/Magenta
- Storage panels: Cyan/Blue
- Network RX: Green (upward)
- Network TX: Blue (downward)
- Errors/Drops: Red (bar chart)

- [ ] **Step 2: Update Main dashboard**

Apply same semantic color hierarchy

- [ ] **Step 3: Update Engineering Drilldown dashboard**

Apply same semantic color hierarchy

- [ ] **Step 4: Update Capacity Planning dashboard**

Apply same semantic color hierarchy

- [ ] **Step 5: Validate all dashboard JSON**

```bash
for f in monitoring/grafana/dashboards/*.json; do
  python -c "import json; json.load(open('$f'))" && echo "OK: $f"
done
```

- [ ] **Step 6: Commit changes**

```bash
git add monitoring/grafana/dashboards/*.json
git commit -m "feat: apply semantic color hierarchy to all Grafana dashboards"
```

---

### Task 4: Verify System Integration

**Covers:** End-to-end verification

**Files:**
- Test: Docker Compose configuration
- Test: Node-RED flow validation
- Test: Alertmanager configuration

**Interfaces:**
- Consumes: All modified files from Tasks 1-3
- Produces: Verified system ready for deployment

- [ ] **Step 1: Validate Docker Compose**

```bash
docker compose config
```

Expected: Valid configuration output

- [ ] **Step 2: Test Node-RED flow import**

```bash
docker compose up -d node-red
sleep 10
docker compose logs node-red | grep -i "started"
```

Expected: Node-RED started successfully

- [ ] **Step 3: Test Alertmanager config**

```bash
docker compose up -d alertmanager
sleep 5
docker compose logs alertmanager | grep -i "config"
```

Expected: Alertmanager loaded configuration

- [ ] **Step 4: Test Grafana dashboards**

```bash
docker compose up -d grafana
sleep 10
curl -s http://localhost:3000/api/health
```

Expected: Grafana healthy

- [ ] **Step 5: Commit final verification**

```bash
git add -A
git commit -m "chore: verify monitoring system integration after architecture upgrade"
```
