'use strict';

const { MACHINE_STATUS, statusPayload } = require('./status-model');

const STATUS_MODE = Object.freeze({
  REAL: 'real',
  MOCK: 'mock',
});

// Ordered to guarantee that a sufficiently large preview fleet visibly
// exercises every confirmed legend color. Placement order is deterministic,
// so the same asset retains the same preview state across refreshes/restarts.
const MOCK_STATUS_SEQUENCE = Object.freeze([
  MACHINE_STATUS.RUN,
  MACHINE_STATUS.IDLE,
  MACHINE_STATUS.DOWN,
  MACHINE_STATUS.INITIAL_PM_STOP,
  MACHINE_STATUS.OFF,
  MACHINE_STATUS.UNDEFINED,
]);

function normalizeStatusMode(value) {
  const mode = String(value || STATUS_MODE.REAL).trim().toLowerCase();
  if (!Object.values(STATUS_MODE).includes(mode)) {
    throw new Error('MACHINE_STATUS_MODE must be real or mock');
  }
  return mode;
}

function createMockStateRows(bindings) {
  return bindings.map((binding, index) => {
    const status = MOCK_STATUS_SEQUENCE[index % MOCK_STATUS_SEQUENCE.length];
    const display = statusPayload(status);
    return {
      device_id: binding.asset_id,
      display_name: binding.display_name,
      source_id: `MOCK:${binding.asset_id}`,
      state: status === MACHINE_STATUS.RUN ? 2 : status === MACHINE_STATUS.IDLE ? 1 : 0,
      operational_state: display.status,
      state_label: display.status_label,
      state_color: display.status_color,
      state_basis: 'mock_preview_deterministic',
      state_confidence: 'SIMULATED',
      state_updated_at: null,
      drilldown_enabled: false,
      board_no: null,
      total_board: null,
      mo: null,
      factory: null,
      // Alarm is deliberately not mocked. It is an independent operational
      // overlay and must not be implied by the red DOWN demonstration color.
      alarm: null,
    };
  });
}

module.exports = {
  MOCK_STATUS_SEQUENCE,
  STATUS_MODE,
  createMockStateRows,
  normalizeStatusMode,
};
