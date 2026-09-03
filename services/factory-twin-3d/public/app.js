// IMS Factory 3D Digital Twin -- Task 4.2 (all 10 real reporting LDI
// machines, grouped by their 5 real zones)
//
// Extends Task 4.1's 1-machine POC: 10 box meshes instead of 1, positioned
// from /api/floor-geometry (CAD-derived; no simulated machine positions),
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
import {
  FORM_CLASSIFICATION, FORMS, FORM_KEYS, PART_ROLES,
  formKeyFor, partsFor, groupByForm,
} from './machine-forms.js';
import {
  OPERATIONAL_STATUS, STATUS_ORDER, BACKED_STATUSES,
} from './operational-status.js';

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
// Capped. This view is fill-rate bound, not triangle bound: across 1366x768 to
// 3840x2160 the frame time tracks PIXEL COUNT almost exactly while the triangle
// count is unchanged. An uncapped ratio therefore multiplies the most expensive
// axis by itself -- a 3x display would render nine times the pixels of the
// measurement above. Two is the point past which more samples stop being
// visible on this content.
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
// Soft shadows. Affordable specifically because frames are drawn on demand: an
// idle view pays nothing for them, and a moving one pays once per real frame.
renderer.shadowMap.enabled = true;
// PCF, not PCFSoft. The soft variant samples the depth map several extra
// times PER LIT PIXEL, which is charged on every frame whether or not the map
// itself was regenerated -- measured at 105 ms against 37 ms per frame at
// 1080p on this software rasteriser. PCF keeps the shadow readable at a
// fraction of that; the difference is a slightly harder edge on a shadow that
// is a lighting convention in the first place.
renderer.shadowMap.type = THREE.PCFShadowMap;
// The shadow map is re-rendered ON DEMAND, not every frame.
//
// The light is directional and the geometry is static, so orbiting the camera
// cannot change a single shadow -- yet re-rendering the depth map every frame
// cost 3.4x the frame time at 1080p and pushed 4K past 650 ms. Nothing about
// the picture changes by leaving it; only the redundant work goes.
//
// It must then be refreshed explicitly whenever the SCENE changes: geometry
// arriving, a layer's visibility changing, the light being re-aimed. Those are
// exactly the moments requestShadowUpdate() is called from.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
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

// ── Render on demand ──────────────────────────────────────────────────
//
// This scene is static between interactions: the geometry never animates, and
// a telemetry poll every 5 s changes a handful of colours. Redrawing it 60
// times a second regardless was spending the whole frame budget to produce an
// identical image, and at 4K that image costs over 200 ms to produce.
//
// So a frame is drawn when something has actually changed. OrbitControls emits
// 'change' on every damped step, so a moving camera still redraws every frame
// and the interaction is not degraded; when it settles, the loop goes quiet.
//
// TAIL FRAMES exist because "changed" is not always observable in the same
// tick: a texture finishing decode, a label sprite laying out, a material
// upload completing. Rather than hunt for every such case, any request draws a
// short run of frames. It costs a few frames after a change and removes a
// whole class of "the first frame after X is stale" bug.
//
// Declared here, above every caller, because boot() runs before the render
// loop is reached and would otherwise touch these in the temporal dead zone.
const RENDER_TAIL_FRAMES = 4;
let renderTail = RENDER_TAIL_FRAMES;
let framesRendered = 0;

/** Requests a redraw. Safe to call from anywhere, any number of times. */
function requestRender() {
  renderTail = RENDER_TAIL_FRAMES;
}

/**
 * Requests a redraw AND a shadow-map refresh.
 *
 * Use this when what is IN the scene changed -- geometry added, a layer hidden,
 * the light moved. Camera motion does not need it: a directional light's
 * shadows do not depend on where the viewer stands.
 */
function requestShadowUpdate() {
  renderer.shadowMap.needsUpdate = true;
  requestRender();
}

controls.addEventListener('change', requestRender);
window.addEventListener('resize', requestRender);
window.addEventListener('twin-pane-resize', requestRender);
window.addEventListener('twin-mode', requestRender);
document.addEventListener('visibilitychange', requestRender);

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
  // Interior walls and partitions read straight out of the CAD. Their plan
  // position and their thickness are MEASURED_CAD -- the thickness is the gap
  // between the two drawn faces. Their HEIGHT is not in the drawing at all, so
  // it is a declared presentation constant, the same convention already used
  // for columns, and the inspector says so per wall.
  walls: new THREE.Group(),
  slots: new THREE.Group(), // observed equipment slots, no confirmed identity
  // A third evidence layer, kept apart from the other two on purpose. Its
  // FOOTPRINTS are measured; its HEIGHTS and everything vertical are a drawing
  // convention with no source. Its own group so it can be switched off, and so
  // nothing here can be mistaken for the observed slots underneath it.
  presentation: new THREE.Group(),
};
// Off by default. The measured floor is what this view claims by default; the
// presentation model is something the operator opts into.

for (const [name, g] of Object.entries(sublayers)) g.name = name;
sublayers.presentation.visible = false;
layers.structural.add(sublayers.shell, sublayers.columns, sublayers.walls);
layers.operational.add(sublayers.slots, sublayers.presentation);

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
let overviewView = null; // derived from the measured envelope once it arrives
// Straight-down plan framing: the CAD-derived 2D floor plan. Same scene, same
// geometry, same coordinates -- only the camera differs, so the plan and the
// model can never disagree about where a wall is.
let planView = null;
// Factory overview is the default framing, not the tight operator camera. The
// first question this view answers is "what is the state of the floor", which
// needs the whole floor on screen; the operator framing is one click away and
// unchanged. The camera is the ONLY thing this decides -- no layer, no evidence
// state and no coordinate depends on which view is active.
//
// It falls back to the operator camera on its own: `overview` is derived from
// the measured envelope, so before that geometry loads (or on a deployment that
// has none) applyView('overview') returns false and the fixed operator camera
// is what the user gets.
let activeView = 'overview';

// Bounds each derived view was fitted from. Kept so a resize (or the arrival
// of the second data source) can refit rather than leave framing computed for
// a stale aspect ratio. Declared here, above every reader, because the fits
// are recomputed from them in three different places.
let buildingBounds = null; // measured envelope

// Derives a camera placement that fits a bounding box, rather than hardcoding
// coordinates: the building's extent is known from the data, so the framing
// should follow it and stay correct if the evidence ever changes.
// The HUD is an opaque overlay pinned to the left, so the part of the canvas a
// viewer can actually see is narrower than the canvas. Fitting to the full
// width puts the model half behind the panel. Measured from the element rather
// than assumed, because the panel's width is set in CSS and has changed twice.
function usableViewport() {
  // Measured against the SCENE PANE, not the window. In side-by-side the pane
  // is half the window wide and starts to the right of the panel, so a
  // window-based measurement reserves a panel that is not over this pane and
  // frames the floor off its own half.
  const rect = container.getBoundingClientRect();
  const w = Math.max(rect.width, 1);
  const h = Math.max(rect.height, 1);
  const hud = document.getElementById('hud');
  const banner = document.getElementById('simulated-banner');
  const hudRect = hud && !hud.hidden ? hud.getBoundingClientRect() : null;
  const bannerRect = banner && !banner.hidden ? banner.getBoundingClientRect() : null;
  // Only the part of each overlay that actually covers this pane.
  const left = hudRect ? Math.max(0, Math.min(hudRect.right, rect.right) - rect.left) : 0;
  const top = bannerRect ? Math.max(0, Math.min(bannerRect.bottom, rect.bottom) - rect.top) : 0;
  // Never let a large panel on a small pane collapse the usable area to
  // nothing: below this the overlay is the problem, not the framing.
  const usableW = Math.max(w - left, w * 0.35);
  const usableH = Math.max(h - top, h * 0.5);
  return { w, h, left, top, usableW, usableH };
}

// Derives a camera placement that fits a bounding box, rather than hardcoding
// coordinates: the building's extent is known from the data, so the framing
// should follow it and stay correct if the evidence ever changes.
//
// The fit is measured, not computed from a formula. An oblique camera sees a
// box's silhouette, not its axis-aligned extent, so the trigonometric fit that
// used to live here under-estimated the required distance and clipped the
// corners of the floor -- worst at the shallow angles that make the floor
// readable. This projects the eight corners through a trial camera and scales
// until they land inside the usable rectangle, which is exact for any angle,
// any aspect and any overlay width.
function frameBounds({ cx, cz, width, depth, height = 0 }) {
  const view = usableViewport();
  // The model stays centred on the canvas -- moving it sideways would mean a
  // projection offset, and that changes what every raycast and every existing
  // framing assertion sees. Instead the fit box is narrowed symmetrically by
  // the overlay width on BOTH sides, so a canvas-centred model clears the
  // panel on the left and has the same margin on the right. It costs some
  // screen area and buys a floor that is never half-hidden.
  const centreNdcX = 0;
  const centreNdcY = 0;
  const clearW = Math.max(view.w - 2 * view.left, view.w * 0.30);
  const clearH = Math.max(view.h - 2 * view.top, view.h * 0.50);
  const halfNdcX = (clearW / view.w) * 0.94;
  const halfNdcY = (clearH / view.h) * 0.94;

  const dir = new THREE.Vector3(0.35, 0.78, 0.85).normalize();
  const target = new THREE.Vector3(cx, height / 2, cz);
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sy of [0, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(new THREE.Vector3(
          cx + (sx * width) / 2,
          sy * Math.max(height, 1),
          cz + (sz * depth) / 2
        ));
      }
    }
  }

  const probe = camera.clone();
  probe.aspect = camera.aspect;
  // Start from the old closed-form estimate and correct it by measurement.
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  let dist = Math.max(width / 2 / (tanV * Math.max(camera.aspect, 0.0001)), depth / 2 / tanV);
  const v = new THREE.Vector3();
  // Six passes is far more than convergence needs; it is cheap and runs only
  // when the data or the aspect changes, never per frame.
  for (let pass = 0; pass < 6; pass++) {
    probe.position.copy(dir).multiplyScalar(dist).add(target);
    probe.lookAt(target);
    probe.updateMatrixWorld(true);
    probe.updateProjectionMatrix();
    let worstX = 0;
    let worstY = 0;
    for (const c of corners) {
      v.copy(c).project(probe);
      worstX = Math.max(worstX, Math.abs(v.x - centreNdcX));
      worstY = Math.max(worstY, Math.abs(v.y - centreNdcY));
    }
    const over = Math.max(worstX / halfNdcX, worstY / halfNdcY);
    if (over <= 1 && over > 0.92) break;
    dist *= Math.max(over, 0.35);
  }

  const pos = dir.clone().multiplyScalar(dist).add(target);
  return {
    position: { x: pos.x, y: pos.y, z: pos.z },
    target: { x: target.x, y: target.y, z: target.z },
    // Recorded so a test can assert the framing was fitted rather than guessed.
    fittedDistance: dist,
  };
}

// OVERVIEW frames the measured building. It once had to union that with the
// extent of a synthetic device grid drawn beside it; that grid is deleted, so
// there is only one coordinate system left to frame and the union is gone with
// it. "Show me everything" now has a single honest answer: the CAD floor.
// Recomputes every derived view from the bounds currently known. Called when
// either data source arrives and on resize, because the fit depends on aspect.
// OPERATOR_VIEW is never recomputed: it is the hand-tuned monitoring default
// and must stay byte-for-byte what it was.
function refitViews() {
  if (buildingBounds) buildingView = frameBounds(buildingBounds);
  // The overview once had to frame the building AND a synthetic device grid
  // sitting outside it. That grid is gone, so the building IS the extent.
  const combined = buildingBounds;
  overviewView = combined ? frameBounds(combined) : null;
  if (buildingBounds) {
    // Directly overhead, looking straight down. A tight vertical FOV keeps the
    // projection close to orthographic, so the result reads as a drawing rather
    // than as a photograph of a model.
    const fit = frameBounds(buildingBounds);
    const h = Math.hypot(fit.position.x - buildingBounds.cx,
      fit.position.y, fit.position.z - buildingBounds.cz);
    planView = {
      position: { x: buildingBounds.cx, y: h * 1.25, z: buildingBounds.cz + 0.001 },
      target: { x: buildingBounds.cx, y: 0, z: buildingBounds.cz },
    };
  }
  const far = overviewView || buildingView;
  if (far) ensureDepthRange(Math.hypot(far.position.x, far.position.y, far.position.z));
  // A view that has no data behind it must not offer itself as a choice.
  for (const btn of document.querySelectorAll('#view-controls button[data-view]')) {
    const v = btn.dataset.view;
    btn.disabled = (v === 'building' && !buildingView) || (v === 'overview' && !overviewView)
      || (v === 'plan' && !planView);
    // A control that is disabled without a reason reads as broken. Say why:
    // the framing is derived from data that has not arrived, not withheld.
    btn.title = btn.disabled
      ? 'Unavailable until the measured building geometry loads'
      : '';
  }
  // Apply the active framing once its geometry exists. The operator camera is
  // a fixed constant and needs no refit; the derived ones do.
  if (activeView !== 'operator') applyView(activeView);
}

const VIEWS = () => ({ operator: OPERATOR_VIEW, building: buildingView, overview: overviewView, plan: planView });

function applyView(name) {
  const v = VIEWS()[name];
  if (!v) return false;
  requestRender();
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
  // Visibility changes what casts, so the shadow map is stale too.
  requestShadowUpdate();
  return true;
}

document.getElementById('layer-controls')?.addEventListener('change', (ev) => {
  const box = ev.target;
  if (!(box instanceof HTMLInputElement) || !box.dataset.layer) return;
  setLayerVisible(box.dataset.layer, box.checked);
});

// Orientation grid. Purely a reference frame, NOT factory floor data -- it is
// sized to cover the synthetic device spread and says nothing about the
// building. It is removed the moment the surveyed structural grid arrives, so
// the two are never on screen together: one is decoration, the other is
// evidence, and showing both would invite reading the decoration as a
// measurement.
let orientationGrid = new THREE.GridHelper(100, 40, 0x334155, 0x1e293b);
sublayers.shell.add(orientationGrid);

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

// Stacking order on the floor plane, in metres. Small deliberate separations
// rather than coincident planes: two surfaces at exactly the same height
// z-fight, and the resulting shimmer reads as a rendering fault in a view whose
// whole job is to be believed.
const FOOTPRINT_Y = 0.002; // traced building slab, lowest
const GRID_Y = 0.006; // surveyed gridlines, just above the slab

// One entry per traced footprint. An array rather than a single reference
// because the count is what the regression asserts against the API.
const footprintMeshes = [];
let structuralGridLines = null;
const finitePoint = (p, needY) =>
  p !== null && typeof p === 'object' && finite(p.x) && finite(p.z) && (!needY || finite(p.y));
const asArray = (v) => (Array.isArray(v) ? v : []);

// The traced building outline. This is what makes the floor read as THIS
// building: the envelope above is only its bounding box, and a box is the same
// box for every rectangular-ish building in the world. The outline is stepped
// and includes a fitted corner, and drawing it is the difference between a
// generic shell and a floor plan.
//
// Drawn as a filled slab plus its own edge loop, both from the same vertex
// list, so the fill and the outline can never disagree.
function buildFootprint(footprint) {
  const verts = footprint && Array.isArray(footprint.vertices) ? footprint.vertices : [];
  if (verts.length < 3) return 0;
  if (!verts.every((v) => v && finite(v.x) && finite(v.z))) return 0;

  const shape = new THREE.Shape();
  shape.moveTo(verts[0].x, verts[0].z);
  for (let i = 1; i < verts.length; i++) shape.lineTo(verts[i].x, verts[i].z);
  shape.closePath();

  // The plate was 0x111c2e against a 0x0f172a background -- a two-step
  // difference that vanished on any real display, so the traced outline was
  // the only thing saying where the building was and the floor did not read as
  // a floor at all. Lifted to a slate that separates from the background
  // without competing with the equipment drawn on it.
  const slab = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    // Lit, not basic: an unlit material cannot receive a shadow, and the floor
    // plate is the surface every shadow lands on. depthWrite stays off so the
    // plate never occludes the grid drawn just above it.
    new THREE.MeshStandardMaterial({
      color: 0x27384f,
      roughness: 0.96,
      metalness: 0.02,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  slab.rotation.x = Math.PI / 2; // Shape is authored in XY; lay it on XZ.
  slab.position.y = FOOTPRINT_Y;
  slab.receiveShadow = true;
  slab.userData.footprint = { confidence: footprint.confidence, geometry_status: footprint.geometry_status };
  footprintMeshes.push(slab);
  sublayers.shell.add(slab);

  // Measured geometry supersedes the synthetic container, exactly as the
  // decorative grid is retired below once the surveyed grid arrives. Leaving
  // both would put an amber rectangle across the real floor and invite reading
  // a synthetic extent as a building line.

  // The building line is the heaviest line on the source sheet and is the one
  // element an operator uses to orient. It gets the strongest edge here too.
  const loop = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(verts.map((v) => new THREE.Vector3(v.x, FOOTPRINT_Y + 0.01, v.z))),
    new THREE.LineBasicMaterial({ color: 0x93a8c4 })
  );
  sublayers.shell.add(loop);
  return 1;
}

// The surveyed structural grid: the gridlines the building is actually set out
// on, replacing the decorative helper. Every line is one segment pair in a
// single BufferGeometry, so the whole grid costs one draw call rather than one
// per line.
function buildStructuralGrid(grid) {
  if (!grid || typeof grid !== 'object') return 0;
  const xs = Array.isArray(grid.x) ? grid.x.filter((l) => l && finite(l.at)) : [];
  const zs = Array.isArray(grid.z) ? grid.z.filter((l) => l && finite(l.at)) : [];
  if (xs.length < 2 || zs.length < 2) return 0;

  const xMin = Math.min(...xs.map((l) => l.at));
  const xMax = Math.max(...xs.map((l) => l.at));
  const zMin = Math.min(...zs.map((l) => l.at));
  const zMax = Math.max(...zs.map((l) => l.at));

  const points = [];
  for (const l of xs) points.push(new THREE.Vector3(l.at, GRID_Y, zMin), new THREE.Vector3(l.at, GRID_Y, zMax));
  for (const l of zs) points.push(new THREE.Vector3(xMin, GRID_Y, l.at), new THREE.Vector3(xMax, GRID_Y, l.at));

  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0x1e293b })
  );
  sublayers.shell.add(lines);
  structuralGridLines = lines;

  // The decorative grid has served its purpose. Retiring it here, rather than
  // leaving both, keeps exactly one grid on screen and makes that one evidence.
  if (orientationGrid) {
    sublayers.shell.remove(orientationGrid);
    orientationGrid.geometry.dispose();
    orientationGrid = null;
  }
  return xs.length + zs.length;
}

// ── Presentation machine model ───────────────────────
//
// PRESENTATION_ONLY. Read this, and the header of machine-forms.js, before
// changing anything below.
//
// The floor holds observed equipment positions whose width and depth were
// measured from the drawing and whose HEIGHT IS NOT IN EVIDENCE -- a plan view
// carries no elevation. Those positions render as flat pads in the slots layer
// precisely so their silhouette cannot imply a height nobody measured.
//
// This layer deliberately draws a height anyway, because a floor of flat grey
// pads communicates nothing to someone trying to understand the space. What is
// carried from evidence is each machine's footprint, its position, and which
// colour-separated drawing layer its symbol came from. Everything vertical --
// the heights, the proportions, the fact that a machine is box-shaped at all --
// is a drawing convention invented here.
//
// Machines are NOT all one shape. The sheet draws equipment on six colour
// layers, and members of a layer repeat one symbol; that grouping is OBSERVED
// and is the only input to the form choice. The form itself is invented, and
// the names are shape words rather than process words for the reason set out in
// machine-forms.js: a form called "drilling machine" would assert a mapping no
// evidence in this project supports.
//
// Built as InstancedMesh, one per (form, part). That is 23 objects for the
// whole floor; drawn as individual meshes the same model would be roughly a
// thousand meshes and a thousand draw calls.

const presentationMeshes = [];
let presentationBuilt = false;
// Recorded at build time so the inspector and the regression report what was
// actually instanced, not what a second pass over the data would say.
let presentationCounts = {};

// Materials are keyed by PART ROLE rather than by form. Six forms therefore
// cost four materials, and -- more to the point -- a per-form palette would
// read as a colour code for something, which is exactly what this layer must
// not look like. Forms are told apart by silhouette, never by colour.
const ROLE_MATERIAL = Object.freeze({
  plinth: { color: 0x1c2431, roughness: 0.95, metalness: 0.10 },
  body: { color: 0x33414f, roughness: 0.72, metalness: 0.15 },
  head: { color: 0x4a5a6b, roughness: 0.50, metalness: 0.18 },
  accent: { color: 0x5b6b7d, roughness: 0.45, metalness: 0.20 },
});

/**
 * Builds the presentation machines from the measured slot footprints.
 *
 * One InstancedMesh per (form, part). Slots are grouped by form first so each
 * mesh knows its instance count before allocation.
 */
function buildPresentationMachines(slots) {
  if (presentationBuilt) return 0;
  const groups = groupByForm(slots);
  const total = FORM_KEYS.reduce((n, k) => n + groups.get(k).length, 0);
  if (total === 0) return 0;
  presentationCounts = presentationCensus(slots);

  const unit = new THREE.BoxGeometry(1, 1, 1);
  const materials = {};
  for (const role of PART_ROLES) {
    materials[role] = new THREE.MeshStandardMaterial(ROLE_MATERIAL[role]);
  }

  const m = new THREE.Matrix4();
  for (const formKey of FORM_KEYS) {
    const members = groups.get(formKey);
    if (members.length === 0) continue;          // no mesh for an absent form
    const def = FORMS[formKey];

    def.parts.forEach((part, partIndex) => {
      const mesh = new THREE.InstancedMesh(unit, materials[part.role], members.length);
      mesh.name = `presentation-${formKey}-${partIndex}`;
      // Named and classified on the object itself, so a scene dump, a
      // screenshot review or a test cannot mistake this for measured geometry.
      mesh.userData.presentation = {
        classification: FORM_CLASSIFICATION,
        form: formKey,
        form_label: def.label,
        part: part.role,
        part_index: partIndex,
        note: 'Form and every vertical dimension are a drawing convention, not a measurement. '
          + 'The grouping behind the form is the drawing layer the symbol came from.',
      };
      // Casting is a lighting property, not a geometry claim: it changes how
      // a form is shaded, never where it is. Only PRESENTATION_ONLY bodies
      // cast -- the measured slot pads must not gain a silhouette they never
      // had.
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      presentationMeshes.push(mesh);
      sublayers.presentation.add(mesh);

      members.forEach((slot, i) => {
        const box = partsFor(slot)[partIndex];
        m.makeScale(box.w, box.h, box.d);
        m.setPosition(box.x, box.y, box.z);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  presentationBuilt = true;
  requestShadowUpdate();
  return total;
}

/** Census by form, for the inspector and the regression. Counts only. */
function presentationCensus(slots) {
  const groups = groupByForm(slots);
  const out = {};
  for (const key of FORM_KEYS) {
    const n = groups.get(key).length;
    if (n > 0) out[key] = n;
  }
  return out;
}

// ── Interior walls and partitions (CAD) ──────────────────────
// EVIDENCE SPLIT, and it is not a fine distinction: a wall's plan position and
// its THICKNESS are MEASURED_CAD -- the thickness is the measured gap between
// the two faces the drawing actually draws, which is why the extractor discards
// any face it could not pair rather than assigning a default. A wall's HEIGHT
// appears nowhere in the drawing. A plan view carries no elevation.
//
// So height is a declared presentation constant, tagged PRESENTATION_ONLY,
// exactly the convention already used for column height. It is deliberately
// well below the 5.0 m floor-to-floor: a partition drawn to the slab would
// assert an enclosure the drawing does not support, on a floor that is largely
// open-plan.
//
// One InstancedMesh, so ~900 walls cost one draw call rather than 900.
const WALL_PRESENTATION_HEIGHT_M = 2.6;
let wallCount = 0;
// The instanced meshes themselves, so the regression suite can reconcile the
// structural layer exactly rather than being loosened to tolerate them.
const wallMeshes = [];
const openingMeshes = [];

function buildWalls(walls) {
  const list = asArray(walls).filter(
    (w) => w && finite(w.x1) && finite(w.z1) && finite(w.x2) && finite(w.z2)
      && finite(w.thickness) && w.thickness > 0
  );
  wallCount = list.length;
  if (list.length === 0) return 0;

  const unit = boxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(unit, standardMaterial(0x2c3a4f), list.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  let drawn = 0;
  for (const w of list) {
    const dx = w.x2 - w.x1;
    const dz = w.z2 - w.z1;
    const len = Math.hypot(dx, dz);
    // A zero-length wall is not a thin wall, it is a pairing that produced no
    // span. Skip it rather than draw a degenerate box.
    if (!(len > 0)) continue;
    pos.set((w.x1 + w.x2) / 2, WALL_PRESENTATION_HEIGHT_M / 2, (w.z1 + w.z2) / 2);
    q.setFromAxisAngle(up, -Math.atan2(dz, dx));
    scale.set(len, WALL_PRESENTATION_HEIGHT_M, w.thickness);
    mesh.setMatrixAt(drawn, m.compose(pos, q, scale));
    drawn++;
  }
  mesh.count = drawn;
  mesh.instanceMatrix.needsUpdate = true;
  sublayers.walls.add(mesh);
  wallMeshes.push(mesh);
  wallCount = drawn;
  return drawn;
}

// ── Doors, windows, air showers (CAD) ────────────────────────
// Insertion points only. The CAD block behind each one carries a vendor part
// name and its own internal geometry; the wire projection carries neither, so
// these are drawn as small markers at the recorded point rather than as
// modelled leaves and frames. Position is OBSERVED_CAD; the marker's size is
// a presentation choice.
const OPENING_STYLE = {
  door: { color: 0x38bdf8, h: 2.1 },
  window: { color: 0x7dd3fc, h: 1.0 },
  airshower: { color: 0xc4b5fd, h: 2.3 },
};
let openingCount = 0;

function buildOpenings(openings) {
  const list = asArray(openings).filter((o) => o && finitePoint(o.position, false)
    && OPENING_STYLE[o.kind]);
  openingCount = list.length;
  if (list.length === 0) return 0;

  const byKind = new Map();
  for (const o of list) {
    if (!byKind.has(o.kind)) byKind.set(o.kind, []);
    byKind.get(o.kind).push(o);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  for (const [kind, members] of byKind) {
    const style = OPENING_STYLE[kind];
    const mesh = new THREE.InstancedMesh(
      boxGeometry(1, 1, 1), standardMaterial(style.color), members.length);
    members.forEach((o, i) => {
      pos.set(o.position.x, style.h / 2, o.position.z);
      scale.set(0.9, style.h, 0.25);
      mesh.setMatrixAt(i, m.compose(pos, q, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
    sublayers.walls.add(mesh);
    openingMeshes.push(mesh);
  }
  return list.length;
}

// ── Wall lines: drawn CAD geometry with no measured thickness ─
// Long wall faces the extractor could not pair. They are real line-work from
// the drawing, so the plan view would be visibly incomplete without them, but
// they carry no thickness and are therefore NEVER extruded -- they are drawn
// flat on the floor, where they read as plan linework rather than as walls
// with an implied depth nobody measured.
//
// One merged LineSegments geometry: hundreds of spans, one draw call.
let wallLineCount = 0;

function buildWallLines(lines) {
  const list = asArray(lines).filter(
    (w) => w && finite(w.x1) && finite(w.z1) && finite(w.x2) && finite(w.z2));
  wallLineCount = list.length;
  if (list.length === 0) return 0;
  const pts = [];
  for (const w of list) {
    pts.push(new THREE.Vector3(w.x1, 0.02, w.z1));
    pts.push(new THREE.Vector3(w.x2, 0.02, w.z2));
  }
  const seg = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x51617a })
  );
  sublayers.walls.add(seg);
  return list.length;
}

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

  aimKeyLight(envelope);
  buildFootprint(geometry.footprint_polygon);
  buildStructuralGrid(geometry.grid);
  buildWalls(geometry.walls, envelope);
  buildWallLines(geometry.wall_lines);
  buildOpenings(geometry.openings);
  buildPresentationMachines(slots);

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
    // Structure reads as vertical when it is shaded and casts. This changes how
    // a column is drawn, never where it is or what it claims.
    colMesh.castShadow = true;
    colMesh.receiveShadow = true;
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

// ── Lighting ──────────────────────────────────────────────────────────
//
// PRESENTATION_ONLY, all of it. Nothing here is a measurement of anything: the
// building's real lighting is not in evidence and is not being modelled. This
// exists so that a machine reads as a solid object rather than as a flat
// silhouette, and so that a viewer can tell which of two overlapping forms is
// nearer.
//
// One light was a flat 0.6 ambient plus a 0.8 directional, which left every
// vertical face the same value and every machine reading as a cut-out. The set
// below is the standard three-part rig, dimmed to the scene's dark ground:
//
//   key    the sun-equivalent, and the only caster. Placed high and to one
//          side so a machine's own shadow separates it from the floor.
//   fill   opposite and much weaker, so shadowed faces stay legible rather
//          than going to black. A face nobody can read is a face nobody can
//          judge the shape of.
//   ground a hemisphere term tinted towards the floor colour, so the underside
//          of a form picks up the floor rather than the void.
const ambient = new THREE.AmbientLight(0xffffff, 0.46);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
dirLight.position.set(58, 92, 46);
dirLight.castShadow = true;
// The shadow camera has to cover the WHOLE floor -- 174.5 x 120.3 m -- or the
// far half of the building silently loses its shadows. Sized from the envelope
// rather than a guessed constant, once the geometry has arrived.
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 400;
dirLight.shadow.bias = -0.0009;
dirLight.shadow.normalBias = 0.04;
scene.add(dirLight);
scene.add(dirLight.target);

const fillLight = new THREE.DirectionalLight(0xbcd2ee, 0.34);
fillLight.position.set(-52, 40, -60);
scene.add(fillLight);

const groundLight = new THREE.HemisphereLight(0xdce8ff, 0x16233a, 0.55);
scene.add(groundLight);

/**
 * Points the key light at the floor and sizes its shadow camera to cover it.
 *
 * Called once the measured envelope is known. A shadow camera that does not
 * span the building does not fail loudly -- it just stops casting past its own
 * edge, which reads as "the far end has no machines".
 */
function aimKeyLight(envelope) {
  if (!envelope) return false;
  const r = Math.max(envelope.width, envelope.depth) * 0.62;
  dirLight.target.position.set(0, 0, 0);
  dirLight.target.updateMatrixWorld();
  dirLight.position.set(r * 0.55, r * 0.95, r * 0.42);
  const cam = dirLight.shadow.camera;
  cam.left = -r;
  cam.right = r;
  cam.top = r;
  cam.bottom = -r;
  cam.far = r * 4;
  cam.updateProjectionMatrix();
  requestShadowUpdate();
  return true;
}

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
// Below this, an area is labelled only in inspection mode. Chosen so every
// process hall and every real room carries its name in the default view, while
// the handful of closet-sized areas do not compete with them.
const MINOR_ZONE_AREA_M2 = 60;
const zoneLabels = [];

/** Shoelace area of a ring, in square metres. */
function polygonArea2D(verts) {
  let sum = 0;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    sum += (verts[j].x * verts[i].z) - (verts[i].x * verts[j].z);
  }
  return Math.abs(sum / 2);
}

/** Inspection mode shows every area name; every other mode shows the major
 *  ones only. Visibility of a label, never the zone itself. */
function setMinorZoneLabels(visible) {
  let changed = 0;
  for (const label of zoneLabels) {
    const meta = label.userData.zoneLabel;
    if (!meta || !meta.minor) continue;
    if (label.visible !== visible) changed++;
    label.visible = visible;
  }
  if (changed > 0) requestRender();
  return changed;
}

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

    // The area's own label from the drawing, when one survived the name guard.
    // Until the CAD arrived no zone could carry a name -- the labels lived on a
    // schematic sharing no reference frame with the measured polygons, so
    // attaching one would have invented the correspondence. The CAD carries the
    // label and the boundary in the SAME frame, so this is now a reading, not a
    // guess. A nameless zone still draws; it simply goes unlabelled.
    if (typeof zone.name === 'string' && zone.name.length > 0) {
      let cx = 0;
      let cz = 0;
      for (const v of verts) { cx += v.x; cz += v.z; }

      // Label size follows the area's own size, and small areas are not
      // labelled at all by default. A 9 m2 store room and a 4,300 m2 drilling
      // hall are not equally important to someone reading the floor, and
      // labelling both at the same weight is what turns an executive view into
      // a cluttered drawing. The small ones keep their names -- they are in the
      // record and in the inspector; they are simply not shouted across the
      // scene. Inspection mode turns them all on.
      const area = polygonArea2D(verts);
      const label = makeTextSprite(zone.name, {
        fontSize: 22,
        scaleFactor: area >= 600 ? 0.075 : (area >= 200 ? 0.055 : 0.042),
      });
      label.position.set(cx / verts.length, floorY + 2.2, cz / verts.length);
      label.userData.zoneLabel = { area, minor: area < MINOR_ZONE_AREA_M2 };
      label.visible = area >= MINOR_ZONE_AREA_M2;
      zoneLabels.push(label);
      layers.functional.add(label);
    }
    drawn++;
  }
  return drawn;
}

// ── Pickable geometry ────────────────────────────────────────
// There is no machine-mesh registry any more. Monitored devices are not drawn
// on this floor at all: none of them has an established position, and the
// synthetic grid that used to supply one has been deleted.
//
// A slot is an observed position with no confirmed identity. It can never
// acquire a drill-down, a live state or a device id, and now there is no
// machine array for it to be confused with.
const slotMeshes = []; // THREE.Mesh[], one per observed slot, userData.slot set
const columnMeshes = []; // THREE.Mesh[], one per detected column, userData.column set
let latestStateById = new Map(); // deviceId -> state row from /api/state
// The two fetches race: geometry can land after the first poll, and the roll-up
// needs both. Keeping the last rows lets either arrival render a complete panel
// rather than one showing zeros for the half that has not arrived.
let lastStateRows = [];

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

// Slots are the only pickable operational geometry now.
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
    ['Machine meshes', 0],
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
  // Provenance is counted, not assumed. A column read from the CAD and a column
  // traced off a raster scan are both "columns"; only the record says which,
  // and the panel must not describe one as the other.
  const cadColumns = columnList.filter((c) => c && c.geometry_status === 'MEASURED_CAD').length;
  const wallList = Array.isArray(geo && geo.walls) ? geo.walls : [];
  const openingList = Array.isArray(geo && geo.openings) ? geo.openings : [];
  const confirmed = slotList.filter((s) => s && s.ims_device_id).length;
  const meta = geo && typeof geo.functional_zones_meta === 'object' ? geo.functional_zones_meta : null;
  const withheld = meta && Number.isFinite(meta.withheld) ? meta.withheld : 0;

  // The top banner used to be static, and its text ("not derived from any real
  // floor plan or survey") was written when this view had no measured geometry
  // at all. It is now false in the OTHER direction: the building, its columns
  // and its equipment positions are digitized from the architectural plan, and
  // a page-wide banner denying that is as misleading as one overclaiming.
  //
  // What is still simulated is narrower and needs saying precisely: the
  // monitored devices have no surveyed position. So the banner is written from
  // the response, and says which half is which.
  const banner = document.getElementById('simulated-banner');
  if (banner) {
    const measured = columns > 0 || slots > 0;
    const cad = cadColumns > 0 || wallList.length > 0;
    banner.textContent = measured
      ? `${cad ? 'CAD FLOOR' : 'MEASURED FLOOR'} — ${columns} columns`
        + `${wallList.length > 0 ? `, ${wallList.length} walls` : ''} and ${slots} equipment `
        + `positions are ${cad ? 'read from the AutoCAD source' : 'digitized from the architectural plan'}. `
        + `No monitored device is drawn on this floor: ${confirmed} confirmed `
        + 'physical-to-IMS mappings, so every asset here is UNMAPPED.'
      : 'SIMULATED LAYOUT — Floor 1 (default grouping). No measured floor geometry is '
        + 'deployed here, so machine and zone positions are placeholders, not derived '
        + 'from any real floor plan or survey.';
    banner.classList.toggle('banner-measured', measured);
  }

  const setCount = (layer, text) => {
    const el = document.querySelector(`#layer-controls [data-count="${layer}"]`);
    if (el) el.textContent = text;
  };
  // Each count names its evidence class, because the number alone is
  // ambiguous: 242 and 23 are both "equipment" but not the same claim.
  setCount('shell', '(measured envelope, floor plate, grid)');
  setCount('columns', cadColumns > 0
    ? `(${columns} MEASURED_CAD)` : `(${columns} OBSERVED)`);
  setCount('walls', `(${wallCount} walls MEASURED_CAD plan, `
    + `${openingCount} openings; height PRESENTATION_ONLY)`);
  setCount('functional', `(${zonesDrawn} validated, ${withheld} withheld)`);

  setCount('slots', `(${slots} OBSERVED, ${confirmed} CONFIRMED)`);

  factoryCounts = { assets: slots, mapped: confirmed, zones: zonesDrawn };
  updateFactoryStatus(lastStateRows);

  const el = document.getElementById('evidence-summary');
  if (!el) return;
  const rows = [
    ['Structural columns', columns, cadColumns > 0 ? 'MEASURED_CAD' : 'OBSERVED'],
    ['Interior walls', wallList.length, 'MEASURED_CAD plan, PRESENTATION height'],
    ['Doors, windows, air showers', openingList.length, 'OBSERVED_CAD'],
    ['Observed equipment slots', slots, 'OBSERVED'],
    ['Monitored devices drawn', 0, 'NONE — no established position'],
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
  for (const group of [slotMeshes, columnMeshes]) {
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
  // No machine drill-down from the scene: nothing in the scene IS a machine.
  // A drill-down would have to be reached from a position, and no position on
  // this floor is tied to a device by an authoritative record.
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
    // Hover changes the cursor and the highlight, both of which are drawn.
    requestRender();
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
  // The synthetic grid reference is gone with the grid that produced it.
  const gridRefText = 'UNMAPPED';
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
  // Live state changes machine colours and labels. Ask for the frame that
  // shows them; without this the poll would update the scene graph and nothing
  // would ever draw it.
  requestRender();
  const rows = payload.machines || [];
  lastStateRows = rows;
  latestStateById = new Map(rows.map((r) => [r.device_id, r]));
  // New telemetry invalidates a machine inspector that is currently open.
  lastInspected = null;

  // Nothing in the scene is coloured by this. No monitored device has an
  // established position on this floor, so live state colours no geometry --
  // it drives the device list and the factory status roll-up only. The moment
  // an authoritative mapping exists, the mapped SLOT is what will take colour.
  machineListEl.innerHTML = rows.map(stateRowHtml).join('');

  const alarmCount = rows.filter((r) => r.machine_state === 'DOWN').length;
  summaryLine.textContent = `${rows.length} devices · ${alarmCount} in ALARM · none placed on this floor`;
  updateFactoryStatus(rows);

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
// ── Factory status roll-up ───────────────────────────────────
// The hierarchy this view answers in, top down: FACTORY -> AREA -> PHYSICAL
// ASSET -> STATUS. Deliberately not a list of machine cards; the floor is the
// subject, and a device is only interesting here once it is tied to a place on
// it.
//
// Live telemetry reaches this roll-up but CANNOT reach the scene. Every
// physical asset is UNMAPPED until an authoritative record links it to a
// device, so the device counts are reported as what they are: real states
// belonging to equipment whose location on this floor is not established.
let factoryCounts = { assets: 0, mapped: 0, zones: 0 };

function updateFactoryStatus(rows) {
  const el = document.getElementById('factory-status');
  if (!el) return;
  const list = Array.isArray(rows) ? rows : [];
  const critical = list.filter((r) => r.machine_state === 'DOWN').length;
  const unmapped = factoryCounts.assets - factoryCounts.mapped;

  const cell = (label, value, tone) =>
    `<div class="fs-cell${tone ? ` fs-${tone}` : ''}">`
    + `<div class="fs-value">${value}</div><div class="fs-label">${label}</div></div>`;

  el.innerHTML =
    cell('process areas', factoryCounts.zones)
    + cell('physical assets', factoryCounts.assets)
    + cell('mapped to IMS', factoryCounts.mapped, factoryCounts.mapped === 0 ? 'warn' : null)
    + cell('unmapped', unmapped, unmapped > 0 ? 'warn' : null)
    + cell('devices in alarm', critical, critical > 0 ? 'crit' : null);
}

// ── Status legend ────────────────────────────────────────────
// Rendered from the shared vocabulary rather than written into the HTML, so a
// state cannot appear in the legend without existing in the code that colours
// the scene, and vice versa.
//
// A state with no backend column is rendered dimmed AND carries a literal "no
// source" tag. An operator reading this panel learns which lamps this
// deployment can actually light -- which is a different and more useful fact
// than "no machine is currently in that state".
function renderStatusLegend() {
  const body = document.getElementById('status-legend-body');
  const note = document.getElementById('status-legend-note');
  if (!body) return;
  body.textContent = '';
  for (const key of STATUS_ORDER) {
    const st = OPERATIONAL_STATUS[key];
    const dt = document.createElement('dt');
    if (!st.backed) dt.className = 'st-off';
    const glyph = document.createElement('span');
    glyph.className = 'st-glyph';
    glyph.style.color = st.color;
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = st.glyph;
    dt.appendChild(glyph);
    dt.appendChild(document.createTextNode(` ${st.label}`));
    if (!st.backed) {
      const tag = document.createElement('span');
      tag.className = 'st-na';
      tag.textContent = 'NO SOURCE';
      dt.appendChild(tag);
    }
    const dd = document.createElement('dd');
    if (!st.backed) dd.className = 'st-off';
    dd.textContent = st.meaning;
    body.appendChild(dt);
    body.appendChild(dd);
  }
  if (note) {
    const missing = STATUS_ORDER.length - BACKED_STATUSES.length;
    note.textContent =
      `${BACKED_STATUSES.length} of ${STATUS_ORDER.length} states are derivable from this `
      + `deployment's own data. ${missing} have no backing column in the schema yet and `
      + 'are listed so the vocabulary is complete, not because they can display.';
  }
}

async function boot() {
  const t0 = performance.now();
  renderStatusLegend();
  // NO PLACEMENT FETCH. This view once drew every monitored device as a box on
  // a deterministic synthetic grid, with a floor plate sized from that grid. It
  // is gone -- not hidden, not toggled off: the fetch, the meshes, the labels,
  // the synthetic zone boxes and the plate are all deleted.
  //
  // Those positions were invented. On a floor plan read from CAD, an invented
  // position sitting beside a measured one is indistinguishable to the eye, and
  // the eye is what this view is for. A device whose location is not
  // established is now absent from the scene and listed as UNMAPPED instead.

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
    slotMeshes,
    columnMeshes,
    layers,
    applyView,
    getView: () => activeView,
    getBuildingView: () => buildingView,
    // Cache sizes are exposed so a regression test can assert the sharing
    // actually happened rather than trusting that it did.
    resourceStats,
    footprintMeshes,
    presentationMeshes,
    wallMeshes,
    openingMeshes,
    // The form tables and the per-form census, so a regression can assert what
    // was actually built rather than trusting that it was.
    presentationSpec: () => ({ classification: FORM_CLASSIFICATION, forms: FORM_KEYS }),
    presentationCensus: () => ({ ...presentationCounts }),
    presentationFormOf: (slot) => formKeyFor(slot),
    getStructuralGrid: () => structuralGridLines,
    setLayerVisible,
    sublayers,
    resetView,
    snapshotCoordinates,
    // Exposed so a test can force a frame and read renderer.info afterwards.
    // Without it, a suite that measures draw calls on a quiet loop reads the
    // counters from whenever the last frame happened to be.
    requestRender,
    framesRendered: () => framesRendered,
  };
}

boot();

// ── Render loop ──────────────────────────────────────────────
function onResize() {
  // Sized from the CONTAINER, not the window. In side-by-side the 3D pane is
  // half the window wide, and a renderer sized to the window would draw the
  // model at the wrong aspect and let it spill under the drawing.
  const rect = container.getBoundingClientRect();
  const w = Math.max(Math.round(rect.width), 1);
  const h = Math.max(Math.round(rect.height), 1);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // updateStyle stays ON. Suppressing it leaves the canvas at its previous CSS
  // size while the drawing buffer changes underneath, which renders the floor
  // squeezed into a corner of a half-width pane.
  renderer.setSize(w, h);

  // Every derived fit depends on aspect, so a resize invalidates all of them.
  // Without this, framing after a window change silently uses the old aspect
  // and can clip the structure the view exists to show.
  refitViews();
}

// The HUD's real width, published to CSS so the side-by-side rules can leave
// the panel clear without hardcoding a number that has already changed twice.
function publishHudWidth() {
  const hud = document.getElementById('hud');
  const clear = hud && !hud.hidden ? Math.ceil(hud.getBoundingClientRect().right) : 0;
  document.documentElement.style.setProperty('--hud-clear', `${clear}px`);
}
publishHudWidth();

// A mode switch changes the pane's width without changing the window's, so the
// resize listener below never fires for it. Modes are camera and layout only:
// this recomputes the fit, and moves no geometry.
// Which framing each mode opens on. CAMERA ONLY -- these entries are read by
// applyView, which sets a position and a target and touches nothing else. A
// mode never changes a layer's data, never moves a machine, and never promotes
// an evidence state; the regression takes a byte-level coordinate snapshot
// across every switch to keep that true.
//
// Modes not listed keep whatever framing the operator last chose, because
// overriding a deliberate camera choice on every mode switch is the behaviour
// that made the earlier view buttons feel broken.
const MODE_VIEW = Object.freeze({
  // The widest honest framing: the whole building, and the device grid too if
  // one is present. "Show me everything" is the executive question.
  executive: ['overview', 'building', 'operator'],
  // Back to the working framing an operator reads machines at.
  // Inspection reads detail on the floor plan, so it opens on the plan.
  inspection: ['plan', 'building', 'operator'],
  // Half a window wide. The operator view is a fixed, hand-tuned camera that
  // does not adapt to the pane it is drawn in, so entering side-by-side on it
  // leaves the 3D half zoomed into a corner. The fitted framings do adapt.
  split: ['building', 'overview', 'operator'],
});

window.addEventListener('twin-mode', (ev) => {
  const mode = ev && ev.detail && ev.detail.mode;
  // Inspection is the mode for reading detail, so it is the mode that shows
  // every area name. This changes label VISIBILITY only -- no zone, boundary or
  // coordinate is touched, which the coordinate snapshot check keeps honest.
  setMinorZoneLabels(mode === 'inspection');
  const wanted = MODE_VIEW[mode];
  if (!wanted) return;
  // First framing in the list that actually has data behind it. A view with no
  // bounds must not be applied -- it would frame nothing.
  for (const name of wanted) {
    if (applyView(name)) return;
  }
});

window.addEventListener('twin-pane-resize', () => {
  publishHudWidth();
  // One frame later, so the class change has been laid out and the container
  // reports its new width rather than its old one.
  requestAnimationFrame(() => {
    onResize();
    if (activeView !== 'operator') applyView(activeView);
  });
});

// setSize reallocates the drawing buffer, and a drag-resize fires this
// continuously. Coalescing to one call per frame keeps the final state
// identical while doing the work once instead of dozens of times.
let resizePending = null;
window.addEventListener('resize', () => {
  if (resizePending) return;
  resizePending = requestAnimationFrame(() => {
    resizePending = null;
    publishHudWidth();
    onResize();
  });
});

function animate() {
  requestAnimationFrame(animate);
  // controls.update() returns true while damping is still moving the camera.
  // Trusting only the 'change' event would stop the loop mid-glide.
  if (controls.update()) requestRender();
  if (renderTail <= 0) return;
  renderTail--;
  framesRendered++;
  renderer.render(scene, camera);
}
animate();
