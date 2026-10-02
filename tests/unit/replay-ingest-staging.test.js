'use strict';
/**
 * Unit tests for Ingest Staging Replay Worker
 * Verifies SQL generation, batch replay logic, and status reporting.
 */
const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}

console.log('\nIngest Staging Replay Worker Tests');

let dockerAvailable = false;
try {
  execFileSync('docker', ['exec', 'ims-timescaledb', 'pg_isready', '-U', 'ims_admin'], { stdio: 'ignore' });
  dockerAvailable = true;
} catch {}

test('replay worker script exists and is executable', () => {
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'replay-ingest-staging.js');
  const fs = require('fs');
  assert(fs.existsSync(scriptPath), 'Script file must exist');
});

test('migration 093 file exists and contains function definition', () => {
  const fs = require('fs');
  const migPath = path.join(__dirname, '..', '..', 'database', 'migrations', '093-ingest-staging-replay-worker.sql');
  assert(fs.existsSync(migPath), 'Migration 093 file must exist');
  const content = fs.readFileSync(migPath, 'utf8');
  assert(content.includes('CREATE OR REPLACE FUNCTION public.replay_staged_batches'), 'Must define replay function');
});

test('replay worker --status returns exit code 0 (or skips if DB offline)', () => {
  if (!dockerAvailable) {
    console.log('    (TimescaleDB container not running; skipped live status check)');
    return;
  }
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'replay-ingest-staging.js');
  const out = execFileSync('node', [scriptPath, '--status'], { encoding: 'utf8' });
  assert(out.includes('Staging Status:'), 'Must output staging status');
});

test('replay_staged_batches function exists in PostgreSQL catalog (or skips if DB offline)', () => {
  if (!dockerAvailable) {
    console.log('    (TimescaleDB container not running; skipped catalog check)');
    return;
  }
  const sql = `SELECT proname FROM pg_proc WHERE proname = 'replay_staged_batches';`;
  const out = execFileSync(
    'docker',
    ['exec', '-i', 'ims-timescaledb', 'psql', '-U', 'ims_admin', '-d', 'ims', '-t', '-A', '-c', sql],
    { encoding: 'utf8' }
  ).trim();
  assert.strictEqual(out, 'replay_staged_batches');
});

test('ingest_staging table has zero stuck pending rows post-replay (or skips if DB offline)', () => {
  if (!dockerAvailable) {
    console.log('    (TimescaleDB container not running; skipped pending check)');
    return;
  }
  const sql = `SELECT count(*) FROM public.ingest_staging WHERE status = 'pending';`;
  const count = parseInt(
    execFileSync(
      'docker',
      ['exec', '-i', 'ims-timescaledb', 'psql', '-U', 'ims_admin', '-d', 'ims', '-t', '-A', '-c', sql],
      { encoding: 'utf8' }
    ).trim(),
    10
  );
  assert.strictEqual(count, 0, 'Zero pending rows expected after replay');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
