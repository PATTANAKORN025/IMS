'use strict';
// Thin wrapper over scripts/dr-test.sh's backup-restore drill (already
// proven this session: pre_restore/post_restore + hypertable-FK repair +
// 12-point structural comparison against source 'ims', isolated
// ims_dr_test database only, cleaned up on exit). This runner does not
// duplicate that logic -- it invokes the real drill and normalizes its
// output into the assurance framework's result schema.
//
// Run standalone: node tests/disaster-recovery/runner.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { makeResult } = require('../../scripts/assurance-schema');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'runtime');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function run() {
  const results = [];
  const stamp = timestamp();
  const t0 = Date.now();

  let stdout = '';
  let exitOk = true;
  try {
    stdout = execFileSync('bash', ['scripts/dr-test.sh', 'backup-restore'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    // dr-test.sh doesn't propagate a nonzero exit for a FAIL verdict today
    // (it prints VERDICT: FAIL and returns 0) -- but capture stdout either
    // way in case that changes, so a real crash still surfaces here.
    stdout = (err.stdout || '') + '\n' + (err.stderr || '');
    exitOk = false;
  }
  const duration_ms = Date.now() - t0;

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidencePath = `docs/evidence/runtime/disaster-recovery-${stamp}.log`;
  fs.writeFileSync(path.join(REPO_ROOT, evidencePath), stdout);

  const verdictLine = stdout.split('\n').find((l) => l.startsWith('VERDICT:')) || '';
  const isPass = /VERDICT:\s*PASS/.test(verdictLine);
  const passCountMatch = stdout.match(/(\d+) passed, (\d+) failed/);
  const summary = passCountMatch
    ? `${passCountMatch[1]} structural checks passed, ${passCountMatch[2]} failed`
    : verdictLine || 'no VERDICT line found in output';

  results.push(
    makeResult({
      name: 'disaster-recovery.backup-restore',
      status: exitOk && isPass ? 'PASS' : 'FAIL',
      duration_ms,
      threshold: '12/12 structural comparisons pass (table/schema/hypertable/index/FK/trigger/extension/CAGG/compression/retention/row-count/app-connectivity), isolated ims_dr_test only',
      actual: exitOk ? summary : 'dr-test.sh did not complete cleanly, see evidence',
      evidence: evidencePath,
    })
  );

  return results;
}

if (require.main === module) {
  run()
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
      process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
    })
    .catch((err) => {
      console.error('disaster-recovery runner crashed:', err);
      process.exit(1);
    });
}

module.exports = { run };
