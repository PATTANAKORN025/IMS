'use strict';

const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const PORT = process.env.PORT || 4100;

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

// Task 4.3 dynamic fleet discovery: the hardcoded 10-machine/2-per-zone
// layout below (Task 4.2) was built when only 10 LDI devices were assumed
// to exist. A later audit found public.devices actually has 23 enabled
// device_type='ldi' rows across the SAME 5 real zones -- some zones hold
// up to 7 machines, not 2, which the old `machineIndex === 0 ? -4 : 4`
// ternary can't place (3rd+ machine in a zone would collide with the 2nd).
//
// Still no device_3d_placement DB table (same reasoning as before: every
// placement is is_simulated: true, disclosed throwaway, wholesale-replaced
// once a real layout exists -- see design §17). What changes here is WHERE
// the placement input comes from: devices/zones are now discovered live
// from `public.devices WHERE device_type='ldi' AND enabled=true` instead
// of a hardcoded array, so a device added/disabled in that table is
// reflected without a code change.
//
// Deterministic grid formula, generalized from Task 4.2's fixed 5-zone/
// 2-machine shape to any zone count and any machines-per-zone count:
//   pos_x = (zone_index  - (zone_count    - 1) / 2) * 18  -- 18u between zones
//   pos_y = (machine_index - (machine_count - 1) / 2) * 8  -- 8u within a zone
// This is an exact generalization, not a redesign: for the original fixed
// shape (5 zones, 2 machines/zone) it reduces algebraically to Task 4.2's
// literal (zoneIndex - 2) * 18 and (idx === 0 ? -4 : 4) formulas -- verified
// bit-identical output for the 10 original machines (see
// scratchpad test-placements.js run, kept out of the repo as it's a
// throwaway verification script, not product code).
//
// Trade-off, disclosed rather than hidden: because zones now legitimately
// contain more machines than the old assumption, LDI-01..10's absolute
// pos_x/pos_y DO shift from Task 4.2's values wherever their real zone grew
// past 2 machines (e.g. Site A - Zone 1 now has 4: LDI-A01/2B
// plus LDI-01/02). Freezing the old positions instead would mean either
// hardcoding again (defeats the point) or placing new machines outside
// their real zone's cluster (worse). Relative ordering (alphabetical by
// device_id within a zone) and the spacing pattern are preserved; only the
// absolute offset for machines in a now-larger zone changes.
const ZONE_ORDER = [
  'Site A - Zone 1',
  'Site B - Zone 1',
  'Site A - Zone 2',
  'Site A - Zone 3',
  'Site B - Zone 2',
];
const ZONE_SPACING_X = 18;
const MACHINE_SPACING_Y = 8;
const DEVICE_REFRESH_INTERVAL_MS = 60_000;

// A zone not in ZONE_ORDER (a future physical zone this code doesn't know
// about yet) is appended after the known five, sorted alphabetically --
// keeps placement deterministic and collision-free without needing a code
// change just to not crash on it.
function orderedZoneNames(distinctLocations) {
  const known = ZONE_ORDER.filter((z) => distinctLocations.has(z));
  const unknown = [...distinctLocations].filter((z) => !ZONE_ORDER.includes(z)).sort();
  return [...known, ...unknown];
}

// Pure and DB-free: same (device_id, location) rows always produce the same
// placements, regardless of what order the DB returned them in. Grouping
// by zone then sorting device_id within each zone makes the result
// independent of input row order.
function computePlacements(deviceRows) {
  const byZone = new Map();
  for (const { device_id, location } of deviceRows) {
    if (!byZone.has(location)) byZone.set(location, []);
    byZone.get(location).push(device_id);
  }
  const zones = orderedZoneNames(new Set(byZone.keys()));
  const centerZone = (zones.length - 1) / 2;

  const placements = [];
  zones.forEach((zone, zoneIndex) => {
    const machines = [...byZone.get(zone)].sort();
    const centerMachine = (machines.length - 1) / 2;
    const factoryMatch = zone.match(/^Factory\s+(\d+)/);
    const factory = factoryMatch ? factoryMatch[1] : null;
    machines.forEach((device_id, machineIndex) => {
      placements.push({
        device_id,
        zone,
        factory,
        pos_x: (zoneIndex - centerZone) * ZONE_SPACING_X,
        pos_y: (machineIndex - centerMachine) * MACHINE_SPACING_Y,
        pos_z: 0,
        rot_x: 0,
        rot_y: 0,
        rot_z: 0,
        scale: 1.0,
        is_simulated: true,
        source: 'simulated_grid',
      });
    });
  });
  return placements;
}

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
let SIMULATED_PLACEMENTS = [];

async function refreshDevices() {
  try {
    const rows = await discoverDevices();
    DEVICE_IDS = rows.map((r) => r.device_id).sort();
    SIMULATED_PLACEMENTS = computePlacements(rows);
  } catch (err) {
    console.error('device discovery refresh failed (keeping previous list):', err.message);
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

// Exact query shape reused verbatim (structure, not re-derived) from
// monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json
// refId "A", which itself is the same latest-value + ALARM/OK/IDLE/NO_DATA
// CASE logic as ims-ldi-operator-andon.json panel id 1000. Only change here:
// SELECT plain columns instead of Grafana's pre-formatted table strings, and
// add v.factory for the drill-down URL, since this returns JSON, not a panel.
//
// Task 4.2 change from Task 4.1's single-eqp_id `WHERE v.eqp_id = $1`: now
// `WHERE v.eqp_id = ANY($1::text[])` against all 10 literal device IDs in
// one query (brief's explicit "your call" -- chose a single IN/ANY query
// over 10 separate ones to keep round trips to 1). The important part the
// brief calls out: alarm_raw/alarm_ctx MUST stay scoped per-machine, not
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
WITH s AS (
  SELECT
    v.eqp_id,
    v.mo,
    v.board_no,
    v.total_board,
    v.factory,
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
    END AS st
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
        WHEN NOW() - a.logdate < INTERVAL '1 hour'
          THEN GREATEST(EXTRACT(MINUTE FROM (NOW() - a.logdate))::INT, 0)::TEXT || 'm'
        ELSE EXTRACT(HOUR FROM (NOW() - a.logdate))::INT || 'h' || LPAD(EXTRACT(MINUTE FROM (NOW() - a.logdate))::INT::TEXT, 2, '0') || 'm'
      END AS elapsed
  FROM public.ldi_alarm_log a
  JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
  LEFT JOIN public.v_ldi_alarm_category c ON c.alarm_code = a.errorcode::TEXT
  LEFT JOIN public.ldi_alarm_lifecycle l ON l.logdate = a.logdate AND l.logid = a.logid
  WHERE a.equipmentid = ANY($1::text[])
    AND m.severity IN ('Critical', 'Major')
    AND a.logdate > NOW() - INTERVAL '5 minutes'
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
  s.st AS state,
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

const STATE_LABELS = ['NO_DATA', 'IDLE', 'OK', 'ALARM'];

app.get('/api/state', async (req, res) => {
  try {
    const result = await pool.query(STATE_SQL, [DEVICE_IDS]);
    const rows = result.rows.map((row) => ({
      device_id: row.eqp_id,
      state: row.state,
      state_label: STATE_LABELS[row.state] || 'NO_DATA',
      board_no: row.board_no,
      total_board: row.total_board,
      mo: row.mo,
      factory: row.factory,
      alarm:
        row.alarm_count > 0
          ? {
              count: row.alarm_count,
              owner: row.alarm_owner,
              elapsed: row.alarm_elapsed,
              related_log_id: row.alarm_related_log_id,
              logdate_ms: row.alarm_logdate_ms,
            }
          : null,
    }));
    res.status(200).json({
      machines: rows,
      queried_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

app.get('/api/placement', (req, res) => {
  res.status(200).json({ machines: SIMULATED_PLACEMENTS });
});

app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'db unreachable' });
  }
});

refreshDevices().then(() => {
  setInterval(refreshDevices, DEVICE_REFRESH_INTERVAL_MS).unref();
  app.listen(PORT, () => {
    console.log(`factory-twin-3d listening on :${PORT} (${DEVICE_IDS.length} LDI devices discovered)`);
  });
});
