/**
 * Query Budget Linter — Regression Tests
 * Exercises the real linter logic (tests/lint/query-budget-linter.js),
 * not a reimplementation, so these tests actually protect against the
 * blind spot they were written to catch: the linter's range-scan check
 * only matched time_bucket(), silently missing every date_bin()-based
 * range scan against raw ldi_data (two real panels found live: see
 * ims-ldi-manufacturing.json panel 12 and the QUERY_BUDGET_EXEMPT one
 * in ims-ldi-engineering-analytics.json).
 */

const assert = require('assert');
const path = require('path');
const {
  isLatestValueShape,
  isRangeScanShape,
  usesStddev,
  shouldFlagTarget,
} = require('../lint/query-budget-linter.js');

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

const timeseriesPanel = { id: 1, type: 'timeseries', title: 'Test Panel' };
const stateTimelinePanel = { id: 2, type: 'state-timeline', title: 'State Panel' };
const rowPanel = { id: 3, type: 'row', title: 'Row Panel' };

console.log('\n--- isRangeScanShape: time_bucket() (pre-existing, regression-protect) ---');
test('time_bucket() + $__timeFilter -> range scan', () =>
  assert.strictEqual(
    isRangeScanShape(`SELECT time_bucket('1m', time) FROM public.ldi_data WHERE $__timeFilter(time)`),
    true
  ));
test('time_bucket() without $__timeFilter -> not a range scan', () =>
  assert.strictEqual(isRangeScanShape(`SELECT time_bucket('1m', time) FROM public.ldi_data`), false));

console.log('\n--- isRangeScanShape: date_bin() (the fix) ---');
test("date_bin() + $__timeFilter -> range scan", () =>
  assert.strictEqual(
    isRangeScanShape(
      `SELECT date_bin('1 minute', time, TIMESTAMPTZ '2000-01-01') FROM public.ldi_data WHERE $__timeFilter(time)`
    ),
    true
  ));
test('date_bin() without $__timeFilter -> not a range scan', () =>
  assert.strictEqual(
    isRangeScanShape(`SELECT date_bin('1 minute', time, TIMESTAMPTZ '2000-01-01') FROM public.ldi_data`),
    false
  ));
test('no bucketing function at all -> not a range scan (scalar aggregate)', () =>
  assert.strictEqual(
    isRangeScanShape(`SELECT AVG(temperature) FROM public.ldi_data WHERE $__timeFilter(time)`),
    false
  ));

console.log('\n--- shouldFlagTarget: date_bin() range scan against raw ldi_data -> flagged ---');
test('plain panel, date_bin() + $__timeFilter, raw ldi_data -> flagged', () =>
  assert.strictEqual(
    shouldFlagTarget(
      timeseriesPanel,
      `SELECT date_bin('1 minute', time, TIMESTAMPTZ '2000-01-01') AS time, eqp_id AS metric, AVG(temperature) AS value FROM public.ldi_data WHERE $__timeFilter(time) GROUP BY 1, 2`
    ),
    true
  ));
test('plain panel, time_bucket() + $__timeFilter, raw ldi_data -> flagged (regression)', () =>
  assert.strictEqual(
    shouldFlagTarget(
      timeseriesPanel,
      `SELECT time_bucket('1m', time) AS time, AVG(temperature) AS value FROM public.ldi_data WHERE $__timeFilter(time) GROUP BY 1`
    ),
    true
  ));

console.log('\n--- shouldFlagTarget: existing exemptions preserved (no false positives) ---');
test('NO_TIMEFILTER_INTENTIONAL opt-out -> not flagged', () =>
  assert.strictEqual(
    shouldFlagTarget(
      timeseriesPanel,
      `/* NO_TIMEFILTER_INTENTIONAL: documented reason */ SELECT date_bin('1 minute', time, TIMESTAMPTZ '2000-01-01') FROM public.ldi_data WHERE $__timeFilter(time)`
    ),
    false
  ));
test('LIMIT 1 latest-value lookup -> not flagged', () =>
  assert.strictEqual(
    shouldFlagTarget(
      timeseriesPanel,
      `SELECT date_bin('1 minute', time, TIMESTAMPTZ '2000-01-01') FROM public.ldi_data WHERE $__timeFilter(time) ORDER BY time DESC LIMIT 1`
    ),
    false
  ));
test('DISTINCT ON latest-value lookup -> not flagged', () =>
  assert.strictEqual(
    shouldFlagTarget(
      timeseriesPanel,
      `SELECT DISTINCT ON (eqp_id) date_bin('1 minute', time, TIMESTAMPTZ '2000-01-01'), eqp_id FROM public.ldi_data WHERE $__timeFilter(time)`
    ),
    false
  ));
test('STDDEV_SAMP (Cpk/SPC exemption) -> not flagged', () =>
  assert.strictEqual(
    shouldFlagTarget(
      timeseriesPanel,
      `SELECT date_bin('1 minute', time, TIMESTAMPTZ '2000-01-01'), STDDEV_SAMP(pe_1) FROM public.ldi_data WHERE $__timeFilter(time) GROUP BY 1`
    ),
    false
  ));
test('state-timeline panel type -> not flagged regardless of query shape', () =>
  assert.strictEqual(
    shouldFlagTarget(
      stateTimelinePanel,
      `SELECT date_bin('1 minute', time, TIMESTAMPTZ '2000-01-01'), MAX(CASE WHEN state THEN 1 ELSE 0 END) FROM public.ldi_data WHERE $__timeFilter(time) GROUP BY 1`
    ),
    false
  ));
test('row panel type -> not flagged (no real SQL)', () =>
  assert.strictEqual(shouldFlagTarget(rowPanel, undefined), false));
test('query against CAGG (ldi_data_1m), not raw table -> not flagged', () =>
  assert.strictEqual(
    shouldFlagTarget(
      timeseriesPanel,
      `SELECT date_bin('1 minute', time, TIMESTAMPTZ '2000-01-01') FROM public.ldi_data_1m WHERE $__timeFilter(time)`
    ),
    false
  ));

console.log('\n--- Intentional scalar aggregate exception (explicit, no bucketing function) ---');
test('scalar AVG over full range, no time_bucket/date_bin -> not flagged', () =>
  assert.strictEqual(
    shouldFlagTarget(timeseriesPanel, `SELECT AVG(temperature) FROM public.ldi_data WHERE $__timeFilter(time)`),
    false
  ));

console.log('\n--- Other pure helpers, unchanged behavior ---');
test('isLatestValueShape: LIMIT 1 -> true', () => assert.strictEqual(isLatestValueShape('... LIMIT 1'), true));
test('isLatestValueShape: DISTINCT ON -> true', () =>
  assert.strictEqual(isLatestValueShape('SELECT DISTINCT ON (x) ...'), true));
test('isLatestValueShape: neither -> false', () => assert.strictEqual(isLatestValueShape('SELECT * FROM t'), false));
test('usesStddev: STDDEV_SAMP -> true', () => assert.strictEqual(usesStddev('STDDEV_SAMP(x)'), true));
test('usesStddev: STDDEV( -> true', () => assert.strictEqual(usesStddev('STDDEV(x)'), true));
test('usesStddev: neither -> false', () => assert.strictEqual(usesStddev('AVG(x)'), false));

console.log('\n--- End-to-end regression: real dashboard files, real panels ---');
test('ims-ldi-manufacturing.json panel 12 (Calculated Time per Board) is now flagged', () => {
  const d = require(path.join(
    __dirname,
    '..',
    '..',
    'monitoring/grafana/dashboards/manufacturing/ims-ldi-manufacturing.json'
  ));
  const panel = d.panels.find((p) => p.id === 12);
  assert.ok(panel, 'panel 12 should exist');
  const target = panel.targets[0];
  assert.strictEqual(shouldFlagTarget(panel, target.rawSql), true);
});
test('ims-ingestion-latency.json panel 10 (documented NO_TIMEFILTER_INTENTIONAL) stays unflagged', () => {
  const d = require(path.join(
    __dirname,
    '..',
    '..',
    'monitoring/grafana/dashboards/infrastructure/ims-ingestion-latency.json'
  ));
  const panel = d.panels.find((p) => p.id === 10);
  assert.ok(panel, 'panel 10 should exist');
  for (const target of panel.targets) {
    assert.strictEqual(shouldFlagTarget(panel, target.rawSql), false, `refId ${target.refId} should stay exempt`);
  }
});

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
