#!/usr/bin/env node
/**
 * Ingest Staging Replay Worker
 *
 * Replays uncommitted batches stuck in public.ingest_staging table
 * into their target hypertables (ldi_data, ldi_alarm_log) using
 * ON CONFLICT DO NOTHING semantics.
 *
 * Usage:
 *   node scripts/replay-ingest-staging.js [--status] [--limit 500] [--daemon] [--interval 30]
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function getEnvValue(key, defaultValue = '') {
  if (process.env[key]) return process.env[key];
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(new RegExp(`^${key}=\\s*(.*)\\s*$`));
      if (match) {
        return match[1].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return defaultValue;
}

const dbUser = getEnvValue('POSTGRES_USER', 'ims_admin');
const dbName = getEnvValue('POSTGRES_DB', 'ims');
const container = 'ims-timescaledb';

function runPsql(sql) {
  try {
    return execFileSync(
      'docker',
      ['exec', '-i', container, 'psql', '-U', dbUser, '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '|', '-c', sql],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
  } catch (err) {
    throw new Error(`PSQL execution failed: ${err.stderr || err.message}`);
  }
}

function getStatus() {
  const sql = `
    SELECT
      status,
      count(*),
      COALESCE(min(staged_at)::text, '-'),
      COALESCE(max(staged_at)::text, '-')
    FROM public.ingest_staging
    GROUP BY status
    ORDER BY status;
  `;
  const out = runPsql(sql);
  const rows = out ? out.split('\n').filter(Boolean).map(l => l.split('|')) : [];
  return rows;
}

function replay(limit = 500) {
  const sql = `SELECT replayed_batches, replayed_data_rows, replayed_alarm_rows, failed_batches FROM public.replay_staged_batches(${limit});`;
  const out = runPsql(sql);
  if (!out) return { replayed_batches: 0, replayed_data_rows: 0, replayed_alarm_rows: 0, failed_batches: 0 };
  const parts = out.split('|').map(Number);
  return {
    replayed_batches: parts[0] || 0,
    replayed_data_rows: parts[1] || 0,
    replayed_alarm_rows: parts[2] || 0,
    failed_batches: parts[3] || 0,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isDaemon = args.includes('--daemon');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : 500;
  const intIdx = args.indexOf('--interval');
  const intervalSec = intIdx !== -1 && args[intIdx + 1] ? parseInt(args[intIdx + 1], 10) : 30;

  console.log('IMS Ingest Staging Replay Worker');
  console.log('========================================');

  if (isStatus) {
    const status = getStatus();
    console.log('Staging Status:');
    if (status.length === 0) {
      console.log('  (Table empty)');
    } else {
      for (const [st, cnt, minTs, maxTs] of status) {
        console.log(`  [${st}] count=${cnt} earliest=${minTs} latest=${maxTs}`);
      }
    }
    return;
  }

  const runOnce = () => {
    const beforeStatus = getStatus();
    const pendingRow = beforeStatus.find(r => r[0] === 'pending');
    const pendingCount = pendingRow ? parseInt(pendingRow[1], 10) : 0;

    if (pendingCount === 0) {
      console.log(`[${new Date().toISOString()}] No pending batches in ingest_staging.`);
      return;
    }

    console.log(`[${new Date().toISOString()}] Pending batches: ${pendingCount}. Running replay (limit: ${limit})...`);
    const res = replay(limit);
    console.log(`  Replayed batches: ${res.replayed_batches}`);
    console.log(`  LDI Data rows inserted: ${res.replayed_data_rows}`);
    console.log(`  LDI Alarm rows inserted: ${res.replayed_alarm_rows}`);
    if (res.failed_batches > 0) {
      console.warn(`  FAILED batches: ${res.failed_batches}`);
    }
  };

  runOnce();

  if (isDaemon) {
    console.log(`Daemon mode active. Running every ${intervalSec}s. Press Ctrl+C to exit.`);
    setInterval(runOnce, intervalSec * 1000);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
}

module.exports = { replay, getStatus };
