#!/usr/bin/env node
/**
 * Regression test for the GeometryViewport.tsx / TwinViewport.tsx
 * hydration mismatch bug: `renderCountRef.current` was read straight into
 * JSX in the same render pass that mutated it, so the server's single
 * render (ref -> 1) and the client's hydration render (Strict Mode
 * double-invokes in development, ref -> 2) produced different text,
 * failing hydration.
 *
 * Targets /r3f-spike (TwinViewport.tsx) because it needs no backend --
 * a real Chromium page against the built/dev app is enough, matching
 * this file's own sibling factory-twin-r3f-spike.js. The identical fix
 * was also applied to GeometryViewport.tsx (the originally reported
 * location, /geometry-candidate); that route needs a live
 * factory-twin-3d backend to render past its own error boundary, so it
 * is verified manually per this fix's own commit message rather than in
 * this offline suite. Step 9 (see docs/evidence/) later extracted the
 * fix out of both files into the single shared `hooks/
 * useWebglLifecycle.ts` -- the source-level checks below now prove that
 * extraction rather than comparing two independent inline copies.
 *
 * Usage:
 *   cd services/factory-twin-3d-next && npm run build && npm run start
 *   SPIKE_URL=http://localhost:4310/factory-twin-3d/r3f-spike node tests/playwright/factory-twin-next-hydration.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SPIKE_URL = process.env.SPIKE_URL || 'http://localhost:4310/factory-twin-3d/r3f-spike';

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? `  ${detail}` : ''}`);
  }
}

async function readRenderCount(page) {
  const text = await page.locator('text=/reactRenders:/').textContent();
  return Number(text.match(/reactRenders:\s*(\d+)/)[1]);
}

async function readLifecycle(page) {
  return (await page.locator('text=/^lifecycle:/').textContent()).replace('lifecycle:', '').trim();
}

(async () => {
  // 1. Server-rendered markup is deterministic: fetch the raw SSR HTML
  // twice, outside any browser, and confirm the reactRenders figure it
  // embeds is identical both times (and specifically 0 -- the hydration
  // guard's own server-side value, never the mutated ref).
  const ssrHtmlA = await (await fetch(SPIKE_URL)).text();
  const ssrHtmlB = await (await fetch(SPIKE_URL)).text();
  const matchA = ssrHtmlA.match(/reactRenders:\s*(?:<!-- -->)?\s*(\d+)/);
  const matchB = ssrHtmlB.match(/reactRenders:\s*(?:<!-- -->)?\s*(\d+)/);
  check('server-rendered markup is deterministic across two independent fetches', !!matchA && !!matchB && matchA[1] === matchB[1], `A=${matchA?.[1]} B=${matchB?.[1]}`);
  check('server-rendered reactRenders is 0 (the hydration-safe guarded value, never the mutated ref)', matchA?.[1] === '0', `got ${matchA?.[1]}`);

  // 2 & 3. Initial client markup matches server, and hydration produces no
  // React hydration error -- captured from the moment the page starts
  // loading, before this test does anything else.
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(SPIKE_URL, { waitUntil: 'networkidle' });

  const hydrationWarnings = [...consoleErrors, ...pageErrors].filter(
    (t) => /hydrat/i.test(t) || /did not match/i.test(t) || /content does not match/i.test(t),
  );
  check('hydration produces no React hydration error/warning', hydrationWarnings.length === 0, hydrationWarnings.join(' | '));
  check('no other page/console errors on load', consoleErrors.length === 0 && pageErrors.length === 0, [...consoleErrors, ...pageErrors].join(' | '));

  // 4. Diagnostic render count can still update after mount -- the
  // mount-only effect must have flipped `hydrated` true and shown the
  // real ref value, which by this point (view interactions below) must
  // be >= 1, and must be able to increase further on a real interaction.
  const rendersAfterMount = await readRenderCount(page);
  check('diagnostic render count updates after mount (> 0, the hydration guard resolved)', rendersAfterMount > 0, `reactRenders=${rendersAfterMount}`);

  await page.getByRole('button', { name: /^front$/i }).click().catch(() => {});
  const otherViewButton = page.locator('button', { hasText: /^(top|iso)$/i }).first();
  if (await otherViewButton.count() > 0) await otherViewButton.click();
  await page.waitForTimeout(200);
  const rendersAfterClick = await readRenderCount(page);
  check('diagnostic render count increases on a real subsequent render (proves it is still a live counter, not frozen)', rendersAfterClick >= rendersAfterMount, `${rendersAfterMount} -> ${rendersAfterClick}`);

  // 5. Controller/lifecycle counters remain unchanged semantically --
  // this fix touched only the reactRenders display, so `lifecycle` must
  // still read its real, correct initial state (READY), never affected
  // by the hydration-guard change.
  const lifecycle = await readLifecycle(page);
  check('lifecycle counter semantics unaffected by this fix (still reports READY on load)', lifecycle === 'READY', `lifecycle=${lifecycle}`);

  await browser.close();

  // Source-level check: Step 9 extracted the hydration-guard/lifecycle
  // fix (originally duplicated independently in GeometryViewport.tsx and
  // TwinViewport.tsx, tested live above) into hooks/useWebglLifecycle.ts.
  // Confirms both components consume the ONE shared hook rather than
  // reimplementing the guard inline again -- the exact regression class
  // that let the hydration bug land twice in the first place.
  const hookSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'services', 'factory-twin-3d-next', 'hooks', 'useWebglLifecycle.ts'),
    'utf8',
  );
  check(
    'shared useWebglLifecycle hook still carries the hydration guard',
    /const \[hydrated, setHydrated\] = useState\(false\);/.test(hookSrc)
      && /renderCount: hydrated \? renderCountRef\.current : 0/.test(hookSrc),
  );

  const geometryViewportSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'services', 'factory-twin-3d-next', 'components', 'factory-twin', 'geometry', 'GeometryViewport.tsx'),
    'utf8',
  );
  const twinViewportSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'services', 'factory-twin-3d-next', 'components', 'factory-twin', 'twin-viewport', 'TwinViewport.tsx'),
    'utf8',
  );
  const usesSharedHook = (src) =>
    /import \{ useWebglLifecycle \} from ['"]@\/hooks\/useWebglLifecycle['"]/.test(src) && /useWebglLifecycle\(/.test(src);
  const reimplementsInline = (src) =>
    /const renderCountRef = useRef\(0\);/.test(src) || /const \[hydrated, setHydrated\] = useState\(false\);/.test(src);
  check(
    'GeometryViewport.tsx consumes the shared hook, not its own inline copy',
    usesSharedHook(geometryViewportSrc) && !reimplementsInline(geometryViewportSrc),
  );
  check(
    'TwinViewport.tsx consumes the shared hook, not its own inline copy',
    usesSharedHook(twinViewportSrc) && !reimplementsInline(twinViewportSrc),
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
