'use strict';
// Integration category: wraps tests/smoke/query-budget-check.sh -- 4
// read-only cross-view/CAGG queries (v_machine_spc_fleet, v_machine_spc_
// ranking, ldi_data_1m CAGG, v_ldi_alarm_context x v_ldi_alarm_category
// join) against a generous 2000ms CI budget. No writes, no Docker restart.
//
// tests/smoke/db-write-check.sh is deliberately NOT wrapped here: it runs
// `docker compose up -d` + `sleep 45` (Docker infra restart, out of scope
// and explicitly excluded this phase) and POSTs a real event to the live
// alert-webhook (writes into production-adjacent tables, the same class
// of risk tests/resilience/runner.js gates behind --allow-container-kill).
// Wrapping it is legitimate future work behind an equivalent explicit
// opt-in flag -- not done here.
//
// Run standalone: node tests/integration/runner.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { makeResult } = require('../../scripts/assurance-schema');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'runtime');
const BUDGET_MS = Number(process.env.CI_BUDGET_MS || 2000);
const EXPECTED_CHECKS = 4;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function run() {
  const stamp = timestamp();
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const results = [];

  const t0 = Date.now();
  let stdout = '';
  let stderr = '';
  let ok = true;
  try {
    stdout = execFileSync('bash', ['tests/smoke/query-budget-check.sh'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    ok = false;
  }
  const duration_ms = Date.now() - t0;

  const evidencePath = `docs/evidence/runtime/integration-query-budget-${stamp}.log`;
  fs.writeFileSync(path.join(REPO_ROOT, evidencePath), stdout + (stderr ? '\n--- stderr ---\n' + stderr : ''));

  // Each check_query() call in the script unconditionally prints
  // "  <label>: <ms>ms" before deciding pass/fail (and `set -e` means the
  // script stops at the first check that exceeds budget) -- so we judge
  // each printed line against BUDGET_MS ourselves rather than trusting
  // that a clean exit means every line passed.
  const lineRe = /^\s*(.+?):\s*(\d+)ms$/gm;
  let match;
  const parsed = [];
  while ((match = lineRe.exec(stdout)) !== null) {
    parsed.push({ label: match[1], ms: Number(match[2]) });
  }

  for (const { label, ms } of parsed) {
    results.push(
      makeResult({
        name: `integration.query-budget.${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
        status: ms <= BUDGET_MS ? 'PASS' : 'FAIL',
        duration_ms: ms,
        threshold: `< ${BUDGET_MS}ms (CI budget, generous vs the ~180ms real worst-case in docs/phase2-baseline-metrics.md)`,
        actual: `${ms}ms`,
        evidence: evidencePath,
      })
    );
  }

  if (parsed.length < EXPECTED_CHECKS) {
    results.push(
      makeResult({
        name: 'integration.query-budget.completeness',
        status: 'FAIL',
        duration_ms,
        threshold: `all ${EXPECTED_CHECKS} smoke queries complete`,
        actual: ok
          ? `only ${parsed.length}/${EXPECTED_CHECKS} checks printed a timing line -- unexpected, see evidence`
          : `script exited early after ${parsed.length}/${EXPECTED_CHECKS} checks: ${(stderr || stdout).trim().split('\n').slice(-3).join(' | ')}`,
        evidence: evidencePath,
      })
    );
  }

  return results;
}

if (require.main === module) {
  run()
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
      process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
    })
    .catch((err) => {
      console.error('integration runner crashed:', err);
      process.exit(1);
    });
}

module.exports = { run };
