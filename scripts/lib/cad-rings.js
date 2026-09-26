/**
 * Ring closure for CAD polylines.
 *
 * WHY THIS IS ITS OWN MODULE. Deciding whether a polyline is a closed ring is
 * one line of arithmetic and was the single defect that cost this model every
 * complex room on Floor 1. The drawing closes a boundary two different ways and
 * uses both, so reading only the obvious one silently discarded thirteen of
 * thirty-two areas -- and not thirteen random ones: every boundary with more
 * than four vertices, which is exactly the L-shaped and stepped rooms, the
 * 4,289 m2 drilling hall among them. A defect that removes real floor area
 * while leaving the model internally consistent is the kind that survives
 * review, so the rule lives here where it can be tested against fixtures
 * instead of against a 412 MB private drawing.
 *
 * THE TWO ENCODINGS.
 *   CLOSED_FLAG            bit 0 of group 70 is set; the closing edge from the
 *                          last vertex back to the first is implicit.
 *   REPEATED_FIRST_VERTEX  the flag is clear and the first vertex is repeated
 *                          as the last, so the ring is closed explicitly and
 *                          reports itself as open.
 *
 * Anything else is OPEN, and an open boundary stays open.
 */

'use strict';

/**
 * How near the repeated vertex must land to count as the same point.
 *
 * This is a tolerance against the file's own decimal noise, not against
 * draughting error. The two rings that need it close to within 4e-4 mm and
 * 5e-10 mm -- artefacts of writing a coordinate as text, invisible at any
 * scale. The value sits three orders of magnitude above that noise and five
 * below the smallest edge on the layer (300 mm), so it cannot close a gap
 * anybody drew.
 */
const CLOSE_TOL_MM = 0.001;

const CLOSED_FLAG = 'CLOSED_FLAG';
const REPEATED_FIRST_VERTEX = 'REPEATED_FIRST_VERTEX';
const OPEN = 'OPEN';

/**
 * Classifies how a polyline declares itself closed.
 *
 * @param {number[]} xs vertex x ordinates, in the drawing's own units
 * @param {number[]} ys vertex y ordinates, same length and order
 * @param {boolean} closedFlag bit 0 of the polyline's group 70
 * @param {number} [tol] closure tolerance, in the same units as xs/ys
 * @returns {'CLOSED_FLAG'|'REPEATED_FIRST_VERTEX'|'OPEN'}
 */
function ringClosure(xs, ys, closedFlag, tol) {
  if (closedFlag === true) return CLOSED_FLAG;
  if (!Array.isArray(xs) || !Array.isArray(ys)) return OPEN;
  const n = Math.min(xs.length, ys.length);
  // Four points are the fewest that can describe a triangle plus its repeated
  // first vertex. Three would be a line doubled back on itself.
  if (n < 4) return OPEN;
  const x0 = xs[0];
  const y0 = ys[0];
  const xn = xs[n - 1];
  const yn = ys[n - 1];
  if (![x0, y0, xn, yn].every((v) => typeof v === 'number' && Number.isFinite(v))) return OPEN;
  const limit = typeof tol === 'number' && Number.isFinite(tol) && tol >= 0 ? tol : CLOSE_TOL_MM;
  return Math.hypot(x0 - xn, y0 - yn) <= limit ? REPEATED_FIRST_VERTEX : OPEN;
}

/** True when the polyline is a closed ring by either encoding. */
function isClosedRing(xs, ys, closedFlag, tol) {
  return ringClosure(xs, ys, closedFlag, tol) !== OPEN;
}

module.exports = {
  CLOSE_TOL_MM,
  CLOSED_FLAG,
  REPEATED_FIRST_VERTEX,
  OPEN,
  ringClosure,
  isClosedRing,
};
