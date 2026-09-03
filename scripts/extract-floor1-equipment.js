#!/usr/bin/env node
/**
 * Floor 1 equipment extraction from the CAD.
 *
 * The previous pass reported equipment as UNRESOLVED. That was true of the
 * method it tried -- reconstructing machine outlines from the modelspace
 * line-work on `00.Machine` -- and it stayed true after three attempts,
 * because that layer holds 97k entities in which detail drawings, plant and
 * machine outlines are drawn in the same colour with the same primitives.
 *
 * It was not true of the drawing as a whole. The machines that are *placed*
 * rather than drawn are BLOCK REFERENCES: an INSERT records an insertion
 * point and a rotation, and the BLOCK it names records the geometry that
 * insertion stamps down. Position and rotation therefore come out of the CAD
 * exactly, with no tracing and no heuristic, for every machine placed that
 * way. Footprint is a weaker claim and is treated as one: a block's bounding
 * box is the extent of everything the block draws, which for some blocks
 * includes a service envelope, a swing arc or a leader line, so it is only
 * accepted where it survives a spatial-consistency test.
 *
 * Eleven methods are run and all eleven results are recorded, including the
 * ones that found nothing -- a negative result is evidence about the drawing
 * and belongs in the record, not in a commit message.
 *
 * Nothing here hardcodes a facility coordinate. The bundle is floor-local by
 * construction and its envelope is the CAP-layer envelope established in the
 * forensic audit; this script reads that envelope and centres on it.
 *
 * Usage: FLOOR1_CAD_BUNDLE=<path> node scripts/extract-floor1-equipment.js
 *   (defaults to services/factory-twin-3d/private/floor1-cad-bundle.json)
 *
 * Writes services/factory-twin-3d/private/floor1-geometry.json in place.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const frame = require('./lib/floor1-frame');

const ROOT = path.resolve(__dirname, '..');
const PRIVATE_DIR = path.join(ROOT, 'services', 'factory-twin-3d', 'private');
const GEOMETRY_PATH = path.join(PRIVATE_DIR, 'floor1-geometry.json');
const BUNDLE_PATH = process.env.FLOOR1_CAD_BUNDLE
  || path.join(PRIVATE_DIR, 'floor1-cad-bundle.json');

function fail(msg) {
  console.error(`extract-floor1-equipment: ${msg}`);
  process.exit(1);
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/* ------------------------------------------------------------------ *
 * Layers
 *
 * The equipment layers are the ones the drawing itself names for plant and
 * machinery. They are read from the bundle rather than listed here, because
 * a layer name in this drawing identifies a process or a vendor and is
 * confidential; the bundle is private, this file is not.
 * ------------------------------------------------------------------ */

/**
 * Blocks that are not equipment however machine-sized they measure.
 *
 * Matched on the block's own role, not on a name blocklist that would need
 * updating whenever the drawing changes: a scale figure and an integral
 * marker are drawing furniture, and both are identified by the CAD's
 * conventional names for them.
 */
const FURNITURE_BLOCK = /^(_|\*)|人物|PEOPLE|SCALE|NORTH/i;

/** A machine's plan extent, in millimetres. Below is fitting, above is a sheet. */
const MIN_SIDE_MM = 600;
const MAX_SIDE_MM = 40000;
const MIN_AREA_M2 = 0.5;
const MAX_AREA_M2 = 600;

/** Two footprints sharing more than this much of the smaller one disagree. */
const OVERLAP_REJECT = 0.25;

/* ------------------------------------------------------------------ *
 * The approximation pass
 *
 * A block box that swallows its neighbour is not a machine's extent, and the
 * previous pass stopped there: 161 records carried no size at all. That is
 * honest but not useful -- a floor of position markers cannot be read against
 * the drawing.
 *
 * The CAD does draw those machines; it draws them in modelspace, on the
 * equipment layers, as line-work. So the extent is measured from the drawing
 * itself, inside a window that CANNOT reach a neighbouring machine: half the
 * distance to the nearest other equipment anchor. A cluster measured inside
 * that window is this machine's line-work or nothing.
 *
 * The result is an APPROXIMATION and is labelled one. It is not a block
 * definition and it is not a dimensioned figure; it is the extent of the
 * drawing's own strokes around a CAD-stated insertion point.
 * ------------------------------------------------------------------ */

/** Never search further than this from an anchor, whatever the spacing. */
const APPROX_WINDOW_MAX_MM = 12000;
/** Nor closer than this: below it a window holds no machine. */
const APPROX_WINDOW_MIN_MM = 600;
/** Fewer strokes than this is a fragment, not an outline. */
const APPROX_MIN_STROKES = 8;
/** The anchor must sit inside its own measured extent, not beside it. */
const APPROX_ANCHOR_MARGIN_MM = 50;

/* ------------------------------------------------------------------ */

function loadBundle() {
  if (!fs.existsSync(BUNDLE_PATH)) {
    fail(`no CAD bundle at ${BUNDLE_PATH}. It is private, host-only, and is `
      + 'regenerated from Floor1.dxf -- see docs/architecture/'
      + 'FLOOR1_DXF_FORENSIC_AUDIT.md for the pass that produces it.');
  }
  const bundle = JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
  if (!bundle.envelope_mm || !Array.isArray(bundle.inserts)) {
    fail('the CAD bundle is missing its envelope or its INSERT records.');
  }
  return bundle;
}

/** Corners of a block's bounding box, rotated and placed by its INSERT. */
function placedCorners(ins, box) {
  const t = (ins.rotation || 0) * Math.PI / 180;
  const co = Math.cos(t);
  const si = Math.sin(t);
  const pts = [];
  for (const [dx, dy] of [[0, 0], [box.w, 0], [box.w, box.h], [0, box.h]]) {
    const bx = box.minx + dx;
    const by = box.miny + dy;
    pts.push([ins.x + bx * co - by * si, ins.y + bx * si + by * co]);
  }
  return pts;
}

function aabbOf(pts) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

function overlapFraction(a, b) {
  const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (ix <= 0 || iy <= 0) return 0;
  const smaller = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
  return smaller <= 0 ? 0 : (ix * iy) / smaller;
}

/* ------------------------------------------------------------------ *
 * Method D / E -- closed outlines and reconstructed line loops
 * ------------------------------------------------------------------ */

function closedOutlines(strokes) {
  const out = [];
  for (const s of strokes) {
    if (s.type !== 'LWPOLYLINE' || !s.closed) continue;
    const w = s.maxx - s.minx;
    const h = s.maxy - s.miny;
    if (w < MIN_SIDE_MM || h < MIN_SIDE_MM) continue;
    if (w > MAX_SIDE_MM || h > MAX_SIDE_MM) continue;
    const area = (w * h) / 1e6;
    if (area < MIN_AREA_M2 || area > MAX_AREA_M2) continue;
    out.push(s);
  }
  return out;
}

/**
 * Rectangles closed by four separate LINE entities rather than by one
 * polyline. Endpoints are snapped onto a 60 mm lattice so that a drafting
 * gap does not break a loop, and only axis-aligned rectangles are claimed --
 * a rotated loop reconstructed from snapped endpoints is a guess about which
 * lines belong together, and this pass does not guess.
 */
function lineLoops(strokes) {
  const SNAP = 60;
  const key = (x, y) => `${Math.round(x / SNAP)}:${Math.round(y / SNAP)}`;
  const horiz = new Map();
  const vert = new Map();
  for (const s of strokes) {
    if (s.type !== 'LINE' || !s.p || s.p.length < 4) continue;
    const [x1, y1, x2, y2] = s.p;
    if (Math.abs(y1 - y2) < 1 && Math.abs(x1 - x2) >= MIN_SIDE_MM) {
      const k = Math.round(y1 / SNAP);
      if (!horiz.has(k)) horiz.set(k, []);
      horiz.get(k).push([Math.min(x1, x2), Math.max(x1, x2), y1]);
    } else if (Math.abs(x1 - x2) < 1 && Math.abs(y1 - y2) >= MIN_SIDE_MM) {
      const k = Math.round(x1 / SNAP);
      if (!vert.has(k)) vert.set(k, []);
      vert.get(k).push([Math.min(y1, y2), Math.max(y1, y2), x1]);
    }
  }
  // A rectangle needs two horizontal runs at different heights whose x-spans
  // agree, closed by two vertical runs at those x positions.
  const rects = [];
  const seen = new Set();
  const hKeys = [...horiz.keys()].sort((a, b) => a - b);
  for (let i = 0; i < hKeys.length; i++) {
    for (const a of horiz.get(hKeys[i])) {
      for (let j = i + 1; j < hKeys.length; j++) {
        const dy = (hKeys[j] - hKeys[i]) * SNAP;
        if (dy < MIN_SIDE_MM) continue;
        if (dy > MAX_SIDE_MM) break;
        for (const b of horiz.get(hKeys[j])) {
          if (Math.abs(a[0] - b[0]) > SNAP || Math.abs(a[1] - b[1]) > SNAP) continue;
          const w = a[1] - a[0];
          if (w < MIN_SIDE_MM || w > MAX_SIDE_MM) continue;
          const vl = vert.get(Math.round(a[0] / SNAP)) || [];
          const vr = vert.get(Math.round(a[1] / SNAP)) || [];
          const spans = (list) => list.some(
            (v) => v[0] <= a[2] + SNAP && v[1] >= b[2] - SNAP,
          );
          if (!spans(vl) || !spans(vr)) continue;
          const area = (w * dy) / 1e6;
          if (area < MIN_AREA_M2 || area > MAX_AREA_M2) continue;
          const id = `${Math.round(a[0])}:${Math.round(a[2])}:${Math.round(w)}:${Math.round(dy)}`;
          if (seen.has(id)) continue;
          seen.add(id);
          rects.push({ minx: a[0], miny: a[2], maxx: a[1], maxy: b[2] });
        }
      }
    }
  }
  return rects;
}

/* ------------------------------------------------------------------ *
 * Method F -- oriented connected components
 * ------------------------------------------------------------------ */

function connectedComponents(strokes, detailBins, CELL) {
  const SNAP = 60;
  const parent = new Map();
  const find = (a) => {
    let r = a;
    while (parent.get(r) !== r) {
      parent.set(r, parent.get(parent.get(r)));
      r = parent.get(r);
    }
    return r;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const key = (x, y) => `${Math.round(x / SNAP)}:${Math.round(y / SNAP)}`;

  const segs = [];
  for (const s of strokes) {
    if (!s.p || s.p.length < 4) continue;
    for (let i = 0; i + 3 < s.p.length; i += 2) {
      segs.push([s.p[i], s.p[i + 1], s.p[i + 2], s.p[i + 3]]);
    }
  }
  for (const [x1, y1, x2, y2] of segs) {
    for (const k of [key(x1, y1), key(x2, y2)]) if (!parent.has(k)) parent.set(k, k);
  }
  for (const [x1, y1, x2, y2] of segs) union(key(x1, y1), key(x2, y2));

  const box = new Map();
  for (const [x1, y1, x2, y2] of segs) {
    const r = find(key(x1, y1));
    const b = box.get(r);
    if (!b) {
      box.set(r, [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]);
    } else {
      b[0] = Math.min(b[0], x1, x2);
      b[1] = Math.min(b[1], y1, y2);
      b[2] = Math.max(b[2], x1, x2);
      b[3] = Math.max(b[3], y1, y2);
    }
  }
  const kept = [];
  let inDetail = 0;
  let offSize = 0;
  for (const b of box.values()) {
    const w = b[2] - b[0];
    const h = b[3] - b[1];
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    if (detailBins.has(`${Math.floor(cx / CELL)}:${Math.floor(cy / CELL)}`)) { inDetail++; continue; }
    const area = (w * h) / 1e6;
    if (w < MIN_SIDE_MM || h < MIN_SIDE_MM || w > MAX_SIDE_MM || h > MAX_SIDE_MM
      || area < MIN_AREA_M2 || area > MAX_AREA_M2) { offSize++; continue; }
    kept.push({ minx: b[0], miny: b[1], maxx: b[2], maxy: b[3] });
  }
  return { components: box.size, inDetail, offSize, kept };
}

/**
 * Measures one machine's extent from the drawing's own line-work.
 *
 * Returns null rather than a guess whenever the evidence does not support a
 * figure: too few strokes, an extent outside machine scale, or an anchor that
 * falls outside the extent it supposedly belongs to.
 *
 * Only axis-aligned placements are measured. The window is axis-aligned in CAD
 * space, so its extent equals the machine's oriented extent only when the
 * machine is turned by a multiple of 90 degrees. At any other angle the two
 * differ and the difference would be reported as size, which is exactly the
 * invention this refuses.
 */
function approximateExtent(anchor, rotationDeg, strokeIndex, cell, neighbourMm) {
  const quarter = Math.abs(((rotationDeg % 90) + 90) % 90);
  if (quarter > 0.01 && Math.abs(quarter - 90) > 0.01) return null;

  const half = Math.min(Math.max(neighbourMm / 2, APPROX_WINDOW_MIN_MM), APPROX_WINDOW_MAX_MM);
  const wx0 = anchor.x - half;
  const wx1 = anchor.x + half;
  const wy0 = anchor.y - half;
  const wy1 = anchor.y + half;

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let n = 0;
  for (let gx = Math.floor(wx0 / cell); gx <= Math.floor(wx1 / cell); gx++) {
    for (let gy = Math.floor(wy0 / cell); gy <= Math.floor(wy1 / cell); gy++) {
      for (const st of strokeIndex.get(`${gx}:${gy}`) || []) {
        // WHOLLY inside. A stroke that leaves the window may belong to the
        // neighbour, and half of a neighbour's outline would enlarge this
        // machine by something that is not part of it.
        if (st.minx < wx0 || st.maxx > wx1 || st.miny < wy0 || st.maxy > wy1) continue;
        n++;
        if (st.minx < x0) x0 = st.minx;
        if (st.miny < y0) y0 = st.miny;
        if (st.maxx > x1) x1 = st.maxx;
        if (st.maxy > y1) y1 = st.maxy;
      }
    }
  }
  if (n < APPROX_MIN_STROKES) return null;

  const ex = x1 - x0;
  const ey = y1 - y0;
  if (ex < MIN_SIDE_MM || ey < MIN_SIDE_MM || ex > MAX_SIDE_MM || ey > MAX_SIDE_MM) return null;
  const area = (ex * ey) / 1e6;
  if (area < MIN_AREA_M2 || area > MAX_AREA_M2) return null;
  // The insertion point has to be inside what is claimed to be its machine.
  if (anchor.x < x0 - APPROX_ANCHOR_MARGIN_MM || anchor.x > x1 + APPROX_ANCHOR_MARGIN_MM
    || anchor.y < y0 - APPROX_ANCHOR_MARGIN_MM || anchor.y > y1 + APPROX_ANCHOR_MARGIN_MM) return null;

  // Reported in the MACHINE's own frame, because that is what the renderer
  // extrudes and then rotates. At 90 or 270 degrees the machine's local width
  // lies along the drawing's y axis, so the two swap.
  const turned = Math.abs(((rotationDeg % 180) + 180) % 180 - 90) < 0.01;
  return {
    width: turned ? ey : ex,
    depth: turned ? ex : ey,
    strokes: n,
    window_mm: Math.round(half * 2),
  };
}

/**
 * Clips a block's extent to the spacing of its neighbours.
 *
 * The block box is real CAD evidence, and it is evidence of an UPPER BOUND: it
 * measures everything the block draws, which for these machines is the body
 * plus a service envelope, a swing arc or a leader. The neighbouring insertion
 * points are real CAD evidence too, and they bound the machine from the other
 * side: two machines whose centres are P apart along an axis cannot both be
 * wider than P along it without occupying the same floor.
 *
 * The approximation is the intersection of those two measured bounds. Nothing
 * here is chosen, tuned or guessed -- both terms come out of the drawing, and
 * a result that still overlaps a neighbour is rejected rather than shipped.
 *
 * Only axis-aligned placements are handled. At any other angle the local axes
 * do not line up with the neighbour offsets and the bound would be measuring
 * the angle rather than the machine.
 */
function clipToNeighbours(index, candidates, anchors) {
  const c = candidates[index];
  const rot = ((c.ins.rotation || 0) % 360 + 360) % 360;
  const quarter = Math.abs(((rot % 90) + 90) % 90);
  if (quarter > 0.01 && Math.abs(quarter - 90) > 0.01) return null;
  // The machine's local width lies along the drawing's y axis at 90/270.
  const turned = Math.abs(((rot % 180) + 180) % 180 - 90) < 0.01;

  const me = anchors[index];
  let widthBound = Infinity;
  let depthBound = Infinity;
  for (let j = 0; j < anchors.length; j++) {
    if (j === index) continue;
    const dxCad = anchors[j].x - me.x;
    const dyCad = anchors[j].y - me.y;
    // Offsets expressed along THIS machine's own axes.
    const lx = Math.abs(turned ? dyCad : dxCad);
    const ly = Math.abs(turned ? dxCad : dyCad);
    if (lx === 0 && ly === 0) continue;
    // A neighbour bounds the axis it is predominantly displaced along. One
    // sitting diagonally bounds neither cleanly and is left out rather than
    // attributed to whichever axis happens to be smaller.
    if (lx > ly) widthBound = Math.min(widthBound, lx);
    else if (ly > lx) depthBound = Math.min(depthBound, ly);
  }

  const width = Math.min(c.box.w, widthBound);
  const depth = Math.min(c.box.h, depthBound);
  if (!Number.isFinite(width) || !Number.isFinite(depth)) return null;
  if (width < MIN_SIDE_MM || depth < MIN_SIDE_MM) return null;
  if (width > MAX_SIDE_MM || depth > MAX_SIDE_MM) return null;
  const area = (width * depth) / 1e6;
  if (area < MIN_AREA_M2 || area > MAX_AREA_M2) return null;
  // No point approximating if nothing was actually clipped -- that record was
  // rejected for overlapping, and an unchanged box still overlaps.
  if (width >= c.box.w - 1 && depth >= c.box.h - 1) return null;

  return {
    width,
    depth,
    clipped_width_mm: Math.round(c.box.w - width),
    clipped_depth_mm: Math.round(c.box.h - depth),
  };
}

/** The world-space axis-aligned box a clipped extent occupies, for re-testing. */
function clippedAabb(index, candidates, anchors, approx) {
  const c = candidates[index];
  const rot = ((c.ins.rotation || 0) % 360 + 360) % 360;
  const turned = Math.abs(((rot % 180) + 180) % 180 - 90) < 0.01;
  const w = turned ? approx.depth : approx.width;
  const h = turned ? approx.width : approx.depth;
  const a = anchors[index];
  return { x0: a.x - w / 2, y0: a.y - h / 2, x1: a.x + w / 2, y1: a.y + h / 2 };
}

/* ------------------------------------------------------------------ */

function main() {
  const bundle = loadBundle();
  if (!fs.existsSync(GEOMETRY_PATH)) fail(`no geometry document at ${GEOMETRY_PATH}.`);
  const geometry = JSON.parse(fs.readFileSync(GEOMETRY_PATH, 'utf8'));

  const W = bundle.envelope_mm.width;
  const H = bundle.envelope_mm.depth;
  const HALF_W = W / 2000;
  const HALF_D = H / 2000;
  // Canonical frame, from scripts/lib/floor1-frame.js -- the same transform the
  // structural extractor uses. z is the negated CAD y; see that module for the
  // derivation and for the measurement that established the mirror.
  const mx = (v) => round3(frame.cadXToTwin(v, HALF_W));
  const mz = (v) => round3(frame.cadYToTwin(v, HALF_D));

  // The envelope the geometry document already declares must be the envelope
  // the bundle carries, or the two documents describe different buildings.
  const declaredW = geometry.envelope && geometry.envelope.width;
  const declaredD = geometry.envelope && geometry.envelope.depth;
  if (Math.abs(declaredW - W / 1000) > 0.001 || Math.abs(declaredD - H / 1000) > 0.001) {
    fail(`the bundle envelope (${W / 1000} x ${H / 1000} m) disagrees with the `
      + `geometry document's declared envelope (${declaredW} x ${declaredD} m).`);
  }

  const strokes = bundle.equipment_strokes || [];
  const texts = bundle.equipment_texts || [];
  const boxes = bundle.block_boxes || {};

  /* -- layer census (method C) ------------------------------------- */
  const layerCount = new Map();
  for (const s of strokes) layerCount.set(s.layer, (layerCount.get(s.layer) || 0) + 1);
  const insertLayerCount = new Map();
  for (const i of bundle.inserts) {
    insertLayerCount.set(i.layer, (insertLayerCount.get(i.layer) || 0) + 1);
  }
  // An equipment layer is one that carries equipment-layer strokes in the
  // bundle; the bundle's own layer selection is the evidence, and it is
  // private, so only counts leave this script.
  const equipmentLayers = new Set(layerCount.keys());

  /* -- detail-drawing regions (needed by F) ------------------------ */
  const CELL = 5000;
  const detailBins = new Set();
  for (const s of strokes) {
    if (s.type !== 'SPLINE' && s.type !== 'ELLIPSE') continue;
    const cx = (s.minx + s.maxx) / 2;
    const cy = (s.miny + s.maxy) / 2;
    detailBins.add(`${Math.floor(cx / CELL)}:${Math.floor(cy / CELL)}`);
  }

  /* -- A + B + C: INSERT / block reference analysis ----------------- */
  const inWindow = bundle.inserts.filter(
    (i) => i.x >= 0 && i.x <= W && i.y >= 0 && i.y <= H,
  );
  const onEquipmentLayer = inWindow.filter((i) => equipmentLayers.has(i.layer));
  const named = onEquipmentLayer.filter((i) => i.block && !FURNITURE_BLOCK.test(i.block));
  const withBox = named.filter((i) => boxes[i.block]);

  const candidates = [];
  let offSize = 0;
  for (const ins of withBox) {
    const box = boxes[ins.block];
    if (box.w < MIN_SIDE_MM || box.h < MIN_SIDE_MM
      || box.w > MAX_SIDE_MM || box.h > MAX_SIDE_MM) { offSize++; continue; }
    const area = (box.w * box.h) / 1e6;
    if (area < MIN_AREA_M2 || area > MAX_AREA_M2) { offSize++; continue; }
    const corners = placedCorners(ins, box);
    candidates.push({ ins, box, corners, aabb: aabbOf(corners) });
  }

  /* -- G + K: repeated blocks and repeated footprints --------------- */
  const family = new Map();
  for (const c of candidates) {
    if (!family.has(c.ins.block)) family.set(c.ins.block, []);
    family.get(c.ins.block).push(c);
  }
  const repeated = [...family.values()].filter((f) => f.length >= 3);
  const repeatedInstances = repeated.reduce((n, f) => n + f.length, 0);

  /* -- spatial consistency: do the footprints collide? -------------- */
  const collides = new Set();
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (overlapFraction(candidates[i].aabb, candidates[j].aabb) > OVERLAP_REJECT) {
        collides.add(i);
        collides.add(j);
      }
    }
  }

  /* -- D, E, F, H, I: the drawn-line-work methods ------------------- */
  const closed = closedOutlines(strokes);
  const loops = lineLoops(strokes);
  const comps = connectedComponents(strokes, detailBins, CELL);
  const textCount = texts.length;

  /* -- anchors, so the approximation window can be bounded by spacing --- */
  //
  // The anchor is the point the record is finally placed at, computed the same
  // way here as below, so the window is centred on the machine rather than on
  // the block's origin.
  const anchors = candidates.map((c) => {
    const bx = (c.aabb.x0 + c.aabb.x1) / 2;
    const by = (c.aabb.y0 + c.aabb.y1) / 2;
    const onFloor = bx >= 0 && bx <= W && by >= 0 && by <= H;
    return onFloor ? { x: bx, y: by } : { x: c.ins.x, y: c.ins.y };
  });
  const nearestNeighbour = anchors.map((a, i) => {
    let best = Infinity;
    for (let j = 0; j < anchors.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(a.x - anchors[j].x, a.y - anchors[j].y);
      if (d < best) best = d;
    }
    return Number.isFinite(best) ? best : APPROX_WINDOW_MAX_MM * 2;
  });

  /* -- spatial index over the drawn equipment line-work ----------------- */
  const strokeIndex = new Map();
  for (const st of strokes) {
    const gx = Math.floor(((st.minx + st.maxx) / 2) / CELL);
    const gy = Math.floor(((st.miny + st.maxy) / 2) / CELL);
    const k = `${gx}:${gy}`;
    if (!strokeIndex.has(k)) strokeIndex.set(k, []);
    strokeIndex.get(k).push(st);
  }

  /* -- approximation, in two passes ------------------------------------
   *
   * One pass cannot work here, and the first attempt at one proved it: a
   * clipped box was tested against its neighbours' UNCLIPPED boxes, so a
   * machine whose neighbour was itself oversized stayed rejected however
   * correctly it had been clipped. The test was comparing a measured extent
   * against a known-too-large one.
   *
   * So: clip everyone first, then judge everyone against everyone's clipped
   * extent. Like against like.
   */
  const clipCandidate = new Map();
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const bx = (c.aabb.x0 + c.aabb.x1) / 2;
    const by = (c.aabb.y0 + c.aabb.y1) / 2;
    if (!(bx >= 0 && bx <= W && by >= 0 && by <= H)) continue;   // centres off-floor
    if (!collides.has(i)) continue;                              // block box already usable
    const clipped = clipToNeighbours(i, candidates, anchors);
    if (clipped) clipCandidate.set(i, clipped);
  }
  // Effective extent per candidate: its clipped box where it has one, its
  // block box otherwise. This is the population the overlap test runs against.
  const effective = candidates.map((c, i) => (clipCandidate.has(i)
    ? clippedAabb(i, candidates, anchors, clipCandidate.get(i))
    : c.aabb));
  const clipAccepted = new Map();
  for (const [i, clipped] of clipCandidate) {
    const box = effective[i];
    let stillCollides = false;
    for (let j = 0; j < candidates.length && !stillCollides; j++) {
      if (j === i) continue;
      if (overlapFraction(box, effective[j]) > OVERLAP_REJECT) stillCollides = true;
    }
    if (!stillCollides) clipAccepted.set(i, clipped);
  }

  /* -- build the equipment records ---------------------------------- */
  const equipment = [];
  let resolvedFootprint = 0;
  let approximatedFootprint = 0;
  let unresolvedFootprint = 0;
  candidates.forEach((c, index) => {
    const seq = String(equipment.length + 1).padStart(4, '0');
    const collided = collides.has(index);
    const family_size = family.get(c.ins.block).length;
    // The insertion point is the block's own origin, which is rarely the
    // centre of what it draws. The centre of the placed box is what the
    // renderer needs, and it is derived from the same two CAD facts.
    let cx = (c.aabb.x0 + c.aabb.x1) / 2;
    let cy = (c.aabb.y0 + c.aabb.y1) / 2;
    // A placed box whose CENTRE lands off the floor is not describing the
    // machine: the insertion point is inside the envelope, so the block is
    // drawing something that reaches well beyond the plant it stands for --
    // a leader, a section marker, a detail callout. Its extent is rejected and
    // the insertion point is used as the position, which is still the CAD's own
    // statement about where the thing is.
    const centreOnFloor = cx >= 0 && cx <= W && cy >= 0 && cy <= H;
    if (!centreOnFloor) {
      cx = c.ins.x;
      cy = c.ins.y;
    }
    const footprintOk = !collided && centreOnFloor;
    // Only where the block box failed. A measured block extent is better
    // evidence than a cluster and is never overridden by one.
    // Two approximation methods, tried in order of evidence strength, and
    // only where the block box failed. A measured block extent is better
    // evidence than either and is never overridden.
    //
    // L, the drawing's own line-work, is tried first and almost never fires:
    // these machines are PLACED, so their geometry lives in the block
    // definition and not in modelspace. That negative is recorded rather than
    // hidden -- it is the reason M exists.
    let approx = null;
    let approxMethod = null;
    if (!footprintOk && centreOnFloor) {
      // L first, because the drawing's own strokes are stronger evidence than a
      // bound. It almost never fires -- these machines are PLACED, so their
      // geometry lives in the block definition, not in modelspace -- and that
      // negative is recorded rather than hidden.
      approx = approximateExtent(anchors[index], c.ins.rotation || 0, strokeIndex, CELL,
        nearestNeighbour[index]);
      if (approx) approxMethod = 'LOCAL_LINEWORK';
      else if (clipAccepted.has(index)) {
        approx = clipAccepted.get(index);
        approxMethod = 'NEIGHBOUR_CLIPPED';
      }
    }
    if (footprintOk) resolvedFootprint++;
    else if (approx) approximatedFootprint++;
    else unresolvedFootprint++;
    equipment.push({
      id: `EQP-F1-${seq}`,
      // Position and rotation are read straight out of the INSERT record.
      // Nothing is fitted, snapped, or averaged, so they carry the CAD's own
      // precision.
      position: { x: mx(cx), y: 0, z: mz(cy) },
      insertion_point: { x: mx(c.ins.x), z: mz(c.ins.y) },
      rotation_deg: c.ins.rotation || 0,
      geometry_status: 'MEASURED_CAD',
      // Footprint is a separate and weaker claim than position, and says so.
      footprint: footprintOk
        ? { width: round3(c.box.w / 1000), depth: round3(c.box.h / 1000) }
        : (approx
          ? { width: round3(approx.width / 1000), depth: round3(approx.depth / 1000) }
          : null),
      // Three tiers, and the middle one is the point of this pass. OBSERVED_CAD
      // is the block's own extent. APPROXIMATION is the extent of the drawing's
      // line-work inside a window that cannot reach a neighbour -- a real
      // measurement of real geometry, but of the strokes around the machine
      // rather than of a stated dimension. UNRESOLVED is still UNRESOLVED.
      footprint_status: footprintOk ? 'OBSERVED_CAD' : (approx ? 'APPROXIMATION' : 'UNRESOLVED'),
      footprint_source: footprintOk ? 'cad_block_extent'
        : (approx ? 'CAD_CORRELATED' : null),
      footprint_evidence: approx
        ? (approxMethod === 'LOCAL_LINEWORK'
          ? { method: approxMethod, strokes: approx.strokes, window_mm: approx.window_mm }
          : {
            method: approxMethod,
            clipped_width_mm: approx.clipped_width_mm,
            clipped_depth_mm: approx.clipped_depth_mm,
          })
        : null,
      footprint_note: footprintOk ? null : (approx
        ? (approxMethod === 'LOCAL_LINEWORK'
          ? 'the block bounding box measures more than the machine, so the extent '
            + 'is measured from the drawing\'s own line-work inside a window bounded '
            + 'by half the distance to the nearest neighbouring machine -- an '
            + 'approximation, not a stated dimension'
          : 'the block bounding box measures more than the machine, so it is clipped '
            + 'to the spacing of the neighbouring insertion points: two machines whose '
            + 'centres are P apart along an axis cannot both exceed P along it. Both '
            + 'bounds are CAD-measured; the result is an approximation, not a stated '
            + 'dimension')
        : (centreOnFloor
        ? 'the block bounding box overlaps a neighbouring block by more than a '
          + 'quarter of the smaller footprint, so it measures more than the '
          + 'machine, and no line-work cluster inside the neighbour-bounded '
          + 'window supported an extent -- withheld rather than drawn'
        : 'the block bounding box centres off the floor envelope, so it draws '
          + 'more than the machine -- extent withheld and the insertion point '
          + 'used as the position')),
      confidence: footprintOk && family_size >= 3 ? 'high'
        : (footprintOk || approx ? 'medium' : 'low'),
      source: 'floor1_dxf',
      // Private-only fields. lib/wire never carries these to a browser: a
      // block name and a layer name in this drawing identify a vendor or a
      // process.
      cad_layer: c.ins.layer,
      cad_block: c.ins.block,
      family_size,
      zone_id: null,
      status: 'UNMAPPED',
      ims_device_id: null,
      height_status: 'unknown',
    });
  });

  /* -- zone assignment by containment only -------------------------- */
  // Functional zones live in their own private document, exactly as the server
  // reads them -- geometry and zones are deliberately separate files.
  const zonesPath = path.join(PRIVATE_DIR, 'floor1-zones.json');
  let zones = [];
  if (fs.existsSync(zonesPath)) {
    const doc = JSON.parse(fs.readFileSync(zonesPath, 'utf8'));
    const list = Array.isArray(doc.functional_zones) ? doc.functional_zones
      : (Array.isArray(doc.zones) ? doc.zones : []);
    zones = list;
  }
  let placedInZone = 0;
  for (const e of equipment) {
    for (const z of zones) {
      const verts = z.geometry && Array.isArray(z.geometry.vertices) ? z.geometry.vertices : [];
      if (verts.length < 3) continue;
      let inside = false;
      for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
        const xi = verts[i].x;
        const zi = verts[i].z;
        const xj = verts[j].x;
        const zj = verts[j].z;
        if ((zi > e.position.z) !== (zj > e.position.z)
          && e.position.x < ((xj - xi) * (e.position.z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) { e.zone_id = z.id; placedInZone++; break; }
    }
  }

  /* -- the record ---------------------------------------------------- */
  const extraction = {
    method: 'CAD block-reference extraction with spatial-consistency gating',
    bundle_provenance: bundle.provenance,
    methods_tried: [
      {
        id: 'A', name: 'INSERT / block reference analysis',
        result: `${inWindow.length} INSERT records fall inside the floor envelope; `
          + `${onEquipmentLayer.length} sit on an equipment layer; ${named.length} `
          + 'name a block that is not drawing furniture.',
        outcome: 'PRODUCTIVE -- this is the pass that resolved equipment.',
      },
      {
        id: 'B', name: 'Block definition analysis',
        result: `${Object.keys(boxes).length} block definitions carry a bounding box; `
          + `${withBox.length} of the named INSERTs resolve to one; ${offSize} were `
          + 'rejected as outside machine scale (sheet frames, fixings, title blocks).',
        outcome: 'PRODUCTIVE for extent, but only as a weaker claim than position: a '
          + 'block box measures everything the block draws, service envelopes included.',
      },
      {
        id: 'C', name: 'Layer-aware extraction',
        result: `${equipmentLayers.size} equipment layers carry ${strokes.length} stroke `
          + 'entities; the layer set is what separates plant from architecture.',
        outcome: 'PRODUCTIVE as a filter; not sufficient on its own -- the dominant '
          + 'equipment layer also carries the detail drawings.',
      },
      {
        id: 'D', name: 'Closed polyline extraction',
        result: `${closed.length} closed polylines on equipment layers fall in the machine `
          + 'size range.',
        outcome: closed.length > 0
          ? 'CORROBORATING -- counted, but not used to place equipment: a closed outline '
            + 'on this layer is as likely to be a detail-drawing part as a machine.'
          : 'NEGATIVE -- no closed machine-scale outline exists on the equipment layers.',
      },
      {
        id: 'E', name: 'Line-loop reconstruction',
        result: `${loops.length} axis-aligned rectangles reconstruct from four separate `
          + 'LINE entities at a 60 mm snap.',
        outcome: 'CORROBORATING ONLY -- a reconstructed loop cannot be told apart from a '
          + 'table, a pit or a hatch boundary without an identifier, and none is drawn.',
      },
      {
        id: 'F', name: 'Oriented connected-component analysis',
        result: `${comps.components} connected components; ${comps.inDetail} fall inside a `
          + `free-curve detail region and ${comps.offSize} outside machine scale, leaving `
          + `${comps.kept.length}.`,
        outcome: 'NEGATIVE for identification -- this is the method the previous three '
          + 'passes used. It finds shapes, not machines.',
      },
      {
        id: 'G', name: 'Repeated-pattern detection',
        result: `${repeated.length} block families repeat three or more times, covering `
          + `${repeatedInstances} of the ${candidates.length} candidates.`,
        outcome: 'PRODUCTIVE as corroboration -- a footprint repeated across a family is '
          + 'evidence the block draws a machine rather than a one-off region, and is what '
          + 'lifts a candidate from medium to high confidence.',
      },
      {
        id: 'H', name: 'Spatial clustering',
        result: `${detailBins.size} five-metre bins carry free-curve work and are treated `
          + 'as detail-drawing regions rather than plant.',
        outcome: 'PRODUCTIVE as an exclusion -- it is how detail drawings are kept out of '
          + 'the component method, not how machines are found.',
      },
      {
        id: 'I', name: 'Label-to-geometry association',
        result: `${textCount} text entities sit on equipment and area layers.`,
        outcome: 'NOT USED -- the labels that exist are area labels and drafting notes. '
          + 'Attaching one to a machine would be a proximity guess, which is exactly the '
          + 'inference this system forbids.',
      },
      {
        id: 'J', name: 'Dimensions adjacent to equipment',
        result: 'The drawing carries dimension entities, but none is attached to a machine '
          + 'outline: the dimension chains measure the structural grid and the envelope.',
        outcome: 'NEGATIVE -- no machine in this drawing is dimensioned.',
      },
      {
        id: 'L', name: 'Local line-work extent, bounded by neighbour spacing',
        result: `${approximatedFootprint} of the ${approximatedFootprint + unresolvedFootprint} `
          + 'records whose block box was unusable resolved to an extent measured from the '
          + "drawing's own strokes inside a window of half the distance to the nearest "
          + `neighbouring machine; ${unresolvedFootprint} did not and stay UNRESOLVED.`,
        outcome: 'PRODUCTIVE as an APPROXIMATION, and labelled one. The window cannot reach '
          + 'a neighbour, only wholly-contained strokes are counted, the anchor must fall '
          + 'inside the result, and only placements turned by a multiple of 90 degrees are '
          + 'measured -- at any other angle an axis-aligned window overstates the extent.',
      },
      {
        id: 'K', name: 'Comparison against repeated footprints',
        result: `${family.size} distinct blocks back the ${candidates.length} candidates; `
          + `${candidates.length - collides.size} footprints survive the `
          + `${OVERLAP_REJECT * 100}% overlap test and ${collides.size} do not.`,
        outcome: 'PRODUCTIVE as the gate -- a block box that swallows its neighbour is '
          + 'measuring more than the machine, and its extent is withheld.',
      },
    ],
    evidence_intersection: 'Position and rotation are accepted from method A alone, '
      + 'because an INSERT record is a direct CAD statement of both and involves no '
      + 'tracing. Footprint requires A and B to agree with K -- the block box must be '
      + 'machine-scale AND must not overlap a neighbour -- and is raised to high '
      + 'confidence only when G shows the same block placed three or more times.',
    counts: {
      inserts_in_envelope: inWindow.length,
      inserts_on_equipment_layers: onEquipmentLayer.length,
      candidates: candidates.length,
      footprint_resolved: resolvedFootprint,
      footprint_approximated: approximatedFootprint,
      footprint_unresolved: unresolvedFootprint,
      block_families: family.size,
      repeated_families: repeated.length,
      assigned_to_a_zone: placedInZone,
    },
    scale_limitation: 'INSERT scale factors (group codes 41/42) are not carried by the '
      + 'bundle, so every footprint here assumes unit scale. This is why footprint is '
      + 'OBSERVED_CAD and position is MEASURED_CAD: a non-unit scale would change an '
      + 'extent without moving an insertion point.',
    identity_limitation: 'No machine here carries an IMS or MES identifier. The CAD names '
      + 'blocks, not assets, and a block name is a drawing-internal handle shared by every '
      + 'instance. Every record is UNMAPPED and stays UNMAPPED until an authoritative '
      + 'device record is supplied.',
    supersedes: 'slots[] -- the 243 raster-derived equipment positions digitised from the '
      + 'scanned schematic. They are retained in this document for the legacy schematic '
      + 'mode and are no longer served as physical geometry.',
  };

  geometry.equipment = equipment;
  geometry.equipment_extraction = extraction;
  fs.writeFileSync(GEOMETRY_PATH, `${JSON.stringify(geometry, null, 2)}\n`);

  console.log(`INSERTs in envelope          ${inWindow.length}`);
  console.log(`  on equipment layers        ${onEquipmentLayer.length}`);
  console.log(`  naming a real block        ${named.length}`);
  console.log(`  with a block definition    ${withBox.length}`);
  console.log(`  machine-scale candidates   ${candidates.length}`);
  console.log(`footprint resolved           ${resolvedFootprint}`);
  console.log(`footprint UNRESOLVED         ${unresolvedFootprint}`);
  console.log(`block families               ${family.size} (${repeated.length} repeat >=3x)`);
  console.log(`assigned to a functional zone ${placedInZone}`);
  console.log(`closed outlines (D)          ${closed.length}`);
  console.log(`line loops (E)               ${loops.length}`);
  console.log(`connected components (F)     ${comps.components} -> ${comps.kept.length} kept`);
  console.log(`detail-drawing bins (H)      ${detailBins.size}`);
  console.log(`\nwrote ${GEOMETRY_PATH}`);
}

main();
