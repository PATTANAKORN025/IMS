'use strict';
// Normalized result shape every tests/<category>/runner.js must emit.
// One TestResult per checked requirement -- not one per script/file.

const STATUSES = Object.freeze([
  'PASS',
  'WARN',
  'FAIL',
  'BLOCKED_EXTERNAL',    // outside this session's control (e.g. CI billing lockout)
  'BLOCKED_ENVIRONMENT', // required local infra/tool missing (Docker down, no network)
  'BLOCKED_SCOPE',       // intentionally withheld for safety (no --allow-container-kill,
                          // no --confirm-destroy) -- not skipped silently, not run either
  'NOT_TESTED',          // excluded by the current profile's category list
]);

const BLOCKED_STATUSES = new Set(['BLOCKED_EXTERNAL', 'BLOCKED_ENVIRONMENT', 'BLOCKED_SCOPE']);

/**
 * @param {object} r
 * @param {string} r.name - unique dotted id, e.g. "security.npm-audit.alarm-api"
 * @param {string} r.status - one of STATUSES
 * @param {number} r.duration_ms
 * @param {string} r.threshold - human-readable requirement, e.g. "0 CRITICAL, 0 unapproved HIGH"
 * @param {string} r.actual - human-readable measured value
 * @param {string} r.evidence - relative path to the raw evidence file backing this result
 * @param {boolean} [r.blocking=true] - whether a FAIL/BLOCKED_* here can affect the verdict
 */
function makeResult(r) {
  if (!STATUSES.includes(r.status)) {
    throw new Error(`invalid status "${r.status}" for result "${r.name}" -- must be one of ${STATUSES.join(', ')}`);
  }
  if (typeof r.name !== 'string' || !r.name) throw new Error('result.name required');
  if (typeof r.duration_ms !== 'number') throw new Error(`result.duration_ms must be a number for "${r.name}"`);
  if (typeof r.threshold !== 'string') throw new Error(`result.threshold must be a string for "${r.name}"`);
  if (typeof r.actual !== 'string') throw new Error(`result.actual must be a string for "${r.name}"`);
  if (typeof r.evidence !== 'string') throw new Error(`result.evidence must be a string for "${r.name}"`);
  return {
    name: r.name,
    status: r.status,
    duration_ms: r.duration_ms,
    threshold: r.threshold,
    actual: r.actual,
    evidence: r.evidence,
    blocking: r.blocking !== false,
  };
}

module.exports = { STATUSES, BLOCKED_STATUSES, makeResult };
