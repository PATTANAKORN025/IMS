/**
 * Ring closure tests — scripts/lib/cad-rings.js
 *
 * These are regression tests for a specific, expensive defect: reading only
 * the LWPOLYLINE closed flag and treating everything else as an open boundary.
 * On Floor 1 that discarded thirteen of thirty-two area boundaries and, because
 * every boundary with more than four vertices closes the other way, it removed
 * exactly the L-shaped and stepped rooms while leaving the model internally
 * consistent and every existing check green.
 *
 * The fixtures below are shapes, not the drawing: no private coordinate is in
 * this file. The two tolerance cases use the magnitudes actually observed in
 * the source (4e-4 mm and 5e-10 mm) because those are the numbers the rule has
 * to survive; the values themselves say nothing about the building.
 *
 * Run: node tests/unit/floor1-cad-rings.test.js
 */

'use strict';

const assert = require('assert');
const rings = require('../../scripts/lib/cad-rings');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

/** A rectangle, given as separate ordinate arrays the way a DXF reader has it. */
function rect(w, h) {
  return { xs: [0, w, w, 0], ys: [0, 0, h, h] };
}

/** The same rectangle with its first vertex repeated as the last. */
function rectRepeated(w, h) {
  return { xs: [0, w, w, 0, 0], ys: [0, 0, h, h, 0] };
}

// ── the flag encoding ───────────────────────────────────────

test('a set closed flag closes the ring, whatever the vertices do', () => {
  const r = rect(1000, 2000);
  assert.strictEqual(rings.ringClosure(r.xs, r.ys, true), rings.CLOSED_FLAG);
  assert.strictEqual(rings.isClosedRing(r.xs, r.ys, true), true);
});

test('the flag wins over the vertex test, so closure is reported once', () => {
  // A ring that both sets the flag and repeats its first vertex is CLOSED_FLAG,
  // not both. The provenance field records how the drawing declared it.
  const r = rectRepeated(1000, 2000);
  assert.strictEqual(rings.ringClosure(r.xs, r.ys, true), rings.CLOSED_FLAG);
});

// ── the repeated-vertex encoding ────────────────────────────

test('a repeated first vertex closes the ring with the flag clear', () => {
  const r = rectRepeated(1000, 2000);
  assert.strictEqual(rings.ringClosure(r.xs, r.ys, false), rings.REPEATED_FIRST_VERTEX);
  assert.strictEqual(rings.isClosedRing(r.xs, r.ys, false), true);
});

test('an L-shape closes by repeated vertex the same way a rectangle does', () => {
  // This is the shape class the defect removed: more than four vertices, so it
  // could never be one of the flagged rectangles.
  const xs = [0, 6000, 6000, 3000, 3000, 0, 0];
  const ys = [0, 0, 3000, 3000, 6000, 6000, 0];
  assert.strictEqual(rings.ringClosure(xs, ys, false), rings.REPEATED_FIRST_VERTEX);
});

test('a polyline that simply ends is open, and stays open', () => {
  const xs = [0, 6000, 6000, 3000];
  const ys = [0, 0, 3000, 3000];
  assert.strictEqual(rings.ringClosure(xs, ys, false), rings.OPEN);
  assert.strictEqual(rings.isClosedRing(xs, ys, false), false);
});

// ── the tolerance ───────────────────────────────────────────

test('decimal noise in the file does not open a closed ring', () => {
  // Both magnitudes are ones the real source produces. Exact equality read
  // each of these as an open boundary.
  for (const noise of [4.005e-4, 4.657e-10]) {
    const r = rectRepeated(31900, 21800);
    r.xs[r.xs.length - 1] = r.xs[0] + noise;
    assert.strictEqual(
      rings.ringClosure(r.xs, r.ys, false), rings.REPEATED_FIRST_VERTEX,
      `noise ${noise}`);
  }
});

test('a gap anyone could draw is not closed by the tolerance', () => {
  // One millimetre is a thousand times the tolerance and still far below any
  // real feature -- if even that closed, the rule would be closing doorways.
  const r = rectRepeated(31900, 21800);
  r.xs[r.xs.length - 1] = r.xs[0] + 1;
  assert.strictEqual(rings.ringClosure(r.xs, r.ys, false), rings.OPEN);
});

test('the tolerance is a distance, not a per-axis allowance', () => {
  // Half the tolerance on each axis is still inside the circle; the full
  // tolerance on each axis is not.
  const half = rings.CLOSE_TOL_MM / 2;
  const a = rectRepeated(1000, 1000);
  a.xs[a.xs.length - 1] = a.xs[0] + half;
  a.ys[a.ys.length - 1] = a.ys[0] + half;
  assert.strictEqual(rings.ringClosure(a.xs, a.ys, false), rings.REPEATED_FIRST_VERTEX);

  const b = rectRepeated(1000, 1000);
  b.xs[b.xs.length - 1] = b.xs[0] + rings.CLOSE_TOL_MM;
  b.ys[b.ys.length - 1] = b.ys[0] + rings.CLOSE_TOL_MM;
  assert.strictEqual(rings.ringClosure(b.xs, b.ys, false), rings.OPEN);
});

test('the tolerance can be overridden, and a bad override is ignored', () => {
  const r = rectRepeated(1000, 1000);
  r.xs[r.xs.length - 1] = r.xs[0] + 0.5;
  assert.strictEqual(rings.ringClosure(r.xs, r.ys, false, 1), rings.REPEATED_FIRST_VERTEX);
  assert.strictEqual(rings.ringClosure(r.xs, r.ys, false, 0.1), rings.OPEN);
  // A negative, NaN or non-numeric tolerance falls back to the default rather
  // than closing everything or nothing.
  for (const bad of [-1, NaN, Infinity, '1000', null, undefined]) {
    assert.strictEqual(rings.ringClosure(r.xs, r.ys, false, bad), rings.OPEN, String(bad));
  }
});

// ── degenerate input ────────────────────────────────────────

test('too few vertices cannot be a ring', () => {
  // Three points where the last repeats the first is a line drawn out and
  // back, which encloses nothing.
  assert.strictEqual(rings.ringClosure([0, 1000, 0], [0, 0, 0], false), rings.OPEN);
  assert.strictEqual(rings.ringClosure([0], [0], false), rings.OPEN);
  assert.strictEqual(rings.ringClosure([], [], false), rings.OPEN);
});

test('a non-array or non-finite ordinate is open, never a throw', () => {
  assert.strictEqual(rings.ringClosure(null, null, false), rings.OPEN);
  assert.strictEqual(rings.ringClosure('0,1,2,0', '0,0,1,0', false), rings.OPEN);
  assert.strictEqual(rings.ringClosure([0, 1, 1, NaN], [0, 0, 1, 0], false), rings.OPEN);
  assert.strictEqual(rings.ringClosure([0, 1, 1, Infinity], [0, 0, 1, 0], false), rings.OPEN);
  assert.strictEqual(rings.ringClosure(['0', 1, 1, 0], [0, 0, 1, 0], false), rings.OPEN);
});

test('a truthy non-boolean flag does not count as the flag being set', () => {
  // The reader sets this from a bit test and always passes a boolean. Anything
  // else means the caller changed and the vertex rule should decide.
  const open = rect(1000, 1000);
  for (const flagged of [1, 'true', {}, []]) {
    assert.strictEqual(rings.ringClosure(open.xs, open.ys, flagged), rings.OPEN, String(flagged));
  }
});

test('mismatched ordinate array lengths use the shorter one', () => {
  const xs = [0, 1000, 1000, 0, 0, 0];
  const ys = [0, 0, 1000, 1000, 0];
  assert.strictEqual(rings.ringClosure(xs, ys, false), rings.REPEATED_FIRST_VERTEX);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
