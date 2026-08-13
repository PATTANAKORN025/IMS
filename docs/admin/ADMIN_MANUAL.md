# ️ System Administration & SRE Guide

> **คู่มือสำหรับทีม IT (MIS-G) ในการดูแลระบบ IMS**
> ครอบคลุม Docker management, device registration, alert management, troubleshooting

---

<div align="center">

![Admin](https://img.shields.io/badge/Admin-SRE%20Guide-green)
![Version](https://img.shields.io/badge/Version-1.1-blue)
![Audience](https://img.shields.io/badge/Audience-IT%20Team-purple)

</div>

---

##  Table of Contents

1. [System Management](#-system-management)
2. [Adding New Devices](#-adding-new-devices)
3. [Alert Management](#-alert-management)
4. [Troubleshooting](#-troubleshooting)
5. [Backup & Recovery](#-backup--recovery)
6. [Performance Monitoring](#-performance-monitoring)

---

##  System Management

### Container Overview

ระบบทำงานบน Docker Compose ทั้งหมด 12 services (11 long-running + 1 one-shot migration runner ที่ทำงานเสร็จแล้ว exit):

| Container | Service | Port | Purpose |
|---|---|---|---|
| `ims-timescaledb` | TimescaleDB | 5432 (loopback only) | Time-series database |
| `ims-pgbouncer` | PgBouncer | 5432 (internal) | Connection pooler |
| `ims-db-migrate` | Migration runner | — (one-shot) | Applies `database/migrations/*.sql`, gates `node-red` and `alarm-api` startup |
| `ims-node-red` | Node-RED | 1880 (loopback only) | Data pipeline |
| `ims-proxy` | nginx reverse proxy | **3000** | The only host-published entry point to Grafana and `alarm-api`. Gates `/alarm-api/` behind an `auth_request` check against Grafana's own session. |
| `ims-grafana` | Grafana | internal only, no host port | Dashboard — reachable only through `ims-proxy` now, not directly |
| `ims-alarm-api` | alarm-api | internal only, no host port | Write path for `public.ldi_alarm_lifecycle` (Acknowledge/Resolve from `IMS LDI - Alarm Console`). Reachable only through `ims-proxy`. |
| `ims-grafana-renderer` | Grafana Image Renderer | 8081 (internal) | PNG rendering for panel export/alerts |
| `ims-prometheus` | Prometheus | 9090 (loopback only) | Metrics & alerting |
| `ims-alertmanager` | Alertmanager | 9093 (loopback only) | Alert routing |
| `ims-blackbox` | Blackbox Exporter | 9115 (loopback only) | SLA probes |
| `ims-snmpsim` | SNMP Simulator | 161/udp | Dev testing |

> `ims-db-migrate` exits with status 0 after applying pending migrations -- seeing it as `Exited (0)` in `docker compose ps` is expected, not a failure. `node-red` and `alarm-api` won't start until it completes successfully.

### Common Operations

```bash
# ตรวจสอบสถานะทั้งหมด
docker compose ps

# เริ่มต้นระบบทั้งหมด
docker compose up -d

# ปิดระบบทั้งหมด
docker compose down

# Clean Restart (ทำลายข้อมูลทั้งหมด เริ่มใหม่)
docker compose down -v && docker compose up -d

# Restart เฉพาะ service ที่มีปัญหา
docker compose restart node-red
docker compose restart pgbouncer
docker compose restart grafana
docker compose restart proxy
docker compose restart alarm-api
docker compose restart prometheus alertmanager

# ดู Real-time Log (Last 50 lines)
docker compose logs -f --tail 50 node-red
docker compose logs -f --tail 50 pgbouncer

# ตรวจสอบ Resource Usage
docker stats --no-stream
```

>  **Note:** หลัง `docker compose down -v` ต้องรอ 40 วินาทีให้ระบบทั้งหมด startup ก่อนตรวจสอบ

### Service Health Checks

```bash
# Database
docker compose exec timescaledb pg_isready -U ims_admin -d ims

# Node-RED
curl -s http://localhost:1880/

# Grafana
curl -s http://localhost:3000/api/health

# Prometheus
curl -s http://localhost:9090/-/healthy

# Alertmanager
curl -s http://localhost:9093/-/healthy
```

### Database Migrations

`database/migrations/` currently has 53 sequenced files (`013` through `078`, with some numbers skipped/archived — earlier numbers `001-012` were folded into `postgres/init/001-init-timescaledb.sql`, the fresh-deploy bootstrap path). Applied automatically by the one-shot `ims-db-migrate` service on every `docker compose up`; `node-red` and `alarm-api` won't start until it exits successfully.

```bash
# Manually re-run migrations without bringing up the rest of the stack
bash scripts/migrate.sh

# Expect this exact line on a healthy, up-to-date database:
#   Pending: 0  Applied: 0  Failed: 0
# "Pending: N" means N migration files exist that schema_migrations doesn't
# have a row for yet -- scripts/migrate.sh will apply them in order.

# Check what's actually been applied
docker compose exec timescaledb psql -U ims_admin -d ims -c \
  "SELECT version, filename, applied_at FROM public.schema_migrations ORDER BY version DESC LIMIT 10;"
```

All migrations are written to be idempotent (`CREATE ... IF NOT EXISTS`, guarded `DO $$ ... $$` blocks) so re-running `scripts/migrate.sh` against an already-current database is always a safe no-op. See `docs/architecture/ARCHITECTURE.md`'s "Migration Governance" section for why there is deliberately exactly one migration runner, not three.

---

## Pre-Production Security Checklist

> **CRITICAL:** Before deploying to production, ALL default credentials MUST be changed. Failure to do so exposes the system to unauthorized access.

| Credential | Default Value | Location | Action Required |
|---|---|---|---|
| `INGEST_API_KEY` | `ims-secret-key` | `.env` + `docker-compose.yaml` (`ims-node-red` env) | **CHANGE** — unauthorized users can inject spoofed telemetry via `POST /inject` |
| `POSTGRES_PASSWORD` | `change-me-please` | `.env` | **CHANGE** — database superuser access |
| `GRAFANA_ADMIN_PASSWORD` | `change-me-please` | `.env` | **CHANGE** — dashboard edit + datasource access |
| `ALARM_API_DB_PASSWORD` | `change-me-please` | `.env` | **CHANGE** — credential for the `alarm_api_writer` role (migration `078-alarm-api-writer-role.sql`); scoped to `SELECT`+`UPDATE` on `ldi_alarm_lifecycle` only, but still a real DB credential |

### How to Rotate

```bash
# 1. Generate new secrets
NEW_API_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
NEW_DB_PASS=$(python -c "import secrets; print(secrets.token_urlsafe(24))")
NEW_GRAFANA_PASS=$(python -c "import secrets; print(secrets.token_urlsafe(24))")
NEW_ALARM_API_DB_PASS=$(python -c "import secrets; print(secrets.token_urlsafe(24))")

# 2. Update .env
sed -i "s/^INGEST_API_KEY=.*/INGEST_API_KEY=$NEW_API_KEY/" .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_DB_PASS/" .env
sed -i "s/^GRAFANA_ADMIN_PASSWORD=.*/GRAFANA_ADMIN_PASSWORD=$NEW_GRAFANA_PASS/" .env
sed -i "s/^ALARM_API_DB_PASSWORD=.*/ALARM_API_DB_PASSWORD=$NEW_ALARM_API_DB_PASS/" .env

# 3. Update grafana_reader and alarm_api_writer DB passwords
docker compose exec -T timescaledb psql -U ims_admin -d ims \
  -c "ALTER ROLE grafana_reader WITH PASSWORD '$NEW_DB_PASS';"
docker compose exec -T timescaledb psql -U ims_admin -d ims \
  -c "ALTER ROLE alarm_api_writer WITH PASSWORD '$NEW_ALARM_API_DB_PASS';"

# 4. Restart all services (pgbouncer re-seeds its userlist.txt from .env on start)
docker compose up -d

# 5. Verify
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
curl -s -X POST http://localhost:1880/inject \
  -H "Content-Type: application/json" \
  -H "x-api-key: $NEW_API_KEY" \
  -d '{"machine_id":"TEST"}'
```

### Verification Commands

```bash
# Confirm INGEST_API_KEY is enforced (should return 401 without key)
curl -s -w "\nHTTP: %{http_code}" -X POST http://localhost:1880/inject \
  -H "Content-Type: application/json" -d '{"machine_id":"TEST"}'
# Expected: HTTP 401

# Confirm Grafana requires login
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/dashboards
# Expected: 401 (not 200)
```

---

##  Adding New Devices

### Step 1: Register in Database

`public.devices` มี `device_type` แยก `'server'` (SNMP-monitored infra, ค่า default) กับ `'ldi'` (LDI manufacturing machine) -- อย่าลืมระบุให้ถูก มิฉะนั้นจะกลายเป็น `'server'` โดยไม่ตั้งใจ และเครื่องจะไม่ขึ้นใน LDI dashboards ใดๆ เลย:

```sql
-- เพิ่ม infra server ใหม่ (SNMP-polled)
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, snmp_community, snmp_port, enabled)
VALUES ('NEW-MACHINE-01', '192.168.1.100', '192.168.1.100', 'server', 'public', 161, true);

-- เพิ่ม LDI machine ใหม่ (ไม่ผ่าน SNMP -- ป้อนข้อมูลผ่าน ldi_ingestion.json / simulator)
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, enabled)
VALUES ('LDI-11', 'LDI-11', '', 'ldi', true);

-- ตรวจสอบ
SELECT device_id, hostname, device_type, snmp_community, enabled FROM public.devices WHERE device_id IN ('NEW-MACHINE-01', 'LDI-11');
```

### Step 2: Verify SNMP Connectivity

```bash
# Test SNMP from Node-RED container
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const session = snmp.createSession('192.168.1.100', 'public', {port: 161, timeout: 5000});
session.get(['1.3.6.1.2.1.1.1.0'], (err, varbinds) => {
    if (err) console.error('ERROR:', err.message);
    else console.log('OK:', varbinds[0].value.toString());
    session.close();
});
"
```

### Step 3: Verify Data Flow

```bash
# รอ 30 วินาทีให้ poll cycle ทำงาน
sleep 30

# ตรวจสอบข้อมูล
docker compose exec timescaledb psql -U ims_admin -d ims -c \
  "SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
   FROM public.sys_metrics s
   WHERE device_id = 'NEW-MACHINE-01'
   GROUP BY device_id;"
```

### Step 4: Add Dashboard Panel (Optional)

ถ้าต้องการ dashboard เฉพาะสำหรับเครื่องใหม่:

1. เปิด Grafana → Dashboard → Edit
2. เพิ่ม panel ใหม่
3. ใช้ query: `SELECT time, cpu_load_percent FROM public.sys_metrics WHERE device_id IN (\${machine_id:sqlstring}) ORDER BY time DESC`
4. บันทึก dashboard

---

## ️ Alert Management

### Alert Rules Location

ไฟล์: `monitoring/prometheus/rules/ims-alerts.yml`

### Editing Alert Rules

**ตัวอย่าง: แก้ไข Threshold ของ High CPU Load:**

```yaml
- alert: HighCpuLoad
  # เปลี่ยนจาก 80% เป็น 85%
  expr: avg_over_time(cpu_load_percent[5m]) > 85
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High CPU load on {{ $labels.machine_id }}"
    description: "CPU load {{ $value }}% exceeds threshold 85%"
```

**ตัวอย่าง: เพิ่ม Alert ใหม่สำหรับ LDI Vibration:**

```yaml
- alert: LDI_Vibration_Critical
  expr: ldi_vibration > 10.0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "LDI vibration critical on {{ $labels.machine_id }}"
    description: "Vibration {{ $value }} mm/s exceeds threshold 10.0"
```

### Reload Configuration

```bash
# หลังแก้ไข alert rules ต้อง reload
curl -X POST http://localhost:9090/-/reload

# ตรวจสอบ syntax
docker compose exec prometheus promtool check rules /etc/prometheus/rules/ims-alerts.yml
```

### Inhibition Rules

ระบบมี Inhibition Rules อัตโนมัติ:

| Source Alert | Suppressed Alerts | Scope |
|---|---|---|
| `InterfaceDown` (critical) | Warning ทั้งหมด | Same machine |
| `ServiceDown` (critical) | Warning ทั้งหมด | Same machine |
| `NodeREDDown` | `TelemetryGap` | Global |
| `Critical` | `Warning`, `Info` | Same alertname + machine |

---

##  Troubleshooting

### Common Issues & Solutions

| ปัญหา | สาเหตุ | วิธีแก้ |
|---|---|---|
| Grafana แสดง "No Data" | PgBouncer connection เต็ม หรือ DB ล่ม | `docker restart ims-pgbouncer` + เช็ค disk space |
| Alert ไม่ส่งไป LINE/Teams | Alertmanager Webhook ขาด | เช็ค Node-RED log ที่ `POST/alert-webhook` node |
| กราฟ Bandwidth กระโดดเป็น Tbps | 32-bit Counter Wrap | Parser จัดการแล้ว แต่ถ้ายังเจอ เช็คว่าอุปกรณ์รองรับ 64-bit HC |
| Node-RED ไม่เริ่มทำงาน | Syntax Error ใน Flow JSON | เช็ค log: `docker compose logs --tail=50 node-red` |
| Continuous Aggregate ไม่มีข้อมูล | ต้อง refresh ด้วยมือ | `CALL refresh_continuous_aggregate('sys_hourly', NULL, NULL);` |
| Container ไม่ขึ้น "Restarting" | Config ผิด หรือ port ชน | เช็ค log ของ container นั้นๆ |

### SRE Verification Protocol

```bash
# 1. Clean Restart
docker compose down -v && docker compose up -d

# 2. รอ 40 วินาที
sleep 40

# 3. ตรวจสอบ containers (11 long-running + ims-db-migrate ที่ควร Exited (0))
docker compose ps

# 4. ตรวจสอบข้อมูลไหล
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
FROM public.sys_metrics s JOIN public.devices d ON d.device_id = s.device_id
WHERE s.time > NOW() - INTERVAL '5 minutes'
GROUP BY device_id;"

# 5. ตรวจสอบ Continuous Aggregates
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT bucket, avg_cpu, max_temp
FROM public.sys_hourly
ORDER BY bucket DESC LIMIT 4;"

# 6. ตรวจสอบ Grafana
curl -sf http://localhost:3000/api/health

# 7. ตรวจสอบ Prometheus Targets
curl -sf http://localhost:9090/api/v1/targets | python3 -c "
import sys, json
data = json.load(sys.stdin)
ups = sum(1 for t in data['data']['activeTargets'] if t['health'] == 'up')
total = len(data['data']['activeTargets'])
print(f'Prometheus: {ups}/{total} targets UP')
"
```

---

##  Backup & Recovery

### Database Backup

```bash
# Backup ทั้ง database
docker compose exec timescaledb pg_dump -U ims_admin ims > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260627.sql | docker compose exec -T timescaledb psql -U ims_admin -d ims

# Automated backup (cron)
0 2 * * * docker compose exec timescaledb pg_dump -U ims_admin ims > /backup/ims_$(date +\%Y\%m\%d).sql
```

### Flow Backup

```bash
# nodered_data/flows/*.json คือ source of truth ที่ git ดูแลอยู่แล้ว
# (built into nodered_data/flows.json by scripts/build-flows.js -- don't hand-edit flows.json)
# สำรอง nodered_data/flows.json (runtime copy)
cp nodered_data/flows.json nodered_data/flows.json.bak

# Restore from backup
cp nodered_data/flows.json.bak nodered_data/flows.json
docker compose restart node-red
```

### Configuration Backup

```bash
# Backup docker-compose files
cp docker-compose.yaml docker-compose.yaml.bak
cp docker-compose.prod.yaml docker-compose.prod.yaml.bak
cp proxy/nginx.conf proxy/nginx.conf.bak

# Backup Prometheus config
cp monitoring/prometheus/prometheus.yml monitoring/prometheus/prometheus.yml.bak
cp monitoring/prometheus/rules/ims-alerts.yml monitoring/prometheus/rules/ims-alerts.yml.bak

# Backup Grafana dashboards
cp -r monitoring/grafana/dashboards/ monitoring/grafana/dashboards.bak/
```

---

##  Performance Monitoring

### System Metrics

```bash
# Container resource usage
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Database connections
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT count(*) as active_connections
FROM pg_stat_activity
WHERE state = 'active';"

# Disk usage
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT pg_size_pretty(pg_database_size('ims')) as database_size;"

# Table sizes
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT relname as table_name,
       pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;"
```

### Prometheus Metrics

```bash
# Scrape duration
curl -s http://localhost:9090/api/v1/query?query=prometheus_scrape_duration_seconds

# Samples ingested
curl -s http://localhost:9090/api/v1/query?query=prometheus_tsdb_head_samples_appended_total

# Alert count
curl -s http://localhost:9090/api/v1/alerts | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'Active alerts: {len(data[\"data\"][\"alerts\"])}')
"
```

### Log Analysis

```bash
# Node-RED errors
docker compose logs node-red 2>&1 | grep -i "error" | tail -20

# Prometheus errors
docker compose logs prometheus 2>&1 | grep -i "error" | tail -20

# Alertmanager errors
docker compose logs alertmanager 2>&1 | grep -i "error" | tail -20

# Database slow queries
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT query, calls, mean_time, total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;"
```

---

<div align="center">

**IMS Admin Manual — Version 1.1**

*For IT Team & MIS-G*

</div>
