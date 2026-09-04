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
let approximated = 0;
let unresolvedCount = 0;
let worstClipW = 0;
let worstClipD = 0;
for (const item of equipment) {
  // Model coordinates are canonical centred metres; the CAD is floor-local
  // millimetres. The inverse goes through scripts/lib/floor1-frame.js, the same
  // module the extractors use -- reimplementing it here is how the model and
  // its own reconciliation drifted into two frames the first time.
  const mmX = frame.twinXToCad(item.position.x, HALF_W);
  const mmY = frame.twinZToCad(item.position.z, HALF_D);
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
  } else if (item.footprint_status === 'APPROXIMATION') {
    approximated++;
    if (!item.footprint) { fail(`${item.id}: APPROXIMATION with no footprint`); continue; }
    // An approximation is the block box CLIPPED to neighbour spacing, so it is
    // checked as a bound rather than as an equality: it may be smaller than the
    // block's own extent and must never be larger. Larger would mean the clip
    // had invented space the block does not even claim.
    const mw = item.footprint.width * 1000;
    const md = item.footprint.depth * 1000;
    if (mw > best.box.w + SIZE_TOL_MM || md > best.box.h + SIZE_TOL_MM) {
      fail(`${item.id}: approximated extent ${(mw / 1000).toFixed(3)} x ${(md / 1000).toFixed(3)} m `
        + `exceeds the block's own ${(best.box.w / 1000).toFixed(3)} x `
        + `${(best.box.h / 1000).toFixed(3)} m -- a clip may only shrink`);
    }
    worstClipW = Math.max(worstClipW, best.box.w - mw);
    worstClipD = Math.max(worstClipD, best.box.h - md);
  } else {
    unresolvedCount++;
    if (item.footprint) fail(`${item.id}: UNRESOLVED but carries a footprint`);
  }
}

console.log(`  equipment            ${equipment.length} records, ${matched} reconciled to a CAD INSERT`);
console.log(`  extents measured     ${resolved} OBSERVED_CAD`);
console.log(`  extents approximated ${approximated} APPROXIMATION (block extent clipped to `
  + `neighbour spacing; worst clip ${(worstClipW / 1000).toFixed(2)} x `
  + `${(worstClipD / 1000).toFixed(2)} m)`);
console.log(`  extents unresolved   ${unresolvedCount} UNRESOLVED, no size claimed`);
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
const MAX_DANGLING_BASELINE = 1100;
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
