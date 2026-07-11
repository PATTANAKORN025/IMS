# 🚀 Deployment Readiness Assessment

> **เอกสารประเมินความพร้อมก่อน deploy ระบบ IMS ไปยัง Production**
> อัปเดตล่าสุด: 2026-06-29

---

<div align="center">

![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![Assessed](https://img.shields.io/badge/Last%20Assessed-2026--06--29-orange)

</div>

---

## 📋 Table of Contents

1. [Version Compatibility](#-version-compatibility)
2. [Pre-Deployment Checklist](#-pre-deployment-checklist)
3. [Real-World Troubleshooting](#-real-world-troubleshooting)
4. [Data Format Confidence](#-data-format-confidence)
5. [Go-Live Checklist](#-go-live-checklist)

---

## 🔧 Version Compatibility

### Current Stack Versions

| Component | Current | Latest | Risk | Notes |
|---|---|---|---|---|
| **Node-RED** | 4.0.5 | 5.0 | ⚠️ HIGH | 2 major versions behind, requires Node.js 22.9+ |
| **TimescaleDB** | PostgreSQL 16 | PG 17 | ✅ LOW | v16 still supported until 2028 |
| **Grafana** | 11.x | 11.x | ✅ NONE | Current version |
| **Prometheus** | v2.55.x | 3.x | ✅ LOW | v2.x still maintained |
| **K6** | unspecified | current | ✅ NONE | Works fine |
| **Docker** | v4.0+ | v4.0+ | ✅ NONE | Stable |

### Node-RED Upgrade Path

> ⚠️ **WARNING**: Node-RED 5.0 (released June 9, 2026) is the biggest Editor change in history.

| Requirement | Current | Required for v5.0 |
|---|---|---|
| Node.js | 18.x | 22.9+ |
| Docker Base Image | node:18-alpine | node:22-alpine |
| Editor UI | Legacy | New React-based |
| Flow Compatibility | ✅ | ⚠️ Test first |

**Recommended Upgrade Path:**
1. Test in staging environment first
2. Read official upgrade guide thoroughly
3. Backup all flows before upgrade
4. Verify custom nodes compatibility

---

## ✅ Pre-Deployment Checklist

### Phase 1: Network Preparation

| # | Task | Status | Owner |
|---|---|---|---|
| 1 | Obtain target machine IP addresses | ⬜ | Network Team |
| 2 | Confirm SNMP community strings | ⬜ | Security Team |
| 3 | Verify SNMP enabled on targets | ⬜ | Server Team |
| 4 | Verify UDP 161 not blocked by firewall | ⬜ | Network Team |
| 5 | Test network connectivity (ping) | ⬜ | IT Team |

**Windows SNMP Enablement:**
```powershell
# Enable SNMP via Windows Features
Enable-WindowsOptionalFeature -Online -FeatureName "SNMP" -All

# Or via GUI: Control Panel → Programs → Turn Windows features on/off → Simple Network Management Protocol (SNMP)
```

**Linux SNMP Enablement:**
```bash
# Debian/Ubuntu
sudo apt update && sudo apt install snmpd

# Enable and start service
sudo systemctl enable snmpd
sudo systemctl start snmpd
```

### Phase 2: Docker Deployment

| # | Task | Status | Command |
|---|---|---|---|
| 1 | Clone repository | ⬜ | `git clone https://github.com/PATTANAKORN025/IMS.git` |
| 2 | Create secrets | ⬜ | `mkdir -p secrets && echo "password" > secrets/postgres_password.txt` |
| 3 | Copy environment | ⬜ | `cp .env.example .env` |
| 4 | Start services | ⬜ | `docker compose up -d` |
| 5 | Wait for startup | ⬜ | `sleep 40` |
| 6 | Verify containers | ⬜ | `docker compose ps` |

### Phase 3: Device Registration

| # | Task | Status | Command |
|---|---|---|---|
| 1 | Update `public.devices` table | ⬜ | `INSERT INTO public.devices (device_id, hostname, ip_address, snmp_community, snmp_port, enabled) VALUES (...)` |
| 2 | Test SNMP connectivity | ⬜ | `snmpwalk -v2c -c <community> <ip> 1.3.6.1.2.1.1` |
| 3 | Verify data flow | ⬜ | Check Grafana dashboards |

### Phase 4: Security Hardening

| # | Task | Status | Reference |
|---|---|---|---|
| 1 | Remove PgBouncer host port | ✅ | Already in prod compose |
| 2 | Enable Node-RED adminAuth | ⬜ | Generate bcrypt hash |
| 3 | Bind Grafana to localhost | ✅ | Already in prod compose |
| 4 | Review SECURITY.md | ⬜ | See security checklist |

---

## 🔍 Real-World Troubleshooting

### Priority-Based Failure Analysis

| Priority | Issue | Symptom | Diagnosis | Fix |
|---|---|---|---|---|
| **P1** | SNMP service disabled | All walkers return empty/timeout | `snmpwalk` returns nothing | Enable SNMP in Windows Features or `apt install snmpd` |
| **P2** | Firewall blocking UDP 161 | Connection timeout after 3s | `telnet <ip> 161` fails | Open UDP 161 between Node-RED container and target |
| **P3** | Community string mismatch | Authentication failure | `snmpwalk` returns "No such name" | Match flow config to target's configured community |
| **P4** | Real OID ≠ simulated OID | Zero data for LDI metrics | LDI panels show "No Data" | Request real MIB from vendor, update walker OIDs |
| **P5** | Host hardcode `ims-snmpsim` | System reads simulator even with real device | Data shows simulator values | Use device registry (Stage 4) or update walker config |
| **P6** | Factory network latency | Timeouts on 3s timeout | Intermittent data gaps | Increase SNMP timeout to 5-10s for remote sites |

### Quick Diagnostic Commands

```bash
# Test SNMP connectivity
snmpwalk -v2c -c <community> <ip> 1.3.6.1.2.1.1

# Check UDP port
nc -zuv <ip> 161

# Test from Node-RED container
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const session = snmp.createSession('<ip>', '<community>', {port: 161, timeout: 5000});
session.get(['1.3.6.1.2.1.1.1.0'], (err, varbinds) => {
    if (err) console.error('ERROR:', err.message);
    else console.log('OK:', varbinds[0].value.toString());
    session.close();
});
"
```

---

## 📊 Data Format Confidence

### Machine Type Assessment

| Machine Type | Simulated vs Real | MIB Standard | Confidence | Notes |
|---|---|---|---|---|
| **Ubuntu (SNMP)** | Standard MIBs | HOST-RESOURCES-MIB | 🟢 HIGH | Highly likely to match |
| **Windows (SNMP)** | Standard MIBs | HOST-RESOURCES-MIB | 🟢 HIGH | Highly likely to match |
| **LDI (YSPhotec)** | Custom `.9999` MIB | Private Enterprise | 🔴 **UNPROVEN** | Entirely assumed |

### LDI Machine Considerations

> ⚠️ **CRITICAL**: YSPhotec machines are controlled via vendor (Bender) system.

| Question | Answer | Action Required |
|---|---|---|
| Does LDI support SNMP? | Unknown | Confirm with vendor/Engineering team |
| What are the real OIDs? | Unknown | Request real MIB file from vendor |
| Are values ÷100? | Assumed | Verify actual value formats |
| Is SNMP gateway needed? | Possible | Evaluate PLC-to-SNMP gateway or Bender API |

**Do not assume SNMP is available until confirmed with vendor.**

---

## 🎯 Go-Live Checklist

### Day Before Go-Live

| # | Task | Owner | Sign-off |
|---|---|---|---|
| 1 | All pre-deployment tasks complete | IT Team | ⬜ |
| 2 | Backup existing monitoring (if any) | IT Team | ⬜ |
| 3 | Notify stakeholders of maintenance window | IT Manager | ⬜ |
| 4 | Prepare rollback plan | IT Team | ⬜ |

### Go-Live Day

| # | Task | Time | Owner |
|---|---|---|---|
| 1 | Start Docker stack | T+0 | IT Team |
| 2 | Wait 40 seconds for startup | T+40s | — |
| 3 | Verify all containers running | T+45s | IT Team |
| 4 | Verify data flow | T+90s | IT Team |
| 5 | Verify dashboards load | T+2min | IT Team |
| 6 | Test alerting (simulate alert) | T+5min | IT Team |
| 7 | Monitor for 24 hours | T+24h | NOC Team |

### Day After Go-Live

| # | Task | Owner |
|---|---|---|
| 1 | Review 24-hour monitoring data | IT Team |
| false positive 2 | Address any false positive alerts | IT Team |
| 3 | Document any issues encountered | IT Team |
| 4 | Schedule 1-week review meeting | IT Manager |

---

<div align="center">

**IMS Deployment Readiness — Version 1.0**

*Assessed for Production Deployment*

</div>
