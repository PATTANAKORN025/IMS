/**
 * Step 6E -- unit tests for the canonical equipment identity contract
 * (services/factory-twin-3d-next/lib/canonical-identity.ts).
 *
 * Run: node tests/unit/factory-twin-canonical-identity.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { requireTs } = require('./lib/require-ts');

const modPath = path.join(
  __dirname, '..', '..', 'services', 'factory-twin-3d-next', 'lib', 'canonical-identity.ts',
);
const mod = requireTs(modPath);

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

const TOTAL_FACTORY_TWIN_ASSETS = 431; // re-verified live, Steps 6B-6D

function twin(id) { return mod.asFactoryTwinAssetId(id); }
function device(id) { return mod.asDeviceId(id); }
function equipment(id) { return mod.asEquipmentId(id); }

function confirmedChain(assetId, deviceId, { provenance = true } = {}) {
  return {
    factoryTwinAssetId: twin(assetId),
    equipment: { status: 'UNKNOWN', id: null },
    physicalAsset: { status: 'UNKNOWN', id: null },
    device: { status: 'KNOWN', id: device(deviceId) },
    sourceSystem: { status: 'KNOWN', id: mod.asSourceSystemId('TEST-SRC') },
    lifecycle: 'CONFIRMED',
    provenance: provenance ? {
      category: 'AUTHORITATIVE_REGISTRY', source: 'test fixture', sourceRecordId: 'r1',
      verifiedAt: '2026-09-14T00:00:00.000Z', verifiedBy: 'test', confidence: 'high',
    } : null,
  };
}

// ---------------------------------------------------------------------------
// 1. Five namespaces stay distinct -- branded types, not collapsible
// ---------------------------------------------------------------------------

test('branded id constructors produce distinguishable values at the type level (structural check at runtime: plain strings)', () => {
  const t = twin('EQP-F1-0001');
  const d = device('LDI-01');
  assert.strictEqual(typeof t, 'string');
  assert.strictEqual(typeof d, 'string');
  // Runtime values ARE plain strings (branding is compile-time only) --
  // the real guarantee this file provides is enforced by `tsc`
  // (`npm run typecheck`), not by a runtime check; this test documents
  // that fact rather than re-asserting a compile-time guarantee at
  // runtime, which is not possible.
  assert.strictEqual(t, 'EQP-F1-0001');
  assert.strictEqual(d, 'LDI-01');
});

// ---------------------------------------------------------------------------
// 2. unmappedChain() -- the honest default
// ---------------------------------------------------------------------------

test('unmappedChain(): every link UNKNOWN, lifecycle UNMAPPED, no provenance, valid', () => {
  const chain = mod.unmappedChain(twin('EQP-F1-0001'));
  assert.strictEqual(chain.lifecycle, 'UNMAPPED');
  assert.strictEqual(chain.provenance, null);
  assert.strictEqual(chain.equipment.status, 'UNKNOWN');
  assert.strictEqual(mod.isValidIdentityChain(chain), true);
  assert.strictEqual(mod.isProductionEligible(chain), false);
});

// ---------------------------------------------------------------------------
// 3. Production eligibility -- ONLY CONFIRMED + provenance
// ---------------------------------------------------------------------------

test('CANDIDATE never becomes production-eligible, even with provenance attached', () => {
  const chain = { ...confirmedChain('EQP-F1-0001', 'LDI-01'), lifecycle: 'CANDIDATE' };
  assert.strictEqual(mod.isProductionEligible(chain), false);
});

test('AMBIGUOUS never becomes production-eligible, even with provenance attached', () => {
  const chain = { ...confirmedChain('EQP-F1-0001', 'LDI-01'), lifecycle: 'AMBIGUOUS' };
  assert.strictEqual(mod.isProductionEligible(chain), false);
});

test('CONFIRMED with provenance IS production-eligible', () => {
  const chain = confirmedChain('EQP-F1-0001', 'LDI-01');
  assert.strictEqual(mod.isProductionEligible(chain), true);
});

test('CONFIRMED with NO provenance is NOT production-eligible', () => {
  const chain = confirmedChain('EQP-F1-0001', 'LDI-01', { provenance: false });
  assert.strictEqual(mod.isProductionEligible(chain), false);
});

// ---------------------------------------------------------------------------
// 4. Validation utilities (Section 9) -- one test per named anomaly kind
// ---------------------------------------------------------------------------

test('duplicate identity: two chains claiming the same FactoryTwinAssetId', () => {
  const a = mod.unmappedChain(twin('EQP-F1-0001'));
  const b = mod.unmappedChain(twin('EQP-F1-0001'));
  const anomalies = mod.validateIdentityChains([a, b]);
  assert.ok(anomalies.some((x) => x.kind === 'DUPLICATE_IDENTITY'));
});

test('duplicate device: two CONFIRMED chains claiming the same DeviceId', () => {
  const a = confirmedChain('EQP-F1-0001', 'LDI-01');
  const b = confirmedChain('EQP-F1-0002', 'LDI-01');
  const anomalies = mod.validateIdentityChains([a, b]);
  const kinds = anomalies.map((x) => x.kind);
  assert.ok(kinds.includes('DUPLICATE_DEVICE'), kinds.join(','));
});

test('ambiguous relationship: a chain with lifecycle AMBIGUOUS is flagged', () => {
  const chain = { ...mod.unmappedChain(twin('EQP-F1-0001')), lifecycle: 'AMBIGUOUS' };
  const anomalies = mod.validateIdentityChains([chain]);
  assert.ok(anomalies.some((x) => x.kind === 'AMBIGUOUS_RELATIONSHIP'));
});

test('missing provenance: CONFIRMED with provenance: null is flagged', () => {
  const chain = confirmedChain('EQP-F1-0001', 'LDI-01', { provenance: false });
  const anomalies = mod.validateIdentityChains([chain]);
  assert.ok(anomalies.some((x) => x.kind === 'MISSING_PROVENANCE'));
});

test('retired identity: RETIRED never reads as still-eligible (guard passes, no anomaly)', () => {
  const chain = { ...confirmedChain('EQP-F1-0001', 'LDI-01'), lifecycle: 'RETIRED' };
  const anomalies = mod.validateIdentityChains([chain]);
  assert.ok(!anomalies.some((x) => x.kind === 'RETIRED_IDENTITY_STILL_ELIGIBLE'));
  assert.strictEqual(mod.isProductionEligible(chain), false);
});

test('source mismatch: device KNOWN but sourceSystem UNKNOWN is flagged', () => {
  const chain = {
    ...mod.unmappedChain(twin('EQP-F1-0001')),
    device: { status: 'KNOWN', id: device('LDI-01') },
  };
  const anomalies = mod.validateIdentityChains([chain]);
  assert.ok(anomalies.some((x) => x.kind === 'SOURCE_MISMATCH'));
});

test('bidirectional mismatch: reported alongside DUPLICATE_DEVICE for the same fixture', () => {
  const a = confirmedChain('EQP-F1-0001', 'LDI-01');
  const b = confirmedChain('EQP-F1-0002', 'LDI-01');
  const anomalies = mod.validateIdentityChains([a, b]);
  const kinds = anomalies.map((x) => x.kind);
  assert.ok(kinds.includes('BIDIRECTIONAL_MISMATCH'), kinds.join(','));
});

test('invalid link: KNOWN status with a null id is flagged', () => {
  const chain = {
    ...mod.unmappedChain(twin('EQP-F1-0001')),
    equipment: { status: 'KNOWN', id: null },
  };
  assert.strictEqual(mod.isValidIdentityChain(chain), false);
  const anomalies = mod.validateIdentityChains([chain]);
  assert.ok(anomalies.some((x) => x.kind === 'INVALID_LINK'));
});

test('invalid link: UNKNOWN status with a non-null id is flagged', () => {
  const chain = {
    ...mod.unmappedChain(twin('EQP-F1-0001')),
    equipment: { status: 'UNKNOWN', id: equipment('EQ-1') },
  };
  assert.strictEqual(mod.isValidIdentityChain(chain), false);
});

test('a correct, unambiguous confirmed chain produces zero anomalies', () => {
  const chain = confirmedChain('EQP-F1-0001', 'LDI-01');
  const anomalies = mod.validateIdentityChains([chain]);
  assert.strictEqual(anomalies.length, 0);
});

// ---------------------------------------------------------------------------
// 5. Mapping coverage -- real 0/431 baseline, unchanged
// ---------------------------------------------------------------------------

test('computeCanonicalCoverage on the real dataset: 0 chains -> 0/431, 0.0%, all unmapped', () => {
  const coverage = mod.computeCanonicalCoverage(TOTAL_FACTORY_TWIN_ASSETS, []);
  assert.strictEqual(coverage.confirmed, 0);
  assert.strictEqual(coverage.candidate, 0);
  assert.strictEqual(coverage.totalFactoryTwinAssets, 431);
  assert.strictEqual(coverage.unmapped, 431);
  assert.strictEqual(coverage.coveragePercent, 0);
});

test('computeCanonicalCoverage: a mix of lifecycles is counted into the correct buckets', () => {
  const chains = [
    confirmedChain('EQP-F1-0001', 'LDI-01'),
    { ...mod.unmappedChain(twin('EQP-F1-0002')), lifecycle: 'CANDIDATE' },
    { ...mod.unmappedChain(twin('EQP-F1-0003')), lifecycle: 'AMBIGUOUS' },
    { ...mod.unmappedChain(twin('EQP-F1-0004')), lifecycle: 'RETIRED' },
  ];
  const coverage = mod.computeCanonicalCoverage(431, chains);
  assert.strictEqual(coverage.confirmed, 1);
  assert.strictEqual(coverage.candidate, 1);
  assert.strictEqual(coverage.ambiguous, 1);
  assert.strictEqual(coverage.retired, 1);
});

// ---------------------------------------------------------------------------
// 6. Readiness decision -- never forced to READY, PARTIALLY_READY gated
// ---------------------------------------------------------------------------

test('readiness: the real current state (0 chains, no authoritative source) -> NOT_READY', () => {
  const decision = mod.computeCanonicalReadiness({
    chains: [],
    totalFactoryTwinAssets: TOTAL_FACTORY_TWIN_ASSETS,
    productionEnabledAssetIds: [],
    authoritativeSourceExists: false,
  });
  assert.strictEqual(decision, 'NOT_READY');
});

test('readiness: no authoritative source forces NOT_READY even with confirmed chains', () => {
  const decision = mod.computeCanonicalReadiness({
    chains: [confirmedChain('EQP-F1-0001', 'LDI-01')],
    totalFactoryTwinAssets: 431,
    productionEnabledAssetIds: [twin('EQP-F1-0001')],
    authoritativeSourceExists: false,
  });
  assert.strictEqual(decision, 'NOT_READY');
});

test('readiness: any anomaly forces NOT_READY regardless of coverage', () => {
  const a = confirmedChain('EQP-F1-0001', 'LDI-01');
  const b = confirmedChain('EQP-F1-0002', 'LDI-01'); // duplicate device
  const decision = mod.computeCanonicalReadiness({
    chains: [a, b],
    totalFactoryTwinAssets: 431,
    productionEnabledAssetIds: [twin('EQP-F1-0001'), twin('EQP-F1-0002')],
    authoritativeSourceExists: true,
  });
  assert.strictEqual(decision, 'NOT_READY');
});

test('readiness: all production-enabled assets confirmed, no anomalies, authoritative source -> READY', () => {
  const chain = confirmedChain('EQP-F1-0001', 'LDI-01');
  const decision = mod.computeCanonicalReadiness({
    chains: [chain],
    totalFactoryTwinAssets: 431,
    productionEnabledAssetIds: [twin('EQP-F1-0001')],
    authoritativeSourceExists: true,
  });
  assert.strictEqual(decision, 'READY');
});

test('readiness: partial coverage with NO partiallyReadyPolicy -> NOT_READY, never a silent middle ground', () => {
  const chain = confirmedChain('EQP-F1-0001', 'LDI-01');
  const decision = mod.computeCanonicalReadiness({
    chains: [chain],
    totalFactoryTwinAssets: 431,
    productionEnabledAssetIds: [twin('EQP-F1-0001'), twin('EQP-F1-0002')], // 0002 not confirmed
    authoritativeSourceExists: true,
  });
  assert.strictEqual(decision, 'NOT_READY');
});

test('readiness: partial coverage WITH explicit partiallyReadyPolicy -> PARTIALLY_READY', () => {
  const chain = confirmedChain('EQP-F1-0001', 'LDI-01');
  const decision = mod.computeCanonicalReadiness({
    chains: [chain],
    totalFactoryTwinAssets: 431,
    productionEnabledAssetIds: [twin('EQP-F1-0001'), twin('EQP-F1-0002')],
    authoritativeSourceExists: true,
    partiallyReadyPolicy: true,
  });
  assert.strictEqual(decision, 'PARTIALLY_READY');
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
