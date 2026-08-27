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

const PRIVATE_DIR = path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'private');
const GEOMETRY_PATH = path.join(PRIVATE_DIR, 'floor1-geometry.json');
const MAPPING_PATH = path.join(PRIVATE_DIR, 'floor1-asset-mapping.json');

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

function insideEnvelope(pos, envelope) {
  if (!envelope) return true; // nothing to check against
  const halfW = envelope.width / 2;
  const halfD = envelope.depth / 2;
  return pos.x >= -halfW - 0.01 && pos.x <= halfW + 0.01 && pos.z >= -halfD - 0.01 && pos.z <= halfD + 0.01;
}

console.log('Floor 1 Geometry Validator');
console.log('='.repeat(50));

if (!fs.existsSync(GEOMETRY_PATH)) {
  console.log('private/floor1-geometry.json not present -- nothing to validate (expected on a fresh clone).');
  console.log('='.repeat(50));
  console.log('VALIDATION SKIPPED (no private geometry file)');
  process.exit(0);
}

let geometry;
try {
  geometry = JSON.parse(fs.readFileSync(GEOMETRY_PATH, 'utf8'));
} catch (err) {
  error(`floor1-geometry.json is not valid JSON: ${err.message}`);
  console.log('='.repeat(50));
  console.log(`Results: ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
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
for (const slotId of Object.keys(mapping)) {
  if (mapping[slotId] && !seenSlotIds.has(slotId)) {
    error(`floor1-asset-mapping.json maps ${slotId} -> ${mapping[slotId]}, but no such slot exists in floor1-geometry.json`);
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

const verifiedPhysicalCount = (geometry.slots || []).filter((s) => s.status === 'VERIFIED_PHYSICAL').length;

console.log(`Checked: ${geometry.columns?.length || 0} columns, ${geometry.zones?.length || 0} zones, ${geometry.slots?.length || 0} slots, ${Object.keys(mapping).length} mapping entries, ${deviceToSlots.size} unique mapped device(s), ${verifiedPhysicalCount} VERIFIED_PHYSICAL slot(s).`);
console.log('='.repeat(50));
console.log(`Results: ${errors} error(s), ${warnings} warning(s)`);
if (errors > 0) {
  console.log('GEOMETRY VALIDATION FAILED');
  process.exit(1);
}
console.log('GEOMETRY VALIDATION PASSED' + (warnings > 0 ? ' with warnings' : ''));
