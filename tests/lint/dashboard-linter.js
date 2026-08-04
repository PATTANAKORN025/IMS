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
 *  13. Panel gridPos.h uses the standard height system (warn — not all
 *      dashboards have been migrated yet, see ALLOWED_HEIGHTS)
 *  14. Kiosk dashboards (MAX_HEIGHT) don't exceed their no-scroll ceiling
 *
 * Usage: node tests/lint/dashboard-linter.js
 */

const fs = require('fs');
const path = require('path');

const DASHBOARD_DIR = path.join(process.cwd(), 'monitoring', 'grafana', 'dashboards');

// Standard panel height system (Check 13). KPI stat, normal chart/table,
// deep-analysis panel, plus the h=1 row/CSS-injector sliver. h=4 is the
// GRAFANA_DESIGN_SYSTEM.md §5.2 canonical KPI stat height (added Phase 2);
// h=5 is kept for pre-existing panels that predate that doc section.
// Warn-only for now — most dashboards predate this rule and haven't been
// migrated (see design roadmap); flip to `error` once they have been.
const ALLOWED_HEIGHTS = [1, 4, 5, 8, 10, 16];

// Per-dashboard total-height ceiling (Check 14), keyed by dashboard uid.
// Only kiosk/wall displays get a hard ceiling — analysis dashboards are
// meant to be scrolled and are intentionally left unconstrained.
const MAX_HEIGHT = {
  'ims-ldi-operator-andon': 27, // factory-floor kiosk, near-zero scroll, 1080p
};

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

    // Check 11: Panel Design Tokens (PANEL_TOKENS.md)
    const title = (panel.title || '').toLowerCase();
    const isZScore = title.includes('z-score'); // checked first: a "temperature Z-Score" panel
                                                  // is a Z-Score, not a raw-temperature readout
    const isTemp = !isZScore && title.includes('temp');
    const isHumid = !isZScore && title.includes('humid');

    if (panel.fieldConfig && panel.fieldConfig.defaults) {
      const defs = panel.fieldConfig.defaults;
      // "lengthum" is not a valid Grafana unit ID - it renders as literal suffix
      // text next to the number instead of being interpreted. Forbidden everywhere,
      // regardless of panel title, since real units vary (µm, mJ/cm², kPa, none, %).
      if (defs.unit === 'lengthum') {
        error(file, pid, `Token violation: "lengthum" is not a valid Grafana unit ID (renders as literal text). Use "suffix: µm", "none", or another concrete unit.`);
      }
      if (isZScore) {
        if (defs.unit && defs.unit !== 'none') error(file, pid, `Token violation: Z-Score unit must be none (got ${defs.unit})`);
        if (defs.decimals !== 2) error(file, pid, `Token violation: Z-Score decimals must be 2 (got ${defs.decimals})`);
      } else if (isTemp) {
        if (defs.unit !== 'celsius') error(file, pid, `Token violation: Temp unit must be celsius (got ${defs.unit})`);
        if (defs.decimals !== 1) error(file, pid, `Token violation: Temp decimals must be 1 (got ${defs.decimals})`);
        if (defs.min !== 18) error(file, pid, `Token violation: Temp min must be 18 (got ${defs.min})`);
        if (defs.max !== 28) error(file, pid, `Token violation: Temp max must be 28 (got ${defs.max})`);
      } else if (isHumid) {
        if (defs.unit !== 'humidity') error(file, pid, `Token violation: Humid unit must be humidity (got ${defs.unit})`);
        if (defs.decimals !== 1) error(file, pid, `Token violation: Humid decimals must be 1 (got ${defs.decimals})`);
        if (defs.min !== 40) error(file, pid, `Token violation: Humid min must be 40 (got ${defs.min})`);
        if (defs.max !== 70) error(file, pid, `Token violation: Humid max must be 70 (got ${defs.max})`);
      }
    }

    // Check 8: Panel descriptions
    if (panel.type !== 'clock' && !panel.description) {
      if (panel.type === 'text' && !panel.title && panel.gridPos?.h <= 1) {
        // Skip CSS injector panels
      } else {
        warn(file, pid, `Missing description`);
      }
    }

    // Check 13: standard height system
    if (gp.h !== undefined && !ALLOWED_HEIGHTS.includes(gp.h)) {
      warn(file, pid, `gridPos.h = ${gp.h} not in standard height system (allowed: ${ALLOWED_HEIGHTS.join(', ')})`);
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

      // Check 12: time_bucket in timeseries queries
      for (const target of (panel.targets || [])) {
        if (target.rawSql && !target.rawSql.includes('time_bucket') && !target.rawSql.includes('NO_TIMEFILTER_INTENTIONAL')) {
          error(file, pid, 'timeseries panel missing time_bucket downsampling (add NO_TIMEFILTER_INTENTIONAL if intentional)');
        }
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

  // ── Check 14: kiosk dashboard no-scroll ceiling ──
  const ceiling = MAX_HEIGHT[data.uid];
  if (ceiling !== undefined) {
    const bottom = panels.reduce((max, p) => Math.max(max, p.y + p.h), 0);
    if (bottom > ceiling) {
      error(file, data.uid, `Dashboard total height ${bottom}u exceeds kiosk ceiling ${ceiling}u — must fit on screen without scrolling`);
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
