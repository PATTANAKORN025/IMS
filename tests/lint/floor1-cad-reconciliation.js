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
const frame = require('../../scripts/lib/floor1-frame');
const blocks = require('../../scripts/lib/cad-blocks');

const PRIVATE_DIR = process.env.FLOOR1_PRIVATE_DIR
  || path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'private');
const GEOMETRY_PATH = path.join(PRIVATE_DIR, 'floor1-geometry.json');
const BUNDLE_PATH = process.env.FLOOR1_CAD_BUNDLE
  || path.join(PRIVATE_DIR, 'floor1-cad-bundle.json');
const EQUIPMENT_REFERENCE_PATH = path.join(PRIVATE_DIR, 'floor1-equipment-reference.json');

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

/**
 * Wall reconstruction ratchets.
 *
 * FIDELITY is the fraction of the wall face the model draws that actually
 * exists in the drawing. It is set just under the measured 99.8% because the
 * only wall length in the model the drawing does not draw is corner closure --
 * 11.5 m of extension across 257 corners, appearing on two faces each -- and
 * that is bounded by construction. A drop here means walls are being invented.
 *
 * COVERAGE is the fraction of the drawing's wall-capable line-work the model
 * reproduces, as walls or as thickness-less line-work. Measured 94.2%.
 *
 * ANGLED is a floor, not a target: the drawing contains 70 m of wall that is
 * not axis-aligned, and a model reporting none of it has regressed to
 * bucketing faces into horizontal and vertical.
 */
/**
 * Equipment reconciliation ratchets.
 *
 * POSITION is required of every record, not most of them: a machine's position
 * is copied out of an INSERT and converted, and there is no arithmetic in that
 * path that can move one.
 *
 * OVERLAP is the share of the union that the served outline and the measured
 * hull agree on. It is under 1.0 for one reason only -- the served outline is
 * capped at 16 vertices, and dropping a vertex from a hull loses a sliver --
 * so the floor is set where that loss lives and a drop below it means the
 * outline has stopped being the measurement.
 *
 * FALSE POSITIVE is floor the model claims that the drawing does not measure.
 * A rectangle's box legitimately covers more than its hull; an outline may not.
 */
const MIN_EQUIPMENT_POSITION = 0.99;
const MIN_FOOTPRINT_OVERLAP = 0.95;
const MAX_FOOTPRINT_FALSE_POSITIVE = 0.05;
const CORNER_TOL_MM = 1.0;

const MIN_WALL_FIDELITY = 0.99;
const MIN_WALL_COVERAGE = 0.93;
const MIN_ANGLED_WALLS = 10;


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
const equipReference = load(EQUIPMENT_REFERENCE_PATH, 'equipment measurement reference');

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
// Three sources are compared, not two:
//
//   the MODEL      services/factory-twin-3d/private/floor1-geometry.json,
//                  canonical metres, the document the API serves from
//   the MEASUREMENT floor1-equipment-reference.json, floor-local millimetres,
//                  written by the extractor BEFORE the canonical transform
//   the BUNDLE     an older, independent extraction of the same drawing's
//                  INSERT records
//
// The measurement checks everything downstream of it -- the frame, the
// rounding, the outline simplification, the record assembly. The bundle checks
// the measurement's own anchor against a second reading of the CAD, which is
// what stops the pair being self-consistently wrong.
const referenceById = new Map();
for (const r of (equipReference.equipment || [])) referenceById.set(r.id, r);

// A second, independent reading of the insertion points, from the older bundle.
const bundleAnchors = (bundle.inserts || []).map((i) => [i.x, i.y]);

const equipment = Array.isArray(geometry.equipment) ? geometry.equipment : [];
let matched = 0;
let resolved = 0;
let approximated = 0;
let unresolvedCount = 0;
let posWithin1 = 0;
let posWithin5 = 0;
let rotWithin = 0;
let widthWithin = 0;
let depthWithin = 0;
let anchorChecked = 0;
let worstAnchor = 0;
let worstCorner = 0;
let worstFalsePositive = 0;
let worstFalseNegative = 0;
const overlaps = [];
const rotationResiduals = [];

for (const item of equipment) {
  const ref = referenceById.get(item.id);
  if (!ref) { fail(`${item.id}: no measurement record -- nothing to reconcile against`); continue; }

  // Model coordinates are canonical centred metres; the measurement is
  // floor-local millimetres. The inverse goes through scripts/lib/floor1-frame,
  // the same module the extractors use -- reimplementing it here is how the
  // model and its own reconciliation drifted into two frames the first time.
  const mmX = frame.twinXToCad(item.position.x, HALF_W);
  const mmY = frame.twinZToCad(item.position.z, HALF_D);
  const anchor = ref.resolved ? [ref.box_mm.cx, ref.box_mm.cy] : [ref.insertion_mm.x, ref.insertion_mm.y];
  const dPos = Math.hypot(anchor[0] - mmX, anchor[1] - mmY);
  worst.pos = Math.max(worst.pos, dPos);
  if (dPos <= 1.0) posWithin1++;
  if (dPos <= 5.0) posWithin5++;
  if (dPos > POSITION_TOL_MM) {
    fail(`${item.id}: position residual ${dPos.toFixed(3)} mm exceeds ${POSITION_TOL_MM} mm`);
    continue;
  }
  matched++;

  // The insertion point, against the OTHER extraction. The bundle carries no
  // block scale, so it cannot be used for extent -- but an insertion point is
  // an insertion point, and if the two readings of the drawing disagree about
  // where a machine is placed, one of them is wrong.
  const insX = frame.twinXToCad(item.insertion_point.x, HALF_W);
  const insY = frame.twinZToCad(item.insertion_point.z, HALF_D);
  let bestAnchor = Infinity;
  for (const [ax, ay] of bundleAnchors) {
    const d = Math.hypot(ax - insX, ay - insY);
    if (d < bestAnchor) bestAnchor = d;
  }
  if (Number.isFinite(bestAnchor)) {
    anchorChecked++;
    worstAnchor = Math.max(worstAnchor, bestAnchor);
    if (bestAnchor > POSITION_TOL_MM) {
      fail(`${item.id}: insertion point is ${bestAnchor.toFixed(3)} mm from the nearest `
        + 'INSERT in the independent bundle extraction');
    }
  }

  const rotExpected = frame.cadRotationToTwinDegrees(ref.rotation_deg);
  const dRot = blocks.angleDelta(rotExpected, item.rotation_deg, 360);
  worst.rot = Math.max(worst.rot, dRot);
  if (dRot <= ROTATION_TOL_DEG) rotWithin++;
  else fail(`${item.id}: rotation residual ${dRot.toFixed(4)} deg (model ${item.rotation_deg}, CAD ${rotExpected})`);

  if (item.footprint_status === 'UNRESOLVED') {
    unresolvedCount++;
    if (item.footprint) fail(`${item.id}: UNRESOLVED but carries a footprint`);
    if (ref.resolved) fail(`${item.id}: UNRESOLVED in the model but measured in the CAD`);
    continue;
  }
  if (item.footprint_status === 'APPROXIMATION') { approximated++; continue; }

  resolved++;
  if (!item.footprint) { fail(`${item.id}: ${item.footprint_status} extent with no footprint`); continue; }
  if (!ref.resolved) { fail(`${item.id}: claims a measured extent the CAD measurement does not have`); continue; }

  const dW = Math.abs(item.footprint.width * 1000 - ref.box_mm.width);
  const dD = Math.abs(item.footprint.depth * 1000 - ref.box_mm.depth);
  worst.size = Math.max(worst.size, dW, dD);
  if (dW <= SIZE_TOL_MM) widthWithin++;
  if (dD <= SIZE_TOL_MM) depthWithin++;
  if (dW > SIZE_TOL_MM || dD > SIZE_TOL_MM) {
    fail(`${item.id}: extent residual ${dW.toFixed(2)} / ${dD.toFixed(2)} mm `
      + `(model ${item.footprint.width} x ${item.footprint.depth} m, `
      + `CAD ${(ref.box_mm.width / 1000).toFixed(3)} x ${(ref.box_mm.depth / 1000).toFixed(3)} m)`);
  }

  // The OUTLINE, in the measurement's own frame. Everything the model serves is
  // converted back and compared against the hull the CAD produced: what the
  // model draws where the drawing draws nothing is a false positive, and what
  // the drawing draws that the model does not cover is a false negative.
  const isOutline = Array.isArray(item.footprint_polygon) && item.footprint_polygon.length >= 3;
  const servedPoly = isOutline
    ? item.footprint_polygon.map((p) => [frame.twinXToCad(p.x, HALF_W), frame.twinZToCad(p.z, HALF_D)])
    : blocks.boxCorners(mmX, mmY, item.footprint.width * 1000, item.footprint.depth * 1000,
      ref.box_mm.angle_deg);
  const rawHull = ref.hull_mm;
  const interArea = blocks.polygonArea(blocks.convexIntersection(servedPoly, rawHull));
  const servedArea = blocks.polygonArea(servedPoly);
  const rawArea = blocks.polygonArea(rawHull);
  const union = servedArea + rawArea - interArea;
  if (union > 0) overlaps.push(interArea / union);
  worstFalsePositive = Math.max(worstFalsePositive, (servedArea - interArea) / rawArea);
  worstFalseNegative = Math.max(worstFalseNegative, (rawArea - interArea) / rawArea);

  // Corner residual, for a served OUTLINE only. Every vertex the model serves
  // must lie ON the measured hull, not near it: simplification may drop a
  // vertex, it may not move one. A box's corners are not hull vertices at all
  // -- a box contains the hull -- so measuring them against it would be
  // measuring the difference between a box and a shape, which the false
  // positive above already reports.
  for (const [px, py] of (isOutline ? servedPoly : [])) {
    let d = Infinity;
    for (let i = 0; i < rawHull.length; i += 1) {
      const [ax, ay] = rawHull[i];
      const [bx, by] = rawHull[(i + 1) % rawHull.length];
      const vx = bx - ax;
      const vy = by - ay;
      const len2 = vx * vx + vy * vy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
      d = Math.min(d, Math.hypot(px - (ax + t * vx), py - (ay + t * vy)));
    }
    if (Number.isFinite(d)) worstCorner = Math.max(worstCorner, d);
  }

  if (typeof item.measurement === 'object' && item.measurement
    && typeof item.measurement.rotation_residual_deg === 'number') {
    rotationResiduals.push(item.measurement.rotation_residual_deg);
  }
}

// A machine standing ON a structural column would be the signature of a
// transform error, and the columns come from a DIFFERENT extraction of the same
// drawing -- so this is an independent check on placement, not a restatement of
// it. Some overlap is real: a machine drawn around a column, or a column inside
// a machine's convex outline. It is reported with its worst case rather than
// gated, because the drawing itself decides how much is normal.
let onColumn = 0;
let worstColumnShare = 0;
const columnList = Array.isArray(geometry.columns) ? geometry.columns : [];
for (const item of equipment) {
  if (!item.footprint) continue;
  const poly = Array.isArray(item.footprint_polygon) && item.footprint_polygon.length >= 3
    ? item.footprint_polygon.map((p) => [p.x, p.z])
    : blocks.boxCorners(item.position.x, item.position.z, item.footprint.width,
      item.footprint.depth, item.rotation_deg);
  const area = blocks.polygonArea(poly);
  if (!(area > 0)) continue;
  let hit = 0;
  for (const c of columnList) {
    if (!c.position || !c.footprint) continue;
    if (Math.hypot(c.position.x - item.position.x, c.position.z - item.position.z) > 30) continue;
    const col = blocks.boxCorners(c.position.x, c.position.z, c.footprint.width, c.footprint.depth, 0);
    hit += blocks.polygonArea(blocks.convexIntersection(col, poly));
  }
  if (hit > 0) {
    onColumn += 1;
    worstColumnShare = Math.max(worstColumnShare, hit / area);
  }
}

const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
const minOverlap = overlaps.length ? Math.min(...overlaps) : 1;
const roomTally = equipment.reduce((acc, e) => {
  acc[e.zone_status] = (acc[e.zone_status] || 0) + 1;
  return acc;
}, {});

console.log(`  equipment            ${equipment.length} records, ${matched} reconciled to the CAD measurement`);
console.log(`  position             ${posWithin1} within 1 mm, ${posWithin5} within 5 mm, `
  + `worst ${worst.pos.toFixed(4)} mm`);
console.log(`  insertion vs bundle  ${anchorChecked} checked against an independent extraction, `
  + `worst ${worstAnchor.toFixed(4)} mm`);
console.log(`  rotation             ${rotWithin} within ${ROTATION_TOL_DEG} deg, worst ${worst.rot.toFixed(4)} deg`);
console.log(`  extents measured     ${resolved} MEASURED_CAD (${widthWithin} width and `
  + `${depthWithin} depth within ${SIZE_TOL_MM} mm)`);
console.log(`  extents unresolved   ${unresolvedCount} UNRESOLVED, no size claimed`);
console.log(`  outline overlap      min ${(minOverlap * 100).toFixed(1)}%, median `
  + `${((median(overlaps) || 0) * 100).toFixed(1)}% of the union with the measured hull`);
console.log(`  outline error        worst false positive ${(worstFalsePositive * 100).toFixed(1)}%, `
  + `worst false negative ${(worstFalseNegative * 100).toFixed(1)}% of the measured area`);
console.log(`  worst corner         ${worstCorner.toFixed(4)} mm off the measured hull`);
console.log(`  fitted-vs-stated rot median ${(median(rotationResiduals) || 0).toFixed(3)} deg `
  + '(corroboration only; never used to re-angle a machine)');
console.log(`  rooms                ${JSON.stringify(roomTally)}`);
console.log(`  over a column        ${onColumn} of ${equipment.filter((e) => e.footprint).length} `
  + `measured outlines touch a column from the independent column extraction, `
  + `worst ${(worstColumnShare * 100).toFixed(1)}% of one outline`);

if (equipment.length && matched / equipment.length < MIN_EQUIPMENT_POSITION) {
  fail(`only ${matched} of ${equipment.length} equipment records reconcile to the CAD `
    + `(floor ${(MIN_EQUIPMENT_POSITION * 100).toFixed(0)}%)`);
}
if (resolved && minOverlap < MIN_FOOTPRINT_OVERLAP) {
  fail(`a served outline overlaps its measured hull by only ${(minOverlap * 100).toFixed(1)}% `
    + `(floor ${(MIN_FOOTPRINT_OVERLAP * 100).toFixed(0)}%)`);
}
if (worstCorner > CORNER_TOL_MM) {
  fail(`a served outline vertex sits ${worstCorner.toFixed(3)} mm off the measured hull `
    + `(tolerance ${CORNER_TOL_MM} mm)`);
}
if (worstFalsePositive > MAX_FOOTPRINT_FALSE_POSITIVE) {
  fail(`a served outline claims ${(worstFalsePositive * 100).toFixed(1)}% more floor than the `
    + `drawing measures (limit ${(MAX_FOOTPRINT_FALSE_POSITIVE * 100).toFixed(0)}%)`);
}

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
/* -- walls against the RAW drawing ------------------------------------ */
//
// Everything above compares the wall model against the model's own declared
// envelope, which cannot see the failure that mattered: walls that are placed
// perfectly and are not walls. The structural layer carries 216 column squares
// and 96 steel sections as CLOSED loops, and a closed loop's two long sides are
// parallel, fully overlapping and a wall thickness apart. Paired blind they
// produced 82 "walls" made of structure, and no check that only looked at the
// model could tell.
//
// So the walls are measured against the raw CAD reference, in both directions,
// because either alone is meaningless. FIDELITY asks what fraction of the wall
// face the model draws exists in the drawing -- a model that invents walls
// fails this. COVERAGE asks what fraction of the drawing's wall line-work the
// model reproduces -- a model that draws nothing fails this. The reference
// separates structural sections into their own role, so the denominator is
// wall-capable line-work rather than every line on a wall layer.
{
  const rawPath = path.join(PRIVATE_DIR, 'floor1-raw-cad.json');
  if (!fs.existsSync(rawPath)) {
    console.log('  walls vs raw CAD     SKIP -- no raw reference deployed');
  } else {
    const rawDoc = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const WALL_ROLES = new Set(['structure', 'walls-interior', 'walls-cleanroom',
      'walls-movable', 'partitions']);
    const halfW = geometry.envelope.width / 2;
    const halfD = geometry.envelope.depth / 2;

    // Raw wall-capable line-work, in the model's own frame so the two sets are
    // directly comparable. The reference is in CAD millimetres, +y up.
    const rawSegs = [];
    for (const role of Array.isArray(rawDoc.roles) ? rawDoc.roles : []) {
      if (!WALL_ROLES.has(role.id)) continue;
      const s = role.segments || [];
      for (let i = 0; i < s.length; i += 4) {
        const x1 = s[i] / 1000 - halfW;
        const z1 = -(s[i + 1] / 1000 - halfD);
        const x2 = s[i + 2] / 1000 - halfW;
        const z2 = -(s[i + 3] / 1000 - halfD);
        const len = Math.hypot(x2 - x1, z2 - z1);
        if (len > 0) rawSegs.push({ x1, z1, x2, z2, len });
      }
    }

    // The model's own drawn faces: a wall is a centreline plus a thickness, and
    // what the drawing has is the two faces, so the comparison is face to face.
    const modelSegs = [];
    for (const w of walls) {
      const dx = w.x2 - w.x1;
      const dz = w.z2 - w.z1;
      const len = Math.hypot(dx, dz);
      if (!(len > 0)) continue;
      const nx = -dz / len;
      const nz = dx / len;
      const t = w.thickness || 0;
      for (const sgn of [-0.5, 0.5]) {
        modelSegs.push({
          x1: w.x1 + nx * t * sgn, z1: w.z1 + nz * t * sgn,
          x2: w.x2 + nx * t * sgn, z2: w.z2 + nz * t * sgn, len,
        });
      }
    }
    const lineSegs = (Array.isArray(geometry.wall_lines) ? geometry.wall_lines : [])
      .map((w) => ({
        x1: w.x1, z1: w.z1, x2: w.x2, z2: w.z2,
        len: Math.hypot(w.x2 - w.x1, w.z2 - w.z1),
      }))
      .filter((w) => w.len > 0);

    // A uniform grid over the segments, indexed by every cell a segment's
    // bounding box spans. Indexing sampled points instead leaves a segment
    // absent from cells it passes through, and a lookup there then reports the
    // drawing as empty where it is not -- an error that inflated this very
    // measurement twenty-fold before it was caught.
    const CELL = 2;   // metres
    const buildGrid = (segs) => {
      const g = new Map();
      for (const f of segs) {
        const cx0 = Math.floor(Math.min(f.x1, f.x2) / CELL);
        const cx1 = Math.floor(Math.max(f.x1, f.x2) / CELL);
        const cz0 = Math.floor(Math.min(f.z1, f.z2) / CELL);
        const cz1 = Math.floor(Math.max(f.z1, f.z2) / CELL);
        for (let cx = cx0; cx <= cx1; cx++) {
          for (let cz = cz0; cz <= cz1; cz++) {
            const k = `${cx}|${cz}`;
            if (!g.has(k)) g.set(k, []);
            g.get(k).push(f);
          }
        }
      }
      return g;
    };
    const distTo = (px, pz, f) => {
      const dx = f.x2 - f.x1;
      const dz = f.z2 - f.z1;
      const l2 = dx * dx + dz * dz;
      let t = l2 === 0 ? 0 : ((px - f.x1) * dx + (pz - f.z1) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (f.x1 + t * dx), pz - (f.z1 + t * dz));
    };
    const covered = (sample, grid, tol) => {
      let total = 0;
      let on = 0;
      for (const f of sample) {
        const n = Math.max(2, Math.ceil(f.len / 0.1));
        for (let i = 0; i < n; i++) {
          const px = f.x1 + ((f.x2 - f.x1) * (i + 0.5)) / n;
          const pz = f.z1 + ((f.z2 - f.z1) * (i + 0.5)) / n;
          total += f.len / n;
          const cx = Math.floor(px / CELL);
          const cz = Math.floor(pz / CELL);
          let hit = false;
          for (let ax = cx - 1; ax <= cx + 1 && !hit; ax++) {
            for (let az = cz - 1; az <= cz + 1 && !hit; az++) {
              for (const g of grid.get(`${ax}|${az}`) || []) {
                if (distTo(px, pz, g) <= tol) { hit = true; break; }
              }
            }
          }
          if (hit) on += f.len / n;
        }
      }
      return { total, on };
    };

    const TOL_M = 0.06;
    const rawGrid = buildGrid(rawSegs);
    const modelGrid = buildGrid(modelSegs.concat(lineSegs));
    const fidelity = covered(modelSegs, rawGrid, TOL_M);
    const coverage = covered(rawSegs, modelGrid, TOL_M);

    const fidPct = fidelity.total > 0 ? fidelity.on / fidelity.total : 1;
    const covPct = coverage.total > 0 ? coverage.on / coverage.total : 0;

    if (fidPct < MIN_WALL_FIDELITY) {
      fail(`only ${(fidPct * 100).toFixed(1)}% of the wall face the model draws exists in the `
        + `drawing (floor ${(MIN_WALL_FIDELITY * 100).toFixed(0)}%) -- `
        + `${((fidelity.total - fidelity.on)).toFixed(1)} m is drawn where the CAD draws nothing`);
    }
    if (covPct < MIN_WALL_COVERAGE) {
      fail(`the model reproduces only ${(covPct * 100).toFixed(1)}% of the drawing's wall `
        + `line-work (floor ${(MIN_WALL_COVERAGE * 100).toFixed(0)}%)`);
    }

    // A direction test rather than a displacement one: raw dx and dz in metres
    // would call a 30 m wall that drifts 4 mm "angled" and a short wall at 20
    // degrees "straight".
    const angled = walls.filter((w) => {
      const dx = w.x2 - w.x1;
      const dz = w.z2 - w.z1;
      const len = Math.hypot(dx, dz);
      if (len === 0) return false;
      return Math.abs(dx / len) > 0.002 && Math.abs(dz / len) > 0.002;
    });
    if (angled.length < MIN_ANGLED_WALLS) {
      fail(`${angled.length} angled walls, baseline ${MIN_ANGLED_WALLS} -- the drawing contains `
        + 'walls that are not axis-aligned, and a model with none of them has gone back to '
        + 'bucketing faces into horizontal and vertical');
    }

    // OPENINGS. A wall must not close a doorway the drawing leaves open. The
    // check is not "is an opening inside a wall body" -- on this floor the
    // drawing itself runs the wall faces straight through every door and puts
    // the door on top as a block, so that question answers "yes" for reasons
    // that have nothing to do with the model. The question that means something
    // is whether the model put wall where the DRAWING has a gap.
    let insideWall = 0;
    let closedByModel = 0;
    for (const o of openings) {
      let host = null;
      for (const w of walls) {
        const dx = w.x2 - w.x1;
        const dz = w.z2 - w.z1;
        const len = Math.hypot(dx, dz);
        if (!(len > 0)) continue;
        const ux = dx / len;
        const uz = dz / len;
        const t = ux * (o.position.x - w.x1) + uz * (o.position.z - w.z1);
        const c = -uz * (o.position.x - w.x1) + ux * (o.position.z - w.z1);
        if (t < 0.1 || t > len - 0.1) continue;
        if (Math.abs(c) > (w.thickness || 0) / 2) continue;
        host = { w, ux, uz, t };
        break;
      }
      if (!host) continue;
      insideWall++;
      // Does the drawing have line-work on BOTH faces at this exact point? If
      // it does, the wall body there is the drawing's, not the model's.
      let onFaces = 0;
      for (const sgn of [-0.5, 0.5]) {
        const px = host.w.x1 + host.ux * host.t - host.uz * (host.w.thickness || 0) * sgn;
        const pz = host.w.z1 + host.uz * host.t + host.ux * (host.w.thickness || 0) * sgn;
        const cx = Math.floor(px / CELL);
        const cz = Math.floor(pz / CELL);
        let hit = false;
        for (let ax = cx - 1; ax <= cx + 1 && !hit; ax++) {
          for (let az = cz - 1; az <= cz + 1 && !hit; az++) {
            for (const g of rawGrid.get(`${ax}|${az}`) || []) {
              if (distTo(px, pz, g) <= TOL_M) { hit = true; break; }
            }
          }
        }
        if (hit) onFaces++;
      }
      if (onFaces < 2) closedByModel++;
    }
    if (closedByModel > 0) {
      fail(`${closedByModel} opening(s) sit inside a wall body where the drawing has a gap -- `
        + 'the model closed an opening the CAD leaves open');
    }

    console.log(`  walls vs raw CAD     ${fidelity.on.toFixed(1)} of ${fidelity.total.toFixed(1)} m `
      + `of model wall face lies on drawn CAD line-work = ${(fidPct * 100).toFixed(1)}% `
      + `(floor ${(MIN_WALL_FIDELITY * 100).toFixed(0)}%)`);
    console.log(`  drawing reproduced   ${coverage.on.toFixed(1)} of ${coverage.total.toFixed(1)} m `
      + `of wall-capable CAD line-work = ${(covPct * 100).toFixed(1)}% `
      + `(floor ${(MIN_WALL_COVERAGE * 100).toFixed(0)}%)`);
    console.log(`  angled walls         ${angled.length} preserved (baseline ${MIN_ANGLED_WALLS})`);
    console.log(`  openings             ${openings.length} served, ${insideWall} inside a wall `
      + `body because the DRAWING runs its faces through them, ${closedByModel} closed by the model`);
  }
}

/* -- wall topology --------------------------------------------------- */
//
// Position and thickness are reconciled above; this is the property neither of
// those can see. A wall model can be perfectly placed, perfectly measured, and
// still be a disconnected sketch -- and a sketch cannot bound a room, which is
// exactly the state Floor 1 is in.
//
// The measurement is deliberately blunt: build a graph from the wall
// centrelines and the unpaired faces, split every segment at its crossings,
// snap coincident ends, and then count two things. Endpoints that meet nothing
// (degree 1) say how broken the model is. Enclosed regions say whether any
// room actually closes. Floor 1 currently produces exactly one enclosed region
// -- the building -- so ROOMS CANNOT BE DERIVED FROM WALLS HERE, and that is
// published rather than worked around.
//
// The baselines below are a RATCHET, not a target. They are the measured
// present state; the check fails if the numbers get worse, never if they get
// better, and any improvement is expected to move them down deliberately.
const TOPOLOGY_SNAP_M = 0.10;
const MAX_DANGLING_BASELINE = 900;
const MIN_ROOM_SIZED_BASELINE = 3;

// A served room must agree with the area the drawing prints for it to within
// this fraction. It is the same threshold the extractor uses to decide that a
// containing boundary is NOT that label's boundary, so a room that survives
// extraction and a room that passes reconciliation are the same set by
// construction -- if they ever diverge, one of the two has been edited alone.
const ROOM_AREA_TOL = 0.35;


function wallTopology(runs, faces) {
  const segs = [];
  for (const w of runs) segs.push([w.x1, w.z1, w.x2, w.z2]);
  for (const f of faces) segs.push([f.x1, f.z1, f.x2, f.z2]);

  // Split every segment at every crossing, so a tee becomes a node rather than
  // two segments that merely pass through each other.
  const cuts = segs.map(() => [0, 1]);
  for (let i = 0; i < segs.length; i++) {
    const [ax, ay, bx, by] = segs[i];
    const rx = bx - ax;
    const ry = by - ay;
    for (let j = i + 1; j < segs.length; j++) {
      const [cx, cy, dx, dy] = segs[j];
      const sx = dx - cx;
      const sy = dy - cy;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
      const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      cuts[i].push(t);
      cuts[j].push(u);
    }
  }

  const nodes = [];
  const grid = new Map();
  const nodeId = (x, y) => {
    const gx = Math.round(x / TOPOLOGY_SNAP_M);
    const gy = Math.round(y / TOPOLOGY_SNAP_M);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const bucket = grid.get(`${gx + a}:${gy + b}`);
        if (!bucket) continue;
        for (const id of bucket) {
          if (Math.hypot(nodes[id].x - x, nodes[id].y - y) <= TOPOLOGY_SNAP_M) return id;
        }
      }
    }
    const id = nodes.length;
    nodes.push({ x, y, adj: [] });
    const key = `${gx}:${gy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(id);
    return id;
  };

  const seen = new Set();
  const edges = [];
  for (let i = 0; i < segs.length; i++) {
    const [ax, ay, bx, by] = segs[i];
    const ts = cuts[i].slice().sort((p, q) => p - q);
    for (let k = 0; k + 1 < ts.length; k++) {
      if (ts[k + 1] - ts[k] < 1e-9) continue;
      const a = nodeId(ax + (bx - ax) * ts[k], ay + (by - ay) * ts[k]);
      const b = nodeId(ax + (bx - ax) * ts[k + 1], ay + (by - ay) * ts[k + 1]);
      if (a === b) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
      nodes[a].adj.push(b);
      nodes[b].adj.push(a);
    }
  }

  // Planar face traversal: from each directed half-edge, always take the next
  // edge clockwise around the arrival node. Every bounded region is walked once
  // and comes out with positive signed area; the outer boundary comes out
  // negative and is discarded.
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].adj.sort((p, q) => (
      Math.atan2(nodes[p].y - nodes[i].y, nodes[p].x - nodes[i].x)
      - Math.atan2(nodes[q].y - nodes[i].y, nodes[q].x - nodes[i].x)
    ));
  }
  const walked = new Set();
  const areas = [];
  for (const [a, b] of edges) {
    for (const [from, to] of [[a, b], [b, a]]) {
      if (walked.has(`${from}>${to}`)) continue;
      let cur = from;
      let next = to;
      let area = 0;
      let guard = 0;
      while (guard++ < 200000) {
        walked.add(`${cur}>${next}`);
        area += nodes[cur].x * nodes[next].y - nodes[next].x * nodes[cur].y;
        const adj = nodes[next].adj;
        const back = adj.indexOf(cur);
        const pick = adj[(back - 1 + adj.length) % adj.length];
        cur = next;
        next = pick;
        if (cur === from && next === to) break;
      }
      areas.push(area / 2);
    }
  }

  // Two bands, and the distinction is the whole point. A traversal produces a
  // positive region wherever any three segments happen to meet, so a raw count
  // says nothing: what matters is how many of them are the size of a room. The
  // smallest labelled area on this floor prints at 9 m2, so 9 m2 is the floor
  // of the room band, and the building itself is excluded by an upper bound.
  const bounded = areas.filter((a) => a > 1).sort((a, b) => b - a);
  const ROOM_MIN_M2 = 9;
  const ROOM_MAX_M2 = 10000;
  return {
    nodes: nodes.length,
    edges: edges.length,
    dangling: nodes.filter((n) => n.adj.length === 1).length,
    enclosed: bounded.length,
    largest: bounded.length > 0 ? bounded[0] : 0,
    roomSized: bounded.filter((a) => a >= ROOM_MIN_M2 && a <= ROOM_MAX_M2).length,
    roomMin: ROOM_MIN_M2,
  };
}

const wallLines = Array.isArray(geometry.wall_lines) ? geometry.wall_lines : [];
const strayLines = wallLines.filter(
  (w) => !inside(w.x1, w.z1, WALL_ENVELOPE_PAD_M) || !inside(w.x2, w.z2, WALL_ENVELOPE_PAD_M)
);
if (strayLines.length) {
  fail(`${strayLines.length} unpaired wall faces fall more than ${WALL_ENVELOPE_PAD_M} m `
    + 'outside the envelope');
}
const thickLines = wallLines.filter((w) => w.thickness !== undefined);
if (thickLines.length) {
  fail(`${thickLines.length} unpaired wall faces carry a thickness -- an unpaired face has `
    + 'no measured thickness and must not claim one');
}

// The zone document, when it is deployed. Two separate things are read from
// it: the drawing's own count of labelled areas, which is the yardstick the
// wall-topology figure is reported against (0 of 37 is a different statement
// from 0 of 0), and the rooms themselves, which are reconciled below.
let zoneCount = 0;
let zoneList = [];
try {
  const zonesPath = path.join(PRIVATE_DIR, 'floor1-zones.json');
  if (fs.existsSync(zonesPath)) {
    const doc = JSON.parse(fs.readFileSync(zonesPath, 'utf8'));
    zoneList = Array.isArray(doc.zones) ? doc.zones : [];
    zoneCount = zoneList.length;
  }
} catch (err) {
  zoneCount = 0;
  zoneList = [];
}

const topo = wallTopology(walls, wallLines);
if (topo.dangling > MAX_DANGLING_BASELINE) {
  fail(`wall topology regressed: ${topo.dangling} dangling endpoints, baseline `
    + `${MAX_DANGLING_BASELINE}`);
}
if (topo.roomSized < MIN_ROOM_SIZED_BASELINE) {
  fail(`wall topology regressed: ${topo.roomSized} room-sized enclosed regions, baseline `
    + `${MIN_ROOM_SIZED_BASELINE}`);
}
console.log(`  unpaired faces       ${wallLines.length} served as line-work, no thickness claimed`);
console.log(`  wall graph           ${topo.nodes} nodes, ${topo.edges} edges, `
  + `${topo.dangling} dangling ends (ratchet ${MAX_DANGLING_BASELINE})`);
console.log(`  enclosed regions     ${topo.enclosed} total, largest ${Math.round(topo.largest)} m2`);
console.log(`  room-sized regions   ${topo.roomSized} at or above ${topo.roomMin} m2 `
  + `-- against ${zoneCount} labelled areas in the drawing`);
console.log('  (rooms are NOT derived from this graph -- see the room block below)');

/* -- rooms ------------------------------------------------------------ */
//
// Rooms come from the drawing's own closed area boundaries, so the error to
// measure is not "does a polygon exist" but "is it the polygon the drawing
// says it is". The drawing prints each area's own square metreage, which is an
// independent number: it was computed by the draughtsman, not by this code,
// and it is printed as text rather than derived from the polyline. Comparing
// the traced polygon against it is therefore a real check and not a tautology.
//
// Every polygon must be a simple closed ring, and every polygon that has a
// printed area to check against must agree with it. A zone whose printed area
// refuted its only containing boundary carries no geometry at all, by design,
// and is counted here rather than passed over.
{
  const roomsWithGeometry = zoneList.filter(
    (z) => z && z.geometry && Array.isArray(z.geometry.vertices));
  const named = roomsWithGeometry.filter((z) => z.zone_name);
  const unlabelled = roomsWithGeometry.filter((z) => !z.zone_name);
  const noBoundary = zoneList.filter((z) => z && !z.geometry);

  const shoelace = (v) => {
    let s = 0;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
      s += (v[j].x * v[i].z) - (v[i].x * v[j].z);
    }
    return Math.abs(s / 2);
  };

  const degenerate = roomsWithGeometry.filter((z) => {
    const v = z.geometry.vertices;
    if (v.length < 3) return true;
    const f = v[0];
    const l = v[v.length - 1];
    // A ring is implicitly closed; an explicit repeat is a malformed ring.
    return f.x === l.x && f.z === l.z;
  });
  if (degenerate.length > 0) {
    fail(`${degenerate.length} room polygon(s) are not simple closed rings`);
  }

  const checked = [];
  for (const z of roomsWithGeometry) {
    const printed = Number(z.printed_area_m2);
    if (!Number.isFinite(printed) || printed <= 0) continue;
    const traced = shoelace(z.geometry.vertices);
    checked.push({ z, traced, printed, delta: Math.abs(traced - printed) / printed });
  }
  checked.sort((a, b) => b.delta - a.delta);
  const worst = checked.length ? checked[0] : null;
  if (worst && worst.delta > ROOM_AREA_TOL) {
    fail(`room "${worst.z.zone_name}" traces ${worst.traced.toFixed(1)} m2 against a `
      + `printed ${worst.printed} m2 (${(worst.delta * 100).toFixed(1)}%), beyond the `
      + `${(ROOM_AREA_TOL * 100).toFixed(0)}% tolerance -- a boundary that disagrees with `
      + 'the drawing this far is not that room, and must be retracted rather than served');
  }
  // Every room must be able to say which object in the drawing produced it.
  const noProvenance = roomsWithGeometry.filter((z) => !z.source_handle || !z.source_layer);
  if (noProvenance.length > 0) {
    fail(`${noProvenance.length} room polygon(s) carry no CAD handle -- a room that cannot `
      + 'name its source entity is not reconcilable');
  }
  // One CAD boundary is one room. Two rooms sharing a handle would mean the
  // same polygon was served twice under different names.
  const handles = new Set();
  for (const z of roomsWithGeometry) {
    if (handles.has(z.source_handle)) {
      fail(`CAD boundary ${z.source_handle} was used for more than one room`);
    }
    handles.add(z.source_handle);
  }

  console.log(`  rooms                ${roomsWithGeometry.length} from closed CAD boundaries `
    + `(${named.length} named, ${unlabelled.length} unlabelled), ${handles.size} distinct handles`);
  console.log(`  room area vs printed ${checked.length} checked against the drawing's own `
    + `printed area, worst ${worst ? (worst.delta * 100).toFixed(1) : '0.0'}% `
    + `(tolerance ${(ROOM_AREA_TOL * 100).toFixed(0)}%)`);
  console.log(`  rooms without a boundary  ${noBoundary.length} label(s) kept with no polygon`);

  /* -- rooms against the RAW drawing ---------------------------------- */
  //
  // Everything above compares one derived document against another derived
  // document, and both were produced by the same extractor in the same run. If
  // that extractor read the wrong layer, or applied the frame the wrong way
  // round, the comparison would agree with itself perfectly. That is not a
  // hypothetical failure on this floor: a mirrored frame did exactly that.
  //
  // So the rooms are also checked against the RAW CAD reference, which is the
  // drawing's own line-work with no pairing, merging or classification applied
  // and no transform baked in. Every room vertex must coincide with an endpoint
  // of a raw segment on the drawing's area-boundary layer. That single check
  // proves three things at once: the polygons came off the right layer, the
  // canonical transform is the one that maps raw to model, and no vertex was
  // moved between reading and serving.
  const rawPath = path.join(PRIVATE_DIR, 'floor1-raw-cad.json');
  if (!fs.existsSync(rawPath)) {
    console.log('  rooms vs raw CAD     SKIP -- no raw reference deployed');
  } else {
    const rawDoc = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const role = (Array.isArray(rawDoc.roles) ? rawDoc.roles : [])
      .find((r) => r && r.id === 'area-boundaries');
    const halfW = geometry.envelope.width / 2;
    const halfD = geometry.envelope.depth / 2;
    const seg = role && Array.isArray(role.segments) ? role.segments : [];

    // Endpoints bucketed on a 1 mm grid. A linear scan would be 32 rooms x
    // hundreds of vertices x 390 endpoints; the bucket makes it a lookup, and
    // the bucket size IS the tolerance rather than a separate number.
    const KEY = (x, z) => `${Math.round(x * 1000)}|${Math.round(z * 1000)}`;
    const endpoints = new Set();
    for (let i = 0; i < seg.length; i += 2) {
      const x = seg[i] / 1000 - halfW;
      const z = -(seg[i + 1] / 1000 - halfD);
      endpoints.add(KEY(x, z));
    }

    let vertices = 0;
    let matched = 0;
    const strays = [];
    for (const z of roomsWithGeometry) {
      for (const v of z.geometry.vertices) {
        vertices++;
        // The neighbourhood, so a vertex that rounds to the far side of a
        // millimetre boundary is not counted as a mismatch.
        let hit = false;
        for (let dx = -1; dx <= 1 && !hit; dx++) {
          for (let dz = -1; dz <= 1 && !hit; dz++) {
            if (endpoints.has(`${Math.round(v.x * 1000) + dx}|${Math.round(v.z * 1000) + dz}`)) {
              hit = true;
            }
          }
        }
        if (hit) matched++;
        else if (strays.length < 5) strays.push({ id: z.id, name: z.zone_name });
      }
    }

    if (endpoints.size === 0) {
      fail('the raw CAD reference carries no area-boundary line-work, so the rooms '
        + 'cannot be checked against the drawing');
    } else if (matched !== vertices) {
      fail(`${vertices - matched} of ${vertices} room vertices do not coincide with a raw `
        + `CAD area-boundary endpoint (first: ${strays.map((s) => s.name || s.id).join(', ')}) `
        + '-- the served rooms are not the drawing\'s own lines, or the frame disagrees');
    }
    console.log(`  rooms vs raw CAD     ${matched} of ${vertices} room vertices coincide with a `
      + `raw drawing endpoint within 1 mm (${endpoints.size} distinct endpoints)`);
    console.log(`  raw CAD reference    ${rawDoc.coverage.segments} segments carried, `
      + `${rawDoc.coverage.entities_excluded_by_layer} entities excluded across `
      + `${rawDoc.coverage.excluded_layer_count} detail layers, `
      + `${rawDoc.coverage.block_references_not_expanded} block references not expanded`);
  }
}

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
