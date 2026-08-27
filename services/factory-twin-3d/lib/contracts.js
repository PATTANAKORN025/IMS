'use strict';

// Factory Twin data contracts -- shared shape definitions for the
// placement/state API and the Three.js renderer. Plain JS + JSDoc, not
// TypeScript: this repo has no frontend build toolchain anywhere (no
// bundler, no tsconfig, no React/Vue/Svelte), and this service is a
// vendored-Three.js static page served directly by Express (see
// public/index.html's importmap) -- adding a TS compile step here would be
// a new toolchain for one file, not a fit with how the rest of the repo
// works. JSDoc typedefs give the same documentation/shape value without
// requiring a build step; a real editor (VS Code, WebStorm) still gets
// autocomplete/type-checking from these via `// @ts-check` if desired.
//
// Two-tier split this contract exists to support: this file, server.js's
// query shapes, and app.js's renderer are all public (this repo is public
// -- github.com/PATTANAKORN025/IMS). Nothing here depends on real facility
// geometry -- `position`/`footprint` are always sourced from
// computePlacements()'s deterministic synthetic grid (`source:
// 'simulated_grid'`) until a real survey/CAD import is supplied through a
// private, out-of-repo channel (see
// docs/superpowers/specs/2026-08-27-sanitized-4floor-twin-layout-design.md).
// `machineKey`/state ARE real (device_id and live DB state) -- these are
// operational identifiers, not facility-identifying secrets, and are
// already public in this exact repo (postgres/init/040-register-ldi-
// devices.sql's real device_id seed, committed since the 2026-08-07
// real-data cutover). Keeping them real is what makes this a digital
// TWIN rather than a disconnected mockup.

/**
 * Standardized machine run-state vocabulary. Mirrors the generic
 * SCADA/HMI state vocabulary (Off / Down / Idle / Run / PM-Stop /
 * Undefined-style status boards use universally) rather than inventing a
 * new one -- but only OK/IDLE/UNKNOWN/DOWN are currently derivable from
 * this system's own real backend query (v_ldi_machine_latest_full's
 * has_data/is_stale/state columns, joined against ldi_alarm_log --
 * services/factory-twin-3d/server.js's STATE_SQL). OFF and PM_STOP have
 * no real source column yet in this schema -- listed here for a stable,
 * complete vocabulary the renderer can switch on, not because the backend
 * emits them today. Do not have server.js or app.js emit/expect them
 * until a real column backs them; that would be exactly the kind of
 * fabricated status this repo does not do.
 *
 * @readonly
 * @enum {string}
 */
const MachineState = Object.freeze({
  /** No real backend source yet (see comment above). */
  OFF: 'OFF',
  /** Real: derived from an active Critical/Major alarm (STATE_SQL's st=3, today's "ALARM"). */
  DOWN: 'DOWN',
  /** Real: v_ldi_machine_latest_full.state = false (STATE_SQL's st=1, today's "IDLE"). */
  IDLE: 'IDLE',
  /** Real: v_ldi_machine_latest_full.state = true, no active alarm (STATE_SQL's st=2, today's "OK"). */
  RUN: 'RUN',
  /** No real backend source yet (see comment above). */
  PM_STOP: 'PM_STOP',
  /** Real: no telemetry row, or stale (STATE_SQL's st=0, today's "NO_DATA"). */
  UNKNOWN: 'UNKNOWN',
});

// Centralized theme -- the one place a color for a given MachineState is
// defined. server.js/app.js's current STATE_COLORS/STATE_LABELS (0-3
// numeric codes) predate this contract and should be migrated to import
// from here rather than kept as a second, separately-hardcoded copy --
// deferred to the rendering-integration step so this contract can be
// reviewed on its own first, not bundled sight-unseen with a behavior
// change.
//
// Labels per user spec: OFF, Down, Idle, (Initial, PM, Stop), Run,
// Undefine -- a generic status-board vocabulary (Off/Down/Idle/Run/PM-
// Stop/Undefined-style labels are industry-standard on SCADA/HMI status
// boards generally), not a real facility's proprietary data.
const MACHINE_STATE_THEME = Object.freeze({
  [MachineState.OFF]: { color: 0x64748b, label: 'OFF' },
  [MachineState.DOWN]: { color: 0xef4444, label: 'Down' },
  [MachineState.IDLE]: { color: 0xf59e0b, label: 'Idle' },
  [MachineState.RUN]: { color: 0x22c55e, label: 'Run' },
  [MachineState.PM_STOP]: { color: 0x3b82f6, label: '(Initial, PM, Stop)' },
  [MachineState.UNKNOWN]: { color: 0x64748b, label: 'Undefine' },
});

/**
 * One machine's placement on a floor. `position`/`footprint` are always
 * synthetic (see file header) until a real survey/CAD import sets
 * `source` to something other than 'simulated_grid'. `machineKey` is the
 * real device_id (public.devices.device_id) -- never a fabricated
 * placeholder like "Machine-01".
 *
 * @typedef {Object} FactoryMachinePlacement
 * @property {string} machineKey - Real device_id (e.g. "LDI-01"). Never fabricated.
 * @property {number} floor - 0-indexed floor number. Currently always 0 (Floor 1, default grouping -- see server.js FLOOR_0).
 * @property {{x: number, y: number, z: number}} position - Scene-unit coordinates. Synthetic unless source !== 'simulated_grid'.
 * @property {{x: number, y: number, z: number}} rotation - Radians per axis. Always {0,0,0} until real orientation data exists.
 * @property {{width: number, depth: number, height: number}} footprint - Scene-unit bounding box. Synthetic placeholder shape, not a real machine's dimensions.
 * @property {{row: string, column: string}|null} gridRef - Structural placeholder for a real column-grid reference (e.g. a real facility's "row B, column 3"). Today's value is a synthetic row letter per zone + a 1-based machine index within it -- NOT derived from any real drawing's actual grid lettering/spacing. Ready to hold a real reference with no schema change.
 * @property {MachineState} status - Current run-state. Real (see MachineState comments for which values have a real source today).
 * @property {'simulated_grid'|'manual_survey'|'cad_import'} source - Provenance of position/footprint. 'simulated_grid' is the only value this repo ever produces; the other two are the documented migration path for real coordinates supplied out-of-repo.
 */

/**
 * Distinguishes what a rendered box actually represents -- required so
 * the UI never conflates "a physical slot exists" with "we know what's
 * there" with "it's a real IMS-connected device". Only two of these are
 * ever populated today (UNMAPPED and IMS_CONNECTED); VERIFIED_PHYSICAL
 * exists in the vocabulary for when a real survey confirms a specific
 * machine occupies a specific slot WITHOUT that machine being IMS-
 * connected yet (e.g. manually surveyed, not yet wired for telemetry) --
 * a real, distinct state this repo does not fabricate an example of.
 *
 * @readonly
 * @enum {string}
 */
const AssetMappingStatus = Object.freeze({
  /** slot_id has no authoritative device/asset mapping. Default for every slot. */
  UNMAPPED: 'UNMAPPED',
  /** A real, specific asset is confirmed to occupy this slot (e.g. manual survey), but it has no IMS device_id / live telemetry. Not fabricated -- no instance of this exists in this repo's own data today. */
  VERIFIED_PHYSICAL: 'VERIFIED_PHYSICAL',
  /** Slot is mapped to a real IMS device_id with live telemetry (MachineState applies). */
  IMS_CONNECTED: 'IMS_CONNECTED',
});

/**
 * One physical machine position on a floor -- geometry only, deliberately
 * carrying no identity. slot_id is an anonymous placeholder (e.g.
 * "F1-SLOT-001"), never a real vendor/asset tag. Whether this slot has
 * any asset/device mapped to it lives entirely in a separate mapping
 * table (private/floor1-asset-mapping.json: slot_id -> device_id | null),
 * never in this object -- keeps "where physical slots are" and "what's
 * confirmed to occupy them" independently editable, so a verified mapping
 * can be added without changing the geometry.
 *
 * position/footprint may be either arbitrary placeholder values (this
 * repo's default) or real engineering-drawing-transcribed values in a
 * private deployment's own copy of the geometry file -- `source` and
 * `confidence` on each object disclose which. See
 * services/factory-twin-3d/private/floor1-geometry.json's own header
 * comment (this machine's local copy, never committed) for the full
 * disclosure of what was transcribed vs. left arbitrary.
 *
 * @typedef {Object} PhysicalSlot
 * @property {string} slot_id - Anonymous slot identifier. Never a real vendor/asset tag.
 * @property {string} zone_id - Anonymous zone identifier (e.g. "F1-ZONE-001"). Never a real facility zone name.
 * @property {{x: number, y: number, z: number}} position - Scene-unit (meters) coordinates.
 * @property {{width: number, depth: number, height: number}} footprint - Scene-unit bounding box.
 * @property {'engineering_drawing_transcription'|'arbitrary_placeholder'} [source] - Provenance of this object's geometry.
 * @property {'high'|'medium'|'low'|'unknown'} [confidence] - How directly this value was read/derived vs. approximated. 'unknown' means the real count/position could not be reliably determined at transcription resolution (a small disclosed placeholder is used for rendering, never a guessed real figure). Present on transcribed geometry only.
 * @property {AssetMappingStatus} status - UNMAPPED or IMS_CONNECTED, resolved server-side from the separate mapping table.
 * @property {string|null} ims_device_id - Real device_id if mapped, else null. Never inferred from position/numbering/proximity.
 */

module.exports = { MachineState, MACHINE_STATE_THEME, AssetMappingStatus };
