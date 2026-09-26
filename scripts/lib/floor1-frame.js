/**
 * THE CANONICAL FLOOR 1 COORDINATE FRAME.
 *
 * One transform, defined once, from the CAD's own coordinates into the frame
 * every physical view consumes. Plan, 3D and inspection all read the same
 * numbers; none of them applies a correction of its own, and no camera is
 * allowed to compensate for a coordinate that is wrong.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS FIXES, AND HOW IT WAS MEASURED
 * ---------------------------------------------------------------------------
 *
 * The floor rendered VERTICALLY MIRRORED against the drawing. Left/right was
 * right; top/bottom was inverted. Three facts, each measurable, compose into
 * that result:
 *
 *   1. AutoCAD model space has +Y UP on the sheet. This is the format's own
 *      convention, not an assumption about this drawing: every CAD viewer
 *      renders modelspace +Y upward.
 *
 *   2. The previous transform mapped CAD +y to twin +z:
 *          z_twin = (y_cad - Y0)/1000 - halfDepth
 *
 *   3. The plan camera sits at (cx, h, cz + e) looking at (cx, 0, cz) with
 *      up = (0,1,0). Deriving its basis:
 *          forward = (0, -h, -e),  z_cam = -forward ~ (0, 1, e/h)
 *          x_cam   = normalize(up x z_cam) = (1, 0, 0)
 *          y_cam   = z_cam x x_cam ~ (0, 0, -1)
 *      so SCREEN-RIGHT = world +x and SCREEN-UP = world **-z**.
 *
 * Compose 2 and 3: screen-up = -z_twin = -(cad y). The sheet's up became the
 * screen's down. Confirmed against ground truth rather than by eye -- fifteen
 * named area labels were matched from the CAD to the model's own zones, and
 * the label at the lowest CAD y rendered at the TOP of the plan while the
 * label at the highest CAD y rendered at the BOTTOM.
 *
 * ---------------------------------------------------------------------------
 * THE CANONICAL TRANSFORM
 * ---------------------------------------------------------------------------
 *
 *     x_twin =  (x_cad - X0)/1000 - halfWidth
 *     z_twin = -((y_cad - Y0)/1000 - halfDepth)
 *
 * so screen-right = CAD +x and screen-up = -z_twin = CAD +y. The plan is now
 * the sheet.
 *
 * This is a REFLECTION of the (x, z) plane, which flips the sense of a plan
 * rotation, so the rotation half of the transform flips with it:
 *
 *   A machine's local +x axis at CAD rotation theta is (cos t, sin t) in CAD,
 *   which lands at (x, z) = (cos t, -sin t). A three.js rotation about world
 *   +Y by phi maps (1,0,0) to (cos phi, 0, -sin phi), i.e. (cos phi, -sin phi).
 *   Equating: phi = +theta.
 *
 * Under the OLD frame the same derivation gave phi = -theta, which is why the
 * renderer negated the angle. Both halves flip together or the machines end up
 * correctly placed and wrongly turned; CAD_ROTATION_SIGN exists so the two
 * cannot drift apart, and a browser test measures the rendered mesh rotation
 * against the served angle to prove they did not.
 *
 * What the transform preserves, by construction: relative x/y position,
 * left/right ordering, distances, proportions and rotation magnitude. What it
 * deliberately changes: the sign of z, and with it the sign of the rotation.
 */

'use strict';

/**
 * Bumped whenever the frame's definition changes. Written into the private
 * document so a re-frame pass is idempotent -- applying a reflection twice is
 * a no-op that silently restores the bug, and this marker is what stops it.
 */
const CANONICAL_FRAME_VERSION = '2.0.0';

/**
 * Sign applied to a CAD plan rotation (degrees) to obtain the three.js
 * rotation about world +Y. Derived above; +1 under the canonical frame.
 *
 * The renderer carries the same constant. It is stated in both places rather
 * than shared, because the renderer is browser ESM and this is a build-time
 * CommonJS module -- and it is asserted equal by test rather than by hope.
 */
const CAD_ROTATION_SIGN = 1;

/** Millimetres of floor-local CAD x to canonical metres. */
function cadXToTwin(xLocalMm, halfWidthM) {
  return xLocalMm / 1000 - halfWidthM;
}

/**
 * Millimetres of floor-local CAD y to canonical metres.
 *
 * The negation is the whole point of this module. Anything that computes a
 * twin z from a CAD y must come through here.
 */
function cadYToTwin(yLocalMm, halfDepthM) {
  return -(yLocalMm / 1000 - halfDepthM);
}

/** Canonical metres back to floor-local CAD millimetres. Used by reconciliation. */
function twinXToCad(xM, halfWidthM) {
  return (xM + halfWidthM) * 1000;
}

function twinZToCad(zM, halfDepthM) {
  return (-zM + halfDepthM) * 1000;
}

/** A CAD plan rotation in degrees, as the renderer must apply it about +Y. */
function cadRotationToTwinDegrees(deg) {
  const r = CAD_ROTATION_SIGN * deg;
  return ((r % 360) + 360) % 360;
}

module.exports = {
  CANONICAL_FRAME_VERSION,
  CAD_ROTATION_SIGN,
  cadXToTwin,
  cadYToTwin,
  twinXToCad,
  twinZToCad,
  cadRotationToTwinDegrees,
};
