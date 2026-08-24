'use strict';
// P9 -- Fleet Concurrent Ingestion Assurance.
//
// Proves, with real executable evidence against the REAL, unmodified
// /ldi-telemetry HTTP contract (nginx passthrough -> Node-RED auth/batch/
// stage/insert -> TimescaleDB), that 23 simultaneous devices can be
// ingested without loss, duplication, reordering, corruption, or
// unexpected 5xx -- entirely on a disposable, fully isolated stack that
// never touches the live IMS containers or live database.
//
// Isolation, concretely:
//   - Dedicated Compose project "ims-p9-fleet" (tests/fleet/docker-compose.p9-fleet.yml),
//     invoked only via this file, never with the live project.
//   - Container names (p9-fleet-*) distinct from every live ims-* container.
//   - Host ports (15432/18800) distinct from the live stack's (5432/1880).
//   - A fresh named volume + Compose-private network, destroyed on teardown.
//   - Throwaway generated credentials -- never reads or reuses the live .env's secrets.
// preflightIsolationCheck() / postflightIsolationCheck() / verifyTeardown()
// enforce this at runtime, not just by convention -- any failure aborts
// immediately with no fallback to writing into the live database.
//
// Real contract, not a reimplementation: only the actual
// ldi-ingestion-tab nodes (auth check, batching, ingest_staging
// write-ahead, real INSERT with caller timestamp + ingest_ts, ack only on
// commit) are deployed, extracted directly from the LIVE, currently-
// deployed nodered_data/flows.json -- NOT from nodered_data/flows/ldi_ingestion.json,
// which was found stale during the P9 audit (still the pre-migration-081
// fire-and-forget version). See FOLLOW_UP_FINDINGS at the bottom of this
// file's run() output for that discrepancy; this runner does not touch or
// regenerate that stale file.
//
// Run standalone: node tests/fleet/runner.js

const { execFileSync, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { makeResult } = require('../../scripts/assurance-schema');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COMPOSE_FILE = path.join(__dirname, 'docker-compose.p9-fleet.yml');
const COMPOSE_CWD = __dirname;
const RUNTIME_SCRATCH_ROOT = path.join(__dirname, '.runtime');
const SCRATCH_DIR = path.join(RUNTIME_SCRATCH_ROOT, 'node-red-data');
const SCRATCH_MIGRATIONS_DIR = path.join(RUNTIME_SCRATCH_ROOT, 'migrations');
// Only what the /ldi-telemetry contract under test actually depends on --
// see the compose file's comment on why this is a curated subset, not the
// full database/migrations/ directory.
const REQUIRED_MIGRATIONS = ['055-ldi-device-fk-constraints.sql', '081-ingest-durability-and-latency.sql'];
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'runtime');

const PROJECT = 'ims-p9-fleet';
const DB_PORT = 15432;
const NODE_RED_PORT = 18800;
const NUM_DEVICES = 23;
const BATCHES_PER_DEVICE = 5;
const RECORDS_PER_BATCH = 4;

const LIVE_CONTAINER_NAMES = new Set([
  'ims-timescaledb', 'ims-pgbouncer', 'ims-node-red', 'ims-proxy', 'ims-grafana',
  'ims-alarm-api', 'ims-factory-twin-3d', 'ims-prometheus', 'ims-alertmanager',
  'ims-db-migrate', 'ims-observability-archiver', 'ims-pgadmin',
]);
const P9_CONTAINER_NAMES = ['p9-fleet-timescaledb', 'p9-fleet-db-migrate', 'p9-fleet-pgbouncer', 'p9-fleet-node-red'];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function readLiveEnvValue(key, fallback) {
  try {
    const envText = fs.readFileSync(path.join(REPO_ROOT, '.env'), 'utf8');
    const m = envText.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return m && m[1].trim() ? m[1].trim() : fallback;
  } catch {
    return fallback;
  }
}

// ── Isolation gates ──────────────────────────────────────────────────
function preflightIsolationCheck() {
  const problems = [];
  if (PROJECT !== 'ims-p9-fleet') problems.push('PROJECT constant changed unexpectedly');
  for (const n of P9_CONTAINER_NAMES) {
    if (LIVE_CONTAINER_NAMES.has(n)) problems.push(`P9 container name collides with a live container: ${n}`);
  }
  const livePgPort = Number(readLiveEnvValue('PGPORT', '5432'));
  const liveNodeRedPort = Number(readLiveEnvValue('NODE_RED_PORT', '1880'));
  if (DB_PORT === livePgPort) problems.push(`P9 DB port ${DB_PORT} collides with live PGPORT (${livePgPort})`);
  if (NODE_RED_PORT === liveNodeRedPort) problems.push(`P9 node-red port ${NODE_RED_PORT} collides with live NODE_RED_PORT (${liveNodeRedPort})`);
  if (problems.length) throw new Error('ISOLATION PREFLIGHT FAILED: ' + problems.join('; '));
}

function postflightIsolationCheck() {
  const out = execFileSync('docker', ['compose', '-p', PROJECT, '-f', COMPOSE_FILE, 'ps', '-q'], {
    cwd: COMPOSE_CWD, encoding: 'utf8',
  }).trim();
  const ids = out ? out.split('\n').filter(Boolean) : [];
  if (ids.length === 0) throw new Error('ISOLATION POSTFLIGHT FAILED: no containers found for project ' + PROJECT);
  for (const id of ids) {
    const inspect = JSON.parse(execFileSync('docker', ['inspect', id], { encoding: 'utf8' }))[0];
    const label = (inspect.Config.Labels || {})['com.docker.compose.project'];
    const name = inspect.Name.replace(/^\//, '');
    if (label !== PROJECT) throw new Error(`ISOLATION POSTFLIGHT FAILED: container "${name}" has compose project label "${label}", expected "${PROJECT}"`);
    if (LIVE_CONTAINER_NAMES.has(name)) throw new Error(`ISOLATION POSTFLIGHT FAILED: container name "${name}" matches a live container name`);
    if (!name.startsWith('p9-fleet-')) throw new Error(`ISOLATION POSTFLIGHT FAILED: unexpected container name "${name}"`);
  }
  return ids;
}

function verifyTeardown() {
  const filt = `label=com.docker.compose.project=${PROJECT}`;
  const containers = execFileSync('docker', ['ps', '-a', '--filter', filt, '--format', '{{.Names}}'], { encoding: 'utf8' }).trim();
  const volumes = execFileSync('docker', ['volume', 'ls', '--filter', filt, '--format', '{{.Name}}'], { encoding: 'utf8' }).trim();
  const networks = execFileSync('docker', ['network', 'ls', '--filter', filt, '--format', '{{.Name}}'], { encoding: 'utf8' }).trim();
  return { containers, volumes, networks, clean: !containers && !volumes && !networks };
}

// ── Scratch Node-RED /data: copy real, unmodified files only ───────────
function prepareScratchNodeRedData() {
  fs.rmSync(SCRATCH_DIR, { recursive: true, force: true });
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });

  fs.copyFileSync(path.join(REPO_ROOT, 'nodered_data', 'settings.js'), path.join(SCRATCH_DIR, 'settings.js'));
  fs.cpSync(path.join(REPO_ROOT, 'nodered_data', 'lib'), path.join(SCRATCH_DIR, 'lib'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'nodered_data', 'package.json'), path.join(SCRATCH_DIR, 'package.json'));

  // Extract the real, LIVE, currently-deployed ldi-ingestion-tab from the
  // authoritative flows.json (proven byte-identical to the running
  // container during the P9 audit) -- deliberately NOT from
  // nodered_data/flows/ldi_ingestion.json, which is a stale pre-081
  // split source file. Only this one tab is deployed; every other tab
  // (simulators, SNMP ingestion, alerting) is unrelated to this test.
  const liveFlows = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'nodered_data', 'flows.json'), 'utf8'));
  const tabNodes = liveFlows.filter((n) => n.id === 'ldi-ingestion-tab' || n.z === 'ldi-ingestion-tab');
  if (tabNodes.length === 0) throw new Error('CONTRACT EXTRACTION FAILED: ldi-ingestion-tab not found in live nodered_data/flows.json');

  const authNode = tabNodes.find((n) => n.id === 'ldi_auth_check');
  if (!authNode || typeof authNode.func !== 'string') throw new Error('CONTRACT EXTRACTION FAILED: ldi_auth_check function node not found');
  const requiredMarkers = ['ingest_staging', 'clock_timestamp()', 'ON CONFLICT (log_id'];
  const missing = requiredMarkers.filter((m) => !authNode.func.includes(m));
  if (missing.length) {
    throw new Error(
      `CONTRACT MISMATCH: live flows.json's ldi_auth_check is missing expected durability markers (${missing.join(', ')}) -- ` +
      'this would mean testing a different (likely regressed, fire-and-forget) contract than migration 081 established. Aborting rather than silently testing the wrong thing.'
    );
  }

  fs.writeFileSync(path.join(SCRATCH_DIR, 'flows.json'), JSON.stringify(tabNodes, null, 4) + '\n', 'utf8');
  return { nodeCount: tabNodes.length };
}

function prepareScratchMigrations() {
  fs.rmSync(SCRATCH_MIGRATIONS_DIR, { recursive: true, force: true });
  fs.mkdirSync(SCRATCH_MIGRATIONS_DIR, { recursive: true });
  for (const f of REQUIRED_MIGRATIONS) {
    const src = path.join(REPO_ROOT, 'database', 'migrations', f);
    if (!fs.existsSync(src)) throw new Error(`REQUIRED MIGRATION MISSING: ${f}`);
    fs.copyFileSync(src, path.join(SCRATCH_MIGRATIONS_DIR, f));
  }
  return { count: REQUIRED_MIGRATIONS.length };
}

// ── Compose orchestration ───────────────────────────────────────────────
// RUNTIME_ENV is set once, near the top of run(), and used by every
// compose()/psql() call from then on -- including internal polling calls
// (waitHealthy, isolation checks) that don't take an explicit env argument.
// A first version of this runner passed env only to the top-level `up`
// calls and left `ps`/inspect polls to inherit the bare process env,
// which meant docker compose silently re-interpolated the compose file
// with blank P9_* values on every poll (visible as a flood of "variable
// is not set" warnings) -- harmless for `ps -q` itself, but a real trap
// waiting to bite the moment a poll path needed a real value.
let RUNTIME_ENV = process.env;

function compose(args, opts = {}) {
  return execFileSync('docker', ['compose', '-p', PROJECT, '-f', COMPOSE_FILE, ...args], {
    cwd: COMPOSE_CWD, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: RUNTIME_ENV, ...opts,
  });
}

function waitHealthy(serviceName, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const id = compose(['ps', '-q', serviceName]).trim();
    if (id) {
      const inspect = JSON.parse(execFileSync('docker', ['inspect', id], { encoding: 'utf8' }))[0];
      const health = inspect.State && inspect.State.Health && inspect.State.Health.Status;
      if (health === 'healthy') return true;
      if (inspect.State && inspect.State.Status === 'exited' && inspect.State.ExitCode !== 0) {
        throw new Error(`${serviceName} exited with code ${inspect.State.ExitCode}`);
      }
    }
    spawnSync('node', ['-e', 'setTimeout(()=>{}, 2000)']);
  }
  throw new Error(`${serviceName} did not become healthy within ${timeoutMs}ms`);
}

function psql(env, sql) {
  return execFileSync('docker', [
    'exec', '-i', 'p9-fleet-timescaledb', 'psql',
    '-U', env.P9_POSTGRES_USER, '-d', env.P9_POSTGRES_DB,
    '-v', 'ON_ERROR_STOP=1', '-A', '-F', '\x01', '-P', 'footer=off', '-f', '-',
  ], { encoding: 'utf8', input: sql, maxBuffer: 16 * 1024 * 1024 });
}

// ── HTTP producer ────────────────────────────────────────────────────
function postBatch(apiKey, batch) {
  return new Promise((resolve) => {
    const body = JSON.stringify(batch);
    const t0 = Date.now();
    const req = http.request({
      host: '127.0.0.1', port: NODE_RED_PORT, path: '/ldi-telemetry', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'Content-Length': Buffer.byteLength(body) },
      timeout: 20000,
    }, (res) => {
      let respBody = '';
      res.on('data', (c) => (respBody += c));
      res.on('end', () => resolve({ statusCode: res.statusCode, latencyMs: Date.now() - t0, body: respBody }));
    });
    req.on('error', (err) => resolve({ statusCode: 0, latencyMs: Date.now() - t0, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ statusCode: 0, latencyMs: Date.now() - t0, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

async function verifyDeployedContract(apiKey) {
  const wrongKey = await postBatch('wrong-key-' + crypto.randomBytes(4).toString('hex'), [{ eqp_id: 'X' }]);
  const badPayload = await new Promise((resolve) => {
    const body = JSON.stringify({ not: 'an array' });
    const req = http.request({
      host: '127.0.0.1', port: NODE_RED_PORT, path: '/ldi-telemetry', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ statusCode: res.statusCode, body: b })); });
    req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));
    req.write(body);
    req.end();
  });
  const ok = wrongKey.statusCode === 401 && badPayload.statusCode === 400;
  return { ok, wrongKeyStatus: wrongKey.statusCode, badPayloadStatus: badPayload.statusCode };
}

async function runDevice(deviceIdx, testRunId, apiKey, baseTime) {
  const eqpId = `P9-FLEET-${String(deviceIdx).padStart(2, '0')}`;
  const sent = [];
  const httpResults = [];
  for (let b = 1; b <= BATCHES_PER_DEVICE; b++) {
    const batch = [];
    for (let r = 1; r <= RECORDS_PER_BATCH; r++) {
      const globalSeq = (b - 1) * RECORDS_PER_BATCH + r;
      const logId = `${testRunId}-${deviceIdx}-${globalSeq}`;
      const isoTime = new Date(baseTime + deviceIdx * 100000 + globalSeq * 1000).toISOString();
      const rec = {
        time: isoTime, eqp_id: eqpId, factory: '9', process: 'P9-FLEET-TEST',
        mo: `P9-RUN-${testRunId}`, fpn: 'P9-FPN', layer_name: 'p9-layer',
        temperature: 20 + (globalSeq % 5), humidity: 50 + (globalSeq % 5),
        board_no: globalSeq, total_board: BATCHES_PER_DEVICE * RECORDS_PER_BATCH,
        state: true, log_id: logId,
      };
      batch.push(rec);
      sent.push({ ...rec, globalSeq });
    }
    const res = await postBatch(apiKey, batch);
    httpResults.push({ deviceIdx, batchSeq: b, recordsInBatch: batch.length, ...res });
  }
  return { eqpId, sent, httpResults };
}

function pollStagingDrain(env, timeoutMs) {
  const t0 = Date.now();
  let lastPending = null;
  while (Date.now() - t0 < timeoutMs) {
    const out = psql(env, `SELECT count(*) FROM public.ingest_staging WHERE status = 'pending';`);
    const pending = Number(out.trim().split('\n').pop());
    lastPending = pending;
    if (pending === 0) return { drained: true, waitedMs: Date.now() - t0 };
    spawnSync('node', ['-e', 'setTimeout(()=>{}, 500)']);
  }
  return { drained: false, waitedMs: Date.now() - t0, lastPending };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[idx];
}

async function run() {
  const stamp = timestamp();
  const testRunId = crypto.randomBytes(4).toString('hex');
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const results = [];
  const findings = [];
  let containerIds = [];
  const env = {
    ...process.env,
    // postgres/init/001-init-timescaledb.sql (reused unmodified) hardcodes
    // both of these literal identifiers in a few GRANT/ALTER DEFAULT
    // PRIVILEGES statements ("GRANT CONNECT ON DATABASE ims ...",
    // "... FOR ROLE ims_admin ..."). Matching them here is just satisfying
    // that reused script's assumption -- this database/role exists only
    // inside the disposable p9-fleet-timescaledb container, on its own
    // volume, unrelated to the live stack's real ims/ims_admin.
    P9_POSTGRES_DB: 'ims',
    P9_POSTGRES_USER: 'ims_admin',
    P9_POSTGRES_PASSWORD: crypto.randomBytes(16).toString('hex'),
    P9_GRAFANA_DB_PASSWORD: crypto.randomBytes(16).toString('hex'),
    P9_ALARM_API_DB_PASSWORD: crypto.randomBytes(16).toString('hex'),
    P9_NODE_RED_CREDENTIAL_SECRET: crypto.randomBytes(16).toString('hex'),
    P9_NODE_RED_ADMIN_PASSWORD_HASH: '$2b$08$' + crypto.randomBytes(22).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40),
    P9_INGEST_API_KEY: crypto.randomBytes(16).toString('hex'),
    P9_DB_PORT: String(DB_PORT),
    P9_NODE_RED_PORT: String(NODE_RED_PORT),
  };

  RUNTIME_ENV = env;

  try {
    console.log('[P9] preflight isolation check');
    preflightIsolationCheck();

    console.log('[P9] preparing scratch Node-RED /data (real, unmodified ldi-ingestion-tab only)');
    const scratch = prepareScratchNodeRedData();
    console.log(`[P9]   extracted ${scratch.nodeCount} nodes, durability markers verified present`);
    const migScratch = prepareScratchMigrations();
    console.log(`[P9]   staged ${migScratch.count} required migrations (055, 081) -- not the full history, see compose file comment`);

    console.log('[P9] building + starting isolated stack (project: ' + PROJECT + ')');
    compose(['up', '-d', '--build', 'timescaledb'], { env });
    waitHealthy('timescaledb', 120000);

    console.log('[P9] postflight isolation check (timescaledb)');
    containerIds = postflightIsolationCheck();

    console.log('[P9] applying migrations (reusing database/migrations/*.sql unmodified)');
    let migrateOut = '';
    try {
      migrateOut = compose(['run', '--rm', 'db-migrate'], { env });
    } catch (err) {
      throw new Error('MIGRATIONS FAILED: ' + ((err.stdout || '') + (err.stderr || '')).slice(-2000));
    }
    if (!/All migrations applied successfully/.test(migrateOut)) {
      throw new Error('MIGRATIONS DID NOT REPORT SUCCESS: ' + migrateOut.slice(-2000));
    }

    compose(['up', '-d', '--build', 'pgbouncer'], { env });
    waitHealthy('pgbouncer', 60000);
    compose(['up', '-d', '--build', 'node-red'], { env });
    waitHealthy('node-red', 90000);

    console.log('[P9] postflight isolation check (full stack)');
    containerIds = postflightIsolationCheck();

    console.log('[P9] verifying deployed contract responds per spec (401/400 probes)');
    const contractCheck = await verifyDeployedContract(env.P9_INGEST_API_KEY);
    if (!contractCheck.ok) {
      throw new Error(`CONTRACT VERIFICATION FAILED: wrong-key status=${contractCheck.wrongKeyStatus} (want 401), bad-payload status=${contractCheck.badPayloadStatus} (want 400)`);
    }

    console.log('[P9] registering 23 synthetic devices (disposable DB only)');
    const deviceValues = [];
    for (let i = 1; i <= NUM_DEVICES; i++) {
      const id = `P9-FLEET-${String(i).padStart(2, '0')}`;
      deviceValues.push(`('${id}', '${id}', '', 'ldi', false, 'p9-fleet-disposable-test')`);
    }
    psql(env, `INSERT INTO public.devices (device_id, hostname, ip_address, device_type, enabled, location) VALUES ${deviceValues.join(',')};`);
    const registeredCheck = psql(env, `SELECT count(*) FROM public.devices WHERE device_id LIKE 'P9-FLEET-%';`);
    if (Number(registeredCheck.trim().split('\n').pop()) !== NUM_DEVICES) {
      throw new Error('DEVICE REGISTRATION FAILED: expected ' + NUM_DEVICES + ' registered devices');
    }

    console.log(`[P9] running ${NUM_DEVICES} concurrent devices x ${BATCHES_PER_DEVICE} batches x ${RECORDS_PER_BATCH} records`);
    const baseTime = Date.now() - 3600000; // 1h in the past, clearly synthetic, never collides with "now" windows
    const t0 = Date.now();
    const deviceResults = await Promise.all(
      Array.from({ length: NUM_DEVICES }, (_, i) => runDevice(i + 1, testRunId, env.P9_INGEST_API_KEY, baseTime))
    );
    const wallMs = Date.now() - t0;

    const allSent = deviceResults.flatMap((d) => d.sent);
    const allHttp = deviceResults.flatMap((d) => d.httpResults);
    const totalSent = allSent.length;
    const accepted200 = allHttp.filter((h) => h.statusCode === 200);
    const acceptedRecords = accepted200.reduce((n, h) => n + h.recordsInBatch, 0);
    const unexpected5xx = allHttp.filter((h) => h.statusCode >= 500);
    const otherErrors = allHttp.filter((h) => h.statusCode !== 200 && h.statusCode < 500);

    console.log('[P9] waiting for ingest_staging to drain');
    const drain = pollStagingDrain(env, 30000);

    console.log('[P9] querying persisted rows directly from the database');
    const persistedRaw = psql(
      env,
      `SELECT eqp_id, log_id, time, ingest_ts, temperature, humidity, board_no FROM public.ldi_data WHERE mo = 'P9-RUN-${testRunId}' ORDER BY eqp_id, ingest_ts;`
    );
    const lines = persistedRaw.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
    const persistedRows = lines.slice(1).map((l) => {
      const [eqp_id, log_id, time, ingest_ts, temperature, humidity, board_no] = l.split('\x01');
      return { eqp_id, log_id, time, ingest_ts, temperature: Number(temperature), humidity: Number(humidity), board_no: Number(board_no) };
    });

    const sentByLogId = new Map(allSent.map((r) => [r.log_id, r]));
    const persistedLogIds = persistedRows.map((r) => r.log_id);
    const persistedLogIdSet = new Set(persistedLogIds);
    const duplicateLogIds = persistedLogIds.filter((id, i) => persistedLogIds.indexOf(id) !== i);

    // Per-device accepting/availability + sequence continuity (ingest_ts order vs embedded globalSeq)
    const perDevice = {};
    for (let i = 1; i <= NUM_DEVICES; i++) {
      const eqpId = `P9-FLEET-${String(i).padStart(2, '0')}`;
      const rows = persistedRows.filter((r) => r.eqp_id === eqpId);
      const seqOrder = rows.map((r) => Number(sentByLogId.get(r.log_id)?.globalSeq ?? -1));
      let reordered = false;
      for (let k = 1; k < seqOrder.length; k++) if (seqOrder[k] <= seqOrder[k - 1]) reordered = true;
      const expectedTotal = BATCHES_PER_DEVICE * RECORDS_PER_BATCH;
      perDevice[eqpId] = { persistedCount: rows.length, expectedCount: expectedTotal, seqOrder, reordered, accepted: rows.length > 0 };
    }
    const devicesAccepted = Object.values(perDevice).filter((d) => d.accepted).length;
    const anyReorder = Object.values(perDevice).some((d) => d.reordered);

    // Corruption: persisted values must exactly match what was sent for that log_id
    const corrupted = [];
    for (const row of persistedRows) {
      const s = sentByLogId.get(row.log_id);
      if (!s) continue;
      if (row.temperature !== s.temperature || row.humidity !== s.humidity || row.board_no !== s.board_no) {
        corrupted.push({ log_id: row.log_id, sent: { temperature: s.temperature, humidity: s.humidity, board_no: s.board_no }, persisted: { temperature: row.temperature, humidity: row.humidity, board_no: row.board_no } });
      }
    }

    const lost = allSent.filter((s) => !persistedLogIdSet.has(s.log_id));

    const latencies = allHttp.filter((h) => h.statusCode > 0).map((h) => h.latencyMs).sort((a, b) => a - b);
    const dbLatencies = persistedRows
      .map((r) => (r.ingest_ts && r.time ? new Date(r.ingest_ts).getTime() - new Date(r.time).getTime() : null))
      .filter((v) => v !== null);
    dbLatencies.sort((a, b) => a - b);

    const metrics = {
      wall_ms: wallMs,
      requests_sent: allHttp.length,
      requests_per_sec: Number((allHttp.length / (wallMs / 1000)).toFixed(2)),
      accepted_requests: accepted200.length,
      accepted_per_sec: Number((accepted200.length / (wallMs / 1000)).toFixed(2)),
      latency_p50_ms: percentile(latencies, 0.50),
      latency_p95_ms: percentile(latencies, 0.95),
      latency_p99_ms: percentile(latencies, 0.99),
      api_error_rate: Number(((otherErrors.length + unexpected5xx.length) / allHttp.length).toFixed(4)),
      db_insert_latency_p50_ms: percentile(dbLatencies, 0.50),
      db_insert_latency_p95_ms: percentile(dbLatencies, 0.95),
      total_records_sent: totalSent,
      total_records_persisted: persistedRows.length,
      staging_drained: drain.drained,
    };

    // ── Assertions -> TestResult[] ──
    results.push(makeResult({
      name: 'fleet.availability.devices-accepted',
      status: devicesAccepted === NUM_DEVICES ? 'PASS' : 'FAIL',
      duration_ms: wallMs,
      threshold: `${NUM_DEVICES}/${NUM_DEVICES} devices with >=1 persisted record`,
      actual: `${devicesAccepted}/${NUM_DEVICES} devices accepted`,
      evidence: `docs/evidence/runtime/fleet-${stamp}.json`,
    }));
    results.push(makeResult({
      name: 'fleet.integrity.sent-accepted-persisted',
      status: (totalSent === acceptedRecords && acceptedRecords === persistedRows.length) ? 'PASS' : 'FAIL',
      duration_ms: wallMs,
      threshold: 'sent == accepted (2xx) == persisted (direct DB count), 0 lost',
      actual: `sent=${totalSent} accepted=${acceptedRecords} persisted=${persistedRows.length} lost=${lost.length}`,
      evidence: `docs/evidence/runtime/fleet-${stamp}.json`,
    }));
    results.push(makeResult({
      name: 'fleet.integrity.duplicates',
      status: duplicateLogIds.length === 0 ? 'PASS' : 'FAIL',
      duration_ms: 0,
      threshold: '0 duplicate log_id in persisted rows',
      actual: `${duplicateLogIds.length} duplicates`,
      evidence: `docs/evidence/runtime/fleet-${stamp}.json`,
    }));
    results.push(makeResult({
      name: 'fleet.integrity.sequence-continuity',
      status: !anyReorder ? 'PASS' : 'FAIL',
      duration_ms: 0,
      threshold: 'per-device persisted sequence (by ingest_ts) strictly increasing, matching send order',
      actual: anyReorder ? 'reorder detected on >=1 device, see evidence' : 'all 23 devices in-order',
      evidence: `docs/evidence/runtime/fleet-${stamp}.json`,
    }));
    results.push(makeResult({
      name: 'fleet.integrity.corruption',
      status: corrupted.length === 0 ? 'PASS' : 'FAIL',
      duration_ms: 0,
      threshold: '0 persisted rows with values differing from what was sent',
      actual: `${corrupted.length} corrupted rows`,
      evidence: `docs/evidence/runtime/fleet-${stamp}.json`,
    }));
    results.push(makeResult({
      name: 'fleet.availability.error-rate',
      status: unexpected5xx.length === 0 ? 'PASS' : 'FAIL',
      duration_ms: 0,
      threshold: '0 unexpected 5xx responses',
      actual: `${unexpected5xx.length} 5xx, ${otherErrors.length} other non-200, staging drained=${drain.drained}`,
      evidence: `docs/evidence/runtime/fleet-${stamp}.json`,
    }));

    // ── Findings (disclosed, not fixed) ──
    findings.push({
      severity: 'INFO',
      summary: 'nodered_data/flows/ldi_ingestion.json (git-tracked split source) is stale vs. the live deployed flows.json',
      detail: 'Still the pre-migration-081 fire-and-forget version (server NOW(), no ingest_ts, no staging, acks before insert commits). Running the documented `node scripts/build-flows.js` would regress live ingestion durability on next Node-RED restart. Not modified as part of P9 per instruction; recommend a follow-up to sync it from the live container.',
    });
    findings.push({
      severity: 'INFO',
      summary: 'Referenced "periodic replay sweep" (ldi_staging_replay) for failed ingest_staging rows was not found in any flow file',
      detail: 'ldi_auth_check\'s own comments describe a replay mechanism for rows left `pending` after a 502. No such flow exists in nodered_data/flows/*.json. A 502 in production today may have no automatic retry path. Not fixed as part of P9; flagging for follow-up.',
    });

    // ── Evidence ──
    const evidence = {
      test: 'P9 Fleet Concurrent Ingestion Assurance',
      test_run_id: testRunId,
      timestamp: new Date().toISOString(),
      isolation: { project: PROJECT, container_ids: containerIds, db_port: DB_PORT, node_red_port: NODE_RED_PORT },
      config: { num_devices: NUM_DEVICES, batches_per_device: BATCHES_PER_DEVICE, records_per_batch: RECORDS_PER_BATCH },
      metrics,
      per_device: perDevice,
      lost_records: lost.map((r) => ({ log_id: r.log_id, eqp_id: r.eqp_id })),
      duplicate_log_ids: duplicateLogIds,
      corrupted_records: corrupted,
      http_results_sample: allHttp.slice(0, 50),
      findings,
    };
    const evidencePath = path.join(EVIDENCE_DIR, `fleet-${stamp}.json`);
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    console.log(`[P9] evidence written: ${path.relative(REPO_ROOT, evidencePath)}`);

    return results;
  } finally {
    console.log('[P9] tearing down disposable stack');
    try {
      compose(['down', '-v', '--remove-orphans'], { env });
    } catch (err) {
      console.error('[P9] teardown compose down failed:', err.message);
    }
    fs.rmSync(RUNTIME_SCRATCH_ROOT, { recursive: true, force: true });
    const teardown = verifyTeardown();
    if (!teardown.clean) {
      console.error('[P9] TEARDOWN VERIFICATION FAILED -- residual P9 resources:', JSON.stringify(teardown));
    } else {
      console.log('[P9] teardown verified clean: zero P9 containers/volumes/networks remain');
    }
  }
}

if (require.main === module) {
  run()
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
      process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
    })
    .catch((err) => {
      console.error('[P9] fleet runner crashed:', err.message);
      process.exit(1);
    });
}

module.exports = { run };
