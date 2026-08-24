#!/usr/bin/env node
/**
 * Panel Data Check — the layer the static linters can't cover.
 *
 * dashboard-linter.js and query-budget-linter.js only look at the SQL text:
 * they can tell you a query is syntactically fine and follows the CAGG
 * tiering contract, but they can't tell you it actually returns anything.
 * IMS-FULL-SYSTEM-AUDIT.md found 15 panels that passed every static check
 * yet rendered "No data" (or, for timeseries panels, "Data does not have a
 * time field") when actually opened in Grafana -- wrong template-variable
 * default, wrong table, a query that forgot to alias its time column, etc.
 * This runs every panel's *actually-resolved* SQL against a live database,
 * the same way Grafana would, and checks it returns real rows.
 *
 * Two severities:
 *   - SQL execution error (bad column/table, syntax error) -> always a
 *     hard failure, regardless of how much data the DB has. A real bug.
 *   - Zero rows returned, or a timeseries panel missing a `time` column
 *     -> WARNING by default, escalated to a hard failure only when
 *     STRICT_DATA_CHECK=1. Same reasoning tests/smoke/query-budget-check.sh
 *     already documents for this repo: a freshly-started CI stack has
 *     only run the simulator for ~30s and genuinely won't have data for
 *     every panel yet, so "zero rows" isn't always a bug in that
 *     environment. Run with STRICT_DATA_CHECK=1 against a dev DB with
 *     real accumulated history (or a long-lived staging/nightly CI
 *     environment) to enforce it for real.
 *
 * Usage:
 *   node tests/e2e/panel-data-check.js
 *   STRICT_DATA_CHECK=1 node tests/e2e/panel-data-check.js
 *   PANEL_CHECK_WINDOW='7 days' node tests/e2e/panel-data-check.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DASHBOARD_DIR = path.join(process.cwd(), 'monitoring', 'grafana', 'dashboards');
const STRICT = process.env.STRICT_DATA_CHECK === '1';
const WINDOW = process.env.PANEL_CHECK_WINDOW || '30 days';
const CONTAINER = process.env.TIMESCALEDB_CONTAINER || 'ims-timescaledb';
const DB_USER = process.env.POSTGRES_USER || 'ims_admin';
const DB_NAME = process.env.POSTGRES_DB || 'ims';
const FIELD_SEP = '\x01';

const MAXBUF = 20 * 1024 * 1024; // 20MB; some panels legitimately return large result sets

// Runs sql via stdin (not argv -- long IN(...) lists from resolved template
// variables can exceed the OS command-line length limit) and caps the
// result to CHECK_ROW_CAP rows (we only need to know "has rows" / "has a
// time column", not the true row count, so this also bounds memory use for
// panels that would otherwise return huge result sets over PANEL_CHECK_WINDOW).
const CHECK_ROW_CAP = 200;
function runSql(sql) {
  const wrapped = `SELECT * FROM (${sql.replace(/;\s*$/, '')}) __panel_check LIMIT ${CHECK_ROW_CAP};`;
  try {
    const out = execFileSync(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME,
       '-A', '-F', FIELD_SEP, '-P', 'footer=off', '-f', '-'],
      { encoding: 'utf8', input: wrapped, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: MAXBUF }
    );
    const lines = out.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
    if (lines.length === 0) return { ok: true, columns: [], rows: 0, dataLines: [] };
    const columns = lines[0].split(FIELD_SEP);
    return { ok: true, columns, rows: lines.length - 1, dataLines: lines.slice(1) };
  } catch (e) {
    return { ok: false, error: (e.stderr || e.message || String(e)).toString().trim().split('\n').slice(0, 3).join(' | ') };
  }
}

// Resolve a templating variable's real option list by running its own
// query against the DB (variables can reference earlier variables, so
// resolve in declaration order and substitute as we go, same as Grafana).
function resolveVariables(dashboard) {
  const resolved = {}; // name -> array of string values
  for (const v of (dashboard.templating && dashboard.templating.list) || []) {
    if (v.type !== 'query' || !v.query) continue;
    let sql = v.query;
    sql = substitute(sql, resolved, '24 hours'); // vars rarely use $__timeFilter; window irrelevant here
    const res = runSql(sql); // -A -F FIELD_SEP, so multi-column results (__text, __value) stay separated
    if (!res.ok || res.rows === 0) { resolved[v.name] = []; continue; }
    // prefer a column literally named __value (Grafana's own convention for these
    // variable queries); fall back to the last column if __value isn't present
    let colIdx = res.columns.findIndex(c => c === '__value');
    if (colIdx === -1) colIdx = res.columns.length - 1;
    resolved[v.name] = res.dataLines.map(l => l.split(FIELD_SEP)[colIdx]).filter(x => x !== undefined);
  }
  return resolved;
}

function sqlList(values) {
  if (!values || values.length === 0) return "''"; // empty IN() would be invalid SQL; force a no-match literal instead
  return values.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
}

function substitute(sql, vars, window) {
  let out = sql;
  // $__timeFilter(col) -> col BETWEEN NOW() - INTERVAL 'window' AND NOW()
  out = out.replace(/\$__timeFilter\(([^)]+)\)/g, (_, col) => `${col} BETWEEN NOW() - INTERVAL '${window}' AND NOW()`);
  for (const [name, values] of Object.entries(vars)) {
    const list = sqlList(values);
    const first = values && values.length > 0 ? values[0] : '';
    out = out.split(`\${${name}:sqlstring}`).join(list);
    out = out.split(`\${${name}:singlequote}`).join(list);
    out = out.split(`\${${name}}`).join(first);
  }
  return out;
}

function hasUnresolvedMacro(sql) {
  return /\$__|\$\{/.test(sql);
}

function checkDashboard(filePath, summary) {
  const file = path.basename(filePath);
  const dashboard = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const vars = resolveVariables(dashboard);

  for (const panel of dashboard.panels || []) {
    if (panel.type === 'row' || panel.type === 'text') continue;

    for (const target of panel.targets || []) {
      const rawSql = target.rawSql;
      if (!rawSql) continue;

      const sql = substitute(rawSql, vars, WINDOW);
      if (hasUnresolvedMacro(sql)) {
        summary.skipped++;
        console.log(`  SKIP   ${file} [${panel.id}] "${panel.title}" — unresolved macro after substitution, not covered by this check`);
        continue;
      }

      const res = runSql(sql);
      if (!res.ok) {
        summary.errors++;
        console.error(`  ERROR  ${file} [${panel.id}] "${panel.title}" [${target.refId}] — query failed: ${res.error}`);
        continue;
      }

      const isTimeseries = panel.type === 'timeseries' || panel.type === 'state-timeline' || target.format === 'time_series';
      const hasTimeCol = res.columns.some(c => c.toLowerCase() === 'time');

      if (isTimeseries && !hasTimeCol) {
        const msg = `${file} [${panel.id}] "${panel.title}" [${target.refId}] — timeseries panel, result has no "time" column (columns: ${res.columns.join(', ')})`;
        if (STRICT) { summary.errors++; console.error(`  ERROR  ${msg}`); }
        else { summary.warnings++; console.warn(`  WARN   ${msg}`); }
        continue;
      }

      if (res.rows === 0) {
        const msg = `${file} [${panel.id}] "${panel.title}" [${target.refId}] — query returned 0 rows`;
        if (STRICT) { summary.errors++; console.error(`  ERROR  ${msg}`); }
        else { summary.warnings++; console.warn(`  WARN   ${msg}`); }
        continue;
      }

      summary.passed++;
    }
  }
}

console.log('IMS Panel Data Check');
console.log(`Mode: ${STRICT ? 'STRICT (zero-rows/missing-time-column = failure)' : 'default (zero-rows/missing-time-column = warning)'}`);
console.log(`Time window for $__timeFilter substitution: ${WINDOW}`);
console.log('='.repeat(70));

if (!fs.existsSync(DASHBOARD_DIR)) {
  console.error('Dashboard directory not found:', DASHBOARD_DIR);
  process.exit(1);
}

function listDashboardJsonFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const f of fs.readdirSync(path.join(dir, entry.name))) {
        if (f.endsWith('.json') && !f.includes('backup')) out.push(path.join(entry.name, f));
      }
    } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.includes('backup')) {
      out.push(entry.name);
    }
  }
  return out;
}

// PANEL_CHECK_ONLY: comma-separated dashboard-relative paths (forward-slash,
// e.g. "manufacturing/ims-easy-overview.json") to restrict the scan to a
// subset. Used by tests/data-quality/runner.js's lightweight mode (the
// "fast" assurance profile) so a quick run doesn't have to walk all 139
// panel targets across all 15 dashboards every time; unset (the CLI
// default) scans everything, unchanged from before this option existed.
const ONLY = process.env.PANEL_CHECK_ONLY
  ? process.env.PANEL_CHECK_ONLY.split(',').map((s) => s.trim()).filter(Boolean)
  : null;

const summary = { passed: 0, warnings: 0, errors: 0, skipped: 0 };
let jsonFiles = listDashboardJsonFiles(DASHBOARD_DIR);
if (ONLY) {
  jsonFiles = jsonFiles.filter((f) => ONLY.includes(f.split(path.sep).join('/')));
  console.log(`PANEL_CHECK_ONLY set -- restricting scan to: ${jsonFiles.join(', ')}`);
}

for (const f of jsonFiles) {
  checkDashboard(path.join(DASHBOARD_DIR, f), summary);
}

console.log('='.repeat(70));
console.log(`Results: ${summary.passed} passed, ${summary.warnings} warnings, ${summary.errors} errors, ${summary.skipped} skipped`);

if (summary.errors > 0) {
  console.error('PANEL DATA CHECK FAILED');
  process.exit(1);
}
console.log('PANEL DATA CHECK PASSED' + (summary.warnings > 0 ? ' (with warnings -- see above)' : ''));
process.exit(0);
