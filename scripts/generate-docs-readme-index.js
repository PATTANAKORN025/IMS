#!/usr/bin/env node
/**
 * Regenerates the "Directory Map" (Mermaid) and "File Index" sections of each
 * docs/<subdir>/README.md -- and of the th/ and zh-CN/ mirrors -- from that
 * directory's real .md file listing, so neither goes stale by hand.
 *
 * A README takes part when it has both section headings, recognised by their
 * icons because the heading text is translated in the mirrors:
 *   ## <img ... icons/map.svg ...> Directory Map
 *   ## <img ... icons/file-text.svg ...> File Index
 * (The previous marker, "## 🗺️ Directory Map", stopped matching when the
 * headings switched to icons, so --check passed without checking anything.)
 * The map is drawn in columns of at most COLUMN files so a large directory
 * (docs/evidence) stays readable instead of becoming one very tall fan.
 *
 * Usage: node scripts/generate-docs-readme-index.js [--check]
 *   --check: exit 1 if any README would change, without writing (CI use)
 */

const fs = require('fs');
const path = require('path');
const { INIT, CLASS_DEFS } = require('./lib/mermaid-theme');

const ROOT_DIR = process.cwd();
const CHECK_ONLY = process.argv.includes('--check');
const COLUMN = 12;

const ROOTS = [
  { dir: 'docs', title: (d) => `Files in docs/${d}`, descr: (d, n) => `The ${n} documents in docs/${d}, listed alphabetically in columns.` },
  { dir: 'th/docs', title: (d) => `ไฟล์ใน docs/${d}`, descr: (d, n) => `เอกสาร ${n} ไฟล์ใน docs/${d} เรียงตามตัวอักษรเป็นคอลัมน์` },
  { dir: 'zh-CN/docs', title: (d) => `docs/${d} 中的文件`, descr: (d, n) => `docs/${d} 中的 ${n} 个文档，按字母顺序分列。` },
];

const MAP_HEADING = /^## .*icons\/map\.svg.*$/m;
const INDEX_HEADING = /^## .*icons\/file-text\.svg.*$/m;

function mapBlock(root, dirName, files) {
  const lines = [
    '```mermaid',
    INIT,
    'flowchart TB',
    `  accTitle: ${root.title(dirName)}`,
    `  accDescr: ${root.descr(dirName, files.length)}`,
    `  ROOT["docs/${dirName}"]:::store`,
  ];
  for (let c = 0; c * COLUMN < files.length; c++) {
    const col = files.slice(c * COLUMN, (c + 1) * COLUMN);
    lines.push(`  subgraph C${c}[" "]`, '    direction TB');
    col.forEach((f, i) => lines.push(`    F${c * COLUMN + i}["${f.replace(/\.md$/, '')}"]:::flow`));
    // invisible links keep each column in file order
    for (let i = 1; i < col.length; i++) lines.push(`    F${c * COLUMN + i - 1} ~~~ F${c * COLUMN + i}`);
    lines.push('  end', `  ROOT --> C${c}`, `  style C${c} fill:transparent,stroke:#94a3b8`);
  }
  lines.push(CLASS_DEFS, '```');
  return lines.join('\n');
}

const changed = [];

for (const root of ROOTS) {
  const base = path.join(ROOT_DIR, root.dir);
  if (!fs.existsSync(base)) continue;
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(base, entry.name);
    const readmePath = path.join(dirPath, 'README.md');
    if (!fs.existsSync(readmePath)) continue;

    const original = fs.readFileSync(readmePath, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const text = original.replace(/\r\n/g, '\n');
    const mapH = text.match(MAP_HEADING);
    const idxH = text.match(INDEX_HEADING);
    if (!mapH || !idxH || idxH.index < mapH.index) continue; // not using this convention

    const files = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
      .map((e) => e.name)
      // code-point order: localeCompare depends on the ICU build, so --check
      // could disagree between machines
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const head = text.slice(0, mapH.index + mapH[0].length);
    const index = files.map((f) => `- [${f}](${f})`).join('\n');
    const rebuilt = `${head}\n\n${mapBlock(root, entry.name, files)}\n\n${idxH[0]}\n\n${index}\n`;

    if (rebuilt !== text) {
      changed.push(path.relative(ROOT_DIR, readmePath));
      if (!CHECK_ONLY) fs.writeFileSync(readmePath, rebuilt.replace(/\n/g, eol));
    }
  }
}

if (CHECK_ONLY && changed.length > 0) {
  console.error('Stale directory README index(es):');
  for (const c of changed) console.error(' -', c);
  console.error('Run: node scripts/generate-docs-readme-index.js');
  process.exit(1);
}

console.log(changed.length ? `Updated ${changed.length} README(s):\n  ${changed.join('\n  ')}` : 'All directory README indexes already up to date.');
