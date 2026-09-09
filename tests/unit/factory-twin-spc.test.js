/**
 * Unit tests for FT-21's process stability module (lib/spc.js).
 *
 * The Cpk tests use the EXACT SAME fixture as
 * tests/e2e/golden-dataset-spc.js (same PE_VALUES/JE_VALUES/PE_SETTING/
 * JE_SETTING, same expected Cpk numbers) -- not a new fixture, so this
 * module's Cpk math is checked against the same ground truth the 5
 * existing dashboard/view implementations already agree on, not a
 * second, independently-invented "should be about right" number.
 *
 * Run: node tests/unit/factory-twin-spc.test.js
 */

'use strict';

const assert = require('assert');
const {
  StabilityState, CPK_ASSESSMENT_THRESHOLD, CPK_INTERVENTION_THRESHOLD,
  MIN_SAMPLES_FOR_CONFIDENT_CPK, PE_COLUMNS, JE_COLUMNS, isValidSpcMetric,
  mean, sampleStddev, stabilityStateForCpk,
  computeCpk, worstCpk, computeEwma, computeCusum, evaluateNelsonRules,
  linearSlopePerHour, computeDriftVelocity,
} = require('../../services/factory-twin-3d/lib/spc');
const { Quality } = require('../../services/factory-twin-3d/lib/analytics');

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

function approx(a, b, eps = 1e-9) {
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ~= ${b}`);
}

// ── golden-dataset fixture, verbatim from tests/e2e/golden-dataset-spc.js ──
const PE_VALUES = [2, 3, 1, 4, 2, 3, 2, 4, 3, 2, 3, 1];
const JE_VALUES = [5, 7, 4, 8, 5, 7, 5, 8];
const PE_SETTING = 4.0;
const JE_SETTING = 6.0;

function goldenMean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function goldenStddev(xs) {
  const m = goldenMean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
function goldenCpk(xs, limit) {
  const m = goldenMean(xs), s = goldenStddev(xs);
  return Math.min((limit - m) / (3 * s), (m + limit) / (3 * s));
}
const EXPECTED_CPK_PE = goldenCpk(PE_VALUES, PE_SETTING);
const EXPECTED_CPK_JE = goldenCpk(JE_VALUES, JE_SETTING);

// ── mean / sampleStddev ──
test('mean matches the golden PE fixture', () => {
  approx(mean(PE_VALUES), goldenMean(PE_VALUES));
});
test('sampleStddev matches the golden PE fixture (STDDEV_SAMP, n-1)', () => {
  approx(sampleStddev(PE_VALUES), goldenStddev(PE_VALUES));
});
test('sampleStddev is null for n<2, never zero (matches STDDEV_SAMP undefined-ness)', () => {
  assert.strictEqual(sampleStddev([5]), null);
  assert.strictEqual(sampleStddev([]), null);
});
test('mean is null for an empty array, never 0 (0 is a real average)', () => {
  assert.strictEqual(mean([]), null);
});

// ── computeCpk against the golden dataset ──
test('computeCpk(PE) matches golden-dataset-spc.js exactly', () => {
  const r = computeCpk({ values: PE_VALUES, tolerance: PE_SETTING, minSamplesForValid: 1 });
  approx(r.cpk, EXPECTED_CPK_PE, 1e-9);
  approx(r.mean, goldenMean(PE_VALUES));
  approx(r.stddev, goldenStddev(PE_VALUES));
  assert.strictEqual(r.n, PE_VALUES.length);
});
test('computeCpk(JE) matches golden-dataset-spc.js exactly', () => {
  const r = computeCpk({ values: JE_VALUES, tolerance: JE_SETTING, minSamplesForValid: 1 });
  approx(r.cpk, EXPECTED_CPK_JE, 1e-9);
});
test('worstCpk(PE, JE) is the LEAST of the two, matching Machine Snapshot panel 9', () => {
  const pe = computeCpk({ values: PE_VALUES, tolerance: PE_SETTING, minSamplesForValid: 1 });
  const je = computeCpk({ values: JE_VALUES, tolerance: JE_SETTING, minSamplesForValid: 1 });
  const worst = worstCpk(pe, je);
  approx(worst.cpk, Math.min(EXPECTED_CPK_PE, EXPECTED_CPK_JE));
});
test('worstCpk falls back to whichever side has a real value when the other is null', () => {
  const pe = computeCpk({ values: PE_VALUES, tolerance: PE_SETTING, minSamplesForValid: 1 });
  const jeUnavailable = computeCpk({ values: [], tolerance: NaN });
  assert.strictEqual(worstCpk(pe, jeUnavailable).cpk, pe.cpk);
  assert.strictEqual(worstCpk(jeUnavailable, pe).cpk, pe.cpk);
});

// ── sample sufficiency (n<30 threshold copied from the real dashboard panel) ──
test('n < 30 is INSUFFICIENT_DATA, not a confident VALID Cpk', () => {
  const r = computeCpk({ values: PE_VALUES, tolerance: PE_SETTING }); // default threshold = 30
  assert.strictEqual(r.quality, Quality.INSUFFICIENT_DATA);
  assert.ok(r.reason.includes('12 of 30'));
  // The number itself is still returned (not suppressed) -- INSUFFICIENT_DATA
  // is a confidence label, not a refusal to compute; the caller decides
  // whether to display a low-confidence number, same convention as
  // lib/analytics.js's own projectTrendPoint.
  assert.ok(Number.isFinite(r.cpk));
});
test('n >= 30 is VALID', () => {
  const thirty = Array.from({ length: 30 }, () => 3);
  const withVariance = thirty.map((v, i) => v + (i % 2 === 0 ? 0.1 : -0.1));
  const r = computeCpk({ values: withVariance, tolerance: 4 });
  assert.strictEqual(r.quality, Quality.VALID);
});
test('no tolerance recorded is UNAVAILABLE, never a fabricated spec limit', () => {
  const r = computeCpk({ values: PE_VALUES, tolerance: NaN });
  assert.strictEqual(r.quality, Quality.UNAVAILABLE);
  assert.strictEqual(r.cpk, null);
  assert.ok(r.reason.includes('no tolerance'));
});
test('zero samples is INSUFFICIENT_DATA with a real reason, not a crash', () => {
  const r = computeCpk({ values: [], tolerance: 4 });
  assert.strictEqual(r.quality, Quality.INSUFFICIENT_DATA);
  assert.strictEqual(r.cpk, null);
  assert.strictEqual(r.reason, 'no samples in this window');
});
test('zero variance yields null Cpk (NULLIF(3*stddev,0) semantics), never Infinity', () => {
  const flat = Array.from({ length: 35 }, () => 3);
  const r = computeCpk({ values: flat, tolerance: 4 });
  assert.strictEqual(r.cpk, null);
  assert.ok(r.reason.includes('zero variance'));
  assert.ok(Number.isFinite(r.stddev) && r.stddev === 0);
});

// ── stabilityStateForCpk: the plant's own OCAP thresholds, not invented ──
test('Cpk >= 1.33 is CAPABLE', () => {
  assert.strictEqual(stabilityStateForCpk(1.33), StabilityState.CAPABLE);
  assert.strictEqual(stabilityStateForCpk(2.0), StabilityState.CAPABLE);
});
test('1.0 <= Cpk < 1.33 is ASSESSMENT (OCAP Stage 1)', () => {
  assert.strictEqual(stabilityStateForCpk(1.0), StabilityState.ASSESSMENT);
  assert.strictEqual(stabilityStateForCpk(1.32), StabilityState.ASSESSMENT);
});
test('Cpk < 1.0 is INTERVENTION (OCAP Stage 2)', () => {
  assert.strictEqual(stabilityStateForCpk(0.99), StabilityState.INTERVENTION);
  assert.strictEqual(stabilityStateForCpk(-1), StabilityState.INTERVENTION);
});
test('a non-finite Cpk is UNKNOWN, never a plausible-looking CAPABLE', () => {
  assert.strictEqual(stabilityStateForCpk(null), StabilityState.UNKNOWN);
  assert.strictEqual(stabilityStateForCpk(NaN), StabilityState.UNKNOWN);
});
test('thresholds are exactly the documented LDI_SPC_GUIDE.md values', () => {
  assert.strictEqual(CPK_ASSESSMENT_THRESHOLD, 1.33);
  assert.strictEqual(CPK_INTERVENTION_THRESHOLD, 1.0);
  assert.strictEqual(MIN_SAMPLES_FOR_CONFIDENT_CPK, 30);
});

// ── EWMA ──
test('EWMA of a perfectly stable process never signals out of control', () => {
  const stable = [10, 10.1, 9.9, 10, 10.05, 9.95, 10, 10.1, 9.9, 10];
  const r = computeEwma({ values: stable });
  assert.strictEqual(r.points.length, stable.length);
  assert.ok(r.points.every((p) => !p.outOfControl));
});
test('EWMA detects a sustained mean shift', () => {
  const baseline = Array.from({ length: 20 }, () => 10 + (Math.random() - 0.5) * 0.2);
  const shifted = Array.from({ length: 20 }, () => 13 + (Math.random() - 0.5) * 0.2); // +3 shift
  const r = computeEwma({ values: [...baseline, ...shifted], target: 10 });
  const laterPoints = r.points.slice(-5);
  assert.ok(laterPoints.some((p) => p.outOfControl), 'EWMA should flag the shifted tail as out of control');
});
test('EWMA with < 2 samples is INSUFFICIENT_DATA, no points fabricated', () => {
  const r = computeEwma({ values: [5] });
  assert.strictEqual(r.quality, Quality.INSUFFICIENT_DATA);
  assert.deepStrictEqual(r.points, []);
});
test('EWMA defaults target to the series mean when none supplied', () => {
  const xs = [1, 2, 3, 4, 5];
  const r = computeEwma({ values: xs });
  approx(r.target, mean(xs));
});

// ── CUSUM ──
test('CUSUM of a stable process stays near zero, no signal', () => {
  const stable = [10, 10.1, 9.9, 10, 10.05, 9.95, 10, 10.1, 9.9, 10];
  const r = computeCusum({ values: stable });
  assert.ok(r.points.every((p) => p.signal === 'none'));
});
test('CUSUM signals "high" for a sustained upward shift', () => {
  const baseline = Array.from({ length: 15 }, () => 10);
  const shifted = Array.from({ length: 15 }, () => 12); // +2 sigma-ish sustained shift
  const r = computeCusum({ values: [...baseline, ...shifted], target: 10 });
  assert.ok(r.points.some((p) => p.signal === 'high'));
});
test('CUSUM signals "low" for a sustained downward shift', () => {
  const baseline = Array.from({ length: 15 }, () => 10);
  const shifted = Array.from({ length: 15 }, () => 8);
  const r = computeCusum({ values: [...baseline, ...shifted], target: 10 });
  assert.ok(r.points.some((p) => p.signal === 'low'));
});
test('CUSUM with < 2 samples is INSUFFICIENT_DATA', () => {
  const r = computeCusum({ values: [] });
  assert.strictEqual(r.quality, Quality.INSUFFICIENT_DATA);
  assert.strictEqual(r.reason, 'no samples in this window');
});

// ── Nelson rules ──
test('Nelson rule 1: a single point beyond 3-sigma is flagged', () => {
  const xs = [10, 10, 10, 10, 40, 10, 10]; // one huge outlier
  const mu = mean([10, 10, 10, 10, 10, 10, 10]);
  const sigma = 1;
  const violations = evaluateNelsonRules(xs, mu, sigma);
  const r1 = violations.find((v) => v.rule === 1);
  assert.ok(r1, 'rule 1 should fire');
  assert.ok(r1.indices.includes(4));
});
test('Nelson rule 2: 9 points in a row on one side of the mean', () => {
  const xs = [11, 11, 11, 11, 11, 11, 11, 11, 11, 10, 9]; // 9 above, then back to normal
  const violations = evaluateNelsonRules(xs, 10, 1);
  assert.ok(violations.some((v) => v.rule === 2));
});
test('Nelson rule 3: 6 points steadily increasing', () => {
  const xs = [5, 6, 7, 8, 9, 10, 11];
  const violations = evaluateNelsonRules(xs, 8, 2);
  assert.ok(violations.some((v) => v.rule === 3));
});
test('Nelson rule 7: 15 points hugging the mean (reduced-variability signal)', () => {
  const xs = Array.from({ length: 15 }, (_, i) => 10 + (i % 2 === 0 ? 0.1 : -0.1));
  const violations = evaluateNelsonRules(xs, 10, 1);
  assert.ok(violations.some((v) => v.rule === 7));
});
test('a genuinely stable, irregular process triggers no Nelson rule', () => {
  // Deterministic, not Math.random(), so this test is reproducible.
  // Irregular (non-monotonic, non-alternating, not hugging one narrow
  // band) by construction and confirmed empirically -- an earlier version
  // of this fixture used a tight alternating sawtooth, which correctly
  // tripped rules 4 and 7 (that IS what those rules are for); this one
  // does not.
  const xs = [10, 12, 9, 9, 11, 8, 13, 10, 9, 11, 10, 12, 8, 11, 10];
  const violations = evaluateNelsonRules(xs, 10, 2);
  assert.strictEqual(violations.length, 0, `expected no violations, got ${JSON.stringify(violations.map((v) => v.rule))}`);
});
test('Nelson rules never throw on a degenerate sigma of 0', () => {
  assert.doesNotThrow(() => evaluateNelsonRules([5, 5, 5], 5, 0));
  assert.deepStrictEqual(evaluateNelsonRules([5, 5, 5], 5, 0), []);
});

// ── drift velocity ──
test('drift velocity is ~0 for a flat series', () => {
  const t0 = Date.now();
  const values = [10, 10, 10, 10, 10];
  const timestampsMs = values.map((_, i) => t0 + i * 3600000);
  const r = computeDriftVelocity({ values, timestampsMs });
  approx(r.velocityPerHour, 0, 1e-9);
});
test('drift velocity is positive for a steady upward ramp, units per hour', () => {
  const t0 = Date.now();
  const values = [0, 1, 2, 3, 4, 5];
  const timestampsMs = values.map((_, i) => t0 + i * 3600000); // 1 unit/hour exactly
  const r = computeDriftVelocity({ values, timestampsMs });
  approx(r.velocityPerHour, 1, 1e-6);
});
test('drift velocity flags accelerating drift when the later half is steeper', () => {
  const t0 = Date.now();
  // slow for the first half, fast for the second
  const values = [0, 0.1, 0.2, 0.3, 10, 20, 30, 40];
  const timestampsMs = values.map((_, i) => t0 + i * 3600000);
  const r = computeDriftVelocity({ values, timestampsMs });
  assert.strictEqual(r.accelerating, true);
});
test('drift velocity with < 4 samples is INSUFFICIENT_DATA, not a guessed slope', () => {
  const r = computeDriftVelocity({ values: [1, 2], timestampsMs: [1000, 2000] });
  assert.strictEqual(r.quality, Quality.INSUFFICIENT_DATA);
  assert.strictEqual(r.velocityPerHour, null);
});
test('linearSlopePerHour returns null for a single point (no line through one point)', () => {
  assert.strictEqual(linearSlopePerHour([5], [1000]), null);
});
test('linearSlopePerHour returns null when every timestamp is identical (zero time-variance)', () => {
  assert.strictEqual(linearSlopePerHour([1, 2, 3], [1000, 1000, 1000]), null);
});

// ── metric validation (defense in depth before anything reaches SQL) ──
test('PE and JE are valid SPC metrics', () => {
  assert.ok(isValidSpcMetric('PE'));
  assert.ok(isValidSpcMetric('JE'));
});
test('a real AVG_METRICS column (e.g. temperature) is a valid SPC metric', () => {
  assert.ok(isValidSpcMetric('temperature'));
});
test('an unknown/hostile string is never a valid SPC metric', () => {
  // pe_1 alone IS a real, valid single-column AVG_METRICS entry (its own
  // scalar series, distinct from the pooled composite 'PE') -- correctly
  // true, not tested here as a rejection case.
  assert.strictEqual(isValidSpcMetric("pe'; DROP TABLE ldi_data; --"), false);
  assert.strictEqual(isValidSpcMetric('pe'), false); // lowercase composite name is not the real 'PE'
  assert.strictEqual(isValidSpcMetric(''), false);
  assert.strictEqual(isValidSpcMetric(null), false);
});
test('PE_COLUMNS/JE_COLUMNS match the real schema column counts (6 and 4)', () => {
  assert.strictEqual(PE_COLUMNS.length, 6);
  assert.strictEqual(JE_COLUMNS.length, 4);
});

console.log('='.repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
