# 📘 IMS — User Manual

> **คู่มือการใช้งานสำหรับ IT Support และ NOC Team**
> อธิบายวิธีอ่าน Dashboard, ตีความ metrics, และตอบสนองต่อ alerts

---

<div align="center">

![Manual](https://img.shields.io/badge/Manual-User%20Guide-green)
![Version](https://img.shields.io/badge/Version-1.0-blue)
![Audience](https://img.shields.io/badge/Audience-IT%20Support-purple)

</div>

---

## 📑 Table of Contents

1. [Getting Started](#-getting-started)
2. [Grafana Dashboard Guide](#-grafana-dashboard-guide)
3. [Reading Metrics](#-reading-metrics)
4. [Alert Response Procedures](#-alert-response-procedures)
5. [Common Operations](#-common-operations)
6. [Troubleshooting](#-troubleshooting)
7. [Quick Reference](#-quick-reference)

---

## 🚀 Getting Started

### Accessing the System

| Service | URL | Credentials |
|---|---|---|
| **Grafana Dashboard** | `http://localhost:3000` | admin / admin |
| **Node-RED Editor** | `http://localhost:1880` | (configured in settings) |
| **Prometheus** | `http://localhost:9090` | — |
| **Alertmanager** | `http://localhost:9093` | — |

### Dashboard Overview

เมื่อเข้าสู่ Grafana แล้ว จะพบ 4 dashboards หลัก:

```
📁 IMS Dashboards
├── 📊 NOC Overview          — Executive fleet view (ภาพรวมทั้งหมด)
├── 📊 System Overview       — Server health, disk, network, temperature
├── 📊 Engineering Drilldown — Per-machine deep dive (per-interface)
└── 📊 Capacity Planning     — Forecasting & resource prediction
```

---

## 📊 Grafana Dashboard Guide

### 1. NOC Overview Dashboard

**จุดประสงค์**: ภาพรวมสำหรับผู้บริหารและ NOC team

```
┌─────────────────────────────────────────────────────────────────┐
│  🏭 IMS NOC Overview                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Total       │ │ Healthy     │ │ Warning     │ │ Critical  │ │
│  │ Machines: 5 │ │ Machines: 4 │ │ Alerts: 1   │ │ Alerts: 0 │ │
│  │   🟢        │ │    🟢       │ │    🟡       │ │    🔴     │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Fleet CPU Usage (Last 1 Hour)                            │ │
│  │  [Line chart showing all machines CPU over time]          │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Active Alerts                                            │ │
│  │  [Table of current firing alerts with severity]           │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2. System Overview Dashboard

**จุดประสงค์**: ภาพรวม health ของ servers ทั้งหมด

| Panel | Metrics | Color Coding |
|---|---|---|
| **CPU Usage** | `cpu_load_percent` per core | 🟢 < 60%, 🟡 60-80%, 🔴 > 80% |
| **Memory Usage** | `ram_used_mb / ram_total_mb` | 🟢 < 70%, 🟡 70-85%, 🔴 > 85% |
| **Disk Usage** | `disk_used_gb / disk_total_gb` | 🟢 < 70%, 🟡 70-80%, 🔴 > 80% |
| **Network Traffic** | `rx_mbps`, `tx_mbps` per interface | Blue = RX, Light Blue = TX |
| **Temperature** | `temp_c` | 🟢 < 65°C, 🟡 65-80°C, 🔴 > 80°C |

### 3. Engineering Drilldown Dashboard

**จุดประสงค์**: Deep dive สำหรับ engineer แต่ละเครื่อง

```
┌─────────────────────────────────────────────────────────────────┐
│  🔧 Engineering Drilldown — [Select Machine ▼]                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Network Interface Traffic                                 │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │ eth0 RX: ████████████░░░░ 2.4 Gbps                  │  │ │
│  │  │ eth0 TX: ████████░░░░░░░░ 1.6 Gbps                  │  │ │
│  │  │ wlan0 RX: ████░░░░░░░░░░░ 800 Mbps                  │  │ │
│  │  │ wlan0 TX: ██░░░░░░░░░░░░░ 400 Mbps                  │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────┐ ┌──────────────────────────────────┐ │
│  │  CPU Temperature      │ │  Disk Usage                      │ │
│  │  [Gauge: 72°C]       │ │  [Bar: /dev/sda1 45%, sdb1 62%] │ │
│  └──────────────────────┘ └──────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  LDI Manufacturing Telemetry (if applicable)              │ │
│  │  Throughput: 1250 units/hr | PE: 0.85 | JE: 0.92          │ │
│  │  Humidity: 65% | Power: 2400W | Vibration: 2.1 mm/s       │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Capacity Planning Dashboard

**จุดประสงค์**: Forecasting สำหรับ resource planning

| Panel | What It Shows | Use Case |
|---|---|---|
| **CPU Forecast** | Linear regression slope → when CPU hits 100% | Plan server upgrades |
| **Disk Forecast** | Predicted disk full date | Plan storage expansion |
| **Memory Trend** | Memory usage growth rate | Plan RAM upgrades |
| **Network Capacity** | Bandwidth utilization trend | Plan network upgrades |

---

## 📈 Reading Metrics

### CPU Metrics

| Metric | Unit | Healthy | Warning | Critical |
|---|---|---|---|---|
| `cpu_load_percent` | % | < 60% | 60-80% | > 80% |
| `cpu_cores` | count | — | — | — |

**วิธีอ่าน:**
- **Average CPU** — ค่าเฉลี่ยของทุก cores ในช่วงเวลาที่เลือก
- **Peak CPU** — ค่าสูงสุดที่บันทึกไว้ (อาจเกิด spike ชั่วคราว)
- **CPU per Core** — ดูว่า core ไหนกำลังถูกใช้งานหนัก

**ตัวอย่าง:**
```
Machine: server-01
CPU Load: 72% (Warning)
├── Core 1: 85%  ⚠️
├── Core 2: 45%  ✅
├── Core 3: 78%  ⚠️
└── Core 4: 80%  ⚠️
→ Core 1, 3, 4 กำลังถูกใช้งานหนัก ตรวจสอบว่ามี process ไหนกำลัง run อยู่
```

### Memory Metrics

| Metric | Unit | Healthy | Warning | Critical |
|---|---|---|---|---|
| `ram_used_mb` | MB | — | — | — |
| `ram_total_mb` | MB | — | — | — |
| **Usage %** | % | < 70% | 70-85% | > 85% |

**วิธีอ่าน:**
- **Usage %** = `(ram_used_mb / ram_total_mb) × 100`
- **Available** = `ram_total_mb - ram_used_mb`
- Memory ที่สูงไม่จำเป็นต้องแย่ — Linux ใช้ memory สำหรับ caching

### Network Metrics

| Metric | Unit | Description |
|---|---|---|
| `rx_mbps` | Mbps | Download speed (incoming traffic) |
| `tx_mbps` | Mbps | Upload speed (outgoing traffic) |
| `net_rx_errors` | count | Receive errors (hardware/driver issue) |
| `net_rx_drops` | count | Dropped packets (buffer overflow) |
| `net_if_status` | 1/2 | 1 = UP, 2 = DOWN |

**วิธีอ่าน:**
- **Bandwidth Utilization** = `(rx_mbps / link_speed) × 100`
- **Error Rate** = `net_rx_errors / total_packets × 100`
- **Interface DOWN** = สาย network ขาด หรือ switch port ปิด

**ตัวอย่าง:**
```
Machine: server-01
┌─────────┬──────────┬──────────┬──────────┬──────────┬────────┐
│Interface│ RX Mbps  │ TX Mbps  │ Errors   │ Drops    │ Status │
├─────────┼──────────┼──────────┼──────────┼──────────┼────────┤
│ eth0    │ 1200     │ 850      │ 0        │ 0        │ ✅ UP  │
│ wlan0   │ 320      │ 180      │ 0        │ 12       │ ✅ UP  │
└─────────┴──────────┴──────────┴──────────┴──────────┴────────┘
→ wlan0 มี drops 12 packets — ตรวจสอบ wireless signal
```

### Disk Metrics

| Metric | Unit | Healthy | Warning | Critical |
|---|---|---|---|---|
| `disk_used_gb` | GB | — | — | — |
| `disk_total_gb` | GB | — | — | — |
| **Usage %** | % | < 70% | 70-80% | > 80% |

**วิธีอ่าน:**
- **Usage %** = `(disk_used_gb / disk_total_gb) × 100`
- **Free Space** = `disk_total_gb - disk_used_gb`
- **IOPS** = จำนวน operations ต่อวินาที (ถ้ามี metric เพิ่มเติม)

### Temperature Metrics

| Metric | Unit | Healthy | Warning | Critical |
|---|---|---|---|---|
| `temp_c` | °C | < 65°C | 65-80°C | > 80°C |

**วิธีอ่าน:**
- **Average Temp** — อุณหภูมิเฉลี่ย
- **Max Temp** — อุณหภูมิสูงสุด (peak temperature)
- **Temperature Trend** — กำลังเพิ่มขึ้นหรือลดลง

---

## 🚨 Alert Response Procedures

### Alert Severity Levels

| Level | Color | Response Time | Example |
|---|---|---|---|
| **Critical** | 🔴 Red | ทันที (< 15 นาที) | InterfaceDown, ServiceDown, CriticalCPU |
| **Warning** | 🟡 Yellow | เร็ว (< 1 ชั่วโมง) | HighCPU, HighMemory, DiskSpaceLow |
| **Info** | 🔵 Blue | ตามปกติ (< 4 ชั่วโมง) | TelemetryGap, PredictiveDiskFull |

### Incident Response Playbook

#### 🚨 Scenario 1: InterfaceDown (Critical)

```
Symptoms:
- Alert: InterfaceDown on server-01
- Network panels show "No Data"
- Other machines still reporting

Investigation Steps:
1. SSH to server-01 → check network cable
2. Check switch port status
3. Run: ip link show eth0
4. Check if interface is UP

Resolution:
- Reseat network cable
- Check switch configuration
- Restart network service: systemctl restart networking
- Verify: ping gateway

Escalation:
- If physical cable is fine → contact network team
- If switch port is down → contact data center team
```

#### ⚠️ Scenario 2: HighCPUUsage (Warning)

```
Symptoms:
- Alert: HighCPUUsage on server-01
- CPU panels showing > 80%
- System may be slow

Investigation Steps:
1. SSH to server-01
2. Run: top -bn1 | head -20
3. Identify top CPU-consuming processes
4. Check if scheduled job is running

Resolution:
- If legitimate workload → monitor, no action needed
- If rogue process → kill or renice
- If OOM → add swap or increase RAM

Escalation:
- If persistent > 1 hour → check with application team
- If affecting other services → consider scaling
```

#### ⚠️ Scenario 3: DiskSpaceLow (Warning)

```
Symptoms:
- Alert: DiskSpaceLow on server-01
- Disk panels showing > 80%

Investigation Steps:
1. SSH to server-01
2. Run: df -h
3. Run: du -sh /* | sort -rh | head -10
4. Identify large files/directories

Resolution:
- Clean logs: journalctl --vacuum-size=500M
- Remove old backups: find /backup -mtime +30 -delete
- Compress large files: gzip largefile.log
- Archive to cold storage

Escalation:
- If disk usage continues → plan storage expansion
- If critical (> 95%) → immediate cleanup required
```

#### 🔴 Scenario 4: ServiceDown (Critical)

```
Symptoms:
- Alert: ServiceDown on server-01
- Blackbox probe failing
- Application may be unreachable

Investigation Steps:
1. Check service status: systemctl status <service>
2. Check service logs: journalctl -u <service> -n 50
3. Check port binding: netstat -tlnp | grep <port>
4. Check firewall: iptables -L -n

Resolution:
- Restart service: systemctl restart <service>
- Check configuration: <service> -t (test config)
- Verify firewall rules
- Check dependent services

Escalation:
- If service won't start → check application logs
- If port conflict → identify conflicting process
- If system-level issue → contact system admin
```

#### 🟡 Scenario 5: TelemetryGap (Warning)

```
Symptoms:
- Alert: TelemetryGap on server-01
- No data for 3+ minutes
- Other machines still reporting

Investigation Steps:
1. Check Node-RED logs: docker compose logs --tail=50 node-red
2. Check SNMP simulator: docker compose ps snmpsim
3. Check network connectivity
4. Check if machine_id matches

Resolution:
- If snmpsim down → docker compose restart snmpsim
- If Node-RED error → check flow JSON syntax
- If machine not in registry → add to database

Escalation:
- If persistent → check SNMP community string
- If new machine → verify MIB compatibility
```

---

## 🔧 Common Operations

### Check System Status

```bash
# View all containers
docker compose ps

# Check Node-RED logs
docker compose logs --tail=20 node-red

# Check Prometheus targets
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/targets"

# Check active alerts
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/alerts"
```

### Query Database Directly

```bash
# Recent telemetry (last 5 minutes)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
  "SELECT machine_id, time, cpu_load_percent, temp_c
   FROM public.machine_telemetry
   WHERE time > NOW() - INTERVAL '5 minutes'
   ORDER BY time DESC LIMIT 10;"

# Check interface metrics (JSONB)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
  "SELECT machine_id, interface_metrics
   FROM public.machine_telemetry
   ORDER BY time DESC LIMIT 1;"
```

### Restart Services

```bash
# Restart Node-RED (after flow changes)
docker compose restart node-red

# Restart Prometheus (after rule changes)
docker compose restart prometheus

# Full restart (no data loss)
docker compose restart node-red grafana alertmanager prometheus
```

---

## 🐛 Troubleshooting

### Common Issues

| Symptom | Possible Cause | Solution |
|---|---|---|
| **"No Data" on all panels** | Node-RED not running | `docker compose restart node-red` |
| **"No Data" on specific machine** | Machine not in registry | Add to `machines` table |
| **Alertmanager restarting** | Config YAML syntax error | Check `docker compose logs alertmanager` |
| **All blackbox targets DOWN** | Wrong service name in config | Use `blackbox-exporter:9115` |
| **Grafana shows stale data** | Dashboard not refreshed | Hard refresh: Ctrl+Shift+R |
| **High memory usage** | Memory leak in Node-RED | Check `docker stats ims-node-red` |
| **Database connection refused** | PgBouncer down | `docker compose restart pgbouncer` |

### Log Locations

| Service | Command | What to Look For |
|---|---|---|
| **Node-RED** | `docker compose logs node-red` | `Started flows`, `TypeError`, `ETIMEOUT` |
| **TimescaleDB** | `docker compose logs timescaledb` | `connection refused`, `authentication failed` |
| **Prometheus** | `docker compose logs prometheus` | `failed to check config`, `target down` |
| **Alertmanager** | `docker compose logs alertmanager` | `Loading configuration file failed` |
| **Grafana** | `docker compose logs grafana` | `Failed to look up user`, `dashboard not found` |

### Quick Diagnostics Script

```bash
# Run all health checks at once
echo "=== Containers ==="
docker compose ps --format "table {{.Name}}\t{{.Status}}"

echo "=== Data Flow ==="
docker compose exec timescaledb psql -U ims_admin -d ims -c \
  "SELECT machine_id, COUNT(*) as rows, MAX(time) as latest
   FROM public.machine_telemetry
   WHERE time > NOW() - INTERVAL '5 minutes'
   GROUP BY machine_id;"

echo "=== Alerts ==="
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/alerts" 2>&1 | \
  python -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"data\"][\"alerts\"])} active alerts')"
```

---

## 📋 Quick Reference

### Keyboard Shortcuts (Grafana)

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save dashboard |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `F` | Toggle fullscreen |
| `R` | Refresh dashboard |
| `T` | Open time picker |
| `D` | Open dashboard search |
| `Ctrl+Shift+P` | Open command palette |

### Color Coding Reference

| Metric | Healthy | Warning | Critical |
|---|---|---|---|
| **CPU** | 🟢 Green | 🟡 Yellow → Orange | 🔴 Red |
| **Memory** | 🟢 Green | 🟡 Purple → Dark Orange | 🔴 Red |
| **Disk** | 🟢 Green | 🟡 Cyan → Blue | 🔴 Red |
| **Network RX** | 🔵 Dark Blue (#1F60C4) | — | 🔴 Red |
| **Network TX** | 🔵 Light Blue (#5794F2) | — | 🔴 Red |
| **Temperature** | 🟢 Green | 🟡 Yellow | 🔴 Red |
| **Errors** | — | — | 🔴 Red (#C4162A) |
| **Drops** | — | 🟠 Orange (#FF9830) | 🔴 Red |

### Alert Contacts

| Role | Contact | Channel |
|---|---|---|
| **NOC Team** | LINE Group | LINE Notify |
| **System Admin** | MS Teams | Webhook |
| **Management** | Email (Future) | SMTP |

---

<div align="center">

**IMS User Manual — Version 1.0**

*For IT Support & NOC Team*

</div>
