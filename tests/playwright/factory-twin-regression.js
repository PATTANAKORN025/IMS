#!/usr/bin/env node
/**
 * Factory Twin 3D — browser regression.
 *
 * Runs against the twin as it is actually deployed: through the proxy, behind
 * Grafana's auth_request gate. Earlier ad-hoc checks published a temporary
 * host port to reach the container directly, which tested a path no real user
 * takes and left docker-compose.yaml dirty. This authenticates instead.
 *
 * What it asserts, and why each one has previously broken or nearly broken:
 *   - the private asset path is 401 unauthenticated (it once served the whole
 *     private/ directory to any logged-in user)
 *   - scene composition per layer, so a data regression shows up as a count
 *     rather than a vague "looks wrong"
 *   - no NaN/Infinity transform anywhere (a missing envelope height produced
 *     exactly this)
 *   - geometry/material sharing actually happened
 *   - conflicting zones stay withheld from the wire
 *   - layer visibility never mutates data
 *
 * Counts are read from the API in the same pass and compared against the
 * scene, so the test does not hardcode a census that will go stale the next
 * time evidence is added -- it checks that what was served is what was drawn.
 *
 * Usage:
 *   GRAFANA_URL=... GRAFANA_ADMIN_USER=... GRAFANA_ADMIN_PASSWORD=... \
 *     node tests/playwright/factory-twin-regression.js
 */

'use strict';

const { chromium } = require('playwright');

const BASE_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const USER = process.env.GRAFANA_ADMIN_USER || process.env.GRAFANA_USER || 'admin';
const PASS = process.env.GRAFANA_ADMIN_PASSWORD || process.env.GRAFANA_PASS;
const TWIN_URL = `${BASE_URL}/factory-twin-3d/`;

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1440', width: 2560, height: 1440 },
];

const LAYERS = ['structural', 'functional', 'operational', 'telemetry'];

let failures = 0;
function check(ok, label, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

// Reads scene + API together so scene composition is compared against what
// the API actually served, rather than against a hardcoded census.
async function snapshot(page) {
  return page.evaluate(async () => {
    const T = window.__twin;
    const perLayer = {};
    let meshes = 0;
    let badTransforms = 0;
    for (const [name, group] of Object.entries(T.layers)) {
      let n = 0;
      group.traverse((o) => {
        if (o.type === 'Mesh') n++;
      });
      perLayer[name] = n;
    }
    T.scene.traverse((o) => {
      if (o.type === 'Mesh') meshes++;
      const p = o.position;
      if (p && !(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) badTransforms++;
      const s = o.scale;
      if (s && !(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z))) badTransforms++;
    });
    const geo = await (await fetch('api/floor-geometry')).json();
    return {
      meshes,
      badTransforms,
      perLayer,
      visibility: Object.fromEntries(Object.entries(T.layers).map(([k, g]) => [k, g.visible])),
      resources: T.resourceStats(),
      machineMeshes: T.machineMeshes.length,
      api: {
        columns: geo.columns.length,
        slots: geo.slots.length,
        zones: geo.functional_zones.length,
        zonesTotal: geo.functional_zones_meta ? geo.functional_zones_meta.total : null,
        conflictServed: geo.functional_zones.some((z) => ['zone-28', 'zone-31'].includes(z.id)),
        envelopeHeight: geo.envelope ? geo.envelope.height : null,
        clearHeight: geo.envelope ? geo.envelope.clear_height_m : null,
      },
    };
  });
}

async function run() {
  if (!PASS) {
    console.error('FATAL: GRAFANA_ADMIN_PASSWORD (or GRAFANA_PASS) env var not set.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });

  // ── Unauthenticated boundary, before any login ──
  console.log('Unauthenticated access:');
  {
    const anon = await browser.newContext();
    const page = await anon.newPage();
    for (const path of ['', 'api/floor-geometry', 'api/placement', 'private-assets/floor1-geometry.json']) {
      const res = await page.goto(TWIN_URL + path, { waitUntil: 'domcontentloaded' }).catch(() => null);
      const status = res ? res.status() : 0;
      check(status === 401, `401 without a session: /${path || ''}`, `got ${status}`);
    }
    await anon.close();
  }

  const context = await browser.newContext({ viewport: VIEWPORTS[0] });
  const page = await context.newPage();

  console.log(`\nLogging in to ${BASE_URL} as ${USER}...`);
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="user"]', USER);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  // Same hard auth gate the dashboard suites use: /login answers 200, so a
  // failed login would otherwise sail through every check below.
  if (page.url().includes('/login') || (await page.locator('input[name="password"]').count()) > 0) {
    console.error(`AUTHENTICATION_FAILED: still on login page (url=${page.url()}).`);
    await browser.close();
    process.exit(1);
  }
  console.log('Login verified.\n');

  let baseline = null;

  for (const vp of VIEWPORTS) {
    console.log(`Viewport ${vp.name}:`);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    const errors = [];
    const failed = [];
    const onConsole = (m) => {
      if (m.type() === 'error') errors.push(m.text());
    };
    const onFailed = (r) => failed.push(r.url());
    page.on('console', onConsole);
    page.on('requestfailed', onFailed);

    await page.goto(TWIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.__twin && window.__twin.machineMeshes.length > 0, { timeout: 30000 });
    await page.waitForTimeout(2500);

    const s = await snapshot(page);

    // Scene composition is checked against what the API served, so adding
    // evidence later does not require editing this test.
    const expectedStructural = s.api.columns + 1; // columns + floor shell
    const expectedOperational = s.api.slots + s.machineMeshes;
    check(s.perLayer.structural === expectedStructural, 'structural meshes = columns + floor shell',
      `${s.perLayer.structural} vs ${expectedStructural}`);
    check(s.perLayer.functional === s.api.zones, 'functional meshes = zones served',
      `${s.perLayer.functional} vs ${s.api.zones}`);
    check(s.perLayer.operational === expectedOperational, 'operational meshes = slots + machines',
      `${s.perLayer.operational} vs ${expectedOperational}`);
    check(s.meshes === expectedStructural + s.api.zones + expectedOperational, 'total mesh count reconciles',
      `${s.meshes}`);

    check(s.badTransforms === 0, 'no NaN/Infinity transforms', `${s.badTransforms} bad`);
    check(s.machineMeshes === 23, 'IMS machine meshes = 23', `${s.machineMeshes}`);
    check(!s.api.conflictServed, 'conflicting zones withheld from the wire');
    check(s.api.zonesTotal === null || s.api.zones < s.api.zonesTotal,
      'unvalidated zones withheld', `${s.api.zones} of ${s.api.zonesTotal}`);
    check(s.api.clearHeight === null, 'clear height still unmeasured (null, not estimated)');
    check(s.resources.materials < s.meshes / 10, 'materials shared, not per-mesh',
      `${s.resources.materials} materials for ${s.meshes} meshes`);
    check(s.resources.geometries < s.meshes, 'geometries shared',
      `${s.resources.geometries} geometries for ${s.meshes} meshes`);
    check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));
    check(failed.length === 0, 'no failed requests', failed.slice(0, 2).join(' | '));

    if (!baseline) baseline = s;

    page.off('console', onConsole);
    page.off('requestfailed', onFailed);
    console.log('');
  }

  // ── Visibility is presentation only ──
  console.log('Layer visibility:');
  for (const layer of LAYERS) {
    await page.uncheck(`#layer-controls input[data-layer="${layer}"]`);
  }
  await page.waitForTimeout(500);
  const hidden = await snapshot(page);
  check(Object.values(hidden.visibility).every((v) => v === false), 'all layers reported hidden');
  check(hidden.meshes === baseline.meshes, 'hiding does not delete meshes', `${hidden.meshes} vs ${baseline.meshes}`);
  check(hidden.machineMeshes === baseline.machineMeshes, 'hiding does not change machine count');
  check(JSON.stringify(hidden.api) === JSON.stringify(baseline.api), 'hiding does not change API results');

  for (const layer of LAYERS) {
    await page.check(`#layer-controls input[data-layer="${layer}"]`);
  }
  await page.waitForTimeout(500);
  const restored = await snapshot(page);
  check(JSON.stringify(restored) === JSON.stringify(baseline), 'restoring reproduces the baseline snapshot');

  await browser.close();

  console.log(`\n${failures === 0 ? 'FACTORY TWIN REGRESSION PASSED' : `FACTORY TWIN REGRESSION FAILED (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
