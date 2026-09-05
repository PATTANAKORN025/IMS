// The Floor 1 EAP operational map.
//
// Every cell the operational layout draws is rendered, including the ones whose
// CAD instance is unresolved. That is the whole design constraint: an unresolved
// identity is a fact about the evidence, not a reason to drop a machine off the
// map, so those cells are drawn exactly like the resolved ones and carry a small
// marker instead. A map that quietly showed 40 of 210 machines would be worse
// than no map.
//
// One footprint drives both views. The 2D map and the 3D box read the same x, z,
// rotation, width and depth from /api/eap-map; switching view swaps the camera
// and the extrusion height and touches no geometry. There is deliberately no
// second set of 3D dimensions to drift out of step with the first.
//
// Cells are two instanced draws rather than 210 meshes: one batch for the cell
// rectangles, one for the confidence markers. At this population the difference
// is not frame rate -- it is allocation and scene-graph churn on every rebuild,
// which is what actually shows up when a floor is reloaded repeatedly.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ENDPOINT = '/api/eap-map';

/* Presentation constants. Height is one of them: no authoritative CAD height
   exists for any cell, so the 3D view picks a viewing height and the payload
   says PRESENTATION_ONLY. It is never published as a measurement. */
const CELL_HEIGHT_3D = 2.2;
const CELL_HEIGHT_2D = 0.02;
const MARKER_SIZE = 0.55;

const COLOURS = {
  bg: 0x12151a,
  cell: 0x8f9bad,
  cellDirect: 0xcfd8e6,
  cellUnassigned: 0x6f7a8c,
  selected: 0x63a4ff,
  marker: 0xd8a657,
  zone: 0x3b4658,
  boundary: 0x4a586e,
};

const stage = document.getElementById('stage');
const labelCanvas = document.getElementById('labels');
const labelCtx = labelCanvas.getContext('2d');
const headline = document.getElementById('headline');
const inspector = document.getElementById('inspector');
const countsTable = document.getElementById('counts');
const frameNote = document.getElementById('frame-note');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(COLOURS.bg, 1);
stage.insertBefore(renderer.domElement, labelCanvas);

const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const key = new THREE.DirectionalLight(0xffffff, 0.55);
key.position.set(-40, 90, 40);
scene.add(key);

let camera2d = null;
let camera3d = null;
let controls = null;
let mode = '2d';

/* Shared geometry. One unit box, scaled per instance -- so the batches carry a
   single BufferGeometry between them and the 3D view is the same rectangle with
   a different height, not a different model. */
const unitBox = new THREE.BoxGeometry(1, 1, 1);
// Per-instance colour comes from InstancedMesh.setColorAt, which three feeds
// through its own instancing-colour path. Asking for vertexColors as well
// makes the shader look for a per-vertex colour attribute the shared unit box
// does not carry, and every cell renders black.
const cellMaterial = new THREE.MeshLambertMaterial();
const markerMaterial = new THREE.MeshBasicMaterial({ color: COLOURS.marker });

let payload = null;
let cellMesh = null;
let markerMesh = null;
let zoneLines = null;
let instances = [];
let selectedIndex = -1;

const dummy = new THREE.Object3D();
const colour = new THREE.Color();

function cellColour(cell) {
  if (cell.unit_state === 'UNASSIGNED') return COLOURS.cellUnassigned;
  if (cell.cad_evidence.has_cad_instance) return COLOURS.cellDirect;
  return COLOURS.cell;
}

/** A cell needs a marker when its identity is not resolved to one instance. */
function needsMarker(cell) {
  return cell.mapping_state !== 'DIRECT' || cell.unit_state === 'UNASSIGNED';
}

function clearScene() {
  for (const obj of [cellMesh, markerMesh, zoneLines]) {
    if (!obj) continue;
    scene.remove(obj);
    if (obj.geometry && obj.geometry !== unitBox) obj.geometry.dispose();
    if (obj.material && obj.material !== cellMaterial && obj.material !== markerMaterial) {
      obj.material.dispose();
    }
  }
  cellMesh = null;
  markerMesh = null;
  zoneLines = null;
  instances = [];
}

function build() {
  clearScene();
  const drawable = payload.cells.filter((c) => c.footprint);
  const height = mode === '3d' ? CELL_HEIGHT_3D : CELL_HEIGHT_2D;

  cellMesh = new THREE.InstancedMesh(unitBox, cellMaterial, drawable.length);
  cellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cellMesh.frustumCulled = false;

  const marked = drawable.filter(needsMarker);
  markerMesh = new THREE.InstancedMesh(unitBox, markerMaterial, marked.length);
  markerMesh.frustumCulled = false;

  let m = 0;
  drawable.forEach((cell, i) => {
    const f = cell.footprint;
    dummy.position.set(f.x, height / 2, f.z);
    dummy.rotation.set(0, THREE.MathUtils.degToRad(-f.rotation_deg), 0);
    dummy.scale.set(f.width, height, f.depth);
    dummy.updateMatrix();
    cellMesh.setMatrixAt(i, dummy.matrix);
    cellMesh.setColorAt(i, colour.setHex(cellColour(cell)));
    instances.push({ cell, index: i });

    if (needsMarker(cell)) {
      /* The marker sits on the cell's north-west corner rather than its centre,
         so it never covers the label and never reads as a status dot. */
      const size = Math.min(MARKER_SIZE, f.width * 0.4, f.depth * 0.4);
      dummy.position.set(
        f.x - f.width / 2 + size,
        height + size / 2,
        f.z - f.depth / 2 + size,
      );
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
  cellMesh.userData.instances = instances;
  scene.add(cellMesh);
  scene.add(markerMesh);

  /* Zone extents and the factory boundary, as lines. The payload is explicit
     that a zone extent is the span of its cells and not a room boundary, so
     these are drawn thin and unfilled -- a wall the drawing never drew has no
     business looking like one. */
  const pts = [];
  const pushRect = (x, z, w, d, y) => {
    const hx = w / 2;
    const hz = d / 2;
    const corners = [
      [x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz],
    ];
    for (let i = 0; i < 4; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      pts.push(a[0], y, a[1], b[0], y, b[1]);
    }
  };
  for (const z of payload.zones) {
    const pad = 1.2;
    pushRect(z.extent.x, z.extent.z, z.extent.width + pad, z.extent.depth + pad, 0.005);
  }
  if (payload.frame && payload.frame.extent.width) {
    pushRect(0, 0, payload.frame.extent.width, payload.frame.extent.depth, 0.004);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  zoneLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: COLOURS.zone, transparent: true, opacity: 0.85,
  }));
  zoneLines.frustumCulled = false;
  scene.add(zoneLines);
}

function frameExtent() {
  if (payload && payload.frame && payload.frame.extent.width) {
    return { w: payload.frame.extent.width, d: payload.frame.extent.depth };
  }
  return { w: 180, d: 100 };
}

function makeCameras() {
  const { w, d } = frameExtent();
  const aspect = Math.max(stage.clientWidth / Math.max(stage.clientHeight, 1), 0.2);
  // Half-height that contains the frame on whichever axis binds first.
  const half = Math.max(d, w / aspect) / 2 * 1.06;
  camera2d = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 2000);
  camera2d.position.set(0, 300, 0.001);
  camera2d.lookAt(0, 0, 0);
  camera3d = new THREE.PerspectiveCamera(42, aspect, 0.5, 4000);
  camera3d.position.set(0, w * 0.62, d * 0.95);
  camera3d.lookAt(0, 0, 0);
}

function activeCamera() {
  return mode === '3d' ? camera3d : camera2d;
}

function attachControls() {
  if (controls) controls.dispose();
  controls = new OrbitControls(activeCamera(), renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableRotate = mode === '3d';
  controls.screenSpacePanning = mode !== '3d';
  controls.update();
}

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setSize(w, h, false);
  labelCanvas.width = Math.round(w * ratio);
  labelCanvas.height = Math.round(h * ratio);
  labelCanvas.style.width = `${w}px`;
  labelCanvas.style.height = `${h}px`;
  const aspect = w / h;
  const { w: fw, d: fd } = frameExtent();
  const half = Math.max(fd, fw / aspect) / 2 * 1.06;
  if (camera2d) {
    camera2d.left = -half * aspect;
    camera2d.right = half * aspect;
    camera2d.top = half;
    camera2d.bottom = -half;
    camera2d.updateProjectionMatrix();
  }
  if (camera3d) {
    camera3d.aspect = aspect;
    camera3d.updateProjectionMatrix();
  }
}

/* Labels are an overlay, not geometry. Drawing 210 text sprites into the scene
   would put text through the same transform as the machines and make it shrink
   out of readability; the overlay keeps type at a fixed size and lets the map
   scale underneath it. Cell labels appear only once a cell is big enough on
   screen to hold them, so the map never turns into a wall of overlapping text. */
const labelVec = new THREE.Vector3();

function project(x, y, z, cam, w, h) {
  labelVec.set(x, y, z).project(cam);
  return {
    x: (labelVec.x * 0.5 + 0.5) * w,
    y: (-labelVec.y * 0.5 + 0.5) * h,
    visible: labelVec.z < 1,
  };
}

function drawLabels() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = labelCanvas.width;
  const h = labelCanvas.height;
  labelCtx.clearRect(0, 0, w, h);
  const cam = activeCamera();
  if (!payload || !cam) return;

  labelCtx.textAlign = 'center';
  labelCtx.textBaseline = 'middle';

  // Zone captions first, so a cell label never sits under one.
  labelCtx.font = `600 ${11 * ratio}px ui-sans-serif, system-ui, sans-serif`;
  labelCtx.fillStyle = '#8794a8';
  for (const z of payload.zones) {
    const p = project(z.extent.x, 0, z.extent.z + z.extent.depth / 2 + 2.4, cam, w, h);
    if (!p.visible) continue;
    labelCtx.fillText(z.caption.toUpperCase(), p.x, p.y);
  }

  // Cell labels, only where the cell is wide enough on screen to carry one.
  labelCtx.font = `${10 * ratio}px ui-sans-serif, system-ui, sans-serif`;
  labelCtx.fillStyle = '#20252e';
  for (const inst of instances) {
    const f = inst.cell.footprint;
    const a = project(f.x - f.width / 2, 0, f.z, cam, w, h);
    const b = project(f.x + f.width / 2, 0, f.z, cam, w, h);
    if (!a.visible || !b.visible) continue;
    const px = Math.abs(b.x - a.x);
    if (px < 26 * ratio) continue;
    const label = inst.cell.reference_label || '';
    if (!label || label.startsWith('UNREADABLE')) continue;
    const short = label.includes('/') ? label.split('/').pop() : label;
    const p = project(f.x, 0, f.z, cam, w, h);
    labelCtx.fillText(short, p.x, p.y);
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pickAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, activeCamera());
  const hits = raycaster.intersectObject(cellMesh, false);
  if (!hits.length) return null;
  const hit = hits.find((h) => Number.isInteger(h.instanceId));
  if (!hit) return null;
  return instances[hit.instanceId] ? instances[hit.instanceId].cell : null;
}

function select(cell) {
  if (!cellMesh) return;
  if (selectedIndex >= 0 && instances[selectedIndex]) {
    cellMesh.setColorAt(selectedIndex, colour.setHex(cellColour(instances[selectedIndex].cell)));
  }
  selectedIndex = cell ? instances.findIndex((i) => i.cell.cell_id === cell.cell_id) : -1;
  if (selectedIndex >= 0) cellMesh.setColorAt(selectedIndex, colour.setHex(COLOURS.selected));
  if (cellMesh.instanceColor) cellMesh.instanceColor.needsUpdate = true;
  renderInspector(cell);
}

function row(label, value) {
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

function renderInspector(cell) {
  if (!cell) {
    inspector.innerHTML = '<p class="note">Click a cell.</p>';
    return;
  }
  const unit = payload.machine_units.find((u) => u.unit_id === cell.machine_unit_id);
  const ev = cell.cad_evidence;
  const parts = [
    row('Cell', cell.cell_id),
    row('Reference label', cell.reference_label && !cell.reference_label.startsWith('UNREADABLE')
      ? cell.reference_label : 'not legible in the reference'),
    row('Zone', `${cell.zone_id} &mdash; ${cell.zone_caption}`),
    row('Process', cell.process),
    row('Machine unit', unit
      ? `${unit.unit_id} (${unit.reference_label}, ${unit.aggregation_type === 'AGGREGATED_STATION'
        ? `${unit.cell_ids.length} cells` : 'single cell'})`
      : 'none &mdash; drawn but not attached'),
    row('Mapping state', cell.mapping_state),
    row('Unit state', cell.unit_state),
    row('Confidence', cell.confidence),
    row('CAD evidence', ev.has_cad_instance
      ? `one named instance (${ev.relation})`
      : `zone set only &mdash; ${ev.cad_candidates_in_zone} candidates in ${ev.cad_zone_ids.join(', ') || 'no zone'}`),
    row('IMS mapping', unit ? unit.ims_mapping_state : 'NOT_MAPPED'),
    row('Status', cell.status),
    row('Footprint', `${cell.footprint.width.toFixed(2)} &times; ${cell.footprint.depth.toFixed(2)} (${cell.footprint.geometry_confidence.toLowerCase()} confidence)`),
  ];
  const notes = [`<p class="note">${cell.status_reason}.</p>`];
  if (cell.mapping_state !== 'DIRECT') {
    notes.push('<p class="note warn">Identity unresolved: the drawing carries no machine '
      + 'number, so this cell is placed and grouped but not bound to one CAD instance.</p>');
  }
  if (!cell.reference_status_drawn) {
    notes.push('<p class="note">The reference drew this cell without a status colour.</p>');
  }
  inspector.innerHTML = `<dl>${parts.join('')}</dl>${notes.join('')}`;
}

function renderCounts() {
  const c = payload.counts;
  const rows = [
    ['EAP cells rendered', c.cells_with_a_footprint],
    ['Machine units', c.machine_units],
    ['&nbsp;&nbsp;single-cell', c.single_cell_units],
    ['&nbsp;&nbsp;aggregated stations', c.aggregated_station_units],
    ['Cells in stations', c.cells_in_aggregated_stations],
    ['Cells with no unit', c.cells_unassigned_to_a_unit],
    ['Identity DIRECT', c.mapping_state.DIRECT || 0],
    ['Identity AMBIGUOUS', c.mapping_state.AMBIGUOUS || 0],
  ];
  countsTable.innerHTML = rows
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
}

function setMode(next) {
  if (mode === next) return;
  mode = next;
  document.getElementById('view2d').setAttribute('aria-pressed', String(mode === '2d'));
  document.getElementById('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  build();
  attachControls();
  select(null);
}

function fit() {
  makeCameras();
  attachControls();
  resize();
}

let frames = 0;
let lastSample = performance.now();
let fps = 0;

function tick() {
  requestAnimationFrame(tick);
  // The loop starts before the payload arrives, so there is a window with no
  // camera and nothing to draw. Bailing out here keeps that window silent
  // instead of throwing once a frame until the fetch lands.
  const cam = activeCamera();
  if (!cam) return;
  if (controls) controls.update();
  renderer.render(scene, cam);
  drawLabels();
  frames += 1;
  const now = performance.now();
  if (now - lastSample >= 1000) {
    fps = (frames * 1000) / (now - lastSample);
    frames = 0;
    lastSample = now;
  }
}

async function load() {
  const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    headline.textContent = 'EAP model not deployed on this host';
    return;
  }
  payload = await res.json();
  const c = payload.counts;
  headline.textContent = `${c.cells_with_a_footprint} cells · ${c.machine_units} machine units `
    + `· ${c.mapping_state.DIRECT || 0} identified, ${c.mapping_state.AMBIGUOUS || 0} unresolved`;
  frameNote.textContent = payload.frame ? payload.frame.warning : '';
  renderCounts();
  makeCameras();
  build();
  attachControls();
  resize();
}

document.getElementById('view2d').addEventListener('click', () => setMode('2d'));
document.getElementById('view3d').addEventListener('click', () => setMode('3d'));
document.getElementById('fit').addEventListener('click', fit);
window.addEventListener('resize', resize);
renderer.domElement.addEventListener('click', (ev) => {
  select(pickAt(ev.clientX, ev.clientY));
});

/* Test surface. The browser regression asserts what is on screen rather than
   what the payload said, so it needs the drawn instance matrices, not the
   records they came from. */
window.__eap = {
  ready: () => Boolean(payload && cellMesh),
  mode: () => mode,
  setMode,
  counts: () => (payload ? payload.counts : null),
  drawnCells: () => (cellMesh ? cellMesh.count : 0),
  drawnMarkers: () => (markerMesh ? markerMesh.count : 0),
  batches: () => scene.children.filter((o) => o.isInstancedMesh).length,
  geometries: () => renderer.info.memory.geometries,
  drawCalls: () => renderer.info.render.calls,
  triangles: () => renderer.info.render.triangles,
  fps: () => fps,
  /* Each drawn instance, read back out of the instance matrix -- position,
     size and rotation exactly as the GPU received them. */
  drawn: () => {
    const out = [];
    const mtx = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let i = 0; i < instances.length; i += 1) {
      cellMesh.getMatrixAt(i, mtx);
      mtx.decompose(pos, quat, scl);
      const cell = instances[i].cell;
      out.push({
        cell_id: cell.cell_id,
        zone_id: cell.zone_id,
        label: cell.reference_label,
        mapping_state: cell.mapping_state,
        unit_state: cell.unit_state,
        machine_unit_id: cell.machine_unit_id,
        x: pos.x,
        z: pos.z,
        width: scl.x,
        depth: scl.z,
        height: scl.y,
      });
    }
    return out;
  },
  units: () => (payload ? payload.machine_units : []),
  pick: (cellId) => {
    const inst = instances.find((i) => i.cell.cell_id === cellId);
    if (!inst) return null;
    select(inst.cell);
    return inst.cell;
  },
  selection: () => (selectedIndex >= 0 ? instances[selectedIndex].cell : null),
};

tick();
load();
