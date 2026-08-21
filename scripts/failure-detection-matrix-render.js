'use strict';
// Renders docs/evidence/FAILURE_DETECTION_MATRIX.md -- the cross-cutting
// view answering "for each real failure mode, do we detect it, alert on
// it, measure its impact, and recover -- with evidence for each stage."
// No new tests: every cell is computed from specific named results in the
// same production-assurance report used for PRODUCTION-READINESS.md.

const fs = require('fs');

// Each row maps a real-world failure mode to the specific result names
// that answer Detect/Alert/Measure/Recover for it. A stage with no mapped
// result renders "n/a" (not asserted) rather than a guess.
const FAILURE_MODES = [
  {
    mode: 'Container crash (DB/service)',
    detect: 'resilience.container-loss.detected',
    alert: 'resilience.container-loss.detected',
    measure: 'resilience.container-loss.recovery-time',
    recover: 'resilience.container-loss.recovery-time',
  },
  {
    mode: 'Backup corruption / restore failure',
    detect: 'disaster-recovery.backup-restore',
    alert: null,
    measure: 'disaster-recovery.backup-restore',
    recover: 'disaster-recovery.backup-restore',
  },
  {
    mode: 'Dependency CVE (npm)',
    detect: 'security.npm-audit.*',
    alert: null,
    measure: 'security.npm-audit.*',
    recover: null,
  },
  {
    mode: 'Container image CVE',
    detect: 'security.trivy.*',
    alert: null,
    measure: 'security.trivy.*',
    recover: null,
  },
  {
    mode: 'Secret committed to source',
    detect: 'security.gitleaks.full-history',
    alert: null,
    measure: 'security.gitleaks.full-history',
    recover: null,
  },
  {
    mode: 'Ingestion overload (load spike)',
    detect: 'load.capacity.breaking-point',
    alert: null,
    measure: 'load.capacity.mandatory',
    recover: null,
  },
  {
    mode: '23-device fleet: device(s) go silent',
    detect: 'fleet.availability.*',
    alert: null,
    measure: 'fleet.availability.*',
    recover: null,
  },
  {
    mode: 'Ingestion data loss/duplication/reorder',
    detect: 'fleet.integrity.*',
    alert: null,
    measure: 'fleet.integrity.*',
    recover: null,
  },
];

function findResult(results, pattern) {
  if (!pattern) return null;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1);
    return results.find((r) => r.name.startsWith(prefix)) || null;
  }
  return results.find((r) => r.name === pattern) || null;
}

function cell(results, pattern) {
  if (!pattern) return 'n/a';
  const r = findResult(results, pattern);
  if (!r) return 'not run this profile';
  const symbol = { PASS: 'YES', WARN: 'PARTIAL', FAIL: 'NO' }[r.status] || r.status;
  return `${symbol} (${r.name})`;
}

function renderFailureMatrix(report, outPath) {
  const lines = [];
  lines.push('<!-- GLOBAL_NAV -->');
  lines.push('<div align="right">');
  lines.push('  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;');
  lines.push('  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>');
  lines.push('</div>');
  lines.push('<br/>');
  lines.push('');
  lines.push('# Failure Detection Matrix');
  lines.push('');
  lines.push('The real question production-readiness needs to answer isn\'t "how many tests exist" -- it\'s: for');
  lines.push('every failure that could actually impact production, do we detect it, alert on it, measure its');
  lines.push('impact, and recover from it, with evidence for each stage? Generated from the same');
  lines.push(`\`docs/evidence/runtime/production-assurance-*.json\` report as PRODUCTION-READINESS.md (profile:` +
    ` \`${report.profile}\`, ${report.timestamp}) -- no new tests here, this is a cross-cutting view over the` +
    ' same results.');
  lines.push('');
  lines.push('| Failure Mode | Detected? | Alerted? | Impact Measured? | Recovered? |');
  lines.push('|---|---|---|---|---|');
  for (const fm of FAILURE_MODES) {
    lines.push(
      `| ${fm.mode} | ${cell(report.results, fm.detect)} | ${cell(report.results, fm.alert)} | ${cell(report.results, fm.measure)} | ${cell(report.results, fm.recover)} |`
    );
  }
  lines.push('');
  lines.push('`n/a` = no test in this framework currently answers that stage for that failure mode (a real gap,');
  lines.push('not a pass). `not run this profile` = the profile used for this run didn\'t include that category --');
  lines.push('re-run with `full` for whole-system coverage.');
  lines.push('');

  fs.writeFileSync(outPath, lines.join('\n'));
}

module.exports = { renderFailureMatrix };
