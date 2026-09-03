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
function validEquipment(extra = {}) {
  return Object.assign(
    {
      id: 'eqp-0001',
      position: { x: 1.5, y: 0, z: -2.25 },
      rotation_deg: 90,
      footprint: { width: 2, depth: 3 },
      footprint_status: 'OBSERVED_CAD',
      confidence: 'high',
      source: 'floor1_dxf',
      geometry_status: 'MEASURED_CAD',
      height_status: 'unknown',
      zone_id: 'zone-04',
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

// -- CAD-derived walls and openings ---------------------------------------

function validWall(extra = {}) {
  return Object.assign(
    {
      id: 'WAL-F1-0001',
      x1: -10.5, z1: 4.25, x2: 12.75, z2: 4.25,
      thickness: 0.1,
      source: 'floor1_dxf',
      geometry_status: 'MEASURED_CAD',
    },
    extra
  );
}

function validOpening(extra = {}) {
  return Object.assign(
    {
      id: 'OPN-F1-0001',
      position: { x: 3.5, z: -8.25 },
      kind: 'door',
      source: 'floor1_dxf',
      geometry_status: 'OBSERVED_CAD',
    },
    extra
  );
}

test('a wall projection emits exactly the documented key set', () => {
  const out = wire.projectWall(validWall());
  assert.deepStrictEqual(Object.keys(out).sort(), [
    'geometry_status', 'id', 'source', 'thickness', 'x1', 'x2', 'z1', 'z2',
  ]);
});

test('the CAD layer name a wall came from is never carried', () => {
  const out = wire.projectWall(validWall({ layer: 'TEST-PRIVATE-PROCESS-LAYER' }));
  assert.ok(!('layer' in out));
  assert.ok(!JSON.stringify(out).includes('TEST-PRIVATE-PROCESS-LAYER'));
});

test('a wall with one unusable endpoint is dropped, not shortened', () => {
  assert.strictEqual(wire.projectWall(validWall({ x2: NaN })), null);
  assert.strictEqual(wire.projectWall(validWall({ z1: Infinity })), null);
  assert.strictEqual(wire.projectWall(validWall({ x1: '0' })), null);
});

test('a wall with no measured thickness is dropped, not defaulted', () => {
  assert.strictEqual(wire.projectWall(validWall({ thickness: null })), null);
  assert.strictEqual(wire.projectWall(validWall({ thickness: 0 })), null);
  assert.strictEqual(wire.projectWall(validWall({ thickness: -0.1 })), null);
});

test('an unrecognised geometry_status becomes null rather than riding through', () => {
  assert.strictEqual(wire.projectWall(validWall({ geometry_status: 'CONFIRMED' })).geometry_status, null);
  assert.strictEqual(wire.projectWall(validWall({ geometry_status: 'TEST-NOTE' })).geometry_status, null);
  assert.strictEqual(wire.projectWall(validWall()).geometry_status, 'MEASURED_CAD');
});

test('an opening projection emits exactly the documented key set', () => {
  const out = wire.projectOpening(validOpening());
  assert.deepStrictEqual(Object.keys(out).sort(), [
    'geometry_status', 'id', 'kind', 'position', 'source',
  ]);
});

test('the CAD block name behind an opening is never carried', () => {
  const out = wire.projectOpening(validOpening({ block: 'TEST-VENDOR-BLOCK-NAME' }));
  assert.ok(!('block' in out));
  assert.ok(!JSON.stringify(out).includes('TEST-VENDOR-BLOCK-NAME'));
});

test('an opening of an unknown kind is dropped entirely', () => {
  assert.strictEqual(wire.projectOpening(validOpening({ kind: 'hatch' })), null);
  assert.strictEqual(wire.projectOpening(validOpening({ kind: null })), null);
  assert.strictEqual(wire.projectOpening(validOpening({ position: null })), null);
});

test('walls and openings never mutate their input', () => {
  const wall = validWall({ layer: 'TEST-PRIVATE-PROCESS-LAYER' });
  const opening = validOpening({ block: 'TEST-VENDOR-BLOCK-NAME' });
  const wb = JSON.stringify(wall);
  const ob = JSON.stringify(opening);
  wire.projectWall(wall);
  wire.projectOpening(opening);
  assert.strictEqual(JSON.stringify(wall), wb);
  assert.strictEqual(JSON.stringify(opening), ob);
});

console.log('\nFactory Twin Wire Projection Tests\n');

// ── The core guarantee: an unknown field never reaches the wire ──

test('an added private field on an equipment record is not carried', () => {
  const out = wire.projectEquipment(validEquipment({
    internal_note: 'TEST-PRIVATE-NOTE',
    // The two fields the private document really does carry and that must
    // never travel: a CAD layer and a block name in this drawing identify a
    // process and a vendor.
    cad_layer: 'TEST-PRIVATE-PROCESS-LAYER',
    cad_block: 'TEST-VENDOR-BLOCK-NAME',
  }), {});
  assert.ok(!('internal_note' in out), 'internal_note was carried through');
  assert.ok(!('cad_layer' in out), 'the CAD layer name was carried through');
  assert.ok(!('cad_block' in out), 'the CAD block name was carried through');
  const json = JSON.stringify(out);
  assert.ok(!json.includes('TEST-PRIVATE-NOTE'));
  assert.ok(!json.includes('TEST-PRIVATE-PROCESS-LAYER'));
  assert.ok(!json.includes('TEST-VENDOR-BLOCK-NAME'));
});

test('an added private field on a column is not carried', () => {
  const out = wire.projectColumn(validColumn({ source_file: 'TEST-PRIVATE-PATH' }));
  assert.ok(!('source_file' in out));
  assert.ok(!JSON.stringify(out).includes('TEST-PRIVATE-PATH'));
});

test('an equipment projection emits exactly the documented key set', () => {
  const out = wire.projectEquipment(validEquipment(), {});
  assert.deepStrictEqual(Object.keys(out).sort(), [
    'confidence',
    'footprint',
    'footprint_status',
    'geometry_status',
    'height_status',
    'id',
    'ims_device_id',
    'position',
    'rotation_deg',
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

test('a valid equipment record keeps every value it should', () => {
  const out = wire.projectEquipment(validEquipment(), {});
  assert.deepStrictEqual(out.position, { x: 1.5, y: 0, z: -2.25 });
  assert.deepStrictEqual(out.footprint, { width: 2, depth: 3 });
  assert.strictEqual(out.footprint_status, 'OBSERVED_CAD');
  assert.strictEqual(out.rotation_deg, 90);
  assert.strictEqual(out.geometry_status, 'MEASURED_CAD');
  assert.strictEqual(out.confidence, 'high');
  assert.strictEqual(out.height_status, 'unknown');
  assert.strictEqual(out.zone_id, 'zone-04');
});

test('rotation is normalised into [0,360) and never rounded away', () => {
  // Orientation is a measurement here. Normalising keeps a reconciliation
  // comparing like with like; rounding would hide the residual it exists to
  // report.
  assert.strictEqual(wire.projectEquipment(validEquipment({ rotation_deg: -90 }), {}).rotation_deg, 270);
  assert.strictEqual(wire.projectEquipment(validEquipment({ rotation_deg: 450 }), {}).rotation_deg, 90);
  assert.strictEqual(wire.projectEquipment(validEquipment({ rotation_deg: 12.345 }), {}).rotation_deg, 12.345);
  assert.strictEqual(wire.projectEquipment(validEquipment({ rotation_deg: NaN }), {}).rotation_deg, null);
  assert.strictEqual(wire.projectEquipment(validEquipment({ rotation_deg: '90' }), {}).rotation_deg, null);
});

test('an UNRESOLVED extent travels as absent, never as a default box', () => {
  // The single most important rule on this projector. The old slot projector
  // substituted a 1 m pad for a missing dimension, which put an invented
  // extent on the wire wearing the same shape as a measured one.
  const out = wire.projectEquipment(validEquipment({
    footprint_status: 'UNRESOLVED', footprint: null,
  }), {});
  assert.strictEqual(out.footprint, null);
  assert.strictEqual(out.footprint_status, 'UNRESOLVED');
});

test('a half-stated extent is refused, and the record says so', () => {
  // A width with no depth is not a narrower machine, it is an unmeasured one.
  // The status is corrected to UNRESOLVED rather than left claiming OBSERVED.
  for (const fp of [{ width: 2 }, { depth: 3 }, { width: 2, depth: NaN }, {}]) {
    const out = wire.projectEquipment(validEquipment({ footprint: fp }), {});
    assert.strictEqual(out.footprint, null, `${JSON.stringify(fp)} produced a footprint`);
    assert.strictEqual(out.footprint_status, 'UNRESOLVED');
  }
});

test('an invented footprint_status is dropped rather than echoed', () => {
  const out = wire.projectEquipment(validEquipment({ footprint_status: 'TEST-INVENTED' }), {});
  assert.strictEqual(out.footprint_status, null);
  assert.ok(!JSON.stringify(out).includes('TEST-INVENTED'));
});

// ── Free text cannot pass a token guard ──

test('free text in a token field is dropped, not sanitised and echoed', () => {
  const out = wire.projectEquipment(validEquipment({ source: 'TEST-NOTE with spaces and /a/path' }), {});
  assert.strictEqual(out.source, null);
});

test('a filesystem path is not a token', () => {
  assert.strictEqual(wire.token('C:/TEST/private/floor.json'), null);
  assert.strictEqual(wire.token('/TEST/private/floor.json'), null);
  assert.strictEqual(wire.token('..\\TEST\\secret'), null);
});

test('an unrecognised confidence tier is dropped rather than echoed', () => {
  const out = wire.projectEquipment(validEquipment({ confidence: 'TEST-INVENTED-TIER' }), {});
  assert.strictEqual(out.confidence, null);
});

test('an unrecognised geometry or height status is dropped', () => {
  const out = wire.projectEquipment(validEquipment({ geometry_status: 'TEST-BOGUS', height_status: 'TEST-BOGUS' }), {});
  assert.strictEqual(out.geometry_status, null);
  assert.strictEqual(out.height_status, null);
});

test('a half-resolved grid reference reports none rather than half', () => {
  const out = wire.projectColumn(validColumn({ grid_ref: { x: 'C', z: 'TEST BAD REF' } }));
  assert.strictEqual(out.grid_ref, null);
});

// ── Numbers ──

test('NaN and Infinity are rejected as coordinates', () => {
  assert.strictEqual(wire.projectEquipment(validEquipment({ position: { x: NaN, y: 0, z: 1 } }), {}), null);
  assert.strictEqual(wire.projectEquipment(validEquipment({ position: { x: 1, y: 0, z: Infinity } }), {}), null);
});

test('a numeric string is not a number', () => {
  assert.strictEqual(wire.num('1.5'), null);
  assert.strictEqual(wire.projectEquipment(validEquipment({ position: { x: '1', y: '0', z: '2' } }), {}), null);
});

test('a slot with no usable position is withheld, never placed at a fallback', () => {
  assert.strictEqual(wire.projectEquipment(validEquipment({ position: null }), {}), null);
  assert.strictEqual(wire.projectEquipment(validEquipment({ position: {} }), {}), null);
});

test('an absent footprint is absent on the wire, not a 1 m pad', () => {
  // The behaviour this replaces: the slot projector substituted width 1,
  // depth 1, height 1 whenever a dimension was missing. On a floor plan read
  // from CAD, a 1 m box drawn where nothing was measured is indistinguishable
  // from a machine that really is 1 m across.
  const out = wire.projectEquipment(validEquipment({ footprint: undefined }), {});
  assert.strictEqual(out.footprint, null);
  assert.strictEqual(out.footprint_status, 'UNRESOLVED');
});

test('the old size+height shape is no longer accepted as a footprint', () => {
  // The slot projector accepted two different private shapes and normalised
  // them. Equipment accepts one, `footprint`, and a document still written in
  // the old shape resolves to UNRESOLVED rather than being quietly adopted --
  // a stale record must not look like a fresh measurement.
  const out = wire.projectEquipment(
    validEquipment({ footprint: undefined, size: { width: 4, depth: 5 }, height: 6 }),
    {}
  );
  assert.strictEqual(out.footprint, null);
  assert.strictEqual(out.footprint_status, 'UNRESOLVED');
});

// ── Mapping lookup: the fabricated-mapping vector ──

test('a slot id of __proto__ cannot conjure a mapping', () => {
  const mapping = JSON.parse('{"__proto__": "TEST-FAKE-DEVICE"}');
  const out = wire.projectEquipment(validEquipment({ id: '__proto__' }), mapping);
  assert.strictEqual(out.ims_device_id, null);
  assert.strictEqual(out.status, 'UNMAPPED');
});

test('a slot id of constructor cannot conjure a mapping', () => {
  const out = wire.projectEquipment(validEquipment({ id: 'constructor' }), {});
  assert.strictEqual(out.ims_device_id, null);
  assert.strictEqual(out.status, 'UNMAPPED');
});

test('inherited property names never answer a mapping lookup', () => {
  for (const name of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
    const out = wire.projectEquipment(validEquipment({ id: name }), {});
    assert.strictEqual(out.status, 'UNMAPPED', `${name} produced a mapping`);
  }
});

test('a mapping value that is not a token does not map', () => {
  const out = wire.projectEquipment(validEquipment(), { 'eqp-0001': { device_id: 'TEST-OBJ' } });
  assert.strictEqual(out.ims_device_id, null);
  assert.strictEqual(out.status, 'UNMAPPED');
});

test('an explicit null mapping entry stays unmapped', () => {
  const out = wire.projectEquipment(validEquipment(), { 'eqp-0001': null });
  assert.strictEqual(out.ims_device_id, null);
  assert.strictEqual(out.status, 'UNMAPPED');
});

test('a real authoritative mapping entry does map', () => {
  const out = wire.projectEquipment(validEquipment(), { 'eqp-0001': 'TEST-DEVICE-01' });
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
  assert.deepStrictEqual(Object.keys(out).sort(), ['confidence', 'geometry', 'id', 'name', 'status']);
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

// ── Zone display names ──
//
// The one prose-shaped field on the wire. Its guard admits the drawing's
// all-caps area labels and rejects everything shaped like prose or a path.

test('an all-caps area label is carried', () => {
  for (const name of ['DRILLING', 'DRILLING HOLD', 'AUTO LAY UP', 'DE-OXIDE', 'XRY', 'PP']) {
    assert.strictEqual(wire.zoneName(name), name, name);
  }
});

test('a lowercase note cannot pass as a name', () => {
  // Every label on the drawing is capitalised; every note, path and sentence
  // that must not travel contains lowercase. The guard separates them by shape.
  assert.strictEqual(wire.zoneName('Extracted from the cyan layer, see notes'), null);
  assert.strictEqual(wire.zoneName('drilling'), null);
  assert.strictEqual(wire.zoneName('TEST-Private-Note'), null);
});

test('a filesystem path cannot pass as a name', () => {
  assert.strictEqual(wire.zoneName('C:/TEST/PRIVATE/PLAN.DWG'), null);
  assert.strictEqual(wire.zoneName('/TEST/PRIVATE'), null);
  assert.strictEqual(wire.zoneName('..\TEST'), null);
});

test('a name longer than a label is withheld, not truncated', () => {
  const long = 'A'.repeat(33);
  assert.strictEqual(wire.zoneName(long), null);
  assert.strictEqual(wire.zoneName('A'.repeat(32)), 'A'.repeat(32));
});

test('surrounding whitespace is trimmed but nothing else is rewritten', () => {
  assert.strictEqual(wire.zoneName('  DRILLING HOLD  '), 'DRILLING HOLD');
  // Punctuation is not stripped to force a match: the name is simply refused.
  assert.strictEqual(wire.zoneName('DRILLING; HOLD'), null);
  assert.strictEqual(wire.zoneName('DRILLING/HOLD'), null);
});

test('a non-string name is refused rather than coerced', () => {
  for (const bad of [null, undefined, 42, {}, [], true]) {
    assert.strictEqual(wire.zoneName(bad), null);
  }
});

test('a zone carries its name when the record has one', () => {
  const out = wire.projectFunctionalZone({
    id: 'zone-04',
    zone_name: 'TEST AREA',
    confidence: 'HIGH',
    geometry: { vertices: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] },
  });
  assert.strictEqual(out.name, 'TEST AREA');
  assert.deepStrictEqual(Object.keys(out).sort(), ['confidence', 'geometry', 'id', 'name', 'status']);
});

test('a zone with no name reports null rather than borrowing its id', () => {
  // An unnamed area must not silently display its anonymous id as if that were
  // the drawing's label.
  const out = wire.projectFunctionalZone({
    id: 'zone-05',
    confidence: 'HIGH',
    geometry: { vertices: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] },
  });
  assert.strictEqual(out.name, null);
});

test('an unusable name does not withhold the zone itself', () => {
  // The boundary is measured evidence; the label is not. A bad label costs the
  // label, never the geometry.
  const out = wire.projectFunctionalZone({
    id: 'zone-06',
    zone_name: 'TEST-Private-Note about this area',
    confidence: 'MEDIUM',
    geometry: { vertices: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] },
  });
  assert.strictEqual(out.name, null);
  assert.strictEqual(out.geometry.vertices.length, 3);
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

// ── Building footprint ──

test('the footprint carries vertices and tier, never its area or provenance', () => {
  const out = wire.projectFootprintPolygon({
    vertices: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }],
    area_m2: 1234.5,
    winding: 'CW',
    vertex_count: 3,
    confidence: 'HIGH',
    geometry_status: 'observed',
    source: 'TEST-SOURCE-PATH',
    evidence: 'TEST-PRIVATE-NOTE describing how the perimeter was measured',
    unresolved: 'TEST-PRIVATE-NOTE',
  });
  assert.deepStrictEqual(Object.keys(out).sort(), ['confidence', 'geometry_status', 'vertices']);
  const s = JSON.stringify(out);
  assert.ok(!s.includes('TEST-'));
  assert.ok(!s.includes('1234'));
});

test('a footprint vertex list is rebuilt to x/z only', () => {
  const out = wire.projectFootprintPolygon({
    vertices: [
      { x: 0, z: 0, on_gridline: true, note: 'TEST-VERTEX-NOTE' },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
    ],
    confidence: 'HIGH',
  });
  assert.deepStrictEqual(out.vertices[0], { x: 0, z: 0 });
  assert.ok(!JSON.stringify(out).includes('TEST-'));
});

test('one unusable footprint vertex withholds the whole outline', () => {
  // A partial building outline is a different building. Half of it is worse
  // than none of it, because it still looks like a boundary.
  assert.strictEqual(
    wire.projectFootprintPolygon({ vertices: [{ x: 0, z: 0 }, { x: 1, z: NaN }, { x: 1, z: 1 }] }),
    null
  );
});

test('a footprint below three vertices, or absent, is withheld', () => {
  assert.strictEqual(wire.projectFootprintPolygon({ vertices: [{ x: 0, z: 0 }, { x: 1, z: 1 }] }), null);
  assert.strictEqual(wire.projectFootprintPolygon(null), null);
  assert.strictEqual(wire.projectFootprintPolygon('TEST-STRING'), null);
});

// ── Structural grid ──

test('the grid carries line positions and labels, never span dimensions', () => {
  const out = wire.projectGrid({
    x_lines: [0, 6, 12],
    x_labels: ['1', '2', '3'],
    z_lines: [0, 6],
    z_labels: ['A', 'B'],
    x_spans_mm: [6000, 6000],
    z_spans_mm: [6000],
    confidence: 'HIGH',
    source: 'TEST-SOURCE-PATH',
    evidence: 'TEST-PRIVATE-NOTE',
  });
  assert.deepStrictEqual(Object.keys(out).sort(), ['confidence', 'x', 'z']);
  assert.deepStrictEqual(out.x[1], { at: 6, label: '2' });
  const s = JSON.stringify(out);
  assert.ok(!s.includes('TEST-'));
  assert.ok(!s.includes('6000'));
});

test('a grid label that is not a safe token is dropped, not echoed', () => {
  const out = wire.projectGrid({
    x_lines: [0, 6],
    x_labels: ['1', 'TEST LABEL with spaces'],
    z_lines: [0, 6],
    z_labels: ['A', 'B'],
  });
  assert.strictEqual(out.x[0].label, '1');
  assert.strictEqual(out.x[1].label, null);
});

test('an unusable gridline is dropped while the rest of the grid survives', () => {
  // Unlike the footprint, a partial grid is still a true statement about the
  // lines that were read -- it does not imply a boundary that was not traced.
  const out = wire.projectGrid({
    x_lines: [0, 'TEST-NOT-A-NUMBER', 12],
    x_labels: ['1', '2', '3'],
    z_lines: [0, 6],
    z_labels: ['A', 'B'],
  });
  assert.strictEqual(out.x.length, 2);
  assert.deepStrictEqual(out.x.map((l) => l.at), [0, 12]);
});

test('a grid with too few usable lines on both axes is withheld', () => {
  assert.strictEqual(wire.projectGrid({ x_lines: [0], z_lines: [] }), null);
  assert.strictEqual(wire.projectGrid(null), null);
  assert.strictEqual(wire.projectGrid({}), null);
});

test('grid label indices stay aligned with their line positions', () => {
  const out = wire.projectGrid({
    x_lines: [0, 6, 12],
    x_labels: ['1'],
    z_lines: [0, 6],
    z_labels: ['A', 'B'],
  });
  assert.strictEqual(out.x[0].label, '1');
  assert.strictEqual(out.x[1].label, null);
  assert.strictEqual(out.x[2].label, null);
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
  const out = wire.projectAll([validEquipment(), { position: null }, validEquipment({ id: 'eqp-0002' })], wire.projectEquipment, {});
  assert.strictEqual(out.length, 2);
  assert.ok(out.every((s) => s !== null));
});

test('projectAll tolerates a non-array without throwing', () => {
  assert.deepStrictEqual(wire.projectAll(null, wire.projectEquipment, {}), []);
  assert.deepStrictEqual(wire.projectAll(undefined, wire.projectColumn), []);
});

test('a non-object entry never becomes an output object', () => {
  assert.strictEqual(wire.projectEquipment('TEST-STRING', {}), null);
  assert.strictEqual(wire.projectColumn(42), null);
  assert.strictEqual(wire.projectFunctionalZone(null), null);
});

test('projection never mutates its input', () => {
  const slot = validEquipment({ internal_note: 'TEST-PRIVATE-NOTE' });
  const before = JSON.stringify(slot);
  wire.projectEquipment(slot, { 'eqp-0001': 'TEST-DEVICE-01' });
  assert.strictEqual(JSON.stringify(slot), before);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
