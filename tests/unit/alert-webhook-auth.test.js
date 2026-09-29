'use strict';
/**
 * Runs the real "Check Bearer Token" function node of nodered_data/flows/
 * alerting.json in a vm sandbox and checks that /alert-webhook only passes a
 * request carrying "Authorization: Bearer <ALERT_WEBHOOK_TOKEN>", and that it
 * fails closed when no token is configured. Also checks the wiring: the HTTP
 * input goes only to this node, and only its first output reaches the
 * formatter that sends to LINE/Teams.
 * Exits non-zero on failure.
 */
const assert = require('assert');
const vm = require('vm');
const path = require('path');

const flows = require(path.join(__dirname, '..', '..', 'nodered_data', 'flows', 'alerting.json'));
const byId = Object.fromEntries(flows.map((n) => [n.id, n]));
const FUNC = byId.alert_auth.func;
const TOKEN = 'test-token-not-a-secret';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

function run(authorization, token = TOKEN) {
  const headers = authorization === undefined ? {} : { authorization };
  const sandbox = {
    msg: { req: { headers }, payload: { alerts: [] } },
    env: { get: (k) => (k === 'ALERT_WEBHOOK_TOKEN' ? token : undefined) },
    node: { error() {}, warn() {} },
  };
  return vm.runInNewContext(`(function(){ ${FUNC}\n })()`, sandbox);
}

console.log('\nAlert webhook — bearer token check');
test('correct bearer token -> output 1 only', () => {
  const [ok, rejected] = run('Bearer ' + TOKEN);
  assert.ok(ok);
  assert.strictEqual(rejected, null);
});
test('no Authorization header -> 401 on output 2', () => {
  const [ok, rejected] = run(undefined);
  assert.strictEqual(ok, null);
  assert.strictEqual(rejected.statusCode, 401);
});
test('wrong token, prefix of the token, token plus suffix -> 401', () => {
  for (const h of ['Bearer wrong', 'Bearer ' + TOKEN.slice(0, -1), 'Bearer ' + TOKEN + 'x', TOKEN, 'Basic ' + TOKEN]) {
    const [ok, rejected] = run(h);
    assert.strictEqual(ok, null, h);
    assert.strictEqual(rejected.statusCode, 401, h);
  }
});
test('no token configured -> 503, even with an empty bearer', () => {
  for (const h of [undefined, 'Bearer ', 'Bearer x']) {
    const [ok, rejected] = run(h, '');
    assert.strictEqual(ok, null);
    assert.strictEqual(rejected.statusCode, 503);
  }
});
test('wiring: HTTP in -> auth only; only output 1 reaches the formatter', () => {
  assert.strictEqual(JSON.stringify(byId.alert_http_in.wires), JSON.stringify([['alert_auth']]));
  assert.ok(byId.alert_auth.wires[0].includes('alert_format'));
  assert.ok(!byId.alert_auth.wires[1].includes('alert_format'));
  assert.strictEqual(byId.alert_auth.wires[1].length, 1);
  const reject = byId[byId.alert_auth.wires[1][0]];
  assert.strictEqual(reject.type, 'http response');
  assert.strictEqual(reject.statusCode, '', 'reject node must not override msg.statusCode');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
