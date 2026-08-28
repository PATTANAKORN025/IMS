#!/usr/bin/env node
/**
 * Floor 1 Geometry Validator — validates services/factory-twin-3d/private/
 * floor1-geometry.json and floor1-asset-mapping.json, if present.
 *
 * This is NOT a dashboard/dependency check like the other tests/lint/*.js
 * scripts -- it validates the private, gitignored geometry files this
 * machine's local deployment may hold (never committed, may not exist at
 * all on a fresh clone -- absence is not a failure).
 *
 * Checks: duplicate slot/column/zone IDs, zero/negative dimensions,
 * non-finite (NaN/Infinity) coordinates or dimensions, slots positioned
 * outside the floor envelope (also catches "absurdly large" coordinates,
 * since anything outside the declared envelope fails this the same way --
 * no separate arbitrary max invented), missing source/confidence
 * provenance on transcribed objects, excessive coordinate precision (a
 * proxy for "this was copy-pasted from a raw calibration calculation
 * instead of a deliberately rounded value"), duplicate IMS device_id
 * mappings (two physical slots claiming the same real device), missing
 * evidence fields on any VERIFIED_PHYSICAL slot, and the one invariant
 * that must never be violated: an UNMAPPED slot must never carry a
 * MachineState-shaped live status.
 *
 * Usage: node tests/lint/floor1-geometry-validator.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Single source of truth for what the runtime can read -- imported rather
// than re-declared so the validator and the service cannot drift apart.
const { SUPPORTED_SCHEMA_MAJOR } = require('../../services/factory-twin-3d/lib/contracts');

// Overridable so mutation tests can point at throwaway fixtures instead of
// corrupting the real private data to prove a rule fires. Unset in normal use.
const PRIVATE_DIR =
  process.env.FACTORY_TWIN_PRIVATE_DIR ||
  path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'private');
const GEOMETRY_PATH = path.join(PRIVATE_DIR, 'floor1-geometry.json');
const MAPPING_PATH = path.join(PRIVATE_DIR, 'floor1-asset-mapping.json');
const ZONES_PATH = path.join(PRIVATE_DIR, 'floor1-zones.json');

// A functional-zone is a process/functional area digitized from the
// drawing's area layer. It is NOT a room and NOT an architectural wall.
// Only HIGH/MEDIUM zones with an unambiguous boundary are renderable; LOW,
// REJECTED, UNRESOLVED and unresolved CONFLICT zones are metadata-only and
// must never carry renderable geometry.
const ZONE_CONFIDENCE = new Set(['HIGH', 'MEDIUM', 'LOW', 'REJECTED', 'UNRESOLVED']);
const RENDERABLE_CONFIDENCE = new Set(['HIGH', 'MEDIUM']);

const REAL_MACHINE_STATES = new Set(['OFF', 'DOWN', 'IDLE', 'RUN', 'PM_STOP', 'UNKNOWN']);
const MAX_DECIMAL_PLACES = 3; // beyond this reads as false precision, not a deliberate value

let errors = 0;
let warnings = 0;

function error(msg) {
  console.log(`  ERROR   ${msg}`);
  errors++;
}
function warn(msg) {
  console.log(`  WARN    ${msg}`);
  warnings++;
}

function excessivePrecision(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return false;
  const s = String(n);
  const dot = s.indexOf('.');
  return dot !== -1 && s.length - dot - 1 > MAX_DECIMAL_PLACES;
}

function checkDims(obj, label, fields) {
  for (const f of fields) {
    const v = obj[f];
    if (v === undefined) continue;
    if (typeof v !== 'number' || Number.isNaN(v)) { error(`${label}: ${f} is not a valid number (${v})`); continue; }
    if (!Number.isFinite(v)) { error(`${label}: ${f} is not finite (${v})`); continue; }
    if (v <= 0) error(`${label}: ${f} must be > 0, got ${v}`);
    if (excessivePrecision(v)) warn(`${label}: ${f} has excessive precision (${v}) -- looks like an unrounded calculation, not a deliberate value`);
  }
}

// Same non-finite check as checkDims, but for values allowed to be zero
// or negative (coordinates) -- only rejects NaN/Infinity, not magnitude.
function checkFiniteCoords(obj, label, fields) {
  if (!obj) return;
  for (const f of fields) {
    const v = obj[f];
    if (v === undefined) continue;
    if (typeof v !== 'number' || Number.isNaN(v)) error(`${label}: ${f} is not a valid number (${v})`);
    else if (!Number.isFinite(v)) error(`${label}: ${f} is not finite (${v})`);
  }
}

// Ray-cast point-in-polygon against the validated footprint. Stricter than
// insideEnvelope(): the envelope is only the footprint's bounding box, so an
// object can sit inside the box yet outside the building.
function insidePolygon(pos, verts) {
  if (!pos || !Array.isArray(verts) || verts.length < 3) return true;
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const a = verts[i];
    const b = verts[j];
    if ((a.z > pos.z) !== (b.z > pos.z) && pos.x < ((b.x - a.x) * (pos.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// O(n^2) segment sweep -- fine for the vertex counts these polygons carry.
function selfIntersections(verts) {
  const orient = (p, q, r) => {
    const v = (q.z - p.z) * (r.x - q.x) - (q.x - p.x) * (r.z - q.z);
    return Math.abs(v) < 1e-12 ? 0 : v > 0 ? 1 : 2;
  };
  const crosses = (a, b, c, d) =>
    orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
  const n = verts.length;
  if (n > 400) return 0; // guard: not worth an O(n^2) sweep in a lint pass
  let hits = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (crosses(verts[i], verts[(i + 1) % n], verts[j], verts[(j + 1) % n])) hits++;
    }
  }
  return hits;
}

function insideEnvelope(pos, envelope) {
  if (!envelope) return true; // nothing to check against
  const halfW = envelope.width / 2;
  const halfD = envelope.depth / 2;
  return pos.x >= -halfW - 0.01 && pos.x <= halfW + 0.01 && pos.z >= -halfD - 0.01 && pos.z <= halfD + 0.01;
}

console.log('Floor 1 Geometry Validator');
console.log('='.repeat(50));

const geometryPresent = fs.existsSync(GEOMETRY_PATH);
const zonesPresent = fs.existsSync(ZONES_PATH);

if (!geometryPresent && !zonesPresent) {
  console.log('No private geometry or zone file present -- nothing to validate (expected on a fresh clone).');
  console.log('='.repeat(50));
  console.log('VALIDATION SKIPPED (no private files)');
  process.exit(0);
}

// Defaults to {} rather than null so the geometry checks below degrade to
// empty-array iterations when only the zone file exists -- the two files
// are independently optional.
let geometry = {};
if (geometryPresent) {
  try {
    geometry = JSON.parse(fs.readFileSync(GEOMETRY_PATH, 'utf8'));
  } catch (err) {
    error(`floor1-geometry.json is not valid JSON: ${err.message}`);
    console.log('='.repeat(50));
    console.log(`Results: ${errors} error(s), ${warnings} warning(s)`);
    process.exit(1);
  }
} else {
  console.log('private/floor1-geometry.json not present -- skipping geometry checks.');
}

let mapping = {};
if (fs.existsSync(MAPPING_PATH)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
    mapping = parsed.mapping || {};
  } catch (err) {
    error(`floor1-asset-mapping.json is not valid JSON: ${err.message}`);
  }
}

// -- envelope --
if (geometry.envelope) {
  checkDims(geometry.envelope, 'envelope', ['width', 'depth', 'height']);
}

// -- duplicate IDs --
const seenColumnIds = new Set();
for (const col of geometry.columns || []) {
  if (seenColumnIds.has(col.id)) error(`duplicate column id: ${col.id}`);
  seenColumnIds.add(col.id);
  checkFiniteCoords(col.position, `column ${col.id}`, ['x', 'y', 'z']);
}

const seenZoneIds = new Set();
for (const zone of geometry.zones || []) {
  if (seenZoneIds.has(zone.zone_id)) error(`duplicate zone id: ${zone.zone_id}`);
  seenZoneIds.add(zone.zone_id);
  if (zone.bounds) {
    checkDims(zone.bounds, `zone ${zone.zone_id}`, ['width', 'depth']);
    checkFiniteCoords(zone.bounds, `zone ${zone.zone_id}`, ['x', 'z']);
  }
}

const seenSlotIds = new Set();
for (const slot of geometry.slots || []) {
  if (seenSlotIds.has(slot.slot_id)) error(`duplicate slot id: ${slot.slot_id}`);
  seenSlotIds.add(slot.slot_id);

  const size = slot.size || slot.footprint;
  if (size) checkDims(size, `slot ${slot.slot_id}`, ['width', 'depth']);
  if (typeof slot.height === 'number') checkDims(slot, `slot ${slot.slot_id}`, ['height']);
  checkFiniteCoords(slot.position, `slot ${slot.slot_id}`, ['x', 'y', 'z']);

  if (slot.rotation !== undefined) {
    if (typeof slot.rotation !== 'number' || Number.isNaN(slot.rotation) || !Number.isFinite(slot.rotation)) {
      error(`slot ${slot.slot_id}: rotation is not a valid finite number (${slot.rotation})`);
    } else if (slot.rotation < 0 || slot.rotation >= 360) {
      error(`slot ${slot.slot_id}: rotation ${slot.rotation} out of [0,360) range`);
    }
  }

  // "Absurdly large coordinates" is deliberately not a separately-invented
  // threshold -- anything outside the geometry's OWN declared envelope
  // fails this same check, whether it's slightly outside or wildly so.
  if (slot.position && !insideEnvelope(slot.position, geometry.envelope)) {
    error(`slot ${slot.slot_id}: position (${slot.position.x}, ${slot.position.z}) falls outside the floor envelope`);
  }

  if (slot.source === 'engineering_drawing_transcription' && !slot.confidence) {
    error(`slot ${slot.slot_id}: source is engineering_drawing_transcription but confidence is missing`);
  }

  // VERIFIED_PHYSICAL asserts a real, specific asset is confirmed to
  // occupy this slot -- that claim requires evidence fields, same
  // discipline as source/confidence above. No instance of this exists in
  // this repo's own data today (checked, not assumed -- see the count
  // logged at the end); this check only fires if one is ever added
  // without the evidence to back it.
  if (slot.status === 'VERIFIED_PHYSICAL' && (!slot.verification_source || !slot.confidence)) {
    error(`slot ${slot.slot_id}: status is VERIFIED_PHYSICAL but missing verification_source and/or confidence -- that status asserts real evidence exists`);
  }

  // The one invariant that must never be violated: an UNMAPPED slot must
  // never carry a MachineState-shaped live status.
  const mappedDevice = mapping[slot.slot_id] || null;
  if (!mappedDevice && slot.status && REAL_MACHINE_STATES.has(slot.status)) {
    error(`slot ${slot.slot_id}: UNMAPPED but status "${slot.status}" is a live MachineState value -- unmapped slots must be geometry-only`);
  }
  if (mappedDevice && slot.status !== 'IMS_CONNECTED' && slot.status !== 'VERIFIED_PHYSICAL') {
    warn(`slot ${slot.slot_id}: mapped to ${mappedDevice} but status is "${slot.status}", expected IMS_CONNECTED or VERIFIED_PHYSICAL`);
  }
}

// -- mapping sanity: every mapped slot_id must exist in geometry --
// Only meaningful when the geometry file is actually present; without it
// there is no slot list to check against and every entry would false-fail.
if (geometryPresent) {
  for (const slotId of Object.keys(mapping)) {
    if (mapping[slotId] && !seenSlotIds.has(slotId)) {
      error(`floor1-asset-mapping.json maps ${slotId} -> ${mapping[slotId]}, but no such slot exists in floor1-geometry.json`);
    }
  }
}

// -- duplicate IMS device_id mappings: two physical slots can't both
// claim the same real device -- a real device occupies exactly one
// physical position. --
const deviceToSlots = new Map();
for (const [slotId, deviceId] of Object.entries(mapping)) {
  if (!deviceId) continue;
  if (!deviceToSlots.has(deviceId)) deviceToSlots.set(deviceId, []);
  deviceToSlots.get(deviceId).push(slotId);
}
for (const [deviceId, slotIds] of deviceToSlots) {
  if (slotIds.length > 1) error(`device_id ${deviceId} is mapped to ${slotIds.length} different slots (${slotIds.join(', ')}) -- a real device can only occupy one physical slot`);
}

// -- schema version + height semantics --
// The reader declares what it can parse in contracts.js; this keeps the two
// from drifting apart silently.
function checkSchemaVersion(doc, label, expectedMajor) {
  const raw = doc && doc.schema_version;
  if (typeof raw !== 'string' || !/^\d+\.\d+\.\d+$/.test(raw)) {
    error(`${label}: missing or malformed schema_version (${raw}) -- expected a semver string`);
    return;
  }
  const major = Number(raw.split('.')[0]);
  if (major !== expectedMajor) {
    error(`${label}: schema_version ${raw} has major ${major}, but this runtime supports major ${expectedMajor}`);
  }
}
if (geometryPresent) checkSchemaVersion(geometry, 'floor1-geometry.json', SUPPORTED_SCHEMA_MAJOR.geometry);

if (geometry.envelope) {
  const e = geometry.envelope;
  // Clear height is not in evidence. It may only carry a value if the value
  // arrives with a source, otherwise it is an estimate wearing a fact's shape.
  if (e.clear_height_m !== null && e.clear_height_m !== undefined) {
    if (typeof e.clear_height_m !== 'number' || !Number.isFinite(e.clear_height_m)) {
      error(`envelope: clear_height_m must be null or a finite number (got ${e.clear_height_m})`);
    } else if (!e.clear_height_source) {
      error('envelope: clear_height_m carries a value but no clear_height_source -- an unsourced clear height is an estimate, not evidence');
    }
  }
  if (e.floor_to_floor === true && !e.height_source) {
    error('envelope: floor_to_floor is true but height_source is missing -- the derivation must travel with the value');
  }
  if (typeof e.clear_height_m === 'number' && typeof e.height === 'number' && e.clear_height_m > e.height) {
    error(`envelope: clear_height_m (${e.clear_height_m}) exceeds floor-to-floor height (${e.height}) -- contradictory height semantics`);
  }
}

// -- footprint polygon topology --
// The polygon is the boundary every other object is checked against, so a
// malformed one would silently invalidate the containment checks below.
let footprint = null;
if (geometry.footprint_polygon) {
  const fp = geometry.footprint_polygon;
  const verts = Array.isArray(fp.vertices) ? fp.vertices : [];
  if (verts.length < 3) {
    error(`footprint_polygon: ${verts.length} vertices, needs at least 3`);
  } else {
    verts.forEach((v, i) => checkFiniteCoords(v, `footprint_polygon vertex ${i}`, ['x', 'z']));
    const a = verts[0];
    const b = verts[verts.length - 1];
    if (a.x === b.x && a.z === b.z) {
      error('footprint_polygon: ring repeats its first vertex as the last -- rings are implicitly closed');
    }
    if (selfIntersections(verts) > 0) error('footprint_polygon: polygon self-intersects');
    if (verts.every((v) => Number.isFinite(v.x) && Number.isFinite(v.z))) footprint = verts;
  }
}

// -- grid consistency --
// The grid is deterministic from the printed spans; if the cumulative lines
// stop agreeing with the envelope, the calibration has drifted.
if (geometry.grid) {
  const g = geometry.grid;
  for (const [axis, lines, spans, total] of [
    ['x', g.x_lines, g.x_spans_mm, geometry.envelope?.width],
    ['z', g.z_lines, g.z_spans_mm, geometry.envelope?.depth],
  ]) {
    if (!Array.isArray(lines) || !Array.isArray(spans)) continue;
    if (lines.length !== spans.length + 1) {
      error(`grid ${axis}: ${lines.length} lines but ${spans.length} spans (expected lines = spans + 1)`);
    }
    lines.forEach((v, i) => {
      if (!Number.isFinite(v)) error(`grid ${axis}_lines[${i}] is not finite (${v})`);
    });
    const spanTotalM = spans.reduce((s, v) => s + v, 0) / 1000;
    if (typeof total === 'number' && Math.abs(spanTotalM - total) > 0.001) {
      error(`grid ${axis}: spans sum to ${spanTotalM} m but envelope declares ${total} m`);
    }
    const lineSpanM = lines.length ? lines[lines.length - 1] - lines[0] : 0;
    if (typeof total === 'number' && Math.abs(lineSpanM - total) > 0.001) {
      error(`grid ${axis}: cumulative lines span ${lineSpanM} m but envelope declares ${total} m`);
    }
  }
}

// Zone ids are needed before the slot loop (slots reference them) but the zone
// file is fully validated later. Read the ids up front; null means "no zone
// file", which disables the reference check rather than failing every slot.
let knownZoneIds = null;
if (zonesPresent) {
  try {
    const parsed = JSON.parse(fs.readFileSync(ZONES_PATH, 'utf8'));
    if (Array.isArray(parsed.zones)) knownZoneIds = new Set(parsed.zones.map((z) => z.id));
  } catch {
    // Malformed JSON is reported by the zone section below; not duplicated here.
  }
}

// -- coordinate system --
// Units and scale are the assumption every number in the file rests on. If
// they ever drift from metres, every containment and area check silently
// starts measuring the wrong thing.
if (geometry.coordinate_system) {
  const cs = geometry.coordinate_system;
  if (cs.units !== 'metres') {
    error(`coordinate_system: units must be "metres" (got "${cs.units}") -- every stored coordinate assumes it`);
  }
  if (!cs.origin) error('coordinate_system: origin must be stated');
  if (!cs.axes) error('coordinate_system: axes must be stated');
  if (typeof cs.floor_level_m !== 'number' || !Number.isFinite(cs.floor_level_m)) {
    error(`coordinate_system: floor_level_m must be a finite number (got ${cs.floor_level_m})`);
  } else if (!cs.floor_level_source) {
    error('coordinate_system: floor_level_m carries a value but no floor_level_source');
  }
}

// -- footprint winding --
// The recorded winding must match the polygon's actual orientation. A stale
// winding field is worse than none: downstream code that trusts it would
// treat the interior as the exterior.
if (footprint && geometry.footprint_polygon.winding) {
  let twice = 0;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i];
    const b = footprint[(i + 1) % footprint.length];
    twice += a.x * b.z - b.x * a.z;
  }
  const actual = twice > 0 ? 'CCW' : 'CW';
  if (actual !== geometry.footprint_polygon.winding) {
    error(`footprint_polygon: winding is recorded as ${geometry.footprint_polygon.winding} but the vertices wind ${actual}`);
  }
}

// -- columns: provenance + containment --
// Detected geometry must carry the evidence it was detected from, and must
// sit inside the boundary it was clipped to.
const VALID_TIER = new Set(['high', 'medium', 'low', 'unknown']);
const seenColIds = new Set();
for (const col of geometry.columns || []) {
  const label = `column ${col.id}`;
  if (seenColIds.has(col.id)) error(`duplicate column id: ${col.id}`);
  seenColIds.add(col.id);
  if (!col.confidence || !VALID_TIER.has(col.confidence)) error(`${label}: invalid/missing confidence "${col.confidence}"`);
  if (!col.source) error(`${label}: missing source provenance`);
  if (col.source === 'digitized_from_drawing' && !col.detector) {
    error(`${label}: digitized but carries no detector metadata -- detected geometry must record what it was detected from`);
  }
  if (col.footprint) checkDims(col.footprint, label, ['width', 'depth']);
  if (col.position && footprint && !insidePolygon(col.position, footprint)) {
    error(`${label}: position falls outside the validated footprint polygon`);
  }
  // Physical structure is rendered as fact. A LOW-confidence detection is not
  // fact, so it must not be emitted as geometry at all -- the tier exists to
  // be withheld, the way LOW zones are.
  if (col.confidence === 'low') {
    error(`${label}: LOW-confidence structural geometry must not be emitted -- retain it as a rejected candidate instead`);
  }
}
if ((geometry.columns || []).length > 0 && !geometry.column_detection) {
  error('columns are present but column_detection metadata is missing -- method and limitations must be disclosed');
}

// -- slots: provenance, observed-vs-derived, containment --
for (const slot of geometry.slots || []) {
  const label = `slot ${slot.slot_id}`;
  if (slot.confidence && !VALID_TIER.has(slot.confidence)) error(`${label}: invalid confidence "${slot.confidence}"`);
  if (slot.source === 'digitized_from_drawing') {
    if (!slot.confidence) error(`${label}: digitized but missing confidence`);
    if (!slot.detection) error(`${label}: digitized but carries no detection metadata`);
    if (!slot.geometry_status) error(`${label}: digitized but missing geometry_status (observed vs derived)`);
  }
  if (slot.position && footprint && !insidePolygon(slot.position, footprint)) {
    error(`${label}: position falls outside the validated footprint polygon`);
  }
  if (slot.confidence === 'low') {
    error(`${label}: LOW-confidence equipment geometry must not be emitted -- retain it as a rejected candidate instead`);
  }
  // zone_id is assigned only by geometric containment, so it must name a zone
  // that actually exists. A dangling reference would render as "this position
  // belongs to a zone" while pointing at nothing.
  if (slot.zone_id != null && knownZoneIds && !knownZoneIds.has(slot.zone_id)) {
    error(`${label}: zone_id "${slot.zone_id}" does not exist in the zone file`);
  }
}
if ((geometry.slots || []).length > 0 && !geometry.equipment_detection) {
  error('slots are present but equipment_detection metadata is missing -- method and limitations must be disclosed');
}

// -- functional zones (private/floor1-zones.json) --
let zoneDoc = null;
let zoneCounts = { total: 0, renderable: 0 };
if (zonesPresent) {
  try {
    zoneDoc = JSON.parse(fs.readFileSync(ZONES_PATH, 'utf8'));
  } catch (err) {
    error(`floor1-zones.json is not valid JSON: ${err.message}`);
  }
}
if (zoneDoc) {
  const zones = Array.isArray(zoneDoc.zones) ? zoneDoc.zones : [];
  zoneCounts.total = zones.length;
  const seenZoneObjIds = new Set();
  const conflicted = new Set();
  for (const c of zoneDoc.conflicts || []) {
    if (c.status === 'CONFLICT') for (const id of c.ids || []) conflicted.add(id);
  }

  for (const z of zones) {
    const label = `functional-zone ${z.id}`;
    if (!z.id) { error('a functional-zone is missing its id'); continue; }
    if (seenZoneObjIds.has(z.id)) error(`duplicate functional-zone id: ${z.id}`);
    seenZoneObjIds.add(z.id);

    if (z.type !== 'functional-zone') {
      error(`${label}: type must be "functional-zone" (got "${z.type}") -- these are process areas, not rooms or walls`);
    }
    if (!ZONE_CONFIDENCE.has(z.confidence)) {
      error(`${label}: invalid confidence "${z.confidence}"`);
    }
    if (typeof z.renderable !== 'boolean') {
      error(`${label}: renderable must be a boolean (got ${z.renderable})`);
    }

    const isConflicted = z.status === 'CONFLICT' || conflicted.has(z.id);

    // The invariant this whole file exists to protect: geometry that was
    // not validated must never be presented as if it were. LOW/REJECTED/
    // UNRESOLVED tiers and any unresolved CONFLICT are metadata-only.
    if (z.renderable === true) {
      if (!RENDERABLE_CONFIDENCE.has(z.confidence)) {
        error(`${label}: renderable=true but confidence is ${z.confidence} -- only HIGH/MEDIUM may render`);
      }
      if (isConflicted) {
        error(`${label}: renderable=true but the zone is in an unresolved CONFLICT -- conflicting candidates must not render`);
      }
      if (!z.geometry || !Array.isArray(z.geometry.vertices) || z.geometry.vertices.length < 3) {
        error(`${label}: renderable=true but has no polygon of at least 3 vertices`);
      }
    }

    if (!z.geometry) {
      if (z.renderable === true) error(`${label}: renderable=true with null geometry`);
      continue;
    }

    const verts = Array.isArray(z.geometry.vertices) ? z.geometry.vertices : [];
    if (verts.length < 3) {
      error(`${label}: polygon has ${verts.length} vertices, needs at least 3`);
      continue;
    }
    verts.forEach((v, i) => checkFiniteCoords(v, `${label} vertex ${i}`, ['x', 'z']));

    // A ring is implicitly closed -- an explicit repeat of the first point
    // as the last is a malformed ring here, not a closure.
    const first = verts[0];
    const last = verts[verts.length - 1];
    if (first && last && first.x === last.x && first.z === last.z) {
      error(`${label}: ring repeats its first vertex as the last -- rings are implicitly closed`);
    }

    // Self-intersection: skipped above a size where the O(n^2) sweep stops
    // being worth it in a lint pass; those zones are non-renderable anyway.
    if (verts.length <= 200) {
      const orient = (p, q, r) => {
        const v = (q.z - p.z) * (r.x - q.x) - (q.x - p.x) * (r.z - q.z);
        return Math.abs(v) < 1e-12 ? 0 : (v > 0 ? 1 : 2);
      };
      const crosses = (a, b, c, d) =>
        orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
      const n = verts.length;
      let hits = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
          if (crosses(verts[i], verts[(i + 1) % n], verts[j], verts[(j + 1) % n])) hits++;
        }
      }
      if (hits > 0) error(`${label}: polygon self-intersects (${hits} crossing pair(s))`);
    }

    if (z.renderable === true) zoneCounts.renderable++;
  }

  // Every declared CONFLICT must still name at least two candidates and
  // leave them unrendered -- a conflict silently resolved by dropping one
  // side is exactly the failure mode this metadata exists to prevent.
  for (const c of zoneDoc.conflicts || []) {
    if (c.status !== 'CONFLICT') continue;
    if (!Array.isArray(c.ids) || c.ids.length < 2) {
      error(`conflict entry ${JSON.stringify(c.ids)} must name at least two competing zones`);
    }
    for (const id of c.ids || []) {
      const z = zones.find((q) => q.id === id);
      if (!z) error(`conflict names ${id}, but no such functional-zone exists`);
      else if (z.renderable === true) error(`conflict member ${id} is renderable -- unresolved conflicts must not render`);
    }
  }
}

const verifiedPhysicalCount = (geometry.slots || []).filter((s) => s.status === 'VERIFIED_PHYSICAL').length;

console.log(`Checked: ${geometry.columns?.length || 0} columns, ${geometry.zones?.length || 0} zones, ${geometry.slots?.length || 0} slots, ${Object.keys(mapping).length} mapping entries, ${deviceToSlots.size} unique mapped device(s), ${verifiedPhysicalCount} VERIFIED_PHYSICAL slot(s).`);
console.log(`Functional zones: ${zoneCounts.total} record(s), ${zoneCounts.renderable} renderable, ${zoneCounts.total - zoneCounts.renderable} metadata-only.`);
console.log('='.repeat(50));
console.log(`Results: ${errors} error(s), ${warnings} warning(s)`);
if (errors > 0) {
  console.log('GEOMETRY VALIDATION FAILED');
  process.exit(1);
}
console.log('GEOMETRY VALIDATION PASSED' + (warnings > 0 ? ' with warnings' : ''));
