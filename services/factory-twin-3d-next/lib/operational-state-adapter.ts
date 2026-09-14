/**
 * Real vs. simulated operational-state adapters for the physical Factory
 * Twin's 431 machines -- the SAME real/simulated adapter pattern
 * `public/operational-state-adapters.js` already established for EAP cells
 * (FT-EAP-STATE-03/04), reproduced here for `Asset[]` because Step 6A's own
 * hard rules forbid connecting live telemetry yet: no PLC/SCADA/MES/
 * historian/equipment-controller integration exists for these 431 machines
 * either (same evidence `docs/eap/EAP_OPERATIONAL_SOURCE_AUDIT.md` already
 * documents for EAP), so the real adapter is honest UNAVAILABLE, always,
 * exactly like its EAP counterpart -- never a fake backend standing in for
 * one, per this step's own hard rule.
 *
 * PRODUCTION policy is REAL ONLY (unchanged from operational-state-
 * adapters.js's own resolver): the real adapter's UNAVAILABLE answer is
 * returned exactly as given unless a viewer explicitly turns the demo
 * toggle on, mirroring `simulationOn` defaulting to `false` in `eap.js`
 * (eap.js:578, "the one explicit, viewer-initiated exception").
 */

import type { Asset } from '@twin-domain/asset';
import { isMachine } from '@twin-domain/asset';
import type { MachineStateCode } from '@twin-domain/machine-state';
import { MACHINE_STATE_ORDER } from '@twin-domain/machine-state';
import type { OperationalStateResolution, StateSourceQuality } from '@twin-domain/data-quality';

/** `eap.js`'s `hashString()` (eap.js:580-584), reproduced exactly --
 *  deterministic, not random, so the same asset always simulates the same
 *  state across a reload. */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A floor mid-shift is not powered down -- same reasoning
 *  `makeSimulatedOperationalStateAdapter` applies to EAP cells
 *  (operational-state-adapters.js:94), reproduced for consistency. */
const SIM_STATES: readonly MachineStateCode[] = MACHINE_STATE_ORDER.filter(
  (s): s is Exclude<MachineStateCode, 'OFF' | 'UNDEFINED'> => s !== 'OFF' && s !== 'UNDEFINED',
);

/**
 * Real adapter: unconditionally UNAVAILABLE. Never set this to report
 * anything else without the evidence that changed (same discipline
 * `RealOperationalStateAdapter` enforces for EAP, operational-state-
 * adapters.js:47-58) -- Step 6A's own mission is proving the presentation
 * layer, not connecting a source.
 */
export function resolveReal(asset: Asset): OperationalStateResolution {
  return {
    object_id: asset.id,
    state: null,
    source_type: 'REAL',
    quality: 'UNAVAILABLE',
    observed_at: null,
    reason: 'no live telemetry connected in Step 6A (presentation-only step)',
  };
}

/**
 * Simulated adapter: only applied to a machine actually eligible for a live
 * state (`isMachine()`, the same type guard `statusForAsset()` enforces at
 * runtime) -- an asset with no IMS mapping has no machine state to simulate
 * one for, and that is NO_DATA, never a plausible-looking Idle or Off,
 * mirroring operational-state-adapters.js:110-116's "cell not attached to a
 * machine unit" -> NO_DATA rule exactly.
 */
export function resolveSimulated(asset: Asset): OperationalStateResolution {
  if (!isMachine(asset)) {
    return {
      object_id: asset.id,
      state: null,
      source_type: 'SIMULATED',
      quality: 'NO_DATA',
      observed_at: null,
      reason: 'asset has no confirmed IMS device mapping',
    };
  }
  const state = SIM_STATES[hashString(asset.id) % SIM_STATES.length];
  return {
    object_id: asset.id,
    state,
    source_type: 'SIMULATED',
    quality: 'SIMULATION',
    observed_at: null,
    reason: 'deterministic per-asset simulation, not live telemetry',
  };
}

/**
 * The one canonical resolve() every caller on this route uses -- tries real
 * first, always, and only substitutes simulated because that call really
 * did answer UNAVAILABLE and a viewer explicitly turned demo mode on, never
 * automatically. Exact structural mirror of `createOperationalStateResolver`
 * (operational-state-adapters.js:151-165); the day a real adapter exists
 * for these 431 machines, this function's own callers change nothing.
 */
export function resolveOperationalState(asset: Asset, demoModeOn: boolean): OperationalStateResolution {
  const real = resolveReal(asset);
  if (real.quality !== 'UNAVAILABLE') return real;
  if (!demoModeOn) return real;
  return resolveSimulated(asset);
}

/** `StateSourceQuality` values that must NEVER be read as, or colored
 *  like, DOWN -- the exact conflation Step 6A's own hard rule forbids. */
export const NOT_DOWN_QUALITIES: readonly StateSourceQuality[] = ['NO_DATA', 'UNAVAILABLE'];
