'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ViewName, CameraState } from '@twin-domain/camera';
import { VIEW_NAMES, DEFAULT_VIEW } from '@twin-domain/camera';
import type { Asset } from '@twin-domain/asset';
import type { SelectionState } from '@twin-domain/selection';
import type { LayerId, LayerState } from '@twin-domain/layer';
import { LAYER_IDS, DEFAULT_LAYER_STATE } from '@twin-domain/layer';
import type { ReferenceOverlay } from '@twin-domain/reference';
import { MACHINE_STATE_THEME, MACHINE_STATE_ORDER, type MachineStateCode } from '@twin-domain/machine-state';
import type { OperationalStateResolution } from '@twin-domain/data-quality';
import type { FactoryGeometryData } from '@/lib/geometry-adapter';
import { resolveOperationalState } from '@/lib/operational-state-adapter';
import { useWebglLifecycle } from '@/hooks/useWebglLifecycle';
import GeometryScene, { type SceneStats } from './GeometryScene';
import SelectedMachinePanel from '../machines/SelectedMachinePanel';

const LAYER_LABEL: Record<LayerId, string> = {
  geometry: 'Factory geometry',
  machines: 'Machines',
  grid: 'Structural grid',
  reference: 'Reference CAD',
};

/**
 * Hoisted to module scope on general React/R3F good practice: an inline
 * `camera={{...}}` / `dpr={[1, 2]}` object/array literal is otherwise a
 * NEW reference on every GeometryViewport render. Tried specifically as a
 * fix for a render-count coupling Step 5C's own testing found (see
 * FACTORY_TWIN_R3F_SELECTION_MIGRATION.md's "Known limitations": clicking
 * a DOM toolbar button immediately before the FIRST-ever canvas click
 * causes that click to register 2 React renders instead of 1, confirmed
 * NOT present when the canvas click is the first interaction on the page
 * at all). Measured after this change: the coupling persists unchanged --
 * this hoist did not fix it. Kept anyway because passing stable
 * references to <Canvas> is correct regardless; the actual cause is
 * disclosed as unresolved, not claimed fixed here.
 */
const CANVAS_CAMERA = { fov: 45, near: 0.1, far: 400 } as const;
const CANVAS_DPR: [number, number] = [1, 2];

/**
 * Step 5F single WebGL lifecycle owner (Section 2 of this step's mission).
 * This is the ONLY component in the geometry-candidate tree that touches a
 * WebGL context event (`webglcontextlost`/`webglcontextrestored`) or calls
 * `forceContextLoss()`/`forceContextRestore()` -- Geometry, Machines,
 * StructuralGrid, Reference, and the camera controller (all composed one
 * level down, in `GeometryScene.tsx`) have no lifecycle code of their own,
 * grep-verified against this step's own source. Same underlying mechanism
 * as Step 4's corrected TwinViewport.tsx (invalidate()-only rebuild, NOT a
 * force-remount, which Step 4 measured as a real leak for InstancedMesh
 * content) -- Step 9 factored this mechanism into `hooks/
 * useWebglLifecycle.ts`, shared by both isolated candidate routes
 * (`/r3f-spike` and `/geometry-candidate`) instead of the verbatim
 * duplication the migration doc previously disclosed as a "Known
 * limitation."
 *
 * REBUILDING contract (Section 5): on `webglcontextrestored`, exactly one
 * `invalidate()` call repaints the EXISTING R3F tree. Nothing is
 * unmounted or remounted -- no component in `GeometryScene.tsx` receives
 * a new `key`, so every `useMemo`-built geometry/material stays the same
 * JS object it always was (no disposal, no recreation) and every ref
 * (`OrbitControls`, the `InstancedMesh` picking refs) stays attached to
 * the same underlying object. `controllerMountCountRef` and the
 * `contextLost`/`contextRestored` counters below exist specifically to
 * make that contract checkable rather than assumed: a real duplicate
 * listener or an accidental remount would show up as those counters
 * incrementing by more than 1 per user-triggered event, or the mount
 * counter exceeding 1 across any number of recovery cycles.
 */
export default function GeometryViewport({
  geometry,
  machines,
  reference,
}: {
  geometry: FactoryGeometryData;
  machines: readonly Asset[];
  reference: ReferenceOverlay;
}) {
  /**
   * Step 9: state machine, context-loss/restore handling, and the
   * hydration-safe render-count display (previously its own inline
   * `renderCountRef`/`hydrated` pair here -- the ref-mutated-during-render
   * hydration bug fixed in commit 727c98cd) now live in
   * `hooks/useWebglLifecycle.ts`, shared with `TwinViewport.tsx`.
   * `contextLostCount`/`contextRestoredCount` (Step 5F's own scene-
   * rebuild-contract evidence, referenced in the doc comment above) stay
   * this component's own bookkeeping on top of the shared hook, wired via
   * `onContextLost`/`onContextRestored` so their semantics -- incremented
   * exactly once per real event, never per render -- are unchanged by the
   * extraction.
   */
  const [contextLostCount, setContextLostCount] = useState(0);
  const [contextRestoredCount, setContextRestoredCount] = useState(0);
  const { lifecycle, verifyResult, renderCount, rendererRef, invalidateRef, handleCreated } = useWebglLifecycle({
    onContextLost: () => setContextLostCount((n) => n + 1),
    onContextRestored: () => setContextRestoredCount((n) => n + 1),
  });

  // LayerState (Step 5E): presentation-only, deliberately separate from
  // CameraState/SelectionState (Section "Layer model"). A toggle here flips
  // exactly one boolean and re-renders GeometryViewport -- it never touches
  // a Three.js object directly (no button anywhere calls `.visible = x` on
  // a ref); the resulting `<group visible={...}>` wrapping below is the
  // ONLY place LayerState reaches the renderer, one level of indirection,
  // same shape as CameraState's own single crossing point in
  // GeometryCameraController.tsx.
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYER_STATE);
  const toggleLayer = useCallback((id: LayerId) => {
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  /**
   * Step 6A: operational-state presentation, default OFF (Section 1/2 --
   * "must NOT connect live telemetry yet"; the real adapter is honest
   * UNAVAILABLE, and only an explicit viewer toggle substitutes a
   * deterministic simulation, mirroring `operational-state-adapters.js`'s
   * own default-off demo-mode convention). `resolutions` is recomputed only
   * when `machines` or the toggle itself changes -- a bounded, discrete
   * recompute over 431 plain-object resolutions, never a per-machine React
   * component and never re-derived per frame; this is the direct proof
   * this step's own mission asks for ("real operational semantics can
   * drive the new renderer without coupling React rendering to 431
   * machines").
   */
  const [demoModeOn, setDemoModeOn] = useState(false);
  const operationalStateByAssetId = useMemo(() => {
    const map = new Map<string, OperationalStateResolution>();
    for (const asset of machines) map.set(asset.id, resolveOperationalState(asset, demoModeOn));
    return map;
  }, [machines, demoModeOn]);
  /**
   * Real, DOM-readable proof of the resolution pipeline's own output,
   * matching this codebase's established verification convention (a
   * regex-parsed toolbar readout, e.g. `controllerMounts:`/`contextLost:`
   * in Step 5F) rather than a WebGL pixel readback -- Section 1's own
   * "NO_DATA != DOWN, UNAVAILABLE != DOWN" rule is checkable here
   * directly: `simulated` only ever comes from a real `isMachine()` asset,
   * `noData`/`unavailable` never collapse into it. This deployment has 0
   * confirmed IMS mappings today (verified via `/api/floor-geometry`), so
   * `simulated` is honestly 0 and every asset reads `noData` (demo on) or
   * `unavailable` (demo off) -- not a bug, the same honesty
   * `operational-state-adapters.js` itself already documents.
   */
  const operationalSummary = useMemo(() => {
    let simulated = 0;
    let noData = 0;
    let unavailable = 0;
    for (const res of operationalStateByAssetId.values()) {
      if (res.quality === 'SIMULATION') simulated += 1;
      else if (res.quality === 'NO_DATA') noData += 1;
      else if (res.quality === 'UNAVAILABLE') unavailable += 1;
    }
    return { simulated, noData, unavailable };
  }, [operationalStateByAssetId]);

  const [view, setView] = useState<ViewName>(DEFAULT_VIEW);
  // CameraState (Step 5D): synced ONLY at a meaningful checkpoint --
  // OrbitControls' own 'end' event, or after an explicit reset/fit/view
  // change -- never per frame, never per pointermove. GeometryCameraController
  // is the sole place the renderer's live camera/controls objects are read
  // into this domain-typed, renderer-independent snapshot.
  const [cameraState, setCameraState] = useState<CameraState | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [fitToken, setFitToken] = useState(0);
  const readStatsRef = useRef<(() => SceneStats) | null>(null);
  const [stats, setStats] = useState<SceneStats | null>(null);

  // Scene-rebuild-contract evidence (Section 5): incremented exactly once
  // per real event, never per render. `controllerMounts` staying at 1
  // across any number of recovery cycles is direct proof the camera
  // controller (and its OrbitControls instance) is never duplicated or
  // remounted by context loss/restore -- not an assumption. `contextLost`/
  // `contextRestored` (declared above, alongside the shared lifecycle
  // hook) staying in lockstep with the number of times the user actually
  // triggered loss/restore is direct proof the listeners attached in
  // `handleCreated` are never double-attached.
  const [controllerMounts, setControllerMounts] = useState(0);
  const handleControllerMount = useCallback(() => setControllerMounts((n) => n + 1), []);

  // Selection (Step 5C): low-frequency state, updated only on a discrete
  // click/clear -- never per-frame, never per-pointermove. `selectedId` is
  // the primitive React tracks (cheap equality checks, cheap Map lookups
  // in Machines.tsx); `selection` below is the canonical Step 1
  // SelectionState derived from it for anything DOM-facing, per Section 1's
  // rule that machine.id (via a full Asset) is the domain identity, not a
  // raw instanceId or a bare string threaded through the UI layer.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const assetById = useMemo(() => new Map(machines.map((a) => [a.id, a])), [machines]);
  const selection: SelectionState = useMemo(() => {
    if (selectedId === null) return { kind: 'none' };
    const asset = assetById.get(selectedId);
    return asset ? { kind: 'equipment', asset } : { kind: 'none' };
  }, [selectedId, assetById]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden border border-border">
      {/*
        `flex-nowrap` + `overflow-x-auto` (NOT `flex-wrap`), deliberately.
        Real, measured bug this fixes: with `flex-wrap`, this row's height
        depends on its CONTENT -- once enough toolbar text was present to
        cross the wrap threshold (e.g. the "Read renderer stats" readout
        populating), the row grew an extra line and the <Canvas> element
        below it shifted down by that line's height (measured: 158px ->
        182px). Every Playwright test across Steps 5C-5F that clicks a
        FIXED page pixel coordinate to hit a known machine assumes the
        canvas's on-screen position is constant -- a wrap-driven shift
        silently broke that assumption. A single non-wrapping, horizontally
        scrollable row keeps the canvas's Y position invariant to toolbar
        content length, for this content and any future addition. `min-w-0`
        is required alongside `overflow-x-auto` on a flex child -- without
        it, a flex item's default `min-width: auto` lets it grow to its
        content's intrinsic width instead of respecting the row's own
        width. (`min-w-0` alone did NOT fully fix the narrow-viewport/200%-
        zoom page-level overflow finding -- that had a separate root cause,
        the `sr-only` legend inside the layers fieldset below; see the
        comment on that fieldset.)
      */}
      <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-border bg-surface px-3 py-1.5">
        {VIEW_NAMES.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className="rounded-sm border border-border px-2 py-1 text-xs capitalize text-text-secondary hover:text-text-primary aria-pressed:border-accent aria-pressed:text-text-primary"
          >
            {v}
          </button>
        ))}
        <span className="text-xs text-text-secondary">|</span>
        <button
          type="button"
          onClick={() => setResetToken((t) => t + 1)}
          className="rounded-sm border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
        >
          Reset Camera
        </button>
        <button
          type="button"
          onClick={() => setFitToken((t) => t + 1)}
          className="rounded-sm border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
        >
          Fit Factory
        </button>
        <span className="text-xs text-text-secondary">|</span>
        <button type="button" onClick={() => rendererRef.current?.forceContextLoss()} className="rounded-sm border border-border px-2 py-1 text-xs text-danger">
          Simulate context loss
        </button>
        <button type="button" onClick={() => rendererRef.current?.forceContextRestore()} className="rounded-sm border border-border px-2 py-1 text-xs text-success">
          Restore context
        </button>
        <span className="text-xs text-text-secondary">lifecycle: {lifecycle}</span>
        <span className="text-xs text-text-secondary">reactRenders: {renderCount}</span>
        <span className="text-xs text-text-secondary">
          controllerMounts: {controllerMounts} contextLost: {contextLostCount} contextRestored: {contextRestoredCount}
        </span>
        <span className="text-xs text-text-secondary">|</span>
        {/*
          `relative` on fieldset is load-bearing, not decorative: Tailwind's
          `sr-only` legend below is `position: absolute` with no inset
          properties, so its containing block is whichever ancestor is
          itself positioned -- with none positioned, that containing block
          jumps all the way to the viewport (initial containing block),
          which lets its layout box escape every intervening `overflow-
          hidden`/`overflow-x-auto` clip up the tree (they only clip
          descendants whose containing block passes through them) and
          silently inflate `document.documentElement.scrollWidth` by
          however far the (fully invisible, 1px, clip-rect'd) legend's
          static position lands -- this, not a missing `min-w-0`, was the
          real cause of the "no horizontal overflow @ 1024x768" /
          "200% zoom" failures. Giving the fieldset `position: relative`
          makes it the legend's containing block again, so the legend
          stays correctly clipped inside this toolbar's own scroll
          container like everything else.
        */}
        <fieldset className="relative flex items-center gap-2">
          <legend className="sr-only">Layers</legend>
          {LAYER_IDS.map((id) => (
            <label key={id} className="flex items-center gap-1 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={layers[id]}
                onChange={() => toggleLayer(id)}
                className="h-3.5 w-3.5 accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              />
              {LAYER_LABEL[id]}
            </label>
          ))}
        </fieldset>
        <span className="text-xs text-text-secondary">|</span>
        {/* relative for the same reason the layers fieldset above needs it
            -- see that fieldset's own comment. */}
        <fieldset className="relative flex items-center gap-2">
          <legend className="sr-only">Operational state (Step 6A, presentation only)</legend>
          <label className="flex items-center gap-1 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={demoModeOn}
              onChange={() => setDemoModeOn((v) => !v)}
              className="h-3.5 w-3.5 accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            />
            Simulate operational state
          </label>
        </fieldset>
        <span className="text-xs text-text-secondary">
          operational: simulated={operationalSummary.simulated} noData={operationalSummary.noData} unavailable={operationalSummary.unavailable}
        </span>
        {demoModeOn ? (
          <ul className="flex flex-wrap items-center gap-2" aria-label="Operational state legend">
            {MACHINE_STATE_ORDER.map((code: MachineStateCode) => (
              <li key={code} className="flex items-center gap-1 text-xs text-text-secondary">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: MACHINE_STATE_THEME[code].color }}
                />
                <span>{MACHINE_STATE_THEME[code].glyph} {MACHINE_STATE_THEME[code].label}</span>
              </li>
            ))}
            <li className="flex items-center gap-1 text-xs text-text-secondary">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#64748b' }} />
              <span>○ No data / unavailable</span>
            </li>
          </ul>
        ) : null}
        <button
          type="button"
          onClick={() => setStats(readStatsRef.current?.() ?? null)}
          className="ml-auto rounded-sm border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
        >
          Read renderer stats
        </button>
        {stats ? (
          <span className="text-xs text-text-secondary">
            calls={stats.calls} tris={stats.triangles} geometries={stats.geometries} textures={stats.textures} programs={stats.programs}
          </span>
        ) : null}
      </div>
      {verifyResult ? (
        <div className="border-b border-border bg-surface px-3 py-1 text-xs text-text-secondary">
          Recovery verification: {verifyResult}
        </div>
      ) : null}
      {cameraState ? (
        <div className="border-b border-border bg-surface px-3 py-1 text-xs text-text-secondary">
          cameraState: view={cameraState.view} pos=({cameraState.position.x.toFixed(1)},{' '}
          {cameraState.position.y.toFixed(1)}, {cameraState.position.z.toFixed(1)}) target=(
          {cameraState.target.x.toFixed(1)}, {cameraState.target.y.toFixed(1)}, {cameraState.target.z.toFixed(1)})
        </div>
      ) : null}
      <SelectedMachinePanel selection={selection} onClear={() => setSelectedId(null)} />
      <div className="relative flex-1">
        <Canvas
          frameloop="demand"
          onCreated={handleCreated}
          camera={CANVAS_CAMERA}
          dpr={CANVAS_DPR}
          onPointerMissed={() => setSelectedId(null)}
        >
          <GeometryScene
            geometry={geometry}
            machines={machines}
            reference={reference}
            layers={layers}
            selectedId={selectedId}
            onSelect={setSelectedId}
            view={view}
            resetToken={resetToken}
            fitToken={fitToken}
            onCameraStateChange={setCameraState}
            onControllerMount={handleControllerMount}
            readStatsRef={readStatsRef}
            showOperationalState={demoModeOn}
            operationalStateByAssetId={operationalStateByAssetId}
          />
        </Canvas>
      </div>
    </div>
  );
}
