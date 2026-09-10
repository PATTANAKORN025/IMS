#!/usr/bin/env node
/**
 * Factory Twin rendering benchmark.
 *
 * Measures the REAL application — the same page an operator loads, the same
 * geometry the service serves — across the four target viewports, and then
 * runs one experiment that the raw numbers cannot answer on their own:
 * whether draw calls or pixels are the constraint.
 *
 * WHY THE EXPERIMENT IS THE POINT. A frame-time table alone invites the wrong
 * optimisation. This scene issues several hundred draw calls, so "instance the
 * columns" is the obvious next move, and it would be the wrong one: the layer
 * sweep below turns layers off one at a time and reports what each removal
 * actually buys. If dropping 85% of the draw calls buys a tenth of the frame,
 * the frame is not draw-call bound and instancing is churn.
 *
 * THIS IS NOT A GPU MEASUREMENT. Headless Chromium rasterises in software, so
 * every number here is a software-rasteriser number and none of them predicts
 * behaviour on an operator's machine. They are useful for exactly two things:
 * comparing a build against the previous build on the same host, and telling
 * fill-rate cost apart from geometry cost. They are not a performance claim.
 *
 * This is a measurement tool, not a gate. It asserts nothing and never fails a
 * build; a threshold on a software rasteriser would fail on an unrelated host
 * and pass on a slow one.
 *
 * Usage:
 *   TWIN_URL=http://127.0.0.1:4198/ node tests/perf/factory-twin-benchmark.js
 */

'use strict';

const path = require('path');

const URL = process.env.TWIN_URL || 'http://127.0.0.1:4198/';
const FRAMES = Number(process.env.TWIN_BENCH_FRAMES || 60);
const VIEWPORTS = [
  { w: 1366, h: 768 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
  { w: 3840, h: 2160 },
];

let chromium;
try {
  ({ chromium } = require(path.join(process.cwd(), 'node_modules', 'playwright')));
} catch (err) {
  try {
    ({ chromium } = require('playwright'));
  } catch (inner) {
    console.error('playwright is not installed; run npm install first.');
    process.exit(78);
  }
}

/**
 * Frame cost, measured by forcing a render and waiting for the frame that
 * follows it. The median is reported rather than the mean because the first
 * frames after a layer change include shader and buffer work that is real but
 * is not what a steady view costs.
 */
async function frameStats(page, frames) {
  return page.evaluate(async (n) => {
    const twin = window.__twin;
    const times = [];
    for (let i = 0; i < n; i++) {
      const start = performance.now();
      twin.requestRender();
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const info = twin.renderer.info;
    return {
      med: times[Math.floor(times.length / 2)],
      p95: times[Math.floor(times.length * 0.95)],
      draw: info.render.calls,
      tri: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      cached: twin.resourceStats(),
      heapMB: performance.memory
        ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  }, frames);
}

async function openTwin(browser, vp) {
  const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__twin !== undefined, { timeout: 60000 });
  const boot = Date.now() - t0;
  // The scene builds after __twin appears; measuring immediately would time
  // construction rather than a steady frame.
  await page.waitForTimeout(1500);
  return { context, page, boot, errors };
}

function pad(v, n) { return String(v).padStart(n); }

async function main() {
  const browser = await chromium.launch();
  console.log('Factory Twin rendering benchmark');
  console.log(`  target ${URL}`);
  console.log('  headless Chromium, SOFTWARE rasteriser -- not a GPU measurement');
  console.log('='.repeat(96));

  const rows = [];
  for (const vp of VIEWPORTS) {
    const { context, page, boot, errors } = await openTwin(browser, vp);
    const m = await frameStats(page, FRAMES);
    const apiMs = await page.evaluate(async () => {
      const start = performance.now();
      await (await fetch('api/floor-geometry')).json();
      return performance.now() - start;
    });
    rows.push({ vp: `${vp.w}x${vp.h}`, px: (vp.w * vp.h) / 1e6, boot, apiMs, errors: errors.length, ...m });
    await context.close();
  }

  console.log('viewport      boot   median      p95   draw      tri  geom  cached  mat  heapMB  apiMs  err');
  for (const r of rows) {
    console.log(
      r.vp.padEnd(10)
      + pad(`${r.boot}ms`, 8) + pad(r.med.toFixed(1), 9) + pad(r.p95.toFixed(1), 9)
      + pad(r.draw, 7) + pad(r.tri, 9) + pad(r.geometries, 6) + pad(r.cached.geometries, 8)
      + pad(r.cached.materials, 5) + pad(r.heapMB === null ? '-' : r.heapMB, 8)
      + pad(Math.round(r.apiMs), 7) + pad(r.errors, 5)
    );
  }

  // Fill rate versus geometry. Frame time is fitted against megapixels; if the
  // fit is close to linear with a large slope, the frame is bound by pixels.
  const first = rows[0];
  const last = rows[rows.length - 1];
  const slope = (last.med - first.med) / (last.px - first.px);
  const intercept = first.med - slope * first.px;
  console.log('='.repeat(96));
  console.log(`Fill-rate fit: ${slope.toFixed(1)} ms per megapixel, ${intercept.toFixed(1)} ms fixed`);
  console.log(`Scene composition is CONSTANT across all four: ${first.draw} draw calls, ${first.tri} triangles.`);

  // The layer sweep. Each step hides one more layer and re-measures, so the
  // cost of the draw calls that step removed is a subtraction rather than an
  // argument. Run at 1920x1080 because that is the reference viewport.
  const { context, page } = await openTwin(browser, { w: 1920, h: 1080 });
  const sweep = [];
  sweep.push({ label: 'all layers', ...await frameStats(page, FRAMES) });
  const steps = [
    { label: 'without equipment and columns', hide: ['equipment', 'columns'] },
    { label: 'shell only', hide: ['walls', 'functional'] },
    { label: 'empty scene', hide: ['shell'] },
  ];
  for (const step of steps) {
    await page.evaluate((names) => {
      for (const n of names) window.__twin.setLayerVisible(n, false);
    }, step.hide);
    sweep.push({ label: step.label, ...await frameStats(page, FRAMES) });
  }
  await context.close();
  await browser.close();

  console.log('='.repeat(96));
  console.log('Layer sweep at 1920x1080 -- what each removal actually buys');
  console.log('scene                            draw      tri   median   delta');
  let prev = null;
  for (const s of sweep) {
    const delta = prev === null ? '' : `${(s.med - prev).toFixed(1)} ms`;
    console.log(s.label.padEnd(32) + pad(s.draw, 6) + pad(s.tri, 9) + pad(s.med.toFixed(1), 9) + pad(delta, 9));
    prev = s.med;
  }
  const full = sweep[0];
  const stripped = sweep[1];
  const drawSaved = full.draw - stripped.draw;
  const msSaved = full.med - stripped.med;
  console.log('='.repeat(96));
  console.log(
    `Removing ${drawSaved} of ${full.draw} draw calls (${Math.round((drawSaved / full.draw) * 100)}%) `
    + `changed the frame by ${msSaved.toFixed(1)} ms of ${full.med.toFixed(1)} ms `
    + `(${Math.round((msSaved / full.med) * 100)}%).`
  );
  console.log(
    `An empty scene still costs ${sweep[sweep.length - 1].med.toFixed(1)} ms, `
    + 'which is compositing, not this application.'
  );
}

main().catch((err) => {
  console.error(`benchmark failed: ${err.message}`);
  process.exit(1);
});
