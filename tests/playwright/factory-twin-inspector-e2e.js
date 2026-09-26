#!/usr/bin/env node
/**
 * Factory Twin — FT-15.1B browser E2E: the real user flow this deployment's
 * own identity gate depends on being visibly true, not merely
 * server-side-correct.
 *
 *   physical asset -> click -> inspector -> identity state -> overlay
 *   lookup -> UNMAPPED / physical-only
 *
 * Every click here is a genuine browser mouse event dispatched at the
 * canvas's own screen coordinates (computed via window.__twin.projectPoint,
 * the exact helper the app itself exposes for this) -- renderer.domElement's
 * own 'click' listener handles it, calling the SAME pickEquipment() ->
 * showEquipmentInspector() path a real operator's click would. Nothing here
 * calls either function directly.
 *
 * Covers four distinct asset shapes, because a defect specific to one shape
 * (a rectangle, a TRUE_POLYGON, a PHYSICAL_STATION's own child, a footprint-
 * UNRESOLVED marker) would not show up by testing only one:
 *   - a normal OPERATIONAL_RECTANGLE asset
 *   - a TRUE_POLYGON asset (not a KLJLAY child, so it exercises a genuinely
 *     different code path than the next case)
 *   - a KLJLAY (PHYSICAL_STATION) child component
 *   - a footprint-UNRESOLVED asset
 *
 * This deployment's real, current state is 0 CONFIRMED CAD-to-IMS mappings
 * (see docs/superpowers/specs/2026-09-08-ft14-asset-identity-evidence-
 * design.md), so every assertion below expects physical-only: no "Live
 * state" row, no machine-state word, an empty physical-overlay object. When
 * a real mapping is eventually confirmed, this file's assertions for that
 * one asset should start failing -- which is the point: it is watching for
 * the day the gate has something real to show, not asserting emptiness
 * forever by construction.
 *
 * Usage:
 *   GRAFANA_URL=http://localhost:3000 GRAFANA_ADMIN_USER=admin \
 *     GRAFANA_ADMIN_PASSWORD=... node tests/playwright/factory-twin-inspector-e2e.js
 */

'use strict';

const { chromium } = require('playwright');

const BASE = process.env.GRAFANA_URL || 'http://localhost:3000';
const USER = process.env.GRAFANA_ADMIN_USER || 'admin';
const PASS = process.env.GRAFANA_ADMIN_PASSWORD;

let passed = 0;
let failed = 0;
function check(cond, name, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}  ${detail}`); }
  else { failed++; console.log(`  FAIL  ${name}  ${detail}`); }
}

async function clickPointFor(page, item) {
  return page.evaluate((it) => {
    const T = window.__twin;
    const v = T.projectPoint(it.position.x, it.position.y, it.position.z);
    const rect = T.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
      onScreen: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1,
    };
  }, item);
}

(async () => {
  if (!PASS) {
    console.log('SKIP  GRAFANA_ADMIN_PASSWORD not set -- cannot authenticate against a real deployment.');
    process.exit(0);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`CONSOLE: ${m.text()}`); });

  await page.goto(`${BASE}/login`);
  await page.fill('input[name="user"]', USER);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  await page.goto(`${BASE}/factory-twin-3d/`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__twin !== undefined, null, { timeout: 30000 });
  await page.waitForTimeout(2000);

  const equipment = await page.evaluate(() => window.__twin.getRawApiEquipment());
  console.log(`Factory Twin Inspector E2E  (${equipment.length} equipment records)\n`);

  const isKljlayChild = (e) => /^EQP-F1-0002-C\d{2}$/.test(e.id);
  const targets = {
    'normal rectangle': equipment.find((e) => e.display_representation !== 'TRUE_POLYGON' && e.footprint),
    'TRUE_POLYGON': equipment.find((e) => e.display_representation === 'TRUE_POLYGON' && !isKljlayChild(e)),
    'KLJLAY component': equipment.find(isKljlayChild),
    'unresolved asset': equipment.find((e) => !e.footprint),
  };

  for (const [label, item] of Object.entries(targets)) {
    if (!item) { check(false, `${label}: a real fixture exists in the served geometry`, '(none matched)'); continue; }
    check(true, `${label}: a real fixture exists in the served geometry`, item.id);

    // eslint-disable-next-line no-await-in-loop
    let point = await clickPointFor(page, item);
    if (!point.onScreen) {
      // eslint-disable-next-line no-await-in-loop
      await page.click('#view-controls button[data-view="overview"]').catch(() => {});
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(500);
      // eslint-disable-next-line no-await-in-loop
      point = await clickPointFor(page, item);
    }

    // eslint-disable-next-line no-await-in-loop
    await page.mouse.click(point.x, point.y);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(300);

    // eslint-disable-next-line no-await-in-loop
    const inspector = await page.evaluate(() => {
      const el = document.getElementById('inspector');
      return { hidden: el ? el.hidden : true, text: el ? el.innerText : '' };
    });

    const opened = inspector.hidden === false && inspector.text.length > 0;
    check(opened, `${label}: a real click on the canvas opens a functional inspector`,
      opened ? '' : '(inspector did not open -- the click likely missed the mesh)');
    if (!opened) continue;

    check(inspector.text.includes('UNMAPPED') || inspector.text.includes('no confirmed machine'),
      `${label}: shows UNMAPPED / physical-only, never a fabricated confirmed status`);
    check(!inspector.text.includes('Live state'),
      `${label}: no "Live state" row -- the overlay is correctly absent (0 confirmed mappings)`);
    check(!/\bRUN\b|\bDOWN\b|\bIDLE\b/.test(inspector.text),
      `${label}: no live machine-state word leaked into the inspector`);
  }

  const overlay = await page.evaluate(() => window.__twin.getPhysicalOverlay());
  check(Object.keys(overlay).length === 0,
    'window.__twin.getPhysicalOverlay() is empty, matching 0 confirmed mappings',
    `${Object.keys(overlay).length} entrie(s)`);

  check(consoleErrors.length === 0, 'no console errors across the whole inspector flow',
    consoleErrors.length ? consoleErrors.join(' | ') : '');

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(failed === 0 ? 'FACTORY TWIN INSPECTOR E2E PASSED' : 'FACTORY TWIN INSPECTOR E2E FAILED');
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
