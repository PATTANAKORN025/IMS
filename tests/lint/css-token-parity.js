#!/usr/bin/env node
/**
 * CSS DESIGN-TOKEN PARITY LINT  (audit finding F-1)
 * ================================================
 *
 * The two operator pages -- index.html (physical twin) and eap.html (EAP
 * map) -- have no shared stylesheet, so each carries its own :root token
 * block. This lint keeps the two vocabularies from drifting:
 *
 *   1. SCALE tokens  (--motion-*, --ease-*, --z-*, --space-*, --radius-*,
 *      --text-*)  must be declared in BOTH with IDENTICAL values.
 *   2. PALETTE-ROLE tokens  (--bg, --surface*, --border*, --text,
 *      --text-secondary, --text-muted, --accent, --focus, --warning,
 *      --danger, --success, --status-*, --quality-*)  must be declared in
 *      BOTH by NAME.  A value that deliberately differs between the pages
 *      must carry a "diverges:" note in a trailing comment on its line.
 *   3. Anything under a "PAGE-SPECIFIC" comment is exempt (cell fills on
 *      EAP, shell geometry on the twin).
 *
 * Exit 0 = in parity, 1 = drift.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'public');
const FILES = { twin: path.join(PUB, 'index.html'), eap: path.join(PUB, 'eap.html') };

let fails = 0;
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

const SCALE_PREFIXES = ['--motion-', '--ease-', '--z-', '--space-', '--radius-'];
// --text-* is split: the type scale is a shared-value scale; --text-secondary
// and --text-muted are palette roles (they carry a page's ink tint).
const SCALE_NAMES_EXTRA = new Set([
  '--text-3xs', '--text-2xs', '--text-xs', '--text-sm', '--text-base', '--text-md', '--text-lg', '--text-xl',
]);
const ROLE_TOKENS = [
  '--bg', '--surface', '--surface-raised', '--surface-sunken', '--border', '--border-strong',
  '--text', '--text-secondary', '--text-muted', '--accent', '--focus',
  '--warning', '--danger', '--success',
  '--status-run', '--status-down', '--status-idle', '--status-off', '--status-initial',
  '--status-pm', '--status-stop', '--status-undefined', '--quality-unmapped', '--quality-unavailable',
];

/** Parse the first :root { ... } block; return { name: {value, line, diverges, pageSpecific} }. */
function parseRoot(src) {
  const styleStart = src.indexOf('<style>');
  const i = src.indexOf(':root', styleStart);
  const open = src.indexOf('{', i);
  let depth = 0, end = open;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  const block = src.slice(open + 1, end);
  const out = {};
  let pageSpecific = false;
  for (const raw0 of block.split(/\r?\n/)) {
    const raw = raw0.replace(/\r$/, '');
    if (/PAGE-SPECIFIC/i.test(raw)) pageSpecific = true;
    const m = raw.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);(.*)$/i);
    if (!m) continue;
    out[m[1]] = {
      value: m[2].trim().replace(/\s+/g, ' '),
      diverges: /diverges:/i.test(m[3]),
      pageSpecific,
    };
  }
  return out;
}

const twin = parseRoot(fs.readFileSync(FILES.twin, 'utf8'));
const eap = parseRoot(fs.readFileSync(FILES.eap, 'utf8'));

console.log('CSS design-token parity lint');
console.log('='.repeat(40));

// 1. scale tokens: present in both, identical values
const scaleNames = new Set([...Object.keys(twin), ...Object.keys(eap)]
  .filter((n) => SCALE_PREFIXES.some((p) => n.startsWith(p)) || SCALE_NAMES_EXTRA.has(n)));
for (const n of [...scaleNames].sort()) {
  const t = twin[n], e = eap[n];
  if (!t || !e) { ok(false, `scale ${n}: declared in ${t ? 'twin' : 'eap'} only`); continue; }
  if (t.pageSpecific || e.pageSpecific) continue;
  ok(t.value === e.value, `scale ${n}: ${t.value === e.value ? 'identical' : `twin "${t.value}" != eap "${e.value}"`}`);
}

// 2. role tokens: present in both by name; differing value needs a diverges note on BOTH
for (const n of ROLE_TOKENS) {
  const t = twin[n], e = eap[n];
  if (!t || !e) { ok(false, `role ${n}: missing from ${t ? 'eap' : 'twin'}`); continue; }
  if (t.value === e.value) { ok(true, `role ${n}: identical (${t.value})`); continue; }
  ok(t.diverges && e.diverges,
    `role ${n}: values differ (twin "${t.value}" / eap "${e.value}") -- ${t.diverges && e.diverges ? 'both marked diverges:' : 'MISSING a "diverges:" note on ' + (t.diverges ? 'eap' : 'twin')}`);
}

// 3. no undefined var() references on either page (self-check, both files)
for (const [label, file] of Object.entries(FILES)) {
  const src = fs.readFileSync(file, 'utf8');
  const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
  const declared = new Set(Object.keys(label === 'twin' ? twin : eap));
  // only flag a var() with NO fallback -- var(--x, fallback) is deliberate
  const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)\s*\)/gi)].map((m) => m[1]));
  const undef = [...used].filter((u) => !declared.has(u));
  ok(undef.length === 0, `${label}: every var() token is declared${undef.length ? ' -- undefined: ' + undef.join(', ') : ''}`);
}

console.log('='.repeat(40));
if (fails) { console.error(`PARITY DRIFT: ${fails} check(s) failed.`); process.exit(1); }
console.log('Both operator pages share one token vocabulary.');
