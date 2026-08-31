'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  latestErrorReference,
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
  assert.throws(() => normalizeStaleSeconds(0), /positive number/);
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
  });
  assert.equal(error.code, '0409');
  assert.equal(error.troubleshooting, 'Check the measured result.');
  assert.equal(error.lifecycle_status, 'HISTORICAL_REFERENCE_ONLY');
  assert.equal(error.active, false);
});
