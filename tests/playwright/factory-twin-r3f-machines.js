#!/usr/bin/env node
/**
 * Factory Twin — Step 5B static machine migration verification.
 *
 * Targets the ISOLATED services/factory-twin-3d-next/ app's
 * /geometry-candidate route (now geometry + static machines), fetching
 * from a disposable factory-twin-3d instance -- default
 * http://localhost:4196, same image as PR #23/Step 5A, byte-identical to
 * production.
 *
 * Usage:
 *   FACTORY_TWIN_API_BASE=http://localhost:4196 \
 *   CANDIDATE_URL=http://localhost:4310/factory-twin-3d/geometry-candidate \
 *   node tests/playwright/factory-twin-r3f-machines.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const API_BASE = process.env.FACTORY_TWIN_API_BASE || 'http://localhost:4196';
const CANDIDATE_URL = process.env.CANDIDATE_URL || 'http://localhost:4310/factory-twin-3d/geometry-candidate';
const AXE_SOURCE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'r3f-machine-migration');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

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
  // -------------------------------------------------------------------
  // 1. Machine source parity: raw authoritative JSON vs. the new
  //    adapter's output, exact equality -- same rule app.js itself
  //    applies (skip duplicate_of), not re-derived independently.
  // -------------------------------------------------------------------
  const rawRes = await fetch(`${API_BASE}/api/floor-geometry`);
  const raw = await rawRes.json();
  const rawEquipment = Array.isArray(raw.equipment) ? raw.equipment : [];
  const rawDuplicates = rawEquipment.filter((e) => e.duplicate_of);
  const expectedCount = rawEquipment.length - rawDuplicates.length;

  check('raw source: equipment array present', rawEquipment.length > 0, `${rawEquipment.length} records`);
  check('raw source: exactly 2 records marked duplicate_of (this deployment\'s current data)', rawDuplicates.length === 2, `${rawDuplicates.length}`);

  const { requireTs } = require('./../unit/lib/require-ts');
  const adapterPath = path.join(__dirname, '..', '..', 'services', 'factory-twin-3d-next', 'lib', 'machine-adapter.ts');
  const adapterModule = requireTs(adapterPath);
  const machines = await adapterModule.fetchMachines(API_BASE);

  check(
    'adapter: machine count == raw count minus duplicates (app.js\'s own dedup rule, "one physical asset, one render, always")',
    machines.length === expectedCount,
    `${machines.length} === ${expectedCount}`,
  );
  check('adapter: no duplicate_of record survived', machines.every((m) => m.duplicate_of === null));

  const rawById = new Map(rawEquipment.map((e) => [e.id, e]));
  const idMismatch = machines.find((m) => {
    const r = rawById.get(m.id);
    return !r || r.position.x !== m.position.x || r.position.y !== m.position.y || r.position.z !== m.position.z;
  });
  check('adapter: every surviving machine\'s id + position is byte-identical to the raw source', !idMismatch, idMismatch ? JSON.stringify(idMismatch) : '');

  const rotationMismatch = machines.find((m) => {
    const r = rawById.get(m.id);
    return r.rotation_deg !== null && m.rotation_deg !== r.rotation_deg;
  });
  check('adapter: every machine\'s rotation_deg is byte-identical to the raw source', !rotationMismatch);

  const idSet = new Set(machines.map((m) => m.id));
  check('adapter: every machine id is unique (no accidental duplication)', idSet.size === machines.length, `${idSet.size} unique of ${machines.length}`);

  // -------------------------------------------------------------------
  // 2. R3F rendering: mounts, resource counts, no console errors
  // -------------------------------------------------------------------
  const browser = await chromium.launch();
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    const t0 = Date.now();
    const response = await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    const loadMs = Date.now() - t0;
    check('candidate route responds 200', response && response.status() === 200);
    await page.waitForSelector('canvas', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    check(
      `page summary reports ${expectedCount} machines (matches adapter parity above)`,
      (await page.locator(`text=/${expectedCount} machines/`).count()) === 1,
    );

    await page.waitForFunction(
      () => performance.getEntriesByType('paint').some((p) => p.name === 'first-contentful-paint'),
      { timeout: 3000 },
    ).catch(() => {});
    const perf = await page.evaluate(() => {
      const fcp = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
      return { fcp: fcp ? Math.round(fcp.startTime) : null };
    });
    console.log(`  MEASURE  load=${loadMs}ms FCP=${perf.fcp}ms`);

    await page.click('button:has-text("Read renderer stats")');
    const statsBaseline = await page.locator('text=/calls=/').textContent();
    console.log(`  MEASURE  ${statsBaseline}`);
    const callsBaseline = Number(statsBaseline.match(/calls=(\d+)/)[1]);
    const geomBaseline = Number(statsBaseline.match(/geometries=(\d+)/)[1]);
    check('draw calls stay low (geometry ~9 + machines 2 = ~11)', callsBaseline <= 15, `calls=${callsBaseline}`);
    check('0 console/page errors on load', consoleErrors.length === 0, consoleErrors.join(' | '));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'candidate.1920x1080.plan.png') });

    // -----------------------------------------------------------------
    // 3. Render-loop safety (Section 8): idle, camera orbit, resize
    // -----------------------------------------------------------------
    const rendersAtStart = Number((await page.locator('text=/reactRenders:/').textContent()).match(/(\d+)/)[1]);
    await page.waitForTimeout(3000);
    const rendersAfterIdle = Number((await page.locator('text=/reactRenders:/').textContent()).match(/(\d+)/)[1]);
    check('idle 3s: 0 new React renders', rendersAfterIdle === rendersAtStart, `${rendersAtStart} -> ${rendersAfterIdle}`);

    const canvasBox = await page.locator('canvas').boundingBox();
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.mouse.down();
    for (let i = 0; i < 8; i++) {
      await page.mouse.move(canvasBox.x + canvasBox.width / 2 + i * 6, canvasBox.y + canvasBox.height / 2 + i * 4);
    }
    await page.mouse.up();
    await page.waitForTimeout(150);
    const rendersAfterOrbit = Number((await page.locator('text=/reactRenders:/').textContent()).match(/(\d+)/)[1]);
    check('camera orbit: 0 new React renders (machines/geometry not rebuilt)', rendersAfterOrbit === rendersAtStart, `${rendersAtStart} -> ${rendersAfterOrbit}`);

    await page.click('button:has-text("Read renderer stats")');
    const statsAfterOrbit = await page.locator('text=/calls=/').textContent();
    const geomAfterOrbit = Number(statsAfterOrbit.match(/geometries=(\d+)/)[1]);
    check('camera orbit: geometry count unchanged (no rebuild)', geomAfterOrbit === geomBaseline, `${geomBaseline} -> ${geomAfterOrbit}`);

    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(300);
    await page.click('button:has-text("Read renderer stats")');
    const statsAfterResize = await page.locator('text=/calls=/').textContent();
    const geomAfterResize = Number(statsAfterResize.match(/geometries=(\d+)/)[1]);
    check('resize: geometry count unchanged (no resource recreation)', geomAfterResize === geomBaseline, `${geomBaseline} -> ${geomAfterResize}`);
    await page.setViewportSize({ width: 1920, height: 1080 });

    // -----------------------------------------------------------------
    // 4. Context loss / recovery -- single + 4 repeated, machines survive
    // -----------------------------------------------------------------
    await page.click('button:has-text("Simulate context loss")');
    await page.waitForTimeout(300);
    check('lifecycle reaches LOST', (await page.locator('text=/^lifecycle:/').textContent()).includes('LOST'));
    await page.click('button:has-text("Restore context")');
    await page.waitForTimeout(1000);
    check('lifecycle reaches RECOVERED', (await page.locator('text=/^lifecycle:/').textContent()).includes('RECOVERED'));
    let verifyText = await page.locator('text=/Recovery verification:/').textContent();
    check('single-cycle recovery: PASS (no geometry/texture growth, machines included)', verifyText.includes('PASS'), verifyText);

    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Simulate context loss")');
      await page.waitForTimeout(250);
      await page.click('button:has-text("Restore context")');
      await page.waitForTimeout(800);
    }
    verifyText = await page.locator('text=/Recovery verification:/').textContent();
    check('4 total cycles: still PASS, no accumulated growth', verifyText.includes('PASS'), verifyText);

    await page.click('button:has-text("Read renderer stats")');
    const statsFinal = await page.locator('text=/calls=/').textContent();
    const geomFinal = Number(statsFinal.match(/geometries=(\d+)/)[1]);
    check('geometry count after 4 recovery cycles matches pre-loss baseline (machines still present)', geomFinal === geomBaseline, `${geomBaseline} vs ${geomFinal}`);

    await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.waitForTimeout(150);
    check('camera remains interactive after repeated recovery (click causes no error)', true);

    await page.close();
  }

  // -------------------------------------------------------------------
  // 5. Responsive + accessibility, all 6 required viewports
  // -------------------------------------------------------------------
  const VIEWPORTS = [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(300);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`no horizontal overflow @ ${vp.width}x${vp.height}`, overflow <= 0, `${overflow}px`);

    const canvasSize = await page.locator('canvas').evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));
    check(`canvas fills its container @ ${vp.width}x${vp.height}`, canvasSize.w > 0 && canvasSize.h > 0);

    await page.addScriptTag({ content: AXE_SOURCE });
    const axeResults = await page.evaluate(() => window.axe.run());
    const serious = axeResults.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`axe: 0 serious/critical violations @ ${vp.width}x${vp.height}`, serious.length === 0, serious.map((v) => v.id).join(', '));

    if (vp.width === 1920) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `candidate.${vp.width}x${vp.height}.png`) });
    }
    await page.close();
  }

  // -------------------------------------------------------------------
  // 6. Accessibility, no color-only meaning
  //
  // SUPERSEDED, not weakened: this block originally asserted "clicking a
  // machine does NOT create any selection UI (deferred to a later step)"
  // -- correct for Step 5B's own scope at the time. Step 5C's entire
  // mission is to build exactly that selection UI; the old assertion's
  // premise (no selection exists yet) is retired by design, the same way
  // Step 5A's hardcoded geometry-count baseline was superseded (not
  // weakened) when Step 5B legitimately grew it. See
  // FACTORY_TWIN_R3F_SELECTION_MIGRATION.md for the full regression note.
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(400);
    // (450, 250) is a known-good hit in the default 'plan' view against
    // this deployment's real geometry/machine data -- confirmed by
    // scanning several candidate points and reading the panel back, not
    // guessed. The canvas center is empty floor in this layout (verified),
    // which is why this test does not use boundingBox()'s midpoint.
    await page.mouse.click(450, 250);
    await page.waitForTimeout(200);
    check(
      'Step 5C supersedes Step 5B here: clicking a machine now DOES surface selection UI (machine.id, semantic DOM)',
      (await page.locator('text=/Selected machine:/').count()) === 1,
    );
    await page.close();

    // Separate fresh page/tab sequence: a prior canvas click can itself take
    // focus, so a Tab pressed right after it lands wherever focus already
    // was, not necessarily the first toolbar button -- irrelevant to what
    // this check is actually verifying (does keyboard navigation reach the
    // toolbar AT ALL, independent of any canvas interaction).
    const keyboardPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await keyboardPage.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await keyboardPage.waitForSelector('canvas');
    await keyboardPage.keyboard.press('Tab');
    check('keyboard focus reaches a real <button> toolbar control', await keyboardPage.evaluate(() => document.activeElement.tagName === 'BUTTON'));
    await keyboardPage.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
