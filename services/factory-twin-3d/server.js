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

// Task 4.2 scale-up: 10 real reporting machines across their 5 real zones
// (public.devices.location, re-confirmed this task via psql -- see
// task-4.2-3d-10machine-report.md's "Real facts" section).
//
// Scope decision, re-evaluated per the Task 4.2 brief (not just carried
// forward blindly): design spec §4 proposes a device_3d_placement DB table.
// At 10 rows this is still an in-code config object, not a migration --
// re-confirmed the decision rather than assuming Task 4.1's precedent still
// held. Reasoning: (1) design §5's entire point is that placement is a
// *separate query/concern* from state/telemetry, and that separation is
// what makes the future simulated->real swap safe -- nothing about that
// separation requires the placement side to be a SQL table specifically;
// an in-code object queried by a plain function call is equally separate
// from STATE_SQL below. (2) Every one of these 10 rows is explicitly
// simulated (is_simulated: true) and will be wholesale REPLACED, not
// incrementally edited, once a real factory layout is supplied (design
// §17) -- there's no real use case yet for SQL-side querying/filtering/
// updating individual placement rows that a table would earn its keep for.
// (3) A migration is real, permanent schema surface (a table, a FK to
// devices, default privileges, a rollback plan) for data that is 100%
// disclosed as throwaway. If/when Task 4.3+ or the real layout import
// happens, THAT is the right time to build device_3d_placement for real --
// building it now for known-fake seed data would be schema debt paid
// early for no present benefit. Still 10x more data than Task 4.1 had, so
// this was re-decided, not rubber-stamped -- if a future task needs to
// filter/join placement server-side in SQL, that's the trigger to build
// the real table.
//
// Deterministic grid formula (design §4's shape, "pos_x = zone_index * 10,
// pos_y = machine_index_in_zone * 5"), centered around the origin so the
// default camera framing shows all 5 zones without an initial pan:
//   pos_x = (zone_index - 2) * 18        -- 18 units between zone clusters
//   pos_y = (machine_index_in_zone === 0 ? -4 : 4)  -- 8 units within a zone
// Widened from an earlier 12/6 pass after a real Playwright screenshot
// showed the zone-label sprites overlapping at that spacing -- re-tuned for
// legibility, still deterministic/simulated, not a real coordinate.
// Same 10 machines / 5 zones as the 2D Canvas twin (Task 3), re-verified
// against public.devices.location this task (not re-derived from memory).
const ZONES = [
  { zone: 'Site A - Zone 1', factory: '2', machines: ['LDI-01', 'LDI-02'] },
  { zone: 'Site B - Zone 1', factory: '3', machines: ['LDI-03', 'LDI-04'] },
  { zone: 'Site A - Zone 2', factory: '2', machines: ['LDI-05', 'LDI-06'] },
  { zone: 'Site A - Zone 3', factory: '2', machines: ['LDI-07', 'LDI-08'] },
  { zone: 'Site B - Zone 2', factory: '3', machines: ['LDI-09', 'LDI-10'] },
];

const DEVICE_IDS = ZONES.flatMap((z) => z.machines);

const SIMULATED_PLACEMENTS = ZONES.flatMap((z, zoneIndex) =>
  z.machines.map((deviceId, machineIndex) => ({
    device_id: deviceId,
    zone: z.zone,
    factory: z.factory,
    pos_x: (zoneIndex - 2) * 18,
    pos_y: machineIndex === 0 ? -4 : 4,
    pos_z: 0,
    rot_x: 0,
    rot_y: 0,
    rot_z: 0,
    scale: 1.0,
    is_simulated: true,
    source: 'simulated_grid',
  }))
);

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
    (ARRAY_AGG(elapsed ORDER BY sev_rank, logdate DESC))[1] AS elapsed
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
  alarm_ctx.elapsed AS alarm_elapsed
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
          ? { count: row.alarm_count, owner: row.alarm_owner, elapsed: row.alarm_elapsed }
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

app.listen(PORT, () => {
  console.log(`factory-twin-3d listening on :${PORT}`);
});
