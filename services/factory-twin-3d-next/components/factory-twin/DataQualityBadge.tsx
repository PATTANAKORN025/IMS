import type { MappingStatus } from '@twin-domain/data-quality';
import { MAPPING_STATUS_REACHABLE } from '@twin-domain/data-quality';

/**
 * Renders the Step 1 domain's MappingStatus -- a RECORD-QUALITY fact
 * ("is this CAD asset linked to a real IMS device"), never a machine
 * state (see data-quality.ts's file header on why these axes must not
 * collapse). Server Component, no interactivity.
 */
const LABEL: Record<MappingStatus, string> = {
  UNMAPPED: 'Unmapped',
  VERIFIED_PHYSICAL: 'Verified physical (no telemetry)',
  IMS_CONNECTED: 'IMS connected',
};

const GLYPH: Record<MappingStatus, string> = {
  UNMAPPED: '○', // hollow circle, matches operational-status.js's DATA_QUALITY.UNMAPPED glyph
  VERIFIED_PHYSICAL: '◐', // half-filled circle
  IMS_CONNECTED: '●', // filled circle
};

export default function DataQualityBadge({ status }: { status: MappingStatus }) {
  const reachable = MAPPING_STATUS_REACHABLE.includes(status);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2 py-0.5 text-xs text-text-secondary">
      <span aria-hidden="true">{GLYPH[status]}</span>
      <span>{LABEL[status]}</span>
      {!reachable ? (
        <span className="text-text-secondary">(not produced by this deployment today)</span>
      ) : null}
    </span>
  );
}
