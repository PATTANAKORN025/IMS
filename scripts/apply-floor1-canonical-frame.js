#!/usr/bin/env node
/**
 * Re-frames the private Floor 1 documents into the canonical coordinate frame.
 *
 * WHY THIS EXISTS AS A SEPARATE PASS. The frame correction belongs in the
 * extractors, and it is there -- scripts/extract-floor1-cad.js and
 * scripts/extract-floor1-equipment.js both compute z through
 * scripts/lib/floor1-frame.js now. But the structural half of the model
 * (envelope outline, grid, columns, walls, openings, zones) can only be
 * regenerated from Floor1.dxf, and the DXF is not on this host: it is
 * confidential, host-local, and was removed after the extraction passes ran.
 *
 * Re-deriving that geometry is not possible here; reflecting it is, exactly and
 * losslessly, because the correction is a pure sign change on one axis. This
 * script applies it to the documents already extracted, so the whole model
 * lands in one frame rather than half of it. A future run from the DXF
 * produces the same frame directly and does not need this script.
 *
 * IDEMPOTENT BY CONSTRUCTION. A reflection applied twice is the identity,
 * which would silently restore the bug. The document records the frame version
 * it is in, and this refuses to run against a document already canonical.
 *
 * Usage: node scripts/apply-floor1-canonical-frame.js [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const frame = require('./lib/floor1-frame');

const ROOT = path.resolve(__dirname, '..');
const PRIVATE_DIR = process.env.FLOOR1_PRIVATE_DIR
  || path.join(ROOT, 'services', 'factory-twin-3d', 'private');
const GEOMETRY_PATH = path.join(PRIVATE_DIR, 'floor1-geometry.json');
const ZONES_PATH = path.join(PRIVATE_DIR, 'floor1-zones.json');
const DRY = process.argv.includes('--dry-run');

function fail(msg) {
  console.error(`apply-floor1-canonical-frame: ${msg}`);
  process.exit(1);
}

const round3 = (v) => Math.round(v * 1000) / 1000;
const flip = (v) => (typeof v === 'number' && Number.isFinite(v) ? round3(-v) : v);

let touched = 0;

/** Negates a z field in place, counting every value actually changed. */
function flipZ(obj, key) {
  if (!obj || typeof obj !== 'object') return;
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return;
  obj[key] = flip(v);
  touched++;
}

function main() {
  if (!fs.existsSync(GEOMETRY_PATH)) fail(`no geometry document at ${GEOMETRY_PATH}`);
  const geometry = JSON.parse(fs.readFileSync(GEOMETRY_PATH, 'utf8'));

  const cs = geometry.coordinate_system || {};
  if (cs.canonical_frame === frame.CANONICAL_FRAME_VERSION) {
    console.log(`already in canonical frame ${frame.CANONICAL_FRAME_VERSION} -- nothing to do.`);
    console.log('Reflecting a second time would restore the mirrored plan, so this is a refusal, not a skip.');
    process.exit(0);
  }

  /* -- every z-bearing field in the geometry document ------------------ */
  const fp = geometry.footprint_polygon;
  for (const v of (fp && fp.vertices) || []) flipZ(v, 'z');
  // A reflection reverses the sense in which a polygon is wound. The document
  // records its winding and the validator checks the record against the
  // vertices, so the record has to turn over with them -- otherwise the very
  // next validation fails on a field nobody thought of as a coordinate.
  if (fp && (fp.winding === 'CW' || fp.winding === 'CCW')) {
    fp.winding = fp.winding === 'CW' ? 'CCW' : 'CW';
    touched++;
  }
  for (const c of geometry.columns || []) flipZ(c.position, 'z');
  for (const w of geometry.walls || []) { flipZ(w, 'z1'); flipZ(w, 'z2'); }
  for (const l of geometry.wall_lines || []) { flipZ(l, 'z1'); flipZ(l, 'z2'); }
  for (const o of geometry.openings || []) flipZ(o.position, 'z');
  for (const z of geometry.zones || []) {
    if (z.bounds) {
      // A box is anchored at its low-z corner, so reflecting the anchor alone
      // would move the box by its own depth. Reflect the far edge and re-anchor.
      const far = z.bounds.z + z.bounds.depth;
      z.bounds.z = round3(-far);
      touched++;
    }
  }
  for (const e of geometry.equipment || []) {
    flipZ(e.position, 'z');
    flipZ(e.insertion_point, 'z');
  }
  // The superseded raster slots are reflected too. They are served nowhere, but
  // a document holding two frames at once is a trap for whoever reads it next.
  for (const s of geometry.slots || []) flipZ(s.position, 'z');

  /* -- the structural grid ---------------------------------------------
   * z_lines and z_labels are parallel arrays and z_lines is sorted ascending.
   * Negating reverses the order, so both are re-sorted together -- pairing a
   * line with the wrong bubble would be a worse error than the one being
   * fixed. */
  const grid = geometry.grid;
  if (grid && Array.isArray(grid.z_lines)) {
    const labels = Array.isArray(grid.z_labels) ? grid.z_labels : [];
    const paired = grid.z_lines.map((at, i) => ({ at: -at, label: labels[i] }));
    paired.sort((a, b) => a.at - b.at);
    grid.z_lines = paired.map((p) => round3(p.at));
    if (labels.length) grid.z_labels = paired.map((p) => p.label);
    // Spans describe the intervals between lines, so reversing the lines
    // reverses the spans.
    if (Array.isArray(grid.z_spans_mm)) grid.z_spans_mm = grid.z_spans_mm.slice().reverse();
    touched += grid.z_lines.length;
  }

  // Unserved, but it is a coordinate and it lives in this frame too.
  if (geometry.camera) {
    flipZ(geometry.camera.position, 'z');
    flipZ(geometry.camera.target, 'z');
  }

  /* -- the frame's own record ------------------------------------------- */
  geometry.coordinate_system = Object.assign({}, cs, {
    units: 'metres',
    origin: 'centre of the printed envelope',
    axes: '+x along the 174500 mm chain, in the CAD\'s own +x direction; '
      + '+z is the NEGATED CAD +y, so that the plan camera -- whose screen-up is '
      + 'world -z -- renders the sheet the way a CAD viewer does; +y up',
    canonical_frame: frame.CANONICAL_FRAME_VERSION,
    canonical_frame_note: 'x_twin = (x_cad - X0)/1000 - halfWidth; '
      + 'z_twin = -((y_cad - Y0)/1000 - halfDepth). A reflection, so a CAD plan '
      + 'rotation is applied about +Y with sign '
      + `${frame.CAD_ROTATION_SIGN > 0 ? '+1' : '-1'}. `
      + 'See scripts/lib/floor1-frame.js for the derivation and the measurement '
      + 'that established the mirror.',
    canonical_frame_applied: new Date().toISOString(),
  });

  /* -- zones live in their own document, in the same frame --------------- */
  let zoneVerts = 0;
  let zonesDoc = null;
  if (fs.existsSync(ZONES_PATH)) {
    zonesDoc = JSON.parse(fs.readFileSync(ZONES_PATH, 'utf8'));
    const list = Array.isArray(zonesDoc.functional_zones) ? zonesDoc.functional_zones
      : (Array.isArray(zonesDoc.zones) ? zonesDoc.zones : []);
    for (const z of list) {
      const g = z && z.geometry;
      for (const v of (g && g.vertices) || []) {
        if (typeof v.z === 'number' && Number.isFinite(v.z)) { v.z = flip(v.z); zoneVerts++; }
      }
      if (z && z.centroid && typeof z.centroid.z === 'number') {
        z.centroid.z = flip(z.centroid.z);
        zoneVerts++;
      }
    }
    zonesDoc.canonical_frame = frame.CANONICAL_FRAME_VERSION;
  }

  console.log(`canonical frame ${frame.CANONICAL_FRAME_VERSION}`);
  console.log(`  geometry z values reflected   ${touched}`);
  console.log(`  zone vertices reflected       ${zoneVerts}`);
  console.log(`  rotation sign for the renderer ${frame.CAD_ROTATION_SIGN > 0 ? '+1' : '-1'}`);

  if (DRY) {
    console.log('\n--dry-run: nothing written.');
    return;
  }
  fs.writeFileSync(GEOMETRY_PATH, `${JSON.stringify(geometry, null, 2)}\n`);
  if (zonesDoc) fs.writeFileSync(ZONES_PATH, `${JSON.stringify(zonesDoc, null, 2)}\n`);
  console.log(`\nwrote ${GEOMETRY_PATH}`);
  if (zonesDoc) console.log(`wrote ${ZONES_PATH}`);
}

main();
