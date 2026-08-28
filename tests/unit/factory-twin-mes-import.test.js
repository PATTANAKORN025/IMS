/**
 * Unit tests for the factory twin's MES import boundary.
 *
 * The boundary's job is to refuse, so most of these assert refusal: an import
 * must not assign geometry, must not assert device identity, and must not
 * confirm a mapping on the export's own authority.
 *
 * All identifiers are synthetic (TEST-*). No real MES export exists and none
 * is fabricated here.
 *
 * Run: node tests/unit/factory-twin-mes-import.test.js
 */

'use strict';

const assert = require('assert');
const { MesImportState, planImport } = require('../../services/factory-twin-3d/lib/mes-import');
const { validateMappings } = require('../../services/factory-twin-3d/lib/mapping');

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

const rec = (o = {}) => ({ mes_id: 'TEST-MES-001', process_group: 'TEST-GROUP', status: 'RUN', ...o });
const KNOWN = new Set(['TEST-SLOT-001', 'TEST-SLOT-002']);
const hasError = (p, needle) => p.errors.some((e) => e.includes(needle));

// ── accepts what it should ──
test('a valid record with no slot is accepted as unmapped', () => {
  const p = planImport([rec()]);
  assert.strictEqual(p.counts.unmapped, 1);
  assert.strictEqual(p.rejected.length, 0);
  assert.strictEqual(p.accepted[0].mapping, null);
});

test('an export proposing a slot yields a CANDIDATE, never a confirmation', () => {
  const p = planImport([rec({ physical_slot_id: 'TEST-SLOT-001' })], { knownSlotIds: KNOWN });
  assert.strictEqual(p.counts.candidate, 1);
  assert.strictEqual(p.counts.confirmed, 0);
  assert.strictEqual(p.accepted[0].state, MesImportState.CANDIDATE);
  assert.strictEqual(p.accepted[0].mapping.mapping_status, 'unresolved');
});

test('CONFIRMED requires caller approval AND provenance', () => {
  const base = [rec({ physical_slot_id: 'TEST-SLOT-001' })];
  // approval alone is not enough
  assert.strictEqual(planImport(base, { knownSlotIds: KNOWN, approveMappings: true }).counts.confirmed, 0);
  // provenance alone is not enough
  assert.strictEqual(
    planImport(base, { knownSlotIds: KNOWN, source: 's', verifiedAt: '2026-01-01T00:00:00Z' }).counts.confirmed,
    0
  );
  const ok = planImport(base, {
    knownSlotIds: KNOWN, approveMappings: true, source: 'synthetic', verifiedAt: '2026-01-01T00:00:00Z',
  });
  assert.strictEqual(ok.counts.confirmed, 1);
});

test('emitted confirmed mappings satisfy the mapping contract', () => {
  const p = planImport([rec({ physical_slot_id: 'TEST-SLOT-001' })], {
    knownSlotIds: KNOWN, approveMappings: true, source: 'synthetic', verifiedAt: '2026-01-01T00:00:00Z',
  });
  const res = validateMappings(p.accepted.map((a) => a.mapping).filter(Boolean));
  assert.ok(res.ok, res.errors.join('; '));
});

// ── refuses to touch geometry or device identity ──
test('a record carrying geometry is rejected', () => {
  for (const field of ['position', 'x', 'z', 'footprint', 'width', 'depth', 'rotation']) {
    const p = planImport([rec({ [field]: 1 })]);
    assert.ok(hasError(p, 'never assign or modify geometry'), `${field} not rejected`);
  }
});

test('a record asserting a device id is rejected', () => {
  const p = planImport([rec({ ims_device_id: 'TEST-IMS-001' })]);
  assert.ok(hasError(p, 'separate namespace'));
});

test('no plan ever reports a geometry write', () => {
  const p = planImport([rec({ physical_slot_id: 'TEST-SLOT-001' })], {
    knownSlotIds: KNOWN, approveMappings: true, source: 's', verifiedAt: '2026-01-01T00:00:00Z',
  });
  assert.strictEqual(p.geometryWrites, 0);
});

test('a confirmed mapping from an import never asserts a device id', () => {
  const p = planImport([rec({ physical_slot_id: 'TEST-SLOT-001' })], {
    knownSlotIds: KNOWN, approveMappings: true, source: 's', verifiedAt: '2026-01-01T00:00:00Z',
  });
  assert.strictEqual(p.accepted[0].mapping.ims_device_id, null);
});

// ── refuses collisions and malformed input ──
test('a duplicate mes_id is rejected', () => {
  const p = planImport([rec(), rec()]);
  assert.ok(hasError(p, 'duplicate mes_id'));
});

test('two records claiming the same slot is rejected', () => {
  const p = planImport(
    [rec({ physical_slot_id: 'TEST-SLOT-001' }), rec({ mes_id: 'TEST-MES-002', physical_slot_id: 'TEST-SLOT-001' })],
    { knownSlotIds: KNOWN }
  );
  assert.ok(hasError(p, 'already claimed by'));
});

test('a slot with a standing confirmed mapping is reported as a conflict, not overwritten', () => {
  const p = planImport([rec({ mes_id: 'TEST-MES-009', physical_slot_id: 'TEST-SLOT-001' })], {
    knownSlotIds: KNOWN,
    confirmedSlotToMes: new Map([['TEST-SLOT-001', 'TEST-MES-001']]),
    approveMappings: true, source: 's', verifiedAt: '2026-01-01T00:00:00Z',
  });
  assert.strictEqual(p.conflicts.length, 1);
  assert.strictEqual(p.counts.confirmed, 0);
  assert.ok(hasError(p, 'already has a confirmed mapping'));
});

test('a slot absent from the geometry is rejected', () => {
  const p = planImport([rec({ physical_slot_id: 'TEST-SLOT-999' })], { knownSlotIds: KNOWN });
  assert.ok(hasError(p, 'does not exist in the geometry'));
});

test('a malformed record is rejected', () => {
  assert.ok(hasError(planImport([rec({ mes_id: 'bad id!' })]), 'not a valid MES identifier'));
  assert.ok(hasError(planImport([rec({ process_group: undefined })]), 'process_group'));
  assert.ok(hasError(planImport([rec({ source_timestamp: 'yesterday' })]), 'not a valid ISO-8601'));
  assert.ok(hasError(planImport([null]), 'not an object'));
});

test('a non-array export is rejected rather than thrown on', () => {
  const p = planImport('not an array');
  assert.ok(p.errors.some((e) => e.includes('must be an array')));
});

// ── the guarantees that matter ──
test('planning is a dry run and mutates nothing', () => {
  const input = [rec({ physical_slot_id: 'TEST-SLOT-001' })];
  const before = JSON.stringify(input);
  const p = planImport(input, { knownSlotIds: KNOWN });
  assert.strictEqual(JSON.stringify(input), before);
  assert.strictEqual(p.dryRun, true);
});

test('planning is deterministic for the same input', () => {
  const build = () => [rec({ physical_slot_id: 'TEST-SLOT-001' }), rec({ mes_id: 'TEST-MES-002' })];
  assert.deepStrictEqual(planImport(build(), { knownSlotIds: KNOWN }), planImport(build(), { knownSlotIds: KNOWN }));
});

test('rejected records never appear in accepted', () => {
  const p = planImport([rec({ x: 1 }), rec({ mes_id: 'TEST-MES-002' })]);
  assert.strictEqual(p.accepted.length, 1);
  assert.strictEqual(p.accepted[0].mes_id, 'TEST-MES-002');
  assert.strictEqual(p.counts.rejected, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
