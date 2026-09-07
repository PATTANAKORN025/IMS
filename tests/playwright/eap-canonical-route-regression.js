#!/usr/bin/env node
/**
 * Canonical entry-point regression.
 *
 * The bare service root (GET /, which the proxy maps to the user-facing
 * http://localhost:3000/factory-twin-3d/) must serve the physical Floor 1
 * twin -- the Factory Twin -- not the EAP operational map, and not merely
 * return 200 while showing something else. A route change is easy to get
 * backwards (right status, wrong page), so this checks the actual page: its
 * DOM, its globals, and a rendered screenshot, not just the HTTP response
 * code.
 *
 * This inverts an earlier phase's assertions, which made the EAP map
 * canonical. The EAP map is an operational layer reached deliberately from
 * inside the physical twin, not the page a visitor lands on first, so
 * eap.html is asserted to still work at its own filename and to still be
 * reachable via a link from the root page -- nothing in this phase is
 * allowed to make the explicit path stop working, or to delete the EAP
 * model or its 210/40/167/3 evidence counts.
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

async function loadTwin(page, url) {
  const res = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__twin !== undefined, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const dom = await page.evaluate(() => ({
    hasTwinGlobal: typeof window.__twin === 'object' && window.__twin !== null,
    hasEapGlobal: typeof window.__eap !== 'undefined',
    hasAppRoot: Boolean(document.getElementById('app')),
    hasEapLink: (() => {
      const a = document.getElementById('eap-link');
      return Boolean(a && /eap\.html$/.test(a.getAttribute('href') || ''));
    })(),
    title: document.title,
    canvasCount: document.querySelectorAll('canvas').length,
    canvas: (() => {
      const c = document.querySelector('#scene canvas');
      return c ? { w: c.clientWidth, h: c.clientHeight } : null;
    })(),
  }));
  return { status: res ? res.status() : null, dom };
}

async function loadEap(page, url) {
  const res = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__eap && window.__eap.ready(), null,
    { timeout: 30000 });
  await page.waitForTimeout(500);
  const dom = await page.evaluate(() => ({
    hasEapGlobal: typeof window.__eap === 'object' && window.__eap !== null,
    hasTwinGlobal: typeof window.__twin !== 'undefined',
    hasStage: Boolean(document.getElementById('stage')),
    hasTwinLink: (() => {
      const a = document.getElementById('twin-link');
      return Boolean(a);
    })(),
    title: document.title,
  }));
  const eapState = await page.evaluate(() => ({
    drawnZones: window.__eap.drawnZones(),
    counts: window.__eap.counts(),
    mode: window.__eap.mode(),
  }));
  return { status: res ? res.status() : null, dom, eapState };
}

async function main() {
  console.log('Factory Twin canonical entry-point regression');
  console.log('='.repeat(58));
  if (!BASE) {
    console.log('  SKIP  no EAP_URL set; the map service is not reachable from here.');
    process.exit(0);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  section('1. GET / serves the physical Floor 1 twin, not the EAP map');
  const root = await loadTwin(page, new URL('/', BASE).toString());
  eq(root.status, 200, 'the bare root returns HTTP 200');
  check(root.dom.hasTwinGlobal, 'window.__twin is defined at the root route');
  check(!root.dom.hasEapGlobal, 'window.__eap is NOT defined -- the EAP map script never '
    + 'loaded at the root route');
  check(root.dom.hasAppRoot, 'the physical twin\'s #app root is present in the DOM at /');
  check(/Factory Twin/i.test(root.dom.title), 'the page title is the physical twin, not '
    + 'the EAP map', root.dom.title);
  check(Boolean(root.dom.canvas) && root.dom.canvas.w > 0 && root.dom.canvas.h > 0,
    'the WebGL canvas has non-zero rendered dimensions',
    JSON.stringify(root.dom.canvas));

  section('2. the root page links to the EAP map as an operational layer');
  check(root.dom.hasEapLink, 'an #eap-link anchor pointing at eap.html is present in the topbar');

  section('3. a screenshot of / is actually non-empty');
  const shotPath = path.join(os.tmpdir(), `twin-canonical-root-${Date.now()}.png`);
  await page.screenshot({ path: shotPath });
  const stat = fs.statSync(shotPath);
  check(stat.size > 5000, 'the root screenshot is a real rendered frame, not a blank canvas',
    `${stat.size} bytes`);
  fs.unlinkSync(shotPath);

  section('4. /eap.html still works, unchanged, as the operational layer');
  const explicit = await loadEap(page, new URL('eap.html', BASE).toString());
  eq(explicit.status, 200, '/eap.html returns HTTP 200');
  check(explicit.dom.hasEapGlobal, 'window.__eap is defined at /eap.html');
  check(!explicit.dom.hasTwinGlobal, 'window.__twin is NOT defined at /eap.html -- it is its '
    + 'own page, its own WebGL context');
  eq(explicit.eapState.counts.cells, 210, '/eap.html still represents all 210 cells');
  eq(explicit.eapState.counts.cells_in_world_frame, 40, '/eap.html still has 40 DIRECT cells on the real floor');
  eq(explicit.eapState.drawnZones, 12, '/eap.html still draws all 12 process zones');
  check(explicit.dom.hasTwinLink, 'a #twin-link anchor back to the physical twin is present '
    + 'in the EAP page\'s header');

  section('5. index.html still serves the physical twin at its own filename');
  const explicitTwin = await loadTwin(page, new URL('index.html', BASE).toString());
  eq(explicitTwin.status, 200, '/index.html returns HTTP 200');
  check(explicitTwin.dom.hasAppRoot, '/index.html still serves the physical twin\'s #app root');

  await browser.close();
  console.log(`\n${'='.repeat(58)}`);
  console.log(`Results: ${failures} failure(s)`);
  console.log(failures ? 'FACTORY TWIN CANONICAL ROUTE REGRESSION FAILED'
    : 'FACTORY TWIN CANONICAL ROUTE REGRESSION PASSED');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`fatal: ${err && err.message}`);
  process.exit(1);
});
