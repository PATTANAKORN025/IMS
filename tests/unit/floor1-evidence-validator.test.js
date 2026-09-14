/**
 * Phase 10A -- unit tests for the Floor 1 evidence intake gate
 * (services/factory-twin-3d/lib/floor1-evidence-validator.js).
 *
 * Every value here is obviously synthetic. No real drawing, device,
 * machine, custodian or filename appears in this file.
 *
 * Run: node tests/unit/floor1-evidence-validator.test.js
 */

'use strict';

const assert = require('assert');
const V = require('../../services/factory-twin-3d/lib/floor1-evidence-validator');

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

/** A complete, promotion-eligible baseline -- every negative case mutates this. */
const complete = (over = {}) => ({
  factoryTwinAssetId: 'EQP-F1-9001',
  equipmentId: 'MES-UNIT-01',
  physicalAssetId: 'PHYS-UNIT-01',
  deviceId: 'DEV-UNIT-01',
  sourceSystemId: 'SRC-SYS-01',
  evidenceType: 'DIRECT_SYSTEM_RECORD',
  evidenceLocation: 'test-fixture://intake/01',
  sourceSystem: 'test-mes-export',
  sourceRecord: 'row-0001',
  provenance: 'synthetic test fixture, not a real evidence claim',
  verifiedBy: 'test-reviewer',
  verifiedAt: '2026-09-01T00:00:00Z',
  ...over,
});

// 1. empty record
test('empty record: missing factoryTwinAssetId -> invalid, INVALID', () => {
  const r = V.validateEvidenceRecord({});
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('factoryTwinAssetId')));
  assert.strictEqual(r.promotionEligible, false);
  assert.strictEqual(r.mappingStatus, V.MappingStatus.INVALID);
});

test('null/non-object record -> invalid, INVALID, never throws', () => {
  const r = V.validateEvidenceRecord(null);
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.mappingStatus, V.MappingStatus.INVALID);
});

// 2. valid spatial-only record
test('valid spatial-only record: CAD_POSITION, no identity -> valid, UNMAPPED, not eligible', () => {
  const r = V.validateEvidenceRecord({
    factoryTwinAssetId: 'EQP-F1-9002',
    evidenceType: 'CAD_POSITION',
    sourceSystem: 'floor-geometry',
  });
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.some((w) => w.includes('spatial')));
  assert.strictEqual(r.promotionEligible, false);
  assert.strictEqual(r.mappingStatus, V.MappingStatus.UNMAPPED);
});

// 3. direct EquipmentId only
test('direct EquipmentId only: partial identity -> CANDIDATE, not eligible', () => {
  const r = V.validateEvidenceRecord(complete({ physicalAssetId: null, deviceId: null }));
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.some((w) => w.includes('partial identity')));
  assert.strictEqual(r.promotionEligible, false);
  assert.strictEqual(r.mappingStatus, V.MappingStatus.CANDIDATE);
});

// 4. direct PhysicalAssetId only
test('direct PhysicalAssetId only: partial identity -> CANDIDATE, not eligible', () => {
  const r = V.validateEvidenceRecord(complete({ equipmentId: null, deviceId: null }));
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.some((w) => w.includes('partial identity')));
  assert.strictEqual(r.promotionEligible, false);
  assert.strictEqual(r.mappingStatus, V.MappingStatus.CANDIDATE);
});

// 5. direct DeviceId only
test('direct DeviceId only: partial identity -> CANDIDATE, not eligible', () => {
  const r = V.validateEvidenceRecord(complete({ equipmentId: null, physicalAssetId: null }));
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.some((w) => w.includes('partial identity')));
  assert.strictEqual(r.promotionEligible, false);
  assert.strictEqual(r.mappingStatus, V.MappingStatus.CANDIDATE);
});

// 6. complete evidence
test('complete evidence: full chain, full provenance, direct source -> CONFIRMED, eligible', () => {
  const r = V.validateEvidenceRecord(complete());
  assert.strictEqual(r.valid, true);
  assert.deepStrictEqual(r.warnings, []);
  assert.strictEqual(r.promotionEligible, true);
  assert.strictEqual(r.mappingStatus, V.MappingStatus.CONFIRMED);
});

// 7. conflicting DeviceId
test('conflicting DeviceId: otherwise-complete record with conflict=true -> AMBIGUOUS, not eligible', () => {
  const r = V.validateEvidenceRecord(complete({ conflict: true }));
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.some((w) => w.includes('conflict')));
  assert.strictEqual(r.promotionEligible, false);
  assert.strictEqual(r.mappingStatus, V.MappingStatus.AMBIGUOUS);
});

// 8. conflicting EquipmentId (same conflict mechanism, different partial chain)
test('conflicting EquipmentId: partial chain + conflict=true -> AMBIGUOUS, never a silent pick', () => {
  const r = V.validateEvidenceRecord(complete({ physicalAssetId: null, deviceId: null, conflict: true }));
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.promotionEligible, false);
  assert.strictEqual(r.mappingStatus, V.MappingStatus.AMBIGUOUS);
});

// 9. missing provenance
test('missing provenance: complete identity, no provenance -> CANDIDATE, not eligible', () => {
  const r = V.validateEvidenceRecord(complete({ provenance: undefined }));
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.some((w) => w.includes('provenance')));
  assert.strictEqual(r.promotionEligible, false);
  assert.strictEqual(r.mappingStatus, V.MappingStatus.CANDIDATE);
});

// 10. missing reviewer
test('missing reviewer (verified_by): complete identity, no reviewer -> CANDIDATE, not eligible', () => {
  const r = V.validateEvidenceRecord(complete({ verifiedBy: undefined }));
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.some((w) => w.includes('verified_by')));
  assert.strictEqual(r.promotionEligible, false);
  assert.strictEqual(r.mappingStatus, V.MappingStatus.CANDIDATE);
});

// 11. missing verification timestamp
test('missing verification timestamp: complete identity, no verified_at -> CANDIDATE, not eligible', () => {
  const r = V.validateEvidenceRecord(complete({ verifiedAt: undefined }));
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.some((w) => w.includes('verified_at')));
  assert.strictEqual(r.promotionEligible, false);
  assert.strictEqual(r.mappingStatus, V.MappingStatus.CANDIDATE);
});

test('malformed verified_at (present, unparseable) -> structurally invalid, INVALID', () => {
  const r = V.validateEvidenceRecord(complete({ verifiedAt: 'not-a-date' }));
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('verifiedAt')));
  assert.strictEqual(r.mappingStatus, V.MappingStatus.INVALID);
});

test('unknown mappingStatus -> invalid', () => {
  const r = V.validateEvidenceRecord(complete({ mappingStatus: 'DEFINITELY_REAL' }));
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('mappingStatus')));
});

test('unknown evidenceType -> invalid', () => {
  const r = V.validateEvidenceRecord(complete({ evidenceType: 'PSYCHIC_HUNCH' }));
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('evidenceType')));
});

test('OTHER evidence type -> warning, never eligible, even with full identity/provenance', () => {
  const r = V.validateEvidenceRecord(complete({ evidenceType: 'OTHER' }));
  assert.strictEqual(r.valid, true);
  assert.ok(r.warnings.some((w) => w.includes('unknown or unspecified')));
  assert.strictEqual(r.promotionEligible, false);
});

test('never mutates its argument', () => {
  const input = complete();
  const snapshot = JSON.stringify(input);
  V.validateEvidenceRecord(input);
  assert.strictEqual(JSON.stringify(input), snapshot);
});

// 12. duplicate source record
test('duplicate source record: same source_system+source_record claimed by two different assets -> flagged', () => {
  const a = complete({ factoryTwinAssetId: 'EQP-F1-9101', sourceRecord: 'row-shared-01' });
  const b = complete({ factoryTwinAssetId: 'EQP-F1-9102', sourceRecord: 'row-shared-01' });
  const dups = V.detectDuplicateSourceRecords([a, b]);
  assert.strictEqual(dups.length, 1);
  assert.strictEqual(dups[0].sourceSystem, a.sourceSystem);
  assert.strictEqual(dups[0].sourceRecord, 'row-shared-01');
  assert.deepStrictEqual(dups[0].assetIds, ['EQP-F1-9101', 'EQP-F1-9102']);
});

test('no duplicate when the same source_record is cited by only one asset', () => {
  const a = complete({ factoryTwinAssetId: 'EQP-F1-9201', sourceRecord: 'row-unique-01' });
  const dups = V.detectDuplicateSourceRecords([a]);
  assert.strictEqual(dups.length, 0);
});

test('no duplicate flagged for a spatial-only record with no identity claim, even if source_record repeats', () => {
  const a = { factoryTwinAssetId: 'EQP-F1-9301', evidenceType: 'CAD_POSITION', sourceSystem: 'floor-geometry', sourceRecord: 'geom-export-01' };
  const b = { factoryTwinAssetId: 'EQP-F1-9302', evidenceType: 'CAD_POSITION', sourceSystem: 'floor-geometry', sourceRecord: 'geom-export-01' };
  const dups = V.detectDuplicateSourceRecords([a, b]);
  assert.strictEqual(dups.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
