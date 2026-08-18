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

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Same 4-color-token system as ims-ldi-factory-digital-twin.json / the
// Andon panel -- copied verbatim, not reinvented. Confirmed directly in
// Task 4.1's app.js before extending: "icon semantics" in this build is
// (a) the box's material color and (b) the HUD's #state-pill background +
// text label -- there is no separate 3D icon mesh anywhere in the Task 4.1
// build, so none is introduced here either.
const STATE_COLORS = {
  0: 0x64748b, // NO_DATA
  1: 0xf59e0b, // IDLE
  2: 0x22c55e, // OK
  3: 0xef4444, // ALARM
};
const STATE_LABELS = ['NO_DATA', 'IDLE', 'OK', 'ALARM'];

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
// zone (Factory 2 - DF INNER) clear of the fixed-position HUD sidebar,
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

// ── Machine meshes (populated once /api/placement resolves) ─────
const machineMeshes = []; // THREE.Mesh[], one per machine, userData.deviceId set
const machinesById = new Map(); // deviceId -> { mesh, material }
let latestStateById = new Map(); // deviceId -> state row from /api/state

function buildScene(placements) {
  const zoneGroups = new Map(); // zone name -> [{pos_x, pos_y}]
  for (const p of placements) {
    if (!zoneGroups.has(p.zone)) zoneGroups.set(p.zone, []);
    zoneGroups.get(p.zone).push(p);
  }

  for (const p of placements) {
    const geometry = new THREE.BoxGeometry(1.5, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: STATE_COLORS[0] });
    const mesh = new THREE.Mesh(geometry, material);
    // Design §4 grid shape: x/y from the simulated placement, mapped to the
    // Three.js floor plane (X, Z) with Y fixed as the vertical box height.
    mesh.position.set(p.pos_x, 0.5, p.pos_y);
    mesh.userData.deviceId = p.device_id;
    scene.add(mesh);

    machineMeshes.push(mesh);
    machinesById.set(p.device_id, { mesh, material });

    // Per-machine ID label, small sprite just above the box, distinct from
    // the larger zone-level label -- helps identify which box is which
    // before/without opening the HUD list. Small font + tight scaleFactor
    // (re-tuned from a first pass that overlapped at 12-unit zone spacing)
    // so 2 machine labels 8 units apart stay legible and non-overlapping.
    const idLabel = makeTextSprite(p.device_id, { fontSize: 20, scaleFactor: 0.016 });
    idLabel.position.set(p.pos_x, 1.5, p.pos_y);
    scene.add(idLabel);
  }

  // Zone labels float well above the machine-ID labels (y=5.5 vs y=1.5) so
  // the two label layers never visually collide, and are wide enough at
  // 18-unit zone spacing (re-tuned from the first pass's 12) to render
  // without touching their neighbors.
  for (const [zoneName, members] of zoneGroups) {
    const avgX = members.reduce((sum, m) => sum + m.pos_x, 0) / members.length;
    const avgY = members.reduce((sum, m) => sum + m.pos_y, 0) / members.length;
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
  return `/d/ims-ldi-machine-snapshot/set2-machine-snapshot?var-machine_id=${encodeURIComponent(deviceId)}&var-factory=${encodeURIComponent(factory)}&from=now-6h&to=now`;
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
  const color = `#${(STATE_COLORS[row.state] ?? STATE_COLORS[0]).toString(16).padStart(6, '0')}`;
  const label = row.state_label || STATE_LABELS[row.state] || 'NO_DATA';
  const alarmText = row.alarm ? `${row.alarm.count} ${row.alarm.count === 1 ? 'ALARM' : 'ALARMS'} · ${row.alarm.owner} · ${row.alarm.elapsed}` : '—';
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
      <div class="machine-row-alarm">${alarmText}</div>
    </div>`;
}

function applyState(payload) {
  const rows = payload.machines || [];
  latestStateById = new Map(rows.map((r) => [r.device_id, r]));

  for (const row of rows) {
    const entry = machinesById.get(row.device_id);
    if (!entry) continue; // shouldn't happen -- placement and state device sets should match exactly
    const color = STATE_COLORS[row.state] ?? STATE_COLORS[0];
    entry.material.color.setHex(color);
  }

  machineListEl.innerHTML = rows.map(stateRowHtml).join('');

  const alarmCount = rows.filter((r) => r.state === 3).length;
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
    buildScene(data.machines || []);
  } catch (err) {
    statusLine.textContent = `Placement fetch failed: ${err.message}`;
    statusLine.classList.add('error');
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
