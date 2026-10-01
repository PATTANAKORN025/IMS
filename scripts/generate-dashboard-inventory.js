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
const TH_FILE = path.join(process.cwd(), 'th', 'docs', 'architecture', 'DASHBOARD_INVENTORY.md');
const ZH_FILE = path.join(process.cwd(), 'zh-CN', 'docs', 'architecture', 'DASHBOARD_INVENTORY.md');

// ims-easy-overview doesn't have "ldi" in its uid but is entirely an LDI
// fleet dashboard (see its description) -- categorize by an explicit
// allowlist for that one exception rather than a fragile substring guess.
const LDI_UID_EXTRAS = new Set(['ims-easy-overview']);

function category(file, uid) {
  const norm = file.replace(/\\/g, '/');
  if (norm.startsWith('drilling/')) return 'Drilling Operations (CNC)';
  if (norm.startsWith('manufacturing/')) return 'Lithography Operations (LDI PCB)';
  if (norm.startsWith('infrastructure/')) return 'Platform Infrastructure & NOC';
  if (norm.startsWith('vcp/')) return 'Plating Operations (VCP Line)';
  if (uid.includes('ldi') || LDI_UID_EXTRAS.has(uid)) return 'Lithography Operations (LDI PCB)';
  return 'Platform Infrastructure & NOC';
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
      category: category(f, data.uid || ''),
      description: firstSentence(data.description),
    };
  });

  const drilling = rows.filter((r) => r.category === 'Drilling Operations (CNC)');
  const ldi = rows.filter((r) => r.category === 'Lithography Operations (LDI PCB)');
  const infra = rows.filter((r) => r.category === 'Platform Infrastructure & NOC');
  const vcp = rows.filter((r) => r.category === 'Plating Operations (VCP Line)');

  const table = (list) =>
    [
      '| UID | Title | Panels | Purpose |',
      '|---|---|---|---|',
      ...list.map((r) => `| \`${r.uid}\` | ${r.title} | ${r.panels} | ${r.description} |`),
    ].join('\n');

  const now = new Date().toISOString().slice(0, 10);

  return {
    content: `# Dashboard Inventory

> **Generated file — do not hand-edit.** Regenerate with:
> \`node scripts/generate-dashboard-inventory.js\`
>
> Source of truth: \`monitoring/grafana/dashboards/{drilling,infrastructure,manufacturing,vcp}/*.json\` (title, uid, panel
> count, description — all read directly from the JSON, never hand-typed).
> Panel counts use the identical computation as
> \`tests/lint/dashboard-linter.js\` (\`data.panels.length\`), so this file and
> the linter's own console output can never disagree. A CI check
> (\`node scripts/generate-dashboard-inventory.js --check\`) fails the build
> if this file doesn't match what the dashboards currently say.
>
> Last generated: ${now} | Total dashboards: ${rows.length} | Total panels: ${rows.reduce((s, r) => s + r.panels, 0)}

## 01 · Drilling Operations (${drilling.length})

${table(drilling)}

## 02 · Lithography Operations / LDI Manufacturing (${ldi.length})

${table(ldi)}

## 03 · Platform Infrastructure & NOC (${infra.length})

${table(infra)}

## 04 · Plating Operations / VCP Line (${vcp.length})

${table(vcp)}
`,
    rows,
    now,
  };
}

function updateLocalized(filePath, rows, dateStr, lang) {
  if (!fs.existsSync(filePath)) return null;
  let text = fs.readFileSync(filePath, 'utf8');
  const totalDash = rows.length;
  const totalPanels = rows.reduce((s, r) => s + r.panels, 0);

  if (lang === 'th') {
    text = text.replace(
      /สร้างล่าสุด: \d{4}-\d{2}-\d{2} \| แดชบอร์ดทั้งหมด: \d+ \| พาเนลทั้งหมด: \d+/,
      `สร้างล่าสุด: ${dateStr} | แดชบอร์ดทั้งหมด: ${totalDash} | พาเนลทั้งหมด: ${totalPanels}`
    );
  } else if (lang === 'zh') {
    text = text.replace(
      /最后生成时间：\d{4}-\d{2}-\d{2} \| 仪表板总数：\d+ \| 面板总数：\d+/,
      `最后生成时间：${dateStr} | 仪表板总数：${totalDash} | 面板总数：${totalPanels}`
    );
  }

  const uidMap = new Map(rows.map((r) => [r.uid, r.panels]));
  const lines = text.split('\n');
  const updatedLines = lines.map((line) => {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*(\d+)\s*\|\s*(.*)\|$/);
    if (match) {
      const uid = match[1];
      const title = match[2];
      const desc = match[4];
      if (uidMap.has(uid)) {
        return `| \`${uid}\` | ${title}| ${uidMap.get(uid)} | ${desc}|`;
      }
    }
    return line;
  });

  return updatedLines.join('\n');
}

function checkLocalized(filePath, rows, lang) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing localized inventory file: ${path.relative(process.cwd(), filePath)}`);
    return false;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const totalDash = rows.length;
  const totalPanels = rows.reduce((s, r) => s + r.panels, 0);

  const metaPattern = lang === 'th'
    ? /สร้างล่าสุด: \d{4}-\d{2}-\d{2} \| แดชบอร์ดทั้งหมด: (\d+) \| พาเนลทั้งหมด: (\d+)/
    : /最后生成时间：\d{4}-\d{2}-\d{2} \| 仪表板总数：(\d+) \| 面板总数：(\d+)/;

  const m = text.match(metaPattern);
  if (!m || parseInt(m[1], 10) !== totalDash || parseInt(m[2], 10) !== totalPanels) {
    console.error(`Metadata totals mismatch in ${path.relative(process.cwd(), filePath)}`);
    return false;
  }

  const uidMap = new Map(rows.map((r) => [r.uid, r.panels]));
  for (const line of text.split('\n')) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*(\d+)\s*\|\s*(.*)\|$/);
    if (match) {
      const uid = match[1];
      const panels = parseInt(match[3], 10);
      if (uidMap.has(uid) && uidMap.get(uid) !== panels) {
        console.error(`Panel count mismatch for ${uid} in ${path.relative(process.cwd(), filePath)}: expected ${uidMap.get(uid)}, found ${panels}`);
        return false;
      }
    }
  }
  return true;
}

function main() {
  const { content, rows, now } = generate();
  const checkMode = process.argv.includes('--check');

  if (checkMode) {
    const existing = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : null;
    const strip = (s) => (s || '').replace(/\r\n/g, '\n').replace(/Last generated: \d{4}-\d{2}-\d{2}/, 'Last generated: DATE').trim();
    const enOk = strip(existing) === strip(content);
    const thOk = checkLocalized(TH_FILE, rows, 'th');
    const zhOk = checkLocalized(ZH_FILE, rows, 'zh');

    if (enOk && thOk && zhOk) {
      console.log('Dashboard inventory is up to date across all languages.');
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

  const updatedTh = updateLocalized(TH_FILE, rows, now, 'th');
  if (updatedTh) {
    fs.writeFileSync(TH_FILE, updatedTh);
    console.log(`Wrote ${path.relative(process.cwd(), TH_FILE)}`);
  }

  const updatedZh = updateLocalized(ZH_FILE, rows, now, 'zh');
  if (updatedZh) {
    fs.writeFileSync(ZH_FILE, updatedZh);
    console.log(`Wrote ${path.relative(process.cwd(), ZH_FILE)}`);
  }
}

main();
