#!/usr/bin/env node
/**
 * RCA Alarm-Category Coverage Linter
 *
 * v_ldi_alarm_category maps alarm codes to an RCA category (VACUUM/
 * REGISTRATION/ALIGNMENT/ENVIRONMENT/CALIBRATION/MOTION/OPTICS/
 * UNCLASSIFIED). Any code that falls through the CASE to UNCLASSIFIED
 * gets zero RCA correlation coverage anywhere in the system.
 *
 * World-Class QA (2026-08-07): rewritten. The previous version parsed
 * database/migrations/036-ldi-alarm-master-mock.sql statically -- the
 * 20-code mock master superseded by the real ~1,820-code Alarm Master
 * import (migration 061). Its "70% of the master must be categorized"
 * floor doesn't scale to 1,820 codes: the overwhelming majority are real
 * vendor faults (camera/servo/network/config) with no telemetry column
 * in this system's schema to correlate against -- there's nothing
 * actionable about categorizing them, and holding the whole master to a
 * coverage floor would just pressure someone into inventing fake
 * category mappings.
 *
 * The coverage that actually matters is over the codes the SIMULATOR can
 * generate (nodered_data/flows.json, almsim_gen) -- those are the only
 * ones that can ever appear in ldi_alarm_log, so they're the only ones
 * an uncategorized code silently costs anything. Reads the live database
 * (categories, and DISTINCT category values) instead of static-parsing
 * SQL text, since the view's canonical serialized form uses `= ANY
 * (ARRAY[...])`, not the hand-written `IN (...)` the old regex expected.
 *
 * Usage: node tests/lint/rca-mapping-coverage.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SIMULATOR_PATH = path.join(process.cwd(), 'nodered_data', 'flows.json');
const DASHBOARD_PATHS = [
  path.join(process.cwd(), 'monitoring', 'grafana', 'dashboards', 'ims-ldi-engineering-analytics.json'),
  path.join(process.cwd(), 'monitoring', 'grafana', 'dashboards', 'ims-ldi-manufacturing.json'),
];
const CONTAINER = process.env.TIMESCALEDB_CONTAINER || 'ims-timescaledb';
const DB_USER = process.env.POSTGRES_USER || 'ims_admin';
const DB_NAME = process.env.POSTGRES_DB || 'ims';

// Coverage floor over simulator-generatable codes only (currently 19; see
// alarm-sync-linter.js for the same extraction). 9 are condition-driven or
// otherwise physically meaningful and already categorized (VACUUM,
// REGISTRATION, ALIGNMENT x4, ENVIRONMENT, MOTION, CALIBRATION, OPTICS);
// the 10 generic-noise replacement codes (camera/PLC/comms/network/DB
// faults, migration 061) have no telemetry column to correlate against
// and are expected to stay UNCLASSIFIED. 9/19 = ~47%.
const MIN_COVERAGE_PCT = 45;

function execSql(sql) {
  const out = execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-F', '\x01', '-c', sql],
    { encoding: 'utf8' }
  );
  return out.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('\x01'));
}

console.log('IMS RCA Alarm-Category Coverage Linter');
console.log('='.repeat(50));

try {
  // 1. Simulator-generatable codes (same structured extraction as
  //    alarm-sync-linter.js).
  const simData = JSON.parse(fs.readFileSync(SIMULATOR_PATH, 'utf8'));
  const alarmNode = simData.find(n => n.type === 'function' && n.id === 'almsim_gen');
  if (!alarmNode || !alarmNode.func) {
    throw new Error('Failed to find the almsim_gen alarm-generator node in nodered_data/flows.json.');
  }
  const func = alarmNode.func;
  const simCodes = new Set();

  const noiseCumMatch = func.match(/const NOISE_CUM = (\[[\s\S]*?\]);/);
  if (!noiseCumMatch) throw new Error('Failed to find NOISE_CUM table in almsim_gen.');
  for (const m of noiseCumMatch[1].matchAll(/\[\s*["']([^"']+)["']\s*,/g)) simCodes.add(m[1]);

  const alignCodesMatch = func.match(/const ALIGN_CODES = (\[[^\]]*\]);/);
  if (!alignCodesMatch) throw new Error('Failed to find ALIGN_CODES array in almsim_gen.');
  for (const m of alignCodesMatch[1].matchAll(/["']([^"']+)["']/g)) simCodes.add(m[1]);

  // RARE_CRITICAL_CODES = ["code", "code", ...] -- LDI Alarm Fidelity Audit
  // fix #8 (2026-08-11): low-probability genuine-Critical branch.
  const rareCriticalMatch = func.match(/const RARE_CRITICAL_CODES = (\[[^\]]*\]);/);
  if (rareCriticalMatch) {
    for (const m of rareCriticalMatch[1].matchAll(/["']([^"']+)["']/g)) simCodes.add(m[1]);
  }

  for (const m of func.matchAll(/newRow\(r\.eqp_id,\s*["']([^"']+)["']/g)) simCodes.add(m[1]);

  if (simCodes.size === 0) {
    throw new Error('Failed to parse any simulator alarm codes from almsim_gen.');
  }
  console.log(`[+] Simulator-generatable codes: ${simCodes.size}`);

  // 2. Live categorization for exactly those codes.
  const codesList = [...simCodes].map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  const rows = execSql(`SELECT alarm_code, category FROM public.v_ldi_alarm_category WHERE alarm_code IN (${codesList});`);
  const codeToCategory = new Map(rows.map(([code, cat]) => [code, cat]));

  const unclassified = [];
  for (const code of simCodes) {
    const cat = codeToCategory.get(code);
    if (!cat || cat === 'UNCLASSIFIED') unclassified.push(code);
  }
  const coveredCount = simCodes.size - unclassified.length;
  const coveragePct = Math.round((coveredCount / simCodes.size) * 1000) / 10;

  console.log('-'.repeat(50));
  console.log(`Coverage: ${coveredCount}/${simCodes.size} (${coveragePct}%)`);
  if (unclassified.length > 0) {
    console.log(`Unclassified codes: ${unclassified.sort().join(', ')}`);
  }

  let errors = 0;
  if (coveragePct < MIN_COVERAGE_PCT) {
    console.error(`  ERROR  Coverage ${coveragePct}% is below the ${MIN_COVERAGE_PCT}% floor.`);
    errors++;
  }

  // 3. Known categories, live (DISTINCT over the whole master, not just
  //    simulator codes, so a category only used by non-simulator vendor
  //    codes still counts as "real").
  const knownCategories = new Set(
    execSql('SELECT DISTINCT category FROM public.v_ldi_alarm_category;').map(([c]) => c)
  );
  console.log(`[+] Known categories (live): ${[...knownCategories].sort().join(', ')}`);

  // 4. Cross-check: every category an RCA dashboard panel filters on must
  //    be real -- catches a typo'd/renamed category before it silently
  //    zeroes out a panel.
  const categoryRefRegex = /category\s*=\s*'(\w+)'|category IN \(('[\w']+(?:,'[\w']+)*)\)/g;
  for (const dashPath of DASHBOARD_PATHS) {
    if (!fs.existsSync(dashPath)) continue;
    const dashContent = fs.readFileSync(dashPath, 'utf8');
    const referenced = new Set();
    let dm;
    while ((dm = categoryRefRegex.exec(dashContent)) !== null) {
      if (dm[1]) referenced.add(dm[1]);
      if (dm[2]) dm[2].split(',').forEach(s => referenced.add(s.replace(/'/g, '')));
    }
    for (const cat of referenced) {
      if (!knownCategories.has(cat)) {
        console.error(`  ERROR  ${path.basename(dashPath)} references RCA category '${cat}', which does not exist in v_ldi_alarm_category`);
        errors++;
      }
    }
    if (referenced.size > 0) {
      console.log(`[+] ${path.basename(dashPath)}: references categories ${[...referenced].join(', ')}`);
    }
  }

  console.log('='.repeat(50));
  if (errors > 0) {
    console.error(`LINT FAILED — ${errors} issue(s) found.`);
    process.exit(1);
  } else {
    console.log(`LINT PASSED — ${coveragePct}% coverage (floor ${MIN_COVERAGE_PCT}%), all dashboard category references valid.`);
    process.exit(0);
  }
} catch (e) {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
}
