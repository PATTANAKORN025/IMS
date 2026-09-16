/**
 * Step 6C -- unit tests for the typed real-operational-state adapter
 * (services/factory-twin-3d-next/lib/operational-source-adapter.ts).
 *
 * No network calls: every case here is a pure/injected-fetch test.
 * Real /api/state fixtures (device_id/state/machine_state/board_no/
 * total_board/mo/factory/has_data/is_stale/last_seen/alarm shapes) are
 * reproduced from a live capture against the running production
 * container, not invented -- see docs/evidence/
 * FACTORY_TWIN_OPERATIONAL_SOURCE_ADAPTER.md for the capture itself.
 *
 * Run: node tests/unit/factory-twin-operational-source.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { requireTs } = require('./lib/require-ts');

const adapterPath = path.join(
  __dirname, '..', '..', 'services', 'factory-twin-3d-next', 'lib', 'operational-source-adapter.ts',
);
const mod = requireTs(adapterPath);

let passed = 0;
let failed = 0;
// `test()` calls below register synchronously (in file order) but several
// bodies are `async` (ApiOperationalStateSource.fetch() is a Promise) --
// queued here and awaited in order by the runner at the bottom, so a
// rejected promise is caught the same way a thrown sync error is, instead
// of surfacing as an unhandled rejection after the pass/fail count is
// already printed.
const queue = [];
function test(name, fn) {
  queue.push({ name, fn });
}
async function runQueue() {
  for (const { name, fn } of queue) {
    try {
      await fn();
      passed += 1;
      console.log(`  PASS  ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL  ${name}\n    ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Fixtures -- reproduced from a real capture, not invented
// ---------------------------------------------------------------------------

const REAL_LOOKING_RECORD = {
  device_id: 'LDI-01',
  state: 3,
  machine_state: 'DOWN',
  state_label: 'Down',
  state_color: '#ef4444',
  board_no: 69,
  total_board: 184,
  mo: 'MO-459647',
  factory: '2',
  has_data: true,
  is_stale: false,
  last_seen: '2026-09-14T02:31:06.874Z',
  alarm: {
    count: 1,
    owner: 'Maintenance',
    elapsed: '3m',
    related_log_id: 'SIM-01-1789352838756-31',
    logdate_ms: '1789352840681',
  },
};

const NO_DATA_RECORD = {
  device_id: 'LDI-A01',
  state: 0,
  machine_state: 'UNDEFINED',
  state_label: 'Undefined',
  state_color: '#94a3b8',
  board_no: null,
  total_board: null,
  mo: null,
  factory: null,
  has_data: false,
  is_stale: false,
  last_seen: null,
  alarm: null,
};

function validResponse(machines) {
  return { machines, queried_at: '2026-09-14T02:31:06.900Z' };
}

// ---------------------------------------------------------------------------
// 1. DTO parsing -- valid + invalid
// ---------------------------------------------------------------------------

test('parseApiOperationalStateResponse: valid real-looking response parses', () => {
  const result = mod.parseApiOperationalStateResponse(validResponse([REAL_LOOKING_RECORD, NO_DATA_RECORD]));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.data.machines.length, 2);
  assert.strictEqual(result.data.machines[0].device_id, 'LDI-01');
  assert.strictEqual(result.data.queried_at, '2026-09-14T02:31:06.900Z');
});

test('parseApiOperationalStateResponse: fails closed on missing machines[]', () => {
  const result = mod.parseApiOperationalStateResponse({ queried_at: 'x' });
  assert.strictEqual(result.ok, false);
  assert.ok(/machines/.test(result.error));
});

test('parseApiOperationalStateResponse: fails closed on missing queried_at', () => {
  const result = mod.parseApiOperationalStateResponse({ machines: [] });
  assert.strictEqual(result.ok, false);
  assert.ok(/queried_at/.test(result.error));
});

test('parseApiOperationalStateResponse: fails closed on a record missing device_id', () => {
  const bad = { ...REAL_LOOKING_RECORD };
  delete bad.device_id;
  const result = mod.parseApiOperationalStateResponse(validResponse([bad]));
  assert.strictEqual(result.ok, false);
  assert.ok(/device_id/.test(result.error));
});

test('parseApiOperationalStateResponse: fails closed on wrong-typed has_data', () => {
  const bad = { ...REAL_LOOKING_RECORD, has_data: 'yes' };
  const result = mod.parseApiOperationalStateResponse(validResponse([bad]));
  assert.strictEqual(result.ok, false);
  assert.ok(/has_data/.test(result.error));
});

test('parseApiOperationalStateResponse: fails closed on a malformed alarm object', () => {
  const bad = { ...REAL_LOOKING_RECORD, alarm: { count: 'one' } };
  const result = mod.parseApiOperationalStateResponse(validResponse([bad]));
  assert.strictEqual(result.ok, false);
  assert.ok(/alarm/.test(result.error));
});

test('parseApiOperationalStateResponse: accepts alarm: null (no active alarm)', () => {
  const result = mod.parseApiOperationalStateResponse(validResponse([NO_DATA_RECORD]));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.data.machines[0].alarm, null);
});

test('parseApiOperationalStateResponse: fails closed on non-object input', () => {
  assert.strictEqual(mod.parseApiOperationalStateResponse(null).ok, false);
  assert.strictEqual(mod.parseApiOperationalStateResponse('not json').ok, false);
  assert.strictEqual(mod.parseApiOperationalStateResponse(42).ok, false);
});

test('parseApiOperationalStateResponse: empty machines[] is valid (not an error)', () => {
  const result = mod.parseApiOperationalStateResponse(validResponse([]));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.data.machines.length, 0);
});

// ---------------------------------------------------------------------------
// 2. ApiOperationalStateSource -- fetch, HTTP failure, invalid JSON
// ---------------------------------------------------------------------------

function stubFetch(impl) {
  return async (url) => impl(url);
}

test('ApiOperationalStateSource: valid 200 response resolves to parsed data', async () => {
  const source = new mod.ApiOperationalStateSource('http://x', stubFetch(async () => ({
    ok: true, status: 200, json: async () => validResponse([REAL_LOOKING_RECORD]),
  })));
  const data = await source.fetch();
  assert.strictEqual(data.machines.length, 1);
});

test('ApiOperationalStateSource: non-2xx status throws (HTTP failure -> caller resolves UNAVAILABLE)', async () => {
  const source = new mod.ApiOperationalStateSource('http://x', stubFetch(async () => ({
    ok: false, status: 500, json: async () => ({}),
  })));
  await assert.rejects(() => source.fetch(), /responded 500/);
});

test('ApiOperationalStateSource: invalid JSON throws', async () => {
  const source = new mod.ApiOperationalStateSource('http://x', stubFetch(async () => ({
    ok: true, status: 200, json: async () => { throw new Error('boom'); },
  })));
  await assert.rejects(() => source.fetch(), /not valid JSON/);
});

test('ApiOperationalStateSource: schema mismatch throws (fail closed, not a silent pass-through)', async () => {
  const source = new mod.ApiOperationalStateSource('http://x', stubFetch(async () => ({
    ok: true, status: 200, json: async () => ({ unexpected: 'shape' }),
  })));
  await assert.rejects(() => source.fetch(), /schema mismatch/);
});

// ---------------------------------------------------------------------------
// 3. Simulator detection
// ---------------------------------------------------------------------------

test('detectSourceQuality: SIM- related_log_id prefix -> SIMULATED', () => {
  assert.strictEqual(mod.detectSourceQuality([REAL_LOOKING_RECORD]), 'SIMULATED');
});

test('detectSourceQuality: no alarm signal anywhere -> UNKNOWN, never REAL', () => {
  assert.strictEqual(mod.detectSourceQuality([NO_DATA_RECORD]), 'UNKNOWN');
});

test('detectSourceQuality: explicit declared hint always wins', () => {
  assert.strictEqual(mod.detectSourceQuality([NO_DATA_RECORD], { declared: 'REAL' }), 'REAL');
  assert.strictEqual(mod.detectSourceQuality([REAL_LOOKING_RECORD], { declared: 'REAL' }), 'REAL');
});

// ---------------------------------------------------------------------------
// 4. Identity mapping gate -- the most important rule (Section 4)
// ---------------------------------------------------------------------------

test('adaptOperationalState: no confirmed mapping -> NO_DATA, never guessed from position', () => {
  const result = mod.adaptOperationalState(
    ['EQP-F1-0001'],
    mod.EMPTY_MAPPING,
    { ok: true, response: validResponse([REAL_LOOKING_RECORD]) },
  );
  const rec = result.recordsByAssetId.get('EQP-F1-0001');
  assert.strictEqual(rec.quality, 'NO_DATA');
  assert.strictEqual(rec.state, null);
  assert.ok(/no confirmed device mapping/.test(rec.reason));
});

test('adaptOperationalState: confirmed mapping resolves the real record', () => {
  const mapping = { assetIdToDeviceId: new Map([['EQP-F1-0001', 'LDI-01']]) };
  const result = mod.adaptOperationalState(
    ['EQP-F1-0001'],
    mapping,
    { ok: true, response: validResponse([REAL_LOOKING_RECORD]) },
    { declared: 'REAL' },
  );
  const rec = result.recordsByAssetId.get('EQP-F1-0001');
  assert.strictEqual(rec.state, 'DOWN');
  assert.strictEqual(rec.quality, 'VALID');
  assert.strictEqual(rec.observed_at, REAL_LOOKING_RECORD.last_seen);
});

test('adaptOperationalState: mapped device absent from response -> UNAVAILABLE, never guessed', () => {
  const mapping = { assetIdToDeviceId: new Map([['EQP-F1-0001', 'LDI-99']]) };
  const result = mod.adaptOperationalState(
    ['EQP-F1-0001'],
    mapping,
    { ok: true, response: validResponse([REAL_LOOKING_RECORD]) },
  );
  const rec = result.recordsByAssetId.get('EQP-F1-0001');
  assert.strictEqual(rec.quality, 'UNAVAILABLE');
});

test('adaptOperationalState: current real coverage is 0/431, verified not artificially changed', () => {
  const assetIds = Array.from({ length: 431 }, (_, i) => `EQP-F1-${String(i + 1).padStart(4, '0')}`);
  const result = mod.adaptOperationalState(assetIds, mod.EMPTY_MAPPING, { ok: true, response: validResponse([]) });
  const noData = [...result.recordsByAssetId.values()].filter((r) => r.quality === 'NO_DATA').length;
  assert.strictEqual(noData, 431);
  const coverage = mod.computeMappingCoverage({ totalMachines: 431, mapping: mod.EMPTY_MAPPING, sourceDeviceIds: [] });
  assert.strictEqual(coverage.confirmed, 0);
  assert.strictEqual(coverage.total, 431);
  assert.strictEqual(coverage.coveragePercent, 0);
});

// ---------------------------------------------------------------------------
// 5. Freshness -- stale never becomes DOWN, has_data=false -> NO_DATA
// ---------------------------------------------------------------------------

test('adaptOperationalState: has_data=false -> NO_DATA, never DOWN', () => {
  const mapping = { assetIdToDeviceId: new Map([['EQP-F1-0001', 'LDI-A01']]) };
  const result = mod.adaptOperationalState(
    ['EQP-F1-0001'], mapping, { ok: true, response: validResponse([NO_DATA_RECORD]) },
  );
  const rec = result.recordsByAssetId.get('EQP-F1-0001');
  assert.strictEqual(rec.quality, 'NO_DATA');
  assert.notStrictEqual(rec.state, 'DOWN');
});

test('adaptOperationalState: is_stale=true -> STALE, even if machine_state says DOWN (defensive, not trusted blindly)', () => {
  const staleDown = { ...REAL_LOOKING_RECORD, device_id: 'LDI-STALE', is_stale: true };
  const mapping = { assetIdToDeviceId: new Map([['EQP-F1-0001', 'LDI-STALE']]) };
  const result = mod.adaptOperationalState(
    ['EQP-F1-0001'], mapping, { ok: true, response: validResponse([staleDown]) },
  );
  const rec = result.recordsByAssetId.get('EQP-F1-0001');
  assert.strictEqual(rec.quality, 'STALE', 'stale record must never resolve to a quality implying a confirmed DOWN');
  assert.notStrictEqual(rec.quality, 'VALID');
});

// ---------------------------------------------------------------------------
// 6. Error handling -- HTTP failure -> UNAVAILABLE, never DOWN
// ---------------------------------------------------------------------------

test('adaptOperationalState: source fetch failure -> every asset UNAVAILABLE, never DOWN', () => {
  const result = mod.adaptOperationalState(
    ['EQP-F1-0001', 'EQP-F1-0002'],
    { assetIdToDeviceId: new Map([['EQP-F1-0001', 'LDI-01']]) },
    { ok: false, reason: '/api/state responded 500' },
  );
  for (const rec of result.recordsByAssetId.values()) {
    assert.strictEqual(rec.quality, 'UNAVAILABLE');
    assert.notStrictEqual(rec.state, 'DOWN');
  }
  assert.strictEqual(result.sourceQuality, 'UNKNOWN');
});

// ---------------------------------------------------------------------------
// 7. Unknown state -- safe handling, never a guess
// ---------------------------------------------------------------------------

test('adaptOperationalState: unrecognised machine_state string resolves to UNDEFINED, never guessed', () => {
  const weird = { ...REAL_LOOKING_RECORD, device_id: 'LDI-WEIRD', machine_state: 'SOMETHING_NEW', is_stale: false };
  const mapping = { assetIdToDeviceId: new Map([['EQP-F1-0001', 'LDI-WEIRD']]) };
  const result = mod.adaptOperationalState(
    ['EQP-F1-0001'], mapping, { ok: true, response: validResponse([weird]) },
  );
  const rec = result.recordsByAssetId.get('EQP-F1-0001');
  assert.strictEqual(rec.state, 'UNDEFINED');
});

// ---------------------------------------------------------------------------
// 8. Mapping coverage metrics -- duplicates, unmapped counts
// ---------------------------------------------------------------------------

test('computeMappingCoverage: detects a duplicate device mapping', () => {
  const mapping = {
    assetIdToDeviceId: new Map([
      ['EQP-F1-0001', 'LDI-01'],
      ['EQP-F1-0002', 'LDI-01'],
    ]),
  };
  const coverage = mod.computeMappingCoverage({ totalMachines: 431, mapping, sourceDeviceIds: ['LDI-01', 'LDI-02'] });
  assert.strictEqual(coverage.confirmed, 2);
  assert.strictEqual(coverage.duplicateDeviceMappings, 1);
  assert.strictEqual(coverage.unmappedSourceRecords, 1); // LDI-02 unmapped
  assert.strictEqual(coverage.unmappedMachines, 429);
});

test('computeMappingCoverage: no duplicates when every mapped device is distinct', () => {
  const mapping = {
    assetIdToDeviceId: new Map([
      ['EQP-F1-0001', 'LDI-01'],
      ['EQP-F1-0002', 'LDI-02'],
    ]),
  };
  const coverage = mod.computeMappingCoverage({ totalMachines: 431, mapping, sourceDeviceIds: ['LDI-01', 'LDI-02'] });
  assert.strictEqual(coverage.duplicateDeviceMappings, 0);
  assert.strictEqual(coverage.unmappedSourceRecords, 0);
});

// ---------------------------------------------------------------------------
// 9. Performance instrumentation -- sane, not fabricated
// ---------------------------------------------------------------------------

test('measureAdaptPerformance: reports a real record count and positive payload size', () => {
  const raw = JSON.stringify(validResponse([REAL_LOOKING_RECORD, NO_DATA_RECORD]));
  const mapping = { assetIdToDeviceId: new Map([['EQP-F1-0001', 'LDI-01']]) };
  const perf = mod.measureAdaptPerformance(raw, ['EQP-F1-0001'], mapping);
  assert.strictEqual(perf.recordCount, 1);
  assert.ok(perf.payloadBytes > 0);
  assert.ok(perf.validationMs >= 0);
  assert.ok(perf.mappingMs >= 0);
});

// ---------------------------------------------------------------------------

(async () => {
  await runQueue();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
