'use strict';
// e2e category: wraps two existing checks into the assurance framework's
// TestResult schema. Thin execFileSync + parse wrapper, same pattern as
// tests/disaster-recovery/runner.js.
//
//   - tests/e2e/query-timing-check.js: real EXPLAIN ANALYZE per panel,
//     enforces the existing P95 < 80ms budget (IMS World-Class Audit
//     Phase 4). Budget kept as-is, not touched by this phase.
//
//     NOT run on a lightweight subset -- tried that first (3 dashboards,
//     18 targets), and P95 over n=7 measured queries flipped PASS/FAIL
//     run to run on measurement jitter around one genuinely-borderline
//     panel (~80-100ms). The same borderline panel exists in the full
//     139-target sweep too, but P95 over n=70 tolerates it as a single
//     outlier -- so the full sweep is the only version of this check
//     that's actually deterministic. Excluded entirely from the `fast`
//     profile for that reason (see includeQueryTiming below); runs full
//     sweep, always, in release/full.
//   - tests/e2e/ingestion-latency-check.js: real source->commit and
//     commit->query-visible latency measurement. This script has never
//     had a pass/fail threshold -- it is a report, not an assertion. No
//     SLO has been approved for it, so this wraps it as NOT_TESTED with
//     the real measured numbers preserved in `actual` and the full output
//     in evidence. Do not invent a threshold here; once an SLO is
//     approved, change this one status line only. Runs in every profile
//     that includes the e2e category -- it's cheap (~2s) and, being a
//     pure measurement with no threshold, cannot itself be flaky pass/fail.
//
// Run standalone:
//   node tests/e2e/runner.js                    (fast: query-timing excluded)
//   node tests/e2e/runner.js --include-query-timing   (release/full: full 139-target sweep)

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { makeResult } = require('../../scripts/assurance-schema');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'runtime');

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

async function run({ includeQueryTiming = true } = {}) {
  const stamp = timestamp();
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const results = [];

  if (includeQueryTiming) {
    // Always full sweep -- no PANEL_CHECK_ONLY. See header note: this check
    // is only deterministic at the full 139-target sample size.
    const timing = runNode('tests/e2e/query-timing-check.js', {});
    const timingEvidence = `docs/evidence/runtime/e2e-query-timing-check-${stamp}.log`;
    fs.writeFileSync(path.join(REPO_ROOT, timingEvidence), timing.stdout);
    const p95Match = timing.stdout.match(/P95:\s*([\d.]+)ms/);
    const measuredMatch = timing.stdout.match(/Measured (\d+) panel queries \((\d+) skipped, (\d+) errors\)/);
    results.push(
      makeResult({
        name: 'e2e.query-timing-check',
        status: timing.ok ? 'PASS' : 'FAIL',
        duration_ms: timing.duration_ms,
        threshold: 'P95 < 80ms, all 15 dashboards / 139 panel targets (full sweep, the only sample size this check is deterministic at)',
        actual: (p95Match ? `P95=${p95Match[1]}ms` : 'no P95 line found') +
          (measuredMatch ? `, ${measuredMatch[1]} queries measured (${measuredMatch[2]} skipped, ${measuredMatch[3]} errors)` : ''),
        evidence: timingEvidence,
      })
    );
  } else {
    // Deliberately excluded from `fast`, not silently missing: a 3-dashboard/
    // 18-target subset made this check's P95 flip PASS/FAIL run-to-run on
    // measurement jitter (3 FAIL, 1 PASS observed over 4 identical runs,
    // 2026-08-24). Full 139-target sweep (release/full profiles) is
    // deterministic and remains the real gate for this budget.
    results.push(
      makeResult({
        name: 'e2e.query-timing-check',
        status: 'NOT_TESTED',
        duration_ms: 0,
        threshold: 'n/a -- excluded from fast profile',
        actual: 'not run under fast: only deterministic at the full 139-target sample size (see release/full); a small subset made P95 flip PASS/FAIL on measurement jitter',
        evidence: 'n/a',
        blocking: false,
      })
    );
  }

  // -- ingestion-latency-check.js: measurement only, no SLO approved --
  const latency = runNode('tests/e2e/ingestion-latency-check.js', {});
  const latencyEvidence = `docs/evidence/runtime/e2e-ingestion-latency-${stamp}.log`;
  fs.writeFileSync(path.join(REPO_ROOT, latencyEvidence), latency.stdout);
  const digestLines = latency.stdout.split('\n').filter((l) => /P50=/.test(l) || /^\s*\S+\s+n=0/.test(l));
  results.push(
    makeResult({
      name: 'e2e.ingestion-latency',
      status: 'NOT_TESTED',
      duration_ms: latency.duration_ms,
      threshold: 'no latency SLO approved yet -- measurement only, not a pass/fail gate',
      actual: digestLines.length ? digestLines.join(' | ').slice(0, 1000) : 'no latency data in window, see evidence',
      evidence: latencyEvidence,
      blocking: false,
    })
  );

  return results;
}

if (require.main === module) {
  const includeQueryTiming = process.argv.includes('--include-query-timing') || process.argv.includes('--full');
  run({ includeQueryTiming })
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
      process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
    })
    .catch((err) => {
      console.error('e2e runner crashed:', err);
      process.exit(1);
    });
}

module.exports = { run };
