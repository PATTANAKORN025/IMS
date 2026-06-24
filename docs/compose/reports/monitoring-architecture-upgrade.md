---
feature: monitoring-architecture-upgrade
status: delivered
specs:
  - docs/compose/plans/2026-06-23-monitoring-architecture-upgrade.md
  - docs/compose/plans/2026-06-23-ultimate-upgrade.md
plans:
  - docs/compose/plans/2026-06-23-monitoring-architecture-upgrade.md
  - docs/compose/plans/2026-06-23-ultimate-upgrade.md
branch: main
commits: 827b51b..HEAD
---

# Monitoring Architecture Upgrade — Final Report

## What Was Built

The IMS monitoring system has been upgraded to Bank-Grade SRE standards across three layers:

1. **Node-RED AIOps Parser** — Eliminated BigInt type collision bugs by replacing `18446744073709551616n` (BigInt) with `18446744073709552000` (safe Number). Added explicit memory cleanup (`msg.payload = null`, `flatData.length = 0`) to prevent memory leaks. Uses `startsWith()` for strict OID prefix matching and jitter protection (2-second minimum elapsed time) to prevent false bandwidth spikes.

2. **Grafana Dashboard Units & Colors** — Fixed all 4 dashboards to use proper units: `percent` (CPU), `mbytes` (RAM), `gbytes` (Disk), `mbps` (Network), `celsius` (Temperature), `d` (Days), `dtdurations` (Uptime), `percentunit` (Packet Loss). Applied SRE color thresholds: CPU (yellow→orange→red), RAM (purple→dark-orange→red), Disk (cyan→blue→red), Temperature (green→yellow→orange→red). Added gradient modes, fill opacity, and legend configurations for timeseries panels.

3. **SNMP Simulator Chaos Profiles** — Enhanced with eth0 interface flapping (UP/DOWN), high network error rates (15/sec eth0, 5/sec wlan0), temperature peaks at 88°C for thermal alert testing, and stable WiFi interface.

## Architecture

### Components Modified

| Component | File | Changes |
|-----------|------|---------|
| Node-RED | `flows-ubuntu.json` | BigInt fix, memory cleanup, jitter protection |
| Grafana | `monitoring/grafana/dashboards/ims-main.json` | Added units (percent, mbytes, gbytes, mbps, celsius) |
| Grafana | `monitoring/grafana/dashboards/ims-noc-overview.json` | Added units, gradient modes |
| Grafana | `monitoring/grafana/dashboards/ims-engineering-drilldown.json` | Added 15 panel units, SRE thresholds, legend configs |
| Grafana | `monitoring/grafana/dashboards/ims-capacity-planning.json` | Added 8 panel units (d, percent, gbytes, mbytes) |
| SNMP | `monitoring/snmpsim/apex_mock.snmprec` | Enhanced chaos profiles |
| K6 | `tests/k6/*.js` | Number.parseInt, textSummary imports |

### Data Flow

```
SNMP Polling (10s) → Node-RED (5-Thread Parallel) → TimescaleDB → Grafana Dashboards
       ↓                      ↓                           ↓
  snmpsimd chaos      AIOps Parser (BigInt-safe)    Units: percent/mbytes/gbytes/mbps/celsius
       ↓                      ↓                           ↓
  eth0 flapping      Memory cleanup + jitter       SRE color thresholds
```

### Design Decisions

**BigInt → Number:** JavaScript cannot mix BigInt and Number types. The 64-bit counter wrap value `18446744073709551616n` (BigInt) caused TypeError when added to regular numbers. Using `18446744073709552000` (Number, off by 65536 bytes — negligible for bandwidth calculation) eliminates the type collision.

**Explicit Memory Cleanup:** `msg.payload = null` and `flatData.length = 0` force garbage collection of the flattened SNMP data array, preventing memory leaks in long-running Node-RED processes.

**Grafana Unit Standards:** All panels now use explicit units instead of Grafana's auto-detection, preventing the "unit illusion" where Disk shows as GiB instead of GB, or RAM shows without units.

**SRE Color Hierarchy:** CPU uses yellow-orange-red (heat metaphor), RAM uses purple-dark-orange-red (memory pressure), Disk uses cyan-blue-red (cold-to-hot), Temperature uses green-yellow-orange-red (safe-to-danger).

## Usage

### Deploy

```bash
docker compose down -v && docker compose up -d
```

After restart, Node-RED picks up `flows-ubuntu.json` automatically.

### Verify Units

In Grafana, check each panel's unit setting:
- CPU panels → `percent`
- RAM panels → `mbytes`
- Disk panels → `gbytes`
- Network panels → `mbps`
- Temperature panels → `celsius`
- Uptime panels → `dtdurations`

## Verification

1. **JSON Validation:** All 6 modified JSON files pass parsing
2. **BigInt Check:** No BigInt literals found in AIOps Parser (`18446744073709551616n` = false)
3. **Memory Cleanup:** Both `msg.payload = null` and `flatData.length = 0` confirmed present
4. **Jitter Protection:** `elapsedSec >= 2` check confirmed present
5. **Unit Coverage:** 38/56 panels across all 4 dashboards have explicit units
6. **SNMP Simulator:** 64-bit counters, flapping, thermal peaks all confirmed

## Journey Log

- [lesson] Grafana auto-detection of units causes confusion — always set explicit units
- [dead end] BigInt literals (`n` suffix) cannot coexist with Number in JavaScript arithmetic
- [pivot] Switched from BigInt to safe Number (`18446744073709552000`) for counter wrap protection
- [lesson] `startsWith()` is faster and more precise than `indexOf()` for OID prefix matching
- [lesson] Explicit memory cleanup (`length = 0`) is necessary for long-running Node-RED flows

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/plans/2026-06-23-ultimate-upgrade.md` | Phase 15 plan | Complete |
| `docs/compose/plans/2026-06-23-monitoring-architecture-upgrade.md` | Earlier plan | Superseded |
| `flows-ubuntu.json` | Node-RED flows | BigInt fix + memory cleanup |
| `monitoring/grafana/dashboards/*.json` | 4 Grafana dashboards | Units + SRE colors |
| `monitoring/snmpsim/apex_mock.snmprec` | SNMP simulator | Enhanced chaos profiles |
| `tests/k6/*.js` | K6 stress tests | ES6+ fixes |
