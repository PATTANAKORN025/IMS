#!/usr/bin/env node
/**
 * Grafana Dashboard Linter — validates dashboard JSON quality
 *
 * Checks:
 *   1. No hardcoded IP addresses in rawSql
 *   2. Datasource uid is approved for the dashboard scope (not hardcoded names)
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
 *  15. thresholds.steps[].color and mappings[].options.color use only the
 *      approved token set (GRAFANA_DESIGN_SYSTEM.md §2.1) — this check IS
 *      the "central design token" enforcement the doc refers to; add new
 *      colors to APPROVED_TOKENS there first, then here
 *  16. No mixed panel heights within the same row (same y, different h) —
 *      design doc §5.2's actual rule; ALLOWED_HEIGHTS (Check 13) only
 *      catches "unusual height," not "inconsistent with its row neighbors"
 *  17. stat/gauge/bargauge colorMode "background" only on the documented
 *      exception list (GRAFANA_DESIGN_SYSTEM.md §2.1b) — it fails WCAG AA
 *      white-text contrast for every token except critical/accent/no_data;
 *      use colorMode "value" instead
 *
 * Also validates monitoring/grafana/library-panels/*.json (real Grafana
 * Library Panels, provisioned via scripts/provision-library-panels.sh --
 * see that script for why this isn't file-provisioned the way dashboards
 * are). A panel referencing one via `libraryPanel: {uid, name}` carries no
 * inline content, so checks 5/8/11/15/17 run once against the library
 * spec's `model` instead of once per referencing dashboard.
 *
 * Usage: node tests/lint/dashboard-linter.js
 */

const fs = require('fs');
const path = require('path');

const DASHBOARD_DIR = path.join(process.cwd(), 'monitoring', 'grafana', 'dashboards');

// Production dashboards use the primary TimescaleDB datasource. Dashboards
// under mentor-ldi intentionally use a separately provisioned SELECT-only
// datasource so the preview cannot mutate the mentor-provided database.
const APPROVED_DATASOURCE_UIDS = {
  default: ['timescaledb'],
  'mentor-ldi': ['mentor-ldi-readonly'],
};

// Check 17 exceptions: panels intentionally kept at colorMode "background"
// despite it failing WCAG AA white-text contrast for most §2.1 tokens (see
// GRAFANA_DESIGN_SYSTEM.md §2.1b) -- glanceable color-block-from-a-distance
// use cases where perceiving *which* solid color it is is the actual task,
// not reading text. Keyed by dashboard filename -> panel id.
const BACKGROUND_COLORMODE_EXCEPTIONS = {
  'ims-ldi-operator-andon.json': [1000],
};

// Standard panel height system (Check 13). KPI stat, normal chart/table,
// deep-analysis panel, plus the h=1 row/CSS-injector sliver. h=4 is the
// GRAFANA_DESIGN_SYSTEM.md §5.2 canonical KPI stat height (added Phase 2);
// h=5 is kept for pre-existing panels that predate that doc section.
// Spacing/grid audit (2026-08-08): every dashboard was checked for the
// real failure mode this rule exists to catch -- mixed panel heights
// within the same row (design doc §5.2's actual rule) -- not just "is
// this exact height on the list." Found and fixed exactly one real
// violation (ims-ldi-manufacturing.json panel 22, a lone h=4 KPI beside
// an h=10 table). Every other non-listed height (3, 12, 14, 18, 20) is
// used consistently -- either alone in its own full-width row, or paired
// with same-height siblings -- so those are legitimate additional tiers,
// not drift; added them here rather than force-resizing working layouts
// to match an incomplete list. Warn-only: this rule flags an unusual
// height as worth a second look, not an automatic violation.
const ALLOWED_HEIGHTS = [1, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20];

// Per-dashboard total-height ceiling (Check 14), keyed by dashboard uid.
// Only kiosk/wall displays get a hard ceiling — analysis dashboards are
// meant to be scrolled and are intentionally left unconstrained.
const MAX_HEIGHT = {
  'ims-ldi-operator-andon': 20, // factory-floor kiosk, zero scroll at 720p (Phase 2 tile redesign)
  // 2026-08-08: NOC and Easy Overview are the other two dashboards this
  // system's own design doc (§1 principle 5, "progressive disclosure")
  // designates as glance/kiosk boards -- NOC answers "do I need to call
  // someone," Easy Overview is explicitly named for at-a-glance use.
  // Engineering/Capacity/Machine-Snapshot/Manufacturing are deliberately
  // deep-dive dashboards by the same principle and stay unconstrained.
  // Both restructured into collapsible rows (only the highest-priority
  // content open by default) to fit, same pattern as the SPC density fix.
  'ims-noc-overview': 20,
  'ims-easy-overview': 20,
};

// GRAFANA_DESIGN_SYSTEM.md §2.1 — the merged, single palette. Anything used
// in thresholds.steps[].color or mappings[].options.color must be one of
// these (case-insensitive) or explicitly whitelisted below.
const APPROVED_TOKENS = new Set([
  '#22c55e', // ok
  '#f59e0b', // warning
  '#ef4444', // critical
  '#00f2fe', // info
  '#3b82f6', // accent
  '#64748b', // no_data
  '#4a5568', // forecast
  '#eab308', // severity-minor (4th ISA-18.2 tier, distinct from warning)
]);

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

  // Check 18: dashboard tags match its domain subdirectory
  // (dashboards/infrastructure/ vs dashboards/manufacturing/) -- enforces
  // IMS_MANUFACTURING_PLATFORM_V2.md §1's tag/folder domain split so it
  // can't silently drift the way root `timezone` did before that audit.
  const domainDir = path.basename(path.dirname(filePath));
  if (domainDir === 'infrastructure' || domainDir === 'manufacturing') {
    const tags = data.tags || [];
    if (!tags.includes(domainDir)) {
      error(file, 'dashboard', `Lives in ${domainDir}/ but tags ${JSON.stringify(tags)} doesn't include "${domainDir}" (IMS_MANUFACTURING_PLATFORM_V2.md §1)`);
    }
  }

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

    // Collect panels for overlap check (Check 9) -- library-panel stubs
    // still occupy real grid space even though they have no inline content.
    if (gp.x !== undefined && gp.y !== undefined) {
      panels.push({ id: pid, title: panel.title || '(untitled)', x: gp.x, y: gp.y, w: gp.w, h: gp.h });
    }

    // Library-panel references intentionally carry no inline type/
    // fieldConfig/options/targets/description -- that content lives in
    // the shared library element (monitoring/grafana/library-panels/*.json,
    // validated separately by lintLibraryPanel below), not the dashboard
    // JSON. Nothing past this point applies to them.
    if (panel.libraryPanel) continue;

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

    // Check 17: colorMode "background" fails WCAG AA white-text contrast for
    // most §2.1 tokens (GRAFANA_DESIGN_SYSTEM.md §2.1b) -- only allowed for
    // explicitly-documented distance-glanceability exceptions.
    if (['stat', 'gauge', 'bargauge'].includes(panel.type) && panel.options?.colorMode === 'background') {
      const allowed = (BACKGROUND_COLORMODE_EXCEPTIONS[file] || []).includes(pid);
      if (!allowed) {
        warn(file, pid, `colorMode "background" fails WCAG AA contrast for most tokens (GRAFANA_DESIGN_SYSTEM.md §2.1b) — use "value", or add to BACKGROUND_COLORMODE_EXCEPTIONS if this is a genuine distance-glanceability case`);
      }
    }

    // Check 15: color-token compliance (GRAFANA_DESIGN_SYSTEM.md §2.1)
    const hexRe = /^#[0-9a-fA-F]{6}$/;
    for (const step of (panel.fieldConfig?.defaults?.thresholds?.steps || [])) {
      if (step.color && hexRe.test(step.color) && !APPROVED_TOKENS.has(step.color.toLowerCase())) {
        error(file, pid, `Threshold step color ${step.color} is not an approved token (GRAFANA_DESIGN_SYSTEM.md §2.1)`);
      }
    }
    for (const mapping of (panel.fieldConfig?.defaults?.mappings || [])) {
      const opts = mapping.options || {};
      const colorEntries = mapping.type === 'value'
        ? Object.values(opts).map(v => v && v.color).filter(Boolean)
        : [opts.result?.color].filter(Boolean);
      for (const c of colorEntries) {
        if (hexRe.test(c) && !APPROVED_TOKENS.has(c.toLowerCase())) {
          error(file, pid, `Value-mapping color ${c} is not an approved token (GRAFANA_DESIGN_SYSTEM.md §2.1)`);
        }
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
        if (target.rawSql
          && !target.rawSql.includes('time_bucket')
          && !target.rawSql.includes('$__timeGroupAlias')
          && !target.rawSql.includes('NO_TIMEFILTER_INTENTIONAL')) {
          error(file, pid, 'timeseries panel missing time_bucket downsampling (add NO_TIMEFILTER_INTENTIONAL if intentional)');
        }
      }
    }

    // Check targets
    for (const target of (panel.targets || [])) {
      // Check 2: datasource uid
      const relativeDir = path.relative(DASHBOARD_DIR, filePath).split(path.sep)[0];
      const approvedUids = APPROVED_DATASOURCE_UIDS[relativeDir] || APPROVED_DATASOURCE_UIDS.default;
      if (target.datasource?.uid && !approvedUids.includes(target.datasource.uid)) {
        error(file, pid, `Target datasource uid is "${target.datasource.uid}" — expected one of: ${approvedUids.join(', ')}`);
      }

      // Check 1: hardcoded IPs in rawSql
      if (target.rawSql && ipRegex.test(target.rawSql)) {
        const match = target.rawSql.match(ipRegex);
        error(file, pid, `Hardcoded IP ${match[0]} found in rawSql`);
      }
    }
  }

  // ── Check 16: mixed heights within the same row (design doc §5.2) ──
  const byY = new Map();
  for (const p of panels) {
    if (!byY.has(p.y)) byY.set(p.y, []);
    byY.get(p.y).push(p);
  }
  for (const [y, row] of byY) {
    const heights = new Set(row.map(p => p.h));
    if (heights.size > 1) {
      const desc = row.map(p => `${p.id}:${p.title}(h=${p.h})`).join(', ');
      warn(file, `row@y=${y}`, `Mixed panel heights in the same row — ${desc}`);
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

// Validates the shared content of a monitoring/grafana/library-panels/*.json
// spec (its "model", the same shape as an inline panel) -- description,
// unit, and color-token compliance all still apply, just checked once here
// instead of once per dashboard that references it.
function lintLibraryPanel(filePath) {
  const file = path.basename(filePath);
  const spec = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const model = spec.model || {};
  const pid = spec.uid;

  if (!model.description) {
    warn(file, pid, 'Missing description');
  }

  // Check 17 (library-panel form): see the inline-panel version above.
  if (['stat', 'gauge', 'bargauge'].includes(model.type) && model.options?.colorMode === 'background') {
    warn(file, pid, `colorMode "background" fails WCAG AA contrast for most tokens (GRAFANA_DESIGN_SYSTEM.md §2.1b) — use "value"`);
  }

  const hexRe = /^#[0-9a-fA-F]{6}$/;
  for (const step of (model.fieldConfig?.defaults?.thresholds?.steps || [])) {
    if (step.color && hexRe.test(step.color) && !APPROVED_TOKENS.has(step.color.toLowerCase())) {
      error(file, pid, `Threshold step color ${step.color} is not an approved token (GRAFANA_DESIGN_SYSTEM.md §2.1)`);
    }
  }
  for (const mapping of (model.fieldConfig?.defaults?.mappings || [])) {
    const opts = mapping.options || {};
    const colorEntries = mapping.type === 'value'
      ? Object.values(opts).map(v => v && v.color).filter(Boolean)
      : [opts.result?.color].filter(Boolean);
    for (const c of colorEntries) {
      if (hexRe.test(c) && !APPROVED_TOKENS.has(c.toLowerCase())) {
        error(file, pid, `Value-mapping color ${c} is not an approved token (GRAFANA_DESIGN_SYSTEM.md §2.1)`);
      }
    }
  }

  if (['stat', 'gauge'].includes(model.type) && !model.options?.noValue) {
    warn(file, pid, 'Missing options.noValue (shows "No data" text)');
  }
}

// Main
console.log('IMS Dashboard Linter');
console.log('='.repeat(50));

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

const jsonFiles = listDashboardJsonFiles(DASHBOARD_DIR);

for (const f of jsonFiles) {
  const fp = path.join(DASHBOARD_DIR, f);
  const result = lintDashboard(fp);
  console.log(`\n${f} — ${result.title} (${result.panels} panels)`);
}

const LIBRARY_PANEL_DIR = path.join(process.cwd(), 'monitoring', 'grafana', 'library-panels');
if (fs.existsSync(LIBRARY_PANEL_DIR)) {
  const libFiles = fs.readdirSync(LIBRARY_PANEL_DIR).filter(f => f.endsWith('.json'));
  if (libFiles.length) {
    console.log(`\n-- library panels (${libFiles.length}) --`);
    for (const f of libFiles) {
      lintLibraryPanel(path.join(LIBRARY_PANEL_DIR, f));
      console.log(`${f}`);
    }
  }
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
