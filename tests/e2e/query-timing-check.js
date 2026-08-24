#!/usr/bin/env node
/**
 * Query Timing Check — measures actual server-side execution time for
 * every panel's resolved SQL query and enforces the query budget from
 * IMS World-Class Audit Phase 4: panel P95 < 80ms.
 *
 * Reuses the same template-variable resolution and $__timeFilter
 * substitution as tests/e2e/panel-data-check.js (that script proves the
 * query is *correct*; this one proves it's *fast*). Uses
 * EXPLAIN (ANALYZE, FORMAT JSON) so the measurement is pure server-side
 * execution time -- no docker-exec/psql process overhead included.
 *
 * Panels are wrapped the same way panel-data-check.js wraps them
 * (SELECT * FROM (<panel sql>) LIMIT N) so the measured plan matches
 * what Grafana would actually ask the DB to run, capped at the same row
 * count so a panel that legitimately returns a huge result set isn't
 * penalized for transfer time this check doesn't care about.
 *
 * Usage:
 *   node tests/e2e/query-timing-check.js
 *   QUERY_BUDGET_MS=80 node tests/e2e/query-timing-check.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DASHBOARD_DIR = path.join(process.cwd(), 'monitoring', 'grafana', 'dashboards');
const WINDOW = process.env.PANEL_CHECK_WINDOW || '30 days';
const CONTAINER = process.env.TIMESCALEDB_CONTAINER || 'ims-timescaledb';
const DB_USER = process.env.POSTGRES_USER || 'ims_admin';
const DB_NAME = process.env.POSTGRES_DB || 'ims';
const BUDGET_MS = Number(process.env.QUERY_BUDGET_MS || 80);
const CHECK_ROW_CAP = 200;
const MAXBUF = 20 * 1024 * 1024;

function runExplain(sql) {
  const wrapped = `EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM (${sql.replace(/;\s*$/, '')}) __timing_check LIMIT ${CHECK_ROW_CAP};`;
  try {
    const out = execFileSync(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-A', '-t', '-f', '-'],
      { encoding: 'utf8', input: wrapped, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: MAXBUF }
    );
    const plan = JSON.parse(out);
    return { ok: true, ms: plan[0]['Execution Time'] };
  } catch (e) {
    return { ok: false, error: (e.stderr || e.message || String(e)).toString().trim().split('\n').slice(0, 3).join(' | ') };
  }
}

function resolveVariables(dashboard) {
  const resolved = {};
  for (const v of (dashboard.templating && dashboard.templating.list) || []) {
    if (v.type !== 'query' || !v.query) continue;
    let sql = substitute(v.query, resolved, '24 hours');
    try {
      const out = execFileSync(
        'docker',
        ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-A', '-F', '\x01', '-P', 'footer=off', '-f', '-'],
        { encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: MAXBUF }
      );
      const lines = out.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
      if (lines.length <= 1) { resolved[v.name] = []; continue; }
      const columns = lines[0].split('\x01');
      let colIdx = columns.findIndex(c => c === '__value');
      if (colIdx === -1) colIdx = columns.length - 1;
      resolved[v.name] = lines.slice(1).map(l => l.split('\x01')[colIdx]).filter(x => x !== undefined);
    } catch {
      resolved[v.name] = [];
    }
  }
  return resolved;
}

function sqlList(values) {
  if (!values || values.length === 0) return "''";
  return values.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
}

function substitute(sql, vars, window) {
  let out = sql;
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

const timings = []; // { file, panel, refId, ms }
let skipped = 0;
let errors = 0;

function checkDashboard(filePath) {
  const file = path.basename(filePath);
  const dashboard = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const vars = resolveVariables(dashboard);

  for (const panel of dashboard.panels || []) {
    if (panel.type === 'row' || panel.type === 'text') continue;

    for (const target of panel.targets || []) {
      const rawSql = target.rawSql;
      if (!rawSql) continue;

      const sql = substitute(rawSql, vars, WINDOW);
      if (hasUnresolvedMacro(sql)) { skipped++; continue; }
      // Same opt-out convention as query-budget-linter.js / dashboard-linter.js:
      // deliberate full-dataset-scope diagnostic panels aren't part of the
      // real-time operator-glances-at-dashboard performance contract.
      // QUERY_BUDGET_EXEMPT is the same idea, scoped specifically to this
      // check: panels whose SQL is legitimate (correct, already optimized
      // or investigated) but whose inherent per-row analytical cost can't
      // hit an 80ms real-time budget -- documented case-by-case in the
      // comment at each call site rather than silently ignored.
      if (rawSql.includes('NO_TIMEFILTER_INTENTIONAL') || rawSql.includes('QUERY_BUDGET_EXEMPT')) { skipped++; continue; }

      const res = runExplain(sql);
      if (!res.ok) {
        errors++;
        console.error(`  ERROR  ${file} [${panel.id}] "${panel.title}" [${target.refId}] — ${res.error}`);
        continue;
      }
      timings.push({ file, panel: panel.title, id: panel.id, refId: target.refId, ms: res.ms });
    }
  }
}

console.log('IMS Query Timing Check');
console.log(`Budget: P95 < ${BUDGET_MS}ms (server-side execution time, EXPLAIN ANALYZE)`);
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
        if (f.endsWith('.json')) out.push(path.join(entry.name, f));
      }
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(entry.name);
    }
  }
  return out.sort();
}

// PANEL_CHECK_ONLY: same convention as tests/e2e/panel-data-check.js --
// comma-separated dashboard-relative paths (forward-slash) to restrict the
// scan. Used by tests/e2e/runner.js's lightweight mode (the "fast"
// assurance profile); unset scans all dashboards, unchanged CLI default.
const ONLY = process.env.PANEL_CHECK_ONLY
  ? process.env.PANEL_CHECK_ONLY.split(',').map((s) => s.trim()).filter(Boolean)
  : null;

let dashboardFiles = listDashboardJsonFiles(DASHBOARD_DIR);
if (ONLY) {
  dashboardFiles = dashboardFiles.filter((f) => ONLY.includes(f.split(path.sep).join('/')));
  console.log(`PANEL_CHECK_ONLY set -- restricting scan to: ${dashboardFiles.join(', ')}`);
}

for (const f of dashboardFiles) {
  checkDashboard(path.join(DASHBOARD_DIR, f));
}

timings.sort((a, b) => a.ms - b.ms);
const p95Index = Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1);
const p95 = timings.length ? timings[p95Index].ms : 0;
const over = timings.filter(t => t.ms > BUDGET_MS);

console.log(`\nMeasured ${timings.length} panel queries (${skipped} skipped, ${errors} errors)`);
console.log(`P95: ${p95.toFixed(2)}ms`);

if (over.length > 0) {
  console.log(`\n${over.length} panel(s) over budget (${BUDGET_MS}ms):`);
  for (const t of over.sort((a, b) => b.ms - a.ms)) {
    console.log(`  ${t.ms.toFixed(2)}ms  ${t.file} [${t.id}] "${t.panel}" [${t.refId}]`);
  }
}

console.log('='.repeat(70));
if (errors > 0) {
  console.log(`QUERY TIMING CHECK FAILED — ${errors} query error(s)`);
  process.exit(1);
}
if (p95 > BUDGET_MS) {
  console.log(`QUERY TIMING CHECK FAILED — P95 ${p95.toFixed(2)}ms exceeds ${BUDGET_MS}ms budget`);
  process.exit(1);
}
console.log('QUERY TIMING CHECK PASSED');
