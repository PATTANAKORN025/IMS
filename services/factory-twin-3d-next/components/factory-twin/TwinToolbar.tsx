'use client';

import { useState } from 'react';
import type { ViewName } from '@twin-domain/camera';
import { VIEW_NAMES, DEFAULT_VIEW } from '@twin-domain/camera';

/**
 * Client Component -- the only reason: it owns interactive view-switch
 * state (useState) and attaches onClick handlers, both client-only. Local
 * state only, no store: this is a self-contained toolbar with nothing else
 * in this shell to synchronize with yet (the viewport is a placeholder,
 * see ViewportFrame.tsx). Mirrors app.js's VIEWS()/applyView()/aria-pressed
 * pattern (app.js:765-781), not a new interaction model.
 */
export default function TwinToolbar() {
  const [activeView, setActiveView] = useState<ViewName>(DEFAULT_VIEW);

  return (
    <div
      role="group"
      aria-label="View"
      className="flex items-center gap-1 border-b border-border bg-surface px-3 py-1.5"
    >
      {VIEW_NAMES.map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={activeView === view}
          onClick={() => setActiveView(view)}
          className="rounded-sm border border-border px-2 py-1 text-xs capitalize text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus aria-pressed:border-accent aria-pressed:text-text-primary"
        >
          {view}
        </button>
      ))}
    </div>
  );
}
