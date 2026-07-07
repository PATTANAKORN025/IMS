# IMS Troubleshooting Guide

> SRE Runbook for operating the IMS monitoring stack at 3 AM.

## Quick Health Check

Run these commands in order to assess system state:

```bash
# 1. Container status
docker compose ps

# 2. Node-RED startup confirmation
docker logs ims-node-red 2>&1 | tail -5

# 3. Telemetry flow (should show rows for each machine)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
  "SELECT machine_id, COUNT(*) as rows, MAX(time) as latest \
   FROM public.machine_telemetry WHERE time > NOW() - INTERVAL '5 minutes' \
   GROUP BY machine_id;"

# 4. Prometheus targets (all should be UP)
curl -s http://localhost:9090/api/v1/targets | python3 -c \
  "import sys,json; d=json.load(sys.stdin); \
   up=sum(1 for t in d['data']['activeTargets'] if t['health']=='up'); \
   print(f'{up}/{len(d[\"data\"][\"activeTargets\"])} targets UP')"
```

## Failure Modes

| Symptom | Likely Cause | Diagnostic | Resolution |
|---------|-------------|-----------|------------|
| **Node-RED crash-looping** | DB connection failure or missing npm modules | `docker logs ims-node-red --tail=50` | Check PgBouncer: `docker logs ims-pgbouncer --tail=20`. Verify `.env` has `POSTGRES_PASSWORD`. Rebuild if missing modules: `docker compose build --no-cache node-red && docker compose up -d node-red` |
| **Node-RED "Started flows" but no data** | SNMP target unreachable or wrong community string | `docker exec ims-node-red node -e "const s=require('net-snmp').createSession('ims-snmpsim','Netk@',{port:161,version:2});s.get(['1.3.6.1.2.1.1.3.0'],(e,v)=>{console.log(e||v);s.close()})"` | Verify snmpsim is running: `docker logs ims-snmpsim --tail=5`. Check community string matches `Netk@` |
| **Grafana "No Data" on panels** | CAGG not refreshed yet or wrong time range | `docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT COUNT(*) FROM public.telemetry_minute_summary WHERE bucket > NOW() - INTERVAL '1 hour';"` | CAGGs take ~3 min to populate after restart. Wait and refresh. If count=0, check Node-RED logs for INSERT errors |
| **Grafana "Panel plugin not found: clock"** | Plugin not installed or stale volume | `docker compose exec grafana grafana-cli plugins ls` | Wipe Grafana volume: `docker compose rm -fs grafana && docker volume rm ims_grafana_data && docker compose up -d grafana` |
| **High CPU on TimescaleDB** | CAGG refresh storm or unoptimized queries | `docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5;"` | Check Grafana dashboard refresh rates. Capacity dashboard should be 5m, not 10s. Kill long queries: `SELECT pg_terminate_backend(pid);` |
| **PgBouncer "server login has been failing"** | Stale auth cache after password change | `docker logs ims-pgbouncer --tail=20 \| grep -i "login\|error"` | Restart PgBouncer: `docker compose restart pgbouncer`. Verify `DATABASE_URL` env var matches TimescaleDB credentials |
| **Retry queue growing** (`/data/retry_queue.json`) | DB inserts failing repeatedly | `docker exec ims-node-red cat /data/retry_queue.json \| python3 -c "import sys,json; q=json.load(sys.stdin); print(f'Queue: {len(q)} entries, latest error: {q[-1][\"error\"] if q else \"none\"}')"` | Check PgBouncer connectivity. Max 5 retries per entry, max 500 entries. Queue drains automatically every 30s |
| **Alertmanager "TargetDown" for blackbox** | Wrong Docker DNS name in prometheus.yml | `curl -s http://localhost:9090/api/v1/targets \| python3 -c "import sys,json; [print(t['labels'].get('job','?'), t['health']) for t in json.load(sys.stdin)['data']['activeTargets']]"` | Blackbox targets MUST use service name `blackbox-exporter:9115`, NOT container name `ims-blackbox` or `blackbox:9115` |
| **Docker "port already in use"** | Windows NAT port conflict | `netstat -ano \| findstr :1880` | Run: `net stop winnat && net start winnat` to reset Windows NAT |

## Common Operations

### Restart a single service
```bash
docker compose restart node-red    # Restart pipeline
docker compose restart grafana     # Reload dashboard JSON
docker compose restart prometheus  # Reload alert rules
```

### Deploy flow changes
```bash
make deploy-flows    # Merge split flows → POST to Admin API
```

### Check database state
```bash
# Row count per machine (last 5 min)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
  "SELECT machine_id, COUNT(*) FROM public.machine_telemetry \
   WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"

# CAGG freshness
docker compose exec timescaledb psql -U ims_admin -d ims -c \
  "SELECT MAX(bucket) as latest FROM public.telemetry_minute_summary;"
```

### Backup and restore
```bash
make backup                    # Backup to backups/backup_YYYYMMDD.sql
make restore FILE=backups/backup_20260701.sql
```

### Full clean restart (destroys all data)
```bash
docker compose down -v && docker compose up -d
# Wait 40s for startup, then:
make deploy-flows
```

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `POSTGRES_DB` | Yes | `ims` | Database name |
| `POSTGRES_USER` | Yes | `ims_admin` | Database user |
| `POSTGRES_PASSWORD` | Yes | — | Database password |
| `GRAFANA_ADMIN_USER` | Yes | `admin` | Grafana admin username |
| `GRAFANA_ADMIN_PASSWORD` | Yes | — | Grafana admin password |
| `NODE_RED_CREDENTIAL_SECRET` | Yes | — | Encrypts stored flow credentials |
| `LINE_CHANNEL_ACCESS_TOKEN` | No | — | LINE Messaging API token |
| `LINE_USER_ID` | No | — | LINE user ID for alerts |
| `TEAMS_WEBHOOK_URL` | No | — | MS Teams incoming webhook URL |

## Escalation Path

1. Check `docker compose ps` — any container not running?
2. Check logs of the failing container — `docker logs <container> --tail=50`
3. Check DB connectivity — `docker compose exec timescaledb pg_isready`
4. Check network — `docker compose exec node-red ping pgbouncer`
5. If all else fails: `docker compose down -v && docker compose up -d && make deploy-flows`


---

# Incident Response Runbook

# 🚨 Incident Response Runbook

> **คู่มือการตอบสนองต่อเหตุการณ์สำหรับ NOC Team และ IT Support**
> ใช้เมื่อได้รับ alert หรือตรวจพบปัญหาในระบบ

---

<div align="center">

![Incident](https://img.shields.io/badge/Incident-Response%20Runbook-red)
![Severity](https://img.shields.io/badge/Severity-Multi--Level-orange)
![Response](https://img.shields.io/badge/Response-Time-<15%20min-blue)

</div>

---

## 📋 Table of Contents

1. [Alert Severity Matrix](#-alert-severity-matrix)
2. [Alert → Action Matrix](#-alert--action-matrix)
3. [Step-by-Step Playbooks](#-step-by-step-playbooks)
4. [Escalation Matrix](#-escalation-matrix)
5. [Post-Incident Review](#-post-incident-review)

---

## 🎯 Alert Severity Matrix

| Level | Icon | Response Time | Example | Communication |
|---|---|---|---|---|
| **Critical** | 🔴 | < 15 minutes | InterfaceDown, ServiceDown | Immediate call + LINE |
| **Warning** | 🟡 | < 1 hour | HighCPU, DiskSpaceLow | LINE notification |
| **Info** | 🔵 | < 4 hours | TelemetryGap, PredictiveDiskFull | Email summary |

---

## 📊 Alert → Action Matrix

### Infrastructure Alerts

| Alert | Severity | First Action | Escalation |
|---|---|---|---|
| **ServiceDown** | 🔴 Critical | `docker compose up -d <service>` | If persists >5 min: check logs |
| **InterfaceDown** | 🔴 Critical | Check cable/switch port | If eth0 flapping: expected in simulator |
| **NodeREDDown** | 🔴 Critical | `docker compose restart node-red` | If crashes repeatedly: check OOM |
| **PgBouncerDown** | 🔴 Critical | `docker compose restart pgbouncer` | Check TimescaleDB first |
| **TargetDown** | 🟡 Warning | Check Prometheus targets | Verify blackbox DNS name |

### Resource Alerts

| Alert | Severity | First Action | Escalation |
|---|---|---|---|
| **HighCpuLoad** | 🟡/🔴 | Check `top` inside container | If sustained >1h: investigate workload |
| **HighMemoryUsage** | 🟡/🔴 | Check `free -m` inside container | If >90%: restart container |
| **DiskSpaceLow** | 🟡/🔴 | `docker system prune -f` | If persists: expand volume |
| **HighTemperature** | 🟡/🔴 | Check physical environment (AC) | If >90°C: emergency shutdown |
| **NetworkErrors** | 🟡 Warning | Check cable quality | If sustained: replace cable |

### Data Alerts

| Alert | Severity | First Action | Escalation |
|---|---|---|---|
| **TelemetryGap** | 🟡 Warning | Check Node-RED logs | If >5 min gap: restart full stack |
| **SLABreachWarning** | 🔵 Info | Check uptime percentage | Review architecture requirements |

---

## 🎮 Step-by-Step Playbooks

### Playbook 1: Full Stack Restart

**When to use:** Multiple services failing, data flow stopped.

```bash
# 1. Stop everything
docker compose down

# 2. Start fresh
docker compose up -d

# 3. Wait 40 seconds for full startup
sleep 40

# 4. Verify all containers
docker compose ps

# 5. Check data flow (wait 25s for first poll cycle)
sleep 25
docker compose exec timescaledb psql -U ims_admin -d ims \
  -c "SELECT machine_id, COUNT(*) FROM public.machine_telemetry
       WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY machine_id;"

# 6. Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | python -c "
import json,sys
d=json.load(sys.stdin)
for t in d['data']['activeTargets']:
    print(f\"{t['labels']['job']}: {t['health']}\")
"
```

### Playbook 2: Node-RED Recovery

**When to use:** Node-RED crashes, flows corrupted, pipeline stopped.

```bash
# Check Node-RED logs
docker compose logs --tail=50 node-red

# If flows are corrupted
cp node-red/flows/ingestion.json nodered_data/flows.json
docker compose restart node-red

# Wait for stabilization
sleep 30

# Verify pipeline started
docker compose logs --tail=10 node-red | grep -i "started"
```

### Playbook 3: Database Recovery

**When to use:** Database corrupted, data missing, connection refused.

```bash
# Check database connection
docker compose exec timescaledb pg_isready -U ims_admin -d ims

# If database is corrupted or empty
docker compose down -v  # Destroys all data
docker compose up -d
sleep 40

# Re-run migrations if needed
docker compose exec -T timescaledb psql -U ims_admin -d ims < database/migrations/001-fix-ldi-types-add-disk-desc.sql

# Verify data flow
docker compose exec timescaledb psql -U ims_admin -d ims \
  -c "SELECT machine_id, COUNT(*) FROM public.machine_telemetry GROUP BY machine_id;"
```

### Playbook 4: Alertmanager Issues

**When to use:** Alerts not firing, wrong notifications, config errors.

```bash
# Check Alertmanager status
docker compose logs --tail=20 alertmanager

# Validate config
docker compose exec alertmanager amtool check-config /etc/alertmanager/alertmanager.yml

# Check active alerts
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/alerts"

# Reload Alertmanager config
docker compose exec alertmanager amtool reload
```

### Playbook 5: Prometheus Issues

**When to use:** Targets down, rules not evaluating, scraping stopped.

```bash
# Check Prometheus status
docker compose logs --tail=20 prometheus

# Check targets
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/targets"

# Validate config
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml

# Validate rules
docker compose exec prometheus promtool check rules /etc/prometheus/rules/ims-alerts.yml

# Reload config
docker compose exec prometheus wget -qO- -X POST "http://localhost:9090/-/reload"
```

---

## 📞 Escalation Matrix

| Level | Contact | When to Escalate | Response Time |
|---|---|---|---|
| **Level 1** (Auto) | Docker auto-restart | Service crashes | Immediate |
| **Level 2** (NOC) | NOC Team (LINE Group) | Auto-restart fails | < 15 minutes |
| **Level 3** (IT) | IT Team (MS Teams) | Multiple services down | < 30 minutes |
| **Level 4** (MIS-G) | MIS-G Manager | Data loss, security incident | < 1 hour |
| **Level 5** (Management) | IT Director | Extended outage >4 hours | < 4 hours |

### Contact Information

| Role | Name | Channel | Phone |
|---|---|---|---|
| **NOC Team** | On-duty Engineer | LINE Group | — |
| **IT Support** | IT Help Desk | MS Teams | Ext. 1234 |
| **MIS-G** | System Administrator | Phone | 081-XXX-XXXX |
| **Management** | IT Director | Email | director@company.com |

---

## 📝 Post-Incident Review

### Incident Report Template

```markdown
# Incident Report: [Alert Name]

## Summary
- **Date/Time**: YYYY-MM-DD HH:MM
- **Duration**: X hours Y minutes
- **Severity**: Critical/Warning/Info
- **Affected Services**: [list]

## Timeline
- HH:MM - Alert triggered
- HH:MM - NOC notified
- HH:MM - Investigation started
- HH:MM - Root cause identified
- HH:MM - Fix implemented
- HH:MM - Service restored

## Root Cause
[Describe what caused the incident]

## Impact
- **Services affected**: [list]
- **Users affected**: [number]
- **Data loss**: Yes/No
- **Revenue impact**: [if applicable]

## Resolution
[Describe how the incident was resolved]

## Action Items
- [ ] [Action 1] - Owner - Due Date
- [ ] [Action 2] - Owner - Due Date

## Lessons Learned
- [What went well]
- [What could be improved]
```

### Review Schedule

| Severity | Review Time | Participants |
|---|---|---|
| **Critical** | Within 24 hours | IT Team, Management |
| **Warning** | Within 1 week | IT Team |
| **Info** | Monthly review | IT Team |

---

## 📚 Quick Reference

### Common Commands

```bash
# Container management
docker compose ps                          # Check status
docker compose logs --tail=50 <service>    # View logs
docker compose restart <service>           # Restart service
docker compose down -v && up -d            # Full restart (destroys data)

# Database queries
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT 1;"

# Prometheus checks
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/targets"
docker compose exec prometheus wget -qO- "http://localhost:9090/api/v1/alerts"

# Network testing
docker exec ims-node-red node -e "const snmp=require('net-snmp'); const s=snmp.createSession('ims-snmpsim','Netk@'); s.get(['1.3.6.1.2.1.1.1.0'],(e,v)=>{console.log(e?e.message:v[0].value.toString()); s.close()});"
```

### Emergency Contacts

| Situation | Contact | Method |
|---|---|---|
| **System Down** | NOC Team | LINE Group |
| **Data Loss** | MIS-G | Phone |
| **Security Incident** | IT Director | Phone + Email |
| **Vendor Issue** | Vendor Support | Support Portal |

---

<div align="center">

**IMS Incident Response Runbook — Version 1.0**

*For NOC Team & IT Support*

</div>
