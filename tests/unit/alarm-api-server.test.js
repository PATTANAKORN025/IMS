/**
 * Phase 12A -- functional tests for services/alarm-api/server.js.
 * Exercises the real `createApp()` factory over a real HTTP server bound to
 * an ephemeral port, against a fake pg pool and a fake Grafana identity
 * resolver -- no real database, no real Grafana, no real network call,
 * fully deterministic.
 *
 * Every credential/cookie/actor value here is synthetic test fixture data.
 *
 * Run: node tests/unit/alarm-api-server.test.js
 */

'use strict';

const assert = require('assert');
const {
  createApp,
  hasWritePermission,
} = require('../../services/alarm-api/server');

let passed = 0;
let failed = 0;
const tests = [];
/** Registers a test; does NOT run it -- see runAll() below. All test
 * bodies are async (real HTTP round-trips), so they must run one at a
 * time, in order, awaited -- registering-then-running avoids the
 * unawaited-concurrent-promises bug an immediately-executing async
 * `test()` would otherwise have at the top level of a CommonJS file
 * (no top-level await available here). */
function test(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`  PASS  ${name}`);
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${name} — ${e.message}`);
    }
  }
}

/** Fake pg pool: scripted responses keyed by whether the SQL is the UPDATE
 * or the fallback SELECT, plus a call log so tests can assert on exactly
 * what params reached "the database" (the actor-spoofing check depends on
 * this). */
function makeFakePool({ updateResult, selectResult, connectFails = false, queryThrows = false } = {}) {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (queryThrows) throw new Error('simulated query failure');
      if (/^\s*UPDATE/.test(sql)) return updateResult ?? { rowCount: 0, rows: [] };
      return selectResult ?? { rowCount: 0, rows: [] };
    },
    release: () => {},
  };
  return {
    connect: async () => {
      if (connectFails) throw new Error('simulated db connect failure');
      return client;
    },
    query: async () => {
      if (queryThrows) throw new Error('simulated query failure');
      return { rows: [{ '?column?': 1 }] };
    },
    end: async () => {},
    calls,
  };
}

function fakeIdentity(actor, orgRole) {
  return async (cookieHeader) => {
    if (!cookieHeader) return null;
    return { actor, orgRole };
  };
}

const noIdentity = async () => null;

async function startTestServer(appObj) {
  const server = appObj.app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function postJson(baseUrl, path, body, { withCookie = true } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(withCookie ? { Cookie: 'grafana_session=test-fixture-session' } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// --- unit-level: hasWritePermission -----------------------------------
test('hasWritePermission: Editor and Admin true, Viewer and unknown false', () => {
  assert.strictEqual(hasWritePermission('Editor'), true);
  assert.strictEqual(hasWritePermission('Admin'), true);
  assert.strictEqual(hasWritePermission('Viewer'), false);
  assert.strictEqual(hasWritePermission(null), false);
  assert.strictEqual(hasWritePermission(undefined), false);
});

// --- healthz -------------------------------------------------------------
test('healthz: db reachable -> 200 ok', async () => {
  const pool = makeFakePool();
  const server = await startTestServer(createApp({ pool, resolveIdentity: noIdentity }));
  try {
    const res = await fetch(`${server.baseUrl}/healthz`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { status: 'ok' });
  } finally {
    await server.close();
  }
});

test('healthz: db unreachable -> 503', async () => {
  const pool = makeFakePool({ queryThrows: true });
  const server = await startTestServer(createApp({ pool, resolveIdentity: noIdentity }));
  try {
    const res = await fetch(`${server.baseUrl}/healthz`);
    assert.strictEqual(res.status, 503);
  } finally {
    await server.close();
  }
});

// --- acknowledge success ---------------------------------------------
test('ack success: valid Editor session -> 200, DB row echoed', async () => {
  const pool = makeFakePool({
    updateResult: { rowCount: 1, rows: [{ logid: 'L1', status: 'ACKNOWLEDGED', acknowledged_by: 'alice' }] },
  });
  const server = await startTestServer(createApp({ pool, resolveIdentity: fakeIdentity('alice', 'Editor') }));
  try {
    const { status, json } = await postJson(server.baseUrl, '/alarms/ack', { logdate_ms: 1700000000000, logid: 'L1' });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.status, 'ACKNOWLEDGED');
  } finally {
    await server.close();
  }
});

// --- acknowledge authorization failure --------------------------------
test('ack authz failure: no session cookie -> 401', async () => {
  const pool = makeFakePool();
  const server = await startTestServer(createApp({ pool, resolveIdentity: fakeIdentity('alice', 'Editor') }));
  try {
    const { status } = await postJson(server.baseUrl, '/alarms/ack', { logdate_ms: 1700000000000, logid: 'L1' }, { withCookie: false });
    assert.strictEqual(status, 401);
    assert.strictEqual(pool.calls.length, 0); // never reaches the DB
  } finally {
    await server.close();
  }
});

test('ack authz failure: Viewer role -> 403, never reaches the DB', async () => {
  const pool = makeFakePool();
  const server = await startTestServer(createApp({ pool, resolveIdentity: fakeIdentity('mallory', 'Viewer') }));
  try {
    const { status } = await postJson(server.baseUrl, '/alarms/ack', { logdate_ms: 1700000000000, logid: 'L1' });
    assert.strictEqual(status, 403);
    assert.strictEqual(pool.calls.length, 0);
  } finally {
    await server.close();
  }
});

// --- resolve success ----------------------------------------------------
test('resolve success: valid Admin session -> 200', async () => {
  const pool = makeFakePool({
    updateResult: { rowCount: 1, rows: [{ logid: 'L2', status: 'RESOLVED', resolved_by: 'bob', resolution_note: 'fixed' }] },
  });
  const server = await startTestServer(createApp({ pool, resolveIdentity: fakeIdentity('bob', 'Admin') }));
  try {
    const { status, json } = await postJson(server.baseUrl, '/alarms/resolve', {
      logdate_ms: 1700000000000, logid: 'L2', resolution_note: 'fixed',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.status, 'RESOLVED');
  } finally {
    await server.close();
  }
});

// --- resolve authorization failure --------------------------------------
test('resolve authz failure: Viewer role -> 403', async () => {
  const pool = makeFakePool();
  const server = await startTestServer(createApp({ pool, resolveIdentity: fakeIdentity('mallory', 'Viewer') }));
  try {
    const { status } = await postJson(server.baseUrl, '/alarms/resolve', { logdate_ms: 1700000000000, logid: 'L2' });
    assert.strictEqual(status, 403);
  } finally {
    await server.close();
  }
});

// --- invalid transition ---------------------------------------------------
test('invalid transition: already RESOLVED -> 409', async () => {
  const pool = makeFakePool({
    updateResult: { rowCount: 0, rows: [] },
    selectResult: { rowCount: 1, rows: [{ status: 'RESOLVED' }] },
  });
  const server = await startTestServer(createApp({ pool, resolveIdentity: fakeIdentity('alice', 'Editor') }));
  try {
    const { status, json } = await postJson(server.baseUrl, '/alarms/ack', { logdate_ms: 1700000000000, logid: 'L3' });
    assert.strictEqual(status, 409);
    assert.ok(json.error.includes('RESOLVED'));
  } finally {
    await server.close();
  }
});

// --- missing alarm ---------------------------------------------------------
test('missing alarm: no lifecycle row -> 404', async () => {
  const pool = makeFakePool({
    updateResult: { rowCount: 0, rows: [] },
    selectResult: { rowCount: 0, rows: [] },
  });
  const server = await startTestServer(createApp({ pool, resolveIdentity: fakeIdentity('alice', 'Editor') }));
  try {
    const { status } = await postJson(server.baseUrl, '/alarms/ack', { logdate_ms: 1700000000000, logid: 'does-not-exist' });
    assert.strictEqual(status, 404);
  } finally {
    await server.close();
  }
});

// --- database failure -------------------------------------------------
test('database failure: pool.connect() rejects -> 500, no unhandled rejection', async () => {
  const pool = makeFakePool({ connectFails: true });
  const server = await startTestServer(createApp({ pool, resolveIdentity: fakeIdentity('alice', 'Editor') }));
  try {
    const { status, json } = await postJson(server.baseUrl, '/alarms/ack', { logdate_ms: 1700000000000, logid: 'L4' });
    assert.strictEqual(status, 500);
    assert.strictEqual(json.error, 'internal error');
  } finally {
    await server.close();
  }
});

test('database failure: client.query() rejects -> 500', async () => {
  const pool = makeFakePool({ queryThrows: true });
  const server = await startTestServer(createApp({ pool, resolveIdentity: fakeIdentity('alice', 'Editor') }));
  try {
    const { status } = await postJson(server.baseUrl, '/alarms/ack', { logdate_ms: 1700000000000, logid: 'L5' });
    assert.strictEqual(status, 500);
  } finally {
    await server.close();
  }
});

// --- actor identity derived from authenticated context, never spoofable --
test('actor spoof attempt: client-supplied acknowledged_by is ignored, session actor used instead', async () => {
  const pool = makeFakePool({
    updateResult: { rowCount: 1, rows: [{ logid: 'L6', status: 'ACKNOWLEDGED', acknowledged_by: 'alice' }] },
  });
  const server = await startTestServer(createApp({ pool, resolveIdentity: fakeIdentity('alice', 'Editor') }));
  try {
    const { status } = await postJson(server.baseUrl, '/alarms/ack', {
      logdate_ms: 1700000000000, logid: 'L6', acknowledged_by: 'mallory',
    });
    assert.strictEqual(status, 200);
    const updateCall = pool.calls.find((c) => /^\s*UPDATE/.test(c.sql));
    assert.ok(updateCall, 'expected an UPDATE query');
    // params: [toStatus, logdateMs, logid, fromStatuses, actor]
    assert.strictEqual(updateCall.params[4], 'alice');
    assert.notStrictEqual(updateCall.params[4], 'mallory');
  } finally {
    await server.close();
  }
});

test('actor identity: resolve also uses session actor, never client-supplied resolved_by', async () => {
  const pool = makeFakePool({
    updateResult: { rowCount: 1, rows: [{ logid: 'L7', status: 'RESOLVED', resolved_by: 'bob' }] },
  });
  const server = await startTestServer(createApp({ pool, resolveIdentity: fakeIdentity('bob', 'Editor') }));
  try {
    await postJson(server.baseUrl, '/alarms/resolve', {
      logdate_ms: 1700000000000, logid: 'L7', resolved_by: 'mallory', resolution_note: 'ok',
    });
    const updateCall = pool.calls.find((c) => /^\s*UPDATE/.test(c.sql));
    // params: [toStatus, logdateMs, logid, fromStatuses, actor, resolution_note]
    assert.strictEqual(updateCall.params[4], 'bob');
    assert.strictEqual(updateCall.params[5], 'ok');
  } finally {
    await server.close();
  }
});

runAll().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
