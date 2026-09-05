#!/usr/bin/env node
/**
 * Floor 1 EAP operational map -- browser regression.
 *
 * This asserts what is on screen, not what the payload said. The distinction
 * matters here more than usual: the map's whole promise is that all 210
 * operational cells are drawn, including the 170 whose CAD instance is
 * unresolved, and the easy way to break that promise is a renderer that
 * silently skips the cells it cannot fully identify. So every count below is
 * read back out of the instance matrices the GPU received.
 *
 * The golden case is the 8x5 drill grid. It is the only place on this floor
 * where a layout cell is bound to one named CAD instance, it was recovered
 * only by using each block's transformed body position against an INSERT
 * origin sitting ~880 m off the floor, and it is exactly the structure a
 * well-meaning layout tweak would quietly deform. So its shape, its ordering,
 * its spacing ratio and its completeness are all pinned, and the positions are
 * compared against the served footprints rather than against constants -- a
 * cell that moved because someone nudged geometry to make the map look tidier
 * fails here.
 *
 * Usage:
 *   EAP_URL=http://127.0.0.1:4199/ node tests/playwright/eap-map-regression.js
 *
 * With no EAP_URL the check reports SKIP and exits zero: the map is served by
 * a container that is not always up, and a missing service is not a failure of
 * the code under test.
 */

'use strict';

const { chromium } = require('playwright');

const BASE = process.env.EAP_URL || process.env.TWIN_DIRECT_URL || null;

/* The populations the node model locks. A renderer that disagrees with any of
   these is drawing a different floor. */
const CELLS = 210;
const UNITS = 171;
const SINGLE_CELL_UNITS = 160;
const STATIONS = 11;
const CELLS_IN_STATIONS = 48;
const CELLS_WITHOUT_A_UNIT = 2;
const DIRECT = 40;
const AMBIGUOUS = 170;
const ZONE_CELLS = {
  A: 4, B: 103, C: 41, D: 13, D2: 2, E: 3, F: 5, G: 10, H: 3, I: 11, J: 8, K: 7,
};
/* The locked aggregations, by the reference label the layout prints. */
const STATION_CELLS = {
  DHD001: 4, CCL001: 6, CCL002: 7, DEOX01: 3, XRY001: 5, XRY002: 5,
  BND001: 3, BWN001: 3, BWN002: 4, BWN003: 2, PRS: 6,
};
/* The golden grid. */
const GRID_FIRST = 105;
const GRID_LAST = 144;
const GRID_COLUMNS = 8;
const GRID_ROWS = 5;

let failures = 0;

function check(ok, label, detail) {
  if (ok) {
    console.log(`  PASS  ${label}`);
    return true;
  }
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  return false;
}

function eq(actual, want, label) {
  return check(actual === want, label, `expected ${want}, got ${actual}`);
}

function section(name) {
  console.log(`\n${name}`);
  console.log('-'.repeat(name.length));
}

/** Distinct values within a tolerance, so float noise does not invent a column. */
function cluster(values, tol) {
  const sorted = [...values].sort((a, b) => a - b);
  const out = [];
  for (const v of sorted) {
    if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  }
  return out;
}

async function main() {
  console.log('Floor 1 EAP Operational Map -- browser regression');
  console.log('='.repeat(58));
  if (!BASE) {
    console.log('  SKIP  no EAP_URL set; the map service is not reachable from here.');
    process.exit(0);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });

  const url = new URL('eap.html', BASE).toString();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eap && window.__eap.ready(), null,
    { timeout: 30000 });
  await page.waitForTimeout(800);

  const drawn = await page.evaluate(() => window.__eap.drawn());
  const counts = await page.evaluate(() => window.__eap.counts());
  const units = await page.evaluate(() => window.__eap.units());
  const scene = await page.evaluate(() => ({
    cells: window.__eap.drawnCells(),
    markers: window.__eap.drawnMarkers(),
    batches: window.__eap.batches(),
    geometries: window.__eap.geometries(),
    drawCalls: window.__eap.drawCalls(),
    triangles: window.__eap.triangles(),
    mode: window.__eap.mode(),
  }));

  section('1. every operational cell is drawn');
  eq(drawn.length, CELLS, 'cells drawn into the scene');
  eq(scene.cells, CELLS, 'cells drawn across the visible panes');
  eq(counts.cells_with_a_footprint, CELLS, 'cells the payload carried a footprint for');
  const ids = new Set(drawn.map((d) => d.cell_id));
  eq(ids.size, CELLS, 'every drawn cell has a distinct id');

  section('2. mapping state survives to the screen');
  const byState = {};
  for (const d of drawn) byState[d.mapping_state] = (byState[d.mapping_state] || 0) + 1;
  eq(byState.DIRECT || 0, DIRECT, 'cells drawn in mapping state DIRECT');
  eq(byState.AMBIGUOUS || 0, AMBIGUOUS, 'cells drawn in mapping state AMBIGUOUS');
  check(!drawn.some((d) => d.mapping_state === 'AMBIGUOUS' && !(d.width > 0 && d.depth > 0)),
    'an unresolved cell is drawn at full size, not shrunk to a dot');
  eq(scene.markers, CELLS - DIRECT,
    'identity-confidence markers, one per cell that is not world-positioned');

  section('3. machine units and the locked aggregations');
  eq(units.length, UNITS, 'machine units served');
  const stations = units.filter((u) => u.aggregation_type === 'AGGREGATED_STATION');
  eq(units.length - stations.length, SINGLE_CELL_UNITS, 'single-cell units');
  eq(stations.length, STATIONS, 'aggregated station units');
  eq(stations.reduce((s, u) => s + u.cell_ids.length, 0), CELLS_IN_STATIONS,
    'cells belonging to aggregated stations');
  eq(drawn.filter((d) => d.unit_state === 'UNASSIGNED').length, CELLS_WITHOUT_A_UNIT,
    'cells drawn that attach to no machine unit');
  check(drawn.filter((d) => d.unit_state === 'UNASSIGNED')
    .every((d) => d.width > 0 && d.depth > 0),
  'a cell with no machine unit is still drawn');
  for (const [label, want] of Object.entries(STATION_CELLS)) {
    const unit = stations.find((u) => u.reference_label === label);
    eq(unit ? unit.cell_ids.length : -1, want, `station ${label} keeps ${want} cells`);
  }
  check(!stations.some((u) => ['DLM', 'LTK'].includes(u.reference_label)),
    'DLM and LTK are not merged into a station');

  section('4. zone structure');
  const byZone = {};
  for (const d of drawn) byZone[d.zone_id] = (byZone[d.zone_id] || 0) + 1;
  for (const [zone, want] of Object.entries(ZONE_CELLS)) {
    eq(byZone[zone] || 0, want, `zone ${zone} draws ${want} cells`);
  }
  eq(Object.values(byZone).reduce((a, b) => a + b, 0), CELLS,
    'zone cell counts sum to the population');

  section('5. the golden 8x5 grid');
  const grid = drawn.filter((d) => d.zone_id === 'B' && d.mapping_state === 'DIRECT');
  eq(grid.length, DIRECT, 'grid cells drawn');
  const numbers = grid.map((d) => Number(d.label)).sort((a, b) => a - b);
  eq(numbers[0], GRID_FIRST, 'first grid machine number');
  eq(numbers[numbers.length - 1], GRID_LAST, 'last grid machine number');
  check(numbers.every((n, i) => n === GRID_FIRST + i),
    'grid machine numbers run unbroken, no gap and no duplicate');
  const gx = cluster(grid.map((d) => d.x), 0.35);
  eq(gx.length, GRID_COLUMNS, 'grid columns on screen');
  /* Rows are asserted per column, not globally. The reference does not draw the
     eight columns row-aligned -- each column's cells are split where that
     column's own tiles are drawn -- so a global row count would assert a
     regularity the evidence does not have. What the grid does guarantee is five
     cells in every column, in order. */
  const columns = gx.map((cx) => grid
    .filter((d) => Math.abs(d.x - cx) <= 0.35)
    .sort((a, b) => a.z - b.z));
  check(columns.every((col) => col.length === GRID_ROWS),
    `every grid column holds ${GRID_ROWS} cells`,
    columns.map((c) => c.length).join(','));
  check(columns.every((col) => col.every((d, i) => i === 0 || d.z > col[i - 1].z)),
    'cells descend the screen in order within each column');
  /* Ordering: machine numbers stay consecutive down a column, which is how the
     reference draws them. A renderer that re-sorted the instances would still
     show 40 boxes but would break this. */
  check(columns.every((col) => col.every((d, i) => i === 0
    || Math.abs(Number(d.label) - Number(col[i - 1].label)) === 1)),
  'machine numbers stay consecutive down each column');
  /* The column pairing the CAD proves: 3.42 m within a pair, 5.08 m between
     pairs, so the ratio between the two gaps is what has to survive. The map is
     a schematic, so the ratio is checked rather than the metres. */
  const gaps = [];
  for (let i = 1; i < gx.length; i += 1) gaps.push(gx[i] - gx[i - 1]);
  const within = gaps.filter((_, i) => i % 2 === 0);
  const between = gaps.filter((_, i) => i % 2 === 1);
  const meanWithin = within.reduce((a, b) => a + b, 0) / within.length;
  const meanBetween = between.reduce((a, b) => a + b, 0) / between.length;
  const ratio = meanBetween / meanWithin;
  check(ratio > 1.15 && ratio < 2.6,
    'the grid keeps its column pairing: pair-to-pair gap exceeds within-pair gap',
    `ratio ${ratio.toFixed(2)}`);
  check(grid.every((d) => d.machine_unit_id),
    'every grid cell is its own machine unit');

  section('6. the PP rack keeps seven cells');
  const pp = drawn.filter((d) => d.zone_id === 'K');
  eq(pp.length, 7, 'PP cells drawn');
  check(pp.every((d) => (d.label || '').startsWith('UNREADABLE')),
    'PP labels stay unreadable, no machine number was invented');
  check(new Set(pp.map((d) => `${d.x.toFixed(3)},${d.z.toFixed(3)}`)).size === 7,
    'the seven PP cells occupy seven distinct positions');

  section('7. positions come from the served footprint, unchanged');
  const served = await page.evaluate(async () => {
    const res = await fetch('/api/eap-map');
    const body = await res.json();
    const out = {};
    for (const c of body.cells) {
      if (c.footprint) out[c.cell_id] = c.footprint;
    }
    return out;
  });
  let moved = 0;
  let resized = 0;
  let rotated = 0;
  for (const d of drawn.filter((x) => x.frame === 'EAP_LAYOUT_FRAME')) {
    const f = served[d.cell_id];
    if (!f) continue;
    if (Math.abs(f.x - d.x) > 1e-3 || Math.abs(f.z - d.z) > 1e-3) moved += 1;
    if (Math.abs(f.width - d.width) > 1e-3 || Math.abs(f.depth - d.depth) > 1e-3) resized += 1;
    if (f.rotation_deg !== 0) rotated += 1;
  }
  eq(moved, 0, 'no cell was moved between the wire and the screen');
  eq(resized, 0, 'no cell was resized between the wire and the screen');
  eq(rotated, 0, 'every footprint rotation is zero, as the reference draws them');
  check(drawn.every((d) => Number.isFinite(d.x) && Number.isFinite(d.z)
    && Number.isFinite(d.width) && Number.isFinite(d.depth)),
  'no NaN or Infinity in any drawn transform');

  section('8. instancing, not 210 meshes');
  check(scene.batches >= 2 && scene.batches <= 5,
    'cells and markers are instanced batches, not one mesh per machine',
    `batches ${scene.batches}`);
  check(scene.geometries <= 8, 'geometry count stays small: one shared box plus lines',
    `geometries ${scene.geometries}`);
  check(scene.drawCalls <= 10, 'draw calls stay in single figures',
    `draw calls ${scene.drawCalls}`);

  section('8b. the dual-frame renderer');
  const paneList = await page.evaluate(() => window.__eap.panes());
  eq(paneList.length, 2, 'AUTO mode shows both frames');
  const worldPane = paneList.find((p) => p.name === 'world');
  const layoutPane = paneList.find((p) => p.name === 'layout');
  eq(worldPane && worldPane.frame, 'FLOOR1_WORLD_M', 'the world pane names its frame');
  eq(layoutPane && layoutPane.frame, 'EAP_LAYOUT_FRAME', 'the layout pane names its frame');
  eq(worldPane && worldPane.cells, DIRECT, 'the world pane holds the registered cells');
  eq(layoutPane && layoutPane.cells, CELLS - DIRECT,
    'the layout pane holds every cell the world pane cannot');
  check(worldPane.rect.x + worldPane.rect.w <= layoutPane.rect.x,
    'the two panes do not overlap, so the frames are never visually merged');
  check(await page.evaluate(() => window.__eap.floorLoaded()),
    'the CAD floor plan is loaded as world-space context');

  section('8c. world-space cells use the verified CAD placement');
  const worldDrawn = await page.evaluate(() => window.__eap.drawnIn('world'));
  const servedWorld = await page.evaluate(async () => {
    const res = await fetch('/api/eap-map');
    const body = await res.json();
    const out = {};
    for (const c of body.cells) if (c.world_footprint) out[c.cell_id] = c.world_footprint;
    return out;
  });
  eq(worldDrawn.length, DIRECT, 'cells drawn in world space');
  check(worldDrawn.every((d) => d.spatial_evidence === 'DIRECT'),
    'only DIRECT cells are drawn in world space');
  let wMoved = 0;
  let wResized = 0;
  let wTurned = 0;
  for (const d of worldDrawn) {
    const f = servedWorld[d.cell_id];
    if (!f) continue;
    if (Math.abs(f.x - d.x) > 1e-3 || Math.abs(f.z - d.z) > 1e-3) wMoved += 1;
    if (Math.abs(f.width - d.width) > 1e-3 || Math.abs(f.depth - d.depth) > 1e-3) wResized += 1;
    const dr = Math.abs(((f.rotation_deg - d.rotation_deg) % 360 + 540) % 360 - 180);
    if (dr > 0.05) wTurned += 1;
  }
  eq(wMoved, 0, 'no world-space cell was moved between the wire and the screen');
  eq(wResized, 0, 'no world-space cell was resized');
  eq(wTurned, 0, 'every world-space rotation is the CAD instance rotation');
  /* The registered cells must land inside the floor the plan draws, not beside
     it: that is what "spatially aligned with the CAD environment" means. */
  const inside = worldDrawn.every((d) => Math.abs(d.x) < 90 && Math.abs(d.z) < 62);
  check(inside, 'every world-space cell lands inside the floor envelope');

  section('8d. frame separation holds in every mode');
  for (const [modeName, wantPanes, wantCells] of [
    ['WORLD', 1, DIRECT], ['EAP', 1, CELLS], ['AUTO', 2, CELLS],
  ]) {
    await page.evaluate((m) => window.__eap.setMode(m), modeName);
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => ({
      panes: window.__eap.panes(),
      cells: window.__eap.drawnCells(),
      drawn: window.__eap.drawn().map((d) => ({ f: d.frame, e: d.spatial_evidence })),
    }));
    eq(st.panes.length, wantPanes, `${modeName}: panes on screen`);
    eq(st.cells, wantCells, `${modeName}: cells drawn`);
    check(st.drawn.every((d) => (d.e === 'DIRECT' ? true : d.f === 'EAP_LAYOUT_FRAME')),
      `${modeName}: a SET_LEVEL or LAYOUT_ONLY cell is never drawn in world space`);
    check(st.drawn.filter((d) => d.f === 'FLOOR1_WORLD_M')
      .every((d) => d.e === 'DIRECT'),
    `${modeName}: only DIRECT evidence reaches the world frame`);
  }
  await page.evaluate(() => window.__eap.setMode('AUTO'));
  await page.waitForTimeout(400);

  section('9. the 3D view derives from the same footprint');
  await page.evaluate(() => window.__eap.setView('3d'));
  await page.waitForTimeout(500);
  const drawn3d = await page.evaluate(() => window.__eap.drawn());
  eq(drawn3d.length, CELLS, 'cells drawn in the 3D view');
  const byId = new Map(drawn.map((d) => [`${d.pane}:${d.cell_id}`, d]));
  let differs = 0;
  let sameHeight = 0;
  for (const d of drawn3d) {
    const flat = byId.get(`${d.pane}:${d.cell_id}`);
    if (!flat) continue;
    if (Math.abs(flat.x - d.x) > 1e-3 || Math.abs(flat.z - d.z) > 1e-3
      || Math.abs(flat.width - d.width) > 1e-3 || Math.abs(flat.depth - d.depth) > 1e-3) {
      differs += 1;
    }
    if (Math.abs(flat.height - d.height) < 1e-6) sameHeight += 1;
  }
  eq(differs, 0, '3D uses the same x, z, width and depth as 2D');
  eq(sameHeight, 0, 'only the height differs, and it is presentation-only');
  const batches3d = await page.evaluate(() => window.__eap.batches());
  // 3D adds one instanced batch for the floor's columns, which are line
  // geometry (no batch) in 2D; the cell and marker batches are exactly the ones
  // already counted in `scene`, not a second model.
  check(batches3d >= scene.batches && batches3d <= scene.batches + 1,
    'the 3D view reuses the same cell and marker batches, not a second model',
    `2D ${scene.batches} vs 3D ${batches3d}`);
  await page.evaluate(() => window.__eap.setView('2d'));
  await page.waitForTimeout(300);

  section('10. picking resolves one cell and reports its evidence');
  const sample = drawn.find((d) => d.mapping_state === 'DIRECT');
  const picked = await page.evaluate((id) => window.__eap.pick(id), sample.cell_id);
  check(picked && picked.cell_id === sample.cell_id,
    'picking a cell resolves exactly that cell');
  check(picked && picked.status === 'UNKNOWN',
    'a picked cell reports status UNKNOWN, not a fabricated machine state');
  check(picked && picked.cad_evidence && picked.cad_evidence.has_cad_instance === true,
    'a DIRECT cell reports that a named CAD instance backs it');
  const ambiguous = drawn.find((d) => d.mapping_state === 'AMBIGUOUS');
  const picked2 = await page.evaluate((id) => window.__eap.pick(id), ambiguous.cell_id);
  check(picked2 && picked2.cad_evidence.has_cad_instance === false,
    'an AMBIGUOUS cell reports no named CAD instance rather than a guess');
  const panel = await page.textContent('#inspector');
  check(/AMBIGUOUS/.test(panel), 'the inspector states the mapping state');
  check(/NOT_MAPPED/.test(panel), 'the inspector states the IMS mapping state');

  section('11. no private CAD data crosses the wire');
  const raw = await page.evaluate(async () => {
    const res = await fetch('/api/eap-map');
    return res.text();
  });
  for (const [label, re] of [
    ['no CAD handles', /"cad_handle"/],
    ['no CAD millimetre coordinates', /"x_mm"|"y_mm"/],
    ['no block names', /"block_name"|"block_family"/],
    ['no CAD layer names', /"layer"\s*:/],
    ['no machine node ids', /"machine_node_id"/],
  ]) {
    check(!re.test(raw), `${label} in the map payload`);
  }
  check(!/RUN|IDLE|DOWN|ALARM/.test(raw),
    'no reference-layout status colour is projected as a machine state');

  section('11b. the operational-footprint contract reaches the screen');
  const contract = await page.evaluate(() => window.__eap.contract());
  for (const level of ['DIRECT', 'STRUCTURAL', 'SET_LEVEL', 'LAYOUT_ONLY']) {
    check(Boolean(contract && contract.renderer && contract.renderer[level]),
      `the renderer contract states the rule for ${level}`);
  }
  check(/always drawn/i.test((contract.renderer || {}).unresolved_cells || ''),
    'the contract says unresolved cells are always drawn');
  const spatial = await page.evaluate(async () => {
    const res = await fetch('/api/eap-map');
    const body = await res.json();
    const by = {};
    for (const c of body.cells) by[c.spatial_evidence] = (by[c.spatial_evidence] || 0) + 1;
    return {
      by,
      counts: body.counts,
      positionedWithoutEvidence: body.cells.filter(
        (c) => c.has_cad_world_position && !c.world_render_permitted).length,
      permittedWithoutPosition: body.cells.filter(
        (c) => c.world_render_permitted && !c.has_cad_world_position).length,
      layoutOnlyEligible: body.cells.filter(
        (c) => c.spatial_evidence === 'LAYOUT_ONLY' && c.live_status_eligible).length,
      eligible: body.cells.filter((c) => c.live_status_eligible).length,
      positionedWithoutIdentity: body.cells.filter(
        (c) => c.has_cad_world_position && !c.cad_evidence.has_cad_instance).length,
    };
  });
  eq(spatial.by.DIRECT || 0, 40, 'cells with DIRECT spatial evidence');
  eq(spatial.by.STRUCTURAL || 0, 0, 'cells with STRUCTURAL spatial evidence');
  eq(spatial.by.SET_LEVEL || 0, 167, 'cells with SET_LEVEL spatial evidence');
  eq(spatial.by.LAYOUT_ONLY || 0, 3, 'cells with LAYOUT_ONLY spatial evidence');
  eq(spatial.counts.cells_with_a_cad_world_position, 40,
    'cells carrying a CAD world position');
  eq(spatial.positionedWithoutEvidence, 0,
    'no cell holds a world position without the evidence that permits one');
  eq(spatial.permittedWithoutPosition, 0,
    'no cell is permitted a world render without a world position');
  eq(spatial.layoutOnlyEligible, 0,
    'no LAYOUT_ONLY cell is eligible for live status');
  eq(spatial.eligible, 0,
    'no cell is eligible for live status while no IMS mapping exists');
  /* World position and CAD identity are independent by design. Today they
     coincide on all 40; the check is that the payload can tell them apart. */
  check(spatial.positionedWithoutIdentity === 0,
    'today every world position also has an identity, and both are reported separately');
  const inspected = await page.evaluate((id) => window.__eap.pick(id),
    drawn.find((d) => d.zone_id === 'H').cell_id);
  check(inspected && inspected.spatial_evidence === 'LAYOUT_ONLY',
    'a bonding cell reports LAYOUT_ONLY spatial evidence');
  const panelText = await page.textContent('#inspector');
  check(/LAYOUT_ONLY/.test(panelText),
    'the inspector states the spatial evidence level');
  check(/Live status is not eligible/i.test(panelText),
    'the inspector states why live status is not eligible');

  section('12. status semantics');
  const statuses = await page.evaluate(async () => {
    const res = await fetch('/api/eap-map');
    const body = await res.json();
    return [...new Set(body.cells.map((c) => c.status))];
  });
  check(statuses.length === 1 && statuses[0] === 'UNKNOWN',
    'every cell reports status UNKNOWN while no IMS mapping exists',
    statuses.join(','));

  section('13. readable at every target viewport');
  for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const still = await page.evaluate(() => ({
      cells: window.__eap.drawnCells(),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    check(still.cells === CELLS && !still.overflow,
      `${w}x${h}: all ${CELLS} cells drawn and no horizontal overflow`,
      `cells ${still.cells}, overflow ${still.overflow}`);
  }

  section('14. no page errors');
  eq(pageErrors.length, 0, 'console and page errors',
    pageErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n${'='.repeat(58)}`);
  console.log(`Results: ${failures} failure(s)`);
  console.log(failures ? 'EAP MAP REGRESSION FAILED' : 'EAP MAP REGRESSION PASSED');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`fatal: ${err && err.message}`);
  process.exit(1);
});
