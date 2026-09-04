'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const { MachineState, MACHINE_STATE_THEME } = require('./lib/contracts');
const { buildDiagnostics } = require('./lib/diagnostics');
const wire = require('./lib/wire');
const schematic = require('./lib/schematic');
const floors = require('./lib/floors');

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

// Nothing needs to know which framework serves this, and naming it only helps
// someone match the service against a vulnerability list.
app.disable('x-powered-by');

// Aggregate operational counters. Deliberately counts only -- no path, no
// URL, no identifier, no client detail. Anything richer would turn the
// diagnostics endpoint into a log of who asked for what.
const runtimeCounters = {
  requestsTotal: 0,
  requestsFailed: 0,
  geometryLoadMs: 0,
  geometryParseFailures: 0,
  // Fixed-edge histogram, not a list of timings. A list would be an ordered
  // record of individual requests; a histogram answers "is this service slow"
  // without describing any one of them. Null-prototype so a bucket name can
  // never collide with an inherited property.
  latencyBuckets: Object.assign(Object.create(null), {
    lt_10ms: 0,
    lt_50ms: 0,
    lt_100ms: 0,
    lt_500ms: 0,
    gte_500ms: 0,
  }),
};

function latencyBucket(ms) {
  if (ms < 10) return 'lt_10ms';
  if (ms < 50) return 'lt_50ms';
  if (ms < 100) return 'lt_100ms';
  if (ms < 500) return 'lt_500ms';
  return 'gte_500ms';
}

app.use((req, res, next) => {
  runtimeCounters.requestsTotal++;
  const started = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 400) runtimeCounters.requestsFailed++;
    runtimeCounters.latencyBuckets[latencyBucket(Date.now() - started)]++;
  });
  next();
});

// Response headers. Small set, each with a reason -- this service's threat is
// disclosure of the data it serves, not compromise of the service.
app.use((req, res, next) => {
  // The geometry route carries values derived from a confidential drawing.
  // Without an explicit directive a browser may heuristically cache it and a
  // future caching intermediary may store it, which would put private-derived
  // data somewhere the auth gate does not reach. Static assets keep their
  // normal caching; only the shaped API is marked.
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // The twin is opened in its own tab from a dashboard link and is never
  // embedded, so refusing to be framed costs nothing and removes clickjacking
  // against a view whose controls change what an operator believes.
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  next();
});

// ── Build fingerprint ────────────────────────────────────────
//
// WHY THIS EXISTS. A container was found serving a six-commit-old build while
// the repository, the tests and the image tag had all moved on. Nothing on the
// page said so, and nothing could: the frontend is static files with no
// version in them, so "is production running the code I just wrote" was a
// question no one could answer from the outside. That is how a rebuilt
// verification port came to be mistaken for a rebuilt production one.
//
// The fingerprint is computed at boot from the bytes actually on disk in this
// process's own image -- server.js, lib/ and public/ -- so it cannot be set
// by an environment variable, cannot be stamped by a build script that did not
// run, and cannot claim a version the running code is not. Two services
// reporting the same fingerprint are running identical code; two reporting
// different fingerprints are not, whatever their tags say.
//
// It is a hash of source bytes, not a secret and not a coordinate: it names
// code, and the code is public.
const BUILD = (() => {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js|html|css|mjs)$/.test(e.name)) files.push(full);
    }
  };
  walk(path.join(__dirname, 'public'));
  walk(path.join(__dirname, 'lib'));
  files.push(path.join(__dirname, 'server.js'));

  const h = crypto.createHash('sha256');
  const assets = [];
  for (const f of files.sort()) {
    let buf;
    try {
      buf = fs.readFileSync(f);
    } catch {
      continue;
    }
    const rel = path.relative(__dirname, f).split(path.sep).join('/');
    const digest = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
    h.update(rel).update(digest);
    assets.push({ path: rel, sha256: digest, bytes: buf.length });
  }
  return {
    fingerprint: h.digest('hex').slice(0, 16),
    asset_count: assets.length,
    assets,
    started_at: new Date().toISOString(),
  };
})();

// Deliberately unauthenticated-safe in content: it lists this service's own
// public source files and their hashes, which are already published in the
// repository. It carries no private path -- every entry is relative to the app
// root -- and no facility data of any kind.
app.get('/api/build', (req, res) => {
  res.status(200).json({
    service: 'factory-twin-3d',
    fingerprint: BUILD.fingerprint,
    asset_count: BUILD.asset_count,
    assets: BUILD.assets,
    started_at: BUILD.started_at,
  });
});

// ── Static frontend + vendored Three.js (no CDN dependency -- this
// container has no host port, only reachable via the proxy's auth_request
// gate, so the frontend must not depend on fetching a script from a
// third-party origin at runtime) ──
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three/', express.static(path.join(__dirname, 'node_modules', 'three', 'build')));
app.use('/vendor/three/examples/', express.static(path.join(__dirname, 'node_modules', 'three', 'examples')));

// ── Private data directory (gitignored: .gitignore's `private/` rule) ──
// This repo is public (github.com/PATTANAKORN025/IMS). The 2-tier split:
// this service's CODE is public and must run standalone on pure synthetic
// data with an empty/missing private/ dir (a fresh clone has no real
// layout or geometry file here); a private production environment drops
// real files into this same path, on the same host, with zero code change.
//
// READ SERVER-SIDE ONLY -- deliberately NOT mounted as static content. A
// static mount serves every file in private/ verbatim to anyone past the
// proxy's auth gate, which bypasses the shaped /api/* responses below and
// would expose any file dropped here (including a source drawing) at a
// guessable URL. Real geometry reaches the browser only via those routes.
const PRIVATE_DIR = path.join(__dirname, 'private');

// The private per-device LAYOUT loader is gone with the placement route it
// fed. That file held one synthetic position per device, generated by the same
// deterministic grid formula the server used as a fallback -- a file-shaped
// version of the same invented coordinates, and no more real for being on
// disk. Real facility geometry now arrives through floor1-geometry.json below,
// which is read from CAD.

// Reads private/floor1-geometry.json if present -- anonymous building
// envelope/columns/zones/physical-slot geometry, entirely independent of
// the per-device placement above. Returns null (not a throw) when
// missing/malformed, matching loadPrivateLayout()'s convention; this repo's
// own /api/floor-geometry response is simply an empty-slots shape in that
// case (see the route below), never a crash.
//
// Deliberately does NOT itself carry a device_id mapping -- see
// loadPrivateAssetMapping() below. Splitting these into two files (per an
// explicit data-separation requirement) means a verified physical-slot ->
// device_id correspondence can be added or changed without touching this
// file's geometry at all.
function loadPrivateGeometry(floorId) {
  const filePath = floors.documentPath(PRIVATE_DIR, floorId, 'geometry');
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // equipment[] is what the physical view draws. slots[] -- the raster-
    // derived positions digitised from the scanned schematic -- is no longer
    // served at all, so its presence or absence says nothing about whether
    // this document is usable.
    if (!Array.isArray(parsed.equipment)) throw new Error('missing equipment[]');
    return parsed;
  } catch (err) {
    runtimeCounters.geometryParseFailures++;
    console.error(`private geometry file present but unusable: ${err.message}`);
    return null;
  }
}

// Reads private/floor1-asset-mapping.json if present -- physicalSlotId ->
// device_id | null. Absent/malformed both fall back to an empty mapping
// (every slot UNMAPPED), never invented. This is the ONLY place a real
// physical-slot<->device_id correspondence would ever be introduced, and
// this repo's own copy of the file (if any) has every entry null: no
// authoritative mapping exists.
function loadPrivateAssetMapping(floorId) {
  const filePath = floors.documentPath(PRIVATE_DIR, floorId, 'mapping');
  if (!filePath || !fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (typeof parsed.mapping !== 'object' || parsed.mapping === null) throw new Error('missing mapping{}');
    return parsed.mapping;
  } catch (err) {
    console.error(`private asset-mapping file present but unusable (treating all slots UNMAPPED): ${err.message}`);
    return {};
  }
}

// Reads private/floor1-zones.json if present -- the drawing's own closed area
// boundaries. These ARE the rooms: each polygon is one closed ring off the
// CAD's area-boundary layer, bound to its name by containment and by the area
// the drawing prints for itself. They are not derived from the wall model and
// do not depend on it.
//
// They are still not architectural walls. A boundary says where an area ends,
// not what stands there, so nothing here should be read as an enclosure with a
// thickness, a door or a height.
//
// Returns { renderable, meta }. Only zones the extraction actually
// validated are given geometry: HIGH/MEDIUM confidence, renderable===true,
// and not party to an unresolved CONFLICT. Everything else -- LOW,
// REJECTED, UNRESOLVED, and both sides of a conflict -- is deliberately
// withheld from the wire as geometry and survives only as counts in meta,
// so the browser cannot draw an unvalidated boundary even by accident. The
// filter is applied here rather than trusting the file's own renderable
// flag alone, so a hand-edit of that flag still cannot promote a LOW or
// conflicted zone into the scene.
function loadPrivateZones(floorId) {
  const empty = { renderable: [], meta: { total: 0, served: 0, withheld: 0, byConfidence: {}, conflicts: [] } };
  const filePath = floors.documentPath(PRIVATE_DIR, floorId, 'zones');
  if (!filePath || !fs.existsSync(filePath)) return empty;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const zones = Array.isArray(parsed.zones) ? parsed.zones : [];
    const conflicts = Array.isArray(parsed.conflicts) ? parsed.conflicts : [];
    const conflicted = new Set();
    for (const c of conflicts) {
      if (c.status === 'CONFLICT') for (const id of c.ids || []) conflicted.add(id);
    }
    // Validation filter first, then projection. lib/wire rebuilds each zone
    // field by field: tier and boundary only. Its process type, its printed and
    // calculated areas and its free-text validation notes are values read from
    // the confidential drawing, nothing rendered them, and they are no longer
    // put on the wire at all.
    const renderable = wire.projectAll(
      zones.filter((z) =>
        z.renderable === true &&
        (z.confidence === 'HIGH' || z.confidence === 'MEDIUM') &&
        z.status !== 'CONFLICT' &&
        !conflicted.has(z.id) &&
        z.geometry && Array.isArray(z.geometry.vertices) && z.geometry.vertices.length >= 3),
      wire.projectFunctionalZone
    );
    // Null-prototype accumulator: a confidence value of `__proto__` on a plain
    // object literal is swallowed by the prototype setter rather than counted,
    // which loses a zone silently. Counting into a bare object cannot.
    const byConfidence = Object.create(null);
    for (const z of zones) {
      const tier = typeof z.confidence === 'string' ? z.confidence : 'unknown';
      byConfidence[tier] = (byConfidence[tier] || 0) + 1;
    }
    return {
      renderable,
      meta: {
        total: zones.length,
        served: renderable.length,
        withheld: zones.length - renderable.length,
        byConfidence,
        // Conflicts are reported, never silently resolved -- the client is
        // told two candidates exist and that neither was drawn. Ids and status
        // are enough to say that; the resolution note is author-written free
        // text and is not carried, matching lib/diagnostics.
        conflicts: wire.projectAll(conflicts, wire.projectConflict),
      },
    };
  } catch (err) {
    console.error(`private zone file present but unusable (serving no zones): ${err.message}`);
    return empty;
  }
}
// The zone-ordering table and the grid spacing constants are gone. They
// existed only to lay monitored devices out on a synthetic floor: which zone
// came first, how far apart zones sat, how far apart machines sat within one.
// Nothing places a device any more, so none of it has a meaning to preserve.

const DEVICE_REFRESH_INTERVAL_MS = 60_000;


// The enabled LDI device roster. Note what this does NOT return: a position.
// It reads identity and a location NAME, and nothing downstream turns either
// into a coordinate on the floor.
async function discoverDevices() {
  const result = await pool.query(
    `SELECT device_id, location FROM public.devices WHERE device_type = 'ldi' AND enabled = true ORDER BY location, device_id`
  );
  return result.rows;
}

// /api/state is polled frequently by every open kiosk tab, and the device
// list changes rarely (an enable/disable or a new device row), so paying a
// DB round trip on every single poll isn't worth it just to react to that
// instantly. DEVICE_REFRESH_INTERVAL_MS bounds how stale it can get.
let DEVICE_IDS = [];

async function refreshDevices() {
  try {
    const rows = await discoverDevices();
    DEVICE_IDS = rows.map((r) => r.device_id).sort();
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

// STATE_SQL's numeric `st` -> contracts.js's MachineState. Only 4 of the
// 8 MachineState values have a real source in this query today (see
// lib/contracts.js's per-member comments on OFF/INITIAL/PM/STOP) -- this
// map intentionally only covers the 4 that are real. A code this map does
// not cover resolves to UNDEFINED, never to a plausible-looking state.
const STATE_CODE_TO_MACHINE_STATE = {
  0: MachineState.UNDEFINED, // no telemetry row, or stale
  1: MachineState.IDLE, // state=false
  2: MachineState.RUN, // state=true, no active alarm
  3: MachineState.DOWN, // active Critical/Major alarm
};

app.get('/api/state', async (req, res) => {
  try {
    const result = await pool.query(STATE_SQL, [DEVICE_IDS]);
    const rows = result.rows.map((row) => {
      const machineState = STATE_CODE_TO_MACHINE_STATE[row.state] || MachineState.UNDEFINED;
      const theme = MACHINE_STATE_THEME[machineState];
      return {
        device_id: row.eqp_id,
        state: row.state,
        machine_state: machineState,
        state_label: theme.label,
        state_color: `#${theme.color.toString(16).padStart(6, '0')}`,
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
      };
    });
    res.status(200).json({
      machines: rows,
      queried_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

// /api/placement IS GONE. It served a deterministic synthetic grid: one
// position per monitored device, computed from a zone name and an index, with
// no relationship to anywhere the device actually stands. The renderer drew
// those as boxes on the floor.
//
// With the floor now read from CAD, an invented position rendered beside a
// measured one is indistinguishable to the eye -- and the eye is the entire
// point of a digital twin. The route, its computation and its renderer are
// deleted rather than disabled, so nothing can quietly reinstate them.
//
// A device with no established position is reported as UNMAPPED by
// /api/floor-geometry's slot layer and listed by /api/state. It is not drawn.

// Anonymous physical-slot geometry -- entirely separate concern from
// /api/placement above. Returns an empty-but-valid shape when
// private/floor1-geometry.json is absent (the default state for anyone
// cloning this public repo), never an error. Merges in
// floor1-asset-mapping.json's physicalSlotId -> device_id | null
// separately (per the explicit data-separation requirement: a real
// mapping can be added/changed without touching geometry) -- every value
// is null (UNMAPPED) until an authoritative correspondence is supplied;
// this route never infers or fabricates one from position, numbering, or
// any other heuristic. A mapped slot's `status` becomes 'IMS_CONNECTED'
// (its live MachineState comes from /api/state, joined client-side by
// device_id, same pattern as the real-device layer); every other slot
// stays 'UNMAPPED' and carries no device_id.
/**
 * The deployed-floor catalogue.
 *
 * Read on every request rather than cached at boot, because a floor arrives as
 * a file drop into a read-only bind mount: a restart to notice it would make
 * the deployment step a redeploy. The directory holds at most five entries and
 * this is five fs.existsSync calls, so the cost is not worth a cache that can
 * go stale.
 */
function catalogue() {
  return floors.discover(PRIVATE_DIR);
}

/**
 * The floor a request is for.
 *
 * No `floor` parameter means the default floor -- the URL every client used
 * before floors existed still means what it meant. A parameter that names a
 * deployed floor resolves to the CATALOGUE'S copy of that id, never the
 * client's string. Anything else resolves to null, and the caller answers 404
 * rather than quietly substituting a different floor: a view that shows
 * Floor 1 while its control says Floor 3 is worse than an error.
 */
function requestedFloor(req, list) {
  const raw = req.query ? req.query.floor : undefined;
  if (raw === undefined || raw === null || raw === '') return floors.defaultFloor(list);
  return floors.resolve(list, typeof raw === 'string' ? raw : null);
}

// Which floors this deployment actually has. Ids, ordinals and computed
// labels only -- nothing here is read from a private document, so the
// catalogue discloses that a floor is deployed and nothing about what is on
// it. A client renders its floor selector from this and cannot invent an
// option the server would refuse.
app.get('/api/floors', (req, res) => {
  const list = catalogue();
  res.status(200).json({
    floors: list.map((f) => ({
      id: f.id,
      ordinal: f.ordinal,
      label: f.label,
      has_zones: f.has_zones,
    })),
    default: floors.defaultFloor(list),
  });
});

/**
 * Reads private/floorN-raw-cad.json if present -- the drawing's own line-work,
 * as a reference the reconstructed model can be compared against.
 *
 * WHY THIS EXISTS AS A SEPARATE ROUTE. Every other geometry this service serves
 * has been interpreted: faces paired into walls, fragments merged, corners
 * closed, labels bound to boundaries. A model checked only against its own
 * output can be self-consistently wrong, and on this floor one was -- a
 * mirrored frame passed every check for as long as the checks compared the
 * model with itself. This carries no interpretation, so a disagreement between
 * the two is visible instead of theoretical.
 *
 * It is a separate route rather than a field on the geometry response because
 * it is diagnostic: an operator's floor view must not pay for nine thousand
 * reference segments it never draws.
 *
 * Returns null when the document is absent, which is the normal state for a
 * fresh clone and not an error.
 */
function loadPrivateRawCad(floorId) {
  const filePath = floors.documentPath(PRIVATE_DIR, floorId, 'rawcad');
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const roles = wire.projectAll(parsed.roles, wire.projectCadRole);
    if (roles.length === 0) return null;
    const env = parsed.envelope_mm && typeof parsed.envelope_mm === 'object'
      ? parsed.envelope_mm : {};
    const cov = parsed.coverage && typeof parsed.coverage === 'object' ? parsed.coverage : {};
    const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);
    return {
      // Named field by field, like every other private document this service
      // reads. The source layer names, the disclosure banner and every prose
      // note in the file stay here.
      envelope_mm: {
        width: typeof env.width === 'number' && Number.isFinite(env.width) ? env.width : null,
        depth: typeof env.depth === 'number' && Number.isFinite(env.depth) ? env.depth : null,
      },
      roles,
      // Coverage is served because the reference is only usable if the reader
      // knows what it leaves out. Counts only -- no layer is named.
      coverage: {
        entities_carried: int(cov.entities_carried),
        segments: int(cov.segments),
        entities_excluded_by_layer: int(cov.entities_excluded_by_layer),
        excluded_layer_count: int(cov.excluded_layer_count),
        block_references_not_expanded: int(cov.block_references_not_expanded),
      },
    };
  } catch (err) {
    console.error(`private raw-CAD file present but unusable: ${err.message}`);
    return null;
  }
}

/**
 * The raw CAD reference for one floor.
 *
 * COORDINATES ARE THE DRAWING'S, NOT THE MODEL'S. Millimetres, +y up, no
 * reflection -- deliberately NOT the twin's frame. The client applies the
 * canonical transform itself to overlay this on the model, so that the
 * transform is exercised on the comparison rather than baked into the thing
 * being compared with.
 */
app.get('/api/floor-raw-cad', (req, res) => {
  const list = catalogue();
  const floorId = requestedFloor(req, list);
  if (floorId === null && list.length > 0) return res.status(404).json({ error: 'not found' });
  const raw = loadPrivateRawCad(floorId);
  if (!raw) {
    return res.status(200).json({
      floor: floorId,
      available: false,
      envelope_mm: null,
      roles: [],
      coverage: null,
    });
  }
  res.status(200).json({
    floor: floorId,
    available: true,
    coordinate_system: 'CAD_MM_Y_UP_FLOOR_LOCAL',
    envelope_mm: raw.envelope_mm,
    roles: raw.roles,
    coverage: raw.coverage,
  });
});

app.get('/api/floor-geometry', (req, res) => {
  // Functional zones live in their own private file and are independent of
  // floor1-geometry.json -- they are served even when no geometry file
  // exists, which is the current state on this deployment.
  const list = catalogue();
  const floorId = requestedFloor(req, list);
  // A named floor that is not deployed is not an empty floor. Answering with
  // the empty shape would say "this floor exists and has nothing on it", which
  // is a different statement from "there is no such floor here".
  if (floorId === null && list.length > 0) return res.status(404).json({ error: 'not found' });
  const zoneLayer = loadPrivateZones(floorId);
  const geometry = loadPrivateGeometry(floorId);
  if (!geometry) {
    return res.status(200).json({
      floor: floorId,
      envelope: null,
      footprint_polygon: null,
      grid: null,
      columns: [],
      walls: [],
      wall_lines: [],
      openings: [],
      zones: [],
      equipment: [],
      functional_zones: zoneLayer.renderable,
      functional_zones_meta: zoneLayer.meta,
    });
  }
  const mapping = loadPrivateAssetMapping(floorId);
  // Allowlist at BOTH levels, not just this one. Naming the top-level fields
  // stopped a whole private document being published by one spread; it did not
  // stop the level below, where each slot was itself spread. lib/wire rebuilds
  // every slot, column and zone field by field, so a field added to a private
  // record cannot reach the browser the moment it is written. It also
  // normalizes each slot to one wire shape regardless of the private file's own
  // internal shape, which the renderer relies on.
  //
  // footprint_polygon and grid are served again, and the reason they were
  // withdrawn is the reason they are back: they were removed when nothing
  // consumed them, because publishing traced outlines no client reads is
  // disclosure with no purpose. The renderer now draws the building from the
  // traced outline and the surveyed gridlines instead of from a bounding box
  // and a decorative helper grid, so they have a consumer and earn their place
  // on the wire. Both go through the same field-by-field projection as
  // everything else: vertices and line positions as finite numbers, axis labels
  // through the token guard, and the traced area, winding note, span dimensions
  // and provenance prose all left server-side.
  //
  // `camera` stays unserved. Nothing reads it, and framing is derived from the
  // geometry rather than dictated by the private file.
  res.status(200).json({
    // The floor this payload describes, echoed from the catalogue rather than
    // from the request, so a client can tell which floor it actually received.
    floor: floorId,
    envelope: wire.projectEnvelope(geometry.envelope),
    footprint_polygon: wire.projectFootprintPolygon(geometry.footprint_polygon),
    grid: wire.projectGrid(geometry.grid),
    columns: wire.projectAll(geometry.columns, wire.projectColumn),
    walls: wire.projectAll(geometry.walls, wire.projectWall),
    // The unpaired faces. The renderer has drawn these as flat plan linework
    // since the wall layer was written, and never received one: the field was
    // extracted, documented and rendered, but never projected, so two thirds
    // of the drawing's wall line-work was silently absent from every plan this
    // service has ever served. They are a WEAKER claim than walls[] and are
    // shaped to stay that way -- no thickness field, so nothing downstream can
    // extrude a depth the drawing does not measure.
    wall_lines: wire.projectAll(geometry.wall_lines, wire.projectWallLine),
    openings: wire.projectAll(geometry.openings, wire.projectOpening),
    zones: wire.projectAll(geometry.zones, wire.projectZoneBox),
    // equipment[] replaces slots[]. slots[] held 243 positions digitised off
    // the scanned schematic: they were raster measurements presented beside CAD
    // geometry, and left/right placement, extent and orientation were all the
    // raster's, not the drawing's. They are no longer served in any form --
    // deleting the wire path is what makes that irreversible by accident.
    equipment: wire.projectAll(geometry.equipment, wire.projectEquipment, mapping),
    functional_zones: zoneLayer.renderable,
    functional_zones_meta: zoneLayer.meta,
  });
});

// Reads private/floor1-schematic.json if present -- the schematic reference
// transcription. Same convention as every other private loader: missing or
// malformed is the expected default for a public clone and returns null, never
// a throw.
//
// This document is NOT geometry. It holds drawing coordinates from a source
// that declares no scale, and it is kept in its own file precisely so that it
// cannot be confused with, or accidentally merged into, the measured model.
function loadPrivateSchematic(floorId) {
  const filePath = floors.documentPath(PRIVATE_DIR, floorId, 'schematic');
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`private schematic file present but unusable: ${err.message}`);
    return null;
  }
}

// The schematic reference layer, served separately from /api/floor-geometry
// and never mixed into it.
//
// Two things make the separation real rather than stated. The route is its own
// route, so nothing consuming geometry receives schematic coordinates by
// accident. And the payload names its own space -- coordinate_space is
// SCHEMATIC_NOT_PHYSICAL -- so a consumer that only ever sees the response
// still knows these numbers are not metres.
app.get('/api/floor-schematic', (req, res) => {
  const list = catalogue();
  const floorId = requestedFloor(req, list);
  if (floorId === null && list.length > 0) return res.status(404).json({ error: 'not found' });
  res.status(200).json({
    ...schematic.projectSchematic(loadPrivateSchematic(floorId)),
    generated_at: new Date().toISOString(),
  });
});

// Safe aggregate diagnostics. Deliberately counts and flags only: no
// coordinate, no identifier, no filesystem path, no process or vendor name
// ever appears here. A diagnostics endpoint that leaks the data it describes
// would defeat the boundary the rest of this service maintains.
//
// Evidence categories are reported separately and never summed -- a single
// "objects" figure would say that 242 observed positions and 23 monitored
// devices are the same kind of claim, which is exactly what this system
// exists to keep apart.
app.get('/api/diagnostics', (req, res) => {
  const t0 = Date.now();
  const list = catalogue();
  const floorId = requestedFloor(req, list);
  if (floorId === null && list.length > 0) return res.status(404).json({ error: 'not found' });
  const geometry = loadPrivateGeometry(floorId);
  const zoneLayer = loadPrivateZones(floorId);
  const mapping = loadPrivateAssetMapping(floorId);
  runtimeCounters.geometryLoadMs = Date.now() - t0;

  // Serialization is delegated to lib/diagnostics, which builds the response
  // field by field and can only emit counts, booleans and fixed enums. This
  // route deliberately does not assemble the payload itself: an inline object
  // literal here is exactly where a private field would eventually be added
  // by accident.
  res.status(200).json({
    ...buildDiagnostics({
      geometry,
      zoneMeta: zoneLayer.meta,
      confirmedMappings: Object.values(mapping).filter(Boolean).length,
      runtime: { ...runtimeCounters, uptimeSeconds: Math.floor(process.uptime()) },
      // Coverage only -- lib/diagnostics reduces this to counts and can emit
      // no name, label or coordinate from it.
      schematic: loadPrivateSchematic(floorId),
    }),
    generated_at: new Date().toISOString(),
  });
});

app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'db unreachable' });
  }
});

// Terminal handlers. Express's defaults are wrong for this service in two
// specific ways, and both are disclosure rather than availability problems:
//
//   - the default 404 page echoes the requested path back into the body, which
//     reflects caller-controlled text and, for a probe like
//     /private/floor1-geometry.json, quotes a private filename back at whoever
//     guessed it.
//   - the default error handler emits err.stack unless NODE_ENV is production.
//     Relying on an environment variable being set correctly is not a control;
//     a stack trace names source files, line numbers and the container's
//     directory layout.
//
// Both are replaced with fixed strings that carry nothing from the request.
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// eslint-disable-next-line no-unused-vars -- Express identifies an error
// handler by its arity; dropping `next` silently turns this back into ordinary
// middleware and reinstates the default handler.
app.use((err, req, res, next) => {
  console.error(`unhandled request error: ${err && err.message}`);
  res.status(500).json({ error: 'internal error' });
});

refreshDevices().then(() => {
  setInterval(refreshDevices, DEVICE_REFRESH_INTERVAL_MS).unref();
  app.listen(PORT, () => {
    console.log(`factory-twin-3d listening on :${PORT} (${DEVICE_IDS.length} LDI devices discovered)`);
  });
});
