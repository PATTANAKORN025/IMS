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
 *   - Zero rows returned, a timeseries panel missing a `time` column, or a
 *     panel this check could not run (unresolved macro, missing database)
 *     -> WARNING by default, escalated to a hard failure when
 *     STRICT_DATA_CHECK=1. A freshly-started CI stack has only run the
 *     simulator for ~30s and genuinely won't have data for every panel yet.
 *
 * Each target runs against the database its data source points at:
 *   timescaledb           -> POSTGRES_DB (default ims)
 *   drilling-timescaledb  -> EAP_DB (default eap_backup)
 * psql runs with ON_ERROR_STOP=1: without it psql exits 0 on a SQL error,
 * and every broken query was silently counted as "0 rows".
 *
 * Usage:
 *   node tests/e2e/panel-data-check.js
 *   STRICT_DATA_CHECK=1 node tests/e2e/panel-data-check.js
 *   PANEL_CHECK_WINDOW='7 days' node tests/e2e/panel-data-check.js
 *   TIMESCALEDB_CONTAINER=... POSTGRES_USER=... EAP_DB=... node tests/e2e/panel-data-check.js
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
const EAP_DB = process.env.EAP_DB || 'eap_backup';
const DATASOURCE_DB = { timescaledb: DB_NAME, 'drilling-timescaledb': EAP_DB };
const FIELD_SEP = '\x01';

const MAXBUF = 20 * 1024 * 1024; // 20MB; some panels legitimately return large result sets

// Runs sql via stdin (not argv -- long IN(...) lists from resolved template
// variables can exceed the OS command-line length limit) and caps the
// result to CHECK_ROW_CAP rows (we only need to know "has rows" / "has a
// time column", not the true row count).
const CHECK_ROW_CAP = 200;

// Leading `SET LOCAL ...;` statements (the drilling and VCP boards use them)
// cannot sit inside the wrapping subquery; run them first in a transaction.
function splitSetPrefix(sql) {
  let rest = sql;
  const sets = [];
  for (;;) {
    const m = rest.match(/^\s*(?:--[^\n]*\n\s*)*(SET\s+LOCAL\s+[^;]+;)/i);
    if (!m) break;
    sets.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  return { sets, body: rest };
}

function runSql(sql, db) {
  const { sets, body } = splitSetPrefix(sql);
  const wrapped = `BEGIN;\n${sets.join('\n')}\nSELECT * FROM (${body.replace(/;\s*$/, '')}) __panel_check LIMIT ${CHECK_ROW_CAP};\nROLLBACK;`;
  try {
    const out = execFileSync(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q',
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

const dbExistsCache = {};
function databaseExists(db) {
  if (!(db in dbExistsCache)) {
    const r = runSql(`SELECT 1 FROM pg_database WHERE datname = '${db.replace(/'/g, "''")}'`, DB_NAME);
    dbExistsCache[db] = r.ok && r.rows > 0;
  }
  return dbExistsCache[db];
}

function datasourceUid(target, panel, dashboard) {
  const ds = (target && target.datasource) || (panel && panel.datasource) || null;
  if (ds && typeof ds === 'object' && ds.uid) return ds.uid;
  if (typeof ds === 'string') return ds;
  return 'timescaledb';
}

function queryText(v) {
  if (typeof v.query === 'string') return v.query;
  if (v.query && typeof v.query === 'object') return v.query.rawSql || v.query.query || '';
  return v.definition || '';
}

// Resolve template variables in declaration order, the way Grafana does:
// the dashboard's saved current value wins; "All" expands to every option.
function resolveVariables(dashboard) {
  const resolved = {}; // name -> array of string values
  for (const v of (dashboard.templating && dashboard.templating.list) || []) {
    let options = [];
    if (v.type === 'query') {
      const db = DATASOURCE_DB[datasourceUid(null, v, dashboard)];
      const sql = queryText(v);
      if (db && sql && databaseExists(db)) {
        const res = runSql(substitute(sql, resolved, '24 hours'), db);
        if (res.ok && res.rows > 0) {
          let colIdx = res.columns.findIndex((c) => c === '__value');
          if (colIdx === -1) colIdx = res.columns.length - 1;
          options = res.dataLines.map((l) => l.split(FIELD_SEP)[colIdx]).filter((x) => x !== undefined);
        }
      }
    } else if (v.type === 'custom') {
      options = String(v.query || '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (v.type === 'constant' || v.type === 'textbox') {
      options = [String(v.query || '')];
    } else if (v.type === 'interval') {
      options = [String((v.query || '5m').split(',')[0]).trim()];
    } else {
      continue;
    }
    const cur = v.current && v.current.value;
    const curList = Array.isArray(cur) ? cur : (cur === undefined || cur === null ? [] : [cur]);
    let values;
    if (curList.some((x) => x === '$__all')) {
      values = options.filter((o) => o !== 'All');
    } else if (curList.length === 0) {
      values = options.slice(0, v.multi ? options.length : 1);
    } else {
      values = curList.map(String);
      // a saved value the options no longer contain is replaced by the first
      // option when the dashboard loads (query/custom variables refresh)
      if ((v.type === 'query' || v.type === 'custom') && options.length > 0 && !values.every((x) => options.includes(x))) {
        values = options.slice(0, 1);
      }
    }
    if (values.length === 0 && v.type === 'textbox') values = [''];
    resolved[v.name] = values;
  }
  return resolved;
}

function sqlList(values) {
  if (!values || values.length === 0) return "''"; // empty IN() would be invalid SQL; force a no-match literal instead
  return values.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(',');
}

const INTERVAL_WORDS = { s: 'seconds', m: 'minutes', h: 'hours', d: 'days' };
function toInterval(g) {
  const m = String(g).trim().replace(/^'|'$/g, '').match(/^(\d+)\s*([smhd])$/);
  return m ? `${m[1]} ${INTERVAL_WORDS[m[2]]}` : String(g).trim().replace(/^'|'$/g, '');
}

function substitute(sql, vars, window) {
  let out = sql;
  const from = `(NOW() - INTERVAL '${window}')`;
  out = out.replace(/\$__timeFilter\(([^)]+)\)/g, (_, col) => `${col} BETWEEN ${from} AND NOW()`);
  out = out.replace(/\$__timeGroupAlias\(([^,]+),\s*([^,)]+)(?:,[^)]*)?\)/g, (_, col, g) => `time_bucket('${toInterval(g)}', ${col.trim()}) AS "time"`);
  out = out.replace(/\$__timeGroup\(([^,]+),\s*([^,)]+)(?:,[^)]*)?\)/g, (_, col, g) => `time_bucket('${toInterval(g)}', ${col.trim()})`);
  out = out.replace(/\$__timeFrom\(\)/g, from).replace(/\$__timeTo\(\)/g, 'NOW()');
  out = out.replace(/\$\{__from(?::[a-z]+)?\}/g, `(EXTRACT(EPOCH FROM ${from}) * 1000)::bigint`);
  out = out.replace(/\$\{__to(?::[a-z]+)?\}/g, '(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint');
  out = out.replace(/\$__interval_ms/g, '60000').replace(/\$__interval/g, '1m');
  // longest names first so $machine_id is not eaten by $machine
  for (const name of Object.keys(vars).sort((a, b) => b.length - a.length)) {
    const values = vars[name];
    const list = sqlList(values);
    const first = values && values.length > 0 ? values[0] : '';
    out = out.split(`\${${name}:sqlstring}`).join(list);
    out = out.split(`\${${name}:singlequote}`).join(list);
    out = out.split(`\${${name}:csv}`).join(values.join(','));
    out = out.split(`\${${name}:raw}`).join(first);
    out = out.split(`\${${name}}`).join(first);
    out = out.replace(new RegExp(`\\$${name}(?![A-Za-z0-9_])`, 'g'), first);
  }
  return out;
}

function hasUnresolvedMacro(sql) {
  return /\$__|\$\{|\$[A-Za-z_][A-Za-z0-9_]*/.test(sql.replace(/'[^']*'/g, "''").replace(/\$\$/g, ''));
}

function allPanels(panels, out = []) {
  for (const p of panels || []) {
    out.push(p);
    if (Array.isArray(p.panels)) allPanels(p.panels, out);
  }
  return out;
}

function softFail(summary, msg) {
  if (STRICT) { summary.errors++; console.error(`  ERROR  ${msg}`); }
  else { summary.warnings++; console.warn(`  WARN   ${msg}`); }
}

function checkDashboard(filePath, summary) {
  const file = path.basename(filePath);
  const dashboard = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const allVars = resolveVariables(dashboard);

  for (const panel of allPanels(dashboard.panels)) {
    if (panel.type === 'row' || panel.type === 'text') continue;
    // a repeated panel gets one value of its repeat variable per copy;
    // check the first copy
    const vars = panel.repeat && allVars[panel.repeat]
      ? { ...allVars, [panel.repeat]: allVars[panel.repeat].slice(0, 1) }
      : allVars;

    for (const target of panel.targets || []) {
      const rawSql = target.rawSql;
      if (!rawSql) continue;
      const where = `${file} [${panel.id}] "${panel.title}" [${target.refId}]`;

      const uid = datasourceUid(target, panel, dashboard);
      const db = DATASOURCE_DB[uid];
      if (!db) { summary.skipped++; softFail(summary, `${where} — data source "${uid}" is not a mapped SQL database`); continue; }
      if (!databaseExists(db)) { summary.skipped++; softFail(summary, `${where} — database "${db}" does not exist here`); continue; }

      const sql = substitute(rawSql, vars, WINDOW);
      if (hasUnresolvedMacro(sql)) {
        summary.skipped++;
        softFail(summary, `${where} — unresolved macro after substitution, not run`);
        continue;
      }

      const res = runSql(sql, db);
      if (!res.ok) {
        summary.errors++;
        console.error(`  ERROR  ${where} — query failed on ${db}: ${res.error}`);
        continue;
      }

      const isTimeseries = panel.type === 'timeseries' || panel.type === 'state-timeline' || target.format === 'time_series';
      const hasTimeCol = res.columns.some((c) => c.toLowerCase() === 'time');

      if (isTimeseries && !hasTimeCol) {
        softFail(summary, `${where} — timeseries panel, result has no "time" column (columns: ${res.columns.join(', ')})`);
        continue;
      }
      if (res.rows === 0) {
        softFail(summary, `${where} — query returned 0 rows`);
        continue;
      }
      summary.passed++;
    }
  }
}

console.log('IMS Panel Data Check');
console.log(`Mode: ${STRICT ? 'STRICT (zero rows, missing time column or a skipped panel = failure)' : 'default (those are warnings; SQL errors always fail)'}`);
console.log(`Time window for $__timeFilter substitution: ${WINDOW}`);
console.log(`Databases: timescaledb -> ${DB_NAME}, drilling-timescaledb -> ${EAP_DB}`);
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
// subset. Used by tests/data-quality/runner.js's lightweight mode.
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
