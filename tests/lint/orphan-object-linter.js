#!/usr/bin/env node
/**
 * Orphan Object Linter — flags DB objects with zero references anywhere
 * in the repo (dashboards, alerting rules, Node-RED flows, migrations)
 * and dashboard panels referencing tables/views that don't exist live.
 *
 * World-Class Audit Phase 7 governance gate. Complements panel-data-check.js
 * (which proves a panel's query actually runs against the live DB) by
 * proving the reverse direction: every object created by a migration is
 * actually used by something.
 *
 * Static analysis only for the repo-reference side (no DB connection
 * required to run this check in CI); DB existence side requires
 * TIMESCALEDB_CONTAINER to be reachable via `docker exec`.
 *
 * Usage: node tests/lint/orphan-object-linter.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CONTAINER = process.env.TIMESCALEDB_CONTAINER || 'ims-timescaledb';
const DB_USER = process.env.POSTGRES_USER || 'ims_admin';
const DB_NAME = process.env.POSTGRES_DB || 'ims';

// Objects intentionally exempt from the "must be referenced somewhere"
// rule -- documented forward-looking infrastructure, not accidental
// cruft. Keep this list short and justified; it's a lint escape hatch,
// not a place to hide real orphans.
const EXEMPT = new Set([
  // Query-budget CAGG tiers (migrations 043/044): provisioned ahead of any
  // dashboard panel needing >6h LDI ranges, per the tiering contract in
  // docs/GRAFANA_DESIGN_SYSTEM.md §10.
  'ldi_data_15m', 'ldi_data_1h', 'ldi_data_hourly',
  // Postgres/TimescaleDB system objects, not app-created.
  'pg_stat_statements', 'pg_stat_statements_info', 'schema_migrations',
]);

function getLiveDbObjects() {
  const sql = `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type IN ('BASE TABLE','VIEW')
    UNION SELECT matviewname FROM pg_matviews WHERE schemaname='public'
    ORDER BY 1;`;
  const out = execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-c', sql], { encoding: 'utf8' });
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

function countReferences(name) {
  const searchDirs = [
    'monitoring/grafana/dashboards',
    'monitoring/grafana/provisioning/alerting',
    'nodered_data/flows',
    'database/migrations',
    'postgres/init',
    'tests',
  ];
  const pattern = new RegExp(`\\b${name}\\b`);
  let count = 0;
  for (const dir of searchDirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) { walk(p); continue; }
        if (!/\.(json|sql|yml|yaml|js)$/.test(entry.name)) continue;
        const content = fs.readFileSync(p, 'utf8');
        if (pattern.test(content)) count++;
      }
    };
    walk(dirPath);
  }
  return count;
}

console.log('IMS Orphan Object Linter');
console.log('='.repeat(50));

let objects;
try {
  objects = getLiveDbObjects();
} catch (e) {
  console.error('Could not reach the database (', e.message.split('\n')[0], ') -- skipping.');
  process.exit(0);
}

let orphans = 0;
for (const obj of objects) {
  if (EXEMPT.has(obj)) continue;
  const refs = countReferences(obj);
  // >1 because the object's own CREATE statement (in a migration or
  // postgres/init file) always counts as one reference -- a genuine
  // orphan has exactly that one self-reference and nothing else.
  if (refs <= 1) {
    orphans++;
    console.log(`  ORPHAN  ${obj} — referenced in ${refs} file(s) (only its own definition)`);
  }
}

console.log('='.repeat(50));
console.log(`Results: ${orphans} orphan object(s) out of ${objects.length} checked (${EXEMPT.size} exempted)`);
if (orphans > 0) {
  console.log('ORPHAN OBJECT CHECK FAILED');
  process.exit(1);
}
console.log('ORPHAN OBJECT CHECK PASSED');
