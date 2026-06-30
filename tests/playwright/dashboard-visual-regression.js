/**
 * Playwright Visual Regression Tests — Grafana Dashboard Screenshots
 *
 * Captures screenshots of all IMS dashboards for visual regression testing.
 * Run after deployment to verify dashboards render correctly.
 *
 * Usage:
 *   npx playwright test tests/playwright/dashboard-visual-regression.js
 *   or: node tests/playwright/dashboard-visual-regression.js
 *
 * Prerequisites:
 *   npm install playwright @playwright/test
 *   npx playwright install chromium
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const USER = process.env.GRAFANA_USER || 'admin';
const PASS = process.env.GRAFANA_PASS || 'change-me-please';
const OUTPUT_DIR = path.join(__dirname, 'screenshots');

const DASHBOARDS = [
    { uid: 'ims-noc-overview', name: 'NOC Overview', wait: 5000 },
    { uid: 'ims-engineering', name: 'Engineering Drill-Down', wait: 5000 },
    { uid: 'ims-capacity', name: 'Capacity Planning', wait: 5000 },
    { uid: 'ims-oee-yield', name: 'OEE & Yield Analysis', wait: 5000 },
    { uid: 'ims-servers', name: 'Server Monitoring', wait: 5000 },
];

async function run() {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    // Login to Grafana
    console.log(`Logging in to ${BASE_URL}...`);
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="user"]', USER);
    await page.fill('input[name="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/d/**', { timeout: 10000 }).catch(() => {});
    console.log('Login successful');

    const results = [];

    for (const dash of DASHBOARDS) {
        const url = `${BASE_URL}/d/${dash.uid}?orgId=1`;
        const screenshotPath = path.join(OUTPUT_DIR, `${dash.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`);

        console.log(`Capturing: ${dash.name} (${dash.uid})...`);
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(dash.wait);

            // Check for errors in page
            const errorText = await page.locator('.panel-info-corner:has-text("Error")').count();
            const noData = await page.locator('.panel-content:has-text("No data")').count();

            await page.screenshot({ path: screenshotPath, fullPage: true });

            results.push({
                dashboard: dash.name,
                uid: dash.uid,
                status: 'OK',
                errors: errorText,
                noDataPanels: noData,
                screenshot: screenshotPath
            });
            console.log(`  ✓ ${dash.name}: captured (${errorText} errors, ${noData} no-data panels)`);
        } catch (e) {
            results.push({
                dashboard: dash.name,
                uid: dash.uid,
                status: 'FAILED',
                error: e.message,
                screenshot: null
            });
            console.log(`  ✗ ${dash.name}: ${e.message}`);
        }
    }

    await browser.close();

    // Write results
    const report = {
        timestamp: new Date().toISOString(),
        baseUrl: BASE_URL,
        totalDashboards: DASHBOARDS.length,
        passed: results.filter(r => r.status === 'OK').length,
        failed: results.filter(r => r.status === 'FAILED').length,
        results
    };

    const reportPath = path.join(OUTPUT_DIR, 'visual-regression-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport: ${reportPath}`);
    console.log(`Results: ${report.passed}/${report.totalDashboards} passed`);

    process.exit(report.failed > 0 ? 1 : 0);
}

run().catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
});
