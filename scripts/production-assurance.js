#!/usr/bin/env node
'use strict';
// Single entry point for release/production-readiness validation.
//
// Usage:
//   node scripts/production-assurance.js --profile=fast
//   node scripts/production-assurance.js --profile=release
//   node scripts/production-assurance.js --profile=security [--full]
//   node scripts/production-assurance.js --profile=load
//   node scripts/production-assurance.js --profile=dr
//   node scripts/production-assurance.js --profile=full [--allow-container-kill]
//
// Never runs a category outside the requested profile's list -- "full" is
// the only profile that runs everything. Writes one aggregate JSON to
// docs/evidence/runtime/ and renders PRODUCTION-READINESS.md +
// FAILURE_DETECTION_MATRIX.md from it. The verdict in both is always
// scripts/gate.js's pure function output over the JSON -- never hand-typed.

const fs = require('fs');
const path = require('path');
const { computeVerdict } = require('./gate');
const { makeResult } = require('./assurance-schema');
const { renderReadiness } = require('./production-readiness-render');
const { renderFailureMatrix } = require('./failure-detection-matrix-render');

const REPO_ROOT = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence', 'runtime');

const PROFILES = {
  fast: ['unit', 'e2e', 'data-quality', 'integration'],
  release: ['unit', 'e2e', 'data-quality', 'integration', 'security-light', 'disaster-recovery', 'resilience', 'fleet-availability'],
  security: ['security-full'],
  load: ['load', 'fleet-integrity'],
  dr: ['disaster-recovery', 'resilience'],
  full: [
    'unit', 'e2e', 'data-quality', 'integration',
    'security-full', 'disaster-recovery', 'resilience',
    'load', 'fleet-availability', 'fleet-integrity',
  ],
};

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function notImplemented(categoryName) {
  return async () => [
    makeResult({
      name: `${categoryName}.category`,
      status: 'NOT_TESTED',
      duration_ms: 0,
      threshold: 'n/a',
      actual: 'runner not yet implemented -- see docs/superpowers/specs or design discussion for this phase',
      evidence: 'n/a',
      blocking: false,
    }),
  ];
}

async function runCategory(name, opts) {
  switch (name) {
    case 'unit':
      // Intentionally delegated, not "missing" evidence: tests/unit/*.test.js
      // already runs on every commit via scripts/pre-commit.js and
      // .github/workflows/ci.yml. Re-wrapping it here would execute the same
      // suite twice under two different names -- this result documents the
      // delegation so a reader doesn't mistake NOT_TESTED for "nobody checked".
      return [
        makeResult({
          name: 'unit.delegated',
          status: 'NOT_TESTED',
          duration_ms: 0,
          threshold: "n/a -- intentionally delegated, not part of this framework's own evidence set",
          actual: 'unit tests run via scripts/pre-commit.js (every commit) and .github/workflows/ci.yml (every push/PR) -- not duplicated here',
          evidence: 'scripts/pre-commit.js, .github/workflows/ci.yml',
          blocking: false,
        }),
      ];
    case 'e2e':
      return require('../tests/e2e/runner').run({ includeQueryTiming: opts.profile !== 'fast' });
    case 'integration':
      return require('../tests/integration/runner').run();
    case 'data-quality':
      return require('../tests/data-quality/runner').run({ lightweight: opts.profile === 'fast' });
    case 'disaster-recovery':
      return require('../tests/disaster-recovery/runner').run();
    case 'resilience':
      return require('../tests/resilience/runner').run({
        allowContainerKill: !!opts.allowContainerKill,
        target: opts.resilienceTarget || 'timescaledb',
      });
    case 'security-light':
      return require('../tests/security/runner').run({ full: false });
    case 'security-full':
      return require('../tests/security/runner').run({ full: true });
    case 'load':
      return notImplemented('load')();
    // P9's tests/fleet/runner.js emits both fleet.availability.* and
    // fleet.integrity.* results from ONE disposable-stack run (23-device
    // concurrent ingestion, isolated stack, real /ldi-telemetry contract).
    // 'full' runs both category names in the same process -- the runner
    // caches its own result internally so the second call here returns
    // instantly instead of standing the whole disposable stack up twice.
    case 'fleet-availability':
    case 'fleet-integrity':
      return require('../tests/fleet/runner').run();
    default:
      throw new Error(`unknown category "${name}"`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const profileArg = args.find((a) => a.startsWith('--profile='));
  const profile = profileArg ? profileArg.split('=')[1] : 'fast';
  const opts = {
    full: args.includes('--full'),
    allowContainerKill: args.includes('--allow-container-kill'),
    profile,
  };

  if (!PROFILES[profile]) {
    console.error(`unknown profile "${profile}" -- must be one of: ${Object.keys(PROFILES).join(', ')}`);
    process.exit(2);
  }

  const categories = PROFILES[profile];
  console.log(`Production Assurance -- profile: ${profile} (${categories.join(', ')})`);
  console.log('='.repeat(60));

  const allResults = [];
  for (const category of categories) {
    console.log(`\n-> ${category}`);
    const t0 = Date.now();
    let results;
    try {
      results = await runCategory(category, opts);
    } catch (err) {
      results = [
        makeResult({
          name: `${category}.category`,
          status: 'FAIL',
          duration_ms: Date.now() - t0,
          threshold: 'category runner completes without crashing',
          actual: `runner threw: ${err.message}`,
          evidence: 'n/a',
        }),
      ];
    }
    for (const r of results) {
      console.log(`   ${r.status.padEnd(20)} ${r.name} (${r.actual})`);
    }
    allResults.push(...results);
  }

  const stamp = timestamp();
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const aggregatePath = path.join(EVIDENCE_DIR, `production-assurance-${profile}-${stamp}.json`);
  const { verdict, reasons } = computeVerdict(allResults);
  const report = {
    profile,
    timestamp: new Date().toISOString(),
    verdict,
    reasons,
    results: allResults,
  };
  fs.writeFileSync(aggregatePath, JSON.stringify(report, null, 2));

  renderReadiness(report, path.join(REPO_ROOT, 'PRODUCTION-READINESS.md'));
  renderFailureMatrix(report, path.join(REPO_ROOT, 'docs', 'evidence', 'FAILURE_DETECTION_MATRIX.md'));

  console.log('\n' + '='.repeat(60));
  console.log(`VERDICT: ${verdict}`);
  for (const reason of reasons) console.log(`  ${reason}`);
  console.log(`\nAggregate evidence: ${path.relative(REPO_ROOT, aggregatePath)}`);
  console.log('Rendered: PRODUCTION-READINESS.md, docs/evidence/FAILURE_DETECTION_MATRIX.md');

  process.exit(verdict === 'NO-GO' ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { PROFILES, runCategory };
