/**
 * Phase 10A §7 -- demonstrates UNMAPPED -> CANDIDATE -> CONFIRMED as real
 * evidence completeness increases, WITHOUT modifying
 * services/factory-twin-3d-next/lib/identity-mapping-readiness.ts (Step 6D).
 * That file is only ever required here, never edited.
 *
 * The adapter (toMappingCandidate, defined in this file) is the seam: it
 * converts a services/factory-twin-3d/lib/floor1-evidence-validator.js
 * result into the MappingCandidate shape identity-mapping-readiness.ts
 * already accepts. One honest limitation is disclosed rather than worked
 * around: identity-mapping-readiness.ts's own MappingConfidence union is
 * `'CONFIRMED' | 'AMBIGUOUS' | 'UNMAPPED' | 'INVALID'` -- four values, no
 * CANDIDATE. A floor1 CANDIDATE therefore reads to the readiness engine as
 * UNMAPPED (not yet counted toward coverage) -- correct, since the engine
 * was never asked to model a candidate state, and this adapter does not
 * silently invent one for it. The CANDIDATE distinction is still real and
 * asserted -- at the validator layer, which is what this test checks first.
 *
 * Run: node tests/unit/floor1-evidence-readiness-adapter.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { requireTs } = require('./lib/require-ts');
const V = require('../../services/factory-twin-3d/lib/floor1-evidence-validator');

const readinessPath = path.join(
  __dirname, '..', '..', 'services', 'factory-twin-3d-next', 'lib', 'identity-mapping-readiness.ts',
);
const readiness = requireTs(readinessPath);

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

/**
 * Adapter: floor1-evidence-validator result -> identity-mapping-readiness.ts's
 * own MappingCandidate shape. Pure, no I/O.
 */
function toMappingCandidate(record, validation) {
  const confidence = validation.mappingStatus === 'CANDIDATE' ? 'UNMAPPED' : validation.mappingStatus;
  return {
    source: record.sourceSystem || 'unknown',
    sourceId: record.deviceId || null,
    factoryTwinId: record.factoryTwinAssetId || null,
    evidence: record.evidenceType || 'NONE',
    confidence,
  };
}

const complete = (over = {}) => ({
  factoryTwinAssetId: 'EQP-F1-0030',
  equipmentId: 'MES-UNIT-01',
  physicalAssetId: 'PHYS-UNIT-01',
  deviceId: 'DEV-UNIT-01',
  sourceSystemId: 'SRC-SYS-01',
  evidenceType: 'DIRECT_SYSTEM_RECORD',
  sourceSystem: 'test-mes-export',
  sourceRecord: 'row-0001',
  provenance: 'synthetic test fixture, not a real evidence claim',
  verifiedBy: 'test-reviewer',
  verifiedAt: '2026-09-01T00:00:00Z',
  ...over,
});

test('stage 1 -- no evidence: validator UNMAPPED, readiness sees 0 confirmed, NOT_READY', () => {
  const record = { factoryTwinAssetId: 'EQP-F1-0030' };
  const v = V.validateEvidenceRecord(record);
  assert.strictEqual(v.mappingStatus, 'UNMAPPED');

  const candidate = toMappingCandidate(record, v);
  const counts = readiness.computeCoverageCounts(1, [candidate]);
  assert.strictEqual(counts.confirmed, 0);
  assert.strictEqual(counts.coveragePercent, 0);

  const decision = readiness.computeReadinessDecision({
    counts, criticalAnomalyCount: 0, sourceIsSimulatorOnly: false,
  });
  assert.strictEqual(decision, 'NOT_READY');
});

test('stage 2 -- partial evidence (EquipmentId only, full provenance): validator CANDIDATE, still 0 confirmed, NOT_READY', () => {
  const record = complete({ physicalAssetId: null, deviceId: null });
  const v = V.validateEvidenceRecord(record);
  assert.strictEqual(v.mappingStatus, 'CANDIDATE');
  assert.strictEqual(v.promotionEligible, false);

  const candidate = toMappingCandidate(record, v);
  assert.strictEqual(candidate.confidence, 'UNMAPPED'); // disclosed limitation, not a workaround
  const counts = readiness.computeCoverageCounts(1, [candidate]);
  assert.strictEqual(counts.confirmed, 0);

  const decision = readiness.computeReadinessDecision({
    counts, criticalAnomalyCount: 0, sourceIsSimulatorOnly: false,
  });
  assert.strictEqual(decision, 'NOT_READY');
});

test('stage 3 -- complete evidence: validator CONFIRMED, readiness counts 1 confirmed, PARTIALLY_READY (no agreed target -> never forced READY)', () => {
  const record = complete();
  const v = V.validateEvidenceRecord(record);
  assert.strictEqual(v.mappingStatus, 'CONFIRMED');
  assert.strictEqual(v.promotionEligible, true);

  const candidate = toMappingCandidate(record, v);
  assert.strictEqual(candidate.confidence, 'CONFIRMED');
  const counts = readiness.computeCoverageCounts(1, [candidate]);
  assert.strictEqual(counts.confirmed, 1);
  assert.strictEqual(counts.coveragePercent, 100);

  // Existing readiness threshold behavior is NOT changed: with no agreed
  // coverage target (this deployment's own real, current state -- no
  // stakeholder has ever agreed one, per Step 6D's own evidence doc),
  // 100% of a 1-asset pilot slice still cannot become READY.
  const decision = readiness.computeReadinessDecision({
    counts, criticalAnomalyCount: 0, sourceIsSimulatorOnly: false,
  });
  assert.strictEqual(decision, 'PARTIALLY_READY');
});

test('conflict -> validator AMBIGUOUS, readiness sees 0 confirmed and never silently picks a winner', () => {
  const record = complete({ conflict: true });
  const v = V.validateEvidenceRecord(record);
  assert.strictEqual(v.mappingStatus, 'AMBIGUOUS');

  const candidate = toMappingCandidate(record, v);
  const counts = readiness.computeCoverageCounts(1, [candidate]);
  assert.strictEqual(counts.confirmed, 0);
  assert.strictEqual(counts.ambiguous, 1);
});

test('real pilot scale: all 10 pilot assets at their real current NO_EVIDENCE/UNMAPPED state -> 0 confirmed, NOT_READY', () => {
  const pilotIds = [
    'EQP-F1-0030', 'EQP-F1-0062', 'EQP-F1-0075', 'EQP-F1-0076', 'EQP-F1-0077',
    'EQP-F1-0092', 'EQP-F1-0108', 'EQP-F1-0109', 'EQP-F1-0124', 'EQP-F1-0125',
  ];
  const candidates = pilotIds.map((id) => {
    const record = { factoryTwinAssetId: id };
    const v = V.validateEvidenceRecord(record);
    return toMappingCandidate(record, v);
  });
  const counts = readiness.computeCoverageCounts(pilotIds.length, candidates);
  assert.strictEqual(counts.confirmed, 0);
  assert.strictEqual(counts.coveragePercent, 0);

  const decision = readiness.computeReadinessDecision({
    counts, criticalAnomalyCount: 0, sourceIsSimulatorOnly: false,
  });
  assert.strictEqual(decision, 'NOT_READY');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
