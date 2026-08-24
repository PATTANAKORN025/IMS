'use strict';
// Data-quality category: wraps two existing, already-proven checks into the
// assurance framework's TestResult schema. Neither check is duplicated or
// reimplemented here -- this is a thin execFileSync + parse wrapper, same
// pattern as tests/disaster-recovery/runner.js and tests/resilience/runner.js.
//
//   - tests/e2e/golden-dataset-spc.js: 5 independent Cpk formula
//     implementations must agree on a hand-known synthetic dataset
//     (transaction-isolated, always rolled back). Always run in full --
//     it's one wrapped transaction, not a per-dashboard scan, so there is
//     no "lightweight" version of it.
//   - tests/e2e/panel-data-check.js: real DB exec against every panel's
//     resolved SQL, catches bad SQL / wrong-table / zero-rows the static
//     linters can't see. This one DOES scan proportionally to dashboard
//     count (139 targets across 15 dashboards) -- see LIGHTWEIGHT_SUBSET.
//
// Run standalone:
//   node tests/data-quality/runner.js            (lightweight subset)
//   node tests/data-quality/runner.js --full      (all 15 dashboards)

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { makeResult } = require('../../scripts/assurance-schema');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'runtime');

// Deliberately small, named subset for the "fast" profile: 3 dashboards
// (18 of 139 targets) spanning 3 distinct panel domains -- overview
// stat/table panels, the alarm operator-workflow dashboard, and the SPC/
// engineering-analytics dashboard -- so a fast-profile regression in any
// one query style has a chance of being caught without paying for a full
// 15-dashboard sweep on every run. release/full profiles pass full:true
// and scan all 15. Factory-Twin-3D's dashboard is intentionally excluded
// from this subset (not from the full scan) to keep this phase's work
// fully clear of that subsystem, per explicit instruction.
const LIGHTWEIGHT_SUBSET = [
  'manufacturing/ims-easy-overview.json',
  'manufacturing/ims-ldi-alarm-response.json',
  'manufacturing/ims-ldi-engineering-analytics.json',
];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runNode(scriptRelPath, env) {
  const t0 = Date.now();
  let stdout = '';
  let ok = true;
  try {
    stdout = execFileSync('node', [scriptRelPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, ...env },
    });
  } catch (err) {
    stdout = (err.stdout || '') + '\n' + (err.stderr || '');
    ok = false;
  }
  return { stdout, ok, duration_ms: Date.now() - t0 };
}

async function run({ lightweight = true } = {}) {
  const stamp = timestamp();
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const results = [];

  // -- golden-dataset-spc.js: always full, cheap, self-isolated --
  const golden = runNode('tests/e2e/golden-dataset-spc.js', {});
  const goldenEvidence = `docs/evidence/runtime/data-quality-golden-dataset-spc-${stamp}.log`;
  fs.writeFileSync(path.join(REPO_ROOT, goldenEvidence), golden.stdout);
  const goldenCounts = golden.stdout.match(/Results: (\d+) passed, (\d+) failed/);
  results.push(
    makeResult({
      name: 'data-quality.golden-dataset-spc',
      status: golden.ok ? 'PASS' : 'FAIL',
      duration_ms: golden.duration_ms,
      threshold: 'all 5 independently-implemented Cpk formulas agree with textbook calc, tolerance 0.02',
      actual: goldenCounts ? `${goldenCounts[1]} checks passed, ${goldenCounts[2]} failed` : 'no Results line found, see evidence',
      evidence: goldenEvidence,
    })
  );

  // -- panel-data-check.js: subset for fast, full sweep for release/full --
  const only = lightweight ? LIGHTWEIGHT_SUBSET.join(',') : '';
  const panel = runNode('tests/e2e/panel-data-check.js', only ? { PANEL_CHECK_ONLY: only } : {});
  const panelEvidence = `docs/evidence/runtime/data-quality-panel-data-check-${stamp}.log`;
  fs.writeFileSync(path.join(REPO_ROOT, panelEvidence), panel.stdout);
  const panelCounts = panel.stdout.match(/Results: (\d+) passed, (\d+) warnings, (\d+) errors, (\d+) skipped/);
  results.push(
    makeResult({
      name: 'data-quality.panel-data-check',
      status: panel.ok ? 'PASS' : 'FAIL',
      duration_ms: panel.duration_ms,
      threshold: lightweight
        ? `0 SQL errors across lightweight subset (${LIGHTWEIGHT_SUBSET.length} of 15 dashboards; see docs/evidence/ for the panel-level breakdown)`
        : '0 SQL errors across all 15 dashboards / 139 panel targets',
      actual: panelCounts
        ? `${panelCounts[1]} passed, ${panelCounts[2]} warnings, ${panelCounts[3]} errors, ${panelCounts[4]} skipped${lightweight ? ' (lightweight subset)' : ' (full sweep)'}`
        : 'no Results line found, see evidence',
      evidence: panelEvidence,
    })
  );

  return results;
}

if (require.main === module) {
  const full = process.argv.includes('--full');
  run({ lightweight: !full })
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
      process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
    })
    .catch((err) => {
      console.error('data-quality runner crashed:', err);
      process.exit(1);
    });
}

module.exports = { run, LIGHTWEIGHT_SUBSET };
