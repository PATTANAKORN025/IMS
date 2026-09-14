/**
 * Step 6D -- unit tests for the identity-mapping readiness gate
 * (services/factory-twin-3d-next/lib/identity-mapping-readiness.ts).
 *
 * Also exercises the REAL, existing legacy validation engine
 * (services/factory-twin-3d/lib/mapping.js -- unmodified, read-only use)
 * against the REAL private/floor1-asset-mapping.json (0 records), so this
 * suite's "0/431 baseline" case is a live fact, not an assumption.
 *
 * Run: node tests/unit/factory-twin-identity-mapping.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { requireTs } = require('./lib/require-ts');

const readinessPath = path.join(
  __dirname, '..', '..', 'services', 'factory-twin-3d-next', 'lib', 'identity-mapping-readiness.ts',
);
const readiness = requireTs(readinessPath);

const legacyMapping = require('../../services/factory-twin-3d/lib/mapping');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}\n    ${err.message}`);
  }
}

const TOTAL_FACTORY_TWIN_ASSETS = 431;
const REAL_DEVICE_IDS = [
  'LDI-01', 'LDI-02', 'LDI-03', 'LDI-04', 'LDI-05', 'LDI-06', 'LDI-07', 'LDI-08', 'LDI-09', 'LDI-10',
  'LDI-A01', 'LDI-A02', 'LDI-B07', 'ldi-a03', 'ldi-a04', 'ldi-a05', 'ldi-a06',
  'ldi-b01', 'ldi-b02', 'ldi-b03', 'ldi-b04', 'ldi-b05', 'ldi-b06',
]; // live query, docker exec ims-timescaledb -- 23 rows, verified this step

// ---------------------------------------------------------------------------
// 1. Real 0/431 baseline -- against the REAL FT-14 mapping file, not a stub
// ---------------------------------------------------------------------------

test('REAL private/floor1-asset-mapping.json has exactly 0 mappings (live fact)', () => {
  const realMappingPath = path.join(
    __dirname, '..', '..', 'services', 'factory-twin-3d', 'private', 'floor1-asset-mapping.json',
  );
  const parsed = JSON.parse(fs.readFileSync(realMappingPath, 'utf8'));
  assert.ok(Array.isArray(parsed.mappings));
  assert.strictEqual(parsed.mappings.length, 0);
});

test('legacy validateMappings() accepts the real (empty) mapping file: ok, 0 confirmed', () => {
  const realMappingPath = path.join(
    __dirname, '..', '..', 'services', 'factory-twin-3d', 'private', 'floor1-asset-mapping.json',
  );
  const parsed = JSON.parse(fs.readFileSync(realMappingPath, 'utf8'));
  const result = legacyMapping.validateMappings(parsed.mappings);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.counts.confirmed, 0);
  assert.strictEqual(result.counts.total, 0);
});

test('computeCoverageCounts on 431 real Twin assets with 0 real candidates: 0/431, 0.0%', () => {
  const counts = readiness.computeCoverageCounts(TOTAL_FACTORY_TWIN_ASSETS, []);
  assert.strictEqual(counts.confirmed, 0);
  assert.strictEqual(counts.totalFactoryTwinAssets, TOTAL_FACTORY_TWIN_ASSETS);
  assert.strictEqual(counts.unmapped, 431);
  assert.strictEqual(counts.coveragePercent, 0);
});

test('computeReadinessDecision on the real 0/431 state: NOT_READY, never forced to READY', () => {
  const counts = readiness.computeCoverageCounts(TOTAL_FACTORY_TWIN_ASSETS, []);
  const decision = readiness.computeReadinessDecision({
    counts, criticalAnomalyCount: 0, sourceIsSimulatorOnly: true,
  });
  assert.strictEqual(decision, 'NOT_READY');
});

// ---------------------------------------------------------------------------
// 2. Confirmed mapping -- correct, unambiguous case
// ---------------------------------------------------------------------------

test('a single confirmed, unambiguous mapping is counted and produces no anomaly', () => {
  const candidates = [
    { source: 'test', sourceId: 'LDI-01', factoryTwinId: 'EQP-F1-0001', evidence: 'synthetic fixture', confidence: 'CONFIRMED' },
  ];
  const counts = readiness.computeCoverageCounts(431, candidates);
  assert.strictEqual(counts.confirmed, 1);
  const anomalies = readiness.detectBidirectionalAnomalies(candidates, ['LDI-01'], ['EQP-F1-0001']);
  assert.strictEqual(anomalies.length, 0);
});

// ---------------------------------------------------------------------------
// 3. Duplicate source -- one source device confirmed to two Twin assets
// ---------------------------------------------------------------------------

test('one source confirmed to two Twin assets: ONE_SOURCE_MULTIPLE_MACHINES anomaly', () => {
  const candidates = [
    { source: 'test', sourceId: 'LDI-01', factoryTwinId: 'EQP-F1-0001', evidence: 'a', confidence: 'CONFIRMED' },
    { source: 'test', sourceId: 'LDI-01', factoryTwinId: 'EQP-F1-0002', evidence: 'b', confidence: 'CONFIRMED' },
  ];
  const anomalies = readiness.detectBidirectionalAnomalies(candidates, ['LDI-01'], ['EQP-F1-0001', 'EQP-F1-0002']);
  const kinds = anomalies.map((a) => a.kind);
  assert.ok(kinds.includes('ONE_SOURCE_MULTIPLE_MACHINES'), kinds.join(','));
});

// ---------------------------------------------------------------------------
// 4. Duplicate target -- one Twin asset confirmed to two source devices
// ---------------------------------------------------------------------------

test('one Twin asset confirmed to two source devices: ONE_MACHINE_MULTIPLE_SOURCES anomaly', () => {
  const candidates = [
    { source: 'test', sourceId: 'LDI-01', factoryTwinId: 'EQP-F1-0001', evidence: 'a', confidence: 'CONFIRMED' },
    { source: 'test', sourceId: 'LDI-02', factoryTwinId: 'EQP-F1-0001', evidence: 'b', confidence: 'CONFIRMED' },
  ];
  const anomalies = readiness.detectBidirectionalAnomalies(candidates, ['LDI-01', 'LDI-02'], ['EQP-F1-0001']);
  const kinds = anomalies.map((a) => a.kind);
  assert.ok(kinds.includes('ONE_MACHINE_MULTIPLE_SOURCES'), kinds.join(','));
});

test('an exact duplicate (same source, same target, asserted twice): DUPLICATE_MAPPING anomaly', () => {
  const candidates = [
    { source: 'test', sourceId: 'LDI-01', factoryTwinId: 'EQP-F1-0001', evidence: 'a', confidence: 'CONFIRMED' },
    { source: 'test', sourceId: 'LDI-01', factoryTwinId: 'EQP-F1-0001', evidence: 'b (re-asserted)', confidence: 'CONFIRMED' },
  ];
  const anomalies = readiness.detectBidirectionalAnomalies(candidates, ['LDI-01'], ['EQP-F1-0001']);
  const kinds = anomalies.map((a) => a.kind);
  assert.ok(kinds.includes('DUPLICATE_MAPPING'), kinds.join(','));
});

// ---------------------------------------------------------------------------
// 5. Ambiguous mapping -- never counted as confirmed, never guessed
// ---------------------------------------------------------------------------

test('an AMBIGUOUS candidate is never counted as confirmed and never resolves an anomaly-free mapping', () => {
  const candidates = [
    { source: 'test', sourceId: 'LDI-01', factoryTwinId: 'EQP-F1-0001', evidence: 'name similarity only -- not authoritative', confidence: 'AMBIGUOUS' },
  ];
  const counts = readiness.computeCoverageCounts(431, candidates);
  assert.strictEqual(counts.confirmed, 0);
  assert.strictEqual(counts.ambiguous, 1);
  // AMBIGUOUS does not participate in bidirectional confirmed-only checks --
  // both sides remain orphan since nothing was actually confirmed.
  const anomalies = readiness.detectBidirectionalAnomalies(candidates, ['LDI-01'], ['EQP-F1-0001']);
  const kinds = anomalies.map((a) => a.kind);
  assert.ok(kinds.includes('ORPHAN_SOURCE'));
  assert.ok(kinds.includes('ORPHAN_ASSET'));
});

// ---------------------------------------------------------------------------
// 6. Unmapped source / unmapped Twin asset -- orphan detection
// ---------------------------------------------------------------------------

test('an unmapped source device is reported as ORPHAN_SOURCE', () => {
  const candidates = [
    { source: 'test', sourceId: 'LDI-01', factoryTwinId: 'EQP-F1-0001', evidence: 'a', confidence: 'CONFIRMED' },
  ];
  const anomalies = readiness.detectBidirectionalAnomalies(candidates, ['LDI-01', 'LDI-02'], ['EQP-F1-0001']);
  const orphanSources = anomalies.filter((a) => a.kind === 'ORPHAN_SOURCE');
  assert.strictEqual(orphanSources.length, 1);
  assert.ok(/LDI-02/.test(orphanSources[0].detail));
});

test('an unmapped Factory Twin asset is reported as ORPHAN_ASSET', () => {
  const candidates = [
    { source: 'test', sourceId: 'LDI-01', factoryTwinId: 'EQP-F1-0001', evidence: 'a', confidence: 'CONFIRMED' },
  ];
  const anomalies = readiness.detectBidirectionalAnomalies(candidates, ['LDI-01'], ['EQP-F1-0001', 'EQP-F1-0002']);
  const orphanAssets = anomalies.filter((a) => a.kind === 'ORPHAN_ASSET');
  assert.strictEqual(orphanAssets.length, 1);
  assert.ok(/EQP-F1-0002/.test(orphanAssets[0].detail));
});

test('real scale: 0 candidates against 23 real devices and 431 real assets produces exactly 23 + 431 orphans', () => {
  const anomalies = readiness.detectBidirectionalAnomalies([], REAL_DEVICE_IDS, Array.from({ length: 431 }, (_, i) => `EQP-F1-${i}`));
  const orphanSources = anomalies.filter((a) => a.kind === 'ORPHAN_SOURCE').length;
  const orphanAssets = anomalies.filter((a) => a.kind === 'ORPHAN_ASSET').length;
  assert.strictEqual(orphanSources, 23);
  assert.strictEqual(orphanAssets, 431);
});

// ---------------------------------------------------------------------------
// 7. Bidirectional mismatch -- forward vs reverse disagree (both fan-out
//    kinds together on the same fixture)
// ---------------------------------------------------------------------------

test('bidirectional mismatch: a fan-out in BOTH directions is fully reported, not just one side', () => {
  const candidates = [
    { source: 'test', sourceId: 'LDI-01', factoryTwinId: 'EQP-F1-0001', evidence: 'a', confidence: 'CONFIRMED' },
    { source: 'test', sourceId: 'LDI-01', factoryTwinId: 'EQP-F1-0002', evidence: 'b', confidence: 'CONFIRMED' },
    { source: 'test', sourceId: 'LDI-02', factoryTwinId: 'EQP-F1-0002', evidence: 'c', confidence: 'CONFIRMED' },
  ];
  const anomalies = readiness.detectBidirectionalAnomalies(candidates, ['LDI-01', 'LDI-02'], ['EQP-F1-0001', 'EQP-F1-0002']);
  const kinds = anomalies.map((a) => a.kind);
  assert.ok(kinds.includes('ONE_SOURCE_MULTIPLE_MACHINES'));
  assert.ok(kinds.includes('ONE_MACHINE_MULTIPLE_SOURCES'));
});

// ---------------------------------------------------------------------------
// 8. Invalid mapping -- never silently treated as confirmed
// ---------------------------------------------------------------------------

test('an INVALID candidate is counted separately and never treated as confirmed', () => {
  const candidates = [
    { source: 'test', sourceId: null, factoryTwinId: 'EQP-F1-0001', evidence: 'malformed source id', confidence: 'INVALID' },
  ];
  const counts = readiness.computeCoverageCounts(431, candidates);
  assert.strictEqual(counts.confirmed, 0);
  assert.strictEqual(counts.invalid, 1);
});

test('legacy validateMappings() rejects a confirmed record with no provenance (real engine, real rule)', () => {
  const result = legacyMapping.validateMappings([
    { asset_id: 'EQP-F1-0001', ims_device_id: 'LDI-01', mes_machine_id: null, mapping_status: 'confirmed', confidence: 'high', source: null, source_record: null, verified_at: null },
  ]);
  assert.strictEqual(result.ok, false);
});

test('legacy validateMappings() rejects two confirmed records claiming the same device (real engine, real rule)', () => {
  const now = new Date().toISOString();
  const result = legacyMapping.validateMappings([
    { asset_id: 'EQP-F1-0001', ims_device_id: 'LDI-01', mes_machine_id: null, mapping_status: 'confirmed', confidence: 'high', source: 'test', source_record: 'r1', verified_at: now },
    { asset_id: 'EQP-F1-0002', ims_device_id: 'LDI-01', mes_machine_id: null, mapping_status: 'confirmed', confidence: 'high', source: 'test', source_record: 'r2', verified_at: now },
  ]);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => /already confirmed/.test(e)));
});

// ---------------------------------------------------------------------------
// 9. Readiness decision -- never forced to READY
// ---------------------------------------------------------------------------

test('readiness: partial confirmed coverage, no anomalies, no agreed target -> PARTIALLY_READY, never READY', () => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({
    source: 'test', sourceId: `LDI-${i}`, factoryTwinId: `EQP-F1-${i}`, evidence: 'synthetic', confidence: 'CONFIRMED',
  }));
  const counts = readiness.computeCoverageCounts(431, candidates);
  const decision = readiness.computeReadinessDecision({ counts, criticalAnomalyCount: 0, sourceIsSimulatorOnly: false });
  assert.strictEqual(decision, 'PARTIALLY_READY');
});

test('readiness: any critical anomaly forces NOT_READY regardless of coverage', () => {
  const counts = readiness.computeCoverageCounts(431, []);
  const decision = readiness.computeReadinessDecision({
    counts: { ...counts, confirmed: 400 }, criticalAnomalyCount: 1, sourceIsSimulatorOnly: false, agreedCoverageTargetPercent: 50,
  });
  assert.strictEqual(decision, 'NOT_READY');
});

test('readiness: simulator-only source forces NOT_READY even with confirmed mappings', () => {
  const counts = readiness.computeCoverageCounts(431, []);
  const decision = readiness.computeReadinessDecision({
    counts: { ...counts, confirmed: 431, coveragePercent: 100 }, criticalAnomalyCount: 0, sourceIsSimulatorOnly: true, agreedCoverageTargetPercent: 50,
  });
  assert.strictEqual(decision, 'NOT_READY');
});

test('readiness: coverage meeting an EXPLICITLY agreed target with no anomalies and a real source -> READY', () => {
  const counts = readiness.computeCoverageCounts(431, []);
  const decision = readiness.computeReadinessDecision({
    counts: { ...counts, confirmed: 400, coveragePercent: (400 / 431) * 100 },
    criticalAnomalyCount: 0, sourceIsSimulatorOnly: false, agreedCoverageTargetPercent: 90,
  });
  assert.strictEqual(decision, 'READY');
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
