#!/usr/bin/env node
/**
 * Factory Twin — Step 4 R3F runtime spike verification.
 *
 * Targets the ISOLATED services/factory-twin-3d-next/ app's /r3f-spike
 * route (a synthetic placeholder scene, not the real Factory Twin). Start
 * the shell first:
 *
 *   cd services/factory-twin-3d-next && npm run build && npm run start
 *
 * Usage:
 *   SPIKE_URL=http://localhost:4310/factory-twin-3d/r3f-spike node tests/playwright/factory-twin-r3f-spike.js
 */

'use strict';

const { chromium } = require('playwright');

const SPIKE_URL = process.env.SPIKE_URL || 'http://localhost:4310/factory-twin-3d/r3f-spike';

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? `  ${detail}` : ''}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const response = await page.goto(SPIKE_URL, { waitUntil: 'load' });
  check('spike route responds 200', response && response.status() === 200);
  await page.waitForSelector('canvas', { timeout: 5000 }).catch(() => {});
  check('a real <canvas> is present (R3F mounted)', (await page.locator('canvas').count()) === 1);
  await page.waitForTimeout(300);

  await page.click('button:has-text("Read renderer stats")');
  const statsText = await page.locator('text=/calls=/').textContent();
  const calls = Number(statsText.match(/calls=(\d+)/)[1]);
  const tris = Number(statsText.match(/tris=(\d+)/)[1]);
  check('64 instances draw as exactly 1 draw call (InstancedMesh)', calls === 1, `calls=${calls}`);
  check('triangle count matches 64 boxes (12 tris each)', tris === 768, `tris=${tris}`);

  const canvasBox = await page.locator('canvas').boundingBox();
  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.waitForTimeout(200);
  const selectionText = await page.locator('text=/Selected:|No selection/').first().textContent();
  check('clicking an instance sets a SelectionState-shaped selection', /^Selected: SPIKE-EQP-\d{3}$/.test(selectionText.trim()), selectionText);

  await page.waitForTimeout(3000);
  await page.click('button:has-text("Read renderer stats")');
  const idleStatsText = await page.locator('text=/calls=/').textContent();
  const idleFrames = Number(idleStatsText.match(/idleFrames\(3s\)=(\d+)/)[1]);
  check(
    'demand rendering: near-zero frames rendered over a 3s idle window (< 10, not ~180 for 60fps continuous)',
    idleFrames < 10,
    `idleFrames=${idleFrames}`,
  );

  // WebGL context-loss/restore -- documented as a KNOWN, UNRESOLVED gap
  // (see FACTORY_TWIN_R3F_RUNTIME_SPIKE.md), asserted here so a future fix
  // makes this test start failing loudly if the assumption changes, per
  // this engagement's own "measure, don't assume" discipline.
  await page.click('button:has-text("Simulate context loss")');
  await page.waitForTimeout(500);
  const statusAfterLoss = await page.locator('text=/context:/').textContent();
  check('context-loss event is detected', statusAfterLoss.includes('lost'));
  await page.click('button:has-text("Restore context")');
  await page.waitForTimeout(1500);
  const statusAfterRestore = await page.locator('text=/context:/').textContent();
  check(
    'KNOWN GAP (not yet fixed): webglcontextrestored does not fire through R3F\'s canvas in this environment -- see spike doc',
    statusAfterRestore.includes('lost'),
    statusAfterRestore,
  );

  check('0 console/page errors across the whole run', consoleErrors.length === 0, consoleErrors.join(' | '));

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
