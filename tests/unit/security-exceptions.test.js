/**
 * Unit tests for tests/security/runner.js's isExcepted() -- the function
 * that decides whether a HIGH finding gets downgraded to WARN. Regression
 * coverage for a real bug found 2026-08-21: matching by CVE+package alone
 * (no image scope) meant a grafana-only nginx rate-limit mitigation
 * silently also suppressed the same CVE ID on prometheus/alertmanager/
 * timescaledb, none of which route through the rate-limited nginx
 * location at all. Fixed by requiring the exception to explicitly list
 * the image it covers.
 *
 * Run: node tests/unit/security-exceptions.test.js
 */

const assert = require('assert');
const { isExcepted } = require('../../tests/security/runner.js');

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

console.log('--- Security Exception Matching Tests ---');

const exceptions = [
  { cve: 'CVE-2026-39821', package: 'stdlib', images: ['grafana-grafana-13.1.2'], expiry: '2099-01-01' },
];

test('exact CVE+package+image match -> excepted', () => {
  assert.strictEqual(
    isExcepted(exceptions, { severity: 'HIGH', cve: 'CVE-2026-39821', pkg: 'stdlib', image: 'grafana-grafana-13.1.2' }),
    true
  );
});

test('same CVE+package, different image -> NOT excepted (the real bug this guards)', () => {
  assert.strictEqual(
    isExcepted(exceptions, { severity: 'HIGH', cve: 'CVE-2026-39821', pkg: 'stdlib', image: 'prom-prometheus-v3.13.2' }),
    false
  );
  assert.strictEqual(
    isExcepted(exceptions, { severity: 'HIGH', cve: 'CVE-2026-39821', pkg: 'stdlib', image: 'prom-alertmanager-v0.33.1' }),
    false
  );
  assert.strictEqual(
    isExcepted(exceptions, { severity: 'HIGH', cve: 'CVE-2026-39821', pkg: 'stdlib', image: 'timescale-timescaledb-2.29.0-pg16' }),
    false
  );
});

test('CRITICAL severity -> never excepted, regardless of match', () => {
  assert.strictEqual(
    isExcepted(exceptions, { severity: 'CRITICAL', cve: 'CVE-2026-39821', pkg: 'stdlib', image: 'grafana-grafana-13.1.2' }),
    false
  );
});

test('different CVE, same image -> not excepted', () => {
  assert.strictEqual(
    isExcepted(exceptions, { severity: 'HIGH', cve: 'CVE-9999-99999', pkg: 'stdlib', image: 'grafana-grafana-13.1.2' }),
    false
  );
});

test('different package, same CVE+image -> not excepted', () => {
  assert.strictEqual(
    isExcepted(exceptions, { severity: 'HIGH', cve: 'CVE-2026-39821', pkg: 'openssl', image: 'grafana-grafana-13.1.2' }),
    false
  );
});

test('exception with no images array -> never matches (fails closed, not open)', () => {
  const legacyShape = [{ cve: 'CVE-2026-39821', package: 'stdlib', expiry: '2099-01-01' }];
  assert.strictEqual(
    isExcepted(legacyShape, { severity: 'HIGH', cve: 'CVE-2026-39821', pkg: 'stdlib', image: 'grafana-grafana-13.1.2' }),
    false
  );
});

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
