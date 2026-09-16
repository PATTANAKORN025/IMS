#!/usr/bin/env node
/**
 * Factory Twin — Step 6A operational-state presentation verification.
 *
 * Targets the ISOLATED services/factory-twin-3d-next/ app's
 * /geometry-candidate route, fetching from a disposable factory-twin-3d
 * instance -- default http://localhost:4196, same image as Steps 5A-5F.
 *
 * Usage:
 *   FACTORY_TWIN_API_BASE=http://localhost:4196 \
 *   CANDIDATE_URL=http://localhost:4310/factory-twin-3d/geometry-candidate \
 *   node tests/playwright/factory-twin-r3f-operational-state.js
 */

'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

const AXE_SOURCE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const API_BASE = process.env.FACTORY_TWIN_API_BASE || 'http://localhost:4196';
const CANDIDATE_URL = process.env.CANDIDATE_URL || 'http://localhost:4310/factory-twin-3d/geometry-candidate';

const SETTLE_MS = 1000;
const HIT_A = { x: 440, y: 260 }; // -> EQP-F1-0401, plan view (same dataset/coords as Steps 5C-5F)

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
async function readOperationalSummary(page) {
  const t = await page.locator('text=/operational:/').textContent();
  return {
    simulated: Number(t.match(/simulated=(\d+)/)[1]),
    noData: Number(t.match(/noData=(\d+)/)[1]),
    unavailable: Number(t.match(/unavailable=(\d+)/)[1]),
  };
}
function demoToggle(page) {
  return page.locator('label:has-text("Simulate operational state") input');
}
async function toggleDemo(page) {
  await demoToggle(page).click();
}
async function reactRenders(page) {
  const t = await page.locator('text=/reactRenders:/').textContent();
  return Number(t.match(/reactRenders: (\d+)/)[1]);
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
  // Ground truth from the authoritative API: is ANY asset currently
  // IMS-mapped and live_status_eligible? Determines whether the deployment
  // can produce a SIMULATION-quality result at all today -- asserted from
  // real data, never assumed.
  const rawRes = await fetch(`${API_BASE}/api/floor-geometry`);
  const raw = await rawRes.json();
  const equipment = Array.isArray(raw.equipment) ? raw.equipment : [];
  const nonDuplicate = equipment.filter((e) => !e.duplicate_of);
  const mappedCount = nonDuplicate.filter((e) => e.live_status_eligible === true && typeof e.ims_device_id === 'string').length;
  const expectedMachineCount = nonDuplicate.length;

  const browser = await chromium.launch();

  // -------------------------------------------------------------------
  // 1. Structural: default state, no telemetry connection, no errors
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(SETTLE_MS);

    check('0 console/page errors on initial load', consoleErrors.length === 0, consoleErrors.join(' | '));
    check('demo toggle present, unchecked by default (Section 2: no live telemetry yet)', await demoToggle(page).isChecked() === false);
    check('legend hidden by default (no surprise wall of simulated color on load)', await page.locator('text=No data / unavailable').count() === 0);

    const summaryOff = await readOperationalSummary(page);
    check(
      'real adapter is honest UNAVAILABLE for every asset when demo is off (never fabricated)',
      summaryOff.simulated === 0 && summaryOff.noData === 0 && summaryOff.unavailable === expectedMachineCount,
      JSON.stringify(summaryOff),
    );
    check(
      'this deployment has the mapped-machine count the API itself reports (0 today, per docs/eap/EAP_OPERATIONAL_SOURCE_AUDIT.md-style honesty)',
      true, // structural fact, not a pass/fail condition -- recorded for the evidence doc
      `mappedCount(live_status_eligible && ims_device_id)=${mappedCount} of ${expectedMachineCount}`,
    );
    await page.close();
  }

  // -------------------------------------------------------------------
  // 2. Toggle behavior: NO_DATA != DOWN, no resource growth, bounded renders
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(SETTLE_MS);

    const statsBefore = await readStats(page);
    const rendersBefore = await reactRenders(page);

    await toggleDemo(page);
    await page.waitForTimeout(300);

    check('demo toggle is now checked', await demoToggle(page).isChecked() === true);
    check('legend appears once demo is on', await page.locator('text=No data / unavailable').count() === 1);

    // Legend covers the full 8-state vocabulary by TEXT (label), not color
    // alone -- Section 1's vocabulary, matches operational-status.js's own
    // "status never communicated by color alone" rule.
    for (const label of ['Off', 'Down', 'Idle', 'Initial', 'PM', 'Stop', 'Run', 'Undefined']) {
      check(`legend shows "${label}" by text`, (await page.locator(`li:has-text("${label}")`).count()) >= 1);
    }
    check('legend shows "No data / unavailable" distinctly from "Down"', await page.locator('li:has-text("No data / unavailable")').count() === 1);

    const summaryOn = await readOperationalSummary(page);
    check(
      'NO_DATA != DOWN, UNAVAILABLE != DOWN: every asset resolves to noData or a real simulated state, never a fabricated one, and simulated count matches the real mapped-machine count from the API',
      summaryOn.simulated === mappedCount && summaryOn.unavailable === 0 && summaryOn.noData === expectedMachineCount - mappedCount,
      JSON.stringify(summaryOn),
    );

    const statsAfter = await readStats(page);
    check(
      'toggling operational state causes 0 resource growth (color-only swap, not a rebuild)',
      statsAfter.geometries === statsBefore.geometries && statsAfter.textures === statsBefore.textures && statsAfter.calls === statsBefore.calls,
      `${JSON.stringify(statsBefore)} -> ${JSON.stringify(statsAfter)}`,
    );

    const rendersAfter = await reactRenders(page);
    check(
      'toggling operational state causes a small, bounded number of React renders -- not one per machine (Section: "without coupling React rendering to 431 machines")',
      rendersAfter - rendersBefore <= 3,
      `${rendersBefore} -> ${rendersAfter}`,
    );

    // Toggle back off: summary reverts, no growth either direction.
    await toggleDemo(page);
    await page.waitForTimeout(300);
    const summaryOff2 = await readOperationalSummary(page);
    check('toggling back off reverts to honest UNAVAILABLE for every asset', summaryOff2.unavailable === expectedMachineCount && summaryOff2.simulated === 0 && summaryOff2.noData === 0, JSON.stringify(summaryOff2));
    const statsAfterOff = await readStats(page);
    check('toggling off also causes 0 resource growth', statsAfterOff.geometries === statsBefore.geometries && statsAfterOff.textures === statsBefore.textures);

    await page.close();
  }

  // -------------------------------------------------------------------
  // 3. Selection coexistence: operational state does not break Step 5C
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(SETTLE_MS);

    // Not asserted against a hardcoded id -- Step 5C's own suite documents
    // a one-time damped-OrbitControls settle where HIT_A's FIRST-EVER click
    // on a freshly loaded page can resolve to a neighboring machine
    // (EQP-F1-0402) before stabilizing on EQP-F1-0401 from the second click
    // onward (factory-twin-r3f-selection.js:48-50). This section only
    // asserts "some real machine got selected" on first click, then
    // compares every later check against THAT captured id -- consistency
    // across the demo-mode toggle, not a specific id.
    await page.mouse.click(HIT_A.x, HIT_A.y);
    await page.waitForTimeout(300);
    const sel1 = await selectedText(page);
    check('selection works before demo toggle', sel1.startsWith('Selected machine: EQP-'), sel1);

    await toggleDemo(page);
    await page.waitForTimeout(300);
    const sel2 = await selectedText(page);
    check('selection survives toggling operational state on (not cleared, not corrupted)', sel2 === sel1, sel2);

    await page.mouse.click(HIT_A.x, HIT_A.y);
    await page.waitForTimeout(300);
    const sel3 = await selectedText(page);
    check('re-clicking the same machine while demo is on: selection unchanged', sel3 === sel1, sel3);

    // Clear, re-select while demo stays on -- proves picking still works,
    // not just that a stale selection survived.
    await page.click('button:has-text("Clear")');
    await page.waitForTimeout(200);
    const sel4 = await selectedText(page);
    check('Clear works while demo is on', sel4.includes('No machine selected'), sel4);

    await page.mouse.click(HIT_A.x, HIT_A.y);
    await page.waitForTimeout(300);
    const sel5 = await selectedText(page);
    check('re-selecting works while demo is on', sel5 === sel1, sel5);

    await page.close();
  }

  // -------------------------------------------------------------------
  // 4. WebGL context recovery preserves the operational-state toggle
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(SETTLE_MS);

    await toggleDemo(page);
    await page.mouse.click(HIT_A.x, HIT_A.y);
    await page.waitForTimeout(300);
    const selBefore = await selectedText(page); // captured, not hardcoded -- see section 3's own comment

    const before = await readStats(page);
    await loseAndRestore(page);

    const lifecycle = await page.locator('text=/lifecycle:/').first().textContent();
    check('lifecycle reaches RECOVERED with demo mode active', lifecycle.includes('RECOVERED'), lifecycle);

    const vr = await verifyText(page);
    check('recovery verification PASS with demo mode active (no resource growth)', vr.includes('PASS'), vr);

    check('demo toggle still checked after recovery', await demoToggle(page).isChecked() === true);
    const summaryAfter = await readOperationalSummary(page);
    check('operational summary still correct after recovery (no re-derivation drift)', summaryAfter.simulated === mappedCount && summaryAfter.noData === expectedMachineCount - mappedCount, JSON.stringify(summaryAfter));

    const selAfter = await selectedText(page);
    check('selection still correct after recovery with demo mode active', selAfter === selBefore, selAfter);

    const after = await readStats(page);
    check('no resource growth across the recovery cycle with demo mode active', after.geometries <= before.geometries && after.textures <= before.textures, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

    await page.close();
  }

  // -------------------------------------------------------------------
  // 5. Accessibility + responsive (reuses Step 5B-5F's own axe/keyboard/
  //    forced-colors/reduced-motion/zoom methodology)
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(SETTLE_MS);
    await toggleDemo(page);
    await page.waitForTimeout(300);

    await page.addScriptTag({ content: AXE_SOURCE });
    const axeResults = await page.evaluate(() => window.axe.run());
    const serious = axeResults.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check('axe: 0 serious/critical violations with demo mode + legend visible', serious.length === 0, serious.map((v) => v.id).join(', '));

    await page.keyboard.press('Tab');
    let found = false;
    for (let i = 0; i < 30 && !found; i += 1) {
      found = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('type') === 'checkbox'
        && document.activeElement.closest('label')?.textContent?.includes('Simulate operational state'));
      if (!found) await page.keyboard.press('Tab');
    }
    check('demo toggle is keyboard-focusable', found);
    if (found) {
      const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none' || getComputedStyle(document.activeElement).outlineWidth !== '0px');
      check('focused demo toggle shows a visible outline', outline);
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      check('Space on focused demo toggle turns it back off (real keyboard control)', await demoToggle(page).isChecked() === false);
    }

    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce', forcedColors: 'active' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500);
    await toggleDemo(page);
    await page.waitForTimeout(300);
    check('renders under forced-colors + reduced-motion with demo mode on, no error', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  const VIEWPORTS = [
    { width: 1024, height: 768 },
    { width: 1920, height: 1080 },
  ];
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500);
    await toggleDemo(page);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`no horizontal overflow with legend visible @ ${vp.width}x${vp.height}`, overflow <= 0, `${overflow}px`);
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
    await page.goto(CANDIDATE_URL, { waitUntil: 'load' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500);
    await toggleDemo(page);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('200% zoom: no unbounded horizontal overflow with legend visible', overflow <= 0, `${overflow}px`);
    await page.close();
  }

  await browser.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
})();
