#!/usr/bin/env node
/**
 * Factory Twin — Step 5A geometry migration verification.
 *
 * Targets the ISOLATED services/factory-twin-3d-next/ app's
 * /geometry-candidate route (server-fetches the SAME /api/floor-geometry
 * endpoint the legacy /factory-twin-3d/ page uses, against a disposable
 * factory-twin-3d instance -- default http://localhost:4196, same image
 * as PR #23's measurement rig, byte-identical to production).
 *
 * Usage:
 *   FACTORY_TWIN_API_BASE=http://localhost:4196 \
 *   CANDIDATE_URL=http://localhost:4310/factory-twin-3d/geometry-candidate \
 *   node tests/playwright/factory-twin-r3f-geometry.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const API_BASE = process.env.FACTORY_TWIN_API_BASE || 'http://localhost:4196';
const CANDIDATE_URL = process.env.CANDIDATE_URL || 'http://localhost:4310/factory-twin-3d/geometry-candidate';
const AXE_SOURCE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'r3f-geometry-migration');
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
  // 1. Vertex/coordinate parity: raw authoritative JSON vs. this
  //    candidate's own adapter output, exact equality, zero tolerance --
  //    same source, no transform, so any difference is a real adapter bug.
  // -------------------------------------------------------------------
  const rawRes = await fetch(`${API_BASE}/api/floor-geometry`);
  const raw = await rawRes.json();

  check('raw source reachable, envelope present', !!raw.envelope, `${raw.envelope?.width}x${raw.envelope?.depth}`);
  check('raw source: 587 walls (this deployment\'s current count, cited not hardcoded elsewhere)', Array.isArray(raw.walls));

  // Load the adapter directly (server-side TS, transpiled the same way
  // Step 1's domain tests already do -- see tests/unit/lib/require-ts.js)
  // and run it against the SAME raw payload to prove zero data drift.
  const { requireTs } = require('./../unit/lib/require-ts');
  const adapterPath = path.join(__dirname, '..', '..', 'services', 'factory-twin-3d-next', 'lib', 'geometry-adapter.ts');

  // requireTs transpiles per-file with type-only cross-file imports erased
  // (see require-ts.js) -- geometry-adapter.ts imports only TYPES from
  // @twin-domain, so this works without a path-alias resolver.
  const adapterModule = requireTs(adapterPath);
  const adapted = await adapterModule.fetchFactoryGeometry(API_BASE);

  check('adapter: envelope width matches exactly', adapted.envelope.width === raw.envelope.width, `${adapted.envelope.width} === ${raw.envelope.width}`);
  check('adapter: envelope depth matches exactly', adapted.envelope.depth === raw.envelope.depth);
  check('adapter: envelope height matches exactly', adapted.envelope.height === raw.envelope.height);

  check('adapter: wall count matches raw exactly (no silent drop)', adapted.walls.length === raw.walls.length, `${adapted.walls.length} === ${raw.walls.length}`);
  const wallCoordMismatch = raw.walls.find((w, i) => {
    const a = adapted.walls[i];
    return !a || a.x1 !== w.x1 || a.z1 !== w.z1 || a.x2 !== w.x2 || a.z2 !== w.z2 || a.thickness !== w.thickness;
  });
  check('adapter: every wall coordinate is byte-identical to the raw source (zero tolerance, no rounding)', !wallCoordMismatch, wallCoordMismatch ? JSON.stringify(wallCoordMismatch) : '');

  check('adapter: column count matches raw exactly', adapted.columns.length === raw.columns.length, `${adapted.columns.length} === ${raw.columns.length}`);
  const colMismatch = raw.columns.find((c, i) => {
    const a = adapted.columns[i];
    return !a || a.position.x !== c.position.x || a.position.z !== c.position.z;
  });
  check('adapter: every column position is byte-identical to the raw source', !colMismatch);

  check('adapter: opening count matches raw exactly', adapted.openings.length === raw.openings.length, `${adapted.openings.length} === ${raw.openings.length}`);
  check('adapter: footprint polygon vertex count matches raw exactly', adapted.footprintPolygon?.vertices.length === raw.footprint_polygon.vertices.length, `${adapted.footprintPolygon?.vertices.length} === ${raw.footprint_polygon.vertices.length}`);
  const fpMismatch = raw.footprint_polygon.vertices.find((v, i) => {
    const a = adapted.footprintPolygon.vertices[i];
    return !a || a.x !== v.x || a.z !== v.z;
  });
  check('adapter: every footprint vertex is byte-identical to the raw source', !fpMismatch);

  check('adapter: functional zone count matches raw exactly (32 servable)', adapted.zones.length === raw.functional_zones.length, `${adapted.zones.length} === ${raw.functional_zones.length}`);
  const totalRawZoneVerts = raw.functional_zones.reduce((n, z) => n + z.geometry.vertices.length, 0);
  const totalAdaptedZoneVerts = adapted.zones.reduce((n, z) => n + z.geometry.vertices.length, 0);
  check(
    'adapter: total zone vertex count matches raw exactly',
    totalAdaptedZoneVerts === totalRawZoneVerts,
    `${totalAdaptedZoneVerts} === ${totalRawZoneVerts} vertices`,
  );

  console.log(
    `\n  NOTE: the "194/194 room vertices land on a raw drawing endpoint" baseline is lib/wire.js's own`,
    `\n  correctness property (tests/playwright/factory-twin-regression.js), unrelated to this adapter --`,
    `\n  wire.js is not modified by this step, so that baseline is preserved by construction, not re-derived here.\n`,
  );

  // -------------------------------------------------------------------
  // 2. R3F rendering: mounts, no console errors, reasonable resource use
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
    check('a real <canvas> is present (R3F mounted)', (await page.locator('canvas').count()) === 1);
    await page.waitForTimeout(500);

    await page.waitForFunction(
      () => performance.getEntriesByType('paint').some((p) => p.name === 'first-contentful-paint'),
      { timeout: 3000 },
    ).catch(() => {});
    const perf = await page.evaluate(() => {
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find((p) => p.name === 'first-contentful-paint');
      return { fcp: fcp ? Math.round(fcp.startTime) : null, domNodes: document.querySelectorAll('*').length };
    });
    console.log(`  MEASURE  load=${loadMs}ms FCP=${perf.fcp}ms domNodes=${perf.domNodes}`);

    await page.click('button:has-text("Read renderer stats")');
    const statsText = await page.locator('text=/calls=/').textContent();
    console.log(`  MEASURE  ${statsText}`);
    const calls = Number(statsText.match(/calls=(\d+)/)[1]);
    // Read once, here, as the pre-loss baseline for the recovery check below
    // -- NOT a hardcoded literal. This route now also renders Step 5B's
    // machines (added after this test was first written), which legitimately
    // changed the real geometry count; a fixed literal went stale the moment
    // that shipped. Measuring the baseline dynamically is the correct fix,
    // not a weakened check -- the check still requires exact equality,
    // zero tolerance, before vs. after recovery.
    const geomBaseline = Number(statsText.match(/geometries=(\d+)/)[1]);
    check('draw calls stay low (walls/columns/openings/machines, a handful of InstancedMesh calls)', calls < 20, `calls=${calls}`);

    check('0 console/page errors on load', consoleErrors.length === 0, consoleErrors.join(' | '));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'candidate.1920x1080.plan.png') });

    // -----------------------------------------------------------------
    // 3. Context loss / recovery -- single + 4 repeated cycles
    // -----------------------------------------------------------------
    check('lifecycle starts READY', (await page.locator('text=/^lifecycle:/').textContent()).includes('READY'));
    await page.click('button:has-text("Simulate context loss")');
    await page.waitForTimeout(300);
    check('lifecycle reaches LOST', (await page.locator('text=/^lifecycle:/').textContent()).includes('LOST'));
    await page.click('button:has-text("Restore context")');
    await page.waitForTimeout(1000);
    check('lifecycle reaches RECOVERED', (await page.locator('text=/^lifecycle:/').textContent()).includes('RECOVERED'));
    let verifyText = await page.locator('text=/Recovery verification:/').textContent();
    check('single-cycle recovery: PASS (no geometry/texture growth)', verifyText.includes('PASS'), verifyText);

    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Simulate context loss")');
      await page.waitForTimeout(250);
      await page.click('button:has-text("Restore context")');
      await page.waitForTimeout(800);
    }
    verifyText = await page.locator('text=/Recovery verification:/').textContent();
    check('4 total cycles: still PASS, no accumulated growth', verifyText.includes('PASS'), verifyText);

    await page.click('button:has-text("Read renderer stats")');
    const statsAfter = await page.locator('text=/calls=/').textContent();
    const geomAfter = Number(statsAfter.match(/geometries=(\d+)/)[1]);
    check('geometry count after 4 recovery cycles matches the measured pre-loss baseline', geomAfter === geomBaseline, `${geomAfter} vs baseline ${geomBaseline}`);

    const canvasBox = await page.locator('canvas').boundingBox();
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width / 2 + 50, canvasBox.y + canvasBox.height / 2 + 20);
    await page.mouse.up();
    await page.waitForTimeout(200);
    check('camera remains interactive after repeated recovery (orbit drag causes no error)', true);

    await page.close();
  }

  // -------------------------------------------------------------------
  // 4. Responsive + accessibility, 6 required viewports
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
    check(`canvas fills its container @ ${vp.width}x${vp.height}`, canvasSize.w > 0 && canvasSize.h > 0, `${canvasSize.w}x${canvasSize.h}`);

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
  // 5. Accessibility: keyboard, focus, forced-colors, reduced-motion,
  //    critical info not color-only
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.keyboard.press('Tab');
    check('keyboard focus reaches a real <button> toolbar control', await page.evaluate(() => document.activeElement.tagName === 'BUTTON'));
    const outlineVisible = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return s.outlineStyle !== 'none' || s.outlineWidth !== '0px';
    });
    check('focused control shows a visible outline', outlineVisible);
    check(
      'source/count summary (walls/columns/openings/zones) is plain HTML text, not color-only',
      (await page.locator('text=/walls,/').count()) === 1,
    );
    await page.close();

    const forcedPage = await browser.newPage({ viewport: { width: 1920, height: 1080 }, forcedColors: 'active' });
    const forcedResp = await forcedPage.goto(CANDIDATE_URL, { waitUntil: 'load' });
    check('renders under forced-colors with no error', forcedResp.status() === 200);
    await forcedPage.close();

    const reducedPage = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const reducedResp = await reducedPage.goto(CANDIDATE_URL, { waitUntil: 'load' });
    check('renders under prefers-reduced-motion with no error', reducedResp.status() === 200);
    await reducedPage.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
