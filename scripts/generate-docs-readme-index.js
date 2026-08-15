#!/usr/bin/env node
/**
 * Regenerates the "Directory Map" + "File Index" sections of each
 * docs/<subdir>/README.md from that subdirectory's real .md file listing --
 * these went stale by hand (docs/audit and docs/evidence were both missing
 * files added by later work, silently, since nothing kept them in sync).
 *
 * Only touches subdirectories that already have a README.md following this
 * template (detected via the "## 🗺️ Directory Map" marker) -- doesn't
 * invent the convention for directories that don't already use it.
 *
 * Usage: node scripts/generate-docs-readme-index.js [--check]
 *   --check: exit 1 if any README would change, without writing (CI use)
 */

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(process.cwd(), 'docs');
const CHECK_ONLY = process.argv.includes('--check');

const MARKER = '## 🗺️ Directory Map';

function titleCase(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function buildSection(dirName, files) {
  const nodeLines = files.map((f, i) => `  ROOT --> F${i}["${f.replace(/\.md$/, '')}"]`).join('\n');
  const indexLines = files.map((f) => `- [${f}](${f})`).join('\n');
  return {
    mapBlock: [
      MARKER,
      '',
      '```mermaid',
      "%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%",
      'flowchart LR',
      `  ROOT["docs/${dirName}"]`,
      nodeLines,
      '```',
    ].join('\n'),
    indexBlock: ['## 📄 File Index', '', indexLines].join('\n'),
  };
}

let changed = [];

for (const entry of fs.readdirSync(DOCS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dirName = entry.name;
  const dirPath = path.join(DOCS_DIR, dirName);
  const readmePath = path.join(dirPath, 'README.md');
  if (!fs.existsSync(readmePath)) continue;

  const original = fs.readFileSync(readmePath, 'utf8');
  if (!original.includes(MARKER)) continue; // not using this convention, don't touch

  const files = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const { mapBlock, indexBlock } = buildSection(dirName, files);

  // Replace from the Directory Map marker through to end of file (both
  // generated sections live there, in that order, per the established template).
  const markerIdx = original.indexOf(MARKER);
  const head = original.slice(0, markerIdx).replace(/\s+$/, '\n\n');
  const rebuilt = head + mapBlock + '\n\n' + indexBlock + '\n';

  if (rebuilt !== original) {
    changed.push(readmePath);
    if (!CHECK_ONLY) {
      fs.writeFileSync(readmePath, rebuilt);
      console.log('Updated', path.relative(process.cwd(), readmePath));
    }
  }
}

if (CHECK_ONLY && changed.length > 0) {
  console.error('Stale directory README index(es):');
  for (const c of changed) console.error(' -', path.relative(process.cwd(), c));
  console.error('Run: node scripts/generate-docs-readme-index.js');
  process.exit(1);
}

if (changed.length === 0) {
  console.log('All directory README indexes already up to date.');
}
