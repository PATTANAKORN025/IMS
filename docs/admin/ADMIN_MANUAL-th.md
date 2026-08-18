# <img src="docs/assets/icons/wrench.svg" width="18" height="18" align="center" /> System Administration & SRE Guide

> **คู่มือสำหรับทีม IT (MIS-G) ดูแลระบบ IMS**
> ครอบคลุม Docker management, device registration, alert management, troubleshooting

---

<div align="center">

![Admin](https://img.shields.io/badge/Admin-SRE%20Guide-green)
![Version](https://img.shields.io/badge/Version-1.1-blue)
![Audience](https://img.shields.io/badge/Audience-IT%20Team-purple)

</div>

---

## Table of Contents

1. [System Management](#system-management)
2. [Adding New Devices](#adding-new-devices)
3. [Alert Management](#alert-management)
4. [Troubleshooting](#troubleshooting)
5. [Backup & Recovery](#backup--recovery)
6. [Performance Monitoring](#-performance-monitoring)

---

## System Management

### Container Overview

ระบบใช้ Docker Compose 14 services (13 long-running + 1 one-shot migration runner):

| Container              | Service           | Port            | Purpose                                                                             |
| ---------------------- | ----------------- | --------------- | ----------------------------------------------------------------------------------- |
| `ims-timescaledb`      | TimescaleDB       | 5432 (loopback) | Time-series database                                                                |
| `ims-pgbouncer`        | PgBouncer         | 5432 (internal) | Connection pooler                                                                   |
| `ims-db-migrate`       | Migration runner  | — (one-shot)    | รัน `database/migrations/*.sql`, block `node-red` และ `alarm-api`                   |
| `ims-node-red`         | Node-RED          | 1880 (loopback) | Data pipeline                                                                       |
| `ims-proxy`            | nginx proxy       | **3000**        | Entry point หลักของ Grafana และ `alarm-api`. กั้น `/alarm-api/` ด้วย `auth_request` |
| `ims-grafana`          | Grafana           | internal        | Dashboard — เข้าผ่าน `ims-proxy`                                                    |
| `ims-alarm-api`        | alarm-api         | internal        | Write path สำหรับ `public.ldi_alarm_lifecycle`. เข้าผ่าน `ims-proxy`                |
| `ims-grafana-renderer` | Grafana Renderer  | 8081 (internal) | Render PNG สำหรับ alert                                                             |
| `ims-prometheus`       | Prometheus        | 9090 (loopback) | Metrics & alerting                                                                  |
| `ims-alertmanager`     | Alertmanager      | 9093 (loopback) | Alert routing                                                                       |
| `ims-blackbox`         | Blackbox Exporter | 9115 (loopback) | SLA probes                                                                          |
| `ims-snmpsim`          | SNMP Simulator    | 161/udp         | Dev testing                                                                         |

> `ims-db-migrate` จบด้วยสถานะ 0 เมื่อรัน migration เสร็จ. สถานะ `Exited (0)` ใน `docker compose ps` คือปกติ. `node-red` และ `alarm-api` จะไม่เริ่มทำงานจนกว่า service นี้จะเสร็จ.

### Common Operations

```bash
# ตรวจสอบสถานะ
docker compose ps

# เริ่มระบบ
docker compose up -d

# ปิดระบบ
docker compose down

# Clean Restart (ลบข้อมูล, เริ่มใหม่)
docker compose down -v && docker compose up -d

# Restart service
docker compose restart node-red
docker compose restart pgbouncer
docker compose restart grafana
docker compose restart proxy
docker compose restart alarm-api
docker compose restart prometheus alertmanager

# ดู Log (Last 50 lines)
docker compose logs -f --tail 50 node-red
docker compose logs -f --tail 50 pgbouncer

# ตรวจสอบ Resource Usage
docker stats --no-stream
```

> [!NOTE]
>
> > หลัง `docker compose down -v` รอ 40 วินาทีให้ระบบเริ่มทำงานทั้งหมดก่อนตรวจสอบ.

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

โฟลเดอร์ `database/migrations/` มี 54 ไฟล์ (`013` ถึง `079`). นำไปใช้โดย `ims-db-migrate` ทุกครั้งที่รัน `docker compose up`. `node-red` และ `alarm-api` จะรอจนกว่าสำเร็จ.

```bash
# รัน migration ด้วยมือ
bash scripts/migrate.sh

# ตรวจสอบว่าใช้งานถึงไหนแล้ว
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT version, filename, applied_at FROM public.schema_migrations ORDER BY version DESC LIMIT 10;"
```

---

## Pre-Production Security Checklist

> **CRITICAL:** ก่อนขึ้น production ต้องเปลี่ยน default credentials ทั้งหมด.

| Credential               | Default Value      | Location                       | Action Required                            |
| ------------------------ | ------------------ | ------------------------------ | ------------------------------------------ |
| `INGEST_API_KEY`         | `ims-secret-key`   | `.env` + `docker-compose.yaml` | **CHANGE** — ป้องกัน inject telemetry ปลอม |
| `POSTGRES_PASSWORD`      | `change-me-please` | `.env`                         | **CHANGE** — Database superuser            |
| `GRAFANA_ADMIN_PASSWORD` | `change-me-please` | `.env`                         | **CHANGE** — Dashboard admin               |
| `ALARM_API_DB_PASSWORD`  | `change-me-please` | `.env`                         | **CHANGE** — สิทธิ์ของ `alarm_api_writer`  |

### How to Rotate

```bash
# 1. สร้าง secrets ใหม่
NEW_API_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
NEW_DB_PASS=$(python -c "import secrets; print(secrets.token_urlsafe(24))")
NEW_GRAFANA_PASS=$(python -c "import secrets; print(secrets.token_urlsafe(24))")
NEW_ALARM_API_DB_PASS=$(python -c "import secrets; print(secrets.token_urlsafe(24))")

# 2. แก้ไข .env
sed -i "s/^INGEST_API_KEY=.*/INGEST_API_KEY=$NEW_API_KEY/" .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_DB_PASS/" .env
sed -i "s/^GRAFANA_ADMIN_PASSWORD=.*/GRAFANA_ADMIN_PASSWORD=$NEW_GRAFANA_PASS/" .env
sed -i "s/^ALARM_API_DB_PASSWORD=.*/ALARM_API_DB_PASSWORD=$NEW_ALARM_API_DB_PASS/" .env

# 3. อัปเดต passwords ใน DB
docker compose exec -T timescaledb psql -U ims_admin -d ims \
 -c "ALTER ROLE grafana_reader WITH PASSWORD '$NEW_DB_PASS';"
docker compose exec -T timescaledb psql -U ims_admin -d ims \
 -c "ALTER ROLE alarm_api_writer WITH PASSWORD '$NEW_ALARM_API_DB_PASS';"

# 4. Restart ระบบ
docker compose up -d

# 5. ตรวจสอบ
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
curl -s -X POST http://localhost:1880/inject \
 -H "Content-Type: application/json" \
 -H "x-api-key: $NEW_API_KEY" \
 -d '{"machine_id":"TEST"}'
```

### Verification Commands

```bash
# ตรวจสอบ API Key
curl -s -w "\nHTTP: %{http_code}" -X POST http://localhost:1880/inject \
 -H "Content-Type: application/json" -d '{"machine_id":"TEST"}'
# Expected: HTTP 401

# ตรวจสอบ Grafana
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/dashboards
# Expected: 401
```

---

## Adding New Devices

### Step 1: Register in Database

`public.devices` ใช้ `device_type` เป็น `'server'` (default) หรือ `'ldi'`. ระบุให้ถูก.

```sql
-- เพิ่ม server ใหม่ (SNMP-polled)
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, snmp_community, snmp_port, enabled)
VALUES ('NEW-MACHINE-01', '192.168.1.100', '192.168.1.100', 'server', 'public', 161, true);

-- เพิ่ม LDI machine ใหม่
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, enabled)
VALUES ('LDI-11', 'LDI-11', '', 'ldi', true);

-- ตรวจสอบ
SELECT device_id, hostname, device_type, snmp_community, enabled FROM public.devices WHERE device_id IN ('NEW-MACHINE-01', 'LDI-11');
```

### Step 2: Verify SNMP Connectivity

```bash
# ทดสอบ SNMP จาก Node-RED
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
# รอ 30 วินาที
sleep 30

# ตรวจสอบข้อมูล
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
 FROM public.sys_metrics s
 WHERE device_id = 'NEW-MACHINE-01'
 GROUP BY device_id;"
```

### Step 4: Add Dashboard Panel (Optional)

1. Grafana → Dashboard → Edit
2. เพิ่ม panel
3. Query: `SELECT time, cpu_load_percent FROM public.sys_metrics WHERE device_id IN (\${machine_id:sqlstring}) ORDER BY time DESC`
4. บันทึก

---

## Alert Management

### Alert Rules Location

ไฟล์: `monitoring/prometheus/rules/ims-alerts.yml`

### Editing Alert Rules

```yaml
- alert: HighCpuLoad
 # 80% -> 85%
 expr: avg_over_time(cpu_load_percent[5m]) > 85
 for: 5m
 labels:
 severity: warning
 annotations:
 summary: "High CPU load on {{ $labels.machine_id }}"
 description: "CPU load {{ $value }}% exceeds threshold 85%"

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
# Reload rules
curl -X POST http://localhost:9090/-/reload

# เช็ค Syntax
docker compose exec prometheus promtool check rules /etc/prometheus/rules/ims-alerts.yml
```

### Inhibition Rules

| Source Alert               | Suppressed Alerts | Scope                    |
| -------------------------- | ----------------- | ------------------------ |
| `InterfaceDown` (critical) | Warning ทั้งหมด   | Same machine             |
| `ServiceDown` (critical)   | Warning ทั้งหมด   | Same machine             |
| `NodeREDDown`              | `TelemetryGap`    | Global                   |
| `Critical`                 | `Warning`, `Info` | Same alertname + machine |

---

## Troubleshooting

### Common Issues & Solutions

| Issue                       | Cause                  | Fix                                                            |
| --------------------------- | ---------------------- | -------------------------------------------------------------- |
| Grafana "No Data"           | PgBouncer เต็ม, DB ล่ม | `docker restart ims-pgbouncer`, เช็ค disk                      |
| Alert ไม่แจ้งเตือน          | Webhook ขาด            | เช็ค Node-RED log (`POST/alert-webhook`)                       |
| Bandwidth กระโดด Tbps       | 32-bit Counter Wrap    | เช็ค 64-bit HC support ของอุปกรณ์                              |
| Node-RED ไม่รัน             | Flow JSON ผิด          | `docker compose logs --tail=50 node-red`                       |
| Continuous Aggregate ว่าง   | ต้อง refresh           | `CALL refresh_continuous_aggregate('sys_hourly', NULL, NULL);` |
| Container แจ้ง "Restarting" | Config ผิด, port ชน    | เช็ค log ของ container นั้น                                    |

### SRE Verification Protocol

```bash
# 1. Clean Restart
docker compose down -v && docker compose up -d

# 2. รอ 40 วินาที
sleep 40

# 3. เช็ค containers
docker compose ps

# 4. เช็คข้อมูลเข้า DB
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
FROM public.sys_metrics s JOIN public.devices d ON d.device_id = s.device_id
WHERE s.time > NOW() - INTERVAL '5 minutes'
GROUP BY device_id;"

# 5. เช็ค Continuous Aggregates
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT bucket, avg_cpu, max_temp
FROM public.sys_hourly
ORDER BY bucket DESC LIMIT 4;"

# 6. เช็ค Grafana
curl -sf http://localhost:3000/api/health

# 7. เช็ค Prometheus
curl -sf http://localhost:9090/api/v1/targets | python3 -c "
import sys, json
data = json.load(sys.stdin)
ups = sum(1 for t in data['data']['activeTargets'] if t['health'] == 'up')
total = len(data['data']['activeTargets'])
print(f'Prometheus: {ups}/{total} targets UP')
"
```

---

## Backup & Recovery

### Database Backup

```bash
# Backup
docker compose exec timescaledb pg_dump -U ims_admin ims > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260627.sql | docker compose exec -T timescaledb psql -U ims_admin -d ims

# Cron
0 2 * * * docker compose exec timescaledb pg_dump -U ims_admin ims > /backup/ims_$(date +\%Y\%m\%d).sql
```

### Flow Backup

```bash
# Backup
cp nodered_data/flows.json nodered_data/flows.json.bak

# Restore
cp nodered_data/flows.json.bak nodered_data/flows.json
docker compose restart node-red
```

### Configuration Backup

```bash
cp docker-compose.yaml docker-compose.yaml.bak
cp docker-compose.prod.yaml docker-compose.prod.yaml.bak
cp proxy/nginx.conf proxy/nginx.conf.bak
cp monitoring/prometheus/prometheus.yml monitoring/prometheus/prometheus.yml.bak
cp monitoring/prometheus/rules/ims-alerts.yml monitoring/prometheus/rules/ims-alerts.yml.bak
cp -r monitoring/grafana/dashboards/ monitoring/grafana/dashboards.bak/
```

---

## <img src="docs/assets/icons/activity.svg" width="18" height="18" align="center" /> Performance Monitoring

### System Metrics

```bash
# Resource usage
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# DB connections
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active';"

# DB size
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT pg_size_pretty(pg_database_size('ims')) as database_size;"

# Table sizes
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;"
```

### Prometheus Metrics

```bash
# Scrape duration
curl -s http://localhost:9090/api/v1/query?query=prometheus_scrape_duration_seconds

# Ingested samples
curl -s http://localhost:9090/api/v1/query?query=prometheus_tsdb_head_samples_appended_total

# Alerts
curl -s http://localhost:9090/api/v1/alerts | python3 -c "import json, sys; data = json.load(sys.stdin); print(f'Active alerts: {len(data[\"data\"][\"alerts\"])}')"
```

### Log Analysis

```bash
# Errors
docker compose logs node-red 2>&1 | grep -i "error" | tail -20
docker compose logs prometheus 2>&1 | grep -i "error" | tail -20
docker compose logs alertmanager 2>&1 | grep -i "error" | tail -20

# Slow DB queries
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT query, calls, mean_time, total_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"
```

---

<div align="center">

**IMS Admin Manual — Version 1.1**

_For IT Team & MIS-G_

</div>
