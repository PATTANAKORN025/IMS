#!/usr/bin/env node
/**
 * Floor 1 orientation proof.
 *
 * The floor rendered vertically mirrored against the drawing, and nothing in
 * the system could say so: every internal check compared the model against
 * itself, so a model that was consistently wrong passed all of them. This
 * compares the model against the CAD's own coordinates and against the CAD's
 * own place names, and it decides by measurement rather than by eye.
 *
 * Six properties, each failing loudly on its own:
 *
 *   1. The document declares the canonical frame it is in.
 *   2. LEFT/RIGHT ordering matches the CAD, for every equipment record.
 *   3. TOP/BOTTOM ordering matches the CAD, in SCREEN terms -- the plan
 *      camera's screen-up is world -z, so the comparison is against -z and not
 *      against z. This is the exact check the old frame failed.
 *   4. Named areas land on the correct side, matched by the drawing's own text.
 *   5. The transform is an isometry: pairwise distances are preserved, so
 *      nothing was stretched, scaled or skewed while being reflected.
 *   6. Rotation is stored as the CAD states it, and the renderer's sign is the
 *      one the reflection demands.
 *
 * Reads only private, host-local documents. Prints ranks, counts and
 * millimetres -- never a coordinate that would locate the facility, and never
 * an area name.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const frame = require('../../scripts/lib/floor1-frame');

const PRIVATE_DIR = process.env.FLOOR1_PRIVATE_DIR
  || path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'private');
const GEOMETRY_PATH = path.join(PRIVATE_DIR, 'floor1-geometry.json');
const ZONES_PATH = path.join(PRIVATE_DIR, 'floor1-zones.json');
const BUNDLE_PATH = process.env.FLOOR1_CAD_BUNDLE
  || path.join(PRIVATE_DIR, 'floor1-cad-bundle.json');

let failures = 0;
let checks = 0;

function check(ok, label, detail) {
  checks++;
  if (ok) {
    console.log(`  PASS  ${label}${detail ? `  ${detail}` : ''}`);
  } else {
    console.log(`  FAIL  ${label}${detail ? `  ${detail}` : ''}`);
    failures++;
  }
}

if (!fs.existsSync(GEOMETRY_PATH) || !fs.existsSync(BUNDLE_PATH)) {
  console.error('floor1-orientation: the private geometry document and CAD bundle are both '
    + 'required. Both are host-local and gitignored; this check is skipped on a clone '
    + 'that has neither.');
  process.exit(fs.existsSync(GEOMETRY_PATH) ? 1 : 0);
}

const geometry = JSON.parse(fs.readFileSync(GEOMETRY_PATH, 'utf8'));
const bundle = JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
const zonesDoc = fs.existsSync(ZONES_PATH)
  ? JSON.parse(fs.readFileSync(ZONES_PATH, 'utf8')) : null;

const W = bundle.envelope_mm.width;
const H = bundle.envelope_mm.depth;
const HALF_W = W / 2000;
const HALF_D = H / 2000;

console.log('Floor 1 orientation proof');
console.log('='.repeat(56));

/* -- 1. the frame is declared ---------------------------------------- */
const cs = geometry.coordinate_system || {};
check(cs.canonical_frame === frame.CANONICAL_FRAME_VERSION,
  'the document declares the canonical frame',
  `${cs.canonical_frame || 'none'} vs ${frame.CANONICAL_FRAME_VERSION}`);

/* -- rebuild the CAD side, independently of the extractor -------------- */
//
// Matching is by position, through the inverse transform, so this test never
// trusts the extractor's own bookkeeping: if the model and the CAD disagree
// about where something is, the match fails rather than being assumed.
const boxes = bundle.block_boxes || {};
const cadByKey = new Map();
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
  for (const [ax, ay] of [[(x0 + x1) / 2, (y0 + y1) / 2], [ins.x, ins.y]]) {
    cadByKey.set(`${Math.round(ax)}:${Math.round(ay)}`, { ins, box, ax, ay });
  }
}

const equipment = Array.isArray(geometry.equipment) ? geometry.equipment : [];
const pairs = [];
for (const e of equipment) {
  const cadX = frame.twinXToCad(e.position.x, HALF_W);
  const cadY = frame.twinZToCad(e.position.z, HALF_D);
  let hit = null;
  for (let dx = -1; dx <= 1 && !hit; dx++) {
    for (let dy = -1; dy <= 1 && !hit; dy++) {
      hit = cadByKey.get(`${Math.round(cadX) + dx}:${Math.round(cadY) + dy}`) || null;
    }
  }
  if (hit) pairs.push({ e, cad: hit });
}
check(pairs.length === equipment.length,
  'every equipment record maps back onto a CAD INSERT through the inverse transform',
  `${pairs.length} of ${equipment.length}`);

/* -- 2 and 3. ordering ------------------------------------------------- */
//
// Rank correlation, not a spot check. A single inverted pair anywhere in the
// population fails it, which is what "ordering matches" has to mean.
function rankOf(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(values.length);
  order.forEach(([, i], k) => { r[i] = k; });
  return r;
}
function inversions(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      // Ties in either axis carry no ordering claim and are not counted.
      if (a[i] === a[j] || b[i] === b[j]) continue;
      if ((a[i] < a[j]) !== (b[i] < b[j])) n++;
    }
  }
  return n;
}

if (pairs.length > 1) {
  const cadX = pairs.map((p) => p.cad.ax);
  const cadY = pairs.map((p) => p.cad.ay);
  const twinX = pairs.map((p) => p.e.position.x);
  // SCREEN-UP is world -z. Comparing against +z is precisely the mistake the
  // old frame made, and comparing against it here would let the bug back in.
  const screenUp = pairs.map((p) => -p.e.position.z);

  const invX = inversions(rankOf(cadX), rankOf(twinX));
  const invY = inversions(rankOf(cadY), rankOf(screenUp));
  check(invX === 0, 'left/right ordering matches the CAD for every pair',
    `${invX} inverted pair(s) of ${(pairs.length * (pairs.length - 1)) / 2}`);
  check(invY === 0, 'top/bottom ordering matches the CAD for every pair (screen-up = -z)',
    `${invY} inverted pair(s) of ${(pairs.length * (pairs.length - 1)) / 2}`);
}

/* -- 4. named areas land on the correct side --------------------------- */
//
// The drawing's own text is the ground truth here: a place with a name, whose
// position on the sheet the CAD states outright. This is what turns "the plan
// looks right" into "the plan agrees with the drawing".
const normalise = (s) => String(s || '')
  .toUpperCase()
  .replace(/&/g, ' AND ')
  .replace(/[^A-Z0-9 -]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const labels = Array.isArray(bundle.area_labels) ? bundle.area_labels : [];
if (!labels.length || !zonesDoc) {
  console.log('  SKIP  named areas land on the correct side  '
    + '(the bundle carries no area labels, or no zone document is deployed)');
} else {
  const byName = new Map();
  for (const l of labels) {
    const n = normalise(l.text);
    if (n.length < 4 || /^\d/.test(n)) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(l);
  }
  const zoneList = Array.isArray(zonesDoc.functional_zones) ? zonesDoc.functional_zones
    : (Array.isArray(zonesDoc.zones) ? zonesDoc.zones : []);

  // CONTAINMENT, not ordering. An area label sits somewhere inside its area,
  // never at the polygon's centroid, so ranking centroids against labels
  // measures the label's offset as much as the frame -- two areas at similar
  // depth invert on nothing. "Does the drawing's own label for this area fall
  // inside the polygon the model drew for it" has no such slack: it is either
  // the right place or it is not.
  //
  // This is also the check that discriminates. Under the previous mirrored
  // frame it scores zero out of fifteen; under the canonical frame, fifteen.
  const insidePolygon = (px, pz, verts) => {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const xi = verts[i].x;
      const zi = verts[i].z;
      const xj = verts[j].x;
      const zj = verts[j].z;
      if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };

  let named = 0;
  let contained = 0;
  let mirroredHits = 0;
  let undecidable = 0;
  for (const z of zoneList) {
    const n = normalise(z.zone_name || z.name);
    const hits = byName.get(n);
    const verts = z.geometry && Array.isArray(z.geometry.vertices) ? z.geometry.vertices : [];
    if (!hits || verts.length < 3) continue;
    named++;
    if (hits.some((h) => insidePolygon(
      frame.cadXToTwin(h.x, HALF_W), frame.cadYToTwin(h.y, HALF_D), verts,
    ))) contained++;
    // The same labels placed by the OLD frame, as a control. A frame error
    // that happened to satisfy the check above would satisfy this one too.
    //
    // WHICH ZONES CAN ACT AS A CONTROL. The old frame differs from this one by
    // a reflection through the floor's mid-depth, so the control point is the
    // canonical point reflected in z. A polygon wide enough in z to contain
    // BOTH points holds no information about the sign: it would be placed by
    // either frame, because it overlaps its own mirror image at that label.
    // One area here is such a shape -- it spans 66 m of the 120 m depth across
    // the centre line. Counting it as a control failure would make this proof
    // depend on how symmetric the building happens to be; counting it as a
    // control pass would quietly weaken the proof. It is neither: it is
    // undecidable, and it is reported as such and excluded.
    const mirrored = hits.some((h) => insidePolygon(
      h.x / 1000 - HALF_W, h.y / 1000 - HALF_D, verts,
    ));
    const canonical = hits.some((h) => insidePolygon(
      frame.cadXToTwin(h.x, HALF_W), frame.cadYToTwin(h.y, HALF_D), verts,
    ));
    if (mirrored && canonical) undecidable++;
    else if (mirrored) mirroredHits++;
  }

  const decidable = named - undecidable;
  if (named < 3) {
    console.log(`  SKIP  named areas land on the correct side  (only ${named} matched by name)`);
  } else {
    check(contained === named,
      "every named area contains the drawing's own label for it",
      `${contained} of ${named} matched by the drawing's own text`);
    // The control keeps its force only while most areas can act as one.
    check(decidable >= 3 && decidable * 4 >= named * 3,
      'enough areas are narrow enough in z to act as a sign control',
      `${decidable} of ${named} decidable, ${undecidable} overlap their own mirror`);
    check(mirroredHits === 0,
      'and the previous mirrored frame places none of the decidable ones',
      `${mirroredHits} of ${decidable} under the old transform -- the check discriminates`);
  }
}

/* -- 5. the transform is an isometry ----------------------------------- */
//
// A reflection preserves distance. If anything had been scaled or skewed while
// the sign was flipped, the model would still order correctly and be wrong
// everywhere else, so ordering alone is not enough.
if (pairs.length > 8) {
  let worst = 0;
  const step = Math.max(1, Math.floor(pairs.length / 40));
  for (let i = 0; i < pairs.length; i += step) {
    for (let j = i + step; j < pairs.length; j += step) {
      const a = pairs[i];
      const b = pairs[j];
      const dCad = Math.hypot(a.cad.ax - b.cad.ax, a.cad.ay - b.cad.ay);
      const dTwin = Math.hypot(a.e.position.x - b.e.position.x,
        a.e.position.z - b.e.position.z) * 1000;
      worst = Math.max(worst, Math.abs(dCad - dTwin));
    }
  }
  check(worst < 2.0, 'the transform preserves distance (it reflects, it does not scale)',
    `worst pairwise error ${worst.toFixed(3)} mm`);
}

/* -- 6. rotation ------------------------------------------------------- */
let rotMismatch = 0;
let worstRot = 0;
for (const p of pairs) {
  const cadRot = ((p.cad.ins.rotation || 0) % 360 + 360) % 360;
  const d = Math.abs(cadRot - p.e.rotation_deg);
  const wrapped = Math.min(d, 360 - d);
  worstRot = Math.max(worstRot, wrapped);
  if (wrapped > 0.01) rotMismatch++;
}
check(rotMismatch === 0, 'rotation is stored exactly as the CAD states it',
  `${rotMismatch} mismatched, worst ${worstRot.toFixed(4)} deg`);
check(frame.CAD_ROTATION_SIGN === 1,
  'the rotation sign is the one a reflected frame demands',
  `${frame.CAD_ROTATION_SIGN > 0 ? '+1' : '-1'}`);

/* -- the structural grid rides the same frame -------------------------- */
const grid = geometry.grid;
if (grid && Array.isArray(grid.z_lines) && grid.z_lines.length > 1) {
  const ascending = grid.z_lines.every((v, i) => i === 0 || v > grid.z_lines[i - 1]);
  check(ascending, 'the structural grid z lines are still sorted after the reflection');
  check(!Array.isArray(grid.z_labels) || grid.z_labels.length === grid.z_lines.length,
    'every grid line still carries its own bubble',
    `${grid.z_lines.length} lines, ${(grid.z_labels || []).length} labels`);
}

console.log('='.repeat(56));
console.log(`${checks} check(s), ${failures} failure(s)`);
console.log(failures === 0 ? 'ORIENTATION PROOF PASSED' : 'ORIENTATION PROOF FAILED');
process.exit(failures === 0 ? 0 : 1);
