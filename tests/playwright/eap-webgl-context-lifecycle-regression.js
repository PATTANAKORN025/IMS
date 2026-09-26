#!/usr/bin/env node
/**
 * Floor 1 EAP map -- WebGL context-loss lifecycle regression.
 *
 * FT-EAP-CTXLOSS gave this page's own WebGL context the same detect-and-
 * reload fix app.js's FT-19 already had. FT-EAP-CTXLIFECYCLE replaced the
 * reload with a real in-app recovery (READY -> LOST -> RESTORING ->
 * REBUILDING -> RECOVERED -> READY, or LOST -> FAILED if the browser never
 * answers), on the strength of a fact this page's own architecture makes
 * true: payload, cellRecords, zoneRecords, mode, view, selected,
 * selectedZone and the camera objects themselves are plain JS values a GPU
 * context event never touches -- only the uploaded buffers and compiled
 * programs are invalidated. This regression exercises the real browser
 * WebGL context-loss simulation (forceContextLoss/forceContextRestore) the
 * way a real driver reset would, not a mocked flag.
 *
 * Usage:
 *   EAP_URL=http://127.0.0.1:4199/ node tests/playwright/eap-webgl-context-lifecycle-regression.js
 *
 * With no EAP_URL the check reports SKIP and exits zero, matching the other
 * EAP browser regressions.
 */

'use strict';

const { chromium } = require('playwright');

const BASE = process.env.EAP_URL || process.env.TWIN_DIRECT_URL || null;

let failures = 0;

function check(ok, label, detail) {
  if (ok) { console.log(`  PASS  ${label}`); return true; }
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  return false;
}

function eq(actual, want, label) {
  return check(actual === want, label, `expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`);
}

function section(name) {
  console.log(`\n${name}`);
  console.log('-'.repeat(name.length));
}

function waitForLifecycle(page, state, timeoutMs) {
  return page.evaluate(({ state: s, timeoutMs: t }) => new Promise((resolve) => {
    if (window.__eap.webglLifecycle() === s) { resolve(true); return; }
    let seen = false;
    const iv = setInterval(() => {
      if (window.__eap.webglLifecycle() === s) { seen = true; clearInterval(iv); resolve(true); }
    }, 15);
    setTimeout(() => { if (!seen) { clearInterval(iv); resolve(false); } }, t);
  }), { state, timeoutMs });
}

async function main() {
  console.log('Floor 1 EAP Map -- WebGL context-loss lifecycle regression');
  console.log('='.repeat(62));
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
  await page.evaluate(() => window.__eap.setMode('EAP'));
  await page.waitForTimeout(300);

  section('1. state and camera survive a loss/restore cycle');
  await page.evaluate(() => window.__eap.pick('EAP-F1-0105'));
  await page.evaluate(() => window.__eap.focus(20, -10, 30, 20));
  await page.waitForTimeout(150);
  const before = await page.evaluate(() => ({
    camera: window.__eap.cameraSnapshot(),
    selection: window.__eap.selection() && window.__eap.selection().cell_id,
    cells: window.__eap.drawnCells(),
  }));
  await page.evaluate(() => window.__eap.simulateContextLoss());
  check(await waitForLifecycle(page, 'LOST', 2000), 'reaches LOST after a real forced context loss');
  const bannerDuring = await page.evaluate(() => ({
    hidden: document.getElementById('webgl-lost').hidden,
    asideIntact: document.getElementById('counts').innerText.length > 0,
  }));
  check(!bannerDuring.hidden, 'banner visible while LOST');
  check(bannerDuring.asideIntact, 'aside (selection/population/legend) unaffected while LOST');
  await page.evaluate(() => window.__eap.simulateContextRestore());
  check(await waitForLifecycle(page, 'READY', 3000), 'returns to READY after a real forced restore');
  const after = await page.evaluate(() => ({
    camera: window.__eap.cameraSnapshot(),
    selection: window.__eap.selection() && window.__eap.selection().cell_id,
    cells: window.__eap.drawnCells(),
  }));
  eq(JSON.stringify(after.camera), JSON.stringify(before.camera), 'camera pan target and zoom preserved exactly');
  eq(after.selection, before.selection, 'selected cell preserved');
  eq(after.cells, before.cells, 'full cell population redrawn after recovery');
  // The RECOVERED banner ("3D view restored.") is shown for a real,
  // readable moment before auto-hiding -- see RECOVERED_DISPLAY_MS -- so
  // hiding is checked after that window, not the instant READY is reached.
  await page.waitForTimeout(1200);
  const bannerHiddenAfterDisplay = await page.evaluate(() => document.getElementById('webgl-lost').hidden);
  check(bannerHiddenAfterDisplay, 'banner hidden again once the RECOVERED confirmation has been shown');

  section('2. zone drawer (its own 2D canvas, never WebGL) is untouched throughout');
  await page.evaluate(() => window.__eap.setMode('AUTO'));
  await page.waitForTimeout(300);
  const zoneId = (await page.evaluate(() => window.__eap.zoneList()[0])).zone_id;
  await page.evaluate((zid) => window.__eap.openDrawer(zid), zoneId);
  await page.waitForTimeout(150);
  const drawerBefore = await page.evaluate(() => window.__eap.drawerOpen());
  await page.evaluate(() => window.__eap.simulateContextLoss());
  await waitForLifecycle(page, 'LOST', 2000);
  const drawerDuring = await page.evaluate(() => window.__eap.drawerOpen());
  await page.evaluate(() => window.__eap.simulateContextRestore());
  await waitForLifecycle(page, 'READY', 3000);
  const drawerAfter = await page.evaluate(() => window.__eap.drawerOpen());
  check(drawerBefore && drawerDuring && drawerAfter, 'drawer stayed open across the whole cycle',
    `before=${drawerBefore} during=${drawerDuring} after=${drawerAfter}`);
  await page.evaluate(() => window.__eap.closeDrawer());

  section('3. repeated loss/restore -- no duplicate render loop, no leak');
  await page.evaluate(() => window.__eap.setMode('EAP'));
  await page.waitForTimeout(200);
  const domBefore = await page.evaluate(() => document.querySelectorAll('*').length);
  const countStart = await page.evaluate(() => window.__eap.contextLossCount());
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate(() => window.__eap.simulateContextLoss());
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(120);
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate(() => window.__eap.simulateContextRestore());
    // eslint-disable-next-line no-await-in-loop
    await waitForLifecycle(page, 'READY', 3000);
  }
  const countEnd = await page.evaluate(() => window.__eap.contextLossCount());
  eq(countEnd - countStart, 5, 'exactly 5 more losses counted for 5 real forced losses -- none doubled, none dropped');
  const domAfter = await page.evaluate(() => document.querySelectorAll('*').length);
  eq(domAfter, domBefore, 'DOM node count unchanged after 5 cycles -- no accumulation');
  const fps = await page.evaluate(() => new Promise((r) => setTimeout(() => r(window.__eap.fps()), 1200)));
  check(fps > 0 && fps < 200, 'frame rate still in a single render-loop\'s normal range', `fps=${fps}`);

  section('4. no answer from the browser escalates to FAILED, with a working manual retry');
  await page.evaluate(() => window.__eap.simulateContextLoss());
  check(await waitForLifecycle(page, 'FAILED', 10000), 'escalates to FAILED after the restore timeout with no restore event');
  const failedUi = await page.evaluate(() => ({
    retryHidden: document.getElementById('webgl-retry').hidden,
    text: document.getElementById('webgl-status-text').textContent,
  }));
  check(!failedUi.retryHidden, 'Retry 3D button shown once FAILED');
  check(/could not be restored/i.test(failedUi.text) && /operational data remains available/i.test(failedUi.text),
    'FAILED text (Phase 6\'s exact wording) names the real fallback, not a fabricated cause');
  await page.evaluate(() => document.getElementById('webgl-retry').focus());
  const retryFocused = await page.evaluate(() => document.activeElement.id === 'webgl-retry');
  check(retryFocused, 'Retry button is keyboard-focusable');
  await page.keyboard.press('Enter');
  check(await waitForLifecycle(page, 'READY', 3000), 'Enter on the focused Retry button recovers the view');

  section('5. no page errors across the whole run');
  check(pageErrors.length === 0, 'console and page errors', pageErrors.slice(0, 3).join(' | '));

  await browser.close();

  console.log(`\n${'='.repeat(62)}`);
  console.log(`Results: ${failures} failure(s)`);
  console.log(failures === 0 ? 'EAP WEBGL CONTEXT LIFECYCLE REGRESSION PASSED'
    : 'EAP WEBGL CONTEXT LIFECYCLE REGRESSION FAILED');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
