#!/usr/bin/env node
/**
 * RCA Alarm-Category Coverage Linter
 *
 * v_ldi_alarm_category (database/migrations/036-ldi-alarm-master-mock.sql)
 * is the single source of truth mapping every alarm_id in ldi_alarm_ms_code
 * to an RCA category (VACUUM/REGISTRATION/ALIGNMENT/ENVIRONMENT/CALIBRATION/
 * MOTION/OPTICS/DATA_QUALITY/UNCLASSIFIED). Any code that falls through the
 * CASE to UNCLASSIFIED gets zero RCA correlation coverage anywhere in the
 * system: it won't be shown by any dashboard's Lift table, and nobody would
 * notice unless they went looking.
 *
 * This linter is the tripwire: it parses the master code list and the
 * categorization CASE straight out of the SQL migration (no DB connection
 * needed — same static-analysis approach as alarm-sync-linter.js), computes
 * coverage %, and fails CI if it drops below MIN_COVERAGE_PCT. It also
 * checks that every category the RCA dashboard panels filter on
 * (ims-ldi-engineering-analytics.json, ims-ldi-manufacturing.json) actually
 * exists in the view's CASE — catching a typo'd or renamed category before
 * it silently zeroes out a panel.
 *
 * Usage: node tests/lint/rca-mapping-coverage.js
 */

const fs = require('fs');
const path = require('path');

const MASTER_SQL_PATH = path.join(process.cwd(), 'database', 'migrations', '036-ldi-alarm-master-mock.sql');
const DASHBOARD_PATHS = [
  path.join(process.cwd(), 'monitoring', 'grafana', 'dashboards', 'ims-ldi-engineering-analytics.json'),
  path.join(process.cwd(), 'monitoring', 'grafana', 'dashboards', 'ims-ldi-manufacturing.json'),
];

// Coverage floor: 14/20 = 70% of currently-seeded codes have a real
// category today (6 fall to UNCLASSIFIED: 91012, 91020, 91024, 91029,
// 97014, 20021 — all generic/vendor-catalog-pending codes with no clear
// physical-parameter match). Any regression below this means a new code
// was added to the master list without updating the categorization CASE.
const MIN_COVERAGE_PCT = 70;

console.log('IMS RCA Alarm-Category Coverage Linter');
console.log('='.repeat(50));

try {
  const sqlContent = fs.readFileSync(MASTER_SQL_PATH, 'utf8');

  // 1. Master code list: alarm_id is the first element of each INSERT
  //    tuple, e.g. ('91009','W','91009','...
  const masterRegex = /\('(\d+)','[AW]',/g;
  const masterCodes = new Set();
  let m;
  while ((m = masterRegex.exec(sqlContent)) !== null) {
    masterCodes.add(m[1]);
  }
  if (masterCodes.size === 0) {
    throw new Error('Failed to parse master alarm codes from SQL migration.');
  }
  console.log(`[+] Master alarm codes: ${masterCodes.size}`);

  // 2. Categorization: WHEN alarm_code IN ('a','b') THEN 'CATEGORY'
  const caseRegex = /WHEN alarm_code IN \(([^)]+)\)\s+THEN '(\w+)'/g;
  const codeToCategory = new Map();
  const knownCategories = new Set();
  while ((m = caseRegex.exec(sqlContent)) !== null) {
    const codes = m[1].match(/'(\d+)'/g).map(s => s.replace(/'/g, ''));
    const category = m[2];
    knownCategories.add(category);
    for (const code of codes) codeToCategory.set(code, category);
  }
  if (codeToCategory.size === 0) {
    throw new Error('Failed to parse v_ldi_alarm_category CASE expression from SQL migration.');
  }
  console.log(`[+] Categorized codes: ${codeToCategory.size}, categories found: ${[...knownCategories].join(', ')}`);

  // 3. Coverage
  const unclassified = [];
  for (const code of masterCodes) {
    const cat = codeToCategory.get(code); // undefined = falls to ELSE 'UNCLASSIFIED'
    if (!cat) unclassified.push(code);
  }
  const coveredCount = masterCodes.size - unclassified.length;
  const coveragePct = Math.round((coveredCount / masterCodes.size) * 1000) / 10;

  console.log('-'.repeat(50));
  console.log(`Coverage: ${coveredCount}/${masterCodes.size} (${coveragePct}%)`);
  if (unclassified.length > 0) {
    console.log(`Unclassified codes: ${unclassified.sort().join(', ')}`);
  }

  let errors = 0;

  if (coveragePct < MIN_COVERAGE_PCT) {
    console.error(`  ERROR  Coverage ${coveragePct}% is below the ${MIN_COVERAGE_PCT}% floor.`);
    errors++;
  }

  // 4. Cross-check: every category referenced by an RCA dashboard panel
  //    must be a real category from the view's CASE (catches typos/renames
  //    before they silently zero out a panel).
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
      console.log(`[+] ${path.basename(dashPath)}: references categories ${[...referenced].join(', ')} — all valid`.replace('all valid', errors === 0 ? 'all valid' : 'checked'));
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
