/**
 * Phase 10B -- pilot-scale readiness boundary harness. Exercises the real,
 * unmodified services/factory-twin-3d/lib/floor1-evidence-validator.js
 * (Phase 10A) across the 10-asset pilot slice, and -- for the one scenario
 * where it is meaningful (E) -- the real, unmodified
 * services/factory-twin-3d-next/lib/identity-mapping-readiness.ts (Step 6D).
 * Neither engine is edited by this file.
 *
 * `floor1PilotOperationalReadiness()` below is a small, pure, LOCAL
 * function -- the deliberate boundary this phase asks for. It is not added
 * to any production module: it exists only here, as the Floor 1-scoped
 * decision ("is the 10-asset pilot itself ready for operational
 * integration") kept separate from the global engine's own, differently-
 * scoped decision ("is this deployment ready for production operational-
 * state display"). See docs/floor1/pilot-readiness-report.md §4 for the
 * documented rule this function encodes.
 *
 * Every value here is obviously synthetic. No real drawing, device,
 * machine, custodian or filename appears in this file. The 10
 * FactoryTwinAssetId values match docs/floor1/pilot-intake-status.csv's
 * real pilot slice; nothing about their real (NO_EVIDENCE/UNMAPPED) state
 * is asserted differently here -- these are hypothetical scenarios run
 * against synthetic records, never a claim about real evidence.
 *
 * Run: node tests/unit/floor1-pilot-readiness-report.test.js
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

const PILOT_IDS = [
  'EQP-F1-0030', 'EQP-F1-0062', 'EQP-F1-0075', 'EQP-F1-0076', 'EQP-F1-0077',
  'EQP-F1-0092', 'EQP-F1-0108', 'EQP-F1-0109', 'EQP-F1-0124', 'EQP-F1-0125',
];

/** Deliberately strict -- see file header. NOT_READY unless every pilot
 * asset independently resolves to CONFIRMED. Pure, no I/O. */
function floor1PilotOperationalReadiness(mappingStatuses) {
  return mappingStatuses.every((s) => s === V.MappingStatus.CONFIRMED) ? 'READY' : 'NOT_READY';
}

const complete = (id, over = {}) => ({
  factoryTwinAssetId: id,
  equipmentId: 'MES-UNIT-01',
  physicalAssetId: 'PHYS-UNIT-01',
  deviceId: 'DEV-UNIT-01',
  sourceSystemId: 'SRC-SYS-01',
  evidenceType: 'DIRECT_SYSTEM_RECORD',
  evidenceLocation: 'test-fixture://intake/pilot',
  sourceSystem: 'test-mes-export',
  sourceRecord: `row-${id}`,
  provenance: 'synthetic test fixture, not a real evidence claim',
  verifiedBy: 'test-reviewer',
  verifiedAt: '2026-09-14T00:00:00Z',
  ...over,
});

const unmapped = (id) => ({ factoryTwinAssetId: id });

const candidateOnly = (id) => complete(id, { physicalAssetId: null, deviceId: null });

function statusesFor(records) {
  return records.map((r) => V.validateEvidenceRecord(r).mappingStatus);
}

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

// A. all 10 UNMAPPED -> NOT_READY
test('A. all 10 UNMAPPED -> pilot NOT_READY', () => {
  const records = PILOT_IDS.map(unmapped);
  const statuses = statusesFor(records);
  assert.deepStrictEqual(statuses, PILOT_IDS.map(() => V.MappingStatus.UNMAPPED));
  assert.strictEqual(floor1PilotOperationalReadiness(statuses), 'NOT_READY');
});

// B. 1 valid CANDIDATE + 9 UNMAPPED -> NOT_READY
test('B. 1 CANDIDATE + 9 UNMAPPED -> pilot NOT_READY', () => {
  const records = [candidateOnly(PILOT_IDS[0]), ...PILOT_IDS.slice(1).map(unmapped)];
  const statuses = statusesFor(records);
  assert.strictEqual(statuses.filter((s) => s === V.MappingStatus.CANDIDATE).length, 1);
  assert.strictEqual(statuses.filter((s) => s === V.MappingStatus.UNMAPPED).length, 9);
  assert.strictEqual(floor1PilotOperationalReadiness(statuses), 'NOT_READY');
});

// C. 9 valid CANDIDATE + 1 UNMAPPED -> NOT_READY
test('C. 9 CANDIDATE + 1 UNMAPPED -> pilot NOT_READY', () => {
  const records = [...PILOT_IDS.slice(0, 9).map(candidateOnly), unmapped(PILOT_IDS[9])];
  const statuses = statusesFor(records);
  assert.strictEqual(statuses.filter((s) => s === V.MappingStatus.CANDIDATE).length, 9);
  assert.strictEqual(statuses.filter((s) => s === V.MappingStatus.UNMAPPED).length, 1);
  assert.strictEqual(floor1PilotOperationalReadiness(statuses), 'NOT_READY');
});

// D. 10 CANDIDATE -> still NOT_READY for operational integration
test('D. 10 CANDIDATE -> still pilot NOT_READY (no CONFIRMED at all)', () => {
  const records = PILOT_IDS.map(candidateOnly);
  const statuses = statusesFor(records);
  assert.deepStrictEqual(statuses, PILOT_IDS.map(() => V.MappingStatus.CANDIDATE));
  assert.strictEqual(floor1PilotOperationalReadiness(statuses), 'NOT_READY');
});

// E. 1 CONFIRMED + 9 UNMAPPED -> Floor 1 pilot has 1 confirmed mapping;
// global readiness semantics remain governed by the real, unmodified engine.
test('E. 1 CONFIRMED + 9 UNMAPPED -> pilot NOT_READY, global engine says PARTIALLY_READY (never forced READY)', () => {
  const records = [complete(PILOT_IDS[0]), ...PILOT_IDS.slice(1).map(unmapped)];
  const validations = records.map((r) => V.validateEvidenceRecord(r));
  const statuses = validations.map((v) => v.mappingStatus);
  assert.strictEqual(statuses[0], V.MappingStatus.CONFIRMED);
  assert.strictEqual(statuses.filter((s) => s === V.MappingStatus.UNMAPPED).length, 9);
  assert.strictEqual(floor1PilotOperationalReadiness(statuses), 'NOT_READY');

  // Global dimension: real engine, real math, not hand-simulated.
  const candidates = records.map((r, i) => toMappingCandidate(r, validations[i]));
  const counts = readiness.computeCoverageCounts(PILOT_IDS.length, candidates);
  assert.strictEqual(counts.confirmed, 1);
  assert.strictEqual(counts.coveragePercent, 10);

  const decision = readiness.computeReadinessDecision({
    counts, criticalAnomalyCount: 0, sourceIsSimulatorOnly: false,
  });
  // No agreed coverage target exists anywhere in this repository -- the
  // real engine can therefore never return READY here, only
  // PARTIALLY_READY (some confirmed coverage) or NOT_READY.
  assert.strictEqual(decision, 'PARTIALLY_READY');
});

// F. conflicting source for same identity -> AMBIGUOUS, not eligible
test('F. conflicting source -> AMBIGUOUS, not promotion eligible, pilot NOT_READY', () => {
  const records = [complete(PILOT_IDS[0], { conflict: true }), ...PILOT_IDS.slice(1).map(unmapped)];
  const validations = records.map((r) => V.validateEvidenceRecord(r));
  assert.strictEqual(validations[0].mappingStatus, V.MappingStatus.AMBIGUOUS);
  assert.strictEqual(validations[0].promotionEligible, false);
  const statuses = validations.map((v) => v.mappingStatus);
  assert.strictEqual(floor1PilotOperationalReadiness(statuses), 'NOT_READY');
});

// G. missing provenance -> not eligible
test('G. missing provenance -> CANDIDATE, not eligible, pilot NOT_READY', () => {
  const record = complete(PILOT_IDS[0], { provenance: undefined });
  const v = V.validateEvidenceRecord(record);
  assert.strictEqual(v.promotionEligible, false);
  assert.strictEqual(v.mappingStatus, V.MappingStatus.CANDIDATE);
  assert.ok(v.warnings.some((w) => w.includes('provenance')));
});

// H. missing verifier -> not eligible
test('H. missing verifier -> CANDIDATE, not eligible, pilot NOT_READY', () => {
  const record = complete(PILOT_IDS[0], { verifiedBy: undefined });
  const v = V.validateEvidenceRecord(record);
  assert.strictEqual(v.promotionEligible, false);
  assert.strictEqual(v.mappingStatus, V.MappingStatus.CANDIDATE);
  assert.ok(v.warnings.some((w) => w.includes('verified_by')));
});

// I. invalid timestamp -> INVALID
test('I. invalid verified_at -> structurally INVALID, pilot NOT_READY', () => {
  const record = complete(PILOT_IDS[0], { verifiedAt: 'not-a-real-timestamp' });
  const v = V.validateEvidenceRecord(record);
  assert.strictEqual(v.valid, false);
  assert.strictEqual(v.mappingStatus, V.MappingStatus.INVALID);
  assert.strictEqual(floor1PilotOperationalReadiness([v.mappingStatus]), 'NOT_READY');
});

// Real pilot scale sanity -- every real pilot asset today, unmodified.
test('real pilot scale: all 10 at real current NO_EVIDENCE state -> pilot NOT_READY, 0 confirmed', () => {
  const records = PILOT_IDS.map(unmapped);
  const statuses = statusesFor(records);
  assert.strictEqual(statuses.filter((s) => s === V.MappingStatus.CONFIRMED).length, 0);
  assert.strictEqual(floor1PilotOperationalReadiness(statuses), 'NOT_READY');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
