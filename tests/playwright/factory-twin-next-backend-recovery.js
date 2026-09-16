#!/usr/bin/env node
/**
 * Regression test for the Step 11 production-spike finding: the
 * /geometry-candidate error boundary's Retry button used `reset()`, which
 * this app's own Next 16.3.4 bundled docs (node_modules/next/dist/docs/
 * 01-app/03-api-reference/03-file-conventions/error.md) document as
 * clearing the error state and re-rendering the boundary's children
 * WITHOUT re-fetching -- confirmed live: after backend recovery, clicking
 * Retry produced ZERO new network requests and re-displayed the identical
 * stale error. Fixed by switching to `retry`, the prop Next 16.3.0
 * stabilized specifically to "re-fetch and re-render the error boundary's
 * children."
 *
 * Requires a running factory-twin-3d backend this test can stop/start via
 * `docker stop`/`docker start ims-ft-perf` (the disposable measurement
 * container this engagement has used throughout) -- this is an
 * integration test of a real failure/recovery cycle, not a mock.
 *
 * Usage:
 *   cd services/factory-twin-3d-next && npm run build && npm run start
 *   CANDIDATE_URL=http://localhost:4310/factory-twin-3d/geometry-candidate \
 *     BACKEND_CONTAINER=ims-ft-perf BACKEND_HEALTH_URL=http://localhost:4196/api/floor-geometry \
 *     node tests/playwright/factory-twin-next-backend-recovery.js
 */

'use strict';

const http = require('http');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const CANDIDATE_URL = process.env.CANDIDATE_URL || 'http://localhost:4310/factory-twin-3d/geometry-candidate';
const BACKEND_CONTAINER = process.env.BACKEND_CONTAINER || 'ims-ft-perf';
const BACKEND_HEALTH_URL = process.env.BACKEND_HEALTH_URL || 'http://localhost:4196/api/floor-geometry';

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

function checkBackendHealthy() {
  const url = new URL(BACKEND_HEALTH_URL);
  return new Promise((resolve) => {
    const req = http.get({ host: url.hostname, port: url.port, path: url.pathname, timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  try {
    execSync(`docker stop ${BACKEND_CONTAINER}`, { stdio: 'ignore' });
  } catch (e) {
    console.error(`FATAL: could not stop ${BACKEND_CONTAINER}: ${e.message}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1000));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const rscResponses = [];
  page.on('response', (r) => {
    if (r.url().startsWith(CANDIDATE_URL)) rscResponses.push({ status: r.status(), url: r.url() });
  });

  await page.goto(CANDIDATE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  const initialBody = await page.locator('body').innerText();
  check('backend-down: error boundary shows (not a raw framework error page)', initialBody.includes('Factory Twin data unavailable'), initialBody.slice(0, 60));
  check('backend-down: Retry button present', await page.getByRole('button', { name: /retry/i }).count() > 0);

  // Real recovery: restart the backend and confirm health via HTTP polling
  // (not a fixed sleep) before clicking, so this test is not itself flaky
  // against container startup timing.
  execSync(`docker start ${BACKEND_CONTAINER}`, { stdio: 'ignore' });
  let backendUp = false;
  let waitedMs = 0;
  while (waitedMs < 20000) {
    backendUp = await checkBackendHealthy();
    if (backendUp) break;
    await new Promise((r) => setTimeout(r, 500));
    waitedMs += 500;
  }
  check('backend restarted and confirmed healthy via HTTP polling', backendUp, `waited ${waitedMs}ms`);
  await new Promise((r) => setTimeout(r, 1000));

  rscResponses.length = 0;
  await page.getByRole('button', { name: /retry/i }).click();
  await page.waitForTimeout(2000);

  check(
    'clicking Retry issues a real network request to re-fetch the segment (the `retry` prop, not `reset`)',
    rscResponses.length > 0,
    JSON.stringify(rscResponses),
  );
  check('that request succeeds (200)', rscResponses.every((r) => r.status === 200));

  const recoveredBody = await page.locator('body').innerText();
  const hasCanvas = (await page.locator('canvas').count()) > 0;
  check('after Retry: canvas renders (real scene, not still the error boundary)', hasCanvas);
  check('after Retry: error text is gone', !recoveredBody.includes('Factory Twin data unavailable'));

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
