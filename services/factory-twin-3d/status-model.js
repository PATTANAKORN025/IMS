'use strict';

const MACHINE_STATUS = Object.freeze({
  OFF: 'OFF',
  DOWN: 'DOWN',
  IDLE: 'IDLE',
  INITIAL_PM_STOP: 'INITIAL_PM_STOP',
  RUN: 'RUN',
  UNDEFINED: 'UNDEFINED',
});

// State names and color families follow the six-state legend visible on the
// existing Apex 3 CFM screen. Hex values are provisional UI approximations
// until the source CSS/config is owner-approved. "Undefine" is intentionally
// retained as the display label; the internal enum uses UNDEFINED.
const STATUS_DEFINITIONS = Object.freeze({
  [MACHINE_STATUS.OFF]: Object.freeze({ label: 'Off', color: '#a6a6a6' }),
  [MACHINE_STATUS.DOWN]: Object.freeze({ label: 'Down', color: '#ff0000' }),
  [MACHINE_STATUS.IDLE]: Object.freeze({ label: 'Idle', color: '#ffc000' }),
  [MACHINE_STATUS.INITIAL_PM_STOP]: Object.freeze({ label: 'Initial,PM,Stop', color: '#2f9dcc' }),
  [MACHINE_STATUS.RUN]: Object.freeze({ label: 'Run', color: '#00ff00' }),
  [MACHINE_STATUS.UNDEFINED]: Object.freeze({ label: 'Undefine', color: '#ffffff' }),
});

const SOURCE_ALIASES = new Map([
  ['OFF', MACHINE_STATUS.OFF],
  ['DOWN', MACHINE_STATUS.DOWN],
  ['IDLE', MACHINE_STATUS.IDLE],
  ['INITIAL', MACHINE_STATUS.INITIAL_PM_STOP],
  ['PM', MACHINE_STATUS.INITIAL_PM_STOP],
  ['STOP', MACHINE_STATUS.INITIAL_PM_STOP],
  ['INITIAL,PM,STOP', MACHINE_STATUS.INITIAL_PM_STOP],
  ['INITIAL_PM_STOP', MACHINE_STATUS.INITIAL_PM_STOP],
  ['RUN', MACHINE_STATUS.RUN],
  ['RUNNING', MACHINE_STATUS.RUN],
  ['UNDEFINE', MACHINE_STATUS.UNDEFINED],
  ['UNDEFINED', MACHINE_STATUS.UNDEFINED],
  ['NO_DATA', MACHINE_STATUS.UNDEFINED],
]);

function normalizeSourceStatus(value) {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return SOURCE_ALIASES.get(normalized) || MACHINE_STATUS.UNDEFINED;
}

// LDI currently exposes a fresh boolean run signal, not the full six-state
// equipment state used by CFM.  This fallback is deliberately explicit and
// carries a provisional basis so callers do not mistake it for the eventual
// trigger/reset-derived production state.
function mapLegacyLdiStatus({ hasData, isFresh, isRunning }) {
  if (!hasData || !isFresh) {
    return {
      status: MACHINE_STATUS.UNDEFINED,
      basis: 'telemetry_missing_or_stale',
      confidence: 'PROVISIONAL',
    };
  }

  if (isRunning === true) {
    return {
      status: MACHINE_STATUS.RUN,
      basis: 'ldi_boolean_state_true',
      confidence: 'PROVISIONAL',
    };
  }

  if (isRunning === false) {
    return {
      status: MACHINE_STATUS.IDLE,
      basis: 'ldi_boolean_state_false',
      confidence: 'PROVISIONAL',
    };
  }

  return {
    status: MACHINE_STATUS.UNDEFINED,
    basis: 'unmapped_source_state',
    confidence: 'PROVISIONAL',
  };
}

function statusPayload(status) {
  const canonical = STATUS_DEFINITIONS[status] ? status : MACHINE_STATUS.UNDEFINED;
  return {
    status: canonical,
    status_label: STATUS_DEFINITIONS[canonical].label,
    status_color: STATUS_DEFINITIONS[canonical].color,
  };
}

module.exports = {
  MACHINE_STATUS,
  STATUS_DEFINITIONS,
  mapLegacyLdiStatus,
  normalizeSourceStatus,
  statusPayload,
};
