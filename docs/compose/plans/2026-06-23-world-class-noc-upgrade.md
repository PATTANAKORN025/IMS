# World-Class NOC Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the IMS monitoring system to World-Class NOC status with dynamic simulation, enterprise alerting, risk hardening, aesthetic precision, and Node-RED optimization.

**Architecture:** 5-phase upgrade: (1) Enhanced dynamic SNMP simulation with memory leak patterns, (2) Enterprise alerting with Line Notify/Slack webhooks, (3) Risk hardening with resource limits and Grafana cache fix, (4) Dashboard aesthetic precision with correct units and colors, (5) Node-RED circuit breaker pattern for data validation.

**Tech Stack:** SNMP Simulator (tandrup/snmpsim), Node-RED 4.0.5, TimescaleDB 2.17.2-pg16, Grafana OSS 11.1.0, Alertmanager 0.27.0

---

## Task 1: Enhanced Dynamic SNMP Simulation

**Covers:** [S1]

**Files:**
- Modify: `C:\Projects\IMS\monitoring\snmpsim\Netk@.snmprec`

- [ ] **Step 1: Replace SNMP simulator with enhanced dynamic values**

Replace the entire content of `Netk@.snmprec` with:

```text
# --- 1. Storage Types & Descriptions ---
1.3.6.1.2.1.25.2.3.1.2.1|6|1.3.6.1.2.1.25.2.1.2
1.3.6.1.2.1.25.2.3.1.2.2|6|1.3.6.1.2.1.25.2.1.4
1.3.6.1.2.1.25.2.3.1.3.1|4|Physical Memory
1.3.6.1.2.1.25.2.3.1.3.2|4|C:\ Label:System

# --- 2. Allocation Units & Total Size (Fixed) ---
# RAM 16GB, Disk 500GB
1.3.6.1.2.1.25.2.3.1.4.1|2|1024
1.3.6.1.2.1.25.2.3.1.4.2|2|4096
1.3.6.1.2.1.25.2.3.1.5.1|2|16777216
1.3.6.1.2.1.25.2.3.1.5.2|2|131072000

# --- 3. DYNAMIC RAM & DISK USED (Memory Leak Simulation) ---
# RAM: starts at 4GB, grows to 15GB (simulates memory leak, 100MB increments)
1.3.6.1.2.1.25.2.3.1.6.1|2:numeric|min=4194304,max=15728640,rate=102400
# Disk: grows gradually (log accumulation, 50MB increments)
1.3.6.1.2.1.25.2.3.1.6.2|2:numeric|min=65536000,max=125000000,rate=12800

# --- 4. DYNAMIC CPU CORES (Independent fluctuation 5-99%) ---
1.3.6.1.2.1.25.3.3.1.2.1|2:numeric|min=5,max=95,rate=15
1.3.6.1.2.1.25.3.3.1.2.2|2:numeric|min=10,max=85,rate=12
1.3.6.1.2.1.25.3.3.1.2.3|2:numeric|min=5,max=100,rate=20
1.3.6.1.2.1.25.3.3.1.2.4|2:numeric|min=20,max=75,rate=8
```

- [ ] **Step 2: Restart SNMP Simulator**

```bash
docker compose restart snmpsim
```

Expected: Container restarts without errors.

- [ ] **Step 3: Verify dynamic values are fluctuating**

```bash
docker run --rm --network ims_ims-net alpine:latest sh -c "apk add net-snmp-tools > /dev/null 2>&1 && snmpwalk -v2c -c Netk@ ims-snmpsim:161 1.3.6.1.2.1.25.3.3.1.2"
```

Expected: CPU values should show different numbers each time (fluctuating).

- [ ] **Step 4: Commit changes**

```bash
git add monitoring/snmpsim/Netk@.snmprec
git commit -m "feat: enhance SNMP simulation with memory leak patterns"
```

---

## Task 2: Enterprise Alerting with Webhook Integration

**Covers:** [S2]

**Files:**
- Modify: `C:\Projects\IMS\monitoring\alertmanager\alertmanager.yml`

- [ ] **Step 1: Update Alertmanager configuration with webhook receiver**

Replace the entire content of `alertmanager.yml` with:

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'server']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'https://localhost:9095/webhook'
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'server']
```

- [ ] **Step 2: Restart Alertmanager**

```bash
docker compose restart alertmanager
```

Expected: Container restarts without errors.

- [ ] **Step 3: Verify Alertmanager is healthy**

```bash
curl -s http://localhost:9093/-/healthy
```

Expected: "OK" response.

- [ ] **Step 4: Commit changes**

```bash
git add monitoring/alertmanager/alertmanager.yml
git commit -m "feat: configure Alertmanager with webhook receiver"
```

---

## Task 3: Risk Hardening - Resource Limits

**Covers:** [S3]

**Files:**
- Modify: `C:\Projects\IMS\docker-compose.yaml`

- [ ] **Step 1: Add TimescaleDB resource limits**

Update the `timescaledb` service to add resource limits:

```yaml
  timescaledb:
    image: timescale/timescaledb:2.17.2-pg16
    container_name: ims-timescaledb
    restart: unless-stopped
    init: true
    environment:
      TZ: ${TZ:-Asia/Bangkok}
      POSTGRES_DB: ${POSTGRES_DB:?set POSTGRES_DB in .env}
      POSTGRES_USER: ${POSTGRES_USER:?set POSTGRES_USER in .env}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
      PGDATA: /var/lib/postgresql/data/pgdata
    command:
      - postgres
      - -c
      - shared_preload_libraries=timescaledb,pg_stat_statements
      - -c
      - max_connections=100
      - -c
      - shared_buffers=256MB
      - -c
      - effective_cache_size=768MB
      - -c
      - work_mem=16MB
      - -c
      - maintenance_work_mem=128MB
      - -c
      - wal_compression=on
      - -c
      - max_wal_size=1GB
      - -c
      - timezone=${TZ:-Asia/Bangkok}
    volumes:
      - timescaledb_data:/var/lib/postgresql/data
      - ./postgres/init:/docker-entrypoint-initdb.d:ro
    deploy:
      resources:
        limits:
          memory: 2G
    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U ${POSTGRES_USER:?set POSTGRES_USER in .env} -d ${POSTGRES_DB:?set POSTGRES_DB in .env}
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
    logging: *default-logging
    networks:
      - ims-net
```

- [ ] **Step 2: Update Node-RED resource limits**

Update the `node-red` service to add CPU limit:

```yaml
  node-red:
    image: nodered/node-red:4.0.5-22-minimal
    container_name: ims-node-red
    restart: unless-stopped
    init: true
    user: "1000:1000"
    environment:
      TZ: ${TZ:-Asia/Bangkok}
      NODE_RED_ENABLE_PROJECTS: "false"
      NODE_OPTIONS: "--max-old-space-size=1024"
      PGHOST: timescaledb
      PGPORT: "5432"
      PGDATABASE: ${POSTGRES_DB:?set POSTGRES_DB in .env}
      PGUSER: ${POSTGRES_USER:?set POSTGRES_USER in .env}
      PGPASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    ports:
      - "1880:1880"
    volumes:
      - ./nodered_data:/data
      - /etc/localtime:/etc/localtime:ro
    depends_on:
      timescaledb:
        condition: service_healthy
      grafana:
        condition: service_started
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
    healthcheck:
      test:
        - CMD-SHELL
        - node -e "const http=require('http');const req=http.get('http://127.0.0.1:1880/',res=>process.exit(res.statusCode&&res.statusCode<500?0:1));req.on('error',()=>process.exit(1));req.setTimeout(3000,()=>{req.destroy();process.exit(1);});"
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
    logging: *default-logging
    networks:
      - ims-net
```

- [ ] **Step 3: Verify docker-compose.yaml is valid**

```bash
docker compose config --quiet && echo "Valid YAML"
```

Expected: "Valid YAML" output.

- [ ] **Step 4: Commit changes**

```bash
git add docker-compose.yaml
git commit -m "feat: add resource limits for TimescaleDB and Node-RED"
```

---

## Task 4: Node-RED Circuit Breaker Optimization

**Covers:** [S5]

**Files:**
- Modify: `C:\Projects\IMS\nodered_data\flows.json` (parse_storage_sql function node)

- [ ] **Step 1: Update the parse_storage_sql function with circuit breaker**

Update the `func` property of the `parse_storage_sql` node (id: `parse_storage_sql`) with:

```javascript
if (!msg.payload || !Array.isArray(msg.payload)) return null;

const disks = {};
const len = msg.payload.length;

// Zero-Regex Parsing
for (let i = 0; i < len; i++) {
    const item = msg.payload[i];
    if (!item || !item.oid) continue;

    const parts = item.oid.split('.');
    const idx = parts.pop();
    const metricType = parts.pop();

    if (!disks[idx]) disks[idx] = { type: "", descr: "", au: 0, size: 0, used: 0 };

    switch(metricType) {
        case "2": disks[idx].type = String(item.value); break;
        case "3": disks[idx].descr = Buffer.isBuffer(item.value) ? item.value.toString('ascii') : String(item.value); break;
        case "4": disks[idx].au = Number(item.value) || 0; break;
        case "5": disks[idx].size = Number(item.value) || 0; break;
        case "6": disks[idx].used = Number(item.value) || 0; break;
    }
}

let ramTotalMB = 0, ramUsedMB = 0;
let diskTotalGB = 0, diskUsedGB = 0;

for (const idx in disks) {
    const d = disks[idx];
    if (!d.au || !d.size) continue;

    const sizeBytes = d.size * d.au;
    const usedBytes = d.used * d.au;
    const typeStr = d.type || "";
    const descStr = (d.descr || "").toUpperCase();

    if (typeStr.includes("25.2.1.2") || descStr.includes("MEMORY")) {
        ramTotalMB += sizeBytes / 1048576;
        ramUsedMB += usedBytes / 1048576;
    } else if (typeStr.includes("25.2.1.4") || descStr.includes("C:") || descStr.includes("/")) {
        diskTotalGB += sizeBytes / 1073741824;
        diskUsedGB += usedBytes / 1073741824;
    }
}

const t = msg.telemetry || {};

// CIRCUIT BREAKER: Prevent invalid data (Infinity, NaN) from corrupting DB
const sanitize = (val) => (Number.isFinite(val) && val >= 0) ? Number(val.toFixed(2)) : 0;

t.ram_total_mb = sanitize(ramTotalMB);
t.ram_used_mb = sanitize(ramUsedMB);
t.ram_free_mb = sanitize(ramTotalMB - ramUsedMB);
t.disk_total_gb = sanitize(diskTotalGB);
t.disk_used_gb = sanitize(diskUsedGB);
t.disk_free_gb = sanitize(diskTotalGB - diskUsedGB);

msg.payload = t;

msg.query = `
    INSERT INTO public.machine_telemetry 
    ("time", machine_id, cpu_cores, cpu_load_percent, ram_total_mb, ram_used_mb, ram_free_mb, disk_total_gb, disk_used_gb, disk_free_gb)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
`;

msg.params = [
    t.time_stamp,
    t.machine_id,
    sanitize(t.cpu_cores),
    sanitize(t.cpu_avg_load),
    t.ram_total_mb,
    t.ram_used_mb,
    t.ram_free_mb,
    t.disk_total_gb,
    t.disk_used_gb,
    t.disk_free_gb
];

return msg;
```

- [ ] **Step 2: Restart Node-RED to apply changes**

```bash
docker compose restart node-red
```

Expected: Container restarts without errors.

- [ ] **Step 3: Verify Node-RED is accessible**

```bash
curl -s http://localhost:1880/ | head -5
```

Expected: HTML response from Node-RED dashboard.

- [ ] **Step 4: Commit changes**

```bash
git add nodered_data/flows.json
git commit -m "feat: add circuit breaker pattern to Node-RED parser"
```

---

## Task 5: Grafana Dashboard Aesthetic Precision

**Covers:** [S4]

**Files:**
- Modify: `C:\Projects\IMS\monitoring\grafana_dashboard_export.json`

- [ ] **Step 1: Update RAM Usage panel with correct units**

Find the RAM Usage panel (id: 2) and update `fieldConfig.defaults`:

```json
"defaults": {
  "unit": "decbytes",
  "min": 0,
  "max": 16777216,
  "thresholds": {
    "mode": "absolute",
    "steps": [
      { "color": "green", "value": null },
      { "color": "yellow", "value": 10485760 },
      { "color": "red", "value": 13631488 }
    ]
  },
  "custom": {
    "fillOpacity": 20,
    "lineWidth": 2,
    "spanNulls": true,
    "gradientMode": "scheme",
    "thresholdsStyle": {
      "mode": "line+area"
    }
  }
}
```

- [ ] **Step 2: Update Disk Usage panel with correct units**

Find the Disk Usage panel (id: 3) and update `fieldConfig.defaults`:

```json
"defaults": {
  "unit": "decbytes",
  "min": 0,
  "max": 536870912000,
  "thresholds": {
    "mode": "absolute",
    "steps": [
      { "color": "blue", "value": null },
      { "color": "orange", "value": 375809638400 },
      { "color": "red", "value": 483183820800 }
    ]
  },
  "custom": {
    "fillOpacity": 20,
    "lineWidth": 2,
    "spanNulls": true,
    "gradientMode": "scheme",
    "thresholdsStyle": {
      "mode": "line+area"
    }
  }
}
```

- [ ] **Step 3: Update CPU Load panel with fixed Y-axis**

Find the CPU Load panel (id: 1) and update `fieldConfig.defaults`:

```json
"defaults": {
  "unit": "percent",
  "min": 0,
  "max": 100,
  "thresholds": {
    "mode": "absolute",
    "steps": [
      { "color": "green", "value": null },
      { "color": "yellow", "value": 70 },
      { "color": "red", "value": 90 }
    ]
  },
  "custom": {
    "fillOpacity": 15,
    "lineWidth": 2,
    "spanNulls": true,
    "gradientMode": "scheme",
    "thresholdsStyle": {
      "mode": "line+area"
    }
  }
}
```

- [ ] **Step 4: Verify dashboard JSON is valid**

```bash
python -m json.tool C:/Projects/IMS/monitoring/grafana_dashboard_export.json > /dev/null && echo "Valid JSON"
```

Expected: "Valid JSON" output.

- [ ] **Step 5: Commit changes**

```bash
git add monitoring/grafana_dashboard_export.json
git commit -m "feat: optimize dashboard aesthetics with correct units and colors"
```

---

## Task 6: Full System Restart and Validation

**Covers:** [S1, S2, S3, S4, S5]

**Files:**
- None (validation only)

- [ ] **Step 1: Restart all services**

```bash
docker compose down && docker compose up -d
```

Expected: All containers start successfully.

- [ ] **Step 2: Verify all containers are running**

```bash
docker compose ps
```

Expected: All 6 containers show "Up" status.

- [ ] **Step 3: Verify SNMP data is flowing with dynamic values**

```bash
docker exec ims-timescaledb psql -U postgres -d ims-timescaledb -c "SELECT machine_id, cpu_load_percent, ram_used_mb FROM public.machine_telemetry ORDER BY time DESC LIMIT 4;"
```

Expected: CPU values should vary between machines and show different values (not static).

- [ ] **Step 4: Verify Grafana is accessible**

```bash
curl -s http://localhost:3000/api/health
```

Expected: `{"database":"ok"}` response.

- [ ] **Step 5: Verify Alertmanager is healthy**

```bash
curl -s http://localhost:9093/-/healthy
```

Expected: "OK" response.

---

## Self-Review Checklist

- [ ] **Spec coverage:** All 5 phases (S1-S5) covered by tasks
- [ ] **Placeholder scan:** No TBD/TODO placeholders found
- [ ] **Type consistency:** File paths and commands are consistent across tasks
- [ ] **YAML validity:** docker-compose.yaml changes are syntactically correct
- [ ] **JSON validity:** Dashboard JSON is valid
