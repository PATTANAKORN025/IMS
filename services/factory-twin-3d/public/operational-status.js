/**
 * Operational status vocabulary for the Factory Twin.
 *
 * EXACTLY EIGHT machine states exist on this floor, and they are the eight the
 * plant itself uses:
 *
 *     OFF  DOWN  IDLE  INITIAL  PM  STOP  RUN  UNDEFINED
 *
 * Nothing else is a machine state here. The earlier vocabulary of NORMAL /
 * WARNING / CRITICAL / OFFLINE / STALE DATA / MAINTENANCE was a monitoring
 * dialect invented by the twin, not the plant's own language, and it is gone:
 * an operator reading this board and an operator reading the line's own HMI
 * must see the same word for the same machine.
 *
 * THE HONESTY RULE THIS FILE EXISTS TO ENFORCE. Only four of the eight have a
 * column behind them in this deployment. STATE_SQL derives exactly four
 * outcomes -- running, not running, active Critical/Major alarm, and no fresh
 * telemetry -- which are RUN, IDLE, DOWN and UNDEFINED. OFF, INITIAL, PM and
 * STOP are real plant states with no source column here yet. They are listed,
 * because a legend with holes is worse than one that says which lamps can
 * light, and each carries `backed: false` so the legend can render it as a
 * state the system cannot currently report rather than as a state that happens
 * to have no members right now.
 *
 * NEVER set `backed: true` on a state without a real column behind it. That one
 * flag is the difference between a status board and a mock-up. And never infer
 * a state the data cannot support: a machine whose evidence is insufficient is
 * UNDEFINED, never a plausible-looking Idle or Off.
 *
 * DATA QUALITY IS NOT A MACHINE STATE. Whether an asset is linked to an IMS
 * device is a fact about the *record*, not about the machine, so it lives in a
 * separate indicator (`DATA_QUALITY`) that the legend renders apart from the
 * eight. An asset with no authoritative link shows UNMAPPED and carries no
 * machine state at all -- it is not Off, and it is not Undefined either.
 *
 * ACCESSIBILITY. Every state carries a distinct `glyph` as well as a colour.
 * Status is never communicated by colour alone -- glyph and label are both
 * load-bearing, which matters most for the red/green pair.
 */

/** @typedef {'OFF'|'DOWN'|'IDLE'|'INITIAL'|'PM'|'STOP'|'RUN'|'UNDEFINED'} OperationalStatus */

export const OPERATIONAL_STATUS = Object.freeze({
  OFF: Object.freeze({
    label: 'Off',
    glyph: '■', // filled square
    color: '#475569',
    hex: 0x475569,
    machineState: 'OFF',
    backed: false,
    meaning: 'Powered down. No column in this schema reports it yet.',
  }),
  DOWN: Object.freeze({
    label: 'Down',
    glyph: '◆', // diamond
    color: '#ef4444',
    hex: 0xef4444,
    machineState: 'DOWN',
    backed: true,
    meaning: 'Active Critical or Major alarm on a mapped asset.',
  }),
  IDLE: Object.freeze({
    label: 'Idle',
    glyph: '▲', // triangle
    color: '#f59e0b',
    hex: 0xf59e0b,
    machineState: 'IDLE',
    backed: true,
    meaning: 'Mapped asset present and reporting, not running.',
  }),
  INITIAL: Object.freeze({
    label: 'Initial',
    glyph: '◐', // half-filled circle
    color: '#38bdf8',
    hex: 0x38bdf8,
    machineState: 'INITIAL',
    backed: false,
    meaning: 'Warm-up or start-of-job. No column in this schema reports it yet.',
  }),
  PM: Object.freeze({
    label: 'PM',
    glyph: '◇', // hollow diamond
    color: '#3b82f6',
    hex: 0x3b82f6,
    machineState: 'PM',
    backed: false,
    meaning: 'Planned maintenance. No column in this schema reports it yet.',
  }),
  STOP: Object.freeze({
    label: 'Stop',
    glyph: '▬', // bar
    color: '#a855f7',
    hex: 0xa855f7,
    machineState: 'STOP',
    backed: false,
    meaning: 'Deliberately stopped. No column in this schema reports it yet.',
  }),
  RUN: Object.freeze({
    label: 'Run',
    glyph: '●', // filled circle
    color: '#22c55e',
    hex: 0x22c55e,
    machineState: 'RUN',
    backed: true,
    meaning: 'Mapped asset running with no active alarm.',
  }),
  UNDEFINED: Object.freeze({
    label: 'Undefined',
    glyph: '?',
    color: '#94a3b8',
    hex: 0x94a3b8,
    machineState: 'UNDEFINED',
    backed: true,
    meaning: 'Mapped asset whose evidence is insufficient to name a state.',
  }),
});

/** Declaration order for the legend, the status strip and any roll-up. */
export const STATUS_ORDER = Object.freeze([
  'OFF', 'DOWN', 'IDLE', 'INITIAL', 'PM', 'STOP', 'RUN', 'UNDEFINED',
]);

/**
 * Record-quality indicators. NOT machine states, and deliberately held in a
 * separate table so no roll-up, legend or renderer can quietly treat one as a
 * ninth state.
 */
export const DATA_QUALITY = Object.freeze({
  UNMAPPED: Object.freeze({
    label: 'Unmapped',
    glyph: '○', // hollow circle
    color: '#64748b',
    hex: 0x64748b,
    meaning: 'CAD asset with no authoritative link to an IMS device. Carries no '
      + 'machine state, and is not counted in the state distribution.',
  }),
});

/** The states this deployment can actually derive from its own data today. */
export const BACKED_STATUSES = Object.freeze(
  STATUS_ORDER.filter((k) => OPERATIONAL_STATUS[k].backed)
);

/**
 * Maps a run-state to its operational status.
 *
 * Returns UNDEFINED for anything it does not recognise, including null and
 * undefined. That default is the whole point: a machine whose state cannot be
 * established is explicitly Undefined, never a plausible-looking Idle, Off or
 * Run. A missing lookup must never read as a healthy machine, and it must not
 * read as a powered-down one either.
 */
export function statusForMachineState(state) {
  if (typeof state !== 'string') return 'UNDEFINED';
  for (const key of STATUS_ORDER) {
    if (OPERATIONAL_STATUS[key].machineState === state) return key;
  }
  return 'UNDEFINED';
}

/**
 * Resolves the display state of one physical asset.
 *
 * Returns either one of the eight machine states or the string 'UNMAPPED',
 * which is a record-quality answer rather than a machine state. An asset
 * without a confirmed device mapping is UNMAPPED regardless of anything else on
 * the record. Proximity, numbering and name similarity are not evidence, so
 * nothing here consults position, id or label -- only whether an authoritative
 * device id exists, and only then the live state.
 */
export function statusForAsset(asset, stateByDeviceId) {
  if (!asset || typeof asset !== 'object') return 'UNMAPPED';
  const id = asset.ims_device_id;
  if (typeof id !== 'string' || id.length === 0) return 'UNMAPPED';
  if (!stateByDeviceId || typeof stateByDeviceId.get !== 'function') return 'UNMAPPED';
  const row = stateByDeviceId.get(id);
  // Mapped but silent is a machine we know about and cannot describe, which is
  // precisely UNDEFINED. It is NOT unmapped -- the link exists.
  if (!row) return 'UNDEFINED';
  return statusForMachineState(row.machine_state || row.state);
}
