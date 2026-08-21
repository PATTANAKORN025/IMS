'use strict';
// Pure verdict function over a TestResult[] (see assurance-schema.js).
// No manual override path -- the verdict a report shows is always this
// function's output over the JSON, never hand-typed by whoever ran it.

const { BLOCKED_STATUSES } = require('./assurance-schema');

/**
 * @param {import('./assurance-schema').TestResult[]} results
 * @returns {{ verdict: 'GO'|'CONDITIONAL GO'|'NO-GO', reasons: string[] }}
 */
function computeVerdict(results) {
  const reasons = [];

  const withEvidence = results.filter((r) => r.status === 'PASS' || r.status === 'WARN' || r.status === 'FAIL');
  if (withEvidence.length === 0) {
    return {
      verdict: 'NO-GO',
      reasons: [
        'NO-GO: no requirement in this run produced actual evidence (PASS/WARN/FAIL) -- ' +
          `everything reported NOT_TESTED or BLOCKED_*; a system cannot be called ready with zero evidence`,
      ],
    };
  }

  const blockingCritical = results.filter(
    (r) => r.status === 'FAIL' && r.blocking && /critical/i.test(r.threshold + ' ' + r.actual)
  );
  const blockingFail = results.filter((r) => r.status === 'FAIL' && r.blocking);
  const nonBlockingFail = results.filter((r) => r.status === 'FAIL' && !r.blocking);
  const blockingBlocked = results.filter((r) => r.blocking && BLOCKED_STATUSES.has(r.status));
  const anyWarn = results.filter((r) => r.status === 'WARN');

  if (blockingCritical.length > 0) {
    reasons.push(...blockingCritical.map((r) => `NO-GO: ${r.name} -- CRITICAL, blocking (${r.actual})`));
  }
  if (blockingFail.length > 0) {
    reasons.push(...blockingFail.map((r) => `NO-GO: ${r.name} -- FAIL, blocking (threshold: ${r.threshold}, actual: ${r.actual})`));
  }

  if (blockingCritical.length > 0 || blockingFail.length > 0) {
    return { verdict: 'NO-GO', reasons };
  }

  if (blockingBlocked.length > 0) {
    reasons.push(...blockingBlocked.map((r) => `CONDITIONAL GO: ${r.name} -- ${r.status}, blocking, cannot confirm PASS (${r.actual})`));
  }
  if (anyWarn.length > 0) {
    reasons.push(...anyWarn.map((r) => `CONDITIONAL GO: ${r.name} -- WARN (${r.actual})`));
  }
  if (nonBlockingFail.length > 0) {
    reasons.push(...nonBlockingFail.map((r) => `CONDITIONAL GO: ${r.name} -- FAIL, non-blocking (${r.actual})`));
  }

  if (reasons.length > 0) {
    return { verdict: 'CONDITIONAL GO', reasons };
  }

  return { verdict: 'GO', reasons: ['GO: no FAIL, no WARN, no blocking BLOCKED_* among tests actually run'] };
}

module.exports = { computeVerdict };
