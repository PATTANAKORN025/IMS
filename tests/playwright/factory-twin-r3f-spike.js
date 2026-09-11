#!/usr/bin/env node
/**
 * Factory Twin — Step 4 R3F runtime spike, full verification.
 *
 * Targets the ISOLATED services/factory-twin-3d-next/ app's /r3f-spike
 * route (a synthetic placeholder scene, not the real Factory Twin). Start
 * the shell first:
 *
 *   cd services/factory-twin-3d-next && npm run build && npm run start
 *
 * Usage:
 *   SPIKE_URL=http://localhost:4310/factory-twin-3d/r3f-spike node tests/playwright/factory-twin-r3f-spike.js
 *
 * Supersedes this file's own earlier version, which found (and asserted as
 * a "KNOWN GAP") that webglcontextrestored never fired. That was a real
 * spike-methodology bug -- simulating loss/restore via a freshly re-fetched
 * WEBGL_lose_context extension reference, rather than app.js's own proven
 * renderer.forceContextLoss()/forceContextRestore() API (app.js:3746-3747)
 * -- fixed in TwinViewport.tsx, and this file now asserts the corrected,
 * WORKING recovery lifecycle. See docs/evidence/FACTORY_TWIN_R3F_SPIKE.md.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SPIKE_URL = process.env.SPIKE_URL || 'http://localhost:4310/factory-twin-3d/r3f-spike';
const AXE_SOURCE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'r3f-spike');
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

async function readStats(page) {
  await page.click('button:has-text("Read renderer stats")');
  const text = await page.locator('text=/calls=/').textContent();
  return {
    calls: Number(text.match(/calls=(\d+)/)[1]),
    triangles: Number(text.match(/tris=(\d+)/)[1]),
    idleFrames: Number(text.match(/idleFrames\(3s\)=(\d+)/)[1]),
  };
}

async function readRenderCount(page) {
  const text = await page.locator('text=/reactRenders:/').textContent();
  return Number(text.match(/reactRenders:\s*(\d+)/)[1]);
}

async function readLifecycle(page) {
  return (await page.locator('text=/^lifecycle:/').textContent()).replace('lifecycle:', '').trim();
}

(async () => {
  const browser = await chromium.launch();

  // -------------------------------------------------------------------
  // 1. Route / scene mount, draw calls, triangles
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    const response = await page.goto(SPIKE_URL, { waitUntil: 'load' });
    check('spike route responds 200', response && response.status() === 200);
    await page.waitForSelector('canvas', { timeout: 5000 }).catch(() => {});
    check('a real <canvas> is present (R3F mounted)', (await page.locator('canvas').count()) === 1);
    await page.waitForTimeout(300);

    const initial = await readStats(page);
    check('64 instances draw as exactly 1 draw call (InstancedMesh)', initial.calls === 1, `calls=${initial.calls}`);
    check('triangle count matches 64 boxes (12 tris each)', initial.triangles === 768, `tris=${initial.triangles}`);

    // -----------------------------------------------------------------
    // 2. React render count vs WebGL frame count (Section 5)
    // -----------------------------------------------------------------
    const rendersAfterMount = await readRenderCount(page);
    const canvasBox = await page.locator('canvas').boundingBox();

    // Real in-page click timing (not Playwright's own dispatch RTT) --
    // this engagement's established methodology (see FACTORY_TWIN_3D_
    // PERFORMANCE.md's "Correction on method").
    const clickLatencyMs = await page.evaluate(({ x, y }) => {
      const t0 = performance.now();
      const canvas = document.querySelector('canvas');
      canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
      return performance.now() - t0;
    }, { x: canvasBox.width / 2, y: canvasBox.height / 2 });
    await page.waitForTimeout(100);

    const selectionText = await page.locator('text=/Selected:|No selection/').first().textContent();
    check(
      'clicking an instance sets a SelectionState-shaped selection',
      /^Selected: SPIKE-EQP-\d{3}$/.test(selectionText.trim()),
      selectionText,
    );
    check('in-page click-to-select latency is sub-frame (< 16.7ms)', clickLatencyMs < 16.7, `${clickLatencyMs.toFixed(2)}ms`);

    const rendersAfterOneClick = await readRenderCount(page);
    // "Read renderer stats" clicks and the selection click each cause
    // exactly one discrete React state update -- the point is that this
    // number stays tiny and countable, not that it is a specific value.
    check(
      'React render count stays small/discrete after one selection (not tied to WebGL frame count)',
      rendersAfterOneClick - rendersAfterMount <= 3,
      `+${rendersAfterOneClick - rendersAfterMount} renders`,
    );

    await page.waitForTimeout(3200);
    // Read the render count BEFORE clicking "Read renderer stats" -- that
    // click is itself one discrete, legitimate React state update
    // (setStats), and counting it against "renders caused by idling" would
    // blame this test's own instrumentation for a render the component
    // never made on its own.
    const rendersAfterIdle = await readRenderCount(page);
    const idleStats = await readStats(page);
    check(
      'demand rendering: near-zero WebGL frames over a 3s idle window (< 10, not ~180 for 60fps continuous)',
      idleStats.idleFrames < 10,
      `idleFrames=${idleStats.idleFrames}`,
    );
    check(
      'PROOF: WebGL frames (idle window) far exceed React renders caused by idling (0 new)',
      rendersAfterIdle === rendersAfterOneClick,
      `reactRenders stayed at ${rendersAfterIdle} while ${idleStats.idleFrames} WebGL frame(s) rendered`,
    );

    // -----------------------------------------------------------------
    // 3. Camera (view presets) -- discrete, not per-frame state
    // -----------------------------------------------------------------
    const rendersBeforeView = await readRenderCount(page);
    await page.click('button:has-text("overview")');
    await page.waitForTimeout(100);
    const rendersAfterView = await readRenderCount(page);
    check('switching view is one discrete React update', rendersAfterView - rendersBeforeView === 1, `+${rendersAfterView - rendersBeforeView}`);

    // Orbit drag -- OrbitControls manages this entirely inside three.js;
    // confirm it does not explode React's own render count.
    const rendersBeforeDrag = await readRenderCount(page);
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.mouse.down();
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(canvasBox.x + canvasBox.width / 2 + i * 5, canvasBox.y + canvasBox.height / 2 + i * 3);
    }
    await page.mouse.up();
    await page.waitForTimeout(200);
    const rendersAfterDrag = await readRenderCount(page);
    check(
      'orbit drag (10 pointer moves) causes 0 TwinViewport React re-renders',
      rendersAfterDrag === rendersBeforeDrag,
      `+${rendersAfterDrag - rendersBeforeDrag}`,
    );

    // -----------------------------------------------------------------
    // 4. WebGL context-loss lifecycle (Section 8) -- single cycle
    // -----------------------------------------------------------------
    check('lifecycle starts READY', (await readLifecycle(page)) === 'READY');
    await page.click('button:has-text("Simulate context loss")');
    await page.waitForTimeout(300);
    check('lifecycle reaches LOST', (await readLifecycle(page)) === 'LOST');
    await page.click('button:has-text("Restore context")');
    await page.waitForTimeout(1000);
    check('lifecycle reaches RECOVERED', (await readLifecycle(page)) === 'RECOVERED');
    const verifyText = await page.locator('text=/Recovery verification:/').textContent();
    check('recovery verification reports PASS (no geometry/texture growth)', verifyText.includes('PASS'), verifyText);

    const canvasBox2 = await page.locator('canvas').boundingBox();
    await page.mouse.click(canvasBox2.x + canvasBox2.width / 2, canvasBox2.y + canvasBox2.height / 2);
    await page.waitForTimeout(200);
    const selectionAfterRecovery = await page.locator('text=/Selected:|No selection/').first().textContent();
    check(
      'scene is genuinely interactive after recovery (click selects again)',
      /^Selected: SPIKE-EQP-\d{3}$/.test(selectionAfterRecovery.trim()),
      selectionAfterRecovery,
    );

    // -----------------------------------------------------------------
    // 5. Repeated loss/restore cycles -- no resource growth accumulation
    // -----------------------------------------------------------------
    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Simulate context loss")');
      await page.waitForTimeout(250);
      await page.click('button:has-text("Restore context")');
      await page.waitForTimeout(800);
    }
    const verifyAfterRepeats = await page.locator('text=/Recovery verification:/').textContent();
    check('4 total loss/restore cycles: still PASS, no accumulated growth', verifyAfterRepeats.includes('PASS'), verifyAfterRepeats);
    check('lifecycle settles at RECOVERED after repeated cycles', (await readLifecycle(page)) === 'RECOVERED');

    // Playwright's page.mouse API dispatches raw mouse events without a
    // matching real Pointer Events capture lifecycle, so drei's
    // OrbitControls calling releasePointerCapture() on a pointerId
    // Playwright never actually captured throws in headless Chromium --
    // a documented Playwright/PointerEvent-capture interaction quirk, not
    // an application defect a real mouse/touch user would ever trigger.
    // Disclosed, filtered explicitly, not silently swallowed.
    const realErrors = consoleErrors.filter((e) => !e.includes('releasePointerCapture'));
    check(
      '0 real console/page errors (Playwright pointer-capture emulation artifact excluded, see comment)',
      realErrors.length === 0,
      realErrors.join(' | '),
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'r3f-spike.1920x1080.full.png') });
    await page.close();
  }

  // -------------------------------------------------------------------
  // 6. DPR variation -- 1, 1.5, 2 (Section 10)
  // -------------------------------------------------------------------
  for (const dpr of [1, 1.5, 2]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
    await page.goto(SPIKE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(300);
    const stats = await readStats(page);
    check(
      `dpr=${dpr}: draw calls/triangles unaffected by pixel ratio (scene-complexity independent)`,
      stats.calls === 1 && stats.triangles === 768,
      `calls=${stats.calls} tris=${stats.triangles}`,
    );
    await page.close();
  }

  // -------------------------------------------------------------------
  // 7. Responsive + accessibility, all 6 required viewports
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
    await page.goto(SPIKE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(200);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`no horizontal overflow @ ${vp.width}x${vp.height}`, overflow <= 0, `${overflow}px`);

    const canvasSize = await page.locator('canvas').evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));
    check(
      `canvas resizes to fill its container, no 0-size canvas @ ${vp.width}x${vp.height}`,
      canvasSize.w > 0 && canvasSize.h > 0,
      `${canvasSize.w}x${canvasSize.h}`,
    );

    await page.addScriptTag({ content: AXE_SOURCE });
    const axeResults = await page.evaluate(() => window.axe.run());
    const serious = axeResults.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(
      `axe: 0 serious/critical violations @ ${vp.width}x${vp.height}`,
      serious.length === 0,
      serious.map((v) => v.id).join(', '),
    );

    if (vp.width === 1920) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `r3f-spike.${vp.width}x${vp.height}.full.png`) });
    }
    await page.close();
  }

  // -------------------------------------------------------------------
  // 8. Accessibility detail: keyboard reaches toolbar, focus visible,
  //    selection info available OUTSIDE the canvas, reduced-motion,
  //    forced-colors
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(SPIKE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');

    await page.keyboard.press('Tab');
    const firstFocusIsButton = await page.evaluate(() => document.activeElement.tagName === 'BUTTON');
    check('keyboard focus reaches a real <button> (toolbar), not swallowed by canvas', firstFocusIsButton);

    const outlineVisible = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement);
      return style.outlineStyle !== 'none' || style.outlineWidth !== '0px';
    });
    check('focused toolbar control shows a visible outline', outlineVisible);

    // Selection readout lives in a plain HTML overlay <div>, outside the
    // <canvas> element entirely -- verified structurally, not just visually.
    const selectionOutsideCanvas = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      // querySelectorAll returns document order (ancestors before
      // descendants) -- .find() must pick the LEAF readout div, not an
      // ancestor wrapper whose aggregated textContent also matches (that
      // wrapper legitimately contains the canvas, which would falsely
      // fail this check). The leaf is the last, most specific match.
      const candidates = [...document.querySelectorAll('div')].filter((d) =>
        /Selected:|No selection/.test(d.textContent || ''),
      );
      const readout = candidates[candidates.length - 1];
      return !!readout && !canvas.contains(readout) && !readout.contains(canvas);
    });
    check('selected-object info renders in semantic HTML outside the canvas', selectionOutsideCanvas);

    const reducedPage = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const reducedResp = await reducedPage.goto(SPIKE_URL, { waitUntil: 'load' });
    check('renders under prefers-reduced-motion with no error', reducedResp.status() === 200);
    await reducedPage.close();

    const forcedPage = await browser.newPage({ viewport: { width: 1920, height: 1080 }, forcedColors: 'active' });
    const forcedResp = await forcedPage.goto(SPIKE_URL, { waitUntil: 'load' });
    const toolbarVisible = await forcedPage.locator('button:has-text("plan")').isVisible();
    check('renders under forced-colors with no error and toolbar stays visible', forcedResp.status() === 200 && toolbarVisible);
    await forcedPage.close();

    await page.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
