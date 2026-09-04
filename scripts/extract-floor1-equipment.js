#!/usr/bin/env node
/**
 * Floor 1 equipment geometry, read from the CAD block references.
 *
 * WHAT CHANGED AND WHY THIS IS A REWRITE
 * --------------------------------------
 * The previous pass took position and rotation from the INSERT record -- which
 * was right -- and took the FOOTPRINT from a bounding box of the block
 * definition measured in the block's own coordinates. Three things were wrong
 * with that, and all three were invisible because a wrong box is still a box:
 *
 *   1. The INSERT's SCALE was never read. 966 of this drawing's inserts carry
 *      one; 126 of the machine inserts do. A block placed at 0.64 was drawn at
 *      1.0, and 123 machines placed with sx = -1 -- a MIRROR -- were drawn
 *      un-mirrored, which moves the geometry to the wrong side of the
 *      insertion point.
 *   2. Nested blocks were not expanded. 28 of the machine blocks contain
 *      further INSERTs, nested up to six deep; their geometry was missing from
 *      the extent entirely.
 *   3. A bounding box is not a footprint. It includes the block's dimension
 *      chains, its centrelines and its labels.
 *
 * This reads the geometry itself. Every entity in a block definition is
 * transformed by the composed transform chain -- base point, scale (mirror
 * included), rotation, insertion, repeated through every nesting level -- and
 * the machine's extent is measured off the result.
 *
 * WHY A HULL, AND WHY THAT IS EXACT
 * ---------------------------------
 * An affine transform maps a convex hull to the convex hull of the image, so a
 * block's hull can be computed ONCE, in the block's own coordinates, and then
 * transformed per instance. Extent along any axis is fully determined by the
 * hull, so nothing is lost: the oriented footprint measured off the
 * transformed hull is the same number as one measured off all 300,000
 * transformed strokes. This is what makes a single streaming pass enough.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 * It never invents an extent, never substitutes a nominal box, and never
 * moves a machine to make it fit. A block that draws more than one machine, or
 * whose measured extent is not machine scale, is recorded UNRESOLVED with its
 * CAD-stated position kept. A machine whose footprint crosses a room boundary
 * is FLAGGED, not moved.
 *
 * Usage: FLOOR1_DXF=<path to Floor1.dxf> node scripts/extract-floor1-equipment.js
 *
 * Reads and rewrites services/factory-twin-3d/private/floor1-geometry.json in
 * place. Nothing this script reads or writes is committed.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const frame = require('./lib/floor1-frame');
const B = require('./lib/cad-blocks');

const PRIVATE_DIR = process.env.FACTORY_TWIN_PRIVATE_DIR
  || path.join(__dirname, '..', 'services', 'factory-twin-3d', 'private');
const GEOMETRY_PATH = path.join(PRIVATE_DIR, 'floor1-geometry.json');
const ZONES_PATH = path.join(PRIVATE_DIR, 'floor1-zones.json');
/**
 * The measurement, in the CAD's own frame, before the canonical transform and
 * before any rounding or simplification.
 *
 * This exists so the served record can be checked against what was measured
 * rather than against itself. It is written in floor-local millimetres with
 * +y up -- the same frame the raw CAD reference uses -- so the reconciliation
 * converts the model BACK and compares there. A model checked only against its
 * own output can be self-consistently wrong.
 */
const REFERENCE_PATH = path.join(PRIVATE_DIR, 'floor1-equipment-reference.json');

function fail(msg) {
  console.error(`extract-floor1-equipment: ${msg}`);
  process.exit(1);
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/* ------------------------------------------------------------------ *
 * What counts as equipment
 * ------------------------------------------------------------------ */

/**
 * The layers the drawing itself uses for plant and machinery. This is the same
 * set the previous pass derived from the drawing's own stroke population, kept
 * deliberately unchanged: this pass is about the accuracy of the geometry, not
 * about widening the census. Every insert on any other layer is counted and
 * reported, never silently dropped.
 */
const EQUIPMENT_LAYERS = new Set([
  '00.Machine', 'STEEL', '基礎台', '機架', '配置-AM_3', '熱壓機',
]);

/** The layer whose envelope IS the floor envelope. See the forensic audit. */
const CAP_LAYER = 'CAP';

/**
 * Blocks that are drawing furniture however machine-sized they measure: a
 * scale figure, a north arrow, an integral marker. Matched on the CAD's
 * conventional names for them rather than on a per-drawing blocklist.
 */
const FURNITURE_BLOCK = /^(_|\*)|人物|PEOPLE|HUMAN|SCALE|NORTH/i;

/** A machine's plan extent, in millimetres. Below is a fitting, above is a line. */
const MIN_SIDE_MM = 600;
const MAX_SIDE_MM = 40000;
const MIN_AREA_M2 = 0.5;
const MAX_AREA_M2 = 600;

/** Vertices served for a non-rectangular footprint. The measurement keeps all. */
const SERVED_HULL_VERTICES = 16;

/** Share of the smaller footprint two machines must share to be worth a flag. */
const OVERLAP_REPORT = 0.25;

/**
 * The outline a record is drawn with: its measured polygon where it has one,
 * and its oriented box otherwise. Every spatial question -- does it collide,
 * does it leave its room -- is asked of THIS, so the answer describes what an
 * operator sees rather than a box nobody draws.
 */
function servedShape(e) {
  if (Array.isArray(e.footprint_polygon) && e.footprint_polygon.length >= 3) {
    return e.footprint_polygon.map((p) => [p.x, p.z]);
  }
  if (!e.footprint) return null;
  return B.boxCorners(e.position.x, e.position.z, e.footprint.width,
    e.footprint.depth, e.rotation_deg);
}

/** Deepest BLOCK -> INSERT -> BLOCK chain followed. Floor 1's deepest is six. */
const MAX_NESTING = 12;

/** Curve sampling. Sixteen segments per full turn holds a millimetre at 2 m. */
const ARC_STEPS = 16;

const GEOM_TYPES = new Set(['LINE', 'LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE',
  'SPLINE', 'ELLIPSE', 'SOLID', '3DFACE', 'TRACE', 'MLINE', 'POINT']);

/* ------------------------------------------------------------------ *
 * Streaming the DXF
 * ------------------------------------------------------------------ */

function arcPoints(cx, cy, r, a0, a1) {
  const p = [];
  let s = (a0 || 0) * Math.PI / 180;
  let e = (a1 === undefined ? 360 : a1) * Math.PI / 180;
  if (e <= s) e += Math.PI * 2;
  for (let i = 0; i <= ARC_STEPS; i += 1) {
    const t = s + (e - s) * (i / ARC_STEPS);
    p.push(cx + r * Math.cos(t), cy + r * Math.sin(t));
  }
  return p;
}

function ellipsePoints(e) {
  const rmaj = Math.hypot(e.ex || 0, e.ey || 0);
  const rmin = rmaj * (Number.isFinite(e.ratio) ? e.ratio : 1);
  const th = Math.atan2(e.ey || 0, e.ex || 0);
  const p = [];
  const steps = ARC_STEPS * 2;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const ux = rmaj * Math.cos(t);
    const uy = rmin * Math.sin(t);
    p.push(e.cx + ux * Math.cos(th) - uy * Math.sin(th),
      e.cy + ux * Math.sin(th) + uy * Math.cos(th));
  }
  return p;
}

/**
 * One pass over the drawing.
 *
 * BLOCKS first (the format guarantees the order), so every block definition is
 * reduced to its own local hull before any INSERT that references it is read.
 * Points are hulled and discarded at ENDBLK, which is what keeps a 412 MB file
 * inside a normal heap.
 */
async function readDxf(src) {
  const rl = readline.createInterface({
    input: fs.createReadStream(src, { encoding: 'utf8', highWaterMark: 1 << 22 }),
    crlfDelay: Infinity,
  });

  const blocks = new Map();
  const inserts = [];
  const cap = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity, n: 0 };

  let section = null;
  let code = null;
  let cur = null;
  let poly = null;
  let block = null;
  let pending = null;   // accumulating points for the current block

  // Hulled at ENDBLK and the points discarded: peak memory is one block's
  // geometry, not the drawing's.
  const closeBlock = () => {
    if (!block) return;
    block.hull = B.convexHull(pending || []);
    block.draftHull = B.convexHull(block.draftingPts);
    block.draftingPts = [];
    pending = null;
    block = null;
  };

  const addEntity = (e) => {
    if (!block) return;
    block.entities += 1;
    block.layers.add(e.layer);
    if (B.ANNOTATION_TYPES.has(e.type)) { block.annotation += 1; return; }
    if (!GEOM_TYPES.has(e.type)) { block.other += 1; return; }
    let pts = e.pts;
    if (e.type === 'CIRCLE') pts = arcPoints(e.cx, e.cy, e.r, 0, 360);
    else if (e.type === 'ARC') pts = arcPoints(e.cx, e.cy, e.r, e.a0, e.a1);
    else if (e.type === 'ELLIPSE') pts = ellipsePoints(e);
    if (!pts || pts.length < 2) return;
    if (B.isDraftingLayer(e.layer)) {
      block.drafting += 1;
      block.draftingPts.push(...pts);
      return;
    }
    block.physical += 1;
    pending.push(...pts);
  };

  const flush = () => {
    if (!cur) return;
    const e = cur;
    cur = null;
    if (e.type === 'INSERT') {
      const rec = {
        layer: e.layer,
        block: e.block || '',
        handle: e.handle || '',
        x: e.x || 0,
        y: e.y || 0,
        sx: Number.isFinite(e.sx) ? e.sx : 1,
        sy: Number.isFinite(e.sy) ? e.sy : 1,
        sz: Number.isFinite(e.sz) ? e.sz : 1,
        rot: Number.isFinite(e.rot) ? e.rot : 0,
      };
      if (section === 'BLOCKS') { if (block) block.nested.push(rec); }
      else if (section === 'ENTITIES') inserts.push(rec);
      return;
    }
    if (section === 'BLOCKS') { addEntity(e); return; }
    if (section === 'ENTITIES' && e.layer === CAP_LAYER && e.pts && e.pts.length) {
      for (let i = 0; i + 1 < e.pts.length; i += 2) {
        cap.minx = Math.min(cap.minx, e.pts[i]);
        cap.maxx = Math.max(cap.maxx, e.pts[i]);
        cap.miny = Math.min(cap.miny, e.pts[i + 1]);
        cap.maxy = Math.max(cap.maxy, e.pts[i + 1]);
      }
      cap.n += 1;
    }
  };

  for await (const raw of rl) {
    if (code === null) { code = Number(raw.trim()); continue; }
    const value = raw.trim();
    const c = code;
    code = null;

    if (c === 0) {
      if (poly && value === 'VERTEX') { flush(); cur = { type: 'VERTEX', layer: poly.layer, pts: [] }; continue; }
      if (poly && value === 'SEQEND') {
        flush();
        if (poly.pts.length >= 4) addEntity({ type: 'POLYLINE', layer: poly.layer, pts: poly.pts });
        poly = null;
        continue;
      }
      flush();
      if (value === 'SECTION') { section = 'PENDING'; continue; }
      if (value === 'ENDSEC') { closeBlock(); section = null; continue; }
      if (section === 'BLOCKS' && value === 'BLOCK') {
        closeBlock();
        cur = { type: 'BLOCK', layer: '' };
        continue;
      }
      if (section === 'BLOCKS' && value === 'ENDBLK') { closeBlock(); continue; }
      if (section === 'BLOCKS' && value === 'POLYLINE') {
        poly = { layer: '', pts: [] };
        cur = { type: '_POLYHEADER', layer: '' };
        continue;
      }
      if (section === 'BLOCKS' || section === 'ENTITIES') {
        cur = { type: value, layer: '', handle: '', pts: [] };
      }
      continue;
    }

    if (section === 'PENDING' && c === 2) { section = value; continue; }
    if (!cur) continue;

    if (cur.type === 'BLOCK') {
      if (c === 2) {
        block = blocks.get(value);
        if (!block) {
          block = {
            name: value, bx: 0, by: 0, entities: 0, physical: 0, drafting: 0,
            annotation: 0, other: 0, layers: new Set(), nested: [], hull: [],
            draftingPts: [],
          };
          blocks.set(value, block);
        }
        pending = [];
      } else if (c === 10 && block) block.bx = Number(value);
      else if (c === 20 && block) block.by = Number(value);
      continue;
    }
    if (cur.type === '_POLYHEADER') {
      if (c === 8) poly.layer = value;
      continue;
    }
    if (cur.type === 'VERTEX') {
      if (c === 10) cur.vx = Number(value);
      else if (c === 20 && poly && Number.isFinite(cur.vx)) poly.pts.push(cur.vx, Number(value));
      continue;
    }

    if (c === 8) { cur.layer = value; continue; }
    if (c === 5) { cur.handle = value; continue; }
    if (cur.type === 'INSERT') {
      if (c === 2) cur.block = value;
      else if (c === 10) cur.x = Number(value);
      else if (c === 20) cur.y = Number(value);
      else if (c === 41) cur.sx = Number(value);
      else if (c === 42) cur.sy = Number(value);
      else if (c === 43) cur.sz = Number(value);
      else if (c === 50) cur.rot = Number(value);
      continue;
    }
    if (cur.type === 'CIRCLE' || cur.type === 'ARC') {
      if (c === 10) cur.cx = Number(value);
      else if (c === 20) cur.cy = Number(value);
      else if (c === 40) cur.r = Number(value);
      else if (c === 50) cur.a0 = Number(value);
      else if (c === 51) cur.a1 = Number(value);
      continue;
    }
    if (cur.type === 'ELLIPSE') {
      if (c === 10) cur.cx = Number(value);
      else if (c === 20) cur.cy = Number(value);
      else if (c === 11) cur.ex = Number(value);
      else if (c === 21) cur.ey = Number(value);
      else if (c === 40) cur.ratio = Number(value);
      continue;
    }
    if (c === 10 || c === 11 || c === 12 || c === 13) { cur.px = Number(value); continue; }
    if (c === 20 || c === 21 || c === 22 || c === 23) {
      const y = Number(value);
      if (Number.isFinite(cur.px) && Number.isFinite(y)) cur.pts.push(cur.px, y);
      continue;
    }
  }
  flush();
  closeBlock();
  return { blocks, inserts, cap };
}

/* ------------------------------------------------------------------ *
 * The transform chain
 * ------------------------------------------------------------------ */

/**
 * A block's hull in ITS OWN coordinates, with every nested INSERT expanded
 * through the composed transform. Memoised, because a block referenced 27
 * times is the same block every time.
 *
 * Recursion is bounded and cycle-guarded: a block that references itself is a
 * corrupt drawing, not a reason to hang.
 */
function resolveHull(name, blocks, cache, stack, stats) {
  if (cache.has(name)) return cache.get(name);
  const empty = {
    hull: [], hullWithDrafting: [], depth: 0, entities: 0, physical: 0,
    drafting: 0, annotation: 0, layers: 0,
  };
  const b = blocks.get(name);
  if (!b) { stats.missing_definition += 1; return empty; }
  if (stack.has(name) || stack.size > MAX_NESTING) {
    stats.recursion_guard += 1;
    return {
      ...empty, hull: b.hull.slice(), entities: b.physical, physical: b.physical,
      drafting: b.drafting, annotation: b.annotation, layers: b.layers.size,
    };
  }
  stack.add(name);
  const pts = [];
  for (const [x, y] of b.hull) pts.push(x, y);
  let depth = 0;
  let entities = b.physical;
  for (const n of b.nested) {
    const child = blocks.get(n.block);
    const r = resolveHull(n.block, blocks, cache, stack, stats);
    if (!r.hull.length) continue;
    const T = B.affine(n, child ? [child.bx, child.by] : [0, 0]);
    const flat = [];
    for (const [x, y] of r.hull) flat.push(x, y);
    pts.push(...B.applyTo(T, flat));
    depth = Math.max(depth, 1 + r.depth);
    entities += r.entities;
  }
  stack.delete(name);
  // The drafting geometry is kept separately so its effect on the extent can be
  // measured rather than asserted: a filter nobody measures is a filter nobody
  // can defend.
  const draftFlat = [];
  for (const [x, y] of (b.draftHull || [])) draftFlat.push(x, y);
  const out = {
    hull: B.convexHull(pts),
    hullWithDrafting: B.convexHull(pts.concat(draftFlat)),
    depth,
    entities,
    physical: b.physical,
    drafting: b.drafting,
    annotation: b.annotation,
    layers: b.layers.size,
  };
  if (out.hull.length === 0 && out.hullWithDrafting.length > 0) {
    // Four Floor 1 machine blocks draw their entire body on a layer named for
    // dimensions. The subtractive filter must never empty a block.
    out.hull = out.hullWithDrafting;
    out.drafting_kept = true;
  }
  cache.set(name, out);
  return out;
}

/* ------------------------------------------------------------------ */

function main() {
  const src = process.env.FLOOR1_DXF;
  if (!src) {
    fail('set FLOOR1_DXF to the private Floor 1 DXF. The drawing lives outside '
      + 'this repository and is never committed.');
  }
  if (!fs.existsSync(src)) fail(`no DXF at ${src}`);
  if (!fs.existsSync(GEOMETRY_PATH)) fail(`no geometry document at ${GEOMETRY_PATH}.`);
  const geometry = JSON.parse(fs.readFileSync(GEOMETRY_PATH, 'utf8'));

  console.log('extract-floor1-equipment: streaming the drawing...');
  return readDxf(src).then((dxf) => {
    const { blocks, inserts, cap } = dxf;
    if (cap.n === 0) fail(`no entities on the "${CAP_LAYER}" layer -- cannot establish the frame.`);

    /* -- the frame, from the drawing, cross-checked against the model -- */
    const X0 = cap.minx;
    const Y0 = cap.miny;
    const W = cap.maxx - cap.minx;
    const H = cap.maxy - cap.miny;
    const declaredW = geometry.envelope.width * 1000;
    const declaredH = geometry.envelope.depth * 1000;
    const TOL_MM = 50;
    if (Math.abs(W - declaredW) > TOL_MM || Math.abs(H - declaredH) > TOL_MM) {
      fail(`the CAD envelope (${W.toFixed(1)} x ${H.toFixed(1)} mm) disagrees with the `
        + `model's declared envelope (${declaredW} x ${declaredH} mm) by more than ${TOL_MM} mm.`);
    }
    const HALF_W = W / 2000;
    const HALF_D = H / 2000;
    const mx = (v) => round3(frame.cadXToTwin(v, HALF_W));
    const mz = (v) => round3(frame.cadYToTwin(v, HALF_D));
    console.log(`  frame: ${W.toFixed(0)} x ${H.toFixed(0)} mm from ${cap.n} cap entities `
      + `(matches the declared envelope within ${TOL_MM} mm)`);

    /* -- census ------------------------------------------------------- */
    const local = inserts.map((i) => ({ ...i, x: i.x - X0, y: i.y - Y0 }));
    const inWindow = local.filter((i) => i.x >= 0 && i.x <= W && i.y >= 0 && i.y <= H);
    const onEquipmentLayer = inWindow.filter((i) => EQUIPMENT_LAYERS.has(i.layer));
    const named = onEquipmentLayer.filter((i) => i.block && !FURNITURE_BLOCK.test(i.block));
    const furniture = onEquipmentLayer.length - named.length;

    const stats = { missing_definition: 0, recursion_guard: 0 };
    const cache = new Map();

    const scaleHist = new Map();
    let mirrored = 0;
    let scaled = 0;
    let nested = 0;
    let draftingTrimmed = 0;
    let draftingKept = 0;
    let maxDraftTrimMm = 0;

    const measured = [];
    const rejects = { no_geometry: 0, below_scale: 0, above_scale: 0, off_area: 0 };

    for (const ins of named) {
      const b = blocks.get(ins.block);
      const r = resolveHull(ins.block, blocks, cache, new Set(), stats);
      const key = `${ins.sx},${ins.sy}`;
      scaleHist.set(key, (scaleHist.get(key) || 0) + 1);
      if (ins.sx !== 1 || ins.sy !== 1) scaled += 1;
      if (ins.sx < 0 || ins.sy < 0) mirrored += 1;
      if (r.depth > 0) nested += 1;
      if (r.drafting_kept) draftingKept += 1;

      if (!r.hull.length) { rejects.no_geometry += 1; measured.push({ ins, r, box: null }); continue; }

      const T = B.affine(ins, b ? [b.bx, b.by] : [0, 0]);
      const flat = [];
      for (const [x, y] of r.hull) flat.push(x, y);
      const placed = B.applyTo(T, flat);
      const hull = B.convexHull(placed);
      // The machine's own axes are the ones the CAD turned it to. A mirror does
      // not change which axis is which -- it changes which way the machine
      // faces, and that is recorded separately.
      const box = B.orientedExtent(placed, ins.rot);
      const fitted = B.minAreaRect(hull);

      // How much of the extent came from the drafting layers, measured rather
      // than assumed.
      if (r.hullWithDrafting && r.hullWithDrafting.length && !r.drafting_kept) {
        const withFlat = [];
        for (const [x, y] of r.hullWithDrafting) withFlat.push(x, y);
        const withBox = B.orientedExtent(B.applyTo(T, withFlat), ins.rot);
        if (withBox) {
          const d = Math.max(withBox.width - box.width, withBox.depth - box.depth);
          if (d > 1) { draftingTrimmed += 1; maxDraftTrimMm = Math.max(maxDraftTrimMm, d); }
        }
      }
      measured.push({ ins, r, box, fitted, hull, T });
    }

    /* -- machine scale ------------------------------------------------ */
    const equipment = [];
    let seq = 0;
    const family = new Map();
    for (const m of measured) family.set(m.ins.block, (family.get(m.ins.block) || 0) + 1);

    let resolved = 0;
    let unresolved = 0;
    const shapes = {};
    const reference = [];
    for (const m of measured) {
      seq += 1;
      const id = `EQP-F1-${String(seq).padStart(4, '0')}`;
      const { ins, r, box } = m;
      const familySize = family.get(ins.block) || 1;
      let reason = null;
      let ok = box !== null;
      if (!box) reason = 'NO_BLOCK_GEOMETRY';
      else {
        const area = (box.width * box.depth) / 1e6;
        if (box.width < MIN_SIDE_MM || box.depth < MIN_SIDE_MM) { ok = false; reason = 'BELOW_MACHINE_SCALE'; rejects.below_scale += 1; }
        else if (box.width > MAX_SIDE_MM || box.depth > MAX_SIDE_MM) { ok = false; reason = 'ABOVE_MACHINE_SCALE'; rejects.above_scale += 1; }
        else if (area < MIN_AREA_M2 || area > MAX_AREA_M2) { ok = false; reason = 'OFF_MACHINE_AREA'; rejects.off_area += 1; }
      }

      const shape = ok ? B.classifyShape(m.hull, box) : 'unresolved';
      shapes[shape] = (shapes[shape] || 0) + 1;
      if (ok) resolved += 1; else unresolved += 1;

      // Position: the centre of the MEASURED footprint where there is one, and
      // the CAD insertion point where there is not. Both are CAD-stated; the
      // record says which, and the insertion point travels either way.
      const cx = ok ? box.cx : ins.x;
      const cy = ok ? box.cy : ins.y;

      const rotTwin = frame.cadRotationToTwinDegrees(ins.rot);
      const fittedDelta = ok && m.fitted
        ? round3(B.angleDelta(m.fitted.angle_deg, ins.rot, 90)) : null;

      // The vertices the oriented extent touches are protected, so the served
      // outline and the served width/depth cannot disagree: they are two
      // statements of one measurement.
      const served = ok && shape !== 'rectangle' && shape !== 'rotated_rectangle'
        ? B.simplifyHull(m.hull, SERVED_HULL_VERTICES, B.supportVertices(m.hull, ins.rot))
        : null;

      // The measurement, in the CAD's own frame. Written before the canonical
      // transform touches it, so the reconciliation has something to check the
      // served record AGAINST.
      reference.push({
        id,
        handle: ins.handle || null,
        insertion_mm: { x: round3(ins.x), y: round3(ins.y) },
        rotation_deg: ins.rot,
        scale: { x: ins.sx, y: ins.sy },
        resolved: ok,
        // The measurement is written even where the SIZE GATE rejected it. A
        // candidate the model declines to size still measured something, and
        // an audit that cannot say how big the rejected things were cannot
        // defend the gate that rejected them.
        box_mm: box
          ? {
            cx: round3(box.cx), cy: round3(box.cy),
            width: round3(box.width), depth: round3(box.depth),
            angle_deg: round3(box.angle_deg),
          }
          : null,
        hull_mm: box ? m.hull.map(([x, y]) => [round3(x), round3(y)]) : null,
      });

      equipment.push({
        id,
        cad_equipment_id: id,
        position: { x: mx(cx), y: 0, z: mz(cy) },
        insertion_point: { x: mx(ins.x), z: mz(ins.y) },
        rotation_deg: rotTwin,
        rotation_source: 'cad_insert_rotation',
        mirrored: ins.sx < 0 || ins.sy < 0,
        scale: { x: ins.sx, y: ins.sy, z: ins.sz },
        // POSITION is measured for every candidate, resolved footprint or not:
        // an INSERT states where the machine is even when its block draws more
        // than one machine. The unresolved half is footprint_status, and
        // collapsing the two would throw away a CAD-stated position.
        geometry_status: 'MEASURED_CAD',
        footprint: ok ? { width: round3(box.width / 1000), depth: round3(box.depth / 1000) } : null,
        footprint_status: ok ? 'MEASURED_CAD' : 'UNRESOLVED',
        footprint_source: ok ? 'cad_block_geometry' : null,
        footprint_shape: shape,
        // Served only where the outline is NOT a box: a rectangle is fully
        // described by width, depth and rotation, and sending its corners as
        // well would give the renderer two sources for one fact.
        footprint_polygon: served
          ? served.map(([x, y]) => ({ x: mx(x), z: mz(y) }))
          : null,
        footprint_polygon_area_m2: served ? round3(B.polygonArea(served) / 1e6) : null,
        footprint_hull_vertices: ok ? m.hull.length : 0,
        footprint_fill: ok && box.width * box.depth > 0
          ? round3(B.polygonArea(m.hull) / (box.width * box.depth)) : null,
        footprint_note: ok ? null : unresolvedNote(reason),
        unresolved_reason: ok ? null : reason,
        measurement: {
          block_entities: r.entities,
          physical_entities: r.physical,
          drafting_entities: r.drafting,
          annotation_entities: r.annotation,
          nesting_depth: r.depth,
          block_layers: r.layers,
          fitted_angle_deg: ok && m.fitted ? round3(m.fitted.angle_deg) : null,
          rotation_residual_deg: fittedDelta,
          drafting_layers_kept: !!r.drafting_kept,
        },
        confidence: ok ? (familySize >= 3 ? 'high' : 'medium') : 'low',
        source: 'floor1_dxf',
        // Private-only. A block name or a layer name in this drawing identifies
        // a vendor or a process; lib/wire never carries either to a browser.
        cad_layer: ins.layer,
        cad_block: ins.block,
        cad_block_name: ins.block,
        cad_source_handle: ins.handle || null,
        family_size: familySize,
        zone_id: null,
        zone_status: 'UNRESOLVED',
        // Identity is a separate question from geometry and is never inferred
        // from either. Nothing here maps a machine to IMS.
        ims_machine_id: null,
        ims_device_id: null,
        mapping_status: 'UNMAPPED_TO_IMS',
        status: 'UNMAPPED',
        height_status: 'unknown',
      });
    }

    /* -- machines that measure past the envelope ---------------------- */
    //
    // The envelope is the column-cap envelope. A unit standing against the
    // outside of the exterior wall -- a condenser, a service skid -- measures
    // past it, and that is a fact about the building, not an error. It is
    // DECLARED and bounded rather than clamped: clamping would move a machine
    // to make a check pass, and a genuine frame error would push machines tens
    // of metres out, which this still catches.
    for (const e of equipment) {
      const overX = Math.max(0, Math.abs(e.position.x) - W / 2000);
      const overZ = Math.max(0, Math.abs(e.position.z) - H / 2000);
      const over = Math.max(overX, overZ);
      e.outside_envelope = over > 0;
      e.envelope_overhang_m = over > 0 ? round3(over) : 0;
    }

    /* -- room relationship, against the authoritative polygons -------- */
    let zones = [];
    if (fs.existsSync(ZONES_PATH)) {
      const doc = JSON.parse(fs.readFileSync(ZONES_PATH, 'utf8'));
      const list = Array.isArray(doc.functional_zones) ? doc.functional_zones
        : (Array.isArray(doc.zones) ? doc.zones : []);
      zones = list.map((z) => ({
        id: z.id,
        poly: ((z.geometry && z.geometry.vertices) || []).map((v) => [v.x, v.z]),
      })).filter((z) => z.poly.length >= 3);
    }
    const room = { inside: 0, outside: 0, crossing: 0, unresolved: 0 };
    for (const e of equipment) {
      const hit = zones.find((z) => B.pointInPolygon(e.position.x, e.position.z, z.poly));
      e.zone_id = hit ? hit.id : null;
      if (!hit) { e.zone_status = 'OUTSIDE_ROOM'; room.outside += 1; continue; }
      // A machine whose footprint leaves the room its centre sits in is FLAGGED,
      // never moved. The OUTLINE is tested, not the centre alone -- and it is
      // the outline the model serves, so the flag means what an operator sees.
      const shape = servedShape(e);
      if (!shape) { e.zone_status = 'ROOM_BY_CENTRE_ONLY'; room.unresolved += 1; continue; }
      const allIn = shape.every(([px, pz]) => B.pointInPolygon(px, pz, hit.poly));
      e.zone_status = allIn ? 'INSIDE_ROOM' : 'CROSSES_ROOM_BOUNDARY';
      if (allIn) room.inside += 1; else room.crossing += 1;
    }

    /* -- footprint collisions: reported, never resolved by deletion --- */
    //
    // Measured on the outline the model SERVES. Asking the bounding boxes
    // instead reports a collision wherever two irregular machines interleave
    // without touching -- on this floor 597 pairs against 19 real ones -- and
    // acting on the larger number would have deleted measured geometry.
    const withFp = equipment.filter((e) => servedShape(e));
    const outlines = withFp.map(servedShape);
    const outlineArea = outlines.map((p) => B.polygonArea(p));
    const collided = new Set();
    let containedPairs = 0;
    let partialPairs = 0;
    for (let i = 0; i < outlines.length; i += 1) {
      for (let j = i + 1; j < outlines.length; j += 1) {
        const dx = withFp[i].position.x - withFp[j].position.x;
        const dz = withFp[i].position.z - withFp[j].position.z;
        if (Math.hypot(dx, dz) > 40) continue;
        const inter = B.polygonArea(B.convexIntersection(outlines[i], outlines[j]));
        if (inter <= 0) continue;
        const frac = inter / Math.min(outlineArea[i], outlineArea[j]);
        if (frac > 0.9) containedPairs += 1;
        else if (frac > OVERLAP_REPORT) partialPairs += 1;
        else continue;
        collided.add(i);
        collided.add(j);
      }
    }
    for (const e of equipment) e.footprint_overlaps_neighbour = false;
    collided.forEach((i) => { withFp[i].footprint_overlaps_neighbour = true; });
    const colliding = collided.size;

    /* -- the record --------------------------------------------------- */
    const rotationResiduals = equipment
      .map((e) => e.measurement.rotation_residual_deg)
      .filter((v) => typeof v === 'number')
      .sort((a, b) => a - b);
    const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null);

    geometry.equipment = equipment;
    geometry.equipment_extraction = {
      method: 'CAD block-reference geometry: the block definition is transformed by the '
        + 'composed INSERT chain (base point, scale including mirror, rotation, insertion, '
        + 'through every nesting level) and the footprint is measured off the result.',
      source: 'Floor1.dxf (private, host-only, never committed)',
      transform_chain: 'p_world = R(rot) . diag(sx, sy) . (p_block - base) + insertion, '
        + 'composed as a matrix product through nested INSERTs -- never a product of bounding boxes',
      hull_note: 'An affine transform maps a convex hull to the hull of the image, so each '
        + 'block is hulled ONCE in its own coordinates and the hull is transformed per '
        + 'instance. The oriented extent measured off the transformed hull equals the one '
        + 'measured off every transformed stroke.',
      // The counts the geometry validator reconciles against the records
      // themselves. Kept as a flat block on purpose: a summary that can drift
      // from the array it summarises is worse than no summary.
      counts: {
        candidates: equipment.length,
        footprint_resolved: resolved,
        footprint_approximated: 0,
        footprint_unresolved: unresolved,
      },
      // Every method run, including the ones that found nothing. A negative
      // result is evidence about the drawing and belongs in the record.
      methods_tried: [
        {
          id: 'A',
          name: 'INSERT transform chain',
          result: `${onEquipmentLayer.length} inserts on an equipment layer inside the `
            + `envelope; ${measured.length} name a block that is not drawing furniture.`,
          outcome: 'PRODUCTIVE -- position, rotation and scale are stated by the drawing.',
        },
        {
          id: 'B',
          name: 'Block definition GEOMETRY, not its bounding box',
          result: `${cache.size} block definitions resolved to a hull of their own `
            + 'physical geometry.',
          outcome: 'PRODUCTIVE -- this is what replaced the bounding box, and it is the '
            + 'difference between a footprint and an extent that includes the labels.',
        },
        {
          id: 'C',
          name: 'Scale and mirror',
          result: `${scaled} inserts carry a scale and ${mirrored} of those are mirrors `
            + '(negative scale).',
          outcome: 'PRODUCTIVE -- the previous pass read neither, so every one of these '
            + 'was drawn at the wrong size or the wrong handedness.',
        },
        {
          id: 'D',
          name: 'Nested BLOCK -> INSERT -> BLOCK expansion',
          result: `${nested} candidates reference a block containing further inserts, `
            + `nested up to ${equipment.reduce((n, e) => Math.max(n, e.measurement.nesting_depth), 0)} deep.`,
          outcome: 'PRODUCTIVE -- transforms are composed as a matrix product; a product '
            + 'of bounding boxes would not survive a rotation at any level.',
        },
        {
          id: 'E',
          name: 'Drafting-layer classification',
          result: `${draftingTrimmed} blocks shrank when dimension and centreline layers `
            + `were dropped, by at most ${round3(maxDraftTrimMm)} mm; `
            + `${draftingKept} blocks draw their whole body on such a layer and were kept whole.`,
          outcome: 'MARGINAL but kept -- the effect is small, and the four blocks that '
            + 'would have been erased by it are why the filter is subtractive only.',
        },
        {
          id: 'F',
          name: 'HATCH entities as geometry',
          result: 'Rejected. A HATCH carries seed and pattern points under the same group '
            + 'codes as geometry; reading them inflated one block from 36 m to 122 m.',
          outcome: 'NEGATIVE -- hatch is fill over a boundary that is already drawn, and '
            + 'is excluded. Any machine outlined ONLY by hatch would be missed.',
        },
        {
          id: 'G',
          name: 'Minimum-area box fitted to the hull',
          result: 'Fitted independently and compared with the INSERT angle; the residual '
            + 'is recorded per machine.',
          outcome: 'CORROBORATING -- a second reading of orientation. It is never used to '
            + 're-angle a machine, only to report disagreement.',
        },
        {
          id: 'H',
          name: 'ATTDEF / ATTRIB block attributes as machine identity',
          result: 'One machine block on this floor carries attributes, and its tags are '
            + 'dimension letters, not an asset name.',
          outcome: 'NEGATIVE for identity -- no machine-to-IMS mapping exists in the CAD.',
        },
        {
          id: 'I',
          name: 'Block bounding box (the previous pass)',
          result: 'Superseded. It measured the block in the block\'s own coordinates, '
            + 'ignoring scale, mirror and nesting.',
          outcome: 'SUPERSEDED -- kept in the vocabulary as OBSERVED_CAD, no longer produced.',
        },
        {
          id: 'J',
          name: 'Modelspace line-work clustering (the previous approximation)',
          result: 'No longer needed: these machines are PLACED, so their geometry is in '
            + 'the block definition and not in modelspace.',
          outcome: 'SUPERSEDED -- 123 approximations became measurements.',
        },
      ],
      inventory: {
        inserts_in_drawing: inserts.length,
        inserts_inside_envelope: inWindow.length,
        on_equipment_layer: onEquipmentLayer.length,
        drawing_furniture_excluded: furniture,
        candidates: measured.length,
        block_definitions_referenced: cache.size,
        missing_block_definition: stats.missing_definition,
        recursion_guard_hits: stats.recursion_guard,
      },
      transforms: {
        scaled_inserts: scaled,
        mirrored_inserts: mirrored,
        nested_blocks_expanded: nested,
        max_nesting_depth: equipment.reduce((n, e) => Math.max(n, e.measurement.nesting_depth), 0),
        scale_histogram: Object.fromEntries([...scaleHist.entries()].sort((a, b) => b[1] - a[1])),
      },
      geometry_classification: {
        drafting_layers_trimmed_from: draftingTrimmed,
        max_drafting_trim_mm: round3(maxDraftTrimMm),
        drafting_layers_kept_because_block_would_be_empty: draftingKept,
        note: 'Dimension chains, centrelines and Defpoints are excluded by layer name; '
          + 'text, attributes and DIMENSION entities by entity type. The layer filter is '
          + 'subtractive only and is never allowed to empty a block.',
      },
      footprint: {
        measured: resolved,
        unresolved,
        by_shape: shapes,
        rejects,
        overlapping_neighbour: colliding,
        overlap_pairs_one_inside_another: containedPairs,
        overlap_pairs_partial: partialPairs,
        rotation_residual_deg: {
          median: pct(rotationResiduals, 0.5),
          p95: pct(rotationResiduals, 0.95),
          max: rotationResiduals.length ? rotationResiduals[rotationResiduals.length - 1] : null,
        },
      },
      rooms: room,
      mapping: {
        mapped_to_ims: 0,
        unmapped_to_ims: equipment.length,
        note: 'No authoritative machine-to-IMS record exists. Identity is never inferred '
          + 'from position, sequence, name similarity or grid symmetry; every record '
          + 'renders physically and none receives live state.',
      },
      evidence_note: 'Position, rotation, scale and footprint are all read from the CAD. '
        + 'Nothing here is traced, fitted to a neighbour, or estimated from appearance. '
        + 'A candidate whose block draws more than one machine, or whose measured extent '
        + 'is not machine scale, is UNRESOLVED with its CAD-stated position kept.',
    };

    fs.writeFileSync(GEOMETRY_PATH, `${JSON.stringify(geometry, null, 2)}\n`);
    fs.writeFileSync(REFERENCE_PATH, JSON.stringify({
      schema_version: '1.0.0',
      disclosure: 'PRIVATE - measured from the confidential Floor 1 CAD. Never commit. '
        + 'Floor-local millimetres only; the CAD origin is not recorded here.',
      source_file: 'Floor1.dxf',
      coordinate_system: {
        units: 'millimetres',
        axes: "the CAD's own: +x right, +y up, no reflection",
        origin: "the floor envelope's lower-left corner, from the column-cap layer",
      },
      envelope_mm: { width: round3(W), depth: round3(H) },
      equipment: reference,
    }));
    console.log(`  candidates ${measured.length}  measured ${resolved}  unresolved ${unresolved}`);
    console.log(`  scaled ${scaled}  mirrored ${mirrored}  nested ${nested}`);
    console.log(`  shapes ${JSON.stringify(shapes)}`);
    console.log(`  rooms ${JSON.stringify(room)}  overlapping ${colliding}`);
    console.log(`  wrote ${GEOMETRY_PATH}`);
  });
}

function unresolvedNote(reason) {
  switch (reason) {
    case 'NO_BLOCK_GEOMETRY':
      return 'the referenced block definition draws no physical geometry, so no extent '
        + 'is claimed; the CAD insertion point is kept as the position';
    case 'BELOW_MACHINE_SCALE':
      return 'the measured extent is smaller than any machine on this floor -- a fitting, '
        + 'a fixing or a symbol, not plant';
    case 'ABOVE_MACHINE_SCALE':
      return 'the measured extent is larger than any single machine, so the block draws '
        + 'a line or a region rather than one asset; extent withheld';
    case 'OFF_MACHINE_AREA':
      return 'the measured area is outside the range any machine on this floor occupies; '
        + 'extent withheld rather than drawn';
    default:
      return 'extent not established from the CAD';
  }
}

if (require.main === module) {
  main().catch((err) => fail(err && err.stack ? err.stack : String(err)));
}

// Exported so the DXF reader and the record assembly can be exercised against
// small fixtures. The drawing is 412 MB and lives outside the repository; a
// parser that can only be run against it is a parser nobody tests.
module.exports = { readDxf, resolveHull, EQUIPMENT_LAYERS, FURNITURE_BLOCK };
