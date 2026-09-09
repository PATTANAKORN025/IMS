/**
 * Real vs. simulated operational-state adapters for the EAP map.
 *
 * Two adapters, one canonical output shape (object_id, state, source_type,
 * quality, observed_at, reason). The caller (eap.js) never asks an adapter
 * directly which one is answering -- that fact is IN the record
 * (source_type), so a future real integration changes nothing about how
 * the map, the inspector or the state-breakdown table read a cell's state.
 *
 * FT-EAP-STATE-03: this file exists because "no real source" was, until
 * now, a fact this codebase only stated in comments and in eap-map.js's
 * wire contract (status UNKNOWN, reason "no authoritative IMS mapping
 * exists"). It had no adapter of its own -- callers just skipped straight
 * to simulation. RealOperationalStateAdapter below is a real, always-
 * queried module, not a stub commented out for later: it exists so
 * "unavailable" is a fact the data model states on every resolution, and
 * so a real integration has exactly one place to change.
 */

/** @typedef {'VALID'|'STALE'|'NO_DATA'|'UNAVAILABLE'|'SIMULATION'} OperationalStateQuality */

export const OPERATIONAL_STATE_QUALITY = Object.freeze({
  // A real, fresh observation from an authoritative source. Unreachable
  // today -- see docs/eap/EAP_OPERATIONAL_SOURCE_AUDIT.md -- listed here,
  // not omitted, for the same reason operational-status.js lists OFF/
  // INITIAL/PM/STOP with backed:false: a value with no path to it yet is
  // still part of the vocabulary, and a legend or contract with silent
  // holes is worse than one that names what it cannot currently produce.
  VALID: 'VALID',
  // A real observation that exists but is too old to trust. Unreachable
  // today for the same reason VALID is: no real source to go stale.
  STALE: 'STALE',
  // A source was asked and is available, but has nothing to report for
  // THIS object (e.g. an EAP cell with no machine unit attached to it) --
  // an object-level fact, not a fact about the source itself.
  NO_DATA: 'NO_DATA',
  // The source itself is not running, or does not exist at all. A
  // source-level fact: when true, every object reads UNAVAILABLE,
  // regardless of what NO_DATA would otherwise say about any one of them.
  UNAVAILABLE: 'UNAVAILABLE',
  // A generated stand-in, not an observation of anything real.
  SIMULATION: 'SIMULATION',
});

export const SOURCE_TYPE = Object.freeze({ REAL: 'REAL', SIMULATED: 'SIMULATED' });

/**
 * APEX3's authoritative operational-state source. Queried first, every
 * single resolution -- never assumed unavailable, asked. It answers
 * UNAVAILABLE unconditionally today: the repository-wide search this
 * honesty rests on (no PLC, SCADA, MES, historian or equipment-controller
 * integration exists anywhere in this codebase, and LDI -- the one real
 * machine-state-shaped table that DOES exist -- is excluded because no
 * authoritative EAP-cell-to-machine mapping exists to source it through)
 * is docs/eap/EAP_OPERATIONAL_SOURCE_AUDIT.md. Never set this adapter to
 * report anything but UNAVAILABLE without that document being updated
 * with the real evidence that changed.
 */
export const RealOperationalStateAdapter = Object.freeze({
  source_type: SOURCE_TYPE.REAL,
  isAvailable: () => false,
  resolve: (cell) => ({
    object_id: cell ? cell.cell_id : null,
    state: null,
    source_type: SOURCE_TYPE.REAL,
    quality: OPERATIONAL_STATE_QUALITY.UNAVAILABLE,
    observed_at: null,
    reason: 'no authoritative APEX3 operational-state source exists for EAP cells '
      + '(see docs/eap/EAP_OPERATIONAL_SOURCE_AUDIT.md)',
  }),
});

/**
 * Client-side only -- never touches /api/state, TimescaleDB, Node-RED or
 * any production telemetry, and never written anywhere. This floor has 0
 * confirmed IMS mappings today, so a real status board would be entirely
 * UNMAPPED; the simulation exists so this view reads as a working
 * operational twin while that mapping work is separate, ongoing,
 * real-CAD-first work -- a stand-in for status, never for identity or
 * mapping, both of which stay exactly as honestly reported everywhere
 * else on this page.
 *
 * Deterministic, not random: the same cell always simulates the same
 * state across a reload, from a plain string hash of its own cell_id,
 * through the same eight-state vocabulary (operational-status.js) the
 * physical twin's legend already uses. Only applied to a cell actually
 * attached to a machine unit; a cell attached to no machine has no
 * machine state to simulate one for -- and that is NO_DATA, not OFF,
 * whether or not simulation happens to be running.
 *
 * @param {{ statusOrder: string[], hashString: (s: string) => number }} deps
 */
export function makeSimulatedOperationalStateAdapter({ statusOrder, hashString }) {
  const simStates = statusOrder.filter((k) => k !== 'OFF'); // a floor mid-shift is not powered down
  return Object.freeze({
    source_type: SOURCE_TYPE.SIMULATED,
    isAvailable: () => true,
    /** @param {{ simulationOn: boolean }} ctx */
    resolve: (cell, ctx) => {
      const objectId = cell ? cell.cell_id : null;
      if (!ctx || !ctx.simulationOn) {
        return {
          object_id: objectId, state: null, source_type: SOURCE_TYPE.SIMULATED,
          quality: OPERATIONAL_STATE_QUALITY.UNAVAILABLE, observed_at: null,
          reason: 'simulation disabled',
        };
      }
      if (!cell || cell.unit_state !== 'ATTACHED') {
        return {
          object_id: objectId, state: null, source_type: SOURCE_TYPE.SIMULATED,
          quality: OPERATIONAL_STATE_QUALITY.NO_DATA, observed_at: null,
          reason: 'cell not attached to a machine unit',
        };
      }
      const state = simStates[hashString(cell.cell_id) % simStates.length];
      return {
        object_id: objectId, state, source_type: SOURCE_TYPE.SIMULATED,
        quality: OPERATIONAL_STATE_QUALITY.SIMULATION, observed_at: null,
        reason: 'deterministic per-cell simulation, not live telemetry',
      };
    },
  });
}

/**
 * The pair every caller actually uses, plus the one canonical resolve()
 * that tries real first, always, and falls back to simulated only because
 * that call really did answer UNAVAILABLE -- not because the caller
 * assumed it would. The day a real adapter exists and sometimes answers
 * VALID or STALE, this function's own callers change nothing.
 */
export function createOperationalStateResolver({ statusOrder, hashString }) {
  const real = RealOperationalStateAdapter;
  const simulated = makeSimulatedOperationalStateAdapter({ statusOrder, hashString });
  return {
    real,
    simulated,
    resolve(cell, ctx) {
      const realResult = real.resolve(cell, ctx);
      if (realResult.quality !== OPERATIONAL_STATE_QUALITY.UNAVAILABLE) return realResult;
      return simulated.resolve(cell, ctx);
    },
  };
}
