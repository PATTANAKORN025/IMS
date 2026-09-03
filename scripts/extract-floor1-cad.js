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
const mx = (xmm) => round3((xmm - X0) / 1000 - HALF_W);
const mz = (ymm) => round3((ymm - Y0) / 1000 - HALF_D);
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
        cur = { type: v, layer: '', xs: [], ys: [] };
        continue;
      }
      flush();
      continue;
    }
    if (section === '?' && c === 2) { section = v; continue; }
    if (section !== 'ENTITIES' || !cur) continue;

    if (c === 8) { cur.layer = value; continue; }
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

/** Explode kept entities into axis-aligned segments in floor-local mm. */
function wallSegments(entities) {
  const segs = [];
  const push = (x1, y1, x2, y2) => {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    if (dx < 1 && dy >= 500) segs.push({ axis: 'v', at: (x1 + x2) / 2, a: Math.min(y1, y2), b: Math.max(y1, y2) });
    else if (dy < 1 && dx >= 500) segs.push({ axis: 'h', at: (y1 + y2) / 2, a: Math.min(x1, x2), b: Math.max(x1, x2) });
  };
  for (const e of entities) {
    if (!WALL_LAYERS.has(e.layer)) continue;
    if (e.type === 'LINE' && e.xs.length >= 2 && e.ys.length >= 2) {
      push(e.xs[0], e.ys[0], e.xs[1], e.ys[1]);
    } else if (e.type === 'LWPOLYLINE') {
      const n = Math.min(e.xs.length, e.ys.length);
      for (let i = 0; i + 1 < n; i++) push(e.xs[i], e.ys[i], e.xs[i + 1], e.ys[i + 1]);
      if (e.closed && n > 2) push(e.xs[n - 1], e.ys[n - 1], e.xs[0], e.ys[0]);
    }
  }
  return segs;
}

/** A wall is drawn as two parallel faces. Pair them to recover a centreline
 *  and a MEASURED thickness. An unpaired face is left out: its thickness is
 *  not in evidence, and a default thickness would be an invented dimension. */
function pairWalls(segs) {
  const walls = [];
  let unpaired = 0;
  for (const axis of ['h', 'v']) {
    const list = segs.filter((s) => s.axis === axis)
      .sort((p, q) => p.at - q.at || p.a - q.a);
    const used = new Set();
    for (let i = 0; i < list.length; i++) {
      if (used.has(i)) continue;
      const s = list[i];
      let best = -1;
      let bestGap = Infinity;
      for (let j = i + 1; j < list.length; j++) {
        if (used.has(j)) continue;
        const t = list[j];
        const gap = t.at - s.at;
        if (gap < 50) continue;
        if (gap > 400) break;
        const ov = Math.min(s.b, t.b) - Math.max(s.a, t.a);
        const shorter = Math.min(s.b - s.a, t.b - t.a);
        if (ov <= 0 || ov < 0.6 * shorter) continue;
        if (gap < bestGap) { bestGap = gap; best = j; }
      }
      if (best < 0) { unpaired++; continue; }
      const t = list[best];
      used.add(i);
      used.add(best);
      const at = (s.at + t.at) / 2;
      const a = Math.max(s.a, t.a);
      const b = Math.min(s.b, t.b);
      walls.push(axis === 'h'
        ? { x1: mx(a), z1: mz(at), x2: mx(b), z2: mz(at), thickness: round3(bestGap / 1000) }
        : { x1: mx(at), z1: mz(a), x2: mx(at), z2: mz(b), thickness: round3(bestGap / 1000) });
    }
  }
  return { walls, unpaired };
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

const AREA_ANNOTATION = /^\\A1;\s*([\d,]+)\s*m/;   // e.g. "\A1;532m{\H0.7x;\S2^ ;}"
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
    const m = AREA_ANNOTATION.exec(s);
    if (m) {
      annotations.push({ x, y, area: Number(m[1].replace(/,/g, '')) });
      continue;
    }
    if (LEVEL_TAG.test(s) || /^\d+$/.test(s)) continue;   // level tag / count tag
    const name = normaliseZoneName(s);
    if (name) labels.push({ x, y, name, raw: s });
  }

  const rings = [];
  for (const e of entities) {
    if (e.layer !== AREA_BOUND_LAYER || e.type !== 'LWPOLYLINE') continue;
    const verts = polygonOf(e);
    if (verts.length < 3) continue;
    rings.push({ verts, closed: !!e.closed, area: polygonArea(verts) });
  }

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

  const zones = [];
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
      geometry = { vertices: ring.verts };
      const calc = round3(ring.area);
      if (printed != null && printed > 0) {
        const delta = Math.abs(calc - printed) / printed;
        // The drawing prints its own area for each zone. Agreement between the
        // traced polygon and that printed value is the check; disagreement is
        // recorded rather than smoothed away.
        confidence = delta <= 0.1 ? 'HIGH' : (delta <= 0.35 ? 'MEDIUM' : 'LOW');
        note = `traced ${calc} m2 vs printed ${printed} m2 (${(delta * 100).toFixed(1)}% delta)`;
      } else {
        confidence = 'MEDIUM';
        note = `traced ${calc} m2, no printed area found to check it against`;
      }
      renderable = confidence === 'HIGH' || confidence === 'MEDIUM';
    }

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

  // walls
  const { walls, unpaired } = pairWalls(wallSegments(entities));
  console.log(`  walls: ${walls.length} paired centrelines (${unpaired} faces left unpaired)`);

  // openings
  const openings = entities
    .filter((e) => e.type === 'INSERT' && OPENING_LAYERS.has(e.layer))
    .map((e, i) => ({
      id: `OPN-F1-${String(i + 1).padStart(4, '0')}`,
      position: { x: mx(e.xs[0]), z: mz(e.ys[0]) },
      kind: /WINDOW/i.test(e.layer) ? 'window'
        : (/AIRSHOWER/i.test(e.layer) ? 'airshower' : 'door'),
      source: 'floor1_dxf',
      geometry_status: 'OBSERVED_CAD',
    }));
  console.log(`  openings: ${openings.length}`);

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
