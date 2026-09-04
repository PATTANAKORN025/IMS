'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUS_MODE,
  createMockStateRows,
  normalizeStatusMode,
} = require('../mock-status');

test('mock mode is opt-in and rejects unknown values', () => {
  assert.equal(normalizeStatusMode(), STATUS_MODE.REAL);
  assert.equal(normalizeStatusMode('MOCK'), STATUS_MODE.MOCK);
  assert.throws(() => normalizeStatusMode('sometimes'), /real or mock/);
});

test('mock rows exercise all six states without inventing alarm data', () => {
  const bindings = Array.from({ length: 12 }, (_, index) => ({
    asset_id: `APEX3-F1-${String(index + 1).padStart(3, '0')}`,
    display_name: `Machine ${index + 1}`,
  }));
  const rows = createMockStateRows(bindings);
  assert.equal(new Set(rows.map((row) => row.operational_state)).size, 6);
  assert.ok(rows.every((row) => row.state_confidence === 'SIMULATED'));
  assert.ok(rows.every((row) => row.state_basis === 'mock_preview_deterministic'));
  assert.ok(rows.every((row) => row.source_id.startsWith('MOCK:')));
  assert.ok(rows.every((row) => row.alarm === null));
});
