/**
 * Phase 12G -- unit tests for tools/floor1/dxf-parser.js, the streaming
 * DXF group-code parser. Uses a tiny synthetic DXF fixture only (built in
 * this file) -- never the real 412MB production drawing, per this
 * phase's own explicit instruction. The real file is exercised once,
 * manually, via `node tools/floor1/extract-grid-from-dxf.js` (see
 * docs/floor1/dxf-extraction-provenance.md for that run's own record).
 *
 * Every coordinate/label/layer name in this fixture is synthetic.
 *
 * Run: node tests/unit/floor1-dxf-parser.test.js
 */

'use strict';

const assert = require('assert');
const { Readable } = require('stream');
const { iterateGroupPairs, parseDxf } = require('../../tools/floor1/dxf-parser');

let passed = 0;
let failed = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}
async function runAll() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`  PASS  ${name}`);
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${name} — ${e.message}`);
    }
  }
}

function streamOf(text) {
  return Readable.from([text]);
}

/** A small, deliberately synthetic DXF -- one LAYER table with two
 * layers ("0" and "TEST-GRID"), then an ENTITIES section with a LINE, a
 * TEXT, an XLINE, a 3-vertex LWPOLYLINE, and a second LINE duplicating
 * the first's coordinates (to test that duplicates are NOT silently
 * merged by the raw parser -- dedup is a later, separate concern). */
const FIXTURE = [
  '0', 'SECTION',
  '2', 'TABLES',
  '0', 'TABLE',
  '2', 'LAYER',
  '0', 'LAYER',
  '2', '0',
  '70', '0',
  '0', 'LAYER',
  '2', 'TEST-GRID',
  '70', '0',
  '0', 'ENDTAB',
  '0', 'ENDSEC',
  '0', 'SECTION',
  '2', 'ENTITIES',
  '0', 'LINE',
  '5', 'A1',
  '8', 'TEST-GRID',
  '10', '-87250.0',
  '20', '0.0',
  '30', '0.0',
  '11', '87250.0',
  '21', '0.0',
  '31', '0.0',
  '0', 'TEXT',
  '5', 'A2',
  '8', 'TEST-GRID-LABEL',
  '10', '-87250.0',
  '20', '5000.0',
  '30', '0.0',
  '1', '1',
  '0', 'XLINE',
  '5', 'A3',
  '8', 'TEST-GRID',
  '10', '0.0',
  '20', '-60150.0',
  '30', '0.0',
  '11', '0.0',
  '21', '1.0',
  '31', '0.0',
  '0', 'LWPOLYLINE',
  '5', 'A4',
  '8', 'TEST-OUTLINE',
  '90', '3',
  '70', '0',
  '10', '0.0',
  '20', '0.0',
  '10', '1000.0',
  '20', '0.0',
  '10', '1000.0',
  '20', '1000.0',
  '0', 'LINE',
  '5', 'A5',
  '8', 'TEST-GRID',
  '10', '-87250.0',
  '20', '0.0',
  '30', '0.0',
  '11', '87250.0',
  '21', '0.0',
  '31', '0.0',
  '0', 'ENDSEC',
  '0', 'EOF',
].join('\r\n') + '\r\n';

// ── iterateGroupPairs ────────────────────────────────────────────────

test('iterateGroupPairs: yields code/value pairs in order, CRLF stripped', async () => {
  const pairs = [];
  for await (const p of iterateGroupPairs(streamOf('0\r\nSECTION\r\n2\r\nENTITIES\r\n'))) pairs.push(p);
  assert.deepStrictEqual(pairs.map((p) => [p.code, p.value]), [[0, 'SECTION'], [2, 'ENTITIES']]);
});

test('iterateGroupPairs: malformed group-code line reported, never throws', async () => {
  const pairs = [];
  for await (const p of iterateGroupPairs(streamOf('0\r\nSECTION\r\nNOT_A_CODE\r\nvalue\r\n2\r\nENTITIES\r\n'))) pairs.push(p);
  const malformed = pairs.filter((p) => p.malformed);
  assert.strictEqual(malformed.length, 1);
  assert.strictEqual(malformed[0].rawCode, 'NOT_A_CODE');
  // parsing continues past the malformed pair
  assert.ok(pairs.some((p) => p.code === 2 && p.value === 'ENTITIES'));
});

test('iterateGroupPairs: odd trailing line (dangling code) reported as malformed, not silently dropped', async () => {
  const pairs = [];
  for await (const p of iterateGroupPairs(streamOf('0\r\nSECTION\r\n2'))) pairs.push(p);
  const last = pairs[pairs.length - 1];
  assert.strictEqual(last.malformed, true);
});

// ── parseDxf: layers ──────────────────────────────────────────────────

test('parseDxf: LAYER table records captured with real names, no fabrication', async () => {
  const layers = [];
  await parseDxf(streamOf(FIXTURE), { onLayer: (l) => layers.push(l.name) });
  assert.deepStrictEqual(layers, ['0', 'TEST-GRID']);
});

// ── parseDxf: BLOCKS ─────────────────────────────────────────────────

const BLOCK_FIXTURE = [
  '0', 'SECTION',
  '2', 'BLOCKS',
  '0', 'BLOCK',
  '8', '0',
  '2', 'TEST-BLOCK',
  '70', '0',
  '10', '0.0',
  '20', '0.0',
  '30', '0.0',
  '3', 'TEST-BLOCK',
  '0', 'LINE',
  '5', 'B1',
  '8', 'FRAME',
  '10', '0.0',
  '20', '0.0',
  '30', '0.0',
  '11', '100.0',
  '21', '0.0',
  '31', '0.0',
  '0', 'ENDBLK',
  '0', 'ENDSEC',
  '0', 'EOF',
].join('\r\n') + '\r\n';

test('parseDxf: onBlockStart fires with the real block name (fixes the bug where it never fired)', async () => {
  const starts = [];
  const ends = [];
  await parseDxf(streamOf(BLOCK_FIXTURE), {
    onBlockStart: (b) => starts.push(b.name),
    onBlockEnd: (b) => ends.push(b.name),
  });
  assert.deepStrictEqual(starts, ['TEST-BLOCK']);
  assert.deepStrictEqual(ends, ['TEST-BLOCK']);
});

test('parseDxf: an entity inside a BLOCK body is tagged with section=BLOCKS and the real blockName', async () => {
  const entities = [];
  await parseDxf(streamOf(BLOCK_FIXTURE), { onEntity: (e) => entities.push(e) });
  assert.strictEqual(entities.length, 1);
  assert.strictEqual(entities[0].section, 'BLOCKS');
  assert.strictEqual(entities[0].blockName, 'TEST-BLOCK');
  assert.deepStrictEqual(entities[0].points[0], { x: 0, y: 0, z: 0 });
  assert.deepStrictEqual(entities[0].point2, { x: 100, y: 0, z: 0 });
});

// ── parseDxf: entities ──────────────────────────────────────────────────

test('parseDxf: entity boundaries -- each 0-marker starts a new entity, none merged', async () => {
  const entities = [];
  await parseDxf(streamOf(FIXTURE), { onEntity: (e) => entities.push(e.type) });
  assert.deepStrictEqual(entities, ['LINE', 'TEXT', 'XLINE', 'LWPOLYLINE', 'LINE']);
});

test('parseDxf: LINE coordinates captured exactly (start via points[0], end via point2)', async () => {
  const lines = [];
  await parseDxf(streamOf(FIXTURE), { onEntity: (e) => { if (e.type === 'LINE') lines.push(e); } });
  assert.strictEqual(lines.length, 2, 'duplicate LINE entities are NOT silently merged by the raw parser');
  const [first] = lines;
  assert.strictEqual(first.layer, 'TEST-GRID');
  assert.strictEqual(first.handle, 'A1');
  assert.deepStrictEqual(first.points[0], { x: -87250, y: 0, z: 0 });
  assert.deepStrictEqual(first.point2, { x: 87250, y: 0, z: 0 });
});

test('parseDxf: duplicate-coordinate LINE entities preserved as two distinct entities (different handles)', async () => {
  const lines = [];
  await parseDxf(streamOf(FIXTURE), { onEntity: (e) => { if (e.type === 'LINE') lines.push(e); } });
  assert.strictEqual(lines[0].handle, 'A1');
  assert.strictEqual(lines[1].handle, 'A5');
  assert.deepStrictEqual(lines[0].points[0], lines[1].points[0]);
});

test('parseDxf: XLINE captured as a point + direction vector (point2), never conflated with a LINE end point', async () => {
  const xlines = [];
  await parseDxf(streamOf(FIXTURE), { onEntity: (e) => { if (e.type === 'XLINE') xlines.push(e); } });
  assert.strictEqual(xlines.length, 1);
  assert.deepStrictEqual(xlines[0].points[0], { x: 0, y: -60150, z: 0 });
  assert.deepStrictEqual(xlines[0].point2, { x: 0, y: 1, z: 0 });
});

test('parseDxf: LWPOLYLINE multi-vertex coordinates captured as separate points, in order', async () => {
  const polys = [];
  await parseDxf(streamOf(FIXTURE), { onEntity: (e) => { if (e.type === 'LWPOLYLINE') polys.push(e); } });
  assert.strictEqual(polys.length, 1);
  assert.strictEqual(polys[0].points.length, 3);
  assert.deepStrictEqual(polys[0].points, [
    { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 },
  ]);
});

test('parseDxf: TEXT content extracted verbatim, never fabricated', async () => {
  const texts = [];
  await parseDxf(streamOf(FIXTURE), { onEntity: (e) => { if (e.type === 'TEXT') texts.push(e); } });
  assert.strictEqual(texts.length, 1);
  assert.deepStrictEqual(texts[0].texts, ['1']);
  assert.deepStrictEqual(texts[0].points[0], { x: -87250, y: 5000, z: 0 });
});

test('parseDxf: section start/end callbacks fire for TABLES and ENTITIES, in order', async () => {
  const events = [];
  await parseDxf(streamOf(FIXTURE), {
    onSectionStart: (n) => events.push(`start:${n}`),
    onSectionEnd: (n) => events.push(`end:${n}`),
  });
  assert.deepStrictEqual(events, ['start:TABLES', 'end:TABLES', 'start:ENTITIES', 'end:ENTITIES']);
});

test('parseDxf: pair/malformed counts returned, deterministic across repeated runs on the same input', async () => {
  const r1 = await parseDxf(streamOf(FIXTURE), {});
  const r2 = await parseDxf(streamOf(FIXTURE), {});
  assert.deepStrictEqual(r1, r2);
  assert.strictEqual(r1.malformedCount, 0);
  assert.ok(r1.pairCount > 0);
});

test('parseDxf: a malformed group pair inside ENTITIES is reported via onMalformedPair, parsing continues past it', async () => {
  const withMalformed = FIXTURE.replace(
    '0\r\nLINE\r\n5\r\nA1\r\n',
    '0\r\nLINE\r\nBADCODE\r\nignored\r\n5\r\nA1\r\n',
  );
  assert.notStrictEqual(withMalformed, FIXTURE, 'fixture substitution must actually match');
  const malformed = [];
  const entities = [];
  await parseDxf(streamOf(withMalformed), {
    onMalformedPair: (m) => malformed.push(m),
    onEntity: (e) => entities.push(e.type),
  });
  assert.strictEqual(malformed.length, 1);
  assert.strictEqual(malformed[0].code, 'BADCODE');
  // the entity itself still parses -- one bad pair does not abort the file
  assert.ok(entities.includes('LINE'));
});

test('deterministic output: running parseDxf twice on the identical fixture yields byte-identical entity lists', async () => {
  const collect = async () => {
    const out = [];
    await parseDxf(streamOf(FIXTURE), { onEntity: (e) => out.push(JSON.stringify({ type: e.type, layer: e.layer, handle: e.handle, points: e.points, point2: e.point2, texts: e.texts })) });
    return out;
  };
  const a = await collect();
  const b = await collect();
  assert.deepStrictEqual(a, b);
});

runAll().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
