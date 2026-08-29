/**
 * Schematic layer contract tests — services/factory-twin-3d/lib/schematic.js
 *
 * The schematic layer exists to reproduce a drawing, and the single thing that
 * makes it safe is that it can never be mistaken for the measured model. These
 * tests are mostly about that boundary rather than about shapes: that schematic
 * coordinates cannot become physical ones, that a schematic observation cannot
 * become a confirmed mapping, and that two conflicting renders are never merged
 * into one story.
 *
 * All fixture values are obviously synthetic (TEST-*) so nothing here resembles
 * real facility data and a leak scanner hit is unambiguous.
 *
 * Run: node tests/unit/factory-twin-schematic.test.js
 */

'use strict';

const assert = require('assert');
const schematic = require('../../services/factory-twin-3d/lib/schematic');
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

const square = [
  { sx: 0, sy: 0 },
  { sx: 10, sy: 0 },
  { sx: 10, sy: 10 },
  { sx: 0, sy: 10 },
];

console.log('\nFactory Twin Schematic Layer Tests\n');

// ── The boundary that makes this layer safe ──

test('the payload names its own coordinate space', () => {
  // A consumer that only ever sees the response must still know these numbers
  // are not metres.
  const out = schematic.projectSchematic({});
  assert.strictEqual(out.coordinate_space, 'SCHEMATIC_NOT_PHYSICAL');
});

test('schematic points use sx/sy and never x/y/z', () => {
  // The field names are the guard: a value from this layer cannot be read as a
  // physical position by code expecting position.x, because it has no x.
  const p = schematic.point({ sx: 5, sy: 6 });
  assert.deepStrictEqual(Object.keys(p).sort(), ['sx', 'sy']);
  assert.strictEqual(p.x, undefined);
  assert.strictEqual(p.z, undefined);
});

test('a physical position is not accepted as a schematic point', () => {
  // The measured model's shape must fail here rather than be silently adopted.
  assert.strictEqual(schematic.point({ x: 5, y: 0, z: 6 }), null);
});

test('a schematic point is not accepted as a physical position', () => {
  // And the reverse: lib/wire's guards must reject a schematic point.
  assert.strictEqual(wire.projectSlot({ slot_id: 'slot-1', position: { sx: 5, sy: 6 } }, {}), null);
});

test('a coordinate outside the schematic extent is refused', () => {
  // A stray metre value or a raw pixel value lands outside 0..1000 and is
  // rejected rather than drawn somewhere absurd.
  assert.strictEqual(schematic.point({ sx: -1, sy: 5 }), null);
  assert.strictEqual(schematic.point({ sx: 1001, sy: 5 }), null);
  assert.strictEqual(schematic.point({ sx: 5, sy: 2874 }), null);
});

test('NaN and Infinity are refused as schematic coordinates', () => {
  assert.strictEqual(schematic.point({ sx: NaN, sy: 5 }), null);
  assert.strictEqual(schematic.point({ sx: 5, sy: Infinity }), null);
  assert.strictEqual(schematic.point({ sx: '5', sy: '6' }), null);
});

// ── Evidence class ──

test('SCHEMATIC_OBSERVED is the only class this layer can express', () => {
  assert.deepStrictEqual(Object.keys(schematic.SOURCE_CLASS), ['SCHEMATIC_OBSERVED']);
});

test('a schematic record cannot claim MEASURED or CONFIRMED', () => {
  for (const claim of ['MEASURED', 'CONFIRMED', 'DERIVED', 'TEST-INVENTED-CLASS']) {
    const out = schematic.projectArea({
      id: 'sch-test',
      name: 'TEST AREA',
      source_class: claim,
      vertices: square,
    });
    assert.strictEqual(out.source_class, null, `${claim} was carried`);
  }
});

test('an area carries no device or machine identity at all', () => {
  const out = schematic.projectArea({
    id: 'sch-test',
    name: 'TEST AREA',
    source_class: 'SCHEMATIC_OBSERVED',
    vertices: square,
    ims_device_id: 'TEST-DEVICE-01',
    status: 'IMS_CONNECTED',
    confirmed: true,
  });
  assert.deepStrictEqual(Object.keys(out).sort(), [
    'confidence',
    'id',
    'label_at',
    'name',
    'observed_in',
    'source_class',
    'vertices',
  ]);
  assert.ok(!JSON.stringify(out).includes('TEST-DEVICE-01'));
  assert.ok(!JSON.stringify(out).includes('IMS_CONNECTED'));
});

// ── Free text and unknown fields ──

test('an added private field on an area is not carried', () => {
  const out = schematic.projectArea({
    id: 'sch-test',
    name: 'TEST AREA',
    vertices: square,
    source_file: 'TEST-SOURCE-PATH',
    extraction_note: 'TEST-PRIVATE-NOTE',
  });
  assert.ok(!JSON.stringify(out).includes('TEST-'.concat('SOURCE-PATH')));
  assert.ok(!JSON.stringify(out).includes('TEST-PRIVATE-NOTE'));
});

test('a transcription note on the document is not carried', () => {
  const out = schematic.projectSchematic({
    transcription_note: 'TEST-PRIVATE-NOTE',
    generated_from: 'TEST-SOURCE-PATH',
    coordinate_system: { why: 'TEST-PRIVATE-NOTE' },
    areas: [],
  });
  assert.ok(!JSON.stringify(out).includes('TEST-'));
});

test('an area name goes through the same display-name guard as a zone', () => {
  const lower = schematic.projectArea({ id: 'sch-a', name: 'TEST-Private note', vertices: square });
  assert.strictEqual(lower.name, null);
  const ok = schematic.projectArea({ id: 'sch-b', name: 'TEST AREA', vertices: square });
  assert.strictEqual(ok.name, 'TEST AREA');
});

test('an area id that is not a safe token withholds the area', () => {
  assert.strictEqual(schematic.projectArea({ id: 'TEST AREA ID', vertices: square }), null);
  assert.strictEqual(schematic.projectArea({ id: '__proto__', vertices: square }), null);
});

test('prototype keys cannot ride out on snapshot references', () => {
  const out = schematic.projectArea({
    id: 'sch-test',
    vertices: square,
    observed_in: ['__proto__', 'constructor', 'frool1'],
  });
  assert.deepStrictEqual(out.observed_in, ['constructor', 'frool1']);
  // `constructor` is a legitimate token shape, so it survives the guard -- but
  // it is only ever data here, never used to look anything up.
  assert.ok(!out.observed_in.includes('__proto__'));
});

// ── Rings ──

test('one unusable vertex withholds the whole ring', () => {
  assert.strictEqual(
    schematic.projectBoundary({ vertices: [{ sx: 0, sy: 0 }, { sx: 1, sy: NaN }, { sx: 1, sy: 1 }] }),
    null
  );
});

test('a ring below three vertices is withheld', () => {
  assert.strictEqual(schematic.projectBoundary({ vertices: [{ sx: 0, sy: 0 }, { sx: 1, sy: 1 }] }), null);
  assert.strictEqual(schematic.projectArea({ id: 'sch-a', vertices: [] }), null);
});

// ── Snapshots and the conflict ──

test('two snapshots coexist and each records the conflict', () => {
  const out = schematic.projectSchematic({
    snapshots: [
      { id: 'frool1', label: 'FROOL1', source_class: 'SCHEMATIC_OBSERVED', conflicts_with: ['frooldwg'] },
      { id: 'frooldwg', label: 'FROOLDWG', source_class: 'SCHEMATIC_OBSERVED', conflicts_with: ['frool1'] },
    ],
  });
  assert.strictEqual(out.snapshots.length, 2);
  assert.deepStrictEqual(out.snapshots[0].conflicts_with, ['frooldwg']);
  assert.deepStrictEqual(out.snapshots[1].conflicts_with, ['frool1']);
});

test('snapshots are never merged into a single state', () => {
  // Two renders claiming one instant and disagreeing is a conflict, not an
  // average. The projection has no code path that combines them.
  const out = schematic.projectSchematic({
    snapshots: [
      { id: 'frool1', timestamp_observed: '2026-08-26T15:34:07' },
      { id: 'frooldwg', timestamp_observed: '2026-08-26T15:34:07' },
    ],
  });
  assert.strictEqual(out.snapshots.length, 2);
  assert.notStrictEqual(out.snapshots[0].id, out.snapshots[1].id);
});

test('a snapshot note is not carried, only the fact of the conflict', () => {
  const out = schematic.projectSnapshot({
    id: 'frool1',
    note: 'TEST-PRIVATE-NOTE about which render to trust',
    conflicts_with: ['frooldwg'],
  });
  assert.ok(!JSON.stringify(out).includes('TEST-PRIVATE-NOTE'));
  assert.deepStrictEqual(out.conflicts_with, ['frooldwg']);
});

// ── Annotations ──

test('an annotation kind is a fixed enum, not echoed input', () => {
  assert.strictEqual(schematic.projectAnnotation({ kind: 'TEST-INVENTED', at: { sx: 1, sy: 1 } }), null);
  const ok = schematic.projectAnnotation({ kind: 'LEGEND', at: { sx: 1, sy: 1 } });
  assert.strictEqual(ok.kind, 'LEGEND');
});

test('a dimension carries its printed text and no converted value', () => {
  // The drawing states no scale. The number is the text on the drawing; it is
  // never turned into a length.
  const out = schematic.projectAnnotation({
    kind: 'DIMENSION',
    at: { sx: 1, sy: 1 },
    to: { sx: 5, sy: 1 },
    text: '750',
    metres: 0.75,
    mm: 750,
  });
  assert.deepStrictEqual(Object.keys(out).sort(), ['at', 'kind', 'observed_in', 'text', 'to']);
  assert.strictEqual(out.text, '750');
  assert.strictEqual(out.metres, undefined);
  assert.strictEqual(out.mm, undefined);
});

test('free text in a dimension label is dropped', () => {
  const out = schematic.projectAnnotation({
    kind: 'DIMENSION',
    at: { sx: 1, sy: 1 },
    text: 'TEST 750 mm measured from the north wall',
  });
  assert.strictEqual(out.text, null);
});

// ── Degrades safely ──

test('an absent schematic document yields an empty but valid shape', () => {
  const out = schematic.projectSchematic(null);
  assert.strictEqual(out.coordinate_space, 'SCHEMATIC_NOT_PHYSICAL');
  assert.deepStrictEqual(out.areas, []);
  assert.deepStrictEqual(out.snapshots, []);
  assert.deepStrictEqual(out.annotations, []);
  assert.strictEqual(out.boundary, null);
});

test('wrong types throughout produce an empty shape rather than throwing', () => {
  const out = schematic.projectSchematic({
    snapshots: 'TEST-NOT-AN-ARRAY',
    areas: { nope: true },
    annotations: 42,
    boundary: 'TEST-NOT-AN-OBJECT',
  });
  assert.deepStrictEqual(out.areas, []);
  assert.deepStrictEqual(out.snapshots, []);
  assert.deepStrictEqual(out.annotations, []);
  assert.strictEqual(out.boundary, null);
});

test('projection never mutates its input', () => {
  const doc = {
    areas: [{ id: 'sch-a', name: 'TEST AREA', vertices: square, note: 'TEST-PRIVATE-NOTE' }],
  };
  const before = JSON.stringify(doc);
  schematic.projectSchematic(doc);
  assert.strictEqual(JSON.stringify(doc), before);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
