#!/usr/bin/env node
/**
 * lib/eap-map -- wire projection tests.
 *
 * Two failures are worth guarding against here, and only one of them is a bug
 * in the usual sense.
 *
 * The first is disclosure. The EAP model is private: it carries block names,
 * CAD handles and CAD-world millimetre coordinates, and the last of those would
 * locate the facility. The projection is a whitelist, and a whitelist only
 * works if something checks that it still is one -- so these tests feed the
 * projector a record stuffed with private fields and assert none of them come
 * out the other side.
 *
 * The second is a claim the data does not support. There is no mapping from an
 * EAP cell to an IMS machine, so a cell has no status; the reference layout's
 * colours are a snapshot of somebody else's system on the day the image was
 * taken. A projection that let those colours through would put a green machine
 * on an operations screen on no evidence at all, which is worse than showing
 * nothing.
 */

'use strict';

const assert = require('assert');
const eapMap = require('../../services/factory-twin-3d/lib/eap-map');

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message}`);
    process.exitCode = 1;
  }
}

/** A cell record shaped like the private model's, private fields included. */
function privateCell(over = {}) {
  return {
    eap_cell_id: 'EAP-F1-0001',
    layout_label: '140',
    zone_id: 'B',
    zone_caption: 'DRILLING (upper left)',
    process_group: 'DRILLING',
    status_colour_present: true,
    mapping_state: 'DIRECT',
    unit_state: 'ATTACHED',
    machine_unit_id: 'MU-F1-0002',
    confidence: 'MEDIUM',
    // --- private beyond this line -------------------------------------------
    cad_handle: '2AF31',
    machine_node_id: 'MN-F1-0044',
    block_name: '00.Drill-Vega',
    block_family: 'FAM-02',
    layer: '00.Machine',
    x_mm: 16242.5,
    y_mm: 116698.25,
    rotation_deg: 90,
    cad_placement: { frame: 'CAD_WORLD_MM', x_mm: 16242.5, y_mm: 116698.25 },
    spatial_evidence: 'DIRECT',
    cad_world_position: {
      frame: 'CAD_WORLD_MM', x_mm: 16242.5, y_mm: 116698.25, rotation_deg: 90,
    },
    registration_residual_mm: 0,
    registration_method: 'CAD_INSTANCE_IDENTITY',
    registration_confidence: 'HIGH',
    cad_evidence: {
      cad_zone_ids: ['FZ-F1-0001'],
      cad_candidates_in_zone: 102,
      relation: 'DIRECT',
      rule: 'positional link inside the 8x5 grid',
    },
    eap_footprint: {
      frame: 'EAP_LAYOUT_FRAME',
      x: -71.4, z: -41.17, rotation_deg: 0, width: 1.85, depth: 3.35,
      height: null, height_state: 'PRESENTATION_ONLY',
      provenance: 'REFERENCE_LAYOUT', measurement: 'COLOUR_STRIP',
      geometry_confidence: 'HIGH',
    },
    ...over,
  };
}

console.log('EAP map wire projection');
console.log('='.repeat(50));

test('no private CAD field survives the projection', () => {
  const out = eapMap.projectCell(privateCell());
  const text = JSON.stringify(out);
  // Private VALUES: a handle, a block or layer name, a millimetre coordinate.
  for (const value of ['2AF31', 'MN-F1-0044', '00.Drill-Vega', '00.Machine',
    '16242', '116698', 'FAM-02']) {
    assert.ok(!text.includes(value), `projected payload leaked ${value}`);
  }
  // Private KEYS, matched exactly. A substring test would trip over
  // has_cad_world_position, which is the boolean that deliberately replaces the
  // coordinates -- it says a world position exists without saying where.
  for (const key of ['cad_handle', 'x_mm', 'y_mm', 'block_name', 'machine_node_id',
    'cad_placement', 'cad_world_position', 'registration_note', 'layer']) {
    assert.ok(!text.includes(`"${key}":`), `projected payload leaked key ${key}`);
  }
  assert.strictEqual(out.has_cad_world_position, true,
    'the boolean stand-in for the coordinates must still be projected');
});

test('a cell keeps the fields the map needs to draw and explain it', () => {
  const out = eapMap.projectCell(privateCell());
  for (const key of ['cell_id', 'zone_id', 'process', 'reference_label', 'footprint',
    'mapping_state', 'unit_state', 'confidence', 'machine_unit_id', 'cad_evidence',
    'status']) {
    assert.ok(key in out, `missing ${key}`);
  }
  assert.strictEqual(out.footprint.width, 1.85);
  assert.strictEqual(out.footprint.depth, 3.35);
  assert.strictEqual(out.footprint.rotation_deg, 0);
});

test('CAD evidence is reduced to zone, count and relation', () => {
  const out = eapMap.projectCell(privateCell());
  assert.strictEqual(out.cad_evidence.relation, 'DIRECT');
  assert.strictEqual(out.cad_evidence.has_cad_instance, true);
  assert.deepStrictEqual(out.cad_evidence.cad_zone_ids, ['FZ-F1-0001']);
  assert.strictEqual(out.cad_evidence.cad_candidates_in_zone, 102);
  assert.ok(!('cad_handle' in out.cad_evidence));
});

test('a cell with no CAD instance says so rather than guessing', () => {
  const out = eapMap.projectCell(privateCell({
    cad_handle: null, machine_node_id: null, mapping_state: 'AMBIGUOUS',
    cad_evidence: { cad_zone_ids: ['FZ-F1-0002'], cad_candidates_in_zone: 44,
      relation: 'ZONE_SET', rule: 'zone linkage only' },
  }));
  assert.strictEqual(out.cad_evidence.has_cad_instance, false);
  assert.strictEqual(out.cad_evidence.relation, 'ZONE_SET');
  assert.strictEqual(out.mapping_state, 'AMBIGUOUS');
});

test('status is UNKNOWN and the reference colour is never projected', () => {
  const out = eapMap.projectCell(privateCell({ status_colour_present: true }));
  assert.strictEqual(out.status, 'UNKNOWN');
  assert.ok(out.status_reason.includes('no authoritative IMS mapping'));
  // Whether the reference drew a colour is evidence about the reference. The
  // colour itself is not projected under any name.
  assert.strictEqual(out.reference_status_drawn, true);
  const text = JSON.stringify(out);
  for (const state of ['RUN', 'IDLE', 'DOWN', 'ALARM', 'PMSTOP', 'OFF']) {
    assert.ok(!text.includes(state), `projected a reference status: ${state}`);
  }
});

test('an unreadable reference label is passed through, never replaced', () => {
  const out = eapMap.projectCell(privateCell({ layout_label: 'UNREADABLE-3' }));
  assert.strictEqual(out.reference_label, 'UNREADABLE-3');
});

test('a state outside the vocabulary falls back rather than reaching a client', () => {
  const out = eapMap.projectCell(privateCell({
    mapping_state: 'RESOLVED_PROBABLY', unit_state: 'MAYBE', confidence: 'VERY HIGH',
  }));
  assert.strictEqual(out.mapping_state, 'AMBIGUOUS');
  assert.strictEqual(out.unit_state, 'UNASSIGNED');
  assert.strictEqual(out.confidence, 'LOW');
});

test('a footprint in the wrong frame is rejected, not reinterpreted', () => {
  const out = eapMap.projectCell(privateCell({
    eap_footprint: { frame: 'CAD_WORLD_MM', x: 1, z: 2, rotation_deg: 0, width: 3, depth: 4 },
  }));
  assert.strictEqual(out.footprint, null);
});

test('a half-built footprint is rejected rather than defaulted', () => {
  for (const broken of [
    { x: null }, { z: undefined }, { width: 0 }, { depth: -2 }, { rotation_deg: NaN },
  ]) {
    const base = privateCell().eap_footprint;
    const out = eapMap.projectCell(privateCell({
      eap_footprint: { ...base, ...broken },
    }));
    assert.strictEqual(out.footprint, null, `accepted ${JSON.stringify(broken)}`);
  }
});

test('height never crosses the wire as a number', () => {
  const out = eapMap.projectCell(privateCell());
  assert.ok(!('height' in out.footprint));
  assert.strictEqual(out.footprint.height_state, 'PRESENTATION_ONLY');
});

test('a unit declares its aggregation and refuses to claim an IMS mapping', () => {
  const out = eapMap.projectUnit({
    unit_id: 'MU-F1-0001',
    unit_key: 'A:DHD001',
    zone_id: 'A',
    zone_caption: 'DRILLING HOLD',
    process_group: 'DRILLING',
    cell_ids: ['EAP-F1-0001', 'EAP-F1-0002', 'EAP-F1-0003', 'EAP-F1-0004'],
    aggregation_type: 'AGGREGATED_STATION',
    aggregation_evidence: 'one labelled column',
    ims_mapping_state: 'MAPPED',
    confidence: 'MEDIUM',
  });
  assert.strictEqual(out.reference_label, 'DHD001');
  assert.strictEqual(out.aggregation_type, 'AGGREGATED_STATION');
  assert.strictEqual(out.cell_ids.length, 4);
  // MAPPED is not in the vocabulary: no mapping data exists, so no payload may
  // claim one even if the model upstream were edited to say otherwise.
  assert.strictEqual(out.ims_mapping_state, 'NOT_MAPPED');
});

test('counts are recomputed from what is sent, not copied from the model', () => {
  const model = {
    eap_frame: { id: 'EAP_LAYOUT_FRAME', extent_m: { width: 174.5, depth: 89.3 },
      axes: 'x right, z down', warning: 'schematic' },
    // A model that claims 999 cells but carries two.
    summary: { cells: 999 },
    eap_cells: [privateCell(), privateCell({
      eap_cell_id: 'EAP-F1-0002', layout_label: '141', cad_handle: null,
      machine_node_id: null, mapping_state: 'AMBIGUOUS', unit_state: 'UNASSIGNED',
      machine_unit_id: null, status_colour_present: false,
    })],
    machine_units: [{
      unit_id: 'MU-F1-0002', unit_key: 'B:140', zone_id: 'B', zone_caption: 'DRILLING',
      process_group: 'DRILLING', cell_ids: ['EAP-F1-0001'],
      aggregation_type: 'SINGLE_CELL', ims_mapping_state: 'NOT_MAPPED',
      confidence: 'MEDIUM',
    }],
  };
  const out = eapMap.project(model);
  assert.strictEqual(out.counts.cells, 2);
  assert.strictEqual(out.counts.cells_with_a_footprint, 2);
  assert.strictEqual(out.counts.machine_units, 1);
  assert.strictEqual(out.counts.mapping_state.DIRECT, 1);
  assert.strictEqual(out.counts.mapping_state.AMBIGUOUS, 1);
  assert.strictEqual(out.counts.cells_unassigned_to_a_unit, 1);
  assert.strictEqual(out.counts.cells_with_a_cad_instance, 1);
  assert.strictEqual(out.counts.reference_status_drawn, 1);
});

test('the frame declares itself non-metric and carries its warning', () => {
  const out = eapMap.project({
    eap_frame: { id: 'EAP_LAYOUT_FRAME', extent_m: { width: 174.5, depth: 89.3 },
      axes: 'x right, z down', warning: 'schematic, never measure with it' },
    eap_cells: [privateCell()],
    machine_units: [],
  });
  assert.strictEqual(out.frame.is_metric, false);
  assert.ok(out.frame.warning.includes('schematic'));
  assert.strictEqual(out.footprint_contract.height, 'PRESENTATION_ONLY');
});

test('a zone outline is the extent of its cells and says so', () => {
  const cells = [
    eapMap.projectCell(privateCell()),
    eapMap.projectCell(privateCell({
      eap_cell_id: 'EAP-F1-0002',
      eap_footprint: { ...privateCell().eap_footprint, x: -60, z: -30 },
    })),
  ];
  const zones = eapMap.zoneOutlines(cells);
  assert.strictEqual(zones.length, 1);
  assert.strictEqual(zones[0].cells, 2);
  assert.ok(zones[0].extent.width > 11);
  assert.ok(zones[0].derivation.includes('not a room boundary'));
});

test('a model missing its arrays yields no payload rather than an empty map', () => {
  assert.strictEqual(eapMap.project(null), null);
  assert.strictEqual(eapMap.project({ eap_cells: [] }), null);
});

/* ---- the operational-footprint contract --------------------------------------
   Eight rules, each of which would be invisible if it broke. A world position on
   a cell nobody identified, a set-level registration read as a machine location,
   or a LAYOUT_ONLY cell wired to telemetry would all render perfectly well and
   all be wrong on the floor. */

test('no CAD world position without valid spatial evidence', () => {
  for (const level of ['SET_LEVEL', 'LAYOUT_ONLY']) {
    const out = eapMap.projectCell(privateCell({
      spatial_evidence: level, cad_world_position: null,
      registration_method: 'ZONE_SET_CORRESPONDENCE',
    }));
    assert.strictEqual(out.has_cad_world_position, false);
    assert.strictEqual(out.world_render_permitted, false,
      `${level} must not permit a world-space render`);
  }
  for (const level of ['DIRECT', 'STRUCTURAL']) {
    const out = eapMap.projectCell(privateCell({
      spatial_evidence: level,
      cad_world_position: { frame: 'CAD_WORLD_MM', x_mm: 1, y_mm: 2 },
    }));
    assert.strictEqual(out.world_render_permitted, true);
  }
});

test('a CAD world position does not imply CAD identity', () => {
  // The state this phase exists to make expressible: registered in the world,
  // but nobody knows which drawing object it is.
  const out = eapMap.projectCell(privateCell({
    spatial_evidence: 'STRUCTURAL',
    cad_world_position: { frame: 'CAD_WORLD_MM', x_mm: 1, y_mm: 2 },
    cad_handle: null,
    machine_node_id: null,
    mapping_state: 'AMBIGUOUS',
  }));
  assert.strictEqual(out.has_cad_world_position, true);
  assert.strictEqual(out.cad_evidence.has_cad_instance, false);
  assert.strictEqual(out.mapping_state, 'AMBIGUOUS');
  assert.strictEqual(out.world_render_permitted, true);
});

test('CAD identity does not imply a world position either', () => {
  const out = eapMap.projectCell(privateCell({
    spatial_evidence: 'SET_LEVEL', cad_world_position: null,
  }));
  assert.strictEqual(out.cad_evidence.has_cad_instance, true);
  assert.strictEqual(out.has_cad_world_position, false);
});

test('SET_LEVEL does not imply an individual machine location', () => {
  const out = eapMap.projectCell(privateCell({
    spatial_evidence: 'SET_LEVEL', cad_world_position: null,
    registration_method: 'ZONE_SET_CORRESPONDENCE',
  }));
  assert.strictEqual(out.registration_method, 'ZONE_SET_CORRESPONDENCE');
  assert.strictEqual(out.has_cad_world_position, false);
  assert.strictEqual(out.world_render_permitted, false);
});

test('a LAYOUT_ONLY cell can never carry live telemetry status', () => {
  // Even once mappings exist. The rule is encoded now so it holds then.
  assert.strictEqual(eapMap.liveStatusEligible('LAYOUT_ONLY', true), false);
  assert.strictEqual(eapMap.liveStatusEligible('SET_LEVEL', true), true);
  assert.strictEqual(eapMap.liveStatusEligible('DIRECT', true), true);
  // And nothing is eligible while no mapping exists at all.
  for (const level of ['DIRECT', 'STRUCTURAL', 'SET_LEVEL', 'LAYOUT_ONLY']) {
    assert.strictEqual(eapMap.liveStatusEligible(level, false), false);
  }
  const out = eapMap.projectCell(privateCell({ spatial_evidence: 'LAYOUT_ONLY' }));
  assert.strictEqual(out.live_status_eligible, false);
  assert.strictEqual(out.status, 'UNKNOWN');
});

test('an unresolved cell still carries everything needed to draw it', () => {
  const out = eapMap.projectCell(privateCell({
    spatial_evidence: 'LAYOUT_ONLY', cad_world_position: null, cad_handle: null,
    machine_node_id: null, mapping_state: 'AMBIGUOUS', unit_state: 'UNASSIGNED',
    machine_unit_id: null,
  }));
  assert.ok(out.footprint, 'an unresolved cell must keep its footprint');
  assert.ok(out.footprint.width > 0 && out.footprint.depth > 0);
  assert.strictEqual(out.cell_id, 'EAP-F1-0001');
});

test('no physical mapping is fabricated anywhere in the payload', () => {
  const out = eapMap.projectCell(privateCell({
    spatial_evidence: 'SET_LEVEL', cad_world_position: null, cad_handle: null,
    machine_node_id: null,
  }));
  const text = JSON.stringify(out);
  assert.ok(!/\d{5,}/.test(text.replace(/EAP-F1-\d+/g, '')),
    'no millimetre-scale coordinate appears in a cell payload');
  assert.strictEqual(out.cad_evidence.has_cad_instance, false);
});

test('the payload declares the renderer and live-status contracts', () => {
  const out = eapMap.project({
    eap_frame: { id: 'EAP_LAYOUT_FRAME', extent_m: { width: 174.5, depth: 89.3 },
      axes: 'x right, z down', warning: 'schematic' },
    eap_cells: [privateCell()],
    machine_units: [],
  });
  for (const level of ['DIRECT', 'STRUCTURAL', 'SET_LEVEL', 'LAYOUT_ONLY']) {
    assert.ok(out.renderer_contract[level], `renderer contract missing ${level}`);
  }
  assert.ok(/always drawn/i.test(out.renderer_contract.unresolved_cells));
  assert.ok(/authoritative IMS mapping/i.test(out.live_status_contract.rule));
  assert.strictEqual(out.footprint_contract.canonical_frame, 'EAP_LAYOUT_FRAME');
  assert.strictEqual(out.counts.cells_world_render_permitted, 1);
  assert.strictEqual(out.counts.cells_live_status_eligible, 0);
  assert.deepStrictEqual(out.counts.spatial_evidence, { DIRECT: 1 });
});

test('schema compatibility: the fields the renderer already reads are unchanged', () => {
  const out = eapMap.projectCell(privateCell());
  for (const key of ['cell_id', 'zone_id', 'zone_caption', 'process', 'reference_label',
    'footprint', 'mapping_state', 'unit_state', 'machine_unit_id', 'confidence',
    'cad_evidence', 'status', 'status_reason', 'reference_status_drawn']) {
    assert.ok(key in out, `schema regression: ${key} disappeared`);
  }
  assert.strictEqual(out.footprint.frame, 'EAP_LAYOUT_FRAME');
  assert.strictEqual(out.status, 'UNKNOWN');
});

/* ---- the world frame -----------------------------------------------------
   The projection into the canonical Floor 1 frame is the one place a cell can
   silently end up in the wrong spot on a real floor plan: a sign error in the
   reflected z axis, or a rotation that did not flip with it, both produce a
   plausible-looking machine standing somewhere it is not. */

const ENV = { halfWidth: 87.25, halfDepth: 60.15 };

test('the canonical frame is applied, reflection and all', () => {
  // x_twin = x/1000 - halfWidth, z_twin = -(y/1000 - halfDepth)
  assert.deepStrictEqual(eapMap.cadToTwin(0, 0, ENV), { x: -87.25, z: 60.15 });
  assert.deepStrictEqual(eapMap.cadToTwin(174500, 120300, ENV), { x: 87.25, z: -60.15 });
  const mid = eapMap.cadToTwin(87250, 60150, ENV);
  assert.strictEqual(mid.x, 0);
  assert.strictEqual(mid.z, 0);
});

test('a DIRECT cell gets a world footprint from its own CAD instance', () => {
  const out = eapMap.projectCell(privateCell(), ENV,
    new Map([['MN-F1-0044', { width_mm: 4700, depth_mm: 2068 }]]));
  assert.ok(out.world_footprint, 'a DIRECT cell must reach the world frame');
  assert.strictEqual(out.spatial_frame, 'FLOOR1_WORLD_M');
  assert.strictEqual(out.world_footprint.frame, 'FLOOR1_WORLD_M');
  // The size is the measured CAD body, not the schematic rectangle.
  assert.strictEqual(out.world_footprint.width, 4.7);
  assert.strictEqual(out.world_footprint.depth, 2.068);
  assert.notStrictEqual(out.world_footprint.width, out.footprint.width);
  // The rotation is the CAD rotation, carried with the sign the frame requires.
  assert.strictEqual(out.world_footprint.rotation_deg, 90);
  // The projection rounds to 0.1 mm, so the comparison carries that tolerance
  // rather than demanding a float it never promised.
  assert.ok(Math.abs(out.world_footprint.x - (16.2425 - ENV.halfWidth)) < 1e-4,
    `x ${out.world_footprint.x}`);
  assert.ok(Math.abs(out.world_footprint.z + (116.69825 - ENV.halfDepth)) < 1e-4,
    `z ${out.world_footprint.z}`);
});

test('a cell without the evidence never reaches the world frame', () => {
  for (const level of ['SET_LEVEL', 'LAYOUT_ONLY']) {
    const out = eapMap.projectCell(privateCell({
      spatial_evidence: level,
      cad_world_position: { frame: 'CAD_WORLD_MM', x_mm: 1, y_mm: 2, rotation_deg: 0 },
    }), ENV, new Map([['MN-F1-0044', { width_mm: 1000, depth_mm: 1000 }]]));
    assert.strictEqual(out.world_footprint, null, `${level} reached the world frame`);
    assert.strictEqual(out.spatial_frame, 'EAP_LAYOUT_FRAME');
  }
});

test('a world footprint with no measured body falls back rather than guessing', () => {
  // No body on the candidate: there is no size to draw, and an assumed one
  // would put a wrong-sized machine on a real floor plan.
  const out = eapMap.projectCell(privateCell(), ENV, new Map());
  assert.strictEqual(out.world_footprint, null);
  assert.strictEqual(out.spatial_frame, 'EAP_LAYOUT_FRAME');
  assert.ok(out.footprint, 'the schematic footprint is still there to draw');
});

test('a world footprint in the wrong frame is rejected', () => {
  const out = eapMap.projectCell(privateCell({
    cad_world_position: { frame: 'EAP_LAYOUT_FRAME', x_mm: 1, y_mm: 2, rotation_deg: 0 },
  }), ENV, new Map([['MN-F1-0044', { width_mm: 1000, depth_mm: 1000 }]]));
  assert.strictEqual(out.world_footprint, null);
});

test('the world frame carries no millimetres and no CAD identity', () => {
  const out = eapMap.projectCell(privateCell(), ENV,
    new Map([['MN-F1-0044', { width_mm: 4700, depth_mm: 2068 }]]));
  const text = JSON.stringify(out.world_footprint);
  assert.ok(!text.includes('16242'), 'the world footprint leaked a CAD millimetre');
  assert.ok(!text.includes('2AF31'), 'the world footprint leaked a CAD handle');
});

test('the payload names both frames and refuses to bridge them', () => {
  const out = eapMap.project({
    eap_frame: { id: 'EAP_LAYOUT_FRAME', extent_m: { width: 174.5, depth: 89.3 },
      axes: 'x right, z down', warning: 'schematic' },
    eap_cells: [privateCell(), privateCell({
      eap_cell_id: 'EAP-F1-0002', spatial_evidence: 'SET_LEVEL',
      cad_world_position: null, cad_handle: null, machine_node_id: null,
    })],
    machine_units: [],
    cad_candidates: [{ machine_node_id: 'MN-F1-0044', width_mm: 4700, depth_mm: 2068 }],
  }, ENV);
  assert.ok(out.frames.FLOOR1_WORLD_M);
  assert.ok(out.frames.EAP_LAYOUT_FRAME);
  assert.ok(/never merged/i.test(out.frames.rule));
  assert.strictEqual(out.counts.cells_in_world_frame, 1);
  assert.strictEqual(out.counts.cells_in_layout_frame, 1);
});

test('a zone world region is published only where the registration earned one', () => {
  const model = {
    eap_frame: { id: 'EAP_LAYOUT_FRAME', extent_m: { width: 174.5, depth: 89.3 },
      axes: 'x right, z down', warning: 'schematic' },
    eap_cells: [privateCell({ spatial_evidence: 'SET_LEVEL', cad_world_position: null })],
    machine_units: [],
    cad_candidates: [],
    spatial_registration: {
      zones: [
        { zone_id: 'B', spatial_evidence: 'SET_LEVEL', cad_candidates: 102,
          cells_registered_to_a_point: 40,
          cad_world_region: { frame: 'CAD_WORLD_MM', x_mm: [0, 20000],
            y_mm: [0, 10000] } },
        { zone_id: 'H', spatial_evidence: 'LAYOUT_ONLY', cad_candidates: 16,
          cells_registered_to_a_point: 0,
          cad_world_region: { frame: 'CAD_WORLD_MM', x_mm: [0, 1000],
            y_mm: [0, 1000] } },
      ],
    },
  };
  const out = eapMap.project(model, ENV);
  const zoneB = out.zones.find((z) => z.zone_id === 'B');
  assert.ok(zoneB.cad_world_region, 'a SET_LEVEL zone publishes its region');
  assert.strictEqual(zoneB.cad_world_region.frame, 'FLOOR1_WORLD_M');
  assert.ok(/not a position for any one machine/i.test(zoneB.cad_world_region.derivation)
    || /individual machines in it are not/i.test(zoneB.cad_world_region.derivation));
  // A LAYOUT_ONLY zone established nothing, so its candidates' extent is not a
  // registration and is not published as one.
  const model2 = { ...model, eap_cells: [privateCell({ zone_id: 'H',
    spatial_evidence: 'LAYOUT_ONLY', cad_world_position: null })] };
  const out2 = eapMap.project(model2, ENV);
  const zoneH = out2.zones.find((z) => z.zone_id === 'H');
  assert.strictEqual(zoneH.cad_world_region, null);
});

console.log('='.repeat(50));
console.log(`${passed} passed${process.exitCode ? ', failures above' : ''}`);
