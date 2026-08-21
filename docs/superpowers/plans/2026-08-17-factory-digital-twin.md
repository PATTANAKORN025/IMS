<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# IMS LDI — Factory Digital Twin (2D Canvas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`, a new Grafana Canvas-panel dashboard showing the 10 real reporting LDI machines grouped into their 5 real zones, with live state/alarm/production/compliance data and drill-down to the existing Machine Snapshot dashboard.

**Architecture:** One new dashboard JSON file. A top stat-panel strip (4 fleet-wide numbers, all reused queries) sits above a single Canvas panel containing 5 static zone-label rectangles and 10 machine nodes. Each node is bound to its own query target (a hardcoded-`eqp_id` `LIMIT 1` lookup against `v_ldi_machine_latest_full`, the same view Andon already uses) plus one alarm-detail target per machine. No new database objects, no new views, no new plugins.

**Tech Stack:** Grafana 13.1.1 core Canvas panel (`type: canvas`, internal/no-plugin), PostgreSQL/TimescaleDB via the existing `timescaledb` datasource, existing `v_ldi_machine_latest_full` / `ldi_alarm_log` / `ldi_alarm_ms_code` / `ldi_alarm_lifecycle` / `v_ldi_alarm_category` tables/views.

## Global Constraints

- Do not modify `monitoring/grafana/dashboards/manufacturing/ims-ldi-manufacturing.json`.
- Do not modify `monitoring/grafana/dashboards/manufacturing/ims-ldi-operator-andon.json`.
- No mock/simulated data — every query targets real tables/views already proven elsewhere in this repo.
- Real datasource only: `{"uid": "timescaledb"}`.
- `machine_id` uniqueness: rely on `devices.device_id` (real primary key) — no new uniqueness logic needed.
- `board_id`: do not fabricate. It is empty on 100% of real rows (verified 2026-08-17: 0 distinct non-empty values across 19,043 rows). Use `log_id` instead (verified 100% non-null, 100% unique, 19,119/19,119) and label it "Event ID", never "Board ID".
- `board_no`/`total_board`: use only after the validation query in Task 4 confirms `board_no <= total_board` holds (already verified 2026-08-17: 0/19,053 violations).
- Show only the 10 machines confirmed reporting real data in the last 24h: `LDI-01`..`LDI-10`. Do not include the other 13 registered-but-silent `device_id` rows.
- Every raw-`ldi_data` query target must be a `LIMIT 1` / `DISTINCT ON` latest-value shape (query-tiering contract, `GRAFANA_DESIGN_SYSTEM.md` §10) — no range scans against raw `ldi_data`.
- Every query target must run under 300ms in practice; CI hard-fails at 2000ms (`tests/smoke/query-budget-check.sh`).
- No `<style>`/CSS-injection panels. All visual styling via each panel's/element's native JSON config only.
- Every machine node must have a drill-down link to `ims-ldi-machine-snapshot`.
- Every fill color must map to a documented state name (0/1/2/3 → NO_DATA/IDLE/OK/ALARM), reusing the exact tokens already in `GRAFANA_DESIGN_SYSTEM.md` §2.1 (`#64748B`/`#F59E0B`/`#22C55E`/`#EF4444`).
- No external Grafana plugins beyond `GF_INSTALL_PLUGINS` in `docker-compose.yaml` (canvas panel is core/internal — confirmed via `GET /api/plugins`, `signature: internal` — no addition needed).

---

## Task 1: Verify the real Grafana Canvas panel JSON schema (read-before-write)

Grafana's Canvas panel JSON schema (element types, `root.elements[]` shape, per-element data-binding) has changed across Grafana versions. Rather than hand-author element JSON from memory and risk a schema mismatch, capture the real schema from this exact Grafana instance (13.1.1) first, the same "verify against the live system, don't assume" discipline used earlier this session for the render-API kiosk params.

**Files:**

- Create (temporary, not committed): a throwaway dashboard via the Grafana UI/API, exported and inspected, then deleted. Nothing under `monitoring/grafana/dashboards/` is touched by this task.

**Interfaces:**

- Produces: a verified reference snippet (saved to the plan executor's scratch space, not the repo) showing the real `type: canvas` panel JSON — specifically the `options.root.elements[]` array shape for a `rectangle` element (background color bound to a field) and a `text`/`metric-value` element (text bound to a field), and the `links[]` structure Canvas elements use for drill-down.

- [ ] **Step 1: Create a minimal throwaway canvas panel via the Grafana API**

```bash
source .env
curl -s -u "${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}" \
  -H "Content-Type: application/json" \
  -X POST "http://localhost:${GRAFANA_PORT:-3000}/api/dashboards/db" \
  -d '{
    "dashboard": {
      "title": "TEMP schema probe - delete me",
      "panels": [{
        "id": 1, "type": "canvas", "title": "probe",
        "gridPos": {"x":0,"y":0,"w":12,"h":8},
        "datasource": {"uid": "timescaledb"},
        "targets": [{"refId":"A","datasource":{"uid":"timescaledb"},
          "rawSql":"SELECT '"'"'LDI-01'"'"' AS eqp_id, 2 AS node_state","format":"table"}],
        "options": {"root": {"elements": []}}
      }],
      "schemaVersion": 39
    },
    "overwrite": true
  }' | tee "$SCRATCHPAD/schema_probe_create.json"
```

- [ ] **Step 2: Open the probe dashboard in Grafana's UI (not headless), add one rectangle element bound to the `node_state` field for background color, and one text element bound to `eqp_id`, add a data link (URL) on the rectangle, save.**

- [ ] **Step 3: Export the saved dashboard JSON and extract the `options.root.elements` array**

```bash
source .env
curl -s -u "${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}" \
  "http://localhost:${GRAFANA_PORT:-3000}/api/dashboards/uid/<probe-uid>" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d['dashboard']['panels'][0]['options'], indent=2))" \
  > "$SCRATCHPAD/canvas_schema_reference.json"
```

- [ ] **Step 4: Read `canvas_schema_reference.json`. Confirm it contains, at minimum, a field-bound `background.color.field` (or equivalent) on the rectangle and a `links[]` array on an element. If the real schema differs from what Task 5/6 below assume, update those tasks' JSON before writing them — do not silently proceed with a guessed schema.**

- [ ] **Step 5: Delete the throwaway probe dashboard**

```bash
source .env
curl -s -u "${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}" \
  -X DELETE "http://localhost:${GRAFANA_PORT:-3000}/api/dashboards/uid/<probe-uid>"
```

No commit — this task touches only live Grafana state (deleted at the end) and a scratch file, never a repo file.

---

## Task 2: Scaffold the dashboard file — metadata, templating, style panel

**Files:**

- Create: `monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`

**Interfaces:**

- Produces: dashboard `uid: "ims-ldi-factory-digital-twin"`, template variables `$factory` and `$mo` (hidden, `hide: 2`, same query shape as Andon's), a header text panel (id 9999) for card-border styling **without** the undocumented `<style>` CSS-injection trick Andon uses — use the panel's own `fieldConfig`/`options` for background instead, or omit decorative styling entirely. This satisfies "no undocumented CSS" by construction rather than by exemption.

- [ ] **Step 1: Write the dashboard shell**

```json
{
  "description": "Factory Digital Twin: 2D canvas view of the 10 real reporting LDI machines across their 5 real zones. Production state, alarm state, and compliance status are all live queries against the same tables/views already proven on IMS LDI - Operator Andon Board and IMS LDI - Manufacturing Command Center -- no new queries invented beyond what's documented in docs/superpowers/specs/2026-08-17-factory-digital-twin-design.md. board_id is not used (empty in 100% of real rows) -- log_id is the real per-event traceability key. Does not modify ims-ldi-manufacturing.json or ims-ldi-operator-andon.json.",
  "schemaVersion": 39,
  "liveNow": true,
  "style": "dark",
  "templating": {
    "list": [
      {
        "name": "factory",
        "label": "Factory",
        "type": "query",
        "datasource": { "uid": "timescaledb" },
        "query": "SELECT DISTINCT factory AS __text, factory AS __value FROM public.ldi_data ORDER BY factory",
        "definition": "SELECT DISTINCT factory AS __text, factory AS __value FROM public.ldi_data ORDER BY factory",
        "current": { "selected": true, "text": "All", "value": "$__all" },
        "multi": true,
        "includeAll": true,
        "options": [],
        "refresh": 1,
        "sort": 1,
        "hide": 2,
        "regex": "",
        "skipUrlSync": false
      },
      {
        "name": "mo",
        "label": "MO",
        "type": "query",
        "datasource": { "uid": "timescaledb" },
        "query": "SELECT DISTINCT mo AS __text, mo AS __value FROM public.ldi_data WHERE factory IN (${factory:sqlstring}) ORDER BY mo",
        "definition": "SELECT DISTINCT mo AS __text, mo AS __value FROM public.ldi_data WHERE factory IN (${factory:sqlstring}) ORDER BY mo",
        "current": { "selected": true, "text": "All", "value": "$__all" },
        "multi": true,
        "includeAll": true,
        "options": [],
        "refresh": 1,
        "sort": 1,
        "hide": 2,
        "regex": "",
        "skipUrlSync": false
      }
    ]
  },
  "annotations": {
    "list": [
      {
        "builtIn": 1,
        "datasource": { "type": "grafana", "uid": "-- Grafana --" },
        "enable": true,
        "hide": false,
        "iconColor": "rgba(255, 96, 96, 1)",
        "name": "Annotations & Alerts",
        "type": "dashboard"
      }
    ]
  },
  "panels": [],
  "fiscalYearStartMonth": 0,
  "links": [],
  "id": null,
  "uid": "ims-ldi-factory-digital-twin",
  "title": "IMS LDI - Factory Digital Twin",
  "version": 1,
  "time": { "from": "now-2h", "to": "now" },
  "timezone": "UTC",
  "refresh": "5s",
  "tags": [
    "IMS",
    "LDI",
    "set-2",
    "real-data",
    "current-database",
    "manufacturing",
    "digital-twin"
  ]
}
```

Note: no `machine_id` variable — this dashboard has 10 fixed node positions, not a templated repeat, so filtering by machine doesn't apply the way it does on Andon/Manufacturing.

- [ ] **Step 2: Validate JSON syntax**

```bash
python3 -c "import json; json.load(open('monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json', encoding='utf-8')); print('valid json')"
```

Expected: `valid json`

- [ ] **Step 3: Commit**

```bash
git add monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json
git commit -m "feat(grafana): scaffold Factory Digital Twin dashboard shell"
```

---

## Task 3: Top strip — 4 C-Level stat panels (reused queries only)

**Files:**

- Modify: `monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`

**Interfaces:**

- Consumes: `$factory`, `$mo` from Task 2.
- Produces: panel ids 1 (Fleet Availability), 2 (Active Critical/Major Alarms), 3 (Not-Producing), 4 (Environmental Compliance), all at `y:1, h:3`, all `type: stat`, `x` positions `0/6/14/19` matching Andon's exact top-row layout (`w:6/8/5/5` = 24).

- [ ] **Step 1: Add Fleet Availability (id 1) — byte-for-byte the same query as Andon panel 1, since this is fleet-wide across all registered+enabled LDI devices, not scoped to the 10-node canvas**

```json
{
  "id": 1,
  "title": "◉ Fleet Availability",
  "type": "stat",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "x": 0, "y": 1, "w": 6, "h": 3 },
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "#EF4444", "value": null },
          { "color": "#22C55E", "value": 100 }
        ]
      },
      "color": { "mode": "fixed", "fixedColor": "#00F2FE" },
      "unit": "percent",
      "decimals": 0,
      "min": 0,
      "max": 100,
      "custom": {
        "gradientMode": "opacity",
        "lineInterpolation": "smooth",
        "fillOpacity": 15,
        "lineWidth": 2
      },
      "mappings": [
        {
          "type": "special",
          "options": {
            "match": "null+nan",
            "result": { "color": "#64748B", "text": "NO_DATA", "index": 0 }
          }
        }
      ]
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "area",
    "justifyMode": "center",
    "reduceOptions": { "calcs": ["lastNotNull"], "values": false },
    "text": { "valueSize": 56, "titleSize": 16 },
    "noValue": "NO_DATA",
    "textMode": "value",
    "tooltip": { "mode": "single", "sort": "none" }
  },
  "targets": [
    {
      "refId": "A",
      "datasource": { "uid": "timescaledb" },
      "format": "table",
      "rawSql": "WITH machines AS (\n  SELECT device_id AS eqp_id FROM public.devices WHERE device_type='ldi' AND enabled\n)\nSELECT ROUND((COUNT(*) FILTER (WHERE l.state = true) * 100.0 / NULLIF(COUNT(*), 0))::NUMERIC, 0) AS value\nFROM machines m\nLEFT JOIN LATERAL (\n  SELECT state FROM public.ldi_data d\n  WHERE d.eqp_id = m.eqp_id AND $__timeFilter(d.time) AND d.factory IN (${factory:sqlstring}) AND d.mo IN (${mo:sqlstring})\n  ORDER BY d.time DESC LIMIT 1\n) l ON true"
    }
  ],
  "description": "Percent of the full registered+enabled LDI fleet (23 registered, 10 actually reporting) currently OK. Identical query to IMS LDI - Operator Andon Board panel 1 -- reused, not reinvented."
}
```

- [ ] **Step 2: Add Active Critical/Major Alarms (id 2) — same query as Andon panel 2**

```json
{
  "id": 2,
  "title": "◉ Active Critical/Major Alarms",
  "type": "stat",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "x": 6, "y": 1, "w": 8, "h": 3 },
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "#22C55E", "value": null },
          { "color": "#EF4444", "value": 1 }
        ]
      },
      "color": { "mode": "thresholds" },
      "unit": "short",
      "custom": {
        "gradientMode": "opacity",
        "lineInterpolation": "smooth",
        "fillOpacity": 15,
        "lineWidth": 2
      },
      "mappings": [
        {
          "type": "special",
          "options": {
            "match": "null+nan",
            "result": { "color": "#64748B", "text": "NO_DATA", "index": 0 }
          }
        }
      ]
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "area",
    "justifyMode": "center",
    "reduceOptions": { "calcs": ["lastNotNull"], "values": false },
    "text": { "valueSize": 56, "titleSize": 16 },
    "noValue": "NO_DATA",
    "textMode": "value",
    "tooltip": { "mode": "single", "sort": "none" }
  },
  "targets": [
    {
      "refId": "A",
      "datasource": { "uid": "timescaledb" },
      "format": "table",
      "rawSql": "SELECT COUNT(*)::NUMERIC AS value\nFROM public.ldi_alarm_log a\nJOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT\nLEFT JOIN public.ldi_alarm_lifecycle l ON l.logdate = a.logdate AND l.logid = a.logid\nWHERE m.severity IN ('Critical', 'Major')\n  AND l.status IS DISTINCT FROM 'RESOLVED';"
    }
  ],
  "description": "Active (not RESOLVED) Critical/Major alarms fleet-wide, via public.ldi_alarm_lifecycle. Identical query shape to Andon panel 2."
}
```

- [ ] **Step 3: Add Not-Producing count (id 3) — new query, but reusing the exact 0/1/2/3 state classification already used by Andon's per-machine tiles, aggregated across the 10 real nodes**

```json
{
  "id": 3,
  "title": "◉ Not-Producing (of 10)",
  "type": "stat",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "x": 14, "y": 1, "w": 5, "h": 3 },
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "#22C55E", "value": null },
          { "color": "#F59E0B", "value": 1 },
          { "color": "#EF4444", "value": 3 }
        ]
      },
      "color": { "mode": "thresholds" },
      "unit": "short",
      "decimals": 0,
      "custom": {
        "gradientMode": "opacity",
        "lineInterpolation": "smooth",
        "fillOpacity": 15,
        "lineWidth": 2
      },
      "mappings": [
        {
          "type": "special",
          "options": {
            "match": "null+nan",
            "result": { "color": "#64748B", "text": "NO_DATA", "index": 0 }
          }
        }
      ]
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "area",
    "justifyMode": "center",
    "reduceOptions": { "calcs": ["lastNotNull"], "values": false },
    "text": { "valueSize": 56, "titleSize": 16 },
    "noValue": "NO_DATA",
    "textMode": "value",
    "tooltip": { "mode": "single", "sort": "none" }
  },
  "targets": [
    {
      "refId": "A",
      "datasource": { "uid": "timescaledb" },
      "format": "table",
      "rawSql": "SELECT COUNT(*) FILTER (WHERE\n  NOT v.has_data OR v.is_stale OR NOT v.state OR EXISTS (\n    SELECT 1 FROM public.ldi_alarm_log a\n    JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT\n    WHERE a.equipmentid = v.eqp_id AND m.severity IN ('Critical', 'Major')\n      AND a.logdate > NOW() - INTERVAL '5 minutes'\n  )\n) AS value\nFROM public.v_ldi_machine_latest_full v\nWHERE v.eqp_id IN ('LDI-01','LDI-02','LDI-03','LDI-04','LDI-05','LDI-06','LDI-07','LDI-08','LDI-09','LDI-10')"
    }
  ],
  "description": "Count of the 10 real reporting machines currently NOT producing (NO_DATA, stale, idle, or actively alarming). Same classification logic as each canvas node's state, aggregated. Production-impact proxy for C-Level -- not a revenue/board-count estimate, which this system has no data to support."
}
```

- [ ] **Step 4: Add Environmental Compliance (id 4) — same query as Andon panel 3**

```json
{
  "id": 4,
  "title": "◉ Environmental Compliance",
  "type": "stat",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "x": 19, "y": 1, "w": 5, "h": 3 },
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "#EF4444", "value": null },
          { "color": "#F59E0B", "value": 80 },
          { "color": "#22C55E", "value": 95 }
        ]
      },
      "color": { "mode": "fixed", "fixedColor": "#00F2FE" },
      "unit": "percent",
      "decimals": 0,
      "min": 0,
      "max": 100,
      "custom": {
        "gradientMode": "opacity",
        "lineInterpolation": "smooth",
        "fillOpacity": 15,
        "lineWidth": 2
      },
      "mappings": [
        {
          "type": "special",
          "options": {
            "match": "null+nan",
            "result": { "color": "#64748B", "text": "NO_DATA", "index": 0 }
          }
        }
      ]
    },
    "overrides": []
  },
  "options": {
    "colorMode": "value",
    "graphMode": "area",
    "justifyMode": "center",
    "reduceOptions": { "calcs": ["lastNotNull"], "values": false },
    "text": { "valueSize": 56, "titleSize": 16 },
    "noValue": "NO_DATA",
    "textMode": "value",
    "tooltip": { "mode": "single", "sort": "none" }
  },
  "targets": [
    {
      "refId": "A",
      "datasource": { "uid": "timescaledb" },
      "format": "table",
      "rawSql": "SELECT ROUND((COUNT(DISTINCT eqp_id) FILTER (WHERE temperature BETWEEN 20 AND 24 AND humidity BETWEEN 50 AND 60) * 100.0 / NULLIF(COUNT(DISTINCT eqp_id), 0))::NUMERIC, 0) AS value FROM public.ldi_data WHERE factory IN (${factory:sqlstring}) AND mo IN (${mo:sqlstring}) AND $__timeFilter(time) AND temperature IS NOT NULL AND humidity IS NOT NULL"
    }
  ],
  "description": "Environmental Compliance: percentage of machines within safe temperature AND humidity. Identical query to Andon panel 3."
}
```

- [ ] **Step 5: Validate JSON and confirm row width sums to 24**

```bash
python3 -c "
import json
d = json.load(open('monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json', encoding='utf-8'))
row = [p for p in d['panels'] if p['gridPos']['y'] == 1]
print('width:', sum(p['gridPos']['w'] for p in row))
"
```

Expected: `width: 24`

- [ ] **Step 6: Run each query directly against the real DB to confirm shape and latency before trusting Grafana to render it**

```bash
docker compose exec -T timescaledb psql -U ims_admin -d ims -c "\timing on" -c "
SELECT COUNT(*) FILTER (WHERE
  NOT v.has_data OR v.is_stale OR NOT v.state OR EXISTS (
    SELECT 1 FROM public.ldi_alarm_log a
    JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
    WHERE a.equipmentid = v.eqp_id AND m.severity IN ('Critical', 'Major')
      AND a.logdate > NOW() - INTERVAL '5 minutes'
  )
) AS value
FROM public.v_ldi_machine_latest_full v
WHERE v.eqp_id IN ('LDI-01','LDI-02','LDI-03','LDI-04','LDI-05','LDI-06','LDI-07','LDI-08','LDI-09','LDI-10');
"
```

Expected: a single-row numeric result, `Time: <300ms`.

- [ ] **Step 7: Commit**

```bash
git add monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json
git commit -m "feat(grafana): add Factory Digital Twin top stat strip"
```

---

## Task 4: Validate and finalize the 10 per-machine node queries (query-first, before wiring into Canvas)

TDD-style: write and run each query against the real DB before it goes anywhere near a panel, per this session's evidence discipline (query-tiering + 300ms budget must be true before the query gets embedded, not discovered after).

**Files:**

- None yet (validation only — output feeds Task 5).

**Interfaces:**

- Produces: 10 validated "state" queries (one per `eqp_id`) and 10 validated "alarm detail" queries, confirmed `LIMIT 1`/aggregate shape, confirmed <300ms, ready to paste as Canvas element query targets in Task 5.

- [ ] **Step 1: Write the canonical per-machine state query (LDI-01 instance) — reuses `v_ldi_machine_latest_full`, same columns Andon already surfaces (`mo`, `board_no`, `total_board`, `log_id`, `has_data`, `is_stale`, `state`), same 0/1/2/3 classification as Andon panel 1000**

```sql
SELECT
  'LDI-01' AS eqp_id,
  v.mo,
  v.board_no,
  v.total_board,
  v.log_id,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.ldi_alarm_log a
      JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
      WHERE a.equipmentid = v.eqp_id AND m.severity IN ('Critical', 'Major')
        AND a.logdate > NOW() - INTERVAL '5 minutes'
    ) THEN 3
    WHEN NOT v.has_data OR v.is_stale THEN 0
    WHEN v.state THEN 2
    ELSE 1
  END AS node_state
FROM public.v_ldi_machine_latest_full v
WHERE v.eqp_id = 'LDI-01';
```

- [ ] **Step 2: Run it and time it**

```bash
docker compose exec -T timescaledb psql -U ims_admin -d ims -c "\timing on" -c "
SELECT 'LDI-01' AS eqp_id, v.mo, v.board_no, v.total_board, v.log_id,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.ldi_alarm_log a JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT WHERE a.equipmentid = v.eqp_id AND m.severity IN ('Critical', 'Major') AND a.logdate > NOW() - INTERVAL '5 minutes') THEN 3
    WHEN NOT v.has_data OR v.is_stale THEN 0
    WHEN v.state THEN 2
    ELSE 1
  END AS node_state
FROM public.v_ldi_machine_latest_full v WHERE v.eqp_id = 'LDI-01';
"
```

Expected: 1 row, `node_state` in `{0,1,2,3}`, `board_no <= total_board`, `Time: <300ms`.

- [ ] **Step 3: Repeat Step 1/2 for the remaining 9 machine IDs — substitute the literal `eqp_id` in both the SELECT and the WHERE clause. The 10 real IDs, verified reporting in the last 24h (2026-08-17): `LDI-01, LDI-02, LDI-03, LDI-04, LDI-05, LDI-06, LDI-07, LDI-08, LDI-09, LDI-10`.**

```bash
for id in LDI-02 LDI-03 LDI-04 LDI-05 LDI-06 LDI-07 LDI-08 LDI-09 LDI-10; do
  echo "=== $id ==="
  docker compose exec -T timescaledb psql -U ims_admin -d ims -c "\timing on" -c "
  SELECT '$id' AS eqp_id, v.mo, v.board_no, v.total_board, v.log_id,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.ldi_alarm_log a JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT WHERE a.equipmentid = v.eqp_id AND m.severity IN ('Critical', 'Major') AND a.logdate > NOW() - INTERVAL '5 minutes') THEN 3
      WHEN NOT v.has_data OR v.is_stale THEN 0
      WHEN v.state THEN 2
      ELSE 1
    END AS node_state
  FROM public.v_ldi_machine_latest_full v WHERE v.eqp_id = '$id';
  "
done
```

Expected: 9 more single-row results, all `Time: <300ms`.

- [ ] **Step 4: Write the canonical per-machine alarm-detail query (LDI-01 instance) — reuses the exact Owner category→team mapping and Elapsed calculation from Andon's Action Queue table**

```sql
SELECT
  COUNT(*) AS alarm_count,
  MAX(CASE
    WHEN NOW() - a.logdate < INTERVAL '1 hour'
      THEN GREATEST(EXTRACT(MINUTE FROM (NOW() - a.logdate))::INT, 0)::TEXT || 'm'
    ELSE EXTRACT(HOUR FROM (NOW() - a.logdate))::INT || 'h' || LPAD(EXTRACT(MINUTE FROM (NOW() - a.logdate))::INT::TEXT, 2, '0') || 'm'
  END) AS elapsed,
  MAX(CASE COALESCE(c.category, 'UNCLASSIFIED')
    WHEN 'VACUUM' THEN 'Maintenance' WHEN 'CAMERA' THEN 'Maintenance'
    WHEN 'MOTION' THEN 'Maintenance' WHEN 'MOTOR' THEN 'Maintenance'
    WHEN 'ENVIRONMENT' THEN 'Facility' WHEN 'NETWORK' THEN 'Automation'
    WHEN 'PLC' THEN 'Automation' WHEN 'COMMUNICATION' THEN 'Automation'
    WHEN 'DATABASE' THEN 'IT' WHEN 'ALIGNMENT' THEN 'Process Engineering'
    WHEN 'CALIBRATION' THEN 'Process Engineering' WHEN 'REGISTRATION' THEN 'Process Engineering'
    WHEN 'PROCESS' THEN 'Process Engineering' ELSE 'Maintenance'
  END) AS owner
FROM public.ldi_alarm_log a
JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
LEFT JOIN public.v_ldi_alarm_category c ON c.alarm_code = a.errorcode::TEXT
LEFT JOIN public.ldi_alarm_lifecycle l ON l.logdate = a.logdate AND l.logid = a.logid
WHERE a.equipmentid = 'LDI-01'
  AND m.severity IN ('Critical', 'Major')
  AND l.status IS DISTINCT FROM 'RESOLVED';
```

- [ ] **Step 5: Run it and time it, then repeat for the other 9 machine IDs the same way as Step 3**

```bash
docker compose exec -T timescaledb psql -U ims_admin -d ims -c "\timing on" -c "
SELECT COUNT(*) AS alarm_count,
  MAX(CASE WHEN NOW() - a.logdate < INTERVAL '1 hour' THEN GREATEST(EXTRACT(MINUTE FROM (NOW() - a.logdate))::INT, 0)::TEXT || 'm' ELSE EXTRACT(HOUR FROM (NOW() - a.logdate))::INT || 'h' || LPAD(EXTRACT(MINUTE FROM (NOW() - a.logdate))::INT::TEXT, 2, '0') || 'm' END) AS elapsed,
  MAX(CASE COALESCE(c.category, 'UNCLASSIFIED') WHEN 'VACUUM' THEN 'Maintenance' WHEN 'CAMERA' THEN 'Maintenance' WHEN 'MOTION' THEN 'Maintenance' WHEN 'MOTOR' THEN 'Maintenance' WHEN 'ENVIRONMENT' THEN 'Facility' WHEN 'NETWORK' THEN 'Automation' WHEN 'PLC' THEN 'Automation' WHEN 'COMMUNICATION' THEN 'Automation' WHEN 'DATABASE' THEN 'IT' WHEN 'ALIGNMENT' THEN 'Process Engineering' WHEN 'CALIBRATION' THEN 'Process Engineering' WHEN 'REGISTRATION' THEN 'Process Engineering' WHEN 'PROCESS' THEN 'Process Engineering' ELSE 'Maintenance' END) AS owner
FROM public.ldi_alarm_log a
JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
LEFT JOIN public.v_ldi_alarm_category c ON c.alarm_code = a.errorcode::TEXT
LEFT JOIN public.ldi_alarm_lifecycle l ON l.logdate = a.logdate AND l.logid = a.logid
WHERE a.equipmentid = 'LDI-01' AND m.severity IN ('Critical', 'Major') AND l.status IS DISTINCT FROM 'RESOLVED';
"
```

Expected: 1 row (0 rows aggregate to `alarm_count=0, elapsed=NULL, owner=NULL` — handle NULL as "no active alarm" in the element's text binding, same `noValue` convention used everywhere else in this repo), `Time: <300ms`.

No commit — this task is query validation only, output consumed by Task 5.

---

## Task 5: Canvas panel — 5 zone blocks + 10 machine nodes

**Files:**

- Modify: `monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`

**Interfaces:**

- Consumes: the verified schema from Task 1, the 20 validated query targets (10 state + 10 alarm-detail) from Task 4.
- Produces: panel id 100 (`type: canvas`), `gridPos {x:0, y:4, w:24, h:16}`, containing `options.root.elements` = 5 zone-label rectangles + 10 machine-node groups (each a rectangle + text, bound per Task 1's verified schema).

- [ ] **Step 1: Add the canvas panel shell with all 20 query targets (10 state, refIds A–J; 10 alarm-detail, refIds K–T), one per real machine ID**

```json
{
  "id": 100,
  "title": "◈ Factory Floor",
  "type": "canvas",
  "datasource": { "uid": "timescaledb" },
  "gridPos": { "x": 0, "y": 4, "w": 24, "h": 16 },
  "targets": [
    {
      "refId": "A",
      "datasource": { "uid": "timescaledb" },
      "format": "table",
      "rawSql": "SELECT 'LDI-01' AS eqp_id, v.mo, v.board_no, v.total_board, v.log_id, CASE WHEN EXISTS (SELECT 1 FROM public.ldi_alarm_log a JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT WHERE a.equipmentid = v.eqp_id AND m.severity IN ('Critical', 'Major') AND a.logdate > NOW() - INTERVAL '5 minutes') THEN 3 WHEN NOT v.has_data OR v.is_stale THEN 0 WHEN v.state THEN 2 ELSE 1 END AS node_state FROM public.v_ldi_machine_latest_full v WHERE v.eqp_id = 'LDI-01'"
    }
  ],
  "options": { "root": { "elements": [] } },
  "description": "Factory Digital Twin canvas: 5 real zones (public.devices.location), 10 real reporting machines. Node fill color = state (0/1/2/3 -> NO_DATA/IDLE/OK/ALARM), same classification and color tokens as IMS LDI - Operator Andon Board. board_id not shown (empty in 100% of real rows) -- log_id is the real traceability key. No mock data; every field traces to public.ldi_data / public.ldi_alarm_log / public.v_ldi_machine_latest_full."
}
```

Note: Step 1 shows target A in full; repeat the identical shape for B–J substituting each of the remaining 9 real `eqp_id` literals from Task 4 Step 3, and for K–T substitute the Task 4 Step 4 alarm-detail query per machine.

- [ ] **Step 2: Add the 5 zone-label background rectangles — real zone strings from `public.devices.location`, verified 2026-08-17: `Factory 2 - DF INNER`, `Factory 2 - DF OUTER`, `Factory 2 - SM`, `Factory 3 - DF INNER`, `Factory 3 - SM`**

For each zone, add a `rectangle` element per Task 1's verified schema: fixed (not field-bound) background color `#1E293B` (neutral, not one of the semantic state tokens — this is a static grouping label, not a status), fixed border `#334155`, and a `text` sub-element with the zone name, positioned to visually bound the machines assigned to it (5 machines per Factory-2 side: `LDI-01/02/05/06/07/08`... exact placement grid finalized against Task 1's real coordinate system, not guessed here).

- [ ] **Step 3: Add the 10 machine-node elements — one rectangle (fill bound to `node_state` field via Task 1's real binding mechanism, using the exact color tokens below) + one text element (bound to `eqp_id`+`mo`) + one text element (bound to `board_no`/`total_board`) per machine, positioned inside its real zone's rectangle from Step 2**

Color token table (matches `GRAFANA_DESIGN_SYSTEM.md` §2.1, identical to Andon):

| `node_state` | Color     | Meaning |
| ------------ | --------- | ------- |
| 0            | `#64748B` | NO_DATA |
| 1            | `#F59E0B` | IDLE    |
| 2            | `#22C55E` | OK      |
| 3            | `#EF4444` | ALARM   |

- [ ] **Step 4: Validate JSON**

```bash
python3 -c "import json; json.load(open('monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json', encoding='utf-8')); print('valid json')"
```

- [ ] **Step 5: Commit**

```bash
git add monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json
git commit -m "feat(grafana): add Factory Digital Twin canvas with 5 zones and 10 machine nodes"
```

---

## Task 6: Drill-down links per node

**Files:**

- Modify: `monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`

**Interfaces:**

- Consumes: Task 1's verified `links[]` schema, Task 5's 10 machine-node elements.
- Produces: every one of the 10 machine-node rectangle elements has exactly one link to Machine Snapshot.

- [ ] **Step 1: Add a data link to each machine-node rectangle element, same URL parameter pattern already used by Andon's Action Queue table and Manufacturing's drill-down links**

```json
{
  "title": "Open Machine Snapshot for LDI-01",
  "url": "/d/ims-ldi-machine-snapshot/set2-machine-snapshot?var-machine_id=LDI-01&var-factory=${factory}&var-mo=${__data.fields.mo}&var-event_time_ms=${__data.fields.log_id}&from=${__from}&to=${__to}",
  "targetBlank": false
}
```

Repeat for the other 9 nodes substituting the literal `eqp_id` in both the title and the `var-machine_id` param.

- [ ] **Step 2: Validate JSON, then confirm all 10 nodes have exactly one link each**

```bash
python3 -c "
import json
d = json.load(open('monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json', encoding='utf-8'))
canvas = next(p for p in d['panels'] if p['id'] == 100)
elements = canvas['options']['root']['elements']
linked = [e for e in elements if e.get('links')]
print('elements with links:', len(linked))
"
```

Expected: `elements with links: 10`

- [ ] **Step 3: Commit**

```bash
git add monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json
git commit -m "feat(grafana): add drill-down links to Factory Digital Twin nodes"
```

---

## Task 7: Tooltips (Owner / Elapsed / Event ID) + color legend

**Files:**

- Modify: `monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`

**Interfaces:**

- Consumes: Task 4's alarm-detail query fields (`owner`, `elapsed`), Task 5's `log_id` field.
- Produces: each machine node's tooltip config bound to `owner`/`elapsed`/`log_id`; one static legend element on the canvas.

- [ ] **Step 1: Bind each node's tooltip (per Task 1's verified schema for element tooltips) to display `Owner: {owner}`, `Elapsed: {elapsed}` (explicitly labeled "Elapsed", never "SLA" — no SLA target exists in this system), `Event ID: {log_id}` (explicitly labeled "Event ID", never "Board ID" — real `board_id` is empty in 100% of rows)**

- [ ] **Step 2: Add one static text/legend element listing the 4 state colors and their names (NO_DATA/IDLE/OK/ALARM) using the exact hex values from the Task 5 color token table — this satisfies "every color must have documented semantic meaning" directly on the canvas, not only in the JSON `description` field**

- [ ] **Step 3: Validate JSON**

```bash
python3 -c "import json; json.load(open('monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json', encoding='utf-8')); print('valid json')"
```

- [ ] **Step 4: Commit**

```bash
git add monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json
git commit -m "feat(grafana): add tooltips and color legend to Factory Digital Twin"
```

---

## Task 8: Confirm Manufacturing and Andon files are untouched

**Files:**

- None modified — verification only.

- [ ] **Step 1: Diff both protected files against `origin/main`**

```bash
git diff origin/main -- monitoring/grafana/dashboards/manufacturing/ims-ldi-manufacturing.json monitoring/grafana/dashboards/manufacturing/ims-ldi-operator-andon.json
```

Expected: empty output (no diff).

No commit — this is a negative-result verification step.

---

## Task 9: Lint and query-budget validation

**Files:**

- None modified — validation only.

- [ ] **Step 1: Dashboard linter**

```bash
node tests/lint/dashboard-linter.js
```

Expected: `ims-ldi-factory-digital-twin.json` reports 0 errors. Fix and re-run if any Token-violation/height-ceiling errors surface (same fix pattern used earlier this session for Andon: rename panels away from linter false-triggers, or resize to fit the kiosk height ceiling — check whether the 20-grid-unit ceiling check applies to this dashboard's `tags`/naming convention; if it does, `y:4 + h:16 = 20` already meets it exactly).

- [ ] **Step 2: Query-budget linter (static shape check)**

```bash
node tests/lint/query-budget-linter.js
```

Expected: 0 warnings for this file — every target is `LIMIT 1` or an aggregate over an indexed `equipmentid`/`eqp_id` filter, not a `time_bucket` range scan.

- [ ] **Step 3: Query-budget smoke check (real timing)**

```bash
bash tests/smoke/query-budget-check.sh
```

Expected: `PASS — all sampled queries within budget` (300ms target, 2000ms hard fail).

- [ ] **Step 4: Doc-overclaim linter**

```bash
node tests/lint/doc-overclaim-linter.js
```

Expected: `DOC OVER-CLAIM CHECK PASSED`.

No commit — validation only, failures get fixed in the task that introduced them, not committed here.

---

## Task 10: Dashboard inventory regeneration

**Files:**

- Modify: `docs/architecture/DASHBOARD_INVENTORY.md` (generated, not hand-edited)

- [ ] **Step 1: Regenerate**

```bash
node scripts/generate-dashboard-inventory.js
```

Expected: `Wrote docs\architecture\DASHBOARD_INVENTORY.md`, new row for `ims-ldi-factory-digital-twin`, total dashboard count 14→15.

- [ ] **Step 2: Verify CI's check mode agrees**

```bash
node scripts/generate-dashboard-inventory.js --check
```

Expected: exit 0 (no diff between what's on disk and what the generator produces).

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/DASHBOARD_INVENTORY.md
git commit -m "docs: regenerate dashboard inventory for Factory Digital Twin"
```

---

## Task 11: Render/screenshot validation (real evidence, not grid arithmetic)

Same method used this session to catch the Andon Board's toolbar-height and `autofitpanels` discoveries — grid-unit math alone is not sufficient evidence of "fits without scrolling."

**Files:**

- None modified — validation only.

- [ ] **Step 1: Wait for the file-based provisioner to pick up the new dashboard (30s poll interval, `monitoring/grafana/provisioning/dashboards/dashboards.yml`)**

```bash
sleep 32
```

- [ ] **Step 2: Confirm the live dashboard matches the file**

```bash
source .env
curl -s -u "${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}" \
  "http://localhost:${GRAFANA_PORT:-3000}/api/dashboards/uid/ims-ldi-factory-digital-twin" \
  -o "$SCRATCHPAD/twin_live.json"
python3 -c "
import json
d = json.load(open('$SCRATCHPAD/twin_live.json', encoding='utf-8'))
print('panel count:', len(d['dashboard']['panels']))
"
```

- [ ] **Step 3: Render at the real production kiosk URL params (`kiosk=tv&autofitpanels`, 1280x720) — the exact params documented in `scripts/create-playlist.sh`**

```bash
source .env
curl -s -u "${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}" \
  "http://localhost:${GRAFANA_PORT:-3000}/render/d/ims-ldi-factory-digital-twin/set2-factory-digital-twin?width=1280&height=720&tz=UTC&kiosk=tv&autofitpanels" \
  -o "$SCRATCHPAD/twin_render.png" \
  -w "HTTP %{http_code}, size %{size_download} bytes\n"
```

Expected: `HTTP 200`, a real PNG (`file` reports `PNG image data, 1280 x 720`).

- [ ] **Step 4: Visually inspect the render** — read the PNG. Confirm: all 5 zone labels legible, all 10 machine nodes visible with readable state color and label, no node visually clipped/overlapping, legend visible, top strip's 4 numbers visible. If anything is cut off or illegible, that's a real finding — go back to Task 5's element placement, not a false-pass.

No commit — evidence-gathering only.

---

## Task 12: Final full-suite check

**Files:**

- None modified — validation only.

- [ ] **Step 1: Re-run every check from Tasks 8–9 together, plus the full test suite if one exists for dashboards**

```bash
git diff origin/main -- monitoring/grafana/dashboards/manufacturing/ims-ldi-manufacturing.json monitoring/grafana/dashboards/manufacturing/ims-ldi-operator-andon.json
node tests/lint/dashboard-linter.js
node tests/lint/query-budget-linter.js
bash tests/smoke/query-budget-check.sh
node tests/lint/doc-overclaim-linter.js
node scripts/generate-dashboard-inventory.js --check
```

Expected: all pass, protected-file diff empty.

No commit — final gate before considering the feature done.

---

## Task 13: Document the future 3D Digital Twin migration path (documentation only, no code)

Per the user's explicit ranking, 3D is the next phase, not this one. This task records what would actually need to change, so the eventual 3D work starts from real constraints instead of rediscovering them.

**Files:**

- Modify: `docs/superpowers/specs/2026-08-17-factory-digital-twin-design.md` (append a section)

- [ ] **Step 1: Append a "Future: 3D Digital Twin migration path" section noting concretely, without inventing a plan for it:**
  - Real x/y/z machine coordinates don't exist anywhere in the schema (`devices.location` is a 5-value zone label, confirmed this session) — a 3D twin needs real coordinates captured somewhere first, either a new `devices` column or an external config file, either way a new, separate data-modeling task.
  - Grafana core has no 3D rendering panel type (`canvas` is 2D only) — 3D would require either an external Grafana plugin (violates this dashboard's "no external plugins" constraint, would need its own approval) or a separate non-Grafana rendering surface (e.g. a custom web app reading the same `timescaledb` datasource) — an architecture decision, not a Grafana dashboard task.
  - Everything built in Tasks 1–12 (the 10-machine state model, the alarm/production/compliance queries, the drill-down targets) is directly reusable as the 3D twin's data layer — only the rendering surface changes, not the underlying real-data contract.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-08-17-factory-digital-twin-design.md
git commit -m "docs: record 3D Digital Twin migration constraints for future phase"
```

---

## Plan self-review notes

- **Spec coverage**: every numbered item in the user's 24-point list maps to a task — file structure/provisioning (Task 2), Machine State Model (Task 4), real-data query reuse (Tasks 3/4), 2D canvas architecture (Tasks 1/5), 5 zones (Task 5 Step 2), 10 machines (Task 4/5), state machine (Task 4 Step 1), production state (Task 5 board_no/total_board binding), alarm state (Task 4 Step 4), production impact (Task 3 Step 3), compliance status (Task 3 Step 4), MO/board_no/total_board (Task 4/5), log_id traceability (Task 4/6/7), drill-down (Task 6), C-Level/Operator/Engineering UX (top strip + tooltips + drill-down chain, cross-referenced against the spec's acceptance table), canvas performance (Task 4's pre-validation + Task 9), query budget validation (Task 9), render validation (Task 11), provisioning (Task 11 Step 1), CI validation (Task 9's exact CI commands from `.github/workflows/ci.yml`), rollback (Task 8 + this section below), 3D migration path (Task 13).
- **Rollback strategy**: every task after Task 2 only adds to or edits the one new file (`ims-ldi-factory-digital-twin.json`) plus the generated inventory doc. Rollback at any point is `git revert` on the specific commit(s), or simply deleting the one new dashboard file and re-running `node scripts/generate-dashboard-inventory.js` — since Manufacturing and Andon are never touched (enforced by Task 8's diff check on every pass), there is no cross-dashboard blast radius to unwind.
- **Risks flagged, not hidden**: Task 1 exists specifically because the Canvas panel element JSON schema is asserted from Grafana documentation/training knowledge, not yet confirmed against this exact running instance — every later task's element JSON is explicitly marked as subject to correction against Task 1's real capture.
