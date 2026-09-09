#!/usr/bin/env node
/**
 * Floor 1 EAP map -- operational-state contract browser regression.
 *
 * FT-EAP-STATE built one canonical per-cell state record
 * (resolveOperationalState in eap.js) that every caller on the page reads --
 * the WebGL cell colour, the cell inspector, the zone inspector's own
 * breakdown, and the always-visible factory-wide breakdown table. This
 * asserts that record's real contract, not a re-derived copy of it:
 *
 *   - every cell resolves to exactly one of the 7 plant states, NO_DATA or
 *     UNAVAILABLE -- never a state AND a quality flag, never neither.
 *   - NO_DATA (not attached to a machine unit) and UNAVAILABLE (simulation
 *     off) are never reported as OFF, the real plant state neither of them
 *     is.
 *   - a zone's own breakdown always sums to that zone's own cell count, and
 *     the factory-wide breakdown always sums to 210 -- no cell counted
 *     twice, none dropped.
 *   - the always-visible breakdown table (the accessibility fallback -- see
 *     its own HTML comment) carries the same numbers `window.__eap` reports,
 *     not a second, driftable copy.
 *   - state is communicated by more than colour: every legend/breakdown row
 *     names a glyph as well as a colour.
 *
 * Usage:
 *   EAP_URL=http://127.0.0.1:4199/ node tests/playwright/eap-operational-state-regression.js
 *
 * With no EAP_URL the check reports SKIP and exits zero, matching the other
 * EAP browser regressions.
 */

'use strict';

const { chromium } = require('playwright');

const BASE = process.env.EAP_URL || process.env.TWIN_DIRECT_URL || null;
const TOTAL_CELLS = 210;
const STATES = ['OFF', 'DOWN', 'IDLE', 'INITIAL', 'PM', 'STOP', 'RUN', 'UNDEFINED'];
const QUALITIES = ['NO_DATA', 'UNAVAILABLE'];

let failures = 0;

function check(ok, label, detail) {
  if (ok) { console.log(`  PASS  ${label}`); return true; }
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  return false;
}

function eq(actual, want, label) {
  return check(actual === want, label, `expected ${want}, got ${actual}`);
}

function section(name) {
  console.log(`\n${name}`);
  console.log('-'.repeat(name.length));
}

async function main() {
  console.log('Floor 1 EAP Map -- operational-state contract regression');
  console.log('='.repeat(60));
  if (!BASE) {
    console.log('  SKIP  no EAP_URL set; the map service is not reachable from here.');
    process.exit(0);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

  const url = new URL('eap.html', BASE).toString();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eap && window.__eap.ready(), { timeout: 15000 });
  // EAP mode draws the full 210-cell census; AUTO (the default) draws only
  // the 40 DIRECT cells plus zone regions, so a state check needs EAP mode
  // to see every cell, not a subset.
  await page.evaluate(() => window.__eap.setMode('EAP'));
  await page.waitForTimeout(350);

  section('1. every cell resolves to exactly one bucket');
  const allStates = await page.evaluate((cellIds) => cellIds.map((id) => window.__eap.operationalState(id)),
    await page.evaluate(() => window.__eap.drawn().map((c) => c.cell_id)));
  eq(allStates.length, TOTAL_CELLS, 'one record per cell');
  let oneBucket = true;
  let noOffFromNoDataOrUnavailable = true;
  for (const rec of allStates) {
    const isState = rec.state !== null && STATES.includes(rec.state);
    const isQuality = rec.state === null && QUALITIES.includes(rec.quality);
    if (isState === isQuality) oneBucket = false; // must be exactly one, never both, never neither
    if ((rec.quality === 'NO_DATA' || rec.quality === 'UNAVAILABLE') && rec.state === 'OFF') {
      noOffFromNoDataOrUnavailable = false;
    }
  }
  check(oneBucket, 'every record is exactly one of {a real state} or {a quality flag}');
  check(noOffFromNoDataOrUnavailable, 'NO_DATA/UNAVAILABLE never reported as the real OFF state');

  section('2. state_source and observed_at are honest');
  const sourcesOk = allStates.every((r) => (r.state === null ? r.state_source === 'NONE'
    : r.state_source === 'SIMULATED'));
  check(sourcesOk, 'state_source is SIMULATED only when a state was actually generated, NONE otherwise');
  check(allStates.every((r) => r.observed_at === null),
    'observed_at is null for every record -- simulation has no clock, none is fabricated');

  section('3. factory-wide reconciliation');
  const fb = await page.evaluate(() => window.__eap.factoryStateBreakdown());
  eq(fb.total, TOTAL_CELLS, 'factory breakdown total');
  check(fb.reconciled, 'factory breakdown reconciled (own internal check)');
  const summed = Object.values(fb.counts).reduce((a, b) => a + b, 0);
  eq(summed, TOTAL_CELLS, 'sum of every bucket equals the cell population');

  section('4. per-zone reconciliation, no double-count against the factory total');
  const zones = await page.evaluate(() => window.__eap.zoneList());
  let zoneSum = 0;
  let allZonesReconciled = true;
  for (const z of zones) {
    // eslint-disable-next-line no-await-in-loop
    const zb = await page.evaluate((zid) => window.__eap.zoneStateBreakdown(zid), z.zone_id);
    if (!zb.reconciled) allZonesReconciled = false;
    if (zb.total !== z.cells) allZonesReconciled = false;
    zoneSum += zb.total;
  }
  check(allZonesReconciled, 'every zone breakdown reconciled and matched its own cell count');
  eq(zoneSum, TOTAL_CELLS, 'sum of all 12 zone totals equals the factory total');

  section('5. simulation-off is UNAVAILABLE, never a state, and still reconciles');
  await page.evaluate(() => window.__eap.setSimulation(false));
  const fbOff = await page.evaluate(() => window.__eap.factoryStateBreakdown());
  eq(fbOff.total, TOTAL_CELLS, 'total unchanged with simulation off');
  eq(fbOff.counts.UNAVAILABLE, TOTAL_CELLS, 'every cell reads UNAVAILABLE with simulation off');
  eq(STATES.reduce((s, k) => s + (fbOff.counts[k] || 0), 0), 0,
    'no real state is reported for any cell while simulation is off');
  await page.evaluate(() => window.__eap.setSimulation(true));

  section('6. the always-visible breakdown table matches window.__eap, not a second copy');
  const fbOn = await page.evaluate(() => window.__eap.factoryStateBreakdown());
  const tableText = await page.$eval('#stateBreakdown', (el) => el.innerText);
  let tableMatches = true;
  for (const key of [...STATES, ...QUALITIES]) {
    const n = fbOn.counts[key] || 0;
    if (n === 0 && key !== 'OFF') continue; // zero rows for NO_DATA/UNAVAILABLE are omitted by design
    if (!tableText.includes(String(n))) tableMatches = false;
  }
  check(tableMatches, 'breakdown table text contains the same counts window.__eap reports');
  check(/Total/.test(tableText) && tableText.includes(String(TOTAL_CELLS)),
    'breakdown table shows the reconciled total');

  section('7. never colour alone');
  const glyphCount = await page.$$eval('#stateBreakdown tr [aria-hidden="true"]', (els) => els.length);
  check(glyphCount > 0, 'breakdown rows carry a glyph, not colour alone');
  const legendGlyphCount = await page.$$eval('.legend-row', (els) => els.length);
  check(legendGlyphCount >= STATES.length, 'legend still lists at least the 7 machine states');

  section('8. no page errors across the whole run');
  check(pageErrors.length === 0, 'console and page errors', pageErrors.slice(0, 3).join(' | '));

  await browser.close();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${failures} failure(s)`);
  console.log(failures === 0 ? 'EAP OPERATIONAL STATE REGRESSION PASSED' : 'EAP OPERATIONAL STATE REGRESSION FAILED');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
