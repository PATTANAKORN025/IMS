# IMS — User Manual

> **User Guide for IT Support and NOC Team**
> Details procedures for interpreting dashboards, analyzing metrics, and executing alert responses.

---

<div align="center">

![Manual](https://img.shields.io/badge/Manual-User%20Guide-green)
![Version](https://img.shields.io/badge/Version-1.1-blue)
![Audience](https://img.shields.io/badge/Audience-IT%20Support-purple)

</div>

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Grafana Dashboard Guide](#grafana-dashboard-guide)
3. [Reading Metrics](#reading-metrics)
4. [Alert Response Procedures](#alert-response-procedures)
5. [Common Operations](#common-operations)
6. [Troubleshooting](#troubleshooting)
7. [Quick Reference](#quick-reference)

---

## Getting Started

### Accessing the System

| Service               | URL                     | Credentials              |
| --------------------- | ----------------------- | ------------------------ |
| **Grafana Dashboard** | `http://localhost:3000` | admin / admin            |
| **Node-RED Editor**   | `http://localhost:1880` | (configured in settings) |
| **Prometheus**        | `http://localhost:9090` | —                        |
| **Alertmanager**      | `http://localhost:9093` | —                        |

### Dashboard Overview

Upon accessing Grafana, 15 distinct dashboards are available:

```text
 IMS Dashboards
├── Infrastructure (servers/network)
│ ├── NOC Overview   — Executive fleet envelope (infra only -- LDI lives below)
│ ├── Engineering Drill-Down — Per-server deep dive: CPU/RAM/disk/temp/network
│ ├── Capacity Planning  — Linear-regression forecasting (days until disk/RAM full)
│ └── Meta-Monitoring   — The pipeline's own health (rows/sec, batch success, retry queue)
└── LDI Manufacturing (PCB laser direct imaging fleet)
 ├── Easy Overview   — Zero-config whole-fleet glance, no filters to set
 ├── LDI Manufacturing  — Executive KPIs + machine telemetry + alarm stream (main command center)
 ├── LDI Operator Andon  — Factory-floor kiosk, 1280x720, zero-scroll, read-only (no interactive elements)
 ├── LDI Alarm Console  — Interactive Acknowledge/Resolve workflow, companion to the read-only Andon board
 ├── LDI Alarm Dictionary — Reference lookup: full vendor alarm definitions + recent occurrences
 ├── LDI Engineering Analytics — Cpk/SPC ranking, RCA Truth Test, PE/JE distributions
 ├── LDI Machine Snapshot — Click any alarm/log to inspect the exact millisecond
 └── LDI Data Readiness  — Self-auditing data-quality dashboard (coverage %, gaps)
```

---

## Grafana Dashboard Guide

### 1. NOC Overview Dashboard

**Purpose**: High-level overview intended for executives and the NOC team.

```text
┌─────────────────────────────────────────────────────────────────┐
│ IMS NOC Overview           │
├─────────────────────────────────────────────────────────────────┤
│                 │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│ │ Total  │ │ Healthy  │ │ Warning  │ │ Critical │ │
│ │ Machines: 5 │ │ Machines: 4 │ │ Alerts: 1 │ │ Alerts: 0 │ │
│ │ ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen)  │ │ ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen)  │ │ ![Warning](https://img.shields.io/badge/Status-Warning-yellow)  │ │   │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Fleet CPU Usage (Last 1 Hour)       │ │
│ │ [Line chart showing all machines CPU over time]   │ │
│ └───────────────────────────────────────────────────────────┘ │
│                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Active Alerts           │ │
│ │ [Table of current firing alerts with severity]   │ │
│ └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Server Health Metrics (NOC Overview / Engineering Drill-Down)

**Purpose**: Comprehensive health overview of all servers — these panel types are distributed across the **NOC Overview** (fleet envelope) and **Engineering Drill-Down** (per-server deep dive) dashboards; they do not constitute a standalone dashboard.

| Panel               | Metrics                            | Color Coding                                                                                                                                               |
| ------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CPU Usage**       | `cpu_load_percent` per core        | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) < 60%, ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 60-80%, > 80%    |
| **Memory Usage**    | `ram_used_mb / ram_total_mb`       | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) < 70%, ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 70-85%, > 85%    |
| **Disk Usage**      | `disk_used_gb / disk_total_gb`     | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) < 70%, ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 70-80%, > 80%    |
| **Network Traffic** | `rx_mbps`, `tx_mbps` per interface | Blue = RX, Light Blue = TX                                                                                                                                 |
| **Temperature**     | `temp_c`                           | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) < 65°C, ![Warning](https://img.shields.io/badge/Status-Warning-yellow) 65-80°C, > 80°C |

### 3. Engineering Drilldown Dashboard

**Purpose**: Detailed analytical deep dive per individual server for engineers.

```text
┌─────────────────────────────────────────────────────────────────┐
│ Engineering Drilldown — [Select Machine ▼]     │
├─────────────────────────────────────────────────────────────────┤
│                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Network Interface Traffic (Symmetrical Butterfly)  │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │  ▲ eth0 RX: ████████████ 2.4 Gbps    │ │ │
│ │ │  │ wlan0 RX: ██████ 800 Mbps      │ │ │
│ │ │ ───┼────────────────────────────────── 0 Mbps  │ │ │
│ │ │  │ wlan0 TX: ████ 400 Mbps      │ │ │
│ │ │  ▼ eth0 TX: ████████ 1.6 Gbps     │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └───────────────────────────────────────────────────────────┘ │
│                 │
│ ┌──────────────────────┐ ┌──────────────────────────────────┐ │
│ │ CPU Temperature  │ │ Disk Usage      │ │
│ │ [Gauge: 72°C]  │ │ [Bar: /dev/sda1 45%, sdb1 62%] │ │
│ └──────────────────────┘ └──────────────────────────────────┘ │
│                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ LDI Quality Scatter (PE vs JE)       │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ PE (µm)           │ │ │
│ │ │ 15 ┤   ╱ Tolerance Box      │ │ │
│ │ │  │ · · ╱· · ·        │ │ │
│ │ │ 0 ┤──╱────────────────── 0      │ │ │
│ │ │  │ ╱· · · ·         │ │ │
│ │ │ -15 ┤╱   (green zone ±10µm)     │ │ │
│ │ │  └─┬────┬────┬────┬────┬─      │ │ │
│ │ │  -15 -5 0 5 15 JE (µm)    │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └───────────────────────────────────────────────────────────┘ │
│                 │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ LDI Manufacturing Telemetry        │ │
│ │ Throughput: 1250 units/hr | PE: 0.85 | JE: 0.92   │ │
│ │ Humidity: 65% | Power: 2400W | Vibration: 2.1 mm/s  │ │
│ └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**LDI Scatter Plot Tolerance Box:**

The Scatter Plot illustrates PE (Position Error) vs JE (Judgment Error) measured in µm:

| Zone          | Color                                                                     | Meaning                                         |
| ------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Inside ±10µm  | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) Green | Normal — The laser head is functioning properly |
| Outside ±10µm | Red                                                                       | Abnormal — The laser head requires inspection   |

**Instructions:**

- Data points within the green bounding box indicate that PCB quality is within acceptable thresholds.
- Data points deviating into the red zone require immediate inspection of the laser head.
- Correlate this data with the **LDI Throughput** panel to verify if production rates remain nominal.

### 4. Capacity Planning Dashboard

**Purpose**: Resource capacity forecasting to aid in infrastructure planning.

| Panel                | What It Shows                                | Use Case               |
| -------------------- | -------------------------------------------- | ---------------------- |
| **CPU Forecast**     | Linear regression slope → when CPU hits 100% | Plan server upgrades   |
| **Disk Forecast**    | Predicted disk full date                     | Plan storage expansion |
| **Memory Trend**     | Memory usage growth rate                     | Plan RAM upgrades      |
| **Network Capacity** | Bandwidth utilization trend                  | Plan network upgrades  |

### 5. Easy Overview Dashboard

**Purpose**: Rapid overview of the entire LDI fleet requiring zero configuration — no template variables, no filters; immediately visible upon loading.

Every metric on this dashboard is sourced from the exact same shared views/functions utilized by other dashboards (`v_ldi_machine_latest_full`, `v_ldi_alarm_context`, `f_ldi_yield_pct`, `v_machine_spc_fleet`) — thereby ensuring strong data consistency across dashboards, as no redundant isolated queries are executed.

### 6. LDI Manufacturing Command Center

**Purpose**: Primary operational dashboard for the LDI manufacturing line — featuring a 4-layer RCA architecture.

| Layer                  | Content                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| **Executive HUD**      | Yield %, Running machines, Fleet Status, Avg Cpk, Fleet Availability, Critical Alarms                  |
| **Machine Telemetry**  | Temperature/Humidity compliance, Scan Speed/Air Vacuum, Thickness/Resist Dosage, Scale X/Y             |
| **Production Context** | Live production table (Machine/Job/Part/Layer/Progress), Board Traceability, Calculated Time per Board |
| **Alarm Stream**       | Recent Alarm Events (last 50), Top Correlated Alarms (24h, RCA)                                        |

Deep-dive rows (Production & Compliance, Process Metrics, Analytics & SPC, System Alarms, RCA Fleet Summary, Cycle Time & Traceability) are collapsed by default — click a row header to expand. This keeps the initial glance to the executive KPI strip only.

### 7. LDI Operator Andon Board

**Purpose**: Factory floor kiosk display — strictly ISA-101 compliant, completely touchless with zero scrolling requirements optimized for a 1280x720 resolution.

Displays Fleet Availability, Critical Alarm count, Environmental Compliance %, Machines Running, individual machine statuses (OK/IDLE/NO_DATA indicated via background color coding), alongside the Live Production tracking table.

### 8. LDI Engineering Analytics & SPC

**Purpose**: Comprehensive in-depth analysis for engineering personnel — Cpk/SPC ranking, RCA Truth Test, and PE/JE spatial distributions.

| Section                     | Content                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| **Environmental**           | Temperature vs Humidity, synchronized across all machines simultaneously                            |
| **SPC Control Charts**      | Thickness Control Chart (mean ± 3σ), Scale X/Y Control Chart                                        |
| **Variation Analysis**      | PE/JE Standard Deviation by Machine, PE/JE Error Distribution (Box Plot)                            |
| **RCA / Alarm Correlation** | RCA Truth Test — Lift/Confidence metrics categorized by alarm type (Thermal/Humidity/Vacuum/etc.) |

### 9. LDI Machine Snapshot

**Purpose**: Exact millisecond-level machine state inspection triggered via click-through from the Process Timeline (a drill-down capability integrated across other dashboards).

Provides detailed job context, physical variables, PE alignment, Cpk, and correlated alarms within close temporal proximity to the selected event — intended specifically for pinpoint incident investigation rather than high-level overviews.

### 10. LDI Data Readiness

**Purpose**: Self-auditing data quality verification dashboard — relies exclusively on actual PostgreSQL production data with zero simulated inputs.

Utilized to detect board-key duplication, verify overall coverage %, and validate the matching rate against the alarm master database prior to trusting metrics presented on primary dashboards.

---

## Reading Metrics

### CPU Metrics

| Metric             | Unit  | Healthy | Warning | Critical |
| ------------------ | ----- | ------- | ------- | -------- |
| `cpu_load_percent` | %     | < 60%   | 60-80%  | > 80%    |
| `cpu_cores`        | count | —       | —       | —        |

**Instructions:**

- **Average CPU** — The mean value across all cores during the selected time frame.
- **Peak CPU** — The maximum recorded value (which may indicate a transient spike).
- **CPU per Core** — Identifies which specific core is experiencing heavy utilization.

**Example:**

```text
Machine: server-01
CPU Load: 72% (Warning)
├── Core 1: 85%
├── Core 2: 45%
├── Core 3: 78%
└── Core 4: 80%
→ Cores 1, 3, and 4 are under heavy load; investigate running processes.
```

### Memory Metrics

| Metric         | Unit | Healthy | Warning | Critical |
| -------------- | ---- | ------- | ------- | -------- |
| `ram_used_mb`  | MB   | —       | —       | —        |
| `ram_total_mb` | MB   | —       | —       | —        |
| **Usage %**    | %    | < 70%   | 70-85%  | > 85%    |

**Instructions:**

- **Usage %** = `(ram_used_mb / ram_total_mb) × 100`
- **Available** = `ram_total_mb - ram_used_mb`
- Elevated memory usage is not inherently indicative of a problem — Linux architectures proactively utilize memory for caching purposes.

### Network Metrics

| Metric          | Unit  | Description                            |
| --------------- | ----- | -------------------------------------- |
| `rx_mbps`       | Mbps  | Download speed (incoming traffic)      |
| `tx_mbps`       | Mbps  | Upload speed (outgoing traffic)        |
| `net_rx_errors` | count | Receive errors (hardware/driver issue) |
| `net_rx_drops`  | count | Dropped packets (buffer overflow)      |
| `net_if_status` | 1/2   | 1 = UP, 2 = DOWN                       |

**Instructions:**

- **Bandwidth Utilization** = `(rx_mbps / link_speed) × 100`
- **Error Rate** = `net_rx_errors / total_packets × 100`
- **Interface DOWN** = Indicates a severed network cable or a disabled switch port.

**Example:**

```text
Machine: server-01
┌─────────┬──────────┬──────────┬──────────┬──────────┬────────┐
│Interface│ RX Mbps │ TX Mbps │ Errors │ Drops │ Status │
├─────────┼──────────┼──────────┼──────────┼──────────┼────────┤
│ eth0 │ 1200  │ 850  │ 0  │ 0  │ UP │
│ wlan0 │ 320  │ 180  │ 0  │ 12  │ UP │
└─────────┴──────────┴──────────┴──────────┴──────────┴────────┘
→ wlan0 registers 12 dropped packets — investigate wireless signal integrity.
```

### Disk Metrics

| Metric          | Unit | Healthy | Warning | Critical |
| --------------- | ---- | ------- | ------- | -------- |
| `disk_used_gb`  | GB   | —       | —       | —        |
| `disk_total_gb` | GB   | —       | —       | —        |
| **Usage %**     | %    | < 70%   | 70-80%  | > 80%    |

**Instructions:**

- **Usage %** = `(disk_used_gb / disk_total_gb) × 100`
- **Free Space** = `disk_total_gb - disk_used_gb`
- **IOPS** = Input/Output Operations Per Second (if supplementary metrics are configured).

### Temperature Metrics

| Metric   | Unit | Healthy | Warning | Critical |
| -------- | ---- | ------- | ------- | -------- |
| `temp_c` | °C   | < 65°C  | 65-80°C | > 80°C   |

**Instructions:**

- **Average Temp** — Mean temperature reading.
- **Max Temp** — Peak temperature recorded.
- **Temperature Trend** — Indicates whether the temperature is ascending or descending.

---

## Alert Response Procedures

### Alert Severity Levels

| Level        | Color                                                                 | Response Time                 | Example                                 |
| ------------ | --------------------------------------------------------------------- | ----------------------------- | --------------------------------------- |
| **Critical** | Red                                                                   | Immediate (< 15 minutes)      | InterfaceDown, ServiceDown, CriticalCPU |
| **Warning**  | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) Yellow | Prompt (< 1 hour)             | HighCPU, HighMemory, DiskSpaceLow       |
| **Info**     | Blue                                                                  | Standard priority (< 4 hours) | TelemetryGap, PredictiveDiskFull        |

### Incident Response Playbook

#### Scenario 1: InterfaceDown (Critical)

```text
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

#### Scenario 2: HighCPUUsage (Warning)

```text
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

#### Scenario 3: DiskSpaceLow (Warning)

```text
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

#### Scenario 4: ServiceDown (Critical)

```text
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

#### ![Warning](https://img.shields.io/badge/Status-Warning-yellow) Scenario 5: PipelineDataStalled (Warning)

```text
Symptoms:
- Alert: PipelineDataStalled (formerly named TelemetryGap in older docs) on server-01
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

## Common Operations

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
 "SELECT device_id, time, cpu_load_percent, temp_c
 FROM public.sys_metrics
 WHERE time > NOW() - INTERVAL '5 minutes'
 ORDER BY time DESC LIMIT 10;"

# Check interface metrics
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, iface_name, rx_mbps, tx_mbps
 FROM public.net_metrics
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

## Troubleshooting

### Common Issues

| Symptom                           | Possible Cause               | Solution                                 |
| --------------------------------- | ---------------------------- | ---------------------------------------- |
| **"No Data" on all panels**       | Node-RED not running         | `docker compose restart node-red`        |
| **"No Data" on specific machine** | Machine not in registry      | Add to `machines` table                  |
| **Alertmanager restarting**       | Config YAML syntax error     | Check `docker compose logs alertmanager` |
| **All blackbox targets DOWN**     | Wrong service name in config | Use `blackbox-exporter:9115`             |
| **Grafana shows stale data**      | Dashboard not refreshed      | Hard refresh: Ctrl+Shift+R               |
| **High memory usage**             | Memory leak in Node-RED      | Check `docker stats ims-node-red`        |
| **Database connection refused**   | PgBouncer down               | `docker compose restart pgbouncer`       |

### Log Locations

| Service          | Command                            | What to Look For                                |
| ---------------- | ---------------------------------- | ----------------------------------------------- |
| **Node-RED**     | `docker compose logs node-red`     | `Started flows`, `TypeError`, `ETIMEOUT`        |
| **TimescaleDB**  | `docker compose logs timescaledb`  | `connection refused`, `authentication failed`   |
| **Prometheus**   | `docker compose logs prometheus`   | `failed to check config`, `target down`         |
| **Alertmanager** | `docker compose logs alertmanager` | `Loading configuration file failed`             |
| **Grafana**      | `docker compose logs grafana`      | `Failed to look up user`, `dashboard not found` |

### Quick Diagnostics Script

```bash
# Run all health checks at once
echo "=== Containers ==="
docker compose ps --format "table {{.Name}}\t{{.Status}}"

echo "=== Data Flow ==="
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(time) as latest
 FROM public.sys_metrics
 WHERE time > NOW() - INTERVAL '5 minutes'
 GROUP BY device_id;"

echo "=== Alerts ==="
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/alerts" 2>&1 | \
 python -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"data\"][\"alerts\"])} active alerts')"
```

---

## Quick Reference

### Keyboard Shortcuts (Grafana)

| Shortcut       | Action                |
| -------------- | --------------------- |
| `Ctrl+S`       | Save dashboard        |
| `Ctrl+Z`       | Undo                  |
| `Ctrl+Shift+Z` | Redo                  |
| `F`            | Toggle fullscreen     |
| `R`            | Refresh dashboard     |
| `T`            | Open time picker      |
| `D`            | Open dashboard search |
| `Ctrl+Shift+P` | Open command palette  |

### Color Coding Reference

| Metric          | Healthy                                                                   | Warning                                                                             | Critical      |
| --------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------- |
| **CPU**         | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) Green | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) Yellow → Orange      | Red           |
| **Memory**      | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) Green | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) Purple → Dark Orange | Red           |
| **Disk**        | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) Green | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) Cyan → Blue          | Red           |
| **Network RX**  | Dark Blue (#1F60C4)                                                       | —                                                                                   | Red           |
| **Network TX**  | Light Blue (#5794F2)                                                      | —                                                                                   | Red           |
| **Temperature** | ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) Green | ![Warning](https://img.shields.io/badge/Status-Warning-yellow) Yellow               | Red           |
| **Errors**      | —                                                                         | —                                                                                   | Red (#C4162A) |
| **Drops**       | —                                                                         | ![Warning](https://img.shields.io/badge/Status-Warning-orange) Orange (#FF9830)     | Red           |

### Alert Contacts

| Role             | Contact        | Channel            |
| ---------------- | -------------- | ------------------ |
| **NOC Team**     | LINE Group     | LINE Messaging API |
| **System Admin** | MS Teams       | Webhook            |
| **Management**   | Email (Future) | SMTP               |

---

<div align="center">

**IMS User Manual — Version 1.1**

_For IT Support & NOC Team_

</div>
