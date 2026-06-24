# IMS Ultimate Upgrade — Enterprise Architecture Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/monitoring-architecture-upgrade.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade IMS to "Absolute Pinnacle of Enterprise Architecture" — fix Grafana No Data bug, implement 5-Thread Parallel SNMP Walker Pipeline, enhance simulation and alerting.

**Architecture:** Three-phase upgrade: (1) Fix Grafana dashboard variables and SRE aesthetics, (2) Replace SNMP GET with 5-Thread Parallel Walker architecture in Node-RED, (3) Enhance SNMP simulation data and alert tuning.

**Tech Stack:** Node-RED 4.0.5, TimescaleDB 2.17.2, Grafana 11.1.0, Prometheus, Alertmanager, SNMP Simulator

## Global Constraints

- All objects in `public` schema only — no `ims.*` references
- Database name: `ims` (from .env POSTGRES_DB)
- Database user: `ims_admin` (from .env POSTGRES_USER)
- PgBouncer: `ims-pgbouncer:5432` (transaction pooling mode)
- SNMP Community: `apex_mock`
- Machine IDs: `ERP-MASTER-UBUNTU`, `ERP-MASTER-WINDOWS`
- SRE Standard Colors: RX=`#1F60C4`, TX=`#5794F2`
- Deploy command: `docker compose down -v && docker compose up -d`
- After editing flows: copy `nodered_data/flows.json` → `flows-ubuntu.json`

---

## Task 1: Fix Grafana Dashboard Variable Queries

**Covers:** Grafana No Data bug fix

**Files:**
- Modify: `monitoring/grafana/dashboards/ims-engineering-drilldown.json` — verify variable query
- Modify: `monitoring/grafana/dashboards/ims-noc-overview.json` — add machine_id variable if needed
- Modify: `monitoring/grafana/dashboards/ims-capacity-planning.json` — verify no ims.* references

**Analysis:**
- `ims-engineering-drilldown.json` line 838: query is `SELECT DISTINCT machine_id FROM public.machine_telemetry ORDER BY machine_id` — CORRECT
- `ims-noc-overview.json`: No variables (fleet-wide) — CORRECT
- `ims-capacity-planning.json`: No variables (fleet-wide) — CORRECT
- All dashboards use `public.*` schema — no `ims.*` references found

- [ ] **Step 1: Verify and fix ims-engineering-drilldown.json variable**

The current variable query is correct. However, the `current` value is hardcoded. Add `allValue` and ensure refresh works:

```json
{
  "name": "machine_id",
  "label": "Machine",
  "type": "query",
  "query": "SELECT DISTINCT machine_id FROM public.machine_telemetry ORDER BY machine_id",
  "datasource": { "uid": "timescaledb" },
  "refresh": 2,
  "multi": false,
  "includeAll": false,
  "sort": 1,
  "current": {
    "text": "ERP-MASTER-UBUNTU",
    "value": "ERP-MASTER-UBUNTU"
  }
}
```

No changes needed — query already points to `public.machine_telemetry`.

- [ ] **Step 2: Add SRE-standard network colors to ims-engineering-drilldown.json**

Ensure RX panels use `#1F60C4` and TX panels use `#5794F2`. Check existing network panels for correct color overrides.

- [ ] **Step 3: Verify ims-noc-overview.json network colors**

Line 431 and 438 already have `#1F60C4` (RX) and `#5794F2` (TX). Confirm correct.

- [ ] **Step 4: Verify ims-main.json temperature units**

Ensure temperature panel uses `Temperature > Celsius (°C)` unit.

---

## Task 2: Build 5-Thread Parallel SNMP Walker Node-RED Flow

**Covers:** Replace SNMP GET with parallel walker architecture

**Files:**
- Rewrite: `flows-ubuntu.json` — complete replacement with 5-Thread Walker architecture
- The flow will be written to `nodered_data/flows.json` at runtime

**Architecture:**
```
Inject (10s) → Fork 5 Ways → [Walk_CPU, Walk_Storage, Walk_Net32, Walk_Net64, Walk_Temp]
                                    ↓                              ↓
                              Catch Error                    Barrier Sync (5)
                                    ↓                              ↓
                              Bypass Empty                  AIOps Parser
                                                               ↓
                                                    [DB Insert, Debug Log]
```

- [ ] **Step 1: Write the complete 5-Thread Walker flow**

Replace `flows-ubuntu.json` with the full flow including:
- 2 inject nodes (Ubuntu 10s, Windows 10s with 5s offset)
- 1 split function (fork 5 messages)
- 5 SNMP walker nodes (CPU, Storage, Net32, Net64, Temp)
- 1 catch node for walker errors
- 1 error bypass function
- 1 join node (barrier sync, count=5, timeout=8s)
- 1 AIOps parser function (complete telemetry extraction)
- 1 PostgreSQL insert node
- 1 debug node
- 1 PostgreSQL config node

Key parser features:
- `startsWith()` for strict OID prefix matching
- `GREATEST(0,...)` counter wrap protection
- Per-interface JSONB metrics
- `safeStr()` escaping for SQL injection prevention
- `msg.payload = null` and `flatData.length = 0` memory cleanup

- [ ] **Step 2: Verify flow JSON is valid**

Parse the JSON and verify all node IDs, wire references, and types are correct.

---

## Task 3: Update SNMP Simulator for Thermal Alert Testing

**Covers:** Enhanced simulation data

**Files:**
- Modify: `monitoring/snmpsim/apex_mock.snmprec`

**Changes:**
- Increase temperature max from 82°C to 88°C (to trigger ThermalRunawayCritical alert at 80°C)
- Keep existing chaos engineering data (error rates, interface flapping)

- [ ] **Step 1: Update temperature OID**

Change line 54:
```
1.3.6.1.4.1.2021.13.16.2.1.7.1|2:numeric|min=45,max=88,rate=3
```

- [ ] **Step 2: Verify all OIDs are correctly formatted**

Ensure no syntax errors in the .snmprec file.

---

## Task 4: Tune Prometheus Alert Rules

**Covers:** Alert tuning for reduced false positives

**Files:**
- Modify: `monitoring/prometheus/rules/ims-alerts.yml`

**Changes:**
- Add `for: 5m` to ThermalRunawayCritical (currently `for: 1m`)
- Update NetworkErrorsSpike threshold from 20 to 100 per minute
- Add interface status persistence check

- [ ] **Step 1: Update ThermalRunawayCritical duration**

Change `for: 1m` to `for: 5m` to prevent false alarms during brief CPU spikes.

- [ ] **Step 2: Update NetworkErrorsSpike threshold**

Change `increase(net_rx_errors[1m]) > 20` to `> 100` to reduce noise.

---

## Task 5: Deploy and Verify

**Covers:** Full deployment and verification

- [ ] **Step 1: Clean deploy**

```bash
docker compose down -v && docker compose up -d
```

- [ ] **Step 2: Wait for services to stabilize (60 seconds)**

```bash
timeout 60 bash -c 'until docker compose exec timescaledb pg_isready -U ims_admin -d ims; do sleep 5; done'
```

- [ ] **Step 3: Verify database has data**

```bash
docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT COUNT(*) FROM public.machine_telemetry;"
```

Expected: Count > 0 after a few polling cycles.

- [ ] **Step 4: Verify Grafana dashboards**

Access http://localhost:3000 and check:
- IMS Engineering Drill-Down: `$machine_id` dropdown shows `ERP-MASTER-UBUNTU` and `ERP-MASTER-WINDOWS`
- All panels show data (not "No data")
- Network graph uses Dark Blue (#1F60C4) for RX and Light Blue (#5794F2) for TX

- [ ] **Step 5: Verify Node-RED pipeline**

Access http://localhost:1880 and check:
- Flow shows "IMS Enterprise Engine" tab
- 5 walker nodes are active (green status)
- Debug node shows successful telemetry inserts
- No errors in catch node

- [ ] **Step 6: Verify SNMP simulator**

```bash
snmpwalk -v2c -c 'apex_mock' localhost:1161 1.3.6.1.4.1.2021.13.16.2.1.7
```

Expected: Temperature value between 45-88°C.
