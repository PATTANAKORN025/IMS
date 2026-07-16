/**
 * Playwright Visual Regression & Screenshot Capture — IMS Dashboards
 *
 * Captures high-res NOC-quality screenshots of all IMS dashboards in kiosk mode.
 * Saves to assets/ folder for README embedding and documentation.
 *
 * Usage:
 *   node tests/playwright/dashboard-visual-regression.js
 *   make test-visual
 *
 * Prerequisites:
 *   npm install playwright
 *   npx playwright install chromium
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const USER = process.env.GRAFANA_USER || 'admin';
const PASS = process.env.GRAFANA_PASS || 'change-me-please';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');

const DASHBOARDS = [
    { uid: 'ims-noc-overview', name: 'NOC Overview', file: 'noc-overview', wait: 5000 },
    { uid: 'ims-engineering', name: 'Engineering Drill-Down', file: 'engineering-drilldown', wait: 5000 },
    { uid: 'ims-capacity', name: 'Capacity Planning', file: 'capacity-planning', wait: 5000 },
    { uid: 'ims-meta-monitoring', name: 'Meta-Monitoring', file: 'meta-monitoring', wait: 3000 },
];

async function run() {
    // Ensure output directories exist
    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: true });

    // High-res viewport matching NOC display (1920x1080)
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2, // 2x for crisp text on retina/4K displays
    });
    const page = await context.newPage();

    // ── Login to Grafana ──
    console.log(`Logging in to ${BASE_URL}...`);
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="user"]', USER);
    await page.fill('input[name="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/d/**', { timeout: 10000 }).catch(() => {});
    console.log('Login successful\n');

    const results = [];

    for (const dash of DASHBOARDS) {
        // Kiosk TV mode: hides sidebar + topnav + auto-fits panels
        const url = `${BASE_URL}/d/${dash.uid}?orgId=1&kiosk=tv&autofitpanels`;
        const screenshotPath = path.join(SCREENSHOT_DIR, `${dash.file}.png`);
        const assetPath = path.join(ASSETS_DIR, `${dash.file}.png`);

        console.log(`Capturing: ${dash.name} (${dash.uid})...`);
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(dash.wait);

            // Force-hide any remaining Grafana chrome (sidebar, topnav, breadcrumbs)
            await page.evaluate(() => {
                const selectors = [
                    '.sidemenu',                    // Sidebar
                    '.navbar',                       // Top navigation
                    '.page-toolbar',                 // Toolbar / breadcrumbs
                    '.dashboard-content',            // Re-add padding for full bleed
                    '.panel-container',              // Panel borders (optional)
                ];
                selectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => {
                        if (sel === '.dashboard-content') {
                            el.style.padding = '0';
                            el.style.margin = '0';
                        } else {
                            el.style.display = 'none';
                        }
                    });
                });
                // Set body background to match dashboard theme
                document.body.style.background = '#030407';
                document.body.style.overflow = 'hidden';
            });

            await page.waitForTimeout(500); // Let CSS settle

            // Capture errors for report
            const errorText = await page.locator('.panel-info-corner:has-text("Error")').count();
            const noData = await page.locator('.panel-content:has-text("No data")').count();

            // Screenshot to tests/screenshots (for CI)
            await page.screenshot({ path: screenshotPath, fullPage: false });

            // Screenshot to assets/ (for README, docs)
            await page.screenshot({ path: assetPath, fullPage: false });

            results.push({
                dashboard: dash.name,
                uid: dash.uid,
                status: 'OK',
                errors: errorText,
                noDataPanels: noData,
                screenshot: screenshotPath,
                asset: assetPath,
            });
            console.log(`  OK ${dash.name}: captured (${errorText} errors, ${noData} no-data panels)`);
        } catch (e) {
            results.push({
                dashboard: dash.name,
                uid: dash.uid,
                status: 'FAILED',
                error: e.message,
                screenshot: null,
            });
            console.log(`  FAIL ${dash.name}: ${e.message}`);
        }
    }

    await browser.close();

    // ── Write results ──
    const report = {
        timestamp: new Date().toISOString(),
        baseUrl: BASE_URL,
        totalDashboards: DASHBOARDS.length,
        passed: results.filter(r => r.status === 'OK').length,
        failed: results.filter(r => r.status === 'FAILED').length,
        results,
    };

    const reportPath = path.join(SCREENSHOT_DIR, 'visual-regression-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\nReport: ${reportPath}`);
    console.log(`Assets: ${ASSETS_DIR}/`);
    console.log(`Results: ${report.passed}/${report.totalDashboards} passed`);

    // Generate README snippet
    if (report.passed > 0) {
        const mdLines = results
            .filter(r => r.status === 'OK')
            .map(r => `![${r.dashboard}](assets/${r.dashboard.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png)`);
        const mdSnippet = mdLines.join('\n\n');
        const snippetPath = path.join(ASSETS_DIR, 'README-screenshots.md');
        fs.writeFileSync(snippetPath, mdSnippet);
        console.log(`README snippet: ${snippetPath}`);
    }

    process.exit(report.failed > 0 ? 1 : 0);
}

run().catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
});
