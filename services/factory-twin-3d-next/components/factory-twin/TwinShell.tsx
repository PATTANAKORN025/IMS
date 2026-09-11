import type { MachineStateCode } from '@twin-domain/machine-state';
import { MACHINE_STATE_ORDER } from '@twin-domain/machine-state';
import TwinHeader from './TwinHeader';
import TwinToolbar from './TwinToolbar';
import LayerControls from './LayerControls';
import ViewportFrame from './ViewportFrame';
import Inspector from './Inspector';
import StatusBadge from './StatusBadge';

/**
 * Server Component (no 'use client') -- the static shell. Composes two
 * Client Components (TwinToolbar, LayerControls, Inspector -- each owns
 * its own local interactive state) and three pure Server Components
 * (TwinHeader, the Legend below, ViewportFrame). This file itself never
 * calls useState/useEffect and attaches no event handler, so it stays
 * server-renderable.
 */
export default function TwinShell() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TwinHeader />
      <TwinToolbar />
      <LayerControls />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <ViewportFrame />
          <Legend />
        </div>
        <Inspector />
      </div>
    </div>
  );
}

/**
 * Genuinely server-rendered: MACHINE_STATE_ORDER/StatusBadge are read and
 * rendered here with no client JS at all, proving the domain theme is
 * consumable from a real Server Component, not only from the interactive
 * Inspector. Placeholder legend, not a live status readout.
 */
function Legend() {
  const example: readonly MachineStateCode[] = ['RUN', 'DOWN', 'IDLE', 'UNDEFINED'];
  return (
    <div
      aria-label="Status legend (placeholder)"
      className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-surface px-3 py-2"
    >
      {example.map((state) => (
        <StatusBadge key={state} state={state} />
      ))}
      <span className="self-center text-xs text-text-secondary">
        ({MACHINE_STATE_ORDER.length} states total in vocabulary — only the 4 backed ones shown)
      </span>
    </div>
  );
}
