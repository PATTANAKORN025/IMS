/**
 * Unit tests for scripts/gate.js -- the pure GO/CONDITIONAL GO/NO-GO
 * verdict function the Production Assurance Framework's reports depend on.
 * This is the one function whose output must never be hand-overridden, so
 * its own logic needs direct coverage independent of any real test run.
 *
 * Run: node tests/unit/gate.test.js
 */

const assert = require('assert');
const { computeVerdict } = require('../../scripts/gate');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}

function result(overrides) {
  return {
    name: 'test.example',
    status: 'PASS',
    duration_ms: 100,
    threshold: 'n/a',
    actual: 'n/a',
    evidence: 'n/a',
    blocking: true,
    ...overrides,
  };
}

console.log('--- Gate Decision Tests ---');

test('all PASS -> GO', () => {
  const { verdict } = computeVerdict([result({}), result({ name: 'b' })]);
  assert.strictEqual(verdict, 'GO');
});

test('blocking FAIL -> NO-GO', () => {
  const { verdict } = computeVerdict([result({ status: 'FAIL' })]);
  assert.strictEqual(verdict, 'NO-GO');
});

test('non-blocking FAIL -> CONDITIONAL GO, not NO-GO', () => {
  const { verdict } = computeVerdict([result({ status: 'FAIL', blocking: false })]);
  assert.strictEqual(verdict, 'CONDITIONAL GO');
});

test('CRITICAL blocking FAIL -> NO-GO even if described only in actual field', () => {
  const { verdict } = computeVerdict([
    result({ status: 'FAIL', threshold: '0 CRITICAL', actual: '1 CRITICAL found' }),
  ]);
  assert.strictEqual(verdict, 'NO-GO');
});

test('WARN alone -> CONDITIONAL GO', () => {
  const { verdict } = computeVerdict([result({ status: 'WARN' })]);
  assert.strictEqual(verdict, 'CONDITIONAL GO');
});

test('blocking BLOCKED_EXTERNAL -> CONDITIONAL GO, never auto-PASS', () => {
  const { verdict } = computeVerdict([result({ status: 'BLOCKED_EXTERNAL' })]);
  assert.strictEqual(verdict, 'CONDITIONAL GO');
});

test('blocking BLOCKED_SCOPE -> CONDITIONAL GO, never auto-PASS', () => {
  const { verdict } = computeVerdict([result({ status: 'BLOCKED_SCOPE' })]);
  assert.strictEqual(verdict, 'CONDITIONAL GO');
});

test('non-blocking BLOCKED_ENVIRONMENT does not affect verdict', () => {
  const { verdict } = computeVerdict([result({ status: 'BLOCKED_ENVIRONMENT', blocking: false }), result({})]);
  assert.strictEqual(verdict, 'GO');
});

test('NOT_TESTED (profile-excluded) never affects verdict', () => {
  const { verdict } = computeVerdict([result({ status: 'NOT_TESTED' }), result({})]);
  assert.strictEqual(verdict, 'GO');
});

test('one blocking FAIL outweighs many PASS', () => {
  const many = Array.from({ length: 20 }, (_, i) => result({ name: `p${i}` }));
  const { verdict } = computeVerdict([...many, result({ name: 'the-one', status: 'FAIL' })]);
  assert.strictEqual(verdict, 'NO-GO');
});

test('reasons array cites the failing result name', () => {
  const { reasons } = computeVerdict([result({ name: 'security.trivy.alarm-api', status: 'FAIL' })]);
  assert.ok(reasons.some((r) => r.includes('security.trivy.alarm-api')), 'reasons should name the failing test');
});

test('invalid status throws at construction time (via makeResult), not silently swallowed', () => {
  const { makeResult } = require('../../scripts/assurance-schema');
  assert.throws(() => makeResult({ ...result({}), status: 'MAYBE' }));
});

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
