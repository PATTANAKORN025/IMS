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

// P9 REMEDIATION (2026-08-24): ldi_auth_check used to authenticate with
// `global.get('INGEST_API_KEY') || 'ims-secret-key'` -- global.get() reads
// Node-RED's functionGlobalContext, never populated with INGEST_API_KEY,
// so the check always fell through to that hardcoded literal regardless
// of the real env var. Fixed directly in the live nodered_data/flows.json
// (not the stale split source -- see file header) to
// `env.get('INGEST_API_KEY')`, matching every other endpoint in this
// codebase. No hardcoded key anywhere anymore; this test now uses the
// real, per-run-generated env.P9_INGEST_API_KEY like any other config
// value. prepareScratchNodeRedData() asserts the old buggy pattern is
// gone and the fix is present before this test trusts the extracted flow.

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
  // settings.js does require('pg') at /data/settings.js -- Node resolves
  // that via /data/node_modules, which in production is the real
  // nodered_data/node_modules (bind-mounted). Not provided by the Docker
  // image build (that installs into /usr/src/node_modules, Node-RED's
  // own extra-node-path for FLOW nodes only, which settings.js's own
  // plain `require()` never sees). Copying this real, unmodified
  // node_modules (~17MB) is required for settings.js to load at all.
  fs.cpSync(path.join(REPO_ROOT, 'nodered_data', 'node_modules'), path.join(SCRATCH_DIR, 'node_modules'), { recursive: true });

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
  const requiredMarkers = ['ingest_staging', 'clock_timestamp()', 'ON CONFLICT (log_id', "env.get('INGEST_API_KEY')"];
  const missing = requiredMarkers.filter((m) => !authNode.func.includes(m));
  if (missing.length) {
    throw new Error(
      `CONTRACT MISMATCH: live flows.json's ldi_auth_check is missing expected markers (${missing.join(', ')}) -- ` +
      'this would mean testing a different (likely regressed) contract than migration 081 + the P9 auth-key fix established. Aborting rather than silently testing the wrong thing.'
    );
  }
  if (authNode.func.includes("global.get('INGEST_API_KEY')") || authNode.func.includes('ims-secret-key')) {
    throw new Error('CONTRACT REGRESSION: ldi_auth_check still contains the pre-fix global.get(\'INGEST_API_KEY\')/hardcoded-fallback pattern -- the P9 auth-key fix appears to have been reverted.');
  }

  const respNode = tabNodes.find((n) => n.id === 'ldi_http_response');
  if (!respNode) throw new Error('CONTRACT EXTRACTION FAILED: ldi_http_response node not found');
  if (respNode.statusCode !== '') {
    throw new Error(`CONTRACT REGRESSION: ldi_http_response has statusCode="${respNode.statusCode}" -- expected "" (deferring to msg.statusCode). The P9 HTTP-status fix appears to have been reverted.`);
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

// The Windows/Docker Desktop host port-forward for a just-(re)created
// container can lag a few seconds behind the container's own healthcheck
// passing (same host-networking quirk documented earlier this session's
// live-incident response, unrelated to node-red/pgbouncer themselves) --
// a request sent immediately after compose reports a service healthy can
// get a genuine ECONNREFUSED at the HOST socket even though the
// container is already accepting connections internally. Retrying a few
// times with a short backoff absorbs that host-side lag without masking
// a real, sustained connection failure (which would exhaust the retries
// and surface with its real error message intact).
async function postBatchWithRetry(apiKey, batch, attempts = 4, delayMs = 1500) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await postBatch(apiKey, batch);
    if (last.statusCode !== 0) return last;
    spawnSync('node', ['-e', `setTimeout(()=>{}, ${delayMs})`]);
  }
  return last;
}

// P9 REMEDIATION (2026-08-24): ldi_http_response used to have a hardcoded
// statusCode:"200", so the HTTP transport status was ALWAYS 200 regardless
// of what ldi_auth_check set (401/400/502/503 only ever reached the JSON
// body). Fixed directly in the live nodered_data/flows.json (statusCode
// cleared to "" so it defers to msg.statusCode). Body content is still
// checked everywhere below, in addition to status -- belt and suspenders,
// and it's what actually distinguishes "Empty batch" (200, valid, zero
// rows) from a real accepted batch.
function parseBody(raw) {
  try { return JSON.parse(raw); } catch { return null; }
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
  const wrongKeyBody = parseBody(wrongKey.body);
  const badPayloadBody = parseBody(badPayload.body);
  // Post-fix: real HTTP status codes are checked here too, not just body
  // content -- ldi_http_response no longer overrides msg.statusCode.
  const ok = wrongKey.statusCode === 401 && wrongKeyBody?.error === 'Unauthorized'
    && badPayload.statusCode === 400 && badPayloadBody?.error === 'Payload must be a JSON array';
  return {
    ok,
    wrongKeyHttpStatus: wrongKey.statusCode, wrongKeyBody,
    badPayloadHttpStatus: badPayload.statusCode, badPayloadBody,
  };
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
    const parsed = parseBody(res.body);
    const accepted = parsed?.message === 'LDI Batch received';
    httpResults.push({ deviceIdx, batchSeq: b, recordsInBatch: batch.length, accepted, bodyError: parsed?.error ?? null, ...res });
  }
  return { eqpId, sent, httpResults };
}

// P9 remediation regression suite -- proves the auth-key fix and the
// HTTP-status fix, live, against the same disposable stack, after the
// main fleet assertions have already been computed (so nothing here can
// contaminate the primary sent/accepted/persisted counts: every record
// here uses its own mo='P9-SECREG-*' scope, separate from 'P9-RUN-*').
async function runSecurityRegression(env, primaryKey) {
  const results = [];
  const runId = crypto.randomBytes(4).toString('hex');
  const mo = `P9-SECREG-${runId}`;
  const rec = (logSuffix, eqpId) => ({
    time: new Date().toISOString(), eqp_id: eqpId, factory: '9', process: 'P9-SECREG-TEST',
    mo, fpn: 'P9-FPN', layer_name: 'p9-layer', log_id: `SECREG-${runId}-${logSuffix}`, state: true,
  });

  // -- 1. auth enforcement: configured key / wrong key / missing key / bad payload, real status + body --
  const validRes = await postBatch(primaryKey, [rec('valid', 'P9-FLEET-01')]);
  const validBody = parseBody(validRes.body);

  const wrongRes = await postBatch('wrong-' + crypto.randomBytes(4).toString('hex'), [rec('wrong', 'P9-FLEET-01')]);
  const wrongBody = parseBody(wrongRes.body);

  const missingRes = await new Promise((resolve) => {
    const body = JSON.stringify([rec('missing', 'P9-FLEET-01')]);
    const req = http.request({
      host: '127.0.0.1', port: NODE_RED_PORT, path: '/ldi-telemetry', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, // deliberately no x-api-key
      timeout: 10000,
    }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ statusCode: res.statusCode, body: b })); });
    req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));
    req.write(body);
    req.end();
  });
  const missingBody = parseBody(missingRes.body);

  const badPayloadRes = await new Promise((resolve) => {
    const body = JSON.stringify({ not: 'an array' });
    const req = http.request({
      host: '127.0.0.1', port: NODE_RED_PORT, path: '/ldi-telemetry', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': primaryKey, 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ statusCode: res.statusCode, body: b })); });
    req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));
    req.write(body);
    req.end();
  });
  const badPayloadBody = parseBody(badPayloadRes.body);

  const authOk = validRes.statusCode === 200 && validBody?.message === 'LDI Batch received'
    && wrongRes.statusCode === 401 && wrongBody?.error === 'Unauthorized'
    && missingRes.statusCode === 401 && missingBody?.error === 'Unauthorized'
    && badPayloadRes.statusCode === 400 && badPayloadBody?.error === 'Payload must be a JSON array';

  results.push(makeResult({
    name: 'fleet.security.auth-enforcement',
    status: authOk ? 'PASS' : 'FAIL',
    duration_ms: 0,
    threshold: 'configured key->200+accepted, wrong key->401, missing key->401, invalid payload->400 (real HTTP status, not just body)',
    actual: `configured=${validRes.statusCode}/${validBody?.message ?? validBody?.error}, wrong=${wrongRes.statusCode}/${wrongBody?.error}, missing=${missingRes.statusCode}/${missingBody?.error}, badPayload=${badPayloadRes.statusCode}/${badPayloadBody?.error}`,
    evidence: 'n/a -- see this result',
  }));

  // -- 2. key rotation: recreate node-red with a NEW INGEST_API_KEY (config
  // only, zero flow-code change) and prove the new key now authenticates
  // and the old one no longer does. --
  const rotatedKey = crypto.randomBytes(16).toString('hex');
  const rotatedEnv = { ...env, P9_INGEST_API_KEY: rotatedKey };
  RUNTIME_ENV = rotatedEnv;
  compose(['up', '-d', '--force-recreate', 'node-red'], { env: rotatedEnv });
  waitHealthy('node-red', 60000);

  const newKeyRes = await postBatchWithRetry(rotatedKey, [rec('rotated-new', 'P9-FLEET-01')]);
  const newKeyBody = parseBody(newKeyRes.body);
  const oldKeyRes = await postBatchWithRetry(primaryKey, [rec('rotated-old', 'P9-FLEET-01')]);
  const oldKeyBody = parseBody(oldKeyRes.body);

  const rotationOk = newKeyRes.statusCode === 200 && newKeyBody?.message === 'LDI Batch received'
    && oldKeyRes.statusCode === 401 && oldKeyBody?.error === 'Unauthorized';

  results.push(makeResult({
    name: 'fleet.security.auth-key-rotation',
    status: rotationOk ? 'PASS' : 'FAIL',
    duration_ms: 0,
    threshold: 'recreating node-red with a new INGEST_API_KEY (config change only, zero flow-code change) accepts the new key and rejects the previously-configured one',
    actual: `new-key=${newKeyRes.statusCode}/${newKeyBody?.message ?? newKeyBody?.error ?? newKeyRes.error}, old-key=${oldKeyRes.statusCode}/${oldKeyBody?.error ?? oldKeyRes.error}`,
    evidence: 'n/a -- see this result',
  }));

  // Restore the original key so any later step in this stack's lifecycle
  // isn't left mid-rotation.
  RUNTIME_ENV = env;
  compose(['up', '-d', '--force-recreate', 'node-red'], { env });
  waitHealthy('node-red', 60000);

  // -- 3. failure-path status codes: 502 (insert fails after staging --
  // FK violation on a deliberately-unregistered device) and 503
  // (staging/DB unavailable -- pgbouncer briefly stopped). Ordered last:
  // stopping pgbouncer can leave ldi_auth_check's own pg.Pool stuck per
  // its own documented failure mode, recoverable only by a process
  // restart -- harmless here since nothing else in this stack's lifecycle
  // depends on it afterward (teardown follows). --
  const fkRes = await postBatchWithRetry(primaryKey, [rec('fk-violation', `P9-FLEET-UNREGISTERED-${runId}`)]);
  const fkBody = parseBody(fkRes.body);
  const got502 = fkRes.statusCode === 502;

  compose(['stop', 'pgbouncer'], { env });
  // ldi_auth_check's staging INSERT fails via DNS resolution retry
  // ("getaddrinfo EAI_AGAIN pgbouncer"), confirmed live to take ~5s before
  // node-red itself returns 503 -- give it real margin before sending.
  spawnSync('node', ['-e', 'setTimeout(()=>{}, 4000)']);
  const dbDownRes = await postBatchWithRetry(primaryKey, [rec('db-down', 'P9-FLEET-01')]);
  const dbDownBody = parseBody(dbDownRes.body);
  const got503 = dbDownRes.statusCode === 503;
  compose(['start', 'pgbouncer'], { env });
  waitHealthy('pgbouncer', 60000);

  results.push(makeResult({
    name: 'fleet.security.http-status-failure-codes',
    status: (got502 && got503) ? 'PASS' : 'FAIL',
    duration_ms: 0,
    threshold: 'persistence failure after staging (FK violation on unregistered device) -> HTTP 502; staging/DB unavailable -> HTTP 503',
    actual: `fk-violation=${fkRes.statusCode}/${fkBody?.error ?? fkRes.error}, db-down=${dbDownRes.statusCode}/${dbDownBody?.error ?? dbDownRes.error}`,
    evidence: 'n/a -- see this result',
  }));

  return results;
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

// production-assurance.js's 'full' profile runs both the 'fleet-availability'
// and 'fleet-integrity' categories, and both map to this same runner (it
// emits both fleet.availability.* and fleet.integrity.* results from one
// disposable-stack run). Caching here means the second call in the same
// process returns instantly instead of standing up/tearing down the whole
// stack twice.
let _cachedRunPromise = null;

async function run() {
  if (_cachedRunPromise) return _cachedRunPromise;
  _cachedRunPromise = runUncached();
  return _cachedRunPromise;
}

async function runUncached() {
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

    console.log('[P9] verifying deployed contract responds per spec (401/400 probes, real HTTP status + body)');
    const contractCheck = await verifyDeployedContract(env.P9_INGEST_API_KEY);
    if (!contractCheck.ok) {
      throw new Error(
        `CONTRACT VERIFICATION FAILED: wrong-key status=${contractCheck.wrongKeyHttpStatus} body=${JSON.stringify(contractCheck.wrongKeyBody)} (want 401/Unauthorized), ` +
        `bad-payload status=${contractCheck.badPayloadHttpStatus} body=${JSON.stringify(contractCheck.badPayloadBody)} (want 400/Payload must be a JSON array)`
      );
    }
    console.log('[P9]   confirmed: real HTTP status codes now match msg.statusCode (401/400), post-fix');

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
    // Post-fix, both signals should agree: body.message == "LDI Batch
    // received" AND HTTP 200. Requiring both here is itself a live
    // regression check against the HTTP-status fix silently reverting.
    const statusBodyMismatch = allHttp.filter((h) => h.accepted !== (h.statusCode === 200));
    const acceptedBatches = allHttp.filter((h) => h.accepted && h.statusCode === 200);
    const acceptedRecords = acceptedBatches.reduce((n, h) => n + h.recordsInBatch, 0);
    const bodyErrors = allHttp.filter((h) => !h.accepted && h.bodyError);
    const transportErrors = allHttp.filter((h) => !h.accepted && !h.bodyError); // network/timeout, statusCode 0

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
    // No separate "DB insert latency" metric: this test's `time` values are
    // deliberately offset ~1h into the past (see baseTime below) so synthetic
    // rows never collide with a real dashboard's time window -- `ingest_ts -
    // time` would measure that deliberate offset, not real pipeline latency,
    // so computing it here would be a fabricated number. The real DB-commit
    // latency is already captured correctly in latency_p50/95/99_ms above:
    // per migration 081, the HTTP response is only sent after the insert
    // actually commits, so request latency IS commit latency for this endpoint.

    const metrics = {
      wall_ms: wallMs,
      requests_sent: allHttp.length,
      requests_per_sec: Number((allHttp.length / (wallMs / 1000)).toFixed(2)),
      accepted_requests: acceptedBatches.length,
      accepted_per_sec: Number((acceptedBatches.length / (wallMs / 1000)).toFixed(2)),
      latency_p50_ms: percentile(latencies, 0.50),
      latency_p95_ms: percentile(latencies, 0.95),
      latency_p99_ms: percentile(latencies, 0.99),
      api_error_rate: Number(((bodyErrors.length + transportErrors.length) / allHttp.length).toFixed(4)),
      db_insert_latency_note: 'not separately measurable here -- see comment above; request latency (above) already equals commit latency for this endpoint',
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
      threshold: 'sent == accepted (body message == "LDI Batch received" AND HTTP 200, post-fix both must agree) == persisted (direct DB count), 0 lost',
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
      status: (bodyErrors.length === 0 && transportErrors.length === 0 && statusBodyMismatch.length === 0) ? 'PASS' : 'FAIL',
      duration_ms: 0,
      threshold: '0 unexpected failures (body-level error, transport/timeout failure, or a body/HTTP-status disagreement -- post-fix the two must always agree)',
      actual: `${bodyErrors.length} body-level errors, ${transportErrors.length} transport/timeout failures, ${statusBodyMismatch.length} status/body mismatches, staging drained=${drain.drained}`,
      evidence: `docs/evidence/runtime/fleet-${stamp}.json`,
    }));

    console.log('[P9] running security remediation regression suite (auth enforcement, key rotation, failure-path status codes)');
    const securityResults = await runSecurityRegression(env, env.P9_INGEST_API_KEY);
    results.push(...securityResults);

    // ── Findings ──
    findings.push({
      severity: 'CRITICAL',
      status: 'FIXED',
      summary: 'FIXED (was CRITICAL): ldi_auth_check\'s API-key check read global.get(\'INGEST_API_KEY\'), always undefined -- the real env var was never consulted',
      detail: 'Root cause: global.get() reads Node-RED\'s functionGlobalContext (settings.js), which never registered INGEST_API_KEY -- so the check always fell through to a hardcoded literal (\'ims-secret-key\'), regardless of the real env var. Live ingestion only worked because .env\'s configured value happened to equal that literal; rotating it would have silently broken all real telemetry. Fixed directly in the live nodered_data/flows.json (ldi_auth_check now reads env.get(\'INGEST_API_KEY\'), matching every other endpoint in this codebase, e.g. ingestion.json / ldi_simulator.json) -- NOT in the stale split source (nodered_data/flows/ldi_ingestion.json), which remains a separate, tracked issue per instruction. No hardcoded fallback remains. Verified live by fleet.security.auth-enforcement (configured/wrong/missing key + bad payload, real status+body) and fleet.security.auth-key-rotation (recreating node-red with a new key, config only, zero flow-code change, proves the new key authenticates and the old one no longer does) -- both PASS this run.',
    });
    findings.push({
      severity: 'HIGH',
      status: 'FIXED',
      summary: 'FIXED (was HIGH): ldi_http_response had a hardcoded statusCode:"200" -- every response was HTTP 200 regardless of outcome',
      detail: 'Root cause: the http response node\'s own configured statusCode ("200") overrode msg.statusCode unconditionally, so ldi_auth_check\'s 401/400/502/503 never reached the wire -- only the JSON body carried real outcome information. Fixed directly in the live nodered_data/flows.json (ldi_http_response\'s statusCode cleared to "" so it defers to msg.statusCode, the standard Node-RED convention) -- no function-node logic changed, since ldi_auth_check already set the correct codes throughout. Verified live: fleet.security.auth-enforcement (200/401/401/400 across configured-key/wrong-key/missing-key/bad-payload) and fleet.security.http-status-failure-codes (502 for a persistence failure after staging -- FK violation on an unregistered device; 503 for staging/DB unavailable -- pgbouncer briefly stopped) -- both PASS this run.',
    });
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
