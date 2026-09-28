#!/usr/bin/env node
'use strict';
/**
 * Runs every SQL query of the drilling and VCP dashboards, and of the VCP
 * alert rules, against a database and reports rows per panel.
 *
 * Meant for the synthetic database (database/mock/eap_backup-schema.sql plus
 * scripts/mock/eap-mock-data.js), to prove each panel returns data with no
 * factory data present. It only reads: each query runs inside a transaction
 * that is rolled back.
 *
 * Grafana macros are expanded the way the Postgres data source expands them;
 * template variables take "All" or, for query variables, every value their
 * own query returns (the dashboards' default), and single-value variables
 * take the first value.
 *
 * Usage:
 *   node scripts/mock/verify-mock-dashboards.js --container=<mock container> --database=eap_backup --psql-user=postgres
 *   options: --hours=24 (time range ending now)  --json=<report.json>
 * Exit code 1 when any query errors; empty panels are reported, not failed.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const CONTAINER = opt('container');
const DATABASE = opt('database', 'eap_backup');
const USER = opt('psql-user', process.env.PGUSER || 'postgres');
const HOURS = Number(opt('hours', '24'));
const ROOT = path.resolve(__dirname, '..', '..');
const DASHBOARDS = ['drilling', 'vcp'].flatMap(dir => {
  const folder = path.join(ROOT, 'monitoring', 'grafana', 'dashboards', dir);
  return fs.readdirSync(folder).filter(f => f.endsWith('.json')).map(f => path.join(folder, f));
});
const RULES = path.join(ROOT, 'monitoring', 'grafana', 'provisioning', 'alerting', 'vcp-rules.yml');

const US = '\x1f';
const RS = '\x1e';

function psql(sql) {
  try {
    const out = execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', USER, '-d', DATABASE,
      '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', US, '-R', RS], { input: sql, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
    const text = out.toString('utf8');
    // psql ends the last record with a newline; trim it so values compare exactly
    return { rows: text.split(RS).map(r => r.replace(/^\n+|\n+$/g, '')).filter(r => r !== '').map(r => r.split(US)) };
  } catch (err) {
    const message = (err.stderr ? err.stderr.toString('utf8') : String(err)).trim().split('\n').find(l => /ERROR/.test(l)) || String(err.message);
    return { error: message };
  }
}

const to = new Date();
const from = new Date(to.getTime() - HOURS * 3600e3);
const lit = d => `'${d.toISOString()}'`;
const INTERVAL = { '1m': '1 minute', '5m': '5 minutes', '1h': '1 hour', '1d': '1 day' };

function expandMacros(sql) {
  return sql
    .replace(/\$__timeFilter\(([^)]+)\)/g, (_, col) => `${col.trim()} BETWEEN ${lit(from)} AND ${lit(to)}`)
    .replace(/\$__timeGroupAlias\(([^,]+),\s*'?([^)']+)'?[^)]*\)/g, (_, col, iv) => `time_bucket('${INTERVAL[iv.trim()] || iv.trim()}', ${col.trim()}) AS "time"`)
    .replace(/\$__timeGroup\(([^,]+),\s*'?([^)']+)'?[^)]*\)/g, (_, col, iv) => `time_bucket('${INTERVAL[iv.trim()] || iv.trim()}', ${col.trim()})`)
    .replace(/\$__timeFrom\(\)/g, lit(from))
    .replace(/\$__timeTo\(\)/g, lit(to))
    .replace(/\$\{__from\}/g, String(from.getTime()))
    .replace(/\$\{__to\}/g, String(to.getTime()))
    .replace(/\$__interval_ms/g, '60000')
    .replace(/\$__interval/g, '1m');
}

function format(values, fmt) {
  if (fmt === 'raw') return values.join(',');
  return values.map(v => `'${String(v).replace(/'/g, "''")}'`).join(',');
}

function expandVariables(sql, vars) {
  return sql.replace(/\$\{([_a-zA-Z][_a-zA-Z0-9]*)(?::([a-z]+))?\}|\$([_a-zA-Z][_a-zA-Z0-9]*)/g, (whole, a, fmt, b) => {
    const name = a || b;
    if (!(name in vars)) return whole;
    return format(vars[name], fmt || (a ? 'raw' : 'raw'));
  });
}

function resolveVariables(dashboard) {
  const vars = {};
  for (const v of (dashboard.templating && dashboard.templating.list) || []) {
    if (v.type === 'custom') {
      const options = String(v.query || '').split(',').map(s => s.trim()).filter(Boolean);
      vars[v.name] = options.includes('All') ? ['All'] : options.slice(0, 1);
    } else if (v.type === 'textbox') {
      vars[v.name] = [''];
    } else if (v.type === 'query') {
      const raw = typeof v.query === 'string' ? v.query : (v.query && (v.query.rawSql || v.query.query)) || v.definition || '';
      const res = psql(`BEGIN;\n${expandVariables(expandMacros(raw), vars).replace(/;\s*$/, '')};\nROLLBACK;`);
      const values = res.error ? [] : res.rows.map(r => (r.length > 1 ? r[1] : r[0]));
      if (v.includeAll && v.multi) vars[v.name] = values.filter(x => x !== 'All' && x !== '__all').length ? values.filter(x => x !== 'All' && x !== '__all') : ['All'];
      else vars[v.name] = values.length ? [values[0]] : [''];
      if (res.error) vars[`__error_${v.name}`] = res.error;
    }
  }
  return vars;
}

function panelsOf(dashboard) {
  const list = [];
  const walk = panels => {
    for (const p of panels || []) {
      if (p.panels) walk(p.panels);
      for (const t of p.targets || []) if (t.rawSql) list.push({ id: p.id, title: p.title, ref: t.refId, sql: t.rawSql });
    }
  };
  walk(dashboard.panels);
  return list;
}

function rulesQueries(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = [];
  let title = '';
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].match(/^\s*-?\s*title:\s*(.+)$/);
    if (t) title = t[1].replace(/^['"]|['"]$/g, '');
    const m = lines[i].match(/^(\s*)rawSql:\s*\|/);
    if (!m) continue;
    const indent = m[1].length;
    const body = [];
    for (i++; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() !== '' && line.search(/\S/) <= indent) { i--; break; }
      body.push(line);
    }
    out.push({ id: 'rule', title, ref: 'A', sql: body.join('\n') });
  }
  return out;
}

function main() {
if (!CONTAINER) {
  console.error('--container=<name> is required: point this at the mock database container, not the live stack');
  process.exit(2);
}
const report = [];
let errors = 0;
for (const file of DASHBOARDS) {
  const dashboard = JSON.parse(fs.readFileSync(file, 'utf8'));
  const vars = resolveVariables(dashboard);
  for (const [k, v] of Object.entries(vars)) if (k.startsWith('__error_')) {
    errors++;
    report.push({ dashboard: dashboard.uid, panel: `variable ${k.slice(8)}`, error: v });
  }
  for (const q of panelsOf(dashboard)) {
    const sql = expandVariables(expandMacros(q.sql), vars).replace(/;\s*$/, '');
    const res = psql(`BEGIN;\n${sql};\nROLLBACK;`);
    if (res.error) errors++;
    report.push({ dashboard: dashboard.uid, panel: `#${q.id} ${q.title}`, ref: q.ref, rows: res.rows ? res.rows.length : null, error: res.error });
  }
}
for (const q of rulesQueries(RULES)) {
  const res = psql(`BEGIN;\n${expandMacros(q.sql).replace(/;\s*$/, '')};\nROLLBACK;`);
  if (res.error) errors++;
  report.push({ dashboard: 'alert-rule', panel: q.title, ref: q.ref, rows: res.rows ? res.rows.length : null, error: res.error });
}

const empty = report.filter(r => !r.error && r.rows === 0);
for (const r of report) {
  const state = r.error ? `ERROR ${r.error}` : r.rows === 0 ? 'EMPTY' : `${r.rows} rows`;
  console.log(`${r.dashboard.padEnd(34)} ${String(r.panel).slice(0, 60).padEnd(60)} ${state}`);
}
console.log(`\n${report.length} queries, ${errors} errors, ${empty.length} empty`);
const json = opt('json');
if (json) fs.writeFileSync(json, JSON.stringify({ from, to, container: CONTAINER, database: DATABASE, report }, null, 2));
process.exit(errors ? 1 : 0);
}

module.exports = { resolveVariables, expandVariables, expandMacros, panelsOf, rulesQueries };
if (require.main === module) main();
