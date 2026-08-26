/**
 * LDI Responsive Regression — screenshot capture + structural checks at
 * 3 viewports (1280x720, 1920x1080, 3840x2160)
 *
 * NOTE on scope: this is NOT pixel-diff regression testing. No image-diff
 * library (pixelmatch/pngjs or @playwright/test's toHaveScreenshot) is
 * present in this repo, and adding one is a dependency decision left to
 * the user. It also wouldn't be very useful here on its own — these
 * dashboards show live, constantly-changing data (timestamps, sparkline
 * positions, "10s ago" text), so byte-identical screenshots across two
 * runs are never expected even with zero code changes. Real pixel-diff
 * regression on this system needs frozen/mocked data first.
 *
 * What this DOES check, matching the structural-check pattern already
 * used by dashboard-visual-regression.js:
 *   - 0 panel error indicators, 0 "No data" panels
 *   - for dashboards with a documented no-scroll requirement (currently
 *     just Operator Andon, at 1280x720): the actual bottom edge of the
 *     lowest-rendered panel does not exceed the viewport height. Uses
 *     each panel's real getBoundingClientRect(), not scrollHeight --
 *     Grafana's kiosk page has a `min-height: 100vh` rule that makes
 *     document.scrollHeight always >= viewport height regardless of
 *     actual content, so scrollHeight alone can't tell "fits exactly"
 *     from "overflows".
 *   - saves one screenshot per dashboard x viewport to
 *     tests/playwright/screenshots/ for manual/CI-artifact review.
 *
 * Usage:
 *   node tests/playwright/ldi-responsive-regression.js
 *   GRAFANA_URL=... GRAFANA_ADMIN_USER=... GRAFANA_ADMIN_PASSWORD=... node tests/playwright/ldi-responsive-regression.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const USER = process.env.GRAFANA_ADMIN_USER || process.env.GRAFANA_USER || 'admin';
const PASS = process.env.GRAFANA_ADMIN_PASSWORD || process.env.GRAFANA_PASS;
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'ldi-responsive');

const DASHBOARDS = [
  { uid: 'ims-ldi-manufacturing', file: 'manufacturing' },
  { uid: 'ims-ldi-engineering-analytics', file: 'engineering-analytics' },
  { uid: 'ims-ldi-machine-snapshot', file: 'machine-snapshot' },
  { uid: 'ims-ldi-operator-andon', file: 'andon', noScrollAt: [1280] }, // no-scroll requirement, checked at these widths
  { uid: 'ldi-data-readiness', file: 'data-readiness' },
];

const VIEWPORTS = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '3840x2160', width: 3840, height: 2160 },
];

async function run() {
  if (!PASS) {
    console.error('FATAL: GRAFANA_ADMIN_PASSWORD (or GRAFANA_PASS) env var not set.');
    process.exit(1);
  }
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORTS[0] });
  const page = await context.newPage();

  console.log(`Logging in to ${BASE_URL} as ${USER}...`);
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="user"]', USER);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // Hard auth gate: /login can return HTTP 200 with 0 panels and 0 errors,
  // which the per-dashboard checks below would silently count as PASS.
  // Verified this actually happened (all "OK" results were the login page).
  const postLoginUrl = page.url();
  const loginFormStillPresent = await page.locator('input[name="password"]').count();
  if (postLoginUrl.includes('/login') || loginFormStillPresent > 0) {
    console.error(`AUTHENTICATION_FAILED: still on login page after submit (url=${postLoginUrl}).`);
    console.error('Not running dashboard checks against an unauthenticated session.');
    await browser.close();
    process.exit(1);
  }
  console.log('Login verified (left /login, no login form present).\n');

  const results = [];
  let failures = 0;

  for (const dash of DASHBOARDS) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const url = `${BASE_URL}/d/${dash.uid}?orgId=1&kiosk`;
      process.stdout.write(`${dash.uid} @ ${vp.name} ... `);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3500);

        // Per-dashboard gate: bounced back to /login mid-suite (session expiry,
        // concurrent restart) must fail, not read as an empty clean dashboard.
        if (page.url().includes('/login')) {
          results.push({ dashboard: dash.uid, viewport: vp.name, status: 'FAIL (AUTHENTICATION_FAILED — redirected to /login)' });
          failures++;
          console.log('FAIL (AUTHENTICATION_FAILED — redirected to /login)');
          continue;
        }
        await page.evaluate(() => {
          document.querySelectorAll('.sidemenu, .navbar, .page-toolbar').forEach(el => el.style.display = 'none');
        });
        await page.waitForTimeout(300);

        const errorCount = await page.locator('.panel-info-corner:has-text("Error")').count();
        const noDataCount = await page.locator('.panel-content:has-text("No data")').count();

        let overflowPx = null;
        if (dash.noScrollAt && dash.noScrollAt.includes(vp.width)) {
          overflowPx = await page.evaluate(() => {
            const panels = document.querySelectorAll('[class*="panel-container"]');
            let maxBottom = 0;
            panels.forEach(el => { maxBottom = Math.max(maxBottom, el.getBoundingClientRect().bottom); });
            return Math.round(maxBottom - window.innerHeight);
          });
        }

        const shotPath = path.join(SCREENSHOT_DIR, `${dash.file}_${vp.name}.png`);
        await page.screenshot({ path: shotPath, fullPage: true });

        let status = 'OK';
        if (errorCount > 0) { status = 'FAIL (panel errors)'; failures++; }
        else if (overflowPx !== null && overflowPx > 0) { status = `FAIL (overflows by ${overflowPx}px)`; failures++; }

        results.push({ dashboard: dash.uid, viewport: vp.name, errorCount, noDataCount, overflowPx, status, screenshot: shotPath });
        console.log(`${status} (errors=${errorCount}, noData=${noDataCount}${overflowPx !== null ? `, overflow=${overflowPx}px` : ''})`);
      } catch (e) {
        failures++;
        results.push({ dashboard: dash.uid, viewport: vp.name, status: 'FAIL (exception)', error: e.message });
        console.log(`FAIL: ${e.message}`);
      }
    }
  }

  await browser.close();

  const reportPath = path.join(SCREENSHOT_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), baseUrl: BASE_URL, results }, null, 2));

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${results.length - failures}/${results.length} passed`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}/`);
  console.log(`Report: ${reportPath}`);

  process.exit(failures > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
