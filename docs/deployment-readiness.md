# Deployment Readiness Assessment

_assessed: 2026-06-28_

## Version Status

| Tool | Current | Latest | Risk |
|---|---|---|---|
| Node-RED | 4.0.5 | 5.0 | HIGH — 2 major versions behind, breaking Editor changes, requires Node.js 22.9+ |
| TimescaleDB | PostgreSQL 16 | PG 17 available | LOW — 16 is still supported |
| Grafana | 11.x | 11.x | NONE — current |
| Prometheus | v2.55.x | 3.x available | LOW — 2.x still maintained |
| K6 | unspecified | current | NONE — works fine |

**Node-RED upgrade note:** Version 5.0 (released June 9, 2026) is the biggest Editor change in history. Must verify Docker base image supports Node.js 22.9+ before upgrading. Plan: test in staging first, read upgrade guide thoroughly.

## Pre-Deployment Checklist

### Before LAN Reconnection
- [ ] Obtain target machine IP addresses
- [ ] Confirm SNMP community strings
- [ ] Verify SNMP is enabled on target (Windows: enable via "Windows Features On/Off")
- [ ] Verify UDP 161 is not blocked by firewall

### Before First `docker compose up` on Physical Machine
- [ ] Replace `ims-snmpsim` with actual IP in walker functions (or use device registry)
- [ ] Update `public.machines` table with real device entries
- [ ] Test SNMP connectivity: `snmpwalk -v2c -c <community> <ip> 1.3.6.1.2.1.1`

### Before Granting Network Access
- [ ] Remove PgBouncer host port binding (already done in compose)
- [ ] Enable Node-RED adminAuth (generate bcrypt hash)
- [ ] Bind Grafana to localhost only (already done in prod compose)
- [ ] Review SECURITY.md checklist

### Before Connecting LDI (YSPhotec) Machine
- [ ] **CRITICAL**: Confirm with vendor/Engineering team whether LDI supports SNMP
- [ ] Request real MIB file from vendor — OIDs `.9999.*` are entirely mocked
- [ ] If SNMP not supported: evaluate PLC-to-SNMP gateway or Bender API
- [ ] Compare real OIDs against mocked OIDs before any code changes
- [ ] Verify actual value formats (dividing by 100 is assumed, may be wrong)

## Real-World Troubleshooting Priority

Based on highest probability of failure:

| Priority | Issue | Symptom | Fix |
|---|---|---|---|
| 1 | SNMP service disabled on target | All walkers return empty/timeout | Enable SNMP in Windows Features or `apt install snmpd` on Linux |
| 2 | Firewall blocking UDP 161 | Connection timeout after 3s | Open UDP 161 between Node-RED container and target |
| 3 | Community string mismatch | Authentication failure | Match flow config to target's configured community |
| 4 | Real OID ≠ simulated OID | Zero data for LDI metrics | Request real MIB from vendor, update walker OIDs |
| 5 | Host hardcode `ims-snmpsim` | System reads simulator even with real device | Use device registry (Stage 4) or update walker config |
| 6 | Factory network latency | Timeouts on 3s timeout | Increase SNMP timeout to 5-10s for remote sites |

## Data Format Confidence

| Machine Type | Simulated vs Real | Confidence |
|---|---|---|
| Ubuntu (SNMP) | Standard MIBs — highly likely to match | HIGH |
| Windows (SNMP) | Standard MIBs — highly likely to match | HIGH |
| LDI (YSPhotec) | Custom `.9999` MIB — entirely assumed | **UNPROVEN** |

**Key insight:** YSPhotec machines are controlled via vendor (Bender) system. SNMP access may require gateway or API intermediary. Do not assume SNMP is available until confirmed with vendor.
