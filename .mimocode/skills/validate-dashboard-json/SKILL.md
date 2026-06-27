---
name: validate-dashboard-json
description: Validate Grafana dashboard JSON files before deploying changes
---

# Validate Dashboard JSON

Ensure Grafana dashboard JSON files are syntactically valid before deployment.

## When to Use

After editing any Grafana dashboard JSON file in `monitoring/grafana/dashboards/`.

## Quick Validation

```bash
python -c "import json; json.load(open('monitoring/grafana/dashboards/ims-noc-overview.json'))" && echo "OK"
```

## Validate All Dashboards

```bash
for f in monitoring/grafana/dashboards/*.json; do
  python -c "import json; json.load(open('$f'))" && echo "OK: $f" || echo "FAIL: $f"
done
```

## Common JSON Errors

1. **Duplicate keys**: Two `overrides` sections in same `fieldConfig`
   - Fix: Remove duplicate, ensure single `overrides` array inside `fieldConfig`

2. **Misplaced properties**: `thresholds` outside `defaults` object
   - Fix: Move `thresholds` inside `fieldConfig.defaults`

3. **Trailing commas**: Invalid JSON syntax
   - Fix: Remove commas before closing braces/brackets

## Manual Fix Pattern

If JSON validation fails, use Python to identify the error:
```bash
python -c "
import json
try:
    json.load(open('monitoring/grafana/dashboards/file.json'))
except json.JSONDecodeError as e:
    print(f'Error at line {e.lineno}, col {e.colno}: {e.msg}')
"
```

## Dashboard Files

- `ims-noc-overview.json` - Executive fleet view
- `ims-main.json` - System overview
- `ims-engineering-drilldown.json` - Per-machine deep dive
- `ims-capacity-planning.json` - Capacity forecasting

## Semantic Color Convention

When editing dashboards, maintain these color assignments:
- CPU: Yellow → Orange → Red
- RAM: Purple → Dark-orange → Red
- Disk: Cyan → Blue → Red
- Network RX: Dark Blue (#1F60C4)
- Network TX: Light Blue (#5794F2)
- Errors: Red

## Stale Schema Reference Check

After schema migrations (e.g., dropping `ims.*` schema), verify no dashboards reference dropped objects:

```bash
# Check for any ims.* references (should return zero matches)
grep -r "ims\." monitoring/grafana/dashboards/*.json
```

Common stale patterns to watch for:
- `ims.machine_telemetry` → should be `public.machine_telemetry`
- `ims.v_uptime_summary` → should be `public.v_uptime_summary`
- `ims.telemetry_minute_summary` → should be `public.telemetry_minute_summary`
- `ims.alert_rules` → should be `public.alert_rules`

## Unit Sanity Check

Verify Grafana panel units match the SQL query output:

| SQL Column | Correct Unit | Wrong Unit |
|-----------|-------------|------------|
| `disk_used_gb` | `gbytes` | `decgbytes`, `bytes`, `* 1024` in SQL |
| `ram_used_mb` | `mbytes` | `decmbytes`, `bytes` |
| `rx_mbps` / `tx_mbps` | `mbps` | `decmbytes`, `bytes` |
| `net_rx_errors` | `short` | `decmbytes`, `bytes` |
| `cpu_load_percent` | `percent` | `short` |

Red flags in SQL:
- `* 1024` or `* 1048576` — double conversion when Grafana also applies unit
- `decgbytes` or `decmbytes` — deprecated unit names, use `gbytes` / `mbytes`
