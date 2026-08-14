#!/usr/bin/env node
/**
 * Ingestion Latency Check -- measures real, end-to-end pipeline latency
 * using the ingest_ts columns added in migration 081. Two stages,
 * neither fabricated:
 *
 *   1. source -> commit: (ingest_ts - source_ts) for every row ingested
 *      in the measurement window, across all 5 instrumented tables.
 *      This is the actual producer-to-database latency -- how long
 *      after a value was generated it became durable.
 *
 *   2. commit -> query-visible: real EXPLAIN ANALYZE execution time of
 *      the query that fetches the most recent row per table, i.e. how
 *      long a dashboard panel's own query takes to retrieve what just
 *      landed. This system has no read replicas, so commit and
 *      visibility are the same instant server-side -- what actually
 *      varies is how long the *query* takes to surface it, which this
 *      measures directly rather than assuming zero.
 *
 * Deliberately NOT measured: time until a Grafana panel's next
 * scheduled auto-refresh actually re-queries (5s-5m depending on the
 * dashboard, a config choice visible in each dashboard's own JSON, not
 * a pipeline latency to report a percentile for).
 *
 * Usage:
 *   node tests/e2e/ingestion-latency-check.js
 *   LATENCY_WINDOW="1 hour" node tests/e2e/ingestion-latency-check.js
 */

const { execFileSync } = require('child_process');

const CONTAINER = process.env.TIMESCALEDB_CONTAINER || 'ims-timescaledb';
const DB_USER = process.env.POSTGRES_USER || 'ims_admin';
const DB_NAME = process.env.POSTGRES_DB || 'ims';
const WINDOW = process.env.LATENCY_WINDOW || '15 minutes';
const MAXBUF = 20 * 1024 * 1024;

const TABLES = [
  { name: 'ldi_data', sourceCol: '"time"' },
  { name: 'ldi_alarm_log', sourceCol: 'logdate' },
  { name: 'sys_metrics', sourceCol: '"time"' },
  { name: 'net_metrics', sourceCol: '"time"' },
  { name: 'ldi_metrics', sourceCol: '"time"' },
];

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-A', '-t', '-F', '\x01', '-f', '-'],
    { encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: MAXBUF }
  ).trim();
}

function explainMs(sql) {
  const wrapped = `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`;
  const out = execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-A', '-t', '-f', '-'],
    { encoding: 'utf8', input: wrapped, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: MAXBUF }
  );
  const plan = JSON.parse(out);
  return plan[0]['Execution Time'];
}

console.log('IMS Ingestion Latency Check');
console.log('='.repeat(60));
console.log(`Window: last ${WINDOW}, real EXPLAIN ANALYZE + committed ingest_ts data\n`);

console.log('-- Stage 1: source -> commit latency (ingest_ts - source_ts) --');
let anyData = false;
for (const t of TABLES) {
  const sql = `
    SELECT
      count(*),
      round(percentile_cont(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ingest_ts - ${t.sourceCol}))) * 1000)::text,
      round(percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ingest_ts - ${t.sourceCol}))) * 1000)::text,
      round(percentile_cont(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ingest_ts - ${t.sourceCol}))) * 1000)::text
    FROM public.${t.name}
    WHERE ingest_ts IS NOT NULL AND ${t.sourceCol} > NOW() - INTERVAL '${WINDOW}';
  `;
  const row = psql(sql);
  const [n, p50, p95, p99] = row.split('\x01').map(s => (s || '').trim());
  if (Number(n) > 0) {
    anyData = true;
    console.log(`  ${t.name.padEnd(15)} n=${n.padStart(6)}  P50=${(p50 || '?').padStart(5)}ms  P95=${(p95 || '?').padStart(5)}ms  P99=${(p99 || '?').padStart(5)}ms`);
  } else {
    console.log(`  ${t.name.padEnd(15)} n=0 (no ingest_ts rows in window -- either quiet, or ingest_ts not yet populated for this table)`);
  }
}

if (!anyData) {
  console.log('\nNo rows with populated ingest_ts found in the window -- nothing to report yet.');
  console.log('ingest_ts is set explicitly by the producer at insert time (migration 081); wait for');
  console.log('at least one ingestion cycle after the fix deployed, then re-run.');
}

console.log('\n-- Stage 2: query-visible latency (real EXPLAIN ANALYZE, most-recent-row query) --');
for (const t of TABLES) {
  const sql = `SELECT * FROM public.${t.name} ORDER BY ${t.sourceCol} DESC LIMIT 1`;
  try {
    const ms = explainMs(sql);
    console.log(`  ${t.name.padEnd(15)} ${ms.toFixed(2)}ms`);
  } catch (e) {
    console.log(`  ${t.name.padEnd(15)} ERROR: ${(e.stderr || e.message || String(e)).toString().trim().split('\n')[0]}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log('Not measured: time until a Grafana panel\'s next scheduled auto-refresh');
console.log('re-queries (5s-5m, a per-dashboard config choice, not a pipeline latency).');
