#!/usr/bin/env node
/**
 * Private Data Leak Scanner — fails if any file matching a confidential-
 * facility-data pattern is TRACKED by git (i.e. would end up on GitHub).
 *
 * Deliberately structural/path-based, not content-based: this never reads
 * a real facility name, equipment tag, or dimension into this file --
 * doing that to "detect" leaks would itself be exactly the kind of leak
 * this script exists to prevent. It only matches path/filename shapes
 * (directory named "private", the known Apex3Layout name, CAD file
 * extensions, this repo's own private-data filenames like
 * "floor1-geometry.json") against the list of files git actually tracks.
 *
 * Safe to run with real private files present locally -- it only ever
 * inspects `git ls-files` (tracked files), never file contents, so a
 * gitignored file sitting on disk is invisible to it by construction and
 * cannot cause a false positive.
 *
 * Usage: node tests/lint/private-data-leak-scanner.js
 */
'use strict';

const { execSync } = require('child_process');

const CAD_EXTENSIONS = ['.dwg', '.dxf', '.ifc', '.step', '.stp', '.cad'];
const SUSPICIOUS_FILENAME_PATTERNS = [
  /floor1-geometry\.json$/i,
  /floor1-asset-mapping\.json$/i,
  /LayoutApex3/i,
  /apex3.*floor.*plan/i,
  /floor.*plan.*apex3/i,
];

let tracked;
try {
  tracked = execSync('git ls-files', { cwd: process.cwd(), encoding: 'utf8' }).split('\n').filter(Boolean);
} catch (err) {
  console.error(`Could not list tracked files: ${err.message}`);
  process.exit(1);
}

let hits = 0;
function flag(file, reason) {
  console.log(`  LEAK    ${file}  (${reason})`);
  hits++;
}

for (const file of tracked) {
  const normalized = file.replace(/\\/g, '/');
  const segments = normalized.split('/');

  if (segments.includes('private')) flag(file, 'path contains a "private/" directory segment');
  if (/^Apex3Layout(\/|$)/i.test(normalized)) flag(file, 'path is inside Apex3Layout/');

  const ext = normalized.slice(normalized.lastIndexOf('.')).toLowerCase();
  if (CAD_EXTENSIONS.includes(ext)) flag(file, `CAD file extension (${ext})`);

  for (const pattern of SUSPICIOUS_FILENAME_PATTERNS) {
    if (pattern.test(normalized)) flag(file, `matches suspicious filename pattern (${pattern})`);
  }
}

console.log('Private Data Leak Scanner');
console.log('='.repeat(50));
console.log(`Tracked files scanned: ${tracked.length}`);
console.log('='.repeat(50));
console.log(`Results: ${hits} match(es)`);
if (hits > 0) {
  console.log('LEAK SCAN FAILED -- one or more tracked files match a confidential-data pattern');
  process.exit(1);
}
console.log('LEAK SCAN PASSED');
