'use client';

import { useState } from 'react';
import type { SelectionState } from '@twin-domain/selection';
import { isSelectionEmpty } from '@twin-domain/selection';
import type { Asset } from '@twin-domain/asset';
import DataQualityBadge from './DataQualityBadge';

/**
 * Client Component -- owns selection state (useState) and the
 * select/clear buttons that change it. There is no real scene to click
 * yet (ViewportFrame.tsx is a placeholder), so this demonstrates the
 * SelectionState contract with an explicitly-labeled example Asset rather
 * than a real pick -- NOT fake telemetry: this placeholder Asset is
 * UNMAPPED (no ims_device_id), so per operational-status.js's
 * statusForAsset() rule (an unmapped asset carries no machine state,
 * ever), it correctly shows NO run-state badge. That absence is the
 * point: the shell honors the real semantic rule even for a placeholder.
 */
const PLACEHOLDER_ASSET: Asset = {
  id: 'PLACEHOLDER-ASSET-001',
  position: { x: 0, y: 0, z: 0 },
  rotation_deg: 0,
  footprint: { width: 1, depth: 1 },
  footprint_status: 'UNRESOLVED',
  footprint_source: null,
  footprint_shape: null,
  footprint_polygon: null,
  display_shape: 'UNRESOLVED',
  display_representation: null,
  display_source: null,
  operational_footprint: null,
  operational_axis_offset_deg: null,
  orientation_geometry_mismatch: false,
  operational_excludes_enclosure: false,
  display_area_error: null,
  overlaps_neighbour: false,
  mirrored: false,
  geometry_status: null,
  confidence: null,
  source: 'ui-shell-placeholder',
  height_status: null,
  zone_id: null,
  zone_status: null,
  ims_device_id: null,
  mapping_status: 'UNMAPPED_TO_IMS',
  status: 'UNMAPPED',
  identity_status: 'unresolved',
  evidence_source: null,
  evidence_source_record: null,
  evidence_verified_at: null,
  evidence_confidence: 'unknown',
  live_status_eligible: false,
  alarm_eligible: false,
  drill_down_eligible: false,
  duplicate_of: null,
  evidence_tier: 'PRIMARY',
};

export default function Inspector() {
  const [selection, setSelection] = useState<SelectionState>({ kind: 'none' });

  return (
    <aside
      aria-label="Inspector"
      className="flex w-72 shrink-0 flex-col gap-2 border-l border-border bg-surface p-3"
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSelection({ kind: 'equipment', asset: PLACEHOLDER_ASSET })}
          className="rounded-sm border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          Select example asset (placeholder)
        </button>
        <button
          type="button"
          onClick={() => setSelection({ kind: 'none' })}
          className="rounded-sm border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          Clear
        </button>
      </div>

      {isSelectionEmpty(selection) ? (
        <p className="text-xs text-text-secondary">No selection.</p>
      ) : selection.kind === 'equipment' ? (
        <div className="flex flex-col gap-1.5 text-xs text-text-secondary">
          <p className="text-text-primary">{selection.asset.id}</p>
          <DataQualityBadge status={selection.asset.status} />
          <p className="text-text-secondary">
            No run-state shown: this placeholder is UNMAPPED, and an unmapped asset
            carries no machine state (matches production semantics).
          </p>
        </div>
      ) : (
        <p className="text-xs text-text-secondary">Column inspector not built this step.</p>
      )}
    </aside>
  );
}
