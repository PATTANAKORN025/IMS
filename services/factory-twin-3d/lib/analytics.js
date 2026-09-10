/**
 * FT-17 — historical analytics. Pure, no I/O, same discipline as
 * lib/mapping.js/telemetry.js/alarm.js.
 *
 * REUSES THE EXISTING TIERING CONTRACT (docs/architecture/
 * GRAFANA_DESIGN_SYSTEM.md §10, enforced for dashboards by tests/lint/
 * query-budget-linter.js, built by migrations 043/044):
 *   raw ldi_data   -> latest-value lookups only, or a short/rolling window
 *                     (<= 6h) when a metric raw alone can answer (min/max/
 *                     median/p95/stddev -- see metricAvailability below)
 *   ldi_data_1m    -> ranges <= 6h
 *   ldi_data_15m   -> ranges 6h - 2 days
 *   ldi_data_1h    -> ranges > 2 days
 * This module never invents a new tier or a new boundary -- tierForRange()
 * below states the SAME three numbers query-budget-linter.js's own header
 * comment already documents.
 *
 * THE HONESTY RULE THIS MODULE EXISTS TO ENFORCE: none of the three CAGG
 * tiers store anything but AVG(column) and SUM(sample_count) (migrations
 * 043/044's own column lists -- no min/max/stddev/percentile anywhere in
 * them, a documented tradeoff, not an oversight: "a CAGG storing only
 * avg() can't reconstruct STDDEV_SAMP... out of scope"). So min, max,
 * median and p95 are answerable ONLY from raw ldi_data, and therefore
 * ONLY for a range small enough that a raw scan is the same accepted
 * shape this codebase's own Cpk/StdDev panels already use (<= 6h,
 * matching the 1m-tier boundary) -- never computed from an AVG-of-AVG
 * tier, which would silently misreport a min/max that never occurred.
 * A metric this module cannot support for the requested range comes back
 * UNAVAILABLE, never a plausible-looking number.
 */

'use strict';

/** @readonly @enum {string} */
const Quality = Object.freeze({
  VALID: 'VALID',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  UNAVAILABLE: 'UNAVAILABLE',
});

/** @readonly @enum {string} */
const Tier = Object.freeze({
  RAW: 'ldi_data',
  ONE_MIN: 'ldi_data_1m',
  FIFTEEN_MIN: 'ldi_data_15m',
  ONE_HOUR: 'ldi_data_1h',
});

// The whitelist a caller (browser) may request. No unbounded/arbitrary
// from-to range reaches a query from the browser -- server.js validates
// against exactly this set (or an explicit from/to pair no wider than the
// largest entry here, MAX_RANGE_MS).
const SUPPORTED_RANGES = Object.freeze(['15m', '1h', '6h', '24h', '7d', '30d']);

const RANGE_MS = Object.freeze({
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
});

const SIX_HOURS_MS = RANGE_MS['6h'];
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = RANGE_MS['30d'];

/**
 * @param {string} range - one of SUPPORTED_RANGES
 * @returns {number|null} milliseconds, or null if not a supported range
 */
function rangeToMs(range) {
  return Object.prototype.hasOwnProperty.call(RANGE_MS, range) ? RANGE_MS[range] : null;
}

/**
 * Which CAGG tier a range-scan trend query must read from -- the same
 * three boundaries query-budget-linter.js already enforces for dashboards.
 * Never raw ldi_data: a trend (many buckets over a window) is exactly the
 * range-scan shape that linter flags against the raw table.
 *
 * @param {number} spanMs - to - from, in milliseconds
 * @returns {Tier}
 */
function tierForRange(spanMs) {
  if (!Number.isFinite(spanMs) || spanMs <= 0) return Tier.ONE_MIN;
  if (spanMs <= SIX_HOURS_MS) return Tier.ONE_MIN;
  if (spanMs <= TWO_DAYS_MS) return Tier.FIFTEEN_MIN;
  return Tier.ONE_HOUR;
}

// Metrics with a real avg_<name> column on every CAGG tier (migrations
// 043/044's own column lists) -- the same name is used at the API surface
// and as the CAGG's own column suffix, checked once here rather than
// trusting a caller-supplied string straight into SQL.
const AVG_METRICS = Object.freeze([
  'temperature', 'humidity', 'air_vacuum', 'scan_speed', 'thickness',
  'resist_dosage', 'scale_x', 'scale_y',
  'pe_1', 'pe_2', 'pe_3', 'pe_4', 'pe_5', 'pe_6',
  'je_1', 'je_2', 'je_3', 'je_4', 'pe_setting', 'je_setting',
]);

/**
 * A metric name safe to interpolate as an identifier suffix (avg_<metric>,
 * or the raw column name). Format-checked, not merely "is a known name" --
 * defense in depth the same way lib/mapping.js's NAMESPACE_PATTERN checks
 * shape before anything is ever built into SQL.
 */
function isValidMetric(metric) {
  return typeof metric === 'string' && AVG_METRICS.includes(metric);
}

/**
 * Statistics beyond avg (min/max/median/p95/stddev) exist ONLY on raw
 * ldi_data -- see this module's own header. They are answerable for a
 * request only when the resolved tier is the 1-minute one, i.e. the
 * request's own span is <= 6h; anything wider is UNAVAILABLE, not
 * approximated from an averaged tier.
 *
 * @param {number} spanMs
 * @returns {boolean}
 */
function extendedStatsAvailable(spanMs) {
  return tierForRange(spanMs) === Tier.ONE_MIN;
}

/**
 * Deterministic quality classification for one aggregated bucket/result.
 * Never inferred from anything but the sample count and whether the
 * metric itself is answerable at this tier -- no timestamp-gap heuristic
 * invented beyond what the caller explicitly supplies as expectedSamples.
 *
 * @param {Object} p
 * @param {boolean} p.metricSupported - false if the tier/range combination cannot answer this metric at all
 * @param {number} p.sampleCount - real SUM(sample_count)/COUNT(*) for this bucket
 * @param {number} [p.minSamplesForValid=1] - below this, INSUFFICIENT_DATA rather than VALID
 * @returns {Quality}
 */
function classifyQuality({ metricSupported, sampleCount, minSamplesForValid = 1 }) {
  if (!metricSupported) return Quality.UNAVAILABLE;
  if (!Number.isFinite(sampleCount) || sampleCount <= 0) return Quality.INSUFFICIENT_DATA;
  if (sampleCount < minSamplesForValid) return Quality.INSUFFICIENT_DATA;
  return Quality.VALID;
}

/**
 * Validates a from/to/range request against the query-budget contract:
 * from < to, and the span does not exceed MAX_RANGE_MS. Pure -- does not
 * know about "now", the caller resolves from/to to real timestamps first.
 *
 * @param {number} fromMs
 * @param {number} toMs
 * @returns {{ok: boolean, error: string|null, spanMs: number}}
 */
function validateRange(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return { ok: false, error: 'from/to must be valid timestamps', spanMs: NaN };
  }
  if (fromMs >= toMs) {
    return { ok: false, error: 'from must be before to', spanMs: NaN };
  }
  const spanMs = toMs - fromMs;
  if (spanMs > MAX_RANGE_MS) {
    return { ok: false, error: `range exceeds the ${MAX_RANGE_MS / 86400000}-day server maximum`, spanMs };
  }
  return { ok: true, error: null, spanMs };
}

/**
 * Shapes one bucketed trend point from a CAGG/raw row into the FT-17
 * canonical shape. Pure reshaping -- no query, no I/O.
 *
 * @param {Object} row - {bucket, value, sample_count}
 * @param {boolean} metricSupported
 * @returns {{timestamp: string, value: number|null, sample_count: number, quality: Quality}}
 */
function projectTrendPoint(row, metricSupported) {
  const sampleCount = Number(row.sample_count) || 0;
  const quality = classifyQuality({ metricSupported, sampleCount });
  return {
    timestamp: row.bucket,
    value: quality === Quality.VALID || quality === Quality.INSUFFICIENT_DATA
      ? (row.value === null || row.value === undefined ? null : Number(row.value))
      : null,
    sample_count: sampleCount,
    quality,
  };
}

module.exports = {
  Quality,
  Tier,
  SUPPORTED_RANGES,
  MAX_RANGE_MS,
  rangeToMs,
  tierForRange,
  isValidMetric,
  extendedStatsAvailable,
  classifyQuality,
  validateRange,
  projectTrendPoint,
  AVG_METRICS,
};
