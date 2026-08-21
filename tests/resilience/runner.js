'use strict';
// Resilience category: container-loss recovery (wraps the already-proven
// scripts/dr-test.sh container-loss drill) plus a real check of whether
// the failure was actually DETECTED (Alertmanager's ServiceDown rule,
// monitoring/prometheus/rules/*.yml -- probe_success == 0 for 1m).
//
// Safety gate (explicit, per design review): this drill kills a real
// running container (ims-timescaledb or ims-node-red). An automated
// runner must never do that unattended. Requires an explicit
// --allow-container-kill flag; without it, both results report
// BLOCKED_SCOPE rather than running or being silently skipped.
//
// Run standalone: node tests/resilience/runner.js --allow-container-kill [timescaledb|node-red]

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { makeResult } = require('../../scripts/assurance-schema');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'runtime');
const ALERTMANAGER_URL = process.env.ALERTMANAGER_URL || 'http://localhost:9093';

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function fetchAlerts() {
  return new Promise((resolve, reject) => {
    http
      .get(`${ALERTMANAGER_URL}/api/v2/alerts`, { timeout: 5000 }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject)
      .on('timeout', function () {
        this.destroy(new Error('timeout'));
      });
  });
}

async function pollForServiceDownAlert(target, deadlineMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < deadlineMs) {
    try {
      const alerts = await fetchAlerts();
      const hit = alerts.find(
        (a) =>
          a.labels &&
          a.labels.alertname === 'ServiceDown' &&
          a.status &&
          a.status.state === 'active' &&
          JSON.stringify(a.labels).includes(target)
      );
      if (hit) return Date.now() - t0;
    } catch {
      // Alertmanager unreachable this poll -- keep trying until deadline
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}

async function run({ allowContainerKill = false, target = 'timescaledb' } = {}) {
  const stamp = timestamp();
  const results = [];
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  if (!allowContainerKill) {
    const note =
      'requires --allow-container-kill (and, if run through production-assurance.js, an explicit --allow-container-kill CLI flag) -- an automated runner must never kill a real running container without this opt-in';
    results.push(
      makeResult({
        name: 'resilience.container-loss.recovery-time',
        status: 'BLOCKED_SCOPE',
        duration_ms: 0,
        threshold: 'container reaches running again within 120s of docker kill',
        actual: note,
        evidence: 'n/a',
      })
    );
    results.push(
      makeResult({
        name: 'resilience.container-loss.detected',
        status: 'BLOCKED_SCOPE',
        duration_ms: 0,
        threshold: 'ServiceDown alert fires (Alertmanager) within 90s of the induced failure',
        actual: note,
        evidence: 'n/a',
      })
    );
    return results;
  }

  const t0 = Date.now();
  let drOutput = '';
  try {
    drOutput = execFileSync('bash', ['scripts/dr-test.sh', 'container-loss', target], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    drOutput = (err.stdout || '') + '\n' + (err.stderr || '');
  }
  const totalDuration = Date.now() - t0;

  const evidencePath = `docs/evidence/runtime/resilience-container-loss-${stamp}.log`;
  fs.writeFileSync(path.join(REPO_ROOT, evidencePath), drOutput);

  const verdictLine = drOutput.split('\n').find((l) => l.startsWith('VERDICT:')) || '';
  const secsMatch = drOutput.match(/recovered to 'running' in (\d+)s/);
  const recovered = /VERDICT:\s*PASS/.test(verdictLine);

  results.push(
    makeResult({
      name: 'resilience.container-loss.recovery-time',
      status: recovered ? 'PASS' : 'FAIL',
      duration_ms: totalDuration,
      threshold: 'container reaches running again within 120s of docker kill',
      actual: secsMatch ? `recovered in ${secsMatch[1]}s` : verdictLine || 'no VERDICT line found',
      evidence: evidencePath,
    })
  );

  // Detection check: does Alertmanager's ServiceDown rule actually fire for
  // this target? ServiceDown's own `for: 1m` means detection cannot be
  // faster than ~60s by rule design -- poll up to 90s so a healthy system
  // has real margin, not a coin-flip window.
  let detectMs = null;
  let detectStatus = 'FAIL';
  let detectActual = 'ServiceDown alert did not fire within the poll window';
  try {
    detectMs = await pollForServiceDownAlert(target, 90_000);
    if (detectMs !== null) {
      detectStatus = 'PASS';
      detectActual = `ServiceDown fired ${(detectMs / 1000).toFixed(1)}s after kill`;
    }
  } catch (e) {
    detectStatus = 'BLOCKED_ENVIRONMENT';
    detectActual = `could not reach Alertmanager at ${ALERTMANAGER_URL}: ${e.message}`;
  }

  results.push(
    makeResult({
      name: 'resilience.container-loss.detected',
      status: detectStatus,
      duration_ms: detectMs ?? 90_000,
      threshold: 'ServiceDown alert fires (Alertmanager) within 90s of the induced failure',
      actual: detectActual,
      evidence: evidencePath,
    })
  );

  return results;
}

if (require.main === module) {
  const allowContainerKill = process.argv.includes('--allow-container-kill');
  const targetArg = process.argv.find((a) => a === 'timescaledb' || a === 'node-red');
  run({ allowContainerKill, target: targetArg || 'timescaledb' })
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
      process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
    })
    .catch((err) => {
      console.error('resilience runner crashed:', err);
      process.exit(1);
    });
}

module.exports = { run };
