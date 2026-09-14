'use client';

import { useState } from 'react';

/**
 * Client Component -- owns layer-visibility toggle state (useState).
 * Mirrors app.js's setLayerVisible() checkbox pattern (app.js:813) in
 * structure only; these checkboxes are not wired to any real scene yet
 * (see ViewportFrame.tsx) since the renderer has not been migrated.
 */
const LAYERS = [
  { id: 'equipment', label: 'Equipment' },
  { id: 'reference', label: 'Reference CAD' },
  { id: 'zones', label: 'Functional zones' },
] as const;

type LayerId = (typeof LAYERS)[number]['id'];

export default function LayerControls() {
  const [visible, setVisible] = useState<Record<LayerId, boolean>>({
    equipment: true,
    reference: false,
    zones: false,
  });

  return (
    <fieldset className="flex items-center gap-3 border-b border-border bg-surface px-3 py-1.5">
      <legend className="sr-only">Layers</legend>
      {LAYERS.map(({ id, label }) => (
        <label key={id} className="flex items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={visible[id]}
            onChange={() => setVisible((prev) => ({ ...prev, [id]: !prev[id] }))}
            className="h-3.5 w-3.5 accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
