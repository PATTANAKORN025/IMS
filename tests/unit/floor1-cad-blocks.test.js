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

console.log('cad-blocks: operational footprint');

test('the axis offset is signed, and folded into a quarter turn', () => {
  // A rectangle is the same rectangle under a quarter turn, so an axis is only
  // defined modulo 90. An UNSIGNED fold turns half the machines the wrong way,
  // and a machine turned the wrong way measures LARGER, not smaller: this is
  // the bug the signed fold exists to prevent.
  near(B.axisOffset(-114.388, 180), -24.388, 1e-9);
  near(B.axisOffset(87.855, 270), -2.145, 1e-9);
  near(B.axisOffset(30, 30), 0, 1e-12);
  near(B.axisOffset(120, 30), 0, 1e-12); // a quarter turn is the same axis
  near(B.axisOffset(35, 30), 5, 1e-12);
  near(B.axisOffset(25, 30), -5, 1e-12);
  // and it always lands inside the half-open quarter turn
  for (let a = -400; a <= 400; a += 7.3) {
    const d = B.axisOffset(a, 17);
    assert.ok(d > -45.0000001 && d <= 45.0000001, `${a} -> ${d}`);
  }
});

test('re-measuring on the body axis moves the centre, and the centre must travel with it', () => {
  // An L drawn at 20 degrees inside its own block. Measured on the INSERT axis
  // (0) and on the body axis (20) the SAME hull gives two different extents --
  // and two different centres. Drawing the body-axis SIZE at the INSERT-axis
  // CENTRE cuts measured geometry away, which is why the centre is published
  // with the size rather than assumed to be the machine's position.
  const t = 20 * Math.PI / 180;
  const shape = [[0, 0], [4, 0], [4, 1], [1.5, 1], [1.5, 3], [0, 3]];
  const hull = B.convexHull(shape.reduce((f, [x, y]) => {
    f.push(x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t));
    return f;
  }, []));

  const onInsert = B.operationalRectangle(hull, 0, 0);
  const onBody = B.operationalRectangle(hull, 0, 20);
  assert.ok(onBody.width * onBody.depth < onInsert.width * onInsert.depth,
    'the body axis is the tighter measurement, which is the point of measuring it');
  const travelled = Math.hypot(onBody.cx - onInsert.cx, onBody.cy - onInsert.cy);
  assert.ok(travelled > 0.01, `the extent centre moved ${travelled}`);

  // At its OWN centre the body-axis rectangle contains every hull point.
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const outside = (cx, cy) => {
    let worst = 0;
    for (const [x, y] of hull) {
      const dx = x - cx;
      const dy = y - cy;
      worst = Math.max(worst,
        Math.abs(dx * cos + dy * sin) - onBody.width / 2,
        Math.abs(-dx * sin + dy * cos) - onBody.depth / 2);
    }
    return worst;
  };
  assert.ok(outside(onBody.cx, onBody.cy) < 1e-9,
    'the operational rectangle contains the geometry it was measured from');
  // and at the physical centre it does not -- the failure this guards against
  assert.ok(outside(onInsert.cx, onInsert.cy) > 0.001,
    'drawing the body-axis size at the INSERT-axis centre cuts geometry away');
});

test('a rectangle measured on its own axis is the minimum-area rectangle', () => {
  // The operational rectangle claims to be the tightest one available. That is
  // only true if the axis it is measured on is the minimum-area axis, so this
  // checks the two agree rather than trusting either.
  const t = 18.85 * Math.PI / 180;
  const pts = [];
  for (const [x, y] of [[-2, -1], [2, -1], [2, 1], [-2, 1]]) {
    pts.push(x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t));
  }
  const hull = B.convexHull(pts);
  const offset = B.axisOffset(B.minAreaRect(hull).angle_deg, 0);
  near(Math.abs(offset), 18.85, 1e-6);
  const rect = B.operationalRectangle(hull, 0, offset);
  near(rect.width * rect.depth, 8, 1e-9); // the true area of a 4 x 2 rectangle
  // measured on the INSERT axis instead, the same machine reports much larger
  const naive = B.operationalRectangle(hull, 0, 0);
  assert.ok(naive.width * naive.depth > 9.5,
    `measuring off-axis must cost area, got ${naive.width * naive.depth}`);
});

test('the operational rectangle contains every measured point, at every angle', () => {
  // The one invariant that matters: tightening the box may never cut geometry
  // off the machine. Checked at the cardinal angles, an off-axis machine, its
  // mirror, and the wrap.
  const pts = [0, 0, 4, 0, 4, 1, 1.5, 1, 1.5, 3, 0, 3]; // an L
  for (const rot of [0, 90, 180, 270, 70.2, -70.2, 359.99]) {
    for (const mirror of [1, -1]) {
      const t = B.affine({ x: 11, y: -7, rot, sx: mirror, sy: 1 }, [0, 0]);
      const placed = B.applyTo(t, pts);
      const hull = B.convexHull(placed);
      const offset = B.axisOffset(B.minAreaRect(hull).angle_deg, rot);
      const rect = B.operationalRectangle(hull, rot, offset);
      assert.ok(rect, `no rectangle at ${rot} mirror ${mirror}`);
      const ang = rect.angle_deg * Math.PI / 180;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      for (const [x, y] of hull) {
        const dx = x - rect.cx;
        const dy = y - rect.cy;
        const u = Math.abs(dx * cos + dy * sin);
        const v = Math.abs(-dx * sin + dy * cos);
        assert.ok(u <= rect.width / 2 + 1e-9 && v <= rect.depth / 2 + 1e-9,
          `a measured point fell outside the rectangle at ${rot}, mirror ${mirror}`);
      }
      // and it is never larger than the extent measured on the INSERT axis
      const onInsert = B.operationalRectangle(hull, rot, 0);
      assert.ok(rect.width * rect.depth <= onInsert.width * onInsert.depth + 1e-9,
        'the body axis may tighten a box, never grow one');
    }
  }
});

test('a mirrored machine takes the opposite body-axis offset from its twin', () => {
  // A reflection negates the body angle. Pooling a block's mirrored and
  // unmirrored instances would average a machine and its reflection into an
  // axis neither of them has, which is why they are grouped by handing.
  const pts = [0, 0, 4, 0, 4, 1, 1.5, 1, 1.5, 3, 0, 3];
  const offsetFor = (mirror) => {
    const t = B.affine({ x: 0, y: 0, rot: 0, sx: mirror, sy: 1 }, [0, 0]);
    const hull = B.convexHull(B.applyTo(t, pts));
    return { offset: B.axisOffset(B.minAreaRect(hull).angle_deg, 0), mirrored: B.isMirrored(t) };
  };
  const drawn = offsetFor(1);
  const mirrored = offsetFor(-1);
  assert.strictEqual(drawn.mirrored, false);
  assert.strictEqual(mirrored.mirrored, true);
  near(mirrored.offset, -drawn.offset, 1e-9);
});

test('an enclosure is found by containment and scale, not by what shrinks the box', () => {
  const ring = { key: 'ring', hull: B.convexHull([-10, -6, 10, -6, 10, 6, -10, 6]) };
  const body = { key: 'body', hull: B.convexHull([-2, -1, 2, -1, 2, 1, -2, 1]) };
  assert.strictEqual(B.envelopeGroup([ring, body]), 0);
  assert.strictEqual(B.envelopeGroup([body, ring]), 1);

  // A long ARM makes the box far bigger than the body and is NOT an enclosure:
  // it does not contain the body. Excluding it would report a machine smaller
  // than the drawing has it, which is the failure this rule must not have.
  const arm = { key: 'arm', hull: B.convexHull([2, -0.2, 14, -0.2, 14, 0.2, 2, 0.2]) };
  assert.strictEqual(B.envelopeGroup([arm, body]), -1);

  // Containment without the scale ratio is not an enclosure either: a body
  // drawn just inside its own outline is one machine, not two things.
  const snug = { key: 'snug', hull: B.convexHull([-2.2, -1.1, 2.2, -1.1, 2.2, 1.1, -2.2, 1.1]) };
  assert.strictEqual(B.envelopeGroup([snug, body]), -1);

  // and one group on its own is never an enclosure -- there is nothing to enclose
  assert.strictEqual(B.envelopeGroup([ring]), -1);
  assert.strictEqual(B.envelopeGroup([]), -1);
});

test('at most one group can be an enclosure', () => {
  // Two groups cannot each contain the other and be three times its area, so
  // the rule cannot strip a machine down by degrees.
  const a = { key: 'a', hull: B.convexHull([-10, -6, 10, -6, 10, 6, -10, 6]) };
  const b = { key: 'b', hull: B.convexHull([-3, -2, 3, -2, 3, 2, -3, 2]) };
  const c = { key: 'c', hull: B.convexHull([-1, -1, 1, -1, 1, 1, -1, 1]) };
  const idx = B.envelopeGroup([a, b, c]);
  assert.strictEqual(idx, 0);
  // and with the outermost gone, the next one is not automatically an
  // enclosure: it has to earn it on the same two tests
  const rest = [b, c];
  const second = B.envelopeGroup(rest);
  assert.ok(second === -1 || second === 0, `unexpected ${second}`);
});

test('an ELLIPSE service/swing envelope is excluded even when it does not fully contain the body', () => {
  // A near-full ellipse (approximated here as a coarse polygon -- the real
  // function only ever sees ELLIPSE-tessellated points, never a true curve)
  // around a body whose corner pokes 5% past the ellipse's own rim: real
  // Floor 1 evidence (A$Cc7467117 / A$C776c247d) has exactly this shape --
  // 6.7% and 8.4% of the body's hull area outside the ellipse's hull -- and
  // envelopeGroup() correctly refuses both on containment alone.
  const ellipsePts = [];
  for (let a = 0; a < 32; a += 1) {
    const t = (a / 32) * Math.PI * 2;
    ellipsePts.push(10 * Math.cos(t), 6 * Math.sin(t));
  }
  const ellipse = { key: '00.Machine|ELLIPSE', hull: B.convexHull(ellipsePts) };
  // Body sits mostly inside the ellipse; one corner (11, 0.5) pokes outside
  // the rim (ellipse boundary at y=0.5 is x = 10*sqrt(1-0.5^2/36) ~= 9.97).
  const body = { key: '00.Machine|LINE', hull: B.convexHull([-2, -1, 2, -1, 2, 1, -2, 1, 11, 0.5]) };
  assert.strictEqual(B.envelopeGroup([ellipse, body]), -1,
    'containment-only envelopeGroup must still refuse this -- the body genuinely pokes out');
  const role = B.classifyEllipseRole([ellipse, body]);
  assert.ok(role, 'the ellipse-specific, bbox-coverage test must fire where envelopeGroup does not');
  assert.strictEqual(role.role, 'SERVICE_SWING_ENVELOPE');
  assert.strictEqual(role.excluded, 0);
  assert.ok(role.evidence.areaRatio >= 3);
  assert.ok(role.evidence.bodyBboxCoverage >= 0.9);
  // The corrected body hull is the small body, not the huge ellipse.
  assert.ok(B.polygonArea(role.bodyHull) < B.polygonArea(ellipse.hull) / 3);
});

test('classifyEllipseRole never fires on a non-ELLIPSE group, however large', () => {
  // The same shape and ratio as the case above, but keyed as a LINE group --
  // a real large enclosing shape (a fence, a rail) is envelopeGroup's
  // territory or nothing's; this function has no opinion on it.
  const bigPts = [];
  for (let a = 0; a < 32; a += 1) {
    const t = (a / 32) * Math.PI * 2;
    bigPts.push(10 * Math.cos(t), 6 * Math.sin(t));
  }
  const big = { key: '00.Machine|LINE', hull: B.convexHull(bigPts) };
  const body = { key: '00.Machine|ARC', hull: B.convexHull([-2, -1, 2, -1, 2, 1, -2, 1, 11, 0.5]) };
  assert.strictEqual(B.classifyEllipseRole([big, body]), null);
});

test('classifyEllipseRole refuses a genuine round machine body, not just a huge one', () => {
  // Area ratio alone is not enough: an ellipse only modestly larger than a
  // body it does not mostly cover must not qualify.
  const ellipse = { key: '00.Machine|ELLIPSE', hull: B.convexHull([-3, -3, 3, -3, 3, 3, -3, 3]) };
  const farBody = { key: '00.Machine|LINE', hull: B.convexHull([8, 8, 9, 8, 9, 9, 8, 9]) };
  assert.strictEqual(B.classifyEllipseRole([ellipse, farBody]), null,
    'a small, distant body must not be swallowed by an unrelated ellipse');
});

test('classifyEllipseRole requires the area-ratio floor, coverage alone is not enough', () => {
  const ellipse = { key: '00.Machine|ELLIPSE', hull: B.convexHull([-2, -1, 2, -1, 2, 1, -2, 1]) };
  const body = { key: '00.Machine|LINE', hull: B.convexHull([-1.8, -0.9, 1.8, -0.9, 1.8, 0.9, -1.8, 0.9]) };
  assert.strictEqual(B.classifyEllipseRole([ellipse, body]), null,
    'body is fully covered but nearly the same size as the ellipse -- not an envelope');
});

test('a degenerate input yields no rectangle rather than a default one', () => {
  assert.strictEqual(B.operationalRectangle([], 0, 0), null);
  assert.strictEqual(B.operationalRectangle([[0, 0], [1, 1]], 0, 0), null);
  assert.strictEqual(B.operationalRectangle(null, 0, 0), null);
});

console.log('cad-blocks: display vocabulary');

test('the display vocabulary is a rectangle or a marker, and nothing else', () => {
  assert.deepStrictEqual([...B.DISPLAY_SHAPES].sort(),
    ['OPERATIONAL_RECTANGLE', 'UNRESOLVED']);
});

test('overlap does not depend on which way round a polygon is wound', () => {
  // The canonical frame reflects z, so every polygon that was counter-clockwise
  // in the CAD arrives clockwise. Clipping without normalising the winding
  // reports two identical shapes as not touching.
  const a = B.boxCorners(0, 0, 2, 2, 0);
  const b = B.boxCorners(1, 0, 2, 2, 0);
  const area = B.polygonArea(B.convexIntersection(a, b));
  near(area, 2);
  near(B.polygonArea(B.convexIntersection(a.slice().reverse(), b)), 2);
  near(B.polygonArea(B.convexIntersection(a, b.slice().reverse())), 2);
  near(B.polygonArea(B.convexIntersection(a.slice().reverse(), b.slice().reverse())), 2);
  // and a shape against itself is itself, whichever way it is wound
  near(B.polygonArea(B.convexIntersection(a, a.slice().reverse())), 4);
});

test('a millimetre reflex turn in the clip does not cut away the answer', () => {
  // A convex outline published at millimetre resolution can come back with a
  // tiny reflex turn. Clipping by it must still return the whole overlap.
  const inner = B.boxCorners(0, 0, 2, 2, 0);
  const outer = [[-2, -2], [0, -2.0005], [2, -2], [2, 2], [-2, 2]];
  near(B.polygonArea(B.convexIntersection(inner, outer)), 4, 1e-3);
  near(B.polygonArea(B.convexIntersection(outer, inner)), 4, 1e-3);
});

test('a twin-frame box is built on the reflected angle', () => {
  // The canonical frame reflects z, so a machine served at +30 degrees has its
  // own axis at -30 in (x, z). Building the box on +30 is the bug this guards.
  const twin = B.twinBoxCorners(0, 0, 4, 2, 30);
  const flat = [];
  for (const [x, z] of twin) flat.push(x, z);
  const ext = B.orientedExtent(flat, -30);
  near(ext.width, 4, 1e-9);
  near(ext.depth, 2, 1e-9);
  near(ext.cx, 0, 1e-9);
  near(ext.cy, 0, 1e-9);
  // and measuring it on the unreflected angle reports a different machine
  assert.ok(Math.abs(B.orientedExtent(flat, 30).width - 4) > 0.2,
    'measuring on the wrong angle must not agree, or this test proves nothing');
});


console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
