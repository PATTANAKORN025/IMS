/**
 * Unit tests for the factory twin's physical identity mapping contract
 * (FT-14: the canonical identity engine for both the legacy anonymous-slot
 * grid and the CAD equipment/component layer).
 *
 * This is the one place the twin's three identifier namespaces are allowed to
 * be related to each other, so its refusals matter more than its acceptances:
 * most of these tests assert that something is REJECTED.
 *
 * All identifiers here are synthetic (TEST-* / EQP-F1-9xxx). No production
 * identifier appears in this file.
 *
 * Run: node tests/unit/factory-twin-mapping.test.js
 */

'use strict';

const assert = require('assert');
const {
  MappingStatus, UNRESOLVED_RECORD, validateMappings, resolveMapping, eligibility,
} = require('../../services/factory-twin-3d/lib/mapping');

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
    asset_id: 'TEST-SLOT-001',
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

test('a CAD equipment asset_id is accepted, same as a legacy slot id', () => {
  const res = validateMappings([unresolved({ asset_id: 'EQP-F1-0308' })]);
  assert.ok(res.ok, res.errors.join('; '));
});

test('a CAD component asset_id (station/line child) is accepted', () => {
  const res = validateMappings([unresolved({ asset_id: 'EQP-F1-0002-C01' })]);
  assert.ok(res.ok, res.errors.join('; '));
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
test('duplicate asset_id is rejected', () => {
  const res = validateMappings([unresolved(), unresolved()]);
  assert.ok(hasError(res, 'duplicate asset_id'));
});

test('one device confirmed on two assets (duplicate IMS identity) is rejected', () => {
  const res = validateMappings([
    confirmed({ asset_id: 'TEST-SLOT-001', mes_machine_id: null }),
    confirmed({ asset_id: 'TEST-SLOT-002', mes_machine_id: null }),
  ]);
  assert.ok(hasError(res, 'is already confirmed on'));
});

test('one MES machine confirmed on two assets is rejected', () => {
  const res = validateMappings([
    confirmed({ asset_id: 'TEST-SLOT-001', ims_device_id: null }),
    confirmed({ asset_id: 'TEST-SLOT-002', ims_device_id: null }),
  ]);
  assert.ok(hasError(res, 'is already confirmed on'));
});

test('a station parent and its own child both confirmed to the same device is rejected the same way', () => {
  // No special-casing for a PHYSICAL_STATION/PRODUCTION_LINE parent-child
  // pair -- this module does not know or care about that relationship; two
  // asset_ids claiming one device is the same collision either way.
  const res = validateMappings([
    confirmed({ asset_id: 'EQP-F1-0002', mes_machine_id: null }),
    confirmed({ asset_id: 'EQP-F1-0002-C01', mes_machine_id: null }),
  ]);
  assert.ok(hasError(res, 'is already confirmed on'));
});

// ── refuses namespace confusion ──
test('an IMS id pasted into the asset field is rejected', () => {
  const res = validateMappings([unresolved({ asset_id: 'TEST-IMS-001' })]);
  assert.ok(hasError(res, 'does not match the asset namespace'));
});

test('a slot id used where a MES id belongs is rejected', () => {
  const res = validateMappings([confirmed({ mes_machine_id: 'TEST SLOT 001!' })]);
  assert.ok(hasError(res, 'does not match the mes_machine_id namespace'));
});

test('an asset not present in the geometry is rejected when the set is supplied', () => {
  const res = validateMappings([unresolved()], { knownAssetIds: new Set(['TEST-SLOT-999']) });
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

test('a missing asset_id is rejected', () => {
  const res = validateMappings([unresolved({ asset_id: undefined })]);
  assert.ok(hasError(res, 'asset_id is required'));
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
  const build = () => [confirmed({ source: null }), unresolved({ asset_id: 'TEST-SLOT-002' })];
  assert.deepStrictEqual(validateMappings(build()), validateMappings(build()));
});

test('conflicting and deprecated are representable without provenance rules firing', () => {
  const res = validateMappings([
    unresolved({ mapping_status: MappingStatus.CONFLICTING }),
    unresolved({ asset_id: 'TEST-SLOT-002', mapping_status: MappingStatus.DEPRECATED }),
  ]);
  assert.ok(res.ok, res.errors.join('; '));
  assert.strictEqual(res.counts.conflicting, 1);
  assert.strictEqual(res.counts.deprecated, 1);
});

// ── resolveMapping: the runtime lookup ──
test('resolveMapping returns UNRESOLVED_RECORD for an asset with no entry', () => {
  assert.deepStrictEqual(resolveMapping({}, 'EQP-F1-0308'), UNRESOLVED_RECORD);
});

test('resolveMapping returns UNRESOLVED_RECORD for a hostile/inherited key', () => {
  assert.deepStrictEqual(resolveMapping({}, '__proto__'), UNRESOLVED_RECORD);
  assert.deepStrictEqual(resolveMapping({}, 'constructor'), UNRESOLVED_RECORD);
  const polluted = JSON.parse('{"__proto__": {"mapping_status": "confirmed", "ims_device_id": "TEST-FAKE"}}');
  assert.deepStrictEqual(resolveMapping(polluted, '__proto__'), UNRESOLVED_RECORD);
});

test('resolveMapping returns UNRESOLVED_RECORD for a malformed table', () => {
  assert.deepStrictEqual(resolveMapping(null, 'EQP-F1-0308'), UNRESOLVED_RECORD);
  assert.deepStrictEqual(resolveMapping('not an object', 'EQP-F1-0308'), UNRESOLVED_RECORD);
});

test('resolveMapping returns the real record for a validated confirmed entry', () => {
  const rec = confirmed({ asset_id: 'EQP-F1-0308' });
  const out = resolveMapping({ 'EQP-F1-0308': rec }, 'EQP-F1-0308');
  assert.strictEqual(out, rec);
});

test('a PHYSICAL_COMPONENT child never resolves through its parent station\'s entry', () => {
  const table = { 'EQP-F1-0002': confirmed({ asset_id: 'EQP-F1-0002' }) };
  assert.deepStrictEqual(resolveMapping(table, 'EQP-F1-0002-C01'), UNRESOLVED_RECORD);
});

test('a PRODUCTION_LINE child never resolves through its parent line\'s entry', () => {
  const table = { 'EQP-F1-0306': confirmed({ asset_id: 'EQP-F1-0306' }) };
  assert.deepStrictEqual(resolveMapping(table, 'EQP-F1-0306-C01'), UNRESOLVED_RECORD);
});

test('an IMS-only identity (device known, no CAD asset claims it) is simply absent from the table -- never fabricated onto an unrelated asset', () => {
  // The table is keyed by asset_id; a device with no confirmed asset behind
  // it has no entry to be found under any asset_id, by construction. There
  // is no code path that could "match" it to one.
  const table = {};
  assert.deepStrictEqual(resolveMapping(table, 'EQP-F1-0308'), UNRESOLVED_RECORD);
});

// ── eligibility: the one gate FT-15+ must consult ──
test('eligibility is true in every dimension only for confirmed', () => {
  assert.deepStrictEqual(eligibility(MappingStatus.CONFIRMED), {
    live_status_eligible: true, alarm_eligible: true, drill_down_eligible: true,
  });
});

for (const status of [MappingStatus.UNRESOLVED, MappingStatus.CONFLICTING, MappingStatus.DEPRECATED]) {
  test(`eligibility is false in every dimension for ${status}`, () => {
    assert.deepStrictEqual(eligibility(status), {
      live_status_eligible: false, alarm_eligible: false, drill_down_eligible: false,
    });
  });
}

test('eligibility never throws and defaults closed for an unrecognised status', () => {
  assert.deepStrictEqual(eligibility('made-up-status'), {
    live_status_eligible: false, alarm_eligible: false, drill_down_eligible: false,
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
