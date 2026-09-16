import type { MachineStateCode } from '@twin-domain/machine-state';
import { MACHINE_STATE_THEME } from '@twin-domain/machine-state';

/**
 * Pure presentational Server Component -- no interactivity, so no
 * 'use client'. Renders the Step 1 domain's MachineStateCode exactly as
 * the legacy operational-status.js vocabulary defines it: glyph + label +
 * color together, never color alone (WCAG 1.4.1, and this codebase's own
 * standing rule -- see machine-state.ts's header). The color below is a
 * runtime value read from the typed domain theme, not a literal hardcoded
 * in this file -- there is exactly one place a MachineStateCode's color is
 * defined (machine-state.ts), and this component only reads it.
 */
export default function StatusBadge({ state }: { state: MachineStateCode }) {
  const theme = MACHINE_STATE_THEME[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2 py-0.5 text-xs text-text-primary"
      title={theme.meaning}
    >
      <span aria-hidden="true" style={{ color: theme.color }}>
        {theme.glyph}
      </span>
      <span>{theme.label}</span>
      {!theme.backed ? (
        <span className="text-text-secondary">(no live source)</span>
      ) : null}
    </span>
  );
}
