// IMS Factory 3D Digital Twin -- Task 4.2 (all 10 real reporting LDI
// machines, grouped by their 5 real zones)
//
// Extends Task 4.1's 1-machine POC: 10 box meshes instead of 1, positioned
// per /api/placement (deterministic simulated grid, grouped by real zone),
// each colored/labeled by its own REAL live state/board/MO/alarm data
// (fetched from /api/state -- same query shape as ims-ldi-factory-digital-
// twin.json refId "A", extended to all 10 eqp_id values -- see server.js).
// Polls /api/state every 5s. Clicking ANY of the 10 boxes navigates to that
// SPECIFIC machine's real Machine Snapshot drill-down (raycast against all
// 10 meshes, not just one).
//
// Floor-scoping addendum: adds a floor shell + zone boundary outlines
// (buildFloorShells / the zone-outline block in buildScene). Both are
// derived entirely from data this service already owned (the synthetic
// simulated_grid coordinates) -- no real floor plan/CAD/survey data was
// read into this file. See server.js's FLOOR_0 comment and
// docs/superpowers/specs/2026-08-27-sanitized-4floor-twin-layout-design.md
// for why "Floor 1" here is a default container label, not a verified
// claim about where these real devices physically sit.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Color/label per machine now come straight off /api/state's own
// state_color/state_label fields -- server.js resolves those from
// lib/contracts.js's MACHINE_STATE_THEME, the one place a MachineState's
// color/label is defined. No second, separately-hardcoded copy here.
// DEFAULT_MACHINE_COLOR is only the pre-first-poll placeholder (before any
// real /api/state response has arrived to set a real one).
const DEFAULT_MACHINE_COLOR = 0x64748b;

const POLL_MS = 5000;

// ── Scene setup ──────────────────────────────────────────────
const container = document.getElementById('scene');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 250);
// Wider/higher/more top-down framing than Task 4.1's single-box camera
// (4,4,6) -- the scene now spans roughly x:[-36,36] z:[-4,4], needs a
// pulled-back, steeper overhead angle to keep all 5 zones AND their zone
// labels legibly separated in frame by default (design §11's "operator/
// engineer interactive session" mode -- OrbitControls still let the user
// zoom/pan/rotate freely from here; re-tuned after a real screenshot showed
// the first pass's flatter angle caused zone labels to visually overlap).
camera.position.set(18, 52, 46);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);
// A WebGL canvas is opaque to assistive technology. It is named rather than
// left as a bare "canvas", and points at the HUD, which carries the same live
// data as plain DOM text and is the documented accessibility path.
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.setAttribute(
  'aria-label',
  'Three-dimensional view of Floor 1. Machine state and evidence counts are also available as text in the panel on the left.'
);

const controls = new OrbitControls(camera, renderer.domElement);
// Damping keeps the camera gliding after the pointer stops, which is exactly
// the kind of continued motion a reduced-motion preference asks not to see.
// Honoured at construction rather than animated away, so the camera simply
// stops when the input stops.
const prefersReducedMotion =
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
controls.enableDamping = !prefersReducedMotion;
// Target offset +14 on X (not 0) so the default view keeps the leftmost
// zone (Site A - Zone 1) clear of the fixed-position HUD sidebar,
// which covers roughly the left 280px of the viewport and would otherwise
// intercept clicks meant for the 3D canvas underneath it -- a real,
// discovered-via-screenshot issue, not a hypothetical one. Users can still
// freely pan/rotate anywhere via OrbitControls; this only changes the
// initial framing.
controls.target.set(14, 0.5, 0);

// ── Scene layers ────────────────────────────────────────────
// Four layers, matching the four distinct kinds of claim this twin makes.
// They are kept apart because they carry different evidentiary weight, not
// for convenience: STRUCTURAL is measured building fabric, FUNCTIONAL is
// digitized process areas, OPERATIONAL is physical equipment with no
// confirmed identity, and TELEMETRY is live data about real devices. An
// object belongs to exactly one.
//
// Grouping is also what makes visibility toggles a one-line operation
// instead of visibility logic scattered across every build function, and it
// leaves each layer's transform/culling handled by three.js as a unit.
const layers = {
  structural: new THREE.Group(), // envelope, footprint, grid, columns
  functional: new THREE.Group(), // functional/process zones
  operational: new THREE.Group(), // machine meshes, equipment slot pads
  telemetry: new THREE.Group(), // live state overlays (labels)
};
layers.structural.name = 'structural';
layers.functional.name = 'functional';
layers.operational.name = 'operational';
layers.telemetry.name = 'telemetry';
for (const g of Object.values(layers)) scene.add(g);

// Sub-layers, because "structure" and "equipment" each bundle two things an
// operator has a real reason to separate: the measured building shell is a
// different claim from 147 detected columns, and 23 monitored devices on a
// SIMULATED grid are a different claim from 242 OBSERVED equipment positions.
// Hiding one must not hide the other, or the toggle silently conflates two
// evidence classes.
//
// Nested Groups rather than a flat list: the four top-level layers keep their
// meaning and their existing traversal counts, and a parent toggle still hides
// its children, so nothing that depended on the coarse layers changed.
const sublayers = {
  shell: new THREE.Group(), // floor plate, orientation grid, measured envelope outline
  columns: new THREE.Group(), // detected structural columns
  machines: new THREE.Group(), // monitored devices (simulated positions) + their zone boxes
  slots: new THREE.Group(), // observed equipment slots, no confirmed identity
};
for (const [name, g] of Object.entries(sublayers)) g.name = name;
layers.structural.add(sublayers.shell, sublayers.columns);
layers.operational.add(sublayers.machines, sublayers.slots);

// ── View modes ──────────────────────────────────────────────
// Two coordinate systems legitimately coexist in this scene and neither may
// be moved to suit the other:
//
//   OPERATOR  the 23 monitored devices, positioned on a synthetic grid
//             (is_simulated: true) because no real per-device position
//             exists. Their framing is the hand-tuned one that predates the
//             building geometry, kept byte-for-byte so the monitoring
//             default is unchanged.
//   BUILDING  the measured envelope, footprint, columns, slots and zones,
//             which span far more ground than the synthetic device grid.
//
// Framing one well necessarily frames the other badly. That is a real
// property of the data, not a bug, so it is exposed as an explicit choice
// rather than resolved by moving machines or rescaling geometry -- either of
// which would invent a spatial relationship the evidence does not support.
//
// Switching only moves the camera. No geometry, position, layer visibility
// or API result is touched.
const OPERATOR_VIEW = Object.freeze({
  // The values already in use, preserved exactly (see the camera/controls
  // comments above for why they were chosen).
  position: { x: 18, y: 52, z: 46 },
  target: { x: 14, y: 0.5, z: 0 },
});
let buildingView = null; // derived from real bounds once geometry arrives
let overviewView = null; // derived from the union of both, once both exist
let activeView = 'operator';

// Bounds each derived view was fitted from. Kept so a resize (or the arrival
// of the second data source) can refit rather than leave framing computed for
// a stale aspect ratio. Declared here, above every reader, because the fits
// are recomputed from them in three different places.
let buildingBounds = null; // measured envelope
let machineBounds = null; // synthetic device grid extent

// Derives a camera placement that fits a bounding box, rather than hardcoding
// coordinates: the building's extent is known from the data, so the framing
// should follow it and stay correct if the evidence ever changes.
function frameBounds({ cx, cz, width, depth, height = 0 }) {
  // camera.fov is the VERTICAL field of view, so the two axes need different
  // divisors: the horizontal half-angle is tan(fov/2) * aspect. Treating both
  // the same over-fits on one axis, which showed up as structure clipping at
  // portrait aspect ratios where the depth axis becomes the binding one.
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const tanV = Math.tan(fov / 2);
  const aspect = Math.max(camera.aspect, 0.0001);
  const distForWidth = width / 2 / (tanV * aspect);
  const distForDepth = depth / 2 / tanV;
  const dist = Math.max(distForWidth, distForDepth) * 1.15; // 15% margin so nothing clips at the edge
  return {
    position: { x: cx + dist * 0.35, y: Math.max(dist * 0.75, height * 2), z: cz + dist * 0.85 },
    target: { x: cx, y: height / 2, z: cz },
  };
}

// OVERVIEW frames both coordinate systems at once: the measured building and
// the synthetic device grid, whichever extent is larger on each axis. It is a
// framing union, not a reconciliation -- it does not move a machine towards
// the building or claim the two systems are registered to each other. It
// exists because "show me everything" is a real question for an executive or
// NOC walkthrough, and the honest answer is "here is both, unmerged".
function unionBounds(a, b) {
  if (!a) return b;
  if (!b) return a;
  const minX = Math.min(a.cx - a.width / 2, b.cx - b.width / 2);
  const maxX = Math.max(a.cx + a.width / 2, b.cx + b.width / 2);
  const minZ = Math.min(a.cz - a.depth / 2, b.cz - b.depth / 2);
  const maxZ = Math.max(a.cz + a.depth / 2, b.cz + b.depth / 2);
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ,
    height: Math.max(a.height || 0, b.height || 0),
  };
}

// Recomputes every derived view from the bounds currently known. Called when
// either data source arrives and on resize, because the fit depends on aspect.
// OPERATOR_VIEW is never recomputed: it is the hand-tuned monitoring default
// and must stay byte-for-byte what it was.
function refitViews() {
  if (buildingBounds) buildingView = frameBounds(buildingBounds);
  const combined = unionBounds(buildingBounds, machineBounds);
  overviewView = combined ? frameBounds(combined) : null;
  const far = overviewView || buildingView;
  if (far) ensureDepthRange(Math.hypot(far.position.x, far.position.y, far.position.z));
  // A view that has no data behind it must not offer itself as a choice.
  for (const btn of document.querySelectorAll('#view-controls button[data-view]')) {
    const v = btn.dataset.view;
    btn.disabled = (v === 'building' && !buildingView) || (v === 'overview' && !overviewView);
    // A control that is disabled without a reason reads as broken. Say why:
    // the framing is derived from data that has not arrived, not withheld.
    btn.title = btn.disabled
      ? 'Unavailable until the measured building geometry loads'
      : '';
  }
  if (activeView !== 'operator') applyView(activeView);
}

const VIEWS = () => ({ operator: OPERATOR_VIEW, building: buildingView, overview: overviewView });

function applyView(name) {
  const v = VIEWS()[name];
  if (!v) return false;
  camera.position.set(v.position.x, v.position.y, v.position.z);
  controls.target.set(v.target.x, v.target.y, v.target.z);
  controls.update();
  activeView = name;
  for (const btn of document.querySelectorAll('#view-controls button[data-view]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.view === name));
  }
  return true;
}

document.getElementById('view-controls')?.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-view]');
  if (btn) applyView(btn.dataset.view);
});

// Reset returns the camera to the ACTIVE view's canonical framing rather than
// forcing operator view: orbit and zoom drift is the thing being undone, not
// the operator's choice of what to look at. Same camera-only guarantee.
function resetView() {
  return applyView(activeView);
}

document.getElementById('view-reset')?.addEventListener('click', resetView);

// The far plane was sized for the old synthetic spread; the building view
// pulls the camera much further back, so a too-near far plane would clip the
// structure it exists to show.
function ensureDepthRange(dist) {
  const needed = dist * 3;
  if (camera.far < needed) {
    camera.far = needed;
    camera.updateProjectionMatrix();
  }
}

// One centralized controller, deliberately not visibility logic scattered
// through the build functions. Because each layer is a Group, hiding one is
// a single flag: the objects stay in the scene graph, keep their geometry
// and keep polling. This is presentation only -- it never mutates data,
// never re-fetches, and never changes what the API returned.
function setLayerVisible(name, visible) {
  const g = layers[name] || sublayers[name];
  if (!g) return false;
  g.visible = visible;
  return true;
}

document.getElementById('layer-controls')?.addEventListener('change', (ev) => {
  const box = ev.target;
  if (!(box instanceof HTMLInputElement) || !box.dataset.layer) return;
  setLayerVisible(box.dataset.layer, box.checked);
});

// Floor grid -- purely orientation, not real factory floor data. Sized up
// from Task 4.1's 20x20 to cover the full 10-machine/5-zone spread.
const grid = new THREE.GridHelper(100, 40, 0x334155, 0x1e293b);
sublayers.shell.add(grid);

// ── Floor shell (Floor 1, default grouping) ─────────────────
// A plate + edge outline under the grid, one per entry in /api/placement's
// `floors` array (currently always exactly one -- see server.js FLOOR_0).
// Sized from the actual placement bounding box (+ padding), NOT a guessed
// fixed constant: a hardcoded shell size is exactly the class of bug this
// codebase has already hit twice (Task 4.2's fixed 2-machine-per-zone
// assumption, server.js's ZONE_ORDER comment) -- the real device set has
// grown past every hand-picked constant tried so far, so this derives its
// extent from data instead of guessing another one that will go stale the
// same way. Still zero real facility data: the bounding box comes from the
// synthetic simulated_grid coordinates this service already computed.
const FLOOR_PADDING = 6;

function buildFloorShells(floors, machines) {
  if (machines.length === 0) return;
  const xs = machines.map((m) => m.pos_x);
  const ys = machines.map((m) => m.pos_y);
  const minX = Math.min(...xs) - FLOOR_PADDING;
  const maxX = Math.max(...xs) + FLOOR_PADDING;
  const minY = Math.min(...ys) - FLOOR_PADDING;
  const maxY = Math.max(...ys) + FLOOR_PADDING;
  const width = maxX - minX;
  const depth = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cz = (minY + maxY) / 2;

  for (const floor of floors) {
    const geometry = new THREE.PlaneGeometry(width, depth);
    const material = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(geometry, material);
    shell.rotation.x = -Math.PI / 2; // lay flat on the X/Z plane, under the grid
    shell.position.set(cx, -0.05, cz);
    sublayers.shell.add(shell);

    // The floor plate is rendered from validated geometry only. An earlier
    // revision textured it with a private reference image fetched over
    // HTTP; that was removed -- the confidential source drawing must never
    // be reachable by URL, and validated geometry supersedes a pixel
    // backdrop as a spatial reference.

    // Plate alone reads as near-invisible against the scene background at
    // this opacity -- a bright edge outline is what actually makes "this is
    // the floor extent" legible, confirmed via a real screenshot before
    // adding this (the plain-plate version rendered but was not visible).
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 0.05, depth));
    const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xf59e0b }));
    outline.position.set(cx, -0.05, cz);
    sublayers.shell.add(outline);

    const label = makeTextSprite(floor.floor_label, { fontSize: 22, scaleFactor: 0.02, bg: 'rgba(245, 158, 11, 0.85)', fg: '#1c1305' });
    label.position.set(cx, 9, minY - 2);
    sublayers.shell.add(label);
  }
}

// ── Anonymous physical-slot geometry (/api/floor-geometry) ──────
// Entirely separate from the real-device layer above: building envelope,
// columns, zone boundaries, and anonymous physicalSlotId markers. Every
// dimension here comes from the server's response, which is itself
// arbitrary/self-chosen numbers (see private/floor1-geometry.json's own
// header) -- never real facility data. Rendered in a visually distinct,
// dim, muted style (vs. the real devices' bright per-state colors) and
// deliberately NOT added to machineMeshes / raycasting: an unmapped slot
// has no click target, no drill-down, no live status, by construction --
// the UI cannot accidentally imply a physical slot is a connected device.
// ── Shared geometry/material caches ─────────────────────────
// 147 columns and 242 slot pads previously allocated one BoxGeometry and one
// Material each -- ~390 of each for objects that reuse a handful of distinct
// sizes and three distinct appearances. Materials matter most: each unique
// material is its own shader/state bucket at draw time. Keys are rounded to
// the millimetre so floating-point noise does not defeat the cache.
//
// This changes allocation only. Every mesh keeps its own transform, so no
// position, dimension or colour is altered -- the scene renders identically.
const geometryCache = new Map();
const materialCache = new Map();

function resourceStats() {
  return { geometries: geometryCache.size, materials: materialCache.size };
}

function boxGeometry(w, h, d) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = geometryCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geometryCache.set(key, g);
  }
  return g;
}

function standardMaterial(color) {
  const key = `std|${color}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color });
    materialCache.set(key, m);
  }
  return m;
}

function basicMaterial(color, opacity) {
  const key = `basic|${color}|${opacity}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
    materialCache.set(key, m);
  }
  return m;
}

// The renderer is the second barrier, not a consumer that trusts the wire.
// The server already projects every field, but a truthiness check is not a
// shape check: an envelope that arrived as a string passes `if (envelope)` and
// then yields NaN width, depth and height, which places a mesh at NaN and
// makes the whole scene's bounds meaningless. Nothing here may be drawn from a
// value that is not a real number.
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const finitePoint = (p, needY) =>
  p !== null && typeof p === 'object' && finite(p.x) && finite(p.z) && (!needY || finite(p.y));
const asArray = (v) => (Array.isArray(v) ? v : []);

function buildPhysicalSlots(geometry) {
  const envelope = geometry && typeof geometry === 'object' ? geometry.envelope : null;
  // A partially-valid envelope is not a smaller envelope, it is an unknown
  // one. Drawing from it would state a measurement nobody made.
  if (!envelope || typeof envelope !== 'object') return;
  if (!finite(envelope.width) || !finite(envelope.depth) || !finite(envelope.height)) return;

  const columns = asArray(geometry.columns);
  const zones = asArray(geometry.zones);
  const slots = asArray(geometry.slots);

  // Building framing comes from the measured envelope, not from constants.
  // The bounds are retained so a resize can refit for the new aspect ratio.
  buildingBounds = {
    cx: 0,
    cz: 0,
    width: envelope.width,
    depth: envelope.depth,
    height: envelope.height,
  };
  refitViews();

  const envelopeGeom = new THREE.BoxGeometry(envelope.width, envelope.height, envelope.depth);
  const envelopeEdges = new THREE.EdgesGeometry(envelopeGeom);
  const envelopeOutline = new THREE.LineSegments(envelopeEdges, new THREE.LineBasicMaterial({ color: 0x334155 }));
  envelopeOutline.position.set(0, envelope.height / 2, 0);
  sublayers.shell.add(envelopeOutline);

  // Structural columns detected from the drawing (see the private geometry
  // file's column_detection block for method and thresholds).
  //
  // HEIGHT SEMANTICS -- envelope.height is FLOOR-TO-FLOOR, derived from the
  // printed floor levels of the four floor plans (+0.30 / +5.30 / +10.30 /
  // +15.30, three intervals of exactly 5.00 m). Drawing a column at that
  // full height is a VISUALIZATION CONVENTION so the column reads as
  // vertical structure; it is NOT evidence of clear column height. The
  // clear height under the slab is unknown -- the private file records it
  // as clear_height_m: null rather than estimating slab thickness.
  //
  // Plan size comes from the measured symbol (col.footprint, ~0.96 m
  // square, +/-40 mm) rather than the previous hardcoded 0.15 m cylinder,
  // which was a placeholder from before any real column was extracted.
  // MEDIUM-confidence columns are drawn dimmer than HIGH so a less certain
  // detection never reads as firmly as a clear one -- same discipline as
  // the functional-zone tiers.
  for (const col of columns) {
    if (!col || !finitePoint(col.position, false)) continue;
    const w = finite(col.footprint?.width) ? col.footprint.width : 0.3;
    const dpt = finite(col.footprint?.depth) ? col.footprint.depth : 0.3;
    const colGeom = boxGeometry(w, envelope.height, dpt);
    const color = col.confidence === 'medium' ? 0x1e293b : 0x334155;
    const colMesh = new THREE.Mesh(colGeom, standardMaterial(color));
    colMesh.position.set(col.position.x, envelope.height / 2, col.position.z);
    colMesh.userData.column = col;
    columnMeshes.push(colMesh);
    sublayers.columns.add(colMesh);
  }

  for (const zone of zones) {
    const b = zone && zone.bounds;
    if (!b || !finite(b.x) || !finite(b.z) || !finite(b.width) || !finite(b.depth)) continue;
    const zoneGeom = new THREE.BoxGeometry(b.width, 0.05, b.depth);
    const zoneEdges = new THREE.EdgesGeometry(zoneGeom);
    // Dashed-looking dim slate, distinct from the real-device zone
    // outlines' brighter 0x475569 -- these are anonymous/unmapped zones,
    // should read as visually secondary.
    const zoneOutline = new THREE.LineSegments(zoneEdges, new THREE.LineBasicMaterial({ color: 0x1e293b }));
    zoneOutline.position.set(b.x + b.width / 2, 0.02, b.z + b.depth / 2);
    layers.functional.add(zoneOutline);
  }

  // Physical machine positions digitized from the drawing. Plan width/depth
  // are measured from the drawn symbol; HEIGHT IS NOT IN EVIDENCE -- a plan
  // view carries no equipment elevation, so the private file emits none and
  // the API's existing 1 m fallback applies. That 1 m is a RENDERING
  // DEFAULT, not a measurement, which is why these are drawn as low flat
  // pads rather than machine-shaped volumes: the silhouette must not imply
  // a height nobody measured.
  //
  // MEDIUM-confidence detections render dimmer than HIGH, the same
  // discipline used for columns and functional zones.
  for (const slot of slots) {
    // A slot that cannot be placed is skipped, never placed at a stand-in
    // coordinate: an invented position is worse than a missing one.
    if (!slot || !finitePoint(slot.position, true)) continue;
    const fp = slot.footprint;
    if (!fp || !finite(fp.width) || !finite(fp.depth) || !finite(fp.height)) continue;
    const h = fp.height;
    const geom = boxGeometry(fp.width, h, fp.depth);
    // Flat, dim, unlit-looking gray -- deliberately unlike the bright,
    // state-colored real device boxes. No label, no userData.deviceId,
    // never pushed to machineMeshes: nothing about this mesh is clickable
    // or implies a live device.
    const mat = basicMaterial(0x334155, slot.confidence === 'medium' ? 0.32 : 0.5);
    const mesh = new THREE.Mesh(geom, mat);
    // Inspectable, but deliberately NOT a machine: kept out of
    // machineMeshes, carries no userData.deviceId, and gets no drill-down.
    // Only the evidence the API actually served is attached -- there is no
    // machine name, no MES id and no IMS id to attach, and none is invented.
    mesh.userData.slot = slot;
    slotMeshes.push(mesh);
    // Sit the pad ON the floor. position.y is the slot's floor reference (0),
    // and a box is centred on its origin, so without the half-height offset
    // the lower half renders below the floor plane.
    mesh.position.set(slot.position.x, slot.position.y + h / 2, slot.position.z);
    sublayers.slots.add(mesh);
  }
}

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 16, 10);
scene.add(dirLight);

// ── Zone label sprites ───────────────────────────────────────
// Design brief: "the 5 zones must be distinguishable at a glance" -- chose
// a canvas-texture text sprite per zone (no external font/label library,
// canvas 2D is a native browser API, consistent with "no CDN dependency"
// used throughout this service) hovering above each zone's machine cluster,
// in addition to the physical spacing itself (12 units between zone
// clusters vs. 6 units between the 2 machines within a zone).
function makeTextSprite(text, { fontSize = 30, scaleFactor = 0.024, bg = 'rgba(15, 23, 42, 0.78)', fg = '#e2e8f0' } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = Math.ceil(metrics.width) + 28;
  canvas.height = fontSize + 22;

  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(canvas.width * scaleFactor, canvas.height * scaleFactor, 1);
  return sprite;
}

// ── Functional/process zones (/api/floor-geometry -> functional_zones) ──
// Deliberately NOT part of buildPhysicalSlots: that function returns early
// without a building envelope, and the zone layer is independent of the
// envelope file -- zones must still render when no floor1-geometry.json
// exists (the current state of this deployment).
//
// These are process areas, not rooms and not walls. The floor is largely
// open-plan, so they are drawn as flat translucent plates with an outline
// at floor level -- never as vertical surfaces, which would read as
// enclosure the drawing does not support. Colour is keyed to evidence
// tier so a qualified boundary never looks as certain as a validated one.
// Plain three.js primitives only (Shape/ShapeGeometry/LineLoop); no
// external plugin, no DOM or Grafana behaviour relied on.
//
// The server already withholds every non-renderable zone; the guard here
// is a second, independent barrier so a client-side change alone cannot
// draw an unvalidated boundary.
const ZONE_TIER_STYLE = {
  HIGH: { fill: 0x10b981, line: 0x34d399, opacity: 0.14 },
  MEDIUM: { fill: 0xf59e0b, line: 0xfbbf24, opacity: 0.1 },
};

function buildFunctionalZones(geometry) {
  const zones = geometry?.functional_zones;
  if (!Array.isArray(zones) || zones.length === 0) return 0;

  const floorY = 0.3; // validated finished-floor level, metres
  let drawn = 0;

  for (const zone of zones) {
    const style = ZONE_TIER_STYLE[zone.confidence];
    const verts = zone.geometry?.vertices;
    // Second barrier: anything the server should already have withheld is
    // skipped rather than trusted.
    if (!style || !Array.isArray(verts) || verts.length < 3) continue;

    const shape = new THREE.Shape();
    shape.moveTo(verts[0].x, verts[0].z);
    for (let i = 1; i < verts.length; i++) shape.lineTo(verts[i].x, verts[i].z);
    shape.closePath();

    const plate = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({
        color: style.fill,
        transparent: true,
        opacity: style.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    plate.rotation.x = Math.PI / 2; // Shape is authored in XY; lay it on XZ
    plate.position.y = floorY;
    layers.functional.add(plate);

    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(verts.map((v) => new THREE.Vector3(v.x, floorY + 0.01, v.z))),
      new THREE.LineBasicMaterial({ color: style.line })
    );
    layers.functional.add(outline);
    drawn++;
  }
  return drawn;
}

// ── Machine meshes (populated once /api/placement resolves) ─────
const machineMeshes = []; // THREE.Mesh[], one per machine, userData.deviceId set
// Separate array on purpose. A slot is an observed position with no confirmed
// identity; keeping it out of machineMeshes is what guarantees it can never
// acquire a drill-down, a live state or a device id by accident.
const slotMeshes = []; // THREE.Mesh[], one per observed slot, userData.slot set
const columnMeshes = []; // THREE.Mesh[], one per detected column, userData.column set
const machinesById = new Map(); // deviceId -> { mesh, material }
const gridRefById = new Map(); // deviceId -> {row, column} from /api/placement, synthetic today
let latestStateById = new Map(); // deviceId -> state row from /api/state

function buildScene(placements) {
  const zoneGroups = new Map(); // zone name -> [{pos_x, pos_y}]
  for (const p of placements) {
    if (!zoneGroups.has(p.zone)) zoneGroups.set(p.zone, []);
    zoneGroups.get(p.zone).push(p);
  }

  for (const p of placements) {
    const geometry = new THREE.BoxGeometry(1.5, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: DEFAULT_MACHINE_COLOR });
    const mesh = new THREE.Mesh(geometry, material);
    // Design §4 grid shape: x/y from the simulated placement, mapped to the
    // Three.js floor plane (X, Z) with Y fixed as the vertical box height.
    mesh.position.set(p.pos_x, 0.5, p.pos_y);
    mesh.userData.deviceId = p.device_id;
    sublayers.machines.add(mesh);

    machineMeshes.push(mesh);
    machinesById.set(p.device_id, { mesh, material });
    if (p.grid_ref) gridRefById.set(p.device_id, p.grid_ref);

    // Per-machine ID label, small sprite just above the box, distinct from
    // the larger zone-level label -- helps identify which box is which
    // before/without opening the HUD list. Small font + tight scaleFactor
    // (re-tuned from a first pass that overlapped at 12-unit zone spacing)
    // so 2 machine labels 8 units apart stay legible and non-overlapping.
    // grid_ref (when present) appends as "(row-column)" -- still a
    // synthetic placeholder today (see lib/contracts.js), shown here so
    // the field is visibly wired end-to-end, not just present in the API.
    const idLabelText = p.grid_ref ? `${p.device_id} (${p.grid_ref.row}-${p.grid_ref.column})` : p.device_id;
    const idLabel = makeTextSprite(idLabelText, { fontSize: 20, scaleFactor: 0.016 });
    idLabel.position.set(p.pos_x, 1.5, p.pos_y);
    layers.telemetry.add(idLabel);
  }

  // Zone labels float well above the machine-ID labels (y=5.5 vs y=1.5) so
  // the two label layers never visually collide, and are wide enough at
  // 18-unit zone spacing (re-tuned from the first pass's 12) to render
  // without touching their neighbors.
  //
  // Zone boundary outlines: a wireframe box per zone, sized from that
  // zone's OWN member bounding box (computed from the already-synthetic
  // simulated_grid coordinates above) plus a fixed padding constant --
  // never from any real drawing. This is "zone structure" made visible,
  // the 3D equivalent of the 2D twin's canvas zone-container rectangles,
  // built from data this service already owns rather than a new input.
  // Extent of the synthetic device grid, recorded so the overview fit can
  // frame it alongside the measured building. Read only; no machine position
  // is written, rounded or adjusted here.
  if (placements.length > 0) {
    const xs = placements.map((p) => p.pos_x);
    const zs = placements.map((p) => p.pos_y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    machineBounds = {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      width: Math.max(maxX - minX, 1),
      depth: Math.max(maxZ - minZ, 1),
      height: 2,
    };
    refitViews();
  }

  const ZONE_PADDING = 3;
  for (const [zoneName, members] of zoneGroups) {
    const avgX = members.reduce((sum, m) => sum + m.pos_x, 0) / members.length;
    const avgY = members.reduce((sum, m) => sum + m.pos_y, 0) / members.length;
    const minX = Math.min(...members.map((m) => m.pos_x)) - ZONE_PADDING;
    const maxX = Math.max(...members.map((m) => m.pos_x)) + ZONE_PADDING;
    const minY = Math.min(...members.map((m) => m.pos_y)) - ZONE_PADDING;
    const maxY = Math.max(...members.map((m) => m.pos_y)) + ZONE_PADDING;

    const boxGeom = new THREE.BoxGeometry(maxX - minX, 2, maxY - minY);
    const edges = new THREE.EdgesGeometry(boxGeom);
    const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x475569 }));
    outline.position.set(avgX, 0.01, avgY);
    sublayers.machines.add(outline);

    const label = makeTextSprite(zoneName, { fontSize: 26, scaleFactor: 0.02, bg: 'rgba(15, 23, 42, 0.85)' });
    label.position.set(avgX, 5.5, avgY);
    sublayers.machines.add(label);
  }
}

// ── Click-to-drill-down (raycasting against ALL 10 meshes, real browser
// click-picking -- design §8: functionally testable, unlike Grafana Canvas
// links[]) ──
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function drillDownUrl(deviceId) {
  const state = latestStateById.get(deviceId);
  const factory = (state && state.factory) || '2';
  let url = `/d/ims-ldi-machine-snapshot/set2-machine-snapshot?var-machine_id=${encodeURIComponent(deviceId)}&var-factory=${encodeURIComponent(factory)}&from=now-6h&to=now`;
  // If this machine currently has an active alarm (the red state), scope
  // the drill-down to that exact event -- without var-log_id/var-event_time_ms,
  // Machine Snapshot falls back to its own default (most recent telemetry
  // row), which can be minutes newer than the alarm and show unrelated
  // "everything looks fine" values instead of the alarm moment.
  if (state && state.alarm && state.alarm.related_log_id) {
    url += `&var-log_id=${encodeURIComponent(state.alarm.related_log_id)}`;
    if (state.alarm.logdate_ms) {
      // var-clicked_series MUST be sent alongside var-event_time_ms: every
      // panel keyed on "was a specific point clicked" branches on
      // event_time_ms > 0 to decide whether to read the machine from
      // clicked_series (split_part(x, ' - ', 1) -- ims-ldi-engineering-
      // analytics.json's own data links set this to the plain machine ID,
      // e.g. "LDI-03", confirmed live: split_part('LDI-03', ' - ', 1) =
      // 'LDI-03' unchanged) or from machine_id. Sending event_time_ms alone
      // (as this function did before) leaves clicked_series at its default
      // '__none__', so that branch matches zero machines -- confirmed live:
      // Process Capability / Alarm Context / Event Timeline all silently
      // returned 0 rows (NO_DATA) until this was added.
      url += `&var-event_time_ms=${encodeURIComponent(state.alarm.logdate_ms)}`;
      url += `&var-clicked_series=${encodeURIComponent(deviceId)}`;
    }
  }
  return url;
}

// Points the shared raycaster at a pointer event. Reading the canvas rect
// forces a layout, so a pass that needs several picks aims once and then
// intersects several times rather than re-aiming per pass -- the ray is
// identical either way, so every pick result is unchanged.
function aimRay(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

// intersectObjects (plural) against the whole array -- the hit list is
// sorted nearest-first by Three.js, so hits[0] is the object actually under
// the cursor rather than merely one of the objects along the ray.
function pickFrom(meshes, key) {
  if (meshes.length === 0) return null;
  const hits = raycaster.intersectObjects(meshes, false);
  return hits.length > 0 ? hits[0].object.userData[key] : null;
}

function pickMachine(event) {
  aimRay(event);
  return pickFrom(machineMeshes, 'deviceId');
}

// Slots are picked through the SAME raycaster, in a second pass that only
// runs when no machine was hit. Machines therefore keep absolute priority
// and their existing click behaviour is bit-for-bit unchanged.
function pickSlot(event) {
  aimRay(event);
  return pickFrom(slotMeshes, 'slot');
}

const inspectorEl = document.getElementById('inspector');

// Developer/operator diagnostics. Rendering never depends on this: it is
// fetched lazily the first time the panel is opened, so a normal operator
// session never pays for it and a failure here cannot affect the scene.
let diagnosticsLoaded = false;
async function loadDiagnostics() {
  const body = document.getElementById('diagnostics-body');
  if (!body || diagnosticsLoaded) return;
  diagnosticsLoaded = true;
  const T0 = performance.now();
  let api = null;
  try {
    const res = await fetch('api/diagnostics');
    if (res.ok) api = await res.json();
  } catch {
    /* diagnostics are best-effort; the scene is unaffected */
  }
  const apiMs = Math.round(performance.now() - T0);

  const info = renderer.info;
  let meshes = 0;
  const perLayer = {};
  for (const [name, g] of Object.entries(layers)) {
    let n = 0;
    g.traverse((o) => {
      if (o.type === 'Mesh') n++;
    });
    perLayer[name] = n;
    meshes += n;
  }
  const res = resourceStats();

  const section = (title, rows) =>
    `<div class="diag-section"><div class="diag-title">${esc(title)}</div>` +
    rows.map(([k, v]) => `<div><span class="k">${esc(k)}</span> <span class="v">${esc(v)}</span></div>`).join('') +
    '</div>';

  const render = [
    ['Mesh count', meshes],
    ['Draw calls', info.render.calls],
    ['Triangles', info.render.triangles],
    ['Geometries (GPU)', info.memory.geometries],
    ['Textures', info.memory.textures],
    ['Cached geometries', res.geometries],
    ['Cached materials', res.materials],
    ['Machine meshes', machineMeshes.length],
    ['Column meshes', columnMeshes.length],
    ['Slot meshes', slotMeshes.length],
    ['Visible layers', Object.values(layers).filter((g) => g.visible).length],
    ['Viewport', `${window.innerWidth}×${window.innerHeight}`],
    ['Active view', activeView],
    ['Boot', `${Math.round(window.__twinBootMs || 0)} ms`],
    ['Diagnostics API', `${apiMs} ms`],
  ];

  let html = section('Rendering', render);
  if (api) {
    html =
      section('Data', [
        ['Geometry loaded', api.data.geometry_loaded],
        ['Schema version', api.data.geometry_schema_version ?? 'none'],
        ['Envelope', api.data.envelope_present ? 'present' : 'absent'],
        ['Footprint vertices', api.data.footprint_vertices],
        ['Grid', `${api.data.grid_x_lines} × ${api.data.grid_z_lines}`],
        ['Columns', api.data.column_count],
        ['Slots', api.data.slot_count],
        ['Zones rendered / withheld', `${api.data.zone_count_rendered} / ${api.data.zone_count_withheld}`],
      ]) +
      // Categories stay separate: summing them would assert that an observed
      // position and a monitored device are the same kind of claim.
      section('Evidence', [
        ['Measured envelope', api.evidence.measured_envelope],
        ['Derived floor-to-floor', api.evidence.derived_floor_to_floor],
        ['Observed columns', api.evidence.observed_columns],
        ['Observed slots', api.evidence.observed_slots],
        ['Simulated machine positions', api.evidence.simulated_machine_positions],
        ['Unknown clear height', api.evidence.unknown_clear_height],
        ['Unknown equipment height', api.evidence.unknown_equipment_height],
        ['Confirmed mappings', api.evidence.confirmed_mappings],
        ['Unresolved mappings', api.evidence.unresolved_mappings],
      ]) +
      html;
  } else {
    html = '<div class="diag-section"><div class="k">Diagnostics API unavailable</div></div>' + html;
  }
  body.innerHTML = html;
}

document.getElementById('diagnostics')?.addEventListener('toggle', (ev) => {
  if (ev.target.open) loadDiagnostics();
});

// Four counts describing four different things. They are shown separately and
// never summed: 242 observed positions are not 242 confirmed machines, and a
// single "equipment" figure would say exactly that. Confirmed mappings is
// listed even though it is zero -- especially because it is zero.
function updateEvidenceSummary(geo, zonesDrawn) {
  // Counts are read defensively for the same reason the renderer is: a
  // malformed response must produce an honest zero, not an exception that
  // leaves the evidence panel showing the previous, now-wrong figures.
  const columnList = Array.isArray(geo && geo.columns) ? geo.columns : [];
  const slotList = Array.isArray(geo && geo.slots) ? geo.slots : [];
  const columns = columnList.length;
  const slots = slotList.length;
  const confirmed = slotList.filter((s) => s && s.ims_device_id).length;
  const meta = geo && typeof geo.functional_zones_meta === 'object' ? geo.functional_zones_meta : null;
  const withheld = meta && Number.isFinite(meta.withheld) ? meta.withheld : 0;

  const setCount = (layer, text) => {
    const el = document.querySelector(`#layer-controls [data-count="${layer}"]`);
    if (el) el.textContent = text;
  };
  // Each count names its evidence class, because the number alone is
  // ambiguous: 242 and 23 are both "equipment" but not the same claim.
  setCount('shell', '(measured envelope, floor plate, grid)');
  setCount('columns', `(${columns} OBSERVED)`);
  setCount('functional', `(${zonesDrawn} validated, ${withheld} withheld)`);
  setCount('machines', `(${machineMeshes.length} SIMULATED positions)`);
  setCount('slots', `(${slots} OBSERVED, ${confirmed} CONFIRMED)`);

  const el = document.getElementById('evidence-summary');
  if (!el) return;
  const rows = [
    ['Structural columns', columns, 'OBSERVED'],
    ['Observed equipment slots', slots, 'OBSERVED'],
    ['Monitored devices', machineMeshes.length, 'SIMULATED position'],
    ['Confirmed physical mappings', confirmed, confirmed === 0 ? 'NONE — no authoritative record' : 'CONFIRMED'],
    ['Zones withheld as unvalidated', withheld, 'WITHHELD'],
  ];
  el.innerHTML =
    '<div class="summary-title">Evidence</div>' +
    rows
      .map(
        ([k, n, tag]) =>
          `<div><span class="k">${esc(k)}</span> <span class="n">${esc(n)}</span> <span class="t">${esc(tag)}</span></div>`
      )
      .join('');
}

function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Every inspector renders ONLY fields that were actually served. Anything
// unknown is shown as unknown rather than omitted -- a blank row would read
// as "not applicable", which is a different and untrue claim.
//
// The badge is the load-bearing part. Only CONFIRMED may imply an
// authoritative physical correspondence, and nothing in this system can
// currently produce one.
function render(badge, badgeClass, title, rows, note) {
  if (!inspectorEl) return;
  inspectorEl.innerHTML =
    `<div class="inspector-title"><span class="badge ${badgeClass}">${esc(badge)}</span> ${esc(title)}</div>` +
    rows.map(([k, v]) => `<div><span class="k">${esc(k)}</span> <span class="v">${esc(v)}</span></div>`).join('') +
    (note ? `<div class="hint">${note}</div>` : '');
  inspectorEl.hidden = false;
}

function showSlotInspector(slot) {
  const mapped = slot.status === 'IMS_CONNECTED' && slot.ims_device_id;
  render(
    mapped ? 'CONFIRMED' : 'UNMAPPED',
    mapped ? 'badge-confirmed' : 'badge-unmapped',
    'Observed equipment slot',
    [
      ['Slot', slot.slot_id],
      ['Identity', mapped ? `mapped to ${slot.ims_device_id}` : 'no confirmed machine'],
      ['Mapping status', slot.status],
      ['Confidence', slot.confidence ?? 'unknown'],
      ['Source', slot.source ?? 'unknown'],
      ['Geometry status', slot.geometry_status ?? 'unknown'],
      ['Position x / z', `${slot.position.x} / ${slot.position.z} m`],
      ['Measured width', slot.footprint ? `${slot.footprint.width} m` : 'unknown'],
      ['Measured depth', slot.footprint ? `${slot.footprint.depth} m` : 'unknown'],
      ['Height', slot.height_status === 'unknown' ? 'unknown — not in evidence' : (slot.height_status ?? 'unknown')],
      ['Zone', slot.zone_id ?? 'none — outside every validated zone'],
      ['Detected on layer', slot.detection ? slot.detection.layer : 'unknown'],
    ],
    mapped
      ? null
      : 'Position observed on the engineering drawing. No machine identity is claimed: no authoritative ' +
        'record relates observed positions to monitored devices, so this slot carries no device id, no ' +
        'MES id and no live state.'
  );
}

function showColumnInspector(col) {
  render('OBSERVED', 'badge-observed', 'Structural column', [
    ['Column', col.id],
    ['Position x / z', `${col.position.x} / ${col.position.z} m`],
    ['Measured footprint', col.footprint ? `${col.footprint.width} × ${col.footprint.depth} m` : 'unknown'],
    ['Grid reference', col.grid_ref ? `${col.grid_ref.x}${col.grid_ref.z}` : 'none'],
    ['Offset from intersection', col.offset_from_intersection_mm != null ? `${col.offset_from_intersection_mm} mm` : 'unknown'],
    ['Confidence', col.confidence ?? 'unknown'],
    ['Source', col.source ?? 'unknown'],
    ['Geometry status', col.geometry_status ?? 'unknown'],
    ['Detector ring / interior', col.detector ? `${col.detector.ring_density} / ${col.detector.interior_density}` : 'unknown'],
  ],
  'Detected from the engineering drawing at its own measured position — not snapped to the grid intersection. ' +
  'Rendered height is the floor-to-floor envelope, a visualization convention; clear height is not in evidence.');
}

function showMachineInspector(deviceId) {
  const st = latestStateById.get(deviceId);
  render('SIMULATED', 'badge-simulated', 'Monitored device', [
    ['Device', deviceId],
    ['Live state', st ? `${st.state_label} (${st.machine_state})` : 'awaiting first poll'],
    ['Boards', st ? `${st.board_no} / ${st.total_board}` : 'unknown'],
    ['MO', st && st.mo ? st.mo : '—'],
    ['Alarm', st && st.alarm ? `${st.alarm.count} · ${st.alarm.owner} · ${st.alarm.elapsed}` : 'none'],
    ['Position', 'simulated grid — not a surveyed location'],
    ['Physical mapping', 'NOT CONFIRMED'],
  ],
  'Telemetry is real. The position is not: this device sits on a synthetic grid because no authoritative ' +
  'record places it in the building. Click to open its Machine Snapshot drill-down.');
}

// Every rendered evidence position, as one stable string. A view switch is
// allowed to move the camera and nothing else, so this must compare identical
// before and after -- an assertion a regression test can make directly rather
// than inferring from a screenshot. Fixed precision so the comparison is
// byte-level rather than float-tolerant.
function snapshotCoordinates() {
  const out = [];
  for (const group of [machineMeshes, slotMeshes, columnMeshes]) {
    for (const m of group) {
      out.push(`${m.position.x.toFixed(6)},${m.position.y.toFixed(6)},${m.position.z.toFixed(6)}`);
    }
  }
  return out.join('|');
}

function hideSlotInspector() {
  if (inspectorEl) inspectorEl.hidden = true;
  // Clear the hover cache too: the panel is now hidden, so the next hover over
  // the same object must re-render rather than assume it is still displayed.
  lastInspected = null;
}

renderer.domElement.addEventListener('click', (event) => {
  const deviceId = pickMachine(event);
  if (deviceId) {
    window.location.href = drillDownUrl(deviceId);
    return;
  }
  const slot = pickSlot(event);
  if (slot) showSlotInspector(slot);
  else hideSlotInspector();
});

function pickColumn(event) {
  aimRay(event);
  return pickFrom(columnMeshes, 'column');
}

// Hover drives the inspector; click still only navigates, and only for
// machines. Inspecting a machine therefore costs nothing and cannot be
// confused with drilling into it.
//
// Throttled to one raycast per animation frame: pointermove fires far faster
// than the scene redraws, and three picks across ~420 meshes per event is
// wasted work that buys no extra responsiveness.
let hoverPending = null;
// Writing style.cursor is a style mutation whether or not the value changed,
// and a hover pass runs every animation frame the pointer moves. Tracking the
// current value keeps the assignment to the frames where it actually differs.
let currentCursor = 'default';
function setCursor(value) {
  if (currentCursor === value) return;
  currentCursor = value;
  renderer.domElement.style.cursor = value;
}

// Rebuilding the inspector means building a string and reparsing it into the
// DOM. Hovering a single object holds that target for many frames, and the
// panel's content is a pure function of the target plus, for a machine, the
// most recent poll. Re-rendering identical markup every frame is work with no
// observable effect, so the last rendered target is remembered and an
// unchanged one is skipped. A poll invalidates it, so live state still lands.
let lastInspected = null;

function handleHover(event) {
  // One ray, three passes. Priority order is unchanged, and so is every
  // result: the three passes previously recomputed the identical ray.
  aimRay(event);

  const deviceId = pickFrom(machineMeshes, 'deviceId');
  if (deviceId) {
    setCursor('pointer');
    if (lastInspected !== deviceId) {
      lastInspected = deviceId;
      showMachineInspector(deviceId);
    }
    return;
  }
  const slot = pickFrom(slotMeshes, 'slot');
  if (slot) {
    // 'help' rather than 'pointer': these open an evidence panel, they do not
    // navigate. The cursor must not promise a drill-down that does not exist.
    setCursor('help');
    if (lastInspected !== slot) {
      lastInspected = slot;
      showSlotInspector(slot);
    }
    return;
  }
  const col = pickFrom(columnMeshes, 'column');
  if (col) {
    setCursor('help');
    if (lastInspected !== col) {
      lastInspected = col;
      showColumnInspector(col);
    }
    return;
  }
  setCursor('default');
  lastInspected = null;
}

renderer.domElement.addEventListener('pointermove', (event) => {
  if (hoverPending) return;
  const { clientX, clientY } = event;
  hoverPending = requestAnimationFrame(() => {
    hoverPending = null;
    handleHover({ clientX, clientY });
  });
});

// ── HUD (also the accessibility fallback per design §16 -- same real data
// as plain DOM text/list, not locked inside the WebGL canvas) ──
const machineListEl = document.getElementById('machine-list');
const statusLine = document.getElementById('status-line');
const summaryLine = document.getElementById('summary-line');

function stateRowHtml(row) {
  const color = row.state_color || `#${DEFAULT_MACHINE_COLOR.toString(16).padStart(6, '0')}`;
  const label = row.state_label || 'Undefine';
  const alarmText = row.alarm ? `${row.alarm.count} ${row.alarm.count === 1 ? 'ALARM' : 'ALARMS'} · ${row.alarm.owner} · ${row.alarm.elapsed}` : '—';
  const gridRef = gridRefById.get(row.device_id);
  const gridRefText = gridRef ? `${gridRef.row}-${gridRef.column}` : '—';
  return `
    <div class="machine-row">
      <div class="machine-row-top">
        <span class="mini-pill" style="background:${color}">${label}</span>
        <span class="machine-id">${row.device_id}</span>
      </div>
      <div class="machine-row-detail">
        <span>${row.board_no ?? '—'} / ${row.total_board ?? '—'} bd</span>
        <span>${row.mo || '—'}</span>
      </div>
      <div class="machine-row-detail">
        <span>Grid: ${gridRefText}</span>
      </div>
      <div class="machine-row-alarm">${alarmText}</div>
    </div>`;
}

function applyState(payload) {
  const rows = payload.machines || [];
  latestStateById = new Map(rows.map((r) => [r.device_id, r]));
  // New telemetry invalidates a machine inspector that is currently open.
  lastInspected = null;

  for (const row of rows) {
    const entry = machinesById.get(row.device_id);
    if (!entry) continue; // shouldn't happen -- placement and state device sets should match exactly
    entry.material.color.set(row.state_color || DEFAULT_MACHINE_COLOR);
  }

  machineListEl.innerHTML = rows.map(stateRowHtml).join('');

  const alarmCount = rows.filter((r) => r.machine_state === 'DOWN').length;
  summaryLine.textContent = `${rows.length} machines · ${alarmCount} in ALARM`;

  statusLine.textContent = `Last updated ${new Date(payload.queried_at).toLocaleTimeString()}`;
  statusLine.classList.remove('error');
}

async function pollState() {
  try {
    const res = await fetch('api/state');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    applyState(data);
  } catch (err) {
    statusLine.textContent = `State fetch failed: ${err.message}`;
    statusLine.classList.add('error');
  }
}

// ── Boot: placement is fetched once (rare-changing per design §5), state
// is polled every 5s (frequently-changing) -- two independent queries,
// joined client-side by device_id, exactly the separation design §5
// requires so a future real-coordinate swap only ever touches the
// placement fetch below. ──
async function boot() {
  const t0 = performance.now();
  try {
    const res = await fetch('api/placement');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    buildFloorShells(data.floors || [], data.machines || []);
    buildScene(data.machines || []);
  } catch (err) {
    statusLine.textContent = `Placement fetch failed: ${err.message}`;
    statusLine.classList.add('error');
  }

  // Independent of the placement fetch above -- absence here (empty
  // shape, the default for a public clone) must never block real-device
  // rendering, and a real-device fetch failure must never block this.
  try {
    const geoRes = await fetch('api/floor-geometry');
    if (geoRes.ok) {
      const geo = await geoRes.json();
      buildPhysicalSlots(geo);
      // Separate call: the zone layer is independent of the envelope, and
      // buildPhysicalSlots returns early when no envelope file exists.
      const drawn = buildFunctionalZones(geo);
      updateEvidenceSummary(geo, drawn);
      const meta = geo.functional_zones_meta;
      if (meta && meta.total > 0) {
        console.info(
          `functional zones: ${drawn} rendered of ${meta.total} (${meta.withheld} withheld as unvalidated/conflicting)`
        );
      }
    }
  } catch (err) {
    console.warn('floor-geometry fetch failed (non-fatal):', err.message);
  }

  await pollState();
  setInterval(pollState, POLL_MS);
  const t1 = performance.now();
  // Exposed for Playwright/perf instrumentation to read back -- not
  // rendered in the UI itself, no effect on normal operator use. Lets a
  // verification script (a) read boot timing and (b) drive the camera
  // programmatically to center a specific machine before a real
  // browser_click, since the canvas has no per-object DOM node a click
  // target selector could otherwise address.
  window.__twinBootMs = t1 - t0;
  window.__twin = {
    camera,
    controls,
    scene,
    renderer,
    machineMeshes,
    slotMeshes,
    columnMeshes,
    layers,
    applyView,
    getView: () => activeView,
    getBuildingView: () => buildingView,
    // Cache sizes are exposed so a regression test can assert the sharing
    // actually happened rather than trusting that it did.
    resourceStats,
    setLayerVisible,
    sublayers,
    resetView,
    snapshotCoordinates,
  };
}

boot();

// ── Render loop ──────────────────────────────────────────────
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Every derived fit depends on aspect, so a resize invalidates all of them.
  // Without this, framing after a window change silently uses the old aspect
  // and can clip the structure the view exists to show.
  refitViews();
}

// setSize reallocates the drawing buffer, and a drag-resize fires this
// continuously. Coalescing to one call per frame keeps the final state
// identical while doing the work once instead of dozens of times.
let resizePending = null;
window.addEventListener('resize', () => {
  if (resizePending) return;
  resizePending = requestAnimationFrame(() => {
    resizePending = null;
    onResize();
  });
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
