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
 *
 * TWIN_DIRECT_URL escape hatch:
 *   TWIN_DIRECT_URL=http://localhost:4199/ node tests/playwright/factory-twin-regression.js
 *
 *   Points the SCENE checks at the service directly, skipping the login and
 *   the unauthenticated-boundary section. It exists because the Grafana
 *   credential in this environment currently returns 401, which would
 *   otherwise leave every scene assertion unrunnable rather than merely
 *   unverified-through-the-proxy.
 *
 *   It is explicitly NOT equivalent to the authenticated run and never
 *   reports as one: the proxy, the auth gate and the 401 boundary are not
 *   exercised at all, so a direct run proves the scene is correct and proves
 *   NOTHING about access control. The default path remains the authenticated
 *   one. Nothing about the service's auth is changed, disabled or bypassed --
 *   the gate lives in the proxy and is simply not on this route.
 */

'use strict';

const { chromium } = require('playwright');

const BASE_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const USER = process.env.GRAFANA_ADMIN_USER || process.env.GRAFANA_USER || 'admin';
const PASS = process.env.GRAFANA_ADMIN_PASSWORD || process.env.GRAFANA_PASS;
const DIRECT_URL = process.env.TWIN_DIRECT_URL || null;
const TWIN_URL = DIRECT_URL || `${BASE_URL}/factory-twin-3d/`;

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1440', width: 2560, height: 1440 },
  { name: '3840x2160', width: 3840, height: 2160 },
  // Portrait is not decorative: the camera fit divides the horizontal extent
  // by tan(fov/2) * aspect, so an aspect below 1 makes the depth axis the
  // binding one -- a real bug that only showed up once portrait was tested.
  { name: '600x1000 (portrait)', width: 600, height: 1000 },
];

// The toggles an operator actually has. Sub-layers exist because the four
// coarse layers each bundled two different evidence classes; the test drives
// the real controls rather than the internal grouping.
const LAYERS = ['shell', 'columns', 'functional', 'slots', 'machines', 'telemetry', 'presentation'];

const NO_GEOMETRY = 'no private geometry is deployed here';
const NO_DEVICES = 'no monitored devices in this database';
const NO_SCHEMATIC = 'no schematic transcription is deployed here';

let failures = 0;
let skipped = 0;
function check(ok, label, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

// A precondition that is absent is not a passing assertion. CI has no private
// geometry -- it is gitignored -- so the checks that need it cannot run there.
// They are reported as SKIP with the reason, never folded into the pass count,
// so a green CI run never implies the geometry was verified.
function skip(label, why) {
  console.log(`  SKIP  ${label}  (${why})`);
  skipped++;
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
    const place = await (await fetch('api/placement')).json().catch(() => null);
    return {
      meshes,
      badTransforms,
      perLayer,
      visibility: Object.fromEntries(
        [...Object.entries(T.layers), ...Object.entries(T.sublayers)].map(([k, g]) => [k, g.visible])
      ),
      perSublayer: Object.fromEntries(
        Object.entries(T.sublayers).map(([k, g]) => {
          let n = 0;
          g.traverse((o) => {
            if (o.type === 'Mesh') n++;
          });
          return [k, n];
        })
      ),
      // Every rendered evidence position as one string. A camera change must
      // leave this identical; anything else means a view moved real data.
      coords: T.snapshotCoordinates(),
      resources: T.resourceStats(),
      footprintMeshes: T.footprintMeshes.length,
      presentationMeshes: T.presentationMeshes ? T.presentationMeshes.length : 0,
      // Walls and openings are instanced: a few objects carrying hundreds of
      // spans. Counted as objects, because that is what the scene holds.
      wallMeshes: T.wallMeshes ? T.wallMeshes.length : 0,
      openingMeshes: T.openingMeshes ? T.openingMeshes.length : 0,
      structuralGrid: (() => {
        const g = T.getStructuralGrid();
        return g ? g.geometry.attributes.position.count / 2 : 0;
      })(),
      // The decorative helper must be gone once the surveyed grid is drawn:
      // one grid on screen, and that one evidence.
      orientationGridPresent: (() => {
        let found = false;
        T.layers.structural.traverse((o) => {
          if (o.type === 'GridHelper') found = true;
        });
        return found;
      })(),
      machineMeshes: T.machineMeshes.length,
      api: {
        columns: geo.columns.length,
        walls: Array.isArray(geo.walls) ? geo.walls.length : 0,
        openings: Array.isArray(geo.openings) ? geo.openings.length : 0,
        slots: geo.slots.length,
        zones: geo.functional_zones.length,
        zonesTotal: geo.functional_zones_meta ? geo.functional_zones_meta.total : null,
        conflictServed: geo.functional_zones.some((z) => ['zone-28', 'zone-31'].includes(z.id)),
        zoneNames: geo.functional_zones.map((z) => z.name).filter((n) => n !== null && n !== undefined),
        zonesNamedCount: geo.functional_zones.filter((z) => z.name).length,
        envelopeHeight: geo.envelope ? geo.envelope.height : null,
        footprintVertices: geo.footprint_polygon ? geo.footprint_polygon.vertices.length : 0,
        gridLines: geo.grid ? geo.grid.x.length + geo.grid.z.length : 0,
        clearHeight: geo.envelope ? geo.envelope.clear_height_m : null,
        placements: place && Array.isArray(place.machines) ? place.machines.length : 0,
      },
    };
  });
}

async function run() {
  if (!PASS && !DIRECT_URL) {
    console.error('FATAL: GRAFANA_ADMIN_PASSWORD (or GRAFANA_PASS) env var not set.');
    process.exit(1);
  }
  // Direct mode exists so a blocked credential does not leave every scene
  // assertion unrunnable. It proves nothing about access control, and says so
  // both here and in the final banner.
  if (DIRECT_URL) {
    console.log(`DIRECT MODE (${DIRECT_URL}) - scene checks only.`);
    console.log('Auth gate, 401 boundary and traversal checks are NOT exercised in this mode.');
  }

  const browser = await chromium.launch({ headless: true });

  // ── Unauthenticated boundary, before any login ──
  if (!DIRECT_URL) {
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
      'api/floor-schematic',
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
  }

  const context = await browser.newContext({ viewport: VIEWPORTS[0] });
  const page = await context.newPage();

  // Service response hygiene. Only meaningful in direct mode: through the proxy
  // the auth gate answers first, so these assertions would be testing nginx.
  // Express's defaults are wrong here in two specific ways, and both are
  // disclosure rather than availability problems -- the default 404 echoes the
  // requested path back into the body, and the default error handler emits a
  // stack trace unless NODE_ENV happens to be production.
  if (DIRECT_URL) {
    console.log('Service response hygiene:');
    await page.goto(TWIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const probe = 'private/floor1-zones.json';
    const res = await page.request.get(TWIN_URL + probe, { failOnStatusCode: false });
    const body = await res.text();
    check(res.status() === 404, 'a private path is not served', `got ${res.status()}`);
    check(!body.includes(probe), 'the 404 body does not echo the requested path back');
    check(!/floor1|private|\.json/i.test(body), 'the 404 body names no private file');
    check(!/at .*\(.*:\d+:\d+\)/.test(body), 'the 404 body carries no stack trace');
    check(!/\/app\/|[A-Za-z]:\\/.test(body), 'the 404 body carries no filesystem path');
    const headers = res.headers();
    check(!('x-powered-by' in headers), 'the service does not advertise its framework');

    // Response headers. Each asserts a disclosure property, not a style rule.
    const api = await page.request.get(TWIN_URL + 'api/floor-geometry', { failOnStatusCode: false });
    const apiHeaders = api.headers();
    check(
      (apiHeaders['cache-control'] || '').includes('no-store'),
      'geometry is marked no-store so private-derived data is not cached',
      apiHeaders['cache-control'] || 'absent'
    );
    check(apiHeaders['x-content-type-options'] === 'nosniff', 'content type is not sniffable');
    check(apiHeaders['referrer-policy'] === 'no-referrer', 'no referrer is sent onward');
    check(apiHeaders['x-frame-options'] === 'DENY', 'the twin refuses to be framed');
    check(
      (apiHeaders['content-security-policy'] || '').includes("frame-ancestors 'none'"),
      'frame-ancestors is none'
    );
    check(
      (apiHeaders['content-type'] || '').startsWith('application/json'),
      'geometry is served as JSON, not as something a browser may execute'
    );
    check(!('access-control-allow-origin' in apiHeaders), 'no cross-origin access is granted');

    // Nothing outside public/ is reachable, and no source map exposes internals.
    for (const probe of ['server.js', 'lib/wire.js', 'package.json', '.env', 'app.js.map', 'api/debug']) {
      const r = await page.request.get(TWIN_URL + probe, { failOnStatusCode: false });
      check(r.status() === 404, `not served: /${probe}`, `got ${r.status()}`);
    }

    // Every string the geometry route serves must be a safe token. Free text --
    // a note, a process name, a path -- cannot satisfy this, which is the
    // property being asserted rather than the absence of any particular word.
    //
    // ONE field is deliberately prose-shaped and therefore exempt from the
    // token rule: a functional zone's `name`, which is the drawing's own area
    // label. It is not unchecked -- it is held to lib/wire.js's ZONE_NAME
    // instead, which is the stricter guard of the two in every way that
    // matters: uppercase only, no dots, no slashes, no colons, 32 characters.
    // A path, a sentence of provenance or an author's note all contain
    // lowercase and so cannot pass it. The exemption is keyed to the field
    // path, so prose appearing anywhere else still fails.
    const strings = await page.evaluate(async () => {
      const geo = await (await fetch('api/floor-geometry')).json();
      const out = [];
      (function walk(o, path) {
        if (o === null || o === undefined) return;
        if (typeof o === 'string') { out.push({ path, value: o }); return; }
        if (Array.isArray(o)) { o.forEach((v) => walk(v, `${path}[]`)); return; }
        if (typeof o === 'object') {
          for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
        }
      })(geo, '$');
      return out;
    });
    const ZONE_NAME_FIELD = '$.functional_zones[].name';
    const nonToken = strings.filter(
      (s) => s.path !== ZONE_NAME_FIELD
        && !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(s.value));
    check(nonToken.length === 0, 'every served geometry string is a safe token', `${nonToken.length} free-text value(s)`);

    // The exempt field carries its own, stricter assertion rather than being
    // waved through: if a name ever stops matching ZONE_NAME, that is a leak.
    const names = strings.filter((s) => s.path === ZONE_NAME_FIELD).map((s) => s.value);
    const badNames = names.filter((v) => !/^[A-Z0-9][A-Z0-9 \-]{0,31}$/.test(v));
    check(badNames.length === 0, 'every zone name matches the zone-name guard exactly',
      `${badNames.length} of ${names.length} name(s) failed`);
    check(!names.some((v) => /[/\.:]/.test(v)),
      'no zone name can carry a path, a dot or a colon');
  }


  if (!DIRECT_URL) {
  console.log(`\nLogging in to ${BASE_URL} as ${USER}...`);
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="user"]', USER);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  // Same hard auth gate the dashboard suites use: /login answers 200, so a
  // failed login would otherwise sail through every check below.
  if (page.url().includes('/login') || (await page.locator('input[name="password"]').count()) > 0) {
    // Distinguish "this environment has no usable credential" from "the twin
    // regressed". Both are non-zero -- neither is ever reported as PASS -- but
    // conflating them makes a red CI run say nothing about the twin. Exit 78
    // (EX_CONFIG) marks a configuration precondition, not a product failure.
    console.error('');
    console.error('AUTH_REGRESSION_BLOCKED_EXTERNAL_CREDENTIAL');
    console.error(`  Grafana rejected the configured credential for user "${USER}" at ${BASE_URL}.`);
    console.error('  The authenticated half of this suite did not run and is NOT reported as passing.');
    console.error('  This is a credential/environment precondition, not a factory-twin defect:');
    console.error('  GF_SECURITY_ADMIN_PASSWORD seeds the admin password only at first');
    console.error('  initialisation of the Grafana database, so a password changed inside');
    console.error('  Grafana afterwards no longer matches the environment value.');
    console.error('  Resolve by supplying the current credential. Do NOT disable authentication,');
    console.error('  relax the proxy gate, or hardcode a replacement to make this run green.');
    console.error('  The unauthenticated boundary checks above DID run and their result stands.');
    console.error('  Scene assertions can be executed separately with TWIN_DIRECT_URL, which');
    console.error('  proves nothing about access control and says so in its own banner.');
    await browser.close();
    process.exit(78);
  }
  }
  if (!DIRECT_URL) console.log('Login verified.\n');

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
    // Wait for the scene, not for machines. A deployment with no monitored
    // devices is a valid deployment -- CI runs against a database that has
    // none -- and waiting on a device that will never arrive would turn an
    // empty fleet into a timeout instead of a reported zero.
    await page.waitForFunction(() => window.__twin !== undefined, { timeout: 30000 });
    await page.waitForTimeout(2500);

    const s = await snapshot(page);

    // Scene composition is checked against what the API served, so adding
    // evidence later does not require editing this test.
    //
    // Structural meshes are the columns plus exactly ONE floor plate. Which
    // plate depends on the evidence: with a traced polygon it is the measured
    // slab and the synthetic-extent plate is retired, because two plates would
    // be two answers to "where is the building" and the synthetic one is the
    // wrong answer. Without geometry the synthetic plate is the only spatial
    // reference there is and stays. Either way the count is columns + 1.
    const measuredPlate = s.footprintMeshes > 0;
    const syntheticPlate = !measuredPlate && s.machineMeshes > 0 ? 1 : 0;
    // Plus the CAD building fabric: one instanced mesh for every wall, and one
    // per opening kind. These are added as objects, not per wall, which is the
    // whole point of instancing them -- ~900 walls must not cost ~900 meshes.
    const expectedStructural = s.api.columns
      + (measuredPlate ? s.footprintMeshes : syntheticPlate)
      + s.wallMeshes + s.openingMeshes;
    // slots + monitored devices + one instanced mesh per (form, part). The
    // presentation meshes are a couple of dozen objects standing in for every
    // machine on the floor, which is exactly why they are counted as objects.
    const expectedOperational = s.api.slots + s.machineMeshes + s.presentationMeshes;
    check(s.perLayer.structural === expectedStructural,
      'structural meshes = columns + floor plate + traced outline',
      `${s.perLayer.structural} vs ${expectedStructural}`);
    check(s.visibility.presentation === false,
      'the presentation model is off by default, so the measured floor is what is claimed');
    check(s.perLayer.functional === s.api.zones, 'functional meshes = zones served',
      `${s.perLayer.functional} vs ${s.api.zones}`);
    check(s.perSublayer.columns === s.api.columns, 'column sub-layer holds exactly the served columns',
      `${s.perSublayer.columns} vs ${s.api.columns}`);
    check(s.perSublayer.walls === s.wallMeshes + s.openingMeshes,
      'wall sub-layer holds exactly the wall and opening meshes',
      `${s.perSublayer.walls} vs ${s.wallMeshes + s.openingMeshes}`);
    // Instancing is the claim, so assert it: hundreds of walls, a handful of
    // objects. If a refactor ever drops back to one mesh per wall this fails
    // rather than quietly costing ~900 draw calls.
    check(s.api.walls === 0 || s.wallMeshes <= 2,
      'walls are instanced, not one mesh each',
      `${s.wallMeshes} mesh(es) for ${s.api.walls} walls`);
    check(s.perSublayer.slots === s.api.slots, 'slot sub-layer holds exactly the served slots',
      `${s.perSublayer.slots} vs ${s.api.slots}`);
    check(s.perSublayer.machines === s.machineMeshes, 'machine sub-layer holds exactly the monitored devices',
      `${s.perSublayer.machines} vs ${s.machineMeshes}`);
    check(s.perLayer.operational === expectedOperational, 'operational meshes = slots + machines',
      `${s.perLayer.operational} vs ${expectedOperational}`);
    check(s.meshes === expectedStructural + s.api.zones + expectedOperational, 'total mesh count reconciles',
      `${s.meshes}`);

    check(s.badTransforms === 0, 'no NaN/Infinity transforms', `${s.badTransforms} bad`);
    // Reconciled against what /api/placement served, not against a literal:
    // the device set is discovered live, so hardcoding it would fail on any
    // deployment with a different fleet rather than catching a real regression.
    check(s.machineMeshes === s.api.placements, 'machine meshes = placements served',
      `${s.machineMeshes} vs ${s.api.placements}`);
    check(!s.api.conflictServed, 'conflicting zones withheld from the wire');

    // ── Building outline: the floor must read as THIS building ──
    // The envelope is only a bounding box, and a box is the same box for every
    // rectangular-ish building. The traced outline is what distinguishes them.
    if (!s.api.footprintVertices) {
      skip('the traced building outline is drawn', NO_GEOMETRY);
      skip('the surveyed structural grid replaces the orientation helper', NO_GEOMETRY);
    } else {
      check(s.api.footprintVertices >= 3, 'the served outline is a polygon',
        `${s.api.footprintVertices} vertices`);
      check(s.footprintMeshes === 1, 'the traced building outline is drawn',
        `${s.footprintMeshes} slab(s)`);
      check(s.structuralGrid === s.api.gridLines,
        'the surveyed structural grid replaces the orientation helper',
        `${s.structuralGrid} drawn vs ${s.api.gridLines} served`);
      check(!s.orientationGridPresent, 'the decorative orientation grid is retired once the surveyed grid arrives');
    }
    // Only meaningful where zones exist. With none served there is nothing
    // being withheld and nothing being over-served -- that is not a pass.
    if (!s.api.zonesTotal) skip('unvalidated zones withheld', NO_GEOMETRY);
    else check(s.api.zones < s.api.zonesTotal,
      'unvalidated zones withheld', `${s.api.zones} of ${s.api.zonesTotal}`);
    check(s.api.clearHeight === null, 'clear height still unmeasured (null, not estimated)');
    check(s.resources.materials < s.meshes / 10, 'materials shared, not per-mesh',
      `${s.resources.materials} materials for ${s.meshes} meshes`);
    check(s.resources.geometries < s.meshes, 'geometries shared',
      `${s.resources.geometries} geometries for ${s.meshes} meshes`);
    check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));
    check(failed.length === 0, 'no failed requests', failed.slice(0, 2).join(' | '));

    // ── Operator surface: every control must be reachable at this viewport ──
    // Not decoration. With the evidence legend and diagnostics expanded, the
    // HUD's content exceeds its fixed height by roughly 900px at 1366x768, and
    // under overflow:hidden the diagnostics control sat below the viewport with
    // no scrollbar and no way to reach it with a pointer.
    const surface = await page.evaluate(() => {
      const sels = [
        '#simulated-banner',
        '#hud h1',
        '#view-controls button[data-view="operator"]',
        '#view-controls button[data-view="building"]',
        '#view-controls button[data-view="overview"]',
        '#view-reset',
        '#layer-controls input[data-layer="shell"]',
        '#layer-controls input[data-layer="telemetry"]',
        '#evidence-summary',
        '#evidence-legend > summary',
        '#diagnostics > summary',
      ];
      const legend = document.getElementById('evidence-legend');
      const diag = document.getElementById('diagnostics');
      const wasLegend = legend.open;
      const wasDiag = diag.open;
      legend.open = true;
      diag.open = true;
      const unreachable = [];
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el) { unreachable.push(`${sel} (missing)`); continue; }
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        const offscreen =
          r.width === 0 || r.height === 0 ||
          r.bottom > window.innerHeight + 1 || r.right > window.innerWidth + 1 ||
          r.top < -1 || r.left < -1;
        if (offscreen) unreachable.push(`${sel} (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)})`);
      }
      legend.open = wasLegend;
      diag.open = wasDiag;
      const canvas = document.querySelector('canvas');
      return {
        unreachable,
        horizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
        canvasLabelled: Boolean(canvas && canvas.getAttribute('aria-label')),
        // Evidence state must never be carried by colour alone. Each legend
        // row pairs a glyph with the word, and the glyph is aria-hidden so a
        // screen reader gets the word rather than a decorative character.
        legendRows: [...document.querySelectorAll('#evidence-legend dt')].map((dt) => ({
          text: dt.textContent.trim(),
          glyph: Boolean(dt.querySelector('.ev[aria-hidden="true"]')),
        })),
      };
    });
    check(surface.unreachable.length === 0, 'every operator control is reachable',
      surface.unreachable.join(' | '));
    check(!surface.horizontalScroll, 'the page never scrolls horizontally');
    check(surface.canvasLabelled, 'the 3D canvas carries an accessible name');
    check(
      surface.legendRows.length === 6 && surface.legendRows.every((r) => r.glyph && /[A-Z]{6,}/.test(r.text)),
      'every evidence state is named in words and carries a non-colour glyph',
      `${surface.legendRows.length} rows`
    );

    // ── Presentation model ──
    // A third evidence layer whose footprints are measured and whose every
    // vertical dimension is a drawing convention. It must announce that, cost
    // little, and change nothing about the measured model.
    const pres = await page.evaluate(() => {
      const T = window.__twin;
      const before = T.renderer.info.render.calls;
      const coordsBefore = T.snapshotCoordinates();
      const group = T.sublayers.presentation;
      const wasVisible = group.visible;
      group.visible = true;
      T.renderer.render(T.scene, T.camera);
      const after = T.renderer.info.render.calls;
      let nan = 0;
      group.traverse((o) => {
        const p = o.position;
        if (p && !(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) nan++;
      });
      const out = {
        meshes: T.presentationMeshes.length,
        classes: [...new Set(T.presentationMeshes.map((m) => m.userData.presentation.classification))],
        instanced: T.presentationMeshes.every((m) => m.isInstancedMesh === true),
        carriesDevice: T.presentationMeshes.some((m) => 'deviceId' in m.userData),
        drawDelta: after - before,
        nan,
        coordsUnchanged: T.snapshotCoordinates() === coordsBefore,
        spec: T.presentationSpec(),
        census: T.presentationCensus(),
        // One InstancedMesh per (form, part). Every mesh of a form must carry
        // exactly that form's membership, or a machine has been dropped or
        // double-counted between its own parts.
        countsMatchCensus: T.presentationMeshes.every(
          (m) => m.count === T.presentationCensus()[m.userData.presentation.form]
        ),
        formsUsed: [...new Set(T.presentationMeshes.map((m) => m.userData.presentation.form))],
        // Every mesh must name a form and a part, or the inspector cannot say
        // what an object is when someone clicks it.
        allNamed: T.presentationMeshes.every(
          (m) => typeof m.userData.presentation.form === 'string'
            && typeof m.userData.presentation.part === 'string'
        ),
      };
      group.visible = wasVisible;
      return out;
    });
    if (pres.meshes === 0) {
      skip('the presentation model is built from the measured footprints', NO_GEOMETRY);
    } else {
      check(pres.instanced, 'the presentation model is instanced, not one mesh per machine');
      const censusTotal = Object.values(pres.census).reduce((a, b) => a + b, 0);
      check(
        censusTotal === s.api.slots,
        'every measured slot gets exactly one presentation machine',
        `${censusTotal} vs ${s.api.slots}`
      );
      check(pres.countsMatchCensus,
        'every part of a form is instanced once per member of that form');
      // The point of the whole change: the floor is not 243 copies of one box.
      check(pres.formsUsed.length >= 4,
        'the floor draws several machine forms, not one repeated shape',
        `${pres.formsUsed.length} forms: ${pres.formsUsed.join(',')}`);
      check(pres.formsUsed.every((f) => pres.spec.forms.includes(f)),
        'every form built is a declared form',
        pres.formsUsed.join(','));
      check(pres.allNamed, 'every presentation object names its form and its part');
      // Instancing is the whole reason this layer is affordable: one mesh per
      // (form, part) rather than one per machine.
      //
      // The bound is TWICE the mesh count because every caster is also drawn
      // into the shadow map, so an instanced mesh costs one scene draw plus one
      // shadow draw. The second clause is the one that matters: whatever the
      // shading does, the cost must never start scaling with the number of
      // machines.
      check(pres.drawDelta <= pres.meshes * 2,
        'the presentation model costs a draw per mesh pass, not one per machine',
        `+${pres.drawDelta} draws for ${pres.meshes} meshes`);
      check(pres.drawDelta < s.api.slots / 4,
        'the presentation model never costs a draw call per machine',
        `+${pres.drawDelta} draws for ${s.api.slots} machines`);
      check(
        pres.classes.length === 1 && pres.classes[0] === 'PRESENTATION_ONLY',
        'every presentation object declares itself PRESENTATION_ONLY',
        pres.classes.join(',')
      );
      check(!pres.carriesDevice, 'no presentation object carries a device identity');
      check(pres.nan === 0, 'no presentation object has a NaN transform', `${pres.nan}`);
      // The load-bearing one: drawing a convention must not disturb evidence.
      check(pres.coordsUnchanged,
        'building the presentation model moves no measured coordinate');
      check(pres.spec.classification === 'PRESENTATION_ONLY',
        'the presentation specification names its own classification');
    }

    if (!baseline) baseline = s;

    page.off('console', onConsole);
    page.off('requestfailed', onFailed);
    console.log('');
  }

  // Whether this deployment actually has private geometry. It is gitignored,
  // so CI runs without it: the scene is then correctly empty of structure, and
  // the assertions that need an envelope have nothing to assert rather than
  // something to assert about zero.
  const hasGeometry = Boolean(baseline && baseline.api.envelopeHeight !== null);
  if (!hasGeometry) {
    console.log('No private geometry served -- geometry-dependent checks will be SKIPPED, not passed.');
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
    // These hold whether or not geometry is deployed: an empty set trivially
    // satisfies them, and that is the correct answer when nothing was served.
    check(ev.slotsAllUnmapped, 'every slot remains UNMAPPED with a null device id');
    check(ev.slotsNoMesId, 'no slot carries a MES machine id');
    check(ev.heightsUnknown, 'equipment height stays unknown, not defaulted into evidence');
    check(ev.noLowConfidenceGeometry, 'no LOW-confidence physical geometry is served');
    check(
      ev.servedZoneTiers.every((t) => t === 'HIGH' || t === 'MEDIUM'),
      'only HIGH/MEDIUM zones are served',
      ev.servedZoneTiers.join(',')
    );
    // This one genuinely needs an envelope to assert anything about.
    if (ev.clearHeightNull === null) skip('clear height stays null rather than estimated', NO_GEOMETRY);
    else check(ev.clearHeightNull, 'clear height stays null rather than estimated');
    check(ev.confirmedMappings === 0, 'confirmed mappings remains 0', `got ${ev.confirmedMappings}`);

    // ── Zone display names ──
    // Names are servable on this route and nowhere else. Whatever the count is,
    // every name must satisfy the label guard, and none may appear in
    // diagnostics -- which is pasted into tickets and logs.
    const nameGuard = /^[A-Z0-9][A-Z0-9 \-]{0,31}$/;
    check(
      baseline.api.zoneNames.every((n) => nameGuard.test(n)),
      'every served zone name is a drawing label, not free text',
      `${baseline.api.zonesNamedCount} named of ${baseline.api.zones}`
    );
    const diagText = await page.evaluate(async () => JSON.stringify(await (await fetch('api/diagnostics')).json()));
    check(
      baseline.api.zoneNames.every((n) => !diagText.includes(n)),
      'no zone name appears in diagnostics'
    );
    // ── Schematic reference layer ──
    // A second spatial model whose only safety property is that it can never be
    // mistaken for the measured one. These assert the separation, not the
    // drawing.
    const sch = await page.evaluate(async () => {
      const r = await fetch('api/floor-schematic');
      if (!r.ok) return null;
      const j = await r.json();
      const areas = Array.isArray(j.areas) ? j.areas : [];
      const snapshots = Array.isArray(j.snapshots) ? j.snapshots : [];
      return {
        raw: JSON.stringify(j),
        space: j.coordinate_space,
        areas: areas.length,
        snapshots: snapshots.map((s) => s.id),
        names: areas.map((a) => a.name).filter(Boolean),
        classes: [...new Set(areas.map((a) => a.source_class))],
        annotations: Array.isArray(j.annotations) ? j.annotations.length : 0,
      };
    });
    if (!sch || sch.areas === 0) {
      // No schematic transcription deployed -- the default for a public clone,
      // exactly as with the measured geometry. Reported, never passed.
      for (const label of [
        'the schematic payload names its own coordinate space',
        'the schematic emits no physical coordinate field',
        'every schematic area claims only SCHEMATIC_OBSERVED',
        'no schematic record carries an IMS identity',
        'every schematic area name is a drawing label, not free text',
        'both reference snapshots coexist without being merged',
        'no schematic area name appears in diagnostics',
      ]) {
        skip(label, NO_SCHEMATIC);
      }
    } else {
    check(sch.space === 'SCHEMATIC_NOT_PHYSICAL', 'the schematic payload names its own coordinate space', sch.space);
    check(!/"[xyz]":/.test(sch.raw), 'the schematic emits no physical coordinate field');
    check(
      sch.classes.every((c) => c === 'SCHEMATIC_OBSERVED' || c === null),
      'every schematic area claims only SCHEMATIC_OBSERVED',
      sch.classes.join(',')
    );
    check(!/IMS_CONNECTED|ims_device_id/.test(sch.raw), 'no schematic record carries an IMS identity');
    check(
      sch.names.every((n) => nameGuard.test(n)),
      'every schematic area name is a drawing label, not free text',
      `${sch.names.length} named`
    );
    // Two renders claiming one instant and disagreeing. Served as two, never
    // reconciled into one.
    check(sch.snapshots.length === 2 && new Set(sch.snapshots).size === 2,
      'both reference snapshots coexist without being merged', sch.snapshots.join(','));
    check(
      sch.names.every((n) => !diagText.includes(n)),
      'no schematic area name appears in diagnostics'
    );
    }

    // Today this is zero, and that is the honest state: the names exist on a
    // schematic that shares no reference frame with these measured polygons,
    // so attaching one would be inventing the correspondence. If this ever
    // becomes non-zero, an authoritative correspondence must have arrived.
    console.log(`  INFO  ${baseline.api.zonesNamedCount} of ${baseline.api.zones} served zones carry a drawing label`);
    // Only assertable where a fleet exists. Zero monitored devices is a real
    // deployment state, not a failed assertion about simulated positions.
    if (!baseline.api.placements) skip('machine positions are still declared simulated', NO_DEVICES);
    else check(ev.simulatedPositions > 0, 'machine positions are still declared simulated');
    console.log('');
  }

  // ── View presets ──
  // Building framing is derived from the measured envelope, so without private
  // geometry the preset is correctly disabled and there is nothing to assert
  // about it. That is reported as skipped, not as passing.
  console.log('View presets:');
  if (!hasGeometry) {
    for (const label of [
      'building preset activates',
      'building preset frames the whole structure without clipping',
      'overview preset activates',
      'overview frames the whole structure',
      'overview frames every monitored device',
      'reset restores framing without changing which view is active',
      'switching views never moves a machine',
      'switching views never changes API results',
      'no rendered coordinate changes across three view switches and a reset',
    ]) {
      skip(label, NO_GEOMETRY);
    }
    console.log('');
  } else {
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
    // Overview frames both coordinate systems at once. It must contain the
    // whole structure AND every machine -- a preset that quietly drops one of
    // the two is worse than not offering it.
    await page.click('#view-controls button[data-view="overview"]');
    await page.waitForTimeout(600);
    const inOverview = await page.evaluate(() => {
      const T = window.__twin;
      const framed = (obj) => {
        const v = obj.position.clone().project(T.camera);
        return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1;
      };
      let structTotal = 0;
      let structVisible = 0;
      T.layers.structural.traverse((o) => {
        if (o.type !== 'Mesh') return;
        structTotal++;
        if (framed(o)) structVisible++;
      });
      return {
        view: T.getView(),
        structTotal,
        structVisible,
        machinesFramed: T.machineMeshes.filter(framed).length,
        machineTotal: T.machineMeshes.length,
      };
    });
    check(inOverview.view === 'overview', 'overview preset activates');
    check(inOverview.structVisible === inOverview.structTotal, 'overview frames the whole structure',
      `${inOverview.structVisible}/${inOverview.structTotal}`);
    check(inOverview.machinesFramed === inOverview.machineTotal, 'overview frames every monitored device',
      `${inOverview.machinesFramed}/${inOverview.machineTotal}`);

    // Reset re-applies the ACTIVE view's framing rather than forcing operator.
    await page.evaluate(() => window.__twin.controls.target.set(999, 999, 999));
    await page.click('#view-reset');
    await page.waitForTimeout(400);
    check(await page.evaluate(() => window.__twin.getView()) === 'overview',
      'reset restores framing without changing which view is active');

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
    // Byte-level, across all 412 evidence-backed meshes, not just the 23
    // machines: a view is a camera change and nothing else.
    check(restored.coords === before.coords,
      'no rendered coordinate changes across three view switches and a reset');
    console.log('');
  }

  // ── Schematic view ──
  // The second view exists to be read, and its one safety property is that
  // entering it changes nothing about the measured model.
  console.log('Schematic view:');
  {
    // A DRAWING, not merely the mode API. window.__schematic now exists on
    // every deployment because the mode system governs the 3D view too, so
    // testing for the object stopped distinguishing "no drawing here" from
    // "drawing present" -- and these checks silently stopped running rather
    // than reporting as skipped, which is the one outcome this suite exists to
    // prevent. getDoc is only attached once a document has actually loaded.
    const available = await page.evaluate(
      () => Boolean(window.__schematic && typeof window.__schematic.getDoc === 'function')
    );
    if (!available) {
      for (const label of [
        'entering schematic mode moves nothing in the 3D scene',
        'the schematic draws every area the API served',
        'every area label is rendered',
        'switching snapshot changes what is drawn without changing the areas',
        'switching snapshot never alters the 3D scene',
        'physical camera controls are hidden in schematic mode',
        'leaving schematic mode restores the physical controls',
      ]) {
        skip(label, NO_SCHEMATIC);
      }
      for (const label of [
        'every equipment bank the API served is drawn',
        'every bank cell is drawn',
        'banks are drawn in deterministic id order',
        'every bank is classified as a presentation group',
        'every bank dimension is classified as schematic-derived',
        'every drawing label is classified as an observed label',
        'labels the two renders disagree on remain marked ambiguous',
        'no bank carries a physical dimension field or an IMS identity',
        'a bank outside every named area is still drawn',
        'every transcribed cell value is drawn for the active snapshot',
        'every disagreeing cell is marked as a conflict',
        'the sources genuinely disagree and that is recorded, not smoothed away',
        'the not-to-scale notice is always present in schematic mode',
        'the conflict notice names the conflict and the declared instant',
        "the other snapshot shows its own cell values, not the first one's",
        'both snapshots transcribe the same cells',
        'selecting a bank states its evidence classification',
        'selecting a bank states that its grouping is presentation only',
        'selecting a bank states that its dimensions are not measured',
        'a selected bank reports its physical link as unmapped',
        'a selected bank reports its IMS link as unmapped',
        'no selected schematic object names a monitored device',
        'selecting an area reports it as unmapped too',
        'the banner says not to scale in schematic mode',
        'the banner states zero confirmed mappings',
        'the banner names the active reference snapshot',
        'the banner returns to the measured claim outside schematic mode',
        'the legend draws all six states the reference defines',
        'the legend states match the reference vocabulary and its order',
        'the secondary render carries its own north marker and title block',
        'the title block shows its scale field, which the source leaves blank',
      ]) {
        skip(label, NO_SCHEMATIC);
      }
    } else {
      const coordsBefore = await page.evaluate(() => window.__twin.snapshotCoordinates());
      await page.click('#mode-controls button[data-mode="schematic"]');
      await page.waitForTimeout(700);

      const inSchematic = await page.evaluate(() => {
        const S = window.__schematic;
        return {
          mode: S.getMode(),
          areasDrawn: S.countAreas(),
          labelsDrawn: S.countLabels(),
          dims: S.countDimensions(),
          banksDrawn: S.countBanks(),
          cellsDrawn: S.countCells(),
          bankIds: S.bankIds(),
          snapshot: S.getActiveSnapshot(),
          apiAreas: S.getDoc().areas.length,
          // Areas the drawing actually names. An area with no name printed
          // inside it is served unnamed, and has no label to draw.
          apiNamedAreas: S.getDoc().areas.filter((a) => a && a.name).length,
          apiBanks: S.getDoc().banks.length,
          apiCells: S.getDoc().banks.reduce((n, b) => n + b.columns * b.rows, 0),
          groupingClasses: [...new Set(S.getDoc().banks.map((b) => b.grouping_class))],
          dimensionClasses: [...new Set(S.getDoc().banks.map((b) => b.dimension_class))],
          labelClasses: [...new Set(S.getDoc().banks.flatMap((b) => b.labels).map((l) => l.class))],
          ambiguous: S.getDoc().banks.flatMap((b) => b.labels).filter((l) => l.ambiguous).length,
          rawDoc: JSON.stringify(S.getDoc()),
          coords: window.__twin.snapshotCoordinates(),
          viewControlsHidden: document.getElementById('view-controls').hidden,
          layerControlsHidden: document.getElementById('layer-controls').hidden,
        };
      });
      check(inSchematic.mode === 'schematic', 'the schematic mode activates');
      // The banner states which kind of claim is on screen, so nobody has to
      // infer it from the drawing.
      const banner = await page.evaluate(() => ({
        mode: document.getElementById('eb-mode').textContent,
        mappings: document.getElementById('eb-mappings').textContent,
        snapshot: document.getElementById('eb-snapshot').textContent,
        snapshotHidden: document.getElementById('eb-snapshot').hidden,
      }));
      check(/NOT TO SCALE/.test(banner.mode), 'the banner says not to scale in schematic mode', banner.mode);
      check(/0 CONFIRMED/.test(banner.mappings), 'the banner states zero confirmed mappings', banner.mappings);
      check(!banner.snapshotHidden && /REFERENCE SNAPSHOT/.test(banner.snapshot),
        'the banner names the active reference snapshot', banner.snapshot);
      check(inSchematic.coords === coordsBefore,
        'entering schematic mode moves nothing in the 3D scene');
      check(inSchematic.areasDrawn === inSchematic.apiAreas,
        'the schematic draws every area the API served',
        `${inSchematic.areasDrawn} of ${inSchematic.apiAreas}`);
      check(inSchematic.apiNamedAreas <= inSchematic.apiAreas,
        'no more areas are named than exist',
        `${inSchematic.apiNamedAreas} of ${inSchematic.apiAreas}`);
      // Against NAMED areas, not all areas. An area with no name printed
      // inside it has nothing to draw, and asserting otherwise would pressure
      // the transcription into naming areas the drawing does not name there.
      check(inSchematic.labelsDrawn === inSchematic.apiNamedAreas,
        'every named area has its label rendered',
        `${inSchematic.labelsDrawn}`);
      check(inSchematic.viewControlsHidden && inSchematic.layerControlsHidden,
        'physical camera controls are hidden in schematic mode');

      // ── Equipment banks ──
      check(inSchematic.banksDrawn === inSchematic.apiBanks,
        'every equipment bank the API served is drawn',
        `${inSchematic.banksDrawn} of ${inSchematic.apiBanks}`);
      check(inSchematic.cellsDrawn === inSchematic.apiCells,
        'every bank cell is drawn',
        `${inSchematic.cellsDrawn} of ${inSchematic.apiCells}`);
      // Deterministic order, so a diff of what was drawn is meaningful.
      const sorted = [...inSchematic.bankIds].sort();
      check(JSON.stringify(inSchematic.bankIds) === JSON.stringify(sorted),
        'banks are drawn in deterministic id order');
      // A bank is a presentation grouping and its rectangle is a drawing
      // measurement of nothing. Both must say so.
      check(
        inSchematic.groupingClasses.every((c) => c === 'SCHEMATIC_PRESENTATION_GROUP'),
        'every bank is classified as a presentation group',
        inSchematic.groupingClasses.join(',')
      );
      check(
        inSchematic.dimensionClasses.every((c) => c === 'SCHEMATIC_DERIVED'),
        'every bank dimension is classified as schematic-derived',
        inSchematic.dimensionClasses.join(',')
      );
      check(
        inSchematic.labelClasses.every((c) => c === 'SCHEMATIC_OBSERVED_LABEL'),
        'every drawing label is classified as an observed label',
        inSchematic.labelClasses.join(',')
      );
      // Unrunnable, not passing, when no bank labels were transcribed: there
      // is nothing for the two renders to disagree about.
      if (inSchematic.labelClasses.length === 0) {
        skip('labels the two renders disagree on remain marked ambiguous', 'no cell or bank labels are transcribed in this deployment');
      } else check(inSchematic.ambiguous > 0,
        'labels the two renders disagree on remain marked ambiguous',
        `${inSchematic.ambiguous} ambiguous`);
      check(!/"width"|"height"|ims_device_id|IMS_CONNECTED/.test(inSchematic.rawDoc),
        'no bank carries a physical dimension field or an IMS identity');
      // The drawing puts some equipment outside every labelled region. Those
      // banks must still be drawn rather than dropped for having no home.
      const unhoused = await page.evaluate(() => {
        const banks = window.__schematic.getDoc().banks;
        const orphans = banks.filter((b) => !b.area_id);
        return {
          orphans: orphans.length,
          drawn: orphans.filter((b) => document.querySelector(`[data-bank-id="${b.id}"]`)).length,
        };
      });
      check(unhoused.orphans === unhoused.drawn,
        'a bank outside every named area is still drawn',
        `${unhoused.drawn} of ${unhoused.orphans}`);

      // ── Legend ──
      // The drawing defines six operational states. Publishing that vocabulary
      // is not publishing state: no cell carries a status, because the two
      // renders disagree about status and none was transcribed.
      // ── Per-cell values and the conflict between renders ──
      const cells = await page.evaluate(() => {
        const S = window.__schematic;
        const banks = S.getDoc().banks;
        return {
          drawn: S.countCellValues(),
          conflictsDrawn: S.countCellConflicts(),
          expectedValues: banks.reduce(
            (n, b) => n + (b.cell_values && b.cell_values[S.getActiveSnapshot()] ? b.columns * b.rows : 0),
            0
          ),
          expectedConflicts: banks.reduce((n, b) => n + (b.cell_conflicts || []).length, 0),
          // Values actually READ, as opposed to snapshot keys present. A key
          // whose entries are all null records that those cells could not be
          // read; counting it as transcribed hid a gap behind a green check.
          transcribedValues: banks.reduce((n, b) => n + Object.values(b.cell_values || {})
            .reduce((m, list) => m + (list || []).filter((v) => v !== null).length, 0), 0),
          texts: S.cellValueTexts(),
          badge: Boolean(document.getElementById('schematic-badge')),
          notice: document.getElementById('schematic-conflict').textContent,
        };
      });
      check(cells.drawn === cells.expectedValues,
        'every transcribed cell value is drawn for the active snapshot',
        `${cells.drawn} of ${cells.expectedValues}`);
      check(cells.conflictsDrawn === cells.expectedConflicts,
        'every disagreeing cell is marked as a conflict',
        `${cells.conflictsDrawn} of ${cells.expectedConflicts}`);
      // With no values transcribed there is nothing to disagree about. That is
      // a gap in the transcription, reported as a skip -- never as a pass, and
      // never as a failure of the code under test.
      if (cells.transcribedValues === 0) {
        skip('the sources genuinely disagree and that is recorded, not smoothed away',
          'no per-cell values are transcribed in this deployment');
      } else check(cells.expectedConflicts > 0,
        'the sources genuinely disagree and that is recorded, not smoothed away',
        `${cells.expectedConflicts} cells`);
      check(cells.badge, 'the not-to-scale notice is always present in schematic mode');
      check(/REFERENCE CONFLICT/.test(cells.notice),
        'the conflict notice names the conflict and the declared instant');

      // ── Provenance on selection ──
      // Every row is a claim about where something came from. The two link
      // rows exist to say UNMAPPED out loud: a drawing label names nothing in
      // the monitoring system, and the panel has to say so.
      const prov = await page.evaluate(() => {
        const S = window.__schematic;
        const bank = S.selectFirstBank();
        const bankText = S.getInspectorText();
        const area = S.selectFirstArea();
        const areaText = S.getInspectorText();
        return { bank, bankText, area, areaText };
      });
      check(Boolean(prov.bank) && /SCHEMATIC_OBSERVED/.test(prov.bankText),
        'selecting a bank states its evidence classification');
      check(/SCHEMATIC_PRESENTATION_GROUP/.test(prov.bankText),
        'selecting a bank states that its grouping is presentation only');
      check(/presentation only, not measured/.test(prov.bankText),
        'selecting a bank states that its dimensions are not measured');
      check(/Physical link\s*UNMAPPED/.test(prov.bankText),
        'a selected bank reports its physical link as unmapped');
      check(/IMS link\s*UNMAPPED/.test(prov.bankText),
        'a selected bank reports its IMS link as unmapped');
      check(!/LDI-\d/.test(prov.bankText), 'no selected schematic object names a monitored device');
      check(Boolean(prov.area) && /UNMAPPED/.test(prov.areaText),
        'selecting an area reports it as unmapped too');

      const legend = await page.evaluate(() => ({
        rows: window.__schematic.countLegendRows(),
        states: window.__schematic.legendStates(),
      }));
      check(legend.rows === 6, 'the legend draws all six states the reference defines', `${legend.rows}`);
      check(
        JSON.stringify(legend.states) ===
          JSON.stringify(['OFF', 'DOWN', 'IDLE', 'INITIAL_PM_STOP', 'RUN', 'UNDEFINED']),
        'the legend states match the reference vocabulary and its order',
        legend.states.join(',')
      );

      // The two renders disagree. Switching must show that difference rather
      // than smoothing it away, and must not disturb the areas they share.
      const other = await page.evaluate(() => {
        const S = window.__schematic;
        const ids = S.getDoc().snapshots.map((x) => x.id);
        return ids.find((id) => id !== S.getActiveSnapshot()) || null;
      });
      if (other) {
        await page.click(`#snapshot-controls button[data-snapshot="${other}"]`);
        await page.waitForTimeout(600);
        const swapped = await page.evaluate(() => {
          const S = window.__schematic;
          return {
            snapshot: S.getActiveSnapshot(),
            areas: S.countAreas(),
            dims: S.countDimensions(),
            coords: window.__twin.snapshotCoordinates(),
          };
        });
        check(swapped.snapshot === other && swapped.areas === inSchematic.areasDrawn,
          'switching snapshot changes what is drawn without changing the areas',
          `${swapped.dims} vs ${inSchematic.dims} dimension marks`);
        // The point of two snapshots: the disputed values actually differ.
        const swappedTexts = await page.evaluate(() => window.__schematic.cellValueTexts());
        if (cells.transcribedValues === 0) {
          skip("the other snapshot shows its own cell values, not the first one's",
            'no per-cell values are transcribed in this deployment');
        } else check(JSON.stringify(swappedTexts) !== JSON.stringify(cells.texts),
          "the other snapshot shows its own cell values, not the first one's");
        check(swappedTexts.length === cells.texts.length,
          'both snapshots transcribe the same cells',
          `${swappedTexts.length} vs ${cells.texts.length}`);
        check(swapped.coords === coordsBefore, 'switching snapshot never alters the 3D scene');

        // Annotations that only one render carries must appear only there.
        // The blank SCALE field is the reason this whole layer exists apart
        // from the measured model, so it is asserted rather than assumed.
        // Which render carries these is a property of the transcription, not
        // a constant: read it from the document, then assert the RULE -- an
        // annotation restricted to one snapshot is drawn on that snapshot and
        // on no other.
        const restricted = await page.evaluate(() => {
          const doc = window.__schematic.getDoc();
          const one = (doc.annotations || []).filter(
            (a) => Array.isArray(a.observed_in) && a.observed_in.length === 1
              && (a.kind === 'NORTH' || a.kind === 'TITLE_BLOCK')
          );
          return { kinds: one.map((a) => a.kind), owner: one.length ? one[0].observed_in[0] : null };
        });
        if (!restricted.owner) {
          skip('a render-specific annotation is drawn only on its own render',
            'no annotation in this transcription is restricted to one render');
          skip('the title block shows its scale field, which the source leaves blank',
            'no title block is transcribed in this deployment');
        } else {
          const readAnnos = () => page.evaluate(() => ({
            north: document.querySelectorAll('[data-anno="NORTH"]').length,
            title: document.querySelectorAll('[data-anno="TITLE_BLOCK"]').length,
            scaleField: document.querySelectorAll('[data-title-field="SCALE"]').length,
            snapshot: window.__schematic.getActiveSnapshot(),
          }));
          const here = await readAnnos();
          await page.evaluate((id) => window.__schematic.selectSnapshot(id), restricted.owner);
          await page.waitForTimeout(500);
          const onOwner = await readAnnos();
          const wantNorth = restricted.kinds.includes('NORTH') ? 1 : 0;
          const wantTitle = restricted.kinds.includes('TITLE_BLOCK') ? 1 : 0;
          check(
            onOwner.north === wantNorth && onOwner.title === wantTitle
              && (here.snapshot === restricted.owner
                || (here.north === 0 && here.title === 0)),
            'a render-specific annotation is drawn only on its own render',
            `owner=${restricted.owner} on-owner ${onOwner.north}/${onOwner.title}, `
            + `elsewhere ${here.north}/${here.title}`
          );
          if (!wantTitle) {
            skip('the title block shows its scale field, which the source leaves blank',
              'no title block is transcribed in this deployment');
          } else {
            check(onOwner.scaleField === 1,
              'the title block shows its scale field, which the source leaves blank');
          }
        }
      }

      // Readable at every viewport: labels on screen, nothing overflowing.
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(400);
        const legible = await page.evaluate(() => {
          const labels = [...document.querySelectorAll('[data-area-label]')];
          const offscreen = labels.filter((n) => {
            const r = n.getBoundingClientRect();
            return r.width === 0 || r.right < 0 || r.left > window.innerWidth ||
              r.bottom < 0 || r.top > window.innerHeight;
          });
          const hud = document.getElementById('hud').getBoundingClientRect();
          const behindHud = labels.filter((n) => {
            const r = n.getBoundingClientRect();
            return r.left < hud.right && r.right > hud.left && r.top < hud.bottom && r.bottom > hud.top;
          });
          return {
            total: labels.length,
            offscreen: offscreen.length,
            behindHud: behindHud.length,
            horizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
          };
        });
        check(legible.offscreen === 0, `${vp.name}: every area label is on screen`,
          `${legible.offscreen} of ${legible.total} off`);
        check(legible.behindHud === 0, `${vp.name}: no area label sits behind the panel`,
          `${legible.behindHud} covered`);
        check(!legible.horizontalScroll, `${vp.name}: the schematic never scrolls the page sideways`);
      }
      await page.setViewportSize(VIEWPORTS[1]);

      await page.click('#mode-controls button[data-mode="physical"]');
      await page.waitForTimeout(600);
      const back = await page.evaluate(() => ({
        mode: window.__schematic.getMode(),
        hidden: document.getElementById('schematic').hidden,
        controls: !document.getElementById('view-controls').hidden,
        coords: window.__twin.snapshotCoordinates(),
      }));
      check(back.mode === 'physical' && back.hidden && back.controls,
        'leaving schematic mode restores the physical controls');
      const backBanner = await page.evaluate(() => ({
        mode: document.getElementById('eb-mode').textContent,
        snapshotHidden: document.getElementById('eb-snapshot').hidden,
      }));
      check(/MEASURED/.test(backBanner.mode) && backBanner.snapshotHidden,
        'the banner returns to the measured claim outside schematic mode', backBanner.mode);
      check(back.coords === coordsBefore,
        'a full round trip through the schematic leaves every coordinate identical');
    }
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

  // ── Modes are chrome and camera, never evidence ──
  //
  // Five modes, one application. Three change which claim is on screen and two
  // change how much apparatus surrounds it. The load-bearing assertion is the
  // last one: a byte-level coordinate snapshot taken across every switch, so a
  // mode that quietly moved geometry would fail here rather than be discovered
  // in a screenshot months later.
  console.log('Modes:');
  {
    const modes = await page.evaluate(() => (window.__schematic ? window.__schematic.modes() : []));
    if (modes.length === 0) {
      skip('the application offers five modes', 'the mode system did not load');
    } else {
      check(modes.length === 5, 'the application offers five modes', modes.join(','));
      check(
        ['executive', 'physical', 'schematic', 'split', 'inspection'].every((m) => modes.includes(m)),
        'the five modes are executive, physical, schematic, side-by-side and inspection',
        modes.join(',')
      );

      const available = await page.evaluate(() => window.__schematic.availableModes());
      // A mode whose evidence is absent must be reported as unavailable, not
      // quietly missing and not silently broken when pressed.
      const needsDrawing = ['schematic', 'split'];
      const hasDrawing = await page.evaluate(
        () => Boolean(window.__schematic && typeof window.__schematic.getDoc === 'function')
      );
      check(
        needsDrawing.every((m) => available.includes(m) === hasDrawing),
        'modes that need the drawing are available exactly when the drawing is',
        `available=${available.join(',')} drawing=${hasDrawing}`
      );
      check(
        ['executive', 'physical', 'inspection'].every((m) => available.includes(m)),
        'the modes that need only the measured floor are always available',
        available.join(',')
      );

      const base = await page.evaluate(() => window.__twin.snapshotCoordinates());
      const seen = [];
      let moved = null;
      for (const mode of available) {
        await page.click(`#mode-controls button[data-mode="${mode}"]`);
        await page.waitForTimeout(600);
        const st = await page.evaluate(() => ({
          mode: window.__schematic.getMode(),
          bodyClasses: [...document.body.classList].filter((c) => c.startsWith('mode-')),
          banner: document.getElementById('eb-mode')?.textContent || '',
          panes: window.__schematic.paneRects(),
          coords: window.__twin.snapshotCoordinates(),
          pressed: [...document.querySelectorAll('#mode-controls button[data-mode]')]
            .filter((b) => b.getAttribute('aria-pressed') === 'true')
            .map((b) => b.dataset.mode),
        }));
        seen.push({ mode, st });
        if (st.coords !== base && moved === null) moved = mode;
      }

      check(moved === null,
        'no mode switch moves a measured coordinate',
        moved ? `coordinates changed entering ${moved}` : '');
      check(seen.every((e) => e.st.mode === e.mode),
        'every mode reports itself as active once entered');
      check(seen.every((e) => e.st.bodyClasses.length === 1 && e.st.bodyClasses[0] === `mode-${e.mode}`),
        'exactly one mode class is on the document at a time',
        seen.map((e) => e.st.bodyClasses.join('+')).join(' '));
      check(seen.every((e) => e.st.pressed.length === 1 && e.st.pressed[0] === e.mode),
        'exactly one mode control reports itself pressed');
      check(seen.every((e) => e.st.banner.length > 0),
        'every mode states which claim is on screen');

      const split = seen.find((e) => e.mode === 'split');
      if (!split) {
        skip('side-by-side puts the two claims in two panes, not one on top of the other',
          NO_SCHEMATIC);
        skip('side-by-side refuses to label itself with either single claim', NO_SCHEMATIC);
      } else {
        const { scene, schematic } = split.st.panes;
        // Abutting, not overlapping. Overlaying them would assert a
        // registration between two systems that share no reference frame.
        check(
          scene && schematic && scene.w > 0 && schematic.w > 0
            && scene.x + scene.w <= schematic.x + 2,
          'side-by-side puts the two claims in two panes, not one on top of the other',
          JSON.stringify(split.st.panes)
        );
        check(/UNREGISTERED/.test(split.st.banner),
          'side-by-side refuses to label itself with either single claim',
          split.st.banner);
      }

      // Leave the page in the mode the rest of the suite expects.
      await page.click('#mode-controls button[data-mode="physical"]');
      await page.waitForTimeout(400);
    }
    console.log('');
  }

  // ── Visibility is presentation only ──
  console.log('Layer visibility:');
  for (const layer of LAYERS) {
    await page.uncheck(`#layer-controls input[data-layer="${layer}"]`);
  }
  await page.waitForTimeout(500);
  const hidden = await snapshot(page);
  check(LAYERS.every((l) => hidden.visibility[l] === false), 'every toggled layer reported hidden',
    LAYERS.filter((l) => hidden.visibility[l] !== false).join(','));
  check(hidden.meshes === baseline.meshes, 'hiding does not delete meshes', `${hidden.meshes} vs ${baseline.meshes}`);
  check(hidden.machineMeshes === baseline.machineMeshes, 'hiding does not change machine count');
  check(JSON.stringify(hidden.api) === JSON.stringify(baseline.api), 'hiding does not change API results');

  // Restore each toggle to the state it started in, not blanket-on: the
  // presentation layer starts off by design, and checking it would be a
  // different scene rather than the baseline.
  for (const layer of LAYERS) {
    const sel = `#layer-controls input[data-layer="${layer}"]`;
    if (baseline.visibility[layer]) await page.check(sel);
    else await page.uncheck(sel);
  }
  await page.waitForTimeout(500);
  const restored = await snapshot(page);
  check(JSON.stringify(restored) === JSON.stringify(baseline), 'restoring reproduces the baseline snapshot');

  await browser.close();

  console.log(`\n${failures === 0 ? `FACTORY TWIN REGRESSION PASSED${DIRECT_URL ? ' (DIRECT MODE - access control NOT verified)' : ''}` : `FACTORY TWIN REGRESSION FAILED (${failures})`}`);
  if (skipped > 0) {
    console.log(`${skipped} check(s) SKIPPED and NOT counted as passing -- see the reasons above.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
