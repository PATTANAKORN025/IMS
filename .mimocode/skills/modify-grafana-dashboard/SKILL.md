---
name: modify-grafana-dashboard
description: Programmatically modify Grafana dashboard JSON — reorder panels, fix gridPos, update colors, change SQL, fix datasource UIDs
---

# Modify Grafana Dashboard

Edit Grafana dashboard JSON files programmatically via Node.js scripts. Use when you need to reorder panels, recalculate gridPos coordinates, standardize colors, update SQL queries, or fix datasource references across multiple panels.

## When to Use

- Reordering panels between rows (e.g., LDI panels ended up in wrong row)
- Recalculating `gridPos` y-coordinates after panel moves
- Standardizing color palettes across dashboard panels
- Updating SQL column references after continuous aggregate recreation
- Fixing datasource UIDs (`${DS_IMS_DATABASE}` → `uid: "timescaledb"`)
- Any bulk edit touching 3+ panels in a dashboard JSON

**Do NOT use** for: simple JSON syntax validation (use `validate-dashboard-json`) or pushing to Grafana API (use `import-grafana-dashboard`).

## Why Node.js Scripts (Not Edit Tool)

Grafana dashboard JSON files are large (500-2000+ lines) with deeply nested panel objects. The Edit tool requires exact string matching which is fragile on these files. `JSON.parse()`/`JSON.stringify()` provides:
- Safe round-trip (no data corruption)
- Programmatic panel search by ID
- Batch gridPos recalculation
- `\n` preservation in query strings

## Steps

### 1. Read current dashboard structure

```bash
node -e "const f=JSON.parse(require('fs').readFileSync('monitoring/grafana/dashboards/ims-engineering-drilldown.json','utf8')); console.log('Panels:', f.panels.length); f.panels.forEach(p => console.log(p.id, p.type, (p.title||'').substring(0,50)))"
```

### 2. Find panels by ID or title

```bash
node -e "
const f=JSON.parse(require('fs').readFileSync('monitoring/grafana/dashboards/ims-engineering-drilldown.json','utf8'));
const target = f.panels.find(p => p.id === 502);
console.log(JSON.stringify(target, null, 2).substring(0, 500));
"
```

### 3. Write modification script

Create `_tmp_dashboard_edit.js`:

```javascript
const fs = require('fs');
const path = 'monitoring/grafana/dashboards/ims-engineering-drilldown.json';
const dash = JSON.parse(fs.readFileSync(path, 'utf8'));

// --- Example: Reorder panels ---
// Move panels 503-506 to follow row 507
const rows = dash.panels.filter(p => p.type === 'row');
const ldiRow = rows.find(r => r.id === 507);
const ldiPanels = [503, 504, 505, 506].map(id => dash.panels.find(p => p.id === id));
const otherPanels = dash.panels.filter(p => !ldiPanels.includes(p) && p.id !== 507);

// Rebuild: other panels, then row, then LDI panels
const reordered = [...otherPanels, ldiRow, ...ldiPanels];

// --- Recalculate gridPos y-coordinates ---
let y = 0;
for (const panel of reordered) {
  if (panel.type === 'row') {
    panel.gridPos = { h: 1, w: 24, x: 0, y: y };
    y += 1;
  } else {
    panel.gridPos.y = y;
    // Keep h, w, x from original — only update y
  }
}

dash.panels = reordered;
fs.writeFileSync(path, JSON.stringify(dash, null, 2));
console.log('Done. Panels reordered, gridPos recalculated.');
```

```bash
node _tmp_dashboard_edit.js && rm _tmp_dashboard_edit.js
```

### 4. Fix datasource UIDs

Common pattern: panels reference `${DS_IMS_DATABASE}` which doesn't exist. Must use `uid: "timescaledb"`.

```bash
node -e "
const fs = require('fs');
const path = 'monitoring/grafana/dashboards/ims-engineering-drilldown.json';
const dash = JSON.parse(fs.readFileSync(path, 'utf8'));
let fixed = 0;
dash.panels.forEach(p => {
  if (p.targets) {
    p.targets.forEach(t => {
      if (t.datasource && typeof t.datasource === 'string' && t.datasource.includes('DS_IMS')) {
        t.datasource = { type: 'postgres', uid: 'timescaledb' };
        fixed++;
      }
      if (t.datasource && t.datasource.uid && t.datasource.uid.includes('DS_IMS')) {
        t.datasource.uid = 'timescaledb';
        fixed++;
      }
    });
  }
});
fs.writeFileSync(path, JSON.stringify(dash, null, 2));
console.log('Fixed', fixed, 'datasource references');
"
```

### 5. Standardize colors

SRE standard palette for IMS:
- eth0 RX: `#1F60C4` (Dark Blue), eth0 TX: `#5794F2` (Light Blue)
- wlan0 RX: `#8E24AA` (Purple), wlan0 TX: `#E02F44` (Magenta)
- LDI Throughput: `#73BF69`, PE: `#FADE2A`, JE: `#8F3BB3`
- Humidity: `#5794F2`, Power: `#FF9830`, Vibration: `#C4162A`
- WiFi RSSI: `#00B8D9`, WiFi SNR: `#36D1DC`

```bash
node -e "
const fs = require('fs');
const path = 'monitoring/grafana/dashboards/ims-engineering-drilldown.json';
const dash = JSON.parse(fs.readFileSync(path, 'utf8'));
const colorMap = {
  'eth0 RX': '#1F60C4', 'eth0 TX': '#5794F2',
  'wlan0 RX': '#8E24AA', 'wlan0 TX': '#E02F44'
};
// Apply colors to panel targets based on legend
dash.panels.forEach(p => {
  if (p.targets) {
    p.targets.forEach(t => {
      const legend = (t.legendFormat || '').toLowerCase();
      for (const [key, color] of Object.entries(colorMap)) {
        if (legend.includes(key.toLowerCase().replace(' ', ''))) {
          if (!t.lineColor) t.lineColor = color;
          if (!t.backgroundColor) t.backgroundColor = color;
        }
      }
    });
  }
});
fs.writeFileSync(path, JSON.stringify(dash, null, 2));
console.log('Colors standardized.');
"
```

### 6. Validate and import

```bash
# Validate JSON
python -c "import json; json.load(open('monitoring/grafana/dashboards/ims-engineering-drilldown.json'))" && echo "VALID"

# Import to Grafana
$dash = Get-Content -Raw "monitoring/grafana/dashboards/ims-engineering-drilldown.json" | ConvertFrom-Json
$body = @{ dashboard = $dash; overwrite = $true } | ConvertTo-Json -Depth 20
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:admin"))
$headers = @{ Authorization = "Basic $auth"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "http://localhost:3000/api/dashboards/db" -Method POST -Headers $headers -Body $body
```

## Common Patterns

### Reorder panels to follow correct row

1. Find row panel by ID (e.g., `id: 507` for "LDI Manufacturing Telemetry")
2. Extract all panels that belong under that row
3. Rebuild array: `[...panelsBeforeRow, rowPanel, ...panelsBelongingToRow]`
4. Recalculate y-coordinates sequentially

### Fix gridPos after reorder

```javascript
let y = 0;
for (const panel of reordered) {
  panel.gridPos.y = y;
  y += panel.gridPos.h;
}
```

### Verify datasource UID matches Grafana

```bash
curl -s http://localhost:3000/api/datasources -H "Authorization: Basic $(echo -n 'admin:admin' | base64)" | python -c "import json,sys; [print(d['uid'], d['name']) for d in json.load(sys.stdin)]"
```

## Gotchas

- **Never use PowerShell `ConvertTo-Json`** on dashboard JSON — corrupts escape sequences
- **Panel IDs must be unique** — duplicate IDs cause rendering failures
- **`gridPos.y` is absolute** from dashboard top, not relative to row — recalculate all y values after any reorder
- **Datasource UID must match** actual Grafana API response, not assumed values
- **Row panels have `h: 1`** — collapsed rows still occupy y-space

## Files Modified

- `monitoring/grafana/dashboards/*.json` — Dashboard JSON files (source of truth)
- `_tmp_dashboard_edit.js` — Temp scripts (auto-cleaned after execution)
