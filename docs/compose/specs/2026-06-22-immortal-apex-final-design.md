# The Immortal Apex System — Final 0.1% Perfection Fix

## [S1] Problem

The IMS system is at 99.9% Production Ready. Three micro-imperfections remain:

1. **SNMP Simulator** — rates too conservative (max=50B), producing ~12 Mbps. No visual "heartbeat spikes" that demonstrate real-world network behavior.
2. **Node-RED Alert Webhook** — plain text format, no structured logging, no emoji severity indicators for SRE operators.
3. **Grafana Dashboard** — two redundant Bandwidth panels (502 and 13), wlan0 colors not differentiated from eth0, tooltip shows raw negative values for Upload.

## [S2] Solution Overview

### Phase 1: SNMP Chaos Simulator "The Heartbeat Engine"

Update `monitoring/snmpsim/Netk@.snmprec` with enterprise-grade rates:

| OID | Current | New | Purpose |
|-----|---------|-----|---------|
| eth0 RX | max=50B, rate=12.5M | max=85B, rate=18.5M | Spike to ~148 Mbps |
| eth0 TX | max=30B, rate=6.5M | max=50B, rate=9.5M | Spike to ~76 Mbps |
| wlan0 RX | max=10B, rate=1.5M | max=15B, rate=2.5M | Spike to ~20 Mbps |
| wlan0 TX | max=5B, rate=800K | max=8B, rate=1.2M | Spike to ~9.6 Mbps |
| eth0 Errors | max=500, rate=25 | max=2000, rate=45 | Cable fault simulation |
| eth0 Drops | max=200, rate=10 | max=500, rate=15 | Packet loss simulation |
| Temp | max=88°C, rate=5 | max=95°C, rate=8 | Thermal alert trigger |

**Risk**: max=85B may cause Counter64 overflow. Mitigation: add wrap protection in AIOps Parser (already has `if (rxDiff < 0) rxDiff += 18446744073709552000`).

**Command**: `docker compose restart snmpsim`

### Phase 2: Node-RED "The Sentinel Webhook"

Update the `Format Alert Text` function node in `flows-ubuntu.json` (id: `alert_format`):

- Add emoji severity icons (🔥 critical, ⚠️ warning, ✅ resolved)
- Add Host, Detail, Description, Time fields
- Format time as human-readable (Thai locale)
- Structure for future Line Notify / Slack integration

**Files**: `flows-ubuntu.json` → copy to `nodered_data/flows.json`
**Command**: `docker compose restart node-red`

### Phase 3: Grafana "The Perfect Symmetry"

**3a. Delete Panel 13** ("Ethernet/WiFi Bandwidth" — redundant with Panel 502)

**3b. Update Panel 502 overrides** for differentiated wlan0 colors:
- eth0 Download: `#1F60C4` (Dark Blue) — existing, keep
- eth0 Upload: `#5794F2` (Light Blue) — existing, keep
- wlan0 Download: `#8E24AA` (Dark Purple) — NEW
- wlan0 Upload: `#E02F44` (Magenta) — NEW

**3c. Fix Panel 502 options.unit**: Currently `"gbytes"` → change to `"mbps"`

**3d. Add tooltip `math.abs` override** so Upload values display as positive

**File**: `monitoring/grafana/dashboards/ims-engineering-drilldown.json`

### Phase 4: Full-Scale Nuclear Test

1. `docker compose down -v && docker compose up -d` (clean restart)
2. Wait 40s for all services to initialize
3. 7-point verification: containers, DB, aggregates, snmpsim, Grafana, Alertmanager, data flow
4. K6 stress test: `k6 run tests/k6/pipeline-stress.js` (if available)

## [S3] Success Criteria

- [ ] snmpsim produces visible spikes (>50 Mbps peaks on eth0)
- [ ] Node-RED Alert Webhook formats alerts with emoji + structured fields
- [ ] Grafana shows single Bandwidth panel with 4 distinct colors (eth0 DL/UL, wlan0 DL/UL)
- [ ] Tooltip shows positive values for Upload
- [ ] All 8 containers healthy after clean restart
- [ ] rx_mbps > 0 flowing in database
- [ ] No TypeError, BigInt, or undefined errors in Node-RED logs

## [S4] Files Modified

| File | Change |
|------|--------|
| `monitoring/snmpsim/Netk@.snmprec` | Update rates to enterprise-grade |
| `flows-ubuntu.json` | Update alert_format function |
| `nodered_data/flows.json` | Sync from flows-ubuntu.json |
| `monitoring/grafana/dashboards/ims-engineering-drilldown.json` | Delete Panel 13, update Panel 502 overrides |
