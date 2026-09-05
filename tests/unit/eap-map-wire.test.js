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
  for (const forbidden of ['2AF31', 'MN-F1-0044', '00.Drill-Vega', '00.Machine',
    '16242', '116698', 'FAM-02', 'cad_handle', 'x_mm', 'y_mm', 'block_name',
    'machine_node_id', 'cad_placement']) {
    assert.ok(!text.includes(forbidden), `projected payload leaked ${forbidden}`);
  }
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

console.log('='.repeat(50));
console.log(`${passed} passed${process.exitCode ? ', failures above' : ''}`);
