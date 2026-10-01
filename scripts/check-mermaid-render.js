#!/usr/bin/env node
/**
 * Renders every ```mermaid block in the repository's Markdown with the same
 * Mermaid major version GitHub uses (devDependency `mermaid`), in headless
 * Chromium (devDependency `playwright`), and fails on any parse or render
 * error. tests/lint/mermaid-lint.js covers the static rules; this covers
 * "does it actually draw".
 *
 * Also reports diagrams wider than WARN_WIDTH px: GitHub scales a diagram to
 * its ~1,000 px column, so text in a much wider one becomes hard to read.
 *
 * Usage: node scripts/check-mermaid-render.js
 *   (needs `npx playwright install chromium` once, or CHROMIUM_PATH=<chrome>)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const WARN_WIDTH = 2400;
const MERMAID_JS = require.resolve('mermaid/dist/mermaid.min.js');

const files = execFileSync('git', ['ls-files', '*.md', '*.mermaid'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !/^(\.agents|\.superpowers)\//.test(f));

const diagrams = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (f.endsWith('.mermaid')) { diagrams.push({ f, line: 1, src: text }); continue; }
  const lines = text.split(/\r?\n/);
  for (let i = 0, start = -1; i < lines.length; i++) {
    if (start < 0 && /^\s*```mermaid\s*$/.test(lines[i])) start = i;
    else if (start >= 0 && /^\s*```\s*$/.test(lines[i])) {
      diagrams.push({ f, line: start + 1, src: lines.slice(start + 1, i).join('\n') });
      start = -1;
    }
  }
}

(async () => {
  // CHROMIUM_PATH lets a machine reuse an already-installed Chromium
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  await page.setContent('<html><body><div id="o"></div></body></html>');
  await page.addScriptTag({ path: MERMAID_JS });
  await page.evaluate(() => mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' }));

  let failed = 0;
  let wide = 0;
  for (const [i, d] of diagrams.entries()) {
    const r = await page.evaluate(async ({ src, id }) => {
      try {
        const { svg } = await mermaid.render(id, src);
        const o = document.getElementById('o');
        o.innerHTML = svg;
        const box = o.querySelector('svg').getBBox();
        return { ok: true, w: Math.round(box.width), h: Math.round(box.height) };
      } catch (e) {
        return { ok: false, err: String((e && e.message) || e).split('\n').slice(0, 2).join(' ') };
      }
    }, { src: d.src, id: `m${i}` });
    if (!r.ok) { failed++; console.error(`FAIL ${d.f}:${d.line}  ${r.err}`); }
    else if (r.w > WARN_WIDTH) { wide++; console.warn(`WIDE ${d.f}:${d.line}  ${r.w}x${r.h}px`); }
  }
  await browser.close();

  console.log(`Rendered ${diagrams.length} diagrams: ${failed} failed, ${wide} wider than ${WARN_WIDTH}px`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
