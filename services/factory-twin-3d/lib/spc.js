/**
 * FT-21 — process stability analytics (Cpk, EWMA, CUSUM, Nelson rules,
 * drift velocity). Pure, no I/O, same discipline as lib/mapping.js,
 * lib/telemetry.js, lib/analytics.js.
 *
 * CPK IS NOT A NEW FORMULA. `docs/architecture/LDI_SPC_GUIDE.md` already
 * documents this exact formula, independently reimplemented 5 times
 * (3 dashboard panels, 2 DB views) with a real, disclosed drift risk
 * ("nothing structurally prevents one silently drifting from the
 * others"). computeCpk() below reproduces the SAME math those five
 * places use -- pooled mean/STDDEV_SAMP over every unpivoted PE/JE
 * sample, tolerance averaged over the window, LEAST() of the two-sided
 * capability -- verified byte-for-byte against
 * tests/e2e/golden-dataset-spc.js's own hand-computed fixture (same
 * PE_VALUES/JE_VALUES/PE_SETTING/JE_SETTING, same expected numbers) in
 * this module's own unit test. This is a 6th instance of an already
 * 5-times-duplicated formula, not a 6th DIFFERENT one -- unavoidable
 * since a Grafana panel query cannot import a Node.js module, and worth
 * exactly that much scrutiny, no more: nothing here changes what Cpk
 * MEANS, only adds real capability (EWMA/CUSUM/Nelson rules/drift
 * velocity) that exists NOWHERE else in this codebase.
 *
 * SAMPLE-SUFFICIENCY THRESHOLD (n<30 = not enough to trust): not
 * invented for this module -- copied from Machine Snapshot panel 9's own
 * "Confidence" column (`CASE WHEN worst_cpk IS NULL THEN 'NO_DATA' WHEN
 * COALESCE(worst_n,0)<30 THEN 'LOW SAMPLE (n<30)' ELSE 'OK' END`), the
 * plant's own existing, already-shipped threshold for "is this Cpk
 * trustworthy". Reused via analytics.classifyQuality(), never a second,
 * different number.
 */

'use strict';

const analytics = require('./analytics');

/** @readonly @enum {string} */
const StabilityState = Object.freeze({
  // Mirrors docs/architecture/LDI_SPC_GUIDE.md's own OCAP stage names --
  // not a generic Normal/Warning/Critical traffic light invented for this
  // module. CAPABLE / ASSESSMENT / INTERVENTION are the plant's own words
  // for what a Cpk value means and what an engineer does about it.
  CAPABLE: 'CAPABLE', // Cpk >= 1.33
  ASSESSMENT: 'ASSESSMENT', // 1.0 <= Cpk < 1.33 -- OCAP Stage 1
  INTERVENTION: 'INTERVENTION', // Cpk < 1.0 -- OCAP Stage 2, line-stop territory
  UNKNOWN: 'UNKNOWN', // Cpk could not be computed (see quality/reason instead)
});

const CPK_ASSESSMENT_THRESHOLD = 1.33; // LDI_SPC_GUIDE.md "Warning Limit"
const CPK_INTERVENTION_THRESHOLD = 1.0; // LDI_SPC_GUIDE.md "Control Limit Violation"
const MIN_SAMPLES_FOR_CONFIDENT_CPK = 30; // Machine Snapshot panel 9's own "LOW SAMPLE" cutoff

// The real column names, straight from Machine Snapshot panel 9's own
// LATERAL VALUES unpivot -- not a second list that could drift from the
// query server.js builds against them.
const PE_COLUMNS = Object.freeze(['pe_1', 'pe_2', 'pe_3', 'pe_4', 'pe_5', 'pe_6']);
const JE_COLUMNS = Object.freeze(['je_1', 'je_2', 'je_3', 'je_4']);

// PE and JE are composite metrics (6 and 4 real columns respectively,
// pooled) -- a caller asks for 'PE' or 'JE', never a single pe_3 column
// directly, matching how every existing Cpk panel treats them. Every
// other metric this endpoint accepts is a real, existing AVG_METRICS
// column (analytics.js) with no tolerance column in this schema, so Cpk
// is UNAVAILABLE for those -- never a fabricated spec limit.
const SPC_COMPOSITE_METRICS = Object.freeze(['PE', 'JE']);

/** @param {string} metric */
function isValidSpcMetric(metric) {
  return SPC_COMPOSITE_METRICS.includes(metric) || analytics.isValidMetric(metric);
}

/** @param {number[]} xs */
function mean(xs) {
  if (!Array.isArray(xs) || xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Sample standard deviation -- STDDEV_SAMP semantics (n-1 denominator),
 * the same function every one of the 5 existing Cpk implementations uses
 * (never STDDEV_POP). Undefined for n<2, same as Postgres's own
 * STDDEV_SAMP, which this module's callers already treat as "cannot
 * compute a spread from one point," not as zero.
 * @param {number[]} xs
 */
function sampleStddev(xs) {
  if (!Array.isArray(xs) || xs.length < 2) return null;
  const m = mean(xs);
  const sumSq = xs.reduce((a, x) => a + (x - m) ** 2, 0);
  return Math.sqrt(sumSq / (xs.length - 1));
}

/**
 * The plant's own OCAP stage for a Cpk value -- not a new severity
 * vocabulary, the one docs/architecture/LDI_SPC_GUIDE.md already
 * documents and monitoring/grafana/provisioning/alerting/ldi-rules.yml
 * already alerts on.
 * @param {number|null} cpk
 * @returns {StabilityState}
 */
function stabilityStateForCpk(cpk) {
  if (!Number.isFinite(cpk)) return StabilityState.UNKNOWN;
  if (cpk < CPK_INTERVENTION_THRESHOLD) return StabilityState.INTERVENTION;
  if (cpk < CPK_ASSESSMENT_THRESHOLD) return StabilityState.ASSESSMENT;
  return StabilityState.CAPABLE;
}

/**
 * Cpk/Cp for one pooled sample set against one tolerance, reproducing
 * Machine Snapshot panel 9's own pe_stats/pe_capability CTE math exactly:
 * mean/STDDEV_SAMP pooled over every unpivoted sample, tolerance as the
 * caller's own (already-averaged, e.g. AVG(pe_setting)) representative
 * value for the window. NULLIF(3*stddev,0) semantics preserved -- a
 * zero-variance process (every sample identical) yields cp/cpk = null,
 * never Infinity.
 *
 * @param {Object} p
 * @param {number[]} p.values - every individual PE/JE reading in the window (already unpivoted)
 * @param {number} p.tolerance - the representative spec limit (AVG(pe_setting) over the same window)
 * @param {number} [p.minSamplesForValid=MIN_SAMPLES_FOR_CONFIDENT_CPK]
 * @returns {{cp: number|null, cpk: number|null, mean: number|null, stddev: number|null, n: number, quality: string, state: StabilityState, reason: string|null}}
 */
function computeCpk({ values, tolerance, minSamplesForValid = MIN_SAMPLES_FOR_CONFIDENT_CPK }) {
  const xs = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];
  const n = xs.length;
  const metricSupported = Number.isFinite(tolerance);
  const quality = analytics.classifyQuality({ metricSupported, sampleCount: n, minSamplesForValid });

  if (!metricSupported) {
    return { cp: null, cpk: null, mean: null, stddev: null, n, quality, state: StabilityState.UNKNOWN, reason: 'no tolerance (pe_setting/je_setting) recorded for this window' };
  }
  const m = mean(xs);
  const s = sampleStddev(xs);
  const denom = s !== null && s > 0 ? 3 * s : null;
  const cp = denom !== null ? tolerance / denom : null;
  const cpk = denom !== null && m !== null ? Math.min((tolerance - m) / denom, (m + tolerance) / denom) : null;
  const state = stabilityStateForCpk(cpk);

  let reason = null;
  if (n === 0) reason = 'no samples in this window';
  else if (n < minSamplesForValid) reason = `only ${n} of ${minSamplesForValid} minimum samples in this window`;
  else if (s === 0) reason = 'zero variance -- every sample identical, sigma is undefined for Cpk';

  return { cp, cpk, mean: m, stddev: s, n, quality, state, reason };
}

/**
 * Worst-of-two-measurements Cpk, matching Machine Snapshot panel 9's own
 * `CASE WHEN cpk_pe IS NULL THEN cpk_je WHEN cpk_je IS NULL THEN cpk_pe
 * ELSE LEAST(cpk_pe,cpk_je) END` exactly -- the more constrained
 * measurement wins, an average never does.
 * @param {ReturnType<typeof computeCpk>} pe
 * @param {ReturnType<typeof computeCpk>} je
 */
function worstCpk(pe, je) {
  if (pe.cpk === null) return je;
  if (je.cpk === null) return pe;
  return pe.cpk <= je.cpk ? pe : je;
}

// ── EWMA (Exponentially Weighted Moving Average) ───────────────────────
//
// Genuinely new to this codebase -- none of the 5 existing Cpk
// implementations compute a smoothed trend or a small-shift-sensitive
// control limit; they answer "is the process capable right now," not
// "is it drifting." Standard formula (Montgomery, Introduction to
// Statistical Quality Control): z_0 = target, z_i = lambda*x_i +
// (1-lambda)*z_{i-1}; steady-state control limits target +/-
// L*sigma*sqrt(lambda/(2-lambda)), the asymptotic form used once enough
// points have passed that the startup transient is negligible -- the
// same simplification most SPC references and software use rather than
// the exact time-varying limit, and disclosed here rather than silently
// assumed.

const EWMA_DEFAULT_LAMBDA = 0.2; // Montgomery's own commonly-cited default (0.05-0.25 typical range)
const EWMA_DEFAULT_L = 3; // 3-sigma-equivalent, matching this codebase's own control-limit convention elsewhere

/**
 * @param {Object} p
 * @param {number[]} p.values - time-ordered
 * @param {number} [p.target] - baseline/reference mean; defaults to the series' own mean when omitted
 * @param {number} [p.lambda=0.2]
 * @param {number} [p.L=3]
 * @returns {{points: {value:number, z:number, ucl:number, lcl:number, outOfControl:boolean}[], target: number|null, sigma: number|null, quality: string, reason: string|null}}
 */
function computeEwma({ values, target, lambda = EWMA_DEFAULT_LAMBDA, L = EWMA_DEFAULT_L }) {
  const xs = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];
  const n = xs.length;
  const quality = analytics.classifyQuality({ metricSupported: true, sampleCount: n, minSamplesForValid: 2 });
  if (n < 2) {
    return { points: [], target: null, sigma: null, quality, reason: n === 0 ? 'no samples in this window' : 'need at least 2 samples to establish sigma' };
  }
  const sigma = sampleStddev(xs);
  const mu0 = Number.isFinite(target) ? target : mean(xs);
  const width = sigma !== null && sigma > 0 ? L * sigma * Math.sqrt(lambda / (2 - lambda)) : 0;
  const ucl = mu0 + width;
  const lcl = mu0 - width;

  let z = mu0;
  const points = xs.map((x) => {
    z = lambda * x + (1 - lambda) * z;
    return { value: x, z, ucl, lcl, outOfControl: z > ucl || z < lcl };
  });
  return { points, target: mu0, sigma, quality, reason: null };
}

// ── CUSUM (tabular, two-sided) ──────────────────────────────────────────
//
// Also new to this codebase. Detects a small, sustained shift EWMA/Cpk
// alone would take longer to surface -- the "gradual drift" question
// LDI_SPC_GUIDE.md's own OCAP Stage 1 asks an engineer to answer by eye
// from a chart ("Is it a sudden shift or a gradual drift?"); this gives
// a real, computed answer to that same question.
//
// Standard tabular form (Montgomery): k = allowance (half the shift
// worth detecting, conventionally 0.5*sigma), h = decision interval
// (conventionally 4-5*sigma). C+/C- reset is NOT applied here (the
// classic FIR/reset-to-zero variant) -- the running C+/C- themselves are
// returned so a caller can see the accumulation, not just a single
// "in/out of control" bit.

const CUSUM_DEFAULT_K_SIGMAS = 0.5;
const CUSUM_DEFAULT_H_SIGMAS = 4;

/**
 * @param {Object} p
 * @param {number[]} p.values - time-ordered
 * @param {number} [p.target]
 * @param {number} [p.kSigmas=0.5]
 * @param {number} [p.hSigmas=4]
 * @returns {{points: {value:number, cPlus:number, cMinus:number, signal:('none'|'high'|'low')}[], target:number|null, sigma:number|null, k:number|null, h:number|null, quality:string, reason:string|null}}
 */
function computeCusum({ values, target, kSigmas = CUSUM_DEFAULT_K_SIGMAS, hSigmas = CUSUM_DEFAULT_H_SIGMAS }) {
  const xs = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];
  const n = xs.length;
  const quality = analytics.classifyQuality({ metricSupported: true, sampleCount: n, minSamplesForValid: 2 });
  if (n < 2) {
    return { points: [], target: null, sigma: null, k: null, h: null, quality, reason: n === 0 ? 'no samples in this window' : 'need at least 2 samples to establish sigma' };
  }
  const sigma = sampleStddev(xs);
  const mu0 = Number.isFinite(target) ? target : mean(xs);
  const k = sigma !== null ? kSigmas * sigma : null;
  const h = sigma !== null ? hSigmas * sigma : null;

  let cPlus = 0;
  let cMinus = 0;
  const points = xs.map((x) => {
    if (k !== null) {
      cPlus = Math.max(0, cPlus + (x - mu0 - k));
      cMinus = Math.max(0, cMinus + (mu0 - x - k));
    }
    let signal = 'none';
    if (h !== null) {
      if (cPlus > h) signal = 'high';
      else if (cMinus > h) signal = 'low';
    }
    return { value: x, cPlus, cMinus, signal };
  });
  return { points, target: mu0, sigma, k, h, quality, reason: null };
}

// ── Nelson rules ─────────────────────────────────────────────────────
//
// The classic 8 rules (Nelson, 1984), evaluated against a baseline
// mean/sigma the caller supplies (the same window's own pooled mean/
// stddev by default, matching how Cpk above establishes its baseline --
// one baseline definition, not two competing ones in the same module).
// Genuinely new: nothing in this codebase currently scores a series
// against these patterns.

/**
 * @param {number[]} xs
 * @param {number} mu
 * @param {number} sigma
 * @returns {{rule: number, name: string, indices: number[]}[]}
 */
function evaluateNelsonRules(xs, mu, sigma) {
  const violations = [];
  const n = xs.length;
  if (!Number.isFinite(mu) || !Number.isFinite(sigma) || sigma <= 0 || n === 0) return violations;

  const z = xs.map((x) => (x - mu) / sigma); // in sigma units, signed

  // Rule 1: any single point beyond 3 sigma.
  const r1 = [];
  z.forEach((v, i) => { if (Math.abs(v) > 3) r1.push(i); });
  if (r1.length) violations.push({ rule: 1, name: '1 point beyond 3-sigma', indices: r1 });

  // Rule 2: 9+ points in a row on the same side of the mean.
  const r2 = new Set();
  for (let i = 0; i + 9 <= n; i++) {
    const window = z.slice(i, i + 9);
    if (window.every((v) => v > 0) || window.every((v) => v < 0)) {
      for (let j = i; j < i + 9; j++) r2.add(j);
    }
  }
  if (r2.size) violations.push({ rule: 2, name: '9 points in a row on one side of the mean', indices: [...r2].sort((a, b) => a - b) });

  // Rule 3: 6+ points in a row steadily increasing or decreasing.
  const r3 = new Set();
  for (let i = 0; i + 6 <= n; i++) {
    const window = xs.slice(i, i + 6);
    let up = true;
    let down = true;
    for (let j = 1; j < window.length; j++) {
      if (!(window[j] > window[j - 1])) up = false;
      if (!(window[j] < window[j - 1])) down = false;
    }
    if (up || down) for (let j = i; j < i + 6; j++) r3.add(j);
  }
  if (r3.size) violations.push({ rule: 3, name: '6 points in a row steadily trending', indices: [...r3].sort((a, b) => a - b) });

  // Rule 4: 14+ points in a row alternating up/down.
  const r4 = new Set();
  for (let i = 0; i + 14 <= n; i++) {
    const window = xs.slice(i, i + 14);
    let alternating = true;
    for (let j = 2; j < window.length; j++) {
      const prevUp = window[j - 1] > window[j - 2];
      const thisUp = window[j] > window[j - 1];
      if (prevUp === thisUp) { alternating = false; break; }
    }
    if (alternating) for (let j = i; j < i + 14; j++) r4.add(j);
  }
  if (r4.size) violations.push({ rule: 4, name: '14 points in a row alternating up and down', indices: [...r4].sort((a, b) => a - b) });

  // Rule 5: 2 of 3 consecutive points beyond 2-sigma, same side.
  const r5 = new Set();
  for (let i = 0; i + 3 <= n; i++) {
    const window = z.slice(i, i + 3);
    const highCount = window.filter((v) => v > 2).length;
    const lowCount = window.filter((v) => v < -2).length;
    if (highCount >= 2 || lowCount >= 2) for (let j = i; j < i + 3; j++) r5.add(j);
  }
  if (r5.size) violations.push({ rule: 5, name: '2 of 3 points beyond 2-sigma, same side', indices: [...r5].sort((a, b) => a - b) });

  // Rule 6: 4 of 5 consecutive points beyond 1-sigma, same side.
  const r6 = new Set();
  for (let i = 0; i + 5 <= n; i++) {
    const window = z.slice(i, i + 5);
    const highCount = window.filter((v) => v > 1).length;
    const lowCount = window.filter((v) => v < -1).length;
    if (highCount >= 4 || lowCount >= 4) for (let j = i; j < i + 5; j++) r6.add(j);
  }
  if (r6.size) violations.push({ rule: 6, name: '4 of 5 points beyond 1-sigma, same side', indices: [...r6].sort((a, b) => a - b) });

  // Rule 7: 15+ points in a row within 1-sigma of the mean (either side)
  // -- reduced variability, itself a real signal (understated sigma,
  // stratified/mixed sampling), not "extra stable and therefore fine".
  const r7 = new Set();
  for (let i = 0; i + 15 <= n; i++) {
    const window = z.slice(i, i + 15);
    if (window.every((v) => Math.abs(v) < 1)) for (let j = i; j < i + 15; j++) r7.add(j);
  }
  if (r7.size) violations.push({ rule: 7, name: '15 points in a row within 1-sigma of the mean', indices: [...r7].sort((a, b) => a - b) });

  // Rule 8: 8+ points in a row beyond 1-sigma, none within it (either side).
  const r8 = new Set();
  for (let i = 0; i + 8 <= n; i++) {
    const window = z.slice(i, i + 8);
    if (window.every((v) => Math.abs(v) > 1)) for (let j = i; j < i + 8; j++) r8.add(j);
  }
  if (r8.size) violations.push({ rule: 8, name: '8 points in a row beyond 1-sigma, none within it', indices: [...r8].sort((a, b) => a - b) });

  return violations;
}

// ── Drift velocity ──────────────────────────────────────────────────
//
// Ordinary least-squares slope of value against elapsed time, reported
// in units-per-hour -- a real, standard, textbook trend estimate, not an
// invented heuristic. "Is the drift increasing" (Phase 3's own question)
// is answered by comparing the front-half slope to the back-half slope
// of the SAME window, not asserted from the whole-window slope alone,
// which cannot by itself distinguish a steady drift from an
// accelerating one.

/**
 * @param {number[]} values
 * @param {number[]} timestampsMs - same length as values, real epoch ms
 * @returns {number|null} slope in units per hour
 */
function linearSlopePerHour(values, timestampsMs) {
  const n = values.length;
  if (n < 2 || timestampsMs.length !== n) return null;
  const t0 = timestampsMs[0];
  const hours = timestampsMs.map((t) => (t - t0) / 3600000);
  const xMean = mean(hours);
  const yMean = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (hours[i] - xMean) * (values[i] - yMean);
    den += (hours[i] - xMean) ** 2;
  }
  return den > 0 ? num / den : null;
}

/**
 * @param {Object} p
 * @param {number[]} p.values - time-ordered
 * @param {number[]} p.timestampsMs - same length, real epoch ms, time-ordered
 * @returns {{velocityPerHour: number|null, earlierHalfVelocity: number|null, laterHalfVelocity: number|null, accelerating: boolean|null, quality: string, reason: string|null}}
 */
function computeDriftVelocity({ values, timestampsMs }) {
  const n = Array.isArray(values) ? values.length : 0;
  const quality = analytics.classifyQuality({ metricSupported: true, sampleCount: n, minSamplesForValid: 4 });
  if (n < 4 || !Array.isArray(timestampsMs) || timestampsMs.length !== n) {
    return { velocityPerHour: null, earlierHalfVelocity: null, laterHalfVelocity: null, accelerating: null, quality, reason: 'need at least 4 time-ordered samples to compare early vs. late drift' };
  }
  const mid = Math.floor(n / 2);
  const velocityPerHour = linearSlopePerHour(values, timestampsMs);
  const earlierHalfVelocity = linearSlopePerHour(values.slice(0, mid), timestampsMs.slice(0, mid));
  const laterHalfVelocity = linearSlopePerHour(values.slice(mid), timestampsMs.slice(mid));
  const accelerating = earlierHalfVelocity !== null && laterHalfVelocity !== null
    ? Math.abs(laterHalfVelocity) > Math.abs(earlierHalfVelocity)
    : null;
  return { velocityPerHour, earlierHalfVelocity, laterHalfVelocity, accelerating, quality, reason: null };
}

module.exports = {
  StabilityState,
  CPK_ASSESSMENT_THRESHOLD,
  CPK_INTERVENTION_THRESHOLD,
  MIN_SAMPLES_FOR_CONFIDENT_CPK,
  PE_COLUMNS,
  JE_COLUMNS,
  SPC_COMPOSITE_METRICS,
  isValidSpcMetric,
  mean,
  sampleStddev,
  stabilityStateForCpk,
  computeCpk,
  worstCpk,
  computeEwma,
  computeCusum,
  evaluateNelsonRules,
  linearSlopePerHour,
  computeDriftVelocity,
};
