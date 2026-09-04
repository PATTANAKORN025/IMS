#!/usr/bin/env node
/**
 * Floor 1 RAW CAD reference extractor.
 *
 * WHAT THIS IS FOR. Every other document in private/ is a MODEL: geometry that
 * has been paired, merged, snapped, classified and named. This one is not. It
 * is the drawing's own line-work, carried through with no interpretation, so
 * that the model can be compared against its source rather than against itself.
 * A reconstruction that is checked only against its own output can be
 * self-consistently wrong -- that is exactly how a mirrored frame survived
 * every check for as long as it did.
 *
 * WHAT "RAW" MEANS HERE, PRECISELY. Units, axes and handedness are the CAD's:
 * millimetres, +y up, no reflection, no rotation, no scaling. Each entity keeps
 * its layer and its handle. The ONE thing that is changed is the origin: every
 * coordinate is rebased to the floor envelope's lower-left corner. The CAD
 * origin locates this facility in its owner's coordinate system and is
 * withheld everywhere else in this project, so carrying it here to be more
 * literally "raw" would publish the one number the rest of the pipeline is
 * careful not to. Nothing about shape, size, angle or relative position is
 * affected by that rebase.
 *
 * WHAT IS NOT CARRIED, AND WHY IT IS COUNTED. This modelspace is not only a
 * floor plan: it also holds equipment DETAIL drawings -- part sections, thread
 * callouts, bearing and shaft geometry -- sharing the same modelspace as the
 * plan. Those are tens of thousands of entities of a different kind of
 * confidential content, they are not the building, and drawing them would make
 * the reference useless as a reference. They are excluded by layer, and the
 * document records how many entities and how many layers were excluded so that
 * the omission is visible rather than silent.
 *
 * LAYER NAMES ARE NOT PUBLISHED. The drawing's layer names carry process and
 * vendor identifiers. Each carried layer is mapped to a stable public ROLE id
 * instead, which is what the API serves and what the layer toggles key on. The
 * true layer name stays in this private document as provenance.
 *
 * Usage: FLOOR1_DXF=<path to Floor1.dxf> node scripts/extract-floor1-raw-cad.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PRIVATE_DIR =
  process.env.FACTORY_TWIN_PRIVATE_DIR ||
  path.join(__dirname, '..', 'services', 'factory-twin-3d', 'private');
const GEOMETRY_PATH = path.join(PRIVATE_DIR, 'floor1-geometry.json');
const OUT_PATH = path.join(PRIVATE_DIR, 'floor1-raw-cad.json');

const CAP_LAYER = 'CAP';
const MARGIN_MM = 4000.0;

/**
 * The carried layers, and the public role each becomes.
 *
 * A role is a claim about what the line-work IS, and several drawing layers
 * legitimately share one. Roles are deliberately coarse: they are what an
 * engineer needs to switch on and off while comparing the model against the
 * drawing, not a transcription of the drawing's layer tree.
 */
const ROLE_OF = new Map([
  ['CAP', 'column-caps'],
  ['COL', 'columns'],
  ['00.Wall FCD', 'structure'],
  // Split out below, not here: the structural layer carries BOTH the exterior
  // wall as open line-work and every column square, pile cap and steel section
  // as a closed loop. They are different things and the reference has to be
  // able to show one without the other, so a closed loop on this layer becomes
  // 'structure-sections' instead. See roleFor().

  ['00.Wall IN', 'walls-interior'],
  ['00.Wall Clean room', 'walls-cleanroom'],
  ['00-WALL', 'walls-interior'],
  ['Wall', 'walls-interior'],
  ['mt-wall', 'walls-interior'],
  ['MOVE WALL', 'walls-movable'],
  ['F1-layout$0$MOVE WALL', 'walls-movable'],
  ['D-PAR-P1 非抗岩棉', 'partitions'],
  ['F1-layout$0$D-PAR-P2 单抗岩棉', 'partitions'],
  ['F1-layout$0$D-PAR-P3 双抗岩棉', 'partitions'],
  ['DOOR', 'doors'],
  ['DOOR-SW', 'doors'],
  ['D-Emergency Door', 'doors'],
  ['F1-layout$0$D-DOOR', 'doors'],
  ['F1-layout$0$D-Emergency Door', 'doors'],
  ['WINDOW', 'windows'],
  ['WINDOW-Fix', 'windows'],
  ['F1-layout$0$D-WINDOW', 'windows'],
  ['Airshower', 'openings-airshower'],
  ['F1-layout$0$Airshower', 'openings-airshower'],
  ['00.Area Line', 'area-boundaries'],
  ['00.Area', 'area-annotation'],
]);

const STRUCTURAL_LAYER = '00.Wall FCD';

/**
 * The role an entity belongs to.
 *
 * One layer, two roles. A closed loop on the structural layer is a section
 * through a column, a cap or a steel member -- 216 column squares and 96
 * sections, every one of the latter within 2.5 m of a CAD column. Its two long
 * sides are parallel and a wall thickness apart, which is exactly why the wall
 * reconstruction has to exclude them and exactly why the reference has to be
 * able to draw them separately: comparing a wall model against a drawing that
 * mixes walls with sections is comparing against the wrong thing.
 */
function roleFor(e) {
  const role = ROLE_OF.get(e.layer);
  if (role === 'structure' && e.closed) return 'structure-sections';
  return role;
}

/** Entity types this reference draws. Everything else is counted, not drawn. */
const DRAWN = new Set(['LWPOLYLINE', 'POLYLINE', 'LINE', 'ARC', 'CIRCLE']);

// An arc is served as a chord run rather than as a centre and two angles: the
// consumer is a line renderer, and flattening here means the drawing and the
// model are compared as the same kind of object. 24 segments per full turn
// keeps a 1 m radius within about 9 mm of true, well under a wall thickness.
const ARC_SEGMENTS_PER_TURN = 24;

function fail(msg) {
  console.error(`extract-floor1-raw-cad: ${msg}`);
  process.exit(1);
}

/** Streams the DXF, keeping modelspace entities on the carried layers. */
async function readEntities(src) {
  const rl = readline.createInterface({
    input: fs.createReadStream(src, { highWaterMark: 1 << 20 }),
    crlfDelay: Infinity,
  });

  let code = null;
  let section = null;
  let inBlockDef = false;
  let pendingSection = false;
  let cur = null;
  let openPoly = null;
  let vertexOf = null;

  const kept = [];
  const excludedLayers = new Set();
  let excludedEntities = 0;
  // Block references on a carried layer. Doors, windows and air showers are
  // drawn as INSERTs, so their leaves and swings live in block definitions
  // rather than in modelspace line-work. Expanding a block means applying its
  // insertion transform to geometry defined elsewhere, which is a different
  // and larger job; until it is done these are counted, never quietly dropped.
  let insertsNotExpanded = 0;
  let scanned = 0;

  const finish = () => {
    if (!cur) return;
    const e = cur;
    cur = null;
    if (!ROLE_OF.has(e.layer) || !DRAWN.has(e.type)) {
      if (ROLE_OF.has(e.layer) && e.type === 'INSERT') { insertsNotExpanded++; return; }
      if (e.layer) excludedLayers.add(e.layer);
      excludedEntities++;
      return;
    }
    if (e.xs.length < 1) return;
    kept.push(e);
  };

  for await (const raw of rl) {
    scanned++;
    if (code === null) { code = Number(raw.trim()); continue; }
    const v = raw;
    const c = code;
    code = null;

    if (c === 0) {
      const t = v.trim();
      finish();
      if (t === 'SECTION') { pendingSection = true; continue; }
      if (t === 'ENDSEC') { section = null; continue; }
      if (t === 'BLOCK') { inBlockDef = true; continue; }
      if (t === 'ENDBLK') { inBlockDef = false; continue; }
      if (t === 'EOF') break;
      // Modelspace only. A block definition's geometry is in block
      // coordinates; drawing it here would scatter parts across the floor.
      if (section !== 'ENTITIES' || inBlockDef) continue;
      // An old-style POLYLINE carries its vertices as following VERTEX
      // entities and closes at SEQEND.
      if (t === 'VERTEX' && openPoly) { cur = null; vertexOf = openPoly; continue; }
      if (t === 'SEQEND') { cur = openPoly; openPoly = null; vertexOf = null; finish(); continue; }
      if (openPoly) { const p = openPoly; openPoly = null; vertexOf = null; cur = p; finish(); }
      cur = { type: t, layer: '', handle: '', xs: [], ys: [] };
      if (t === 'POLYLINE') { openPoly = cur; cur = null; }
      continue;
    }
    if (pendingSection && c === 2) { section = v.trim(); pendingSection = false; continue; }
    if (!cur) {
      if (vertexOf) {
        if (c === 10) { const n = Number(v); if (Number.isFinite(n)) vertexOf.xs.push(n); }
        else if (c === 20) { const n = Number(v); if (Number.isFinite(n)) vertexOf.ys.push(n); }
      }
      continue;
    }

    switch (c) {
      case 8: cur.layer = v.trim(); break;
      case 5: cur.handle = v.trim(); break;
      case 10: { const n = Number(v); if (Number.isFinite(n)) cur.xs.push(n); break; }
      case 20: { const n = Number(v); if (Number.isFinite(n)) cur.ys.push(n); break; }
      // A LINE's second endpoint. Only a LINE uses 11/21 as geometry; on a
      // TEXT it is an alignment point and on a DIMENSION it is a definition
      // point, so it is read for nothing else.
      case 11: { const n = Number(v); if (Number.isFinite(n) && cur.type === 'LINE') cur.xs.push(n); break; }
      case 21: { const n = Number(v); if (Number.isFinite(n) && cur.type === 'LINE') cur.ys.push(n); break; }
      case 40: if (cur.type === 'ARC' || cur.type === 'CIRCLE') cur.r = Number(v); break;
      case 50: if (cur.type === 'ARC') cur.a0 = Number(v); break;
      case 51: if (cur.type === 'ARC') cur.a1 = Number(v); break;
      case 70:
        if (cur.type === 'LWPOLYLINE' || cur.type === 'POLYLINE') {
          cur.closed = (Number(v) & 1) === 1;
        }
        break;
      default: break;
    }
  }
  finish();
  return { kept, excludedEntities, excludedLayers: excludedLayers.size, insertsNotExpanded, scanned };
}

/** Expands one entity into a flat run of segment endpoints, in CAD mm. */
function segmentsOf(e) {
  const out = [];
  const push = (x1, y1, x2, y2) => {
    if (x1 === x2 && y1 === y2) return;   // a zero-length segment draws nothing
    out.push(x1, y1, x2, y2);
  };

  if (e.type === 'LINE') {
    if (e.xs.length >= 2 && e.ys.length >= 2) push(e.xs[0], e.ys[0], e.xs[1], e.ys[1]);
    return out;
  }
  if (e.type === 'ARC' || e.type === 'CIRCLE') {
    const cx = e.xs[0];
    const cy = e.ys[0];
    const r = Number(e.r);
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r <= 0) return out;
    const a0 = e.type === 'CIRCLE' ? 0 : Number(e.a0);
    const a1 = e.type === 'CIRCLE' ? 360 : Number(e.a1);
    if (!Number.isFinite(a0) || !Number.isFinite(a1)) return out;
    // DXF arcs run counter-clockwise from a0 to a1; a1 below a0 wraps.
    const sweep = ((a1 - a0) + 360) % 360 || (e.type === 'CIRCLE' ? 360 : 0);
    const steps = Math.max(2, Math.ceil((sweep / 360) * ARC_SEGMENTS_PER_TURN));
    let px = cx + r * Math.cos((a0 * Math.PI) / 180);
    let py = cy + r * Math.sin((a0 * Math.PI) / 180);
    for (let i = 1; i <= steps; i++) {
      const a = ((a0 + (sweep * i) / steps) * Math.PI) / 180;
      const qx = cx + r * Math.cos(a);
      const qy = cy + r * Math.sin(a);
      push(px, py, qx, qy);
      px = qx;
      py = qy;
    }
    return out;
  }
  // LWPOLYLINE / POLYLINE. Bulges are read as chords: a bulge is an arc
  // between two vertices, and the chord is the straight line the drawing would
  // show if the bulge were zero. This is the one place the reference
  // approximates its source, and it is recorded in the document.
  const n = Math.min(e.xs.length, e.ys.length);
  for (let i = 1; i < n; i++) push(e.xs[i - 1], e.ys[i - 1], e.xs[i], e.ys[i]);
  if (e.closed && n > 2) push(e.xs[n - 1], e.ys[n - 1], e.xs[0], e.ys[0]);
  return out;
}

async function main() {
  const src = process.env.FLOOR1_DXF;
  if (!src) fail('set FLOOR1_DXF to the private Floor1.dxf path (it is not in this repo).');
  if (!fs.existsSync(src)) fail(`FLOOR1_DXF does not exist: ${src}`);
  if (!fs.existsSync(GEOMETRY_PATH)) {
    fail(`${GEOMETRY_PATH} not found -- the raw reference is rebased onto the model's `
      + 'envelope, so the model must exist first.');
  }
  const geoDoc = JSON.parse(fs.readFileSync(GEOMETRY_PATH, 'utf8'));

  console.log('reading DXF (streaming, read-only)...');
  const { kept, excludedEntities, excludedLayers, insertsNotExpanded, scanned } = await readEntities(src);
  console.log(`  ${scanned} lines scanned, ${kept.length} entities on carried layers, `
    + `${excludedEntities} excluded across ${excludedLayers} other layers`);

  // The frame origin is the column-cap envelope, measured here exactly as the
  // model extractor measures it, then checked against what the model declares.
  // A disagreement means the two documents would not overlay, which is the one
  // failure a reconciliation reference must not be able to have.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const e of kept) {
    if (e.layer !== CAP_LAYER) continue;
    for (const v of e.xs) { if (v < x0) x0 = v; if (v > x1) x1 = v; }
    for (const v of e.ys) { if (v < y0) y0 = v; if (v > y1) y1 = v; }
  }
  if (!Number.isFinite(x0)) fail(`no entities on the "${CAP_LAYER}" layer -- cannot establish the frame.`);
  const w = x1 - x0;
  const h = y1 - y0;
  const declaredW = geoDoc.envelope.width * 1000;
  const declaredH = geoDoc.envelope.depth * 1000;
  const TOL_MM = 1.0;
  if (Math.abs(w - declaredW) > TOL_MM || Math.abs(h - declaredH) > TOL_MM) {
    fail(`the CAD envelope (${w.toFixed(1)} x ${h.toFixed(1)} mm) disagrees with the model's `
      + `declared envelope (${declaredW} x ${declaredH} mm). Refusing to write a reference `
      + 'that would not overlay the model it is meant to check.');
  }
  console.log(`  frame origin recovered from the drawing: ${w} x ${h} mm envelope`);

  const inWindow = (xs, ys) => {
    for (const v of xs) if (v < x0 - MARGIN_MM || v > x1 + MARGIN_MM) return false;
    for (const v of ys) if (v < y0 - MARGIN_MM || v > y1 + MARGIN_MM) return false;
    return true;
  };

  const byRole = new Map();
  let outOfWindow = 0;
  let segments = 0;
  for (const e of kept) {
    if (!inWindow(e.xs, e.ys)) { outOfWindow++; continue; }
    const role = roleFor(e);
    const seg = segmentsOf(e);
    if (seg.length === 0) continue;
    // Rebase to the envelope corner. CAD axes and units are untouched.
    for (let i = 0; i < seg.length; i += 2) {
      seg[i] = Math.round((seg[i] - x0) * 1000) / 1000;
      seg[i + 1] = Math.round((seg[i + 1] - y0) * 1000) / 1000;
    }
    if (!byRole.has(role)) byRole.set(role, { segments: [], entities: 0, layers: new Map() });
    const bucket = byRole.get(role);
    bucket.segments.push(...seg);
    bucket.entities++;
    bucket.layers.set(e.layer, (bucket.layers.get(e.layer) || 0) + 1);
    segments += seg.length / 4;
  }

  const roles = [...byRole.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, b]) => ({
      id,
      entity_count: b.entities,
      segment_count: b.segments.length / 4,
      segments: b.segments,
      // Provenance, private: which drawing layers fed this role.
      source_layers: [...b.layers.entries()].map(([name, n]) => ({ name, entities: n })),
    }));

  const doc = {
    schema_version: '1.0.0',
    disclosure:
      'PRIVATE - raw line-work from the confidential Floor 1 CAD. Never commit. '
      + 'Floor-local millimetres only; the CAD origin is not recorded here.',
    source_file: 'Floor1.dxf',
    coordinate_system: {
      units: 'millimetres',
      axes: "the CAD's own: +x right, +y up, no reflection, rotation or scaling",
      origin: "the floor envelope's lower-left corner, as measured from the column-cap layer",
      note:
        'Only the origin differs from the drawing. The CAD origin locates the '
        + 'facility in its owner coordinate system and is withheld throughout this '
        + 'project; nothing about shape, size, angle or relative position is affected.',
    },
    envelope_mm: { width: Math.round(w * 1000) / 1000, depth: Math.round(h * 1000) / 1000 },
    approximations: [
      `arcs and circles are flattened to chords at ${ARC_SEGMENTS_PER_TURN} segments per turn`,
      'polyline bulges are drawn as chords',
    ],
    coverage: {
      entities_carried: roles.reduce((n, r) => n + r.entity_count, 0),
      segments: segments,
      entities_excluded_by_layer: excludedEntities,
      excluded_layer_count: excludedLayers,
      entities_outside_window: outOfWindow,
      block_references_not_expanded: insertsNotExpanded,
      note:
        'This modelspace also holds equipment DETAIL drawings -- part sections and '
        + 'component geometry -- on layers that are not the building. Those are '
        + 'excluded by layer and counted above so the omission is visible. '
        + 'Doors, windows and air showers are block references on carried layers; '
        + 'their leaves are defined inside the block, not in modelspace, so this '
        + 'reference shows their openings in the wall but not the leaf itself.',
    },
    roles,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(doc));
  console.log(`  roles: ${roles.map((r) => `${r.id}=${r.segment_count}`).join(', ')}`);
  console.log(`wrote ${OUT_PATH}`);
}

main().catch((err) => fail(err.message));
