/**
 * Unit tests for diagnostics serialization.
 *
 * Diagnostics describe private geometry, which makes them the most plausible
 * accidental route for that geometry to reach a client. These tests do not
 * check that the current input happens to be clean — they poison the input
 * with exactly the things that must never escape (coordinates, filesystem
 * paths, drawing filenames, device and slot identifiers, process and vendor
 * names, credentials) and assert none of it appears anywhere in the serialized
 * output.
 *
 * The poisoned values are obviously synthetic. No real identifier, path or
 * name appears in this file.
 *
 * Run: node tests/unit/factory-twin-diagnostics.test.js
 */

'use strict';

const assert = require('assert');
const { buildDiagnostics } = require('../../services/factory-twin-3d/lib/diagnostics');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}

// Deliberately hostile input: every field here is something that must not
// reach a client, planted where a careless spread or key-echo would carry it.
const POISON = {
  schema_version: '2.0.0',
  source_drawing_path: 'C:/secret/TEST-DRAWING.jpg',
  operator_name: 'TEST-PERSON-NAME',
  vendor: 'TEST-VENDOR-NAME',
  process_name: 'TEST-PROCESS-NAME',
  snmp_community: 'TEST-CREDENTIAL',
  envelope: {
    width: 174.5,
    depth: 120.3,
    height: 5,
    floor_to_floor: true,
    clear_height_m: null,
    height_evidence: 'TEST-SENSITIVE-EVIDENCE-TEXT',
  },
  footprint_polygon: {
    vertices: [
      { x: -87.25, z: -60.15 },
      { x: 87.25, z: -60.15 },
      { x: 87.25, z: 60.15 },
    ],
    evidence: 'TEST-SENSITIVE-EVIDENCE-TEXT',
  },
  grid: { x_lines: [1, 2, 3], z_lines: [1, 2] },
  columns: [
    { id: 'TEST-COL-001', confidence: 'high', position: { x: -12.345, z: 67.891 } },
    { id: 'TEST-COL-002', confidence: 'medium', position: { x: 1.5, z: 2.5 } },
  ],
  // The physical asset layer is equipment[] now. slots[] is retained on the
  // fixture as well, poisoned, precisely so the test proves the superseded
  // layer contributes nothing to diagnostics rather than merely being absent.
  equipment: [
    { id: 'TEST-EQP-0001', confidence: 'high', height_status: 'unknown', footprint_status: 'OBSERVED_CAD', position: { x: -45.562, z: -51.411 }, cad_block: 'TEST-SENSITIVE-BLOCK', cad_layer: 'TEST-SENSITIVE-LAYER' },
    { id: 'TEST-EQP-0002', confidence: 'medium', height_status: 'unknown', footprint_status: 'UNRESOLVED', ims_device_id: 'TEST-DEVICE-01' },
  ],
  slots: [
    { slot_id: 'TEST-SLOT-0001', confidence: 'high', height_status: 'unknown', position: { x: -45.562, z: -51.411 } },
    { slot_id: 'TEST-SLOT-0002', confidence: 'medium', height_status: 'unknown' },
  ],
  equipment_detection: { method: 'TEST-SENSITIVE-METHOD-TEXT' },
  equipment_extraction: { evidence_intersection: 'TEST-SENSITIVE-INTERSECTION-TEXT' },
};

const ZONE_META = {
  served: 8,
  withheld: 13,
  total: 21,
  byConfidence: { HIGH: 3, MEDIUM: 5, LOW: 3 },
  conflicts: [
    { ids: ['zone-28', 'zone-31'], status: 'CONFLICT', resolution: 'TEST-SENSITIVE-RESOLUTION-TEXT' },
  ],
};

const build = () =>
  buildDiagnostics({ geometry: POISON, zoneMeta: ZONE_META, confirmedMappings: 0, simulatedPlacements: 23 });
const serialized = () => JSON.stringify(build());

// ── the guarantee ──
test('no filesystem path or drawing filename escapes', () => {
  const s = serialized();
  assert.ok(!s.includes('TEST-DRAWING'), 'drawing filename leaked');
  assert.ok(!s.includes('C:/secret'), 'filesystem path leaked');
  assert.ok(!/\.jpg|\.dxf|\.dwg|\.png/i.test(s), 'file extension leaked');
});

test('no personal, vendor or process name escapes', () => {
  const s = serialized();
  for (const needle of ['TEST-PERSON-NAME', 'TEST-VENDOR-NAME', 'TEST-PROCESS-NAME']) {
    assert.ok(!s.includes(needle), `${needle} leaked`);
  }
});

test('no credential escapes', () => {
  assert.ok(!serialized().includes('TEST-CREDENTIAL'), 'credential leaked');
});

test('no object identifier escapes', () => {
  const s = serialized();
  for (const needle of ['TEST-COL-001', 'TEST-SLOT-0001', 'TEST-DEVICE-01']) {
    assert.ok(!s.includes(needle), `${needle} leaked`);
  }
});

test('no coordinate escapes', () => {
  const s = serialized();
  for (const needle of ['-45.562', '-51.411', '-12.345', '67.891', '87.25', '-60.15', '174.5', '120.3']) {
    assert.ok(!s.includes(needle), `coordinate ${needle} leaked`);
  }
});

test('no free-text evidence or method note escapes', () => {
  const s = serialized();
  for (const needle of ['TEST-SENSITIVE-EVIDENCE-TEXT', 'TEST-SENSITIVE-METHOD-TEXT', 'TEST-SENSITIVE-RESOLUTION-TEXT']) {
    assert.ok(!s.includes(needle), `${needle} leaked`);
  }
});

test('output contains only counts, booleans, fixed enums and safe zone ids', () => {
  const walk = (node, at) => {
    if (node === null) return;
    const t = typeof node;
    if (t === 'number' || t === 'boolean') return;
    if (t === 'string') {
      assert.ok(
        /^\d+\.\d+\.\d+$/.test(node) || /^zone-(\d{1,4}|unknown)$/.test(node) || node === 'CONFLICT' || node === 'UNKNOWN',
        `unexpected free string at ${at}: "${node}"`
      );
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${at}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${at}.${k}`);
  };
  walk(build(), 'root');
});

// ── counts remain correct despite the sanitisation ──
test('counts are still accurate', () => {
  const d = build();
  assert.strictEqual(d.data.column_count, 2);
  assert.strictEqual(d.data.equipment_count, 2);
  assert.strictEqual(d.data.equipment_footprint_resolved, 1);
  assert.strictEqual(d.data.equipment_footprint_unresolved, 1);
  // The superseded raster layer is on the fixture and must still count zero:
  // diagnostics reports what the twin shows, and it shows none of them.
  assert.strictEqual(d.data.raster_slot_count, 0);
  assert.strictEqual(d.data.footprint_vertices, 3);
  assert.strictEqual(d.data.zone_count_rendered, 8);
  // Always zero now, and asserted as zero on purpose: the synthetic placement
  // path is deleted, so any non-zero here would mean it had been reinstated.
  assert.strictEqual(d.evidence.simulated_machine_positions, 0);
  assert.strictEqual(d.evidence.unknown_equipment_height, 2);
  assert.strictEqual(d.evidence.unknown_clear_height, 1);
  assert.strictEqual(d.evidence.confirmed_mappings, 0);
  assert.strictEqual(d.evidence.unresolved_mappings, 2);
  assert.strictEqual(d.evidence.measured_equipment, 2);
});

test('an unrecognised confidence tier is counted, never echoed', () => {
  const d = buildDiagnostics({
    geometry: { columns: [{ confidence: 'TEST-INJECTED-TIER' }], equipment: [] },
    zoneMeta: { byConfidence: { 'TEST-INJECTED-KEY': 4 } },
  });
  assert.strictEqual(d.evidence.column_confidence.other, 1);
  assert.strictEqual(d.evidence.zone_confidence.other, 4);
  assert.ok(!JSON.stringify(d).includes('TEST-INJECTED'), 'injected key echoed');
});

test('a poisoned schema_version is dropped rather than echoed', () => {
  const d = buildDiagnostics({ geometry: { schema_version: '../../etc/passwd', columns: [], equipment: [] } });
  assert.strictEqual(d.data.geometry_schema_version, null);
});

test('a poisoned zone id is replaced, never echoed', () => {
  const d = buildDiagnostics({
    geometry: null,
    zoneMeta: { conflicts: [{ ids: ['zone-28', 'TEST-INJECTED-ZONE'], status: 'CONFLICT' }] },
  });
  assert.deepStrictEqual(d.conflicts[0].ids, ['zone-28', 'zone-unknown']);
});

// ── degrades safely ──
test('absent geometry yields zeros, not a throw', () => {
  const d = buildDiagnostics({ geometry: null, zoneMeta: {} });
  assert.strictEqual(d.data.geometry_loaded, false);
  assert.strictEqual(d.data.column_count, 0);
  assert.strictEqual(d.evidence.unresolved_mappings, 0);
});

test('non-numeric runtime counters become 0 rather than pass through', () => {
  const d = buildDiagnostics({ geometry: null, runtime: { requestsTotal: 'TEST-NOT-A-NUMBER', requestsFailed: -5 } });
  assert.strictEqual(d.runtime.requests_total, 0);
  assert.strictEqual(d.runtime.requests_failed, 0);
});

// ── latency histogram ──
test('latency buckets are always the fixed set, never the caller keys', () => {
  const d = buildDiagnostics({
    geometry: null,
    runtime: { latencyBuckets: { lt_10ms: 5, 'TEST-INVENTED-BUCKET': 99, __proto__: 7 } },
  });
  assert.deepStrictEqual(Object.keys(d.runtime.latency_buckets).sort(), [
    'gte_500ms',
    'lt_100ms',
    'lt_10ms',
    'lt_500ms',
    'lt_50ms',
  ]);
  assert.strictEqual(d.runtime.latency_buckets.lt_10ms, 5);
  assert.ok(!JSON.stringify(d).includes('TEST-INVENTED-BUCKET'));
});

test('a missing or malformed bucket object yields zeros rather than throwing', () => {
  for (const bad of [undefined, null, 'TEST-STRING', 42, []]) {
    const d = buildDiagnostics({ geometry: null, runtime: { latencyBuckets: bad } });
    assert.strictEqual(d.runtime.latency_buckets.gte_500ms, 0);
  }
});

test('a non-numeric bucket value becomes 0 rather than pass through', () => {
  const d = buildDiagnostics({
    geometry: null,
    runtime: { latencyBuckets: { lt_50ms: 'TEST-NOT-A-NUMBER', gte_500ms: -3 } },
  });
  assert.strictEqual(d.runtime.latency_buckets.lt_50ms, 0);
  assert.strictEqual(d.runtime.latency_buckets.gte_500ms, 0);
});

test('the histogram carries counts only, never a timing or an identifier', () => {
  const d = buildDiagnostics({
    geometry: null,
    runtime: { latencyBuckets: { lt_10ms: 3, lt_500ms: 1 } },
  });
  for (const v of Object.values(d.runtime.latency_buckets)) {
    assert.strictEqual(typeof v, 'number');
    assert.ok(Number.isInteger(v) && v >= 0);
  }
});

// ── zone and process names ──
// Area names became servable on the authenticated geometry route. They did NOT
// become servable here: diagnostics is pasted into tickets and logs, and a
// process name in one of those has left the boundary the geometry route keeps.

test('a zone name never reaches diagnostics, however it is supplied', () => {
  const d = buildDiagnostics({
    geometry: {
      equipment: [{ zone_name: 'TEST AREA NAME', height_status: 'unknown' }],
      columns: [{ zone_name: 'TEST AREA NAME' }],
      envelope: { zone_name: 'TEST AREA NAME', clear_height_m: null },
    },
    zoneMeta: {
      total: 1,
      served: 1,
      withheld: 0,
      byConfidence: { HIGH: 1, 'TEST AREA NAME': 3 },
      conflicts: [{ ids: ['zone-28', 'TEST AREA NAME'], status: 'CONFLICT', name: 'TEST AREA NAME' }],
      names: ['TEST AREA NAME'],
    },
  });
  assert.ok(!JSON.stringify(d).includes('TEST AREA NAME'));
});

test('an all-caps name is not exempt from the diagnostics boundary', () => {
  // The geometry route admits all-caps labels by design. Diagnostics has no
  // such door at all, so the same string must still find no way out here.
  const d = buildDiagnostics({
    geometry: null,
    zoneMeta: { byConfidence: { DRILLING: 4 }, conflicts: [{ ids: ['DRILLING HOLD'], status: 'CONFLICT' }] },
  });
  const s = JSON.stringify(d);
  assert.ok(!s.includes('DRILLING'));
  assert.ok(s.includes('zone-unknown'));
});

// ── schematic coverage ──
// Answers "how much of the drawing is tied to anything real" without naming
// anything on the drawing.

test('schematic coverage reports counts and never a name or a label', () => {
  const d = buildDiagnostics({
    geometry: null,
    schematic: {
      areas: [{ id: 'sch-a', name: 'TEST AREA NAME' }],
      banks: [
        {
          id: 'bank-a',
          columns: 2,
          rows: 5,
          labels: [{ text: 'TEST-LABEL', ambiguous: true }, { text: 'TEST-OTHER' }],
        },
      ],
      snapshots: [{ id: 'a', conflicts_with: ['b'] }, { id: 'b', conflicts_with: ['a'] }],
    },
  });
  assert.strictEqual(d.schematic.areas, 1);
  assert.strictEqual(d.schematic.banks, 1);
  assert.strictEqual(d.schematic.cells, 10);
  assert.strictEqual(d.schematic.observed_labels, 2);
  assert.strictEqual(d.schematic.ambiguous_labels, 1);
  assert.strictEqual(d.schematic.conflicting_snapshots, 2);
  const s = JSON.stringify(d);
  assert.ok(!s.includes('TEST AREA NAME'));
  assert.ok(!s.includes('TEST-LABEL'));
  assert.ok(!s.includes('sch-a'));
  assert.ok(!s.includes('bank-a'));
});

test('schematic link coverage is zero and is computed, not asserted', () => {
  // Zero because no schematic record carries either field, not because the
  // number is hardcoded. Supplying one moves it, which is what makes the zero
  // meaningful.
  const none = buildDiagnostics({ geometry: null, schematic: { banks: [{ id: 'b', columns: 1, rows: 1 }] } });
  assert.strictEqual(none.schematic.linked_to_physical_slot, 0);
  assert.strictEqual(none.schematic.linked_to_ims_device, 0);

  const linked = buildDiagnostics({
    geometry: null,
    schematic: {
      banks: [{ id: 'b', columns: 1, rows: 1, physical_slot_id: 'TEST-SLOT-1', ims_device_id: 'TEST-DEVICE-1' }],
    },
  });
  assert.strictEqual(linked.schematic.linked_to_physical_slot, 1);
  assert.strictEqual(linked.schematic.linked_to_ims_device, 1);
  // Even then, the identifiers themselves stay server-side.
  assert.ok(!JSON.stringify(linked).includes('TEST-SLOT-1'));
  assert.ok(!JSON.stringify(linked).includes('TEST-DEVICE-1'));
});

test('an absent or malformed schematic reports zeros rather than throwing', () => {
  for (const bad of [null, undefined, 'TEST-STRING', 42, [], { banks: 'nope', areas: 7 }]) {
    const d = buildDiagnostics({ geometry: null, schematic: bad });
    assert.strictEqual(d.schematic.banks, 0);
    assert.strictEqual(d.schematic.cells, 0);
    assert.strictEqual(d.schematic.present, false);
  }
});

test('a malformed cell count cannot produce a nonsense total', () => {
  const d = buildDiagnostics({
    geometry: null,
    schematic: { banks: [{ id: 'b', columns: 'TEST-NOT-A-NUMBER', rows: -5 }] },
  });
  assert.strictEqual(d.schematic.cells, 0);
});

test('building diagnostics never mutates its input', () => {
  const before = JSON.stringify(POISON);
  build();
  assert.strictEqual(JSON.stringify(POISON), before);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
