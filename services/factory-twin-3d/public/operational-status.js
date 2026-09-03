/**
 * Operational status vocabulary for the Factory Twin.
 *
 * This is the FACTORY-WIDE status language: the eight things a physical asset
 * on this floor can be showing an operator. It is a presentation layer over the
 * run-state vocabulary in lib/contracts.js, not a second source of truth, and
 * the mapping between the two is declared here so the legend and the renderer
 * cannot drift apart.
 *
 * THE HONESTY RULE THIS FILE EXISTS TO ENFORCE. Four of the eight states have
 * no backend column behind them in this system today. lib/contracts.js is
 * explicit that OFF and PM_STOP "have no real source column yet in this
 * schema", and nothing in the current query derives a warning tier -- STATE_SQL
 * collapses Critical/Major alarms straight to DOWN. Those states are listed
 * anyway, because an operator legend with holes in it is worse than one that
 * says which lamps can actually light. Each carries `backed`, and the legend
 * renders an unbacked state visibly differently rather than implying the system
 * can show it today.
 *
 * NEVER set `backed: true` on a state without a real column behind it. That
 * single flag is the difference between a status board and a mock-up.
 *
 * ACCESSIBILITY. Every state carries a distinct `glyph` as well as a colour.
 * Status is never communicated by colour alone -- the glyph and the label are
 * both load-bearing, which matters for the red/green pair most of all.
 */

/** @typedef {'NORMAL'|'WARNING'|'CRITICAL'|'OFFLINE'|'STALE_DATA'|'MAINTENANCE'|'UNMAPPED'|'PRESENTATION_ONLY'} OperationalStatus */

export const OPERATIONAL_STATUS = Object.freeze({
  NORMAL: Object.freeze({
    label: 'NORMAL',
    glyph: '●', // filled circle
    color: '#22c55e',
    hex: 0x22c55e,
    machineState: 'RUN',
    backed: true,
    meaning: 'Mapped asset reporting a running state.',
  }),
  WARNING: Object.freeze({
    label: 'WARNING',
    glyph: '▲', // triangle
    color: '#f59e0b',
    hex: 0xf59e0b,
    machineState: null,
    backed: false,
    meaning: 'No warning tier is derivable today: active alarms collapse to CRITICAL.',
  }),
  CRITICAL: Object.freeze({
    label: 'CRITICAL',
    glyph: '◆', // diamond
    color: '#ef4444',
    hex: 0xef4444,
    machineState: 'DOWN',
    backed: true,
    meaning: 'Mapped asset with an active Critical or Major alarm.',
  }),
  OFFLINE: Object.freeze({
    label: 'OFFLINE',
    glyph: '■', // filled square
    color: '#64748b',
    hex: 0x64748b,
    machineState: 'OFF',
    backed: false,
    meaning: 'No column in this schema reports powered-off yet.',
  }),
  STALE_DATA: Object.freeze({
    label: 'STALE DATA',
    glyph: '◑', // half-filled circle
    color: '#a78bfa',
    hex: 0xa78bfa,
    machineState: 'UNKNOWN',
    backed: true,
    meaning: 'Mapped asset whose telemetry is missing or past its freshness window.',
  }),
  MAINTENANCE: Object.freeze({
    label: 'MAINTENANCE',
    glyph: '◇', // hollow diamond
    color: '#3b82f6',
    hex: 0x3b82f6,
    machineState: 'PM_STOP',
    backed: false,
    meaning: 'No column in this schema reports planned maintenance yet.',
  }),
  UNMAPPED: Object.freeze({
    label: 'UNMAPPED',
    glyph: '○', // hollow circle
    color: '#94a3b8',
    hex: 0x94a3b8,
    machineState: null,
    backed: true,
    meaning: 'CAD asset with no authoritative link to an IMS device. Carries no status.',
  }),
  PRESENTATION_ONLY: Object.freeze({
    label: 'PRESENTATION ONLY',
    glyph: '▫', // small hollow square
    color: '#c4b5fd',
    hex: 0xc4b5fd,
    machineState: null,
    backed: true,
    meaning: 'A drawn form standing in for an asset. Not a measurement, never a status.',
  }),
});

/** Declaration order for the legend and for any status roll-up. */
export const STATUS_ORDER = Object.freeze([
  'NORMAL', 'WARNING', 'CRITICAL', 'OFFLINE',
  'STALE_DATA', 'MAINTENANCE', 'UNMAPPED', 'PRESENTATION_ONLY',
]);

/** The states this deployment can actually derive from its own data today. */
export const BACKED_STATUSES = Object.freeze(
  STATUS_ORDER.filter((k) => OPERATIONAL_STATUS[k].backed)
);

/**
 * Maps a run-state to its operational status.
 *
 * Returns UNMAPPED for anything it does not recognise, including null and
 * undefined. That default is deliberate and is the whole point: an asset whose
 * state cannot be established must fall to "no authoritative link", never to
 * NORMAL. A missing lookup must never read as a healthy machine.
 */
export function statusForMachineState(state) {
  if (typeof state !== 'string') return 'UNMAPPED';
  for (const key of STATUS_ORDER) {
    if (OPERATIONAL_STATUS[key].machineState === state) return key;
  }
  return 'UNMAPPED';
}

/**
 * Resolves the status of a physical slot.
 *
 * A slot without a confirmed device mapping is UNMAPPED regardless of anything
 * else present on the record. Proximity, numbering and name similarity are not
 * evidence, so nothing here consults position, id or label -- only whether an
 * authoritative device id exists, and only then the live state.
 */
export function statusForSlot(slot, stateByDeviceId) {
  if (!slot || typeof slot !== 'object') return 'UNMAPPED';
  const id = slot.ims_device_id;
  if (typeof id !== 'string' || id.length === 0) return 'UNMAPPED';
  if (!stateByDeviceId || typeof stateByDeviceId.get !== 'function') return 'UNMAPPED';
  const row = stateByDeviceId.get(id);
  if (!row) return 'STALE_DATA';
  return statusForMachineState(row.state);
}
