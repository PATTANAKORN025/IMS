#!/usr/bin/env node
/**
 * EAP STATUS-COLOUR DRIFT LINT  (audit finding F-3)
 * ================================================
 *
 * `services/factory-twin-3d/public/operational-status.js` is the single
 * semantic source of truth for the eight operational-state colours + the
 * UNMAPPED data-quality colour. Every renderer must consume it. Two places
 * historically HAND-COPIED the hex values instead:
 *
 *   1. eap.html -- the always-visible static <div class="legend-row"> list
 *      (this is a separate element from #stateBreakdown, which eap.js already
 *      builds dynamically from the source of truth).
 *   2. eap.js  -- SIM_QUALITY_DISPLAY.{NO_DATA,UNAVAILABLE}.color, which
 *      deliberately reuse OFF's grey.
 *
 * This lint fails if any copy diverges, and if operational-status.js's own
 * `color` string and `hex` number ever disagree.
 *
 * Exit 0 = consistent, 1 = drift.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const url = require('url');

const PUB = path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'public');
const SRC = path.join(PUB, 'operational-status.js');
const HTML = path.join(PUB, 'eap.html');
const EAPJS = path.join(PUB, 'eap.js');

let fails = 0;
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const norm = (h) => String(h).trim().toLowerCase();
const hexOfNum = (n) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');

(async () => {
  console.log('EAP status-colour drift lint');
  console.log('='.repeat(40));

  const mod = await import(url.pathToFileURL(SRC).href);
  const { OPERATIONAL_STATUS, DATA_QUALITY, STATUS_ORDER } = mod;

  // ---- A. operational-status.js internal: color string == hex number ----
  for (const key of STATUS_ORDER) {
    const e = OPERATIONAL_STATUS[key];
    ok(norm(e.color) === norm(hexOfNum(e.hex)),
      `${key}: color "${e.color}" matches hex ${hexOfNum(e.hex)}`);
  }
  {
    const u = DATA_QUALITY.UNMAPPED;
    ok(norm(u.color) === norm(hexOfNum(u.hex)),
      `UNMAPPED: color "${u.color}" matches hex ${hexOfNum(u.hex)}`);
  }

  // ---- B. eap.html static legend rows == source of truth, in order ----
  const html = fs.readFileSync(HTML, 'utf8');
  const legendBlock = html.slice(html.indexOf('class="legend-row"'));
  // each row: <span class="chip" style="background:#xxxxxx[;opacity:...]"></span> ... <label text>
  const rowRe = /class="chip"\s+style="background:(#[0-9a-fA-F]{6})[^"]*"[^>]*><\/span><span>[^<]*?(Off|Run|Idle|Down|Initial|PM|Stop|Undefined|Unmapped)/g;
  const found = [];
  let m;
  while ((m = rowRe.exec(legendBlock)) !== null) found.push({ hex: norm(m[1]), label: m[2] });

  const expected = [
    ...STATUS_ORDER.map((k) => ({ label: OPERATIONAL_STATUS[k].label, hex: norm(OPERATIONAL_STATUS[k].color) })),
    { label: DATA_QUALITY.UNMAPPED.label, hex: norm(DATA_QUALITY.UNMAPPED.color) },
  ];
  // STATUS_ORDER is OFF,DOWN,IDLE,INITIAL,PM,STOP,RUN,UNDEFINED; the legend is
  // authored OFF,RUN,IDLE,DOWN,INITIAL,PM,STOP,UNDEFINED,UNMAPPED -- compare as
  // a label->hex map, not by position.
  const expMap = new Map(expected.map((e) => [e.label.toLowerCase(), e.hex]));
  ok(found.length === 9, `eap.html legend has 9 colour rows (found ${found.length})`);
  for (const row of found) {
    const want = expMap.get(row.label.toLowerCase());
    ok(want !== undefined && want === row.hex,
      `eap.html legend "${row.label}" chip ${row.hex} matches source of truth ${want || '(no such state)'}`);
  }

  // ---- C. eap.js SIM_QUALITY_DISPLAY reuses OFF's grey, on purpose ----
  const eapjs = fs.readFileSync(EAPJS, 'utf8');
  const simBlock = eapjs.slice(eapjs.indexOf('const SIM_QUALITY_DISPLAY'));
  const simEnd = simBlock.indexOf('};');
  const simColors = [...simBlock.slice(0, simEnd).matchAll(/color:\s*'(#[0-9a-fA-F]{6})'/g)].map((x) => norm(x[1]));
  const offHex = norm(OPERATIONAL_STATUS.OFF.color);
  ok(simColors.length === 2, `eap.js SIM_QUALITY_DISPLAY declares 2 colours (found ${simColors.length})`);
  for (const c of simColors) {
    ok(c === offHex,
      `eap.js SIM_QUALITY_DISPLAY colour ${c} == OFF's ${offHex} (deliberate: quality rows borrow the powered-down grey)`);
  }

  console.log('='.repeat(40));
  if (fails) { console.error(`DRIFT: ${fails} check(s) failed -- a status colour was changed in one place only.`); process.exit(1); }
  console.log('All status colours consistent with operational-status.js');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
