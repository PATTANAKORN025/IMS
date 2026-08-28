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
    for (const path of [
      '',
      'api/floor-geometry',
      'api/placement',
      'api/state',
      'api/diagnostics',
      'private-assets/floor1-geometry.json',
    ]) {
      const res = await page.goto(TWIN_URL + path, { waitUntil: 'domcontentloaded' }).catch(() => null);
      const status = res ? res.status() : 0;
      check(status === 401, `401 without a session: /${path || ''}`, `got ${status}`);
    }

    // Traversal variants. Plain, encoded, nested and route-relative. None may
    // return private content; reaching the auth gate is itself a rejection.
    for (const attack of [
      '../private/floor1-geometry.json',
      '..%2fprivate%2ffloor1-geometry.json',
      '%2e%2e/%2e%2e/private/floor1-zones.json',
      'vendor/three/../../private/floor1-geometry.json',
      'api/floor-geometry/../../private/floor1-geometry.json',
      'private/floor1-geometry.json',
    ]) {
      const res = await page.goto(TWIN_URL + attack, { waitUntil: 'domcontentloaded' }).catch(() => null);
      const status = res ? res.status() : 0;
      const body = res ? await page.content().catch(() => '') : '';
      // Status alone is NOT the security property. A browser normalises a
      // leading ../ before sending, so the request leaves the twin's path
      // entirely and lands on Grafana, which 302s to its login page -- a 200
      // login page is a rejection, not a leak. What must hold is that no
      // private content comes back, whatever the status.
      const leaked = /footprint_polygon|slot_id|schema_version|"columns"|"envelope"/.test(body);
      check(!leaked, `traversal returns no private content: ${attack}`, `status ${status}${leaked ? ' LEAKED' : ''}`);
    }

    // An error response must never carry a stack trace or a filesystem path.
    const errRes = await page.goto(`${TWIN_URL}api/floor-geometry`, { waitUntil: 'domcontentloaded' }).catch(() => null);
    const errBody = errRes ? await page.content().catch(() => '') : '';
    check(!/at .*\(.*:\d+:\d+\)/.test(errBody), 'no stack trace in an unauthenticated response');
    check(!/\/app\/|C:\\\\/.test(errBody), 'no filesystem path in an unauthenticated response');

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

  // ── Evidence semantics ──
  // These are the claims the twin is not allowed to make. Each has been a real
  // risk at some point in this reconstruction.
  console.log('Evidence semantics:');
  {
    const ev = await page.evaluate(async () => {
      const geo = await (await fetch('api/floor-geometry')).json();
      const diag = await (await fetch('api/diagnostics')).json().catch(() => null);
      return {
        slotsAllUnmapped: geo.slots.every((s) => s.status === 'UNMAPPED' && s.ims_device_id === null),
        slotsNoMesId: geo.slots.every((s) => s.mes_machine_id === undefined || s.mes_machine_id === null),
        heightsUnknown: geo.slots.every((s) => s.height_status === 'unknown'),
        clearHeightNull: geo.envelope ? geo.envelope.clear_height_m === null : null,
        noLowConfidenceGeometry:
          geo.columns.every((c) => c.confidence !== 'low') && geo.slots.every((s) => s.confidence !== 'low'),
        servedZoneTiers: [...new Set(geo.functional_zones.map((z) => z.confidence))],
        confirmedMappings: diag ? diag.evidence.confirmed_mappings : null,
        simulatedPositions: diag ? diag.evidence.simulated_machine_positions : null,
      };
    });
    check(ev.slotsAllUnmapped, 'every slot remains UNMAPPED with a null device id');
    check(ev.slotsNoMesId, 'no slot carries a MES machine id');
    check(ev.heightsUnknown, 'equipment height stays unknown, not defaulted into evidence');
    check(ev.clearHeightNull, 'clear height stays null rather than estimated');
    check(ev.noLowConfidenceGeometry, 'no LOW-confidence physical geometry is served');
    check(
      ev.servedZoneTiers.every((t) => t === 'HIGH' || t === 'MEDIUM'),
      'only HIGH/MEDIUM zones are served',
      ev.servedZoneTiers.join(',')
    );
    check(ev.confirmedMappings === 0, 'confirmed mappings remains 0', `got ${ev.confirmedMappings}`);
    check(ev.simulatedPositions > 0, 'machine positions are still declared simulated');
    console.log('');
  }

  // ── View presets ──
  console.log('View presets:');
  {
    const before = await snapshot(page);
    const machinesBefore = await page.evaluate(() =>
      window.__twin.machineMeshes.map((m) => [m.position.x, m.position.y, m.position.z])
    );
    await page.click('#view-controls button[data-view="building"]');
    await page.waitForTimeout(600);
    const inBuilding = await page.evaluate(() => {
      const T = window.__twin;
      let total = 0;
      let visible = 0;
      T.layers.structural.traverse((o) => {
        if (o.type !== 'Mesh') return;
        total++;
        const v = o.position.clone().project(T.camera);
        if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1) visible++;
      });
      return { total, visible, view: T.getView() };
    });
    check(inBuilding.view === 'building', 'building preset activates');
    check(
      inBuilding.visible === inBuilding.total,
      'building preset frames the whole structure without clipping',
      `${inBuilding.visible}/${inBuilding.total}`
    );
    await page.click('#view-controls button[data-view="operator"]');
    await page.waitForTimeout(600);
    const machinesAfter = await page.evaluate(() =>
      window.__twin.machineMeshes.map((m) => [m.position.x, m.position.y, m.position.z])
    );
    check(
      JSON.stringify(machinesBefore) === JSON.stringify(machinesAfter),
      'switching views never moves a machine'
    );
    const restored = await snapshot(page);
    check(JSON.stringify(restored.api) === JSON.stringify(before.api), 'switching views never changes API results');
    console.log('');
  }

  // ── Diagnostics ──
  console.log('Diagnostics:');
  {
    const openByDefault = await page.locator('#diagnostics').evaluate((e) => e.open);
    check(openByDefault === false, 'diagnostics stays collapsed for the default view');
    await page.click('#diagnostics > summary');
    await page.waitForTimeout(1200);
    const text = await page.locator('#diagnostics-body').innerText();
    check(text.includes('Confirmed mappings'), 'diagnostics reports confirmed mappings');
    check(text.includes('Observed columns') && text.includes('Simulated machine positions'),
      'diagnostics keeps evidence categories separate');
    check(!/PHYS-F1-|LDI-\d/.test(text), 'diagnostics leaks no object identifiers');
    await page.click('#diagnostics > summary');
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
