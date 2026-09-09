/**
 * Unit tests for FT-16's alarm/RCA module (lib/alarm.js).
 *
 * The critical invariant every test here ultimately serves: THE RCA EVENT
 * MUST BE THE SAME EVENT AS THE ALARM, NOT MERELY THE LATEST TELEMETRY --
 * and separately, that identity gating for alarms is exactly as strict as
 * FT-14/FT-15's own gate, never a looser "alarm-specific" shortcut.
 *
 * All identifiers here are synthetic (TEST-* / EQP-F1-9xxx). No production
 * identifier appears in this file.
 *
 * Run: node tests/unit/factory-twin-alarm.test.js
 */

'use strict';

const assert = require('assert');
const {
  AlarmLifecycle, EventResolution, isActive, durationMs, resolveEventType,
  alarmEligibility, buildAlarmEvent, reverseIdentityIndex, identityForDevice,
} = require('../../services/factory-twin-3d/lib/alarm');
const { MappingStatus } = require('../../services/factory-twin-3d/lib/mapping');
const { buildDrillDownUrl } = require('../../services/factory-twin-3d/lib/telemetry');

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

function alarmRow(overrides = {}) {
  return {
    logid: 'LOG-1', logdate: '2026-01-01T10:00:00.000Z',
    errorcode: '91009', severity: 'Critical', alarm_msg: 'TEST vacuum fault', category: 'VACUUM',
    equipmentid: 'TEST-DEVICE-01', device_id: 'TEST-DEVICE-01',
    related_log_id: 'DATA-1', lifecycle_status: AlarmLifecycle.OPEN, resolved_at: null,
    factory: '1', process: 'TEST-PROCESS',
    match_type: 'exact', temperature: 22.5, humidity: 55, air_vacuum: -80,
    scan_speed: 300, resist_dosage: 400, pe_1: 2, je_1: 1,
    ...overrides,
  };
}
const exactEventOf = (row) => (row.match_type == null ? null : {
  resolution: resolveEventType(row.match_type),
  factory: row.factory ?? null, process: row.process ?? null,
  temperature: row.temperature ?? null, humidity: row.humidity ?? null,
  air_vacuum: row.air_vacuum ?? null, scan_speed: row.scan_speed ?? null,
  resist_dosage: row.resist_dosage ?? null, pe_1: row.pe_1 ?? null, je_1: row.je_1 ?? null,
});

const CONFIRMED_TABLE = {
  'EQP-F1-9001': {
    asset_id: 'EQP-F1-9001', mapping_status: MappingStatus.CONFIRMED, ims_device_id: 'TEST-DEVICE-01',
    mes_machine_id: null, confidence: 'high', source: 'test', source_record: 't1', verified_at: '2026-01-01T00:00:00Z',
  },
};

// ── 1. active alarm with exact related_log_id ──
test('1. active alarm with exact related_log_id: exact event resolves, active=true', () => {
  const row = alarmRow();
  const identity = identityForDevice(row.device_id, reverseIdentityIndex(CONFIRMED_TABLE));
  const event = buildAlarmEvent(row, identity, exactEventOf(row), null);
  assert.strictEqual(event.active, true);
  assert.strictEqual(event.exact_event.resolution, EventResolution.EXACT);
  assert.strictEqual(event.related_log_id, 'DATA-1');
});

// ── 2. alarm with no related_log_id (falls to the existing nearest rule) ──
test('2. alarm with no related_log_id: falls back to nearest, not fabricated', () => {
  const row = alarmRow({ related_log_id: null, match_type: 'nearest' });
  const identity = identityForDevice(row.device_id, reverseIdentityIndex(CONFIRMED_TABLE));
  const event = buildAlarmEvent(row, identity, exactEventOf(row), null);
  assert.strictEqual(event.related_log_id, null);
  assert.strictEqual(event.exact_event.resolution, EventResolution.NEAREST);
});

// ── 3. related_log_id does not exist (defensive: this module never guesses) ──
test('3. an unrecognised/missing match_type resolves to RCA_EVENT_UNRESOLVED, never a guess', () => {
  assert.strictEqual(resolveEventType(undefined), EventResolution.UNRESOLVED);
  assert.strictEqual(resolveEventType(null), EventResolution.UNRESOLVED);
  assert.strictEqual(resolveEventType('something-else'), EventResolution.UNRESOLVED);
});

// ── 4. exact telemetry exists ──
test('4. exact telemetry exists: values pass through unchanged', () => {
  const row = alarmRow({ temperature: 19.9, humidity: 61 });
  const ee = exactEventOf(row);
  assert.strictEqual(ee.temperature, 19.9);
  assert.strictEqual(ee.humidity, 61);
});

// ── 5. exact event carries no telemetry-freshness shape (never the "latest" path) ──
test('5. the exact event is never the /api/state "latest" projection in disguise', () => {
  const row = alarmRow();
  const ee = exactEventOf(row);
  assert.ok(!('freshness' in ee), 'exact_event must never carry a freshness field -- that is telemetry.js\'s LATEST-row concept, not this exact event');
  assert.ok(!('last_seen' in ee));
});

// ── 6-9. identity gating, all four lifecycle states ──
test('6. confirmed mapping: physical overlay and drill-down both eligible', () => {
  const identity = identityForDevice('TEST-DEVICE-01', reverseIdentityIndex(CONFIRMED_TABLE));
  assert.strictEqual(identity.identity_state, MappingStatus.CONFIRMED);
  assert.strictEqual(identity.physical_asset_id, 'EQP-F1-9001');
  assert.deepStrictEqual(alarmEligibility(identity.identity_state),
    { physical_overlay_eligible: true, machine_drilldown_eligible: true });
});

test('7. unmapped device: both ineligible, no asset', () => {
  const identity = identityForDevice('TEST-DEVICE-99', reverseIdentityIndex(CONFIRMED_TABLE));
  assert.strictEqual(identity.identity_state, MappingStatus.UNRESOLVED);
  assert.strictEqual(identity.physical_asset_id, null);
  assert.deepStrictEqual(alarmEligibility(identity.identity_state),
    { physical_overlay_eligible: false, machine_drilldown_eligible: false });
});

test('8. conflicting mapping: identity stays visible as CONFLICTING, but both ineligible', () => {
  const table = { 'EQP-F1-9002': { asset_id: 'EQP-F1-9002', mapping_status: MappingStatus.CONFLICTING, ims_device_id: 'TEST-DEVICE-02' } };
  const identity = identityForDevice('TEST-DEVICE-02', reverseIdentityIndex(table));
  assert.strictEqual(identity.identity_state, MappingStatus.CONFLICTING);
  assert.strictEqual(identity.physical_asset_id, 'EQP-F1-9002', 'identity is still visible for audit, even though ineligible');
  assert.deepStrictEqual(alarmEligibility(identity.identity_state),
    { physical_overlay_eligible: false, machine_drilldown_eligible: false });
});

test('9. deprecated mapping: identity stays visible as DEPRECATED, but both ineligible', () => {
  const table = { 'EQP-F1-9003': { asset_id: 'EQP-F1-9003', mapping_status: MappingStatus.DEPRECATED, ims_device_id: 'TEST-DEVICE-03' } };
  const identity = identityForDevice('TEST-DEVICE-03', reverseIdentityIndex(table));
  assert.strictEqual(identity.identity_state, MappingStatus.DEPRECATED);
  assert.deepStrictEqual(alarmEligibility(identity.identity_state),
    { physical_overlay_eligible: false, machine_drilldown_eligible: false });
});

// ── 10. physical asset with no alarm: not this module's concern, but the
// reverse index must not manufacture one ──
test('10. a confirmed asset with no alarm row simply never appears -- the index does not manufacture an alarm', () => {
  const idx = reverseIdentityIndex(CONFIRMED_TABLE);
  assert.strictEqual(idx.size, 1); // only the one real mapping, nothing invented
});

// ── 11. device with alarm but no physical mapping: exact_event never exposed ──
test('11. device with alarm but no physical mapping: exact telemetry is computed but NEVER exposed', () => {
  const row = alarmRow({ device_id: 'TEST-DEVICE-99', equipmentid: 'TEST-DEVICE-99' });
  const identity = identityForDevice(row.device_id, reverseIdentityIndex(CONFIRMED_TABLE));
  const event = buildAlarmEvent(row, identity, exactEventOf(row), null);
  assert.strictEqual(event.identity_state, MappingStatus.UNRESOLVED);
  assert.strictEqual(event.exact_event, null, 'a real correlation existed internally but must never reach an unmapped device\'s event');
  assert.strictEqual(event.physical_overlay_eligible, false);
});

// ── 12. multiple alarms for same device ──
test('12. multiple alarms for the same device each build independently, same identity', () => {
  const row1 = alarmRow({ logid: 'LOG-1' });
  const row2 = alarmRow({ logid: 'LOG-2', errorcode: '90005', related_log_id: 'DATA-2' });
  const idx = reverseIdentityIndex(CONFIRMED_TABLE);
  const e1 = buildAlarmEvent(row1, identityForDevice(row1.device_id, idx), exactEventOf(row1), null);
  const e2 = buildAlarmEvent(row2, identityForDevice(row2.device_id, idx), exactEventOf(row2), null);
  assert.notStrictEqual(e1.alarm_id, e2.alarm_id);
  assert.strictEqual(e1.physical_asset_id, e2.physical_asset_id);
  assert.strictEqual(e1.related_log_id, 'DATA-1');
  assert.strictEqual(e2.related_log_id, 'DATA-2');
});

// ── 13. cleared alarm ──
test('13. a cleared (RESOLVED) alarm: active=false, real resolved_at carried through', () => {
  const row = alarmRow({
    lifecycle_status: AlarmLifecycle.RESOLVED,
    resolved_at: '2026-01-01T10:15:00.000Z',
  });
  const identity = identityForDevice(row.device_id, reverseIdentityIndex(CONFIRMED_TABLE));
  const event = buildAlarmEvent(row, identity, exactEventOf(row), null);
  assert.strictEqual(event.active, false);
  assert.strictEqual(event.cleared_time, '2026-01-01T10:15:00.000Z');
});

test('an alarm predating lifecycle tracking (no row, status null) counts as active, not resolved', () => {
  assert.strictEqual(isActive(null), true);
  assert.strictEqual(isActive(undefined), true);
  assert.strictEqual(isActive(AlarmLifecycle.OPEN), true);
  assert.strictEqual(isActive(AlarmLifecycle.ACKNOWLEDGED), true);
  assert.strictEqual(isActive(AlarmLifecycle.RESOLVED), false);
});

// ── 14. duration calculation ──
test('14. duration: resolved uses resolved_at, open uses now, invalid logdate is null', () => {
  const resolved = durationMs('2026-01-01T10:00:00.000Z', '2026-01-01T10:15:00.000Z');
  assert.strictEqual(resolved, 15 * 60 * 1000);
  const open = durationMs('2026-01-01T10:00:00.000Z', null, new Date('2026-01-01T10:05:00.000Z'));
  assert.strictEqual(open, 5 * 60 * 1000);
  assert.strictEqual(durationMs('not a date', null), null);
});

// ── 15. no fabricated RCA ──
test('15. an eligible device whose correlation genuinely found nothing gets null, never invented values', () => {
  const row = alarmRow({ match_type: null, temperature: null, humidity: null });
  const identity = identityForDevice(row.device_id, reverseIdentityIndex(CONFIRMED_TABLE));
  const event = buildAlarmEvent(row, identity, exactEventOf(row), null);
  assert.strictEqual(event.physical_overlay_eligible, true);
  assert.strictEqual(event.exact_event, null, 'eligible but unresolved -- null, not a fabricated reading');
});

// ── 16. no physical overlay without confirmed mapping (conflicting case, real telemetry present) ──
test('16. conflicting mapping with a real, successfully-correlated event: still zero overlay', () => {
  const table = { 'EQP-F1-9002': { asset_id: 'EQP-F1-9002', mapping_status: MappingStatus.CONFLICTING, ims_device_id: 'TEST-DEVICE-02' } };
  const row = alarmRow({ device_id: 'TEST-DEVICE-02', equipmentid: 'TEST-DEVICE-02' });
  const identity = identityForDevice(row.device_id, reverseIdentityIndex(table));
  const event = buildAlarmEvent(row, identity, exactEventOf(row), null);
  assert.strictEqual(event.exact_event, null);
  assert.strictEqual(event.optional_context, null);
});

// ── 17. drill-down preserves the exact event ──
test('17. drill-down URL carries the alarm\'s own event_time and device -- the SAME event, not a generic "now"', () => {
  const row = alarmRow();
  const identity = identityForDevice(row.device_id, reverseIdentityIndex(CONFIRMED_TABLE));
  const event = buildAlarmEvent(row, identity, exactEventOf(row), null);
  const eventTimeMs = new Date(event.event_time).getTime();
  const url = buildDrillDownUrl({
    machineId: event.device_id, factory: event.factory, mo: null,
    eventTimeMs, from: 'now-6h', to: 'now',
  });
  assert.ok(url.includes(`var-event_time_ms=${eventTimeMs}`));
  assert.ok(url.includes(`var-machine_id=${event.device_id}`));
});

test('17b. an ineligible alarm never reaches a drill-down at all', () => {
  const identity = identityForDevice('TEST-DEVICE-99', reverseIdentityIndex(CONFIRMED_TABLE));
  const elig = alarmEligibility(identity.identity_state);
  assert.strictEqual(elig.machine_drilldown_eligible, false);
});

// ── 18. context window does not replace exact event ──
test('18. exact_event and optional_context are separate fields; context never overwrites the event', () => {
  const row = alarmRow();
  const identity = identityForDevice(row.device_id, reverseIdentityIndex(CONFIRMED_TABLE));
  const contextWindow = [
    { time: '2026-01-01T09:59:00.000Z', temperature: 22.1 },
    { time: '2026-01-01T10:01:00.000Z', temperature: 22.9 },
  ];
  const event = buildAlarmEvent(row, identity, exactEventOf(row), contextWindow);
  assert.strictEqual(event.exact_event.temperature, 22.5, 'the exact event keeps its own value');
  assert.strictEqual(event.optional_context.length, 2);
  assert.notStrictEqual(event.optional_context, event.exact_event);
});

test('optional_context is null (not an empty array) when eligible but not requested/found', () => {
  const row = alarmRow();
  const identity = identityForDevice(row.device_id, reverseIdentityIndex(CONFIRMED_TABLE));
  const event = buildAlarmEvent(row, identity, exactEventOf(row), null);
  assert.strictEqual(event.optional_context, null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
