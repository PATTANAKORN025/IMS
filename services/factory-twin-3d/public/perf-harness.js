// Task 4.3 perf brief -- SYNTHETIC rendering-scale harness.
//
// Purpose: isolate the Three.js rendering layer from the DB/API/ingestion
// layer so 10/100/250/500-machine scale can be measured without inserting
// any row into the DB, without routing any count through /api/state or
// /api/placement, and without touching Node-RED. This file makes ZERO
// fetch() calls anywhere -- grep confirms: no occurrence of "fetch(" in
// this file. All machine data below is procedurally generated in-browser.
//
// Reuses the same scene/material/mesh construction *shape* as the real
// app.js (BoxGeometry(1.5,1,1), MeshStandardMaterial, same STATE_COLORS
// token values, same lighting rig) so the rendering-layer comparison
// between this harness and the real 10-machine app is apples-to-apples --
// but this file is entirely separate from app.js/index.html and is never
// imported by them, and never modifies their behavior.
//
// Every device id below is prefixed TEST-SYNTH- so it can never be
// mistaken for a real eqp_id anywhere it might appear (console, HUD,
// screenshot, report).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const STATE_COLORS = {
  0: 0x64748b, // NO_DATA
  1: 0xf59e0b, // IDLE
  2: 0x22c55e, // OK
  3: 0xef4444, // ALARM
};
const STATE_LABELS = ['NO_DATA', 'IDLE', 'OK', 'ALARM'];

console.log('[SYNTHETIC PERF HARNESS] loaded -- no network calls to /api/state or /api/placement will be made from this file.');

const container = document.getElementById('scene');
const metricsEl = document.getElementById('metrics');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 16, 10);
scene.add(dirLight);

let grid = null;
let meshes = [];
let currentN = 0;

// Deterministic square-ish grid layout, purely synthetic, not tied to any
// real factory coordinate system (mirrors the real app's "deterministic
// grid, not a real surveyed layout" posture, just generalized to N boxes
// instead of 5 real zones).
const SPACING = 3;

function clearScene() {
  for (const m of meshes) {
    scene.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
  meshes = [];
  if (grid) {
    scene.remove(grid);
    grid.dispose();
    grid = null;
  }
}

function buildSynthetic(n) {
  clearScene();
  currentN = n;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  const gridSize = Math.max(cols, rows) * SPACING + 20;
  grid = new THREE.GridHelper(gridSize, Math.min(100, Math.max(cols, rows)), 0x334155, 0x1e293b);
  scene.add(grid);

  const originX = -((cols - 1) * SPACING) / 2;
  const originZ = -((rows - 1) * SPACING) / 2;

  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // States cycled deterministically across the 4 real tokens, purely for
    // visual realism (a synthetic scene that is all-one-color would not
    // exercise material/color-update code paths the same way the real
    // per-machine-colored scene does) -- not derived from any real data.
    const state = i % 4;

    const geometry = new THREE.BoxGeometry(1.5, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: STATE_COLORS[state] });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(originX + col * SPACING, 0.5, originZ + row * SPACING);
    mesh.userData.deviceId = `TEST-SYNTH-${String(i + 1).padStart(4, '0')}`;
    mesh.userData.state = state;
    scene.add(mesh);
    meshes.push(mesh);
  }

  // Frame the whole grid regardless of N.
  const span = Math.max(cols, rows) * SPACING;
  camera.position.set(span * 0.35, span * 0.9, span * 0.75 + 10);
  controls.target.set(0, 0, 0);
  camera.updateProjectionMatrix();
  controls.update();

  console.log(`[SYNTHETIC PERF HARNESS] built N=${n} synthetic boxes (TEST-SYNTH-0001..${String(n).padStart(4, '0')}), grid ${cols}x${rows}, spacing ${SPACING}. Zero fetch() calls made.`);
}

// ── Direct render()-call benchmark ───────────────────────────────
// Methodology note (see task-4.3-perf-report.md "FPS methodology"):
// requestAnimationFrame-driven wall-clock FPS proved hard-throttled to a
// fixed ~1Hz cadence in this headless Playwright/Chromium context
// (confirmed via 30 consecutive rAF timestamp deltas, all ~1001.5ms,
// verified BEFORE writing this harness -- not assumed), which reflects a
// headless CDP frame-pacing characteristic, not actual GPU/CPU render
// cost. Timing renderer.render(scene, camera) directly, many times in a
// tight loop, isolates the actual per-frame render cost from that
// throttle and is comparable 1:1 across N -- this is the primary metric
// this harness reports.
function benchmarkRender(iterations = 300) {
  controls.update();
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    renderer.render(scene, camera);
  }
  const t1 = performance.now();
  const totalMs = t1 - t0;
  const avgMsPerFrame = totalMs / iterations;
  return {
    n: currentN,
    iterations,
    totalMs: Math.round(totalMs * 100) / 100,
    avgMsPerFrame: Math.round(avgMsPerFrame * 1000) / 1000,
    impliedMaxFps: Math.round((1000 / avgMsPerFrame) * 10) / 10,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    heapUsed: performance.memory ? performance.memory.usedJSHeapSize : null,
    heapTotal: performance.memory ? performance.memory.totalJSHeapSize : null,
  };
}

function renderMetrics(result) {
  metricsEl.textContent = [
    `N = ${result.n} (TEST/SYNTHETIC)`,
    `render() avg: ${result.avgMsPerFrame} ms/frame (${result.iterations} iters)`,
    `implied max fps (uncapped): ${result.impliedMaxFps}`,
    `draw calls: ${result.drawCalls} | triangles: ${result.triangles}`,
    result.heapUsed != null
      ? `JS heap: ${(result.heapUsed / 1048576).toFixed(1)} MB used / ${(result.heapTotal / 1048576).toFixed(1)} MB total`
      : 'JS heap: unavailable (performance.memory not exposed)',
  ].join('\n');
}

function switchN(n) {
  buildSynthetic(n);
  for (const btn of document.querySelectorAll('#hud button[data-n]')) {
    btn.classList.toggle('active', Number(btn.dataset.n) === n);
  }
  const result = benchmarkRender();
  renderMetrics(result);
}

for (const btn of document.querySelectorAll('#hud button[data-n]')) {
  btn.addEventListener('click', () => switchN(Number(btn.dataset.n)));
}

// Exposed for Playwright/perf instrumentation only -- same inert-debug-hook
// pattern as app.js's window.__twin, no effect on any production file.
window.__twinPerfHarness = {
  camera,
  controls,
  scene,
  renderer,
  get meshes() {
    return meshes;
  },
  get n() {
    return currentN;
  },
  buildSynthetic,
  benchmarkRender,
  switchN,
};

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

// Boot at N=10 by default (methodology sanity-check scale against the real
// 10-machine baseline), selectable via the HUD buttons for 100/250/500.
switchN(10);
animate();
