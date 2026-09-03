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
// Exactly the layers the panel offers, and the panel offers exactly the layers
// that hold something. The telemetry layer is gone: it was always empty,
// because no monitored device has an established position on this floor.
const LAYERS = ['shell', 'columns', 'walls', 'functional', 'equipment'];

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
      equipmentMeshes: Array.isArray(T.equipmentMeshes) ? T.equipmentMeshes.length : 0,
      // The invented-machine-form layer is DELETED. Read defensively and
      // assert it stays absent: a number here would mean drawn volumes nobody
      // measured had come back on a floor read from CAD.
      hasPresentationRegistry: T.presentationMeshes !== undefined
        || T.sublayers.presentation !== undefined,
      equipmentCensus: T.equipmentCensus ? T.equipmentCensus() : null,
      // Rotation actually applied to the drawn pads, so the reconciliation can
      // compare the SCENE against the API rather than the API against itself.
      equipmentRotations: (Array.isArray(T.equipmentMeshes) ? T.equipmentMeshes : []).map(
        (m) => ({ id: m.userData.equipment.id, y: m.rotation.y })
      ),
      // The DRAWN box: its world placement and its extruded size. This is what
      // makes "2D and 3D are the same geometry" an assertion rather than a
      // claim -- there is one mesh, and both views look at it.
      equipmentBoxes: (Array.isArray(T.equipmentMeshes) ? T.equipmentMeshes : []).map((m) => ({
        id: m.userData.equipment.id,
        x: m.position.x,
        y: m.position.y,
        z: m.position.z,
        w: m.geometry.parameters.width,
        h: m.geometry.parameters.height,
        d: m.geometry.parameters.depth,
        tier: m.userData.equipment.footprint_status,
      })),
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
      // There is no machine-mesh registry any more. Read defensively and
      // assert it stays absent: a number here would mean the synthetic
      // placement path had been reinstated.
      machineMeshes: Array.isArray(T.machineMeshes) ? T.machineMeshes.length : 0,
      hasMachineRegistry: T.machineMeshes !== undefined,
      api: {
        columns: geo.columns.length,
        walls: Array.isArray(geo.walls) ? geo.walls.length : 0,
        openings: Array.isArray(geo.openings) ? geo.openings.length : 0,
        // slots[] is not served at all any more. Read it defensively and
        // assert it stays absent -- its presence would mean the raster layer
        // was back on the wire.
        slotsServed: 'slots' in geo,
        equipment: Array.isArray(geo.equipment) ? geo.equipment.length : 0,
        equipmentResolved: (geo.equipment || []).filter(
          (e) => e.footprint_status === 'OBSERVED_CAD' && e.footprint
        ).length,
        equipmentApproximated: (geo.equipment || []).filter(
          (e) => e.footprint_status === 'APPROXIMATION' && e.footprint
        ).length,
        // An approximation must declare its provenance. Without it a bound is
        // indistinguishable from a measurement on the wire.
        equipmentApproxWithoutSource: (geo.equipment || []).filter(
          (e) => e.footprint_status === 'APPROXIMATION' && e.footprint_source !== 'CAD_CORRELATED'
        ).length,
        equipmentPositions: (geo.equipment || []).map(
          (e) => ({ id: e.id, x: e.position.x, z: e.position.z, deg: e.rotation_deg })
        ),
        equipmentUnresolved: (geo.equipment || []).filter(
          (e) => e.footprint_status === 'UNRESOLVED'
        ).length,
        // The canonical frame's own declaration, on the wire. Not served, so
        // read from the geometry the client got: a model whose z ordering
        // disagrees with the CAD would place every machine on the wrong side.
        equipmentZRange: (geo.equipment || []).reduce((r, e) => ({
          min: Math.min(r.min, e.position.z), max: Math.max(r.max, e.position.z),
        }), { min: Infinity, max: -Infinity }),
        equipmentWithFootprintButUnresolved: (geo.equipment || []).filter(
          (e) => e.footprint_status === 'UNRESOLVED' && e.footprint
        ).length,
        equipmentNonCadPosition: (geo.equipment || []).filter(
          (e) => e.geometry_status !== 'MEASURED_CAD'
        ).length,
        equipmentMapped: (geo.equipment || []).filter((e) => e.ims_device_id).length,
        equipmentRotationsServed: (geo.equipment || []).map(
          (e) => ({ id: e.id, deg: e.rotation_deg })
        ),
        zones: geo.functional_zones.length,
        zonesTotal: geo.functional_zones_meta ? geo.functional_zones_meta.total : null,
        conflictServed: geo.functional_zones.some((z) => ['zone-28', 'zone-31'].includes(z.id)),
        zoneNames: geo.functional_zones.map((z) => z.name).filter((n) => n !== null && n !== undefined),
        zonesNamedCount: geo.functional_zones.filter((z) => z.name).length,
        envelopeHeight: geo.envelope ? geo.envelope.height : null,
        footprintVertices: geo.footprint_polygon ? geo.footprint_polygon.vertices.length : 0,
        gridLines: geo.grid ? geo.grid.x.length + geo.grid.z.length : 0,
        clearHeight: geo.envelope ? geo.envelope.clear_height_m : null,
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

    // The synthetic placement route is deleted, so it must 404 like any other
    // path that does not exist. Asserted rather than assumed: a route that
    // still answered would mean invented positions were still being served,
    // whether or not this client drew them.
    for (const probe of ['server.js', 'lib/wire.js', 'package.json', '.env', 'app.js.map', 'api/debug', 'api/placement']) {
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
    const syntheticPlate = 0; // the synthetic floor plate is deleted
    // Plus the CAD building fabric: one instanced mesh for every wall, and one
    // per opening kind. These are added as objects, not per wall, which is the
    // whole point of instancing them -- ~900 walls must not cost ~900 meshes.
    const expectedStructural = s.api.columns
      + (measuredPlate ? s.footprintMeshes : syntheticPlate)
      + s.wallMeshes + s.openingMeshes;
    // One pad per CAD equipment record and nothing else. No monitored device,
    // no invented machine form, no raster slot.
    const expectedOperational = s.api.equipment;
    check(s.perLayer.structural === expectedStructural,
      'structural meshes = columns + floor plate + traced outline',
      `${s.perLayer.structural} vs ${expectedStructural}`);
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
    check(s.perSublayer.equipment === s.api.equipment,
      'equipment sub-layer holds exactly the served CAD assets',
      `${s.perSublayer.equipment} vs ${s.api.equipment}`);
    check(s.perLayer.operational === expectedOperational,
      'operational meshes = CAD equipment, and nothing else',
      `${s.perLayer.operational} vs ${expectedOperational}`);
    check(s.meshes === expectedStructural + s.api.zones + expectedOperational, 'total mesh count reconciles',
      `${s.meshes}`);

    check(s.badTransforms === 0, 'no NaN/Infinity transforms', `${s.badTransforms} bad`);
    // The synthetic placement path is DELETED, not disabled. These two assert
    // that: no machine mesh exists, and the registry that held them is gone.
    // A non-zero count here would mean invented positions were being drawn on
    // a floor read from CAD, which is the failure this whole change prevents.
    check(s.machineMeshes === 0, 'no monitored device is drawn on the floor',
      `${s.machineMeshes} machine mesh(es)`);
    check(s.hasMachineRegistry === false, 'the machine-mesh registry is gone, not merely empty');
    // The raster layer, deleted at three levels: the API no longer serves it,
    // the renderer no longer has a group for it, and the invented machine
    // forms that were drawn on top of it are gone with it. Each is asserted
    // separately, because any one of them coming back alone is a regression.
    check(s.api.slotsServed === false,
      'the raster slot layer is not served by the API at all');
    check(s.hasPresentationRegistry === false,
      'the invented machine-form layer is deleted, not merely hidden');
    check(s.equipmentMeshes === s.api.equipment,
      'every served CAD asset is drawn exactly once',
      `${s.equipmentMeshes} drawn vs ${s.api.equipment} served`);
    // The core evidence rule of this layer, checked on the wire rather than in
    // the extractor: an unresolved extent must be ABSENT, never a default box.
    check(s.api.equipmentWithFootprintButUnresolved === 0,
      'no UNRESOLVED extent carries a footprint anyway',
      `${s.api.equipmentWithFootprintButUnresolved} record(s)`);
    check(s.api.equipmentNonCadPosition === 0,
      'every equipment position claims MEASURED_CAD provenance',
      `${s.api.equipmentNonCadPosition} record(s) do not`);
    check(s.api.equipment === 0 || s.api.equipmentUnresolved > 0,
      'the model still reports unresolved extents rather than filling them all in',
      `${s.api.equipmentResolved} measured, ${s.api.equipmentApproximated} approximated, `
      + `${s.api.equipmentUnresolved} UNRESOLVED`);
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

    // -- Command-centre surface: chrome docks, the floor is never covered --
    //
    // The previous chrome was an opaque panel floating over the canvas. At
    // 1366x768 it covered roughly a third of the floor plan, and the camera fit
    // had to be computed around it. The rule now is stronger and testable: the
    // only element allowed to overlap the scene is the context panel, and only
    // once something is selected.
    // Reachability is measured in two passes with a real click between them,
    // because the drawer opens through a CSS grid transition: toggling the
    // class and measuring in the same frame reads every drawer control as zero
    // wide, which is the transition, not a layout fault.
    const REACH_FN = `(list) => {
      const bad = [];
      for (const sel of list) {
        const el = document.querySelector(sel);
        if (!el) { bad.push(sel + ' (missing)'); continue; }
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        const offscreen = r.width === 0 || r.height === 0
          || r.bottom > window.innerHeight + 1 || r.right > window.innerWidth + 1
          || r.top < -1 || r.left < -1;
        if (offscreen) {
          bad.push(sel + ' (' + Math.round(r.left) + ',' + Math.round(r.top) + ' '
            + Math.round(r.width) + 'x' + Math.round(r.height) + ')');
        }
      }
      return bad;
    }`;

    const headerUnreachable = await page.evaluate(`(${REACH_FN})([
      '#topbar', '#status-strip',
      '#view-controls button[data-view="plan"]',
      '#view-controls button[data-view="overview"]',
      '#view-controls button[data-view="building"]',
      '#view-reset', '#drawer-toggle', '#build-id', '#data-quality'
    ])`);

    // Drive the drawer to a KNOWN state rather than assuming one. The viewport
    // loop reuses a single page, so a previous iteration that ended with the
    // drawer open turns this section's "open it" click into a "close it" click
    // -- which is how a working drawer got reported as a zero-width column at
    // whichever viewport happened to run second.
    const setDrawer = async (want) => {
      for (let i = 0; i < 3; i++) {
        const open = await page.evaluate(
          () => document.getElementById('drawer-toggle').getAttribute('aria-expanded') === 'true'
        );
        if (open === want) return;
        await page.click('#drawer-toggle');
        await page.waitForTimeout(250);
      }
    };
    await setDrawer(false);

    const stageClosed = await page.evaluate(
      () => document.getElementById('stage').getBoundingClientRect().width
    );

    await setDrawer(true);
    // Wait for the grid transition to finish rather than for a fixed delay. At
    // 3840x2160 the relayout takes longer than it does at 1366x768, and a
    // timeout tuned on the small viewport measured a drawer that was still
    // zero pixels wide -- a test-timing artefact reported as a layout fault.
    await page.waitForFunction(
      () => document.getElementById('drawer').getBoundingClientRect().width > 1,
      null,
      { timeout: 10000 },
    );
    await page.waitForTimeout(150);
    const drawerUnreachable = await page.evaluate(`(() => {
      const legend = document.getElementById('evidence-legend');
      const diag = document.getElementById('diagnostics');
      const unmapped = document.getElementById('unmapped-devices');
      const prior = [legend.open, diag.open, unmapped.open];
      legend.open = true; diag.open = true; unmapped.open = true;
      const bad = (${REACH_FN})([
        '#factory-status',
        '#layer-controls input[data-layer="shell"]',
        '#layer-controls input[data-layer="equipment"]',
        '#status-legend-body', '#evidence-summary',
        '#evidence-legend > summary', '#unmapped-devices > summary',
        '#diagnostics > summary'
      ]);
      legend.open = prior[0]; diag.open = prior[1]; unmapped.open = prior[2];
      return bad;
    })()`);
    const docked = await page.evaluate(() => {
      const stage = document.getElementById('stage').getBoundingClientRect();
      const drawer = document.getElementById('drawer').getBoundingClientRect();
      return {
        stageWidth: stage.width,
        overlaps: drawer.left < stage.right - 1 && drawer.right > stage.left + 1
          && drawer.top < stage.bottom - 1 && drawer.bottom > stage.top + 1,
        viewportWidth: window.innerWidth,
      };
    });
    await setDrawer(false);

    const surface = await page.evaluate(() => {
      // Nothing but the context panel may sit over the scene, and it starts
      // hidden. Measured by hit-testing the middle of the canvas.
      const scene = document.getElementById('scene').getBoundingClientRect();
      const atCentre = document.elementFromPoint(
        Math.round(scene.left + scene.width / 2),
        Math.round(scene.top + scene.height / 2)
      );
      const canvas = document.querySelector('canvas');
      return {
        inspectorHidden: document.getElementById('inspector').hidden,
        centreIsCanvas: Boolean(atCentre && atCentre.tagName === 'CANVAS'),
        horizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
        canvasLabelled: Boolean(canvas && canvas.getAttribute('aria-label')),
        // The chrome the rebuild removed. Any of these coming back means the
        // floating-HUD treatment has returned.
        legacyChrome: ['#hud', '#simulated-banner', '#mode-controls', '#schematic-panel',
          '#schematic', '.split-caption']
          .filter((sel) => document.querySelector(sel) !== null),
        legendRows: [...document.querySelectorAll('#evidence-legend dt')].map((dt) => ({
          text: dt.textContent.trim(),
          glyph: Boolean(dt.querySelector('.ev[aria-hidden="true"]')),
        })),
      };
    });
    surface.unreachable = headerUnreachable;
    surface.drawerUnreachable = drawerUnreachable;
    // Below 900 CSS pixels the drawer deliberately overlays instead of docking:
    // a 340 px track on a 600 px viewport would leave the floor unreadable, so
    // the narrow layout trades docking for a usable plan. The invariant that
    // holds at every width is the one asserted -- the floor pane never grows to
    // make room, and the drawer is dismissible.
    surface.overlapsStage = docked.viewportWidth > 900 ? docked.overlaps : false;
    surface.stageNeverGrew = docked.stageWidth <= stageClosed + 1;

    check(surface.unreachable.length === 0, 'every header control is reachable',
      surface.unreachable.join(' | '));
    check(surface.drawerUnreachable.length === 0,
      'every inspection-drawer control is reachable with the drawer open',
      surface.drawerUnreachable.join(' | '));
    check(!surface.overlapsStage,
      'the inspection drawer docks beside the floor rather than over it');
    check(surface.stageNeverGrew,
      'opening the drawer never widens the floor pane');
    check(surface.inspectorHidden,
      'the context panel stays hidden until something is selected');
    check(surface.centreIsCanvas,
      'the centre of the floor plan is the floor plan, not a panel');
    check(surface.legacyChrome.length === 0,
      'the floating HUD, banner, mode board and split panes are gone',
      surface.legacyChrome.join(' '));
    check(!surface.horizontalScroll, 'the page never scrolls horizontally');
    check(surface.canvasLabelled, 'the 3D canvas carries an accessible name');
    check(
      surface.legendRows.length === 6 && surface.legendRows.every((r) => r.glyph && /[A-Z]{6,}/.test(r.text)),
      'every evidence state is named in words and carries a non-colour glyph',
      `${surface.legendRows.length} rows`
    );

    // -- Status strip: exactly the eight plant states ---------------------
    //
    // The vocabulary is the point. An operator reading this board and an
    // operator reading the line's own HMI must see the same word for the same
    // machine, so the eight are asserted by name and in order, and the
    // monitoring dialect the twin used to invent is asserted absent.
    const strip = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#status-strip .ss-cell')];
      return {
        states: cells.filter((c) => !c.classList.contains('ss-quality'))
          .map((c) => c.dataset.state),
        labels: cells.map((c) => c.querySelector('.ss-label').textContent.trim()),
        values: cells.map((c) => c.querySelector('.ss-value').textContent.trim()),
        unbacked: cells.filter((c) => c.classList.contains('ss-off'))
          .map((c) => c.dataset.state),
        glyphsHidden: cells.every(
          (c) => c.querySelector('.ss-glyph').getAttribute('aria-hidden') === 'true'
        ),
        distinctGlyphs: new Set(
          cells.map((c) => c.querySelector('.ss-glyph').textContent)
        ).size,
        cellCount: cells.length,
        qualityCells: cells.filter((c) => c.classList.contains('ss-quality'))
          .map((c) => c.dataset.state),
        text: document.getElementById('status-strip').textContent,
        legendStates: [...document.querySelectorAll('#status-legend-body dt')]
          .map((dt) => dt.textContent.trim()),
      };
    });
    const REQUIRED_STATES = ['OFF', 'DOWN', 'IDLE', 'INITIAL', 'PM', 'STOP', 'RUN', 'UNDEFINED'];
    check(JSON.stringify(strip.states) === JSON.stringify(REQUIRED_STATES),
      'the status strip carries exactly the eight plant states, in order',
      strip.states.join(','));
    check(JSON.stringify(strip.qualityCells) === JSON.stringify(['UNMAPPED']),
      'unmapped is shown as a data-quality indicator, not as a ninth state',
      strip.qualityCells.join(','));
    check(!/NORMAL|WARNING|CRITICAL|OFFLINE|STALE|MAINTENANCE|PRESENTATION/i.test(strip.text),
      'no invented monitoring state appears on the board', strip.text.replace(/\s+/g, ' ').slice(0, 90));
    check(JSON.stringify(strip.unbacked) === JSON.stringify(['OFF', 'INITIAL', 'PM', 'STOP']),
      'exactly the four states with no source column are marked as such',
      strip.unbacked.join(','));
    // A state this deployment cannot derive shows a dash, never a zero. A zero
    // is a measurement; a dash is the absence of one.
    check(strip.states.every((st, i) => (
      ['OFF', 'INITIAL', 'PM', 'STOP'].includes(st) ? strip.values[i] === '–' : /^\d+$/.test(strip.values[i])
    )), 'an underivable state reports a dash, a derivable one reports a count',
    strip.values.join(','));
    check(strip.distinctGlyphs === strip.cellCount,
      'every state is distinguishable without colour', `${strip.distinctGlyphs} glyphs for ${strip.cellCount} cells`);
    check(strip.glyphsHidden, 'status glyphs are decorative to a screen reader; the label carries the meaning');
    check(strip.legendStates.length === 9,
      'the drawer legend explains all eight states plus the data-quality indicator',
      `${strip.legendStates.length} rows`);

    // -- Equipment reconciliation: the scene against the served model -----
    //
    // The complaint was that machines were the wrong size and on the wrong
    // side. Both were invisible from inside the model, so this compares what
    // the renderer actually drew against what the API served, per record.
    if (s.api.equipment === 0) {
      skip('every drawn asset carries the rotation the CAD stated', NO_GEOMETRY);
      skip('no drawn asset invents an extent', NO_GEOMETRY);
      skip('the 3D box is the 2D footprint extruded, at the same coordinates', NO_GEOMETRY);
    } else {
      const served = new Map(s.api.equipmentPositions.map((e) => [e.id, e]));

      // ROTATION. The canonical frame reflects z, and a reflection flips the
      // sense of a plan rotation, so the renderer applies the CAD angle about
      // +Y with sign +1. Under the previous mirrored frame the sign was -1;
      // getting the position right and the sign wrong puts every machine in
      // the correct place facing the wrong way, which no coordinate check
      // catches. This one does.
      let rotMismatch = 0;
      let worstRot = 0;
      for (const drawn of s.equipmentRotations) {
        const e = served.get(drawn.id);
        if (!e || e.deg == null) { rotMismatch++; continue; }
        const expected = e.deg * Math.PI / 180;
        const d = Math.abs((drawn.y - expected) % (Math.PI * 2));
        const wrapped = Math.min(d, Math.PI * 2 - d);
        worstRot = Math.max(worstRot, wrapped);
        if (wrapped > 1e-9) rotMismatch++;
      }
      check(rotMismatch === 0, 'every drawn asset carries the rotation the CAD stated',
        `${rotMismatch} mismatched, worst ${(worstRot * 180 / Math.PI).toFixed(6)} deg`);

      // 2D -> 3D. There is exactly ONE mesh per asset and both views look at
      // it, so this measures that the mesh sits where the API said and is the
      // size the API said. A second, independently positioned 3D object is
      // precisely what this forbids.
      let worstPos = 0;
      let worstSize = 0;
      let offFloor = 0;
      let invented = 0;
      let sizedBoxes = 0;
      let markerBoxes = 0;
      const heights = new Set();
      for (const box of s.equipmentBoxes) {
        const e = served.get(box.id);
        if (!e) { invented++; continue; }
        worstPos = Math.max(worstPos, Math.abs(box.x - e.x), Math.abs(box.z - e.z));
        // Every block stands ON the floor: centre height is half its own
        // height, not an arbitrary elevation.
        if (Math.abs(box.y - box.h / 2) > 1e-9) offFloor++;
        if (box.tier === 'OBSERVED_CAD' || box.tier === 'APPROXIMATION') {
          sizedBoxes++;
          heights.add(box.h);
        } else {
          markerBoxes++;
          // A marker must not carry a shape. A non-square one would mean a
          // dimension had been supplied from somewhere.
          if (box.w !== box.d) invented++;
        }
      }
      check(invented === 0, 'no drawn asset invents an extent',
        `${invented} asset(s) drawn with a shape they do not have`);
      check(worstPos < 1e-9,
        'the 3D box is the 2D footprint extruded, at the same coordinates',
        `worst position delta ${worstPos} m across ${s.equipmentBoxes.length} boxes`);
      check(offFloor === 0, 'every equipment block stands on the floor plane',
        `${offFloor} floating`);
      // Height is PRESENTATION_ONLY, so it must be IDENTICAL everywhere. A
      // varying height would read as data, and there is no elevation data.
      check(heights.size <= 1,
        'every sized block shares one presentation height, because height is not evidence',
        `${heights.size} distinct height(s) across ${sizedBoxes} block(s)`);
      check(sizedBoxes === s.api.equipmentResolved + s.api.equipmentApproximated,
        'exactly the assets with an extent are drawn with one',
        `${sizedBoxes} vs ${s.api.equipmentResolved + s.api.equipmentApproximated}`);
      check(markerBoxes === s.api.equipmentUnresolved,
        'exactly the assets without an extent are drawn as markers',
        `${markerBoxes} vs ${s.api.equipmentUnresolved}`);

      const scale = await page.evaluate(() => {
        const T = window.__twin;
        let worst = 0;
        for (const m of T.equipmentMeshes) {
          const e = m.userData.equipment;
          if (!e.footprint) continue;
          const box = m.geometry.parameters;
          worst = Math.max(worst,
            Math.abs(box.width - e.footprint.width),
            Math.abs(box.depth - e.footprint.depth));
        }
        return { worst };
      });
      check(scale.worst < 1e-9,
        'every asset with an extent is drawn at exactly that extent',
        `worst ${scale.worst} m`);
      check(s.api.equipmentApproxWithoutSource === 0,
        'every approximated extent declares CAD_CORRELATED provenance',
        `${s.api.equipmentApproxWithoutSource} without it`);
    }

    // -- The invented machine-form layer is gone ---------------------------
    //
    // It drew a body for every machine on the floor, chosen from a table of
    // shapes nobody measured, standing at a raster-derived position. Its
    // absence is asserted rather than assumed: this was a whole rendering
    // path, and a rendering path can come back.
    const gone = await page.evaluate(() => {
      const T = window.__twin;
      let presentationTagged = 0;
      T.scene.traverse((o) => {
        if (o.userData && o.userData.presentation) presentationTagged++;
      });
      return {
        presentationTagged,
        sublayerNames: Object.keys(T.sublayers),
        api: ['presentationMeshes', 'presentationSpec', 'presentationCensus', 'presentationFormOf',
          'slotMeshes']
          .filter((k) => T[k] !== undefined),
      };
    });
    check(gone.presentationTagged === 0,
      'no object in the scene is tagged as a presentation form',
      `${gone.presentationTagged}`);
    check(!gone.sublayerNames.includes('presentation') && !gone.sublayerNames.includes('slots'),
      'neither the presentation nor the raster slot sub-layer exists',
      gone.sublayerNames.join(','));
    check(gone.api.length === 0,
      'the presentation and slot test hooks are deleted with their layers',
      gone.api.join(','));

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
        slotsAllUnmapped: (geo.equipment || []).every((e) => e.status === 'UNMAPPED' && e.ims_device_id === null),
        slotsNoMesId: (geo.equipment || []).every((e) => e.mes_machine_id === undefined || e.mes_machine_id === null),
        heightsUnknown: (geo.equipment || []).every((e) => e.height_status === 'unknown'),
        clearHeightNull: geo.envelope ? geo.envelope.clear_height_m === null : null,
        // Equipment is deliberately EXCLUDED from this one. A low-confidence
        // asset here is a record whose extent the CAD did not establish, and
        // reporting that honestly is the point -- it is not a defect to fix by
        // dropping the record.
        noLowConfidenceGeometry: geo.columns.every((c) => c.confidence !== 'low'),
        servedZoneTiers: [...new Set(geo.functional_zones.map((z) => z.confidence))],
        confirmedMappings: diag ? diag.evidence.confirmed_mappings : null,
        simulatedPositions: diag ? diag.evidence.simulated_machine_positions : null,
      };
    });
    // These hold whether or not geometry is deployed: an empty set trivially
    // satisfies them, and that is the correct answer when nothing was served.
    check(ev.slotsAllUnmapped, 'every CAD asset remains UNMAPPED with a null device id');
    check(ev.slotsNoMesId, 'no CAD asset carries a MES machine id');
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
    check(ev.simulatedPositions === 0, 'diagnostics reports zero simulated positions',
      `${ev.simulatedPositions}`);
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
      'overview frames every equipment position',
      'reset restores framing without changing which view is active',
      'switching views never changes API results',
      'no rendered coordinate changes across three view switches and a reset',
    ]) {
      skip(label, NO_GEOMETRY);
    }
    console.log('');
  } else {
    const before = await snapshot(page);

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
        // The CAD equipment is everything operational on the floor now: no
        // monitored device is drawn, and no raster slot exists.
        slotsFramed: T.equipmentMeshes.filter(framed).length,
        slotTotal: T.equipmentMeshes.length,
      };
    });
    check(inOverview.view === 'overview', 'overview preset activates');
    check(inOverview.structVisible === inOverview.structTotal, 'overview frames the whole structure',
      `${inOverview.structVisible}/${inOverview.structTotal}`);
    check(inOverview.slotsFramed === inOverview.slotTotal, 'overview frames every equipment position',
      `${inOverview.slotsFramed}/${inOverview.slotTotal}`);

    // Reset re-applies the ACTIVE view's framing rather than forcing operator.
    await page.evaluate(() => window.__twin.controls.target.set(999, 999, 999));
    await page.click('#view-reset');
    await page.waitForTimeout(400);
    check(await page.evaluate(() => window.__twin.getView()) === 'overview',
      'reset restores framing without changing which view is active');

    // Back to the primary view. 2D plan is the default and the one the rest of
    // the suite expects, and returning to it is itself the third switch this
    // coordinate check spans.
    await page.click('#view-controls button[data-view="plan"]');
    await page.waitForTimeout(600);
    const restored = await snapshot(page);
    check(JSON.stringify(restored.api) === JSON.stringify(before.api), 'switching views never changes API results');
    // Byte-level, across every evidence-backed mesh in the scene: a view is a
    // camera change and nothing else.
    check(restored.coords === before.coords,
      'no rendered coordinate changes across three view switches and a reset');
    console.log('');
  }

  // -- The raster schematic no longer renders in the canonical view -------
  //
  // It used to be a second mode of this page, with its own pane, its own
  // captions and a side-by-side layout. The canonical Factory Twin is the CAD
  // floor now, and mixing a not-to-scale drawing into the same page is how
  // raster geometry leaked into the physical view in the first place. The
  // transcription itself is NOT deleted -- /api/floor-schematic still serves
  // it, and its wire guarantees are still asserted above -- but nothing on
  // this page draws it.
  console.log('Raster schematic retired from the canonical view:');
  {
    const r = await page.evaluate(() => ({
      renderer: typeof window.__schematic,
      dom: ['#schematic', '#schematic-panel', '#schematic-badge', '#schematic-inspector',
        '#schematic-conflict', '#schematic-options', '#snapshot-controls', '.split-caption']
        .filter((sel) => document.querySelector(sel) !== null),
      scripts: [...document.querySelectorAll('script[src]')]
        .map((el) => el.getAttribute('src'))
        .filter((src) => /schematic|machine-forms/.test(src)),
      modeApi: typeof (window.__twin && window.__twin.setMode),
      views: [...document.querySelectorAll('#view-controls button[data-view]')]
        .map((btn) => btn.dataset.view),
    }));
    check(r.renderer === 'undefined',
      'the schematic renderer is not loaded by the canonical page', r.renderer);
    check(r.dom.length === 0,
      'no schematic pane, badge or caption exists in the canonical page', r.dom.join(' '));
    check(r.scripts.length === 0,
      'neither the schematic nor the machine-form module is fetched', r.scripts.join(' '));
    check(r.modeApi === 'undefined',
      'the mode board that switched between physical and schematic is gone');
    // 2D first, 3D second: physical accuracy is what this view is for right
    // now, so the plan is the primary view and it is listed first.
    check(JSON.stringify(r.views) === JSON.stringify(['plan', 'overview', 'building']),
      'the view controls are the 2D plan, the 3D overview and fit-to-floor, in that order',
      r.views.join(','));
    console.log('');
  }

  // ── Diagnostics ──
  console.log('Diagnostics:');
  {
    const openByDefault = await page.locator('#diagnostics').evaluate((e) => e.open);
    check(openByDefault === false, 'diagnostics stays collapsed for the default view');
    // Diagnostics lives in the inspection drawer, which is closed by default:
    // the default view is the floor plan, not a wall of counters. Open the
    // drawer first -- clicking a control inside a closed drawer is not a thing
    // an operator can do either.
    const drawerWasOpen = await page.evaluate(
      () => document.getElementById('app').classList.contains('drawer-open')
    );
    if (!drawerWasOpen) {
      await page.click('#drawer-toggle');
      await page.waitForTimeout(450);
    }
    check(await page.locator('#diagnostics > summary').isVisible(),
      'diagnostics is reachable once the inspection drawer is open');
    await page.click('#diagnostics > summary');
    await page.waitForTimeout(1200);
    const text = await page.locator('#diagnostics-body').innerText();
    check(text.includes('Confirmed mappings'), 'diagnostics reports confirmed mappings');
    check(text.includes('Observed columns') && text.includes('Simulated machine positions'),
      'diagnostics keeps evidence categories separate');
    check(!/PHYS-F1-|EQP-F1-|LDI-\d/.test(text), 'diagnostics leaks no object identifiers');
    check(text.includes('Equipment') || text.includes('equipment'),
      'diagnostics reports the CAD equipment layer');
    await page.click('#diagnostics > summary');
    if (!drawerWasOpen) {
      await page.click('#drawer-toggle');
      await page.waitForTimeout(450);
    }
    console.log('');
  }

  // -- The inspection drawer is chrome, never evidence --------------------
  //
  // The five-mode board is gone with the schematic it existed to switch to.
  // What remains that changes the page's shape is the drawer, and it carries
  // the same load-bearing guarantee the modes did: a byte-level coordinate
  // snapshot across opening and closing it, so chrome that quietly moved
  // geometry would fail here rather than be discovered in a screenshot months
  // later.
  console.log('Inspection drawer:');
  {
    const base = await page.evaluate(() => window.__twin.snapshotCoordinates());
    const closedStage = await page.evaluate(
      () => document.getElementById('stage').getBoundingClientRect().width
    );

    await page.click('#drawer-toggle');
    await page.waitForTimeout(500);
    const open = await page.evaluate(() => ({
      coords: window.__twin.snapshotCoordinates(),
      expanded: document.getElementById('drawer-toggle').getAttribute('aria-expanded'),
      stage: document.getElementById('stage').getBoundingClientRect().width,
      drawerVisible: document.getElementById('drawer').getBoundingClientRect().width > 0,
      // The renderer must have been resized to the narrower pane, or the model
      // is drawn at the wrong aspect and spills under the drawer.
      canvas: document.querySelector('canvas').getBoundingClientRect().width,
    }));

    await page.click('#drawer-toggle');
    await page.waitForTimeout(500);
    const closed = await page.evaluate(() => ({
      coords: window.__twin.snapshotCoordinates(),
      expanded: document.getElementById('drawer-toggle').getAttribute('aria-expanded'),
      stage: document.getElementById('stage').getBoundingClientRect().width,
    }));

    check(open.expanded === 'true' && closed.expanded === 'false',
      'the drawer control reports its own state to a screen reader',
      `${open.expanded} / ${closed.expanded}`);
    check(open.drawerVisible, 'opening the drawer shows it');
    // On a narrow viewport the drawer legitimately overlays instead of
    // docking, so the assertion is "the stage never grows", not a fixed width.
    check(open.stage <= closedStage + 1,
      'opening the drawer never widens the floor pane',
      `${closedStage} -> ${open.stage}`);
    check(Math.abs(open.canvas - open.stage) <= 2,
      'the renderer is resized to the pane it is drawn in, not to the window',
      `canvas ${open.canvas} vs stage ${open.stage}`);
    check(Math.abs(closed.stage - closedStage) <= 1,
      'closing the drawer restores the floor pane exactly',
      `${closedStage} -> ${closed.stage}`);
    check(open.coords === base && closed.coords === base,
      'opening and closing the drawer moves no measured coordinate');
    console.log('');
  }

  // ── Visibility is presentation only ──
  console.log('Layer visibility:');
  // The layer controls live in the inspection drawer, so it has to be open for
  // a pointer to reach them -- same as for an operator.
  const layerDrawerWasOpen = await page.evaluate(
    () => document.getElementById('app').classList.contains('drawer-open')
  );
  if (!layerDrawerWasOpen) {
    await page.click('#drawer-toggle');
    await page.waitForTimeout(450);
  }
  for (const layer of LAYERS) {
    await page.uncheck(`#layer-controls input[data-layer="${layer}"]`);
  }
  await page.waitForTimeout(500);
  const hidden = await snapshot(page);
  check(LAYERS.every((l) => hidden.visibility[l] === false), 'every toggled layer reported hidden',
    LAYERS.filter((l) => hidden.visibility[l] !== false).join(','));
  check(hidden.meshes === baseline.meshes, 'hiding does not delete meshes', `${hidden.meshes} vs ${baseline.meshes}`);
  check(JSON.stringify(hidden.api) === JSON.stringify(baseline.api), 'hiding does not change API results');

  // Restore each toggle to the state it started in rather than blanket-on, so
  // the comparison is against the baseline scene and not against a scene that
  // merely happens to have everything switched on.
  for (const layer of LAYERS) {
    const sel = `#layer-controls input[data-layer="${layer}"]`;
    if (baseline.visibility[layer]) await page.check(sel);
    else await page.uncheck(sel);
  }
  await page.waitForTimeout(500);
  if (!layerDrawerWasOpen) {
    await page.click('#drawer-toggle');
    await page.waitForTimeout(450);
  }
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
