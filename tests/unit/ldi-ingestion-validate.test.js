'use strict';
/**
 * Runs the real "Auth & Validate" function node of nodered_data/flows/
 * ldi_ingestion.json in a vm sandbox shaped like Node-RED's (msg, node, env,
 * global), with a fake pg pool. Covers the parsing and failure rules:
 *   - auth, payload shape, batch size cap (413), rows missing eqp_id/log_id (400)
 *   - "0"/"0.0" stay 0; '' / non-numeric become NULL; filmno/board_id NULL
 *     stay NULL; a missing state is NULL, never "running"
 *   - five connection failures in a row replace the pool; the process is never
 *     asked to exit
 * Exits non-zero on failure.
 */
const assert = require('assert');
const vm = require('vm');
const path = require('path');

const flows = require(path.join(__dirname, '..', '..', 'nodered_data', 'flows', 'ldi_ingestion.json'));
const FUNC = flows.find((n) => n.id === 'ldi_auth_check').func;
const KEY = 'test-fixture-key-not-a-secret';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

function fakePool(behaviour = {}) {
  const calls = [];
  return {
    calls,
    options: { host: 'db', user: 'u', password: 'p' },
    ended: false,
    query(sql, params, cb) {
      calls.push({ sql, params });
      if (/INSERT INTO public\.ingest_staging/.test(sql)) return cb(null, { rows: [{ id: 42 }] });
      if (/INSERT INTO public\.ldi_data/.test(sql)) return cb(behaviour.insertError || null);
      return cb && cb(null, { rows: [] });
    },
    end() { this.ended = true; return Promise.resolve(); },
    on() {},
  };
}

function run(payload, { key = KEY, pool = fakePool(), globals = {} } = {}) {
  const store = { pgPool: pool, ...globals };
  const sent = [];
  let exitCalled = false;
  const sandbox = {
    msg: { req: { headers: { 'x-api-key': key } }, payload },
    env: { get: (k) => (k === 'INGEST_API_KEY' ? KEY : undefined) },
    global: { get: (k) => store[k], set: (k, v) => { store[k] = v; } },
    node: { error() {}, warn() {}, send: (m) => sent.push(m), done() {} },
    process: { exit: () => { exitCalled = true; } },
    setTimeout: (fn) => fn(),
    Date, JSON, Number, String, Math, Array, Object, Promise,
  };
  const ret = vm.runInNewContext(`(function(){ ${FUNC}\n })()`, sandbox);
  return { ret, sent, store, exitCalled, pool };
}

const row = (o = {}) => ({ eqp_id: 'LDI-01', log_id: 'SIM-01-1-1', time: '2026-09-29T00:00:00Z', factory: '2', process: 'DF INNER', mo: 'MO-1', fpn: 'F', layer_name: 'L', ...o });

console.log('\nLDI ingestion — Auth & Validate');
test('wrong API key -> 401', () => {
  assert.strictEqual(run([row()], { key: 'wrong' }).ret.statusCode, 401);
});
test('non-array payload -> 400', () => {
  assert.strictEqual(run({ a: 1 }).ret.statusCode, 400);
});
test('more than 1000 rows -> 413, nothing inserted', () => {
  const r = run(Array.from({ length: 1001 }, (_, i) => row({ log_id: 'x' + i })));
  assert.strictEqual(r.ret.statusCode, 413);
  assert.strictEqual(r.pool.calls.length, 0);
});
test('rows missing log_id or eqp_id -> 400 naming them, nothing inserted', () => {
  const r = run([row(), row({ log_id: '' }), row({ eqp_id: undefined }), row({ log_id: null })]);
  assert.strictEqual(r.ret.statusCode, 400);
  assert.strictEqual(JSON.stringify(r.ret.payload.rows), "[1,2,3]");
  assert.strictEqual(r.pool.calls.length, 0);
});
test('numeric parsing: "0" and "0.0" are 0; "" and "abc" are NULL; decimals kept', () => {
  const r = run([row({ temperature: '0', humidity: '0.0', air_vacuum: '', scan_speed: 'abc', thickness: '1.25', board_no: '7', total_board: '0' })]);
  const insert = r.pool.calls.find((c) => /INSERT INTO public\.ldi_data/.test(c.sql));
  assert.ok(insert, 'insert ran');
  const staged = JSON.parse(r.pool.calls[0].params[1])[0];
  assert.strictEqual(staged.temperature, 0);
  assert.strictEqual(staged.humidity, 0);
  assert.strictEqual(staged.air_vacuum, null);
  assert.strictEqual(staged.scan_speed, null);
  assert.strictEqual(staged.thickness, 1.25);
  assert.strictEqual(staged.board_no, 7);
  assert.strictEqual(staged.total_board, 0);
  assert.strictEqual(r.sent[0].statusCode, 200);
});
test('filmno/board_id NULL stay NULL; state missing is NULL, false stays false', () => {
  const r = run([row({ filmno: null, board_id: '' }), row({ log_id: 'b', state: false }), row({ log_id: 'c', state: true })]);
  const staged = JSON.parse(r.pool.calls[0].params[1]);
  assert.strictEqual(staged[0].filmno, null);
  assert.strictEqual(staged[0].board_id, null);
  assert.strictEqual(staged[0].state, null);
  assert.strictEqual(staged[1].state, false);
  assert.strictEqual(staged[2].state, true);
});
test('five connection failures replace the pool; process never exits', () => {
  class FakePg { constructor(opts) { this.options = opts; this.fresh = true; } on() {} query() {} end() { return Promise.resolve(); } }
  const pool = fakePool({ insertError: new Error('connect failed') });
  const globals = { pg: { Pool: FakePg }, ldiDbConnFailureStreak: 4 };
  const r = run([row()], { pool, globals });
  assert.strictEqual(r.exitCalled, false, 'process.exit must not be called');
  assert.ok(r.store.pgPool.fresh, 'pgPool replaced with a new pool');
  assert.deepStrictEqual(r.store.pgPool.options, pool.options, 'same config reused');
  assert.strictEqual(r.store.ldiDbConnFailureStreak, 0);
  assert.strictEqual(pool.ended, true, 'stuck pool closed');
  assert.strictEqual(r.sent[0].statusCode, 502);
});
test('non-connection insert errors do not replace the pool', () => {
  const pool = fakePool({ insertError: new Error('duplicate key value violates unique constraint') });
  const r = run([row()], { pool, globals: { pg: { Pool: function () { throw new Error('should not build'); } }, ldiDbConnFailureStreak: 4 } });
  assert.strictEqual(r.store.pgPool, pool);
  assert.strictEqual(r.store.ldiDbConnFailureStreak, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
