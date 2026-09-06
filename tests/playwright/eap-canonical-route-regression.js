#!/usr/bin/env node
/**
 * Canonical entry-point regression.
 *
 * The bare service root (GET /, which the proxy maps to the user-facing
 * http://localhost:3000/factory-twin-3d/) must serve the EAP operational map
 * -- the current Factory Twin -- not the retired physical-twin index.html,
 * and not merely return 200 while showing something else. A route change is
 * easy to get backwards (right status, wrong page), so this checks the actual
 * page: its DOM, its globals, and a rendered screenshot, not just the HTTP
 * response code.
 *
 * eap.html is asserted to still work at its own filename, because nothing in
 * this phase is allowed to make the explicit path stop working -- the root
 * route is an addition, not a replacement.
 *
 * Usage:
 *   EAP_URL=http://127.0.0.1:4199/ node tests/playwright/eap-canonical-route-regression.js
 *
 * With no EAP_URL the check reports SKIP and exits zero, matching the other
 * EAP browser regressions: the map is served by a container that is not
 * always up, and a missing service is not a failure of the code under test.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.EAP_URL || process.env.TWIN_DIRECT_URL || null;

let failures = 0;

function check(ok, label, detail) {
  if (ok) {
    console.log(`  PASS  ${label}`);
    return true;
  }
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

async function loadAndInspect(page, url) {
  const res = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__eap && window.__eap.ready(), null,
    { timeout: 30000 });
  await page.waitForTimeout(500);
  const dom = await page.evaluate(() => ({
    hasEapGlobal: typeof window.__eap === 'object' && window.__eap !== null,
    hasTwinGlobal: typeof window.__twin !== 'undefined',
    hasLegacyRoot: Boolean(document.getElementById('app')),
    hasStage: Boolean(document.getElementById('stage')),
    title: document.title,
    canvasCount: document.querySelectorAll('canvas').length,
    canvas: (() => {
      const c = document.querySelector('#stage canvas');
      return c ? { w: c.clientWidth, h: c.clientHeight } : null;
    })(),
  }));
  const eapState = await page.evaluate(() => ({
    drawnZones: window.__eap.drawnZones(),
    counts: window.__eap.counts(),
    mode: window.__eap.mode(),
  }));
  return { status: res ? res.status() : null, dom, eapState };
}

async function main() {
  console.log('EAP canonical entry-point regression');
  console.log('='.repeat(58));
  if (!BASE) {
    console.log('  SKIP  no EAP_URL set; the map service is not reachable from here.');
    process.exit(0);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  section('1. GET / serves the EAP operational map, not the physical twin');
  const root = await loadAndInspect(page, new URL('/', BASE).toString());
  eq(root.status, 200, 'the bare root returns HTTP 200');
  check(root.dom.hasEapGlobal, 'window.__eap is defined at the root route');
  check(!root.dom.hasTwinGlobal, 'window.__twin is NOT defined -- the legacy physical '
    + 'twin script never loaded at the root route');
  check(!root.dom.hasLegacyRoot, 'no #app element -- the legacy physical-twin root is '
    + 'not present in the DOM at /');
  check(root.dom.hasStage, 'the EAP #stage element is present at /');
  check(/EAP Operational Map/i.test(root.dom.title), 'the page title is the EAP map, not '
    + '"Factory Twin — Floor 1"', root.dom.title);

  section('2. the EAP application actually initialized');
  eq(root.eapState.counts.cells, 210, '210 cells represented in the payload the root route loaded');
  eq(root.eapState.counts.cells_in_world_frame, 40, '40 DIRECT cells on the real floor');
  eq(root.eapState.drawnZones, 12, 'all 12 process zones drawn as world-space regions');
  eq(root.eapState.mode, 'AUTO', 'the root route lands on AUTO, the default coherent view');
  check(Boolean(root.dom.canvas) && root.dom.canvas.w > 0 && root.dom.canvas.h > 0,
    'the WebGL canvas has non-zero rendered dimensions',
    JSON.stringify(root.dom.canvas));

  section('3. a screenshot of / is actually non-empty');
  const shotPath = path.join(os.tmpdir(), `eap-canonical-root-${Date.now()}.png`);
  await page.screenshot({ path: shotPath });
  const stat = fs.statSync(shotPath);
  check(stat.size > 5000, 'the root screenshot is a real rendered frame, not a blank canvas',
    `${stat.size} bytes`);
  fs.unlinkSync(shotPath);

  section('4. /eap.html still works, unchanged, alongside the new root route');
  const explicit = await loadAndInspect(page, new URL('eap.html', BASE).toString());
  eq(explicit.status, 200, '/eap.html returns HTTP 200');
  check(explicit.dom.hasEapGlobal, 'window.__eap is defined at /eap.html');
  eq(explicit.eapState.counts.cells, 210, '/eap.html also represents all 210 cells');
  eq(explicit.eapState.drawnZones, 12, '/eap.html also draws all 12 zones');

  section('5. the legacy physical twin is still reachable at its own filename');
  const legacy = await page.goto(new URL('index.html', BASE).toString(),
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  eq(legacy ? legacy.status() : null, 200, '/index.html still returns HTTP 200');
  const legacyDom = await page.evaluate(() => ({
    hasTwinGlobal: typeof window.__twin !== 'undefined' || document.readyState !== 'complete',
    hasLegacyRoot: Boolean(document.getElementById('app')),
  }));
  check(legacyDom.hasLegacyRoot, '/index.html still serves the physical twin\'s #app root '
    + '-- moving the canonical route did not delete or break it');

  await browser.close();
  console.log(`\n${'='.repeat(58)}`);
  console.log(`Results: ${failures} failure(s)`);
  console.log(failures ? 'EAP CANONICAL ROUTE REGRESSION FAILED' : 'EAP CANONICAL ROUTE REGRESSION PASSED');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`fatal: ${err && err.message}`);
  process.exit(1);
});
