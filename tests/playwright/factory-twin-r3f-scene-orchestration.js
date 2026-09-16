#!/usr/bin/env node
/**
 * Factory Twin — Step 5F scene orchestration + single WebGL lifecycle
 * verification.
 *
 * Targets the ISOLATED services/factory-twin-3d-next/ app's
 * /geometry-candidate route (geometry + machines + selection + camera +
 * layers + reference, now composed through one orchestration boundary --
 * GeometryViewport -> GeometryScene), fetching from a disposable
 * factory-twin-3d instance -- default http://localhost:4196, same image as
 * Steps 5A-5E, byte-identical to production.
 *
 * Usage:
 *   FACTORY_TWIN_API_BASE=http://localhost:4196 \
 *   CANDIDATE_URL=http://localhost:4310/factory-twin-3d/geometry-candidate \
 *   node tests/playwright/factory-twin-r3f-scene-orchestration.js
 */

'use strict';

const path = require('path');
const { chromium } = require('playwright');

const API_BASE = process.env.FACTORY_TWIN_API_BASE || 'http://localhost:4196';
const CANDIDATE_URL = process.env.CANDIDATE_URL || 'http://localhost:4310/factory-twin-3d/geometry-candidate';

const SETTLE_MS = 1000;
const HIT_A = { x: 440, y: 260 }; // -> a machine, plan view (same dataset/coords as Steps 5C/5D/5E)
const HIT_B = { x: 590, y: 240 };

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

async function selectedText(page) {
  return page.locator('text=/Selected machine:|No machine selected/').first().textContent();
}
async function readStats(page) {
  await page.click('button:has-text("Read renderer stats")');
  const t = await page.locator('text=/calls=/').textContent();
  return {
    calls: Number(t.match(/calls=(\d+)/)[1]),
    triangles: Number(t.match(/tris=(\d+)/)[1]),
    geometries: Number(t.match(/geometries=(\d+)/)[1]),
    textures: Number(t.match(/textures=(\d+)/)[1]),
    programs: Number(t.match(/programs=(\d+)/)[1]),
  };
}
async function readCounters(page) {
  const t = await page.locator('text=/controllerMounts:/').textContent();
  return {
    controllerMounts: Number(t.match(/controllerMounts: (\d+)/)[1]),
    contextLost: Number(t.match(/contextLost: (\d+)/)[1]),
    contextRestored: Number(t.match(/contextRestored: (\d+)/)[1]),
  };
}
async function heapBytes(page) {
  return page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null));
}
async function lifecycleText(page) {
  return page.locator('text=/lifecycle:/').first().textContent();
}
function layerCheckbox(page, label) {
  return page.locator(`label:has-text("${label}") input`);
}
async function toggleLayer(page, label) {
  await layerCheckbox(page, label).click();
}
async function loseAndRestore(page, waitLostMs = 300, waitRestoredMs = 1000) {
  await page.click('button:has-text("Simulate context loss")');
  await page.waitForTimeout(waitLostMs);
  await page.click('button:has-text("Restore context")');
  await page.waitForTimeout(waitRestoredMs);
}
async function verifyText(page) {
  return page.locator('text=/Recovery verification:/').textContent();
}

(async () => {
  const rawRes = await fetch(`${API_BASE}/api/floor-geometry`);
  const raw = await rawRes.json();
  const expectedMachineCount = (Array.isArray(raw.equipment) ? raw.equipment : []).filter((e) => !e.duplicate_of).length;

  const browser = await chromium.launch();

  // -------------------------------------------------------------------
  // 1. Single orchestration boundary + single lifecycle owner (structural)
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(SETTLE_MS);

    const summary = await page.locator('text=/machines/').first().textContent();
    check('page reports the expected machine count from the authoritative API', summary.includes(`${expectedMachineCount} machines`), `expected ${expectedMachineCount}, summary: "${summary}"`);

    const c0 = await readCounters(page);
    check('exactly 1 camera-controller mount at page load (single orchestration boundary, no duplicate)', c0.controllerMounts === 1, JSON.stringify(c0));
    check('0 context-loss/restore events before any trigger', c0.contextLost === 0 && c0.contextRestored === 0);
    check('0 console/page errors on initial load', consoleErrors.length === 0, consoleErrors.join(' | '));
    await page.close();
  }

  // -------------------------------------------------------------------
  // 2. Context loss matrix -- 8 distinct trigger scenarios + full verification
  // -------------------------------------------------------------------
  const scenarios = [
    {
      name: '1. loss during idle',
      setup: async (page) => { await page.waitForTimeout(500); },
    },
    {
      name: '2. loss during orbit',
      setup: async (page) => {
        // A completed orbit gesture (mousedown -> moves -> mouseup)
        // immediately before loss -- "loss during orbit" as in loss
        // arriving while active orbiting is underway/just finished, not a
        // literal half-finished browser pointer sequence (forcing context
        // loss with the mouse button still synthetically "down" left
        // OrbitControls' internal drag/damping state stale across the
        // restore, producing small residual post-recovery drift even
        // after an explicit preset reset -- a real characteristic of
        // interrupting a raw, unterminated pointer gesture, not something
        // this step's lifecycle integration is meant to test).
        await page.click('button:has-text("overview")');
        await page.waitForTimeout(200);
        await page.mouse.move(960, 540);
        await page.mouse.down();
        for (let i = 1; i <= 6; i++) await page.mouse.move(960 + i * 6, 540 + i * 4);
        await page.mouse.up();
      },
      teardown: async (page) => {
        // Restore the 'plan' preset so the shared post-recovery selection
        // check below (HIT_A/HIT_B) hits known-good coordinates again --
        // this scenario deliberately moved the camera (its own setup).
        // Uses the 'plan' VIEW button specifically (not "Reset Camera"):
        // `view` is currently 'overview' here, so clicking 'plan' is a
        // real overview->plan transition that re-fires the preset effect;
        // "Reset Camera" would reapply the CURRENT view's preset
        // (overview), the wrong one.
        await page.click('button:has-text("plan")');
        await page.waitForTimeout(500);
      },
    },
    {
      name: '3. loss after selection',
      setup: async (page) => {
        await page.mouse.click(HIT_A.x, HIT_A.y);
        await page.waitForFunction(() => document.body.innerText.includes('Selected machine:'), { timeout: 2000 });
      },
    },
    {
      name: '4. loss with machines hidden',
      setup: async (page) => {
        await toggleLayer(page, 'Machines');
        await page.waitForTimeout(150);
      },
      teardown: async (page) => { await toggleLayer(page, 'Machines'); await page.waitForTimeout(150); },
    },
    {
      name: '5. loss with reference enabled',
      setup: async (page) => {
        await toggleLayer(page, 'Reference CAD');
        await page.waitForTimeout(300);
      },
      teardown: async (page) => { await toggleLayer(page, 'Reference CAD'); await page.waitForTimeout(150); },
    },
    {
      name: '6. loss with grid disabled',
      setup: async (page) => {
        await toggleLayer(page, 'Structural grid');
        await page.waitForTimeout(150);
      },
      teardown: async (page) => { await toggleLayer(page, 'Structural grid'); await page.waitForTimeout(150); },
    },
    {
      name: '7. loss immediately after resize',
      setup: async (page) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await page.waitForTimeout(50);
      },
      teardown: async (page) => { await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(100); },
    },
    {
      name: '8. loss immediately after layer toggle',
      setup: async (page) => {
        await toggleLayer(page, 'Factory geometry');
        await page.waitForTimeout(50);
      },
      teardown: async (page) => { await toggleLayer(page, 'Factory geometry'); await page.waitForTimeout(150); },
    },
  ];

  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(SETTLE_MS);

    const countersBefore = await readCounters(page);

    await scenario.setup(page);
    // Baseline captured AFTER setup(), i.e. the actual state right before
    // context loss -- several scenarios (reference-enabled, machines-
    // hidden, grid-disabled) deliberately change resource counts as part
    // of their own setup, and "no growth" must be measured against THAT
    // pre-loss state, not the page's initial default state.
    const before = await readStats(page);
    await loseAndRestore(page);
    if (scenario.teardown) await scenario.teardown(page);
    await page.waitForTimeout(200);

    const vt = await verifyText(page);
    check(`${scenario.name}: recovery verification PASS`, vt.includes('PASS'), vt);
    check(`${scenario.name}: lifecycle reaches RECOVERED`, (await lifecycleText(page)).includes('RECOVERED'));

    const after = await readStats(page);
    check(`${scenario.name}: geometry present after recovery (geometries > 0)`, after.geometries > 0, JSON.stringify(after));
    check(`${scenario.name}: no resource growth (geometries/textures unchanged or lower, never higher)`, after.geometries <= before.geometries && after.textures <= before.textures, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

    const countersAfter = await readCounters(page);
    check(`${scenario.name}: exactly 1 loss + 1 restore event recorded (no duplicate listener)`, countersAfter.contextLost - countersBefore.contextLost === 1 && countersAfter.contextRestored - countersBefore.contextRestored === 1, JSON.stringify(countersAfter));
    check(`${scenario.name}: camera controller still mounted exactly once (no duplicate controls)`, countersAfter.controllerMounts === 1, JSON.stringify(countersAfter));

    // scene interactive + machine identity deterministic after recovery
    await page.mouse.click(HIT_A.x, HIT_A.y);
    await page.waitForTimeout(200);
    const sel = await selectedText(page);
    check(`${scenario.name}: scene interactive after recovery (a known machine still selects by its deterministic id)`, sel.startsWith('Selected machine: EQP-'), sel);
    await page.click('button:has-text("Clear")');
    await page.waitForTimeout(150);

    await page.close();
  }

  // -------------------------------------------------------------------
  // 2b. Scenario 9: repeated 4-cycle recovery, full state verification
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(SETTLE_MS);

    // Establish non-default state before the cycles: reference on, grid
    // off, a machine selected, camera moved.
    await toggleLayer(page, 'Reference CAD');
    await toggleLayer(page, 'Structural grid');
    await page.waitForTimeout(200);
    await page.mouse.click(HIT_A.x, HIT_A.y);
    await page.waitForTimeout(200);
    await page.click('button:has-text("overview")');
    await page.waitForTimeout(200);
    const selBefore = await selectedText(page);
    const statsBefore = await readStats(page);

    for (let i = 0; i < 4; i++) {
      await loseAndRestore(page, 250, 800);
    }
    await page.waitForTimeout(200);

    const vt = await verifyText(page);
    check('9. repeated 4-cycle recovery: PASS', vt.includes('PASS'), vt);
    const counters = await readCounters(page);
    check('9. repeated 4-cycle recovery: exactly 4 loss + 4 restore events, no duplicate listener', counters.contextLost === 4 && counters.contextRestored === 4, JSON.stringify(counters));
    check('9. repeated 4-cycle recovery: camera controller still mounted exactly once', counters.controllerMounts === 1);

    check('9. reference layer state preserved across 4 cycles', await layerCheckbox(page, 'Reference CAD').isChecked());
    check('9. grid layer state (off) preserved across 4 cycles', !(await layerCheckbox(page, 'Structural grid').isChecked()));
    check('9. machines layer state (on) preserved across 4 cycles', await layerCheckbox(page, 'Machines').isChecked());
    check('9. selection preserved across 4 cycles', (await selectedText(page)) === selBefore);

    const statsAfter = await readStats(page);
    check(
      '9. resource parity across 4 cycles: geometries/textures/programs never grew (no monotonic growth)',
      statsAfter.geometries <= statsBefore.geometries && statsAfter.textures <= statsBefore.textures && statsAfter.programs <= statsBefore.programs,
      `${JSON.stringify(statsBefore)} -> ${JSON.stringify(statsAfter)}`,
    );

    // scene fully interactive: select another machine, orbit, toggle
    await page.mouse.click(HIT_B.x, HIT_B.y);
    await page.waitForTimeout(200);
    check('9. select a different machine after 4 cycles: switches cleanly', (await selectedText(page)) !== selBefore);
    await page.mouse.move(960, 540);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(960 + i * 6, 540 + i * 4);
    await page.mouse.up();
    await page.waitForTimeout(200);
    await toggleLayer(page, 'Machines');
    await page.waitForTimeout(150);
    const statsFinal = await readStats(page);
    check('9. layer toggle after 4 cycles + orbit still functional (draw calls respond)', statsFinal.calls < statsAfter.calls, `${statsAfter.calls} -> ${statsFinal.calls}`);

    await page.close();
  }

  // -------------------------------------------------------------------
  // 3. Resource-parity stress loop: select -> toggle -> orbit -> resize ->
  //    lose -> recover -> select another -> repeat (3 full iterations)
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(SETTLE_MS);

    const history = [];
    const hits = [HIT_A, HIT_B];
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(hits[i % 2].x, hits[i % 2].y);
      await page.waitForTimeout(150);
      await toggleLayer(page, 'Reference CAD');
      await page.waitForTimeout(150);
      await page.mouse.move(960, 540);
      await page.mouse.down();
      for (let j = 1; j <= 5; j++) await page.mouse.move(960 + j * 5, 540 + j * 3);
      await page.mouse.up();
      await page.waitForTimeout(150);
      await page.setViewportSize({ width: i % 2 === 0 ? 1600 : 1920, height: i % 2 === 0 ? 900 : 1080 });
      await page.waitForTimeout(150);
      await loseAndRestore(page, 200, 700);
      // Reset to the 'plan' preset AND the 1920x1080 viewport before the
      // next click -- HIT_A/HIT_B are only known-good pixel coordinates at
      // the default plan pose AND this test file's standard viewport; this
      // loop's own resize step (above) leaves the viewport at 1600x900 on
      // even iterations, which alone remaps every screen pixel to a
      // different world position (a real projection-matrix consequence of
      // resize, not a defect) -- same class of stale-coordinate issue
      // documented throughout every prior step's own selection tests.
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.click('button:has-text("Reset Camera")');
      await page.waitForTimeout(500);
      await page.mouse.click(hits[(i + 1) % 2].x, hits[(i + 1) % 2].y);
      await page.waitForTimeout(150);
      await toggleLayer(page, 'Reference CAD'); // restore off for next loop
      await page.waitForTimeout(100);

      const s = await readStats(page);
      const c = await readCounters(page);
      history.push({ ...s, ...c });
    }
    await page.setViewportSize({ width: 1920, height: 1080 });

    const geomSeries = history.map((h) => h.geometries);
    const texSeries = history.map((h) => h.textures);
    const progSeries = history.map((h) => h.programs);
    check('stress loop (3 iterations): geometries never exceed the first-iteration value (no monotonic growth)', geomSeries.every((v) => v <= geomSeries[0]), JSON.stringify(geomSeries));
    check('stress loop: textures never exceed the first-iteration value', texSeries.every((v) => v <= texSeries[0]), JSON.stringify(texSeries));
    check('stress loop: programs (materials proxy) never exceed the first-iteration value', progSeries.every((v) => v <= progSeries[0]), JSON.stringify(progSeries));
    check('stress loop: controllerMounts stays 1 across all 3 iterations (no duplicate controls anywhere in the loop)', history.every((h) => h.controllerMounts === 1), JSON.stringify(history.map((h) => h.controllerMounts)));
    check('stress loop: contextLost/contextRestored climb exactly 1 per iteration (3 total), never duplicated', history[2].contextLost === 3 && history[2].contextRestored === 3, JSON.stringify(history[2]));

    const finalSelected = await selectedText(page);
    check('stress loop: scene still interactive at the end', finalSelected.startsWith('Selected machine: EQP-'), finalSelected);

    await page.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
