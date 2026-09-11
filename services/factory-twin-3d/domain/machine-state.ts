/**
 * Canonical machine run-state vocabulary and theme.
 *
 * This merges two existing, independently-maintained copies of the SAME
 * eight-state vocabulary that must never drift apart: server-side
 * lib/contracts.js (MachineState, MACHINE_STATE_THEME -- imported by
 * server.js's queryDeviceState(), server.js:8) and client-side
 * public/operational-status.js (OPERATIONAL_STATUS -- the richer copy,
 * carrying glyph/backed/meaning that contracts.js's copy lacks). Both encode
 * identical colours for identical states; this file is the first place that
 * fact is asserted as a CHECKED contract rather than left as two files that
 * happen to agree. tests/unit/factory-twin-domain.test.js asserts parity
 * against both at test time -- if either JS file's values ever drift from
 * this one, that test fails.
 *
 * Only four states are ever actually produced by this deployment's backend
 * today (STATE_SQL derives RUN/IDLE/DOWN/UNDEFINED only, see server.js's
 * STATE_CODE_TO_MACHINE_STATE) -- BACKED_MACHINE_STATES names exactly which,
 * mirroring operational-status.js's per-entry `backed` flag. OFF/INITIAL/
 * PM/STOP are real plant states with no source column in this schema yet;
 * they are listed for a complete vocabulary, never emitted by anything that
 * queries live data. NEVER treat an unbacked state as reachable at runtime,
 * and never invent a ninth.
 */

export type MachineStateCode =
  | 'OFF'
  | 'DOWN'
  | 'IDLE'
  | 'INITIAL'
  | 'PM'
  | 'STOP'
  | 'RUN'
  | 'UNDEFINED';

export interface MachineStateTheme {
  readonly label: string;
  readonly glyph: string;
  /** '#rrggbb', matches public/operational-status.js exactly. */
  readonly color: string;
  /** 0xrrggbb, matches lib/contracts.js and is what Three.js material
   *  color inputs expect directly. */
  readonly hex: number;
  /** true only for a state this deployment's own backend can currently
   *  produce (see file header). */
  readonly backed: boolean;
  readonly meaning: string;
}

export const MACHINE_STATE_ORDER: readonly MachineStateCode[] = [
  'OFF', 'DOWN', 'IDLE', 'INITIAL', 'PM', 'STOP', 'RUN', 'UNDEFINED',
];

export const MACHINE_STATE_THEME: Readonly<Record<MachineStateCode, MachineStateTheme>> = {
  OFF: {
    label: 'Off', glyph: '■', color: '#475569', hex: 0x475569, backed: false,
    meaning: 'Powered down. No column in this schema reports it yet.',
  },
  DOWN: {
    label: 'Down', glyph: '◆', color: '#ef4444', hex: 0xef4444, backed: true,
    meaning: 'Active Critical or Major alarm on a mapped asset.',
  },
  IDLE: {
    label: 'Idle', glyph: '▲', color: '#f59e0b', hex: 0xf59e0b, backed: true,
    meaning: 'Mapped asset present and reporting, not running.',
  },
  INITIAL: {
    label: 'Initial', glyph: '◐', color: '#38bdf8', hex: 0x38bdf8, backed: false,
    meaning: 'Warm-up or start-of-job. No column in this schema reports it yet.',
  },
  PM: {
    label: 'PM', glyph: '◇', color: '#3b82f6', hex: 0x3b82f6, backed: false,
    meaning: 'Planned maintenance. No column in this schema reports it yet.',
  },
  STOP: {
    label: 'Stop', glyph: '▬', color: '#a855f7', hex: 0xa855f7, backed: false,
    meaning: 'Deliberately stopped. No column in this schema reports it yet.',
  },
  RUN: {
    label: 'Run', glyph: '●', color: '#22c55e', hex: 0x22c55e, backed: true,
    meaning: 'Mapped asset running with no active alarm.',
  },
  UNDEFINED: {
    label: 'Undefined', glyph: '?', color: '#94a3b8', hex: 0x94a3b8, backed: true,
    meaning: 'Mapped asset whose evidence is insufficient to name a state.',
  },
};

export const BACKED_MACHINE_STATES: readonly MachineStateCode[] = MACHINE_STATE_ORDER.filter(
  (k) => MACHINE_STATE_THEME[k].backed,
);

/**
 * Resolves a raw run-state value (as returned by /api/state's
 * `machine_state` field, or any other untrusted input) to its
 * MachineStateCode. Mirrors operational-status.js's statusForMachineState()
 * exactly: anything unrecognised, including null/undefined/a stale string,
 * resolves to UNDEFINED -- never a plausible-looking guess. A missing
 * lookup must never read as a healthy machine, and must not read as a
 * powered-down one either.
 */
export function resolveMachineState(state: unknown): MachineStateCode {
  if (typeof state !== 'string') return 'UNDEFINED';
  const found = MACHINE_STATE_ORDER.find((k) => k === state);
  return found ?? 'UNDEFINED';
}
