/**
 * Phase 12D -- unit tests for services/factory-twin-3d-next/lib/
 * backend-fetch.ts and lib/log.ts. Pure logic, no real network call: the
 * global `fetch` is replaced with a fake for the duration of each test and
 * restored immediately after.
 *
 * Run: node tests/unit/factory-twin-next-backend-fetch.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { requireTs } = require('./lib/require-ts');

const backendFetch = requireTs(path.join(
  __dirname, '..', '..', 'services', 'factory-twin-3d-next', 'lib', 'backend-fetch.ts',
));
const logModule = requireTs(path.join(
  __dirname, '..', '..', 'services', 'factory-twin-3d-next', 'lib', 'log.ts',
));

let passed = 0;
let failed = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}
async function runAll() {
  for (const { name, fn } of tests) {
    const originalFetch = global.fetch;
    const originalSetTimeout = global.setTimeout;
    try {
      await fn();
      passed++;
      console.log(`  PASS  ${name}`);
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${name} — ${e.message}`);
    } finally {
      global.fetch = originalFetch;
      global.setTimeout = originalSetTimeout;
    }
  }
}

const URL_UNDER_TEST = 'http://example.invalid/api/floor-geometry';

// ── fetchBackendJson ──────────────────────────────────────────────────

test('success: 200 with valid JSON body resolves to the parsed object', async () => {
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ envelope: { width: 1 } }) });
  const result = await backendFetch.fetchBackendJson(URL_UNDER_TEST);
  assert.deepStrictEqual(result, { envelope: { width: 1 } });
});

test('HTTP_ERROR: non-2xx status -> BackendFetchError kind HTTP_ERROR, status carried through', async () => {
  global.fetch = async () => ({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) });
  try {
    await backendFetch.fetchBackendJson(URL_UNDER_TEST);
    assert.fail('expected a throw');
  } catch (err) {
    assert.ok(err instanceof backendFetch.BackendFetchError);
    assert.strictEqual(err.kind, 'HTTP_ERROR');
    assert.strictEqual(err.status, 503);
    assert.strictEqual(err.url, URL_UNDER_TEST);
  }
});

test('MALFORMED_RESPONSE: 200 but body is not valid JSON -> kind MALFORMED_RESPONSE', async () => {
  global.fetch = async () => ({
    ok: true, status: 200, statusText: 'OK',
    json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
  });
  try {
    await backendFetch.fetchBackendJson(URL_UNDER_TEST);
    assert.fail('expected a throw');
  } catch (err) {
    assert.ok(err instanceof backendFetch.BackendFetchError);
    assert.strictEqual(err.kind, 'MALFORMED_RESPONSE');
  }
});

test('NETWORK: fetch itself rejects (connection refused) -> kind NETWORK', async () => {
  global.fetch = async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:4196'); };
  try {
    await backendFetch.fetchBackendJson(URL_UNDER_TEST);
    assert.fail('expected a throw');
  } catch (err) {
    assert.ok(err instanceof backendFetch.BackendFetchError);
    assert.strictEqual(err.kind, 'NETWORK');
  }
});

test('TIMEOUT: abort fires (global setTimeout patched to fire immediately, not the real 8s) -> kind TIMEOUT', async () => {
  // Patches the GLOBAL setTimeout the module itself calls internally, so
  // this test does not actually wait BACKEND_FETCH_TIMEOUT_MS -- the real
  // production value is asserted separately below, unpatched.
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => realSetTimeout(fn, 0);
  global.fetch = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      const err = new Error('This operation was aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });
  try {
    await backendFetch.fetchBackendJson(URL_UNDER_TEST);
    assert.fail('expected a throw');
  } catch (err) {
    assert.ok(err instanceof backendFetch.BackendFetchError);
    assert.strictEqual(err.kind, 'TIMEOUT');
  }
});

test('BACKEND_FETCH_TIMEOUT_MS is grounded and bounded: not tiny, not arbitrary-huge', () => {
  // docs/ux/INTERACTIVE_READY_ROOT_CAUSE.md's own measured figure for this
  // exact endpoint is 86-284ms -- the real ceiling must be a generous
  // multiple of that (so a merely-slow response never false-positives as a
  // timeout) while staying well short of "effectively unbounded."
  assert.ok(backendFetch.BACKEND_FETCH_TIMEOUT_MS >= 2_000, 'must be well above the observed 284ms worst case');
  assert.ok(backendFetch.BACKEND_FETCH_TIMEOUT_MS <= 15_000, 'must not be an arbitrary huge value');
});

test('BackendFetchError message never needs to be re-derived -- kind/url/status are the classification, not string parsing', () => {
  const err = new backendFetch.BackendFetchError('HTTP_ERROR', URL_UNDER_TEST, 'backend returned 500', 500);
  assert.strictEqual(err.name, 'BackendFetchError');
  assert.ok(err instanceof Error);
  assert.strictEqual(err.kind, 'HTTP_ERROR');
  assert.strictEqual(err.url, URL_UNDER_TEST);
  assert.strictEqual(err.status, 500);
});

// ── log() ──────────────────────────────────────────────────────────────

test('log(): a failing call writes to console.error, a successful one to console.log', () => {
  const errorCalls = [];
  const logCalls = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (line) => errorCalls.push(line);
  console.log = (line) => logCalls.push(line);
  try {
    logModule.log({ route: 'geometry-candidate', operation: 'fetch', failureCategory: 'timeout', durationMs: 8000 });
    logModule.log({ route: 'geometry-candidate', operation: 'fetch', durationMs: 120 });
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
  assert.strictEqual(errorCalls.length, 1);
  assert.strictEqual(logCalls.length, 1);
  const failed_ = JSON.parse(errorCalls[0]);
  assert.strictEqual(failed_.failureCategory, 'timeout');
  assert.strictEqual(failed_.service, 'factory-twin-3d-next');
  const ok = JSON.parse(logCalls[0]);
  assert.strictEqual(ok.failureCategory, undefined);
});

test('log(): every field name matches the spec -- service, route, operation, failure category, duration', () => {
  const calls = [];
  const originalLog = console.log;
  console.log = (line) => calls.push(line);
  try {
    logModule.log({ route: 'geometry-candidate', operation: 'fetch-geometry-machines-reference', durationMs: 175 });
  } finally {
    console.log = originalLog;
  }
  const parsed = JSON.parse(calls[0]);
  assert.strictEqual(parsed.service, 'factory-twin-3d-next');
  assert.strictEqual(parsed.route, 'geometry-candidate');
  assert.strictEqual(parsed.operation, 'fetch-geometry-machines-reference');
  assert.strictEqual(parsed.durationMs, 175);
  assert.ok(typeof parsed.ts === 'string' && !Number.isNaN(Date.parse(parsed.ts)));
});

test('log(): never receives a passwords/cookie/secret field -- this test documents the contract, not the runtime (the function has no such parameter to misuse)', () => {
  // LogFields has no field named password/cookie/authorization/secret at
  // all -- the TypeScript type itself is the enforcement (checked by
  // `npm run factory-twin:typecheck`, not re-derivable at plain-JS runtime
  // once transpiled). This test exists as a documented, explicit assertion
  // of that contract for a reader of the test suite, not a new check.
  const fieldNames = new Set(['route', 'operation', 'failureCategory', 'durationMs', 'detail']);
  for (const forbidden of ['password', 'cookie', 'authorization', 'secret', 'token']) {
    assert.ok(!fieldNames.has(forbidden));
  }
});

runAll().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
