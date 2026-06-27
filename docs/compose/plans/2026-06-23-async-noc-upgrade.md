# Async NOC Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade IMS NOC to async event-driven architecture with zero-bottleneck data pipeline, fix Grafana alerting bugs, and reset to clean state.

**Architecture:** Replace Node-RED Join-based pipeline (silent failure risk) with Async Collector using flow.context state. Fix Grafana alert rule condition references. Reset all volumes for clean deployment.

**Tech Stack:** Node-RED 4.0.5, TimescaleDB 2.17.2-pg16, Grafana OSS 11.1.0, Docker Compose

---

## Task 1: The Great Reset (Clean Slate)

**Covers:** Clean state for fresh deployment

**Files:**
- None (volume cleanup)

- [ ] **Step 1: Stop all containers and remove volumes**

```bash
docker compose down -v
```

Expected: All containers stopped, volumes removed.

- [ ] **Step 2: Verify volumes are removed**

```bash
docker volume ls | grep ims
```

Expected: No IMS volumes listed.

---

## Task 2: Node-RED Async Pipeline

**Covers:** Zero-bottleneck data pipeline with async collection

**Files:**
- Write: `C:\Projects\IMS\nodered_data\flows.json`

- [ ] **Step 1: Write the new async collector flow**

Replace the entire content of `nodered_data/flows.json` with the following:

```json
[
    {
        "id": "group_world_class",
        "type": "group",
        "z": "8bf5bf82223c02d8",
        "name": "Enterprise Async SNMP Pipeline (CPU + RAM + Network/WiFi)",
        "style": { "stroke": "#004D40", "fill": "#E0F2F1", "label": true, "color": "#004D40" },
        "nodes": ["inject_ubuntu", "inject_windows", "split_walker", "walk_cpu", "walk_storage", "walk_network", "async_collector", "insert_db", "debug_ok", "catch_all", "debug_error"],
        "x": 34,
        "y": 39,
        "w": 1400,
        "h": 350
    },
    {
        "id": "inject_ubuntu",
        "type": "inject",
        "z": "8bf5bf82223c02d8",
        "g": "group_world_class",
        "name": "Poll Ubuntu (10s)",
        "props": [{ "p": "machine_id", "v": "ERP-MASTER-UBUNTU", "vt": "str" }],
        "repeat": "10",
        "crontab": "",
        "once": true,
        "onceDelay": 1,
        "topic": "",
        "x": 160,
        "y": 100,
        "wires": [["split_walker"]]
    },
    {
        "id": "inject_windows",
        "type": "inject",
        "z": "8bf5bf82223c02d8",
        "g": "group_world_class",
        "name": "Poll Windows (10s)",
        "props": [{ "p": "machine_id", "v": "ERP-MASTER-WINDOWS", "vt": "str" }],
        "repeat": "10",
        "crontab": "",
        "once": true,
        "onceDelay": 6,
        "topic": "",
        "x": 160,
        "y": 180,
        "wires": [["split_walker"]]
    },
    {
        "id": "split_walker",
        "type": "function",
        "z": "8bf5bf82223c02d8",
        "g": "group_world_class",
        "name": "Fan-Out (Parallel)",
        "func": "const mid = msg.machine_id;\nconst jobId = Date.now().toString();\n\nconst msgCpu = { machine_id: mid, job_id: jobId, metric_type: 'cpu' };\nconst msgStorage = { machine_id: mid, job_id: jobId, metric_type: 'storage' };\nconst msgNetwork = { machine_id: mid, job_id: jobId, metric_type: 'network' };\n\nreturn [[msgCpu], [msgStorage], [msgNetwork]];",
        "outputs": 3,
        "x": 380,
        "y": 140,
        "wires": [["walk_cpu"], ["walk_storage"], ["walk_network"]]
    },
    {
        "id": "walk_cpu",
        "type": "snmp walker",
        "z": "8bf5bf82223c02d8",
        "g": "group_world_class",
        "host": "ims-snmpsim",
        "version": "2c",
        "timeout": "3",
        "community": "Netk@",
        "auth": "noAuthNoPriv",
        "oids": "1.3.6.1.2.1.25.3.3.1.2",
        "name": "Walk CPU",
        "x": 600,
        "y": 80,
        "wires": [["async_collector"]]
    },
    {
        "id": "walk_storage",
        "type": "snmp walker",
        "z": "8bf5bf82223c02d8",
        "g": "group_world_class",
        "host": "ims-snmpsim",
        "version": "2c",
        "timeout": "3",
        "community": "Netk@",
        "auth": "noAuthNoPriv",
        "oids": "1.3.6.1.2.1.25.2.3.1",
        "name": "Walk Storage",
        "x": 600,
        "y": 140,
        "wires": [["async_collector"]]
    },
    {
        "id": "walk_network",
        "type": "snmp walker",
        "z": "8bf5bf82223c02d8",
        "g": "group_world_class",
        "host": "ims-snmpsim",
        "version": "2c",
        "timeout": "3",
        "community": "Netk@",
        "auth": "noAuthNoPriv",
        "oids": "1.3.6.1.2.1.2.2.1",
        "name": "Walk Network",
        "x": 600,
        "y": 200,
        "wires": [["async_collector"]]
    },
    {
        "id": "async_collector",
        "type": "function",
        "z": "8bf5bf82223c02d8",
        "g": "group_world_class",
        "name": "Async Aggregation Engine",
        "func": "const mid = msg.machine_id;\nconst metricType = msg.metric_type;\nconst payload = msg.payload || [];\n\nlet state = flow.get('state_' + mid) || {\n    cpu_total: 0, cpu_cores: 0,\n    ram_total_bytes: 0, ram_used_bytes: 0,\n    disk_total_bytes: 0, disk_used_bytes: 0,\n    net_rx_bytes: 0, net_tx_bytes: 0,\n    collected_count: 0\n};\n\nif (metricType === 'cpu') {\n    for (let i = 0; i < payload.length; i++) {\n        if (payload[i].oid.includes('.25.3.3.1.2.')) {\n            state.cpu_total += Number(payload[i].value) || 0;\n            state.cpu_cores++;\n        }\n    }\n    state.collected_count++;\n} \nelse if (metricType === 'storage') {\n    const disks = {};\n    for (let i = 0; i < payload.length; i++) {\n        const item = payload[i];\n        if (!item.oid) continue;\n        const parts = item.oid.split('.');\n        const idx = parts.pop();\n        const mt = parts.pop();\n        if (!disks[idx]) disks[idx] = { type: \"\", descr: \"\", au: 0, size: 0, used: 0 };\n        if (mt === \"2\") disks[idx].type = String(item.value);\n        if (mt === \"3\") disks[idx].descr = String(item.value).toUpperCase();\n        if (mt === \"4\") disks[idx].au = Number(item.value) || 0;\n        if (mt === \"5\") disks[idx].size = Number(item.value) || 0;\n        if (mt === \"6\") disks[idx].used = Number(item.value) || 0;\n    }\n    for (const idx in disks) {\n        const d = disks[idx];\n        if (!d.au || !d.size) continue;\n        const sizeBytes = d.size * d.au;\n        const usedBytes = d.used * d.au;\n        if (d.type.includes(\"25.2.1.2\") || d.descr.includes(\"MEMORY\")) {\n            state.ram_total_bytes += sizeBytes;\n            state.ram_used_bytes += usedBytes;\n        } else if (d.type.includes(\"25.2.1.4\") || d.descr.includes(\"C:\")) {\n            state.disk_total_bytes += sizeBytes;\n            state.disk_used_bytes += usedBytes;\n        }\n    }\n    state.collected_count++;\n}\nelse if (metricType === 'network') {\n    for (let i = 0; i < payload.length; i++) {\n        if (payload[i].oid.includes('.2.2.1.10.')) state.net_rx_bytes += Number(payload[i].value) || 0;\n        if (payload[i].oid.includes('.2.2.1.16.')) state.net_tx_bytes += Number(payload[i].value) || 0;\n    }\n    state.collected_count++;\n}\n\nflow.set('state_' + mid, state);\n\nif (state.collected_count >= 3) {\n    const now = Date.now();\n    let prevNet = flow.get('net_prev_' + mid) || { rx: state.net_rx_bytes, tx: state.net_tx_bytes, ts: now };\n    let rxMbps = 0, txMbps = 0;\n\n    const timeElapsedSec = (now - prevNet.ts) / 1000;\n    if (timeElapsedSec > 0) {\n        rxMbps = ((state.net_rx_bytes - prevNet.rx) * 8) / (timeElapsedSec * 1000000);\n        txMbps = ((state.net_tx_bytes - prevNet.tx) * 8) / (timeElapsedSec * 1000000);\n        if (rxMbps < 0) rxMbps = 0;\n        if (txMbps < 0) txMbps = 0;\n    }\n    flow.set('net_prev_' + mid, { rx: state.net_rx_bytes, tx: state.net_tx_bytes, ts: now });\n\n    const safeNum = (v) => Number.isFinite(v) && v >= 0 ? Number(v.toFixed(2)) : 0;\n\n    const t = {\n        time_stamp: new Date().toISOString(),\n        machine_id: mid,\n        cpu_cores: state.cpu_cores,\n        cpu_avg_load: state.cpu_cores > 0 ? safeNum(state.cpu_total / state.cpu_cores) : 0,\n        ram_total_mb: safeNum(state.ram_total_bytes / 1048576),\n        ram_used_mb: safeNum(state.ram_used_bytes / 1048576),\n        ram_free_mb: safeNum((state.ram_total_bytes - state.ram_used_bytes) / 1048576),\n        disk_total_gb: safeNum(state.disk_total_bytes / 1073741824),\n        disk_used_gb: safeNum(state.disk_used_bytes / 1073741824),\n        disk_free_gb: safeNum((state.disk_total_bytes - state.disk_used_bytes) / 1073741824),\n        net_rx_mbps: safeNum(rxMbps),\n        net_tx_mbps: safeNum(txMbps)\n    };\n\n    flow.set('state_' + mid, null);\n\n    msg.payload = t;\n\n    msg.query = `\n        INSERT INTO public.machine_telemetry \n        (\"time\", machine_id, cpu_cores, cpu_load_percent, ram_total_mb, ram_used_mb, ram_free_mb, disk_total_gb, disk_used_gb, disk_free_gb, net_rx_mbps, net_tx_mbps)\n        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);\n    `;\n    msg.params = [t.time_stamp, t.machine_id, t.cpu_cores, t.cpu_avg_load, t.ram_total_mb, t.ram_used_mb, t.ram_free_mb, t.disk_total_gb, t.disk_used_gb, t.disk_free_gb, t.net_rx_mbps, t.net_tx_mbps];\n\n    return msg;\n}\n\nreturn null;",
        "outputs": 1,
        "x": 860,
        "y": 140,
        "wires": [["insert_db", "debug_ok"]]
    },
    {
        "id": "insert_db",
        "type": "postgresql",
        "z": "8bf5bf82223c02d8",
        "g": "group_world_class",
        "name": "TimescaleDB",
        "query": "",
        "postgreSQLConfig": "ims-pg-config",
        "split": false,
        "rowsPerMsg": 1,
        "outputs": 0,
        "x": 1100,
        "y": 180,
        "wires": []
    },
    {
        "id": "debug_ok",
        "type": "debug",
        "z": "8bf5bf82223c02d8",
        "g": "group_world_class",
        "name": "DB Insert Success",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "payload",
        "targetType": "msg",
        "x": 1110,
        "y": 100,
        "wires": []
    },
    {
        "id": "catch_all",
        "type": "catch",
        "z": "8bf5bf82223c02d8",
        "g": "group_world_class",
        "name": "Catch Global Errors",
        "scope": null,
        "uncaught": false,
        "x": 150,
        "y": 300,
        "wires": [["debug_error"]]
    },
    {
        "id": "debug_error",
        "type": "debug",
        "z": "8bf5bf82223c02d8",
        "g": "group_world_class",
        "name": "System Warnings",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": true,
        "complete": "error.message",
        "targetType": "msg",
        "x": 350,
        "y": 300,
        "wires": []
    },
    {
        "id": "ims-pg-config",
        "type": "postgreSQLConfig",
        "name": "IMS Database",
        "host": "pgbouncer",
        "port": "6432",
        "database": "ims",
        "ssl": "false",
        "user": "ims_admin",
        "password": "Ims_S3cure!2026"
    }
]
```

- [ ] **Step 2: Also write to flows-ubuntu.json (backup copy)**

```bash
cp nodered_data/flows.json flows-ubuntu.json
```

- [ ] **Step 3: Verify JSON is valid**

```bash
python -m json.tool nodered_data/flows.json > /dev/null && echo "Valid JSON"
```

Expected: "Valid JSON" output.

---

## Task 3: Fix Grafana Alerting Rules

**Covers:** Fix condition reference bug

**Files:**
- Write: `C:\Projects\IMS\monitoring\grafana\provisioning\alerting\rules.yml`

- [ ] **Step 1: Fix condition: C to condition: A in all alert rules**

Replace all occurrences of `condition: C` with `condition: A` in the rules.yml file. This must be done for all 4 rules:
- ims-cpu-high
- ims-ram-high
- ims-disk-high
- ims-temp-high

- [ ] **Step 2: Verify the fix**

```bash
grep -n "condition:" monitoring/grafana/provisioning/alerting/rules.yml
```

Expected: All lines should show `condition: A` (no `condition: C`).

---

## Task 4: Deploy and Validate

**Covers:** Full system deployment

**Files:**
- None (deployment validation)

- [ ] **Step 1: Start all services**

```bash
docker compose up -d
```

Expected: All containers start successfully.

- [ ] **Step 2: Wait for services to be healthy**

```bash
docker compose ps
```

Expected: All 6 containers show "Up" or "healthy" status.

- [ ] **Step 3: Verify data is flowing**

```bash
docker exec ims-timescaledb psql -U ims_admin -d ims -c "SELECT machine_id, cpu_load_percent, ram_used_mb, net_rx_mbps FROM public.machine_telemetry ORDER BY time DESC LIMIT 4;"
```

Expected: Telemetry data with CPU, RAM, and Network values.

- [ ] **Step 4: Verify Grafana is accessible**

```bash
curl -s http://localhost:3000/api/health
```

Expected: `{"database":"ok"}` response.

---

## Self-Review Checklist

- [ ] All 4 tasks completed
- [ ] Node-RED flow uses async collector (no Join node)
- [ ] Grafana rules have condition: A (not condition: C)
- [ ] All services start and pass health checks
- [ ] Data flows into TimescaleDB
