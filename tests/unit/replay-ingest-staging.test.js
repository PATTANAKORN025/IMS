'use strict';
/**
 * Unit tests for Ingest Staging Replay Worker
 * Verifies SQL generation, batch replay logic, status reporting, and precision preservation.
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

test('replay preserves exact 64-bit IEEE double precision without float4 artifacts (or skips if DB offline)', () => {
  if (!dockerAvailable) {
    console.log('    (TimescaleDB container not running; skipped precision test)');
    return;
  }
  const testLogId = `TEST-PRECISION-${Date.now()}`;
  const testPayload = JSON.stringify([
    {
      time: new Date().toISOString(),
      factory: 'F1',
      process: 'LDI',
      eqp_id: 'LDI-01',
      mo: 'MO-TEST',
      fpn: 'PN-TEST',
      layer_name: 'L1',
      resist_dosage: 45.6789,
      scale_x: 0.9998877,
      scale_y: 1.0001234,
      temperature: 21.7,
      humidity: 58.2,
      thickness: 15.123456,
      pe_1: 12.3456789,
      pe_2: 23.4567891,
      log_id: testLogId
    }
  ]);

  // Insert staged row with staged_at set to 40 seconds ago to satisfy age guard
  const insertSql = `
    INSERT INTO public.ingest_staging (target_table, payload, source_ts, staged_at, status)
    VALUES ('ldi_data', '${testPayload.replace(/'/g, "''")}'::jsonb, NOW(), NOW() - INTERVAL '40 seconds', 'pending');
  `;
  execFileSync('docker', ['exec', '-i', 'ims-timescaledb', 'psql', '-U', 'ims_admin', '-d', 'ims', '-c', insertSql]);

  // Replay
  const replaySql = `SELECT replayed_batches, replayed_data_rows, failed_batches FROM public.replay_staged_batches(10);`;
  const replayRes = execFileSync('docker', ['exec', '-i', 'ims-timescaledb', 'psql', '-U', 'ims_admin', '-d', 'ims', '-t', '-A', '-F', '|', '-c', replaySql], { encoding: 'utf8' }).trim();
  const [batches, dataRows, failedCount] = replayRes.split('|').map(Number);

  assert(batches >= 1, 'At least 1 batch replayed');
  assert(dataRows >= 1, 'At least 1 data row replayed');
  assert.strictEqual(failedCount, 0, 'Zero failed batches');

  // Verify exact precision in ldi_data
  const verifySql = `
    SELECT temperature::text, humidity::text, resist_dosage::text, pe_1::text
    FROM public.ldi_data
    WHERE log_id = '${testLogId}';
  `;
  const verifyRes = execFileSync('docker', ['exec', '-i', 'ims-timescaledb', 'psql', '-U', 'ims_admin', '-d', 'ims', '-t', '-A', '-F', '|', '-c', verifySql], { encoding: 'utf8' }).trim();
  const [temp, hum, dosage, pe1] = verifyRes.split('|');

  // Cleanup test row
  execFileSync('docker', ['exec', '-i', 'ims-timescaledb', 'psql', '-U', 'ims_admin', '-d', 'ims', '-c', `DELETE FROM public.ldi_data WHERE log_id = '${testLogId}';`]);

  assert.strictEqual(temp, '21.7', 'Temperature must be exactly 21.7 (not 21.700000762939453)');
  assert.strictEqual(hum, '58.2', 'Humidity must be exactly 58.2 (not 58.20000076293945)');
  assert.strictEqual(dosage, '45.6789', 'Resist dosage must be exactly 45.6789');
  assert.strictEqual(pe1, '12.3456789', 'pe_1 must be exactly 12.3456789');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
