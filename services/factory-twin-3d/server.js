'use strict';

const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const { computeFloorOneLayout, loadConfiguredLayout } = require('./layout');
const { MACHINE_STATUS, mapLegacyLdiStatus, statusPayload } = require('./status-model');
const { createStatusApiClient } = require('./status-api');
const {
  DEFAULT_STALE_SECONDS,
  latestErrorReference,
  machineEventDetail,
  mapMachineEventStatus,
  normalizeStaleSeconds,
  readMachineEventRows,
} = require('./machine-event');
const {
  STATUS_MODE,
  createMockStateRows,
  normalizeStatusMode,
} = require('./mock-status');

const PORT = process.env.PORT || 4100;
const FLOOR_LAYOUT_FILE = process.env.FLOOR_LAYOUT_FILE || '';
const MACHINE_STATUS_MODE = normalizeStatusMode(process.env.MACHINE_STATUS_MODE);
const MACHINE_EVENT_STALE_SECONDS = normalizeStaleSeconds(
  process.env.MACHINE_EVENT_STALE_SECONDS || DEFAULT_STALE_SECONDS,
);
const statusApiClient = createStatusApiClient({
  url: process.env.MACHINE_STATUS_API_URL || '',
  token: process.env.MACHINE_STATUS_API_TOKEN || '',
  timeoutMs: process.env.MACHINE_STATUS_API_TIMEOUT_MS || 3000,
  cacheMs: process.env.MACHINE_STATUS_API_CACHE_MS || 2000,
});

// Read-only service -- unlike alarm-api (dedicated alarm_api_writer role with
// SELECT+UPDATE on exactly one table), this twin never writes anything, so it
// reuses the existing grafana_reader role (postgres/init/002-grafana-readonly.sql,
// already granted SELECT on all public tables/views). No new DB role or
// migration needed for a read-only POC -- same "minimum files" reasoning as
// the hardcoded /api/placement response below.
const pool = new Pool({
  host: process.env.PGHOST || 'ims-pgbouncer',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 5,
});

pool.on('error', (err) => {
  console.error('pg pool idle-client error (non-fatal, pool recovers):', err.message);
});

const app = express();

// ── Static frontend + vendored Three.js (no CDN dependency -- this
// container has no host port, only reachable via the proxy's auth_request
// gate, so the frontend must not depend on fetching a script from a
// third-party origin at runtime) ──
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three/', express.static(path.join(__dirname, 'node_modules', 'three', 'build')));
app.use('/vendor/three/examples/', express.static(path.join(__dirname, 'node_modules', 'three', 'examples')));

const DEVICE_REFRESH_INTERVAL_MS = 60_000;

async function discoverDevices() {
  const result = await pool.query(
    `SELECT device_id, location FROM public.devices WHERE device_type = 'ldi' AND enabled = true ORDER BY location, device_id`
  );
  return result.rows;
}

// In-memory cache refreshed on a timer rather than queried per-request:
// /api/state is polled frequently by every open kiosk tab, and the device
// list changes rarely (an enable/disable or a new device row), so paying a
// DB round trip on every single poll isn't worth it just to react to that
// instantly. DEVICE_REFRESH_INTERVAL_MS bounds how stale it can get.
let DEVICE_IDS = [];
let MACHINE_EVENT_IDS = [];
let FLOOR_LAYOUT = computeFloorOneLayout([]);
let STATE_BINDINGS = [];
let LAYOUT_CONFIG_ERROR = null;

async function refreshDevices({ failOnLayoutError = false } = {}) {
  try {
    const configuredLayout = loadConfiguredLayout(FLOOR_LAYOUT_FILE);
    LAYOUT_CONFIG_ERROR = null;
    let rows = [];
    try {
      rows = await discoverDevices();
    } catch (error) {
      if (!configuredLayout) throw error;
      console.error('LDI device discovery unavailable; private placement remains usable:', error.message);
    }
    if (configuredLayout) {
      FLOOR_LAYOUT = configuredLayout;
      STATE_BINDINGS = configuredLayout.machines.map((machine) => ({
        asset_id: machine.asset_id || machine.device_id,
        display_name: machine.display_name || machine.asset_id || machine.device_id,
        type: machine.state_binding?.type || 'unbound',
        source_id: machine.state_binding?.source_id || null,
        drilldown_enabled: ['ldi', 'machine_event'].includes(machine.state_binding?.type)
          && Boolean(machine.state_binding?.source_id),
      }));
      DEVICE_IDS = [...new Set(
        STATE_BINDINGS
          .filter((binding) => binding.type === 'ldi' && binding.source_id)
          .map((binding) => binding.source_id),
      )].sort();
      MACHINE_EVENT_IDS = [...new Set(
        STATE_BINDINGS
          .filter((binding) => binding.type === 'machine_event' && binding.source_id)
          .map((binding) => binding.source_id),
      )].sort();
    } else {
      DEVICE_IDS = rows.map((r) => r.device_id).sort();
      MACHINE_EVENT_IDS = [];
      FLOOR_LAYOUT = computeFloorOneLayout(rows);
      STATE_BINDINGS = FLOOR_LAYOUT.machines.map((machine) => ({
        asset_id: machine.device_id,
        display_name: machine.device_id,
        type: 'ldi',
        source_id: machine.device_id,
        drilldown_enabled: true,
      }));
    }
  } catch (err) {
    if (FLOOR_LAYOUT_FILE) LAYOUT_CONFIG_ERROR = err.message;
    console.error('device discovery refresh failed (keeping previous list):', err.message);
    if (FLOOR_LAYOUT_FILE && failOnLayoutError) throw err;
  }
}

// Category -> team ownership mapping, copied verbatim from
// ims-ldi-factory-digital-twin.json's refId-A query (Task 3 2D twin), which
// itself copied it from ims-ldi-operator-andon.json's Action Queue panel.
const CATEGORY_OWNER_CASE = `
    CASE COALESCE(c.category, 'UNCLASSIFIED')
        WHEN 'VACUUM' THEN 'Maintenance'
        WHEN 'CAMERA' THEN 'Maintenance'
        WHEN 'MOTION' THEN 'Maintenance'
        WHEN 'MOTOR' THEN 'Maintenance'
        WHEN 'ENVIRONMENT' THEN 'Facility'
        WHEN 'NETWORK' THEN 'Automation'
        WHEN 'PLC' THEN 'Automation'
        WHEN 'COMMUNICATION' THEN 'Automation'
        WHEN 'DATABASE' THEN 'IT'
        WHEN 'ALIGNMENT' THEN 'Process Engineering'
        WHEN 'CALIBRATION' THEN 'Process Engineering'
        WHEN 'REGISTRATION' THEN 'Process Engineering'
        WHEN 'PROCESS' THEN 'Process Engineering'
        ELSE 'Maintenance'
      END`;

// Query lineage comes from
// monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json
// refId "A" and ims-ldi-operator-andon.json panel id 1000. Operational
// telemetry and alarm lifecycle are now selected independently: the API
// resolves the limited LDI boolean into the six-state contract, while an
// active alarm remains an overlay and never forces the state to DOWN.
//
// Fleet change from Task 4.1's single-eqp_id `WHERE v.eqp_id = $1`: now
// `WHERE v.eqp_id = ANY($1::text[])` against the dynamically discovered
// enabled LDI fleet in one query. The important part is that
// alarm_raw/alarm_ctx MUST stay scoped per-machine, not
// fleet-wide, when joined back -- achieved by carrying a.equipmentid through
// alarm_raw, GROUP BY equipmentid in alarm_ctx (Task 4.1 had no GROUP BY
// because it was already scoped to exactly 1 machine via WHERE), and a
// LEFT JOIN alarm_ctx ON alarm_ctx.equipmentid = s.eqp_id (not a CROSS JOIN,
// which would have been correct for 1 row but wrong for 10 -- a CROSS JOIN
// here would attach the SAME fleet-wide alarm_ctx row to every machine).
// LEFT JOIN (not INNER) so machines with zero active alarms still appear
// (alarm_ctx.n IS NULL -> coalesced to 0 below), matching Task 4.1's
// behavior where "no active alarm" was the common case, not an exclusion.
const STATE_SQL = `
WITH clock AS (
  SELECT GREATEST(
    (SELECT MAX("time") FROM public.ldi_data),
    (SELECT MAX(logdate) FROM public.ldi_alarm_log)
  ) AS db_now
),
s AS (
  SELECT
    v.eqp_id,
    v.mo,
    v.board_no,
    v.total_board,
    v.factory,
    COALESCE(v.has_data, false) AS has_data,
    COALESCE(v."time" >= (SELECT db_now FROM clock) - INTERVAL '5 minutes', false) AS is_fresh,
    v.state AS is_running
  FROM public.v_ldi_machine_latest_full v
  WHERE v.eqp_id = ANY($1::text[])
),
alarm_raw AS (
  SELECT
    a.equipmentid,
    CASE m.severity WHEN 'Critical' THEN 0 WHEN 'Major' THEN 1 ELSE 2 END AS sev_rank,
    a.logdate,
    a.related_log_id,
    (EXTRACT(EPOCH FROM a.logdate) * 1000)::BIGINT AS logdate_ms,
    ${CATEGORY_OWNER_CASE} AS owner,
    CASE
        WHEN (SELECT db_now FROM clock) - a.logdate < INTERVAL '1 hour'
          THEN GREATEST(EXTRACT(MINUTE FROM ((SELECT db_now FROM clock) - a.logdate))::INT, 0)::TEXT || 'm'
        ELSE EXTRACT(HOUR FROM ((SELECT db_now FROM clock) - a.logdate))::INT || 'h' || LPAD(EXTRACT(MINUTE FROM ((SELECT db_now FROM clock) - a.logdate))::INT::TEXT, 2, '0') || 'm'
      END AS elapsed
  FROM public.ldi_alarm_log a
  JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
  LEFT JOIN public.v_ldi_alarm_category c ON c.alarm_code = a.errorcode::TEXT
  LEFT JOIN public.ldi_alarm_lifecycle l ON l.logdate = a.logdate AND l.logid = a.logid
  WHERE a.equipmentid = ANY($1::text[])
    AND m.severity IN ('Critical', 'Major')
    AND a.logdate > (SELECT db_now FROM clock) - INTERVAL '5 minutes'
    AND l.status IS DISTINCT FROM 'RESOLVED'
),
alarm_ctx AS (
  SELECT
    equipmentid,
    COUNT(*)::INT AS n,
    (ARRAY_AGG(owner ORDER BY sev_rank, logdate DESC))[1] AS owner,
    (ARRAY_AGG(elapsed ORDER BY sev_rank, logdate DESC))[1] AS elapsed,
    -- related_log_id/logdate_ms of the SAME top-ranked alarm owner/elapsed
    -- picks -- so the drill-down link lands on the exact event the HUD
    -- text describes, not just any alarm for that machine.
    (ARRAY_AGG(related_log_id ORDER BY sev_rank, logdate DESC))[1] AS related_log_id,
    (ARRAY_AGG(logdate_ms ORDER BY sev_rank, logdate DESC))[1] AS logdate_ms
  FROM alarm_raw
  GROUP BY equipmentid
)
SELECT
  s.eqp_id,
  s.has_data,
  s.is_fresh,
  s.is_running,
  s.board_no,
  s.total_board,
  s.mo,
  s.factory,
  COALESCE(alarm_ctx.n, 0) AS alarm_count,
  alarm_ctx.owner AS alarm_owner,
  alarm_ctx.elapsed AS alarm_elapsed,
  alarm_ctx.related_log_id AS alarm_related_log_id,
  alarm_ctx.logdate_ms AS alarm_logdate_ms
FROM s
LEFT JOIN alarm_ctx ON alarm_ctx.equipmentid = s.eqp_id
ORDER BY s.eqp_id`;

function legacyStateValue(status, hasAlarm) {
  if (hasAlarm) return 3;
  if (status === MACHINE_STATUS.RUN) return 2;
  if (status === MACHINE_STATUS.IDLE) return 1;
  return 0;
}

app.get('/api/state', async (req, res) => {
  try {
    if (MACHINE_STATUS_MODE === STATUS_MODE.MOCK) {
      res.status(200).json({
        machines: createMockStateRows(STATE_BINDINGS),
        queried_at: new Date().toISOString(),
        status_mode: {
          mode: STATUS_MODE.MOCK,
          simulated: true,
          writes_database: false,
        },
        status_api: {
          configured: false,
          available: false,
          error: 'disabled_by_mock_mode',
        },
      });
      return;
    }

    const [result, apiResult, machineEventResult] = await Promise.all([
      DEVICE_IDS.length > 0
        ? pool.query(STATE_SQL, [DEVICE_IDS])
        : Promise.resolve({ rows: [] }),
      statusApiClient.getRows(),
      readMachineEventRows(pool, MACHINE_EVENT_IDS),
    ]);
    const sourceRows = new Map(result.rows.map((row) => [row.eqp_id, row]));
    const rows = STATE_BINDINGS.map((binding) => {
      const apiRow = binding.type === 'status_api' ? apiResult.rows.get(binding.source_id) : null;
      if (apiRow) {
        const display = statusPayload(apiRow.status);
        return {
          device_id: binding.asset_id,
          display_name: binding.display_name,
          source_id: apiRow.source_id,
          state: legacyStateValue(apiRow.status, false),
          operational_state: display.status,
          state_label: display.status_label,
          state_color: display.status_color,
          state_basis: apiRow.basis,
          state_confidence: apiRow.confidence,
          state_updated_at: apiRow.updated_at,
          drilldown_enabled: binding.drilldown_enabled,
          board_no: apiRow.board_no,
          total_board: apiRow.total_board,
          mo: apiRow.mo,
          factory: apiRow.factory,
          alarm: null,
          latest_error: null,
          machine_event_detail: null,
        };
      }
      const machineEventRow = binding.type === 'machine_event'
        ? machineEventResult.rows.get(binding.source_id)
        : null;
      if (machineEventRow) {
        const resolved = mapMachineEventStatus(machineEventRow, {
          staleSeconds: MACHINE_EVENT_STALE_SECONDS,
        });
        const display = statusPayload(resolved.status);
        return {
          device_id: binding.asset_id,
          display_name: binding.display_name,
          source_id: binding.source_id,
          state: legacyStateValue(resolved.status, false),
          operational_state: display.status,
          state_label: display.status_label,
          state_color: display.status_color,
          state_basis: resolved.basis,
          state_confidence: resolved.confidence,
          state_freshness_policy: MACHINE_EVENT_STALE_SECONDS === 0
            ? 'LATEST_KNOWN'
            : 'FRESHNESS_WINDOW',
          state_updated_at: resolved.updated_at,
          drilldown_enabled: binding.drilldown_enabled,
          board_no: null,
          total_board: null,
          mo: null,
          factory: null,
          alarm: null,
          // The supplied machine_event evidence has no confirmed reset/clear
          // lifecycle. Expose the last decoded error only as history; never
          // turn on the active-alarm outline from this field.
          latest_error: latestErrorReference(machineEventRow),
          machine_event_detail: machineEventDetail(machineEventRow),
        };
      }
      const row = binding.type === 'ldi' ? sourceRows.get(binding.source_id) : null;
      if (!row) {
        const display = statusPayload(MACHINE_STATUS.UNDEFINED);
        return {
          device_id: binding.asset_id,
          display_name: binding.display_name,
          source_id: binding.source_id,
          // Deprecated numeric compatibility field: 0 NO_DATA, 1 IDLE,
          // 2 OK/RUN, 3 ALARM. New consumers must use operational_state.
          state: 0,
          operational_state: display.status,
          state_label: display.status_label,
          state_color: display.status_color,
          state_basis: binding.type === 'unbound'
            ? 'state_source_not_connected'
            : binding.type === 'machine_event' && !machineEventResult.available
              ? machineEventResult.error
            : binding.type === 'status_api' && !apiResult.available
              ? apiResult.error
              : 'source_record_not_found',
          state_confidence: 'UNBOUND',
          drilldown_enabled: binding.drilldown_enabled,
          board_no: null,
          total_board: null,
          mo: null,
          factory: null,
          alarm: null,
          latest_error: null,
          machine_event_detail: null,
        };
      }
      const resolved = mapLegacyLdiStatus({
        hasData: row.has_data === true,
        isFresh: row.is_fresh === true,
        isRunning: row.is_running,
      });
      const display = statusPayload(resolved.status);
      const hasAlarm = row.alarm_count > 0;
      return {
        device_id: binding.asset_id,
        display_name: binding.display_name,
        source_id: row.eqp_id,
        // Preserve the previous API contract for external consumers while
        // the renderer uses the independent six-state operational field.
        state: legacyStateValue(resolved.status, hasAlarm),
        operational_state: display.status,
        state_label: display.status_label,
        state_color: display.status_color,
        state_basis: resolved.basis,
        state_confidence: resolved.confidence,
        drilldown_enabled: binding.drilldown_enabled,
        board_no: row.board_no,
        total_board: row.total_board,
        mo: row.mo,
        factory: row.factory,
        // Alarm lifecycle is an overlay. It must never overwrite the
        // operational state or be treated as proof that a machine is DOWN.
        alarm:
          hasAlarm
            ? {
                count: row.alarm_count,
                owner: row.alarm_owner,
                elapsed: row.alarm_elapsed,
                related_log_id: row.alarm_related_log_id,
                logdate_ms: row.alarm_logdate_ms,
              }
            : null,
        latest_error: null,
        machine_event_detail: null,
      };
    });
    res.status(200).json({
      machines: rows,
      queried_at: new Date().toISOString(),
      status_mode: {
        mode: STATUS_MODE.REAL,
        simulated: false,
        writes_database: false,
      },
      status_api: {
        configured: Boolean(statusApiClient.endpoint),
        available: apiResult.available,
        error: apiResult.error,
      },
      machine_event: {
        configured_sources: MACHINE_EVENT_IDS.length,
        available: machineEventResult.available,
        error: machineEventResult.error,
        stale_after_seconds: MACHINE_EVENT_STALE_SECONDS,
        state_policy: MACHINE_EVENT_STALE_SECONDS === 0
          ? 'LATEST_KNOWN'
          : 'FRESHNESS_WINDOW',
        alarm_lifecycle_confirmed: false,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

app.get('/api/placement', (req, res) => {
  res.status(200).json(FLOOR_LAYOUT);
});

app.get('/healthz', async (req, res) => {
  if (LAYOUT_CONFIG_ERROR) {
    res.status(503).json({ status: 'layout config invalid' });
    return;
  }
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'db unreachable' });
  }
});

refreshDevices({ failOnLayoutError: true })
  .then(() => {
    setInterval(refreshDevices, DEVICE_REFRESH_INTERVAL_MS).unref();
    app.listen(PORT, () => {
      console.log(
        `factory-twin-3d listening on :${PORT} `
        + `(${FLOOR_LAYOUT.machines.length} layout assets, ${DEVICE_IDS.length} LDI bindings, `
        + `${MACHINE_EVENT_IDS.length} machine_event bindings, `
        + `status mode=${MACHINE_STATUS_MODE})`,
      );
    });
  })
  .catch(async (error) => {
    console.error('factory-twin-3d startup failed:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
