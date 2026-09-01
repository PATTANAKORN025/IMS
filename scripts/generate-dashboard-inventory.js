#!/usr/bin/env node
/**
 * Dashboard Inventory Generator — single source of truth for the dashboard
 * table that used to live hand-typed (and drifting) in README.md and
 * docs/architecture/ARCHITECTURE.md.
 *
 * Reads monitoring/grafana/dashboards/{infrastructure,manufacturing}/*.json directly and writes
 * docs/architecture/DASHBOARD_INVENTORY.md. Panel counts use the exact
 * same computation as tests/lint/dashboard-linter.js (`data.panels.length`)
 * so the two can never disagree.
 *
 * Usage:
 *   node scripts/generate-dashboard-inventory.js          # regenerate the file
 *   node scripts/generate-dashboard-inventory.js --check  # exit 1 if the
 *                                                          # committed file
 *                                                          # is out of date
 *                                                          # (CI drift gate)
 */

const fs = require('fs');
const path = require('path');

const DASHBOARD_DIR = path.join(process.cwd(), 'monitoring', 'grafana', 'dashboards');
const OUT_FILE = path.join(process.cwd(), 'docs', 'architecture', 'DASHBOARD_INVENTORY.md');

// Manufacturing dashboards without "ldi" in their uid are categorized by an
// explicit allowlist rather than a fragile title/tag substring guess.
const MANUFACTURING_UID_EXTRAS = new Set([
  'ims-easy-overview',
  'ims-drilling-machine-detail',
]);

function category(uid) {
  return uid.includes('ldi') || MANUFACTURING_UID_EXTRAS.has(uid) ? 'LDI Manufacturing' : 'Infrastructure';
}

function firstSentence(desc) {
  if (!desc) return '_(no description set in dashboard JSON)_';
  const cleaned = desc.replace(/\s+/g, ' ').trim();
  // Keep it to one reasonably short line in the table; full description
  // lives in the dashboard JSON itself for anyone who opens it in Grafana.
  return cleaned.length > 220 ? cleaned.slice(0, 217) + '...' : cleaned;
}

function listDashboardJsonFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const f of fs.readdirSync(path.join(dir, entry.name))) {
        if (f.endsWith('.json')) out.push(path.join(entry.name, f));
      }
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(entry.name);
    }
  }
  return out.sort();
}

function generate() {
  const files = listDashboardJsonFiles(DASHBOARD_DIR);
  const rows = files.map((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(DASHBOARD_DIR, f), 'utf8'));
    return {
      file: f,
      uid: data.uid || '(no uid)',
      title: data.title || '(untitled)',
      panels: data.panels.length,
      category: category(data.uid || ''),
      description: firstSentence(data.description),
    };
  });

  const infra = rows.filter((r) => r.category === 'Infrastructure');
  const ldi = rows.filter((r) => r.category === 'LDI Manufacturing');

  const table = (list) =>
    [
      '| UID | Title | Panels | Purpose |',
      '|---|---|---|---|',
      ...list.map((r) => `| \`${r.uid}\` | ${r.title} | ${r.panels} | ${r.description} |`),
    ].join('\n');

  const now = new Date().toISOString().slice(0, 10);

  return `# Dashboard Inventory

> **Generated file — do not hand-edit.** Regenerate with:
> \`node scripts/generate-dashboard-inventory.js\`
>
> Source of truth: \`monitoring/grafana/dashboards/{infrastructure,manufacturing}/*.json\` (title, uid, panel
> count, description — all read directly from the JSON, never hand-typed).
> Panel counts use the identical computation as
> \`tests/lint/dashboard-linter.js\` (\`data.panels.length\`), so this file and
> the linter's own console output can never disagree. A CI check
> (\`node scripts/generate-dashboard-inventory.js --check\`) fails the build
> if this file doesn't match what the dashboards currently say.
>
> Last generated: ${now} | Total dashboards: ${rows.length} | Total panels: ${rows.reduce((s, r) => s + r.panels, 0)}

## Infrastructure (${infra.length})

${table(infra)}

## LDI Manufacturing (${ldi.length})

${table(ldi)}
`;
}

function main() {
  const content = generate();
  const checkMode = process.argv.includes('--check');

  if (checkMode) {
    const existing = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : null;
    if (existing === content) {
      console.log('Dashboard inventory is up to date.');
      process.exit(0);
    }
    console.error('Dashboard inventory is OUT OF DATE.');
    console.error(`Run: node scripts/generate-dashboard-inventory.js`);
    if (existing === null) {
      console.error(`(${path.relative(process.cwd(), OUT_FILE)} does not exist yet)`);
    }
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, content);
  console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)}`);
}

main();
