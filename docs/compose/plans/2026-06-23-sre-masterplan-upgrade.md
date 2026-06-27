# SRE Masterplan Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 SRE-level issues: SNMP temperature sensor missing base OID, Node-RED alert-webhook 404 error, and Grafana dashboard unit/query consistency.

**Architecture:** Three independent fixes: (1) add base OID `.7.0` to snmprec to prevent SNMP walker "No more variables" errors, (2) add HTTP webhook receiver flow to Node-RED for Alertmanager integration, (3) verify Grafana queries match current DB schema.

**Tech Stack:** snmpsimd `.snmprec` files, Node-RED JSON flows, Grafana JSON dashboards, PostgreSQL/TimescaleDB

## Global Constraints

- All SQL must use `public` schema only — no `ims.*` schema references
- All dashboard JSON must validate via `python -c "import json; json.load(open('...'))"`
- Node-RED flows: edit `flows-ubuntu.json` (source of truth), copy to `nodered_data/flows.json` for runtime
- Network colors: RX = Dark Blue `#1F60C4`, TX = Light Blue `#5794F2`
- All string interpolation in SQL must use `safeStr()` escaping
- Deploy command: `docker compose down -v && docker compose up -d`

---

### Task 1: Fix SNMP Simulator Temperature Base OID

**Covers:** Masterplan Phase 1 — "The Empty MIB View" fix

**Files:**
- Modify: `monitoring/snmpsim/Netk@.snmprec:54-55`

**Interfaces:**
- Consumes: snmpsimd `2:numeric` fluctuating format
- Produces: OID `.1.3.6.1.4.1.2021.13.16.2.1.7.0` and `.7.1` available via SNMP GETNEXT

- [ ] **Step 1: Add base OID `.7.0` to snmprec file**

The current file has `.7.1` but lacks `.7.0`. SNMP walker needs a base OID to start the subtree walk from.

Edit `monitoring/snmpsim/Netk@.snmprec` — change line 55 from:
```
1.3.6.1.4.1.2021.13.16.2.1.7.1|2:numeric|min=45,max=88,rate=3
```
to:
```
1.3.6.1.4.1.2021.13.16.2.1.7.0|2|0
1.3.6.1.4.1.2021.13.16.2.1.7.1|2:numeric|min=45,max=88,rate=3
```

- [ ] **Step 2: Restart snmpsim container**

```bash
docker compose restart snmpsim
```

- [ ] **Step 3: Verify temperature OID responds**

```bash
docker compose logs --tail=10 snmpsim | grep "1.3.6.1.4.1.2021.13.16.2.1.7"
```

Expected: No "No more variables left in this MIB View" errors for temperature OID.

---

### Task 2: Add Alert Webhook Flow to Node-RED

**Covers:** Masterplan Phase 2 — Fix Alertmanager 404 error

**Files:**
- Modify: `flows-ubuntu.json` — add 4 new nodes (http in, function, http response, debug)

**Interfaces:**
- Consumes: Alertmanager POST JSON payload at `/alert-webhook`
- Produces: 200 OK response, formatted alert text in debug sidebar

- [ ] **Step 1: Add alert webhook nodes to flows-ubuntu.json**

Insert these 4 node objects into the JSON array (before the closing `]`):

```json
{
    "id": "ims-alert-tab",
    "type": "tab",
    "label": "IMS Alert Processing",
    "disabled": false,
    "info": "Alertmanager webhook receiver — POST /alert-webhook",
    "env": []
},
{
    "id": "alert_http_in",
    "type": "http in",
    "z": "ims-alert-tab",
    "name": "POST /alert-webhook",
    "url": "/alert-webhook",
    "method": "post",
    "upload": false,
    "swaggerDoc": "",
    "x": 160,
    "y": 200,
    "wires": [
        ["alert_respond", "alert_format"]
    ]
},
{
    "id": "alert_respond",
    "type": "http response",
    "z": "ims-alert-tab",
    "name": "200 OK",
    "statusCode": "200",
    "headers": {
        "Content-Type": "application/json"
    },
    "x": 400,
    "y": 120,
    "wires": []
},
{
    "id": "alert_format",
    "type": "function",
    "z": "ims-alert-tab",
    "name": "Format Alert Text",
    "func": "const payload = msg.payload;\nconst alerts = payload.alerts || [];\nlet lines = ['IMS ALERT — ' + (payload.status || 'unknown') + '\\n'];\n\nfor (let i = 0; i < alerts.length; i++) {\n    const a = alerts[i];\n    const labels = a.labels || {};\n    const annotations = a.annotations || {};\n    lines.push('Alert: ' + (labels.alertname || 'N/A'));\n    lines.push('Host: ' + (labels.machine_id || 'N/A'));\n    lines.push('Severity: ' + (labels.severity || 'N/A'));\n    lines.push('Summary: ' + (annotations.summary || 'N/A'));\n    lines.push('Started: ' + (a.startsAt || 'N/A'));\n    lines.push('---');\n}\n\nmsg.payload = lines.join('\\n');\nreturn msg;",
    "outputs": 1,
    "timeout": "",
    "noerr": 0,
    "initialize": "",
    "finalize": "",
    "libs": [],
    "x": 420,
    "y": 240,
    "wires": [
        ["alert_debug"]
    ]
},
{
    "id": "alert_debug",
    "type": "debug",
    "z": "ims-alert-tab",
    "name": "Alert Log",
    "active": true,
    "tosidebar": true,
    "console": true,
    "tostatus": true,
    "complete": "payload",
    "targetType": "msg",
    "x": 640,
    "y": 240,
    "wires": []
}
```

- [ ] **Step 2: Validate JSON**

```bash
python -c "import json; json.load(open('flows-ubuntu.json'))" && echo "VALID" || echo "INVALID"
```

- [ ] **Step 3: Copy to runtime and restart**

```bash
cp flows-ubuntu.json nodered_data/flows.json
docker compose restart node-red
```

- [ ] **Step 4: Wait 25 seconds, then verify Node-RED started**

```bash
Start-Sleep 25; docker compose logs --tail=10 node-red | Select-String "started"
```

- [ ] **Step 5: Verify webhook endpoint responds**

```bash
docker compose exec node-red curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:1880/alert-webhook -H "Content-Type: application/json" -d '{"status":"firing","alerts":[{"labels":{"alertname":"TestAlert","machine_id":"test","severity":"warning"},"annotations":{"summary":"Test alert"},"startsAt":"2026-01-01T00:00:00Z"}]}'
```

Expected: HTTP 200

---

### Task 3: Verify Grafana Dashboard Schema Consistency

**Covers:** Masterplan Phase 3 — Fix temperature query and verify units

**Files:**
- Read: `monitoring/grafana/dashboards/*.json` (all 4 dashboards)

**Interfaces:**
- Consumes: Current DB schema (`telemetry_minute_summary` columns: `avg_rx_mbps`, `max_temp_c`, `total_rx_errors`)
- Produces: Confirmation that no stale `temperature_c` or `net_rx_mbps` references exist

- [ ] **Step 1: Check for stale column references across all dashboards**

```bash
rg -n "temperature_c|net_rx_mbps|process_count" monitoring/grafana/dashboards/
```

Expected: Zero matches (all fixed in prior phases).

- [ ] **Step 2: Check for stale `ims.*` schema references**

```bash
rg -n "ims\." monitoring/grafana/dashboards/
```

Expected: Zero matches.

- [ ] **Step 3: Check for deprecated Grafana units**

```bash
rg -n "decgbytes|decmbytes" monitoring/grafana/dashboards/
```

Expected: Zero matches.

- [ ] **Step 4: Validate all dashboard JSON files**

```bash
for f in monitoring/grafana/dashboards/*.json; do python -c "import json; json.load(open('$f'))" && echo "OK: $f" || echo "FAIL: $f"; done
```

Expected: All OK.

- [ ] **Step 5: Check for SQL `* 1024` double conversion patterns**

```bash
rg -n "\* 1024" monitoring/grafana/dashboards/
```

Expected: Zero matches.

---

### Task 4: Full System Verification

**Covers:** Masterplan Phase 4 — SRE Verification Protocol

**Files:**
- None (read-only verification)

**Interfaces:**
- Consumes: Running Docker stack
- Produces: Confirmation that all fixes are operational

- [ ] **Step 1: Restart all services**

```bash
docker compose down -v && docker compose up -d
```

- [ ] **Step 2: Wait 40 seconds for full startup**

```bash
Start-Sleep 40
```

- [ ] **Step 3: Verify all containers are up**

```bash
docker compose ps --format "table {{.Name}}\t{{.Status}}"
```

- [ ] **Step 4: Verify telemetry data flowing (DB check)**

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, COUNT(*) as rows, MAX(time) as latest FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"
```

Expected: Row count > 0 for both machines.

- [ ] **Step 5: Verify continuous aggregates have data**

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, avg_rx_mbps, max_temp_c, total_rx_errors FROM public.telemetry_minute_summary ORDER BY bucket DESC LIMIT 4;"
```

Expected: Non-null values, no zeroes across the board.

- [ ] **Step 6: Verify snmpsim temperature responding**

```bash
docker compose logs --tail=30 snmpsim | rg -i "temp|2021.13"
```

- [ ] **Step 7: Verify Grafana dashboards accessible**

```bash
docker compose exec grafana curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/dashboards/db/ims-noc-overview
```

Expected: HTTP 200.
