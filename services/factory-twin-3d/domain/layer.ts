/**
 * NEW boundary, Step 5E. app.js's own layer model (app.js:485-534) is real
 * (`layers.structural/functional/operational/reference`, plus nested
 * sublayers) -- this type does not invent a business layer that model
 * doesn't have. It narrows to exactly what the migrated R3F scene composes
 * as of this step: the measured factory shell + openings (`geometry`,
 * legacy's `structural` minus its grid sublayer), the surveyed structural
 * grid as its own toggle (legacy nests it under `structural.shell`, split
 * out here because this migration already renders it as an independent
 * component), equipment (`machines`, legacy's `operational`), and the raw
 * CAD line-work overlay (`reference`, legacy's `reference`, off by default
 * -- same convention, app.js:499). Legacy's `functional` (zone) layer and
 * its other sublayers are not part of this step's rendered scene and are
 * therefore not represented here -- adding a toggle with nothing behind it
 * would promise a capability that does not exist (the same reasoning
 * app.js:500-503 itself gives for deleting its own empty TELEMETRY layer).
 *
 * LayerState is presentation-only, deliberately separate from CameraState,
 * SelectionState, and any future OperationalState: which layers are
 * visible has no bearing on where the camera points or what is selected,
 * and vice versa.
 */

export type LayerId = 'geometry' | 'machines' | 'grid' | 'reference';

export const LAYER_IDS: readonly LayerId[] = ['geometry', 'machines', 'grid', 'reference'];

export interface LayerState {
  readonly geometry: boolean;
  readonly machines: boolean;
  readonly grid: boolean;
  readonly reference: boolean;
}

/** Mirrors app.js's own defaults: everything on except the diagnostic
 *  reference overlay (`layers.reference.visible = false`, app.js:499). */
export const DEFAULT_LAYER_STATE: LayerState = {
  geometry: true,
  machines: true,
  grid: true,
  reference: false,
};
