/**
 * Unit tests for the factory twin's physical identity mapping contract.
 *
 * This is the one place the twin's three identifier namespaces are allowed to
 * be related to each other, so its refusals matter more than its acceptances:
 * most of these tests assert that something is REJECTED.
 *
 * All identifiers here are synthetic (TEST-*). No production identifier
 * appears in this file.
 *
 * Run: node tests/unit/factory-twin-mapping.test.js
 */

'use strict';

const assert = require('assert');
const { MappingStatus, validateMappings } = require('../../services/factory-twin-3d/lib/mapping');

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

function unresolved(overrides = {}) {
  return {
    physical_slot_id: 'TEST-SLOT-001',
    ims_device_id: null,
    mes_machine_id: null,
    mapping_status: MappingStatus.UNRESOLVED,
    confidence: 'unknown',
    source: null,
    source_record: null,
    verified_at: null,
    ...overrides,
  };
}

function confirmed(overrides = {}) {
  return unresolved({
    ims_device_id: 'TEST-IMS-001',
    mes_machine_id: 'TEST-MES-001',
    mapping_status: MappingStatus.CONFIRMED,
    confidence: 'high',
    source: 'synthetic-fixture',
    source_record: 'row-1',
    verified_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

const hasError = (res, needle) => res.errors.some((e) => e.includes(needle));

// ── accepts what it should ──
test('an unresolved record with no identity is valid', () => {
  const res = validateMappings([unresolved()]);
  assert.ok(res.ok, res.errors.join('; '));
  assert.strictEqual(res.counts.unresolved, 1);
});

test('a fully provenanced confirmed record is valid', () => {
  const res = validateMappings([confirmed()]);
  assert.ok(res.ok, res.errors.join('; '));
  assert.strictEqual(res.counts.confirmed, 1);
});

test('an empty set is valid and counts zero', () => {
  const res = validateMappings([]);
  assert.ok(res.ok);
  assert.strictEqual(res.counts.total, 0);
});

// ── refuses identity without provenance ──
test('confirmed without source is rejected', () => {
  const res = validateMappings([confirmed({ source: null })]);
  assert.ok(!res.ok);
  assert.ok(hasError(res, 'requires source'));
});

test('confirmed without source_record is rejected', () => {
  const res = validateMappings([confirmed({ source_record: null })]);
  assert.ok(hasError(res, 'requires source_record'));
});

test('confirmed without verified_at is rejected', () => {
  const res = validateMappings([confirmed({ verified_at: null })]);
  assert.ok(hasError(res, 'requires verified_at'));
});

test('confirmed with a malformed timestamp is rejected', () => {
  const res = validateMappings([confirmed({ verified_at: 'last tuesday' })]);
  assert.ok(hasError(res, 'not a valid ISO-8601'));
});

test('confirmed asserting no identity at all is rejected', () => {
  const res = validateMappings([confirmed({ ims_device_id: null, mes_machine_id: null })]);
  assert.ok(hasError(res, 'asserts no ims_device_id and no mes_machine_id'));
});

// ── refuses collisions ──
test('duplicate physical_slot_id is rejected', () => {
  const res = validateMappings([unresolved(), unresolved()]);
  assert.ok(hasError(res, 'duplicate physical_slot_id'));
});

test('one device confirmed on two slots is rejected', () => {
  const res = validateMappings([
    confirmed({ physical_slot_id: 'TEST-SLOT-001', mes_machine_id: null }),
    confirmed({ physical_slot_id: 'TEST-SLOT-002', mes_machine_id: null }),
  ]);
  assert.ok(hasError(res, 'is already confirmed on'));
});

test('one MES machine confirmed on two slots is rejected', () => {
  const res = validateMappings([
    confirmed({ physical_slot_id: 'TEST-SLOT-001', ims_device_id: null }),
    confirmed({ physical_slot_id: 'TEST-SLOT-002', ims_device_id: null }),
  ]);
  assert.ok(hasError(res, 'is already confirmed on'));
});

// ── refuses namespace confusion ──
test('an IMS id pasted into the slot field is rejected', () => {
  const res = validateMappings([unresolved({ physical_slot_id: 'TEST-IMS-001' })]);
  assert.ok(hasError(res, 'does not match the slot namespace'));
});

test('a slot id used where a MES id belongs is rejected', () => {
  const res = validateMappings([confirmed({ mes_machine_id: 'TEST SLOT 001!' })]);
  assert.ok(hasError(res, 'does not match the mes_machine_id namespace'));
});

test('a slot not present in the geometry is rejected when the set is supplied', () => {
  const res = validateMappings([unresolved()], { knownSlotIds: new Set(['TEST-SLOT-999']) });
  assert.ok(hasError(res, 'does not exist in the geometry'));
});

// ── refuses malformed input ──
test('an unknown status is rejected', () => {
  const res = validateMappings([unresolved({ mapping_status: 'probably' })]);
  assert.ok(hasError(res, 'invalid mapping_status'));
});

test('an unknown confidence is rejected', () => {
  const res = validateMappings([unresolved({ confidence: 'pretty sure' })]);
  assert.ok(hasError(res, 'invalid confidence'));
});

test('a missing physical_slot_id is rejected', () => {
  const res = validateMappings([unresolved({ physical_slot_id: undefined })]);
  assert.ok(hasError(res, 'physical_slot_id is required'));
});

test('a non-array input is rejected rather than thrown on', () => {
  const res = validateMappings(null);
  assert.ok(!res.ok);
  assert.ok(hasError(res, 'must be an array'));
});

// ── the guarantee that matters ──
test('validation never invents identity: input records are not mutated', () => {
  const rec = unresolved();
  const snapshot = JSON.stringify(rec);
  validateMappings([rec]);
  assert.strictEqual(JSON.stringify(rec), snapshot);
});

test('validation is deterministic for the same input', () => {
  const build = () => [confirmed({ source: null }), unresolved({ physical_slot_id: 'TEST-SLOT-002' })];
  assert.deepStrictEqual(validateMappings(build()), validateMappings(build()));
});

test('conflicting and deprecated are representable without provenance rules firing', () => {
  const res = validateMappings([
    unresolved({ mapping_status: MappingStatus.CONFLICTING }),
    unresolved({ physical_slot_id: 'TEST-SLOT-002', mapping_status: MappingStatus.DEPRECATED }),
  ]);
  assert.ok(res.ok, res.errors.join('; '));
  assert.strictEqual(res.counts.conflicting, 1);
  assert.strictEqual(res.counts.deprecated, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
