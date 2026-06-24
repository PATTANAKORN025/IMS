---
feature: monitoring-architecture-upgrade
status: delivered
specs:
  - docs/compose/plans/2026-06-23-monitoring-architecture-upgrade.md
plans:
  - docs/compose/plans/2026-06-23-monitoring-architecture-upgrade.md
branch: main
commits: 827b51b..f432aa4
---

# Monitoring Architecture Upgrade — Final Report

## What Was Built

The IMS monitoring system has been upgraded with three key improvements:

1. **Enhanced Node-RED Flawless Walker Engine** — Added jitter protection to prevent network speed spikes (e.g., 32 Gbps readings) when packets arrive with small time deltas. The engine now requires at least 2 seconds elapsed before calculating bandwidth, and forces bandwidth to 0 when interface status is DOWN.

2. **Comprehensive Alertmanager Inhibition Rules** — Replaced existing inhibition rules with a complete set that prevents alert fatigue. Critical alerts now suppress warnings for the same alertname/machine, and machine-down scenarios suppress all related telemetry warnings.

3. **Grafana Dashboard Validation** — Verified all 4 dashboards (NOC Overview, Main, Engineering Drilldown, Capacity Planning) already follow the semantic color hierarchy. Fixed JSON syntax errors in the Engineering Drilldown dashboard that had duplicate overrides sections.

## Architecture

### Components Modified

| Component | File | Changes |
|-----------|------|---------|
| Node-RED | `flows-ubuntu.json` | Enhanced function node with jitter protection |
| Alertmanager | `monitoring/alertmanager/alertmanager.yml` | Replaced inhibition rules |
| Grafana | `monitoring/grafana/dashboards/ims-engineering-drilldown.json` | Fixed JSON syntax errors |

### Data Flow

```
SNMP Polling (10s) → Node-RED Flawless Walker Engine → TimescaleDB → Grafana Dashboards
                              ↓
                     Alertmanager (Inhibition Rules)
                              ↓
                     Slack/Webhook Notifications
```

### Design Decisions

**Jitter Protection:** We chose a 2-second minimum elapsed time before bandwidth calculation because:
- SNMP polls every 10 seconds, so 2s is conservative
- Prevents division by tiny fractions that cause Mbps spikes
- Uses previous values when elapsed time is insufficient

**Status-Aware Bandwidth:** When interface status is DOWN (2), bandwidth is forced to 0 because:
- A down interface cannot transmit/receive data
- Prevents false "traffic" readings on disabled ports

**Alert Inhibition Hierarchy:**
- Critical → suppresses Warning (same alertname + machine)
- Critical → suppresses Info (same alertname + machine)
- InterfaceDown → suppresses all network warnings
- ServiceDown → suppresses all warnings on same machine

## Usage

### Node-RED Engine

The enhanced engine automatically:
- Tracks per-machine interface state in flow context
- Calculates 64-bit counter wraps (add 2^64 on negative diff)
- Stores interface metrics as JSONB in TimescaleDB
- Outputs: `machine_id`, `ts`, `rxMbps`, `errors`, `status`, `temp`

### Alertmanager Inhibition

Rules are automatically applied. Key behaviors:
- If a machine is DOWN, you won't get CPU/RAM/Thermal warnings
- If an interface is DOWN, you won't get network warnings
- Critical alerts suppress lower-severity alerts for same issue

## Verification

1. **JSON Validation:** All JSON files pass `json.load()` parsing
2. **YAML Validation:** Alertmanager config passes `yaml.safe_load()` parsing
3. **Docker Compose:** Configuration validates successfully
4. **Semantic Colors:** All dashboards already follow the color hierarchy:
   - CPU: Yellow-Orange-Red
   - RAM: Purple/Dark-orange/Red
   - Disk: Cyan/Blue/Red
   - Network RX: Green
   - Network TX: Blue
   - Errors: Red

## Journey Log

- [lesson] Grafana dashboards were already well-configured with semantic colors — no changes needed
- [dead end] Initial JSON fix attempts with regex failed due to complex nested structures
- [pivot] Switched to manual edit approach for fixing duplicate overrides sections
- [lesson] PowerShell `for` loops differ from bash — used Python for validation scripts

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/plans/2026-06-23-monitoring-architecture-upgrade.md` | Implementation plan | Complete |
| `nodered_data/flows.json` | Node-RED flows (local) | Updated but gitignored |
| `flows-ubuntu.json` | Node-RED flows (committed) | Updated with enhanced engine |
| `monitoring/alertmanager/alertmanager.yml` | Alertmanager config | Updated inhibition rules |
