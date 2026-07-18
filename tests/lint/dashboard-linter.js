#!/usr/bin/env node
/**
 * Grafana Dashboard Linter — validates dashboard JSON quality
 *
 * Checks:
 *   1. No hardcoded IP addresses in rawSql
 *   2. Datasource uid is "timescaledb" (not hardcoded names)
 *   3. All timeseries panels have gradientMode
 *   4. All timeseries panels have legend.displayMode "table"
 *   5. All stat/gauge panels have noValue set
 *   6. All timeseries panels have connectNullPoints: true
 *   7. Variable queries use sqlstring filter (not csv)
 *   8. All panels have descriptions (except rows and clock)
 *   9. No 2D bounding box overlaps between panels
 *  10. JSON is valid
 *
 * Usage: node tests/lint/dashboard-linter.js
 */

const fs = require('fs');
const path = require('path');

const DASHBOARD_DIR = path.join(process.cwd(), 'monitoring', 'grafana', 'dashboards');

let errors = 0;
let warnings = 0;

function error(file, panel, msg) {
  errors++;
  console.error(`  ERROR  ${file} [panel ${panel}] — ${msg}`);
}

function warn(file, panel, msg) {
  warnings++;
  console.warn(`  WARN   ${file} [panel ${panel}] — ${msg}`);
}

function lintDashboard(filePath) {
  const file = path.basename(filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Check 1: No hardcoded IPs in rawSql
  const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;

  // Check 7: Variable query safety
  for (const v of (data.templating?.list || [])) {
    if (v.query && v.query.includes('${machine_id:csv}')) {
      error(file, `var:${v.name}`, 'Variable uses :csv filter — must use :sqlstring');
    }
    if (v.query && v.query.includes('${interface:csv}')) {
      error(file, `var:${v.name}`, 'Variable uses :csv filter — must use :sqlstring');
    }
  }

  const panels = [];

  for (const panel of data.panels) {
    if (panel.type === 'row') continue;
    const pid = panel.id;
    const gp = panel.gridPos || {};

    // Collect panels for overlap check (Check 9)
    if (gp.x !== undefined && gp.y !== undefined) {
      panels.push({ id: pid, title: panel.title || '(untitled)', x: gp.x, y: gp.y, w: gp.w, h: gp.h });
    }

    // Check 8: Panel descriptions
    if (panel.type !== 'clock' && !panel.description) {
      warn(file, pid, `Missing description`);
    }

    // Check 5: noValue on stat/gauge
    if (['stat', 'gauge'].includes(panel.type)) {
      if (!panel.options?.noValue) {
        warn(file, pid, `Missing options.noValue (shows "No data" text)`);
      }
    }

    // Timeseries-specific checks
    if (panel.type === 'timeseries') {
      // Check 3: gradientMode
      if (!panel.fieldConfig?.defaults?.custom?.gradientMode) {
        warn(file, pid, 'Missing custom.gradientMode');
      }

      // Check 4: legend table
      const legend = panel.options?.legend;
      if (legend && legend.displayMode !== 'table') {
        warn(file, pid, `Legend displayMode is "${legend.displayMode}" — expected "table"`);
      }

      // Check 6: connectNullPoints
      if (panel.options?.connectNullPoints !== true) {
        warn(file, pid, 'Missing connectNullPoints: true');
      }
    }

    // Check targets
    for (const target of (panel.targets || [])) {
      // Check 2: datasource uid
      if (target.datasource?.uid && target.datasource.uid !== 'timescaledb') {
        error(file, pid, `Target datasource uid is "${target.datasource.uid}" — expected "timescaledb"`);
      }

      // Check 1: hardcoded IPs in rawSql
      if (target.rawSql && ipRegex.test(target.rawSql)) {
        const match = target.rawSql.match(ipRegex);
        error(file, pid, `Hardcoded IP ${match[0]} found in rawSql`);
      }
    }
  }

  // ── Check 9: 2D Bounding Box Overlap Detection ──
  for (let i = 0; i < panels.length; i++) {
    const a = panels[i];
    for (let j = i + 1; j < panels.length; j++) {
      const b = panels[j];
      // Overlap: A.x < B.x+B.w && A.x+A.w > B.x && A.y < B.y+B.h && A.y+A.h > B.y
      if (a.x < b.x + b.w && a.x + a.w > b.x &&
          a.y < b.y + b.h && a.y + a.h > b.y) {
        error(file, `${a.id}:${a.title}`,
          `OVERLAP with panel ${b.id}:${b.title} — ` +
          `A[x=${a.x},y=${a.y},w=${a.w},h=${a.h}] ` +
          `B[x=${b.x},y=${b.y},w=${b.w},h=${b.h}]`);
      }
    }
  }

  return { panels: data.panels.length, title: data.title };
}

// Main
console.log('IMS Dashboard Linter');
console.log('='.repeat(50));

if (!fs.existsSync(DASHBOARD_DIR)) {
  console.error('Dashboard directory not found:', DASHBOARD_DIR);
  process.exit(1);
}

const jsonFiles = fs.readdirSync(DASHBOARD_DIR)
  .filter(f => f.endsWith('.json') && !f.includes('backup'));

for (const f of jsonFiles) {
  const fp = path.join(DASHBOARD_DIR, f);
  const result = lintDashboard(fp);
  console.log(`\n${f} — ${result.title} (${result.panels} panels)`);
}

console.log('\n' + '='.repeat(50));
console.log(`Results: ${errors} errors, ${warnings} warnings`);

if (errors > 0) {
  console.error('LINT FAILED — fix errors above');
  process.exit(1);
} else if (warnings > 0) {
  console.warn('LINT PASSED with warnings');
  process.exit(0);
} else {
  console.log('LINT PASSED — all checks clean');
  process.exit(0);
}
