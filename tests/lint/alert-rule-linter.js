#!/usr/bin/env node
/**
 * Alert Rule Linter — flags Grafana-managed SQL alert rules that select
 * format: 'time_series' without an ORDER BY on their result set.
 *
 * Why this matters: Grafana's SQL alerting evaluates time_series query
 * results as an ordered series. A rawSql query that returns a `time`
 * column with format: time_series but no ORDER BY has no guaranteed row
 * order from Postgres -- if the underlying query shape ever changes to
 * return more than one row per series (e.g. a bucketed CTE gains a
 * second grouping key, or a view starts returning history instead of a
 * single snapshot), evaluation becomes non-deterministic silently, with
 * no test ever catching it because a single-row result "works" either way.
 *
 * format: 'table' rules are intentionally NOT checked here -- those rules
 * aggregate to one row per group (device_id/eqp_id) with no time column
 * selected at all, so "ORDER BY time" doesn't apply; row order has no
 * functional meaning for a threshold/table-format alert.
 *
 * Static analysis only (no DB connection, no Grafana API call).
 *
 * Usage: node tests/lint/alert-rule-linter.js
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ALERTING_DIR = path.join(process.cwd(), 'monitoring', 'grafana', 'provisioning', 'alerting');

let errors = 0;

function lintFile(filePath) {
  const file = path.basename(filePath);
  const doc = yaml.load(fs.readFileSync(filePath, 'utf8'));

  for (const group of doc.groups || []) {
    for (const rule of group.rules || []) {
      for (const step of rule.data || []) {
        const model = step.model || {};
        const sql = model.rawSql;
        if (!sql) continue; // e.g. __expr__ reduce/threshold steps, no SQL
        if (model.format !== 'time_series') continue; // table-format: no time column, not applicable

        if (!/\bORDER\s+BY\b/i.test(sql)) {
          errors++;
          console.error(`  ERROR  ${file} [${rule.uid}] "${rule.title}" refId=${step.refId} — format: time_series query has no ORDER BY. Row order from Postgres is unguaranteed; add ORDER BY 1 (or the time column) even for currently-single-row results.`);
        }
      }
    }
  }
}

console.log('IMS Alert Rule Linter');
console.log('='.repeat(50));

if (!fs.existsSync(ALERTING_DIR)) {
  console.error('Alerting provisioning directory not found:', ALERTING_DIR);
  process.exit(1);
}

const yamlFiles = fs.readdirSync(ALERTING_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

for (const f of yamlFiles) {
  lintFile(path.join(ALERTING_DIR, f));
}

console.log('='.repeat(50));
console.log(`Results: ${errors} errors`);

if (errors > 0) {
  console.error('LINT FAILED — fix errors above');
  process.exit(1);
} else {
  console.log('LINT PASSED — all time_series alert rules have ORDER BY');
  process.exit(0);
}
