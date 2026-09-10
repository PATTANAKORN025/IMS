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
      footprint_source: 'cad_block_extent',
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

function validWallLine(extra = {}) {
  return Object.assign(
    {
      id: 'WLN-F1-0001',
      x1: -10.5, z1: 4.25, x2: 12.75, z2: 4.25,
      source: 'floor1_dxf',
      geometry_status: 'OBSERVED_CAD',
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

test('a wall-line projection emits exactly the documented key set', () => {
  const out = wire.projectWallLine(validWallLine());
  assert.deepStrictEqual(Object.keys(out).sort(), [
    'geometry_status', 'id', 'source', 'x1', 'x2', 'z1', 'z2',
  ]);
});

test('a wall line carries NO thickness, even when the record has one', () => {
  // The shape is the guarantee. A consumer cannot extrude an unpaired face by
  // accident if there is nothing on the wire to extrude it by, and a private
  // record that gains a thickness later must not start asserting one here.
  const out = wire.projectWallLine(validWallLine({ thickness: 0.25 }));
  assert.ok(!('thickness' in out));
  assert.ok(!JSON.stringify(out).includes('0.25'));
});

test('the CAD layer name a wall line came from is never carried', () => {
  const out = wire.projectWallLine(validWallLine({ layer: 'TEST-PRIVATE-PROCESS-LAYER' }));
  assert.ok(!('layer' in out));
  assert.ok(!JSON.stringify(out).includes('TEST-PRIVATE-PROCESS-LAYER'));
});

test('a wall line with one unusable endpoint is dropped, not shortened', () => {
  assert.strictEqual(wire.projectWallLine(validWallLine({ x2: NaN })), null);
  assert.strictEqual(wire.projectWallLine(validWallLine({ z1: Infinity })), null);
  assert.strictEqual(wire.projectWallLine(validWallLine({ x1: '0' })), null);
  assert.strictEqual(wire.projectWallLine(null), null);
});

test('a wall line cannot claim MEASURED_CAD by carrying an unknown status', () => {
  assert.strictEqual(
    wire.projectWallLine(validWallLine({ geometry_status: 'CONFIRMED' })).geometry_status, null);
  assert.strictEqual(
    wire.projectWallLine(validWallLine()).geometry_status, 'OBSERVED_CAD');
});

test('a wall line never mutates its input', () => {
  const line = validWallLine({ layer: 'TEST-PRIVATE-PROCESS-LAYER' });
  const before = JSON.stringify(line);
  wire.projectWallLine(line);
  assert.strictEqual(JSON.stringify(line), before);
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
    'alarm_eligible',
    'confidence',
    'display_area_error',
    'display_representation',
    'display_shape',
    'display_source',
    'drill_down_eligible',
    'duplicate_of',
    'evidence_confidence',
    'evidence_source',
    'evidence_source_record',
    'evidence_tier',
    'evidence_verified_at',
    'footprint',
    'footprint_polygon',
    'footprint_shape',
    'footprint_source',
    'footprint_status',
    'geometry_status',
    'height_status',
    'id',
    'identity_status',
    'ims_device_id',
    'live_status_eligible',
    'mapping_status',
    'mirrored',
    'operational_axis_offset_deg',
    'operational_excludes_enclosure',
    'operational_footprint',
    'orientation_geometry_mismatch',
    'overlaps_neighbour',
    'position',
    'rotation_deg',
    'source',
    'status',
    'zone_id',
    'zone_status',
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
  assert.strictEqual(out.footprint_source, 'cad_block_extent');
  assert.strictEqual(out.rotation_deg, 90);
  assert.strictEqual(out.geometry_status, 'MEASURED_CAD');
  assert.strictEqual(out.confidence, 'high');
  assert.strictEqual(out.height_status, 'unknown');
  assert.strictEqual(out.zone_id, 'zone-04');
});

test('a measured outline is served vertex by vertex, or not at all', () => {
  const poly = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 0, z: 1 }];
  const ok = wire.projectEquipment(validEquipment({
    footprint_shape: 'polygon', footprint_polygon: poly,
  }), {});
  assert.deepStrictEqual(ok.footprint_polygon, poly);
  assert.strictEqual(ok.footprint_shape, 'polygon');

  // one bad vertex drops the whole outline rather than closing a partial one
  const bad = wire.projectEquipment(validEquipment({
    footprint_shape: 'polygon',
    footprint_polygon: [{ x: 0, z: 0 }, { x: 2, z: NaN }, { x: 2, z: 1 }, { x: 0, z: 1 }],
  }), {});
  assert.strictEqual(bad.footprint_polygon, null);

  // and an outline without an extent beside it is not an extent claim
  const noExtent = wire.projectEquipment(validEquipment({
    footprint: null, footprint_status: 'UNRESOLVED',
    footprint_shape: 'polygon', footprint_polygon: poly,
  }), {});
  assert.strictEqual(noExtent.footprint_polygon, null);
  assert.strictEqual(noExtent.footprint_shape, null);
});

test('the display record is a size and a cost, never a position', () => {
  const out = wire.projectEquipment(validEquipment({
    footprint_shape: 'irregular',
    footprint_polygon: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }],
    display_shape: 'OPERATIONAL_RECTANGLE',
    display_source: 'filtered_physical_footprint',
    display_area_error: 0.143,
    operational_footprint: {
      width: 1.9, depth: 0.95, offset_x: 0.021, offset_z: -0.017,
    },
    operational_axis_offset_deg: -2.145,
  }), {});
  assert.strictEqual(out.display_shape, 'OPERATIONAL_RECTANGLE');
  assert.strictEqual(out.display_source, 'filtered_physical_footprint');
  assert.strictEqual(out.display_area_error, 0.143);
  assert.deepStrictEqual(out.operational_footprint, {
    width: 1.9, depth: 0.95, offset_x: 0.021, offset_z: -0.017,
  });
  assert.strictEqual(out.operational_axis_offset_deg, -2.145);
  // A SIZE, an ANGLE OFFSET and a CENTRE DELTA -- all three relative, all
  // three useless without the record's own position and rotation, which the
  // display layer cannot touch.
  assert.ok(!('display_polygon' in out));
  assert.ok(!('display_vertices' in out));
  // and the measurement is still there: display never replaces it
  assert.strictEqual(out.footprint_polygon.length, 3);
  assert.deepStrictEqual(out.footprint, validEquipment().footprint);
});

test('a display polygon smuggled into the document never reaches the wire', () => {
  const out = wire.projectEquipment(validEquipment({
    display_shape: 'OPERATIONAL_RECTANGLE',
    display_source: 'filtered_physical_footprint',
    display_polygon: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 0, z: 1 }],
    display_vertices: 4,
  }), {});
  assert.ok(!('display_polygon' in out));
  assert.ok(!('display_vertices' in out));
});

test('an operational size that is not two positive numbers is dropped whole', () => {
  const bad = [
    { width: 2 }, { width: 2, depth: 0 }, { width: -2, depth: 1 },
    { width: '2', depth: 1 }, { width: Infinity, depth: 1 }, 'TEST', 7, [],
    // a size with no measured centre is not servable either: the renderer
    // would fall back to the physical centre and cut geometry away
    { width: 2, depth: 1 }, { width: 2, depth: 1, offset_x: 0.1 },
    { width: 2, depth: 1, offset_x: 0.1, offset_z: NaN },
    { width: 2, depth: 1, offset_x: '0', offset_z: 0 },
    // and a delta longer than the machine is a move, not a measurement
    { width: 2, depth: 1, offset_x: 4, offset_z: 0 },
    { width: 2, depth: 1, offset_x: 0, offset_z: -4 },
  ];
  for (const value of bad) {
    const out = wire.projectEquipment(validEquipment({
      display_shape: 'OPERATIONAL_RECTANGLE', operational_footprint: value,
    }), {});
    assert.strictEqual(out.operational_footprint, null,
      `${JSON.stringify(value)} must not be served as a size`);
  }
});

test('the operational centre delta reaches the wire and never folds into position', () => {
  const src = validEquipment({
    display_shape: 'OPERATIONAL_RECTANGLE',
    display_source: 'filtered_physical_footprint',
    display_area_error: 0.1,
    operational_footprint: {
      width: 1.9, depth: 0.95, offset_x: -0.045, offset_z: 0.031,
    },
    operational_axis_offset_deg: 3.855,
  });
  const before = { x: src.position.x, z: src.position.z };
  const out = wire.projectEquipment(src, {});
  // The delta is served as a delta. Adding it to the position on the wire
  // would publish a machine standing where the CAD does not put it, and the
  // record would no longer be able to say what moved.
  assert.strictEqual(out.position.x, before.x);
  assert.strictEqual(out.position.z, before.z);
  assert.strictEqual(out.operational_footprint.offset_x, -0.045);
  assert.strictEqual(out.operational_footprint.offset_z, 0.031);
});

test('an invented display class or source is dropped, not echoed', () => {
  const invented = wire.projectEquipment(validEquipment({
    display_shape: 'TEST-INVENTED', display_source: 'TEST-INVENTED',
  }), {});
  assert.strictEqual(invented.display_shape, null);
  assert.strictEqual(invented.display_source, null);
  // the vocabularies this replaced are gone with the geometry they described
  for (const gone of ['ORIENTED_RECTANGLE', 'CHAMFERED_RECTANGLE', 'SIMPLIFIED_POLYGON',
    'MEASURED_RECTANGLE']) {
    assert.strictEqual(
      wire.projectEquipment(validEquipment({ display_shape: gone }), {}).display_shape, null,
      `${gone} must no longer be a servable display class`,
    );
  }
});

test('a TRUE_POLYGON record with a servable outline is drawn from it', () => {
  const out = wire.projectEquipment(validEquipment({
    footprint_shape: 'irregular',
    footprint_polygon: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }],
    display_shape: 'OPERATIONAL_RECTANGLE',
    display_representation: 'TRUE_POLYGON',
  }), {});
  assert.strictEqual(out.display_representation, 'TRUE_POLYGON');
  assert.strictEqual(out.footprint_polygon.length, 3);
});

test('a TRUE_POLYGON claim with no servable outline beside it is not carried', () => {
  const out = wire.projectEquipment(validEquipment({
    // No footprint_polygon at all: the private record's own say-so is not
    // enough, the projected outline decides.
    display_shape: 'OPERATIONAL_RECTANGLE',
    display_representation: 'TRUE_POLYGON',
  }), {});
  assert.strictEqual(out.display_representation, null);
});

test('an invented display_representation is dropped, not echoed', () => {
  const out = wire.projectEquipment(validEquipment({
    footprint_shape: 'irregular',
    footprint_polygon: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }],
    display_representation: 'TEST-INVENTED',
  }), {});
  assert.strictEqual(out.display_representation, null);
});

test('duplicate_of carries the id of the proven-duplicate primary, nothing else', () => {
  const out = wire.projectEquipment(validEquipment({ duplicate_of: 'EQP-F1-0003' }), {});
  assert.strictEqual(out.duplicate_of, 'EQP-F1-0003');
  assert.strictEqual(wire.projectEquipment(validEquipment({ duplicate_of: null }), {}).duplicate_of, null);
  assert.strictEqual(
    wire.projectEquipment(validEquipment({ duplicate_of: 'not a safe token!' }), {}).duplicate_of, null);
});

test('evidence_tier is derived from the private note, never carries the note itself', () => {
  const recovered = wire.projectEquipment(validEquipment({
    footprint_note: 'RECOVERED: position borrowed from floor1-machine-nodes.json',
  }), {});
  assert.strictEqual(recovered.evidence_tier, 'RECOVERED');
  assert.ok(!('footprint_note' in recovered));
  assert.ok(!JSON.stringify(recovered).includes('borrowed'));
  assert.strictEqual(wire.projectEquipment(validEquipment(), {}).evidence_tier, 'PRIMARY');
  assert.strictEqual(
    wire.projectEquipment(validEquipment({ footprint_note: 'some other note' }), {}).evidence_tier,
    'PRIMARY');
});

test('a record with no served extent cannot claim TRUE_POLYGON either', () => {
  const out = wire.projectEquipment(validEquipment({
    footprint: null, footprint_status: 'UNRESOLVED',
    footprint_polygon: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }],
    display_representation: 'TRUE_POLYGON',
  }), {});
  assert.strictEqual(out.display_representation, null);
});

test('a record with no served extent cannot be drawn as a rectangle', () => {
  const out = wire.projectEquipment(validEquipment({
    footprint: null, footprint_status: 'UNRESOLVED',
    display_shape: 'OPERATIONAL_RECTANGLE',
    display_source: 'filtered_physical_footprint',
    display_area_error: 0.2,
    operational_footprint: { width: 2, depth: 1, offset_x: 0, offset_z: 0 },
    operational_axis_offset_deg: 3,
  }), {});
  // Corrected DOWN, not echoed: a marker may not acquire a size by being
  // labelled one in the private document.
  assert.strictEqual(out.display_shape, 'UNRESOLVED');
  assert.strictEqual(out.display_source, null);
  assert.strictEqual(out.display_area_error, null);
  assert.strictEqual(out.operational_footprint, null);
  assert.strictEqual(out.operational_axis_offset_deg, null);
});

test('the orientation and enclosure flags are booleans, never echoed prose', () => {
  const out = wire.projectEquipment(validEquipment({
    orientation_geometry_mismatch: 'TEST-YES', operational_excludes_enclosure: 1,
  }), {});
  assert.strictEqual(out.orientation_geometry_mismatch, false);
  assert.strictEqual(out.operational_excludes_enclosure, false);
  const set = wire.projectEquipment(validEquipment({
    orientation_geometry_mismatch: true, operational_excludes_enclosure: true,
  }), {});
  assert.strictEqual(set.orientation_geometry_mismatch, true);
  assert.strictEqual(set.operational_excludes_enclosure, true);
});

test('an invented shape or zone status is dropped, not echoed', () => {
  const out = wire.projectEquipment(validEquipment({
    footprint_shape: 'TEST-INVENTED', zone_status: 'TEST-INVENTED',
  }), {});
  assert.strictEqual(out.footprint_shape, null);
  assert.strictEqual(out.zone_status, null);
});

test('mapping_status follows the server mapping, never the record', () => {
  // A private document asserting it is mapped must not light a machine up.
  const lying = wire.projectEquipment(validEquipment({
    mapping_status: 'MAPPED_TO_IMS', ims_machine_id: 'TEST-NOT-A-DEVICE',
  }), {});
  assert.strictEqual(lying.mapping_status, 'UNMAPPED_TO_IMS');
  assert.strictEqual(lying.ims_device_id, null);
  assert.strictEqual(lying.status, 'UNMAPPED');
});

test('the overlap flag is a boolean and never a truthy value from the document', () => {
  assert.strictEqual(
    wire.projectEquipment(validEquipment({ footprint_overlaps_neighbour: true }), {}).overlaps_neighbour,
    true,
  );
  assert.strictEqual(
    wire.projectEquipment(validEquipment({ footprint_overlaps_neighbour: 'yes' }), {}).overlaps_neighbour,
    false,
  );
});

test('mirrored is a boolean and never a truthy value from the document', () => {
  assert.strictEqual(wire.projectEquipment(validEquipment({ mirrored: true }), {}).mirrored, true);
  assert.strictEqual(wire.projectEquipment(validEquipment({ mirrored: 'yes' }), {}).mirrored, false);
  assert.strictEqual(wire.projectEquipment(validEquipment(), {}).mirrored, false);
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

test('an APPROXIMATION carries its extent and declares where it came from', () => {
  // The middle tier: the block's own extent clipped to neighbour spacing. Both
  // bounds are CAD-measured, so an extent IS served -- but it must say it is a
  // bound, or it reads exactly like a measurement.
  const out = wire.projectEquipment(validEquipment({
    footprint_status: 'APPROXIMATION', footprint_source: 'CAD_CORRELATED',
  }), {});
  assert.deepStrictEqual(out.footprint, { width: 2, depth: 3 });
  assert.strictEqual(out.footprint_status, 'APPROXIMATION');
  assert.strictEqual(out.footprint_source, 'CAD_CORRELATED');
});

test('an invented footprint_source is dropped, extent and all', () => {
  const out = wire.projectEquipment(validEquipment({
    footprint_source: 'TEST-INVENTED-SOURCE',
  }), {});
  assert.strictEqual(out.footprint_source, null);
  assert.ok(!JSON.stringify(out).includes('TEST-INVENTED-SOURCE'));
});

test('an UNRESOLVED record carries no source either', () => {
  const out = wire.projectEquipment(validEquipment({
    footprint_status: 'UNRESOLVED', footprint: null,
  }), {});
  assert.strictEqual(out.footprint, null);
  assert.strictEqual(out.footprint_source, null);
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

test('a mapping value with no valid lifecycle status does not map', () => {
  // Not a validateMappings()-shaped record at all -- an object with the
  // wrong fields entirely, e.g. a stale pre-FT-14 shape. resolveMapping()
  // refuses to guess a status; no lifecycle, no mapping.
  const out = wire.projectEquipment(validEquipment(), { 'eqp-0001': { device_id: 'TEST-OBJ' } });
  assert.strictEqual(out.ims_device_id, null);
  assert.strictEqual(out.status, 'UNMAPPED');
  assert.strictEqual(out.identity_status, 'unresolved');
});

test('an explicit null mapping entry stays unmapped', () => {
  const out = wire.projectEquipment(validEquipment(), { 'eqp-0001': null });
  assert.strictEqual(out.ims_device_id, null);
  assert.strictEqual(out.status, 'UNMAPPED');
});

test('a real authoritative (confirmed) mapping entry does map', () => {
  const confirmed = {
    asset_id: 'eqp-0001', mapping_status: 'confirmed', ims_device_id: 'TEST-DEVICE-01',
    mes_machine_id: null, confidence: 'high', source: 'test-harness',
    source_record: 'unit-test-1', verified_at: '2026-01-01T00:00:00Z',
  };
  const out = wire.projectEquipment(validEquipment(), { 'eqp-0001': confirmed });
  assert.strictEqual(out.ims_device_id, 'TEST-DEVICE-01');
  assert.strictEqual(out.status, 'IMS_CONNECTED');
  assert.strictEqual(out.identity_status, 'confirmed');
  assert.strictEqual(out.evidence_source, 'test-harness');
  assert.strictEqual(out.evidence_source_record, 'unit-test-1');
  assert.strictEqual(out.evidence_verified_at, '2026-01-01T00:00:00Z');
  assert.strictEqual(out.evidence_confidence, 'high');
  assert.strictEqual(out.live_status_eligible, true);
  assert.strictEqual(out.alarm_eligible, true);
  assert.strictEqual(out.drill_down_eligible, true);
});

test('a conflicting mapping never becomes usable, but stays visible in the audit trail', () => {
  const conflicting = {
    asset_id: 'eqp-0001', mapping_status: 'conflicting', ims_device_id: 'TEST-DEVICE-01',
    mes_machine_id: null, confidence: 'medium', source: 'mes-export',
    source_record: 'row-42', verified_at: '2026-01-01T00:00:00Z',
  };
  const out = wire.projectEquipment(validEquipment(), { 'eqp-0001': conflicting });
  assert.strictEqual(out.ims_device_id, null, 'a stale device id must never reach the wire while conflicting');
  assert.strictEqual(out.mapping_status, 'UNMAPPED_TO_IMS');
  assert.strictEqual(out.status, 'UNMAPPED');
  assert.strictEqual(out.identity_status, 'conflicting', 'the real lifecycle state must still be visible');
  assert.strictEqual(out.evidence_source, 'mes-export', 'evidence travels regardless of eligibility');
  assert.strictEqual(out.live_status_eligible, false);
  assert.strictEqual(out.alarm_eligible, false);
  assert.strictEqual(out.drill_down_eligible, false);
});

test('a deprecated mapping never becomes usable, but stays visible in the audit trail', () => {
  const deprecated = {
    asset_id: 'eqp-0001', mapping_status: 'deprecated', ims_device_id: 'TEST-DEVICE-OLD',
    mes_machine_id: null, confidence: 'high', source: 'engineer-walkdown',
    source_record: 'form-2025-11', verified_at: '2025-11-01T00:00:00Z',
  };
  const out = wire.projectEquipment(validEquipment(), { 'eqp-0001': deprecated });
  assert.strictEqual(out.ims_device_id, null);
  assert.strictEqual(out.status, 'UNMAPPED');
  assert.strictEqual(out.identity_status, 'deprecated');
  assert.strictEqual(out.live_status_eligible, false);
  assert.strictEqual(out.alarm_eligible, false);
  assert.strictEqual(out.drill_down_eligible, false);
});

test('an unresolved asset carries no evidence and no fabricated fallback identity', () => {
  const out = wire.projectEquipment(validEquipment(), {});
  assert.strictEqual(out.identity_status, 'unresolved');
  assert.strictEqual(out.ims_device_id, null);
  assert.strictEqual(out.evidence_source, null);
  assert.strictEqual(out.evidence_source_record, null);
  assert.strictEqual(out.evidence_verified_at, null);
  assert.strictEqual(out.live_status_eligible, false);
  assert.strictEqual(out.alarm_eligible, false);
  assert.strictEqual(out.drill_down_eligible, false);
});

test('a PHYSICAL_COMPONENT child resolves under its own asset_id, never its parent station\'s', () => {
  // The parent (EQP-F1-0002) is confirmed; the child (EQP-F1-0002-C01) has no
  // entry of its own. A cascade bug would let the child inherit the parent's
  // device -- it must not.
  const table = {
    'EQP-F1-0002': {
      asset_id: 'EQP-F1-0002', mapping_status: 'confirmed', ims_device_id: 'STATION-DEVICE',
      mes_machine_id: null, confidence: 'high', source: 'test', source_record: 't1',
      verified_at: '2026-01-01T00:00:00Z',
    },
  };
  const child = wire.projectEquipment(validEquipment({ id: 'EQP-F1-0002-C01' }), table);
  assert.strictEqual(child.ims_device_id, null, 'a child must never inherit its parent station\'s device');
  assert.strictEqual(child.identity_status, 'unresolved');
  const parent = wire.projectEquipment(validEquipment({ id: 'EQP-F1-0002' }), table);
  assert.strictEqual(parent.ims_device_id, 'STATION-DEVICE');
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
