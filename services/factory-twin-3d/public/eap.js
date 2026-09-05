// The Floor 1 EAP operational map.
//
// This map draws two coordinate systems at once and refuses to pretend they are
// one. Forty cells have a position on the real floor, established through CAD
// identity; the other 170 have only the reference layout's arrangement, which is
// a schematic and anisotropic. Overlaying them would produce a picture that is
// wrong in a way no viewer could detect -- schematic machines standing between
// real walls, at real-looking coordinates nobody measured.
//
// So the two frames get two panes with a boundary between them. The world pane
// is the CAD floor plan with the 40 registered cells standing in it and the
// registered zones outlined behind them; the layout pane is the reference
// schematic. Nothing crosses, there is no transform from one to the other, and
// the payload carries none to apply.
//
// One footprint per cell per frame, and each drives both its 2D rectangle and
// its 3D box: switching to 3D swaps the camera and the extrusion height and
// touches no geometry.
//
// Cells are instanced. Each pane gets one batch, plus one for the confidence
// markers and one for the floor's columns; walls, zone outlines and regions are
// line geometry built once per mode. Nothing is rebuilt per frame.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ENDPOINT = '/api/eap-map';
const FLOOR_ENDPOINT = '/api/floor-geometry';

/* Presentation constants. Height is one of them: no authoritative CAD height
   exists for any cell, so the 3D view picks a viewing height and the payload
   says PRESENTATION_ONLY. It is never published as a measurement. */
const CELL_HEIGHT_3D = 2.4;
const CELL_HEIGHT_2D = 0.02;
const MARKER_SIZE = 0.5;

const C = {
  bg: 0x0f1216,
  world: 0xbcd0ea,            // a registered cell: brighter, because it is real
  layout: 0x7b8698,           // a schematic cell
  layoutUnassigned: 0x5b6472,
  marker: 0xd8a657,
  hover: 0xffffff,
  selected: 0x63a4ff,
  wall: 0x39455a,
  column: 0x232b36,
  boundary: 0x44536b,
  zone: 0x364254,
  region: 0x4a6b8a,
};

const stage = document.getElementById('stage');
const labelCanvas = document.getElementById('labels');
const labelCtx = labelCanvas.getContext('2d');
const headline = document.getElementById('headline');
const inspector = document.getElementById('inspector');
const countsTable = document.getElementById('counts');
const frameNote = document.getElementById('frame-note');
const paneBar = document.getElementById('panes');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(C.bg, 1);
renderer.setScissorTest(true);
stage.insertBefore(renderer.domElement, labelCanvas);

/* Two scenes rather than two layers on one. A separate scene makes it
   impossible for a stray object to be drawn into the wrong coordinate system by
   forgetting a layer mask. */
const worldScene = new THREE.Scene();
const layoutScene = new THREE.Scene();
for (const s of [worldScene, layoutScene]) {
  s.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 0.5);
  key.position.set(-40, 90, 40);
  s.add(key);
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cellMaterial = new THREE.MeshLambertMaterial();
const markerMaterial = new THREE.MeshBasicMaterial({ color: C.marker });
const columnMaterial = new THREE.MeshLambertMaterial({ color: C.column });

let payload = null;
let floor = null;
let mode = 'AUTO';          // AUTO | WORLD | EAP
let view = '2d';            // 2d | 3d

const panes = {
  world: {
    scene: worldScene, cam2d: null, cam3d: null, controls: null, rect: null,
    mesh: null, instances: [], extent: { w: 180, d: 130 }, label: 'CAD world space',
  },
  layout: {
    scene: layoutScene, cam2d: null, cam3d: null, controls: null, rect: null,
    mesh: null, instances: [], extent: { w: 180, d: 95 }, label: 'EAP reference layout',
  },
};

let markerMesh = null;
let hovered = null;
let selected = null;

const dummy = new THREE.Object3D();
const colour = new THREE.Color();

function activeCam(pane) {
  return view === '3d' ? pane.cam3d : pane.cam2d;
}

function visiblePanes() {
  if (mode === 'WORLD') return ['world'];
  if (mode === 'EAP') return ['layout'];
  return ['world', 'layout'];
}

/* Which cells each pane draws, per mode. A cell is never drawn in a frame it
   does not belong to: the world pane only ever holds cells the payload marked
   FLOOR1_WORLD_M, and no mode moves a cell between panes. */
function cellsFor(paneName) {
  if (!payload) return [];
  const world = payload.cells.filter(
    (c) => c.spatial_frame === 'FLOOR1_WORLD_M' && c.world_footprint);
  const layoutAll = payload.cells.filter((c) => c.footprint);
  if (paneName === 'world') return world;
  if (mode === 'EAP') return layoutAll;
  return layoutAll.filter((c) => c.spatial_frame !== 'FLOOR1_WORLD_M');
}

function footprintOf(cell, paneName) {
  return paneName === 'world' ? cell.world_footprint : cell.footprint;
}

function baseColour(cell, paneName) {
  if (paneName === 'world') return C.world;
  if (cell.unit_state === 'UNASSIGNED') return C.layoutUnassigned;
  return C.layout;
}

function needsMarker(cell) {
  return cell.spatial_evidence !== 'DIRECT' || cell.unit_state === 'UNASSIGNED';
}

function clearScene(scene) {
  for (let i = scene.children.length - 1; i >= 0; i -= 1) {
    const o = scene.children[i];
    if (o.isLight) continue;
    scene.remove(o);
    if (o.geometry && o.geometry !== unitBox) o.geometry.dispose();
    if (o.material && ![cellMaterial, markerMaterial, columnMaterial].includes(o.material)) {
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

/* ------------------------------------------------------------------ build -- */

function buildWorldPane() {
  const pane = panes.world;
  clearScene(worldScene);
  pane.instances = [];
  const height = view === '3d' ? CELL_HEIGHT_3D : CELL_HEIGHT_2D;

  /* The floor itself: the CAD-derived plan this map stands on, served already
     projected into the canonical frame. Walls are one line object rather than
     587, and the columns are one instanced batch. */
  if (floor) {
    const pts = [];
    for (const w of floor.wall_lines || []) pts.push(w.x1, 0, w.z1, w.x2, 0, w.z2);
    if (pts.length) worldScene.add(lineObject(pts, C.wall, 0.9));
    const poly = floor.footprint_polygon && floor.footprint_polygon.vertices;
    if (poly && poly.length > 2) {
      const edge = [];
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        edge.push(a.x, 0.01, a.z, b.x, 0.01, b.z);
      }
      worldScene.add(lineObject(edge, C.boundary));
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
      worldScene.add(cm);
    } else if (cols.length) {
      const colPts = [];
      for (const col of cols) {
        rectPoints(colPts, col.position.x, col.position.z,
          col.footprint.width, col.footprint.depth, 0.006);
      }
      worldScene.add(lineObject(colPts, C.column, 0.9));
    }
    if (floor.envelope) pane.extent = { w: floor.envelope.width, d: floor.envelope.depth };
  }

  /* Registered zones, drawn as regions rather than machines. This is what a
     set-level registration actually buys: the zone is placed, the machines
     inside it are not, and an outline says that where a filled rectangle would
     not. */
  const regionPts = [];
  for (const z of payload.zones) {
    const r = z.cad_world_region;
    if (!r) continue;
    rectPoints(regionPts, r.x, r.z, r.width + 1.5, r.depth + 1.5, 0.02);
  }
  if (regionPts.length) worldScene.add(lineObject(regionPts, C.region, 0.6));

  const cells = cellsFor('world');
  const mesh = new THREE.InstancedMesh(unitBox, cellMaterial, Math.max(cells.length, 1));
  mesh.count = cells.length;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  cells.forEach((cell, i) => {
    const f = cell.world_footprint;
    dummy.position.set(f.x, height / 2 + 0.03, f.z);
    dummy.rotation.set(0, THREE.MathUtils.degToRad(f.rotation_deg), 0);
    dummy.scale.set(f.width, height, f.depth);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, colour.setHex(C.world));
    pane.instances.push(cell);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  worldScene.add(mesh);
  pane.mesh = mesh;
}

function buildLayoutPane() {
  const pane = panes.layout;
  clearScene(layoutScene);
  pane.instances = [];
  const height = view === '3d' ? CELL_HEIGHT_3D : CELL_HEIGHT_2D;

  const zonePts = [];
  for (const z of payload.zones) {
    rectPoints(zonePts, z.extent.x, z.extent.z, z.extent.width + 1.2,
      z.extent.depth + 1.2, 0.005);
  }
  if (payload.frame && payload.frame.extent.width) {
    rectPoints(zonePts, 0, 0, payload.frame.extent.width, payload.frame.extent.depth, 0.004);
    pane.extent = { w: payload.frame.extent.width, d: payload.frame.extent.depth };
  }
  if (zonePts.length) layoutScene.add(lineObject(zonePts, C.zone, 0.85));

  const cells = cellsFor('layout');
  const mesh = new THREE.InstancedMesh(unitBox, cellMaterial, Math.max(cells.length, 1));
  mesh.count = cells.length;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const marked = cells.filter(needsMarker);
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
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, colour.setHex(baseColour(cell, 'layout')));
    pane.instances.push(cell);
    if (needsMarker(cell)) {
      const size = Math.min(MARKER_SIZE, f.width * 0.4, f.depth * 0.4);
      dummy.position.set(f.x - f.width / 2 + size, height + size / 2, f.z - f.depth / 2 + size);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      markerMesh.setMatrixAt(m, dummy.matrix);
      m += 1;
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  markerMesh.instanceMatrix.needsUpdate = true;
  layoutScene.add(mesh);
  layoutScene.add(markerMesh);
  pane.mesh = mesh;
}

function build() {
  buildWorldPane();
  buildLayoutPane();
  paintStates();
}

/* Hover and selection are colour writes into the existing instance buffers. No
   geometry is added, so pointing at a machine costs one buffer upload. */
function paintStates() {
  for (const name of ['world', 'layout']) {
    const pane = panes[name];
    if (!pane.mesh) continue;
    pane.instances.forEach((cell, i) => {
      let hex = baseColour(cell, name);
      if (selected && cell.cell_id === selected.cell_id) hex = C.selected;
      else if (hovered && cell.cell_id === hovered.cell_id) hex = C.hover;
      pane.mesh.setColorAt(i, colour.setHex(hex));
    });
    if (pane.mesh.instanceColor) pane.mesh.instanceColor.needsUpdate = true;
  }
}

/* ----------------------------------------------------------------- camera -- */

function paneAspect(name) {
  const r = panes[name].rect;
  if (r && r.h) return Math.max(r.w / r.h, 0.2);
  const list = visiblePanes();
  const share = list.length === 1 ? 1 : (name === 'world' ? 0.58 : 0.42);
  return Math.max((stage.clientWidth * share) / Math.max(stage.clientHeight, 1), 0.2);
}

function makeCameras() {
  for (const name of ['world', 'layout']) {
    const pane = panes[name];
    const { w, d } = pane.extent;
    const aspect = paneAspect(name);
    const half = (Math.max(d, w / aspect) / 2) * 1.06;
    pane.cam2d = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half,
      0.1, 4000);
    pane.cam2d.position.set(0, 400, 0.001);
    pane.cam2d.lookAt(0, 0, 0);
    pane.cam3d = new THREE.PerspectiveCamera(40, aspect, 0.5, 6000);
    pane.cam3d.position.set(0, w * 0.55, d * 0.9);
    pane.cam3d.lookAt(0, 0, 0);
  }
}

function paneRects() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const list = visiblePanes();
  for (const n of ['world', 'layout']) panes[n].rect = null;
  if (list.length === 1) {
    panes[list[0]].rect = { x: 0, y: 0, w, h };
    return;
  }
  const split = Math.round(w * 0.58);
  panes.world.rect = { x: 0, y: 0, w: split - 1, h };
  panes.layout.rect = { x: split + 1, y: 0, w: w - split - 1, h };
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
  paneRects();
  for (const name of ['world', 'layout']) {
    const pane = panes[name];
    if (!pane.cam2d) continue;
    const aspect = paneAspect(name);
    const half = (Math.max(pane.extent.d, pane.extent.w / aspect) / 2) * 1.06;
    pane.cam2d.left = -half * aspect;
    pane.cam2d.right = half * aspect;
    pane.cam2d.top = half;
    pane.cam2d.bottom = -half;
    pane.cam2d.updateProjectionMatrix();
    pane.cam3d.aspect = aspect;
    pane.cam3d.updateProjectionMatrix();
  }
  drawPaneBar();
}

function attachControls() {
  for (const name of ['world', 'layout']) {
    if (panes[name].controls) panes[name].controls.dispose();
    panes[name].controls = null;
  }
  const primary = panes[visiblePanes()[0]];
  primary.controls = new OrbitControls(activeCam(primary), renderer.domElement);
  primary.controls.target.set(0, 0, 0);
  primary.controls.enableRotate = view === '3d';
  primary.controls.screenSpacePanning = view !== '3d';
  primary.controls.update();
}

/* ----------------------------------------------------------------- labels -- */

const labelVec = new THREE.Vector3();

function project(x, y, z, cam, rect, ratio) {
  labelVec.set(x, y, z).project(cam);
  return {
    x: (rect.x + (labelVec.x * 0.5 + 0.5) * rect.w) * ratio,
    y: (rect.y + (-labelVec.y * 0.5 + 0.5) * rect.h) * ratio,
    visible: labelVec.z < 1,
  };
}

function drawLabels() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  if (!payload) return;
  labelCtx.textAlign = 'center';
  labelCtx.textBaseline = 'middle';

  for (const name of visiblePanes()) {
    const pane = panes[name];
    const rect = pane.rect;
    if (!rect) continue;
    const cam = activeCam(pane);

    labelCtx.font = `600 ${10.5 * ratio}px ui-sans-serif, system-ui, sans-serif`;
    if (name === 'layout') {
      labelCtx.fillStyle = '#7d8a9d';
      for (const z of payload.zones) {
        const p = project(z.extent.x, 0, z.extent.z + z.extent.depth / 2 + 2.4,
          cam, rect, ratio);
        if (p.visible) labelCtx.fillText(z.caption.toUpperCase(), p.x, p.y);
      }
    } else {
      labelCtx.fillStyle = '#5f7d9e';
      for (const z of payload.zones) {
        const r = z.cad_world_region;
        if (!r) continue;
        const p = project(r.x, 0, r.z + r.depth / 2 + 2.2, cam, rect, ratio);
        if (p.visible) labelCtx.fillText(`${z.caption.toUpperCase()} · ZONE PLACED`, p.x, p.y);
      }
    }

    labelCtx.font = `${9.5 * ratio}px ui-sans-serif, system-ui, sans-serif`;
    labelCtx.fillStyle = '#141a21';
    for (const cell of pane.instances) {
      const f = footprintOf(cell, name);
      const a = project(f.x - f.width / 2, 0, f.z, cam, rect, ratio);
      const b = project(f.x + f.width / 2, 0, f.z, cam, rect, ratio);
      if (!a.visible || !b.visible) continue;
      if (Math.abs(b.x - a.x) < 24 * ratio) continue;
      const label = cell.reference_label || '';
      if (!label || label.startsWith('UNREADABLE')) continue;
      const short = label.includes('/') ? label.split('/').pop() : label;
      const p = project(f.x, 0, f.z, cam, rect, ratio);
      labelCtx.fillText(short, p.x, p.y);
    }
  }
}

function drawPaneBar() {
  const list = visiblePanes();
  const c = payload ? payload.counts : null;
  paneBar.innerHTML = list.map((name) => {
    const pane = panes[name];
    const frame = name === 'world' ? 'FLOOR1_WORLD_M' : 'EAP_LAYOUT_FRAME';
    const basis = list.length === 1 ? '100%' : (name === 'world' ? '58%' : '42%');
    /* In WORLD mode the layout pane is off screen, so the cells it would have
       held have to be accounted for here rather than silently vanishing. The
       ones with a set-level registration are on this pane already, as the zone
       outlines; the ones with none are not represented at all, and the bar says
       so instead of leaving a viewer to assume the floor holds 40 machines. */
    let extra = '';
    if (name === 'world' && mode === 'WORLD' && c) {
      const zoned = c.spatial_evidence.SET_LEVEL || 0;
      const none = c.spatial_evidence.LAYOUT_ONLY || 0;
      extra = `<span class="pane-warn">${zoned + none} cells not world-positioned `
        + `&middot; ${zoned} shown as zone regions, ${none} with no CAD `
        + 'correspondence</span>';
    }
    return `<div class="pane-tag" style="flex-basis:${basis}">`
      + `<strong>${pane.label}</strong>`
      + `<span>${frame} &middot; ${pane.instances.length} cells</span>${extra}</div>`;
  }).join('');
}

/* ---------------------------------------------------------------- picking -- */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function paneAt(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  const x = clientX - r.left;
  const y = clientY - r.top;
  for (const name of visiblePanes()) {
    const rect = panes[name].rect;
    if (!rect) continue;
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
      return { name, x, y, rect };
    }
  }
  return null;
}

function pickAt(clientX, clientY) {
  const hit = paneAt(clientX, clientY);
  if (!hit) return null;
  const pane = panes[hit.name];
  if (!pane.mesh || !pane.mesh.count) return null;
  pointer.x = ((hit.x - hit.rect.x) / hit.rect.w) * 2 - 1;
  pointer.y = -((hit.y - hit.rect.y) / hit.rect.h) * 2 + 1;
  raycaster.setFromCamera(pointer, activeCam(pane));
  const hits = raycaster.intersectObject(pane.mesh, false);
  const first = hits.find((h) => Number.isInteger(h.instanceId));
  return first ? (pane.instances[first.instanceId] || null) : null;
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

function renderInspector(cell) {
  if (!cell) {
    inspector.innerHTML = '<p class="note">Click a cell in either pane.</p>';
    return;
  }
  const unit = payload.machine_units.find((u) => u.unit_id === cell.machine_unit_id);
  const ev = cell.cad_evidence;
  const world = cell.world_footprint;
  const f = world || cell.footprint;
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
      ? 'FLOOR1_WORLD_M &mdash; drawn on the CAD floor plan'
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
  ];
  const notes = [];
  if (cell.spatial_evidence === 'DIRECT') {
    notes.push('<p class="note">Bound to one CAD instance, so this cell is drawn on the '
      + 'real floor plan at that instance&rsquo;s own measured position.</p>');
  } else if (cell.spatial_evidence === 'SET_LEVEL') {
    notes.push('<p class="note">Set-level evidence: the zone holding this cell is placed '
      + 'in the drawing, but nothing places this individual machine, so it is drawn in '
      + 'the reference schematic. The drawing carries no machine numbers, which is why '
      + 'its instance cannot be picked out of the zone&rsquo;s candidate set.</p>');
  } else {
    notes.push('<p class="note warn">Layout only: no CAD correspondence was established '
      + 'for this cell at any level, so the reference layout is all that places it.</p>');
  }
  notes.push(`<p class="note">Live status is not eligible for this cell: `
    + `${cell.live_status_blocked_by}.</p>`);
  inspector.innerHTML = `<dl>${parts.join('')}</dl>${notes.join('')}`;
}

function renderCounts() {
  const c = payload.counts;
  const rows = [
    ['EAP cells', c.cells_with_a_footprint],
    ['&nbsp;&nbsp;in world frame', c.cells_in_world_frame],
    ['&nbsp;&nbsp;in layout frame', c.cells_in_layout_frame],
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
  if (!payload || !panes.world.cam2d) return;
  const ratio = renderer.getPixelRatio();
  for (const name of visiblePanes()) {
    const pane = panes[name];
    const rect = pane.rect;
    if (!rect || !rect.w || !rect.h) continue;
    renderer.setViewport(rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio);
    renderer.setScissor(rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio);
    if (pane.controls) pane.controls.update();
    renderer.render(pane.scene, activeCam(pane));
  }
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
    + `${c.cells_in_world_frame} on the CAD floor, ${c.cells_in_layout_frame} in the `
    + `reference layout · ${c.machine_units} machine units`;
  frameNote.textContent = payload.frame ? payload.frame.warning : '';
  renderCounts();
  rebuild();
}

document.getElementById('modeAuto').addEventListener('click', () => setMode('AUTO'));
document.getElementById('modeWorld').addEventListener('click', () => setMode('WORLD'));
document.getElementById('modeEap').addEventListener('click', () => setMode('EAP'));
document.getElementById('view2d').addEventListener('click', () => setView('2d'));
document.getElementById('view3d').addEventListener('click', () => setView('3d'));
document.getElementById('fit').addEventListener('click', () => {
  makeCameras();
  attachControls();
  resize();
});
window.addEventListener('resize', resize);

renderer.domElement.addEventListener('click', (ev) => {
  selected = pickAt(ev.clientX, ev.clientY);
  paintStates();
  renderInspector(selected);
});

let hoverPending = false;
renderer.domElement.addEventListener('pointermove', (ev) => {
  if (hoverPending) return;
  hoverPending = true;
  const { clientX, clientY } = ev;
  requestAnimationFrame(() => {
    hoverPending = false;
    const next = pickAt(clientX, clientY);
    const changed = (next && next.cell_id) !== (hovered && hovered.cell_id);
    hovered = next;
    renderer.domElement.style.cursor = next ? 'pointer' : 'default';
    if (changed) paintStates();
  });
});

/* Test surface: the regression asserts what was drawn, so it reads the instance
   matrices back rather than the records they came from. */
function readInstances(name) {
  const pane = panes[name];
  const out = [];
  if (!pane.mesh) return out;
  const mtx = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (let i = 0; i < pane.instances.length; i += 1) {
    pane.mesh.getMatrixAt(i, mtx);
    mtx.decompose(pos, quat, scl);
    euler.setFromQuaternion(quat, 'YXZ');
    const cell = pane.instances[i];
    out.push({
      cell_id: cell.cell_id,
      zone_id: cell.zone_id,
      label: cell.reference_label,
      pane: name,
      frame: name === 'world' ? 'FLOOR1_WORLD_M' : 'EAP_LAYOUT_FRAME',
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
  ready: () => Boolean(payload && panes.world.mesh && panes.layout.mesh),
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
  // Only the panes actually on screen. A pane that is built but not visible is
  // not being drawn, and counting it would overstate what a viewer can see.
  drawnCells: () => visiblePanes().reduce((n, p) => n + panes[p].instances.length, 0),
  drawnMarkers: () => (markerMesh ? markerMesh.count : 0),
  batches: () => visiblePanes()
    .reduce((n, p) => n + panes[p].scene.children.filter((o) => o.isInstancedMesh).length, 0),
  geometries: () => renderer.info.memory.geometries,
  drawCalls: () => renderer.info.render.calls,
  triangles: () => renderer.info.render.triangles,
  fps: () => fps,
  drawn: () => visiblePanes().flatMap((p) => readInstances(p)),
  drawnIn: (name) => readInstances(name),
  units: () => (payload ? payload.machine_units : []),
  zoneList: () => (payload ? payload.zones : []),
  floorLoaded: () => Boolean(floor),
  panes: () => visiblePanes().map((n) => ({
    name: n,
    frame: n === 'world' ? 'FLOOR1_WORLD_M' : 'EAP_LAYOUT_FRAME',
    cells: panes[n].instances.length,
    rect: panes[n].rect,
  })),
  pick: (cellId) => {
    for (const name of ['world', 'layout']) {
      const cell = panes[name].instances.find((c) => c.cell_id === cellId);
      if (cell) {
        selected = cell;
        paintStates();
        renderInspector(cell);
        return cell;
      }
    }
    return null;
  },
  hover: (cellId) => {
    for (const name of ['world', 'layout']) {
      const cell = panes[name].instances.find((c) => c.cell_id === cellId);
      if (cell) {
        hovered = cell;
        paintStates();
        return cell;
      }
    }
    return null;
  },
  selection: () => selected,
  hovered: () => hovered,
};

tick();
load();
