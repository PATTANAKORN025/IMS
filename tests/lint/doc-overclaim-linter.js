#!/usr/bin/env node
/**
 * Doc Over-Claim Linter — catches the exact class of drift found in the
 * 2026-08-13 documentation audit (docs/DOC_AUDIT_GAP_REPORT.md): prose
 * hardcoding a dashboard/service/migration count that silently goes stale
 * the next time one is added, instead of reading the real current number.
 *
 * Deliberately narrow, not a general prose-accuracy checker. A first,
 * broader version of this script (any "N dashboards" mention) produced
 * more false positives than real findings -- subset counts ("4
 * infrastructure dashboards"), unrelated subsets ("3 dashboards share a
 * kiosk ceiling"), and quoted historical bugs ("prose said 9 dashboards")
 * all look identical to a real over-claim under naive regex. This version
 * only matches claim SHAPES specific enough to be unambiguous:
 *   1. "N dashboards ... across" (this repo's own established phrasing
 *      for a grand total, e.g. "12 dashboards across 2 domains")
 *   2. Paired "N infrastructure ... M manufacturing" claims -- checks
 *      both halves against the real per-domain split, not just the total
 *   3. "013-NNN" migration ranges
 *   4. "N sequenced (migration) files"
 * Real values computed the same way generate-dashboard-inventory.js and
 * generate-schema-inventory.js already do, so this can never disagree
 * with those.
 *
 * Usage: node tests/lint/doc-overclaim-linter.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// Files that are deliberately, correctly historical -- a dated snapshot
// or changelog entry restating an old count is accurate *as a record of
// that point in time*, not drift. Keep this short and justified, same
// convention as orphan-object-linter.js's EXEMPT set.
const EXEMPT_FILES = new Set([
  'docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md', // dated "Baseline (verified <date>)" snapshot
  'docs/archive/DOC_AUDIT_GAP_REPORT.md', // this report; quotes stale text as evidence of what was found
  'docs/archive/DOCUMENTATION_QUALITY_REPORT.md', // quotes a past bug's exact wrong text as the record of the fix
  'docs/audit/LDI_ALARM_FIDELITY_AUDIT.md',
  'docs/audit/LDI_SIMULATOR_REDESIGN_RESULTS.md',
  'docs/evidence/SOAK_TEST_LOG.md',
  'CHANGELOG.md', // every entry is inherently a dated point-in-time record by definition
]);

function isExemptPath(relFile) {
  // Any path with a dot-prefixed segment (.ai/, .mimocode/, .agents/,
  // .github/, .git/, .cursor/, etc.) is AI-tool scratch/config, not
  // documentation this check is meant to police.
  if (relFile.split('/').some((seg) => seg.startsWith('.'))) return true;
  return EXEMPT_FILES.has(relFile);
}

function countJsonFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.json')).length;
}

function getRealDashboardCounts() {
  const base = path.join(ROOT, 'monitoring', 'grafana', 'dashboards');
  const infra = countJsonFiles(path.join(base, 'infrastructure'));
  const manufacturing = countJsonFiles(path.join(base, 'manufacturing'));
  return { infra, manufacturing, total: infra + manufacturing };
}

function getRealServiceCount() {
  const text = fs.readFileSync(path.join(ROOT, 'docker-compose.yaml'), 'utf8');
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => /^services:\s*$/.test(l));
  const endIdx = lines.findIndex((l, i) => i > startIdx && /^(networks|volumes):\s*$/.test(l));
  const block = lines.slice(startIdx + 1, endIdx === -1 ? undefined : endIdx);
  return block.filter((l) => /^  [a-z][a-z0-9-]*:\s*$/.test(l)).length;
}

function getRealMigrationInfo() {
  const dir = path.join(ROOT, 'database', 'migrations');
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name);
  const numbers = files
    .map((f) => f.match(/^(\d{3})-/))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  return { count: files.length, max: Math.max(...numbers) };
}

function listMarkdownFiles() {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.relative(ROOT, path.join(dir, entry.name)).replace(/\\/g, '/');
      if (entry.name === 'node_modules') continue;
      if (entry.isDirectory()) {
        if (isExemptPath(rel + '/')) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.md')) {
        out.push(rel);
      }
    }
  }
  walk(ROOT);
  return out.sort();
}

function main() {
  const dash = getRealDashboardCounts();
  const realServices = getRealServiceCount();
  const realMigrations = getRealMigrationInfo();

  console.log('IMS Doc Over-Claim Linter');
  console.log('='.repeat(50));
  console.log(
    `Real values: ${dash.total} dashboards (${dash.infra} infra + ${dash.manufacturing} manufacturing), ${realServices} services, ${realMigrations.count} migrations (max 0${realMigrations.max})`
  );
  console.log('');

  let errors = 0;
  const files = listMarkdownFiles();

  for (const relFile of files) {
    if (isExemptPath(relFile)) continue;
    const text = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
    const lines = text.split('\n');

    lines.forEach((line, i) => {
      const report = (msg) => {
        console.log(`  ERROR  ${relFile}:${i + 1} — ${msg}`);
        console.log(`         "${line.trim()}"`);
        errors++;
      };

      // Shape 1: "N dashboards ... across" -- this repo's own phrasing for
      // a grand total (e.g. "12 dashboards across 2 domains").
      const totalMatch = line.match(/\b(\d+)\s+(?:Grafana\s+)?dashboards\b[^.\n]{0,40}?\bacross\b/i);
      if (totalMatch) {
        const n = parseInt(totalMatch[1], 10);
        if (n !== dash.total) {
          report(`claims ${n} total dashboards, real count is ${dash.total} (${dash.infra} infra + ${dash.manufacturing} manufacturing)`);
        }
      }

      // Shape 2: paired "N infrastructure ... M manufacturing" -- checks
      // both halves against the real per-domain split.
      const pairMatch = line.match(/\b(\d+)\s+infrastructure\b[\s\S]{0,60}?\b(\d+)\s+manufacturing\b/i);
      if (pairMatch) {
        const [, infraN, mfgN] = pairMatch.map((s, idx) => (idx === 0 ? s : parseInt(s, 10)));
        if (infraN !== dash.infra || mfgN !== dash.manufacturing) {
          report(`claims ${infraN} infrastructure + ${mfgN} manufacturing, real split is ${dash.infra} infra + ${dash.manufacturing} manufacturing`);
        }
      }

      // Shape 3: "013-NNN" migration range.
      const migMatch = line.match(/\b013[-–](\d{3})\b/);
      if (migMatch) {
        const n = parseInt(migMatch[1], 10);
        if (n !== realMigrations.max) {
          report(`claims migration range ending at ${migMatch[1]}, real latest is 0${realMigrations.max}`);
        }
      }

      // Shape 4: "N sequenced files" (migration file count).
      const migCountMatch = line.match(/\b(\d+)\s+sequenced\s+files\b/i);
      if (migCountMatch) {
        const n = parseInt(migCountMatch[1], 10);
        if (n !== realMigrations.count) {
          report(`claims ${n} sequenced migration files, real count is ${realMigrations.count}`);
        }
      }
    });
  }

  console.log('');
  console.log('='.repeat(50));
  console.log(`Results: ${errors} error(s) across ${files.length} markdown files checked`);
  if (errors > 0) {
    console.log('DOC OVER-CLAIM CHECK FAILED');
    process.exit(1);
  }
  console.log('DOC OVER-CLAIM CHECK PASSED');
}

main();
