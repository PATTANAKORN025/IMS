// The Floor 1 EAP operational map.
//
// One canvas, one coherent Factory Twin. The real floor plan -- envelope,
// walls, columns -- is the spatial foundation, drawn from /api/floor-geometry.
// The 40 DIRECT cells stand on it at their own measured position. The other
// 170 cells have no world position and none is invented for them: each of the
// 12 process zones instead carries a world-space region -- the zone is placed
// on the floor, the individual machines inside a SET_LEVEL or LAYOUT_ONLY zone
// are not -- and clicking that region opens a zone drawer, a small schematic
// inset showing that zone's cells in the reference layout's own frame, marked
// as spatially unresolved rather than pretended onto the real floor.
//
// Three frame modes read the same model:
//   WORLD  -- only what is grounded in FLOOR1_WORLD_M: floor, zone regions, the
//             40 DIRECT footprints. No schematic content, ever.
//   EAP    -- only EAP_LAYOUT_FRAME: the full reference-layout drawing, all 210
//             cells, unresolved ones marked. The census view.
//   AUTO   -- the WORLD map, plus the zone drawer on demand. Default.
// 2D and 3D read one footprint per cell; 3D only swaps the camera and adds an
// extrusion height, never a second geometry.
//
// Cells are instanced -- one batch for the floor's columns, one for whichever
// cell set is on screen, one for zone-card fills, one for confidence markers.
// Walls, boundary and zone borders are line geometry built once per rebuild.
// Nothing is rebuilt per frame.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OPERATIONAL_STATUS, STATUS_ORDER, DATA_QUALITY } from './operational-status.js';

// Relative, not absolute: the page is served at "/" directly but also behind
// the reverse proxy at "/factory-twin-3d/", which strips its own prefix
// before forwarding. An absolute "/api/..." path resolves against the site
// origin and misses that prefix entirely; a relative path resolves against
// the current document's own URL and reaches the right host either way --
// the same convention app.js already uses for exactly this reason.
const ENDPOINT = 'api/eap-map';
const FLOOR_ENDPOINT = 'api/floor-geometry';

/* Presentation constants. Height is one of them: no authoritative CAD height
   exists for any cell, so the 3D view picks a viewing height and the payload
   says PRESENTATION_ONLY. It is never published as a measurement. */
const CELL_HEIGHT_3D = 2.4;
const CELL_HEIGHT_2D = 0.02;
const MARKER_SIZE = 0.5;

const C = {
  bg: 0x0f1216,
  ground: 0x1a2029,
  wall: 0x6b83a8,
  boundary: 0x93add6,
  column: 0x2c3644,
  world: 0xc7dbf5,           // a DIRECT cell: bright, because it is real
  layout: 0x8b96a8,          // a schematic cell
  layoutUnassigned: 0x5b6472,
  marker: 0xe0ac63,
  hover: 0xffffff,
  selected: 0x63a4ff,
  zoneFillSet: 0x3a6ea8,
  zoneFillLayout: 0x8a6a3a,
  zoneBorderSet: 0x6fa0d8,
  zoneBorderLayout: 0xd8a657,
  zoneBorderDirect: 0x9fb8dd,
  zoneLabel: '#a9c4e8',
  cellLabel: '#0d1116',
  schemaCellLabel: '#0d1116',
};

const stage = document.getElementById('stage');
const labelCanvas = document.getElementById('labels');
const labelCtx = labelCanvas.getContext('2d');
const headline = document.getElementById('headline');
const inspector = document.getElementById('inspector');
const countsTable = document.getElementById('counts');
const frameNote = document.getElementById('frame-note');
const modeNote = document.getElementById('mode-note');
const drawer = document.getElementById('zoneDrawer');
const drawerTitle = document.getElementById('zoneDrawerTitle');
const drawerBody = document.getElementById('zoneDrawerBody');
const drawerCanvas = document.getElementById('zoneDrawerCanvas');
const drawerCtx = drawerCanvas.getContext('2d');
const drawerClose = document.getElementById('zoneDrawerClose');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(C.bg, 1);
stage.insertBefore(renderer.domElement, labelCanvas);

// FT-EAP-CTXLIFECYCLE: this canvas has its own WebGL context, separate from
// the physical twin's (own renderer, own GPU resources). FT-EAP-CTXLOSS gave
// it the same detect-and-reload fix app.js's FT-19 already had; this phase
// replaces the reload with a full in-app recovery lifecycle (READY -> LOST
// -> RESTORING -> REBUILDING -> RECOVERED, falling back to FAILED), on the
// strength of a fact FT-EAP-CTXLOSS's own reload decision under-weighted:
// this page keeps the ENTIRE application state that matters (payload,
// cellRecords, zoneRecords, mode, view, selected, selectedZone, and the
// camera objects cam2d/cam3d themselves) as plain JS values that a GPU
// context loss never touches -- only the uploaded GPU buffers and compiled
// programs are invalidated, never a JS heap object. Calling build() again
// after a restore is not a hand-patched partial reconstruction: it is the
// exact, already-tested code path every mode/view switch already takes,
// recreating every GPU resource uniformly from the still-intact payload --
// so nothing is "silently missing" the way an ad-hoc incremental patch-up
// risked. See attemptContextRecovery() below for the real mechanics.
renderer.domElement.addEventListener('webglcontextlost', (ev) => {
  ev.preventDefault();
  handleContextLost();
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  attemptContextRecovery();
});
document.getElementById('webgl-reload')?.addEventListener('click', () => window.location.reload());
document.getElementById('webgl-retry')?.addEventListener('click', () => {
  // The one real action available to a page whose browser did not restore
  // the context on its own: ask it to. A genuinely dead GPU process will not
  // answer this either, which is why Reload stays visible right beside it.
  renderer.forceContextRestore();
});

const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 0.5);
key.position.set(-40, 90, 40);
scene.add(key);

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cellMaterial = new THREE.MeshLambertMaterial();
const markerMaterial = new THREE.MeshBasicMaterial({ color: C.marker });
const columnMaterial = new THREE.MeshLambertMaterial({ color: C.column });
const zoneCardMaterial = new THREE.MeshBasicMaterial({
  transparent: true, opacity: 0.22, depthWrite: false,
});

let payload = null;
let floor = null;
let mode = 'AUTO';          // AUTO | WORLD | EAP
let view = '2d';            // 2d | 3d

// FT-EAP-CTXLIFECYCLE: READY -> LOST -> RESTORING -> REBUILDING -> RECOVERED
// (which is immediately followed by a return to READY -- it is a one-frame
// transition, not a state anything waits in) -- or, when the browser never
// answers a restore request, LOST -> FAILED. See attemptContextRecovery().
const WebglLifecycle = Object.freeze({
  READY: 'READY', LOST: 'LOST', RESTORING: 'RESTORING',
  REBUILDING: 'REBUILDING', RECOVERED: 'RECOVERED', FAILED: 'FAILED',
});
let webglLifecycle = WebglLifecycle.READY;
let contextLossCount = 0; // observability only; also what a repeated-loss test reads back
// Real browsers usually fire webglcontextrestored automatically within a
// second or two of preventDefault() being called, if the underlying driver
// issue actually resolved. If it does not fire within this window, the
// context is not coming back on its own, and staying in LOST forever with
// no further sign of life is a worse user experience than naming that.
const CONTEXT_RESTORE_TIMEOUT_MS = 8000;
let contextRestoreTimer = null;

let cam2d = null;
let cam3d = null;
let controls = null;
let extent = { w: 180, d: 130 };
let rect = { x: 0, y: 0, w: 0, h: 0 };
// FT-24.6: real measured hotspot -- drawLabels() redrew up to ~210 static
// text labels on a full-canvas 2D context EVERY frame (60/s), even at
// complete idle with no camera motion (OrbitControls damping was never
// enabled here, so nothing was actually moving). Real profiling: p95
// 37.9ms idle, all 4 viewports -- over the 25ms target, entirely this one
// call. Labels only need to be redrawn when something that affects their
// screen position or content actually changes: camera pan/zoom, a
// resize, a mode/view switch, or a fresh model load -- never on an
// unchanged frame. Starts true so the first real frame always draws.
let labelsDirty = true;

let cellMesh = null;
let cellRecords = [];       // parallel to cellMesh instances
let markerMesh = null;
let zoneMesh = null;
let zoneRecords = [];       // parallel to zoneMesh instances, map mode only

let hovered = null;         // a cell record
let hoveredZone = null;     // a zone record
let selected = null;
let selectedZone = null;
let openZone = null;        // the zone currently shown in the drawer

const dummy = new THREE.Object3D();
const colour = new THREE.Color();

function activeCam() {
  return view === '3d' ? cam3d : cam2d;
}

function isMapMode() {
  return mode === 'AUTO' || mode === 'WORLD';
}

function directCellsOf(zoneId) {
  if (!payload) return 0;
  let n = 0;
  for (const c of payload.cells) {
    if (c.zone_id === zoneId && c.spatial_evidence === 'DIRECT') n += 1;
  }
  return n;
}

// FT-EAP-CTXLIFECYCLE: set for the one build() call attemptContextRecovery()
// makes, never otherwise. Real bug found and fixed by testing the recovery
// path for real (not by reasoning about it): a restored context is a
// genuinely NEW underlying WebGLRenderingContext, not the old one repaired
// in place, so the old geometries' GPU buffers are already gone with it --
// deleting them again here (this codebase's own, correct habit for a normal
// rebuild, where the context is still the live one) threw
// "INVALID_OPERATION: object does not belong to this context" for every
// disposed geometry, ~14 times per recovery. Disposal is for freeing a
// STILL-LIVE context's memory; there is nothing left to free on a context
// that is already gone, so it is skipped, exactly once, on this path only.
let recoveringFromContextLoss = false;

function clearScene() {
  for (let i = scene.children.length - 1; i >= 0; i -= 1) {
    const o = scene.children[i];
    if (o.isLight) continue;
    scene.remove(o);
    if (recoveringFromContextLoss) continue; // nothing to delete -- the context that owned it is gone
    if (o.geometry && o.geometry !== unitBox) o.geometry.dispose();
    if (o.material
      && ![cellMaterial, markerMaterial, columnMaterial, zoneCardMaterial].includes(o.material)) {
      o.material.dispose();
    }
  }
}

function rectPoints(out, x, z, w, d, y, deg = 0) {
  const hx = w / 2;
  const hz = d / 2;
  const r = THREE.MathUtils.degToRad(deg);
  const cs = Math.cos(r);
  const sn = Math.sin(r);
  const corner = (sx, sz) => [
    x + sx * hx * cs - sz * hz * sn, y, z + sx * hx * sn + sz * hz * cs,
  ];
  const four = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  for (let i = 0; i < 4; i += 1) out.push(...four[i], ...four[(i + 1) % 4]);
}

function lineObject(points, color, opacity = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const o = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    color, transparent: opacity < 1, opacity,
  }));
  o.frustumCulled = false;
  return o;
}

function dashedLineObject(points, color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const o = new THREE.LineSegments(g, new THREE.LineDashedMaterial({
    color, dashSize: 0.6, gapSize: 0.35,
  }));
  o.computeLineDistances();
  o.frustumCulled = false;
  return o;
}

function groundMesh(vertices) {
  const shape = new THREE.Shape(vertices.map((v) => new THREE.Vector2(v.x, -v.z)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: C.ground });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -0.02;
  m.frustumCulled = false;
  return m;
}

/* ------------------------------------------------------------------ build -- */

/* WORLD/AUTO: the real floor, the 12 zone regions, and the 40 DIRECT cells. No
   schematic content is drawn here -- that is what the zone drawer is for. */
function buildMap() {
  clearScene();
  cellRecords = [];
  zoneRecords = [];
  const height = view === '3d' ? CELL_HEIGHT_3D : CELL_HEIGHT_2D;

  if (floor) {
    const poly = floor.footprint_polygon && floor.footprint_polygon.vertices;
    if (poly && poly.length > 2) scene.add(groundMesh(poly));

    const pts = [];
    for (const w of floor.wall_lines || []) pts.push(w.x1, 0.002, w.z1, w.x2, 0.002, w.z2);
    if (pts.length) scene.add(lineObject(pts, C.wall, 1));

    if (poly && poly.length > 2) {
      const edge = [];
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        edge.push(a.x, 0.01, a.z, b.x, 0.01, b.z);
      }
      scene.add(lineObject(edge, C.boundary, 1));
    }

    /* Columns are outlines in 2D and boxes only in 3D. Flat on a plan they read
       the same either way, and 202 solid boxes cost 2 400 triangles and a draw
       call for a picture that a rectangle already conveys. */
    const cols = floor.columns || [];
    if (cols.length && view === '3d') {
      const cm = new THREE.InstancedMesh(unitBox, columnMaterial, cols.length);
      cm.frustumCulled = false;
      cols.forEach((col, i) => {
        dummy.position.set(col.position.x, height / 2, col.position.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(col.footprint.width, height * 0.9, col.footprint.depth);
        dummy.updateMatrix();
        cm.setMatrixAt(i, dummy.matrix);
      });
      cm.instanceMatrix.needsUpdate = true;
      scene.add(cm);
    } else if (cols.length) {
      const colPts = [];
      for (const col of cols) {
        rectPoints(colPts, col.position.x, col.position.z,
          col.footprint.width, col.footprint.depth, 0.006);
      }
      scene.add(lineObject(colPts, C.column, 0.9));
    }
    if (floor.envelope) extent = { w: floor.envelope.width, d: floor.envelope.depth };
  }

  /* Zone regions: a filled card plus a border, never a machine position. A zone
     that holds DIRECT cells (only B, today) gets a quiet border with no fill --
     the real footprints inside it are the content. Every other zone gets a
     translucent card so a viewer can see, and click, a process area that has no
     individually placed machine. LAYOUT_ONLY gets a dashed, dimmer border: its
     extent is real geometry, but the name-to-zone link is weak. */
  const solidBorderPts = [];
  const cardFillPts = [];
  const cardColours = [];
  const dashedZones = [];
  for (const z of payload.zones) {
    const r = z.cad_world_region;
    if (!r) continue;
    const direct = directCellsOf(z.zone_id);
    const unresolved = z.cells - direct;
    const record = { zone: z, region: r, direct, unresolved };
    zoneRecords.push(record);
    if (r.spatial_evidence === 'LAYOUT_ONLY') {
      const pts = [];
      rectPoints(pts, r.x, r.z, r.width + 1.5, r.depth + 1.5, 0.02);
      dashedZones.push(pts);
      cardFillPts.push({ r, colour: C.zoneFillLayout });
    } else if (direct > 0) {
      rectPoints(solidBorderPts, r.x, r.z, r.width + 1.5, r.depth + 1.5, 0.02);
    } else {
      rectPoints(solidBorderPts, r.x, r.z, r.width + 1.5, r.depth + 1.5, 0.02);
      cardFillPts.push({ r, colour: C.zoneFillSet });
    }
  }
  if (solidBorderPts.length) scene.add(lineObject(solidBorderPts, C.zoneBorderSet, 0.85));
  for (const pts of dashedZones) scene.add(dashedLineObject(pts, C.zoneBorderLayout));

  if (cardFillPts.length) {
    const zm = new THREE.InstancedMesh(unitBox, zoneCardMaterial, cardFillPts.length);
    zm.frustumCulled = false;
    cardFillPts.forEach((card, i) => {
      dummy.position.set(card.r.x, 0.008, card.r.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(card.r.width + 1.5, 0.01, card.r.depth + 1.5);
      dummy.updateMatrix();
      zm.setMatrixAt(i, dummy.matrix);
      zm.setColorAt(i, colour.setHex(card.colour));
    });
    zm.instanceMatrix.needsUpdate = true;
    if (zm.instanceColor) zm.instanceColor.needsUpdate = true;
    scene.add(zm);
  }

  /* The raycast target for zone selection is every registered zone, filled or
     not -- clicking zone B's quiet border should focus it exactly like
     clicking a filled card. */
  const pickable = zoneRecords.filter((rec) => rec.region);
  zoneMesh = new THREE.InstancedMesh(unitBox, new THREE.MeshBasicMaterial({ visible: false }),
    Math.max(pickable.length, 1));
  zoneMesh.count = pickable.length;
  zoneMesh.frustumCulled = false;
  pickable.forEach((rec, i) => {
    dummy.position.set(rec.region.x, 0.4, rec.region.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(rec.region.width + 1.5, 0.8, rec.region.depth + 1.5);
    dummy.updateMatrix();
    zoneMesh.setMatrixAt(i, dummy.matrix);
  });
  zoneMesh.instanceMatrix.needsUpdate = true;
  zoneRecords = pickable;
  scene.add(zoneMesh);

  const cells = payload.cells.filter((c) => c.spatial_frame === 'FLOOR1_WORLD_M'
    && c.world_footprint);
  cellMesh = new THREE.InstancedMesh(unitBox, cellMaterial, Math.max(cells.length, 1));
  cellMesh.count = cells.length;
  cellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cellMesh.frustumCulled = false;
  cells.forEach((cell, i) => {
    const f = cell.world_footprint;
    dummy.position.set(f.x, height / 2 + 0.03, f.z);
    dummy.rotation.set(0, THREE.MathUtils.degToRad(f.rotation_deg), 0);
    dummy.scale.set(f.width, height, f.depth);
    dummy.updateMatrix();
    cellMesh.setMatrixAt(i, dummy.matrix);
    cellMesh.setColorAt(i, colour.setHex(C.world));
    cellRecords.push(cell);
  });
  cellMesh.instanceMatrix.needsUpdate = true;
  if (cellMesh.instanceColor) cellMesh.instanceColor.needsUpdate = true;
  scene.add(cellMesh);
  markerMesh = null;
}

/* EAP: the full reference-layout drawing. All 210 cells, at the reference
   footprint, with a confidence marker on every cell whose position here is
   what places it -- which, in this mode, is all of them but the 40. */
function buildSchema() {
  clearScene();
  cellRecords = [];
  zoneRecords = [];
  const height = view === '3d' ? CELL_HEIGHT_3D : CELL_HEIGHT_2D;

  const zonePts = [];
  for (const z of payload.zones) {
    rectPoints(zonePts, z.extent.x, z.extent.z, z.extent.width + 1.2,
      z.extent.depth + 1.2, 0.005);
  }
  if (payload.frame && payload.frame.extent.width) {
    rectPoints(zonePts, 0, 0, payload.frame.extent.width, payload.frame.extent.depth, 0.004);
    extent = { w: payload.frame.extent.width, d: payload.frame.extent.depth };
  }
  if (zonePts.length) scene.add(lineObject(zonePts, C.zoneBorderSet, 0.55));

  const cells = payload.cells.filter((c) => c.footprint);
  cellMesh = new THREE.InstancedMesh(unitBox, cellMaterial, Math.max(cells.length, 1));
  cellMesh.count = cells.length;
  cellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cellMesh.frustumCulled = false;
  const marked = cells.filter((c) => c.spatial_evidence !== 'DIRECT' || c.unit_state === 'UNASSIGNED');
  markerMesh = new THREE.InstancedMesh(unitBox, markerMaterial, Math.max(marked.length, 1));
  markerMesh.count = marked.length;
  markerMesh.frustumCulled = false;
  let m = 0;
  cells.forEach((cell, i) => {
    const f = cell.footprint;
    dummy.position.set(f.x, height / 2, f.z);
    dummy.rotation.set(0, THREE.MathUtils.degToRad(-f.rotation_deg), 0);
    dummy.scale.set(f.width, height, f.depth);
    dummy.updateMatrix();
    cellMesh.setMatrixAt(i, dummy.matrix);
    const hex = cell.unit_state === 'UNASSIGNED' ? C.layoutUnassigned : C.layout;
    cellMesh.setColorAt(i, colour.setHex(hex));
    cellRecords.push(cell);
    if (cell.spatial_evidence !== 'DIRECT' || cell.unit_state === 'UNASSIGNED') {
      const size = Math.min(MARKER_SIZE, f.width * 0.4, f.depth * 0.4);
      dummy.position.set(f.x - f.width / 2 + size, height + size / 2, f.z - f.depth / 2 + size);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      markerMesh.setMatrixAt(m, dummy.matrix);
      m += 1;
    }
  });
  cellMesh.instanceMatrix.needsUpdate = true;
  if (cellMesh.instanceColor) cellMesh.instanceColor.needsUpdate = true;
  markerMesh.instanceMatrix.needsUpdate = true;
  scene.add(cellMesh);
  scene.add(markerMesh);
  zoneMesh = null;
}

/**
 * SIMULATED machine status -- client-side only, never touches /api/state,
 * TimescaleDB, Node-RED or any production telemetry, and never written
 * anywhere. This floor has 0 confirmed IMS mappings today, so a real status
 * board would be entirely UNMAPPED; the simulation exists so this view reads
 * as a working operational twin while that mapping work is separate,
 * ongoing, real-CAD-first work -- it is a stand-in for status, never for
 * identity or mapping, both of which stay exactly as honestly reported
 * everywhere else on this page (mapping_state, IMS mapping, CAD identity).
 *
 * Deterministic, not random: the same cell always simulates the same state
 * across a reload, from a plain string hash of its own cell_id, through the
 * SAME eight-state vocabulary (operational-status.js) the physical twin's
 * legend already uses -- reused, not reinvented, per that module's own
 * "EXACTLY EIGHT machine states" rule. Only applied to a cell actually
 * attached to a machine unit (unit_state === 'ATTACHED'); a cell attached to
 * no machine has no machine state to simulate one for.
 */
const SIM_STATES = STATUS_ORDER.filter((k) => k !== 'OFF'); // a floor mid-shift is not powered down
let simulationOn = true;

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * FT-EAP-STATE: the one canonical operational-state record every caller on
 * this page reads, instead of each re-deriving its own notion of "what
 * state is this cell in". It carries exactly the fields a real integration
 * would need later (object_id, state, state_source, observed_at, quality,
 * reason) -- geometry, position and identity stay on `cell` and are never
 * duplicated here, so this record is state, and only state.
 *
 * There is one real source on this page, and it is not a machine: it is a
 * deterministic hash of the cell's own id (see the module comment above).
 * `state_source` says exactly that -- 'SIMULATED', never 'IMS' or 'LDI' --
 * because no authoritative mapping exists to source a real one from
 * (eap-map.js's own wire payload: status UNKNOWN on every cell, reason "no
 * authoritative IMS mapping exists"). Nothing here upgrades that.
 *
 * `quality` is never 'OK': nothing on this page is a real observation, so
 * nothing earns the quality label a real one would. Three quality values,
 * each a distinct, disclosed reason a cell has no *state* to show --
 * deliberately never collapsed into OFF, which is a real plant state this
 * simulation could assign and chooses not to (SIM_STATES excludes it):
 *
 *   SIMULATED   a state was generated -- the only case `state` is non-null.
 *   NO_DATA     cell has no machine unit attached; there is nothing to
 *               simulate a state FOR, not merely one that came back empty.
 *   UNAVAILABLE simulation is turned off; the source itself is not running,
 *               which is not the same fact as the source running and
 *               finding nothing.
 *
 * `observed_at` is always null. The simulation has no clock -- it is a
 * pure function of cell_id, not a sampled reading -- so there is no real
 * observation time to report, and stamping one on would misrepresent a
 * static function call as telemetry.
 */
function resolveOperationalState(cell) {
  const objectId = cell ? cell.cell_id : null;
  if (!simulationOn) {
    return {
      object_id: objectId, state: null, state_source: 'NONE',
      observed_at: null, quality: 'UNAVAILABLE', reason: 'simulation disabled',
    };
  }
  if (!cell || cell.unit_state !== 'ATTACHED') {
    return {
      object_id: objectId, state: null, state_source: 'NONE',
      observed_at: null, quality: 'NO_DATA',
      reason: 'cell not attached to a machine unit',
    };
  }
  const state = SIM_STATES[hashString(cell.cell_id) % SIM_STATES.length];
  return {
    object_id: objectId, state, state_source: 'SIMULATED',
    observed_at: null, quality: 'SIMULATED',
    reason: 'deterministic per-cell simulation, not live telemetry',
  };
}

/** Back-compat convenience: the key into OPERATIONAL_STATUS, or null. Every
 *  real caller goes through resolveOperationalState(); this just unwraps it
 *  for the two call sites (paintStates' colour write, the legacy inspector
 *  string) that only ever wanted the key. */
function simulatedStateFor(cell) {
  return resolveOperationalState(cell).state;
}

/**
 * FT-EAP-STATE Phase 4: per-zone and factory-wide state distribution, always
 * reconciled to a total. `NO_DATA` and `UNAVAILABLE` are counted alongside
 * the seven machine states, never folded into one of them and never
 * dropped, so `total` always equals the exact cell count handed in -- a
 * silent mismatch here would mean a cell was counted twice or not at all.
 */
function stateBreakdownOf(cells) {
  const counts = new Map();
  for (const key of [...STATUS_ORDER, 'NO_DATA', 'UNAVAILABLE']) counts.set(key, 0);
  let total = 0;
  for (const cell of cells) {
    const rec = resolveOperationalState(cell);
    const key = rec.state || rec.quality; // a real state, or the quality that stood in for one
    counts.set(key, (counts.get(key) || 0) + 1);
    total += 1;
  }
  const reconciled = [...counts.values()].reduce((a, b) => a + b, 0) === total;
  if (!reconciled) {
    // Should be unreachable -- every cell maps to exactly one bucket above --
    // so this is a real internal-consistency alarm, not routine logging.
    console.warn('EAP state breakdown did not reconcile: total', total, 'summed',
      [...counts.values()].reduce((a, b) => a + b, 0));
  }
  return { total, counts, reconciled };
}

function factoryStateBreakdown() {
  return stateBreakdownOf(payload ? payload.cells : []);
}

function zoneStateBreakdown(zoneId) {
  return stateBreakdownOf(payload ? payload.cells.filter((c) => c.zone_id === zoneId) : []);
}

function build() {
  if (isMapMode()) buildMap(); else buildSchema();
  paintStates();
  renderStateBreakdown();
}

/* Hover and selection are colour writes into the existing instance buffers. No
   geometry is added, so pointing at a machine costs one buffer upload. */
function paintStates() {
  if (!cellMesh) return;
  cellRecords.forEach((cell, i) => {
    let hex;
    if (isMapMode()) hex = C.world;
    else hex = cell.unit_state === 'UNASSIGNED' ? C.layoutUnassigned : C.layout;
    const simKey = simulatedStateFor(cell);
    if (simKey) hex = OPERATIONAL_STATUS[simKey].hex;
    if (selected && cell.cell_id === selected.cell_id) hex = C.selected;
    else if (hovered && cell.cell_id === hovered.cell_id) hex = C.hover;
    cellMesh.setColorAt(i, colour.setHex(hex));
  });
  if (cellMesh.instanceColor) cellMesh.instanceColor.needsUpdate = true;
}

/* ----------------------------------------------------------------- camera -- */

function stageAspect() {
  return Math.max(stage.clientWidth / Math.max(stage.clientHeight, 1), 0.2);
}

function makeCameras() {
  const aspect = stageAspect();
  const half = (Math.max(extent.d, extent.w / aspect) / 2) * 1.06;
  cam2d = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 4000);
  cam2d.position.set(0, 400, 0.001);
  cam2d.lookAt(0, 0, 0);
  cam3d = new THREE.PerspectiveCamera(40, aspect, 0.5, 6000);
  cam3d.position.set(0, extent.w * 0.55, extent.d * 0.9);
  cam3d.lookAt(0, 0, 0);
}

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  // Covers every real caller: a genuine window resize, and rebuild()
  // (mode switch, view switch, initial load) which always ends by calling
  // this -- one injection point, not three separate ones to keep in sync.
  labelsDirty = true;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setSize(w, h, false);
  labelCanvas.width = Math.round(w * ratio);
  labelCanvas.height = Math.round(h * ratio);
  labelCanvas.style.width = `${w}px`;
  labelCanvas.style.height = `${h}px`;
  rect = { x: 0, y: 0, w, h };
  if (!cam2d) return;
  const aspect = stageAspect();
  const half = (Math.max(extent.d, extent.w / aspect) / 2) * 1.06;
  cam2d.left = -half * aspect;
  cam2d.right = half * aspect;
  cam2d.top = half;
  cam2d.bottom = -half;
  cam2d.updateProjectionMatrix();
  cam3d.aspect = aspect;
  cam3d.updateProjectionMatrix();
}

function attachControls() {
  if (controls) controls.dispose();
  controls = new OrbitControls(activeCam(), renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableRotate = view === '3d';
  controls.screenSpacePanning = view !== '3d';
  // Labels are screen-space text keyed to the camera's current projection
  // -- OrbitControls' own 'change' event fires on every real pan/zoom/
  // rotate, which is exactly (and only) when their positions can differ.
  controls.addEventListener('change', () => { labelsDirty = true; });
  controls.update();
}

/* Frame the camera on a world-space rectangle -- a zone region or a cell
   footprint -- rather than the whole floor. Used by zone focus and machine
   focus; never distorts, only reframes the same orthographic projection. */
function focusOn(cx, cz, w, d) {
  const aspect = stageAspect();
  const margin = 1.8;
  const half = Math.max(Math.max(d, w / aspect) / 2 * margin, 1.5);
  if (view === '2d') {
    cam2d.left = cx - half * aspect;
    cam2d.right = cx + half * aspect;
    cam2d.top = cz + half;
    cam2d.bottom = cz - half;
    cam2d.position.set(cx, 400, cz + 0.001);
    cam2d.lookAt(cx, 0, cz);
    cam2d.updateProjectionMatrix();
  } else {
    cam3d.position.set(cx, half * 1.6, cz + half * 1.6);
    cam3d.lookAt(cx, 0, cz);
  }
  if (controls) {
    controls.target.set(cx, 0, cz);
    controls.update();
  }
}

function resetCamera() {
  makeCameras();
  attachControls();
  resize();
}

/* ------------------------------------------------------- webgl lifecycle -- */

const webglStatusText = document.getElementById('webgl-status-text');
const webglLostBanner = document.getElementById('webgl-lost');
const webglRetryBtn = document.getElementById('webgl-retry');

function setWebglLifecycle(next) {
  webglLifecycle = next;
  // console, not the aria-live banner, for the two transient internal
  // stages -- RESTORING/REBUILDING are real but typically sub-second, and
  // flooding a screen reader with two announcements a recovery apart is
  // worse than one clear one. LOST and FAILED are the two states a viewer
  // actually needs to be told about, and each writes its own banner text
  // where it happens below, not here.
  console.log('[eap] webgl lifecycle ->', next);
}

/** Runs on webglcontextlost. Not `if (controls) controls.enabled = false;`
 *  alone: the render loop itself must stop drawing, not merely stop taking
 *  input, and OrbitControls is disabled here (dragging when the visible
 *  frame is frozen would be actively misleading) but a fresh restore always
 *  re-enables it -- see attemptContextRecovery(). */
function handleContextLost() {
  contextLossCount += 1;
  setWebglLifecycle(WebglLifecycle.LOST);
  if (controls) controls.enabled = false;
  hovered = null;
  hoveredZone = null;
  if (webglStatusText) {
    webglStatusText.textContent = '3D rendering lost the GPU context. This can happen '
      + 'after the computer sleeps, a graphics driver reset, or memory pressure. '
      + 'Attempting automatic recovery. The panel on the left is unaffected -- '
      + 'population, legend and any current selection stay available.';
  }
  if (webglRetryBtn) webglRetryBtn.hidden = true; // nothing to retry yet -- still waiting on the browser
  if (webglLostBanner) webglLostBanner.hidden = false;
  clearTimeout(contextRestoreTimer);
  contextRestoreTimer = setTimeout(() => {
    // The browser never fired webglcontextrestored on its own. Escalate to
    // the fallback Phase 5 asks for, rather than sitting in LOST silently.
    if (webglLifecycle === WebglLifecycle.LOST) showFailedFallback();
  }, CONTEXT_RESTORE_TIMEOUT_MS);
}

/**
 * Runs on webglcontextrestored. The browser has already re-created the
 * underlying GL context by the time this fires; what is stale is only the
 * GPU-side buffers/programs three.js uploaded into the OLD one. Everything
 * this function preserves across the swap (camera framing, pan target,
 * zoom, selection, zone drawer) was never actually lost -- it lives in a
 * plain JS variable that a GPU event cannot touch -- so "preservation" here
 * mostly means "do not call the one function (makeCameras) that would
 * overwrite it with a fresh default," not reconstructing anything from a
 * snapshot.
 */
function attemptContextRecovery() {
  clearTimeout(contextRestoreTimer);
  setWebglLifecycle(WebglLifecycle.RESTORING);
  try {
    // attachControls() below builds a brand new OrbitControls bound to the
    // SAME still-valid camera object; it always resets .target to the
    // origin as part of that construction (see its own comment), so the
    // real pan position has to be carried across that one line by hand.
    const savedTarget = controls ? controls.target.clone() : null;
    const savedZoom2d = cam2d ? cam2d.zoom : null;
    const savedZoom3d = cam3d ? cam3d.zoom : null;

    setWebglLifecycle(WebglLifecycle.REBUILDING);
    // Recreates every GPU resource (instanced meshes, line geometry,
    // materials) from cellRecords/zoneRecords, which were never cleared --
    // the exact path a mode/view switch already exercises and every EAP
    // regression suite already covers, not a new, less-tested one.
    recoveringFromContextLoss = true;
    try {
      build();
    } finally {
      recoveringFromContextLoss = false;
    }
    attachControls();
    if (savedTarget) controls.target.copy(savedTarget);
    // resize() below recomputes cam2d's left/right/top/bottom from the
    // stage size and the floor extent, but never touches .zoom on either
    // camera -- that is OrbitControls' own dolly state, untouched by
    // context loss, so it is restored here explicitly rather than trusting
    // resize() to leave it alone by accident.
    if (savedZoom2d !== null) cam2d.zoom = savedZoom2d;
    if (savedZoom3d !== null) cam3d.zoom = savedZoom3d;
    cam2d.updateProjectionMatrix();
    cam3d.updateProjectionMatrix();
    controls.enabled = true;
    controls.update();
    resize();

    // Phase 2/4: selection is a reference into the cellRecords/zoneRecords
    // array build() just replaced with fresh objects carrying the same
    // ids -- re-resolved by id rather than left pointing at the old,
    // now-orphaned array so nothing downstream holds a stale reference.
    if (selected) selected = cellRecords.find((c) => c.cell_id === selected.cell_id) || null;
    if (selectedZone) {
      selectedZone = zoneRecords.find((z) => z.zone.zone_id === selectedZone.zone.zone_id) || null;
    }
    renderInspector();

    if (webglLostBanner) webglLostBanner.hidden = true;
    setWebglLifecycle(WebglLifecycle.RECOVERED);
    setWebglLifecycle(WebglLifecycle.READY);
  } catch (err) {
    // Phase 6, "recovery failure": whatever went wrong, the honest response
    // is the same fallback a browser that never restores at all gets, not a
    // silently half-working 3D view.
    console.error('[eap] context recovery failed', err);
    showFailedFallback();
  }
}

function showFailedFallback() {
  setWebglLifecycle(WebglLifecycle.FAILED);
  if (webglStatusText) {
    webglStatusText.textContent = '3D view temporarily unavailable. Live operational '
      + 'data remains available in the panel on the left.';
  }
  if (webglRetryBtn) webglRetryBtn.hidden = false;
  if (webglLostBanner) webglLostBanner.hidden = false;
}

/* ------------------------------------------------------------------ zone drawer -- */

function closeDrawer() {
  openZone = null;
  drawer.hidden = true;
}

/* The schematic inset: a plain 2D canvas, not a second WebGL context, showing
   one zone's cells in EAP_LAYOUT_FRAME cropped to that zone's own extent. This
   is the "spatially unresolved" representation -- it never claims a CAD
   position, and it is drawn only for the zone a viewer asked about, not as a
   second permanent viewport. */
function drawZoneDrawer(zone) {
  const cells = payload.cells.filter((c) => c.zone_id === zone.zone_id && c.footprint);
  const pad = 1.4;
  const bw = zone.extent.width + pad * 2;
  const bd = zone.extent.depth + pad * 2;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const cw = drawerCanvas.clientWidth || 320;
  const ch = drawerCanvas.clientHeight || 200;
  drawerCanvas.width = Math.round(cw * ratio);
  drawerCanvas.height = Math.round(ch * ratio);
  const scale = Math.min(drawerCanvas.width / bw, drawerCanvas.height / bd);
  const ox = drawerCanvas.width / 2 - zone.extent.x * scale;
  const oy = drawerCanvas.height / 2 - zone.extent.z * scale;

  drawerCtx.clearRect(0, 0, drawerCanvas.width, drawerCanvas.height);
  drawerCtx.fillStyle = '#12161d';
  drawerCtx.fillRect(0, 0, drawerCanvas.width, drawerCanvas.height);

  for (const cell of cells) {
    const f = cell.footprint;
    const x = ox + f.x * scale;
    const y = oy + f.z * scale;
    const w = Math.max(f.width * scale, 2);
    const d = Math.max(f.depth * scale, 2);
    drawerCtx.save();
    drawerCtx.translate(x, y);
    drawerCtx.rotate(THREE.MathUtils.degToRad(-f.rotation_deg));
    drawerCtx.fillStyle = cell.unit_state === 'UNASSIGNED' ? '#5b6472' : '#8b96a8';
    if (cell.spatial_evidence === 'DIRECT') drawerCtx.fillStyle = '#c7dbf5';
    drawerCtx.fillRect(-w / 2, -d / 2, w, d);
    drawerCtx.restore();
    if (cell.spatial_evidence !== 'DIRECT') {
      drawerCtx.fillStyle = '#e0ac63';
      drawerCtx.beginPath();
      drawerCtx.arc(x - w / 2 + 3 * ratio, y - d / 2 + 3 * ratio, 2 * ratio, 0, Math.PI * 2);
      drawerCtx.fill();
    }
  }
}

function openDrawer(record) {
  openZone = record;
  drawer.hidden = false;
  const r = record.region;
  const evText = r.spatial_evidence === 'LAYOUT_ONLY'
    ? 'position-only, LOW confidence -- the extent is measured, the name-to-zone link is not'
    : 'set-level: the zone is placed in the drawing, no individual machine inside it is';
  drawerTitle.textContent = `${record.zone.zone_id} · ${record.zone.caption}`;
  drawerBody.innerHTML = `<p class="note">Spatially unresolved &mdash; ${record.unresolved} of `
    + `${record.zone.cells} cells here have no CAD-backed position. Shown in the reference `
    + `layout's own schematic frame, not on the real floor. ${evText}.</p>`;
  drawZoneDrawer(record.zone);
}

/* ----------------------------------------------------------------- labels -- */

const labelVec = new THREE.Vector3();

function projectPoint(x, y, z) {
  labelVec.set(x, y, z).project(activeCam());
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  return {
    x: (labelVec.x * 0.5 + 0.5) * rect.w * ratio,
    y: (-labelVec.y * 0.5 + 0.5) * rect.h * ratio,
    visible: labelVec.z < 1,
  };
}

function drawLabels() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  if (!payload || !cam2d) return;
  labelCtx.textAlign = 'center';
  labelCtx.textBaseline = 'middle';

  if (isMapMode()) {
    labelCtx.font = `600 ${11 * ratio}px ui-sans-serif, system-ui, sans-serif`;
    labelCtx.fillStyle = C.zoneLabel;
    for (const rec of zoneRecords) {
      const r = rec.region;
      const p = projectPoint(r.x, 0, r.z - r.depth / 2 - 1.6);
      if (!p.visible) continue;
      const tag = rec.direct > 0
        ? `${rec.zone.zone_id} · ${rec.zone.caption.toUpperCase()} · `
          + `${rec.direct} on floor, ${rec.unresolved} unresolved`
        : `${rec.zone.zone_id} · ${rec.zone.caption.toUpperCase()} · `
          + `${rec.unresolved} unresolved`;
      labelCtx.fillText(tag, p.x, p.y);
    }
    labelCtx.font = `${9.5 * ratio}px ui-sans-serif, system-ui, sans-serif`;
    labelCtx.fillStyle = C.cellLabel;
    for (const cell of cellRecords) {
      const f = cell.world_footprint;
      const a = projectPoint(f.x - f.width / 2, 0, f.z);
      const b = projectPoint(f.x + f.width / 2, 0, f.z);
      if (!a.visible || !b.visible || Math.abs(b.x - a.x) < 22 * ratio) continue;
      const label = cell.reference_label || '';
      if (!label || label.startsWith('UNREADABLE')) continue;
      const short = label.includes('/') ? label.split('/').pop() : label;
      const p = projectPoint(f.x, 0, f.z);
      labelCtx.fillText(short, p.x, p.y);
    }
  } else {
    labelCtx.font = `600 ${10.5 * ratio}px ui-sans-serif, system-ui, sans-serif`;
    labelCtx.fillStyle = C.zoneLabel;
    for (const z of payload.zones) {
      const p = projectPoint(z.extent.x, 0, z.extent.z + z.extent.depth / 2 + 2.4);
      if (p.visible) labelCtx.fillText(z.caption.toUpperCase(), p.x, p.y);
    }
    labelCtx.font = `${9.5 * ratio}px ui-sans-serif, system-ui, sans-serif`;
    labelCtx.fillStyle = C.schemaCellLabel;
    for (const cell of cellRecords) {
      const f = cell.footprint;
      const a = projectPoint(f.x - f.width / 2, 0, f.z);
      const b = projectPoint(f.x + f.width / 2, 0, f.z);
      if (!a.visible || !b.visible || Math.abs(b.x - a.x) < 22 * ratio) continue;
      const label = cell.reference_label || '';
      if (!label || label.startsWith('UNREADABLE')) continue;
      const short = label.includes('/') ? label.split('/').pop() : label;
      const p = projectPoint(f.x, 0, f.z);
      labelCtx.fillText(short, p.x, p.y);
    }
  }
}

/* ---------------------------------------------------------------- picking -- */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setPointer(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
}

function pickCellAt(clientX, clientY) {
  if (!cellMesh || !cellMesh.count) return null;
  setPointer(clientX, clientY);
  raycaster.setFromCamera(pointer, activeCam());
  const hits = raycaster.intersectObject(cellMesh, false);
  const first = hits.find((h) => Number.isInteger(h.instanceId));
  return first ? (cellRecords[first.instanceId] || null) : null;
}

function pickZoneAt(clientX, clientY) {
  if (!zoneMesh || !zoneMesh.count) return null;
  setPointer(clientX, clientY);
  raycaster.setFromCamera(pointer, activeCam());
  const hits = raycaster.intersectObject(zoneMesh, false);
  const first = hits.find((h) => Number.isInteger(h.instanceId));
  return first ? (zoneRecords[first.instanceId] || null) : null;
}

/* -------------------------------------------------------------- inspector -- */

function row(label, value) {
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

function badge(cell) {
  const cls = cell.spatial_evidence === 'DIRECT' ? 'ok'
    : (cell.spatial_evidence === 'LAYOUT_ONLY' ? 'warn' : 'mid');
  return `<span class="badge ${cls}">${cell.spatial_evidence}</span>`;
}

function renderCellInspector(cell) {
  const unit = payload.machine_units.find((u) => u.unit_id === cell.machine_unit_id);
  const ev = cell.cad_evidence;
  const f = cell.world_footprint || cell.footprint;
  const parts = [
    row('Cell', `${cell.cell_id} ${badge(cell)}`),
    row('Reference label', cell.reference_label && !cell.reference_label.startsWith('UNREADABLE')
      ? cell.reference_label : 'not legible in the reference'),
    row('Unit', unit
      ? `${unit.unit_id} &mdash; ${unit.reference_label} `
        + `(${unit.aggregation_type === 'AGGREGATED_STATION'
          ? `station of ${unit.cell_ids.length} cells` : 'single cell'})`
      : 'none &mdash; drawn but not attached'),
    row('Zone', `${cell.zone_id} &mdash; ${cell.zone_caption}`),
    row('Process', cell.process),
    row('Mapping state', `${cell.mapping_state} &middot; unit ${cell.unit_state}`),
    row('Evidence', `${cell.spatial_evidence} (${cell.registration_method})`),
    row('Spatial frame', cell.spatial_frame === 'FLOOR1_WORLD_M'
      ? 'FLOOR1_WORLD_M &mdash; drawn on the real floor plan'
      : 'EAP_LAYOUT_FRAME &mdash; drawn in the reference schematic'),
    row('CAD identity', ev.has_cad_instance
      ? `one named instance (${ev.relation})`
      : `not established &mdash; a zone set of ${ev.cad_candidates_in_zone} candidates `
        + `in ${ev.cad_zone_ids.join(', ') || 'no zone'}`),
    row('CAD world position', cell.has_cad_world_position
      ? 'Established' : '<strong>Not established</strong>'),
    row('Operational footprint', `${f.width.toFixed(2)} &times; ${f.depth.toFixed(2)} `
      + `in ${f.frame}`),
    row('IMS mapping', unit ? unit.ims_mapping_state : 'NOT_MAPPED'),
    row('Live status', `${cell.status} &mdash; `
      + `${cell.live_status_eligible ? 'eligible' : 'not eligible'}`),
    row('Simulated status', (() => {
      // FT-EAP-STATE: reads the one canonical resolver, not a re-derived
      // string. Real bug fixed here -- the previous text described
      // simulation-off as "OFF (simulation disabled)", which named the real
      // OFF plant state for a cell that was never assigned it, exactly the
      // NO_DATA/UNAVAILABLE-vs-OFF conflation this contract exists to
      // prevent. UNAVAILABLE and NO_DATA are now named as themselves.
      const rec = resolveOperationalState(cell);
      if (rec.quality === 'UNAVAILABLE') return `UNAVAILABLE &mdash; ${rec.reason}`;
      if (rec.quality === 'NO_DATA') return `NO_DATA &mdash; ${rec.reason}`;
      const s = OPERATIONAL_STATUS[rec.state];
      return `${s.glyph} ${s.label} <span class="note" style="display:inline">`
        + `(state_source = ${rec.state_source}, quality = ${rec.quality})</span>`;
    })()),
  ];
  const notes = [];
  if (cell.spatial_evidence === 'DIRECT') {
    notes.push('<p class="note">Bound to one CAD instance, so this cell is drawn on the '
      + 'real floor plan at that instance&rsquo;s own measured position.</p>');
  } else if (cell.spatial_evidence === 'SET_LEVEL') {
    notes.push('<p class="note">Set-level evidence: the zone holding this cell is placed '
      + 'on the real floor, but nothing places this individual machine, so it is drawn in '
      + 'the reference schematic. Open the zone to see it there.</p>');
  } else {
    notes.push('<p class="note warn">Layout only: no CAD correspondence was established '
      + 'for this cell at any level, so the reference layout is all that places it.</p>');
  }
  notes.push(`<p class="note">Live status is not eligible for this cell: `
    + `${cell.live_status_blocked_by}.</p>`);
  const canFocus = Boolean(cell.world_footprint) && isMapMode();
  const focusBtn = canFocus
    ? '<button id="focusBtn" type="button">Focus this machine</button>' : '';
  inspector.innerHTML = `<dl>${parts.join('')}</dl>${notes.join('')}${focusBtn}`;
  if (canFocus) {
    document.getElementById('focusBtn').addEventListener('click', () => {
      focusOn(f.x, f.z, Math.max(f.width, 4), Math.max(f.depth, 4));
    });
  }
}

function renderZoneInspector(rec) {
  const r = rec.region;
  const parts = [
    row('Zone', `${rec.zone.zone_id} &mdash; ${rec.zone.caption}`),
    row('Process', rec.zone.process),
    row('Cells', String(rec.zone.cells)),
    row('On the real floor (DIRECT)', String(rec.direct)),
    row('Spatially unresolved', String(rec.unresolved)),
    row('Region evidence', `${r.spatial_evidence} &middot; link confidence ${r.link_confidence}`),
    row('CAD candidates behind it', String(r.cad_candidates)),
  ];
  const notes = [`<p class="note">${r.derivation}.</p>`];
  const drawerBtn = rec.unresolved > 0
    ? '<button id="drawerBtn" type="button">Open zone drawer</button>' : '';
  // FT-EAP-STATE Phase 4: this zone's own simulated-state distribution,
  // reconciled to its own cell count -- the same resolver and the same
  // reconciliation check as the factory-wide table, just filtered to this
  // zone's cells, so the two can never silently disagree on a cell.
  const { total: zTotal, counts: zCounts } = zoneStateBreakdown(rec.zone.zone_id);
  const zRows = [...STATUS_ORDER, 'NO_DATA', 'UNAVAILABLE']
    .map((key) => [key, zCounts.get(key) || 0])
    .filter(([, n]) => n > 0)
    .map(([key, n]) => {
      const meta = OPERATIONAL_STATUS[key] || SIM_QUALITY_DISPLAY[key];
      return row(`${meta.glyph} ${meta.label}`, String(n));
    }).join('');
  const stateTable = `<p class="note">Simulated state in this zone `
    + `(${zTotal} of ${rec.zone.cells}):</p><dl>${zRows}</dl>`;
  inspector.innerHTML = `<dl>${parts.join('')}</dl>${notes.join('')}${stateTable}`
    + `<button id="zoneFocusBtn" type="button">Focus this zone</button> ${drawerBtn}`;
  document.getElementById('zoneFocusBtn').addEventListener('click', () => {
    focusOn(r.x, r.z, Math.max(r.width, 6), Math.max(r.depth, 6));
  });
  if (rec.unresolved > 0) {
    document.getElementById('drawerBtn').addEventListener('click', () => openDrawer(rec));
  }
}

function renderInspector() {
  if (selected) { renderCellInspector(selected); return; }
  if (selectedZone) { renderZoneInspector(selectedZone); return; }
  inspector.innerHTML = '<p class="note">Click a cell or a zone.</p>';
}

function renderCounts() {
  const c = payload.counts;
  const rows = [
    ['EAP cells', c.cells_with_a_footprint],
    ['&nbsp;&nbsp;on the real floor', c.cells_in_world_frame],
    ['&nbsp;&nbsp;in reference layout only', c.cells_in_layout_frame],
    ['Machine units', c.machine_units],
    ['&nbsp;&nbsp;aggregated stations', c.aggregated_station_units],
    ['Spatial DIRECT', c.spatial_evidence.DIRECT || 0],
    ['Spatial STRUCTURAL', c.spatial_evidence.STRUCTURAL || 0],
    ['Spatial SET_LEVEL', c.spatial_evidence.SET_LEVEL || 0],
    ['Spatial LAYOUT_ONLY', c.spatial_evidence.LAYOUT_ONLY || 0],
    ['Live status eligible', c.cells_live_status_eligible],
  ];
  countsTable.innerHTML = rows
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
}

/** Display metadata for the two quality buckets that are not a machine state
 *  at all -- kept local and separate from OPERATIONAL_STATUS (real plant
 *  vocabulary) and from operational-status.js's own DATA_QUALITY (which
 *  means "no authoritative IMS link", a different fact than "not attached
 *  to a machine unit in this reference layout" or "simulation switched
 *  off"). Conflating either into the shared module would blur a distinction
 *  that module exists specifically to keep separate. */
const SIM_QUALITY_DISPLAY = {
  NO_DATA: { label: 'No data (unattached)', glyph: '○', color: '#475569' },
  UNAVAILABLE: { label: 'Unavailable (sim off)', glyph: '–', color: '#475569' },
};

/**
 * FT-EAP-STATE Phase 5: the always-visible, text-and-glyph answer to "what
 * is the factory state" -- the same role app.js's own HUD list plays for
 * the physical twin (that page's own comment: "the accessibility fallback").
 * Never hover- or click-gated, so a viewer who cannot resolve the map's
 * colours reads the identical numbers as plain rows, unconditionally.
 */
function renderStateBreakdown() {
  const table = document.getElementById('stateBreakdown');
  if (!table || !payload) return;
  const { total, counts, reconciled } = factoryStateBreakdown();
  const rows = [...STATUS_ORDER, 'NO_DATA', 'UNAVAILABLE'].map((key) => {
    const meta = OPERATIONAL_STATUS[key] || SIM_QUALITY_DISPLAY[key];
    const n = counts.get(key) || 0;
    if (n === 0 && (key === 'NO_DATA' || key === 'UNAVAILABLE')) return ''; // only show when it applies
    return `<tr><td><span class="chip" style="background:${meta.color}"></span> `
      + `<span aria-hidden="true">${meta.glyph}</span> ${meta.label}</td><td>${n}</td></tr>`;
  }).join('');
  table.innerHTML = `${rows}<tr><td><strong>Total</strong></td><td><strong>${total}</strong></td></tr>`;
  if (!reconciled) table.innerHTML += '<tr><td colspan="2" class="note warn">reconciliation failed -- see console</td></tr>';
}

/* ------------------------------------------------------------------ modes -- */

function rebuild() {
  build();
  makeCameras();
  attachControls();
  resize();
}

function setMode(next) {
  if (!['AUTO', 'WORLD', 'EAP'].includes(next) || mode === next) return;
  mode = next;
  for (const [id, value] of [['modeAuto', 'AUTO'], ['modeWorld', 'WORLD'], ['modeEap', 'EAP']]) {
    document.getElementById(id).setAttribute('aria-pressed', String(value === mode));
  }
  selected = null;
  selectedZone = null;
  closeDrawer();
  renderInspector();
  modeNote.textContent = mode === 'WORLD'
    ? 'World: only CAD-grounded content. Zone regions and 40 DIRECT machines only.'
    : (mode === 'EAP'
      ? 'EAP: the full reference-layout drawing, all 210 cells, unresolved ones marked.'
      : 'Auto: the real floor plan, with zone regions you can open for the cells that '
        + 'are not individually placed on it.');
  rebuild();
}

function setView(next) {
  if (view === next) return;
  view = next;
  document.getElementById('view2d').setAttribute('aria-pressed', String(view === '2d'));
  document.getElementById('view3d').setAttribute('aria-pressed', String(view === '3d'));
  rebuild();
}

/* ------------------------------------------------------------------- loop -- */

let frames = 0;
let lastSample = performance.now();
let fps = 0;

function tick() {
  requestAnimationFrame(tick);
  if (!payload || !cam2d) return;
  // FT-EAP-CTXLIFECYCLE Phase 3: stop rendering on a lost/recovering context
  // as an explicit app decision, not by relying on three.js's own internal
  // no-op-while-lost guard. RECOVERED is never observed here -- it is set
  // and immediately advanced to READY within the same synchronous call, one
  // event-loop turn before this function's next invocation.
  if (webglLifecycle !== WebglLifecycle.READY) return;
  renderer.setViewport(0, 0, rect.w, rect.h);
  if (controls) controls.update();
  renderer.render(scene, activeCam());
  if (labelsDirty) {
    drawLabels();
    labelsDirty = false;
  }
  frames += 1;
  const now = performance.now();
  if (now - lastSample >= 1000) {
    fps = (frames * 1000) / (now - lastSample);
    frames = 0;
    lastSample = now;
  }
}

async function load() {
  const mapRes = await fetch(ENDPOINT, { headers: { accept: 'application/json' } });
  if (!mapRes.ok) {
    headline.textContent = 'EAP model not deployed on this host';
    return;
  }
  payload = await mapRes.json();
  try {
    const floorRes = await fetch(FLOOR_ENDPOINT, { headers: { accept: 'application/json' } });
    if (floorRes.ok) floor = await floorRes.json();
  } catch (err) {
    floor = null;
  }
  const c = payload.counts;
  headline.textContent = `${c.cells_with_a_footprint} cells · `
    + `${c.cells_in_world_frame} on the real floor, ${c.cells_in_layout_frame} `
    + `spatially unresolved · ${c.machine_units} machine units`;
  frameNote.textContent = payload.frame ? payload.frame.warning : '';
  modeNote.textContent = 'Auto: the real floor plan, with zone regions you can open for the '
    + 'cells that are not individually placed on it.';
  renderCounts();
  rebuild();
}

document.getElementById('modeAuto').addEventListener('click', () => setMode('AUTO'));
document.getElementById('modeWorld').addEventListener('click', () => setMode('WORLD'));
document.getElementById('modeEap').addEventListener('click', () => setMode('EAP'));
document.getElementById('view2d').addEventListener('click', () => setView('2d'));
document.getElementById('view3d').addEventListener('click', () => setView('3d'));
document.getElementById('fit').addEventListener('click', resetCamera);
const simToggleBtn = document.getElementById('simToggle');
if (simToggleBtn) {
  simToggleBtn.setAttribute('aria-pressed', String(simulationOn));
  simToggleBtn.addEventListener('click', () => {
    const next = window.__eap.setSimulation(!simulationOn);
    simToggleBtn.textContent = next ? 'Simulation: ON' : 'Simulation: OFF';
  });
}
drawerClose.addEventListener('click', closeDrawer);
window.addEventListener('resize', resize);

renderer.domElement.addEventListener('click', (ev) => {
  const cell = pickCellAt(ev.clientX, ev.clientY);
  if (cell) {
    selected = cell;
    selectedZone = null;
  } else {
    const zone = isMapMode() ? pickZoneAt(ev.clientX, ev.clientY) : null;
    selected = null;
    selectedZone = zone;
  }
  paintStates();
  renderInspector();
});

let hoverPending = false;
renderer.domElement.addEventListener('pointermove', (ev) => {
  if (hoverPending) return;
  hoverPending = true;
  const { clientX, clientY } = ev;
  requestAnimationFrame(() => {
    hoverPending = false;
    const next = pickCellAt(clientX, clientY);
    const nextZone = !next && isMapMode() ? pickZoneAt(clientX, clientY) : null;
    const changed = (next && next.cell_id) !== (hovered && hovered.cell_id);
    hovered = next;
    hoveredZone = nextZone;
    renderer.domElement.style.cursor = (next || nextZone) ? 'pointer' : 'default';
    if (changed) paintStates();
  });
});

/* Test surface: the regression asserts what was drawn, so it reads the instance
   matrices back rather than the records they came from. */
function readInstances() {
  const out = [];
  if (!cellMesh) return out;
  const mtx = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (let i = 0; i < cellRecords.length; i += 1) {
    cellMesh.getMatrixAt(i, mtx);
    mtx.decompose(pos, quat, scl);
    euler.setFromQuaternion(quat, 'YXZ');
    const cell = cellRecords[i];
    out.push({
      cell_id: cell.cell_id,
      zone_id: cell.zone_id,
      label: cell.reference_label,
      frame: isMapMode() ? 'FLOOR1_WORLD_M' : 'EAP_LAYOUT_FRAME',
      spatial_evidence: cell.spatial_evidence,
      mapping_state: cell.mapping_state,
      unit_state: cell.unit_state,
      machine_unit_id: cell.machine_unit_id,
      x: pos.x,
      z: pos.z,
      width: scl.x,
      depth: scl.z,
      height: scl.y,
      rotation_deg: THREE.MathUtils.radToDeg(euler.y),
    });
  }
  return out;
}

window.__eap = {
  ready: () => Boolean(payload && cellMesh),
  mode: () => mode,
  setMode,
  view: () => view,
  setView,
  counts: () => (payload ? payload.counts : null),
  frameVocabulary: () => (payload ? payload.frames : null),
  contract: () => (payload
    ? {
      renderer: payload.renderer_contract,
      live: payload.live_status_contract,
      footprint: payload.footprint_contract,
    }
    : null),
  drawnCells: () => cellRecords.length,
  drawnMarkers: () => (markerMesh ? markerMesh.count : 0),
  drawnZones: () => zoneRecords.length,
  batches: () => scene.children.filter((o) => o.isInstancedMesh).length,
  geometries: () => renderer.info.memory.geometries,
  drawCalls: () => renderer.info.render.calls,
  triangles: () => renderer.info.render.triangles,
  fps: () => fps,
  drawn: () => readInstances(),
  units: () => (payload ? payload.machine_units : []),
  zoneList: () => (payload ? payload.zones : []),
  floorLoaded: () => Boolean(floor),
  stageRect: () => ({ ...rect }),
  isMapMode,
  pick: (cellId) => {
    const cell = cellRecords.find((c) => c.cell_id === cellId);
    if (cell) {
      selected = cell;
      selectedZone = null;
      paintStates();
      renderInspector();
      return cell;
    }
    return null;
  },
  hover: (cellId) => {
    const cell = cellRecords.find((c) => c.cell_id === cellId);
    if (cell) {
      hovered = cell;
      paintStates();
      return cell;
    }
    return null;
  },
  pickZone: (zoneId) => {
    const rec = zoneRecords.find((r) => r.zone.zone_id === zoneId);
    if (rec) {
      selected = null;
      selectedZone = rec;
      paintStates();
      renderInspector();
      return rec;
    }
    return null;
  },
  openDrawer: (zoneId) => {
    const rec = zoneRecords.find((r) => r.zone.zone_id === zoneId);
    if (rec) openDrawer(rec);
    return rec || null;
  },
  closeDrawer,
  drawerOpen: () => !drawer.hidden,
  drawerZone: () => (openZone ? openZone.zone.zone_id : null),
  focus: (cx, cz, w, d) => focusOn(cx, cz, w, d),
  cameraExtent: () => ({ ...extent }),
  camBounds: () => (cam2d
    ? { left: cam2d.left, right: cam2d.right, top: cam2d.top, bottom: cam2d.bottom }
    : null),
  selection: () => selected,
  selectedZoneId: () => (selectedZone ? selectedZone.zone.zone_id : null),
  hovered: () => hovered,
  // FT-EAP-CTXLIFECYCLE: real QA hooks, not test-only stubs -- Phase 6's own
  // instruction to test via the browser's real forceContextLoss()/
  // forceContextRestore() rather than a mocked flag. webglLifecycle() and
  // contextLossCount() are the same variables handleContextLost()/
  // attemptContextRecovery() drive; nothing here is a second, parallel copy.
  webglLifecycle: () => webglLifecycle,
  contextLossCount: () => contextLossCount,
  simulateContextLoss: () => renderer.forceContextLoss(),
  simulateContextRestore: () => renderer.forceContextRestore(),
  cameraSnapshot: () => (cam2d && cam3d ? {
    view,
    zoom2d: cam2d.zoom,
    zoom3d: cam3d.zoom,
    target: controls ? { x: controls.target.x, y: controls.target.y, z: controls.target.z } : null,
  } : null),
  // SIMULATED STATUS -- client-side only, see simulatedStateFor's own
  // comment. Never touches /api/state or any production telemetry source.
  isSimulationOn: () => simulationOn,
  setSimulation: (on) => {
    simulationOn = Boolean(on);
    paintStates();
    if (simToggleBtn) simToggleBtn.setAttribute('aria-pressed', String(simulationOn));
    renderInspector();
    renderStateBreakdown();
    return simulationOn;
  },
  simulatedStatus: (cellId) => {
    const cell = cellRecords.find((c) => c.cell_id === cellId);
    const key = cell ? simulatedStateFor(cell) : null;
    return key ? { key, ...OPERATIONAL_STATUS[key], simulation: true, status_source: 'SIMULATED' } : null;
  },
  // FT-EAP-STATE: the canonical state contract (Phase 2) and its Phase 4
  // roll-ups, exposed for QA/regression -- the exact records the map, the
  // inspector and the always-visible breakdown table all read, so a test
  // checks the one real source instead of re-deriving its own copy.
  operationalState: (cellId) => {
    const cell = cellRecords.find((c) => c.cell_id === cellId) || null;
    return resolveOperationalState(cell);
  },
  factoryStateBreakdown: () => {
    const { total, counts, reconciled } = factoryStateBreakdown();
    return { total, reconciled, counts: Object.fromEntries(counts) };
  },
  zoneStateBreakdown: (zoneId) => {
    const { total, counts, reconciled } = zoneStateBreakdown(zoneId);
    return { total, reconciled, counts: Object.fromEntries(counts) };
  },
};

tick();
load();
