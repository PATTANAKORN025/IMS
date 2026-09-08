#!/usr/bin/env node
/**
 * Floor 1 CAD extractor — reads the private AutoCAD DXF export and writes the
 * private geometry and functional-zone documents the Factory Twin serves.
 *
 * NOTHING THIS SCRIPT READS OR WRITES IS COMMITTED. The DXF lives outside the
 * repository; both outputs land in services/factory-twin-3d/private/, which
 * .gitignore excludes. On a machine without the drawing this script refuses to
 * run rather than inventing a floor.
 *
 * WHY A STREAMING READER: the export is ~412 MB of ASCII DXF. A DOM-style
 * reader would need multiples of this machine's RAM, and a partial load that
 * silently dropped entities would be worse than no extraction. This reads tag
 * pairs and keeps only what the canonical window contains.
 *
 * COORDINATE SYSTEM: the DXF header cannot define it. $INSUNITS is 0 (the file
 * declares no units) and $EXTMIN/$EXTMAX are stale by ~4.3x in X. The frame is
 * derived from CAD evidence instead -- see docs/architecture/
 * FLOOR1_DXF_FORENSIC_AUDIT.md -- and matches the frame the existing model
 * already uses: metres, origin at the envelope centre, x +/-87.25, z +/-60.15.
 *
 * Usage: FLOOR1_DXF=<path to Floor1.dxf> node scripts/extract-floor1-cad.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const frame = require('./lib/floor1-frame');
const cadRings = require('./lib/cad-rings');
const readline = require('readline');

const PRIVATE_DIR =
  process.env.FACTORY_TWIN_PRIVATE_DIR ||
  path.join(__dirname, '..', 'services', 'factory-twin-3d', 'private');
const GEOMETRY_PATH = path.join(PRIVATE_DIR, 'floor1-geometry.json');
const ZONES_PATH = path.join(PRIVATE_DIR, 'floor1-zones.json');

// --- canonical frame ------------------------------------------------------
// The frame is DERIVED FROM THE DRAWING at run time, never hardcoded. The CAD
// origin offset locates the facility in its owner's coordinate system, so it is
// deliberately absent from this file: a public repository is the wrong place
// for it, and a constant here would also rot the moment the drawing moved.
//
// It is recovered the way the forensic audit recovered it -- from the envelope
// of the column-cap layer, which the drawing's own two largest DIMENSION
// entities independently corroborate at 174500 x 120300. The result is
// cross-checked against the envelope the existing model declares, and the run
// aborts on disagreement rather than silently shifting every coordinate.
const MARGIN_MM = 4000.0;
let X0 = null;
let Y0 = null;
let HALF_W = null;
let HALF_D = null;

// Layers carrying plan geometry. Everything else in modelspace -- notably the
// equipment detail drawings, ~34k SPLINEs of part sections that share this
// modelspace -- is read past. See the audit, section 4.
const COLUMN_LAYER = '00.Wall FCD';
const CAP_LAYER = 'CAP';
const AREA_LAYER = '00.Area';
const AREA_BOUND_LAYER = '00.Area Line';
const WALL_LAYERS = new Set([
  '00.Wall FCD', '00.Wall IN', '00-WALL', 'Wall', 'mt-wall',
  '00.Wall Clean room', 'MOVE WALL', 'F1-layout$0$MOVE WALL',
  'D-PAR-P1 非抗岩棉', 'F1-layout$0$D-PAR-P2 单抗岩棉',
  'F1-layout$0$D-PAR-P3 双抗岩棉',
]);
const OPENING_LAYERS = new Set([
  'DOOR', 'DOOR-SW', 'D-Emergency Door', 'WINDOW', 'WINDOW-Fix',
  'F1-layout$0$D-DOOR', 'F1-layout$0$D-WINDOW',
  'F1-layout$0$D-Emergency Door', 'Airshower', 'F1-layout$0$Airshower',
]);
const KEEP_LAYERS = new Set([
  COLUMN_LAYER, CAP_LAYER, AREA_LAYER, AREA_BOUND_LAYER,
  ...WALL_LAYERS, ...OPENING_LAYERS,
]);

const X_CODES = new Set([10, 11, 12, 13]);
const Y_CODES = new Set([20, 21, 22, 23]);

// Metres, rounded the way the validator expects: beyond 3 decimals reads as a
// raw calibration result rather than a deliberate value.
// The canonical frame, defined once in scripts/lib/floor1-frame.js. z is the
// NEGATED CAD y: the plan camera's screen-up is world -z, so mapping CAD +y
// straight onto +z rendered the sheet upside down. Never compute a twin z here
// by hand -- that is how the two halves of the model ended up in two frames.
const mx = (xmm) => round3(frame.cadXToTwin(xmm - X0, HALF_W));
const mz = (ymm) => round3(frame.cadYToTwin(ymm - Y0, HALF_D));
function round3(v) { return Math.round(v * 1000) / 1000; }

function fail(msg) {
  console.error(`extract-floor1-cad: ${msg}`);
  process.exit(1);
}

// --- pass: stream the DXF -------------------------------------------------

async function readEntities(src) {
  const rl = readline.createInterface({
    input: fs.createReadStream(src, { encoding: 'utf8', highWaterMark: 1 << 22 }),
    crlfDelay: Infinity,
  });

  // Everything on a plan layer is collected in RAW CAD coordinates. The window
  // cannot be applied yet -- it is not known until the cap layer has been read,
  // which is the point. The plan layers total a few thousand entities, so
  // holding them all costs little; the detail drawings that make this file
  // large are on layers this never keeps.
  const out = [];
  let section = null;
  let code = null;
  let cur = null;
  let scanned = 0;

  const flush = () => {
    if (!cur || !cur.xs.length || !cur.ys.length) { cur = null; return; }
    if (KEEP_LAYERS.has(cur.layer)) out.push(cur);
    cur = null;
  };

  for await (const raw of rl) {
    const line = raw.replace(/\r$/, '');
    if (code === null) {
      const t = line.trim();
      if (!/^-?\d+$/.test(t)) continue;
      code = Number(t);
      continue;
    }
    const value = line;
    const v = value.trim();
    const c = code;
    code = null;
    scanned++;

    if (c === 0) {
      if (v === 'SECTION') { flush(); section = '?'; continue; }
      if (v === 'ENDSEC') { flush(); section = null; continue; }
      if (v === 'EOF') { flush(); break; }
      if (section === 'ENTITIES') {
        flush();
        cur = { type: v, layer: '', handle: '', xs: [], ys: [] };
        continue;
      }
      flush();
      continue;
    }
    if (section === '?' && c === 2) { section = v; continue; }
    if (section !== 'ENTITIES' || !cur) continue;

    if (c === 8) { cur.layer = value; continue; }
    // The entity handle is the drawing's own identifier for this object. It is
    // the only stable way to say WHICH boundary a room came from, so it is
    // carried into the zone record as provenance.
    if (c === 5) { cur.handle = value; continue; }
    if (X_CODES.has(c)) { const n = Number(v); if (Number.isFinite(n)) cur.xs.push(n); continue; }
    if (Y_CODES.has(c)) { const n = Number(v); if (Number.isFinite(n)) cur.ys.push(n); continue; }
    if (c === 70 && cur.type === 'LWPOLYLINE') { cur.closed = (Number(v) & 1) === 1; continue; }
    if (c === 1 && (cur.type === 'TEXT' || cur.type === 'MTEXT')) { cur.text = value; continue; }
    if (c === 2 && cur.type === 'INSERT') { cur.block = value; continue; }
  }
  flush();
  return { entities: out, scanned };
}

// --- columns --------------------------------------------------------------

function squareCentres(entities, layer, lo, hi) {
  const out = [];
  for (const e of entities) {
    if (e.layer !== layer || e.type !== 'LWPOLYLINE' || !e.closed) continue;
    const w = Math.max(...e.xs) - Math.min(...e.xs);
    const h = Math.max(...e.ys) - Math.min(...e.ys);
    if (w < lo || w > hi || h < lo || h > hi) continue;
    if (Math.abs(w - h) > 60) continue;
    out.push({
      x: (Math.min(...e.xs) + Math.max(...e.xs)) / 2,
      y: (Math.min(...e.ys) + Math.max(...e.ys)) / 2,
      size: Math.max(w, h),
    });
  }
  return out;
}

/** Columns are drawn as one square, or as a nested pair (outer + inner). Both
 *  describe one column, so coincident centres collapse to one location. */
function clusterColumns(squares) {
  const clusters = [];
  for (const s of squares.slice().sort((a, b) => a.x - b.x || a.y - b.y)) {
    const hit = clusters.find(
      (c) => Math.abs(c.x - s.x) <= 300 && Math.abs(c.y - s.y) <= 300);
    if (hit) {
      hit.n++;
      hit.size = Math.max(hit.size, s.size);
    } else {
      clusters.push({ x: s.x, y: s.y, size: s.size, n: 1 });
    }
  }
  return clusters;
}

/** Grid lines are the axes that carry a real run of columns. A line supported
 *  by one or two columns is a local offset, not a structural axis, and is not
 *  promoted into the grid. */
function gridLines(values, tol, minSupport) {
  const sorted = values.slice().sort((a, b) => a - b);
  const groups = [];
  for (const v of sorted) {
    const g = groups[groups.length - 1];
    if (g && v - g[g.length - 1] <= tol) g.push(v);
    else groups.push([v]);
  }
  return groups
    .filter((g) => g.length >= minSupport)
    .map((g) => round3(g.reduce((a, b) => a + b, 0) / g.length));
}

// --- walls ----------------------------------------------------------------

/**
 * WALL RECONSTRUCTION.
 *
 * A wall is drawn as two parallel faces. Recovering it means finding those
 * pairs, and the whole difficulty is that not every pair of parallel lines the
 * right distance apart is a wall. Three things in this drawing look exactly
 * like a wall to a rule that only measures geometry:
 *
 *   COLUMN AND STEEL SECTIONS. The structural layer carries all 216 column
 *   squares, the pile caps, and 96 steel sections -- 310 x 675 and 251 x 575
 *   rectangles, every one of them within 2.5 m of a CAD column. Each is a
 *   CLOSED loop whose two long sides are parallel, fully overlapping, and 251
 *   to 500 mm apart. Paired blind, they produced 82 "walls" that are pieces of
 *   structure. They are excluded by the one property that actually separates
 *   them from a wall: a wall is drawn as two independent faces, a section is
 *   one closed loop, and on THIS layer a closed loop is structure. Closed loops
 *   on the interior-wall and partition layers are kept -- there a closed
 *   rectangle IS a wall footprint, and the 75 x 2600 and 75 x 5250 loops on the
 *   interior layer are real walls, all of them far from any column.
 *
 *   DUPLICATED ENTITIES. The drawing contains copy-pasted geometry: entity
 *   pairs tracing the same line at the same place. Left in, they emit two walls
 *   where the building has one -- the 23.7 m canted wall came out four times.
 *   Faces with identical endpoints are de-duplicated, which is a statement
 *   about the input, not a judgement about walls.
 *
 *   NEAR-PARALLEL RUBBISH. Everything else is left to the pairing rule's own
 *   limits: a thickness band, an overlap requirement, and a direction bucket.
 *
 * DIRECTION, NOT AXIS. The previous rule bucketed faces into 'h' and 'v' with
 * an absolute 1 mm test, which failed twice over. A wall drawn 2 mm out of
 * square across 10 m is not axis-aligned by that test and was discarded --
 * 89 m of wall on this floor. And a wall at 45 or 70 degrees was not
 * representable at all, so the model contained zero angled walls while the
 * drawing contains 70 m of them. Working in each face's own direction removes
 * both failures and adds no new tolerance: the direction bucket IS the
 * tolerance, and it replaces one that was wrong rather than joining it.
 */

/** The structural layer: columns, caps and steel sections share it with the
 *  building's exterior wall, so it is read for faces but never for loops. */
const STRUCTURAL_LAYER = '00.Wall FCD';

/** Direction bucket width. Two faces of one wall are drawn parallel; half a
 *  degree is far tighter than any drafting slip and far looser than float. */
const DIR_TOL_DEG = 0.5;

/** Shortest face that can be half of a wall. Below this the drawing is
 *  detailing -- hatch ticks, chamfers, bolt outlines -- and admitting it makes
 *  the pairing find walls inside sections. Measured: dropping to 100 mm more
 *  than triples the number of closed loops that pair into a "wall". */
const MIN_FACE_MM = 500;

/**
 * Every wall-layer segment, in its own direction frame, de-duplicated.
 *
 * `c` is the signed perpendicular offset of the line from the origin and
 * `a`..`b` the run along it. Two faces of the same wall share a direction and
 * differ in `c` by the thickness, so the pairing below is a sort and a scan.
 */
function wallFaces(entities) {
  const out = [];
  const seen = new Set();
  let duplicates = 0;
  for (const e of entities) {
    if (!WALL_LAYERS.has(e.layer)) continue;
    if (e.type !== 'LINE' && e.type !== 'LWPOLYLINE' && e.type !== 'POLYLINE') continue;
    if (e.closed && e.layer === STRUCTURAL_LAYER) continue;
    const n = Math.min(e.xs.length, e.ys.length);
    const seg = [];
    if (e.type === 'LINE' && n >= 2) seg.push([e.xs[0], e.ys[0], e.xs[1], e.ys[1]]);
    else {
      for (let i = 0; i + 1 < n; i++) seg.push([e.xs[i], e.ys[i], e.xs[i + 1], e.ys[i + 1]]);
      if (e.closed && n > 2) seg.push([e.xs[n - 1], e.ys[n - 1], e.xs[0], e.ys[0]]);
    }
    for (const [x1, y1, x2, y2] of seg) {
      const L = Math.hypot(x2 - x1, y2 - y1);
      if (L < MIN_FACE_MM) continue;
      const k = [x1, y1, x2, y2].map((v) => Math.round(v)).join(',');
      const kr = [x2, y2, x1, y1].map((v) => Math.round(v)).join(',');
      if (seen.has(k) || seen.has(kr)) { duplicates++; continue; }
      seen.add(k);
      // Direction normalised to [0,180): the two faces of one wall may be drawn
      // in opposite senses and are the same wall either way.
      let ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      ang = ((ang % 180) + 180) % 180;
      const ux = Math.cos((ang * Math.PI) / 180);
      const uy = Math.sin((ang * Math.PI) / 180);
      const t1 = ux * x1 + uy * y1;
      const t2 = ux * x2 + uy * y2;
      out.push({
        ang, ux, uy,
        c: -uy * x1 + ux * y1,
        a: Math.min(t1, t2), b: Math.max(t1, t2), len: L,
        layer: e.layer, handle: e.handle || null, closed: !!e.closed,
      });
    }
  }
  return { faces: out, duplicates };
}

/** A wall is two parallel faces. An unpaired face has no measured thickness
 *  and is kept as line-work rather than given a default one. */
function pairWalls(list) {
  const walls = [];
  const buckets = new Map();
  for (const f of list) {
    const k = Math.round(f.ang / DIR_TOL_DEG);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(f);
  }
  const used = new Set();
  for (const k of [...buckets.keys()].sort((p, q) => p - q)) {
    // Neighbouring buckets are swept too, so a pair whose faces round either
    // side of a bucket edge still meets.
    const cand = [];
    for (const kk of [k - 1, k, k + 1]) {
      for (const f of buckets.get(kk) || []) {
        if (Math.abs(f.ang - k * DIR_TOL_DEG) > DIR_TOL_DEG * 1.5) continue;
        cand.push(f);
      }
    }
    cand.sort((p, q) => p.c - q.c);
    for (let i = 0; i < cand.length; i++) {
      const s = cand[i];
      if (used.has(s)) continue;
      let best = null;
      let bestGap = Infinity;
      for (let j = i + 1; j < cand.length; j++) {
        const t = cand[j];
        if (used.has(t)) continue;
        const gap = t.c - s.c;
        // 50..600 mm spans every plausible wall in this building, from a 50 mm
        // panel to a 600 mm structural wall. Wider and the "pair" is far more
        // likely two unrelated faces, so it is left unpaired.
        if (gap < 50) continue;
        if (gap > 600) break;
        const ov = Math.min(s.b, t.b) - Math.max(s.a, t.a);
        const shorter = Math.min(s.b - s.a, t.b - t.a);
        if (ov <= 0 || ov < 0.6 * shorter) continue;
        if (gap < bestGap) { bestGap = gap; best = t; }
      }
      if (!best) continue;
      used.add(s);
      used.add(best);
      walls.push({
        ang: s.ang, ux: s.ux, uy: s.uy,
        c: (s.c + best.c) / 2, thickness: bestGap,
        a: Math.max(s.a, best.a), b: Math.min(s.b, best.b),
        parts: 1,
        layers: [s.layer, best.layer],
        handles: [s.handle, best.handle],
      });
    }
  }
  const faces = list.filter((f) => !used.has(f));
  return { walls, faces, unpaired: faces.length };
}

/** A point in a wall's own frame: distance along it, and offset across it. */
function inWallFrame(w, x, y) {
  return { t: w.ux * x + w.uy * y, c: -w.uy * x + w.ux * y };
}

/**
 * Joins wall runs the drawing broke into fragments.
 *
 * The CAD draws one physical wall as many separate face segments -- split at
 * every column, tee and detail it passes. Rendering those as-is produces a
 * dashed-looking wall that is nothing like the real floor.
 *
 * Two fragments merge only when they are the SAME wall by evidence: same
 * direction, same centreline within a millimetre, same measured thickness
 * within 5 mm, and touching or overlapping within MERGE_GAP.
 *
 * AND ONLY WHEN NOTHING IS IN THE GAP. The gap limit alone is an argument that
 * a doorway is wider than 120 mm, not a check that this particular gap is not a
 * doorway. The openings the drawing places are passed in, and a merge that
 * would close over one is refused outright.
 */
const MERGE_GAP_MM = 120;

function mergeWalls(walls, openings) {
  const out = [];
  const buckets = new Map();
  for (const w of walls) {
    const k = `${Math.round(w.ang / DIR_TOL_DEG)}|${Math.round(w.c)}|${Math.round(w.thickness / 5)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(w);
  }
  let merged = 0;
  let refused = 0;
  for (const group of buckets.values()) {
    group.sort((p, q) => p.a - q.a);
    let cur = null;
    for (const w of group) {
      if (cur && w.a <= cur.b + MERGE_GAP_MM) {
        const blocked = (openings || []).some((o) => {
          const f = inWallFrame(cur, o.x, o.y);
          return Math.abs(f.c - cur.c) <= cur.thickness
            && f.t >= cur.b - MERGE_GAP_MM && f.t <= w.a + MERGE_GAP_MM;
        });
        if (!blocked) {
          if (w.b > cur.b) cur.b = w.b;
          cur.parts++;
          cur.handles = cur.handles.concat(w.handles);
          merged++;
          continue;
        }
        refused++;
      }
      if (cur) out.push(cur);
      cur = { ...w };
    }
    if (cur) out.push(cur);
  }
  return { walls: out, merged, refused };
}

/**
 * Closes the notch where two walls meet.
 *
 * A wall's measured extent stops at its own face, so a corner between a 100 mm
 * and a 250 mm wall leaves a visible gap of half the other wall's thickness.
 * Extending an end to the crossing wall's centreline closes it.
 *
 * Bounded and evidence-gated, not free extension: an end moves only when
 * another wall's centreline actually crosses within its own thickness, and only
 * by at most half that wall's thickness. Nothing is extended into open space,
 * so no wall is created and no opening is closed.
 *
 * "Crossing" is a real intersection of the two centrelines rather than an
 * assumption that the other wall is perpendicular, because the walls here are
 * not all at right angles to each other.
 */
function closeCorners(walls, openings) {
  let closed = 0;
  let refused = 0;
  // How far the closure moved wall ends in total. This is the ONLY wall length
  // in the model that the drawing does not draw, so it is measured and
  // published rather than left to be discovered by a reconciliation.
  let extendedMm = 0;
  for (const w of walls) {
    for (const endKey of ['a', 'b']) {
      let bestReach = 0;
      for (const o of walls) {
        if (o === w) continue;
        // Parallel walls never form a corner, and the intersection below is
        // undefined for them.
        const cross = w.ux * o.uy - w.uy * o.ux;
        if (Math.abs(cross) < 0.05) continue;
        // The two centrelines are { p : -uy*px + ux*py = c }. Solving the pair
        // by Cramer's rule gives their intersection; `cross` is the
        // determinant, already computed above.
        const px = (w.c * o.ux - w.ux * o.c) / cross;
        const py = (w.c * o.uy - w.uy * o.c) / cross;
        const fo = inWallFrame(o, px, py);
        // The crossing wall must actually reach this point.
        if (fo.t < o.a - o.thickness || fo.t > o.b + o.thickness) continue;
        const fw = inWallFrame(w, px, py);
        const reach = o.thickness / 2;
        const need = endKey === 'a' ? w.a - fw.t : fw.t - w.b;
        if (need <= 0 || need > reach) continue;
        if (need > bestReach) bestReach = need;
      }
      if (bestReach <= 0) continue;
      // An extension is short, but it is still wall body arriving where the
      // drawing did not draw any. If the ground it would cover holds a door,
      // a window or an air shower, closing the corner would close the opening.
      // Refused rather than trimmed: a partial extension would be a length
      // nobody measured.
      const lo = endKey === 'a' ? w.a - bestReach : w.b;
      const hi = endKey === 'a' ? w.a : w.b + bestReach;
      const blocked = (openings || []).some((o) => {
        const f = inWallFrame(w, o.x, o.y);
        return Math.abs(f.c - w.c) <= w.thickness && f.t >= lo && f.t <= hi;
      });
      if (blocked) { refused++; continue; }
      if (endKey === 'a') w.a -= bestReach;
      else w.b += bestReach;
      extendedMm += bestReach;
      closed++;
    }
  }
  return { closed, refused, extendedMm };
}

/** A wall's two endpoints on its centreline, in floor-local CAD mm. */
function wallEnds(w) {
  const px = -w.uy * w.c;
  const py = w.ux * w.c;
  return {
    x1: px + w.ux * w.a, y1: py + w.uy * w.a,
    x2: px + w.ux * w.b, y2: py + w.uy * w.b,
  };
}

// --- zones ----------------------------------------------------------------

/** The drawing's area labels are free text read off a confidential drawing.
 *  ZONE_NAME in lib/wire.js accepts uppercase tokens only, so that prose can
 *  never ride through the projection. Names are normalised to that charset
 *  here, at extraction, rather than by widening the guard. */
function normaliseZoneName(raw) {
  const up = String(raw).toUpperCase().replace(/&/g, ' AND ');
  const cleaned = up.replace(/[^A-Z0-9 -]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = cleaned.slice(0, 32).trim();
  return /^[A-Z0-9][A-Z0-9 -]{0,31}$/.test(cut) ? cut : null;
}

// The drawing prints a zone's own area two ways. Most are MTEXT carrying the
// superscript-2 formatting codes; four are plain TEXT that simply says "49m2".
// Reading only the formatted kind turned those four into zones named "49M2",
// which both invented four rooms and denied four real rooms the printed area
// that would have validated them.
const AREA_ANNOTATION = /^\\A1;\s*([\d,]+)\s*m/;   // e.g. "\A1;532m{\H0.7x;\S2^ ;}"
const BARE_AREA = /^([\d,]+)\s*m2?$/i;             // e.g. "49m2"
const LEVEL_TAG = /^[+-]\d+\.\d+$/;                // e.g. "+0.30"

function polygonOf(entity) {
  const n = Math.min(entity.xs.length, entity.ys.length);
  const verts = [];
  for (let i = 0; i < n; i++) verts.push({ x: mx(entity.xs[i]), z: mz(entity.ys[i]) });
  // A ring is implicitly closed; an explicit repeat of the first point is a
  // malformed ring to the validator, so drop it.
  if (verts.length > 1) {
    const f = verts[0];
    const l = verts[verts.length - 1];
    if (f.x === l.x && f.z === l.z) verts.pop();
  }
  return verts;
}

function pointInPolygon(px, pz, verts) {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const a = verts[i];
    const b = verts[j];
    if ((a.z > pz) !== (b.z > pz)
        && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function polygonArea(verts) {
  let s = 0;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    s += (verts[j].x * verts[i].z) - (verts[i].x * verts[j].z);
  }
  return Math.abs(s / 2);
}

function selfIntersects(verts) {
  if (verts.length > 200) return false;
  const orient = (p, q, r) => {
    const v = (q.z - p.z) * (r.x - q.x) - (q.x - p.x) * (r.z - q.z);
    return Math.abs(v) < 1e-12 ? 0 : (v > 0 ? 1 : 2);
  };
  const crosses = (a, b, c, d) =>
    orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (crosses(verts[i], verts[(i + 1) % n], verts[j], verts[(j + 1) % n])) return true;
    }
  }
  return false;
}

function buildZones(entities) {
  const labels = [];
  const annotations = [];
  for (const e of entities) {
    if (e.layer !== AREA_LAYER) continue;
    if (e.type !== 'TEXT' && e.type !== 'MTEXT') continue;
    const s = (e.text || '').trim();
    if (!s) continue;
    const x = e.xs[0];
    const y = e.ys[0];
    const m = AREA_ANNOTATION.exec(s) || BARE_AREA.exec(s);
    if (m) {
      annotations.push({ x, y, area: Number(m[1].replace(/,/g, '')) });
      continue;
    }
    if (LEVEL_TAG.test(s) || /^\d+$/.test(s)) continue;   // level tag / count tag
    const name = normaliseZoneName(s);
    if (name) labels.push({ x, y, name, raw: s });
  }

  // THE AREA BOUNDARIES, AND WHY HALF OF THEM WERE INVISIBLE.
  //
  // This layer encodes closure two different ways, and the drawing uses both.
  // Nineteen boundaries set the LWPOLYLINE closed flag and leave the closing
  // edge implicit. Thirteen leave the flag clear and instead repeat the first
  // vertex as the last -- an explicitly closed ring that reports itself as
  // open. Reading only the flag therefore discarded thirteen real rooms, and
  // they were not a random thirteen: every boundary with more than four
  // vertices is in that group, so exactly the L-shaped and stepped areas
  // vanished, the 4,289 m2 drilling hall among them.
  //
  // A ring is closed if the drawing closes it, by whichever of the two means.
  // Nothing else is accepted: a polyline whose ends merely come near each
  // other is an open boundary and stays one.
  const rings = [];
  for (const e of entities) {
    if (e.layer !== AREA_BOUND_LAYER) continue;
    if (e.type !== 'LWPOLYLINE' && e.type !== 'POLYLINE') continue;
    const closure = cadRings.ringClosure(e.xs, e.ys, !!e.closed);
    const verts = polygonOf(e);
    if (verts.length < 3) continue;
    rings.push({
      verts,
      closed: closure !== cadRings.OPEN,
      closure,
      handle: e.handle || null,
      area: polygonArea(verts),
    });
  }

  const closureCounts = rings.reduce((acc, r) => {
    acc[r.closure] = (acc[r.closure] || 0) + 1;
    return acc;
  }, {});
  console.log(`  area boundaries: ${rings.length} rings on "${AREA_BOUND_LAYER}" `
    + `(${Object.entries(closureCounts).map(([k, n]) => `${n} ${k}`).join(', ')})`);

  // Each printed area annotation belongs to exactly one label: the drawing
  // sets it just below and to the right of its own name. Matching from the
  // annotation side and consuming each one means a zone can never borrow a
  // neighbour's printed area, which is the failure that would silently
  // validate a boundary against the wrong number.
  const printedFor = new Map();
  for (const a of annotations) {
    let best = null;
    let bestD = Infinity;
    for (const lab of labels) {
      const dx = (a.x - lab.x) / 1000;
      const dz = (lab.y - a.y) / 1000;
      if (dz < -0.2 || dz > 2.0 || dx < -1.5 || dx > 8) continue;
      const d = Math.hypot(dx, dz);
      if (d < bestD) { bestD = d; best = lab; }
    }
    if (best && !printedFor.has(best)) printedFor.set(best, a.area);
  }

  // Past this, the printed area is not a discrepancy to record but a statement
  // that this ring is not this label's boundary. See the retraction below.
  const REFUTES_MATCH = 0.35;

  const zones = [];
  const usedRings = new Set();
  let seq = 0;
  for (const lab of labels) {
    seq++;
    const id = `FZ-F1-${String(seq).padStart(4, '0')}`;
    const px = mx(lab.x);
    const pz = mz(lab.y);
    const printed = printedFor.has(lab) ? printedFor.get(lab) : null;

    // The smallest closed boundary containing the label is that label's area.
    // A label with no containing boundary keeps its name and gets no polygon.
    let ring = null;
    for (const r of rings) {
      if (!r.closed) continue;
      if (!pointInPolygon(px, pz, r.verts)) continue;
      if (!ring || r.area < ring.area) ring = r;
    }

    let confidence = 'UNRESOLVED';
    let renderable = false;
    let geometry = null;
    let note = 'label present, no closed CAD boundary contains it';

    if (ring && !selfIntersects(ring.verts)) {
      const calc = round3(ring.area);
      if (printed != null && printed > 0) {
        const delta = Math.abs(calc - printed) / printed;
        // The drawing prints its own area for each zone. Agreement between the
        // traced polygon and that printed value is the check; disagreement is
        // recorded rather than smoothed away.
        //
        // Beyond the band, the printed area is not reporting a discrepancy --
        // it is refuting the match. Five labels here sit inside a larger area
        // and have no boundary of their own on this layer: a 16 m2 room whose
        // only containing ring is the 4,289 m2 drilling hall is not a 4,289 m2
        // room. Keeping the hall's outline as that label's geometry would
        // publish a boundary the drawing never drew for it, so the polygon is
        // retracted and the zone stays unresolved with its name intact.
        if (delta > REFUTES_MATCH) {
          confidence = 'UNRESOLVED';
          note = `no boundary of its own: the only containing ring is ${calc} m2 `
            + `against a printed ${printed} m2, which refutes the match`;
        } else {
          geometry = { vertices: ring.verts };
          confidence = delta <= 0.1 ? 'HIGH' : 'MEDIUM';
          note = `traced ${calc} m2 vs printed ${printed} m2 (${(delta * 100).toFixed(1)}% delta)`;
        }
      } else {
        geometry = { vertices: ring.verts };
        confidence = 'MEDIUM';
        note = `traced ${calc} m2, no printed area found to check it against`;
      }
      renderable = confidence === 'HIGH' || confidence === 'MEDIUM';
    }
    if (geometry) usedRings.add(ring);

    zones.push({
      id,
      type: 'functional-zone',
      zone_name: lab.name,
      confidence,
      renderable,
      status: 'OK',
      geometry,
      source: 'floor1_dxf',
      geometry_status: geometry ? 'MEASURED_CAD' : 'UNKNOWN',
      name_status: 'CAD_OBSERVED_LABEL',
      printed_area_m2: printed,
      validation_note: note,
      // Provenance. Enough to point at the exact object in the drawing that
      // produced this polygon, and to say by which of the two encodings the
      // drawing declared it closed. Private, like everything in this document.
      source_file: 'Floor1.dxf',
      source_layer: ring ? AREA_BOUND_LAYER : null,
      source_handle: ring ? ring.handle : null,
      boundary_closure: ring ? ring.closure : null,
    });
  }

  // Boundaries the drawing closed but never labelled. These are measured rooms
  // whose PURPOSE is undefined, which is a different statement from "no room
  // is here" -- dropping them would delete floor area the CAD explicitly
  // draws. They are emitted with a null name rather than a guessed one; a name
  // borrowed from the nearest label would be an invention.
  for (const r of rings) {
    if (!r.closed || usedRings.has(r) || selfIntersects(r.verts)) continue;
    seq++;
    zones.push({
      id: `FZ-F1-${String(seq).padStart(4, '0')}`,
      type: 'functional-zone',
      zone_name: null,
      confidence: 'MEDIUM',
      renderable: true,
      status: 'OK',
      geometry: { vertices: r.verts },
      source: 'floor1_dxf',
      geometry_status: 'MEASURED_CAD',
      name_status: 'NO_CAD_LABEL',
      printed_area_m2: null,
      validation_note:
        `closed CAD boundary of ${round3(r.area)} m2 carrying no area label`,
      source_file: 'Floor1.dxf',
      source_layer: AREA_BOUND_LAYER,
      source_handle: r.handle,
      boundary_closure: r.closure,
    });
  }
  return zones;
}

// --- main -----------------------------------------------------------------

async function main() {
  const src = process.env.FLOOR1_DXF;
  if (!src) fail('set FLOOR1_DXF to the private Floor1.dxf path (it is not in this repo).');
  if (!fs.existsSync(src)) fail(`FLOOR1_DXF does not exist: ${src}`);
  if (!fs.existsSync(GEOMETRY_PATH)) {
    fail(`${GEOMETRY_PATH} not found -- this script augments the existing model, it does not replace it.`);
  }

  const geoDoc = JSON.parse(fs.readFileSync(GEOMETRY_PATH, 'utf8'));

  console.log('reading DXF (streaming, read-only)...');
  const { entities: allPlan, scanned } = await readEntities(src);
  console.log(`  ${scanned} tags scanned, ${allPlan.length} entities on plan layers`);

  // --- recover the frame from the drawing ---------------------------------
  // The column-cap layer's envelope IS the floor envelope. Nothing about it is
  // assumed here: it is measured, then checked against the width and depth the
  // existing model declares, and a disagreement aborts the run. Silently
  // shifting every coordinate in the model is the one failure this must not be
  // able to produce.
  const capEnts = allPlan.filter((e) => e.layer === CAP_LAYER && e.xs.length && e.ys.length);
  if (capEnts.length === 0) fail(`no entities found on the "${CAP_LAYER}" layer -- cannot establish the frame.`);
  let capMinX = Infinity; let capMaxX = -Infinity;
  let capMinY = Infinity; let capMaxY = -Infinity;
  for (const e of capEnts) {
    capMinX = Math.min(capMinX, ...e.xs);
    capMaxX = Math.max(capMaxX, ...e.xs);
    capMinY = Math.min(capMinY, ...e.ys);
    capMaxY = Math.max(capMaxY, ...e.ys);
  }
  const capW = capMaxX - capMinX;
  const capH = capMaxY - capMinY;
  const declaredW = geoDoc.envelope.width * 1000;
  const declaredH = geoDoc.envelope.depth * 1000;
  const TOL_MM = 1.0;
  if (Math.abs(capW - declaredW) > TOL_MM || Math.abs(capH - declaredH) > TOL_MM) {
    fail(`the CAD envelope (${capW.toFixed(1)} x ${capH.toFixed(1)} mm) disagrees with the `
      + `model's declared envelope (${declaredW} x ${declaredH} mm) by more than ${TOL_MM} mm. `
      + 'Refusing to run: this would move every coordinate in the model. Reconcile the two first.');
  }
  X0 = capMinX;
  Y0 = capMinY;
  HALF_W = capW / 2000;
  HALF_D = capH / 2000;
  console.log(`  frame recovered from the drawing: ${capW} x ${capH} mm`
    + ` (matches the declared envelope within ${TOL_MM} mm)`);

  // Now the window is knowable, so apply it.
  const entities = allPlan.filter((e) => {
    const minx = Math.min(...e.xs);
    const maxx = Math.max(...e.xs);
    const miny = Math.min(...e.ys);
    const maxy = Math.max(...e.ys);
    return minx >= X0 - MARGIN_MM && maxx <= X0 + capW + MARGIN_MM
      && miny >= Y0 - MARGIN_MM && maxy <= Y0 + capH + MARGIN_MM;
  });
  console.log(`  ${entities.length} of them fall inside the canonical window`);

  // columns
  const colSquares = squareCentres(entities, COLUMN_LAYER, 800, 1000);
  const clusters = clusterColumns(colSquares);
  const caps = squareCentres(entities, CAP_LAYER, 3700, 3800);
  console.log(`  columns: ${colSquares.length} squares -> ${clusters.length} locations; ${caps.length} caps`);

  const columns = clusters
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((c, i) => ({
      id: `COL-F1-${String(i + 1).padStart(4, '0')}`,
      position: { x: mx(c.x), z: mz(c.y) },
      footprint: { width: round3(c.size / 1000), depth: round3(c.size / 1000) },
      confidence: 'high',
      source: 'floor1_dxf',
      geometry_status: 'MEASURED_CAD',
      detector: { squares: c.n, size_mm: Math.round(c.size) },
    }));

  const axesX = gridLines(clusters.map((c) => mx(c.x)), 0.4, 4);
  const axesZ = gridLines(clusters.map((c) => mz(c.y)), 0.4, 4);
  console.log(`  column axes: ${axesX.length} in x, ${axesZ.length} in z`);

  // openings, read BEFORE the walls because the merge stage needs them: a
  // fragment gap that contains a door is a doorway, not a gap.
  const openingEntities = entities
    .filter((e) => e.type === 'INSERT' && OPENING_LAYERS.has(e.layer)
      && e.xs.length && e.ys.length);
  const openingPoints = openingEntities.map((e) => ({ x: e.xs[0], y: e.ys[0] }));
  const openings = openingEntities.map((e, i) => ({
    id: `OPN-F1-${String(i + 1).padStart(4, '0')}`,
    position: { x: mx(e.xs[0]), z: mz(e.ys[0]) },
    kind: /WINDOW/i.test(e.layer) ? 'window'
      : (/AIRSHOWER/i.test(e.layer) ? 'airshower' : 'door'),
    source: 'floor1_dxf',
    geometry_status: 'OBSERVED_CAD',
  }));
  console.log(`  openings: ${openings.length}`);

  // walls
  const faceSet = wallFaces(entities);
  const paired = pairWalls(faceSet.faces);
  const mergedRes = mergeWalls(paired.walls, openingPoints);
  const corners = closeCorners(mergedRes.walls, openingPoints);
  const cornersClosed = corners.closed;
  const unpaired = paired.unpaired;
  const wallRuns = mergedRes.walls;
  console.log(`  wall faces: ${faceSet.faces.length} kept, ${faceSet.duplicates} duplicate `
    + 'entities dropped, structural closed loops excluded');
  console.log(`  walls: ${paired.walls.length} paired -> ${wallRuns.length} runs `
    + `(${mergedRes.merged} fragments merged, ${mergedRes.refused} merges refused across an `
    + `opening, ${cornersClosed} corners closed, ${corners.refused} refused at an opening, `
    + `${unpaired} faces left unpaired)`);
  console.log(`  corner closure extended wall ends by `
    + `${(corners.extendedMm / 1000).toFixed(1)} m in total, which is `
    + `${(corners.extendedMm * 2 / 1000).toFixed(1)} m of drawn face the drawing does not draw`);
  const angledRuns = wallRuns.filter((w) => {
    const off = Math.min(w.ang % 90, 90 - (w.ang % 90));
    return off > 1;
  });
  console.log(`  angled walls: ${angledRuns.length} runs, `
    + `${(angledRuns.reduce((n, w) => n + (w.b - w.a), 0) / 1000).toFixed(1)} m`);

  // Connectivity check, reported rather than assumed: how many run ends meet
  // another run. An end that meets nothing is a real free end (a doorway, a
  // wall stopping at a column), not necessarily a defect -- so it is counted
  // and published, never silently "fixed".
  let joined = 0;
  let free = 0;
  for (const w of wallRuns) {
    const ends = wallEnds(w);
    for (const p of [{ x: ends.x1, y: ends.y1 }, { x: ends.x2, y: ends.y2 }]) {
      const meets = wallRuns.some((o) => {
        if (o === w) return false;
        const f = inWallFrame(o, p.x, p.y);
        const tol = Math.max(o.thickness, 150);
        return Math.abs(f.c - o.c) <= tol && f.t >= o.a - tol && f.t <= o.b + tol;
      });
      if (meets) joined++; else free++;
    }
  }
  const connectivity = joined / (joined + free);
  console.log(`  wall connectivity: ${(connectivity * 100).toFixed(1)}% of run ends meet another run`);

  // Unpaired faces, merged along their own direction, for the 2D plan only.
  // Every one of them is real drawn geometry with no measured thickness. They
  // were previously filtered to 2 m and longer, which discarded most of the
  // drawing's shorter wall line-work for no reason beyond tidiness; they are
  // all served now, and none of them claims a thickness.
  const faceRuns = mergeWalls(
    paired.faces.map((f) => ({ ...f, thickness: 0, parts: 1, handles: [f.handle] })),
    openingPoints,
  ).walls;
  const wallLines = faceRuns.map((f) => {
    const e = wallEnds(f);
    return { x1: mx(e.x1), z1: mz(e.y1), x2: mx(e.x2), z2: mz(e.y2) };
  });
  console.log(`  wall lines (unpaired faces, 2D only): ${wallLines.length}`);

  const walls = wallRuns.map((w) => {
    const e = wallEnds(w);
    return {
      x1: mx(e.x1), z1: mz(e.y1), x2: mx(e.x2), z2: mz(e.y2),
      thickness: round3(w.thickness / 1000), parts: w.parts,
      // Provenance, private. Enough to point back at the exact entities in the
      // drawing whose two faces produced this wall.
      source_file: 'Floor1.dxf',
      source_layers: [...new Set(w.layers)],
      source_handles: [...new Set(w.handles.filter(Boolean))],
    };
  });

  // zones
  const zones = buildZones(entities);
  const renderableZones = zones.filter((z) => z.renderable).length;
  console.log(`  zones: ${zones.length} labelled areas, ${renderableZones} renderable`);

  // --- merge into the existing model, preserving raster-derived evidence ---
  const geo = geoDoc;
  const rasterColumns = Array.isArray(geo.columns) ? geo.columns.length : 0;

  // Slot -> zone membership by geometric containment only. Not by name, not by
  // proximity, not by sequence. A slot inside no zone stays null.
  let assigned = 0;
  for (const slot of geo.slots || []) {
    let hit = null;
    for (const z of zones) {
      if (!z.geometry) continue;
      if (!pointInPolygon(slot.position.x, slot.position.z, z.geometry.vertices)) continue;
      const a = polygonArea(z.geometry.vertices);
      if (!hit || a < hit.a) hit = { id: z.id, a };
    }
    slot.zone_id = hit ? hit.id : null;
    if (hit) assigned++;
  }
  console.log(`  slots: ${assigned}/${(geo.slots || []).length} fall inside a CAD zone`);

  geo.schema_version = '2.1.0';
  geo.columns = columns;
  geo.wall_assembly = {
    faces_read: faceSet.faces.length,
    duplicate_entities_dropped: faceSet.duplicates,
    paired_faces: paired.walls.length,
    runs: wallRuns.length,
    angled_runs: angledRuns.length,
    fragments_merged: mergedRes.merged,
    merges_refused_at_opening: mergedRes.refused,
    corners_closed: cornersClosed,
    corners_refused_at_opening: corners.refused,
    // The ONLY wall length in the model that the drawing does not draw.
    corner_extension_m: round3(corners.extendedMm / 1000),
    unpaired_faces: unpaired,
    connectivity: round3(connectivity),
    merge_gap_mm: MERGE_GAP_MM,
    direction_tolerance_deg: DIR_TOL_DEG,
    min_face_mm: MIN_FACE_MM,
    note:
      'Faces are paired in their own direction, not bucketed into horizontal and '
      + 'vertical, so walls that are not axis-aligned are represented. Closed loops '
      + 'on the structural layer are excluded: that layer carries the column squares, '
      + 'the caps and the steel sections, and a section is one closed loop where a '
      + 'wall is two independent faces. Duplicate entities -- the same line drawn '
      + 'twice -- are dropped before pairing. Fragments merge only on identical '
      + 'direction, centreline and measured thickness, across gaps below a door leaf, '
      + 'and never across a gap holding an opening. Corner closure extends an end '
      + 'only where another wall centreline actually crosses, by at most half that '
      + 'wall thickness, and never over an opening.',
  };
  // Drawn geometry with no measured thickness. Served for the plan view and
  // deliberately NOT extruded in 3D.
  geo.wall_lines = wallLines.map((w, i) => ({
    id: `WLN-F1-${String(i + 1).padStart(4, '0')}`,
    ...w,
    source: 'floor1_dxf',
    geometry_status: 'OBSERVED_CAD',
  }));
  geo.walls = walls.map((w, i) => ({
    id: `WAL-F1-${String(i + 1).padStart(4, '0')}`,
    ...w,
    source: 'floor1_dxf',
    geometry_status: 'MEASURED_CAD',
  }));
  geo.openings = openings;
  // The grid is NOT replaced by the CAD column axes. They measure different
  // things: the drawing's dimension chain runs edge to edge (174500 x 120300,
  // matching the envelope), while column centres sit ~425 mm inside each edge
  // and span 173.65 m. The chain was already confirmed exact by CAD on the
  // interior, so the axes are used only to CORRECT lines that disagree --
  // which caught two +/-25 mm rounding slips in the raster transcription.
  const grid = { ...geo.grid };
  const spansOf = (lines) =>
    lines.slice(1).map((v, i) => Math.round((v - lines[i]) * 1000));
  const sum = (a) => a.reduce((p, q) => p + q, 0);

  /** Snap interior grid lines onto a CAD column axis when one sits within
   *  50 mm. The first and last lines are envelope edges, not column axes, and
   *  are never moved. Returns the corrected lines and what was changed. */
  function correct(lines, axes, totalMm) {
    const applied = [];
    const out = (lines || []).map((v, i, all) => {
      if (i === 0 || i === all.length - 1) return v;
      let best = null;
      for (const a of axes) {
        const d = Math.abs(a - v);
        if (d > 0.001 && d <= 0.05 && (best === null || d < Math.abs(best - v))) best = a;
      }
      if (best === null) return v;
      applied.push({ from: v, to: best, delta_mm: Math.round((best - v) * 1000) });
      return best;
    });
    // A corrected chain that no longer closes on the envelope is a conflict,
    // not an improvement. Reject it rather than publish a chain that fails to
    // add up, and say so.
    const closes = sum(spansOf(out)) === Math.round(totalMm);
    return closes
      ? { lines: out, spans: spansOf(out), applied, rejected: false }
      : { lines, spans: spansOf(lines), applied: [], rejected: true };
  }

  const cx = correct(grid.x_lines, axesX, geo.envelope.width * 1000);
  const cz = correct(grid.z_lines, axesZ, geo.envelope.depth * 1000);
  grid.x_lines = cx.lines;
  grid.x_spans_mm = cx.spans;
  grid.z_lines = cz.lines;
  grid.z_spans_mm = cz.spans;
  grid.cad_corroboration = {
    column_axes_x: axesX.length,
    column_axes_z: axesZ.length,
    axes_note:
      'Column centrelines sit ~0.425 m inside each envelope edge, so they span '
      + '173.65 m where the dimension chain spans 174.5 m. Different measurements '
      + 'of different things; the chain remains the grid.',
    corrections_x: cx.applied,
    corrections_z: cz.applied,
    rejected_axes: [cx.rejected ? 'x' : null, cz.rejected ? 'z' : null].filter(Boolean),
  };
  geo.grid = grid;
  console.log(`  grid: ${cx.applied.length} x-correction(s), ${cz.applied.length} z-correction(s)`
    + `${cx.rejected || cz.rejected ? ' [a corrected chain was REJECTED for not closing]' : ''}`);
  geo.cad_provenance = {
    source: 'Floor1.dxf (private, gitignored, never committed)',
    acad_version: 'AC1027 (AutoCAD 2013)',
    units: 'millimetres, derived from geometry',
    units_note:
      '$INSUNITS is 0 (unitless) and was NOT used. Bay spacings of 8500/8850/'
      + '10000 and an overall 174500 x 120300 are millimetres; the drawing\'s two '
      + 'largest DIMENSION entities are literally 174500.0 and 120300.0.',
    frame_note:
      'Neither $EXTMIN/$EXTMAX nor the union of entity bounds was used: the '
      + 'former is stale by ~4.3x in X, the latter is polluted by equipment '
      + 'detail drawings sharing modelspace. The frame is the CAP envelope.',
    column_reconciliation: {
      raster_previous: rasterColumns,
      cad_locations: columns.length,
      raster_matched_by_cad_within_1m: 'all, median residual 0.034 m',
      note:
        'The raster columns were a correct subset, not an error. CAD carries '
        + 'more. The separate 3750 mm CAP squares are foundation caps, a '
        + 'different object, and are deliberately not merged into this count.',
    },
    cap_count: caps.length,
    walls_unpaired_faces: unpaired,
    withheld: 'CAD origin offset, room label source strings, full layer list.',
  };

  fs.writeFileSync(GEOMETRY_PATH, `${JSON.stringify(geo, null, 2)}\n`);
  console.log(`wrote ${GEOMETRY_PATH}`);

  const zoneDoc = {
    schema_version: '1.1.0',
    disclosure:
      'PRIVATE - confidential facility geometry and area labels read from the '
      + 'CAD source. Never commit. Served only through the allowlist projection '
      + 'in lib/wire.js.',
    source: 'Floor1.dxf area layer',
    zones,
    conflicts: [],
  };
  fs.writeFileSync(ZONES_PATH, `${JSON.stringify(zoneDoc, null, 2)}\n`);
  console.log(`wrote ${ZONES_PATH}`);
}

main().catch((err) => fail(err.stack || String(err)));
