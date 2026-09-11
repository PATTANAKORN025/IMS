'use client';

import type { SelectionState } from '@twin-domain/selection';
import { isSelectionEmpty } from '@twin-domain/selection';

/**
 * Semantic-DOM selection readout, OUTSIDE the canvas (Section 7). Routed
 * through the Step 1 domain's SelectionState (not a raw string) so the
 * canonical identity stays `machine.id` even at this boundary -- per
 * Section 1's own rule. Deliberately minimal: id + selected/unselected
 * state only, NO telemetry/alarm data, NOT a full Inspector (that is
 * explicitly a later step). Two independent signals, matching Section 13's
 * accessibility rule (never color-alone): the 3D highlight color AND this
 * plain-text id.
 */
export default function SelectedMachinePanel({
  selection,
  onClear,
}: {
  selection: SelectionState;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5 text-xs text-text-secondary">
      {isSelectionEmpty(selection) ? (
        <span>No machine selected. Click a machine, or Tab to Clear.</span>
      ) : selection.kind === 'equipment' ? (
        <>
          <span className="text-text-primary">Selected machine: {selection.asset.id}</span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-sm border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            Clear
          </button>
        </>
      ) : (
        <span>Selection kind not supported by this candidate yet.</span>
      )}
    </div>
  );
}
