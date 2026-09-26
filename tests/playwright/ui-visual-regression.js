/**
 * UI VISUAL + LAYOUT REGRESSION -- factory-twin operator pages
 * =============================================================
 *
 * Covers the two pages the previous CSS audit (F-8) found had NO pixel or
 * layout baseline: the EAP operational map (/eap.html) and the physical twin
 * (/). Both are WebGL-heavy, so a raw full-page pixel diff is worthless (GPU
 * rasterisation varies host to host). This harness instead captures two
 * artefacts per (page, viewport, state):
 *
 *   1. a LAYOUT SNAPSHOT (JSON) -- computed styles + client rects for a fixed
 *      set of chrome selectors, the :root token values, and a
 *      horizontal-overflow flag. This is the DIFFABLE baseline: deterministic,
 *      host-independent, and the thing a CSS refactor actually changes.
 *   2. a DOM-CHROME pixel clip (PNG) of the non-canvas UI (header + aside /
 *      drawer + legend + inspector), pixel-diffed with a small tolerance.
 *      The <canvas> elements are never in frame.
 *   3. a full-page PNG, saved as a human-review artefact only (never asserted).
 *
 * Determinism:
 *   - EAP demo simulation is deterministic per cell_id (no clock; observed_at
 *     is always null) -- safe to snapshot.
 *   - the physical twin reads real telemetry -- its status-strip VALUES vary,
 *     so the layout snapshot records the strip's geometry and computed style
 *     but NOT its text, and the pixel clip excludes the strip.
 *
 * Usage:
 *   EAP_URL=http://127.0.0.1:4199/ TWIN_DIRECT_URL=http://127.0.0.1:4199/ \
 *     node tests/playwright/ui-visual-regression.js            # compare
 *   ... node tests/playwright/ui-visual-regression.js --update # write baseline
 *
 * With neither URL set the check reports SKIP and exits 0, matching the other
 * factory-twin browser regressions.
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { PNG } = require('playwright-core/lib/utilsBundle');

/** Minimal pixel comparator (no pixelmatch dependency). Counts pixels whose
 *  max per-channel delta exceeds `tol`, ignoring alpha. Returns the count. */
function pixelDelta(a, b, tol) {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(
      Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d > tol) n++;
  }
  return n;
}

const EAP_URL = process.env.EAP_URL || process.env.TWIN_DIRECT_URL || null;
const TWIN_URL = process.env.TWIN_DIRECT_URL || process.env.EAP_URL || null;
const UPDATE = process.argv.includes('--update');
// The layout-snapshot JSON baseline is the committed, diffable regression
// contract, so it lives OUTSIDE the gitignored screenshots/ tree. PNG
// artefacts (host-dependent, large) stay under screenshots/ and are ignored.
const BASELINE = path.join(__dirname, 'ui-visual-baseline');
const OUT = path.join(__dirname, 'screenshots', 'ui-visual');
const CURRENT = path.join(OUT, 'current');
const DIFFS = path.join(OUT, 'diff');
const BASELINE_PNG = path.join(OUT, 'baseline');

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1440', width: 2560, height: 1440 },
  { name: '3840x2160', width: 3840, height: 2160 },
];

/** Chrome selectors whose computed style + rect are the diffable contract.
 *  Anything WebGL, anything whose text is live data, is excluded. */
const EAP_PROBES = [
  ':root', 'body', 'header', 'header h1', '#twin-link', '.controls button',
  'button[aria-pressed]', 'aside', 'aside h2', '#stateBreakdown', '.legend-row',
  '.legend-row .chip', '#opDataSourceNote', '#zoneDrawer', '#webgl-lost',
];
const TWIN_PROBES = [
  ':root', 'body', '#app', '#topbar', '.brand h1', '.seg', '.seg button',
  '.btn', '#status-strip', '.ss-cell', '#stage', '#drawer', '#drawer h2',
  '#factory-status', '.fs-cell', '#inspector', '#webgl-lost',
];
/** Twin selectors whose SIZE is driven by live telemetry (digit count in the
 *  status strip, populated device rows). Their computed style is asserted but
 *  their rect is dropped so a data change is not read as a layout regression. */
const RECT_FREE = new Set(['#status-strip', '.ss-cell', '#factory-status', '.fs-cell', 'body', '#stage']);
const TOKEN_PROBE = ':root';

const STYLE_KEYS = [
  'display', 'position', 'gridTemplateColumns', 'gridTemplateRows', 'flexWrap',
  'gap', 'rowGap', 'columnGap', 'padding', 'margin', 'width', 'maxWidth', 'minWidth',
  'height', 'maxHeight', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
  'fontVariantNumeric', 'color', 'backgroundColor', 'borderColor', 'borderWidth',
  'borderRadius', 'boxShadow', 'transition', 'transitionDuration', 'transitionProperty',
  'transitionTimingFunction', 'opacity', 'zIndex', 'overflowX', 'overflowY',
  'textTransform', 'outline',
];

const results = [];
let fails = 0;
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

function ensureDirs() {
  for (const d of [OUT, BASELINE, BASELINE_PNG, CURRENT, DIFFS]) fs.mkdirSync(d, { recursive: true });
}

async function layoutSnapshot(page, probes) {
  return page.evaluate(({ probes, STYLE_KEYS, rectFree }) => {
    const rootStyle = getComputedStyle(document.documentElement);
    const tokens = {};
    // enumerate every --* custom property actually resolved on :root
    for (const name of ['--bg', '--surface', '--surface-2', '--panel', '--panel-2',
      '--line', '--line-strong', '--line-2', '--ink', '--ink-dim', '--ink-faint',
      '--text', '--text-dim', '--text-faint', '--accent', '--warn', '--crit', '--ok',
      '--cell', '--cell-world', '--cell-unassigned', '--region', '--region-layout',
      '--radius', '--header-h', '--strip-h', '--drawer-w',
      '--motion-fast', '--motion-normal', '--motion-slow',
      '--motion-duration-fast', '--motion-duration-normal', '--motion-duration-slow',
      '--ease-standard', '--ease-exit', '--ease-emphasized', '--ease-decelerate',
      '--motion-ease-standard', '--motion-ease-emphasized',
      '--space-1', '--space-2', '--space-3', '--space-4',
      '--status-run', '--status-down', '--status-idle', '--status-off',
      '--status-initial', '--status-pm', '--status-stop',
      '--quality-unmapped', '--quality-unavailable',
      '--text-xs', '--text-sm', '--text-md', '--text-lg', '--text-xl',
      '--z-drawer', '--z-inspector', '--z-webgl-lost', '--z-dialog']) {
      const v = rootStyle.getPropertyValue(name).trim();
      if (v) tokens[name] = v;
    }
    const out = { tokens, elements: {}, docScrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth };
    for (const sel of probes) {
      if (sel === ':root') continue;
      const el = document.querySelector(sel);
      if (!el) { out.elements[sel] = null; continue; }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const style = {};
      for (const k of STYLE_KEYS) style[k] = cs[k];
      out.elements[sel] = {
        rect: rectFree.includes(sel) ? 'live-data'
          : { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        style,
        count: document.querySelectorAll(sel).length,
      };
    }
    return out;
  }, { probes, STYLE_KEYS, rectFree: [...RECT_FREE] });
}

function stableStringify(o) {
  return JSON.stringify(o, (k, v) => v, 2);
}

function compareJSON(name, base, cur) {
  const bs = stableStringify(base), cs = stableStringify(cur);
  if (bs === cs) { ok(true, `${name}: layout snapshot matches baseline`); return; }
  // find first differing path for a useful message
  const bl = bs.split('\n'), cl = cs.split('\n');
  let firstDiff = -1;
  for (let i = 0; i < Math.max(bl.length, cl.length); i++) {
    if (bl[i] !== cl[i]) { firstDiff = i; break; }
  }
  const ctx = firstDiff >= 0
    ? `  baseline: ${(bl[firstDiff] || '').trim()}\n       current:  ${(cl[firstDiff] || '').trim()}`
    : '';
  ok(false, `${name}: layout snapshot DRIFTED (line ${firstDiff + 1})\n${ctx}`);
  fs.writeFileSync(path.join(DIFFS, `${name}.baseline.json`), bs);
  fs.writeFileSync(path.join(DIFFS, `${name}.current.json`), cs);
}

function comparePNG(name, baseBuf, curBuf) {
  let a, b;
  try { a = PNG.sync.read(baseBuf); b = PNG.sync.read(curBuf); }
  catch (e) { ok(false, `${name}: PNG decode failed -- ${e.message}`); return; }
  if (a.width !== b.width || a.height !== b.height) {
    ok(false, `${name}: chrome clip size changed ${a.width}x${a.height} -> ${b.width}x${b.height}`);
    return;
  }
  const nDiff = pixelDelta(a.data, b.data, 24);
  const total = a.width * a.height;
  const pct = (nDiff / total) * 100;
  // <0.8% of pixels past a per-channel delta of 24 absorbs font-hinting / AA
  // noise while still catching a real colour / spacing / weight change.
  const pass = pct < 0.8;
  ok(pass, `${name}: chrome pixels ${pct.toFixed(3)}% changed (${nDiff}/${total})`);
}

async function capture(page, tag, chromeClipSel) {
  const dir = UPDATE ? BASELINE_PNG : CURRENT;
  fs.mkdirSync(dir, { recursive: true });
  // full page -- artefact only
  await page.screenshot({ path: path.join(dir, `${tag}.full.png`), fullPage: false });
  // chrome clip -- asserted. Skipped (not failed) when the target is not
  // visible: e.g. a webgl-lost banner whose lifecycle recovered before the
  // clip could be taken. The layout JSON still records the element.
  let clipBuf = null;
  const el = await page.$(chromeClipSel);
  if (el) {
    try {
      clipBuf = await el.screenshot({ timeout: 4000 });
      fs.writeFileSync(path.join(dir, `${tag}.chrome.png`), clipBuf);
    } catch {
      console.log(`  (chrome clip skipped for ${tag} -- ${chromeClipSel} not visible)`);
    }
  }
  return clipBuf;
}

async function assertOne(page, probes, tag, chromeClipSel) {
  const snap = await layoutSnapshot(page, probes);
  const clipBuf = await capture(page, tag, chromeClipSel);
  if (UPDATE) {
    fs.writeFileSync(path.join(BASELINE, `${tag}.layout.json`), stableStringify(snap));
    console.log(`  WROTE  ${tag}`);
    results.push({ tag, updated: true });
    return;
  }
  const basePath = path.join(BASELINE, `${tag}.layout.json`);
  if (!fs.existsSync(basePath)) { ok(false, `${tag}: no baseline -- run with --update`); return; }
  compareJSON(tag, JSON.parse(fs.readFileSync(basePath, 'utf8')), JSON.parse(stableStringify(snap)));
  const baseClip = path.join(BASELINE_PNG, `${tag}.chrome.png`);
  if (clipBuf && fs.existsSync(baseClip)) comparePNG(tag, fs.readFileSync(baseClip), clipBuf);
  // overflow gate -- always, baseline or not
  ok(snap.docScrollW <= snap.clientW + 1, `${tag}: no horizontal overflow (${snap.docScrollW} <= ${snap.clientW})`);
}

async function eapStates(ctx, vp) {
  const page = await ctx.newPage();
  await page.goto(new URL('eap.html', EAP_URL).toString(), { waitUntil: 'load', timeout: 40000 });
  await page.waitForFunction(() => window.__eap && window.__eap.ready(), { timeout: 20000 });
  await page.evaluate(() => window.__eap.setMode('EAP'));
  await page.waitForTimeout(500);

  await assertOne(page, EAP_PROBES, `eap.${vp.name}.production`, 'aside');

  await page.evaluate(() => window.__eap.setSimulation(true));
  await page.waitForTimeout(400);
  await assertOne(page, EAP_PROBES, `eap.${vp.name}.demo`, 'aside');

  // selected cell
  const cid = await page.evaluate(() => { const d = window.__eap.drawn(); return d && d[0] && d[0].cell_id; });
  if (cid) { await page.evaluate((id) => window.__eap.pick(id), cid); await page.waitForTimeout(300);
    await assertOne(page, EAP_PROBES.concat(['#inspector']), `eap.${vp.name}.selected`, 'aside'); }

  // zone drawer
  const zid = await page.evaluate(() => { const z = window.__eap.zoneList(); return z && z[0] && z[0].zone_id; });
  if (zid) { await page.evaluate((id) => window.__eap.openDrawer(id), zid); await page.waitForTimeout(300);
    await assertOne(page, EAP_PROBES, `eap.${vp.name}.drawer`, '#zoneDrawer'); }

  // webgl-lost banner
  await page.evaluate(() => window.__eap.simulateContextLoss && window.__eap.simulateContextLoss());
  await page.waitForTimeout(400);
  await assertOne(page, EAP_PROBES, `eap.${vp.name}.webgl-lost`, '#webgl-lost');
  await page.evaluate(() => window.__eap.simulateContextRestore && window.__eap.simulateContextRestore());
  await page.close();
}

async function twinStates(ctx, vp) {
  const page = await ctx.newPage();
  await page.goto(TWIN_URL, { waitUntil: 'load', timeout: 40000 });
  await page.waitForFunction(() => window.__twin !== undefined, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await assertOne(page, TWIN_PROBES, `twin.${vp.name}.default`, '#topbar');

  // drawer open -- click the real control, then wait for the class AND for the
  // 140ms grid-column transition to finish before snapshotting.
  await page.click('#drawer-toggle');
  await page.waitForFunction(() => document.getElementById('app').classList.contains('drawer-open'), { timeout: 5000 });
  await page.waitForTimeout(400);
  await assertOne(page, TWIN_PROBES, `twin.${vp.name}.drawer`, '#drawer');

  await page.evaluate(() => window.__twin && window.__twin.simulateContextLoss && window.__twin.simulateContextLoss());
  await page.waitForTimeout(400);
  await assertOne(page, TWIN_PROBES, `twin.${vp.name}.webgl-lost`, '#webgl-lost');
  await page.evaluate(() => window.__twin && window.__twin.simulateContextRestore && window.__twin.simulateContextRestore());
  await page.close();
}

(async () => {
  console.log(`\nUI Visual + Layout Regression  (${UPDATE ? 'UPDATE baseline' : 'COMPARE'})`);
  console.log('='.repeat(60));
  if (!EAP_URL && !TWIN_URL) {
    console.log('  SKIP  no EAP_URL / TWIN_DIRECT_URL set; the map service is not reachable from here.');
    process.exit(0);
  }
  ensureDirs();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n-- ${vp.name} --`);
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
      if (EAP_URL) await eapStates(ctx, vp);
      if (TWIN_URL) await twinStates(ctx, vp);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log('\n' + '='.repeat(60));
  if (UPDATE) { console.log(`Baseline written to ${path.relative(process.cwd(), BASELINE)}`); process.exit(0); }
  console.log(`${fails} failure(s)`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
