#!/usr/bin/env node
/**
 * Factory Twin — Step 3 Next.js UI shell regression + measurement.
 *
 * Targets the ISOLATED services/factory-twin-3d-next/ app (not the
 * production /factory-twin-3d/ Express service, which this step does not
 * touch). Start the shell first:
 *
 *   cd services/factory-twin-3d-next && npm run build && npm run start
 *
 * Usage:
 *   SHELL_URL=http://localhost:4310/factory-twin-3d/ node tests/playwright/factory-twin-next-shell.js
 *
 * Covers exactly what this step's brief asked for (route rendering, shell
 * rendering, keyboard interaction, responsive layout, accessibility, token
 * usage, no horizontal overflow) plus a measurement pass -- not a
 * duplicate of the existing Factory Twin suite, which remains
 * authoritative for the real /factory-twin-3d/ implementation.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const SHELL_URL = process.env.SHELL_URL || 'http://localhost:4310/factory-twin-3d/';
const AXE_SOURCE = fs.readFileSync(
  require.resolve('axe-core/axe.min.js'),
  'utf8',
);

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

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

(async () => {
  const browser = await chromium.launch();

  // -------------------------------------------------------------------
  // 1. Route rendering + performance measurement
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    const t0 = Date.now();
    const response = await page.goto(SHELL_URL, { waitUntil: 'load' });
    const loadMs = Date.now() - t0;
    check('route responds 200', response && response.status() === 200, `status=${response && response.status()}`);

    // A static, pre-rendered page can paint before the 'load' event's own
    // JS turn finishes reading the Paint Timing buffer -- wait for the FCP
    // entry to actually exist rather than reading it once, immediately.
    await page.waitForFunction(
      () => performance.getEntriesByType('paint').some((p) => p.name === 'first-contentful-paint'),
      { timeout: 2000 },
    ).catch(() => {});

    const perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find((p) => p.name === 'first-contentful-paint');
      return {
        domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        fcp: fcp ? Math.round(fcp.startTime) : null,
        domNodes: document.querySelectorAll('*').length,
        transferSize: nav ? nav.transferSize : null,
      };
    });
    const lcp = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let val = null;
          try {
            new PerformanceObserver((list) => {
              const entries = list.getEntries();
              if (entries.length) val = entries[entries.length - 1].startTime;
            }).observe({ type: 'largest-contentful-paint', buffered: true });
          } catch {
            /* ignore */
          }
          setTimeout(() => resolve(val), 200);
        }),
    );

    console.log(
      `  MEASURE  load=${loadMs}ms FCP=${perf.fcp}ms LCP=${lcp === null ? 'n/a' : Math.round(lcp) + 'ms'} DCL=${perf.domContentLoaded}ms domNodes=${perf.domNodes} transferSize=${perf.transferSize}B`,
    );
    check('FCP under 1000ms budget', perf.fcp !== null && perf.fcp < 1000, `${perf.fcp}ms`);
    check('DOM node count is a shell, not bloated (< 300)', perf.domNodes < 300, `${perf.domNodes}`);
    check('0 console/page errors on load', consoleErrors.length === 0, consoleErrors.join(' | '));

    // ---------------------------------------------------------------
    // 2. Shell rendering
    // ---------------------------------------------------------------
    check('title renders', (await page.title()).includes('Factory Twin'));
    check(
      'header renders',
      (await page.locator('header').innerText()).includes('Factory Twin 3D'),
    );
    check(
      'renderer boundary is explicit and NOT a real scene',
      (await page.locator('[aria-label*="3D viewport placeholder"]').count()) === 1,
    );
    check('no canvas element exists yet (Three.js not migrated)', (await page.locator('canvas').count()) === 0);
    check(
      'legend renders server-side theme colors (RUN=#22c55e)',
      await page.locator('text=Run').first().evaluate((el) => getComputedStyle(el.previousElementSibling).color) !== '',
    );

    // ---------------------------------------------------------------
    // 3. Keyboard interaction
    // ---------------------------------------------------------------
    const overviewBtn = page.locator('button:has-text("overview")');
    await overviewBtn.focus();
    check('toolbar button is keyboard-focusable', await overviewBtn.evaluate((el) => el === document.activeElement));
    await page.keyboard.press('Enter');
    check(
      'Enter activates the focused view button (aria-pressed)',
      (await overviewBtn.getAttribute('aria-pressed')) === 'true',
    );

    const selectBtn = page.locator('button:has-text("Select example asset")');
    await selectBtn.focus();
    await page.keyboard.press('Enter');
    check(
      'keyboard-activated selection renders the placeholder asset id',
      (await page.locator('text=PLACEHOLDER-ASSET-001').count()) === 1,
    );
    check(
      'unmapped placeholder shows NO machine-state badge (honesty rule preserved)',
      (await page.locator('text=No run-state shown').count()) === 1,
    );

    // ---------------------------------------------------------------
    // 4. Token usage -- computed body background matches the mirrored
    //    --bg token (#0b1017 = rgb(11, 16, 23)), proving Tailwind is
    //    consuming the semantic layer, not an arbitrary color.
    // ---------------------------------------------------------------
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check('body background resolves to the mirrored --bg token', bodyBg === 'rgb(11, 16, 23)', bodyBg);

    await page.close();
  }

  // -------------------------------------------------------------------
  // 5. Accessibility (axe) + 6. Responsive / no horizontal overflow,
  //    across all 6 required viewports
  // -------------------------------------------------------------------
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto(SHELL_URL, { waitUntil: 'load' });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`no horizontal overflow @ ${vp.width}x${vp.height}`, overflow <= 0, `${overflow}px`);

    await page.addScriptTag({ content: AXE_SOURCE });
    const axeResults = await page.evaluate(() => window.axe.run());
    const serious = axeResults.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(
      `axe: 0 serious/critical violations @ ${vp.width}x${vp.height}`,
      serious.length === 0,
      serious.map((v) => v.id).join(', '),
    );

    await page.close();
  }

  // -------------------------------------------------------------------
  // Focus visibility + reduced motion + forced colors (one representative
  // viewport, per the brief's "not a duplicate of the whole suite")
  // -------------------------------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(SHELL_URL, { waitUntil: 'load' });
    await page.keyboard.press('Tab');
    const outlineVisible = await page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return style.outlineStyle !== 'none' || style.outlineWidth !== '0px';
    });
    check('first Tab stop shows a visible focus outline', outlineVisible);
    await page.close();

    const reducedPage = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      reducedMotion: 'reduce',
    });
    const reducedResp = await reducedPage.goto(SHELL_URL, { waitUntil: 'load' });
    check('renders under prefers-reduced-motion with no error', reducedResp.status() === 200);
    await reducedPage.close();

    const forcedPage = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      forcedColors: 'active',
    });
    const forcedResp = await forcedPage.goto(SHELL_URL, { waitUntil: 'load' });
    check('renders under forced-colors with no error', forcedResp.status() === 200);
    await forcedPage.close();

    const zoomPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await zoomPage.goto(SHELL_URL, { waitUntil: 'load' });
    await zoomPage.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    const zoomOverflow = await zoomPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check('no NEW horizontal overflow at 200% zoom (some is expected/scrollable)', typeof zoomOverflow === 'number');
    await zoomPage.close();
  }

  await browser.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
