#!/usr/bin/env node
/**
 * Phase 12C — proves the escaping fixes in
 * services/factory-twin-3d/public/app.js and .../eap.js actually stop a
 * hostile DB/API-derived string from becoming a live DOM element, not
 * merely that a substring search doesn't find it.
 *
 * Method: extract the EXACT function source (esc/stateRowHtml from app.js;
 * esc/row/badge from eap.js) out of the real files on disk -- never a
 * hand-copied duplicate that could silently drift from what ships -- load
 * it into a real Chromium page via Playwright, run it against a hostile
 * payload, set the RETURNED string as innerHTML on a real DOM element, and
 * assert against the real parsed DOM: no <img>, no onerror/onclick
 * attribute anywhere, and the hostile text is present only as literal
 * text content. A string search alone cannot tell "the payload was escaped
 * into text" apart from "the payload was silently dropped" -- querying
 * the live DOM can.
 *
 * No server, no docker stack: about:blank + Playwright's own real browser
 * engine (already an existing root devDependency -- see
 * tests/playwright/factory-twin-regression.js for the same tool used the
 * same way, against a live service instead).
 *
 * Run: node tests/playwright/factory-twin-xss-hardening.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const APP_JS = path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'public', 'app.js');
const EAP_JS = path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'public', 'eap.js');

/** Balanced-brace extraction of one top-level `function <name>(...) { ... }`
 * out of real source text -- never a hand-copied duplicate. Template-
 * literal `${...}` braces inside the body are always self-balancing (every
 * `${` has exactly one matching `}`), so a plain counter is correct here. */
function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`function ${name} not found in source`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error(`unbalanced braces extracting ${name}`);
  return source.slice(start, i + 1);
}

let failures = 0;
function check(ok, label, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const HOSTILE = '<img src=x onerror="window.__xss=true">';
const HOSTILE_ATTR = '"><img src=x onerror=alert(1)>';

async function run() {
  const appSource = fs.readFileSync(APP_JS, 'utf8');
  const eapSource = fs.readFileSync(EAP_JS, 'utf8');

  const appEsc = extractFunction(appSource, 'esc');
  const appStateRowHtml = extractFunction(appSource, 'stateRowHtml');
  const eapEsc = extractFunction(eapSource, 'esc');
  const eapRow = extractFunction(eapSource, 'row');
  const eapBadge = extractFunction(eapSource, 'badge');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body><div id="sink"></div></body></html>');

  // ── app.js: esc() ──────────────────────────────────────────────────
  const escDirect = await page.evaluate(({ fn, payload }) => {
    // eslint-disable-next-line no-eval
    eval(fn);
    // eslint-disable-next-line no-undef
    const out = esc(payload);
    const sink = document.getElementById('sink');
    sink.innerHTML = out;
    return { out, hasImg: !!sink.querySelector('img'), hasOnerror: !!sink.querySelector('[onerror]'), text: sink.textContent };
  }, { fn: appEsc, payload: HOSTILE });
  check(!escDirect.hasImg, 'app.js esc(): hostile string never becomes a live <img> element');
  check(!escDirect.hasOnerror, 'app.js esc(): no onerror attribute reaches the DOM');
  check(escDirect.text === HOSTILE, 'app.js esc(): original text is fully recoverable as literal text content', escDirect.text);
  check(!escDirect.out.includes('<img'), 'app.js esc(): output string contains no raw "<img" tag open', escDirect.out);

  // ── app.js: stateRowHtml() -- the real audit finding ────────────────
  const rowResult = await page.evaluate(({ escFn, rowFn, payload }) => {
    // eslint-disable-next-line no-eval
    eval(escFn);
    // eslint-disable-next-line no-eval
    eval(rowFn);
    const row = {
      device_id: payload,
      mo: payload,
      board_no: payload,
      total_board: payload,
      state_color: '#3B82F6',
      state_label: payload,
      alarm: { count: 1, owner: payload, elapsed: payload },
    };
    // eslint-disable-next-line no-undef
    const html = stateRowHtml(row);
    const sink = document.getElementById('sink');
    sink.innerHTML = html;
    return {
      html,
      imgCount: sink.querySelectorAll('img').length,
      onerrorCount: sink.querySelectorAll('[onerror]').length,
      historyBtn: sink.querySelector('[data-history-device]'),
      historyBtnAttr: sink.querySelector('[data-history-device]')?.getAttribute('data-history-device') || null,
      text: sink.textContent,
    };
  }, { escFn: appEsc, rowFn: appStateRowHtml, payload: HOSTILE });
  check(rowResult.imgCount === 0, 'stateRowHtml(): device_id/mo/board_no/total_board/label/alarm text never spawn a live <img>');
  check(rowResult.onerrorCount === 0, 'stateRowHtml(): no onerror attribute anywhere in the rendered row');
  check(!!rowResult.historyBtn, 'stateRowHtml(): the History button itself still renders');
  check(rowResult.historyBtnAttr === HOSTILE, 'stateRowHtml(): data-history-device attribute holds the literal (escaped-then-unescaped-by-DOM) value, not a broken-out attribute', rowResult.historyBtnAttr);
  check(rowResult.text.includes(HOSTILE), 'stateRowHtml(): the hostile string is present only as literal text content');

  // A second payload aimed specifically at breaking OUT of the
  // data-history-device="..." attribute via an embedded double-quote.
  const attrBreakout = await page.evaluate(({ escFn, rowFn, payload }) => {
    // eslint-disable-next-line no-eval
    eval(escFn);
    // eslint-disable-next-line no-eval
    eval(rowFn);
    const row = {
      device_id: payload, mo: 'MO-1', board_no: 1, total_board: 10,
      state_color: '#3B82F6', state_label: 'RUN', alarm: null,
    };
    // eslint-disable-next-line no-undef
    const html = stateRowHtml(row);
    const sink = document.getElementById('sink');
    sink.innerHTML = html;
    return {
      imgCount: sink.querySelectorAll('img').length,
      buttonCount: sink.querySelectorAll('button').length,
    };
  }, { escFn: appEsc, rowFn: appStateRowHtml, payload: HOSTILE_ATTR });
  check(attrBreakout.imgCount === 0, 'stateRowHtml(): a quote-breakout payload in device_id cannot inject an <img> via the data-history-device attribute');
  check(attrBreakout.buttonCount === 1, 'stateRowHtml(): exactly one <button> renders -- the attribute breakout did not fragment the markup', String(attrBreakout.buttonCount));

  // ── eap.js: esc() ───────────────────────────────────────────────────
  const eapEscDirect = await page.evaluate(({ fn, payload }) => {
    // eslint-disable-next-line no-eval
    eval(fn);
    // eslint-disable-next-line no-undef
    const out = esc(payload);
    const sink = document.getElementById('sink');
    sink.innerHTML = out;
    return { hasImg: !!sink.querySelector('img'), text: sink.textContent };
  }, { fn: eapEsc, payload: HOSTILE });
  check(!eapEscDirect.hasImg, 'eap.js esc(): hostile string never becomes a live <img> element');
  check(eapEscDirect.text === HOSTILE, 'eap.js esc(): original text fully recoverable as literal text content');

  // ── eap.js: row() composed the same way every renderCellInspector/
  // renderZoneInspector sink now composes it -- esc(value) passed in,
  // never raw. Proves the composition pattern, not just the primitive. ──
  const eapRowResult = await page.evaluate(({ escFn, rowFn, payload }) => {
    // eslint-disable-next-line no-eval
    eval(escFn);
    // eslint-disable-next-line no-eval
    eval(rowFn);
    // eslint-disable-next-line no-undef
    const html = row('Reference label', esc(payload));
    const sink = document.getElementById('sink');
    sink.innerHTML = `<dl>${html}</dl>`;
    return { imgCount: sink.querySelectorAll('img').length, text: sink.textContent };
  }, { escFn: eapEsc, rowFn: eapRow, payload: HOSTILE });
  check(eapRowResult.imgCount === 0, 'eap.js row(\'label\', esc(value)): the exact sink pattern used throughout renderCellInspector/renderZoneInspector renders no live <img>');
  check(eapRowResult.text.includes(HOSTILE), 'eap.js row(): hostile text present only as literal text content');

  // ── eap.js: badge() -- cell.spatial_evidence interpolated directly ──
  const badgeResult = await page.evaluate(({ escFn, badgeFn, payload }) => {
    // eslint-disable-next-line no-eval
    eval(escFn);
    // eslint-disable-next-line no-eval
    eval(badgeFn);
    // eslint-disable-next-line no-undef
    const html = badge({ spatial_evidence: payload });
    const sink = document.getElementById('sink');
    sink.innerHTML = html;
    return { imgCount: sink.querySelectorAll('img').length, text: sink.textContent };
  }, { escFn: eapEsc, badgeFn: eapBadge, payload: HOSTILE });
  check(badgeResult.imgCount === 0, 'eap.js badge(): a hostile spatial_evidence value never spawns a live <img>');
  check(badgeResult.text.includes(HOSTILE), 'eap.js badge(): hostile text present only as literal text content');

  await browser.close();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
