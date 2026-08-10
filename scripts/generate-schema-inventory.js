#!/usr/bin/env node
/**
 * Database Schema Inventory Generator — single source of truth for the
 * table/column/view reference that used to live hand-typed (and drifting,
 * see the migration-034-vs-064 saga) in README.md and ARCHITECTURE.md.
 *
 * Queries the LIVE database's information_schema + TimescaleDB metadata
 * views directly (via `docker exec ims-timescaledb psql`, matching every
 * other DB script in this repo -- no new npm dependency) and writes
 * docs/architecture/DATABASE_SCHEMA.md. Requires the timescaledb container
 * to be running and migrated.
 *
 * Usage:
 *   node scripts/generate-schema-inventory.js          # regenerate the file
 *   node scripts/generate-schema-inventory.js --check  # exit 1 if the
 *                                                       # committed file is
 *                                                       # out of date
 *                                                       # (CI drift gate)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CONTAINER = process.env.TIMESCALEDB_CONTAINER || 'ims-timescaledb';
const DB_USER = process.env.POSTGRES_USER || 'ims_admin';
const DB_NAME = process.env.POSTGRES_DB || 'ims';
const OUT_FILE = path.join(process.cwd(), 'docs', 'architecture', 'DATABASE_SCHEMA.md');

function psql(sql) {
  try {
    const out = execFileSync(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-F', '\t', '-c', sql],
      { encoding: 'utf8' }
    );
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => l.split('\t'));
  } catch (e) {
    console.error(`FATAL: could not query ${CONTAINER} (is the stack up? "docker compose up -d timescaledb")`);
    console.error(e.message);
    process.exit(1);
  }
}

function generate() {
  const tables = psql(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname;
  `).map((r) => r[0]);

  const hypertables = new Set(
    psql(`SELECT hypertable_name FROM timescaledb_information.hypertables;`).map((r) => r[0])
  );

  const caggs = psql(`
    SELECT view_name, materialization_hypertable_name
    FROM timescaledb_information.continuous_aggregates
    ORDER BY view_name;
  `);
  const caggNames = new Set(caggs.map((r) => r[0]));

  // pg_stat_statements is an installed extension, not application schema --
  // its views land in "public" too but aren't something anyone maintaining
  // this app's data model needs listed alongside v_ldi_*.
  const EXTENSION_NOISE = new Set(['pg_stat_statements', 'pg_stat_statements_info']);

  const plainViews = psql(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
    ORDER BY c.relname;
  `)
    .map((r) => r[0])
    .filter((v) => !caggNames.has(v) && !EXTENSION_NOISE.has(v));

  const matViews = psql(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'm'
    ORDER BY c.relname;
  `).map((r) => r[0]);

  function columnCount(name) {
    const r = psql(`SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='${name}';`);
    return r.length ? r[0][0] : '?';
  }

  const tableRows = tables.map((t) => ({
    name: t,
    columns: columnCount(t),
    hypertable: hypertables.has(t),
  }));

  const migrationFiles = fs
    .readdirSync(path.join(process.cwd(), 'database', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const migrationRange =
    migrationFiles.length > 0
      ? `${migrationFiles[0].split('-')[0]}-${migrationFiles[migrationFiles.length - 1].split('-')[0]}`
      : '(none)';

  const now = new Date().toISOString().slice(0, 10);

  const tableTable = [
    '| Table | Columns | Hypertable? |',
    '|---|---|---|',
    ...tableRows.map((t) => `| \`${t.name}\` | ${t.columns} | ${t.hypertable ? 'Yes' : '—'} |`),
  ].join('\n');

  const caggTable = [
    '| Continuous Aggregate | Materialized Hypertable |',
    '|---|---|',
    ...caggs.map((r) => `| \`${r[0]}\` | \`${r[1]}\` |`),
  ].join('\n');

  const viewList = plainViews.map((v) => `- \`${v}\``).join('\n');
  const matViewList = matViews.length
    ? matViews.map((v) => `- \`${v}\``).join('\n')
    : '_(none)_';

  return `# Database Schema Inventory

> **Generated file — do not hand-edit.** Regenerate with:
> \`node scripts/generate-schema-inventory.js\`
>
> Source of truth: the live database's own \`information_schema\` and
> \`timescaledb_information.*\` catalogs — queried directly, never
> hand-typed. A CI check (\`node scripts/generate-schema-inventory.js
> --check\`) fails the build if this file doesn't match what the database
> currently reports. Requires the \`timescaledb\` container to be running
> and fully migrated.
>
> Last generated: ${now} | Migrations applied: ${migrationFiles.length} (${migrationRange}) | Tables: ${tableRows.length} | Continuous aggregates: ${caggs.length} | Plain views: ${plainViews.length} | Materialized views: ${matViews.length}

## Tables

${tableTable}

## Continuous Aggregates (TimescaleDB)

${caggTable}

## Materialized Views (plain PostgreSQL, refreshed via TimescaleDB background jobs)

${matViewList}

## Plain Views

${viewList}
`;
}

function main() {
  const content = generate();
  const checkMode = process.argv.includes('--check');

  if (checkMode) {
    const existing = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : null;
    // Ignore the "Last generated: <date>" line when diffing -- that line
    // is expected to change every run even with zero schema drift, and
    // shouldn't fail CI on its own.
    const strip = (s) => (s || '').replace(/Last generated: \d{4}-\d{2}-\d{2}/, 'Last generated: DATE');
    if (strip(existing) === strip(content)) {
      console.log('Database schema inventory is up to date.');
      process.exit(0);
    }
    console.error('Database schema inventory is OUT OF DATE.');
    console.error('Run: node scripts/generate-schema-inventory.js');
    if (existing === null) {
      console.error(`(${path.relative(process.cwd(), OUT_FILE)} does not exist yet)`);
    }
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, content);
  console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)}`);
}

main();
