import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const STATUS_META = {
  OFF: { label: 'Off', color: 0xa6a6a6 },
  DOWN: { label: 'Down', color: 0xff0000 },
  IDLE: { label: 'Idle', color: 0xffc000 },
  INITIAL_PM_STOP: { label: 'Initial,PM,Stop', color: 0x2f9dcc },
  RUN: { label: 'Run', color: 0x00ff00 },
  UNDEFINED: { label: 'Undefine', color: 0xffffff },
};
const DEFAULT_STATUS = 'UNDEFINED';
const DEFAULT_OUTLINE_COLOR = 0xcbd5e1;
const ALARM_OUTLINE_COLOR = 0xff003c;
const POLL_MS = 5000;
const SVG_NS = 'http://www.w3.org/2000/svg';

function apiColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''))
    ? Number.parseInt(String(value).slice(1), 16)
    : fallback;
}

const container = document.getElementById('scene');
const twoDContainer = document.getElementById('scene-2d');
const floorPlan2d = document.getElementById('floor-plan-2d');
const machineListEl = document.getElementById('machine-list');
const statusLine = document.getElementById('status-line');
const summaryLine = document.getElementById('summary-line');
const floorNameEl = document.getElementById('floor-name');
const bannerEl = document.getElementById('simulated-banner');
const resetViewButton = document.getElementById('reset-view');
const view2dButton = document.getElementById('view-2d');
const view3dButton = document.getElementById('view-3d');

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
const machines2dById = new Map();
let latestStateById = new Map();
let currentBounds = null;
let placementSummary = '';
let placementBannerText = '';
let placementNeedsWarning = true;
let currentView = new URLSearchParams(window.location.search).get('view') === '2d' ? '2d' : '3d';

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

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function zonePolygon(zone) {
  if (Array.isArray(zone.polygon) && zone.polygon.length >= 3) {
    return zone.polygon.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
  }
  const halfWidth = Number(zone.width) / 2;
  const halfDepth = Number(zone.depth) / 2;
  return [
    { x: Number(zone.center_x) - halfWidth, y: Number(zone.center_y) - halfDepth },
    { x: Number(zone.center_x) + halfWidth, y: Number(zone.center_y) - halfDepth },
    { x: Number(zone.center_x) + halfWidth, y: Number(zone.center_y) + halfDepth },
    { x: Number(zone.center_x) - halfWidth, y: Number(zone.center_y) + halfDepth },
  ];
}

function svgPolygonPoints(points) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function twoDViewBox(bounds = currentBounds) {
  if (!bounds) return null;
  const padding = Math.max(3, Math.max(bounds.width, bounds.depth) * 0.035);
  return [
    bounds.min_x - padding,
    bounds.min_y - padding,
    bounds.width + padding * 2,
    bounds.depth + padding * 2,
  ].join(' ');
}

function resetTwoDView() {
  const viewBox = twoDViewBox();
  if (viewBox) floorPlan2d.setAttribute('viewBox', viewBox);
}

function buildFloor2d(layout) {
  floorPlan2d.replaceChildren();
  machines2dById.clear();
  floorPlan2d.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  resetTwoDView();

  const zoneFillsLayer = svgElement('g', { 'aria-label': 'Floor zone fills' });
  const zoneOutlinesLayer = svgElement('g', { 'aria-label': 'Floor zone boundaries' });
  const zoneLabelsLayer = svgElement('g', { 'aria-label': 'Floor zone labels' });
  for (const zone of layout.zones || []) {
    const points = zonePolygon(zone);
    const pointList = svgPolygonPoints(points);
    zoneFillsLayer.appendChild(svgElement('polygon', {
      class: 'zone-fill-2d',
      points: pointList,
    }));
    zoneOutlinesLayer.appendChild(svgElement('polygon', {
      class: 'zone-outline-2d',
      points: pointList,
    }));
    const label = svgElement('text', {
      class: 'zone-label-2d',
      x: zone.label_x,
      y: zone.label_y,
    });
    label.textContent = zone.name;
    zoneLabelsLayer.appendChild(label);
  }
  floorPlan2d.append(zoneFillsLayer, zoneOutlinesLayer, zoneLabelsLayer);

  const machinesLayer = svgElement('g', { 'aria-label': 'Machine status markers' });
  for (const placement of layout.machines || []) {
    const width = Number(placement.width) || 3.2;
    const depth = Number(placement.depth) || 2.5;
    const centerX = Number(placement.pos_x) || 0;
    const centerY = Number(placement.pos_y) || 0;
    const rotationDeg = ((Number(placement.rot_y) || 0) * 180) / Math.PI;
    const group = svgElement('g', {
      class: 'machine-2d',
      'data-device-id': placement.device_id,
      transform: `rotate(${rotationDeg} ${centerX} ${centerY})`,
    });
    const title = svgElement('title');
    title.textContent = placement.display_name || placement.device_id;
    const rect = svgElement('rect', {
      class: 'machine-body-2d',
      x: centerX - width / 2,
      y: centerY - depth / 2,
      width,
      height: depth,
      rx: 0.22,
      fill: '#ffffff',
    });
    const label = svgElement('text', {
      class: 'machine-label-2d',
      x: centerX,
      y: centerY,
    });
    label.textContent = placement.display_name || placement.device_id;
    group.append(title, rect, label);
    group.addEventListener('click', () => {
      const url = drillDownUrl(placement.device_id);
      if (url) window.location.href = url;
    });
    group.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const url = drillDownUrl(placement.device_id);
      if (url) window.location.href = url;
    });
    machinesLayer.appendChild(group);
    machines2dById.set(placement.device_id, { group, rect, title });
  }
  floorPlan2d.appendChild(machinesLayer);
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
    const polygon = zonePolygon(zone);
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, -polygon[0].y);
    for (const point of polygon.slice(1)) shape.lineTo(point.x, -point.y);
    shape.closePath();
    const pad = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({
        color: zone.group.toLowerCase().includes('b') || zone.group.includes('3') ? 0x172554 : 0x16273b,
        roughness: 0.82,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -0.01;
    pad.renderOrder = 10;
    scene.add(pad);

    const boundaryPoints = polygon.map((point) => new THREE.Vector3(point.x, 0.05, point.y));
    boundaryPoints.push(boundaryPoints[0].clone());
    const boundary = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(boundaryPoints),
      new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.96 }),
    );
    boundary.renderOrder = 20;
    scene.add(boundary);

    const zoneLabel = makeTextSprite(zone.name, {
      fontSize: 25,
      scaleFactor: 0.022,
      bg: 'rgba(15, 23, 42, 0.94)',
      border: '#38bdf8',
    });
    zoneLabel.position.set(
      Number(zone.label_x) + zoneLabel.scale.x / 2 + 0.35,
      3.6,
      Number(zone.label_y) + 0.35,
    );
    zoneLabel.renderOrder = 25;
    scene.add(zoneLabel);
  }

  const verificationStatus = layout.floor?.verification_status || (layout.floor?.is_simulated ? 'DRAFT' : 'UNVERIFIED');
  const floorLabel = makeTextSprite(`${layout.floor?.name || 'Floor'} · ${verificationStatus}`, {
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
    const width = Number(placement.width) || 3.2;
    const height = Number(placement.height) || 1.45;
    const depth = Number(placement.depth) || 2.5;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: STATUS_META[DEFAULT_STATUS].color,
      roughness: 0.48,
      metalness: 0.08,
      emissive: STATUS_META[DEFAULT_STATUS].color,
      emissiveIntensity: 0.08,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(placement.pos_x, (Number(placement.pos_z) || 0) + height / 2, placement.pos_y);
    mesh.rotation.set(
      Number(placement.rot_x) || 0,
      Number(placement.rot_y) || 0,
      Number(placement.rot_z) || 0,
    );
    mesh.userData.deviceId = placement.device_id;
    mesh.renderOrder = 30;
    scene.add(mesh);
    const outline = addOutline(mesh, DEFAULT_OUTLINE_COLOR);
    outline.renderOrder = 35;

    machineMeshes.push(mesh);
    machinesById.set(placement.device_id, { mesh, material, outline });

    const idLabel = makeTextSprite(placement.display_name || placement.device_id, {
      fontSize: 21,
      scaleFactor: 0.018,
      bg: 'rgba(2, 6, 23, 0.90)',
    });
    idLabel.position.set(placement.pos_x, 2.15, placement.pos_y);
    idLabel.renderOrder = 40;
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

function setView(mode, { syncUrl = true } = {}) {
  currentView = mode === '2d' ? '2d' : '3d';
  const is2d = currentView === '2d';
  container.hidden = is2d;
  twoDContainer.hidden = !is2d;
  controls.enabled = !is2d;
  view2dButton.setAttribute('aria-pressed', String(is2d));
  view3dButton.setAttribute('aria-pressed', String(!is2d));
  resetViewButton.textContent = is2d ? 'Fit 2D' : 'Reset 3D';

  if (is2d) {
    resetTwoDView();
  } else {
    onResize();
    frameLayout();
  }

  if (syncUrl) {
    const url = new URL(window.location.href);
    if (is2d) url.searchParams.set('view', '2d');
    else url.searchParams.delete('view');
    window.history.replaceState({}, '', url);
  }
}

function applyPlacementMeta(layout) {
  const floor = layout.floor || {};
  floorNameEl.textContent = floor.name || 'Floor 1';
  const provisional = floor.verification_status !== 'APPROVED'
    || (layout.machines || []).some((machine) => machine.is_simulated);
  const inventoryStatus = floor.inventory_status || 'INVENTORY_NOT_DECLARED';
  placementSummary = `${(layout.machines || []).length} mapped assets · ${(layout.zones || []).length} zones · ${inventoryStatus}`;
  summaryLine.textContent = placementSummary;
  placementNeedsWarning = provisional;
  placementBannerText = provisional
    ? `${floor.name || 'FLOOR'} — DRAFT LOCAL LAYOUT; coordinates/inventory are not yet owner-approved`
    : `${floor.name || 'FLOOR'} — APPROVED LAYOUT`;
  bannerEl.hidden = !placementNeedsWarning;
  bannerEl.textContent = placementBannerText;
}

function applyStatusModeMeta(payload) {
  const simulated = payload.status_mode?.simulated === true;
  document.body.classList.toggle('mock-status', simulated);
  bannerEl.hidden = simulated ? false : !placementNeedsWarning;
  bannerEl.textContent = simulated
    ? `SIMULATED STATUS — NOT PRODUCTION · ${placementBannerText}`
    : placementBannerText;
  return simulated;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function drillDownUrl(deviceId) {
  const state = latestStateById.get(deviceId);
  if (!state?.drilldown_enabled) return null;
  const sourceId = state.source_id || deviceId;
  const params = new URLSearchParams({
    'var-machine_id': sourceId,
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
      params.set('var-clicked_series', sourceId);
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
  const url = deviceId ? drillDownUrl(deviceId) : null;
  if (url) window.location.href = url;
});

renderer.domElement.addEventListener('pointermove', (event) => {
  const deviceId = pickMachine(event);
  renderer.domElement.style.cursor = deviceId && drillDownUrl(deviceId) ? 'pointer' : 'default';
});

view2dButton.addEventListener('click', () => setView('2d'));
view3dButton.addEventListener('click', () => setView('3d'));
resetViewButton.addEventListener('click', () => {
  if (currentView === '2d') resetTwoDView();
  else frameLayout();
});

const ERROR_CATEGORY_LABEL = Object.freeze({
  SAFETY: 'Safety system',
  SPINDLE_TOOL: 'Spindle / tool',
  AXIS: 'X/Y/Z axis',
  PROGRAM_TOOL_TABLE: 'Program / tool table',
  UNKNOWN: 'Unclassified',
});

const ERROR_PHASE_LABEL = Object.freeze({
  STARTUP: 'Startup',
  HOME_RESET: 'Home / reset',
  PROGRAM_SELECTION: 'Program selection',
  TOOL_CHANGE_MEASUREMENT: 'Tool change / measurement',
  DRILLING: 'Drilling',
  UNKNOWN: 'Phase unknown',
});

const ERROR_RISK_LABEL = Object.freeze({
  STOP_AND_SECURE: 'Stop and secure',
  STOP_AND_INSPECT: 'Stop and inspect',
  VALIDATE_BEFORE_RESTART: 'Validate before restart',
  REVIEW_REQUIRED: 'Review required',
});

function formatStatusTime(value) {
  if (!value) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  return timestamp.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function stateRowHtml(row) {
  const state = row.operational_state || row.state || DEFAULT_STATUS;
  const meta = STATUS_META[state] || STATUS_META[DEFAULT_STATUS];
  const colorValue = apiColor(row.state_color, meta.color);
  const color = `#${colorValue.toString(16).padStart(6, '0')}`;
  const label = row.state_label || meta.label;
  const alarmText = row.alarm
    ? `${row.alarm.count} ${row.alarm.count === 1 ? 'ALARM' : 'ALARMS'} · ${escapeHtml(row.alarm.owner)} · ${escapeHtml(row.alarm.elapsed)}`
    : 'No active critical/major alarm';
  const errorCode = row.latest_error?.code
    ? `E${String(row.latest_error.code).replace(/^E/i, '')}`
    : null;
  const errorText = row.latest_error
    ? `Latest error record ${escapeHtml(errorCode || '—')} · history only`
    : '';
  const errorCategory = row.latest_error
    ? ERROR_CATEGORY_LABEL[row.latest_error.category] || ERROR_CATEGORY_LABEL.UNKNOWN
    : '';
  const errorPhase = row.latest_error
    ? ERROR_PHASE_LABEL[row.latest_error.phase] || ERROR_PHASE_LABEL.UNKNOWN
    : '';
  const errorRisk = row.latest_error
    ? ERROR_RISK_LABEL[row.latest_error.risk] || ERROR_RISK_LABEL.REVIEW_REQUIRED
    : '';
  const errorDetail = row.latest_error
    ? [row.latest_error.description || row.latest_error.message, row.latest_error.troubleshooting]
      .filter(Boolean)
      .join(' · ')
    : '';
  const statusTime = formatStatusTime(row.state_updated_at);
  const sourcePolicy = row.state_freshness_policy === 'LATEST_KNOWN'
    ? 'LATEST KNOWN'
    : row.state_confidence || 'SOURCE';
  const disabled = row.drilldown_enabled ? '' : ' disabled';
  const ariaLabel = row.drilldown_enabled
    ? `Open ${row.device_id} snapshot`
    : `${row.device_id} has no connected drill-down source`;
  return `
    <button class="machine-row${row.alarm ? ' has-alarm' : ''}" type="button" data-device-id="${escapeHtml(row.device_id)}" aria-label="${escapeHtml(ariaLabel)}"${disabled}>
      <span class="machine-row-top">
        <span class="mini-pill" style="background:${color}">${escapeHtml(label)}</span>
        <span class="machine-id">${escapeHtml(row.device_id)}</span>
      </span>
      <span class="machine-row-detail">
        <span>${escapeHtml(row.board_no ?? '—')} / ${escapeHtml(row.total_board ?? '—')} bd</span>
        <span>${escapeHtml(row.mo || '—')}</span>
      </span>
      <span class="machine-row-basis">${escapeHtml(sourcePolicy)} · ${escapeHtml(row.state_basis || 'configured source')}</span>
      ${statusTime ? `<span class="machine-row-time">Last status: ${escapeHtml(statusTime)}</span>` : ''}
      <span class="machine-row-alarm">${alarmText}</span>
      ${errorText ? `
        <span class="machine-row-error" title="${escapeHtml(errorDetail)}">${errorText}</span>
        <span class="machine-row-error-meta">
          <span>${escapeHtml(errorCategory)}</span>
          <span>${escapeHtml(errorPhase)}</span>
        </span>
        <span class="machine-row-error-action">Action: ${escapeHtml(errorRisk)}</span>
      ` : ''}
    </button>`;
}

machineListEl.addEventListener('click', (event) => {
  const row = event.target.closest('[data-device-id]');
  const url = row ? drillDownUrl(row.dataset.deviceId) : null;
  if (url) window.location.href = url;
});

function applyState(payload) {
  const rows = payload.machines || [];
  const simulated = applyStatusModeMeta(payload);
  latestStateById = new Map(rows.map((row) => [row.device_id, row]));

  for (const [deviceId, entry] of machinesById.entries()) {
    const row = latestStateById.get(deviceId);
    const state = row?.operational_state || row?.state || DEFAULT_STATUS;
    const fallbackColor = (STATUS_META[state] || STATUS_META[DEFAULT_STATUS]).color;
    const color = apiColor(row?.state_color, fallbackColor);
    entry.material.color.setHex(color);
    entry.material.emissive.setHex(color);
    entry.material.emissiveIntensity = state === 'DOWN' || row?.alarm ? 0.22 : 0.08;
    entry.outline.material.color.setHex(row?.alarm ? ALARM_OUTLINE_COLOR : DEFAULT_OUTLINE_COLOR);
    entry.outline.scale.setScalar(row?.alarm ? 1.08 : 1);

    const entry2d = machines2dById.get(deviceId);
    if (entry2d) {
      const hexColor = `#${color.toString(16).padStart(6, '0')}`;
      entry2d.rect.setAttribute('fill', hexColor);
      entry2d.group.classList.toggle('has-alarm', Boolean(row?.alarm));
      entry2d.group.classList.toggle('is-clickable', Boolean(row?.drilldown_enabled));
      if (row?.drilldown_enabled) {
        entry2d.group.setAttribute('role', 'link');
        entry2d.group.setAttribute('tabindex', '0');
      } else {
        entry2d.group.removeAttribute('role');
        entry2d.group.removeAttribute('tabindex');
      }
      const lastError = row?.latest_error?.code
        ? ` · latest error E${String(row.latest_error.code).replace(/^E/i, '')} (history only)`
        : '';
      entry2d.title.textContent = `${deviceId} · ${row?.state_label || state}${row?.alarm ? ` · ${row.alarm.count} alarm` : ''}${lastError}`;
    }
  }

  machineListEl.innerHTML = rows.map(stateRowHtml).join('');
  const alarmCount = rows.filter((row) => row.alarm).length;
  const downCount = rows.filter((row) => (row.operational_state || row.state) === 'DOWN').length;
  const undefinedCount = rows.filter((row) => (row.operational_state || row.state) === 'UNDEFINED').length;
  summaryLine.textContent = `${simulated ? 'SIMULATED STATUS · ' : ''}${placementSummary} · ${downCount} DOWN · ${alarmCount} ALARM overlay · ${undefinedCount} UNDEFINE`;
  statusLine.textContent = `${simulated ? 'Mock preview' : 'Database/API'} update: ${new Date(payload.queried_at).toLocaleTimeString()}`;
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
    if (layout.geometry_validation?.valid === false) {
      throw new Error(`unsafe layout geometry (${layout.geometry_validation.conflicts?.length || 0} conflicts)`);
    }
    applyPlacementMeta(layout);
    buildFloor(layout);
    buildMachines(layout.machines || []);
    buildFloor2d(layout);
    frameLayout(layout.bounds);
    setView(currentView, { syncUrl: false });
  } catch (error) {
    statusLine.textContent = `Placement fetch failed: ${error.message}`;
    statusLine.classList.add('error');
  }

  await pollState();
  setInterval(pollState, POLL_MS);
  window.__twinBootMs = performance.now() - startedAt;
  window.__twin = {
    camera,
    controls,
    scene,
    renderer,
    machineMeshes,
    machines2dById,
    frameLayout,
    setView,
  };
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
  if (currentView !== '3d') return;
  controls.update();
  renderer.render(scene, camera);
}

boot();
animate();
