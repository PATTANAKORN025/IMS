import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const STATE_COLORS = {
  0: 0x64748b, // NO_DATA
  1: 0xf59e0b, // IDLE
  2: 0x22c55e, // OK
  3: 0xef4444, // ALARM
};
const STATE_LABELS = ['NO_DATA', 'IDLE', 'OK', 'ALARM'];
const POLL_MS = 5000;

const container = document.getElementById('scene');
const machineListEl = document.getElementById('machine-list');
const statusLine = document.getElementById('status-line');
const summaryLine = document.getElementById('summary-line');
const floorNameEl = document.getElementById('floor-name');
const bannerEl = document.getElementById('simulated-banner');
const resetViewButton = document.getElementById('reset-view');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, 85, 170);

const camera = new THREE.PerspectiveCamera(47, window.innerWidth / window.innerHeight, 0.1, 300);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 12;
controls.maxDistance = 180;
controls.maxPolarAngle = Math.PI * 0.48;

scene.add(new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 1.4));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
keyLight.position.set(24, 46, 18);
scene.add(keyLight);

const machineMeshes = [];
const machinesById = new Map();
let latestStateById = new Map();
let currentBounds = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function makeTextSprite(text, {
  fontSize = 30,
  scaleFactor = 0.024,
  bg = 'rgba(15, 23, 42, 0.88)',
  fg = '#e2e8f0',
  border = '#475569',
} = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = Math.ceil(metrics.width) + 34;
  canvas.height = fontSize + 24;

  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
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

function addOutline(mesh, color = 0x475569) {
  const edges = new THREE.EdgesGeometry(mesh.geometry);
  const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color }));
  outline.position.copy(mesh.position);
  outline.rotation.copy(mesh.rotation);
  scene.add(outline);
  return outline;
}

function buildFloor(layout) {
  const bounds = layout.bounds || {
    min_x: -10,
    max_x: 10,
    min_y: -8,
    max_y: 8,
    width: 20,
    depth: 16,
    center_x: 0,
    center_y: 0,
  };
  currentBounds = bounds;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(bounds.width, 0.35, bounds.depth),
    new THREE.MeshStandardMaterial({ color: 0x111c2f, roughness: 0.92, metalness: 0.05 }),
  );
  slab.position.set(bounds.center_x, -0.25, bounds.center_y);
  scene.add(slab);
  addOutline(slab, 0x38bdf8);

  const gridSize = Math.ceil(Math.max(bounds.width, bounds.depth) / 10) * 10;
  const grid = new THREE.GridHelper(gridSize, Math.max(10, gridSize / 2), 0x334155, 0x1e293b);
  grid.position.set(bounds.center_x, -0.06, bounds.center_y);
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  gridMaterials.forEach((material) => {
    material.transparent = true;
    material.opacity = 0.55;
  });
  scene.add(grid);

  for (const zone of layout.zones || []) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(zone.width, 0.12, zone.depth),
      new THREE.MeshStandardMaterial({
        color: zone.group.toLowerCase().includes('b') || zone.group.includes('3') ? 0x172554 : 0x16273b,
        roughness: 0.82,
        transparent: true,
        opacity: 0.92,
      }),
    );
    pad.position.set(zone.center_x, 0, zone.center_y);
    scene.add(pad);
    addOutline(pad, 0x475569);

    const zoneLabel = makeTextSprite(zone.name, {
      fontSize: 25,
      scaleFactor: 0.022,
      bg: 'rgba(15, 23, 42, 0.94)',
      border: '#38bdf8',
    });
    zoneLabel.position.set(zone.center_x, 4.1, zone.center_y - zone.depth / 2 + 1.8);
    scene.add(zoneLabel);
  }

  const floorLabel = makeTextSprite(`${layout.floor?.name || 'Floor 1'} · PROVISIONAL LOGICAL LAYOUT`, {
    fontSize: 28,
    scaleFactor: 0.026,
    bg: 'rgba(2, 6, 23, 0.94)',
    fg: '#7dd3fc',
    border: '#0ea5e9',
  });
  floorLabel.position.set(bounds.min_x + 13, 1.2, bounds.min_y + 1.5);
  scene.add(floorLabel);
}

function buildMachines(placements) {
  for (const placement of placements) {
    const geometry = new THREE.BoxGeometry(3.2, 1.45, 2.5);
    const material = new THREE.MeshStandardMaterial({
      color: STATE_COLORS[0],
      roughness: 0.48,
      metalness: 0.08,
      emissive: STATE_COLORS[0],
      emissiveIntensity: 0.08,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(placement.pos_x, 0.8, placement.pos_y);
    mesh.userData.deviceId = placement.device_id;
    scene.add(mesh);
    addOutline(mesh, 0xcbd5e1);

    machineMeshes.push(mesh);
    machinesById.set(placement.device_id, { mesh, material });

    const idLabel = makeTextSprite(placement.device_id, {
      fontSize: 21,
      scaleFactor: 0.018,
      bg: 'rgba(2, 6, 23, 0.90)',
    });
    idLabel.position.set(placement.pos_x, 2.15, placement.pos_y);
    scene.add(idLabel);
  }
}

function frameLayout(bounds = currentBounds) {
  if (!bounds) return;
  const span = Math.max(bounds.width, bounds.depth);
  controls.target.set(bounds.center_x + span * 0.08, 0.5, bounds.center_y);
  camera.position.set(
    bounds.center_x + span * 0.48,
    Math.max(32, span * 0.82),
    bounds.center_y + span * 0.82,
  );
  camera.near = 0.1;
  camera.far = Math.max(300, span * 5);
  camera.updateProjectionMatrix();
  controls.update();
}

function applyPlacementMeta(layout) {
  const floor = layout.floor || {};
  floorNameEl.textContent = floor.name || 'Floor 1';
  const simulated = (layout.machines || []).some((machine) => machine.is_simulated);
  bannerEl.hidden = !simulated;
  bannerEl.textContent = simulated
    ? 'PROVISIONAL FLOOR 1 LAYOUT — logical grouping from device registry; not surveyed physical coordinates'
    : 'VERIFIED FLOOR 1 LAYOUT';
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function drillDownUrl(deviceId) {
  const state = latestStateById.get(deviceId);
  const params = new URLSearchParams({
    'var-machine_id': deviceId,
    from: 'now-6h',
    to: 'now',
  });
  if (state?.factory !== null && state?.factory !== undefined && String(state.factory).trim() !== '') {
    params.set('var-factory', state.factory);
  }
  if (state?.alarm?.related_log_id) {
    params.set('var-log_id', state.alarm.related_log_id);
    if (state.alarm.logdate_ms) {
      params.set('var-event_time_ms', state.alarm.logdate_ms);
      params.set('var-clicked_series', deviceId);
    }
  }
  return `/d/ims-ldi-machine-snapshot/set2-machine-snapshot?${params.toString()}`;
}

function pickMachine(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(machineMeshes, false);
  return hits.length > 0 ? hits[0].object.userData.deviceId : null;
}

renderer.domElement.addEventListener('click', (event) => {
  const deviceId = pickMachine(event);
  if (deviceId) window.location.href = drillDownUrl(deviceId);
});

renderer.domElement.addEventListener('pointermove', (event) => {
  renderer.domElement.style.cursor = pickMachine(event) ? 'pointer' : 'default';
});

resetViewButton.addEventListener('click', () => frameLayout());

function stateRowHtml(row) {
  const color = `#${(STATE_COLORS[row.state] ?? STATE_COLORS[0]).toString(16).padStart(6, '0')}`;
  const label = row.state_label || STATE_LABELS[row.state] || 'NO_DATA';
  const alarmText = row.alarm
    ? `${row.alarm.count} ${row.alarm.count === 1 ? 'ALARM' : 'ALARMS'} · ${escapeHtml(row.alarm.owner)} · ${escapeHtml(row.alarm.elapsed)}`
    : 'No active critical/major alarm';
  return `
    <button class="machine-row" type="button" data-device-id="${escapeHtml(row.device_id)}" aria-label="Open ${escapeHtml(row.device_id)} snapshot">
      <span class="machine-row-top">
        <span class="mini-pill" style="background:${color}">${escapeHtml(label)}</span>
        <span class="machine-id">${escapeHtml(row.device_id)}</span>
      </span>
      <span class="machine-row-detail">
        <span>${escapeHtml(row.board_no ?? '—')} / ${escapeHtml(row.total_board ?? '—')} bd</span>
        <span>${escapeHtml(row.mo || '—')}</span>
      </span>
      <span class="machine-row-alarm">${alarmText}</span>
    </button>`;
}

machineListEl.addEventListener('click', (event) => {
  const row = event.target.closest('[data-device-id]');
  if (row) window.location.href = drillDownUrl(row.dataset.deviceId);
});

function applyState(payload) {
  const rows = payload.machines || [];
  latestStateById = new Map(rows.map((row) => [row.device_id, row]));

  for (const [deviceId, entry] of machinesById.entries()) {
    const row = latestStateById.get(deviceId);
    const color = row ? (STATE_COLORS[row.state] ?? STATE_COLORS[0]) : STATE_COLORS[0];
    entry.material.color.setHex(color);
    entry.material.emissive.setHex(color);
    entry.material.emissiveIntensity = row?.state === 3 ? 0.22 : 0.08;
  }

  machineListEl.innerHTML = rows.map(stateRowHtml).join('');
  const alarmCount = rows.filter((row) => row.state === 3).length;
  const noDataCount = rows.filter((row) => row.state === 0).length;
  summaryLine.textContent = `${rows.length} machines · ${alarmCount} ALARM · ${noDataCount} NO DATA`;
  statusLine.textContent = `Database/API update: ${new Date(payload.queried_at).toLocaleTimeString()}`;
  statusLine.classList.remove('error');
}

async function pollState() {
  try {
    const response = await fetch('api/state');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    applyState(await response.json());
  } catch (error) {
    statusLine.textContent = `State fetch failed: ${error.message}`;
    statusLine.classList.add('error');
  }
}

async function boot() {
  const startedAt = performance.now();
  try {
    const response = await fetch('api/placement');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const layout = await response.json();
    applyPlacementMeta(layout);
    buildFloor(layout);
    buildMachines(layout.machines || []);
    frameLayout(layout.bounds);
  } catch (error) {
    statusLine.textContent = `Placement fetch failed: ${error.message}`;
    statusLine.classList.add('error');
  }

  await pollState();
  setInterval(pollState, POLL_MS);
  window.__twinBootMs = performance.now() - startedAt;
  window.__twin = { camera, controls, scene, renderer, machineMeshes, frameLayout };
}

function onResize() {
  const { width, height } = container.getBoundingClientRect();
  if (width <= 0 || height <= 0) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener('resize', onResize);
const resizeObserver = new ResizeObserver(onResize);
resizeObserver.observe(container);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

boot();
animate();
