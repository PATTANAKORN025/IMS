'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyError,
  latestErrorReference,
  machineEventDetail,
  mapMachineEventStatus,
  normalizeStaleSeconds,
} = require('../machine-event');

const NOW = Date.parse('2026-08-31T01:31:00.000Z');

test('maps fresh RUN and STOP records to the confirmed six-state contract', () => {
  assert.equal(mapMachineEventStatus({
    status_event_type: 'RUN',
    status_event_time: '2026-08-31T01:30:58.000Z',
  }, { nowMs: NOW }).status, 'RUN');
  assert.equal(mapMachineEventStatus({
    status_event_type: 'STOP',
    status_event_time: '2026-08-31T01:30:58.000Z',
  }, { nowMs: NOW }).status, 'INITIAL_PM_STOP');
});

test('builds evidence-only drilling detail from source messages', () => {
  const detail = machineEventDetail({
    status_id: 448916,
    status_event_code: '0201',
    status_event_type: 'RUN',
    status_event_message: 'Run Hits: 2',
    status_event_time: '2026-08-31T01:30:58.000Z',
    program_message: '[END RUN, BLKD] A220A-107BJ-FA SCALE X100.010 Y100.010.TLP Run Time= 14:08',
    program_event_time: '2026-08-31T01:30:44.000Z',
    hits_message: 'Run Hits: 2',
    hits_event_time: '2026-08-31T01:30:58.000Z',
    tool_measurement_message: 'T200 tool diameter: 3.101 3.105 3.116 3.113 3.115 3.111',
    tool_measurement_event_time: '2026-08-31T01:30:35.000Z',
  });

  assert.equal(detail.operation.event_code, '0201');
  assert.equal(detail.production.run_hits, 2);
  assert.equal(detail.tool_measurement.tool, 'T200');
  assert.deepEqual(detail.tool_measurement.values, ['3.101', '3.105', '3.116', '3.113', '3.115', '3.111']);
  assert.equal(detail.reference_spec.spindle_count, 6);
  assert.equal(detail.reference_spec.spindle_count_basis, 'OBSERVED_IN_LATEST_TOOL_MEASUREMENT');
  assert.equal(detail.reference_spec.max_rpm, null);
});

test('does not invent production or engineering fields when source messages are absent', () => {
  const detail = machineEventDetail({
    status_id: 1,
    status_event_type: 'STOP',
    status_event_time: '2026-08-31T01:30:58.000Z',
  });

  assert.equal(detail.production.run_hits, null);
  assert.equal(detail.production.program_message, null);
  assert.equal(detail.tool_measurement, null);
  assert.equal(detail.reference_spec.spindle_count, null);
  assert.equal(detail.reference_spec.max_rpm_basis, 'NOT_CONFIRMED');
});

test('fails closed for stale, missing and unknown machine_event states', () => {
  assert.equal(mapMachineEventStatus(null, { nowMs: NOW }).status, 'UNDEFINED');
  assert.equal(mapMachineEventStatus({
    status_event_type: 'RUN',
    status_event_time: '2026-08-31T00:00:00.000Z',
  }, { nowMs: NOW, staleSeconds: 60 }).basis, 'machine_event_status_stale');
  assert.equal(mapMachineEventStatus({
    status_event_type: 'PAUSE',
    status_event_time: '2026-08-31T01:30:58.000Z',
  }, { nowMs: NOW }).status, 'UNDEFINED');
  assert.equal(normalizeStaleSeconds(0), 0);
  assert.throws(() => normalizeStaleSeconds(-1), /zero or a positive number/);
});

test('keeps the latest known status when freshness expiry is disabled', () => {
  const result = mapMachineEventStatus({
    status_event_type: 'RUN',
    status_event_time: '2026-01-01T00:00:00.000Z',
  }, { nowMs: NOW, staleSeconds: 0 });
  assert.equal(result.status, 'RUN');
  assert.equal(result.basis, 'machine_event_status_run');
});

test('marks decoded error details as history, never as an active alarm', () => {
  const error = latestErrorReference({
    error_id: 99,
    error_code: '0409',
    error_message: 'Diameter error',
    error_event_time: '2026-08-31T01:29:46.000Z',
    error_level: 'E',
    error_description: 'Spindle diameter error',
    troubleshooting_method: 'Check the measured result.',
    error_master_source: 'DG Operation manual',
    error_context: 'EVENT 0110 ATC T176M165-> T0M0, at Hole 0',
  });
  assert.equal(error.code, '0409');
  assert.equal(error.troubleshooting, 'Check the measured result.');
  assert.equal(error.lifecycle_status, 'HISTORICAL_REFERENCE_ONLY');
  assert.equal(error.active, false);
  assert.equal(error.category, 'SPINDLE_TOOL');
  assert.equal(error.phase, 'TOOL_CHANGE_MEASUREMENT');
  assert.equal(error.risk, 'STOP_AND_INSPECT');
});

test('classifies subsystem and operation phase separately', () => {
  assert.deepEqual(classifyError({
    error_code: '0108',
    error_message: 'Safety door interlock open',
    error_context: 'HOME origin return',
  }), {
    category: 'SAFETY',
    phase: 'HOME_RESET',
    risk: 'STOP_AND_SECURE',
  });

  assert.deepEqual(classifyError({
    error_code: '0502',
    error_message: 'Program file format error',
  }), {
    category: 'PROGRAM_TOOL_TABLE',
    phase: 'PROGRAM_SELECTION',
    risk: 'VALIDATE_BEFORE_RESTART',
  });

  assert.deepEqual(classifyError({
    error_code: '0204',
    error_message: 'Alarm Time: 00:20',
  }), {
    category: 'UNKNOWN',
    phase: 'UNKNOWN',
    risk: 'REVIEW_REQUIRED',
  });
});
