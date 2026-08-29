/**
 * Wire projection tests — services/factory-twin-3d/lib/wire.js
 *
 * These are security regression tests, not shape tests. Every case here is fed
 * input a private file could plausibly come to hold — an extra field, a note, a
 * path, a hostile key — and asserts the projection refuses to carry it.
 *
 * All fixture values are obviously synthetic (TEST-*) so a leak scanner finding
 * one in a response is unambiguous, and so nothing in this file resembles real
 * facility data.
 *
 * Run: node tests/unit/factory-twin-wire.test.js
 */

'use strict';

const assert = require('assert');
const wire = require('../../services/factory-twin-3d/lib/wire');

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

/** A well-formed slot, of the shape the private document actually uses. */
function validSlot(extra = {}) {
  return Object.assign(
    {
      slot_id: 'slot-0001',
      position: { x: 1.5, y: 0, z: -2.25 },
      footprint: { width: 2, depth: 3, height: 1 },
      confidence: 'high',
      source: 'drawing',
      geometry_status: 'observed',
      height_status: 'unknown',
      zone_id: 'zone-04',
      detection: { layer: 'equipment' },
    },
    extra
  );
}

function validColumn(extra = {}) {
  return Object.assign(
    {
      id: 'col-0007',
      position: { x: 4, z: 8 },
      footprint: { width: 0.96, depth: 0.96 },
      grid_ref: { x: 'C', z: 3 },
      offset_from_intersection_mm: 40,
      confidence: 'high',
      source: 'drawing',
      geometry_status: 'observed',
      detector: { ring_density: 0.81, interior_density: 0.12 },
    },
    extra
  );
}

console.log('\nFactory Twin Wire Projection Tests\n');

// ── The core guarantee: an unknown field never reaches the wire ──

test('an added private field on a slot is not carried', () => {
  const out = wire.projectSlot(validSlot({ internal_note: 'TEST-PRIVATE-NOTE' }), {});
  assert.ok(!('internal_note' in out), 'internal_note was carried through');
  assert.ok(!JSON.stringify(out).includes('TEST-PRIVATE-NOTE'));
});

test('an added private field on a column is not carried', () => {
  const out = wire.projectColumn(validColumn({ source_file: 'TEST-PRIVATE-PATH' }));
  assert.ok(!('source_file' in out));
  assert.ok(!JSON.stringify(out).includes('TEST-PRIVATE-PATH'));
});

test('a slot projection emits exactly the documented key set', () => {
  const out = wire.projectSlot(validSlot(), {});
  assert.deepStrictEqual(Object.keys(out).sort(), [
    'confidence',
    'detection',
    'footprint',
    'geometry_status',
    'height_status',
    'ims_device_id',
    'position',
    'slot_id',
    'source',
    'status',
    'zone_id',
  ]);
});

test('a column projection emits exactly the documented key set', () => {
  const out = wire.projectColumn(validColumn());
  assert.deepStrictEqual(Object.keys(out).sort(), [
    'confidence',
    'detector',
    'footprint',
    'geometry_status',
    'grid_ref',
    'id',
    'offset_from_intersection_mm',
    'position',
    'source',
  ]);
});

test('a valid slot keeps every value it should', () => {
  const out = wire.projectSlot(validSlot(), {});
  assert.deepStrictEqual(out.position, { x: 1.5, y: 0, z: -2.25 });
  assert.deepStrictEqual(out.footprint, { width: 2, depth: 3, height: 1 });
  assert.strictEqual(out.confidence, 'high');
  assert.strictEqual(out.height_status, 'unknown');
  assert.strictEqual(out.zone_id, 'zone-04');
  assert.deepStrictEqual(out.detection, { layer: 'equipment' });
});

// ── Free text cannot pass a token guard ──

test('free text in a token field is dropped, not sanitised and echoed', () => {
  const out = wire.projectSlot(validSlot({ source: 'TEST-NOTE with spaces and /a/path' }), {});
  assert.strictEqual(out.source, null);
});

test('a filesystem path is not a token', () => {
  assert.strictEqual(wire.token('C:/TEST/private/floor.json'), null);
  assert.strictEqual(wire.token('/TEST/private/floor.json'), null);
  assert.strictEqual(wire.token('..\\TEST\\secret'), null);
});

test('an unrecognised confidence tier is dropped rather than echoed', () => {
  const out = wire.projectSlot(validSlot({ confidence: 'TEST-INVENTED-TIER' }), {});
  assert.strictEqual(out.confidence, null);
});

test('an unrecognised geometry or height status is dropped', () => {
  const out = wire.projectSlot(validSlot({ geometry_status: 'TEST-BOGUS', height_status: 'TEST-BOGUS' }), {});
  assert.strictEqual(out.geometry_status, null);
  assert.strictEqual(out.height_status, null);
});

test('a half-resolved grid reference reports none rather than half', () => {
  const out = wire.projectColumn(validColumn({ grid_ref: { x: 'C', z: 'TEST BAD REF' } }));
  assert.strictEqual(out.grid_ref, null);
});

// ── Numbers ──

test('NaN and Infinity are rejected as coordinates', () => {
  assert.strictEqual(wire.projectSlot(validSlot({ position: { x: NaN, y: 0, z: 1 } }), {}), null);
  assert.strictEqual(wire.projectSlot(validSlot({ position: { x: 1, y: 0, z: Infinity } }), {}), null);
});

test('a numeric string is not a number', () => {
  assert.strictEqual(wire.num('1.5'), null);
  assert.strictEqual(wire.projectSlot(validSlot({ position: { x: '1', y: '0', z: '2' } }), {}), null);
});

test('a slot with no usable position is withheld, never placed at a fallback', () => {
  assert.strictEqual(wire.projectSlot(validSlot({ position: null }), {}), null);
  assert.strictEqual(wire.projectSlot(validSlot({ position: {} }), {}), null);
});

test('a missing footprint falls back to a neutral pad, not to an invented dimension', () => {
  const out = wire.projectSlot(validSlot({ footprint: undefined, size: undefined, height: undefined }), {});
  assert.deepStrictEqual(out.footprint, { width: 1, depth: 1, height: 1 });
});

test('the alternative size+height shape is normalised to one wire shape', () => {
  const out = wire.projectSlot(
    validSlot({ footprint: undefined, size: { width: 4, depth: 5 }, height: 6 }),
    {}
  );
  assert.deepStrictEqual(out.footprint, { width: 4, depth: 5, height: 6 });
});

// ── Mapping lookup: the fabricated-mapping vector ──

test('a slot id of __proto__ cannot conjure a mapping', () => {
  const mapping = JSON.parse('{"__proto__": "TEST-FAKE-DEVICE"}');
  const out = wire.projectSlot(validSlot({ slot_id: '__proto__' }), mapping);
  assert.strictEqual(out.ims_device_id, null);
  assert.strictEqual(out.status, 'UNMAPPED');
});

test('a slot id of constructor cannot conjure a mapping', () => {
  const out = wire.projectSlot(validSlot({ slot_id: 'constructor' }), {});
  assert.strictEqual(out.ims_device_id, null);
  assert.strictEqual(out.status, 'UNMAPPED');
});

test('inherited property names never answer a mapping lookup', () => {
  for (const name of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
    const out = wire.projectSlot(validSlot({ slot_id: name }), {});
    assert.strictEqual(out.status, 'UNMAPPED', `${name} produced a mapping`);
  }
});

test('a mapping value that is not a token does not map', () => {
  const out = wire.projectSlot(validSlot(), { 'slot-0001': { device_id: 'TEST-OBJ' } });
  assert.strictEqual(out.ims_device_id, null);
  assert.strictEqual(out.status, 'UNMAPPED');
});

test('an explicit null mapping entry stays unmapped', () => {
  const out = wire.projectSlot(validSlot(), { 'slot-0001': null });
  assert.strictEqual(out.ims_device_id, null);
  assert.strictEqual(out.status, 'UNMAPPED');
});

test('a real authoritative mapping entry does map', () => {
  const out = wire.projectSlot(validSlot(), { 'slot-0001': 'TEST-DEVICE-01' });
  assert.strictEqual(out.ims_device_id, 'TEST-DEVICE-01');
  assert.strictEqual(out.status, 'IMS_CONNECTED');
});

// ── Functional zones ──

test('a zone type, its areas and its notes are not carried', () => {
  const out = wire.projectFunctionalZone({
    id: 'zone-04',
    type: 'TEST-PROCESS-NAME',
    confidence: 'HIGH',
    status: 'VALIDATED',
    printedAreaM2: 1234,
    calculatedAreaM2: 1230,
    areaDeltaPct: 0.3,
    validationNotes: 'TEST-PRIVATE-NOTE',
    geometry: { vertices: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] },
  });
  assert.deepStrictEqual(Object.keys(out).sort(), ['confidence', 'geometry', 'id', 'status']);
  const s = JSON.stringify(out);
  assert.ok(!s.includes('TEST-PROCESS-NAME'));
  assert.ok(!s.includes('TEST-PRIVATE-NOTE'));
  assert.ok(!s.includes('1234'));
});

test('a zone vertex list is rebuilt to x/z only', () => {
  const out = wire.projectFunctionalZone({
    id: 'zone-05',
    confidence: 'MEDIUM',
    geometry: {
      source_layer: 'TEST-PRIVATE-LAYER',
      vertices: [
        { x: 0, z: 0, note: 'TEST-VERTEX-NOTE' },
        { x: 1, z: 0 },
        { x: 1, z: 1 },
      ],
    },
  });
  assert.deepStrictEqual(Object.keys(out.geometry), ['vertices']);
  assert.deepStrictEqual(out.geometry.vertices[0], { x: 0, z: 0 });
  assert.ok(!JSON.stringify(out).includes('TEST-'));
});

test('one unusable vertex withholds the whole boundary', () => {
  const out = wire.projectFunctionalZone({
    id: 'zone-06',
    confidence: 'HIGH',
    geometry: { vertices: [{ x: 0, z: 0 }, { x: 1, z: null }, { x: 1, z: 1 }] },
  });
  assert.strictEqual(out, null);
});

test('a zone below three vertices, or with no accepted tier, is withheld', () => {
  assert.strictEqual(
    wire.projectFunctionalZone({ id: 'zone-07', confidence: 'HIGH', geometry: { vertices: [{ x: 0, z: 0 }] } }),
    null
  );
  assert.strictEqual(
    wire.projectFunctionalZone({
      id: 'zone-08',
      confidence: 'LOW-ISH',
      geometry: { vertices: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] },
    }),
    null
  );
});

// ── Conflicts ──

test('a conflict resolution note is not carried', () => {
  const out = wire.projectConflict({
    ids: ['zone-28', 'zone-31'],
    status: 'CONFLICT',
    resolution: 'TEST-RESOLUTION-NOTE',
  });
  assert.deepStrictEqual(Object.keys(out).sort(), ['ids', 'member_count', 'status']);
  assert.ok(!JSON.stringify(out).includes('TEST-RESOLUTION-NOTE'));
  assert.strictEqual(out.member_count, 2);
});

test('a conflict status is a fixed enum, not echoed input', () => {
  const out = wire.projectConflict({ ids: [], status: 'TEST-ARBITRARY-STATUS' });
  assert.strictEqual(out.status, 'UNKNOWN');
});

// ── Envelope ──

test('the envelope carries its extents and an explicit unknown clear height', () => {
  const out = wire.projectEnvelope({
    width: 10,
    depth: 20,
    height: 5,
    clear_height_m: null,
    survey_reference: 'TEST-PRIVATE-DATUM',
  });
  assert.deepStrictEqual(Object.keys(out).sort(), ['clear_height_m', 'depth', 'height', 'width']);
  assert.strictEqual(out.clear_height_m, null);
  assert.ok(!JSON.stringify(out).includes('TEST-PRIVATE-DATUM'));
});

test('an envelope missing an extent is withheld rather than half-served', () => {
  assert.strictEqual(wire.projectEnvelope({ width: 10, depth: 20 }), null);
  assert.strictEqual(wire.projectEnvelope(null), null);
});

// ── Zone boxes ──

test('an anonymous zone box carries its bounds and nothing else', () => {
  const out = wire.projectZoneBox({
    id: 'zone-09',
    label: 'TEST-AREA-LABEL',
    bounds: { x: 1, z: 2, width: 3, depth: 4, note: 'TEST-BOX-NOTE' },
  });
  assert.deepStrictEqual(Object.keys(out).sort(), ['bounds', 'id']);
  assert.deepStrictEqual(out.bounds, { x: 1, z: 2, width: 3, depth: 4 });
  assert.ok(!JSON.stringify(out).includes('TEST-'));
});

// ── Collection behaviour ──

test('projectAll drops unprojectable entries instead of emitting holes', () => {
  const out = wire.projectAll([validSlot(), { position: null }, validSlot({ slot_id: 'slot-0002' })], wire.projectSlot, {});
  assert.strictEqual(out.length, 2);
  assert.ok(out.every((s) => s !== null));
});

test('projectAll tolerates a non-array without throwing', () => {
  assert.deepStrictEqual(wire.projectAll(null, wire.projectSlot, {}), []);
  assert.deepStrictEqual(wire.projectAll(undefined, wire.projectColumn), []);
});

test('a non-object entry never becomes an output object', () => {
  assert.strictEqual(wire.projectSlot('TEST-STRING', {}), null);
  assert.strictEqual(wire.projectColumn(42), null);
  assert.strictEqual(wire.projectFunctionalZone(null), null);
});

test('projection never mutates its input', () => {
  const slot = validSlot({ internal_note: 'TEST-PRIVATE-NOTE' });
  const before = JSON.stringify(slot);
  wire.projectSlot(slot, { 'slot-0001': 'TEST-DEVICE-01' });
  assert.strictEqual(JSON.stringify(slot), before);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
