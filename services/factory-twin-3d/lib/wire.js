/**
 * Wire projection for private geometry — allowlist by construction.
 *
 * The geometry route already named its top-level fields, which stopped a whole
 * private document being published by a single spread. It did not stop the
 * level below: each slot was spread individually, and columns, zones and
 * functional zones were passed through as whole objects. A field added to a
 * slot record in the private file would have reached the browser the moment it
 * was written, which is exactly the failure the top-level allowlist exists to
 * prevent.
 *
 * This module closes that gap the same way lib/diagnostics.js closes it for the
 * diagnostics endpoint: nothing is spread, nothing is copied through, no
 * unknown key is ever iterated, and every emitted value is a finite number, a
 * pattern-checked token, or a fixed enum. Free text cannot pass through,
 * because no code path here emits a string it did not first validate.
 *
 * Three things are deliberately no longer served at all, because nothing
 * consumed them and each was private facility data on the wire:
 *   - a functional zone's `type`, which names a process
 *   - its printed / calculated area and delta, which are values read from the
 *     confidential drawing
 *   - free-text validation and conflict-resolution notes
 *
 * Pure and side-effect free, so the guarantee can be tested by feeding it
 * deliberately poisoned input rather than inferred from a running server.
 */

'use strict';

/**
 * A token safe to echo: no whitespace, no path separator, no punctuation that
 * could carry a sentence. A filesystem path, a person's name, a process name
 * or an internal note cannot match this, which is the point — the guard is
 * shaped so that free text fails it rather than so that known-bad text fails
 * it.
 */
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

/** Confidence tiers a private document is allowed to express. */
const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low', 'HIGH', 'MEDIUM', 'LOW']);

/** Geometry status values the renderer and inspector understand. */
const ALLOWED_GEOMETRY_STATUS = new Set(['measured', 'observed', 'derived', 'simulated', 'unknown']);

/** Height status values. `unknown` is a real answer here, not a fallback. */
const ALLOWED_HEIGHT_STATUS = new Set(['measured', 'derived', 'unknown']);

/** Finite number, or null. NaN and Infinity are rejected, not passed on. */
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Pattern-checked token, or null. Never a substring, never a sanitised copy. */
function token(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return typeof v === 'string' && SAFE_TOKEN.test(v) ? v : null;
}

function fromEnum(v, allowed) {
  return typeof v === 'string' && allowed.has(v) ? v : null;
}

/** A point on the floor plane. Null unless every component is a real number. */
function point3(p) {
  if (!p || typeof p !== 'object') return null;
  const x = num(p.x);
  const y = num(p.y);
  const z = num(p.z);
  if (x === null || z === null) return null;
  return { x, y: y === null ? 0 : y, z };
}

function point2(p) {
  if (!p || typeof p !== 'object') return null;
  const x = num(p.x);
  const z = num(p.z);
  return x === null || z === null ? null : { x, z };
}

/**
 * Looks a slot id up in the mapping document without letting an inherited
 * property answer.
 *
 * This is not hypothetical tidiness. On a plain object, `mapping['constructor']`
 * answers with a function and `mapping['__proto__']` can answer with a value
 * JSON.parse placed there, so a slot whose id happened to be one of those would
 * have been served `status: 'IMS_CONNECTED'` — a CONFIRMED mapping conjured
 * out of a property lookup, in the one system whose central rule is that a
 * mapping may only come from an authoritative record.
 */
function deviceIdFor(mapping, slotId) {
  if (!mapping || typeof mapping !== 'object') return null;
  // An identifier that is not a safe token cannot establish a mapping. This
  // rules out `__proto__`, which JSON.parse places as a genuine own property
  // and which an ownership check alone would therefore accept.
  if (token(slotId) === null) return null;
  if (!Object.prototype.hasOwnProperty.call(mapping, slotId)) return null;
  return token(mapping[slotId]);
}

/**
 * Projects one observed equipment slot.
 *
 * Returns null for a slot with no usable position: a slot that cannot be placed
 * is withheld rather than rendered at a coerced coordinate. Emitting a fallback
 * position would invent a location, which is worse than showing nothing.
 */
function projectSlot(slot, mapping) {
  if (!slot || typeof slot !== 'object') return null;
  const position = point3(slot.position);
  if (!position) return null;

  const slotId = token(slot.slot_id);
  const deviceId = deviceIdFor(mapping, slot.slot_id);
  const detectionLayer = token(slot.detection && slot.detection.layer);

  // Height is a rendering default, never a measurement — see the height
  // semantics section of the reconstruction methodology. Width and depth are
  // measured, so a missing one falls back to the same 1 m neutral pad rather
  // than to a shape that implies a dimension nobody read.
  const raw = slot.footprint && typeof slot.footprint === 'object' ? slot.footprint : slot.size;
  const width = num(raw && raw.width);
  const depth = num(raw && raw.depth);
  const height = num(raw && raw.height) ?? num(slot.height);

  return {
    slot_id: slotId,
    position,
    footprint: {
      width: width === null ? 1 : width,
      depth: depth === null ? 1 : depth,
      height: height === null ? 1 : height,
    },
    confidence: fromEnum(slot.confidence, ALLOWED_CONFIDENCE),
    source: token(slot.source),
    geometry_status: fromEnum(slot.geometry_status, ALLOWED_GEOMETRY_STATUS),
    height_status: fromEnum(slot.height_status, ALLOWED_HEIGHT_STATUS),
    zone_id: token(slot.zone_id),
    // Null rather than an object holding a null: the inspector distinguishes
    // "no detection record" from "a detection record naming nothing", and only
    // the first is a state this data can be in.
    detection: detectionLayer === null ? null : { layer: detectionLayer },
    ims_device_id: deviceId,
    status: deviceId ? 'IMS_CONNECTED' : 'UNMAPPED',
  };
}

/** Projects one detected structural column. Null if it cannot be placed. */
function projectColumn(col) {
  if (!col || typeof col !== 'object') return null;
  const position = point2(col.position);
  if (!position) return null;

  const fp = col.footprint && typeof col.footprint === 'object' ? col.footprint : null;
  const width = num(fp && fp.width);
  const depth = num(fp && fp.depth);
  const rawGrid = col.grid_ref && typeof col.grid_ref === 'object' ? col.grid_ref : null;
  const gridX = token(rawGrid && rawGrid.x);
  const gridZ = token(rawGrid && rawGrid.z);
  const det = col.detector && typeof col.detector === 'object' ? col.detector : null;

  return {
    id: token(col.id),
    position,
    footprint: width === null || depth === null ? null : { width, depth },
    // A half-resolved grid reference is not a grid reference. Either both
    // axes survive the token check or the column reports none.
    grid_ref: gridX === null || gridZ === null ? null : { x: gridX, z: gridZ },
    offset_from_intersection_mm: num(col.offset_from_intersection_mm),
    confidence: fromEnum(col.confidence, ALLOWED_CONFIDENCE),
    source: token(col.source),
    geometry_status: fromEnum(col.geometry_status, ALLOWED_GEOMETRY_STATUS),
    detector: det
      ? { ring_density: num(det.ring_density), interior_density: num(det.interior_density) }
      : null,
  };
}

/** Projects one anonymous zone box. Null unless the box is fully numeric. */
function projectZoneBox(zone) {
  if (!zone || typeof zone !== 'object') return null;
  const b = zone.bounds && typeof zone.bounds === 'object' ? zone.bounds : null;
  if (!b) return null;
  const x = num(b.x);
  const z = num(b.z);
  const width = num(b.width);
  const depth = num(b.depth);
  if (x === null || z === null || width === null || depth === null) return null;
  return { id: token(zone.id), bounds: { x, z, width, depth } };
}

/**
 * Projects the measured envelope. Null unless all three extents are real.
 *
 * `clear_height_m` is carried deliberately, and carried as null: the clear
 * height under the slab is not in evidence, and an explicit null is the claim
 * being made. Omitting the field would turn "known to be unknown" into "not
 * applicable", which is a different and untrue statement.
 */
function projectEnvelope(env) {
  if (!env || typeof env !== 'object') return null;
  const width = num(env.width);
  const depth = num(env.depth);
  const height = num(env.height);
  if (width === null || depth === null || height === null) return null;
  return { width, depth, height, clear_height_m: num(env.clear_height_m) };
}

/**
 * Projects the traced building footprint: the outer boundary polygon.
 *
 * This is the real, stepped outline -- not the bounding box the envelope
 * describes -- and it is what makes the floor read as this building rather than
 * as a generic rectangle. Carried as vertices and nothing else: the traced area,
 * the winding note and the free-text provenance describing how the perimeter
 * was measured all stay server-side.
 *
 * Withheld entirely if any vertex is unusable. A partial outline is a different
 * building, and drawing one would assert a boundary nobody traced.
 */
function projectFootprintPolygon(fp) {
  if (!fp || typeof fp !== 'object') return null;
  const raw = Array.isArray(fp.vertices) ? fp.vertices : [];
  const vertices = [];
  for (const v of raw) {
    const p = point2(v);
    if (!p) return null;
    vertices.push(p);
  }
  if (vertices.length < 3) return null;
  return {
    vertices,
    confidence: fromEnum(fp.confidence, ALLOWED_CONFIDENCE),
    geometry_status: fromEnum(fp.geometry_status, ALLOWED_GEOMETRY_STATUS),
  };
}

/**
 * Projects the structural grid: the surveyed gridline positions and their
 * printed labels.
 *
 * The labels are the drawing's own axis names, which is why they go through the
 * token guard like every other identifier -- a label that is not a safe token is
 * dropped rather than echoed. Span dimensions in millimetres are not carried:
 * they are printed facility dimensions, and nothing renders them.
 *
 * A line whose position is unusable is dropped rather than placed, but unlike
 * the footprint a partial grid is still a true statement about the lines that
 * were read, so the rest survives.
 */
function projectGrid(grid) {
  if (!grid || typeof grid !== 'object') return null;
  const axis = (positions, labels) => {
    const pos = Array.isArray(positions) ? positions : [];
    const lab = Array.isArray(labels) ? labels : [];
    const out = [];
    for (let i = 0; i < pos.length; i++) {
      const at = num(pos[i]);
      if (at === null) continue;
      out.push({ at, label: token(lab[i]) });
    }
    return out;
  };
  const x = axis(grid.x_lines, grid.x_labels);
  const z = axis(grid.z_lines, grid.z_labels);
  // Two lines per axis is the minimum that describes a grid rather than a
  // stray line. Below that it is withheld, so the renderer is never handed
  // something that would draw as an arbitrary mark across the floor.
  if (x.length < 2 || z.length < 2) return null;
  return {
    x,
    z,
    confidence: fromEnum(grid.confidence, ALLOWED_CONFIDENCE),
  };
}

/**
 * Projects one validated functional zone: its tier, and the boundary needed to
 * draw it. Its process type, its printed and calculated areas, and its
 * free-text validation notes are not carried — nothing rendered them, and each
 * is a value read from a confidential drawing.
 */
function projectFunctionalZone(zone) {
  if (!zone || typeof zone !== 'object') return null;
  const confidence = fromEnum(zone.confidence, ALLOWED_CONFIDENCE);
  const geom = zone.geometry && typeof zone.geometry === 'object' ? zone.geometry : null;
  const rawVerts = geom && Array.isArray(geom.vertices) ? geom.vertices : [];
  const vertices = [];
  for (const v of rawVerts) {
    const p = point2(v);
    // One unusable vertex means the boundary is not the traced boundary any
    // more. Drawing what is left would publish a shape nobody measured.
    if (!p) return null;
    vertices.push(p);
  }
  if (!confidence || vertices.length < 3) return null;
  return {
    id: token(zone.id),
    confidence,
    status: token(zone.status),
    geometry: { vertices },
  };
}

/**
 * Projects one conflict record. Ids and status only: a conflict is reported so
 * the client knows two candidates existed and neither was drawn, which needs no
 * prose. The resolution note is author-written free text and is not carried,
 * matching what lib/diagnostics.js already does.
 */
function projectConflict(c) {
  if (!c || typeof c !== 'object') return null;
  const ids = (Array.isArray(c.ids) ? c.ids : []).map(token).filter((id) => id !== null);
  return {
    ids,
    status: c.status === 'CONFLICT' ? 'CONFLICT' : 'UNKNOWN',
    member_count: Array.isArray(c.ids) ? c.ids.length : 0,
  };
}

/** Maps a list through a projector, dropping anything unprojectable. */
function projectAll(items, project, ...rest) {
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const projected = project(item, ...rest);
    if (projected !== null) out.push(projected);
  }
  return out;
}

module.exports = {
  SAFE_TOKEN,
  num,
  token,
  deviceIdFor,
  projectSlot,
  projectColumn,
  projectZoneBox,
  projectEnvelope,
  projectFootprintPolygon,
  projectGrid,
  projectFunctionalZone,
  projectConflict,
  projectAll,
};
