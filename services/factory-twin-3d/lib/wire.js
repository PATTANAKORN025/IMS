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

/**
 * A zone display name: the drawing's own area label, and the one field on the
 * wire that is prose-shaped rather than identifier-shaped.
 *
 * Deliberately uppercase-only. Every area label on the drawing is set in caps
 * ("DRILLING HOLD", "AUTO LAY UP", "DE-OXIDE"), while the things that must
 * never travel -- an author's note, a filesystem path, a sentence of
 * provenance -- all contain lowercase. Requiring caps therefore admits the
 * labels and rejects the prose by shape, which is the same discipline the
 * token guard uses, not a blocklist of bad words. Spaces and hyphens are
 * allowed because real labels contain them; slashes, dots and colons are not,
 * so a path cannot pass.
 *
 * Capped at 32 characters: an area label is short, and a length limit is what
 * stops a paragraph typed into the wrong field from being served as a name.
 */
const ZONE_NAME = /^[A-Z0-9][A-Z0-9 \-]{0,31}$/;

/** Confidence tiers a private document is allowed to express. */
const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low', 'HIGH', 'MEDIUM', 'LOW']);

/**
 * The raw CAD reference's layer roles.
 *
 * A closed set, and closed on purpose. The drawing's own layer names carry
 * process and vendor identifiers, so they are never served; the extractor maps
 * each to one of these roles instead. Enumerating them here means a new layer
 * appearing in a re-extraction cannot introduce a new public name by itself --
 * it is dropped until someone decides which role it belongs to.
 */
const ALLOWED_CAD_ROLE = new Set([
  'structure',
  'structure-sections',
  'columns',
  'column-caps',
  'walls-interior',
  'walls-cleanroom',
  'walls-movable',
  'partitions',
  'doors',
  'windows',
  'openings-airshower',
  'area-boundaries',
  'area-annotation',
]);

/**
 * Geometry status values the renderer and inspector understand.
 *
 * MEASURED_CAD and OBSERVED_CAD are the CAD tiers: geometry read directly out
 * of the authoritative AutoCAD source, in the drawing's own coordinates. They
 * are deliberately distinct from the lowercase raster tiers rather than folded
 * into them -- a wall traced off a scanned image and a wall read from the CAD
 * that produced that image are not the same quality of evidence, and the
 * inspector must be able to say which one the operator is looking at.
 */
const ALLOWED_GEOMETRY_STATUS = new Set([
  'measured', 'observed', 'derived', 'simulated', 'unknown',
  'MEASURED_CAD', 'OBSERVED_CAD',
]);

/**
 * Whether a piece of equipment's plan extent is established, and how well.
 *
 * Three tiers, in descending order of evidence, and the renderer draws each
 * one differently so an operator can see which is which without opening
 * anything:
 *
 *   MEASURED_CAD   the block's own geometry, transformed by the INSERT chain
 *                  and measured on the machine's own axes. A measurement.
 *   OBSERVED_CAD   the block's bounding box, machine-scale and clear of its
 *                  neighbours. Weaker: a box measures everything the block
 *                  draws. Floor 1 no longer produces this tier.
 *   APPROXIMATION  an extent bounded by neighbouring insertion points rather
 *                  than stated by the drawing.
 *   UNRESOLVED     none held. A first-class answer, not an error state: a
 *                  marker is drawn and no size is claimed.
 */
const ALLOWED_FOOTPRINT_STATUS = new Set([
  'MEASURED_CAD', 'OBSERVED_CAD', 'APPROXIMATION', 'UNRESOLVED',
]);

/** How an extent was arrived at. A fixed enum, never the extractor's prose. */
const ALLOWED_FOOTPRINT_SOURCE = new Set([
  'cad_block_geometry', 'cad_block_extent', 'CAD_CORRELATED',
]);

/**
 * What SHAPE the CAD drew. The renderer draws what this says and does not round
 * an outline up to a rectangle for tidiness.
 */
const ALLOWED_FOOTPRINT_SHAPE = new Set([
  'rectangle', 'rotated_rectangle', 'polygon', 'irregular', 'unresolved',
]);

/**
 * The DISPLAY class a record is drawn as, and the whole vocabulary of it.
 *
 * The normal operator view draws one symbol per machine: an oriented rectangle
 * where the extent was measured, a marker where it was not. This enum carries
 * NO GEOMETRY and the record carries none either -- there is no display centre,
 * display angle, display size or display polygon on the wire. The renderer
 * generates four corners from the record's own position, rotation_deg and
 * footprint, so nothing in this vocabulary can move, turn or resize a machine.
 */
const ALLOWED_DISPLAY_SHAPE = new Set(['OPERATIONAL_RECTANGLE', 'UNRESOLVED']);

/** What the rectangle was derived from. A fixed enum, never prose. */
const ALLOWED_DISPLAY_SOURCE = new Set(['filtered_physical_footprint']);

/**
 * The operational rectangle's measured size, and the delta from the machine's
 * position to that rectangle's own measured centre. Metres.
 *
 * WHY A DELTA AND NOT A POSITION. The physical extent is measured on the
 * INSERT axis and the operational extent on the body axis; one hull measured
 * on two axes has two extent centres. The delta is the difference between
 * them -- measured, bounded by the machine's own size, and useless on its own:
 * it places nothing without the canonical position it is added to, which no
 * part of the display layer may change. Drawing the operational size at the
 * physical centre instead would cut measured geometry off the machines whose
 * body axis is not their INSERT axis.
 *
 * The delta is zero for every machine measured on its INSERT axis, which is
 * most of them.
 */
function operationalSize(value) {
  if (!value || typeof value !== 'object') return null;
  const width = num(value.width);
  const depth = num(value.depth);
  if (width === null || depth === null || width <= 0 || depth <= 0) return null;
  const offsetX = num(value.offset_x);
  const offsetZ = num(value.offset_z);
  if (offsetX === null || offsetZ === null) return null;
  // A delta longer than the machine is not a delta, it is a move. Half the
  // diagonal is the furthest an extent centre can travel while still being a
  // centre of the same geometry.
  const limit = Math.hypot(width, depth) / 2;
  if (Math.abs(offsetX) > limit || Math.abs(offsetZ) > limit) return null;
  return { width, depth, offset_x: offsetX, offset_z: offsetZ };
}

/**
 * Whether a physical machine is bound to an IMS device, and nothing else.
 * Identity is never inferred from position, sequence or name similarity, so
 * UNMAPPED_TO_IMS is the normal state and carries no defect.
 */
const ALLOWED_MAPPING_STATUS = new Set(['MAPPED_TO_IMS', 'UNMAPPED_TO_IMS']);

/** How a machine sits in the room its centre falls in. */
const ALLOWED_ZONE_STATUS = new Set([
  'INSIDE_ROOM', 'CROSSES_ROOM_BOUNDARY', 'OUTSIDE_ROOM', 'ROOM_BY_CENTRE_ONLY',
  'UNRESOLVED',
]);

/** Physical opening kinds the CAD distinguishes. */
const ALLOWED_OPENING_KIND = new Set(['door', 'window', 'airshower']);

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

/**
 * A zone display name, or null. Trimmed before matching so trailing whitespace
 * in the source file is not the reason an otherwise valid label is dropped,
 * but never otherwise rewritten: a name that does not match is withheld, not
 * sanitised into something that does.
 */
function zoneName(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return ZONE_NAME.test(trimmed) ? trimmed : null;
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
 * projectSlot IS GONE, along with the slots[] layer it served.
 *
 * It projected the 243 raster-derived equipment positions digitised off the
 * scanned schematic. Those positions were a raster measurement rendered beside
 * CAD geometry at the same visual weight -- left/right placement, extent and
 * orientation all came from a scan of a print, not from the drawing -- and it
 * substituted a nominal 1 m box whenever a width or depth was missing, which
 * put an invented extent on the wire wearing the same shape as a measured one.
 *
 * Equipment now comes from CAD block references; see projectEquipment below.
 * The projector is deleted rather than left unused so that re-adding
 * `slots: wire.projectAll(...)` to the route cannot silently work again.
 */

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
  // The area's own label, when the private record carries one. Most zones now
  // have one: the name and the boundary come from the same drawing, and the
  // label is bound to the polygon by containment plus the area the drawing
  // prints for itself, so the correspondence is measured rather than assumed.
  // It is still null for the boundaries the drawing closed but never labelled.
  // A room with no name is a room whose purpose is undefined, which is not the
  // same as no room, so those are served unnamed rather than dropped.
  const name = zoneName(zone.zone_name);
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
    // Named or not, the id is what the rest of the system keys on. A name is a
    // label for a human, never an identifier.
    name,
    confidence,
    status: token(zone.status),
    geometry: { vertices },
  };
}

/**
 * Projects one role of the raw CAD reference: the drawing's own line-work for
 * that role, as a flat run of segment endpoints in floor-local millimetres.
 *
 * FLAT NUMBERS, NOT OBJECTS. Nine thousand segments as `{x1,y1,x2,y2}` objects
 * is nine thousand chances for a stray key to ride along, and it is what the
 * renderer would have to flatten anyway. A flat array can carry nothing but
 * numbers, which makes the disclosure question answerable by inspection.
 *
 * The segment count must match the array, and the array length must be a whole
 * number of segments. A role that fails either is withheld rather than
 * truncated: half a wall drawn as a reference is worse than no reference,
 * because it looks like a discrepancy in the model.
 *
 * The role's source layer names, its entity count and every provenance note in
 * the private document stay server-side. The role id is the only label served.
 */
function projectCadRole(role) {
  if (!role || typeof role !== 'object') return null;
  const id = fromEnum(role.id, ALLOWED_CAD_ROLE);
  if (id === null) return null;
  const src = Array.isArray(role.segments) ? role.segments : null;
  if (!src || src.length === 0 || src.length % 4 !== 0) return null;
  const segments = new Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const v = num(src[i]);
    if (v === null) return null;
    segments[i] = v;
  }
  const declared = num(role.segment_count);
  if (declared === null || declared !== segments.length / 4) return null;
  return { id, segment_count: declared, segments };
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

/**
 * An architectural wall centreline read from the CAD, with the thickness
 * measured between its two drawn faces.
 *
 * Both endpoints and the thickness must survive, or the wall is dropped. A
 * wall with one usable end is not a shorter wall, it is a wall nobody
 * measured, and half of it drawn at full confidence would be an invention.
 * The private record's own layer name is never carried: layer names in this
 * drawing identify processes and vendors.
 */
function projectWall(wall) {
  if (!wall || typeof wall !== 'object') return null;
  const x1 = num(wall.x1);
  const z1 = num(wall.z1);
  const x2 = num(wall.x2);
  const z2 = num(wall.z2);
  const thickness = num(wall.thickness);
  if (x1 === null || z1 === null || x2 === null || z2 === null) return null;
  if (thickness === null || thickness <= 0) return null;
  return {
    id: token(wall.id),
    x1,
    z1,
    x2,
    z2,
    thickness,
    source: token(wall.source),
    geometry_status: fromEnum(wall.geometry_status, ALLOWED_GEOMETRY_STATUS),
  };
}

/**
 * A drawn wall FACE that the extractor could not pair into a wall.
 *
 * These are the two-thirds of the drawing's wall line-work that carry no
 * measured thickness: one face is on a plan layer and its partner is not, so
 * the gap between them -- which is what a wall thickness IS in this drawing --
 * was never measured. The face itself is still real CAD geometry, and a plan
 * that omits it is visibly missing wall.
 *
 * So it is carried, and carried DIFFERENTLY: no thickness field exists on this
 * shape at all. A renderer cannot accidentally extrude one, because there is
 * nothing to extrude it by, and a consumer that wants a wall must use walls[].
 * geometry_status is the private record's own -- OBSERVED_CAD, not
 * MEASURED_CAD -- which is the whole distinction being preserved.
 */
function projectWallLine(line) {
  if (!line || typeof line !== 'object') return null;
  const x1 = num(line.x1);
  const z1 = num(line.z1);
  const x2 = num(line.x2);
  const z2 = num(line.z2);
  if (x1 === null || z1 === null || x2 === null || z2 === null) return null;
  return {
    id: token(line.id),
    x1,
    z1,
    x2,
    z2,
    source: token(line.source),
    geometry_status: fromEnum(line.geometry_status, ALLOWED_GEOMETRY_STATUS),
  };
}

/**
 * A door, window or air shower, as an insertion point only. The CAD block
 * behind it carries a vendor part name and its own internal geometry; neither
 * is carried here. Position and kind are what the floor plan needs.
 */
function projectOpening(opening) {
  if (!opening || typeof opening !== 'object') return null;
  const position = point2(opening.position);
  const kind = fromEnum(opening.kind, ALLOWED_OPENING_KIND);
  if (!position || !kind) return null;
  return {
    id: token(opening.id),
    position,
    kind,
    source: token(opening.source),
    geometry_status: fromEnum(opening.geometry_status, ALLOWED_GEOMETRY_STATUS),
  };
}

/**
 * One piece of equipment read from the CAD as a block reference.
 *
 * Position and rotation come out of an INSERT record, so both are stated by
 * the drawing rather than traced from it. Footprint is a separate and weaker
 * claim and travels with its own status; a record whose extent did not survive
 * the spatial-consistency test carries `footprint: null` and
 * `footprint_status: 'UNRESOLVED'`, and the renderer must not substitute a
 * default box for it. Emitting a nominal 1 m pad here, the way the old slot
 * projector did, would put an invented extent on the wire wearing the same
 * shape as a measured one.
 *
 * The CAD layer name, the block name and the block's family size never travel.
 * A layer or block name in this drawing identifies a vendor or a process.
 */
function projectEquipment(item, mapping) {
  if (!item || typeof item !== 'object') return null;
  const position = point3(item.position);
  if (!position) return null;

  const rotation = num(item.rotation_deg);
  const footprintStatus = fromEnum(item.footprint_status, ALLOWED_FOOTPRINT_STATUS);
  const fp = item.footprint && typeof item.footprint === 'object' ? item.footprint : null;
  const width = num(fp && fp.width);
  const depth = num(fp && fp.depth);
  // A footprint is served only when it is complete AND its status claims one.
  // Either half missing means no footprint, never half a footprint, and an
  // UNRESOLVED record never carries one however the private document is
  // written.
  const claimsExtent = footprintStatus === 'MEASURED_CAD' || footprintStatus === 'OBSERVED_CAD'
    || footprintStatus === 'APPROXIMATION';
  const footprint = claimsExtent && width !== null && depth !== null
    ? { width, depth }
    : null;
  const deviceId = deviceIdFor(mapping, item.id);

  // The measured outline, where the machine is not a box. Rebuilt vertex by
  // vertex: a polygon is served only if EVERY vertex is a pair of finite
  // numbers, and a partial outline is dropped rather than closed for it. Never
  // served without a footprint -- an outline with no extent beside it would be
  // an extent claim wearing another name.
  const outline = (value) => {
    if (footprint === null || !Array.isArray(value)
      || value.length < 3 || value.length > 64) return null;
    const out = [];
    for (const v of value) {
      const x = num(v && v.x);
      const z = num(v && v.z);
      if (x === null || z === null) return null;
      out.push({ x, z });
    }
    return out;
  };
  const polygon = outline(item.footprint_polygon);

  return {
    id: token(item.id),
    position,
    // Degrees, as the CAD records them. An angle already inside [0, 360) is
    // passed through UNTOUCHED -- running it through a modulo would introduce
    // float error into a measurement (12.345 comes back 12.345000000000027),
    // and a reconciliation test measuring residuals in thousandths would then
    // be measuring its own arithmetic. Only an out-of-range angle is wrapped.
    rotation_deg: rotation === null ? null
      : (rotation >= 0 && rotation < 360 ? rotation : ((rotation % 360) + 360) % 360),
    footprint,
    // A status that claims an extent it could not produce is corrected down to
    // UNRESOLVED rather than left claiming one.
    footprint_status: footprint === null && claimsExtent ? 'UNRESOLVED' : footprintStatus,
    footprint_source: footprint === null
      ? null
      : fromEnum(item.footprint_source, ALLOWED_FOOTPRINT_SOURCE),
    footprint_shape: footprint === null ? null
      : fromEnum(item.footprint_shape, ALLOWED_FOOTPRINT_SHAPE),
    footprint_polygon: polygon,
    // WHAT THE RENDERER DRAWS -- as a class, not as geometry. A record with no
    // served footprint cannot be a rectangle however the private document
    // labels it: the class is corrected down to UNRESOLVED, so a marker can
    // never acquire an extent through this field.
    display_shape: footprint === null ? 'UNRESOLVED'
      : fromEnum(item.display_shape, ALLOWED_DISPLAY_SHAPE),
    display_source: footprint === null ? null
      : fromEnum(item.display_source, ALLOWED_DISPLAY_SOURCE),
    // The OPERATIONAL size, and the offset from the CAD rotation to the axis
    // the block draws its body on. A machine with no physical extent gets
    // neither, so a marker can never acquire a size through this path.
    operational_footprint: footprint === null ? null
      : operationalSize(item.operational_footprint),
    operational_axis_offset_deg: footprint === null ? null
      : num(item.operational_axis_offset_deg),
    // The block's geometry puts its body on an axis the INSERT does not state.
    // Reported for an engineer; never acted on -- the CAD rotation stands.
    orientation_geometry_mismatch: item.orientation_geometry_mismatch === true,
    // One geometry group was drawn AROUND all the others and is left out of the
    // operational size. The measured outline still carries it.
    operational_excludes_enclosure: item.operational_excludes_enclosure === true,
    // The price of the abstraction: the share of floor the rectangle claims
    // beyond the geometry it is drawn around. Reported per record, never acted on.
    display_area_error: footprint === null ? null : num(item.display_area_error),
    // Two machines whose OUTLINES share floor. Measured on convex outlines, so
    // it over-reports: the convex hull of an L-shaped machine covers space the
    // machine does not occupy. Reported, never resolved by moving anything.
    overlaps_neighbour: item.footprint_overlaps_neighbour === true,
    // The handing of the machine, as the CAD states it. A mirrored INSERT is a
    // different physical machine from its twin, and the outline already carries
    // the mirror; this says so in one field the inspector can show.
    mirrored: item.mirrored === true,
    geometry_status: fromEnum(item.geometry_status, ALLOWED_GEOMETRY_STATUS),
    confidence: fromEnum(item.confidence, ALLOWED_CONFIDENCE),
    source: token(item.source),
    height_status: fromEnum(item.height_status, ALLOWED_HEIGHT_STATUS),
    zone_id: token(item.zone_id),
    zone_status: fromEnum(item.zone_status, ALLOWED_ZONE_STATUS),
    ims_device_id: deviceId,
    // Derived from the mapping the server holds, NEVER from the private
    // record's own claim: a document that asserted MAPPED_TO_IMS without a
    // device behind it would otherwise light a machine up on the map.
    mapping_status: deviceId ? 'MAPPED_TO_IMS' : 'UNMAPPED_TO_IMS',
    status: deviceId ? 'IMS_CONNECTED' : 'UNMAPPED',
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
  ZONE_NAME,
  ALLOWED_CAD_ROLE,
  zoneName,
  num,
  token,
  deviceIdFor,
  projectColumn,
  projectZoneBox,
  projectEnvelope,
  projectFootprintPolygon,
  projectGrid,
  projectFunctionalZone,
  projectCadRole,
  projectConflict,
  projectWall,
  projectWallLine,
  projectOpening,
  projectEquipment,
  projectAll,
};
