#!/usr/bin/env node
/**
 * Repo Hygiene Linter — fails if a tracked file is the kind of thing that
 * should never be committed: something a build/install step reproduces
 * (a plugin bundle, a source map, a compiled binary) rather than source a
 * person wrote, or something large enough that it does not belong in a
 * git history that everyone who ever clones this repo carries forever.
 *
 * FT-15.1's own reason for existing: monitoring/grafana/plugins/ had 677
 * tracked files / 137MB of installed plugin bundles, source maps and
 * compiled JS that GF_INSTALL_PLUGINS (docker-compose.yaml) and Grafana's
 * own core-bundled plugins already reproduce on every container start --
 * see .gitignore's own comment on that directory. This exists so it, or
 * something like it, cannot happen again silently.
 *
 * Structural/path-and-size based, like private-data-leak-scanner.js:
 * inspects the INDEX (`git ls-files -s`, what is actually staged/tracked
 * right now), never file contents. Deliberately the index and not HEAD's
 * tree: a check against HEAD would fail on the exact commit that fixes a
 * violation (the file is still in the PARENT commit's tree at the moment
 * pre-commit runs), which would make it impossible for this linter to ever
 * pass on the commit that untracks something -- checking what is actually
 * about to be committed is both the more useful question and the one that
 * does not eat its own tail.
 *
 * Usage: node tests/lint/repo-hygiene-linter.js
 */
'use strict';

const { execSync } = require('child_process');

const MAX_BYTES = 1024 * 1024; // 1 MB

// Known executable/generated-plugin-artifact extensions. Grafana plugin
// bundles are already blocked wholesale by path (monitoring/grafana/
// plugins/** below); this catches the same KIND of artifact anywhere else
// in the tree -- a compiled binary or native addon is never source.
const BLOCKED_EXTENSIONS = ['.map', '.mp4', '.gif', '.wasm', '.dll', '.so', '.exe', '.node'];

const BLOCKED_PATH_PREFIXES = ['monitoring/grafana/plugins/'];

// Pre-existing, legitimate, in-use documentation assets -- referenced from
// README.md and docs/product/DASHBOARD_ECOSYSTEM.md (and their th/zh-CN
// translations). Real hand-produced marketing/screenshot assets, not
// generated artifacts, and unrelated to the Grafana-plugin-bloat problem
// this linter exists to catch (FT-15.1). Named individually, not by
// extension or directory, so a NEW .gif/.mp4/oversized file anywhere
// (including a new file under assets/) is still caught -- this allowlist
// grows only by adding another specific, justified path here, never by
// widening a pattern.
const ALLOWLIST = new Set([
  'assets/apex-ldi-noc-banner.gif',
  'assets/apex-ldi-noc-banner.mp4',
  'assets/ldi-engineering.png',
]);

let entries;
try {
  // "<mode> <sha> <stage>\t<path>" per staged/tracked file.
  const lsRaw = execSync('git ls-files -s', { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const staged = lsRaw.split('\n').filter(Boolean).map((line) => {
    const tab = line.indexOf('\t');
    const meta = line.slice(0, tab).trim().split(/\s+/);
    return { sha: meta[1], path: line.slice(tab + 1) };
  });

  // One batched `git cat-file --batch-check` call for every blob size,
  // rather than 1400+ individual `git cat-file -s` subprocess spawns.
  const input = staged.map((f) => f.sha).join('\n');
  const sizeOut = execSync('git cat-file --batch-check=%(objectsize)', {
    cwd: process.cwd(), encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024,
  });
  const sizes = sizeOut.split('\n').filter(Boolean).map(Number);
  entries = staged.map((f, i) => ({ path: f.path, size: sizes[i] }));
} catch (err) {
  console.error(`Could not list tracked files: ${err.message}`);
  process.exit(1);
}

let hits = 0;
function flag(file, reason) {
  console.log(`  BLOCKED  ${file}  (${reason})`);
  hits++;
}

for (const { path, size } of entries) {
  const normalized = path.replace(/\\/g, '/');

  if (ALLOWLIST.has(normalized)) continue;

  if (BLOCKED_PATH_PREFIXES.some((p) => normalized.startsWith(p))) {
    flag(path, 'inside a directory Docker/Grafana reproduces at runtime -- see .gitignore');
    continue; // one reason is enough; do not also report its size/extension
  }

  const dot = normalized.lastIndexOf('.');
  const ext = dot === -1 ? '' : normalized.slice(dot).toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    flag(path, `blocked extension (${ext}) -- generated/compiled, never hand-written source`);
    continue;
  }

  if (Number.isFinite(size) && size > MAX_BYTES) {
    flag(path, `${(size / 1024 / 1024).toFixed(2)}MB, exceeds the ${MAX_BYTES / 1024 / 1024}MB ceiling for a tracked file`);
  }
}

console.log('Repo Hygiene Linter');
console.log('='.repeat(50));
console.log(`Tracked files scanned: ${entries.length}`);
console.log('='.repeat(50));
console.log(`Results: ${hits} violation(s)`);
if (hits > 0) {
  console.log('REPO HYGIENE CHECK FAILED -- one or more tracked files should be gitignored, not committed');
  process.exit(1);
}
console.log('REPO HYGIENE CHECK PASSED');
