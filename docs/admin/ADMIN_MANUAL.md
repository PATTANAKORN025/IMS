# 🛠️ System Administration & SRE Guide

> **คู่มือสำหรับทีม IT (MIS-G) ในการดูแลระบบ IMS**
> ครอบคลุม Docker management, device registration, alert management, troubleshooting

---

<div align="center">

![Admin](https://img.shields.io/badge/Admin-SRE%20Guide-green)
![Version](https://img.shields.io/badge/Version-1.0-blue)
![Audience](https://img.shields.io/badge/Audience-IT%20Team-purple)

</div>

---

## 📑 Table of Contents

1. [System Management](#-system-management)
2. [Adding New Devices](#-adding-new-devices)
3. [Alert Management](#-alert-management)
4. [Troubleshooting](#-troubleshooting)
5. [Backup & Recovery](#-backup--recovery)
6. [Performance Monitoring](#-performance-monitoring)

---

## 🐳 System Management

### Container Overview

ระบบทำงานบน Docker Compose ทั้งหมด 8 containers:

| Container | Service | Port | Purpose |
|---|---|---|---|
| `ims-timescaledb` | TimescaleDB | 5432 (internal) | Time-series database |
| `ims-pgbouncer` | PgBouncer | 5432 (internal) | Connection pooler |
| `ims-node-red` | Node-RED | 1880 | Data pipeline |
| `ims-grafana` | Grafana | 3000 | Dashboard |
| `ims-prometheus` | Prometheus | 9090 | Metrics & alerting |
| `ims-alertmanager` | Alertmanager | 9093 | Alert routing |
| `ims-blackbox` | Blackbox Exporter | 9115 | SLA probes |
| `ims-snmpsim` | SNMP Simulator | 161/udp | Dev testing |

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
docker compose restart prometheus alertmanager

# ดู Real-time Log (Last 50 lines)
docker compose logs -f --tail 50 node-red
docker compose logs -f --tail 50 pgbouncer

# ตรวจสอบ Resource Usage
docker stats --no-stream
```

> 💡 **Note:** หลัง `docker compose down -v` ต้องรอ 40 วินาทีให้ระบบทั้งหมด startup ก่อนตรวจสอบ

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

---

## 📱 Adding New Devices

### Step 1: Register in Database

```sql
-- เพิ่มเครื่องใหม่ใน device registry (single source of truth)
INSERT INTO public.devices (device_id, hostname, ip_address, snmp_community, snmp_port, enabled)
VALUES ('NEW-MACHINE-01', '192.168.1.100', '192.168.1.100', 'public', 161, true);

-- ตรวจสอบ
SELECT device_id, hostname, snmp_community, enabled FROM public.devices WHERE device_id = 'NEW-MACHINE-01';
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

## ⚠️ Alert Management

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

## 🔧 Troubleshooting

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

# 3. ตรวจสอบ 8 containers
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

## 💾 Backup & Recovery

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
# node-red/flows/ คือ source of truth ที่ git ดูแลอยู่แล้ว
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

# Backup Prometheus config
cp monitoring/prometheus/prometheus.yml monitoring/prometheus/prometheus.yml.bak
cp monitoring/prometheus/rules/ims-alerts.yml monitoring/prometheus/rules/ims-alerts.yml.bak

# Backup Grafana dashboards
cp -r monitoring/grafana/dashboards/ monitoring/grafana/dashboards.bak/
```

---

## 📊 Performance Monitoring

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

**IMS Admin Manual — Version 1.0**

*For IT Team & MIS-G*

</div>
