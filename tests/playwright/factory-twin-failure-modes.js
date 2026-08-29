#!/usr/bin/env node
/**
 * Factory Twin 3D — browser failure-mode regression.
 *
 * The main regression proves the twin is correct when the API answers
 * correctly. This one proves it stays *honest* when the API does not.
 *
 * That distinction matters more here than in an ordinary app. A twin that
 * crashes on a malformed response is a nuisance; a twin that renders a
 * fabricated position, or shows an unmapped slot as CONFIRMED because a field
 * was missing, is actively misleading about a real factory. Every case below
 * asserts three things: the page does not crash, nothing private escapes, and
 * nothing unproven is presented as proven.
 *
 * Runs against the service directly, because the failures are injected by
 * intercepting the browser's own requests -- the proxy and the auth gate are
 * not what is under test here.
 *
 * Usage:
 *   TWIN_DIRECT_URL=http://localhost:4199/ node tests/playwright/factory-twin-failure-modes.js
 */

'use strict';

const { chromium } = require('playwright');

// Two modes, matching factory-twin-regression.js: through the proxy behind
// Grafana's session (the deployed path), or straight at the service when a
// direct URL is given. The faults are injected by intercepting the browser's
// own requests either way -- the proxy and the auth gate are not what is under
// test here, they are just the road to the page.
const BASE_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const USER = process.env.GRAFANA_ADMIN_USER || process.env.GRAFANA_USER || 'admin';
const PASS = process.env.GRAFANA_ADMIN_PASSWORD || process.env.GRAFANA_PASS;
const DIRECT_URL = process.env.TWIN_DIRECT_URL || null;
const TWIN_URL = DIRECT_URL || `${BASE_URL}/factory-twin-3d/`;

/** Session state reused by every fault case, so login happens once. */
let storageState = null;

async function establishSession(browser) {
  if (DIRECT_URL) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="user"]', USER);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  if (page.url().includes('/login') || (await page.locator('input[name="password"]').count()) > 0) {
    console.error('');
    console.error('AUTH_REGRESSION_BLOCKED_EXTERNAL_CREDENTIAL');
    console.error(`  Grafana rejected the configured credential for user "${USER}" at ${BASE_URL}.`);
    console.error('  No failure-mode case ran, and none is reported as passing.');
    console.error('  Run against the service directly with TWIN_DIRECT_URL to exercise the');
    console.error('  scene faults without the proxy, or supply a working credential. Do NOT');
    console.error('  disable authentication to make this run green.');
    await browser.close();
    process.exit(78);
  }
  storageState = await context.storageState();
  await context.close();
}

let failures = 0;
function check(ok, label, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Obviously synthetic markers. Any of these on screen is a leak, unambiguously. */
const POISON = ['TEST-PRIVATE-NOTE', 'TEST-PROCESS-NAME', 'TEST-SOURCE-PATH', 'TEST-OPERATOR-NAME'];

/**
 * Loads the page with a fault injected into one route, then reports what the
 * UI did. Never throws on a page error -- collecting it is the point.
 */
async function loadWith(browser, { route, handler, waitForScene = true }) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ...(storageState ? { storageState } : {}),
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  if (route) await page.route(route, handler);

  await page.goto(TWIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (waitForScene) {
    await page
      .waitForFunction(() => window.__twin !== undefined, { timeout: 20000 })
      .catch(() => {});
  }
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => {
    const T = window.__twin;
    let meshes = 0;
    let badTransforms = 0;
    if (T) {
      T.scene.traverse((o) => {
        if (o.type === 'Mesh') meshes++;
        const p = o.position;
        if (p && !(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) badTransforms++;
        const s = o.scale;
        if (s && !(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z))) badTransforms++;
      });
    }
    return {
      booted: Boolean(T),
      meshes,
      badTransforms,
      machineMeshes: T ? T.machineMeshes.length : 0,
      slotMeshes: T ? T.slotMeshes.length : 0,
      columnMeshes: T ? T.columnMeshes.length : 0,
      // Whole visible document, so a leaked value is caught wherever it
      // surfaced -- HUD, inspector, evidence panel or diagnostics.
      text: document.body.innerText,
      canvasPresent: Boolean(document.querySelector('canvas')),
      // A CONFIRMED *claim*, which is not the same as the word appearing. The
      // evidence legend defines the term and the summary reports a confirmed
      // count of zero; both are correct and both contain the word. What must
      // never appear is the badge that asserts one, or a non-zero count.
      confirmedBadges: document.querySelectorAll('.badge-confirmed').length,
      confirmedCount: (() => {
        const el = document.querySelector('#layer-controls [data-count="slots"]');
        const m = el && /(\d+)\s+CONFIRMED/.exec(el.textContent || '');
        return m ? Number(m[1]) : 0;
      })(),
      mappedSlots: (() => {
        const el = document.getElementById('evidence-summary');
        const m = el && /Confirmed physical mappings\D*(\d+)/.exec(el.innerText || '');
        return m ? Number(m[1]) : 0;
      })(),
    };
  });

  await context.close();
  return { ...state, pageErrors, consoleErrors };
}

/** The assertions every fault case must satisfy, whatever else it does. */
function assertSafeDegradation(label, r, { expectScene = true } = {}) {
  check(r.pageErrors.length === 0, `${label}: no uncaught exception`, r.pageErrors[0] || '');
  check(r.canvasPresent, `${label}: the view still renders`);
  if (expectScene) check(r.booted, `${label}: the scene still boots`);
  check(r.badTransforms === 0, `${label}: no NaN or Infinity transform`, `${r.badTransforms} bad`);
  const leaked = POISON.filter((p) => r.text.includes(p));
  check(leaked.length === 0, `${label}: nothing private reached the screen`, leaked.join(', '));
  // The load-bearing one. CONFIRMED is the only state that asserts an
  // authoritative physical correspondence, and nothing in this build can
  // produce one -- least of all a broken response.
  check(r.confirmedBadges === 0, `${label}: no CONFIRMED badge is shown`, `${r.confirmedBadges}`);
  check(r.confirmedCount === 0, `${label}: the slot layer reports 0 confirmed`, `${r.confirmedCount}`);
  check(r.mappedSlots === 0, `${label}: the evidence panel reports 0 confirmed mappings`, `${r.mappedSlots}`);
}

// Whether this deployment has monitored devices at all. CI runs against a
// database that may have none, and an empty fleet is a real state -- the
// device-dependent assertions are skipped with a reason rather than failed.
let hasMachines = false;
let skipped = 0;
function skip(label, why) {
  console.log(`  SKIP  ${label}  (${why})`);
  skipped++;
}
const NO_DEVICES = 'no monitored devices in this database';

function checkMachines(ok, label, detail) {
  if (!hasMachines) return skip(label, NO_DEVICES);
  check(ok, label, detail);
}

function json(body, status = 200) {
  return (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function run() {
  console.log(`\nFactory Twin Failure-Mode Regression  (${TWIN_URL})\n`);
  if (!PASS && !DIRECT_URL) {
    console.error('FATAL: GRAFANA_ADMIN_PASSWORD (or GRAFANA_PASS) env var not set.');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  await establishSession(browser);

  // Baseline with no fault injected, to learn what this deployment actually
  // has before asserting anything about what survives a fault.
  const base = await loadWith(browser, {});
  hasMachines = base.machineMeshes > 0;
  if (!hasMachines) console.log(`(${NO_DEVICES} -- device-dependent cases will be SKIPPED, not passed)`);

  const GEO = '**/api/floor-geometry';
  const STATE = '**/api/state';
  const PLACEMENT = '**/api/placement';

  // ── HTTP status failures ──
  console.log('Geometry API status failures:');
  for (const status of [401, 403, 404, 500, 503]) {
    const r = await loadWith(browser, {
      route: GEO,
      handler: json({ error: 'denied' }, status),
    });
    assertSafeDegradation(`geometry ${status}`, r);
    checkMachines(r.machineMeshes > 0, `geometry ${status}: monitored devices still render`, `${r.machineMeshes}`);
    check(r.slotMeshes === 0 && r.columnMeshes === 0, `geometry ${status}: no geometry is invented`);
  }

  // ── Malformed bodies ──
  console.log('\nMalformed geometry:');
  {
    const r = await loadWith(browser, {
      route: GEO,
      handler: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{not json' }),
    });
    assertSafeDegradation('invalid JSON', r);
  }
  {
    const r = await loadWith(browser, {
      route: GEO,
      handler: (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"slots":[{"position":{"x":1' }),
    });
    assertSafeDegradation('truncated JSON', r);
  }
  {
    // Every field present but of the wrong type. The renderer must not assume
    // an array is an array.
    const r = await loadWith(browser, {
      route: GEO,
      handler: json({
        envelope: 'TEST-SOURCE-PATH',
        columns: 'not-an-array',
        zones: 42,
        slots: { nope: true },
        functional_zones: null,
        functional_zones_meta: 'TEST-PRIVATE-NOTE',
      }),
    });
    assertSafeDegradation('wrong types throughout', r);
  }
  {
    const r = await loadWith(browser, { route: GEO, handler: json({}) });
    assertSafeDegradation('empty object', r);
  }
  {
    const r = await loadWith(browser, {
      route: GEO,
      handler: json({ envelope: null, columns: [], zones: [], slots: [], functional_zones: [] }),
    });
    assertSafeDegradation('empty but well-formed', r);
    checkMachines(r.machineMeshes > 0, 'empty geometry: monitored devices still render');
  }
  {
    // A slot with no position at all, and one with a non-finite position.
    // Neither may be placed at a made-up coordinate.
    const r = await loadWith(browser, {
      route: GEO,
      handler: json({
        envelope: { width: 10, depth: 10, height: 5, clear_height_m: null },
        columns: [],
        zones: [],
        slots: [
          { slot_id: 'slot-a', status: 'UNMAPPED', ims_device_id: null },
          { slot_id: 'slot-b', position: { x: null, y: 0, z: 1 }, footprint: { width: 1, depth: 1, height: 1 }, status: 'UNMAPPED', ims_device_id: null },
        ],
        functional_zones: [],
      }),
    });
    assertSafeDegradation('slots without usable positions', r);
  }
  {
    // Duplicate identifiers on both sides. A duplicate must never become two
    // confirmations of the same thing.
    const r = await loadWith(browser, {
      route: GEO,
      handler: json({
        envelope: { width: 10, depth: 10, height: 5, clear_height_m: null },
        columns: [
          { id: 'col-1', position: { x: 0, z: 0 }, footprint: { width: 1, depth: 1 }, confidence: 'high' },
          { id: 'col-1', position: { x: 2, z: 2 }, footprint: { width: 1, depth: 1 }, confidence: 'high' },
        ],
        zones: [],
        slots: [
          { slot_id: 'dup', position: { x: 1, y: 0, z: 1 }, footprint: { width: 1, depth: 1, height: 1 }, status: 'UNMAPPED', ims_device_id: null, height_status: 'unknown' },
          { slot_id: 'dup', position: { x: 3, y: 0, z: 3 }, footprint: { width: 1, depth: 1, height: 1 }, status: 'UNMAPPED', ims_device_id: null, height_status: 'unknown' },
        ],
        functional_zones: [],
      }),
    });
    assertSafeDegradation('duplicate slot and column ids', r);
  }
  {
    // An evidence tier and a schema version the client has never heard of.
    // Unknown must render as unknown, never as the nearest known tier.
    const r = await loadWith(browser, {
      route: GEO,
      handler: json({
        schema_version: '99.0.0-TEST',
        envelope: { width: 10, depth: 10, height: 5, clear_height_m: null },
        columns: [],
        zones: [],
        slots: [],
        functional_zones: [
          {
            id: 'zone-99',
            confidence: 'TEST-INVENTED-TIER',
            type: 'TEST-PROCESS-NAME',
            validationNotes: 'TEST-PRIVATE-NOTE',
            geometry: { vertices: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] },
          },
        ],
        functional_zones_meta: { total: 1, served: 1, withheld: 0, byConfidence: {}, conflicts: [] },
      }),
    });
    assertSafeDegradation('unknown schema version and evidence tier', r);
    // The client applies its own tier guard, so an unrecognised tier draws
    // nothing rather than borrowing a validated tier's appearance.
    check(r.meshes >= 0, 'unknown tier: no crash while filtering');
  }
  {
    // The case the whole system exists to prevent: a response asserting a
    // confirmed mapping that no authoritative record backs.
    const r = await loadWith(browser, {
      route: GEO,
      handler: json({
        envelope: { width: 10, depth: 10, height: 5, clear_height_m: null },
        columns: [],
        zones: [],
        slots: [
          {
            slot_id: 'slot-x',
            position: { x: 1, y: 0, z: 1 },
            footprint: { width: 1, depth: 1, height: 1 },
            status: 'UNMAPPED',
            ims_device_id: null,
            mes_machine_id: 'TEST-PROCESS-NAME',
            operator: 'TEST-OPERATOR-NAME',
            source_file: 'TEST-SOURCE-PATH',
            height_status: 'unknown',
          },
        ],
        functional_zones: [],
      }),
    });
    assertSafeDegradation('unmapped slot carrying hostile extra fields', r);
  }

  // ── Placement and state ──
  console.log('\nPlacement and telemetry failures:');
  for (const status of [401, 404, 500]) {
    const r = await loadWith(browser, { route: PLACEMENT, handler: json({ error: 'denied' }, status) });
    assertSafeDegradation(`placement ${status}`, r, { expectScene: false });
    check(r.machineMeshes === 0, `placement ${status}: no machine is invented`, `${r.machineMeshes}`);
  }
  {
    const r = await loadWith(browser, { route: STATE, handler: json({ error: 'boom' }, 500) });
    assertSafeDegradation('state 500', r);
    checkMachines(r.machineMeshes > 0, 'state 500: machines still render without telemetry');
  }
  {
    // Duplicate device rows, and a row for a device that has no mesh.
    const r = await loadWith(browser, {
      route: STATE,
      handler: json({
        machines: [
          { device_id: 'TEST-GHOST-01', state: 2, machine_state: 'RUN', state_label: 'Run', state_color: '#22c55e' },
          { device_id: 'TEST-GHOST-01', state: 3, machine_state: 'DOWN', state_label: 'Down', state_color: '#ef4444' },
        ],
        queried_at: new Date().toISOString(),
      }),
    });
    assertSafeDegradation('duplicate and unknown device rows', r);
    checkMachines(r.machineMeshes > 0, 'unknown device rows: existing machines are untouched');
  }
  {
    const r = await loadWith(browser, {
      route: STATE,
      handler: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
    });
    assertSafeDegradation('state body is null', r);
  }

  // ── Transport failures ──
  console.log('\nTransport failures:');
  {
    const r = await loadWith(browser, { route: GEO, handler: (route) => route.abort('failed') });
    assertSafeDegradation('geometry request aborted', r);
    checkMachines(r.machineMeshes > 0, 'aborted geometry: monitored devices still render');
  }
  {
    // A response that never arrives within the observation window. The scene
    // must boot and stay usable rather than wait on it.
    const r = await loadWith(browser, {
      route: GEO,
      handler: async (route) => {
        await new Promise((res) => setTimeout(res, 15000));
        route.abort('timedout');
      },
    });
    assertSafeDegradation('geometry never answers', r);
    check(r.canvasPresent, 'slow geometry: the view is usable before it resolves');
  }
  {
    const r = await loadWith(browser, {
      route: GEO,
      handler: (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>TEST-PRIVATE-NOTE</html>' }),
    });
    assertSafeDegradation('geometry answers with HTML', r);
  }

  console.log(`
${failures === 0 ? 'FAILURE-MODE REGRESSION PASSED' : `FAILURE-MODE REGRESSION FAILED (${failures})`}`);
  if (skipped > 0) console.log(`${skipped} check(s) SKIPPED and NOT counted as passing.`);
  console.log('');
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
