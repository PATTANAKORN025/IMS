# NOC Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the IMS monitoring system from static data to a production-grade NOC with dynamic simulation, aesthetic dashboards, smart alerting, and risk mitigation.

**Architecture:** 4-phase upgrade: (1) Dynamic SNMP simulation with fluctuating values, (2) NOC-grade Grafana dashboard with Stat panels and gradient time series, (3) Grafana alerting rules with Alertmanager integration, (4) Memory/disk limits for risk mitigation.

**Tech Stack:** SNMP Simulator (tandrup/snmpsim), Node-RED 4.0.5, TimescaleDB 2.17.2-pg16, Grafana OSS 11.1.0, Alertmanager 0.27.0

---

## Task 1: Dynamic SNMP Simulation

**Covers:** [S1]

**Files:**
- Modify: `C:\Projects\IMS\monitoring\snmpsim\Netk@.snmprec`

- [ ] **Step 1: Replace static OIDs with dynamic variations**

Replace the entire content of `Netk@.snmprec` with:

```text
# --- 1. Storage Types (.25.2...) ---
1.3.6.1.2.1.25.2.3.1.2.1|6|1.3.6.1.2.1.25.2.1.2
1.3.6.1.2.1.25.2.3.1.2.2|6|1.3.6.1.2.1.25.2.1.4

# --- 2. Storage Descriptions ---
1.3.6.1.2.1.25.2.3.1.3.1|4|Physical Memory
1.3.6.1.2.1.25.2.3.1.3.2|4|C:\ Label:System

# --- 3. Storage Allocation Units ---
1.3.6.1.2.1.25.2.3.1.4.1|2|1024
1.3.6.1.2.1.25.2.3.1.4.2|2|4096

# --- 4. Storage Total Size (Fixed) ---
1.3.6.1.2.1.25.2.3.1.5.1|2|16777216
1.3.6.1.2.1.25.2.3.1.5.2|2|131072000

# --- 5. DYNAMIC Storage Used (Fluctuates) ---
# RAM: fluctuates between 4GB-14GB
1.3.6.1.2.1.25.2.3.1.6.1|2:numeric|min=4194304,max=14680064,rate=102400
# Disk: grows gradually (simulates log accumulation)
1.3.6.1.2.1.25.2.3.1.6.2|2:numeric|min=65536000,max=120000000,rate=50000

# --- 6. DYNAMIC CPU Cores (Fluctuates 10-99%) ---
1.3.6.1.2.1.25.3.3.1.2.1|2:numeric|min=10,max=95,rate=5
1.3.6.1.2.1.25.3.3.1.2.2|2:numeric|min=15,max=80,rate=3
1.3.6.1.2.1.25.3.3.1.2.3|2:numeric|min=5,max=99,rate=8
1.3.6.1.2.1.25.3.3.1.2.4|2:numeric|min=20,max=75,rate=4
```

- [ ] **Step 2: Restart SNMP Simulator**

```bash
docker compose restart ims-snmpsim
```

Expected: Container restarts without errors.

- [ ] **Step 3: Verify dynamic values**

```bash
docker exec ims-snmpsim snmpwalk -v2c -c Netk@ localhost:161 1.3.6.1.2.1.25.3.3.1.2
```

Expected: CPU values should show different numbers each time you run this command (fluctuating).

- [ ] **Step 4: Verify data flow in Node-RED**

```bash
curl -s http://localhost:1880/ | head -20
```

Expected: Node-RED dashboard accessible, no errors in debug sidebar.

---

## Task 2: NOC Dashboard - Stat Overview Panels

**Covers:** [S2]

**Files:**
- Modify: `C:\Projects\IMS\monitoring\grafana_dashboard_export.json`

- [ ] **Step 1: Add Stat panels to dashboard JSON**

Add these panels to the `panels` array in `grafana_dashboard_export.json`:

```json
{
  "id": 10,
  "title": "CPU Overview",
  "type": "stat",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "h": 4, "w": 6, "x": 0, "y": 0 },
  "fieldConfig": {
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
      "color": { "mode": "thresholds" }
    }
  },
  "options": {
    "colorMode": "background",
    "graphMode": "area",
    "justifyMode": "auto",
    "textMode": "auto",
    "reduceOptions": {
      "calcs": ["lastNotNull"],
      "fields": "",
      "values": false
    }
  },
  "targets": [{
    "refId": "A",
    "rawSql": "SELECT AVG(cpu_load_percent) AS \"CPU Avg\" FROM public.machine_telemetry WHERE $__timeFilter(time) AND machine_id = 'ERP-MASTER-UBUNTU'"
  }]
},
{
  "id": 11,
  "title": "RAM Overview",
  "type": "stat",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "h": 4, "w": 6, "x": 6, "y": 0 },
  "fieldConfig": {
    "defaults": {
      "unit": "decmbytes",
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "green", "value": null },
          { "color": "yellow", "value": 10000 },
          { "color": "red", "value": 13000 }
        ]
      },
      "color": { "mode": "thresholds" }
    }
  },
  "options": {
    "colorMode": "background",
    "graphMode": "area",
    "justifyMode": "auto"
  },
  "targets": [{
    "refId": "A",
    "rawSql": "SELECT ram_used_mb AS \"RAM Used\" FROM public.machine_telemetry WHERE $__timeFilter(time) AND machine_id = 'ERP-MASTER-UBUNTU' ORDER BY time DESC LIMIT 1"
  }]
},
{
  "id": 12,
  "title": "CPU Overview (Windows)",
  "type": "stat",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "h": 4, "w": 6, "x": 12, "y": 0 },
  "fieldConfig": {
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
      "color": { "mode": "thresholds" }
    }
  },
  "options": {
    "colorMode": "background",
    "graphMode": "area",
    "justifyMode": "auto"
  },
  "targets": [{
    "refId": "A",
    "rawSql": "SELECT AVG(cpu_load_percent) AS \"CPU Avg\" FROM public.machine_telemetry WHERE $__timeFilter(time) AND machine_id = 'ERP-MASTER-WINDOWS'"
  }]
},
{
  "id": 13,
  "title": "RAM Overview (Windows)",
  "type": "stat",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "h": 4, "w": 6, "x": 18, "y": 0 },
  "fieldConfig": {
    "defaults": {
      "unit": "decmbytes",
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "green", "value": null },
          { "color": "yellow", "value": 10000 },
          { "color": "red", "value": 13000 }
        ]
      },
      "color": { "mode": "thresholds" }
    }
  },
  "options": {
    "colorMode": "background",
    "graphMode": "area",
    "justifyMode": "auto"
  },
  "targets": [{
    "refId": "A",
    "rawSql": "SELECT ram_used_mb AS \"RAM Used\" FROM public.machine_telemetry WHERE $__timeFilter(time) AND machine_id = 'ERP-MASTER-WINDOWS' ORDER BY time DESC LIMIT 1"
  }]
}
```

- [ ] **Step 2: Verify dashboard JSON is valid**

```bash
cat C:/Projects/IMS/monitoring/grafana_dashboard_export.json | python -m json.tool > /dev/null && echo "Valid JSON"
```

Expected: "Valid JSON" output.

---

## Task 3: NOC Dashboard - Enhanced Time Series

**Covers:** [S2]

**Files:**
- Modify: `C:\Projects\IMS\monitoring\grafana_dashboard_export.json`

- [ ] **Step 1: Update CPU Load panel with gradient and thresholds**

Update the existing CPU Load panel (id: 1) `fieldConfig.defaults.custom` section:

```json
"custom": {
  "fillOpacity": 20,
  "lineWidth": 2,
  "spanNulls": true,
  "lineInterpolation": "smooth",
  "gradientMode": "scheme",
  "thresholdsStyle": {
    "mode": "line+area"
  }
}
```

Update the thresholds to:

```json
"thresholds": {
  "mode": "absolute",
  "steps": [
    { "color": "green", "value": null },
    { "color": "yellow", "value": 70 },
    { "color": "red", "value": 90 }
  ]
}
```

- [ ] **Step 2: Update tooltip mode to show all series**

Add to panel options:

```json
"options": {
  "tooltip": {
    "mode": "multi",
    "sort": "desc"
  },
  "legend": {
    "displayMode": "table",
    "placement": "bottom",
    "calcs": ["mean", "max"]
  }
}
```

- [ ] **Step 3: Apply same enhancements to RAM and Disk panels**

Repeat Steps 1-2 for RAM Usage panel (id: 2) and Disk Usage panel (id: 3).

- [ ] **Step 4: Import updated dashboard to Grafana**

```bash
curl -X POST http://localhost:3000/api/dashboards/import \
  -H "Content-Type: application/json" \
  -u admin:admin \
  -d @C:/Projects/IMS/monitoring/grafana_dashboard_export.json
```

Expected: Dashboard imported successfully, panels show gradient colors and threshold lines.

---

## Task 4: Grafana Alert Rules

**Covers:** [S3]

**Files:**
- Create: `C:\Projects\IMS\monitoring\grafana\provisioning\alerting\rules.yml`

- [ ] **Step 1: Create alert rules provisioning file**

```yaml
apiVersion: 1
groups:
  - orgId: 1
    name: IMS Server Alerts
    folder: IMS Alerts
    interval: 1m
    rules:
      - uid: ims-high-cpu-ubuntu
        title: High CPU Load - Ubuntu
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: timescaledb
            model:
              rawSql: "SELECT AVG(cpu_load_percent) AS cpu_avg FROM public.machine_telemetry WHERE machine_id = 'ERP-MASTER-UBUNTU' AND time > now() - interval '5 minutes'"
              format: time_series
          - refId: C
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: __expr__
            model:
              type: reduce
              expression: A
              reducer: mean
        for: 5m
        labels:
          severity: critical
          server: ubuntu
        annotations:
          summary: "High CPU Load on Ubuntu Server"
          description: "CPU average is {{ $values.C }}% for the last 5 minutes"
      - uid: ims-high-cpu-windows
        title: High CPU Load - Windows
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: timescaledb
            model:
              rawSql: "SELECT AVG(cpu_load_percent) AS cpu_avg FROM public.machine_telemetry WHERE machine_id = 'ERP-MASTER-WINDOWS' AND time > now() - interval '5 minutes'"
              format: time_series
          - refId: C
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: __expr__
            model:
              type: reduce
              expression: A
              reducer: mean
        for: 5m
        labels:
          severity: critical
          server: windows
        annotations:
          summary: "High CPU Load on Windows Server"
          description: "CPU average is {{ $values.C }}% for the last 5 minutes"
      - uid: ims-high-ram-ubuntu
        title: High RAM Usage - Ubuntu
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: timescaledb
            model:
              rawSql: "SELECT AVG(ram_used_mb) AS ram_avg FROM public.machine_telemetry WHERE machine_id = 'ERP-MASTER-UBUNTU' AND time > now() - interval '5 minutes'"
              format: time_series
          - refId: C
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: __expr__
            model:
              type: reduce
              expression: A
              reducer: mean
        for: 5m
        labels:
          severity: warning
          server: ubuntu
        annotations:
          summary: "High RAM Usage on Ubuntu Server"
          description: "RAM average is {{ $values.C }} MB for the last 5 minutes"
```

- [ ] **Step 2: Restart Grafana to load alert rules**

```bash
docker compose restart ims-grafana
```

Expected: Container restarts without errors.

- [ ] **Step 3: Verify alert rules are loaded**

```bash
curl -s http://localhost:3000/api/v1/provisioning/alert-rules -u admin:admin | python -m json.tool | head -30
```

Expected: Shows 3 alert rules (ims-high-cpu-ubuntu, ims-high-cpu-windows, ims-high-ram-ubuntu).

---

## Task 5: Alertmanager Configuration

**Covers:** [S3]

**Files:**
- Modify: `C:\Projects\IMS\monitoring\alertmanager\alertmanager.yml`

- [ ] **Step 1: Update Alertmanager configuration**

Replace the content of `alertmanager.yml` with:

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
    email_configs:
      - to: 'admin@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.example.com:587'
        auth_username: 'alertmanager@example.com'
        auth_password: 'password'
        require_tls: true

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'server']
```

- [ ] **Step 2: Restart Alertmanager**

```bash
docker compose restart ims-alertmanager
```

Expected: Container restarts without errors.

- [ ] **Step 3: Verify Alertmanager is running**

```bash
curl -s http://localhost:9093/-/healthy
```

Expected: "Alive" response.

---

## Task 6: Risk Mitigation - Memory Limits

**Covers:** [S4]

**Files:**
- Modify: `C:\Projects\IMS\docker-compose.yaml`

- [ ] **Step 1: Update Node-RED memory limits**

Update the `node-red` service in `docker-compose.yaml`:

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
          memory: 1.5G
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

- [ ] **Step 2: Verify docker-compose.yaml is valid**

```bash
docker compose config --quiet && echo "Valid YAML"
```

Expected: "Valid YAML" output.

---

## Task 7: Risk Mitigation - PostgreSQL WAL Limit

**Covers:** [S4]

**Files:**
- Modify: `C:\Projects\IMS\docker-compose.yaml`

- [ ] **Step 1: Add max_wal_size to TimescaleDB command**

Update the `timescaledb` service command section:

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
```

- [ ] **Step 2: Verify docker-compose.yaml is valid**

```bash
docker compose config --quiet && echo "Valid YAML"
```

Expected: "Valid YAML" output.

---

## Task 8: Full System Restart and Validation

**Covers:** [S1, S2, S3, S4]

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

Expected: All 6 containers (snmpsim, node-red, timescaledb, grafana, prometheus, alertmanager) show "Up" status.

- [ ] **Step 3: Verify SNMP data is flowing**

```bash
docker exec ims-timescaledb psql -U postgres -d ims-timescaledb -c "SELECT COUNT(*) FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '1 minute';"
```

Expected: Count > 0 (data is being inserted).

- [ ] **Step 4: Verify dynamic values are present**

```bash
docker exec ims-timescaledb psql -U postgres -d ims-timescaledb -c "SELECT machine_id, cpu_load_percent, ram_used_mb FROM public.machine_telemetry ORDER BY time DESC LIMIT 4;"
```

Expected: CPU values should vary between machines and show different values (not static).

- [ ] **Step 5: Verify Grafana is accessible**

```bash
curl -s http://localhost:3000/api/health
```

Expected: `{"database":"ok"}` response.

- [ ] **Step 6: Verify Alertmanager is healthy**

```bash
curl -s http://localhost:9093/-/healthy
```

Expected: "Alive" response.

---

## Self-Review Checklist

- [ ] **Spec coverage:** All 4 phases (S1-S4) covered by tasks
- [ ] **Placeholder scan:** No TBD/TODO placeholders found
- [ ] **Type consistency:** File paths and commands are consistent across tasks
- [ ] **YAML validity:** docker-compose.yaml changes are syntactically correct
- [ ] **JSON validity:** Dashboard JSON is valid
