#!/usr/bin/env node
/**
 * Floor 1 EAP map -- API failure safety regression.
 *
 * FT-SCADA-AUDIT found this by forcing exactly the failures a real audit
 * asks for (malformed JSON, an unexpectedly-shaped payload), not by
 * inspection: a 200 response from /api/eap-map that was not valid JSON, or
 * was valid JSON missing the fields this page reads, threw an uncaught
 * exception out of load() and left the page silently stuck on "loading…"
 * forever -- not a fabricated state, but not a safe failure either.
 *
 * This asserts the real contract the fix restores: every failure mode
 * ends in an honest, distinct headline and zero uncaught exceptions,
 * never a crash and never a fabricated population.
 *
 * Usage:
 *   EAP_URL=http://127.0.0.1:4199/ node tests/playwright/eap-api-failure-safety-regression.js
 *
 * With no EAP_URL the check reports SKIP and exits zero, matching the
 * other EAP browser regressions.
 */

'use strict';

const { chromium } = require('playwright');

const BASE = process.env.EAP_URL || process.env.TWIN_DIRECT_URL || null;

let failures = 0;

function check(ok, label, detail) {
  if (ok) { console.log(`  PASS  ${label}`); return true; }
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  return false;
}

function section(name) {
  console.log(`\n${name}`);
  console.log('-'.repeat(name.length));
}

async function scenario(browser, url, label, routeHandler) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // "Failed to load resource: ... 500" is Chromium's own network-level
    // log for any non-2xx response -- expected and harmless for the
    // scenario that deliberately forces one, not a sign of an app bug.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.route('**/api/eap-map', routeHandler);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const headline = await page.$eval('#headline', (el) => el.textContent).catch(() => null);
  await page.close();
  section(label);
  check(errors.length === 0, 'zero uncaught exceptions', errors.slice(0, 2).join(' | '));
  return headline;
}

async function main() {
  console.log('Floor 1 EAP Map -- API failure safety regression');
  console.log('='.repeat(52));
  if (!BASE) {
    console.log('  SKIP  no EAP_URL set; the map service is not reachable from here.');
    process.exit(0);
  }
  const url = new URL('eap.html', BASE).toString();
  const browser = await chromium.launch();

  const h500 = await scenario(browser, url, '1. HTTP 500',
    (route) => route.fulfill({ status: 500, body: 'boom' }));
  check(h500 === 'EAP model not deployed on this host', 'honest headline for a 500', h500);

  const hMalformed = await scenario(browser, url, '2. 200 with invalid JSON body',
    (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{not valid json' }));
  check(hMalformed === 'EAP model failed to load -- malformed response', 'honest headline for invalid JSON', hMalformed);

  const hEmpty = await scenario(browser, url, '3. 200 with {} (missing every expected field)',
    (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  check(hEmpty === 'EAP model failed to load -- unexpected response shape', 'honest headline for an unexpected shape', hEmpty);

  const hHang = await scenario(browser, url, '4. request that never resolves', () => {});
  check(hHang === 'loading…', 'stays in an honest loading state, never a fabricated population', hHang);

  await browser.close();

  console.log(`\n${'='.repeat(52)}`);
  console.log(`Results: ${failures} failure(s)`);
  console.log(failures === 0 ? 'EAP API FAILURE SAFETY REGRESSION PASSED' : 'EAP API FAILURE SAFETY REGRESSION FAILED');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
