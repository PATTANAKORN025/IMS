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

// ── Equipment banks ──

const validBank = (extra) =>
  Object.assign(
    {
      id: 'bank-test-01',
      area_id: 'sch-test-area',
      at: { sx: 10, sy: 10 },
      schematic_width: 40,
      schematic_height: 80,
      columns: 2,
      rows: 5,
      orientation: 'VERTICAL',
      source_class: 'SCHEMATIC_OBSERVED',
      grouping_class: 'SCHEMATIC_PRESENTATION_GROUP',
      dimension_class: 'SCHEMATIC_DERIVED',
    },
    extra
  );

test('a bank emits exactly the documented key set', () => {
  const out = schematic.projectBank(validBank());
  assert.deepStrictEqual(Object.keys(out).sort(), [
    'area_id',
    'at',
    'cell_conflicts',
    'cell_values',
    'columns',
    'dimension_class',
    'grouping_class',
    'id',
    'label_orientation',
    'labels',
    'observed_in',
    'orientation',
    'rows',
    'schematic_height',
    'schematic_width',
    'source_class',
  ]);
});

test('bank dimensions are named schematic_* and never width/height', () => {
  // The naming is the guard. A value called schematic_width reads wrong the
  // moment anyone puts it near the measured model, where widths are metres.
  const out = schematic.projectBank(validBank());
  assert.strictEqual(out.width, undefined);
  assert.strictEqual(out.height, undefined);
  assert.strictEqual(out.schematic_width, 40);
});

test('a bank can only be a presentation group', () => {
  for (const claim of ['IMS_GROUP', 'MEASURED_GROUP', 'TEST-INVENTED']) {
    const out = schematic.projectBank(validBank({ grouping_class: claim }));
    assert.strictEqual(out.grouping_class, null, claim);
  }
});

test('a bank dimension can only be schematic-derived', () => {
  for (const claim of ['MEASURED', 'SURVEYED', 'TEST-INVENTED']) {
    const out = schematic.projectBank(validBank({ dimension_class: claim }));
    assert.strictEqual(out.dimension_class, null, claim);
  }
});

test('a bank carries no IMS identity, however it is supplied', () => {
  const out = schematic.projectBank(
    validBank({ ims_device_id: 'TEST-DEVICE-01', device_id: 'TEST-DEVICE-02', status: 'IMS_CONNECTED' })
  );
  const s = JSON.stringify(out);
  assert.ok(!s.includes('TEST-DEVICE'));
  assert.ok(!s.includes('IMS_CONNECTED'));
});

test('cell counts are bounded so a malformed record cannot ask for a million cells', () => {
  assert.strictEqual(schematic.projectBank(validBank({ columns: 10000 })), null);
  assert.strictEqual(schematic.projectBank(validBank({ rows: 0 })), null);
  assert.strictEqual(schematic.projectBank(validBank({ columns: 2.5 })), null);
  assert.strictEqual(schematic.projectBank(validBank({ rows: 'TEST-NOT-A-NUMBER' })), null);
});

test('a bank with no usable placement or size is withheld', () => {
  assert.strictEqual(schematic.projectBank(validBank({ at: null })), null);
  assert.strictEqual(schematic.projectBank(validBank({ schematic_width: 0 })), null);
  assert.strictEqual(schematic.projectBank(validBank({ schematic_height: NaN })), null);
  assert.strictEqual(schematic.projectBank(validBank({ id: 'TEST BANK ID' })), null);
});

test('an added private field on a bank is not carried', () => {
  const out = schematic.projectBank(validBank({ extraction_note: 'TEST-PRIVATE-NOTE' }));
  assert.ok(!JSON.stringify(out).includes('TEST-PRIVATE-NOTE'));
});

test('banks are served in a deterministic order', () => {
  const out = schematic.projectSchematic({
    banks: [validBank({ id: 'bank-c' }), validBank({ id: 'bank-a' }), validBank({ id: 'bank-b' })],
  });
  assert.deepStrictEqual(out.banks.map((b) => b.id), ['bank-a', 'bank-b', 'bank-c']);
});

test('a bank may belong to no named area', () => {
  // The reference puts a couple of blocks outside every labelled region. They
  // are still equipment on the drawing, so an absent area is carried as null
  // rather than withholding the bank or inventing an area to hold it.
  const out = schematic.projectBank(validBank({ area_id: null }));
  assert.notStrictEqual(out, null);
  assert.strictEqual(out.area_id, null);
});

test('an area reference that is not a safe token becomes none, not the raw value', () => {
  const out = schematic.projectBank(validBank({ area_id: 'TEST AREA REF' }));
  assert.strictEqual(out.area_id, null);
});

test('a horizontal bank keeps its orientation', () => {
  // Not every group on the drawing is a vertical stack; the orientation is
  // observed, so it is carried rather than assumed.
  const out = schematic.projectBank(validBank({ orientation: 'HORIZONTAL' }));
  assert.strictEqual(out.orientation, 'HORIZONTAL');
  const bogus = schematic.projectBank(validBank({ orientation: 'TEST-DIAGONAL' }));
  assert.strictEqual(bogus.orientation, null);
});

test('a rotated bank label keeps the orientation the drawing sets', () => {
  // Several labels on the reference read bottom-to-top beside their stack.
  // That is an observation about the drawing, carried rather than guessed.
  const out = schematic.projectBank(validBank({ label_orientation: 'VERTICAL' }));
  assert.strictEqual(out.label_orientation, 'VERTICAL');
});

test('an unrecognised label orientation is dropped, not echoed', () => {
  const out = schematic.projectBank(validBank({ label_orientation: 'TEST-SIDEWAYS' }));
  assert.strictEqual(out.label_orientation, null);
});

// ── Per-cell values, held per snapshot ──

test('cell values are kept per snapshot and never merged', () => {
  const out = schematic.projectBank(
    validBank({
      columns: 1,
      rows: 2,
      cell_values: { a: ['TEST-1', 'TEST-2'], b: ['TEST-9', 'TEST-2'] },
    })
  );
  assert.deepStrictEqual(out.cell_values.a, ['TEST-1', 'TEST-2']);
  assert.deepStrictEqual(out.cell_values.b, ['TEST-9', 'TEST-2']);
  // No third, reconciled reading exists anywhere in the output.
  assert.deepStrictEqual(Object.keys(out.cell_values).sort(), ['a', 'b']);
});

test('a disagreement between two snapshots is reported as a conflict', () => {
  const out = schematic.projectBank(
    validBank({ columns: 1, rows: 3, cell_values: { a: ['TEST-1', 'TEST-2', 'TEST-3'], b: ['TEST-9', 'TEST-2', 'TEST-8'] } })
  );
  assert.deepStrictEqual(out.cell_conflicts, [0, 2]);
});

test('one snapshot reading a cell the other did not is not a conflict', () => {
  // That is one transcription being less complete, not the sources disagreeing.
  const out = schematic.projectBank(
    validBank({ columns: 1, rows: 2, cell_values: { a: ['TEST-1', 'TEST-2'], b: [null, 'TEST-2'] } })
  );
  assert.deepStrictEqual(out.cell_conflicts, []);
});

test('an unread cell stays null rather than being filled in', () => {
  const out = schematic.projectBank(
    validBank({ columns: 1, rows: 2, cell_values: { a: ['TEST-1', null] } })
  );
  assert.deepStrictEqual(out.cell_values.a, ['TEST-1', null]);
});

test('a value array whose length does not match the cell count is refused whole', () => {
  // A misaligned array attributes every value to the wrong cell, which looks
  // exactly like correct data. Padding or truncating would hide that.
  const out = schematic.projectBank(
    validBank({ columns: 2, rows: 5, cell_values: { a: ['TEST-1', 'TEST-2'] } })
  );
  assert.deepStrictEqual(out.cell_values, {});
});

test('free text in a cell value is dropped, not echoed', () => {
  const out = schematic.projectBank(
    validBank({ columns: 1, rows: 2, cell_values: { a: ['TEST-OK', 'TEST-PRIVATE-NOTE about this cell'] } })
  );
  assert.deepStrictEqual(out.cell_values.a, ['TEST-OK', null]);
});

test('a snapshot key that is not a safe token is dropped', () => {
  const out = schematic.projectBank(
    validBank({ columns: 1, rows: 1, cell_values: { 'TEST SNAP': ['TEST-1'], __proto__: ['TEST-2'] } })
  );
  assert.deepStrictEqual(Object.keys(out.cell_values), []);
});

test('a bank with no transcribed values reports none rather than empty strings', () => {
  const out = schematic.projectBank(validBank());
  assert.deepStrictEqual(out.cell_values, {});
  assert.deepStrictEqual(out.cell_conflicts, []);
});

test('a dimension annotation declares its class so it cannot read as a length', () => {
  const dim = schematic.projectAnnotation({ kind: 'DIMENSION', at: { sx: 1, sy: 1 }, text: '750' });
  assert.strictEqual(dim.annotation_class, 'SCHEMATIC_ANNOTATION');
  const other = schematic.projectAnnotation({ kind: 'LEGEND', at: { sx: 1, sy: 1 } });
  assert.strictEqual(other.annotation_class, null);
});

// ── Drawing labels ──

test('a drawing label is its own class and never an identity', () => {
  const out = schematic.projectLabel({ text: 'TEST-LABEL' });
  assert.strictEqual(out.class, 'SCHEMATIC_OBSERVED_LABEL');
  assert.deepStrictEqual(Object.keys(out).sort(), ['ambiguous', 'class', 'text', 'variants']);
});

test('an ambiguous label keeps both readings rather than picking one', () => {
  // The two renders disagree by a single glyph in several places. Choosing the
  // tidier spelling would be inventing a transcription.
  const out = schematic.projectLabel({
    text: 'TEST-A01',
    ambiguous: true,
    variants: ['TEST-A01', 'TEST-B01'],
  });
  assert.strictEqual(out.ambiguous, true);
  assert.deepStrictEqual(out.variants, ['TEST-A01', 'TEST-B01']);
});

test('ambiguity is never inferred, only carried when the source says so', () => {
  const out = schematic.projectLabel({ text: 'TEST-A01', ambiguous: 'yes' });
  assert.strictEqual(out.ambiguous, false);
});

test('a label that is not a safe token is withheld', () => {
  assert.strictEqual(schematic.projectLabel({ text: 'TEST LABEL with prose' }), null);
  assert.strictEqual(schematic.projectLabel({ text: 'C:/TEST/PATH' }), null);
  assert.strictEqual(schematic.projectLabel(null), null);
});

test('an unusable label does not withhold the bank it belongs to', () => {
  const out = schematic.projectBank(
    validBank({ labels: [{ text: 'TEST-PRIVATE-NOTE about this bank' }, { text: 'TEST-OK' }] })
  );
  assert.strictEqual(out.labels.length, 1);
  assert.strictEqual(out.labels[0].text, 'TEST-OK');
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
  assert.deepStrictEqual(Object.keys(out).sort(), [
    'annotation_class',
    'at',
    'kind',
    'observed_in',
    'text',
    'to',
  ]);
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
