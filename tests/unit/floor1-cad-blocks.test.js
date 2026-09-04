/**
 * Block-reference geometry tests — scripts/lib/cad-blocks.js
 *
 * These are regression tests for the defect this pass fixed: reading an
 * INSERT's position and rotation but not its SCALE, and taking a footprint
 * from the block's bounding box in the block's own coordinates. On Floor 1
 * that mis-sized every scaled instance and silently un-mirrored 123 machines,
 * while leaving every existing check green -- a mirrored box is still a box.
 *
 * The fixtures are shapes and unit numbers, not the drawing. No private
 * coordinate appears in this file. The scale values used (-1 and 0.64) are the
 * ones the source actually carries, because those are what the maths has to
 * survive; the values themselves say nothing about the building.
 *
 * Run: node tests/unit/floor1-cad-blocks.test.js
 */

'use strict';

const assert = require('assert');
const B = require('../../scripts/lib/cad-blocks');

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

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol),
  `expected ${a} within ${tol === undefined ? 1e-9 : tol} of ${b}`);

/** A 2x1 rectangle at the origin, as a flat point run. */
const RECT = [0, 0, 2, 0, 2, 1, 0, 1];

console.log('cad-blocks: the transform chain');

test('an unrotated, unscaled INSERT translates only', () => {
  const T = B.affine({ x: 10, y: 5, rot: 0 }, [0, 0]);
  const p = B.applyTo(T, RECT);
  assert.deepStrictEqual(p.slice(0, 4), [10, 5, 12, 5]);
});

test('the block base point is subtracted before anything else', () => {
  // A block drawn around (100, 100) with its base point there lands ON the
  // insertion point, not 100 units away from it.
  const T = B.affine({ x: 0, y: 0, rot: 0 }, [100, 100]);
  const p = B.applyTo(T, [100, 100, 101, 100]);
  assert.deepStrictEqual(p, [0, 0, 1, 0]);
});

test('rotation turns the block about the insertion point', () => {
  const T = B.affine({ x: 0, y: 0, rot: 90 }, [0, 0]);
  const p = B.applyTo(T, [1, 0]);
  near(p[0], 0);
  near(p[1], 1);
});

test('a uniform scale scales, and does not move, the insertion point', () => {
  const T = B.affine({ x: 7, y: 7, rot: 0, sx: 0.64, sy: 0.64 }, [0, 0]);
  const p = B.applyTo(T, [0, 0, 100, 0]);
  assert.deepStrictEqual(p.slice(0, 2), [7, 7]);
  near(p[2], 71);
});

test('sx = -1 mirrors in x and is detectable as a mirror', () => {
  const T = B.affine({ x: 0, y: 0, rot: 0, sx: -1, sy: 1 }, [0, 0]);
  const p = B.applyTo(T, [1, 2]);
  near(p[0], -1);
  near(p[1], 2);
  assert.strictEqual(B.isMirrored(T), true);
  assert.strictEqual(B.isMirrored(B.affine({ x: 0, y: 0, rot: 30 }, [0, 0])), false);
});

test('a mirror composed with a rotation is still a mirror', () => {
  const T = B.affine({ x: 3, y: 4, rot: 180, sx: -1, sy: 1 }, [0, 0]);
  assert.strictEqual(B.isMirrored(T), true);
  // rot 180 with sx = -1 is a reflection in the y axis about the insert point
  const p = B.applyTo(T, [1, 1]);
  near(p[0], 4);
  near(p[1], 3);
});

test('nested transforms compose as a matrix product, not a box product', () => {
  // Parent places the child block at (10, 0) turned a quarter turn; the child
  // draws a unit step at (1, 0). Composed, the step lands at (10, 1).
  const parent = B.affine({ x: 0, y: 0, rot: 0 }, [0, 0]);
  const child = B.affine({ x: 10, y: 0, rot: 90 }, [0, 0]);
  const T = B.compose(parent, child);
  const p = B.applyTo(T, [1, 0]);
  near(p[0], 10);
  near(p[1], 1);
});

test('composition is associative over three levels', () => {
  const a = B.affine({ x: 1, y: 2, rot: 30, sx: 2, sy: 2 }, [0, 0]);
  const b = B.affine({ x: -3, y: 4, rot: 15 }, [1, 1]);
  const c = B.affine({ x: 0.5, y: 0.5, rot: 45, sx: -1, sy: 1 }, [0, 0]);
  const left = B.compose(B.compose(a, b), c);
  const right = B.compose(a, B.compose(b, c));
  for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) near(left[k], right[k], 1e-9);
});

test('the identity leaves a transform unchanged', () => {
  const t = B.affine({ x: 5, y: 6, rot: 20, sx: 0.5, sy: 2 }, [1, 1]);
  const l = B.compose(B.IDENTITY, t);
  for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) near(l[k], t[k]);
});

console.log('cad-blocks: what a block draws');

test('annotation entities are excluded by type', () => {
  const r = B.physicalEntities([
    { t: 'LINE', l: '0' }, { t: 'TEXT', l: '0' }, { t: 'DIMENSION', l: '0' },
    { t: 'LWPOLYLINE', l: '0' },
  ]);
  assert.deepStrictEqual(r.physical, [0, 3]);
  assert.deepStrictEqual(r.annotation, [1, 2]);
});

test('drafting layers are excluded by name', () => {
  assert.strictEqual(B.isDraftingLayer('CEN'), true);
  assert.strictEqual(B.isDraftingLayer('Defpoints'), true);
  assert.strictEqual(B.isDraftingLayer('DIM1'), true);
  assert.strictEqual(B.isDraftingLayer('标注'), true);
  assert.strictEqual(B.isDraftingLayer('5000L-T$0$DIM'), true);
  // and machine layers are not, however much they look like one
  assert.strictEqual(B.isDraftingLayer('0'), false);
  assert.strictEqual(B.isDraftingLayer('CENTRIFUGE'), false);
  assert.strictEqual(B.isDraftingLayer('DIMPLE-JACKET'), false);
  assert.strictEqual(B.isDraftingLayer(''), false);
  assert.strictEqual(B.isDraftingLayer(null), false);
});

test('the drafting filter never empties a block', () => {
  // Four Floor 1 machine blocks draw their whole body on a layer called CEN or
  // DIM. Subtracting it would delete a real machine from the floor.
  const r = B.physicalEntities([{ t: 'LINE', l: 'CEN' }, { t: 'ARC', l: 'CEN' }]);
  assert.deepStrictEqual(r.physical, [0, 1]);
  assert.strictEqual(r.drafting_kept, true);
});

test('a block of nothing but annotation stays empty', () => {
  const r = B.physicalEntities([{ t: 'TEXT', l: '0' }, { t: 'MTEXT', l: 'CEN' }]);
  assert.deepStrictEqual(r.physical, []);
  assert.strictEqual(r.drafting_kept, false);
});

console.log('cad-blocks: extent, shape and orientation');

test('an oriented extent measures along the stated axis', () => {
  const e = B.orientedExtent(RECT, 0);
  near(e.width, 2);
  near(e.depth, 1);
  near(e.cx, 1);
  near(e.cy, 0.5);
});

test('the same rectangle turned 90 degrees measures the same way round', () => {
  // The rectangle is rotated, and so is the measuring frame: width stays width.
  const turned = [0, 0, 0, 2, -1, 2, -1, 0];
  const e = B.orientedExtent(turned, 90);
  near(e.width, 2);
  near(e.depth, 1);
});

test('a 30-degree rectangle is measured exactly on its own axis', () => {
  const t = 30 * Math.PI / 180;
  const pts = [];
  for (const [x, y] of [[0, 0], [4, 0], [4, 3], [0, 3]]) {
    pts.push(x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t));
  }
  const e = B.orientedExtent(pts, 30);
  near(e.width, 4, 1e-9);
  near(e.depth, 3, 1e-9);
  const box = B.minAreaRect(B.convexHull(pts));
  near(box.width * box.depth, 12, 1e-6);
  near(B.angleDelta(box.angle_deg, 30, 90), 0, 1e-6);
});

test('the minimum-area box beats the axis-aligned box on a turned rectangle', () => {
  const t = 45 * Math.PI / 180;
  const pts = [];
  for (const [x, y] of [[0, 0], [4, 0], [4, 1], [0, 1]]) {
    pts.push(x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t));
  }
  const axis = B.orientedExtent(pts, 0);
  const box = B.minAreaRect(B.convexHull(pts));
  assert.ok(box.width * box.depth < axis.width * axis.depth * 0.7,
    'the fitted box should be much smaller than the axis-aligned one');
  near(box.width * box.depth, 4, 1e-6);
});

test('angle deltas are measured modulo a half turn', () => {
  near(B.angleDelta(90, 270), 0);
  near(B.angleDelta(0, 179), 1);
  near(B.angleDelta(10, 350, 360), 20);
});

test('a filled box classifies as a rectangle, and a turned one as rotated', () => {
  const hull = B.convexHull(RECT);
  assert.strictEqual(B.classifyShape(hull, B.orientedExtent(RECT, 0)), 'rectangle');
  const t = 20 * Math.PI / 180;
  const pts = [];
  for (const [x, y] of [[0, 0], [2, 0], [2, 1], [0, 1]]) {
    pts.push(x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t));
  }
  assert.strictEqual(B.classifyShape(B.convexHull(pts), B.orientedExtent(pts, 20)), 'rotated_rectangle');
});

test('an L shape is not called a rectangle', () => {
  const L = [0, 0, 4, 0, 4, 1, 1, 1, 1, 4, 0, 4];
  const hull = B.convexHull(L);
  const shape = B.classifyShape(hull, B.orientedExtent(L, 0));
  assert.ok(shape === 'polygon' || shape === 'irregular', `got ${shape}`);
});

test('an empty or degenerate hull is unresolved, never a default box', () => {
  assert.strictEqual(B.classifyShape([], null), 'unresolved');
  assert.strictEqual(B.classifyShape(B.convexHull([1, 1]), null), 'unresolved');
  assert.strictEqual(B.orientedExtent([], 0), null);
});

test('hull simplification keeps the vertex budget and most of the area', () => {
  const circle = [];
  for (let i = 0; i < 64; i += 1) {
    circle.push(Math.cos(i / 64 * Math.PI * 2), Math.sin(i / 64 * Math.PI * 2));
  }
  const hull = B.convexHull(circle);
  const small = B.simplifyHull(hull, 8);
  assert.strictEqual(small.length, 8);
  assert.ok(B.polygonArea(small) > B.polygonArea(hull) * 0.85);
  assert.strictEqual(B.simplifyHull(hull, 500).length, hull.length);
});

test('two boxes that share floor report their overlap', () => {
  const a = B.boxCorners(0, 0, 2, 2, 0);
  const b = B.boxCorners(1, 0, 2, 2, 0);
  near(B.polygonArea(B.convexIntersection(a, b)), 2);
  assert.deepStrictEqual(B.convexIntersection(a, B.boxCorners(10, 0, 2, 2, 0)), []);
});

test('a turned box overlaps its neighbour by the turned area, not the box', () => {
  // Two thin machines at right angles, crossing at the centre: the boxes
  // overlap by a small square, and asking the AABBs instead would report the
  // whole of the smaller one.
  const a = B.boxCorners(0, 0, 8, 1, 0);
  const b = B.boxCorners(0, 0, 8, 1, 90);
  near(B.polygonArea(B.convexIntersection(a, b)), 1, 1e-9);
});

test('box corners turn about the centre, and a mirror does not change the box', () => {
  const c = B.boxCorners(0, 0, 4, 2, 90);
  const ext = B.orientedExtent(c.flat(), 90);
  near(ext.width, 4);
  near(ext.depth, 2);
});

test('simplification never drops a vertex the extent depends on', () => {
  // A long thin hull with one far spike: the spike carries the extent, and a
  // plain area-loss simplification removes it first.
  // A rectangle with a shallow apex on each end. Removing an apex loses very
  // little area and is therefore what a plain simplification removes first --
  // but the apexes are exactly what the width is measured to.
  const hull = B.convexHull([0, 0, 10, 0, 10, 4, 0, 4, 10.4, 2, -0.4, 2]);
  const before = B.orientedExtent(hull.flat(), 0);
  near(before.width, 10.8);
  const naive = B.simplifyHull(hull, 5);
  const kept = B.simplifyHull(hull, 5, B.supportVertices(hull, 0));
  assert.ok(B.orientedExtent(naive.flat(), 0).width < before.width - 0.3,
    'the naive simplification should lose an apex, or this test proves nothing');
  near(B.orientedExtent(kept.flat(), 0).width, before.width, 1e-9);
  assert.ok(kept.length <= 5);
});

test('the support vertices are the ones the oriented box touches', () => {
  const hull = B.convexHull(RECT);
  const sup = B.supportVertices(hull, 0);
  assert.ok(sup.length >= 2 && sup.length <= 4);
  for (const p of sup) assert.ok(hull.some(([x, y]) => x === p[0] && y === p[1]));
  assert.deepStrictEqual(B.supportVertices([], 0), []);
});

test('point-in-polygon answers for a footprint', () => {
  const poly = [[0, 0], [2, 0], [2, 1], [0, 1]];
  assert.strictEqual(B.pointInPolygon(1, 0.5, poly), true);
  assert.strictEqual(B.pointInPolygon(3, 0.5, poly), false);
  assert.strictEqual(B.pointInPolygon(1, 0.5, [[0, 0], [1, 1]]), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
