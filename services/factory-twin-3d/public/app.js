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

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
// Target offset +14 on X (not 0) so the default view keeps the leftmost
// zone (Site A - Zone 1) clear of the fixed-position HUD sidebar,
// which covers roughly the left 280px of the viewport and would otherwise
// intercept clicks meant for the 3D canvas underneath it -- a real,
// discovered-via-screenshot issue, not a hypothetical one. Users can still
// freely pan/rotate anywhere via OrbitControls; this only changes the
// initial framing.
controls.target.set(14, 0.5, 0);

// Floor grid -- purely orientation, not real factory floor data. Sized up
// from Task 4.1's 20x20 to cover the full 10-machine/5-zone spread.
const grid = new THREE.GridHelper(100, 40, 0x334155, 0x1e293b);
scene.add(grid);

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
    scene.add(shell);

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
    scene.add(outline);

    const label = makeTextSprite(floor.floor_label, { fontSize: 22, scaleFactor: 0.02, bg: 'rgba(245, 158, 11, 0.85)', fg: '#1c1305' });
    label.position.set(cx, 9, minY - 2);
    scene.add(label);
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
function buildPhysicalSlots(geometry) {
  if (!geometry || !geometry.envelope) return;

  const { envelope, columns, zones, slots } = geometry;

  const envelopeGeom = new THREE.BoxGeometry(envelope.width, envelope.height, envelope.depth);
  const envelopeEdges = new THREE.EdgesGeometry(envelopeGeom);
  const envelopeOutline = new THREE.LineSegments(envelopeEdges, new THREE.LineBasicMaterial({ color: 0x334155 }));
  envelopeOutline.position.set(0, envelope.height / 2, 0);
  scene.add(envelopeOutline);

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
  for (const col of columns || []) {
    const w = col.footprint?.width ?? 0.3;
    const dpt = col.footprint?.depth ?? 0.3;
    const colGeom = new THREE.BoxGeometry(w, envelope.height, dpt);
    const color = col.confidence === 'medium' ? 0x1e293b : 0x334155;
    const colMesh = new THREE.Mesh(colGeom, new THREE.MeshStandardMaterial({ color }));
    colMesh.position.set(col.position.x, envelope.height / 2, col.position.z);
    scene.add(colMesh);
  }

  for (const zone of zones || []) {
    const b = zone.bounds;
    const zoneGeom = new THREE.BoxGeometry(b.width, 0.05, b.depth);
    const zoneEdges = new THREE.EdgesGeometry(zoneGeom);
    // Dashed-looking dim slate, distinct from the real-device zone
    // outlines' brighter 0x475569 -- these are anonymous/unmapped zones,
    // should read as visually secondary.
    const zoneOutline = new THREE.LineSegments(zoneEdges, new THREE.LineBasicMaterial({ color: 0x1e293b }));
    zoneOutline.position.set(b.x + b.width / 2, 0.02, b.z + b.depth / 2);
    scene.add(zoneOutline);
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
  for (const slot of slots || []) {
    const h = slot.footprint.height;
    const geom = new THREE.BoxGeometry(slot.footprint.width, h, slot.footprint.depth);
    // Flat, dim, unlit-looking gray -- deliberately unlike the bright,
    // state-colored real device boxes. No label, no userData.deviceId,
    // never pushed to machineMeshes: nothing about this mesh is clickable
    // or implies a live device.
    const mat = new THREE.MeshBasicMaterial({
      color: 0x334155,
      transparent: true,
      opacity: slot.confidence === 'medium' ? 0.32 : 0.5,
    });
    const mesh = new THREE.Mesh(geom, mat);
    // Sit the pad ON the floor. position.y is the slot's floor reference (0),
    // and a box is centred on its origin, so without the half-height offset
    // the lower half renders below the floor plane.
    mesh.position.set(slot.position.x, slot.position.y + h / 2, slot.position.z);
    scene.add(mesh);
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
    scene.add(plate);

    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(verts.map((v) => new THREE.Vector3(v.x, floorY + 0.01, v.z))),
      new THREE.LineBasicMaterial({ color: style.line })
    );
    scene.add(outline);
    drawn++;
  }
  return drawn;
}

// ── Machine meshes (populated once /api/placement resolves) ─────
const machineMeshes = []; // THREE.Mesh[], one per machine, userData.deviceId set
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
    scene.add(mesh);

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
    scene.add(idLabel);
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
    scene.add(outline);

    const label = makeTextSprite(zoneName, { fontSize: 26, scaleFactor: 0.02, bg: 'rgba(15, 23, 42, 0.85)' });
    label.position.set(avgX, 5.5, avgY);
    scene.add(label);
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

function pickMachine(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  // intersectObjects (plural) against the full 10-mesh array -- the hit
  // list is sorted nearest-first by Three.js, so hits[0] is the correct
  // single machine actually under the cursor, not just "any click hits
  // LDI-01" (verified this is genuinely per-mesh below in the report).
  const hits = raycaster.intersectObjects(machineMeshes, false);
  return hits.length > 0 ? hits[0].object.userData.deviceId : null;
}

renderer.domElement.addEventListener('click', (event) => {
  const deviceId = pickMachine(event);
  if (deviceId) {
    window.location.href = drillDownUrl(deviceId);
  }
});

renderer.domElement.addEventListener('pointermove', (event) => {
  const deviceId = pickMachine(event);
  renderer.domElement.style.cursor = deviceId ? 'pointer' : 'default';
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
  window.__twin = { camera, controls, scene, renderer, machineMeshes };
}

boot();

// ── Render loop ──────────────────────────────────────────────
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
