#!/usr/bin/env node
/**
 * Query Budget Linter — enforces the tiering contract from
 * docs/GRAFANA_DESIGN_SYSTEM.md §10:
 *   raw ldi_data   -> latest-value lookups only (single row by log_id/time)
 *   ldi_data_1m    -> ranges <= 6h
 *   ldi_data_15m   -> ranges 6h - 2 days
 *   ldi_data_1h    -> ranges > 2 days
 *
 * Static analysis only (no DB connection) — flags any panel that queries
 * raw `public.ldi_data` with a RANGE-SCAN shape (time_bucket + $__timeFilter,
 * i.e. "give me a trend over the selected window") instead of a
 * latest-value shape (ORDER BY time DESC LIMIT 1, or a specific log_id/
 * event lookup). A range scan against raw ldi_data is exactly the query
 * shape that gets slow as the table grows — that's what the CAGG tiers
 * exist to prevent.
 *
 * Exemptions (deliberately NOT flagged):
 *   - Cpk/StdDev panels (CROSS JOIN LATERAL unpivot + STDDEV_SAMP) — need
 *     raw signed samples, already scoped to short rolling windows via
 *     dedicated views (v_machine_spc_ranking/fleet), not long-range.
 *   - state-timeline panels — 1-min-bucketed state loses the precise
 *     on/off transitions they need (see migration 043's own scope note).
 *   - queries with `/* NO_TIMEFILTER_INTENTIONAL` — already an established
 *     opt-out convention in this codebase (see dashboard-linter.js Check 12).
 *   - queries with `LIMIT 1` or `DISTINCT ON` — single/latest-row lookups,
 *     exactly what raw ldi_data is for.
 *
 * Usage: node tests/lint/query-budget-linter.js
 */

const fs = require('fs');
const path = require('path');

const DASHBOARD_DIR = path.join(process.cwd(), 'monitoring', 'grafana', 'dashboards');

let errors = 0;
let warnings = 0;

function isLatestValueShape(sql) {
  return /LIMIT\s+1\b/i.test(sql) || /DISTINCT\s+ON\s*\(/i.test(sql);
}

function isRangeScanShape(sql) {
  return /time_bucket\(/i.test(sql) && /\$__timeFilter/i.test(sql);
}

function usesStddev(sql) {
  return /STDDEV_SAMP|STDDEV\(/i.test(sql);
}

function lintDashboard(filePath) {
  const file = path.basename(filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  for (const panel of data.panels || []) {
    if (panel.type === 'row') continue;
    if (panel.type === 'state-timeline') continue; // documented exemption

    for (const target of panel.targets || []) {
      const sql = target.rawSql;
      if (!sql) continue;
      if (!/FROM\s+public\.ldi_data\b(?!_)/i.test(sql)) continue; // not raw ldi_data (or is a _1m/_15m/_1h/_hourly CAGG)
      if (sql.includes('NO_TIMEFILTER_INTENTIONAL')) continue; // established opt-out
      if (isLatestValueShape(sql)) continue; // legitimate latest-value lookup
      if (usesStddev(sql)) continue; // Cpk/StdDev, needs raw samples, documented exemption

      if (isRangeScanShape(sql)) {
        warnings++;
        console.warn(`  WARN   ${file} [panel ${panel.id}] "${panel.title}" [${target.refId}] — range-scan query against raw ldi_data. Per the tiering contract (docs/GRAFANA_DESIGN_SYSTEM.md §10), this should read from ldi_data_1m/_15m/_1h depending on range, unless this is a genuinely bounded/short lookup (add NO_TIMEFILTER_INTENTIONAL or LIMIT 1 if intentional).`);
      }
    }
  }
}

console.log('IMS Query Budget Linter');
console.log('='.repeat(50));

if (!fs.existsSync(DASHBOARD_DIR)) {
  console.error('Dashboard directory not found:', DASHBOARD_DIR);
  process.exit(1);
}

const jsonFiles = fs.readdirSync(DASHBOARD_DIR)
  .filter(f => f.endsWith('.json') && !f.includes('backup'));

for (const f of jsonFiles) {
  lintDashboard(path.join(DASHBOARD_DIR, f));
}

console.log('='.repeat(50));
console.log(`Results: ${errors} errors, ${warnings} warnings`);

if (errors > 0) {
  console.error('LINT FAILED — fix errors above');
  process.exit(1);
} else if (warnings > 0) {
  console.warn('LINT PASSED with warnings — review flagged panels against the tiering contract');
  process.exit(0);
} else {
  console.log('LINT PASSED — no raw-table range scans found');
  process.exit(0);
}
