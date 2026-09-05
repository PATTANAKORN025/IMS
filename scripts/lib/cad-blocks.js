/**
 * BLOCK-REFERENCE GEOMETRY: the transform chain, and what a block actually draws.
 *
 * A machine in this drawing is placed, not traced. An INSERT records where the
 * block goes, how it is scaled (including a NEGATIVE scale, which is a mirror),
 * and how it is turned; the BLOCK it names records the geometry that insertion
 * stamps down, and that geometry may itself contain further INSERTs. Getting a
 * machine's real footprint out of the CAD is therefore a transform problem,
 * not a measurement problem -- the dimensions are already in the file.
 *
 * WHY THIS IS A MODULE. The maths below is the whole difference between a
 * footprint that is the machine and a footprint that is the block's bounding
 * box in the block's own coordinates, and it must be testable without the
 * 412 MB drawing. Everything here is pure: points in, points out.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never invents an extent. A block whose
 * geometry cannot be resolved returns nothing, and the caller is expected to
 * record UNRESOLVED rather than substitute a nominal box.
 */

'use strict';

/**
 * Entity types that annotate a machine rather than draw one.
 *
 * A dimension leader, a part label or an attribute tag is placed BESIDE the
 * object it describes, so including one in a footprint pushes the extent out
 * past the machine by whatever the draughtsman thought was legible. These are
 * excluded by type, which is structural evidence from the file format itself,
 * not a guess about a layer name.
 */
const ANNOTATION_TYPES = new Set([
  'TEXT', 'MTEXT', 'ATTDEF', 'ATTRIB', 'DIMENSION', 'LEADER', 'MULTILEADER',
  'MLEADER', 'TOLERANCE',
]);

/**
 * Layers whose NAME states that they carry drafting aids: dimension chains,
 * centrelines, and AutoCAD's own non-plotting `Defpoints`.
 *
 * A centreline runs past the body of the part it centres -- that is what makes
 * it readable -- so it inflates an extent by a few hundred millimetres. This
 * drawing's machine blocks come from many vendors and their internal layer
 * names are not consistent, so this matches the conventions that recur rather
 * than enumerating one vendor's scheme.
 *
 * IMPORTANT: this filter is SUBTRACTIVE ONLY, and the caller must never let it
 * empty a block -- four blocks in Floor 1 draw their entire machine body on a
 * layer called `DIM`, `CEN` or the Chinese for "dimension". On those, the name
 * is not evidence of anything and the geometry is kept. See `physicalEntities`.
 */
const DRAFTING_LAYER = /^(defpoints|cen|center|centre|cl|dim\d*|axis|标注|標注|尺寸|中心[线線].*|\d*中心[线線].*)$/i;
const DRAFTING_SUFFIX = /\$0\$(dim|cl|cen|center)$/i;

function isDraftingLayer(name) {
  if (typeof name !== 'string') return false;
  const s = name.trim();
  return DRAFTING_LAYER.test(s) || DRAFTING_SUFFIX.test(s);
}

/**
 * The affine that maps one INSERT's block coordinates into its parent's.
 *
 * DXF order, and it is not negotiable: subtract the block's base point, scale,
 * rotate, translate to the insertion point. `sx = -1` is a MIRROR and comes
 * through the same 2x2 matrix as everything else -- treating it as a flag to
 * be handled later is how a mirrored machine ends up drawn on top of its
 * neighbour.
 */
function affine(ins, base) {
  const rot = ((ins && ins.rot) || 0) * Math.PI / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const sx = ins && Number.isFinite(ins.sx) ? ins.sx : 1;
  const sy = ins && Number.isFinite(ins.sy) ? ins.sy : 1;
  const a = cos * sx;
  const b = -sin * sy;
  const c = sin * sx;
  const d = cos * sy;
  const bx = base && Number.isFinite(base[0]) ? base[0] : 0;
  const by = base && Number.isFinite(base[1]) ? base[1] : 0;
  return {
    a, b, c, d,
    e: ((ins && ins.x) || 0) - (a * bx + b * by),
    f: ((ins && ins.y) || 0) - (c * bx + d * by),
  };
}

/** T_total = T_parent x T_child. Matrix product, not a bounding-box product. */
function compose(p, q) {
  return {
    a: p.a * q.a + p.b * q.c,
    b: p.a * q.b + p.b * q.d,
    c: p.c * q.a + p.d * q.c,
    d: p.c * q.b + p.d * q.d,
    e: p.a * q.e + p.b * q.f + p.e,
    f: p.c * q.e + p.d * q.f + p.f,
  };
}

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Applies a transform to a flat [x0,y0,x1,y1,...] run, returning a new run. */
function applyTo(T, pts) {
  const out = new Array(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    out[i] = T.a * x + T.b * y + T.e;
    out[i + 1] = T.c * x + T.d * y + T.f;
  }
  return out;
}

/**
 * Whether a transform mirrors. The determinant's sign is the answer; a mirror
 * is a real physical statement about the machine (its handing) and is recorded
 * rather than normalised away.
 */
function isMirrored(T) {
  return (T.a * T.d - T.b * T.c) < 0;
}

/**
 * Splits a block's entities into the ones that draw the machine and the ones
 * that describe it.
 *
 * Returns `{ physical, annotation, drafting }` as index lists. If the
 * subtractive filters would leave nothing, they are NOT applied: a block whose
 * every stroke sits on a layer called `CEN` is a badly layered machine, not an
 * empty one, and erasing it would delete a real machine from the floor.
 */
function physicalEntities(entities) {
  const physical = [];
  const annotation = [];
  const drafting = [];
  for (let i = 0; i < entities.length; i += 1) {
    const e = entities[i];
    if (ANNOTATION_TYPES.has(e.type || e.t)) { annotation.push(i); continue; }
    if (isDraftingLayer(e.layer !== undefined ? e.layer : e.l)) { drafting.push(i); continue; }
    physical.push(i);
  }
  if (physical.length === 0 && drafting.length > 0) {
    return { physical: drafting, annotation, drafting: [], drafting_kept: true };
  }
  return { physical, annotation, drafting, drafting_kept: false };
}

/** Monotone-chain convex hull. Input flat, output [[x,y], ...] counter-clockwise. */
function convexHull(flat) {
  const pts = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    if (Number.isFinite(flat[i]) && Number.isFinite(flat[i + 1])) pts.push([flat[i], flat[i + 1]]);
  }
  if (pts.length < 3) return pts;
  pts.sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Signed-area magnitude of a simple polygon given as [[x,y], ...]. */
function polygonArea(poly) {
  if (!Array.isArray(poly) || poly.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/**
 * The extent of a point set measured along a STATED direction -- the machine's
 * own axes, as the CAD turned it. This is the footprint the drawing asserts,
 * and it is measured, not fitted.
 */
function orientedExtent(flat, angleDeg) {
  const t = (angleDeg || 0) * Math.PI / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  let minu = Infinity; let maxu = -Infinity; let minv = Infinity; let maxv = -Infinity;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = flat[i];
    const y = flat[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const u = x * cos + y * sin;
    const v = -x * sin + y * cos;
    if (u < minu) minu = u;
    if (u > maxu) maxu = u;
    if (v < minv) minv = v;
    if (v > maxv) maxv = v;
  }
  if (!Number.isFinite(minu) || !Number.isFinite(minv)) return null;
  const cu = (minu + maxu) / 2;
  const cv = (minv + maxv) / 2;
  return {
    width: maxu - minu,
    depth: maxv - minv,
    cx: cu * cos - cv * sin,
    cy: cu * sin + cv * cos,
    angle_deg: ((angleDeg || 0) % 360 + 360) % 360,
  };
}

/**
 * The smallest-area rectangle that contains the hull, by rotating calipers.
 *
 * This is a SECOND, INDEPENDENT reading of the machine's orientation: the CAD
 * states one angle in the INSERT, and the geometry implies another. Comparing
 * them is the rotation reconciliation -- where they agree the angle is proven
 * twice, and where they disagree the machine is flagged, never silently
 * re-angled to whichever looks better.
 */
function minAreaRect(hull) {
  if (!Array.isArray(hull) || hull.length < 3) return null;
  let best = null;
  for (let i = 0; i < hull.length; i += 1) {
    const [x1, y1] = hull[i];
    const [x2, y2] = hull[(i + 1) % hull.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) continue;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const flat = [];
    for (const [x, y] of hull) flat.push(x, y);
    const ext = orientedExtent(flat, ang);
    if (!ext) continue;
    const area = ext.width * ext.depth;
    if (!best || area < best.area) best = { ...ext, area, angle_deg: ang };
  }
  return best;
}

/**
 * The smallest angular difference between two plan angles, in degrees.
 *
 * A rectangle is unchanged by a half turn and, when it is square, by a quarter
 * turn -- so a machine at 90 degrees and the same machine at 270 are the same
 * rectangle. Rotation residuals are measured modulo 180 for that reason;
 * claiming a 180-degree error on a symmetric box would be measuring the
 * drawing's convention, not the model's accuracy.
 */
function angleDelta(a, b, modulo) {
  const m = modulo || 180;
  let d = ((a - b) % m + m) % m;
  if (d > m / 2) d = m - d;
  return d;
}

/**
 * What SHAPE the CAD drew, decided by comparing the hull with its own box.
 *
 * `rectangle`         the hull fills its oriented box -- the machine IS a box.
 * `rotated_rectangle` the same, on an axis the floor grid does not share.
 * `polygon`           a few-sided outline that is clearly not a box.
 * `irregular`         a footprint with real detail; render it as measured.
 *
 * Nothing here rounds a shape up to a rectangle for tidiness. The renderer is
 * expected to draw what this reports.
 */
const RECT_FILL = 0.97;
const POLYGON_FILL = 0.6;
const POLYGON_MAX_VERTICES = 12;
const AXIS_TOL_DEG = 0.5;

function classifyShape(hull, box) {
  if (!Array.isArray(hull) || hull.length < 3 || !box) return 'unresolved';
  const boxArea = box.width * box.depth;
  if (!(boxArea > 0)) return 'unresolved';
  const fill = polygonArea(hull) / boxArea;
  if (fill >= RECT_FILL) {
    const axis = angleDelta(box.angle_deg, 0, 90);
    return axis <= AXIS_TOL_DEG ? 'rectangle' : 'rotated_rectangle';
  }
  if (hull.length <= POLYGON_MAX_VERTICES && fill >= POLYGON_FILL) return 'polygon';
  return 'irregular';
}

/**
 * Reduces a hull to at most `max` vertices by dropping the vertex whose removal
 * changes the area least, repeatedly.
 *
 * Used only for what is SERVED. The measurement keeps the full hull; this is
 * the renderer's copy, and the area it loses is recorded alongside it so the
 * simplification can never quietly become the measurement.
 */
function simplifyHull(hull, max, keep) {
  if (!Array.isArray(hull) || hull.length <= max) return hull ? hull.slice() : [];
  const protectedPoints = new Set((keep || []).map((p) => `${p[0]},${p[1]}`));
  const poly = hull.slice();
  while (poly.length > max) {
    let bestIdx = -1;
    let bestLoss = Infinity;
    for (let i = 0; i < poly.length; i += 1) {
      if (protectedPoints.has(`${poly[i][0]},${poly[i][1]}`)) continue;
      const p = poly[(i - 1 + poly.length) % poly.length];
      const c = poly[i];
      const n = poly[(i + 1) % poly.length];
      const loss = Math.abs((c[0] - p[0]) * (n[1] - p[1]) - (n[0] - p[0]) * (c[1] - p[1])) / 2;
      if (loss < bestLoss) { bestLoss = loss; bestIdx = i; }
    }
    if (bestIdx < 0) break;   // everything left is protected
    poly.splice(bestIdx, 1);
  }
  return poly;
}

/**
 * The hull vertices that DEFINE the extent along a given axis -- the four the
 * oriented box touches.
 *
 * These are protected from simplification, and that is not cosmetic: the model
 * serves an extent AND an outline, and they are two statements of one
 * measurement. Dropping a support vertex shrinks the outline while leaving the
 * extent alone, and the renderer would then draw a machine 286 mm smaller than
 * the record says it is.
 */
function supportVertices(hull, angleDeg) {
  if (!Array.isArray(hull) || hull.length === 0) return [];
  const t = (angleDeg || 0) * Math.PI / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  let minU = null; let maxU = null; let minV = null; let maxV = null;
  let minUv = Infinity; let maxUv = -Infinity; let minVv = Infinity; let maxVv = -Infinity;
  for (const p of hull) {
    const u = p[0] * cos + p[1] * sin;
    const v = -p[0] * sin + p[1] * cos;
    if (u < minUv) { minUv = u; minU = p; }
    if (u > maxUv) { maxUv = u; maxU = p; }
    if (v < minVv) { minVv = v; minV = p; }
    if (v > maxVv) { maxVv = v; maxV = p; }
  }
  return [minU, maxU, minV, maxV].filter(Boolean);
}

/**
 * Sutherland-Hodgman clip of `subject` by the CONVEX polygon `clip`, returning
 * the intersection. Both footprints here are convex -- an oriented box or a
 * convex hull -- which is exactly the case this algorithm is valid for.
 *
 * Used to answer "do two machines occupy the same floor?" with the outline the
 * model actually serves. Asking it of the bounding boxes instead reports an
 * overlap wherever two irregular machines interleave without touching, which
 * on this floor is the difference between 597 colliding pairs and 19 real ones.
 */
function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** Counter-clockwise copy of a polygon. */
function toCounterClockwise(poly) {
  return signedArea(poly) < 0 ? poly.slice().reverse() : poly.slice();
}

function convexIntersection(subject, clip) {
  if (!Array.isArray(subject) || !Array.isArray(clip)
    || subject.length < 3 || clip.length < 3) return [];
  // THE CLIP IS REBUILT AS A CONVEX HULL, COUNTER-CLOCKWISE. Two failures made
  // this necessary, and both were silent:
  //
  //   winding -- the canonical frame reflects z, so a polygon that is
  //   counter-clockwise in the CAD arrives CLOCKWISE in twin coordinates.
  //   Clipping by a clockwise polygon puts every point outside and returns an
  //   empty intersection: two shapes lying exactly on top of each other report
  //   as not touching at all.
  //
  //   convexity -- a convex outline published at millimetre resolution can
  //   come back with a one-millimetre reflex turn where three vertices were
  //   nearly collinear. This algorithm is only valid for a convex clip, and
  //   with a slightly concave one it cuts away regions that belong in the
  //   answer: one machine reported 29% of its own measured outline as
  //   uncovered by a display shape that in fact contains all of it.
  const clipFlat = [];
  for (const [x, y] of clip) clipFlat.push(x, y);
  const clipPoly = toCounterClockwise(convexHull(clipFlat));
  if (clipPoly.length < 3) return [];
  let out = subject.slice();
  for (let i = 0; i < clipPoly.length; i += 1) {
    const a = clipPoly[i];
    const b = clipPoly[(i + 1) % clipPoly.length];
    const input = out;
    out = [];
    const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    for (let j = 0; j < input.length; j += 1) {
      const c = input[j];
      const d = input[(j + 1) % input.length];
      const sc = side(c);
      const sd = side(d);
      if (sc >= 0) out.push(c);
      if ((sc >= 0) !== (sd >= 0)) {
        const t = sc / (sc - sd);
        out.push([c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t]);
      }
    }
    if (out.length === 0) return [];
  }
  return out;
}

/** The corners of an oriented box, in the order a polygon routine expects. */
function boxCorners(cx, cy, width, depth, angleDeg) {
  const t = (angleDeg || 0) * Math.PI / 180;
  const hw = width / 2;
  const hd = depth / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [
    cx + x * Math.cos(t) - y * Math.sin(t),
    cy + x * Math.sin(t) + y * Math.cos(t),
  ]);
}

/**
 * The corners of a machine's box IN THE CANONICAL TWIN FRAME.
 *
 * The frame maps CAD (x, y) to twin (x, -y): a reflection. A three.js rotation
 * of +theta about +Y therefore sends the machine's local x axis to
 * (cos theta, -sin theta) in the (x, z) plane, so the angle to build a box on
 * in twin coordinates is MINUS the served rotation.
 *
 * This exists because that sign has been got wrong twice -- once measuring a
 * drawn machine, once measuring a served one -- and both times the symptom was
 * a rotated machine reported as larger than it is, or as not overlapping its
 * own measurement at all. Anything building a box from a served rotation must
 * come through here.
 */
function twinBoxCorners(cx, cz, width, depth, rotationDeg) {
  return boxCorners(cx, cz, width, depth, -(rotationDeg || 0));
}

/** Even-odd point-in-polygon for [[x,y], ...]. Boundary counts as inside. */
function pointInPolygon(x, y, poly) {
  if (!Array.isArray(poly) || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y)) {
      const xc = xi + ((y - yi) / (yj - yi)) * (xj - xi);
      if (x <= xc) inside = !inside;
    }
  }
  return inside;
}

/* ------------------------------------------------------------------ *
 * OPERATIONAL FOOTPRINT
 *
 * The physical extent is measured on the machine's INSERT rotation, which is
 * the right axis to RECONCILE on: it is the angle the drawing states. It is not
 * always the axis the machine's own body lies on. A block can draw its body at
 * a constant angle inside its own definition -- a press turned 18.85 degrees
 * within the block, placed by an INSERT at 0 -- and measuring that body on the
 * INSERT axis reports a box larger than the machine in both directions.
 *
 * The OPERATIONAL footprint corrects only that: the same measured geometry,
 * measured again on the axis the BLOCK ITSELF draws its body on. It is:
 *
 *   DERIVED       from the physical measurement, never replacing it
 *   CONTAINING    every measured point stays inside it, so nothing is clipped
 *   PER BLOCK     the offset is a property of the block definition, identical
 *                 for every instance of it, not a per-machine fit
 *   BOUNDED       an offset beyond OPERATIONAL_AXIS_LIMIT_DEG is not applied;
 *                 the CAD rotation is preserved and the record is FLAGGED
 *
 * What it deliberately does NOT do is make the machine smaller than measured.
 * A rectangle around a non-rectangular machine covers floor the machine does
 * not occupy, and no choice of axis removes that: the minimum-area rectangle
 * is the smallest rectangle that exists, and where it is still much larger
 * than the outline, the outline is not rectangular. That excess is measured,
 * published per record, and left alone.
 * ------------------------------------------------------------------ */

/**
 * The signed angle from `b` to `a`, folded into (-45, 45].
 *
 * A rectangle is the same rectangle under a quarter turn, so an axis is only
 * ever defined modulo 90 degrees. `angleDelta` answers "how far apart" and is
 * unsigned, which is right for a residual and wrong for an offset: applying an
 * unsigned offset turns half the machines the wrong way, and a machine turned
 * the wrong way measures LARGER than the one it was supposed to improve.
 */
function axisOffset(a, b) {
  let d = ((a || 0) - (b || 0) + 45) % 90;
  if (d < 0) d += 90;
  return d - 45;
}

/** The whole display vocabulary. A rectangle, or a marker. */
const DISPLAY_SHAPES = new Set(['OPERATIONAL_RECTANGLE', 'UNRESOLVED']);

/** Beyond this the block's body axis is not the INSERT axis -- flag, don't move. */
const OPERATIONAL_AXIS_LIMIT_DEG = 5;

/** An enclosing group must be at least this many times the area of the rest. */
const ENVELOPE_AREA_RATIO = 3;

/**
 * Which of a block's geometry groups, if any, is an ENVELOPE drawn AROUND the
 * machine rather than part of its body.
 *
 * `groups` is `[{ key, hull }, ...]`: the block's physical geometry split by
 * layer and entity type, each already hulled. A group qualifies only if
 *
 *   1. every point of every OTHER group lies inside its hull, and
 *   2. its own area is at least ENVELOPE_AREA_RATIO times theirs, and
 *   3. what remains without it is still a polygon.
 *
 * That is a structural test -- containment and scale -- not a search for
 * whichever group happens to shrink the box most. Only one group can satisfy
 * it, because two groups cannot each contain the other and be three times its
 * area. Returns the index, or -1.
 *
 * A group that merely makes the box big does NOT qualify, and must not: an
 * arm, a conveyor stub or an access step is part of the machine, and removing
 * it to improve a metric would be reporting a machine smaller than the drawing
 * has it.
 */
function envelopeGroup(groups) {
  if (!Array.isArray(groups) || groups.length < 2) return -1;
  for (let i = 0; i < groups.length; i += 1) {
    const mine = groups[i] && groups[i].hull;
    if (!Array.isArray(mine) || mine.length < 3) continue;
    const rest = [];
    for (let j = 0; j < groups.length; j += 1) {
      if (j === i || !groups[j] || !Array.isArray(groups[j].hull)) continue;
      for (const p of groups[j].hull) rest.push(p);
    }
    if (rest.length < 3) continue;
    const restHull = convexHull(rest.reduce((f, p) => { f.push(p[0], p[1]); return f; }, []));
    if (restHull.length < 3) continue;
    const mineArea = polygonArea(mine);
    const restArea = polygonArea(restHull);
    if (!(mineArea > 0) || !(restArea > 0)) continue;
    if (mineArea < restArea * ENVELOPE_AREA_RATIO) continue;
    let contained = true;
    for (const [x, y] of restHull) {
      if (!pointInPolygon(x, y, mine)) { contained = false; break; }
    }
    if (contained) return i;
  }
  return -1;
}

/**
 * The operational rectangle for one machine, in the coordinates the hull is in.
 *
 * `offsetDeg` is the block's own body-axis offset, already decided and already
 * bounded by the caller. The rectangle is measured on `rotationDeg + offsetDeg`
 * and therefore CONTAINS the hull by construction -- an oriented extent always
 * does, on any axis.
 */
function operationalRectangle(hull, rotationDeg, offsetDeg) {
  if (!Array.isArray(hull) || hull.length < 3) return null;
  const flat = [];
  for (const [x, y] of hull) flat.push(x, y);
  const ext = orientedExtent(flat, (rotationDeg || 0) + (offsetDeg || 0));
  if (!ext || !(ext.width > 0) || !(ext.depth > 0)) return null;
  return {
    cx: ext.cx, cy: ext.cy, width: ext.width, depth: ext.depth,
    angle_deg: (rotationDeg || 0) + (offsetDeg || 0), offset_deg: offsetDeg || 0,
  };
}

module.exports = {
  ANNOTATION_TYPES,
  DRAFTING_LAYER,
  IDENTITY,
  isDraftingLayer,
  affine,
  compose,
  applyTo,
  isMirrored,
  physicalEntities,
  convexHull,
  polygonArea,
  orientedExtent,
  minAreaRect,
  angleDelta,
  classifyShape,
  simplifyHull,
  supportVertices,
  convexIntersection,
  toCounterClockwise,
  boxCorners,
  twinBoxCorners,
  pointInPolygon,
  axisOffset,
  envelopeGroup,
  operationalRectangle,
  OPERATIONAL_AXIS_LIMIT_DEG,
  ENVELOPE_AREA_RATIO,
  DISPLAY_SHAPES,
  RECT_FILL,
  POLYGON_FILL,
};
