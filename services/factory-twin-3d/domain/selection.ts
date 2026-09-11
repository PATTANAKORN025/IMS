/**
 * NEW boundary, not a mechanical port of existing code: app.js today has no
 * explicit "selection" variable at all. pickEquipment()/pickColumn()
 * (app.js:2162, app.js:2606) return an item directly into
 * showEquipmentInspector()/showColumnInspector(), so "selection" is really
 * "whatever the inspector currently shows" -- a DOM fact, not a tracked
 * state object. SelectionState is Step 1's proposed explicit contract for
 * that implicit state.
 *
 * Wiring app.js's pick handlers to actually construct/hold a SelectionState
 * is deferred to a future migration step, per the HARD RULE that this
 * step's existing runtime stays behaviorally unchanged -- this file is a
 * type-level proposal, checked by tests against the CURRENT two selectable
 * kinds (equipment, column), not a runtime change to app.js.
 */

import type { Asset } from './asset';
import type { Column } from './geometry';

export type SelectionState =
  | { readonly kind: 'none' }
  | { readonly kind: 'equipment'; readonly asset: Asset }
  | { readonly kind: 'column'; readonly column: Column };

export function isSelectionEmpty(
  selection: SelectionState,
): selection is { kind: 'none' } {
  return selection.kind === 'none';
}
