'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MACHINE_STATUS,
  STATUS_DEFINITIONS,
  mapLegacyLdiStatus,
  normalizeSourceStatus,
  statusPayload,
} = require('../status-model');

test('normalizes the six confirmed CFM labels without inventing alarm semantics', () => {
  assert.equal(normalizeSourceStatus('Off'), MACHINE_STATUS.OFF);
  assert.equal(normalizeSourceStatus('Down'), MACHINE_STATUS.DOWN);
  assert.equal(normalizeSourceStatus('Idle'), MACHINE_STATUS.IDLE);
  assert.equal(normalizeSourceStatus('Initial, PM, Stop'), MACHINE_STATUS.INITIAL_PM_STOP);
  assert.equal(normalizeSourceStatus('Run'), MACHINE_STATUS.RUN);
  assert.equal(normalizeSourceStatus('Undefine'), MACHINE_STATUS.UNDEFINED);
  assert.equal(normalizeSourceStatus('something-new'), MACHINE_STATUS.UNDEFINED);
});

test('maps the limited LDI boolean signal conservatively', () => {
  assert.equal(mapLegacyLdiStatus({ hasData: false, isFresh: false, isRunning: null }).status, MACHINE_STATUS.UNDEFINED);
  assert.equal(mapLegacyLdiStatus({ hasData: true, isFresh: true, isRunning: true }).status, MACHINE_STATUS.RUN);
  assert.equal(mapLegacyLdiStatus({ hasData: true, isFresh: true, isRunning: false }).status, MACHINE_STATUS.IDLE);
});

test('uses the confirmed six display labels and colors', () => {
  assert.equal(Object.keys(STATUS_DEFINITIONS).length, 6);
  assert.deepEqual(statusPayload(MACHINE_STATUS.INITIAL_PM_STOP), {
    status: MACHINE_STATUS.INITIAL_PM_STOP,
    status_label: 'Initial,PM,Stop',
    status_color: '#2f9dcc',
  });
  assert.equal(statusPayload('ALARM').status, MACHINE_STATUS.UNDEFINED);
});
