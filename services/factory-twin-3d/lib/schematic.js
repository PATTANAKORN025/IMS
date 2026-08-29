/**
 * Schematic reference layer — projection and contract.
 *
 * This module serves a SECOND, deliberately separate spatial model: a visual
 * reconstruction of the manufacturing system's floor schematic. It exists
 * because that schematic answers a question the measured model cannot -- "what
 * area is this, and what is running in it" -- while being useless for the
 * question the measured model answers, namely where anything physically is.
 *
 * The separation is the whole point, so it is enforced here rather than left to
 * discipline:
 *
 *   SCHEMATIC COORDINATES ARE NOT PHYSICAL COORDINATES.
 *
 * They are drawing coordinates in their own normalized space, from a source
 * whose title block declares no scale and which contains no structural
 * gridline. Nothing in this module emits metres, and nothing it emits may be
 * compared against, registered onto, or merged into the measured model in
 * lib/wire.js. The two never share a field name for position: the measured
 * model uses `position.x/y/z`, this one uses `sx/sy`, so a value from one
 * cannot be silently read as the other.
 *
 * What this layer may assert is exactly one class of claim: SCHEMATIC_OBSERVED
 * -- "this label and this arrangement are visible on the reference render". It
 * may never assert MEASURED, and it may never produce a confirmed physical or
 * IMS mapping. An area label here names a region of a drawing, not a region of
 * a building.
 *
 * Serialization follows the same allowlist-by-construction discipline as
 * lib/wire.js and lib/diagnostics.js: nothing is spread, no unknown key is
 * iterated, and every emitted value is a finite number, a pattern-checked
 * token, a shaped display name, or a fixed enum.
 */

'use strict';

const { token, zoneName, num } = require('./wire');

/**
 * The only evidence class this layer can express. Written out as a frozen
 * single-member set rather than a string literal so that adding a second class
 * is a visible, reviewed act rather than a typo that widens what the schematic
 * is allowed to claim.
 */
const SOURCE_CLASS = Object.freeze({ SCHEMATIC_OBSERVED: 'SCHEMATIC_OBSERVED' });
const ALLOWED_SOURCE_CLASS = new Set(Object.values(SOURCE_CLASS));

/**
 * Operational states the reference legend defines. Fixed here, so a snapshot
 * file cannot introduce a state name and therefore cannot introduce an output
 * value the renderer has no styling for.
 */
const ALLOWED_STATE = new Set(['OFF', 'DOWN', 'IDLE', 'INITIAL_PM_STOP', 'RUN', 'UNDEFINED']);

/** What the drawing says about itself, rather than about the factory. */
const ALLOWED_ANNOTATION_KIND = new Set(['LEGEND', 'TIMESTAMP', 'DIMENSION', 'NORTH', 'TITLE_BLOCK']);

/** Confidence in a transcription, not in a measurement. */
const ALLOWED_CONFIDENCE = new Set(['HIGH', 'MEDIUM', 'LOW']);

/**
 * The normalized schematic space. X spans 0..1000; Y uses the same scale
 * factor rather than its own, so the reference render's aspect ratio survives
 * and nothing has to be un-squashed at draw time.
 *
 * The bound is generous on Y (the reference is roughly 2:1) and exists to
 * reject a coordinate that is obviously not in this space -- a stray metre
 * value, a pixel value, a negative -- rather than to police the drawing.
 */
const SCHEMATIC_MAX_X = 1000;
const SCHEMATIC_MAX_Y = 1000;

/** A point in schematic space, or null. Never a physical position. */
function point(p) {
  if (!p || typeof p !== 'object') return null;
  const sx = num(p.sx);
  const sy = num(p.sy);
  if (sx === null || sy === null) return null;
  if (sx < 0 || sx > SCHEMATIC_MAX_X || sy < 0 || sy > SCHEMATIC_MAX_Y) return null;
  return { sx, sy };
}

/**
 * A closed ring of schematic points.
 *
 * One unusable vertex withholds the whole ring, for the same reason a partial
 * building outline is withheld in lib/wire.js: half a boundary is a different
 * boundary and still looks like one.
 */
function ring(vertices, min = 3) {
  const raw = Array.isArray(vertices) ? vertices : [];
  const out = [];
  for (const v of raw) {
    const p = point(v);
    if (!p) return null;
    out.push(p);
  }
  return out.length >= min ? out : null;
}

function fromEnum(v, allowed) {
  return typeof v === 'string' && allowed.has(v) ? v : null;
}

/** Snapshot ids a record may reference, rebuilt rather than echoed. */
function snapshotRefs(list) {
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    const id = token(v);
    if (id !== null) out.push(id);
  }
  return out;
}

/**
 * Projects one reference snapshot: a single render of the schematic.
 *
 * Two of these exist and they disagree while claiming the same instant, so they
 * are served as separate snapshots and never merged. `timestamp_observed` is
 * carried as a token because it is a string read off an image, not a time this
 * system knows to be true -- it is what the render claims, not when anything
 * happened.
 */
function projectSnapshot(s) {
  if (!s || typeof s !== 'object') return null;
  const id = token(s.id);
  if (id === null) return null;
  return {
    id,
    label: zoneName(s.label),
    timestamp_observed: token(s.timestamp_observed),
    source_class: fromEnum(s.source_class, ALLOWED_SOURCE_CLASS),
    // Free-text notes about a snapshot stay server-side; what a consumer needs
    // is whether this render conflicts with another, not the prose about it.
    conflicts_with: snapshotRefs(s.conflicts_with),
  };
}

/** Projects the schematic building outline. */
function projectBoundary(b) {
  if (!b || typeof b !== 'object') return null;
  const vertices = ring(b.vertices);
  if (!vertices) return null;
  return {
    vertices,
    source_class: fromEnum(b.source_class, ALLOWED_SOURCE_CLASS),
    confidence: fromEnum(b.confidence, ALLOWED_CONFIDENCE),
  };
}

/**
 * Projects one labelled area.
 *
 * The name goes through the same display-name guard the measured zones use, so
 * an area label and a zone label are held to one standard. `id` is separate
 * from `name` and always present: the id is what anything keys on, the name is
 * for a human to read.
 */
function projectArea(a) {
  if (!a || typeof a !== 'object') return null;
  const id = token(a.id);
  const vertices = ring(a.vertices);
  if (id === null || !vertices) return null;
  return {
    id,
    name: zoneName(a.name),
    vertices,
    label_at: point(a.label_at),
    source_class: fromEnum(a.source_class, ALLOWED_SOURCE_CLASS),
    confidence: fromEnum(a.confidence, ALLOWED_CONFIDENCE),
    observed_in: snapshotRefs(a.observed_in),
  };
}

/**
 * Projects one annotation: a legend box, a timestamp, a dimension, a north
 * marker. Everything the drawing says about itself rather than about the
 * factory.
 */
function projectAnnotation(a) {
  if (!a || typeof a !== 'object') return null;
  const kind = fromEnum(a.kind, ALLOWED_ANNOTATION_KIND);
  const at = point(a.at);
  if (kind === null || !at) return null;
  return {
    kind,
    at,
    // A dimension's printed value is a number on a drawing with no stated
    // scale. It is carried as the text it is, never converted, and the unit is
    // whatever the drawing does not say.
    text: token(a.text),
    to: point(a.to),
    observed_in: snapshotRefs(a.observed_in),
  };
}

/** Maps a list through a projector, dropping anything unprojectable. */
function projectAll(items, project) {
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const projected = project(item);
    if (projected !== null) out.push(projected);
  }
  return out;
}

/**
 * Projects the whole schematic document.
 *
 * Returns an empty-but-valid shape rather than null when nothing is deployed,
 * matching every other loader in this service: absence is the default state for
 * a public clone, not an error.
 */
function projectSchematic(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  return {
    // Stated in the payload, not only in this comment, so a consumer that only
    // ever sees the response still knows what space these numbers are in.
    coordinate_space: 'SCHEMATIC_NOT_PHYSICAL',
    extent: { sx: SCHEMATIC_MAX_X, sy: SCHEMATIC_MAX_Y },
    snapshots: projectAll(d.snapshots, projectSnapshot),
    boundary: projectBoundary(d.boundary),
    areas: projectAll(d.areas, projectArea),
    annotations: projectAll(d.annotations, projectAnnotation),
  };
}

module.exports = {
  SOURCE_CLASS,
  ALLOWED_STATE,
  SCHEMATIC_MAX_X,
  SCHEMATIC_MAX_Y,
  point,
  projectSnapshot,
  projectBoundary,
  projectArea,
  projectAnnotation,
  projectSchematic,
};
