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
  OPERATIONAL_STATUS, STATUS_ORDER, BACKED_STATUSES, DATA_QUALITY,
  statusForMachineState,
} from './operational-status.js';

// Color/label per machine now come straight off /api/state's own
// state_color/state_label fields -- server.js resolves those from
// lib/contracts.js's MACHINE_STATE_THEME, the one place a MachineState's
// color/label is defined. No second, separately-hardcoded copy here.
// DEFAULT_MACHINE_COLOR is only the pre-first-poll placeholder (before any
// real /api/state response has arrived to set a real one).
const DEFAULT_MACHINE_COLOR = 0x64748b;

const POLL_MS = 5000;

// FT-20: no fetch anywhere in this file carried an explicit timeout -- a
// genuinely hung request (a stalled connection, an exhausted DB pool that
// never answers rather than erroring) would leave the caller waiting on
// the browser's own default network timeout, which is minutes, not
// seconds. For the two primary-render fetches this matters concretely:
// pollState's hang would leave #status-line silently showing an
// increasingly stale "Last updated" with no sign anything was wrong, and
// a hung geometry fetch would leave #data-quality on "Loading floor
// evidence..." forever -- the exact FT-19 bug, just reached via a hang
// instead of a rejection, which FT-19's own fix could not catch because a
// pending promise is neither a resolution nor a rejection.
//
// AbortController + a real deadline turns "wait indefinitely" into "fail
// with a real, distinguishable reason" -- TimeoutError's own name is kept
// on the thrown error so callers already text-matching err.message for a
// real reason keep getting one, just a different real one.
function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ── Scene setup ──────────────────────────────────────────────
const container = document.getElementById('scene');

const scene = new THREE.Scene();
// Restrained graphite. The scene is read for hours in a control room, so the
// ground tone is deliberately darker and less blue than the HUD chrome: the
// floor plate, the structure and the status colours each need their own step
// of separation from it, and a lighter ground spends contrast that the status
// vocabulary needs more.
scene.background = new THREE.Color(0x0b1017);

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

// FT-19: GPU context loss (driver reset, sleep/wake, memory pressure) had no
// handler at all before this -- the canvas would simply stop drawing, with
// no on-screen sign anything was wrong, and no user-facing recovery path.
// preventDefault() is required for the browser to ever fire
// webglcontextrestored at all; without it the context is gone for good.
// Restoration does not re-answer this: three.js does not automatically
// re-upload every GPU resource (geometries, textures, shadow maps) after a
// restore, and rebuilding all of that in place risks silently missing one on
// a floor plan whose whole job is to be believed. A reload is the same
// choice this app already makes for a floor switch (see setUpFloorSelector's
// own comment) -- consistent, not a new policy.
renderer.domElement.addEventListener('webglcontextlost', (ev) => {
  ev.preventDefault();
  const banner = document.getElementById('webgl-lost');
  if (banner) banner.hidden = false;
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  window.location.reload();
});
document.getElementById('webgl-reload')?.addEventListener('click', () => window.location.reload());

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
document.addEventListener('visibilitychange', requestRender);

// Framing is derived from the measured bounds, not offset around chrome:
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
  operational: new THREE.Group(), // CAD equipment pads and markers
  // The drawing's own line-work, drawn over the reconstruction so the two can
  // be compared. Off by default and fetched only when first switched on: it is
  // a diagnostic overlay, not part of the floor, and an operator's view should
  // not pay for it.
  reference: new THREE.Group(),
};
layers.structural.name = 'structural';
layers.functional.name = 'functional';
layers.operational.name = 'operational';
layers.reference.name = 'reference';
layers.reference.visible = false;
// The TELEMETRY layer is gone. It was created for live state overlays drawn on
// monitored devices, and nothing was ever added to it: no device has an
// established position on this floor, so there is nothing to overlay. An empty
// layer with a toggle in the panel promises a capability that does not exist.
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
  // Equipment read out of the CAD as block references: an INSERT states a
  // position and a rotation, so both are the drawing's own. Extent is a
  // separate, weaker claim and many records carry none -- those draw as a
  // position marker, never as a box, because a default box would put an
  // invented extent on the floor next to a measured one.
  equipment: new THREE.Group(),
  // INSPECTION geometry: the exact measured outline of every machine, drawn as
  // line-work. Hidden by default and never what a machine is drawn as -- the
  // measurement is reconciliation geometry, and a 34-vertex hull of every
  // bracket and pipe stub is noise on an operator's map. It exists so the
  // simplification the operator sees can be checked against what was measured,
  // in the same view, without leaving the floor.
  measured: new THREE.Group(),
};
// The presentation sub-layer is GONE, along with the machine-form library that
// fed it. It drew invented machine volumes over raster-derived positions: two
// unmeasured claims stacked, rendered at the same visual weight as the CAD.

for (const [name, g] of Object.entries(sublayers)) g.name = name;
layers.structural.add(sublayers.shell, sublayers.columns, sublayers.walls);
layers.operational.add(sublayers.equipment, sublayers.measured);
sublayers.measured.visible = false;

// -- Raw CAD reference -------------------------------------------------
//
// WHY THIS IS DRAWN AT ALL. Everything else in this scene has been through the
// reconstruction: faces paired into walls, fragments merged, corners closed,
// labels bound to boundaries. Each of those steps can be wrong in a way that
// is invisible from inside the model, because the checks that follow compare
// the model against itself. This layer is the drawing's own line-work with no
// interpretation applied, so a disagreement between the reconstruction and its
// source is something you can see rather than something you have to infer.
//
// It is a REFERENCE, not evidence about the floor: it is drawn as thin lines
// in one flat colour, above the model, and it never participates in picking,
// framing, counts or the evidence summary.
//
// The service serves it in the CAD's own frame -- millimetres, +y up, no
// reflection. The transform below is the canonical one, applied here rather
// than server-side on purpose: if the frame is wrong, this overlay is where it
// shows, and pre-transforming the reference would hide exactly that.
const cadRoleGroups = new Map();
let rawCadState = 'idle';     // idle | loading | ready | unavailable | error
let rawCadCoverage = null;
let rawCadSegments = 0;

/** CAD millimetres (floor-local, +y up) to twin metres. */
function cadToTwin(xMm, yMm, halfWidth, halfDepth) {
  return { x: xMm / 1000 - halfWidth, z: -(yMm / 1000 - halfDepth) };
}

// -- View modes --------------------------------------------------------
// ONE coordinate system now. The scene once held two that could not be framed
// together -- the measured building, and 23 monitored devices standing on a
// synthetic grid beside it -- and the view buttons existed largely to choose
// which of the two to frame badly. The synthetic grid is deleted, so every
// framing below fits the same measured floor and they can only differ in
// camera angle.
//
// Switching only moves the camera. No geometry, position, layer visibility or
// API result is touched, and the regression takes a byte-level coordinate
// snapshot across every switch to keep that true.
// PLAN is the default framing and the primary view. Physical accuracy is what
// this twin is for right now, and a straight-down CAD plan is the framing in
// which a wall, a column and a machine can be checked against the drawing. The
// 3D framings are derived from the same geometry and the same coordinates, so
// they can never disagree with the plan about where anything is.
//
// The hand-tuned OPERATOR camera is GONE. It framed the synthetic device grid
// that no longer exists, so it framed empty floor.
let buildingView = null; // fitted to the measured envelope, oblique
let overviewView = null; // fitted to the whole floor, oblique
let planView = null;     // straight down, the 2D CAD floor plan
let activeView = 'plan';

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
// The command-centre chrome DOCKS -- header, status strip and drawer are grid
// tracks, not overlays -- so the scene pane's own rectangle is the usable area.
// The old measurement subtracted a floating panel's width from the canvas;
// there is no floating panel any more, and subtracting a phantom one framed
// the floor off-centre.
function usableViewport() {
  const rect = container.getBoundingClientRect();
  const w = Math.max(rect.width, 1);
  const h = Math.max(rect.height, 1);
  return { w, h, left: 0, top: 0, usableW: w, usableH: h };
}

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
  // Twelve passes. Six was not always enough: the oblique view foreshortens
  // the floor, so the first estimate can start far outside the target band and
  // the loop would run out of passes still under-filling the frame -- which is
  // what left the model floating in the middle of a mostly empty screen. This
  // is cheap and runs only when the data or the aspect changes, never per frame.
  for (let pass = 0; pass < 12; pass++) {
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

  // NOT CENTRED ON THE PROJECTED BOX, deliberately.
  //
  // An oblique perspective view projects a box asymmetrically -- the near
  // corners land further from centre than the far ones -- so the model sits a
  // little low in frame and the fit stops when the worst corner reaches the
  // margin. Correcting that by sliding the target along the camera's own axes
  // was tried and made it worse: the shift changes which corner is worst,
  // which changes the required distance, and the two chase each other. The
  // measured asymmetry is about 0.29 vs 0.89 in NDC, which costs some screen
  // area and clips nothing. Left as it is rather than shipped half-solved.
  //
  // This matters little in practice: 2D plan is the default and the primary
  // view, and it fits exactly because a straight-down camera has no
  // foreshortening to correct.
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
function refitViews() {
  if (buildingBounds) buildingView = frameBounds(buildingBounds);
  // The overview once had to frame the building AND a synthetic device grid
  // sitting outside it. That grid is gone, so the building IS the extent.
  const combined = buildingBounds;
  overviewView = combined ? frameBounds(combined) : null;
  if (buildingBounds) {
    // Straight down, and fitted for a straight-down camera rather than derived
    // from the oblique one. The oblique fit's distance covers the floor's
    // DIAGONAL as seen at an angle; reusing it overhead framed the plan at
    // roughly half the screen it could have had, with the drawing marooned in
    // dead space. The height below is the exact one at which the floor's own
    // extent fills the frame, less a 6% margin so the outer wall is not flush
    // against the edge.
    const view = usableViewport();
    const aspect = Math.max(view.w / view.h, 0.0001);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const MARGIN = 0.94;
    const h = Math.max(
      (buildingBounds.depth / 2) / (tanV * MARGIN),
      (buildingBounds.width / 2) / (tanV * aspect * MARGIN),
    );
    planView = {
      // The 0.001 nudge on z keeps the view direction off the exact -Y axis,
      // which OrbitControls treats as degenerate: without it the camera's up
      // vector is undefined and the plan can flip on the first drag.
      position: { x: buildingBounds.cx, y: h, z: buildingBounds.cz + 0.001 },
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
  // Apply the active framing once its geometry exists. Every framing is
  // derived from the measured bounds now, so every one of them needs the refit.
  applyView(activeView);
}

const VIEWS = () => ({ plan: planView, overview: overviewView, building: buildingView });

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
  const g = layers[name] || sublayers[name] || cadRoleGroups.get(name);
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
  // Hiding the equipment layer must take its captions with it.
  requestLabelUpdate();
  // The reference is fetched the first time it is switched on, never at boot.
  if (box.dataset.layer === 'reference' && box.checked) {
    ensureRawCad(activeFloor).then((state) => {
      const status = document.getElementById('reference-status');
      if (!status) return;
      status.textContent = state === 'ready'
        ? `${rawCadSegments.toLocaleString()} CAD segments`
        : (state === 'unavailable' ? 'no CAD reference deployed' : 'CAD reference unavailable');
    });
  }
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

/** A cached line material, so the inspection layer costs one of them. */
function lineMaterial(color, opacity) {
  const key = `line|${color}|${opacity}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
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

// Same styling as basicMaterial, DoubleSide only -- see buildTruePolygonMeshes
// for why an extruded, arbitrarily-wound CAD polygon needs it.
function polygonMaterial(color, opacity) {
  const key = `polygon|${color}|${opacity}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide });
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
      // The floor sits between the background and the structure on purpose:
      // dark enough that walls and columns read as objects standing ON it,
      // light enough that the building is visibly a solid plate and not a hole.
      color: 0x1b2534,
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

// The PRESENTATION MACHINE FORMS ARE GONE -- the form library, the per-form
// InstancedMeshes, the census and the layer toggle with them.
//
// They drew invented machine volumes on top of raster-derived positions: a
// shape nobody measured, standing at a place read off a scan of a print,
// rendered at the same visual weight as CAD geometry beside it. Equipment now
// comes from the drawing's own block references, and where the drawing does
// not establish an extent the renderer draws a position marker and says
// UNRESOLVED rather than supplying a body.

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
  const mesh = new THREE.InstancedMesh(unit, standardMaterial(0x4a5d78), list.length);
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
// Exposed for the same reason wallMeshes is: the structural reconciliation
// test counts what the renderer actually put in the scene, and a layer the
// test cannot see is a layer that can silently disappear again.
const wallLineMeshes = [];

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
    new THREE.LineBasicMaterial({ color: 0x64789a })
  );
  sublayers.walls.add(seg);
  wallLineMeshes.push(seg);
  return list.length;
}

/**
 * Builds the raw CAD reference overlay from a served document.
 *
 * One LineSegments per role, so a role can be switched off without rebuilding
 * anything, and one shared material, so twelve roles cost one material rather
 * than twelve. Returns the number of segments drawn.
 */
function buildRawCad(doc) {
  for (const g of cadRoleGroups.values()) {
    layers.reference.remove(g);
    g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  cadRoleGroups.clear();
  rawCadSegments = 0;

  if (!doc || doc.available !== true || !buildingBounds) return 0;
  const halfWidth = buildingBounds.width / 2;
  const halfDepth = buildingBounds.depth / 2;
  const material = new THREE.LineBasicMaterial({
    color: 0xf59e0b, transparent: true, opacity: 0.85, depthTest: false,
  });

  for (const role of asArray(doc.roles)) {
    const seg = asArray(role.segments);
    // A role whose array is not a whole number of segments is not a shorter
    // role, it is a broken one. Half a drawing shown as a reference reads as a
    // discrepancy in the model, which is the opposite of what this is for.
    if (!role.id || seg.length === 0 || seg.length % 4 !== 0) continue;
    const pts = new Float32Array((seg.length / 2) * 3);
    let bad = false;
    for (let i = 0, o = 0; i < seg.length; i += 2, o += 3) {
      if (!finite(seg[i]) || !finite(seg[i + 1])) { bad = true; break; }
      const p = cadToTwin(seg[i], seg[i + 1], halfWidth, halfDepth);
      pts[o] = p.x;
      // Above every reconstructed surface, so the reference reads as an
      // overlay rather than as another thing standing on the floor.
      pts[o + 1] = 0.12;
      pts[o + 2] = p.z;
    }
    if (bad) continue;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(geom, material);
    lines.name = `cad:${role.id}`;
    lines.renderOrder = 10;
    const group = new THREE.Group();
    group.name = `cad-${role.id}`;
    group.add(lines);
    layers.reference.add(group);
    cadRoleGroups.set(role.id, group);
    rawCadSegments += seg.length / 4;
  }
  rawCadCoverage = doc.coverage || null;
  return rawCadSegments;
}

/**
 * Fetches the reference once, on first use.
 *
 * Deliberately lazy. The document is several thousand segments the floor view
 * never draws, and fetching it at boot would charge every operator for a
 * diagnostic nobody opened.
 */
async function ensureRawCad(floorId) {
  if (rawCadState === 'loading' || rawCadState === 'ready') return rawCadState;
  // The overlay is placed relative to the measured envelope, so there is
  // nothing to place it against until the floor is built. Staying idle rather
  // than recording "unavailable" means a toggle before load simply retries.
  if (!buildingBounds) return 'idle';
  rawCadState = 'loading';
  const url = floorId
    ? `api/floor-raw-cad?floor=${encodeURIComponent(floorId)}` : 'api/floor-raw-cad';
  try {
    const res = await fetch(url);
    if (!res.ok) { rawCadState = 'unavailable'; return rawCadState; }
    const doc = await res.json();
    if (doc.available !== true) { rawCadState = 'unavailable'; return rawCadState; }
    buildRawCad(doc);
    rawCadState = rawCadSegments > 0 ? 'ready' : 'unavailable';
  } catch (err) {
    console.warn('raw CAD reference fetch failed (non-fatal):', err.message);
    rawCadState = 'error';
  }
  requestRender();
  return rawCadState;
}

function buildFloor(geometry) {
  const envelope = geometry && typeof geometry === 'object' ? geometry.envelope : null;
  // A partially-valid envelope is not a smaller envelope, it is an unknown
  // one. Drawing from it would state a measurement nobody made.
  if (!envelope || typeof envelope !== 'object') return;
  if (!finite(envelope.width) || !finite(envelope.depth) || !finite(envelope.height)) return;

  const columns = asArray(geometry.columns);
  const zones = asArray(geometry.zones);

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
    // Structure reads a clear step above the floor plate. MEDIUM stays dimmer
    // than HIGH so a less certain detection never looks as firm as a clear one.
    const color = col.confidence === 'medium' ? 0x3d4a5e : 0x5c6e88;
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

  // Equipment is NOT built here. It is driven entirely by applyDisplayMode
  // (called once, right after this function returns, with whatever mode is
  // active) so there is exactly one path onto the floor for a machine --
  // never a direct buildFloor render that a later mode switch has to
  // reconcile against.
}

/**
 * EQUIPMENT, read out of the CAD as block references.
 *
 * Split out of buildFloor so a display-mode switch can rebuild ONLY this --
 * walls, columns and zones do not change when an operator picks a different
 * evidence filter, and rebuilding them on every switch would cost a fresh
 * DXF-derived layer for a filter that touches none of it.
 *
 * Two claims of different strength live on one record and are drawn
 * differently on purpose:
 */
/**
 * The canonical display-policy projection: API evidence -> the exact asset
 * ids a mode renders. This is the ONLY place that decision is made -- both
 * applyDisplayMode (below) and a regression asking "what SHOULD be on
 * screen" call this same function, so there is no second copy of the rule to
 * drift out of step with the render it is supposed to describe.
 *
 *   PRIMARY           resolved, primary-pipeline evidence only
 *   PRIMARY_AUDIT     PRIMARY plus UNRESOLVED markers, still no recovered pass
 *   PRIMARY_RECOVERED PRIMARY plus everything the recovery pass found
 *   ALL_ENGINEERING   everything
 *
 * Deduplication is NOT a mode: a proven duplicate (duplicate_of set) is
 * suppressed at every mode, including ALL_ENGINEERING, because it is not a
 * second machine to audit into view -- it is the same machine, so showing it
 * twice would not be more complete, it would be wrong.
 */
function getDisplayAssetIds(mode) {
  const ids = [];
  for (const item of rawApiEquipment) {
    if (!item || typeof item.id !== 'string') continue;
    if (item.duplicate_of) continue; // one physical asset, one render, always
    const resolved = !!item.footprint;
    const recovered = item.evidence_tier === 'RECOVERED';
    let show;
    if (mode === 'PRIMARY') show = resolved && !recovered;
    else if (mode === 'PRIMARY_AUDIT') show = !recovered;
    else if (mode === 'PRIMARY_RECOVERED') show = resolved || recovered;
    else show = true; // ALL_ENGINEERING, and the default for an unknown mode
    if (show) ids.push(item.id);
  }
  return ids.sort();
}

/**
 * Applies a display mode: filters the ALREADY-FETCHED rawApiEquipment (never
 * a second fetch -- a mode switch is a client-side render decision, not an
 * evidence change) and rebuilds ONLY the equipment layer from the result.
 * rawApiEquipment itself is never touched, so the API's own evidence survives
 * every switch unchanged -- provable by re-fetching and diffing, which the
 * regression does.
 */
function applyDisplayMode(mode) {
  activeDisplayMode = mode;
  const ids = new Set(getDisplayAssetIds(mode));
  const filtered = rawApiEquipment.filter((item) => item && ids.has(item.id));
  buildEquipmentLayer(filtered);
  requestRender();
}

function buildEquipmentLayer(equipment) {
  // A repeat call (a display-mode switch) must cost exactly what a fresh
  // call costs, never more: every InstancedMesh batch from the PREVIOUS call
  // is removed from the scene before this one adds its own. The batches'
  // geometry is the shared, cached unit box (boxGeometry()) and is never
  // disposed here -- disposing a cache entry every other consumer still
  // points at would blank them, not free anything real. TRUE_POLYGON meshes
  // dispose their own (unique, per-record) geometry inside
  // buildTruePolygonMeshes, which this also calls below.
  for (const mesh of equipmentBatches) sublayers.equipment.remove(mesh);
  equipmentBatches.length = 0;
  //
  //   POSITION and ROTATION are MEASURED_CAD. An INSERT entity states an
  //   insertion point and a rotation angle; nothing is traced, snapped,
  //   averaged or fitted, so left/right placement and orientation are the
  //   drawing's own. This is what fixes the complaint that machines sat in the
  //   wrong place and faced the wrong way: the previous layer took both from a
  //   raster digitisation of a printed sheet.
  //
  //   EXTENT is OBSERVED_CAD at best, and for most records it is UNRESOLVED. A
  //   block's bounding box measures everything the block draws, which for many
  //   machines includes a service envelope or a swing arc. Where that box
  //   swallows a neighbour the extractor withholds it, and the renderer draws a
  //   small flat marker instead of a body. NO DEFAULT BOX. A nominal footprint
  //   would be an invented dimension wearing the shape of a measured one.
  //
  // HEIGHT is not in evidence for any of them -- a plan view carries no
  // elevation -- so everything here is a flat pad on the floor plane, never a
  // volume that implies a height nobody read.
  // TWO InstancedMeshes, not 344 objects: one for machines, one for markers.
  // Every machine shares one unit box and one material, and differs only by a
  // 4x4 matrix -- translate to the record's own position, turn to its own
  // angle, scale to its own operational size. A matrix cannot introduce a
  // coordinate; it can only place the record's.
  const instances = [];
  // TRUE_POLYGON records claim their own measured outline, not a rectangle --
  // see the coordinate-contract note above buildTruePolygonMeshes. They are
  // pulled out of the box-instancing loop below and given their own geometry
  // path; everything else is completely unchanged from before this branch
  // existed. A TRUE_POLYGON record with no usable polygon (missing/degenerate)
  // is NOT dropped -- it falls through to the same box path every other
  // record uses, so a bad polygon loses shape fidelity, never the machine.
  const polygonItems = [];
  for (const item of equipment) {
    if (!item || !finitePoint(item.position, true)) continue;
    if (item.display_representation === 'TRUE_POLYGON'
      && Array.isArray(item.footprint_polygon) && item.footprint_polygon.length >= 3) {
      polygonItems.push(item);
      continue;
    }
    const fp = item.footprint;
    const op = item.operational_footprint;
    const tier = item.footprint_status;
    const sized = (tier === 'MEASURED_CAD' || tier === 'OBSERVED_CAD' || tier === 'APPROXIMATION')
      && fp && finite(fp.width) && finite(fp.depth);
    // THE OPERATIONAL SIZE, where the model published one, and the physical
    // extent where it did not. Both are CAD-measured; neither is invented, and
    // a machine with no extent gets a marker rather than a default box.
    const useOp = sized && op && finite(op.width) && finite(op.depth);
    const w = sized ? (useOp ? op.width : fp.width) : UNRESOLVED_MARKER_M;
    const d = sized ? (useOp ? op.depth : fp.depth) : UNRESOLVED_MARKER_M;
    const h = sized ? EQUIPMENT_PRESENTATION_HEIGHT_M : MARKER_HEIGHT_M;
    // Rotation about +Y with the sign the canonical frame demands -- the ONLY
    // rotation convention in the client -- plus the offset the record states
    // between the CAD rotation and the axis its own block draws its body on.
    // The offset is a published number on the record, not a fit done here.
    const offset = sized && finite(item.operational_axis_offset_deg)
      ? item.operational_axis_offset_deg : 0;
    const rotY = finite(item.rotation_deg)
      ? CAD_ROTATION_SIGN * (item.rotation_deg + offset) * Math.PI / 180 : 0;
    // The operational rectangle's own measured centre, as the record's delta
    // from the machine's position. Zero for every machine measured on its
    // INSERT axis. It is added ONLY to the drawn rectangle: the record's
    // position is what the inspector, the snapshot and every coordinate check
    // read, and it is never written back.
    const dx = useOp && finite(op.offset_x) ? op.offset_x : 0;
    const dz = useOp && finite(op.offset_z) ? op.offset_z : 0;
    instances.push({
      item,
      sized,
      // Sat ON the floor: position.y is the floor reference and a box is
      // centred on its origin. x and z are the record's own -- never adjusted,
      // for overlap, for a room, or for anything.
      x: item.position.x + dx, y: item.position.y + h / 2, z: item.position.z + dz,
      w, h, d, rotY,
      tier: sized ? tier : 'UNRESOLVED',
    });
  }

  const machines = instances.filter((i) => i.sized);
  const markers = instances.filter((i) => !i.sized);
  // A TRUE_POLYGON record carries no box instance (it was pulled out above),
  // but the label pass and the coordinate snapshot both walk
  // equipmentInstances expecting one entry per equipment record -- so it gets
  // the same minimal {item, x, y, z} shape a marker does. Labels read
  // item.footprint directly for on-screen size, not inst.w/h/d, so nothing
  // else is needed here.
  const polygonInstances = polygonItems.map((item) => ({
    item, sized: true,
    x: item.position.x, y: item.position.y, z: item.position.z,
  }));
  equipmentInstances.length = 0;
  equipmentInstances.push(...machines, ...markers, ...polygonInstances);

  const unit = boxGeometry(1, 1, 1);
  const build = (list, style, name) => {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(
      unit, basicMaterial(style.color, style.opacity), list.length
    );
    mesh.name = name;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const axis = new THREE.Vector3(0, 1, 0);
    list.forEach((inst, i) => {
      q.setFromAxisAngle(axis, inst.rotY);
      pos.set(inst.x, inst.y, inst.z);
      scl.set(inst.w, inst.h, inst.d);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
      inst.instanceId = i;
      inst.batch = name;
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    // Instance metadata lives BESIDE the geometry, not in it: an instance
    // carries an index, and the index resolves to a record.
    mesh.userData.instances = list;
    sublayers.equipment.add(mesh);
    return mesh;
  };
  // One batch per evidence tier. Tiers are drawn differently on purpose -- an
  // operator must be able to see which extents are measurements -- so they may
  // not be pooled into one appearance for the sake of one fewer draw call.
  equipmentBatches.length = 0;
  const tiers = [...new Set(machines.map((i) => i.tier))].sort();
  for (const tier of tiers) {
    const style = EQUIPMENT_TIER_STYLE[tier] || EQUIPMENT_TIER_STYLE.UNRESOLVED;
    const mesh = build(machines.filter((i) => i.tier === tier), style, `equipment-${tier}`);
    if (mesh) equipmentBatches.push(mesh);
  }
  const kMesh = build(markers, EQUIPMENT_TIER_STYLE.UNRESOLVED, 'equipment-markers');
  if (kMesh) equipmentBatches.push(kMesh);

  buildTruePolygonMeshes(polygonItems);
  buildMeasuredOutlines(equipment);
}

/**
 * TRUE_POLYGON primary render: the record's own measured, served outline,
 * extruded to the same presentation height a box gets -- not a rectangle
 * standing in for a shape that isn't one.
 *
 * COORDINATE CONTRACT (do not re-derive this by reading the box path above):
 * footprint_polygon is already WORLD-SPACE twin-frame metres -- mx()/mz()
 * applied ONCE to the fully-composed CAD hull, the exact way `position` above
 * is built from the same coordinate space (see server-side
 * extract-floor1-equipment.js:792-794 and floor1-frame.js). So a vertex is
 * used AS-IS:
 *   - NOT translated by item.position (the polygon is not "centred" on it --
 *     it already contains its own placement)
 *   - NOT rotated by item.rotation_deg (the polygon's own boundary already
 *     encodes the CAD rotation; rotating it again would turn an already-
 *     turned shape)
 *   - NOT scaled by operational_footprint (that field does not apply here --
 *     see the display_representation exemption in
 *     tests/lint/floor1-cad-reconciliation.js)
 * The ONLY transform applied below is the fixed -90 degrees about local X
 * that every extrusion needs to lie flat on the floor plane instead of
 * standing up along the extrude axis -- a constant of the THREE.ExtrudeGeometry
 * convention, identical for every record, never a second application of the
 * machine's own placement.
 */
let polygonMeshes = [];
function buildTruePolygonMeshes(items) {
  for (const mesh of polygonMeshes) {
    sublayers.equipment.remove(mesh);
    // Geometry is unique per mesh and disposed; material is cache-shared
    // (polygonMaterial) with every other record of the same tier and must
    // not be -- disposing it here would blank every OTHER polygon still on
    // screen.
    mesh.geometry.dispose();
  }
  polygonMeshes = [];
  for (const item of items) {
    const poly = item.footprint_polygon;
    // Shape's 2D y is built as -worldZ, not worldZ: the -90deg X rotation
    // below that turns "extrude along Z" into "extrude along world Y" also
    // flips the sign of the shape's own y axis when it lands back in world
    // space, and this pre-flip is what cancels that -- proven, not assumed,
    // by carrying the rotation matrix through by hand: rotateX(-90) sends
    // local (x, y, z) to world (x, z, -y), so shape-y = -worldZ is exactly
    // the value that makes the landed world-z equal worldZ again.
    const pts = poly
      .filter((p) => finite(p.x) && finite(p.z))
      .map((p) => new THREE.Vector2(p.x, -p.z));
    if (pts.length < 3) continue;
    const shape = new THREE.Shape(pts);
    const tier = item.footprint_status || 'UNRESOLVED';
    const style = EQUIPMENT_TIER_STYLE[tier] || EQUIPMENT_TIER_STYLE.UNRESOLVED;
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: EQUIPMENT_PRESENTATION_HEIGHT_M,
      bevelEnabled: false,
    });
    // Extrude's local Z is height; rotate -90deg about X so local Z becomes
    // world Y (up) and the shape's own (x, z) plane becomes world (x, z) --
    // no other axis moves, no coordinate is added.
    geom.rotateX(-Math.PI / 2);
    // A simplified CAD hull's vertex winding is not guaranteed consistent
    // (see B.simplifyHull), so the side faces' outward normal is not either
    // -- DoubleSide is the generic fix, not a per-record one, and costs
    // nothing extra for a flat presentation slab nobody lights.
    const material = polygonMaterial(style.color, style.opacity);
    const mesh = new THREE.Mesh(geom, material);
    mesh.name = `equipment-polygon-${item.id}`;
    mesh.position.set(0, item.position.y, 0);
    mesh.userData.item = item;
    sublayers.equipment.add(mesh);
    polygonMeshes.push(mesh);
  }
  // Picked the same way an InstancedMesh batch is -- see pickEquipment()'s
  // generic branch for a hit with no instanceId.
  equipmentBatches.push(...polygonMeshes);
}

/**
 * The MEASURED outline of every machine, as one merged line object.
 *
 * One BufferGeometry and one draw call for all of them, because this is a
 * diagnostic layer and an operator's frame budget should not pay 213 draw
 * calls for something that is off by default. Drawn at the floor plane, in
 * plan, so it reads against the display shape it is the source of.
 */
function buildMeasuredOutlines(equipment) {
  sublayers.measured.clear();
  const points = [];
  let outlines = 0;
  for (const item of equipment) {
    const poly = item && Array.isArray(item.footprint_polygon) ? item.footprint_polygon : null;
    if (!poly || poly.length < 3) continue;
    if (!finitePoint(item.position, true)) continue;
    outlines += 1;
    const y = item.position.y + MEASURED_OUTLINE_LIFT_M;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (!finite(a.x) || !finite(a.z) || !finite(b.x) || !finite(b.z)) continue;
      points.push(a.x, y, a.z, b.x, y, b.z);
    }
  }
  measuredOutlineCount = outlines;
  if (!points.length) return;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const line = new THREE.LineSegments(geom, lineMaterial(MEASURED_OUTLINE_COLOR, 0.85));
  line.name = 'measured-outlines';
  sublayers.measured.add(line);
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
    // The boundary as it was served, kept alongside the mesh built from it.
    // A ShapeGeometry cannot be read back as the ring that produced it, and
    // the claim worth testing -- that these polygons are the drawing's own
    // area boundaries -- needs the ring, not the triangulation.
    plate.userData.vertices = verts.map((v) => ({ x: v.x, z: v.z }));
    plate.userData.zoneId = zone.id;
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
/**
 * Height of an equipment block. PRESENTATION_ONLY, and that is not a hedge:
 * the drawing is a plan and a plan carries no elevation, so no machine on this
 * floor has a height in evidence. Every block is drawn at the SAME height for
 * exactly that reason -- a varying height would look like data.
 *
 * Physical x/z position and rotation are CAD-derived. The height is not.
 */
const EQUIPMENT_PRESENTATION_HEIGHT_M = 2.2;

/**
 * Sign applied to a CAD plan rotation to obtain the three.js rotation about
 * world +Y. Must equal CAD_ROTATION_SIGN in scripts/lib/floor1-frame.js, where
 * the derivation lives.
 *
 * The canonical frame maps CAD (x, y) to twin (x, -y) so that the plan camera
 * -- whose screen-up is world -z -- renders the sheet the right way up. That
 * is a reflection, and a reflection flips the sense of a plan rotation, so
 * this sign flips with it. It was -1 under the old mirrored frame. Getting one
 * of the two right and the other wrong puts every machine in the correct place
 * facing the wrong way, which is why a regression measures the rendered mesh
 * rotation against the served angle rather than trusting this line.
 */
const CAD_ROTATION_SIGN = 1;
// The mark drawn where the CAD establishes a position but not an extent. A
// fixed, obviously-uniform square: it must not be mistakable for a measurement,
// which is exactly why every one of them is the same size.
const UNRESOLVED_MARKER_M = 0.9;
// The inspection outline sits just above the display shape it is the source
// of, so the two read as a pair rather than z-fighting into a shimmer.
const MEASURED_OUTLINE_LIFT_M = 0.02;
const MEASURED_OUTLINE_COLOR = 0xe0a94f;
let measuredOutlineCount = 0;
// And deliberately flat. A marker at block height would read as a machine
// whose size is known, which is the one thing it is not.
const MARKER_HEIGHT_M = 0.08;

/**
 * How each evidence tier is drawn.
 *
 * MEASURED_CAD is the block's own geometry, transformed and measured, and
 * reads as solid. OBSERVED_CAD is a bounding box of the same block -- weaker,
 * and no longer produced for this floor. APPROXIMATION is an extent bounded by
 * neighbour spacing, so it reads a step back. UNRESOLVED claims no size at all
 * and is a faint marker.
 */
// A pale, near-white fill read fine as a single machine but merges adjoining
// ones into one undifferentiated slab wherever the CAD packs them tight --
// which several zones on this floor do. Darkening and desaturating the fill
// (no colour change in kind, only in value) keeps the same evidence-tier
// distinction while giving equipment its own tonal register: dark enough to
// read as "material sitting on the floor" against the pale zone tint above
// it, and far enough from the wall/boundary blue that a dense cluster of
// boxes does not read as one continuous field.
const EQUIPMENT_TIER_STYLE = Object.freeze({
  MEASURED_CAD: { color: 0x4d6483, opacity: 0.95 },
  OBSERVED_CAD: { color: 0x4d6483, opacity: 0.95 },
  APPROXIMATION: { color: 0x3c516c, opacity: 0.8 },
  UNRESOLVED: { color: 0x2b3a4d, opacity: 0.55 },
});

// One record per CAD asset: the served record plus the world placement it was
// drawn at. NOT a mesh -- 344 machines are drawn by two InstancedMeshes, and
// this is the metadata beside them that picking, labels and the inspector
// resolve an instance index into.
const equipmentInstances = [];
const equipmentBatches = []; // THREE.InstancedMesh[], one per tier
const columnMeshes = []; // THREE.Mesh[], one per detected column, userData.column set
// The exact array /api/floor-geometry returned, kept for two reasons: it is
// what getDisplayAssetIds/applyDisplayMode filter FROM (so a mode switch is
// never a second fetch), and it is what a regression reads back to prove a
// mode switch never mutates the API's own evidence -- see
// getRawApiEquipment() below. Replaced wholesale on the next successful
// fetch, never mutated in place.
let rawApiEquipment = [];
let activeDisplayMode = 'ALL_ENGINEERING';
// FT-15: asset_id -> physical-overlay entry, from /api/physical-overlay.
// Fetched ONCE per geometry load (see the fetch site below), never
// re-resolved per render frame or per pick -- identity resolution is a
// load/update-boundary cost, not a per-frame one. Empty today: this
// deployment has zero CONFIRMED CAD-to-IMS mappings, so this object stays
// {} and every asset keeps rendering exactly as FT-14 left it.
let physicalOverlayByAssetId = {};
// FT-16: asset_id -> array of RCA-enriched alarm events, from
// /api/alarm-rca. Same load boundary as the overlay above -- fetched once
// alongside geometry, never per frame. Empty today for the same reason:
// 0 CONFIRMED mappings means every alarm's physical_asset_id is null, so
// nothing groups under a real asset_id.
let alarmRcaByAssetId = {};
// The two fetches race: geometry can land after the first poll, and the roll-up
// needs both. Keeping the last rows lets either arrival render a complete panel
// rather than one showing zeros for the half that has not arrived.
let lastStateRows = [];

// ── Shared raycaster (CAD equipment picking -- pickEquipment/pickColumn
// below). The old per-device "10 machine boxes" click-to-drill-down flow
// this comment block used to describe (and its own drillDownUrl() helper)
// is gone with the raster grid it targeted; removed by FT-17.5's audit as
// confirmed dead code (zero call sites) rather than left to bit-rot --
// its hard-won var-clicked_series/var-log_id knowledge was carried
// forward into lib/telemetry.js's buildDrillDownUrl(), which had not
// inherited it (see that function's own comment). ──
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

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

// CAD equipment is the only pickable operational geometry now.
//
// An InstancedMesh reports which INSTANCE a ray hit, so picking stays exact
// without one object per machine: the index resolves against the metadata
// array the batch was built from. Nearest hit across the batches wins, so a
// marker standing inside a machine still picks whichever the ray reaches first.
function pickEquipment(event) {
  if (event) aimRay(event);
  if (!equipmentBatches.length) return null;
  const hits = raycaster.intersectObjects(equipmentBatches, false);
  for (const hit of hits) {
    // A TRUE_POLYGON record is its own single Mesh, not one instance among
    // many in a batch, and carries its item directly -- same pick loop, one
    // more branch, not a second pick path.
    if (hit.object.userData.item) return hit.object.userData.item;
    const list = hit.object.userData.instances;
    if (!list || hit.instanceId === undefined || hit.instanceId === null) continue;
    const inst = list[hit.instanceId];
    if (inst) return inst.item;
  }
  return null;
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
    ['Equipment meshes', equipmentBatches.length],
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
let equipmentCensus = { total: 0, resolved: 0, unresolved: 0, mapped: 0 };

function updateEvidenceSummary(geo, zonesDrawn) {
  // Counts are read defensively for the same reason the renderer is: a
  // malformed response must produce an honest zero, not an exception that
  // leaves the evidence panel showing the previous, now-wrong figures.
  const columnList = Array.isArray(geo && geo.columns) ? geo.columns : [];
  const equipmentList = Array.isArray(geo && geo.equipment) ? geo.equipment : [];
  const columns = columnList.length;
  // Provenance is counted, not assumed. A column read from the CAD and a column
  // traced off a raster scan are both "columns"; only the record says which,
  // and the panel must not describe one as the other.
  const cadColumns = columnList.filter((c) => c && c.geometry_status === 'MEASURED_CAD').length;
  const wallList = Array.isArray(geo && geo.walls) ? geo.walls : [];
  const openingList = Array.isArray(geo && geo.openings) ? geo.openings : [];
  const wallLineList = Array.isArray(geo && geo.wall_lines) ? geo.wall_lines : [];
  const resolved = equipmentList.filter(
    (e) => e && (e.footprint_status === 'MEASURED_CAD' || e.footprint_status === 'OBSERVED_CAD'),
  ).length;
  const approximated = equipmentList.filter((e) => e && e.footprint_status === 'APPROXIMATION').length;
  const unresolved = equipmentList.length - resolved - approximated;
  const confirmed = equipmentList.filter((e) => e && e.ims_device_id).length;
  const meta = geo && typeof geo.functional_zones_meta === 'object' ? geo.functional_zones_meta : null;
  const withheld = meta && Number.isFinite(meta.withheld) ? meta.withheld : 0;

  equipmentCensus = {
    total: equipmentList.length, resolved, approximated, unresolved, mapped: confirmed,
  };

  // The header's data-quality line, written from the response rather than
  // fixed in the markup. It has been wrong in both directions before: first
  // denying measured geometry that existed, then implying CAD extents that did
  // not. It now states the split, because the split is the honest summary.
  const quality = document.getElementById('data-quality');
  if (quality) {
    quality.textContent = equipmentList.length > 0 || columns > 0
      ? `CAD · ${columns} columns · ${wallList.length} walls · `
        + `${equipmentList.length} assets (${resolved} measured, ${approximated} approximated, `
        + `${unresolved} UNRESOLVED) · ${confirmed} confirmed IMS mappings`
      : 'NO MEASURED GEOMETRY DEPLOYED — nothing on this floor is a measurement.';
    quality.classList.toggle('quality-measured', columns > 0);
  }

  const setCount = (layer, text) => {
    const el = document.querySelector(`#layer-controls [data-count="${layer}"]`);
    if (el) el.textContent = text;
  };
  setCount('shell', '(measured envelope, floor plate, grid)');
  setCount('columns', cadColumns > 0
    ? `(${columns} MEASURED_CAD)` : `(${columns} OBSERVED)`);
  setCount('walls', `(${wallCount} walls MEASURED_CAD plan, `
    + `${wallLineCount} faces OBSERVED_CAD no measured thickness, `
    + `${openingCount} openings; height PRESENTATION_ONLY)`);
  setCount('functional', `(${zonesDrawn} validated, ${withheld} withheld)`);
  setCount('equipment', `(${equipmentList.length} MEASURED_CAD positions; extents `
    + `${resolved} measured, ${approximated} approximated, ${unresolved} unresolved)`);

  factoryCounts = {
    assets: equipmentList.length, mapped: confirmed, zones: zonesDrawn, unresolved,
  };
  updateFactoryStatus(lastStateRows);

  const el = document.getElementById('evidence-summary');
  if (!el) return;
  const rows = [
    ['Structural columns', columns, cadColumns > 0 ? 'MEASURED_CAD' : 'OBSERVED'],
    ['Interior walls', wallList.length, 'MEASURED_CAD plan, PRESENTATION height'],
    // Counted separately and never folded into the wall total. A face whose
    // partner is off-layer is drawn line-work, not a measured wall, and adding
    // the two would turn a known-weaker claim into part of a stronger one.
    ['Wall faces, thickness unresolved', wallLineList.length, 'OBSERVED_CAD'],
    ['Doors, windows, air showers', openingList.length, 'OBSERVED_CAD'],
    ['Equipment positions', equipmentList.length, 'MEASURED_CAD'],
    ['Equipment extents measured', resolved, 'MEASURED_CAD'],
    ['Equipment extents approximated', approximated, 'APPROXIMATION'],
    ['Equipment extents unresolved', unresolved, 'UNRESOLVED'],
    ['Equipment height', 0, 'PRESENTATION_ONLY \u2014 not in evidence'],
    ['Raster-derived positions drawn', 0, 'NONE — superseded by the CAD'],
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

function showEquipmentInspector(item) {
  const mapped = item.status === 'IMS_CONNECTED' && item.ims_device_id;
  // FT-15: server-resolved truth only -- an overlay entry exists ONLY when
  // the server's own resolvePhysicalOverlay found a CONFIRMED mapping AND
  // real telemetry behind it (see lib/telemetry.js). This client never
  // re-derives eligibility itself; it only ever displays what the overlay
  // object already decided. `mapped` above (unchanged from FT-14) and this
  // lookup normally agree -- an overlay entry cannot exist for an asset
  // `mapped` calls false, since both trace back to the same CONFIRMED fact.
  const overlay = mapped ? physicalOverlayByAssetId[item.id] : undefined;
  // FT-16: RCA context, gated the same way -- only ever looked up for an
  // asset the server's own overlay already deemed eligible. alarm-rca.js
  // (server-side) has already applied the identity gate before this array
  // exists at all; this is a display lookup, not a second gate.
  const rcaAlarms = overlay ? (alarmRcaByAssetId[item.id] || []) : [];
  const tier = item.footprint_status;
  const sized = (tier === 'MEASURED_CAD' || tier === 'OBSERVED_CAD'
    || tier === 'APPROXIMATION') && item.footprint;
  const extent = sized
    ? `${item.footprint.width} × ${item.footprint.depth} m`
    : 'UNRESOLVED — no size is claimed';
  // The extent's own evidence, stated on its own row. Position and extent are
  // two claims of different strength on one record, and the row that says
  // "measured" must never be read as covering both.
  const extentEvidence = {
    MEASURED_CAD: 'MEASURED_CAD — the block’s own geometry, transformed and measured',
    OBSERVED_CAD: 'OBSERVED_CAD — the block’s own extent',
    APPROXIMATION: 'APPROXIMATION — block extent clipped to neighbour spacing',
  }[tier] || 'UNRESOLVED — not established by the CAD';

  render(
    mapped ? 'CONFIRMED' : 'UNMAPPED',
    mapped ? 'badge-confirmed' : 'badge-unmapped',
    'Equipment (CAD block reference)',
    [
      ['Asset', item.id],
      ['Identity', mapped ? `mapped to ${item.ims_device_id}` : 'no confirmed machine'],
      ['Mapping status', item.mapping_status ?? item.status],
      // FT-15: only ever rendered when the server's overlay carries a real
      // entry -- for every asset today (0 confirmed mappings), this whole
      // block is simply absent, and the inspector reads exactly as it did
      // before this phase.
      ...(overlay ? [
        ['Live state', `${overlay.state} (${overlay.freshness})`],
        ['Last seen', overlay.last_seen ?? 'unknown'],
        ['Alarm', overlay.alarm ? `${overlay.alarm.owner} — ${overlay.alarm.elapsed}` : 'none active'],
        ...(overlay.drill_down_url ? [['Drill-down', overlay.drill_down_url]] : []),
      ] : []),
      // FT-16: RCA detail, one active alarm at a time (Alarm above already
      // gives the count/owner/elapsed summary from FT-15). Exact event and
      // context window are kept as visibly separate rows -- never merged --
      // so a context reading can never be mistaken for the event that
      // actually fired the alarm.
      ...(rcaAlarms.length > 0 ? (() => {
        const a = rcaAlarms[0];
        const rows = [
          ['RCA alarm code', `${a.alarm_code}${a.severity ? ` (${a.severity})` : ''}`],
          ['RCA event time', a.event_time],
          ['RCA event resolution', a.exact_event ? a.exact_event.resolution : 'RCA_EVENT_UNRESOLVED'],
        ];
        if (a.exact_event) {
          rows.push(['RCA exact reading',
            `temp ${a.exact_event.temperature ?? '?'} / humidity ${a.exact_event.humidity ?? '?'}`]);
        }
        if (rcaAlarms.length > 1) rows.push(['RCA other active alarms', String(rcaAlarms.length - 1)]);
        return rows;
      })() : []),
      ['Position x / z', `${item.position.x} / ${item.position.z} m`],
      ['Rotation', item.rotation_deg == null ? 'unknown' : `${item.rotation_deg}°`],
      ['Position evidence', item.geometry_status ?? 'unknown'],
      ['Footprint', extent],
      ['Footprint evidence', extentEvidence],
      ['Outline, measured', item.footprint_shape ?? 'unresolved'],
      ['Drawn as', item.display_shape ?? 'UNRESOLVED'],
      ['Operational size', item.operational_footprint
        ? `${item.operational_footprint.width} × ${item.operational_footprint.depth} m`
        : 'none — drawn as a marker'],
      ['Rectangle centre vs machine position', (() => {
        const op = item.operational_footprint;
        if (!op || !finite(op.offset_x) || !finite(op.offset_z)) return 'not applicable';
        const mm = Math.hypot(op.offset_x, op.offset_z) * 1000;
        // Zero for every machine measured on its INSERT axis. Where it is not
        // zero it is the distance between two extent centres of ONE hull, and
        // the machine's own position is the one above, unchanged.
        return mm < 0.5 ? 'same point' : `${mm.toFixed(0)} mm — the same geometry, re-measured`;
      })()],
      ['Body axis vs CAD rotation', item.operational_axis_offset_deg == null
        ? 'not applicable'
        : `${item.operational_axis_offset_deg > 0 ? '+' : ''}${item.operational_axis_offset_deg}°`],
      ['Rectangle claims beyond the geometry', item.display_area_error == null
        ? 'not applicable'
        : `${(item.display_area_error * 100).toFixed(1)} % of it`],
      ['Enclosure excluded from the size', item.operational_excludes_enclosure
        ? 'yes — one group is drawn around the rest; confirm what it is'
        : 'no'],
      ['Body axis disagrees with the INSERT', item.orientation_geometry_mismatch
        ? 'yes — CAD rotation kept, flagged for inspection' : 'no'],
      ['Shares floor with a neighbour', item.overlaps_neighbour ? 'yes — outlines overlap' : 'no'],
      ['Handing', item.mirrored ? 'mirrored in the CAD' : 'as drawn'],
      ['Room', item.zone_status ?? 'unresolved'],
      ['Height', 'PRESENTATION_ONLY — a plan carries no elevation'],
      ['Confidence', item.confidence ?? 'unknown'],
      ['Source', item.source ?? 'unknown'],
      ['Zone', item.zone_id ?? 'none — outside every validated zone'],
    ],
    (tier === 'MEASURED_CAD'
      ? 'Placed by a CAD block reference: the insertion point, the rotation and the scale '
        + "are the drawing's own, not traced. The extent is the block's OWN GEOMETRY, "
        + 'transformed through the whole INSERT chain — mirror and nesting included — and '
        + "measured on the machine's own axes."
      : (tier === 'OBSERVED_CAD'
        ? 'Placed by a CAD block reference: the insertion point and the rotation are the '
          + "drawing's own, not traced. Extent is the block's bounding box, which measures "
          + 'everything the block draws.'
      : (tier === 'APPROXIMATION'
        ? 'Placed by a CAD block reference, so position and rotation are measured. The '
          + 'extent is the block box CLIPPED to the spacing of the neighbouring insertion '
          + 'points — two machines whose centres are P apart along an axis cannot both '
          + 'exceed P along it. Both bounds are CAD-measured; the result is a bound, not a '
          + 'stated dimension.'
        : 'Placed by a CAD block reference, so position and rotation are measured. Its '
          + 'extent is NOT established and none is drawn — a marker stands in for the '
          + 'machine rather than an invented footprint.')))
    + ' The shape on screen is an OPERATIONAL RECTANGLE: the operator map draws every '
    + 'machine whose extent was measured as one oriented rectangle, generated from the '
    + 'measured centre above, the operational size, and the CAD rotation plus the axis '
    + "offset the machine's own block states. It is a drawing convention, NOT a claim "
    + 'that the CAD footprint is rectangular — switch on Measured outlines to see the '
    + 'geometry it was measured from. The block height is a '
    + 'presentation constant, identical for every machine on this floor, and is not a '
    + 'measurement of anything. No machine identity is claimed: the CAD names blocks, not '
    + 'assets.'
  );
}

function showColumnInspector(col) {
  // The badge follows the record, it is not hardcoded. A column read out of the
  // CAD and one traced off a raster scan are different evidence, and the panel
  // has to be able to say which one is on screen.
  const cad = col.geometry_status === 'MEASURED_CAD';
  const det = col.detector || {};
  // Two detectors have produced columns for this floor and they report
  // different things. Show whichever actually ran, rather than a blank row for
  // fields belonging to the other one.
  const detectorRow = det.size_mm != null
    ? ['CAD evidence', `${det.squares || 1} drawn square(s), ${det.size_mm} mm`]
    : ['Detector ring / interior', det.ring_density != null
      ? `${det.ring_density} / ${det.interior_density}` : 'unknown'];

  render(
    cad ? 'MEASURED_CAD' : 'OBSERVED',
    cad ? 'badge-measured' : 'badge-observed',
    'Structural column',
    [
      ['Column', col.id],
      ['Position x / z', `${col.position.x} / ${col.position.z} m`],
      ['Measured footprint', col.footprint ? `${col.footprint.width} × ${col.footprint.depth} m` : 'unknown'],
      ['Grid reference', col.grid_ref ? `${col.grid_ref.x}${col.grid_ref.z}` : 'none'],
      ['Confidence', col.confidence ?? 'unknown'],
      ['Source', col.source ?? 'unknown'],
      ['Geometry status', col.geometry_status ?? 'unknown'],
      detectorRow,
    ],
    cad
      ? 'Read from the AutoCAD source at its own drawn position. Plan size is measured. '
        + 'Rendered height is the floor-to-floor envelope, a visualization convention; '
        + 'clear height is not in evidence.'
      : 'Detected from the engineering drawing at its own measured position — not snapped '
        + 'to the grid intersection. Rendered height is the floor-to-floor envelope, a '
        + 'visualization convention; clear height is not in evidence.'
  );
}

// showMachineInspector is gone with the machines. Nothing in the scene is a
// monitored device, so nothing can open a device inspector from the floor.

// Every rendered evidence position, as one stable string. A view switch is
// allowed to move the camera and nothing else, so this must compare identical
// before and after -- an assertion a regression test can make directly rather
// than inferring from a screenshot. Fixed precision so the comparison is
// byte-level rather than float-tolerant.
function snapshotCoordinates() {
  const out = [];
  for (const inst of equipmentInstances) {
    // The RECORD's coordinate, not the drawn one: the claim this snapshot
    // defends is that no measured position moved, and the drawn rectangle is
    // offset from it by a published measurement.
    const p = inst.item.position;
    out.push(`${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`);
  }
  for (const m of columnMeshes) {
    out.push(`${m.position.x.toFixed(6)},${m.position.y.toFixed(6)},${m.position.z.toFixed(6)}`);
  }
  return out.join('|');
}

function hideEquipmentInspector() {
  if (inspectorEl) inspectorEl.hidden = true;
  // Clear the hover cache too: the panel is now hidden, so the next hover over
  // the same object must re-render rather than assume it is still displayed.
  lastInspected = null;
  requestLabelUpdate();
}

renderer.domElement.addEventListener('click', (event) => {
  // No machine drill-down from the scene: nothing in the scene IS a machine.
  // A drill-down would have to be reached from a position, and no position on
  // this floor is tied to a device by an authoritative record.
  const item = pickEquipment(event);
  if (item) showEquipmentInspector(item);
  else hideEquipmentInspector();
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

  const item = pickEquipment(null);
  if (item) {
    // 'help' rather than 'pointer': these open an evidence panel, they do not
    // navigate. The cursor must not promise a drill-down that does not exist.
    setCursor('help');
    if (lastInspected !== item) {
      lastInspected = item;
      showEquipmentInspector(item);
      // The selected machine keeps its caption at any zoom, so a change of
      // selection changes the label layer.
      requestLabelUpdate();
    }
    return;
  }
  const col = pickFrom(columnMeshes, 'column');
  if (col) {
    setCursor('help');
    if (lastInspected !== col) {
      lastInspected = col;
      showColumnInspector(col);
      requestLabelUpdate();
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
  const label = row.state_label || 'Undefined';
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
      <button type="button" class="btn-mini" data-history-device="${row.device_id}">History</button>
    </div>`;
}

// ── FT-17: device history (device-level, never attached to a CAD object --
// no CONFIRMED mapping exists yet, see #unmapped-devices' own note) ──
const deviceHistoryEl = document.getElementById('device-history');
const historyDeviceLabelEl = document.getElementById('history-device-label');
const historyMetricEl = document.getElementById('history-metric');
const historySummaryEl = document.getElementById('history-summary');
const historyAlarmsEl = document.getElementById('history-alarms');
let historyDeviceId = null;
let historyRange = '1h';

async function renderDeviceHistory() {
  if (!historyDeviceId) return;
  historyDeviceLabelEl.textContent = historyDeviceId;
  historySummaryEl.textContent = 'Loading…';
  historyAlarmsEl.textContent = '';
  const metric = historyMetricEl.value;
  try {
    const res = await fetch(`api/telemetry-history?device_id=${encodeURIComponent(historyDeviceId)}`
      + `&metric=${encodeURIComponent(metric)}&range=${encodeURIComponent(historyRange)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      historySummaryEl.textContent = `Unavailable: ${body.error || res.status}`;
      return;
    }
    const data = await res.json();
    const s = data.summary;
    const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));
    historySummaryEl.innerHTML = `
      <div>avg <b>${fmt(s.avg)}</b> · min <b>${fmt(s.min)}</b> · max <b>${fmt(s.max)}</b>
        · p95 <b>${fmt(s.p95)}</b> · stddev <b>${fmt(s.stddev)}</b></div>
      <div class="hint">${s.sample_count} sample(s) · ${data.points.length} bucket(s) from ${data.tier}
        · quality ${s.quality}</div>`;
  } catch (err) {
    historySummaryEl.textContent = `Fetch failed: ${err.message}`;
  }

  // Real alarm markers for the same device+window -- never fabricated,
  // and never attached to a physical asset here (device-level only).
  try {
    const spanMs = { '1h': 3600000, '24h': 86400000, '7d': 604800000 }[historyRange] || 3600000;
    const to = Date.now();
    const from = to - spanMs;
    const alarmRes = await fetch(`api/alarm-rca?device_id=${encodeURIComponent(historyDeviceId)}&from=${from}&to=${to}`);
    if (alarmRes.ok) {
      const alarmData = await alarmRes.json();
      historyAlarmsEl.textContent = alarmData.alarms.length
        ? `${alarmData.alarms.length} alarm(s) in this window: `
          + alarmData.alarms.slice(0, 5).map((a) => `${a.alarm_code} (${a.severity})`).join(', ')
        : 'No alarms in this window.';
    }
  } catch (err) {
    console.warn('device-history alarm fetch failed (non-fatal):', err.message);
  }
}

if (machineListEl) {
  machineListEl.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-history-device]');
    if (!btn) return;
    historyDeviceId = btn.getAttribute('data-history-device');
    deviceHistoryEl.hidden = false;
    renderDeviceHistory();
    // FT-21: SPC shares historyDeviceId -- if the panel is already open
    // (an engineer left it expanded), a new device pick must refresh it
    // too, or it would keep showing the PREVIOUS device's stability data
    // under the new device's label elsewhere on screen. spcPanelEl/renderSpc
    // are declared further down this same module scope; safe to reference
    // here because this callback only ever runs on a later click, long
    // after the whole script (including those declarations) has executed.
    if (spcPanelEl && spcPanelEl.open) renderSpc();
  });
}
if (historyMetricEl) historyMetricEl.addEventListener('change', renderDeviceHistory);
const historyRangeButtons = document.querySelectorAll('[data-history-range]');
historyRangeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    historyRange = btn.getAttribute('data-history-range');
    historyRangeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    renderDeviceHistory();
  });
});

// ── FT-21: process stability (Cpk/EWMA/CUSUM/Nelson rules) ────────────
// Shares historyDeviceId with device history above -- one "which device
// am I looking at" state, not two that could disagree. Lazy: only
// fetched while #spc-panel is open, same discipline as #diagnostics.
const spcPanelEl = document.getElementById('spc-panel');
const spcMetricEl = document.getElementById('spc-metric');
const spcResultEl = document.getElementById('spc-result');
const spcRangeButtons = document.querySelectorAll('[data-spc-range]');
let spcMetric = 'PE';
let spcRange = '1h';

const fmt2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2));

// FT-23 Phase 1/2/3/4: renders the server's own decision_summary/action
// fields (lib/predictive.js) into a real visual hierarchy -- PRIMARY
// SIGNAL heaviest, SECONDARY EVIDENCE/CONTEXT/NEXT ACTION progressively
// lighter -- rather than every statistical line reading with equal weight.
// The OCAP next-action text itself now has exactly one source
// (lib/predictive.js's OCAP_NEXT_ACTION); this file no longer keeps its
// own copy.
//
// FT-22: this panel's one fetch moved from /api/spc to /api/predictive (a
// strict superset -- see server.js's fetchSpcSeries()) so opening the panel
// is still exactly one request, not two. Reuses the SAME esc() every other
// innerHTML-writing renderer in this file already uses (defined above,
// near the inspector renderers) -- not a second escaping helper.
async function renderSpc() {
  if (!spcResultEl) return;
  if (!historyDeviceId) { spcResultEl.textContent = "Select a device's History button above."; return; }
  spcResultEl.textContent = 'Loading…';
  try {
    const res = await fetch(`api/predictive?device_id=${encodeURIComponent(historyDeviceId)}&metric=${encodeURIComponent(spcMetric)}&range=${encodeURIComponent(spcRange)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      spcResultEl.textContent = `Unavailable: ${body.error || res.status}`;
      return;
    }
    const data = await res.json();
    const { calculated, observed, forecast, confidence, decision_summary: decision, action, window: win } = data;
    const { mixed_baseline: mixed } = calculated;

    const mixedBanner = mixed.heterogeneity_detected ? `
      <div class="mixed-baseline-banner" role="note">
        <b>MIXED BASELINE SUSPECTED</b>
        <div>Why: ${mixed.evidence.map(esc).join('; ')}</div>
        <div>Affected window: ${new Date(win.from || observed.last_valid_sample).toLocaleString()} &ndash; ${observed.last_valid_sample ? new Date(observed.last_valid_sample).toLocaleTimeString() : '—'}${mixed.change_point_timestamp ? ` (suspected split near ${new Date(mixed.change_point_timestamp).toLocaleTimeString()})` : ''}</div>
        <div>Safe interpretation: ${esc(mixed.safe_interpretation)}</div>
      </div>` : '';

    const alarmsBlock = action.related_alarms && action.related_alarms.length > 0 ? `
      <div class="action-alarms">
        <span class="pi-label">RELATED ALARMS</span>
        ${action.related_alarms.map((a) => `<div>${esc(a.severity || '')} ${esc(a.alarm_code)} -- ${esc(a.alarm_msg || '')} (${a.event_time ? new Date(a.event_time).toLocaleString() : '—'})${a.drill_down_url ? ` <a href="${esc(a.drill_down_url)}" target="_blank" rel="noopener">RCA</a>` : ''}</div>`).join('')}
      </div>` : '';

    spcResultEl.innerHTML = `
      <div class="pi-block pi-observed">
        <span class="pi-label">OBSERVED</span>
        <b>${esc(data.metric)}</b> on <b>${esc(data.device_id)}</b> &middot; ${win.sample_count} sample(s)
        &middot; last: ${observed.last_valid_sample ? new Date(observed.last_valid_sample).toLocaleTimeString() : '—'}
        (${esc(observed.freshness)})${observed.row_limit_hit ? ' &middot; row limit reached' : ''}
      </div>

      <div class="pi-primary">
        <span class="pi-label">${esc(decision.primary_signal.subject)}</span>
        <span class="pi-primary-state">${esc(decision.primary_signal.state)}</span>
        <span class="pi-risk pi-risk-${esc(decision.primary_signal.risk_level)}">${esc(decision.primary_signal.risk_level)} RISK</span>
      </div>

      <div class="pi-block pi-calculated">
        <span class="pi-label">SECONDARY EVIDENCE</span>
        <ul class="pi-evidence-list">${decision.secondary_evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
        <span class="pi-label" style="margin-top:6px">CONTEXT</span>
        <div class="hint">${decision.context.map(esc).join(' &middot; ')} &middot; confidence <b>${esc(confidence.level)}</b> (${confidence.reasons.map(esc).join('; ')})</div>
        ${mixedBanner}
      </div>

      <div class="pi-block pi-forecast">
        <span class="pi-label">FORECAST</span>
        ${forecast.next_window_cpk_estimate === null
          ? `Not available -- ${esc(forecast.reason)}`
          : `Next-window Cpk estimate: <b>${fmt2(forecast.next_window_cpk_estimate)}</b> (${esc(forecast.confidence)} confidence)`}
        <div class="hint">${esc(forecast.method)}</div>
      </div>

      <div class="pi-next-action"><span class="pi-label">NEXT ACTION</span>${esc(decision.next_action)}</div>

      ${action.machine_snapshot_url ? `<div class="action-links"><a href="${esc(action.machine_snapshot_url)}" target="_blank" rel="noopener">Open Machine Snapshot for this event</a> <span class="hint">(${esc(action.exact_event.selection_reason)}, ${new Date(action.exact_event.timestamp).toLocaleString()})</span></div>` : ''}
      ${alarmsBlock}`;
  } catch (err) {
    spcResultEl.textContent = `Fetch failed: ${err.message}`;
  }
}

if (spcMetricEl) spcMetricEl.addEventListener('change', () => { spcMetric = spcMetricEl.value; renderSpc(); if (fleetRiskPanelEl && fleetRiskPanelEl.open) renderFleetRisk(); });
spcRangeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    spcRange = btn.getAttribute('data-spc-range');
    spcRangeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    renderSpc();
    if (fleetRiskPanelEl && fleetRiskPanelEl.open) renderFleetRisk();
  });
});
if (spcPanelEl) {
  spcPanelEl.addEventListener('toggle', () => { if (spcPanelEl.open) renderSpc(); });
}

// FT-22: fleet risk ranking -- composite metrics (PE/JE) only, the only
// ones with a real tolerance column. Its own lazy fetch, independent of
// the per-device panel above: opening #spc-panel never fires this: it
// fires only on its OWN toggle, matching the "closed = no fetch"
// convention one level down.
const fleetRiskPanelEl = document.getElementById('fleet-risk-panel');
const fleetRiskResultEl = document.getElementById('fleet-risk-result');

async function renderFleetRisk() {
  if (!fleetRiskResultEl) return;
  if (!['PE', 'JE'].includes(spcMetric)) {
    fleetRiskResultEl.textContent = `Fleet risk ranking needs PE or JE (has a real tolerance column) -- ${spcMetric} does not.`;
    return;
  }
  fleetRiskResultEl.textContent = 'Loading…';
  try {
    const res = await fetch(`api/predictive/risk-ranking?metric=${encodeURIComponent(spcMetric)}&range=${encodeURIComponent(spcRange)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      fleetRiskResultEl.textContent = `Unavailable: ${body.error || res.status}`;
      return;
    }
    const data = await res.json();
    if (data.rankings.length === 0) {
      fleetRiskResultEl.textContent = `No device reported ${data.metric} in this window.`;
      return;
    }
    fleetRiskResultEl.innerHTML = data.rankings.slice(0, 10).map((r) => `
      <div class="fleet-risk-row">
        <span class="pi-risk pi-risk-${esc(r.risk)}">${esc(r.risk)}</span>
        <b>${esc(r.device_id)}</b> / ${esc(r.metric)} &middot; Cpk ${fmt2(r.cpk)} (${esc(r.cpk_state)}) &middot; ${esc(r.trajectory)}
      </div>`).join('');
  } catch (err) {
    fleetRiskResultEl.textContent = `Fetch failed: ${err.message}`;
  }
}
if (fleetRiskPanelEl) {
  fleetRiskPanelEl.addEventListener('toggle', () => { if (fleetRiskPanelEl.open) renderFleetRisk(); });
}

// FT-23 Phase 5: executive summary -- device-independent, its own lazy
// fetch (opens only on its own toggle or its own range buttons, never on
// the SPC/fleet-risk panels' triggers, and never on the 5-second state
// poll). No fake KPIs: every number here is a count or a top-N slice of
// data already computed by /api/predictive/risk-ranking's own per-device
// math (server.js's runFleetRiskScan), never a separate invented figure.
const execSummaryPanelEl = document.getElementById('exec-summary-panel');
const execSummaryResultEl = document.getElementById('exec-summary-result');
const execSummaryRangeButtons = document.querySelectorAll('[data-exec-range]');
let execSummaryRange = '1h';

async function renderExecSummary() {
  if (!execSummaryResultEl) return;
  execSummaryResultEl.textContent = 'Loading…';
  try {
    const res = await fetch(`api/predictive/executive-summary?range=${encodeURIComponent(execSummaryRange)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      execSummaryResultEl.textContent = `Unavailable: ${body.error || res.status}`;
      return;
    }
    const data = await res.json();
    const { fleet, highest_risks: highestRisks, capability_direction: capDir, major_drift: majorDrift } = data;

    const risksHtml = highestRisks.length === 0
      ? '<div class="hint">No device is currently at elevated risk.</div>'
      : highestRisks.map((r) => `
        <div class="fleet-risk-row">
          <span class="pi-risk pi-risk-${esc(r.risk)}">${esc(r.risk)}</span>
          <b>${esc(r.device_id)}</b> / ${esc(r.metric)} &middot; Cpk ${fmt2(r.cpk)} (${esc(r.cpk_state)}) &middot; ${esc(r.trajectory)}
          <div class="hint">${r.evidence.map(esc).join('; ')}</div>
        </div>`).join('');

    const driftHtml = majorDrift.length === 0
      ? '<div class="hint">No major drift detected in this window.</div>'
      : majorDrift.map((d) => `<div>${esc(d.device_id)} / ${esc(d.metric)}: ${esc(d.direction)} at ${fmt2(Math.abs(d.velocity_per_hour))} units/hour (${esc(d.persistence)})</div>`).join('');

    execSummaryResultEl.innerHTML = `
      <div class="exec-fleet-counts">
        <span class="exec-count pi-risk-HIGH" style="background:transparent;border-color:var(--crit)">HIGH: ${fleet.high_risk_count}</span>
        <span class="exec-count" style="border-color:var(--warn)">MEDIUM: ${fleet.medium_risk_count}</span>
        <span class="exec-count">LOW: ${fleet.low_risk_count}</span>
        <span class="hint">${fleet.devices_scanned} device/metric combination(s) scanned</span>
      </div>
      <span class="exec-section-title">HIGHEST CURRENT PROCESS RISKS</span>
      ${risksHtml}
      <span class="exec-section-title">CAPABILITY DIRECTION</span>
      <div>declining: ${capDir.declining} &middot; improving: ${capDir.improving} &middot; stable: ${capDir.stable} &middot; unknown: ${capDir.unknown}</div>
      <span class="exec-section-title">MAJOR DRIFT</span>
      ${driftHtml}`;
  } catch (err) {
    execSummaryResultEl.textContent = `Fetch failed: ${err.message}`;
  }
}
execSummaryRangeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    execSummaryRange = btn.getAttribute('data-exec-range');
    execSummaryRangeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    renderExecSummary();
  });
});
if (execSummaryPanelEl) {
  execSummaryPanelEl.addEventListener('toggle', () => { if (execSummaryPanelEl.open) renderExecSummary(); });
}

function applyState(payload) {
  // Live state changes machine colours and labels. Ask for the frame that
  // shows them; without this the poll would update the scene graph and nothing
  // would ever draw it.
  requestRender();
  const rows = payload.machines || [];
  lastStateRows = rows;
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
  renderStatusStrip(rows);

  statusLine.textContent = `Last updated ${new Date(payload.queried_at).toLocaleTimeString()}`;
  statusLine.classList.remove('error');
}

const POLL_TIMEOUT_MS = 8000; // FT-20: above POLL_MS with real margin, still far short of a browser default.

async function pollState() {
  try {
    const res = await fetchWithTimeout('api/state', POLL_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    applyState(data);
  } catch (err) {
    // FT-19: the error itself was already deterministic (exact message, not
    // "something went wrong"), and setInterval already retries every 5s
    // without any code change here -- but the retry was silent, so a user
    // reading this had no way to tell "broken" from "about to fix itself".
    // Recovery is confirmed the same way it already was: the next successful
    // poll's applyState() overwrites this text and clears .error.
    //
    // FT-20: AbortError's own message ("signal is aborted without reason" /
    // "The user aborted a request.") names the mechanism, not the fact a
    // real user needs -- restated as a real timeout in real seconds.
    const reason = err.name === 'AbortError' ? `timed out after ${POLL_TIMEOUT_MS / 1000}s` : err.message;
    statusLine.textContent = `State fetch failed: ${reason} -- retrying automatically`;
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
let factoryCounts = { assets: 0, mapped: 0, zones: 0, unresolved: 0 };

function updateFactoryStatus(rows) {
  const el = document.getElementById('factory-status');
  if (!el) return;
  const list = Array.isArray(rows) ? rows : [];
  const down = list.filter((r) => r.machine_state === 'DOWN').length;
  const unmapped = factoryCounts.assets - factoryCounts.mapped;

  const cell = (label, value, tone) =>
    `<div class="fs-cell${tone ? ` fs-${tone}` : ''}">`
    + `<div class="fs-value">${value}</div><div class="fs-label">${label}</div></div>`;

  el.innerHTML =
    cell('process areas', factoryCounts.zones)
    + cell('physical assets', factoryCounts.assets)
    + cell('extents unresolved', factoryCounts.unresolved,
      factoryCounts.unresolved > 0 ? 'warn' : null)
    + cell('mapped to IMS', factoryCounts.mapped, factoryCounts.mapped === 0 ? 'warn' : null)
    + cell('unmapped', unmapped, unmapped > 0 ? 'warn' : null)
    + cell('devices down', down, down > 0 ? 'crit' : null);
}

// -- Status strip -----------------------------------------------------
// The eight plant states, always all eight, always in the same order, with a
// live count against each. Rendered from the shared vocabulary rather than
// written into the HTML, so a state cannot appear here without existing in the
// code that colours the scene, and vice versa.
//
// A state with no backend column is rendered dimmed AND tagged NO SOURCE. That
// is a different and more useful fact than "no machine is in that state right
// now": it tells an operator which lamps this deployment can light at all.
//
// UNMAPPED sits after a separator because it is NOT a ninth state. It is a
// property of the record, and folding it in with the eight would let a
// data-quality problem read as a plant condition.
// FT-18: the status-strip's own "next action" -- opens the SAME drawer the
// #drawer-toggle button controls (mirrors index.html's own inline handler:
// the drawer is a grid track, not an overlay, so opening it narrows the
// stage and the renderer needs the same twin-pane-resize event that
// handler already dispatches), expands the IMS devices section, and
// scrolls it into view. Never filters/hides devices by state -- that
// would be a new feature this audit's own evidence does not yet justify
// (the device list is small, 23 devices, scanning it takes seconds); this
// closes the "glance has no next action" gap without inventing UI.
function openDeviceListFor(stateKey) {
  const app = document.getElementById('app');
  const toggle = document.getElementById('drawer-toggle');
  if (app && !app.classList.contains('drawer-open')) {
    app.classList.add('drawer-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    window.dispatchEvent(new CustomEvent('twin-pane-resize'));
  }
  const details = document.getElementById('unmapped-devices');
  if (details && !details.open) details.open = true;
  // FT-19: was hardcoded 'smooth' regardless of the reduced-motion flag this
  // file already computes for OrbitControls damping (line ~106) -- an
  // inconsistency, not a second decision. Same preference, same answer here.
  if (details) details.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
}

function renderStatusStrip(rows) {
  const strip = document.getElementById('status-strip');
  if (!strip) return;
  const list = Array.isArray(rows) ? rows : [];
  const counts = new Map(STATUS_ORDER.map((k) => [k, 0]));
  for (const row of list) {
    const key = statusForMachineState(row && row.machine_state);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  strip.textContent = '';
  for (const key of STATUS_ORDER) {
    const st = OPERATIONAL_STATUS[key];
    const cell = document.createElement('div');
    cell.className = st.backed ? 'ss-cell' : 'ss-cell ss-off';
    cell.dataset.state = key;
    cell.title = st.meaning;
    // FT-18: this cell looks interactive (title tooltip, hover-styled by
    // CSS) but had no click handler and no keyboard path at all -- a real
    // 3-second-test/accessibility gap (an operator sees "Down 2" and has
    // no next action from it but to manually open the drawer, expand IMS
    // devices, and scroll). Makes the glance itself the entry point.
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', `${st.label}: ${st.backed ? counts.get(key) : 'not tracked'}. ${st.meaning} Activate to view devices.`);
    cell.addEventListener('click', () => openDeviceListFor(key));
    cell.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDeviceListFor(key); }
    });
    const glyph = document.createElement('span');
    glyph.className = 'ss-glyph';
    glyph.style.color = st.color;
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = st.glyph;
    const label = document.createElement('span');
    label.className = 'ss-label';
    label.textContent = st.label;
    const value = document.createElement('span');
    value.className = 'ss-value';
    // An unbacked state shows a dash, never a zero. A zero is a measurement
    // ("none are in PM"); a dash is the truth ("this system cannot tell you").
    value.textContent = st.backed ? String(counts.get(key)) : '–';
    cell.append(glyph, label, value);
    strip.appendChild(cell);
  }
  const sep = document.createElement('div');
  sep.className = 'ss-sep';
  sep.setAttribute('aria-hidden', 'true');
  strip.appendChild(sep);

  const dq = document.createElement('div');
  dq.className = 'ss-cell ss-quality';
  dq.dataset.state = 'UNMAPPED';
  dq.title = DATA_QUALITY.UNMAPPED.meaning;
  dq.tabIndex = 0;
  dq.setAttribute('role', 'button');
  dq.setAttribute('aria-label', `${DATA_QUALITY.UNMAPPED.label}. ${DATA_QUALITY.UNMAPPED.meaning} Activate to view devices.`);
  dq.addEventListener('click', () => openDeviceListFor('UNMAPPED'));
  dq.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDeviceListFor('UNMAPPED'); }
  });
  const dqGlyph = document.createElement('span');
  dqGlyph.className = 'ss-glyph';
  dqGlyph.style.color = DATA_QUALITY.UNMAPPED.color;
  dqGlyph.setAttribute('aria-hidden', 'true');
  dqGlyph.textContent = DATA_QUALITY.UNMAPPED.glyph;
  const dqLabel = document.createElement('span');
  dqLabel.className = 'ss-label';
  dqLabel.textContent = DATA_QUALITY.UNMAPPED.label;
  const dqValue = document.createElement('span');
  dqValue.className = 'ss-value';
  dqValue.textContent = String(Math.max(factoryCounts.assets - factoryCounts.mapped, 0));
  dq.append(dqGlyph, dqLabel, dqValue);
  strip.appendChild(dq);
}

// The drawer's fuller legend: the same eight, with what each one means and
// whether this deployment can derive it.
function renderStatusLegend() {
  const body = document.getElementById('status-legend-body');
  const note = document.getElementById('status-legend-note');
  if (!body) return;
  body.textContent = '';
  const entries = STATUS_ORDER.map((k) => [OPERATIONAL_STATUS[k], true])
    .concat([[DATA_QUALITY.UNMAPPED, false]]);
  for (const [st, isState] of entries) {
    const backed = isState ? st.backed : true;
    const dt = document.createElement('dt');
    if (!backed) dt.className = 'st-off';
    const glyph = document.createElement('span');
    glyph.className = 'st-glyph';
    glyph.style.color = st.color;
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = st.glyph;
    dt.appendChild(glyph);
    dt.appendChild(document.createTextNode(` ${st.label}`));
    if (!backed) {
      const tag = document.createElement('span');
      tag.className = 'st-na';
      tag.textContent = 'NO SOURCE';
      dt.appendChild(tag);
    }
    if (!isState) {
      const tag = document.createElement('span');
      tag.className = 'st-dq';
      tag.textContent = 'DATA QUALITY';
      dt.appendChild(tag);
    }
    const dd = document.createElement('dd');
    if (!backed) dd.className = 'st-off';
    dd.textContent = st.meaning;
    body.appendChild(dt);
    body.appendChild(dd);
  }
  if (note) {
    const missing = STATUS_ORDER.length - BACKED_STATUSES.length;
    note.textContent =
      `${BACKED_STATUSES.length} of the ${STATUS_ORDER.length} machine states are derivable `
      + `from this deployment's own data. ${missing} have no backing column in the schema `
      + 'yet and are listed so the vocabulary is complete, not because they can display. '
      + 'Unmapped is not a machine state: it says the asset has no authoritative link to a '
      + 'device, so no state applies to it at all.';
  }
}

// ── Floor selection ──────────────────────────────────────────
// Floor 1 is the first validated dataset, not a special case in the code. The
// selector is built from the server's catalogue: it lists what is deployed and
// nothing else, so an operator is never offered a floor that would 404, and a
// floor that has not been surveyed simply is not there. No label here is read
// from a private document -- the server computes "Floor N" from the ordinal.
//
// Switching floors reloads the page with the new id in the query string. That
// is deliberate rather than lazy: rebuilding a scene in place means tearing
// down every mesh, cache, instanced buffer and event binding this module owns,
// and a teardown that misses one leaves the previous floor's geometry in the
// scene -- which on a plan of a real building is a silent, invisible error of
// exactly the kind this whole service exists to prevent. A reload cannot leave
// a stale coordinate behind.
let floorCatalogue = [];
let activeFloor = null;

async function setUpFloorSelector() {
  const select = document.getElementById('floor-select');
  const wrap = document.getElementById('floor-picker');
  let requested = null;
  try {
    const params = new URLSearchParams(window.location.search);
    requested = params.get('floor');
  } catch (err) {
    requested = null;
  }

  try {
    const res = await fetch('api/floors');
    if (res.ok) {
      const body = await res.json();
      floorCatalogue = Array.isArray(body.floors) ? body.floors : [];
      // The requested id has to BE one of the catalogue's, not merely look like
      // one, and the value used from here on is the catalogue's own string.
      const hit = floorCatalogue.find((f) => f && f.id === requested);
      activeFloor = hit ? hit.id
        : (typeof body.default === 'string' ? body.default : null);
    }
  } catch (err) {
    console.warn('floor catalogue fetch failed (non-fatal):', err.message);
  }

  if (!select || !wrap) return activeFloor;
  // One deployed floor is not a choice. Showing a selector with a single
  // option implies the others exist somewhere, which is a claim about the
  // building this service has no evidence for.
  if (floorCatalogue.length < 2) {
    wrap.hidden = true;
    return activeFloor;
  }
  wrap.hidden = false;
  select.replaceChildren();
  for (const f of floorCatalogue) {
    if (!f || typeof f.id !== 'string' || typeof f.label !== 'string') continue;
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.label;
    if (f.id === activeFloor) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    const next = floorCatalogue.find((f) => f && f.id === select.value);
    if (!next) return;
    const url = new URL(window.location.href);
    url.searchParams.set('floor', next.id);
    window.location.assign(url.toString());
  });
  return activeFloor;
}

async function boot() {
  const t0 = performance.now();
  // Size the camera and the drawing buffer to the STAGE before anything is
  // framed. The camera is constructed from window.innerWidth/innerHeight, but
  // the stage is shorter than the window by the header and the status strip,
  // and nothing else fires a resize on first paint. Framing against the window
  // aspect and rendering into the stage's cropped the plan off the bottom of
  // its own canvas -- the projection assumed a taller frame than existed.
  onResize();
  renderStatusLegend();
  renderStatusStrip([]);
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
  // WHICH FLOOR. The id comes from the page's own query string so a floor is
  // a bookmarkable address, but it is never trusted: it is looked up in the
  // catalogue the server published, and anything not in that list is dropped
  // and the default floor requested instead. The client therefore cannot ask
  // for a floor the server would refuse, and cannot be steered into building a
  // request path out of a string somebody put in the URL bar.
  const floorId = await setUpFloorSelector();
  const geometryUrl = floorId
    ? `api/floor-geometry?floor=${encodeURIComponent(floorId)}` : 'api/floor-geometry';

  // FT-19: #data-quality's initial markup is "Loading floor evidence…" and,
  // before this fix, the ONLY place that ever changed was inside the `if
  // (geoRes.ok)` branch below -- a failed fetch, a thrown error, or a non-ok
  // status all left it reading "Loading…" forever. A real, confirmed defect:
  // the one fetch that draws the entire floor could fail silently (console
  // only) while the UI kept claiming it was still loading, with no way for a
  // user to tell "slow" from "broken" and no way to retry short of a full
  // page reload. Fixed by giving failure its own deterministic text (what
  // happened) and a real retry action (what the user can do) -- resolves
  // FT-18's own disclosed P2-1 gap for this endpoint specifically.
  function showGeometryLoadError(reasonText) {
    const quality = document.getElementById('data-quality');
    if (!quality) return;
    quality.classList.remove('quality-measured');
    quality.classList.add('quality-error');
    quality.textContent = '';
    const msg = document.createElement('span');
    msg.textContent = `Floor geometry unavailable (${reasonText}). `;
    quality.appendChild(msg);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn-mini';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => {
      retry.disabled = true;
      retry.textContent = 'Retrying…';
      loadFloorGeometry().finally(() => {
        retry.disabled = false;
        retry.textContent = 'Retry';
      });
    });
    quality.appendChild(retry);
  }

  // FT-18: mutually independent -- none of the four boot fetches reads
  // another's response, only the shared geometryUrl string computed above
  // -- so they run concurrently. Each keeps its own try/catch (a Promise.all
  // of promises that never reject), so one failing still never blocks or
  // cancels the others -- identical fault behavior, just concurrent.
  //
  // FT-19: pulled out of the Promise.all IIFE into its own named function so
  // the Retry button above can call the exact same load path a page load
  // does -- not a second, divergent implementation of "load geometry".
  // FT-20: a hung (never resolves, never rejects) geometry fetch is the
  // one failure mode FT-19's own fix could not catch -- showGeometryLoadError
  // only ever ran from a rejection or a resolved-but-not-ok response, so a
  // truly stuck request left #data-quality on "Loading floor evidence..."
  // forever, same symptom as the bug FT-19 fixed, different trigger.
  const GEOMETRY_TIMEOUT_MS = 15000; // one-time, heavier payload than a poll -- real margin.
  async function loadFloorGeometry() {
    try {
      const geoRes = await fetchWithTimeout(geometryUrl, GEOMETRY_TIMEOUT_MS);
      if (!geoRes.ok) {
        showGeometryLoadError(`HTTP ${geoRes.status}`);
        return;
      }
      const geo = await geoRes.json();
      rawApiEquipment = Array.isArray(geo.equipment) ? geo.equipment : [];
      buildFloor(geo);
      applyDisplayMode(activeDisplayMode);
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
    } catch (err) {
      const reason = err.name === 'AbortError' ? `timed out after ${GEOMETRY_TIMEOUT_MS / 1000}s` : err.message;
      console.warn('floor-geometry fetch failed:', reason);
      showGeometryLoadError(reason);
    }
  }
  const geometryFetch = loadFloorGeometry();

  // FT-15: the identity-gated join, fetched once alongside geometry -- the
  // SAME load boundary, not a per-frame or per-pick resolution. Server-
  // resolved truth only: this client never infers eligibility from
  // ims_device_id, coordinates, proximity or zone -- see
  // showEquipmentInspector's use of this object below.
  const overlayFetch = (async () => {
    try {
      const overlayRes = await fetch(geometryUrl.replace('floor-geometry', 'physical-overlay'));
      if (overlayRes.ok) {
        const overlay = await overlayRes.json();
        physicalOverlayByAssetId = overlay && typeof overlay.overlay === 'object' && overlay.overlay
          ? overlay.overlay : {};
      }
    } catch (err) {
      console.warn('physical-overlay fetch failed (non-fatal, all assets stay physical-only):', err.message);
    }
  })();

  // FT-16: RCA-enriched alarm events, same load boundary as the overlay
  // above. Grouped client-side by physical_asset_id -- the server already
  // decided which alarms are eligible (identity gate), this only sorts
  // eligible ones into a lookup an inspector can index by asset id.
  const alarmFetch = (async () => {
    try {
      const alarmRes = await fetch(geometryUrl.replace('floor-geometry', 'alarm-rca'));
      if (alarmRes.ok) {
        const rca = await alarmRes.json();
        const grouped = {};
        for (const alarm of Array.isArray(rca.alarms) ? rca.alarms : []) {
          if (!alarm.physical_overlay_eligible || !alarm.physical_asset_id) continue;
          if (!grouped[alarm.physical_asset_id]) grouped[alarm.physical_asset_id] = [];
          grouped[alarm.physical_asset_id].push(alarm);
        }
        alarmRcaByAssetId = grouped;
      }
    } catch (err) {
      console.warn('alarm-rca fetch failed (non-fatal, no RCA context shown):', err.message);
    }
  })();

  // Build identity. Fetched, never baked in: a constant written into the page
  // would say whatever it said when someone last edited it, which is exactly
  // the failure mode this is here to make visible.
  const buildFetch = (async () => {
    try {
      const buildRes = await fetch('api/build');
      if (buildRes.ok) {
        const build = await buildRes.json();
        const el = document.getElementById('build-id');
        if (el) {
          el.textContent = `build ${build.fingerprint}`;
          el.title = `${build.asset_count} source files, started ${build.started_at}`;
        }
        window.__twinBuild = build;
      }
    } catch (err) {
      console.warn('build fingerprint fetch failed (non-fatal):', err.message);
    }
  })();

  await Promise.all([geometryFetch, overlayFetch, alarmFetch, buildFetch]);

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
    equipmentInstances,
    equipmentBatches,
    // The display-mode contract (FT-07A/B): the canonical projection, the
    // switch that applies it, and the raw fetched evidence it filters --
    // never mutated by the switch, so a regression can diff it before/after.
    getDisplayAssetIds,
    applyDisplayMode,
    getRawApiEquipment: () => rawApiEquipment,
    getDisplayMode: () => activeDisplayMode,
    // FT-15: the exact object the inspector reads from, for a regression to
    // prove it stays {} while 0 mappings are confirmed.
    getPhysicalOverlay: () => physicalOverlayByAssetId,
    // FT-16: the exact grouped object the inspector's RCA rows read from.
    getAlarmRCA: () => alarmRcaByAssetId,
    // FT-17: real, callable, testable -- the same fetch renderDeviceHistory
    // uses, exposed directly so a regression can drive it without a real
    // mouse click.
    fetchTelemetryHistory: (deviceId, metric, range) => fetch(
      `api/telemetry-history?device_id=${encodeURIComponent(deviceId)}`
      + `&metric=${encodeURIComponent(metric)}&range=${encodeURIComponent(range)}`,
    ).then((r) => r.json()),
    // A point projected through the live camera. Equipment instances are
    // placement records rather than Object3Ds, so a caller with no THREE in
    // scope still needs one honest way to ask where one lands on screen.
    projectPoint: (x, y, z) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return { x: v.x, y: v.y, z: v.z };
    },
    // The pick itself, exposed so a benchmark can time the instanced raycast
    // without the DOM work that follows it. Same function the click path uses:
    // a measurement of picking, not of a re-implementation of it.
    pickEquipment,
    columnMeshes,
    layers,
    applyView,
    getView: () => activeView,
    getFloor: () => activeFloor,
    getFloorCatalogue: () => floorCatalogue.slice(),
    getBuildingView: () => buildingView,
    // Cache sizes are exposed so a regression test can assert the sharing
    // actually happened rather than trusting that it did.
    resourceStats,
    // Read back by the regression: the caption layer is a presentation overlay
    // and must be provable to be one -- it draws no geometry and moves nothing.
    labelStats: () => ({
      shown: labelsShown,
      pooled: labelPool.length,
      minPx: LABEL_MIN_PX,
      max: LABEL_MAX,
    }),
    updateMachineLabels,
    // Zone captions are WebGL sprites, not DOM nodes, so a regression cannot
    // read their screen rect with getBoundingClientRect() the way it reads a
    // machine label's. This exposes the same projection the collision-
    // rejection pass itself uses, as plain DOMRect-shaped objects, so a test
    // can assert "no machine label overlaps a visible zone caption" against
    // the real render, not a re-implementation of the math.
    zoneLabelRects: () => {
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      return visibleZoneLabelRects(w, h).map((r) => ({
        left: r.x - r.halfW, right: r.x + r.halfW, top: r.y - r.halfH, bottom: r.y + r.halfH,
      }));
    },
    measuredOutlineCount: () => measuredOutlineCount,
    footprintMeshes,
    wallMeshes,
    wallLineMeshes,
    openingMeshes,
    // Counts a reconciliation test reads back, so "the renderer drew what the
    // CAD said" is an assertion rather than an inference from a screenshot.
    equipmentCensus: () => ({ ...equipmentCensus }),
    getStructuralGrid: () => structuralGridLines,
    setLayerVisible,
    sublayers,
    // The raw CAD reference, exposed so a regression can assert that the
    // overlay actually loads and lands where the model does -- the comparison
    // is the entire point of the layer, and a screenshot cannot make it.
    ensureRawCad,
    rawCadState: () => rawCadState,
    rawCadStats: () => ({
      segments: rawCadSegments,
      roles: [...cadRoleGroups.keys()].sort(),
      coverage: rawCadCoverage,
    }),
    cadToTwin,
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

// publishHudWidth and the MODE_VIEW table are GONE.
//
// Both existed to service a floating overlay: one measured how far the panel
// reached across the canvas so the framing could dodge it, the other decided
// which camera each board mode should jump to. The chrome docks now -- header,
// status strip and drawer are grid tracks -- so nothing covers the floor and
// there is nothing to dodge. Views are chosen explicitly by the operator.

// Opening or closing the inspection drawer changes the scene pane's width
// without changing the window's, so the window resize listener never fires for
// it. This refits the camera for the new pane. It moves the camera and nothing
// else -- the coordinate snapshot check keeps that honest.
//
// OBSERVE THE ELEMENT, DO NOT GUESS WHEN IT CHANGED. This was previously a
// listener on the drawer's own event that measured inside one
// requestAnimationFrame. One frame is not enough: the class had been toggled
// but the grid had not reflowed, so getBoundingClientRect still returned the
// old width and the canvas kept its full-width drawing buffer. The canvas then
// overflowed its 1,580 px track by the drawer's 340 px and painted straight
// over the drawer -- every control in it, layer toggles included, sat under a
// canvas and could not be clicked at all. A ResizeObserver fires when the
// element has actually changed size, which is the condition that matters and
// the only one that cannot be off by a frame.
if (typeof ResizeObserver === 'function') {
  let first = true;
  const paneObserver = new ResizeObserver(() => {
    // The first callback is the initial observation, and boot has already
    // sized and framed the scene. Re-framing here would fight it.
    if (first) { first = false; return; }
    onResize();
    applyView(activeView);
  });
  paneObserver.observe(container);
} else {
  // Fallback for a browser with no ResizeObserver: two frames rather than one,
  // so the measurement happens after the grid has reflowed.
  window.addEventListener('twin-pane-resize', () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      onResize();
      applyView(activeView);
    }));
  });
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

// ── Machine labels ────────────────────────────────────────────────────
//
// An HTML OVERLAY, deliberately not geometry in the scene. Three reasons, and
// the first is the one that matters: a label drawn in the scene is a thing on
// the floor, and an operator reading a floor plan should never have to work out
// whether a rectangle is a machine or a caption. The other two are that text
// meshes cost geometry per glyph, and that the overlay cannot intercept a
// click -- picking still goes to the canvas underneath.
//
// LEVEL OF DETAIL, not a global switch. A label appears only when the machine
// it names is large enough on screen to hold one, and the number of labels is
// capped: 344 captions at full-floor zoom is not information, it is a grey
// band across the plan. Nothing about the machine changes with zoom -- world
// dimensions are untouched. Only whether its name is legible does.
const labelHost = document.getElementById('machine-labels');
/** Below this on-screen width, in pixels, a machine is too small to caption. */
const LABEL_MIN_PX = 46;

// Content-aware chip-width estimate for collision rejection.
//
// A first pass estimated width as a character count times one guessed glyph
// width, calibrated by eye against one screenshot. It under-rejected: the
// `--mono` custom property `.machine-label` (index.html) asks for is never
// actually defined anywhere, so the resolved font is whatever this browser's
// generic `monospace` falls back to, which is not the same face -- or the
// same glyph width -- on every platform this renders on. A guessed constant
// tuned against one rendering environment is exactly the kind of estimate
// that quietly stops matching reality somewhere else.
//
// This measures instead of guessing: an offscreen, never-attached canvas 2D
// context has its font set to the label's own COMPUTED font (read once from
// a live pooled label element and cached, never per candidate) and calls
// measureText() on the exact string that will be rendered. That is
// deterministic in the sense the brief asks for -- the same text always
// measures the same width -- while also being correct for whatever font the
// browser actually resolved, not a guess about which one that would be.
// measureText() touches no layout and reflows nothing; it is not the
// getBoundingClientRect() read the brief says to avoid.
//
// CHROME_PX covers everything in a chip that is not the measured text: the
// status dot (6px) plus its 4px right margin, the chip's 4px+4px horizontal
// padding, and its 1px+1px border -- read directly off the same CSS rule
// (index.html, #machine-labels .machine-label / .dot) rather than
// re-measured, since border/padding/margin are declared constants, not
// rendered text. A small safety margin is added on top: over-estimating a
// chip's width costs a little floor space between captions; under-estimating
// is the defect this exists to fix. Height is not content-dependent -- a
// chip is always exactly one line -- so it stays a constant.
const LABEL_CHIP_CHROME_PX = 20; // dot(6)+margin(4)+padding(4+4)+border(1+1)
const LABEL_CHIP_SAFETY_PX = 4;
const LABEL_CHIP_HEIGHT_PX = 20;

const labelMeasureCanvas = document.createElement('canvas');
const labelMeasureCtx = labelMeasureCanvas.getContext('2d');
let cachedLabelFont = null;

/** The `.machine-label` chip's actual computed font, read once and cached. */
function labelFont() {
  if (cachedLabelFont) return cachedLabelFont;
  const probe = labelElement(0); // pooled, hidden by default -- not a throwaway node
  const cs = getComputedStyle(probe);
  cachedLabelFont = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return cachedLabelFont;
}

/** Half-width, in CSS pixels, of the chip this exact text will render as. */
function chipHalfWidth(idText, dimsText) {
  labelMeasureCtx.font = labelFont();
  const textPx = labelMeasureCtx.measureText(idText + dimsText).width;
  return (LABEL_CHIP_CHROME_PX + LABEL_CHIP_SAFETY_PX + textPx) / 2;
}

/** And above this one it is close enough to carry its measured size as well. */
const LABEL_DETAIL_PX = 190;
/** Hard cap. Whatever the zoom, the plan does not become a wall of text. */
const LABEL_MAX = 40;

const labelPool = [];
const labelVec = new THREE.Vector3();
let labelsPending = false;

function labelElement(i) {
  if (labelPool[i]) return labelPool[i];
  const el = document.createElement('div');
  el.className = 'machine-label';
  el.hidden = true;
  labelHost?.appendChild(el);
  labelPool[i] = el;
  return el;
}

/**
 * Projects every drawn machine, keeps the ones big enough to caption, and
 * writes at most LABEL_MAX of them, largest first.
 *
 * Reads the scene; writes only DOM. No mesh, no material and no served value is
 * touched, so labelling cannot move, resize or restyle a machine.
 */
/**
 * Screen-space rectangles of the zone captions currently visible (major
 * zones always, minor zones only in inspection mode -- see
 * setMinorZoneLabels). Read from the sprites' own world transform, the same
 * way a machine's screen position is read: a project() and a pixels-per-metre
 * scale, never a DOM measurement. There are at most a few dozen zone labels,
 * so this is cheap to recompute every call rather than cached and invalidated.
 */
function visibleZoneLabelRects(width, height) {
  const rects = [];
  for (const sprite of zoneLabels) {
    if (!sprite.visible) continue;
    labelVec.set(sprite.position.x, sprite.position.y, sprite.position.z).project(camera);
    if (labelVec.z < -1 || labelVec.z > 1) continue;
    const x = (labelVec.x * 0.5 + 0.5) * width;
    const y = (-labelVec.y * 0.5 + 0.5) * height;
    // A generous off-screen margin, not an exact bound: a caption straddling
    // the edge should still block a machine label from landing under its
    // visible half.
    if (x < -200 || y < -200 || x > width + 200 || y > height + 200) continue;
    const scale = worldToPixels(sprite.position, width);
    rects.push({ x, y, halfW: (sprite.scale.x * scale) / 2, halfH: (sprite.scale.y * scale) / 2 });
  }
  return rects;
}

function updateMachineLabels() {
  labelsPending = false;
  if (!labelHost) return;
  const host = renderer.domElement;
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!width || !height) return;
  const visible = layers.operational.visible && sublayers.equipment.visible;

  const candidates = [];
  if (visible) {
    for (const inst of equipmentInstances) {
      const item = inst.item;
      if (!item || !item.id) continue;
      const fp = item.footprint;
      // The machine in the inspector is the one the operator asked about, so it
      // keeps its caption at any zoom -- that is the "unless selected" in the
      // level-of-detail rule, and the only thing that overrides the size gate.
      const selected = item === lastInspected;
      // An unresolved machine has no size to be legible at: it is a marker, and
      // captioning every marker is exactly the clutter this avoids.
      if (!selected && (!fp || !finite(fp.width) || !finite(fp.depth))) continue;
      labelVec.set(inst.x, inst.y, inst.z).project(camera);
      if (labelVec.z < -1 || labelVec.z > 1) continue;
      const x = (labelVec.x * 0.5 + 0.5) * width;
      const y = (-labelVec.y * 0.5 + 0.5) * height;
      if (x < 0 || y < 0 || x > width || y > height) continue;
      // On-screen size, from the machine's own measured extent: the smaller
      // side, so a long thin machine is not captioned on its length alone.
      const scale = worldToPixels(inst, width);
      const px = fp && finite(fp.width) && finite(fp.depth)
        ? Math.min(fp.width, fp.depth) * scale : 0;
      if (!selected && px < LABEL_MIN_PX) continue;
      // The dims suffix and the collision footprint it will occupy are decided
      // HERE, once, from the same condition the render loop used to re-derive
      // on its own -- so what is measured for collision is exactly what gets
      // drawn, never an estimate of a different chip than the one that ships.
      const showDims = (selected || px >= LABEL_DETAIL_PX) && fp;
      const dimsText = showDims ? ` ${fp.width} × ${fp.depth} m` : '';
      const halfW = chipHalfWidth(item.id, dimsText);
      candidates.push({ item, x, y, px, selected, dimsText, halfW });
    }
    // Selected first, then largest on screen: the caption an operator went
    // looking for cannot be pushed out of the budget by the floor around it.
    candidates.sort((a, b) => (b.selected === a.selected ? b.px - a.px : (b.selected ? 1 : -1)));
  }

  // Screen-space collision rejection. The size gate above bounds HOW MANY
  // machines are large enough to caption; it says nothing about whether two
  // of them sit close enough on screen that their chips print on top of each
  // other. In this floor's densest zones several similarly-sized machines
  // stand shoulder to shoulder, and without this a "40 shown" budget was
  // spent on a stack of overlapping, unreadable text rather than 40 readable
  // captions.
  //
  // The gap required between two candidates is each chip's OWN estimated
  // half-width, not a shared guess -- a short id next to a long id-plus-
  // dimensions chip needs an asymmetric gap, and a fixed constant here is
  // exactly what under-rejected at 4K and at high zoom, where more chips
  // cross into carrying the dimensions suffix at once. Zone captions are
  // read into the same obstacle list, so a machine label cannot land on top
  // of an already-visible zone name either. The selected machine is exempt
  // from both, same as the size gate: the one an operator is looking at is
  // never the one dropped for standing next to another label.
  const zoneRects = visibleZoneLabelRects(width, height);
  const accepted = [];
  const kept = [];
  for (const c of candidates) {
    if (kept.length >= LABEL_MAX) break;
    const clearOfLabels = accepted.every(
      (a) => Math.abs(a.x - c.x) >= (a.halfW + c.halfW) || Math.abs(a.y - c.y) >= LABEL_CHIP_HEIGHT_PX
    );
    const clearOfZones = zoneRects.every(
      (z) => Math.abs(z.x - c.x) >= (z.halfW + c.halfW) || Math.abs(z.y - c.y) >= (z.halfH + LABEL_CHIP_HEIGHT_PX / 2)
    );
    if (!c.selected && !(clearOfLabels && clearOfZones)) continue;
    accepted.push(c);
    kept.push(c);
  }

  const shown = kept.length;
  for (let i = 0; i < shown; i += 1) {
    const c = kept[i];
    const el = labelElement(i);
    const mapped = Boolean(c.item.ims_device_id);
    const dims = c.dimsText ? `<span class="dim">${c.dimsText.trim()}</span>` : '';
    // The id is a model identifier (EQP-F1-nnnn), not a CAD block or layer
    // name, and never a vendor's. textContent is not used because of the two
    // spans; both are built here, neither carries served free text.
    el.innerHTML = `<span class="dot"></span>${escapeHtml(c.item.id)}${dims}`;
    el.classList.toggle('is-mapped', mapped);
    el.style.left = `${Math.round(c.x)}px`;
    el.style.top = `${Math.round(c.y)}px`;
    el.hidden = false;
  }
  for (let i = shown; i < labelPool.length; i += 1) labelPool[i].hidden = true;
  labelsShown = shown;
}

/** Pixels per world metre at a given point, from the projection itself. */
const labelA = new THREE.Vector3();
const labelB = new THREE.Vector3();
function worldToPixels(position, width) {
  labelA.set(position.x, position.y, position.z).project(camera);
  labelB.set(position.x + 1, position.y, position.z).project(camera);
  return Math.abs(labelB.x - labelA.x) * 0.5 * width;
}

/** Escapes the four characters that could turn an id into markup. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let labelsShown = 0;

/** Coalesced to one update per frame, whatever asks for it. */
function requestLabelUpdate() {
  if (labelsPending) return;
  labelsPending = true;
  requestAnimationFrame(updateMachineLabels);
}

function animate() {
  requestAnimationFrame(animate);
  // controls.update() returns true while damping is still moving the camera.
  // Trusting only the 'change' event would stop the loop mid-glide.
  if (controls.update()) requestRender();
  if (renderTail <= 0) return;
  renderTail--;
  framesRendered++;
  renderer.render(scene, camera);
  // Labels follow the camera, so they are refreshed with the frame rather than
  // on a timer: a timer either lags the view or burns frames when nothing moved.
  requestLabelUpdate();
}
animate();
