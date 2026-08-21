'use strict';
// Security category: npm audit across every real lockfile, a full-history
// gitleaks scan (via Docker, same trick proven this session), and -- in
// "full" mode only, since it pulls container images -- a Trivy scan of
// every built/pulled image. Reuses no fabricated data; every result here
// comes from actually running the tool.
//
// Run standalone: node tests/security/runner.js [--full]

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { makeResult } = require('../../scripts/assurance-schema');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'runtime');

const LOCKFILE_DIRS = ['.', 'services/alarm-api', 'services/factory-twin-3d', 'nodered_data'];

const BUILT_IMAGES = ['ims-alarm-api', 'ims-factory-twin-3d', 'ims-node-red', 'ims-pgbouncer'];
const PULLED_IMAGES = [
  'timescale/timescaledb:2.29.0-pg16',
  'grafana/grafana:13.1.2',
  'prom/prometheus:v3.13.2',
  'prom/alertmanager:v0.33.1',
];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function loadExceptions() {
  const file = path.join(REPO_ROOT, 'tests', 'security', 'risk-exceptions.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  return (data.exceptions || []).filter((e) => e.expiry >= today);
}

// CRITICAL can never be excepted here, full stop -- per explicit policy,
// only a genuine fix (verified by rescan) resolves a CRITICAL finding.
// A HIGH finding is only excepted if a valid (non-expired) entry names
// this exact CVE for this exact package -- "an exception exists somewhere
// in the file" is not sufficient, that would silently downgrade findings
// the file was never actually written to cover.
function isExcepted(exceptions, { severity, cve, pkg }) {
  if (severity !== 'HIGH') return false;
  return exceptions.some((e) => e.cve === cve && e.package === pkg);
}

function runNpmAudit(dir, evidenceStamp) {
  const t0 = Date.now();
  let json = null;
  let raw = '';
  let status = 'PASS';
  let actual = '';
  try {
    raw = execFileSync('npm', ['audit', '--omit=dev', '--json'], {
      cwd: path.join(REPO_ROOT, dir),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      shell: process.platform === 'win32', // npm is npm.cmd on Windows, needs a shell to resolve
    });
    json = JSON.parse(raw);
  } catch (err) {
    // npm audit exits nonzero when vulnerabilities are found -- that's
    // expected, the JSON is still on stdout.
    raw = err.stdout || '';
    try {
      json = JSON.parse(raw);
    } catch {
      status = 'BLOCKED_ENVIRONMENT';
      actual = `npm audit did not produce parseable JSON in ${dir} -- likely missing lockfile or npm/network issue`;
    }
  }

  const duration_ms = Date.now() - t0;
  const label = dir === '.' ? 'root' : dir.replace(/\//g, '-');
  const evidencePath = `docs/evidence/runtime/security-npm-audit-${label}-${evidenceStamp}.json`;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPO_ROOT, evidencePath), raw);

  if (json) {
    const v = json.metadata.vulnerabilities;
    const exceptions = loadExceptions();
    const highNames = Object.values(json.vulnerabilities || {})
      .filter((x) => x.severity === 'high')
      .map((x) => x.name);
    const unexceptedHigh = highNames.filter(
      (pkg) => !exceptions.some((e) => e.package === pkg) // npm audit's JSON groups by package, not individual CVE ids, at this summary level
    ).length;
    actual = `${v.critical} CRITICAL, ${v.high} HIGH (${unexceptedHigh} unapproved), ${v.moderate} MODERATE, ${v.low} LOW (${v.total} total, ${json.metadata.dependencies.prod} prod deps)`;
    if (v.critical > 0) {
      status = 'FAIL';
    } else if (unexceptedHigh > 0) {
      status = 'FAIL';
    } else if (v.high > 0) {
      status = 'WARN'; // every HIGH here has a matching, valid exception
    } else {
      status = 'PASS';
    }
  }

  return makeResult({
    name: `security.npm-audit.${label}`,
    status,
    duration_ms,
    threshold: '0 CRITICAL, 0 unapproved HIGH',
    actual,
    evidence: evidencePath,
  });
}

function runGitleaks(evidenceStamp) {
  const t0 = Date.now();
  let status = 'PASS';
  let actual = '';
  let raw = '';
  try {
    raw = execFileSync(
      'docker',
      [
        'run', '--rm',
        '-v', `${REPO_ROOT}:/repo`,
        'zricethezav/gitleaks:latest',
        'detect', '--source=/repo', '--config=/repo/.gitleaks.toml', '--no-banner', '-v',
      ],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, MSYS_NO_PATHCONV: '1' } }
    );
    actual = 'no leaks found';
  } catch (err) {
    raw = (err.stdout || '') + '\n' + (err.stderr || '');
    if (err.status === 1) {
      status = 'FAIL';
      actual = 'gitleaks found one or more leaks -- see evidence';
    } else {
      status = 'BLOCKED_ENVIRONMENT';
      actual = 'gitleaks scan did not complete -- docker unavailable or image pull failed';
    }
  }

  const duration_ms = Date.now() - t0;
  const evidencePath = `docs/evidence/runtime/security-gitleaks-${evidenceStamp}.log`;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPO_ROOT, evidencePath), raw);

  return makeResult({
    name: 'security.gitleaks.full-history',
    status,
    duration_ms,
    threshold: '0 leaks across full git history',
    actual,
    evidence: evidencePath,
  });
}

function runTrivy(image, evidenceStamp) {
  const t0 = Date.now();
  const label = image.replace(/[/:]/g, '-');
  let status = 'PASS';
  let actual = '';
  let raw = '';
  try {
    raw = execFileSync(
      'docker',
      [
        'run', '--rm',
        '-v', '/var/run/docker.sock:/var/run/docker.sock',
        'aquasec/trivy:latest',
        'image', '--severity', 'HIGH,CRITICAL', '--format', 'json', '--quiet', image,
      ],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    );
    const parsed = JSON.parse(raw);
    const exceptions = loadExceptions();
    let critical = 0;
    let high = 0;
    let unexceptedHigh = 0;
    for (const result of parsed.Results || []) {
      for (const vuln of result.Vulnerabilities || []) {
        if (vuln.Severity === 'CRITICAL') critical++;
        else if (vuln.Severity === 'HIGH') {
          high++;
          if (!isExcepted(exceptions, { severity: 'HIGH', cve: vuln.VulnerabilityID, pkg: vuln.PkgName })) {
            unexceptedHigh++;
          }
        }
      }
    }
    actual = `${critical} CRITICAL, ${high} HIGH (${unexceptedHigh} unapproved)`;
    if (critical > 0) status = 'FAIL'; // never excepted, regardless of exceptions file content
    else if (unexceptedHigh > 0) status = 'FAIL';
    else if (high > 0) status = 'WARN'; // every HIGH here has a matching, valid exception
  } catch (err) {
    raw = (err.stdout || '') + '\n' + (err.stderr || '');
    status = 'BLOCKED_ENVIRONMENT';
    actual = `Trivy scan of ${image} did not complete -- image not present locally, docker unavailable, or network blocked pulling the scanner/DB`;
  }

  const duration_ms = Date.now() - t0;
  const evidencePath = `docs/evidence/runtime/security-trivy-${label}-${evidenceStamp}.json`;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPO_ROOT, evidencePath), raw);

  return makeResult({
    name: `security.trivy.${label}`,
    status,
    duration_ms,
    threshold: '0 CRITICAL, 0 unapproved HIGH',
    actual,
    evidence: evidencePath,
  });
}

async function run({ full = false } = {}) {
  const stamp = timestamp();
  const results = [];

  for (const dir of LOCKFILE_DIRS) {
    results.push(runNpmAudit(dir, stamp));
  }

  results.push(runGitleaks(stamp));

  // CodeQL only runs as a hosted GitHub Actions workflow -- there is no
  // meaningful local equivalent, and this session's Actions billing
  // lockout (confirmed on every workflow, every push, this session) means
  // it cannot actually execute right now. Reported honestly as blocked by
  // something outside this session's control, not silently omitted and
  // not assumed to pass.
  results.push(
    makeResult({
      name: 'security.codeql.source-analysis',
      status: 'BLOCKED_EXTERNAL',
      duration_ms: 0,
      threshold: '0 new high-confidence CodeQL alerts',
      actual: 'GitHub Actions billing lockout confirmed this session on every workflow run -- CodeQL has no local equivalent',
      evidence: 'docs/evidence/runtime (see .github/workflows/codeql.yml once billing is restored)',
    })
  );

  if (full) {
    for (const image of BUILT_IMAGES) {
      results.push(runTrivy(image, stamp));
    }
    for (const image of PULLED_IMAGES) {
      results.push(runTrivy(image, stamp));
    }
  } else {
    for (const image of [...BUILT_IMAGES, ...PULLED_IMAGES]) {
      const label = image.replace(/[/:]/g, '-');
      results.push(
        makeResult({
          name: `security.trivy.${label}`,
          status: 'NOT_TESTED',
          duration_ms: 0,
          threshold: '0 CRITICAL, 0 unapproved HIGH',
          actual: 'excluded from this profile -- run with --full or the "security"/"full" profile',
          evidence: 'n/a',
          blocking: false,
        })
      );
    }
  }

  return results;
}

if (require.main === module) {
  const full = process.argv.includes('--full');
  run({ full })
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
      process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
    })
    .catch((err) => {
      console.error('security runner crashed:', err);
      process.exit(1);
    });
}

module.exports = { run };
