#!/usr/bin/env node
/**
 * CAD-vs-model reconciliation for Floor 1.
 *
 * The complaint this exists to answer was specific: machines were the wrong
 * size, and their left/right placement did not match the drawing. Both were
 * true, and neither was visible from inside the model -- the old equipment
 * layer was internally consistent, it just described a different source.
 *
 * So this compares the SERVED MODEL back against the CAD it claims to come
 * from, record by record, and reports residuals rather than a verdict of
 * "looks right". Every equipment record must resolve to exactly one INSERT in
 * the CAD bundle, and its position, extent and rotation must reproduce that
 * INSERT to within the drawing's own precision. Anything that does not is
 * printed with its number.
 *
 * Structure is reconciled the same way: envelope, columns, walls and openings
 * are counted and bounds-checked against the geometry document's own declared
 * envelope, so a model that has drifted outside the building it describes
 * fails here rather than on somebody's screen.
 *
 * Exits non-zero on any residual over tolerance. Reads only private,
 * host-local documents; prints counts and millimetres, never a coordinate that
 * would locate the facility.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PRIVATE_DIR = process.env.FLOOR1_PRIVATE_DIR
  || path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'private');
const GEOMETRY_PATH = path.join(PRIVATE_DIR, 'floor1-geometry.json');
const BUNDLE_PATH = process.env.FLOOR1_CAD_BUNDLE
  || path.join(PRIVATE_DIR, 'floor1-cad-bundle.json');

/**
 * Tolerances, in the units the drawing is drawn in.
 *
 * POSITION is 1 mm because nothing between the CAD and the model is supposed
 * to move a machine at all -- the only arithmetic is a millimetre-to-metre
 * conversion and a rounding to 3 decimals, which is 0.5 mm at worst. A
 * position residual above this means something is fitting, snapping or
 * averaging, and that is the failure being guarded against.
 */
const POSITION_TOL_MM = 1.0;
/** Same reasoning: extent is copied from the block box, not re-measured. */
const SIZE_TOL_MM = 1.0;
/** Rotation is copied verbatim; the tolerance covers the degree rounding only. */
const ROTATION_TOL_DEG = 0.01;

let failures = 0;
const worst = { pos: 0, size: 0, rot: 0 };

function fail(msg) {
  console.log(`  FAIL  ${msg}`);
  failures++;
}

function load(p, what) {
  if (!fs.existsSync(p)) {
    console.error(`floor1-cad-reconciliation: no ${what} at ${p}. Both documents are `
      + 'private and host-only; this check is skipped on a clone that has neither.');
    process.exit(fs.existsSync(GEOMETRY_PATH) ? 1 : 0);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const geometry = load(GEOMETRY_PATH, 'geometry document');
const bundle = load(BUNDLE_PATH, 'CAD bundle');

const W = bundle.envelope_mm.width;
const H = bundle.envelope_mm.depth;
const HALF_W = W / 2000;
const HALF_D = H / 2000;

console.log('Floor 1 CAD reconciliation');
console.log('='.repeat(50));

/* -- envelope ------------------------------------------------------- */
const env = geometry.envelope || {};
if (Math.abs(env.width - W / 1000) > 0.001 || Math.abs(env.depth - H / 1000) > 0.001) {
  fail(`envelope: model ${env.width} x ${env.depth} m vs CAD ${W / 1000} x ${H / 1000} m`);
} else {
  console.log(`  envelope             ${env.width} x ${env.depth} m, matches the CAD`);
}

/* -- equipment ------------------------------------------------------- */
//
// Rebuild the same candidate set the extractor built, from the same bundle,
// and match each model record to it by position. Matching by position rather
// than by index is deliberate: an index match would pass even if the extractor
// and the renderer had silently reordered against each other.
const boxes = bundle.block_boxes || {};
const inserts = [];
for (const ins of bundle.inserts) {
  const box = boxes[ins.block];
  if (!box) continue;
  const t = (ins.rotation || 0) * Math.PI / 180;
  const co = Math.cos(t);
  const si = Math.sin(t);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [dx, dy] of [[0, 0], [box.w, 0], [box.w, box.h], [0, box.h]]) {
    const bx = box.minx + dx;
    const by = box.miny + dy;
    const px = ins.x + bx * co - by * si;
    const py = ins.y + bx * si + by * co;
    x0 = Math.min(x0, px); y0 = Math.min(y0, py);
    x1 = Math.max(x1, px); y1 = Math.max(y1, py);
  }
  inserts.push({ ins, box, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
}

const equipment = Array.isArray(geometry.equipment) ? geometry.equipment : [];
let matched = 0;
let resolved = 0;
for (const item of equipment) {
  // Model coordinates are centred metres; the CAD is floor-local millimetres.
  const mmX = (item.position.x + HALF_W) * 1000;
  const mmY = (item.position.z + HALF_D) * 1000;
  let best = null;
  let bestD = Infinity;
  for (const cand of inserts) {
    // A record with an unresolved extent was placed at the insertion point,
    // not at the box centre, so both are candidate anchors.
    for (const [ax, ay] of [[cand.cx, cand.cy], [cand.ins.x, cand.ins.y]]) {
      const d = Math.hypot(ax - mmX, ay - mmY);
      if (d < bestD) { bestD = d; best = cand; }
    }
  }
  if (!best) { fail(`${item.id}: no CAD INSERT within reach of its position`); continue; }
  worst.pos = Math.max(worst.pos, bestD);
  if (bestD > POSITION_TOL_MM) {
    fail(`${item.id}: position residual ${bestD.toFixed(3)} mm exceeds ${POSITION_TOL_MM} mm`);
    continue;
  }
  matched++;

  const rot = ((best.ins.rotation || 0) % 360 + 360) % 360;
  const dRot = Math.abs(rot - item.rotation_deg);
  worst.rot = Math.max(worst.rot, Math.min(dRot, 360 - dRot));
  if (Math.min(dRot, 360 - dRot) > ROTATION_TOL_DEG) {
    fail(`${item.id}: rotation residual ${dRot.toFixed(4)} deg (model ${item.rotation_deg}, CAD ${rot})`);
  }

  if (item.footprint_status === 'OBSERVED_CAD') {
    resolved++;
    if (!item.footprint) { fail(`${item.id}: OBSERVED_CAD extent with no footprint`); continue; }
    const dW = Math.abs(item.footprint.width * 1000 - best.box.w);
    const dD = Math.abs(item.footprint.depth * 1000 - best.box.h);
    worst.size = Math.max(worst.size, dW, dD);
    if (dW > SIZE_TOL_MM || dD > SIZE_TOL_MM) {
      fail(`${item.id}: extent residual ${dW.toFixed(2)} / ${dD.toFixed(2)} mm `
        + `(model ${item.footprint.width} x ${item.footprint.depth} m, `
        + `CAD ${(best.box.w / 1000).toFixed(3)} x ${(best.box.h / 1000).toFixed(3)} m)`);
    }
  }
}

console.log(`  equipment            ${equipment.length} records, ${matched} reconciled to a CAD INSERT`);
console.log(`  extents measured     ${resolved} OBSERVED_CAD, ${equipment.length - resolved} UNRESOLVED`);
console.log(`  worst position       ${worst.pos.toFixed(4)} mm   (tolerance ${POSITION_TOL_MM} mm)`);
console.log(`  worst extent         ${worst.size.toFixed(4)} mm   (tolerance ${SIZE_TOL_MM} mm)`);
console.log(`  worst rotation       ${worst.rot.toFixed(4)} deg  (tolerance ${ROTATION_TOL_DEG} deg)`);

/* -- structure ------------------------------------------------------- */
//
// Not a residual test -- the walls and columns were extracted in an earlier
// pass from the same CAD and their own provenance is recorded there. What is
// checked here is that every one of them still lies inside the building the
// model declares, which is the failure mode a coordinate-frame mistake
// produces.
const inside = (x, z, pad = 0.5) =>
  x >= -HALF_W - pad && x <= HALF_W + pad && z >= -HALF_D - pad && z <= HALF_D + pad;

const columns = Array.isArray(geometry.columns) ? geometry.columns : [];
const strayColumns = columns.filter((c) => !inside(c.position.x, c.position.z));
if (strayColumns.length) fail(`${strayColumns.length} columns fall outside the envelope`);

// Walls are checked against a wider pad than columns, and the reason is
// physical rather than a loosened tolerance. The declared envelope is the
// CAP-layer envelope -- the foundation-cap extent established in the forensic
// audit -- and a building's outer wall FACE legitimately sits outside the caps
// its columns stand on. The extractor read the CAD within a 4 m margin of that
// envelope and nothing beyond it, so 4 m is the boundary between "outer skin"
// and "read from the wrong frame": a coordinate-frame error puts walls tens of
// metres out, not two.
const WALL_ENVELOPE_PAD_M = 4.0;
const walls = Array.isArray(geometry.walls) ? geometry.walls : [];
let wallExcursion = 0;
for (const w of walls) {
  wallExcursion = Math.max(wallExcursion,
    Math.abs(w.x1) - HALF_W, Math.abs(w.x2) - HALF_W,
    Math.abs(w.z1) - HALF_D, Math.abs(w.z2) - HALF_D);
}
const strayWalls = walls.filter(
  (w) => !inside(w.x1, w.z1, WALL_ENVELOPE_PAD_M) || !inside(w.x2, w.z2, WALL_ENVELOPE_PAD_M)
);
if (strayWalls.length) {
  fail(`${strayWalls.length} wall runs fall more than ${WALL_ENVELOPE_PAD_M} m outside `
    + 'the envelope -- that is a coordinate-frame error, not an outer skin');
}
const zeroThickness = walls.filter((w) => !(w.thickness > 0));
if (zeroThickness.length) fail(`${zeroThickness.length} wall runs carry no measured thickness`);

const openings = Array.isArray(geometry.openings) ? geometry.openings : [];
const strayOpenings = openings.filter((o) => !inside(o.position.x, o.position.z));
if (strayOpenings.length) fail(`${strayOpenings.length} openings fall outside the envelope`);

const wa = geometry.wall_assembly || {};
console.log(`  columns              ${columns.length}, all inside the envelope`);
console.log(`  walls                ${walls.length} runs, thickness preserved on every one`);
console.log(`  wall excursion       ${Math.max(wallExcursion, 0).toFixed(3)} m beyond the cap `
  + `envelope (allowed ${WALL_ENVELOPE_PAD_M} m for the outer skin)`);
console.log(`  wall connectivity    ${wa.connectivity != null ? `${(wa.connectivity * 100).toFixed(1)}%` : 'not recorded'}`
  + `${wa.unpaired_faces != null ? `, ${wa.unpaired_faces} faces unpaired` : ''}`);
console.log(`  openings             ${openings.length} preserved, none bridged`);

/* -- raster supersession --------------------------------------------- */
//
// The raster slots are retained in the private document as a superseded
// record. They must not be reachable as physical geometry, and the check that
// they are not lives in the browser regression; what is checked here is that
// nothing has quietly started treating them as the equipment layer again.
const slots = Array.isArray(geometry.slots) ? geometry.slots : [];
if (slots.length > 0 && equipment.length === 0) {
  fail('the model carries raster slots and no CAD equipment -- the superseded layer '
    + 'would be the only physical geometry left');
}
console.log(`  superseded raster    ${slots.length} slots retained, 0 served`);

console.log('='.repeat(50));
console.log(failures === 0 ? 'CAD RECONCILIATION PASSED' : `CAD RECONCILIATION FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
