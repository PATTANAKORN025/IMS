/**
 * Unit tests for FT-22's predictive process-intelligence module
 * (lib/predictive.js). Synthetic fixtures only, per this phase's own
 * instruction ("production analytics remain real-data grounded; synthetic
 * fixtures only for unit tests").
 *
 * Run: node tests/unit/factory-twin-predictive.test.js
 */

'use strict';

const assert = require('assert');
const predictive = require('../../services/factory-twin-3d/lib/predictive');
const spc = require('../../services/factory-twin-3d/lib/spc');
const { Quality } = require('../../services/factory-twin-3d/lib/analytics');
const { Freshness } = require('../../services/factory-twin-3d/lib/telemetry');

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

const HOUR = 3600000;

function makeRows(valuesPerRow, tolerance, startMs, stepMs) {
  return valuesPerRow.map((values, i) => ({ tMs: startMs + i * stepMs, values: Array.isArray(values) ? values : [values], tolerance }));
}

// ── freshness ──
test('freshnessForLastSample: recent sample is LIVE', () => {
  const now = Date.now();
  assert.strictEqual(predictive.freshnessForLastSample(now - 60000, now), Freshness.LIVE);
});
test('freshnessForLastSample: sample older than 5 minutes is STALE', () => {
  const now = Date.now();
  assert.strictEqual(predictive.freshnessForLastSample(now - 6 * 60000, now), Freshness.STALE);
});
test('freshnessForLastSample: no sample is NO_DATA', () => {
  assert.strictEqual(predictive.freshnessForLastSample(null), Freshness.NO_DATA);
});

// ── worstQuality ──
test('worstQuality: UNAVAILABLE beats INSUFFICIENT_DATA beats VALID', () => {
  assert.strictEqual(predictive.worstQuality([Quality.VALID, Quality.UNAVAILABLE]), Quality.UNAVAILABLE);
  assert.strictEqual(predictive.worstQuality([Quality.VALID, Quality.INSUFFICIENT_DATA]), Quality.INSUFFICIENT_DATA);
  assert.strictEqual(predictive.worstQuality([Quality.VALID, Quality.VALID]), Quality.VALID);
});

// ── capability trajectory: STABLE process ──
test('capability trajectory: a stable process (constant Cpk) classifies as stable', () => {
  const t0 = Date.now() - 5 * HOUR;
  // 5 buckets x 40 rows x 3 values, tight around mean=2, tolerance=4 -> consistent healthy Cpk in every bucket
  const values = [];
  for (let i = 0; i < 200; i++) values.push([2 + (i % 2 === 0 ? 0.05 : -0.05), 2, 2 - (i % 3 === 0 ? 0.05 : 0)]);
  const rows = makeRows(values, 4, t0, HOUR / 40);
  const r = predictive.computeCapabilityTrajectory({ rows, fromMs: t0, toMs: t0 + 5 * HOUR, nowMs: t0 + 5 * HOUR + 1000 });
  assert.strictEqual(r.classification, predictive.TrajectoryClassification.STABLE);
});

test('capability trajectory: declining Cpk across buckets classifies as declining', () => {
  const t0 = Date.now() - 5 * HOUR;
  const values = [];
  // sigma grows bucket over bucket -> Cpk falls sharply, tolerance fixed
  for (let bucket = 0; bucket < 5; bucket++) {
    const spread = 0.05 + bucket * 0.5; // widening spread each bucket -> declining Cpk
    for (let i = 0; i < 40; i++) values.push([2 + spread * (i % 2 === 0 ? 1 : -1), 2, 2]);
  }
  const rows = makeRows(values, 4, t0, HOUR / 40);
  const r = predictive.computeCapabilityTrajectory({ rows, fromMs: t0, toMs: t0 + 5 * HOUR, nowMs: t0 + 5 * HOUR + 1000 });
  assert.strictEqual(r.classification, predictive.TrajectoryClassification.DECLINING);
});

test('capability trajectory: improving Cpk across buckets classifies as improving', () => {
  const t0 = Date.now() - 5 * HOUR;
  const values = [];
  for (let bucket = 0; bucket < 5; bucket++) {
    const spread = 2.5 - bucket * 0.5; // narrowing spread each bucket -> improving Cpk
    for (let i = 0; i < 40; i++) values.push([2 + spread * (i % 2 === 0 ? 1 : -1), 2, 2]);
  }
  const rows = makeRows(values, 8, t0, HOUR / 40);
  const r = predictive.computeCapabilityTrajectory({ rows, fromMs: t0, toMs: t0 + 5 * HOUR, nowMs: t0 + 5 * HOUR + 1000 });
  assert.strictEqual(r.classification, predictive.TrajectoryClassification.IMPROVING);
});

test('capability trajectory: no tolerance anywhere is UNAVAILABLE', () => {
  const t0 = Date.now() - HOUR;
  const rows = makeRows(Array.from({ length: 40 }, () => [2, 2]), NaN, t0, HOUR / 40);
  const r = predictive.computeCapabilityTrajectory({ fromMs: t0, toMs: t0 + HOUR, rows, nowMs: t0 + HOUR + 1000 });
  assert.strictEqual(r.classification, predictive.TrajectoryClassification.UNAVAILABLE);
});

test('capability trajectory: stale last sample (older than staleness threshold vs. now) is STALE', () => {
  const t0 = Date.now() - 10 * HOUR;
  const rows = makeRows(Array.from({ length: 40 }, () => [2, 2]), 4, t0, HOUR / 4);
  // window ends 9 hours ago -- long past "now"
  const r = predictive.computeCapabilityTrajectory({ fromMs: t0, toMs: t0 + HOUR, rows, nowMs: Date.now() });
  assert.strictEqual(r.classification, predictive.TrajectoryClassification.STALE);
});

test('capability trajectory: fewer than 2 valid buckets is INSUFFICIENT_DATA', () => {
  const t0 = Date.now() - 5 * HOUR;
  // Only one row, in the first bucket -- other 4 buckets get zero samples.
  // nowMs is right after the row's own timestamp (not after the whole
  // window) so this exercises bucket coverage, not staleness -- staleness
  // is covered by its own dedicated test above.
  const rows = [{ tMs: t0 + 1000, values: [2, 2], tolerance: 4 }];
  const r = predictive.computeCapabilityTrajectory({ fromMs: t0, toMs: t0 + 5 * HOUR, rows, nowMs: t0 + 2000 });
  assert.strictEqual(r.classification, predictive.TrajectoryClassification.INSUFFICIENT_DATA);
});

// ── drift intelligence ──
test('drift intelligence: stable process has flat direction, no evidence', () => {
  const values = Array.from({ length: 20 }, () => 10);
  const t0 = Date.now();
  const timestampsMs = values.map((_, i) => t0 + i * HOUR);
  const ewma = spc.computeEwma({ values });
  const cusum = spc.computeCusum({ values });
  const nelson = [];
  const drift = spc.computeDriftVelocity({ values, timestampsMs });
  const r = predictive.computeDriftIntelligence({ ewma, cusum, nelson, drift });
  assert.strictEqual(r.direction, 'flat');
  assert.strictEqual(r.persistence, 'none');
});

test('drift intelligence: sustained upward shift is direction up, persistence sustained, cited in evidence', () => {
  const baseline = Array.from({ length: 15 }, () => 10);
  const shifted = Array.from({ length: 15 }, () => 14);
  const values = [...baseline, ...shifted];
  const t0 = Date.now();
  const timestampsMs = values.map((_, i) => t0 + i * HOUR);
  const ewma = spc.computeEwma({ values, target: 10 });
  const cusum = spc.computeCusum({ values, target: 10 });
  const nelson = spc.evaluateNelsonRules(values, spc.mean(values), spc.sampleStddev(values));
  const drift = spc.computeDriftVelocity({ values, timestampsMs });
  const r = predictive.computeDriftIntelligence({ ewma, cusum, nelson, drift });
  assert.strictEqual(r.direction, 'up');
  assert.strictEqual(r.persistence, 'sustained');
  assert.ok(r.evidence.some((e) => e.includes('CUSUM')));
});

test('drift intelligence: temporary shift that reverts is transient, not sustained', () => {
  // Short shift (3 points), then a LONG reversion (40 points) -- enough for
  // CUSUM's running C+ (no reset-to-zero applied, by this module's own
  // documented design) to decay back under h well before the tail-10
  // window computePersistence inspects. A short reversion after a short
  // shift (verified separately) leaves C+ still elevated at the tail,
  // which is real CUSUM behavior, not a defect -- this fixture isolates
  // the genuinely transient case instead.
  const values = [...Array(20).fill(10), ...Array(3).fill(16), ...Array(40).fill(10)];
  const t0 = Date.now();
  const timestampsMs = values.map((_, i) => t0 + i * HOUR);
  const ewma = spc.computeEwma({ values, target: 10 });
  const cusum = spc.computeCusum({ values, target: 10, hSigmas: 3 });
  const nelson = spc.evaluateNelsonRules(values, spc.mean(values), spc.sampleStddev(values));
  const drift = spc.computeDriftVelocity({ values, timestampsMs });
  const r = predictive.computeDriftIntelligence({ ewma, cusum, nelson, drift });
  assert.notStrictEqual(r.persistence, 'sustained');
});

test('drift intelligence: monotonic drift is captured by OLS velocity with a sign', () => {
  const values = Array.from({ length: 10 }, (_, i) => i);
  const t0 = Date.now();
  const timestampsMs = values.map((_, i) => t0 + i * HOUR);
  const ewma = spc.computeEwma({ values });
  const cusum = spc.computeCusum({ values });
  const nelson = [];
  const drift = spc.computeDriftVelocity({ values, timestampsMs });
  const r = predictive.computeDriftIntelligence({ ewma, cusum, nelson, drift });
  assert.strictEqual(r.direction, 'up');
  assert.ok(r.velocity_per_hour > 0);
});

// ── mixed-baseline detection ──
test('mixed baseline: homogeneous process is not flagged heterogeneous', () => {
  const values = Array.from({ length: 30 }, () => 10 + (Math.random() - 0.5) * 0.2);
  const timestampsMs = values.map((_, i) => Date.now() + i * HOUR);
  const cusum = spc.computeCusum({ values });
  const nelson = spc.evaluateNelsonRules(values, spc.mean(values), spc.sampleStddev(values));
  const r = predictive.computeMixedBaselineSignal({ seriesValues: values, seriesTimestampsMs: timestampsMs, nelson, cusum });
  assert.strictEqual(r.heterogeneity_detected, false);
});

test('mixed baseline: a real recipe-change-like split (front vs back mean shift) is flagged heterogeneous with a change-point', () => {
  const front = Array.from({ length: 20 }, () => 5);
  const back = Array.from({ length: 20 }, () => 25);
  const values = [...front, ...back];
  const timestampsMs = values.map((_, i) => Date.now() + i * HOUR);
  const cusum = spc.computeCusum({ values });
  const nelson = spc.evaluateNelsonRules(values, spc.mean(values), spc.sampleStddev(values));
  const r = predictive.computeMixedBaselineSignal({ seriesValues: values, seriesTimestampsMs: timestampsMs, nelson, cusum });
  assert.strictEqual(r.heterogeneity_detected, true);
  assert.ok(Number.isFinite(r.two_sample_z));
  assert.ok(r.change_point_index !== null, 'CUSUM should locate a change point for a sharp sustained shift');
});

test('mixed baseline: does not suppress Nelson violations -- both still visible to the caller', () => {
  const front = Array.from({ length: 20 }, () => 5);
  const back = Array.from({ length: 20 }, () => 25);
  const values = [...front, ...back];
  const nelson = spc.evaluateNelsonRules(values, spc.mean(values), spc.sampleStddev(values));
  assert.ok(nelson.length > 0, 'sanity: this fixture really does trigger Nelson rules');
  // computeMixedBaselineSignal never mutates or filters the nelson array it's given
  const timestampsMs = values.map((_, i) => Date.now() + i * HOUR);
  const cusum = spc.computeCusum({ values });
  predictive.computeMixedBaselineSignal({ seriesValues: values, seriesTimestampsMs: timestampsMs, nelson, cusum });
  assert.ok(nelson.length > 0, 'violations must still be present after mixed-baseline analysis runs');
});

test('mixed baseline: fewer than 4 samples is INSUFFICIENT_DATA, not a guessed verdict', () => {
  const r = predictive.computeMixedBaselineSignal({ seriesValues: [1, 2], seriesTimestampsMs: [1000, 2000], nelson: [], cusum: { points: [] } });
  assert.strictEqual(r.quality, Quality.INSUFFICIENT_DATA);
  assert.strictEqual(r.heterogeneity_detected, false);
});

// ── risk prioritization ──
test('risk: INTERVENTION Cpk state is always HIGH risk', () => {
  const cpk = { state: spc.StabilityState.INTERVENTION, cpk: 0.5 };
  const r = predictive.assessRisk({ cpk, trajectoryClassification: 'stable', driftIntel: { direction: 'flat', persistence: 'none' }, mixedBaseline: { heterogeneity_detected: false }, nelsonViolationCount: 0 });
  assert.strictEqual(r.level, predictive.RiskLevel.HIGH);
  assert.ok(r.evidence.some((e) => e.includes('INTERVENTION')));
});

test('risk: CAPABLE, stable, no drift, no violations is NONE risk', () => {
  const cpk = { state: spc.StabilityState.CAPABLE, cpk: 2.0 };
  const r = predictive.assessRisk({ cpk, trajectoryClassification: 'stable', driftIntel: { direction: 'flat', persistence: 'none' }, mixedBaseline: { heterogeneity_detected: false }, nelsonViolationCount: 0 });
  assert.strictEqual(r.level, predictive.RiskLevel.NONE);
});

test('risk: unavailable/unknown Cpk with no other signal is NONE, not escalated for missing data', () => {
  const cpk = { state: spc.StabilityState.UNKNOWN, cpk: null };
  const r = predictive.assessRisk({ cpk, trajectoryClassification: predictive.TrajectoryClassification.UNAVAILABLE, driftIntel: { direction: 'unknown', persistence: 'none' }, mixedBaseline: { heterogeneity_detected: false }, nelsonViolationCount: 0 });
  assert.strictEqual(r.level, predictive.RiskLevel.NONE);
});

test('risk: ASSESSMENT + declining trajectory + sustained drift escalates to HIGH', () => {
  const cpk = { state: spc.StabilityState.ASSESSMENT, cpk: 1.1 };
  const r = predictive.assessRisk({ cpk, trajectoryClassification: predictive.TrajectoryClassification.DECLINING, driftIntel: { direction: 'up', persistence: 'sustained' }, mixedBaseline: { heterogeneity_detected: false }, nelsonViolationCount: 1 });
  assert.strictEqual(r.level, predictive.RiskLevel.HIGH);
});

test('risk: ASSESSMENT alone (no declining trajectory) is MEDIUM, not HIGH', () => {
  const cpk = { state: spc.StabilityState.ASSESSMENT, cpk: 1.2 };
  const r = predictive.assessRisk({ cpk, trajectoryClassification: 'stable', driftIntel: { direction: 'flat', persistence: 'none' }, mixedBaseline: { heterogeneity_detected: false }, nelsonViolationCount: 0 });
  assert.strictEqual(r.level, predictive.RiskLevel.MEDIUM);
});

// ── forecast ──
test('forecast: fewer than 3 valid trajectory points is UNAVAILABLE, never a guessed number', () => {
  const trajectory = { points: [{ cpk: 1.5, n: 40 }, { cpk: null, n: 0 }, { cpk: null, n: 0 }], slopePerHour: null };
  const f = predictive.buildForecast(trajectory, HOUR);
  assert.strictEqual(f.type, 'FORECAST');
  assert.strictEqual(f.next_window_cpk_estimate, null);
  assert.strictEqual(f.confidence, 'UNAVAILABLE');
});

test('forecast: >=3 valid points with sufficient samples yields a MEDIUM-confidence, never HIGH, estimate', () => {
  const trajectory = {
    points: [
      { cpk: 1.0, n: 40, centerMs: 0 },
      { cpk: 1.2, n: 40, centerMs: HOUR },
      { cpk: 1.4, n: 40, centerMs: 2 * HOUR },
      { cpk: 1.6, n: 40, centerMs: 3 * HOUR },
    ],
    slopePerHour: 0.2,
  };
  const f = predictive.buildForecast(trajectory, HOUR);
  assert.strictEqual(f.type, 'FORECAST');
  assert.ok(Number.isFinite(f.next_window_cpk_estimate));
  assert.notStrictEqual(f.confidence, 'HIGH');
  assert.ok(f.confidence === 'MEDIUM' || f.confidence === 'LOW');
});

test('forecast: method text always discloses this is an extrapolation, not a fact', () => {
  const trajectory = { points: [], slopePerHour: null };
  const f = predictive.buildForecast(trajectory, HOUR);
  assert.ok(f.method.toLowerCase().includes('not a validated predictive model'));
});

// ── canonical response contract (Phase 1) ──
test('canonical response: contains every required top-level field, cleanly separating observed/calculated/forecast', () => {
  const t0 = Date.now() - HOUR;
  const values = Array.from({ length: 40 }, () => [2, 2, 2]);
  const rows = makeRows(values, 4, t0, HOUR / 40);
  const pooledValues = rows.flatMap((r) => r.values);
  const seriesValues = rows.map((r) => spc.mean(r.values));
  const seriesTimestampsMs = rows.map((r) => r.tMs);
  const cpk = spc.computeCpk({ values: pooledValues, tolerance: 4 });
  const ewma = spc.computeEwma({ values: seriesValues });
  const cusum = spc.computeCusum({ values: seriesValues });
  const nelson = spc.evaluateNelsonRules(seriesValues, spc.mean(seriesValues), spc.sampleStddev(seriesValues));
  const drift = spc.computeDriftVelocity({ values: seriesValues, timestampsMs: seriesTimestampsMs });

  const response = predictive.buildCanonicalResponse({
    deviceId: 'LDI-TEST', metric: 'PE', from: new Date(t0).toISOString(), to: new Date(t0 + HOUR).toISOString(),
    baselineDefinition: 'test fixture', sampleCount: seriesValues.length,
    lastValidSampleMs: seriesTimestampsMs[seriesTimestampsMs.length - 1], rowLimitHit: false,
    cpk, ewma, cusum, nelson, drift, rows, fromMs: t0, toMs: t0 + HOUR, tolerance: 4, nowMs: t0 + HOUR + 1000,
  });

  for (const field of ['metric', 'window', 'quality_state', 'baseline', 'observed', 'calculated', 'forecast', 'confidence', 'source_event']) {
    assert.ok(Object.prototype.hasOwnProperty.call(response, field), `missing canonical field: ${field}`);
  }
  assert.strictEqual(response.forecast.type, 'FORECAST');
  assert.ok(response.calculated.trend.capability_trajectory);
  assert.ok(response.calculated.drift);
  assert.ok(response.calculated.risk);
  assert.strictEqual(response.source_event.device_id, 'LDI-TEST');
  assert.strictEqual(response.observed.freshness, Freshness.LIVE);
});

// ── FT-23 Phase 1/2: decision hierarchy + evidence compression ──
test('buildEvidenceBullets: always exactly 5 lines (Cpk/EWMA/CUSUM/Nelson/drift), even for a clean stable process', () => {
  const values = Array.from({ length: 20 }, () => 10);
  const timestampsMs = values.map((_, i) => Date.now() + i * HOUR);
  const cpk = { cpk: 2.0, state: spc.StabilityState.CAPABLE };
  const trajectory = { classification: predictive.TrajectoryClassification.STABLE, reason: null };
  const ewma = spc.computeEwma({ values });
  const cusum = spc.computeCusum({ values });
  const nelson = [];
  const drift = spc.computeDriftVelocity({ values, timestampsMs });
  const driftIntel = predictive.computeDriftIntelligence({ ewma, cusum, nelson, drift });
  const bullets = predictive.buildEvidenceBullets({ cpk, trajectory, ewma, cusum, nelson, driftIntel });
  assert.strictEqual(bullets.length, 5);
  assert.ok(bullets.some((b) => b.includes('Cpk stable')));
  assert.ok(bullets.some((b) => b.includes('EWMA within control limits')));
  assert.ok(bullets.some((b) => b.includes('no Nelson-rule violations')));
});

test('buildContextLines: names sample count, homogeneity, and only mentions freshness when not LIVE', () => {
  const mixedBaselineClean = { heterogeneity_detected: false };
  const linesLive = predictive.buildContextLines({ sampleCount: 212, rangeLabel: '15m', mixedBaseline: mixedBaselineClean, freshness: Freshness.LIVE });
  assert.ok(linesLive.some((l) => l.includes('212 valid sample')));
  assert.ok(linesLive.some((l) => l.includes('homogeneous 15m window')));
  assert.ok(!linesLive.some((l) => l.includes('freshness')));

  const linesStale = predictive.buildContextLines({ sampleCount: 50, rangeLabel: '1h', mixedBaseline: mixedBaselineClean, freshness: Freshness.STALE });
  assert.ok(linesStale.some((l) => l.includes('freshness: STALE')));

  const mixedBaselineFlagged = { heterogeneity_detected: true };
  const linesMixed = predictive.buildContextLines({ sampleCount: 100, rangeLabel: '6h', mixedBaseline: mixedBaselineFlagged, freshness: Freshness.LIVE });
  assert.ok(linesMixed.some((l) => l.includes('possible mixed-baseline')));
});

test('buildDecisionSummary: PRIMARY SIGNAL state matches trajectory classification, next_action is the plant\'s own OCAP text', () => {
  const values = Array.from({ length: 20 }, () => 10);
  const timestampsMs = values.map((_, i) => Date.now() + i * HOUR);
  const cpk = { cpk: 0.8, state: spc.StabilityState.INTERVENTION };
  const trajectory = { classification: predictive.TrajectoryClassification.DECLINING, reason: null };
  const ewma = spc.computeEwma({ values });
  const cusum = spc.computeCusum({ values });
  const nelson = [];
  const drift = spc.computeDriftVelocity({ values, timestampsMs });
  const driftIntel = predictive.computeDriftIntelligence({ ewma, cusum, nelson, drift });
  const mixedBaseline = { heterogeneity_detected: false };
  const risk = { level: predictive.RiskLevel.HIGH, evidence: ['Cpk state: INTERVENTION'] };
  const summary = predictive.buildDecisionSummary({ cpk, trajectory, risk, ewma, cusum, nelson, driftIntel, mixedBaseline, sampleCount: 40, rangeLabel: '1h', freshness: Freshness.LIVE });
  assert.strictEqual(summary.primary_signal.subject, 'PROCESS CAPABILITY');
  assert.strictEqual(summary.primary_signal.state, 'DECLINING');
  assert.strictEqual(summary.primary_signal.risk_level, predictive.RiskLevel.HIGH);
  assert.strictEqual(summary.next_action, predictive.OCAP_NEXT_ACTION.INTERVENTION);
  assert.strictEqual(summary.secondary_evidence.length, 5);
});

// ── FT-23 Phase 4: action continuity ──
test('selectEvidenceEvent: prefers the mixed-baseline change point only when heterogeneity was actually detected', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ tMs: i, factory: '2', mo: `MO-${i}`, logId: `LOG-${i}`, process: 'LDI' }));
  const cusum = { points: [] };
  // heterogeneity_detected: false -- change_point_index alone must NOT be
  // enough (it is populated any time CUSUM signals at all, real or not
  // heterogeneous) or an ordinary shift gets mislabeled "suspected baseline
  // change-point" while mixed_baseline itself reports nothing.
  const notFlagged = predictive.selectEvidenceEvent({ rows, mixedBaseline: { heterogeneity_detected: false, change_point_index: 4 }, cusum });
  assert.strictEqual(notFlagged.reason, 'most recent sample');

  const flagged = predictive.selectEvidenceEvent({ rows, mixedBaseline: { heterogeneity_detected: true, change_point_index: 4 }, cusum });
  assert.strictEqual(flagged.mo, 'MO-4');
  assert.strictEqual(flagged.reason, 'suspected baseline change-point');
});

test('selectEvidenceEvent: falls back to the first CUSUM-signaled sample when no change-point is flagged', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ tMs: i, factory: '2', mo: `MO-${i}`, logId: `LOG-${i}`, process: 'LDI' }));
  const mixedBaseline = { change_point_index: null };
  const cusum = { points: [{ signal: 'none' }, { signal: 'none' }, { signal: 'high' }, { signal: 'high' }] };
  const event = predictive.selectEvidenceEvent({ rows, mixedBaseline, cusum });
  assert.strictEqual(event.mo, 'MO-2');
  assert.strictEqual(event.reason, 'first CUSUM-signaled sample');
});

test('selectEvidenceEvent: falls back to the most recent sample when nothing else is flagged', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ tMs: i, factory: '2', mo: `MO-${i}`, logId: `LOG-${i}`, process: 'LDI' }));
  const mixedBaseline = { change_point_index: null };
  const cusum = { points: [{ signal: 'none' }, { signal: 'none' }] };
  const event = predictive.selectEvidenceEvent({ rows, mixedBaseline, cusum });
  assert.strictEqual(event.mo, 'MO-9');
  assert.strictEqual(event.reason, 'most recent sample');
});

test('selectEvidenceEvent: null for an empty row set, never a fabricated event', () => {
  assert.strictEqual(predictive.selectEvidenceEvent({ rows: [], mixedBaseline: {}, cusum: { points: [] } }), null);
});

test('canonical response: action.exact_event/machine_snapshot_url are built from a real row when factory/mo/log_id are present', () => {
  const t0 = Date.now() - HOUR;
  const rowCount = 40;
  const values = Array.from({ length: rowCount }, () => [2, 2, 2]);
  const rows = values.map((v, i) => ({ tMs: t0 + i * (HOUR / rowCount), values: v, tolerance: 4, factory: '2', mo: 'MO-999', process: 'LDI', logId: `LOG-${i}` }));
  const pooledValues = rows.flatMap((r) => r.values);
  const seriesValues = rows.map((r) => spc.mean(r.values));
  const seriesTimestampsMs = rows.map((r) => r.tMs);
  const cpk = spc.computeCpk({ values: pooledValues, tolerance: 4 });
  const ewma = spc.computeEwma({ values: seriesValues });
  const cusum = spc.computeCusum({ values: seriesValues });
  const nelson = spc.evaluateNelsonRules(seriesValues, spc.mean(seriesValues), spc.sampleStddev(seriesValues));
  const drift = spc.computeDriftVelocity({ values: seriesValues, timestampsMs: seriesTimestampsMs });

  const response = predictive.buildCanonicalResponse({
    deviceId: 'LDI-TEST', metric: 'PE', from: new Date(t0).toISOString(), to: new Date(t0 + HOUR).toISOString(),
    baselineDefinition: 'test fixture', rangeLabel: '1h', sampleCount: seriesValues.length,
    lastValidSampleMs: seriesTimestampsMs[seriesTimestampsMs.length - 1], rowLimitHit: false,
    cpk, ewma, cusum, nelson, drift, rows, fromMs: t0, toMs: t0 + HOUR, tolerance: 4, nowMs: t0 + HOUR + 1000,
  });

  assert.ok(response.action.exact_event, 'exact_event should be populated when rows carry factory/mo/log_id');
  assert.strictEqual(response.action.exact_event.mo, 'MO-999');
  assert.strictEqual(response.action.exact_event.device_id, 'LDI-TEST');
  assert.ok(response.action.machine_snapshot_url, 'machine_snapshot_url should be built when factory/mo are real');
  assert.ok(response.action.machine_snapshot_url.startsWith('/d/ims-ldi-machine-snapshot/'));
  assert.strictEqual(response.action.related_alarms, null, 'related_alarms is filled by server.js after this pure function returns, not here');
  assert.ok(response.decision_summary);
  assert.strictEqual(response.decision_summary.secondary_evidence.length, 5);
});

// ── FT-23 Phase 5: executive summary (pure aggregation) ──
test('buildExecutiveSummary: counts risk levels and capability direction correctly', () => {
  const entries = [
    { device_id: 'LDI-01', metric: 'PE', cpk: 0.5, cpk_state: 'INTERVENTION', trajectory: 'declining', risk: 'HIGH', evidence: ['x'], drift: { direction: 'up', velocity_per_hour: 2, persistence: 'sustained' } },
    { device_id: 'LDI-02', metric: 'JE', cpk: 1.1, cpk_state: 'ASSESSMENT', trajectory: 'stable', risk: 'MEDIUM', evidence: ['y'], drift: { direction: 'flat', velocity_per_hour: 0, persistence: 'none' } },
    { device_id: 'LDI-03', metric: 'PE', cpk: 5.0, cpk_state: 'CAPABLE', trajectory: 'improving', risk: 'NONE', evidence: [], drift: { direction: 'down', velocity_per_hour: 0.1, persistence: 'transient' } },
  ];
  const summary = predictive.buildExecutiveSummary(entries, { range: '1h', from: 'a', to: 'b' });
  assert.strictEqual(summary.fleet.devices_scanned, 3);
  assert.strictEqual(summary.fleet.high_risk_count, 1);
  assert.strictEqual(summary.fleet.medium_risk_count, 1);
  assert.strictEqual(summary.capability_direction.declining, 1);
  assert.strictEqual(summary.capability_direction.improving, 1);
  assert.strictEqual(summary.capability_direction.stable, 1);
});

test('buildExecutiveSummary: highest_risks excludes NONE-risk devices and sorts HIGH before MEDIUM', () => {
  const entries = [
    { device_id: 'LDI-01', metric: 'PE', cpk: 5.0, cpk_state: 'CAPABLE', trajectory: 'stable', risk: 'NONE', evidence: [], drift: { direction: 'flat', velocity_per_hour: 0, persistence: 'none' } },
    { device_id: 'LDI-02', metric: 'JE', cpk: 1.1, cpk_state: 'ASSESSMENT', trajectory: 'stable', risk: 'MEDIUM', evidence: [], drift: { direction: 'flat', velocity_per_hour: 0, persistence: 'none' } },
    { device_id: 'LDI-03', metric: 'PE', cpk: 0.5, cpk_state: 'INTERVENTION', trajectory: 'declining', risk: 'HIGH', evidence: [], drift: { direction: 'up', velocity_per_hour: 1, persistence: 'sustained' } },
  ];
  const summary = predictive.buildExecutiveSummary(entries, { range: '1h', from: 'a', to: 'b' });
  assert.strictEqual(summary.highest_risks.length, 2);
  assert.strictEqual(summary.highest_risks[0].device_id, 'LDI-03');
  assert.strictEqual(summary.highest_risks[1].device_id, 'LDI-02');
});

test('buildExecutiveSummary: major_drift prefers sustained persistence over raw velocity magnitude', () => {
  const entries = [
    { device_id: 'LDI-01', metric: 'PE', cpk: 5.0, cpk_state: 'CAPABLE', trajectory: 'stable', risk: 'LOW', evidence: [], drift: { direction: 'up', velocity_per_hour: 10, persistence: 'transient' } },
    { device_id: 'LDI-02', metric: 'JE', cpk: 3.0, cpk_state: 'CAPABLE', trajectory: 'stable', risk: 'LOW', evidence: [], drift: { direction: 'down', velocity_per_hour: -1, persistence: 'sustained' } },
  ];
  const summary = predictive.buildExecutiveSummary(entries, { range: '1h', from: 'a', to: 'b' });
  assert.strictEqual(summary.major_drift[0].device_id, 'LDI-02', 'sustained drift should rank above a larger but transient velocity');
});

test('buildExecutiveSummary: no fake KPIs -- an empty fleet scan yields honest zeros, not invented numbers', () => {
  const summary = predictive.buildExecutiveSummary([], { range: '1h', from: 'a', to: 'b' });
  assert.strictEqual(summary.fleet.devices_scanned, 0);
  assert.strictEqual(summary.highest_risks.length, 0);
  assert.strictEqual(summary.major_drift.length, 0);
});

console.log('='.repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
