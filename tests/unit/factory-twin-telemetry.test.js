/**
 * Unit tests for FT-15's live telemetry overlay (lib/telemetry.js).
 *
 * The invariant every test here ultimately serves: WITH ZERO CONFIRMED
 * MAPPINGS, NO PHYSICAL CAD ASSET MAY RECEIVE LIVE IMS STATE. That is
 * proven directly (an empty mapping table produces an empty overlay,
 * whatever telemetry exists), and every other case exists to show the
 * gate holds for the cases an empty table cannot exercise: conflicting,
 * deprecated, a confirmed mapping to a device with no telemetry, a
 * confirmed mapping to a device that was never even discovered.
 *
 * All identifiers here are synthetic (TEST-* / EQP-F1-9xxx). No production
 * identifier appears in this file.
 *
 * Run: node tests/unit/factory-twin-telemetry.test.js
 */

'use strict';

const assert = require('assert');
const {
  Freshness, freshnessFor, buildDrillDownUrl, projectDeviceTelemetry,
  overlayEligibility, resolvePhysicalOverlay,
} = require('../../services/factory-twin-3d/lib/telemetry');
const { MappingStatus } = require('../../services/factory-twin-3d/lib/mapping');

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

function confirmedMapping(overrides = {}) {
  return {
    asset_id: 'EQP-F1-9001',
    ims_device_id: 'TEST-DEVICE-01',
    mes_machine_id: null,
    mapping_status: MappingStatus.CONFIRMED,
    confidence: 'high',
    source: 'test-harness',
    source_record: 'row-1',
    verified_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function deviceRow(overrides = {}) {
  return {
    device_id: 'TEST-DEVICE-01',
    state: 2,
    machine_state: 'RUN',
    board_no: 3,
    total_board: 10,
    mo: 'TEST-MO-1',
    factory: 'F1',
    has_data: true,
    is_stale: false,
    last_seen: '2026-01-01T00:04:00.000Z',
    alarm: null,
    ...overrides,
  };
}

// ── freshness: deterministic, from real existing facts only ──
test('LIVE: has data, not stale', () => {
  assert.strictEqual(freshnessFor(true, false), Freshness.LIVE);
});
test('STALE: has data, but stale', () => {
  assert.strictEqual(freshnessFor(true, true), Freshness.STALE);
});
test('NO_DATA: never reported', () => {
  assert.strictEqual(freshnessFor(false, false), Freshness.NO_DATA);
  assert.strictEqual(freshnessFor(false, true), Freshness.NO_DATA, 'has_data=false wins regardless of is_stale');
});
test('UNKNOWN: malformed input, never guessed into LIVE', () => {
  assert.strictEqual(freshnessFor(undefined, undefined), Freshness.UNKNOWN);
  assert.strictEqual(freshnessFor(null, false), Freshness.UNKNOWN);
  assert.strictEqual(freshnessFor(true, undefined), Freshness.UNKNOWN);
});

// ── device telemetry projection: device identity only, never physical ──
test('a device telemetry record carries no physical asset field at all', () => {
  const out = projectDeviceTelemetry(deviceRow());
  assert.ok(!('physical_asset_id' in out));
  assert.ok(!('identity_state' in out));
  assert.ok(!('live_status_eligible' in out));
});
test('a malformed row projects to null, never a partial record', () => {
  assert.strictEqual(projectDeviceTelemetry(null), null);
  assert.strictEqual(projectDeviceTelemetry({}), null);
  assert.strictEqual(projectDeviceTelemetry({ device_id: '' }), null);
});
test('live telemetry projects with LIVE freshness', () => {
  const out = projectDeviceTelemetry(deviceRow());
  assert.strictEqual(out.freshness, Freshness.LIVE);
  assert.strictEqual(out.device_id, 'TEST-DEVICE-01');
});
test('stale telemetry projects with STALE freshness, state still carried', () => {
  const out = projectDeviceTelemetry(deviceRow({ is_stale: true, machine_state: 'UNDEFINED' }));
  assert.strictEqual(out.freshness, Freshness.STALE);
});
test('no telemetry (has_data=false) projects with NO_DATA freshness', () => {
  const out = projectDeviceTelemetry(deviceRow({ has_data: false, last_seen: null }));
  assert.strictEqual(out.freshness, Freshness.NO_DATA);
});

// ── eligibility: identical to mapping.js's own gate, no re-derivation ──
test('eligibility is fully open only for confirmed', () => {
  assert.deepStrictEqual(overlayEligibility(MappingStatus.CONFIRMED),
    { live_status_eligible: true, alarm_eligible: true, drill_down_eligible: true });
});
test('eligibility is fully closed for conflicting', () => {
  assert.deepStrictEqual(overlayEligibility(MappingStatus.CONFLICTING),
    { live_status_eligible: false, alarm_eligible: false, drill_down_eligible: false });
});
test('eligibility is fully closed for deprecated', () => {
  assert.deepStrictEqual(overlayEligibility(MappingStatus.DEPRECATED),
    { live_status_eligible: false, alarm_eligible: false, drill_down_eligible: false });
});
test('eligibility is fully closed for unresolved', () => {
  assert.deepStrictEqual(overlayEligibility(MappingStatus.UNRESOLVED),
    { live_status_eligible: false, alarm_eligible: false, drill_down_eligible: false });
});

// ── drill-down URL: the existing convention, reused, or null ──
test('a complete drill-down request builds the existing URL shape', () => {
  const url = buildDrillDownUrl({
    machineId: 'TEST-DEVICE-01', factory: 'F1', mo: 'TEST-MO-1',
    eventTimeMs: 1234567890, from: 'now-6h', to: 'now',
  });
  assert.strictEqual(url,
    '/d/ims-ldi-machine-snapshot/set2-machine-snapshot?'
    + 'var-machine_id=TEST-DEVICE-01&var-factory=F1&var-mo=TEST-MO-1'
    + '&var-event_time_ms=1234567890&from=now-6h&to=now');
});
test('a drill-down request missing any required field builds nothing', () => {
  assert.strictEqual(buildDrillDownUrl({ machineId: 'X' }), null);
  assert.strictEqual(buildDrillDownUrl(null), null);
  assert.strictEqual(buildDrillDownUrl({
    machineId: 'X', factory: 'F1', mo: null, eventTimeMs: NaN, from: 'a', to: 'b',
  }), null);
});

// ── resolvePhysicalOverlay: the whole gate, end to end ──

test('1. confirmed device -> physical mapping with real telemetry produces an overlay entry', () => {
  const mappingByAssetId = { 'EQP-F1-9001': confirmedMapping() };
  const telemetryByDeviceId = new Map([['TEST-DEVICE-01', projectDeviceTelemetry(deviceRow())]]);
  const { overlayByAssetId, counts } = resolvePhysicalOverlay(
    ['EQP-F1-9001'], mappingByAssetId, telemetryByDeviceId, { from: 'now-6h', to: 'now' });
  assert.ok(overlayByAssetId['EQP-F1-9001']);
  assert.strictEqual(overlayByAssetId['EQP-F1-9001'].device_id, 'TEST-DEVICE-01');
  assert.strictEqual(overlayByAssetId['EQP-F1-9001'].state, 'RUN');
  assert.strictEqual(counts.confirmed, 1);
  assert.strictEqual(counts.liveAttached, 1);
});

test('2. an unmapped asset produces no overlay entry, even with telemetry available for other devices', () => {
  const telemetryByDeviceId = new Map([['TEST-DEVICE-01', projectDeviceTelemetry(deviceRow())]]);
  const { overlayByAssetId, counts } = resolvePhysicalOverlay(
    ['EQP-F1-9001'], {}, telemetryByDeviceId, { from: 'now-6h', to: 'now' });
  assert.strictEqual(overlayByAssetId['EQP-F1-9001'], undefined);
  assert.strictEqual(counts.liveAttached, 0);
});

test('3. a conflicting mapping never produces an overlay entry, even with real telemetry behind it', () => {
  const mappingByAssetId = { 'EQP-F1-9001': confirmedMapping({ mapping_status: MappingStatus.CONFLICTING }) };
  const telemetryByDeviceId = new Map([['TEST-DEVICE-01', projectDeviceTelemetry(deviceRow())]]);
  const { overlayByAssetId, counts } = resolvePhysicalOverlay(
    ['EQP-F1-9001'], mappingByAssetId, telemetryByDeviceId, { from: 'now-6h', to: 'now' });
  assert.strictEqual(overlayByAssetId['EQP-F1-9001'], undefined);
  assert.strictEqual(counts.liveAttached, 0);
});

test('4. a deprecated mapping never produces an overlay entry', () => {
  const mappingByAssetId = { 'EQP-F1-9001': confirmedMapping({ mapping_status: MappingStatus.DEPRECATED }) };
  const telemetryByDeviceId = new Map([['TEST-DEVICE-01', projectDeviceTelemetry(deviceRow())]]);
  const { overlayByAssetId } = resolvePhysicalOverlay(
    ['EQP-F1-9001'], mappingByAssetId, telemetryByDeviceId, { from: 'now-6h', to: 'now' });
  assert.strictEqual(overlayByAssetId['EQP-F1-9001'], undefined);
});

test('5. confirmed mapping with stale telemetry still attaches, honestly labelled STALE', () => {
  const mappingByAssetId = { 'EQP-F1-9001': confirmedMapping() };
  const telemetryByDeviceId = new Map([
    ['TEST-DEVICE-01', projectDeviceTelemetry(deviceRow({ is_stale: true, machine_state: 'UNDEFINED' }))],
  ]);
  const { overlayByAssetId } = resolvePhysicalOverlay(
    ['EQP-F1-9001'], mappingByAssetId, telemetryByDeviceId, { from: 'now-6h', to: 'now' });
  assert.strictEqual(overlayByAssetId['EQP-F1-9001'].freshness, Freshness.STALE);
});

test('6. confirmed mapping with no telemetry row at all produces no overlay entry', () => {
  const mappingByAssetId = { 'EQP-F1-9001': confirmedMapping() };
  const { overlayByAssetId, counts } = resolvePhysicalOverlay(
    ['EQP-F1-9001'], mappingByAssetId, new Map(), { from: 'now-6h', to: 'now' });
  assert.strictEqual(overlayByAssetId['EQP-F1-9001'], undefined);
  assert.strictEqual(counts.confirmed, 1, 'still counted as a real confirmed mapping');
  assert.strictEqual(counts.liveAttached, 0, 'but never attached without a telemetry row');
});

test('7. confirmed mapping with live telemetry: alarm and drill-down are both eligible and populated', () => {
  const mappingByAssetId = { 'EQP-F1-9001': confirmedMapping() };
  const telemetryByDeviceId = new Map([
    ['TEST-DEVICE-01', projectDeviceTelemetry(deviceRow({
      machine_state: 'DOWN',
      alarm: { count: 1, owner: 'Maintenance', elapsed: '5m', related_log_id: 42, logdate_ms: 1234567890 },
    }))],
  ]);
  const { overlayByAssetId, counts } = resolvePhysicalOverlay(
    ['EQP-F1-9001'], mappingByAssetId, telemetryByDeviceId, { from: 'now-6h', to: 'now' });
  const entry = overlayByAssetId['EQP-F1-9001'];
  assert.ok(entry.alarm);
  assert.strictEqual(entry.alarm.count, 1);
  assert.ok(entry.drill_down_url.includes('var-machine_id=TEST-DEVICE-01'));
  assert.strictEqual(counts.alarmEligible, 1);
  assert.strictEqual(counts.drillDownEligible, 1);
});

test('8. a physical asset with no device behind it at all is simply absent -- no fabricated entry', () => {
  const { overlayByAssetId } = resolvePhysicalOverlay(
    ['EQP-F1-9002'], {}, new Map(), { from: 'now-6h', to: 'now' });
  assert.deepStrictEqual(overlayByAssetId, {});
});

test('9. a real device with telemetry but no physical asset claiming it never appears in the overlay at all', () => {
  // The overlay is keyed by asset_id, driven by the asset list -- a device
  // with telemetry but no CONFIRMED asset pointing at it has no asset_id to
  // be filed under. It remains fully visible through /api/state, untouched.
  const telemetryByDeviceId = new Map([['TEST-DEVICE-01', projectDeviceTelemetry(deviceRow())]]);
  const { overlayByAssetId } = resolvePhysicalOverlay(
    [], {}, telemetryByDeviceId, { from: 'now-6h', to: 'now' });
  assert.deepStrictEqual(overlayByAssetId, {});
});

test('10. two assets confirmed to the same device: mapping.js\'s own validateMappings refuses this at load time (FT-14); resolvePhysicalOverlay assumes an already-validated table and would attach both if handed one -- proving the gate belongs at the file-validation boundary, not re-checked here', () => {
  const mappingByAssetId = {
    'EQP-F1-9001': confirmedMapping({ asset_id: 'EQP-F1-9001' }),
    'EQP-F1-9002': confirmedMapping({ asset_id: 'EQP-F1-9002' }), // same ims_device_id -- would be rejected upstream
  };
  const telemetryByDeviceId = new Map([['TEST-DEVICE-01', projectDeviceTelemetry(deviceRow())]]);
  const { overlayByAssetId } = resolvePhysicalOverlay(
    ['EQP-F1-9001', 'EQP-F1-9002'], mappingByAssetId, telemetryByDeviceId, { from: 'now-6h', to: 'now' });
  // Documents the real boundary: this is why server.js's loadPrivateAssetMapping
  // MUST reject a file failing validateMappings() before ever building this table.
  assert.ok(overlayByAssetId['EQP-F1-9001']);
  assert.ok(overlayByAssetId['EQP-F1-9002']);
});

test('11. no fabricated mapping: an unresolved asset never receives a live-looking overlay entry from a hostile/coincidental key', () => {
  const telemetryByDeviceId = new Map([['TEST-DEVICE-01', projectDeviceTelemetry(deviceRow())]]);
  const { overlayByAssetId } = resolvePhysicalOverlay(
    ['__proto__', 'constructor'], {}, telemetryByDeviceId, { from: 'now-6h', to: 'now' });
  assert.deepStrictEqual(overlayByAssetId, {});
});

test('12. the critical invariant: an empty mapping table (this deployment\'s real state) attaches nothing, whatever telemetry exists', () => {
  const assetIds = Array.from({ length: 433 }, (_, i) => `EQP-F1-${String(i).padStart(4, '0')}`);
  const telemetryByDeviceId = new Map([
    ['TEST-DEVICE-01', projectDeviceTelemetry(deviceRow())],
    ['TEST-DEVICE-02', projectDeviceTelemetry(deviceRow({ device_id: 'TEST-DEVICE-02' }))],
  ]);
  const { overlayByAssetId, counts } = resolvePhysicalOverlay(
    assetIds, {}, telemetryByDeviceId, { from: 'now-6h', to: 'now' });
  assert.deepStrictEqual(overlayByAssetId, {});
  assert.strictEqual(counts.confirmed, 0);
  assert.strictEqual(counts.liveAttached, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
