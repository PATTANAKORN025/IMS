#!/usr/bin/env node
/**
 * Floor 1 EAP operational map -- browser regression.
 *
 * This asserts what is on screen, not what the payload said. The distinction
 * matters here more than usual: the map's whole promise is that all 210
 * operational cells are represented somewhere reachable, including the 170
 * whose CAD instance is unresolved, and the easy way to break that promise is
 * a renderer that silently drops the cells it cannot fully identify. So every
 * count below is read back out of the instance matrices the GPU received, or
 * out of the zone records that stand in for the cells a mode does not draw
 * directly.
 *
 * The renderer is a single canvas, not a split pane. AUTO and WORLD draw the
 * real Floor 1 floor plan with the 40 DIRECT cells standing on it and the 12
 * process zones as world-space regions; EAP draws the full 210-cell reference
 * schematic. A zone's un-placed cells are reachable through its drawer, not
 * drawn as fabricated points on the real floor.
 *
 * The golden case is the 8x5 drill grid, the only place on this floor where a
 * layout cell is bound to one named CAD instance. It was recovered only by
 * using each block's transformed body position against an INSERT origin
 * sitting ~880 m off the floor, and it is exactly the structure a well-meaning
 * layout tweak would quietly deform. So its shape, its ordering, its spacing
 * ratio and its completeness are all pinned, checked against the real-world
 * footprint the AUTO map actually draws.
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
const ZONE_COUNT = 12;
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

async function setMode(page, m) {
  await page.evaluate((mm) => window.__eap.setMode(mm), m);
  await page.waitForTimeout(350);
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

  const counts = await page.evaluate(() => window.__eap.counts());
  const units = await page.evaluate(() => window.__eap.units());

  section('0. the default view is one canvas, not a split pane');
  check(await page.evaluate(() => window.__eap.mode()) === 'AUTO', 'AUTO is the default mode');
  const canvasCount = await page.evaluate(() => document.querySelectorAll('#stage canvas').length);
  eq(canvasCount, 3, 'exactly three canvases in the stage: the WebGL surface, the label '
    + 'overlay, and the zone drawer inset -- never a second WebGL viewport');
  const stageRect0 = await page.evaluate(() => window.__eap.stageRect());
  const bodyWidth0 = await page.evaluate(() => document.getElementById('stage').clientWidth);
  check(stageRect0.w >= bodyWidth0 - 2,
    'the canvas spans the full stage width -- no permanent second pane taking half of it',
    `stage ${stageRect0.w} vs container ${bodyWidth0}`);
  check(!await page.evaluate(() => document.getElementById('panes')),
    'no leftover split-pane bar element exists in the DOM');

  section('1. all 210 cells are represented, reachably, in every mode');
  await setMode(page, 'EAP');
  const drawn210 = await page.evaluate(() => window.__eap.drawn());
  const markersEap = await page.evaluate(() => window.__eap.drawnMarkers());
  eq(drawn210.length, CELLS, 'EAP mode draws every cell in the reference schematic');
  eq(counts.cells_with_a_footprint, CELLS, 'cells the payload carried a footprint for');
  const ids = new Set(drawn210.map((d) => d.cell_id));
  eq(ids.size, CELLS, 'every drawn cell has a distinct id');

  await setMode(page, 'AUTO');
  const drawnAuto = await page.evaluate(() => window.__eap.drawn());
  const zoneList = await page.evaluate(() => window.__eap.zoneList());
  eq(drawnAuto.length, DIRECT,
    'AUTO draws only the 40 CAD-backed cells directly, on the real floor');
  eq(await page.evaluate(() => window.__eap.drawnZones()), ZONE_COUNT,
    'AUTO represents all 12 process zones as world-space regions');
  const zoneCellSum = zoneList.reduce((s, z) => s + z.cells, 0);
  eq(zoneCellSum, CELLS, 'the 12 zones account for every one of the 210 cells between them');
  check(zoneList.every((z) => z.cad_world_region), 'every zone publishes a world region -- '
    + 'none of the 170 non-DIRECT cells is left with no reachable representation on the map');

  section('2. mapping state survives to the screen');
  const byState = {};
  for (const d of drawn210) byState[d.mapping_state] = (byState[d.mapping_state] || 0) + 1;
  eq(byState.DIRECT || 0, DIRECT, 'cells drawn in mapping state DIRECT');
  eq(byState.AMBIGUOUS || 0, AMBIGUOUS, 'cells drawn in mapping state AMBIGUOUS');
  check(!drawn210.some((d) => d.mapping_state === 'AMBIGUOUS' && !(d.width > 0 && d.depth > 0)),
    'an unresolved cell is drawn at full size, not shrunk to a dot');
  eq(markersEap, CELLS - DIRECT,
    'identity-confidence markers, one per cell that is not world-positioned');

  section('3. machine units and the locked aggregations');
  eq(units.length, UNITS, 'machine units served');
  const stations = units.filter((u) => u.aggregation_type === 'AGGREGATED_STATION');
  eq(units.length - stations.length, SINGLE_CELL_UNITS, 'single-cell units');
  eq(stations.length, STATIONS, 'aggregated station units');
  eq(stations.reduce((s, u) => s + u.cell_ids.length, 0), CELLS_IN_STATIONS,
    'cells belonging to aggregated stations');
  eq(drawn210.filter((d) => d.unit_state === 'UNASSIGNED').length, CELLS_WITHOUT_A_UNIT,
    'cells drawn that attach to no machine unit');
  check(drawn210.filter((d) => d.unit_state === 'UNASSIGNED')
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
  for (const d of drawn210) byZone[d.zone_id] = (byZone[d.zone_id] || 0) + 1;
  for (const [zone, want] of Object.entries(ZONE_CELLS)) {
    eq(byZone[zone] || 0, want, `zone ${zone} draws ${want} cells`);
  }
  eq(Object.values(byZone).reduce((a, b) => a + b, 0), CELLS,
    'zone cell counts sum to the population');

  section('5. the golden 8x5 grid, on the real floor plan');
  eq(drawnAuto.length, GRID_COLUMNS * GRID_ROWS, 'grid cells drawn on the real floor');
  check(drawnAuto.every((d) => d.frame === 'FLOOR1_WORLD_M' && d.spatial_evidence === 'DIRECT'),
    'every AUTO-drawn cell is DIRECT, in the real-world frame');
  const numbers = drawnAuto.map((d) => Number(d.label)).sort((a, b) => a - b);
  eq(numbers[0], GRID_FIRST, 'first grid machine number');
  eq(numbers[numbers.length - 1], GRID_LAST, 'last grid machine number');
  check(numbers.every((n, i) => n === GRID_FIRST + i),
    'grid machine numbers run unbroken, no gap and no duplicate');
  const gx = cluster(drawnAuto.map((d) => d.x), 0.35);
  eq(gx.length, GRID_COLUMNS, 'grid columns on screen');
  /* Rows are asserted per column, not globally. The reference does not draw the
     eight columns row-aligned -- each column's cells are split where that
     column's own tiles are drawn -- so a global row count would assert a
     regularity the evidence does not have. What the grid does guarantee is five
     cells in every column, in order. */
  const columns = gx.map((cx) => drawnAuto
    .filter((d) => Math.abs(d.x - cx) <= 0.35)
    .sort((a, b) => a.z - b.z));
  check(columns.every((col) => col.length === GRID_ROWS),
    `every grid column holds ${GRID_ROWS} cells`,
    columns.map((c) => c.length).join(','));
  check(columns.every((col) => col.every((d, i) => i === 0 || d.z > col[i - 1].z)),
    'cells descend the screen in order within each column');
  check(columns.every((col) => col.every((d, i) => i === 0
    || Math.abs(Number(d.label) - Number(col[i - 1].label)) === 1)),
  'machine numbers stay consecutive down each column');
  /* The column pairing the CAD proves: 3.42 m within a pair, 5.08 m between
     pairs, so the ratio between the two gaps is what has to survive. */
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
  check(drawnAuto.every((d) => d.machine_unit_id),
    'every grid cell is its own machine unit');
  const insideEnvelope = drawnAuto.every((d) => Math.abs(d.x) < 90 && Math.abs(d.z) < 62);
  check(insideEnvelope, 'every DIRECT cell lands inside the floor envelope, none off-screen');

  section('6. the PP rack keeps seven cells');
  const pp = drawn210.filter((d) => d.zone_id === 'K');
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
  for (const d of drawn210) {
    const f = served[d.cell_id];
    if (!f) continue;
    if (Math.abs(f.x - d.x) > 1e-3 || Math.abs(f.z - d.z) > 1e-3) moved += 1;
    if (Math.abs(f.width - d.width) > 1e-3 || Math.abs(f.depth - d.depth) > 1e-3) resized += 1;
    if (f.rotation_deg !== 0) rotated += 1;
  }
  eq(moved, 0, 'no cell was moved between the wire and the screen');
  eq(resized, 0, 'no cell was resized between the wire and the screen');
  eq(rotated, 0, 'every footprint rotation is zero, as the reference draws them');
  check(drawn210.every((d) => Number.isFinite(d.x) && Number.isFinite(d.z)
    && Number.isFinite(d.width) && Number.isFinite(d.depth)),
  'no NaN or Infinity in any drawn transform');

  section('8. instancing, not 210 meshes');
  const sceneEap = await page.evaluate(() => ({
    batches: window.__eap.batches(), geometries: window.__eap.geometries(),
    drawCalls: window.__eap.drawCalls(),
  }));
  check(sceneEap.batches >= 2 && sceneEap.batches <= 5,
    'EAP mode: cells and markers are instanced batches, not one mesh per machine',
    `batches ${sceneEap.batches}`);
  check(sceneEap.geometries <= 8, 'geometry count stays small: one shared box plus lines',
    `geometries ${sceneEap.geometries}`);
  check(sceneEap.drawCalls <= 10, 'draw calls stay in single figures',
    `draw calls ${sceneEap.drawCalls}`);
  await setMode(page, 'AUTO');
  const sceneAuto = await page.evaluate(() => ({
    batches: window.__eap.batches(), drawCalls: window.__eap.drawCalls(),
  }));
  check(sceneAuto.batches <= 6,
    'AUTO mode: floor, zone cards and the 40-cell batch stay a handful of draws',
    `batches ${sceneAuto.batches}`);

  section('8b. world-space cells use the verified CAD placement');
  const servedWorld = await page.evaluate(async () => {
    const res = await fetch('/api/eap-map');
    const body = await res.json();
    const out = {};
    for (const c of body.cells) if (c.world_footprint) out[c.cell_id] = c.world_footprint;
    return out;
  });
  check(drawnAuto.every((d) => d.spatial_evidence === 'DIRECT'),
    'only DIRECT cells are drawn on the real floor');
  let wMoved = 0;
  let wResized = 0;
  let wTurned = 0;
  for (const d of drawnAuto) {
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
  check(await page.evaluate(() => window.__eap.floorLoaded()),
    'the real floor plan geometry is loaded as the spatial foundation');
  const extentAuto = await page.evaluate(() => window.__eap.cameraExtent());
  const floorGeo = await page.evaluate(async () => (await fetch('/api/floor-geometry')).json());
  eq(extentAuto.w, floorGeo.envelope.width, 'AUTO fits the camera to the real floor envelope '
    + 'width, not the schematic frame');
  eq(extentAuto.d, floorGeo.envelope.depth, 'AUTO fits the camera to the real floor envelope '
    + 'depth');

  section('8c. frame separation holds in every mode');
  for (const [modeName, wantCells, wantFrame, wantZones] of [
    ['WORLD', DIRECT, 'FLOOR1_WORLD_M', ZONE_COUNT],
    ['EAP', CELLS, 'EAP_LAYOUT_FRAME', 0],
    ['AUTO', DIRECT, 'FLOOR1_WORLD_M', ZONE_COUNT],
  ]) {
    await setMode(page, modeName);
    const st = await page.evaluate(() => ({
      cells: window.__eap.drawnCells(),
      zones: window.__eap.drawnZones(),
      drawn: window.__eap.drawn().map((d) => ({ f: d.frame, e: d.spatial_evidence })),
    }));
    eq(st.cells, wantCells, `${modeName}: cells drawn`);
    eq(st.zones, wantZones, `${modeName}: zone regions drawn`);
    check(st.drawn.every((d) => d.f === wantFrame), `${modeName}: every drawn cell is in ${wantFrame}`);
    check(st.drawn.every((d) => (d.f === 'FLOOR1_WORLD_M' ? d.e === 'DIRECT' : true)),
      `${modeName}: only DIRECT evidence reaches the world frame`);
  }
  await setMode(page, 'AUTO');

  section('9. the 3D view derives from the same footprint');
  const drawnBefore3d = await page.evaluate(() => window.__eap.drawn());
  await page.evaluate(() => window.__eap.setView('3d'));
  await page.waitForTimeout(500);
  const drawn3d = await page.evaluate(() => window.__eap.drawn());
  eq(drawn3d.length, drawnBefore3d.length, 'the same cells are drawn in the 3D view');
  const byId = new Map(drawnBefore3d.map((d) => [d.cell_id, d]));
  let differs = 0;
  let sameHeight = 0;
  for (const d of drawn3d) {
    const flat = byId.get(d.cell_id);
    if (!flat) continue;
    if (Math.abs(flat.x - d.x) > 1e-3 || Math.abs(flat.z - d.z) > 1e-3
      || Math.abs(flat.width - d.width) > 1e-3 || Math.abs(flat.depth - d.depth) > 1e-3) {
      differs += 1;
    }
    if (Math.abs(flat.height - d.height) < 1e-6) sameHeight += 1;
  }
  eq(differs, 0, '3D uses the same x, z, width and depth as 2D');
  eq(sameHeight, 0, 'only the height differs, and it is presentation-only');
  const batchesFlat = await page.evaluate(() => window.__eap.batches());
  await page.evaluate(() => window.__eap.setView('2d'));
  await page.waitForTimeout(300);
  const batches2d = await page.evaluate(() => window.__eap.batches());
  // 3D adds one instanced batch for the floor's columns, which are line
  // geometry (no batch) in 2D; the cell batch is exactly the one already
  // counted in 2D, not a second model.
  check(batchesFlat >= batches2d && batchesFlat <= batches2d + 1,
    'the 3D view reuses the same cell batch, not a second model',
    `2D ${batches2d} vs 3D ${batchesFlat}`);

  section('10. picking, selection and the zone drawer');
  await setMode(page, 'EAP');
  const drawnForPick = await page.evaluate(() => window.__eap.drawn());
  const sample = drawnForPick.find((d) => d.mapping_state === 'DIRECT');
  const picked = await page.evaluate((id) => window.__eap.pick(id), sample.cell_id);
  check(picked && picked.cell_id === sample.cell_id,
    'picking a cell resolves exactly that cell');
  check(picked && picked.status === 'UNKNOWN',
    'a picked cell reports status UNKNOWN, not a fabricated machine state');
  check(picked && picked.cad_evidence && picked.cad_evidence.has_cad_instance === true,
    'a DIRECT cell reports that a named CAD instance backs it');
  const ambiguous = drawnForPick.find((d) => d.mapping_state === 'AMBIGUOUS');
  const picked2 = await page.evaluate((id) => window.__eap.pick(id), ambiguous.cell_id);
  check(picked2 && picked2.cad_evidence.has_cad_instance === false,
    'an AMBIGUOUS cell reports no named CAD instance rather than a guess');
  const panel = await page.textContent('#inspector');
  check(/AMBIGUOUS/.test(panel), 'the inspector states the mapping state');
  check(/NOT_MAPPED/.test(panel), 'the inspector states the IMS mapping state');
  const selectionApi = await page.evaluate(() => window.__eap.selection());
  check(selectionApi && selectionApi.cell_id === ambiguous.cell_id,
    'selection is queryable and matches the last pick');

  await setMode(page, 'AUTO');
  const boundsBefore = await page.evaluate(() => window.__eap.camBounds());
  const zonesAuto = await page.evaluate(() => window.__eap.zoneList());
  const unresolvedZone = zonesAuto.find((z) => z.cad_world_region
    && z.cad_world_region.spatial_evidence === 'SET_LEVEL');
  const zoneRec = await page.evaluate((id) => window.__eap.pickZone(id), unresolvedZone.zone_id);
  check(zoneRec && zoneRec.zone.zone_id === unresolvedZone.zone_id,
    'clicking a zone resolves that zone, not a cell');
  check(await page.evaluate(() => window.__eap.selectedZoneId()) === unresolvedZone.zone_id,
    'the selected zone is queryable');
  const r = unresolvedZone.cad_world_region;
  await page.evaluate((reg) => window.__eap.focus(reg.x, reg.z, reg.width, reg.depth), r);
  const boundsAfter = await page.evaluate(() => window.__eap.camBounds());
  check((boundsAfter.right - boundsAfter.left) < (boundsBefore.right - boundsBefore.left),
    'zone focus narrows the camera to the zone, rather than leaving the whole floor framed');

  check(!await page.evaluate(() => window.__eap.drawerOpen()), 'the zone drawer starts closed');
  const opened = await page.evaluate((id) => window.__eap.openDrawer(id), unresolvedZone.zone_id);
  check(Boolean(opened), 'opening a zone with unresolved cells returns a drawer record');
  check(await page.evaluate(() => window.__eap.drawerOpen()), 'the zone drawer reports open');
  check(await page.evaluate((id) => window.__eap.drawerZone() === id, unresolvedZone.zone_id),
    'the drawer reports which zone it is showing');
  const drawerCanvasSize = await page.evaluate(() => {
    const c = document.getElementById('zoneDrawerCanvas');
    return { w: c.width, h: c.height };
  });
  check(drawerCanvasSize.w > 0 && drawerCanvasSize.h > 0,
    'the zone drawer canvas actually rendered something');
  await page.evaluate(() => window.__eap.closeDrawer());
  check(!await page.evaluate(() => window.__eap.drawerOpen()), 'the zone drawer closes');
  await page.click('#fit');
  await page.waitForTimeout(300);

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
  check(spatial.positionedWithoutIdentity === 0,
    'today every world position also has an identity, and both are reported separately');
  const zoneHRegion = zoneList.find((z) => z.zone_id === 'H').cad_world_region;
  check(Boolean(zoneHRegion) && zoneHRegion.spatial_evidence === 'LAYOUT_ONLY'
    && zoneHRegion.link_confidence === 'LOW',
  'zone H publishes its region flagged LAYOUT_ONLY/LOW, never as an established registration');
  await setMode(page, 'EAP');
  const bondingCell = drawn210.find((d) => d.zone_id === 'H');
  const inspected = await page.evaluate((id) => window.__eap.pick(id), bondingCell.cell_id);
  check(inspected && inspected.spatial_evidence === 'LAYOUT_ONLY',
    'a bonding cell reports LAYOUT_ONLY spatial evidence');
  const panelText = await page.textContent('#inspector');
  check(/LAYOUT_ONLY/.test(panelText),
    'the inspector states the spatial evidence level');
  check(/Live status is not eligible/i.test(panelText),
    'the inspector states why live status is not eligible');
  await setMode(page, 'AUTO');

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
  await setMode(page, 'EAP');
  for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const still = await page.evaluate(() => ({
      cells: window.__eap.drawnCells(),
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    check(still.cells === CELLS && !still.overflow,
      `${w}x${h}: all ${CELLS} cells reachable and no horizontal overflow`,
      `cells ${still.cells}, overflow ${still.overflow}`);
  }
  await setMode(page, 'AUTO');
  for (const [w, h] of [[1366, 768], [1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const still = await page.evaluate(() => ({
      cells: window.__eap.drawnCells(),
      zones: window.__eap.drawnZones(),
      stage: window.__eap.stageRect(),
    }));
    check(still.cells === DIRECT && still.zones === ZONE_COUNT
      && still.stage.w > 0 && still.stage.h > 0,
    `${w}x${h}: the real floor, its 40 DIRECT cells and 12 zones are all on screen in AUTO`);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(250);

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
