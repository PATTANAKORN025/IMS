/**
 * Unit tests for FT-17's historical analytics module (lib/analytics.js).
 *
 * Every test here ultimately serves one of two invariants:
 *   1. a historical query cannot bypass the query budget (bounded range,
 *      bounded tier, bounded row count -- see tierForRange/validateRange),
 *   2. a metric this deployment's real schema cannot support for the
 *      requested range comes back UNAVAILABLE, never a plausible number
 *      quietly computed from the wrong tier.
 *
 * Run: node tests/unit/factory-twin-analytics.test.js
 */

'use strict';

const assert = require('assert');
const {
  Quality, Tier, SUPPORTED_RANGES, MAX_RANGE_MS,
  rangeToMs, tierForRange, isValidMetric, extendedStatsAvailable,
  classifyQuality, validateRange, projectTrendPoint, AVG_METRICS,
} = require('../../services/factory-twin-3d/lib/analytics');

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

// ── time-range contract ──
test('every supported range has a real millisecond value', () => {
  for (const r of SUPPORTED_RANGES) {
    assert.ok(Number.isFinite(rangeToMs(r)) && rangeToMs(r) > 0, r);
  }
});
test('an unsupported range string returns null, never a guessed duration', () => {
  assert.strictEqual(rangeToMs('3 fortnights'), null);
  assert.strictEqual(rangeToMs(''), null);
  assert.strictEqual(rangeToMs(undefined), null);
});
test('MAX_RANGE_MS matches the widest supported range (30d)', () => {
  assert.strictEqual(MAX_RANGE_MS, rangeToMs('30d'));
});

// ── bounded time range / large range rejected ──
test('a valid, bounded range is accepted', () => {
  const now = Date.now();
  const r = validateRange(now - 60 * 60 * 1000, now);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.spanMs, 60 * 60 * 1000);
});
test('from >= to is rejected', () => {
  const now = Date.now();
  assert.strictEqual(validateRange(now, now).ok, false);
  assert.strictEqual(validateRange(now, now - 1000).ok, false);
});
test('non-finite timestamps are rejected, never coerced', () => {
  assert.strictEqual(validateRange(NaN, Date.now()).ok, false);
  assert.strictEqual(validateRange(Date.now(), undefined).ok, false);
});
test('a range wider than the server maximum (30d) is rejected', () => {
  const now = Date.now();
  const r = validateRange(now - 31 * 24 * 60 * 60 * 1000, now);
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('30'));
});
test('exactly the 30-day maximum is accepted (boundary is inclusive)', () => {
  const now = Date.now();
  const r = validateRange(now - MAX_RANGE_MS, now);
  assert.ok(r.ok, r.error);
});

// ── tier selection: the same three boundaries query-budget-linter.js documents ──
test('a range at or under 6h resolves to the 1-minute tier', () => {
  assert.strictEqual(tierForRange(1), Tier.ONE_MIN);
  assert.strictEqual(tierForRange(6 * 60 * 60 * 1000), Tier.ONE_MIN);
});
test('a range just over 6h resolves to the 15-minute tier', () => {
  assert.strictEqual(tierForRange(6 * 60 * 60 * 1000 + 1), Tier.FIFTEEN_MIN);
});
test('a range at exactly 2 days still resolves to the 15-minute tier', () => {
  assert.strictEqual(tierForRange(2 * 24 * 60 * 60 * 1000), Tier.FIFTEEN_MIN);
});
test('a range just over 2 days resolves to the 1-hour tier', () => {
  assert.strictEqual(tierForRange(2 * 24 * 60 * 60 * 1000 + 1), Tier.ONE_HOUR);
});
test('the 30-day maximum resolves to the 1-hour tier', () => {
  assert.strictEqual(tierForRange(MAX_RANGE_MS), Tier.ONE_HOUR);
});
test('tierForRange never returns raw ldi_data -- a trend is always a range scan, never routed to the raw table', () => {
  for (const spanMs of [1, 60000, 6 * 3600000, 6 * 3600000 + 1, 2 * 86400000, MAX_RANGE_MS]) {
    assert.notStrictEqual(tierForRange(spanMs), Tier.RAW);
  }
});

// ── expected/maximum row count per tier (query budget, by construction) ──
test('expected row count stays small at every tier boundary', () => {
  const maxRowsFor = (spanMs, bucketMs) => Math.ceil(spanMs / bucketMs);
  assert.ok(maxRowsFor(6 * 3600000, 60000) <= 360); // 1m tier, 6h max
  assert.ok(maxRowsFor(2 * 86400000, 15 * 60000) <= 192); // 15m tier, 2d max
  assert.ok(maxRowsFor(MAX_RANGE_MS, 3600000) <= 720); // 1h tier, 30d max
});

// ── metric validation ──
test('every documented AVG metric is valid', () => {
  for (const m of AVG_METRICS) assert.ok(isValidMetric(m), m);
});
test('an unknown or malicious metric string is rejected', () => {
  assert.strictEqual(isValidMetric('temperature; DROP TABLE ldi_data'), false);
  assert.strictEqual(isValidMetric('nonexistent_metric'), false);
  assert.strictEqual(isValidMetric(''), false);
  assert.strictEqual(isValidMetric(undefined), false);
  assert.strictEqual(isValidMetric(123), false);
});

// ── extended stats availability: min/max/median/p95/stddev exist ONLY on raw ldi_data ──
test('extended stats (min/max/median/p95/stddev) are available only within the 1-minute tier\'s own range', () => {
  assert.strictEqual(extendedStatsAvailable(60000), true);
  assert.strictEqual(extendedStatsAvailable(6 * 3600000), true);
  assert.strictEqual(extendedStatsAvailable(6 * 3600000 + 1), false);
  assert.strictEqual(extendedStatsAvailable(MAX_RANGE_MS), false);
});

// ── data sufficiency: never a plausible number when evidence is insufficient ──
test('zero samples classifies as INSUFFICIENT_DATA, not VALID', () => {
  assert.strictEqual(classifyQuality({ metricSupported: true, sampleCount: 0 }), Quality.INSUFFICIENT_DATA);
});
test('a metric unsupported at this tier/range classifies as UNAVAILABLE regardless of sample count', () => {
  assert.strictEqual(classifyQuality({ metricSupported: false, sampleCount: 1000 }), Quality.UNAVAILABLE);
});
test('a real, sufficient sample count classifies as VALID', () => {
  assert.strictEqual(classifyQuality({ metricSupported: true, sampleCount: 42 }), Quality.VALID);
});
test('a sample count below the caller\'s own minimum is INSUFFICIENT_DATA, not VALID', () => {
  assert.strictEqual(classifyQuality({ metricSupported: true, sampleCount: 1, minSamplesForValid: 2 }), Quality.INSUFFICIENT_DATA);
});

// ── no fabricated values ──
test('projectTrendPoint never emits a value when the metric is unsupported', () => {
  const p = projectTrendPoint({ bucket: '2026-01-01T00:00:00Z', value: 42, sample_count: 100 }, false);
  assert.strictEqual(p.value, null, 'a value must not be emitted for an UNAVAILABLE metric, even if the row carries one');
  assert.strictEqual(p.quality, Quality.UNAVAILABLE);
});
test('projectTrendPoint carries a real value through unchanged when supported and valid', () => {
  const p = projectTrendPoint({ bucket: '2026-01-01T00:00:00Z', value: 21.5, sample_count: 60 }, true);
  assert.strictEqual(p.value, 21.5);
  assert.strictEqual(p.sample_count, 60);
  assert.strictEqual(p.quality, Quality.VALID);
});
test('projectTrendPoint reports a null bucket value honestly (a real gap), not a zero', () => {
  const p = projectTrendPoint({ bucket: '2026-01-01T00:00:00Z', value: null, sample_count: 0 }, true);
  assert.strictEqual(p.value, null);
  assert.strictEqual(p.quality, Quality.INSUFFICIENT_DATA);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
