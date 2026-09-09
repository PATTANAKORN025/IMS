/**
 * FT-22 — predictive process intelligence. Pure, no I/O, same discipline as
 * lib/spc.js/analytics.js/telemetry.js.
 *
 * THIS IS NOT A NEW STATISTICS ENGINE. Every number here is composed from
 * lib/spc.js's already-verified primitives (computeCpk, computeEwma,
 * computeCusum, evaluateNelsonRules, computeDriftVelocity) -- this module
 * adds no new Cpk formula, no new control-limit math, no opaque model. What
 * it adds: (1) a canonical response shape (Phase 1) so a caller reads one
 * contract instead of five separate objects, (2) an explainable synthesis
 * of the existing drift signals into one direction/velocity/persistence
 * verdict (Phase 2), (3) Cpk(t) computed by re-running the SAME
 * spc.computeCpk over time-sliced buckets of the SAME query result already
 * fetched for /api/spc -- no extra query (Phase 3), (4) a heterogeneity
 * check built from the SAME Nelson-rule/CUSUM outputs already computed,
 * never suppressing a real violation (Phase 4), (5) a risk verdict that
 * only ever cites evidence already present in the response it sits beside
 * (Phase 5/6).
 *
 * FORECAST DISCIPLINE (this phase's own explicit rule -- "never present
 * forecasts as facts"): every forecast value carries `type: 'FORECAST'`,
 * states its method in plain text, and is capped at MEDIUM confidence --
 * never HIGH. A 5-bucket linear extrapolation over a <=6h Phase-I window is
 * not a validated predictive model; it is disclosed as exactly what it is,
 * an OLS projection of the trajectory already shown, one step past the
 * data it was fit on.
 */

'use strict';

const analytics = require('./analytics');
const spc = require('./spc');
const telemetry = require('./telemetry');

/** @readonly @enum {string} */
const RiskLevel = Object.freeze({
  NONE: 'NONE',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
});

/** @readonly @enum {string} */
const TrajectoryClassification = Object.freeze({
  STABLE: 'stable',
  IMPROVING: 'improving',
  DECLINING: 'declining',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  UNAVAILABLE: 'UNAVAILABLE',
  STALE: 'STALE',
});

// Not copied from an existing document -- LDI_SPC_GUIDE.md has no
// "how much Cpk change over a window counts as a real trend" number, because
// nothing in this codebase computed a Cpk trajectory before this phase. This
// is a new, disclosed threshold, deliberately conservative (10% relative OR
// 0.10 absolute, whichever is reached) so trajectory noise between adjacent
// buckets does not read as a false "improving"/"declining" verdict.
const TRAJECTORY_MIN_RELATIVE_CHANGE = 0.10;
const TRAJECTORY_MIN_ABSOLUTE_CHANGE = 0.10;
const CAPABILITY_TRAJECTORY_BUCKETS = 5;
const TRAJECTORY_MIN_VALID_BUCKETS = 2;

// Same 5-minute convention migration 052 already uses for
// v_ldi_machine_latest_full.is_stale (telemetry.js's own freshnessFor) --
// reused verbatim, not a second staleness number for the same plant.
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

// This codebase's own recurring control-limit convention (EWMA's L=3,
// Nelson rule 1's 3-sigma) reused as the two-sample heterogeneity threshold
// -- not a new number invented for this check.
const MIXED_BASELINE_Z_THRESHOLD = 3;

/**
 * @param {number|null} lastValidSampleMs
 * @param {number} [nowMs=Date.now()]
 * @returns {string} telemetry.Freshness member
 */
function freshnessForLastSample(lastValidSampleMs, nowMs = Date.now()) {
  if (!Number.isFinite(lastValidSampleMs)) return telemetry.Freshness.NO_DATA;
  return nowMs - lastValidSampleMs > STALE_THRESHOLD_MS ? telemetry.Freshness.STALE : telemetry.Freshness.LIVE;
}

/**
 * Worst-of precedence across the Quality enum, used to fold several
 * sub-signals' own quality into one -- UNAVAILABLE is worse than
 * INSUFFICIENT_DATA is worse than VALID. Not a new enum, just an ordering
 * over analytics.js's existing one.
 * @param {string[]} qualities
 */
function worstQuality(qualities) {
  if (qualities.includes(analytics.Quality.UNAVAILABLE)) return analytics.Quality.UNAVAILABLE;
  if (qualities.includes(analytics.Quality.INSUFFICIENT_DATA)) return analytics.Quality.INSUFFICIENT_DATA;
  return analytics.Quality.VALID;
}

// ── Phase 3: capability trajectory ──────────────────────────────────────
//
// Cpk(t): the SAME rows /api/spc already fetched, sliced into
// CAPABILITY_TRAJECTORY_BUCKETS equal time buckets across [fromMs,toMs],
// each bucket's pooled readings run through the SAME spc.computeCpk used
// for the whole-window figure. No second query -- pure re-slicing of data
// already in memory (Phase 8's own "no duplicate queries" requirement).

/**
 * @param {Object} p
 * @param {{tMs:number, values:number[], tolerance:number}[]} p.rows - per-row readings + this row's own tolerance (NaN if none)
 * @param {number} p.fromMs
 * @param {number} p.toMs
 * @param {number} [p.bucketCount=CAPABILITY_TRAJECTORY_BUCKETS]
 * @param {number} [p.nowMs=Date.now()]
 * @returns {{points: Array, classification: string, slopePerHour: number|null, reason: string|null}}
 */
function computeCapabilityTrajectory({ rows, fromMs, toMs, bucketCount = CAPABILITY_TRAJECTORY_BUCKETS, nowMs = Date.now() }) {
  const spanMs = toMs - fromMs;
  const bucketMs = spanMs / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    startMs: fromMs + i * bucketMs,
    endMs: fromMs + (i + 1) * bucketMs,
    centerMs: fromMs + (i + 0.5) * bucketMs,
    values: [],
    tolerances: [],
  }));

  let anyTolerance = false;
  for (const row of Array.isArray(rows) ? rows : []) {
    const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((row.tMs - fromMs) / bucketMs)));
    buckets[idx].values.push(...row.values.filter((v) => Number.isFinite(v)));
    if (Number.isFinite(row.tolerance)) { buckets[idx].tolerances.push(row.tolerance); anyTolerance = true; }
  }

  const points = buckets.map((b) => {
    const tolerance = b.tolerances.length > 0 ? spc.mean(b.tolerances) : NaN;
    const cpkResult = spc.computeCpk({ values: b.values, tolerance });
    return {
      bucket_start: new Date(b.startMs).toISOString(),
      bucket_end: new Date(b.endMs).toISOString(),
      n: cpkResult.n,
      cpk: cpkResult.cpk,
      quality: cpkResult.quality,
      centerMs: b.centerMs,
    };
  });

  if (!anyTolerance) {
    return { points, classification: TrajectoryClassification.UNAVAILABLE, slopePerHour: null, reason: 'no tolerance (pe_setting/je_setting) recorded anywhere in this window -- Cpk trajectory cannot be established' };
  }

  const lastRowMs = rows.length > 0 ? Math.max(...rows.map((r) => r.tMs)) : null;
  if (freshnessForLastSample(lastRowMs, nowMs) === telemetry.Freshness.STALE) {
    return { points, classification: TrajectoryClassification.STALE, slopePerHour: null, reason: `last sample is older than the ${STALE_THRESHOLD_MS / 60000}-minute staleness threshold -- trajectory reflects a process no longer reporting live` };
  }

  const valid = points.filter((p) => Number.isFinite(p.cpk));
  if (valid.length < TRAJECTORY_MIN_VALID_BUCKETS) {
    return { points, classification: TrajectoryClassification.INSUFFICIENT_DATA, slopePerHour: null, reason: `only ${valid.length} of ${bucketCount} buckets produced a valid Cpk -- too few to establish a trajectory` };
  }

  const slopePerHour = spc.linearSlopePerHour(valid.map((p) => p.cpk), valid.map((p) => p.centerMs));
  const first = valid[0].cpk;
  const last = valid[valid.length - 1].cpk;
  const delta = last - first;
  const relative = first !== 0 ? Math.abs(delta) / Math.abs(first) : Infinity;
  // BOTH bounds required, not either alone: relative-only would flag a
  // trivial float-noise wobble as "improving" whenever the baseline Cpk
  // itself is large (e.g. a near-zero-sigma process where Cpk is 20+ and a
  // 0.15 wobble is 0.7% -- still noise); absolute-only would flag a
  // relatively huge swing as meaningful when the baseline Cpk is itself
  // near zero (e.g. 0.01 -> 0.05 is a 400% relative move but a genuinely
  // tiny 0.04 Cpk-unit change). Needing both keeps the classification tied
  // to a real, human-meaningful shift in either regime.
  const meaningfulChange = relative >= TRAJECTORY_MIN_RELATIVE_CHANGE && Math.abs(delta) >= TRAJECTORY_MIN_ABSOLUTE_CHANGE;

  let classification = TrajectoryClassification.STABLE;
  if (meaningfulChange) classification = delta > 0 ? TrajectoryClassification.IMPROVING : TrajectoryClassification.DECLINING;

  return { points, classification, slopePerHour, reason: null };
}

// ── Phase 2: drift intelligence ─────────────────────────────────────────
//
// Synthesizes EWMA/CUSUM/Nelson/OLS-drift -- ALL already computed by
// lib/spc.js -- into one explainable verdict. No opaque classifier: every
// field traces to one of those four existing outputs, named explicitly in
// `evidence`.

/**
 * @param {Object} p
 * @param {ReturnType<typeof spc.computeEwma>} p.ewma
 * @param {ReturnType<typeof spc.computeCusum>} p.cusum
 * @param {ReturnType<typeof spc.evaluateNelsonRules>} p.nelson
 * @param {ReturnType<typeof spc.computeDriftVelocity>} p.drift
 */
function computeDriftIntelligence({ ewma, cusum, nelson, drift }) {
  const quality = worstQuality([ewma.quality, cusum.quality, drift.quality]);
  const evidence = [];

  // Direction: OLS slope sign, with a dead zone sized to 5% of one sigma/hour
  // so float-noise around a flat process never reads as "up"/"down" -- a new,
  // disclosed threshold (no prior document defines "flat" for a slope).
  let direction = 'unknown';
  if (Number.isFinite(drift.velocityPerHour)) {
    const sigma = Number.isFinite(ewma.sigma) ? ewma.sigma : null;
    const deadZone = sigma !== null ? 0.05 * sigma : 0;
    if (drift.velocityPerHour > deadZone) direction = 'up';
    else if (drift.velocityPerHour < -deadZone) direction = 'down';
    else direction = 'flat';
    evidence.push(`OLS drift velocity: ${drift.velocityPerHour.toFixed(4)} units/hour` + (drift.accelerating === null ? '' : drift.accelerating ? ' (accelerating)' : ' (steady or slowing)'));
  } else if (drift.reason) {
    evidence.push(`drift velocity: ${drift.reason}`);
  }

  const ewmaOutCount = ewma.points.filter((p) => p.outOfControl).length;
  if (ewmaOutCount > 0) {
    const lastOutIdx = ewma.points.map((p) => p.outOfControl).lastIndexOf(true);
    evidence.push(`EWMA: ${ewmaOutCount} of ${ewma.points.length} points beyond control limit (last at sample #${lastOutIdx + 1})`);
  }

  // Persistence: how much of the RECENT tail (last 10 points, or fewer if
  // the series is shorter) still shows a CUSUM signal -- "sustained" if most
  // of the tail is still signaling, "transient" if the signal appeared and
  // cleared, "none" if it never fired. Genuinely new synthesis (no existing
  // module answers "is this shift still happening"), built only from
  // spc.computeCusum's own already-verified output. Computed BEFORE the
  // CUSUM evidence line below so that line can state the real persistence
  // rather than always saying "sustained" regardless of outcome.
  const cusumSignals = cusum.points.filter((p) => p.signal !== 'none');
  let persistence = 'none';
  if (cusumSignals.length > 0) {
    const tailLen = Math.min(10, cusum.points.length);
    const tail = cusum.points.slice(-tailLen);
    const tailSignaling = tail.filter((p) => p.signal !== 'none').length;
    persistence = tailSignaling / tailLen >= 0.6 ? 'sustained' : 'transient';
  }

  if (cusumSignals.length > 0) {
    const firstSignalIdx = cusum.points.findIndex((p) => p.signal !== 'none');
    const kind = cusum.points[firstSignalIdx].signal;
    evidence.push(`CUSUM: ${kind} shift first signaled at sample #${firstSignalIdx + 1} (${persistence} -- ${persistence === 'sustained' ? 'still signaling in the recent tail' : 'cleared before the recent tail'})`);
  }

  for (const v of Array.isArray(nelson) ? nelson : []) {
    evidence.push(`Nelson rule ${v.rule}: ${v.name}`);
  }

  return { direction, velocity_per_hour: drift.velocityPerHour, persistence, evidence, quality_state: quality };
}

// ── Phase 4: mixed-baseline detection ───────────────────────────────────
//
// Never suppresses a real Nelson violation -- this only ADDS an honest
// "this window may not be one homogeneous process" flag alongside whatever
// violations already fired. Two independent signals, both built from
// outputs already computed elsewhere in this request (no new query, no new
// statistic beyond a two-sample z-comparison):
//  1. Nelson rules 7 AND 8 co-firing -- the exact real pattern FT-21's own
//     validation found and documented (see SPC_VALIDATION.md) as evidence
//     of a window spanning more than one real process population.
//  2. A two-sample z-test between the window's first and second half means
//     (front vs. back), flagged past this codebase's own 3-sigma
//     convention -- the same threshold Nelson rule 1 and EWMA's L already
//     use, not a new number.
// Change-point candidate: the first sample where spc.computeCusum's own
// tabular statistic crosses its decision interval -- reusing the SAME
// CUSUM output already computed for drift intelligence, not a second
// change-point algorithm.

/**
 * @param {Object} p
 * @param {number[]} p.seriesValues
 * @param {number[]} p.seriesTimestampsMs
 * @param {ReturnType<typeof spc.evaluateNelsonRules>} p.nelson
 * @param {ReturnType<typeof spc.computeCusum>} p.cusum
 */
function computeMixedBaselineSignal({ seriesValues, seriesTimestampsMs, nelson, cusum }) {
  const xs = Array.isArray(seriesValues) ? seriesValues.filter((v) => Number.isFinite(v)) : [];
  const n = xs.length;
  if (n < 4) {
    return {
      heterogeneity_detected: false, change_point_index: null, change_point_timestamp: null,
      two_sample_z: null, insufficient_homogeneous_samples: true, evidence: [],
      quality: analytics.Quality.INSUFFICIENT_DATA, reason: 'need at least 4 samples to compare sub-windows',
    };
  }

  const mid = Math.floor(n / 2);
  const front = xs.slice(0, mid);
  const back = xs.slice(mid);
  const frontMean = spc.mean(front);
  const backMean = spc.mean(back);
  const frontSigma = spc.sampleStddev(front) || 0;
  const backSigma = spc.sampleStddev(back) || 0;
  const denom = Math.sqrt((frontSigma ** 2) / front.length + (backSigma ** 2) / back.length);
  // denom===0 means BOTH halves individually have zero variance (every
  // reading in each half is identical) -- the standard z-test formula is
  // undefined there, but that is not "no evidence", it is the most extreme
  // case: two perfectly flat sub-populations at different levels is exactly
  // the step-function signature this check exists to catch. Treated as an
  // unbounded z (same sign as the mean difference) rather than silently
  // reported as null/no-signal.
  // A finite saturation value, not true Infinity -- JSON.stringify(Infinity)
  // silently becomes `null`, which would make the strongest possible
  // evidence indistinguishable from "not computed". 1e6 is far past
  // MIXED_BASELINE_Z_THRESHOLD (3) in either direction and stays a real,
  // serializable number.
  const Z_SATURATED = 1e6;
  let twoSampleZ;
  if (denom > 0) twoSampleZ = (frontMean - backMean) / denom;
  else if (frontMean === backMean) twoSampleZ = 0;
  else twoSampleZ = frontMean > backMean ? Z_SATURATED : -Z_SATURATED;

  const nelsonRule7 = (nelson || []).some((v) => v.rule === 7);
  const nelsonRule8 = (nelson || []).some((v) => v.rule === 8);
  const nelsonMixturePattern = nelsonRule7 && nelsonRule8;
  const zFlag = twoSampleZ !== null && Math.abs(twoSampleZ) > MIXED_BASELINE_Z_THRESHOLD;
  const heterogeneityDetected = nelsonMixturePattern || zFlag;

  const evidence = [];
  if (nelsonMixturePattern) evidence.push('Nelson rules 7 and 8 co-firing -- tight clustering AND spread patterns both present, the signature of two mixed process populations rather than one');
  if (zFlag) evidence.push(`front-half vs. back-half two-sample z = ${twoSampleZ.toFixed(2)} (|z| > ${MIXED_BASELINE_Z_THRESHOLD}) -- the window's mean shifted more than this codebase's own 3-sigma convention treats as noise`);

  let changePointIndex = null;
  const firstSignalIdx = cusum.points ? cusum.points.findIndex((p) => p.signal !== 'none') : -1;
  if (firstSignalIdx >= 0) changePointIndex = firstSignalIdx;

  const insufficientHomogeneousSamples = heterogeneityDetected && Math.min(front.length, back.length) < spc.MIN_SAMPLES_FOR_CONFIDENT_CPK;
  if (insufficientHomogeneousSamples) evidence.push(`each candidate homogeneous segment has fewer than ${spc.MIN_SAMPLES_FOR_CONFIDENT_CPK} samples -- a separate Cpk per segment would not itself be confident`);

  // FT-23 Phase 3: the plain-language "what is safe to conclude" text a
  // MIXED BASENLINE SUSPECTED banner needs -- deterministic, not a new
  // judgment call per window, and null when nothing was flagged (never
  // shown, never a hedge on an otherwise clean window).
  const safeInterpretation = heterogeneityDetected
    ? 'Treat the Cpk/EWMA/CUSUM figures for this window as descriptive only -- do not use them alone to authorize a line-stop or a capability sign-off until the suspected sub-populations are separated (e.g. by recipe/product change) and re-analyzed individually.'
    : null;

  return {
    heterogeneity_detected: heterogeneityDetected,
    change_point_index: changePointIndex,
    change_point_timestamp: changePointIndex !== null && seriesTimestampsMs[changePointIndex] !== undefined
      ? new Date(seriesTimestampsMs[changePointIndex]).toISOString() : null,
    two_sample_z: twoSampleZ,
    insufficient_homogeneous_samples: insufficientHomogeneousSamples,
    evidence,
    safe_interpretation: safeInterpretation,
    quality: analytics.Quality.VALID,
    reason: null,
  };
}

// ── Phase 5: risk prioritization ────────────────────────────────────────
//
// Every level below is a deterministic rule over evidence already computed
// (cpk.state, trajectory.classification, driftIntel.persistence, real
// Nelson-rule count, mixed-baseline flag) -- no opaque scoring, no weights
// tuned against data. Missing evidence (UNKNOWN Cpk, no drift signal) never
// escalates risk on its own; risk is raised only by a real signal firing,
// never by the absence of one.

/**
 * @param {Object} p
 * @param {ReturnType<typeof spc.computeCpk>} p.cpk
 * @param {string} p.trajectoryClassification
 * @param {ReturnType<typeof computeDriftIntelligence>} p.driftIntel
 * @param {ReturnType<typeof computeMixedBaselineSignal>} p.mixedBaseline
 * @param {number} p.nelsonViolationCount
 */
function assessRisk({ cpk, trajectoryClassification, driftIntel, mixedBaseline, nelsonViolationCount }) {
  const evidence = [];
  const state = cpk.state;

  if (state === spc.StabilityState.INTERVENTION) evidence.push(`Cpk state: INTERVENTION (OCAP Stage 2) -- Cpk ${Number.isFinite(cpk.cpk) ? cpk.cpk.toFixed(2) : 'n/a'} below ${spc.CPK_INTERVENTION_THRESHOLD}`);
  else if (state === spc.StabilityState.ASSESSMENT) evidence.push(`Cpk state: ASSESSMENT (OCAP Stage 1) -- Cpk ${Number.isFinite(cpk.cpk) ? cpk.cpk.toFixed(2) : 'n/a'} below ${spc.CPK_ASSESSMENT_THRESHOLD}`);

  if (trajectoryClassification === TrajectoryClassification.DECLINING) evidence.push('Capability trajectory: declining across this window');
  if (driftIntel.direction !== 'flat' && driftIntel.direction !== 'unknown') evidence.push(`Drift direction: ${driftIntel.direction} (${driftIntel.persistence})`);
  if (nelsonViolationCount > 0) evidence.push(`${nelsonViolationCount} Nelson-rule violation(s) in this window`);
  if (mixedBaseline.heterogeneity_detected) evidence.push('Possible mixed-baseline window (see mixed_baseline)');

  let level = RiskLevel.NONE;
  if (state === spc.StabilityState.INTERVENTION) {
    level = RiskLevel.HIGH;
  } else if (state === spc.StabilityState.ASSESSMENT && trajectoryClassification === TrajectoryClassification.DECLINING && driftIntel.persistence === 'sustained') {
    level = RiskLevel.HIGH;
  } else if (state === spc.StabilityState.ASSESSMENT || trajectoryClassification === TrajectoryClassification.DECLINING || mixedBaseline.heterogeneity_detected) {
    level = RiskLevel.MEDIUM;
  } else if (state === spc.StabilityState.CAPABLE && (driftIntel.direction === 'up' || driftIntel.direction === 'down' || nelsonViolationCount > 0)) {
    level = RiskLevel.LOW;
  }

  if (evidence.length === 0) evidence.push('no adverse signal found in this window\'s evidence');

  return { level, evidence };
}

// ── FT-23 Phase 1/2: decision hierarchy + evidence compression ─────────
//
// Nothing below computes a new number -- every line is a plain-language
// restatement of a field already present elsewhere in the response
// (cpk/trajectory/ewma/cusum/nelson/drift). The point is presentation, not
// analysis: PRIMARY SIGNAL / SECONDARY EVIDENCE / CONTEXT / NEXT ACTION so
// a caller (UI or otherwise) does not have to re-derive the same hierarchy
// itself, and so every rule still gets shown -- Phase 2's own "do not hide
// underlying evidence" -- rather than only the ones that fired.

// The plant's own OCAP Stage 1/2 language (docs/architecture/LDI_SPC_GUIDE.md),
// moved here from what used to be a client-side-only copy in app.js so
// there is exactly one authoritative copy of this text, not two that could
// drift apart.
const OCAP_NEXT_ACTION = Object.freeze({
  CAPABLE: 'No action needed -- process is within capability.',
  ASSESSMENT: 'OCAP Stage 1: review the control chart for a sudden shift vs. gradual drift; check RCA for correlating thermal/vacuum anomalies; tune recipe parameters.',
  INTERVENTION: 'OCAP Stage 2: process is not capable of meeting tolerance. Engineering must authorize a line stop and quarantine panels from the last 60 minutes.',
  UNKNOWN: 'No tolerance recorded for this metric, or too few samples -- Cpk cannot be established yet.',
});

/**
 * Always exactly 5 lines, one per underlying signal, present or absent --
 * "Cpk stable" is as much evidence as "Cpk declining". This is what Phase
 * 2 calls evidence compression: the same five facts a caller would
 * otherwise have to read out of cpk/trend/calculated.signals/drift
 * separately, restated as plain sentences, never filtered down to only
 * the alarming ones.
 * @param {Object} p
 * @param {ReturnType<typeof spc.computeCpk>} p.cpk
 * @param {ReturnType<typeof computeCapabilityTrajectory>} p.trajectory
 * @param {ReturnType<typeof spc.computeEwma>} p.ewma
 * @param {ReturnType<typeof spc.computeCusum>} p.cusum
 * @param {ReturnType<typeof spc.evaluateNelsonRules>} p.nelson
 * @param {ReturnType<typeof computeDriftIntelligence>} p.driftIntel
 */
function buildEvidenceBullets({ cpk, trajectory, ewma, cusum, nelson, driftIntel }) {
  const bullets = [];

  if (trajectory.classification === TrajectoryClassification.STABLE
    || trajectory.classification === TrajectoryClassification.IMPROVING
    || trajectory.classification === TrajectoryClassification.DECLINING) {
    bullets.push(`Cpk ${trajectory.classification} (currently ${Number.isFinite(cpk.cpk) ? cpk.cpk.toFixed(2) : 'n/a'}, ${cpk.state})`);
  } else {
    bullets.push(`Cpk trajectory ${trajectory.classification.toLowerCase().replace(/_/g, ' ')}${trajectory.reason ? ` -- ${trajectory.reason}` : ''}`);
  }

  const ewmaOutCount = (ewma.points || []).filter((pt) => pt.outOfControl).length;
  bullets.push(ewmaOutCount === 0
    ? 'EWMA within control limits'
    : `EWMA ${driftIntel.direction === 'down' ? 'falling' : driftIntel.direction === 'up' ? 'rising' : 'elevated'} -- ${ewmaOutCount} of ${ewma.points.length} point(s) beyond control limit`);

  const cusumSignaling = (cusum.points || []).some((pt) => pt.signal !== 'none');
  bullets.push(cusumSignaling
    ? `CUSUM shift detected (${driftIntel.persistence})`
    : 'CUSUM: no shift detected');

  bullets.push(nelson.length === 0
    ? 'no Nelson-rule violations'
    : `Nelson rule(s) ${nelson.map((v) => v.rule).join(', ')} triggered`);

  bullets.push(driftIntel.velocity_per_hour === null
    ? 'drift: not enough samples to establish a trend'
    : `drift ${driftIntel.direction} at ${Math.abs(driftIntel.velocity_per_hour).toFixed(3)} units/hour`);

  return bullets;
}

/**
 * The CONTEXT tier -- how much this assessment should be trusted, in plain
 * language, before anyone acts on the PRIMARY SIGNAL above it.
 * @param {Object} p
 * @param {number} p.sampleCount
 * @param {string} p.rangeLabel
 * @param {ReturnType<typeof computeMixedBaselineSignal>} p.mixedBaseline
 * @param {string} p.freshness
 */
function buildContextLines({ sampleCount, rangeLabel, mixedBaseline, freshness }) {
  const lines = [`${sampleCount} valid sample(s)`];
  lines.push(mixedBaseline.heterogeneity_detected
    ? `possible mixed-baseline ${rangeLabel} window (see mixed-baseline notice)`
    : `homogeneous ${rangeLabel} window (no mixed-baseline signal)`);
  if (freshness !== telemetry.Freshness.LIVE) lines.push(`data freshness: ${freshness}`);
  return lines;
}

// FT-24: a real inconsistency found during this phase's own testing (see
// DECISION_UX_VALIDATION.md) -- OCAP_NEXT_ACTION is keyed on Cpk state
// alone, so a device with a CAPABLE Cpk but an elevated risk.level (from
// declining trajectory, sustained drift, or a mixed-baseline flag -- none
// of which OCAP_NEXT_ACTION knows about) rendered "No action needed" next
// to a MEDIUM/HIGH risk badge. Never invents a NEW recommendation --
// composes the SAME OCAP text with a real, disclosed qualifier pointing
// back to the evidence already shown, only when the two would otherwise
// visibly disagree.
function buildNextActionText(cpkState, riskLevel) {
  const base = OCAP_NEXT_ACTION[cpkState] || OCAP_NEXT_ACTION.UNKNOWN;
  if (cpkState === spc.StabilityState.CAPABLE && riskLevel && riskLevel !== RiskLevel.NONE) {
    return `${base} Risk is elevated by trajectory/drift/mixed-baseline evidence above, not by Cpk itself -- review that evidence before treating "no action" as final.`;
  }
  return base;
}

/**
 * The four-tier decision hierarchy Phase 1 asks for. PRIMARY SIGNAL is
 * deliberately the only thing rendered with heavy visual weight by a UI
 * consuming this -- everything else is supporting detail, present but
 * subordinate, never competing for the same attention.
 * @param {Object} p
 * @param {ReturnType<typeof spc.computeCpk>} p.cpk
 * @param {ReturnType<typeof computeCapabilityTrajectory>} p.trajectory
 * @param {ReturnType<typeof assessRisk>} p.risk
 * @param {ReturnType<typeof spc.computeEwma>} p.ewma
 * @param {ReturnType<typeof spc.computeCusum>} p.cusum
 * @param {ReturnType<typeof spc.evaluateNelsonRules>} p.nelson
 * @param {ReturnType<typeof computeDriftIntelligence>} p.driftIntel
 * @param {ReturnType<typeof computeMixedBaselineSignal>} p.mixedBaseline
 * @param {number} p.sampleCount
 * @param {string} p.rangeLabel
 * @param {string} p.freshness
 */
function buildDecisionSummary({ cpk, trajectory, risk, ewma, cusum, nelson, driftIntel, mixedBaseline, sampleCount, rangeLabel, freshness }) {
  const stateForDisplay = trajectory.classification === TrajectoryClassification.STABLE
    || trajectory.classification === TrajectoryClassification.IMPROVING
    || trajectory.classification === TrajectoryClassification.DECLINING
    ? trajectory.classification.toUpperCase()
    : trajectory.classification; // INSUFFICIENT_DATA / UNAVAILABLE / STALE are already display-ready

  return {
    primary_signal: { subject: 'PROCESS CAPABILITY', state: stateForDisplay, risk_level: risk.level },
    secondary_evidence: buildEvidenceBullets({ cpk, trajectory, ewma, cusum, nelson, driftIntel }),
    context: buildContextLines({ sampleCount, rangeLabel, mixedBaseline, freshness }),
    next_action: buildNextActionText(cpk.state, risk.level),
  };
}

// ── FT-23 Phase 4: action continuity ────────────────────────────────────
//
// Picks ONE real row from the same rows[] fetchSpcSeries() already
// fetched -- never an invented or averaged event -- to be "the" exact
// event a finding drills down to. Preference order is itself evidence-
// driven, not arbitrary: the moment a suspected baseline split occurred is
// more actionable than "the most recent sample" when one was found; the
// moment a sustained shift began is the next most useful; a stable window
// with nothing to investigate falls back to the freshest observation.

/**
 * @param {Object} p
 * @param {{tMs:number, factory:string|null, mo:string|null, logId:string|null, process:string|null}[]} p.rows
 * @param {ReturnType<typeof computeMixedBaselineSignal>} p.mixedBaseline
 * @param {ReturnType<typeof spc.computeCusum>} p.cusum
 * @returns {{tMs:number, factory:string|null, mo:string|null, logId:string|null, process:string|null, reason:string}|null}
 */
function selectEvidenceEvent({ rows, mixedBaseline, cusum }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // change_point_index is populated by computeMixedBaselineSignal any time
  // CUSUM signals at all (it is also the source for the SAME first-signal
  // index the fallback branch below would find on its own) -- it is only
  // real evidence of a SUSPECTED BASELINE split when heterogeneity_detected
  // is actually true. Without this guard, a window with an ordinary,
  // non-heterogeneous CUSUM shift would be mislabeled "suspected baseline
  // change-point" even though mixed_baseline itself reports no such thing.
  if (mixedBaseline && mixedBaseline.heterogeneity_detected && mixedBaseline.change_point_index !== null && rows[mixedBaseline.change_point_index]) {
    return { ...rows[mixedBaseline.change_point_index], reason: 'suspected baseline change-point' };
  }
  const firstSignalIdx = cusum && cusum.points ? cusum.points.findIndex((pt) => pt.signal !== 'none') : -1;
  if (firstSignalIdx >= 0 && rows[firstSignalIdx]) {
    return { ...rows[firstSignalIdx], reason: 'first CUSUM-signaled sample' };
  }
  return { ...rows[rows.length - 1], reason: 'most recent sample' };
}

// ── FT-23 Phase 5: executive summary (pure aggregation) ─────────────────
//
// Takes ranking entries already computed by server.js's per-device risk
// scan (one per device+metric, itself built from lib/spc.js/this module's
// own already-verified functions) and aggregates them -- counts and
// top-N selection only, no new metric, no invented KPI. `entries` is
// expected to carry {device_id, metric, cpk_state, cpk, trajectory, risk,
// evidence, drift:{direction, velocity_per_hour, persistence}}.

const RISK_ORDER = Object.freeze({ HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 });

/**
 * @param {Array} entries
 * @param {{range:string, from:string, to:string}} window
 */
function buildExecutiveSummary(entries, window) {
  const list = Array.isArray(entries) ? entries : [];

  const fleet = { devices_scanned: new Set(list.map((e) => e.device_id)).size, high_risk_count: 0, medium_risk_count: 0, low_risk_count: 0 };
  const capabilityDirection = { declining: 0, improving: 0, stable: 0, unknown: 0 };
  for (const e of list) {
    if (e.risk === 'HIGH') fleet.high_risk_count++;
    else if (e.risk === 'MEDIUM') fleet.medium_risk_count++;
    else if (e.risk === 'LOW') fleet.low_risk_count++;
    if (e.trajectory === TrajectoryClassification.DECLINING) capabilityDirection.declining++;
    else if (e.trajectory === TrajectoryClassification.IMPROVING) capabilityDirection.improving++;
    else if (e.trajectory === TrajectoryClassification.STABLE) capabilityDirection.stable++;
    else capabilityDirection.unknown++;
  }

  const highestRisks = [...list]
    .filter((e) => e.risk !== 'NONE')
    .sort((a, b) => (RISK_ORDER[b.risk] - RISK_ORDER[a.risk])
      || ((Number.isFinite(a.cpk) ? a.cpk : Infinity) - (Number.isFinite(b.cpk) ? b.cpk : Infinity)))
    .slice(0, 5)
    .map((e) => ({
      device_id: e.device_id, metric: e.metric, risk: e.risk, cpk: e.cpk, cpk_state: e.cpk_state,
      trajectory: e.trajectory, evidence: e.evidence,
      // FT-24 Phase 3: "machine/process/sample quality/next action" for the
      // Command Center's own risk cards -- already computed by the fleet
      // scan, never a second per-risk fetch. Optional-chained so this
      // still works if a caller (e.g. an older test fixture) passes
      // entries without these fields.
      factory: e.factory ?? null, process: e.process ?? null, sample_quality: e.sample_quality ?? null,
      last_valid_sample: e.last_valid_sample ?? null, next_action: e.next_action ?? null,
      mixed_baseline_detected: e.mixed_baseline_detected ?? false,
    }));

  const majorDrift = [...list]
    .filter((e) => e.drift && Number.isFinite(e.drift.velocity_per_hour) && e.drift.direction !== 'flat')
    .sort((a, b) => {
      const aSustained = a.drift.persistence === 'sustained' ? 1 : 0;
      const bSustained = b.drift.persistence === 'sustained' ? 1 : 0;
      if (aSustained !== bSustained) return bSustained - aSustained;
      return Math.abs(b.drift.velocity_per_hour) - Math.abs(a.drift.velocity_per_hour);
    })
    .slice(0, 3)
    .map((e) => ({ device_id: e.device_id, metric: e.metric, direction: e.drift.direction, velocity_per_hour: e.drift.velocity_per_hour, persistence: e.drift.persistence }));

  return {
    generated_at: new Date().toISOString(),
    window,
    fleet,
    highest_risks: highestRisks,
    capability_direction: capabilityDirection,
    major_drift: majorDrift,
  };
}

// ── Forecast ─────────────────────────────────────────────────────────
//
// A single OLS extrapolation, one bucket-width past the data already shown
// in capability_trajectory -- never labeled anything but FORECAST, never
// above MEDIUM confidence, always names its own method so nobody mistakes
// it for an observed or calculated fact (this phase's own explicit rule).

/**
 * @param {ReturnType<typeof computeCapabilityTrajectory>} trajectory
 * @param {number} bucketMs
 */
function buildForecast(trajectory, bucketMs) {
  const method = 'linear extrapolation (OLS) of the capability trajectory shown above, one bucket-width ahead -- not a validated predictive model';
  const valid = (trajectory.points || []).filter((p) => Number.isFinite(p.cpk));
  if (valid.length < 3 || trajectory.slopePerHour === null) {
    return { type: 'FORECAST', next_window_cpk_estimate: null, method, confidence: 'UNAVAILABLE', reason: `fewer than 3 valid capability-trajectory points to extrapolate from (have ${valid.length})` };
  }
  const lastPoint = valid[valid.length - 1];
  const hoursAhead = bucketMs / 3600000;
  const estimate = lastPoint.cpk + trajectory.slopePerHour * hoursAhead;
  const allBucketsSufficient = valid.every((p) => p.n >= spc.MIN_SAMPLES_FOR_CONFIDENT_CPK);
  const confidence = valid.length >= 4 && allBucketsSufficient ? 'MEDIUM' : 'LOW';
  return { type: 'FORECAST', next_window_cpk_estimate: estimate, method, confidence, reason: null };
}

// ── Phase 1: canonical contract ─────────────────────────────────────────
//
// One response shape. Reuses lib/spc.js's own field names wherever a field
// means the same thing (baseline_definition, quality, reason) rather than
// renaming for its own sake.

/**
 * @param {Object} p - everything needed to assemble the canonical response; no I/O.
 */
function buildCanonicalResponse(p) {
  const {
    deviceId, metric, from, to, baselineDefinition, rangeLabel = 'custom range',
    sampleCount, lastValidSampleMs, rowLimitHit,
    cpk, ewma, cusum, nelson, drift, rows, fromMs, toMs, nowMs = Date.now(),
  } = p;

  const bucketMs = (toMs - fromMs) / CAPABILITY_TRAJECTORY_BUCKETS;
  const trajectory = computeCapabilityTrajectory({ rows, fromMs, toMs, nowMs });
  const driftIntel = computeDriftIntelligence({ ewma, cusum, nelson, drift });
  const mixedBaseline = computeMixedBaselineSignal({
    seriesValues: rows.map((r) => spc.mean(r.values)).filter((v) => v !== null),
    seriesTimestampsMs: rows.map((r) => r.tMs),
    nelson,
    cusum,
  });
  const risk = assessRisk({ cpk, trajectoryClassification: trajectory.classification, driftIntel, mixedBaseline, nelsonViolationCount: nelson.length });
  const forecast = buildForecast(trajectory, bucketMs);
  const freshness = freshnessForLastSample(lastValidSampleMs, nowMs);

  const confidenceReasons = [];
  let confidenceLevel = 'HIGH';
  if (cpk.quality !== analytics.Quality.VALID) { confidenceLevel = 'LOW'; confidenceReasons.push(`Cpk quality is ${cpk.quality}`); }
  if (freshness === telemetry.Freshness.STALE) { confidenceLevel = 'LOW'; confidenceReasons.push('last sample is stale'); }
  if (mixedBaseline.heterogeneity_detected) { confidenceLevel = 'LOW'; confidenceReasons.push('possible mixed-baseline window'); }
  if (confidenceLevel === 'HIGH' && trajectory.points.filter((pt) => Number.isFinite(pt.cpk)).length < 3) { confidenceLevel = 'MEDIUM'; confidenceReasons.push('fewer than 3 valid capability-trajectory buckets'); }
  if (confidenceReasons.length === 0) confidenceReasons.push('sufficient samples, live data, no heterogeneity detected');

  const decisionSummary = buildDecisionSummary({ cpk, trajectory, risk, ewma, cusum, nelson, driftIntel, mixedBaseline, sampleCount, rangeLabel, freshness });

  // FT-23 Phase 4: ONE real row from rows[] -- never invented, never
  // averaged -- picked by selectEvidenceEvent's own evidence-driven
  // preference order. machine_snapshot_url reuses telemetry.js's own
  // buildDrillDownUrl (the SAME builder the alarm/RCA pipeline already
  // uses), not a second URL scheme -- device_id/factory/mo/log_id/time
  // here come directly from a real ldi_data row, with no CAD-to-IMS
  // mapping ambiguity involved (unlike the alarm pipeline's own physical-
  // asset eligibility gate, which answers a different question this
  // route never asks).
  const evidenceEvent = selectEvidenceEvent({ rows, mixedBaseline, cusum });
  const machineSnapshotUrl = evidenceEvent
    ? telemetry.buildDrillDownUrl({
      machineId: deviceId,
      factory: evidenceEvent.factory,
      mo: evidenceEvent.mo,
      eventTimeMs: evidenceEvent.tMs,
      logId: evidenceEvent.logId,
      from,
      to,
    })
    : null;

  return {
    metric,
    window: { from, to, sample_count: sampleCount },
    quality_state: cpk.quality,
    baseline: { definition: baselineDefinition, mean: cpk.mean, stddev: cpk.stddev, tolerance: Number.isFinite(p.tolerance) ? p.tolerance : null },
    observed: {
      last_valid_sample: lastValidSampleMs !== null ? new Date(lastValidSampleMs).toISOString() : null,
      freshness,
      row_limit_hit: rowLimitHit,
    },
    calculated: {
      cpk,
      control_limits: {
        ewma: { target: ewma.target, sigma: ewma.sigma, ucl: ewma.points.length ? ewma.points[0].ucl : null, lcl: ewma.points.length ? ewma.points[0].lcl : null },
        cusum: { target: cusum.target, sigma: cusum.sigma, k: cusum.k, h: cusum.h },
      },
      signals: { nelson_violations: nelson, cusum_points: cusum.points, ewma_points: ewma.points },
      trend: { capability_trajectory: trajectory },
      drift: driftIntel,
      mixed_baseline: mixedBaseline,
      risk,
    },
    forecast,
    confidence: { level: confidenceLevel, reasons: confidenceReasons },
    decision_summary: decisionSummary,
    action: {
      exact_event: evidenceEvent ? {
        device_id: deviceId,
        factory: evidenceEvent.factory,
        mo: evidenceEvent.mo,
        process: evidenceEvent.process,
        timestamp: new Date(evidenceEvent.tMs).toISOString(),
        log_id: evidenceEvent.logId,
        from,
        to,
        selection_reason: evidenceEvent.reason,
      } : null,
      machine_snapshot_url: machineSnapshotUrl,
      // Filled in by server.js after this pure function returns -- a real
      // DB correlation (the SAME queryAlarmHistory() the existing alarm/RCA
      // pipeline already uses), never fabricated here.
      related_alarms: null,
    },
    source_event: {
      device_id: deviceId,
      metric,
      table: 'public.ldi_data',
      rows_scanned: sampleCount,
      last_row_time: lastValidSampleMs !== null ? new Date(lastValidSampleMs).toISOString() : null,
    },
  };
}

module.exports = {
  RiskLevel,
  TrajectoryClassification,
  STALE_THRESHOLD_MS,
  CAPABILITY_TRAJECTORY_BUCKETS,
  TRAJECTORY_MIN_RELATIVE_CHANGE,
  TRAJECTORY_MIN_ABSOLUTE_CHANGE,
  MIXED_BASELINE_Z_THRESHOLD,
  freshnessForLastSample,
  worstQuality,
  computeCapabilityTrajectory,
  computeDriftIntelligence,
  computeMixedBaselineSignal,
  assessRisk,
  OCAP_NEXT_ACTION,
  buildNextActionText,
  buildEvidenceBullets,
  buildContextLines,
  buildDecisionSummary,
  selectEvidenceEvent,
  RISK_ORDER,
  buildExecutiveSummary,
  buildForecast,
  buildCanonicalResponse,
};
