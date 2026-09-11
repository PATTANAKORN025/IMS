'use client';

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import type { WebGLRenderer } from 'three';
import type { ViewName } from '@twin-domain/camera';
import { VIEW_NAMES, DEFAULT_VIEW } from '@twin-domain/camera';
import TwinScene, { type SpikeInstance } from './TwinScene';
import CameraController from './CameraController';

/**
 * THE R3F SPIKE ROOT. Everything below <Canvas> is real, running R3F/
 * Three.js -- not a placeholder like Step 3's ViewportFrame.tsx. Still
 * isolated: this only renders at /factory-twin-3d/r3f-spike in the
 * disposable services/factory-twin-3d-next/ app, never at the production
 * /factory-twin-3d/ route (app/page.tsx, untouched by this step).
 *
 * frameloop="demand": R3F's default is a continuous requestAnimationFrame
 * loop, which would NOT match app.js's own demand-rendered discipline
 * (PR #23's audit: 0 idle frames over a 3s window). "demand" mode instead
 * renders once, then only again when something calls invalidate() (drei's
 * OrbitControls does this itself on drag/zoom) -- proven, not assumed, by
 * StatsProbe below.
 */

type LifecycleState = 'READY' | 'LOST' | 'RESTORING' | 'REBUILDING' | 'VERIFYING' | 'RECOVERED';

export default function TwinViewport() {
  // Section 5 proof: increments once per TwinViewport React render. WebGL
  // frames (StatsProbe's idleFrameCount) happen entirely inside R3F's own
  // render loop via refs/useFrame, never touching this component's state --
  // so this counter should stay near the number of discrete UI
  // interactions (button clicks), not anywhere near the WebGL frame count.
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const [view, setView] = useState<ViewName>(DEFAULT_VIEW);
  const [selected, setSelected] = useState<SpikeInstance | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleState>('READY');
  const [stats, setStats] = useState<{ calls: number; triangles: number; idleFrames: number } | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const readStatsRef = useRef<(() => { calls: number; triangles: number; idleFrames: number }) | null>(null);
  const baselineRef = useRef<{ geometries: number; textures: number } | null>(null);

  /**
   * Spike-level lifecycle, mirroring app.js's own state machine
   * (handleContextLost/attemptContextRecovery/verifyRecovery, app.js:256-364)
   * in SHAPE, not claimed equivalent to it. Two real findings drove this
   * implementation, both disclosed in FACTORY_TWIN_R3F_SPIKE.md:
   *
   * 1. Simulating loss/restore via the raw `WEBGL_lose_context` extension
   *    fetched fresh on each button click never fired `webglcontextrestored`
   *    -- confirmed a genuine methodology bug (a freshly re-fetched
   *    extension reference after loss is not the same functional object as
   *    one obtained before), not an R3F/browser limitation: `renderer.
   *    forceContextLoss()`/`forceContextRestore()` (the exact API app.js's
   *    own `simulateContextLoss`/`simulateContextRestore` QA hooks use,
   *    app.js:3746-3747) uses three.js's cached extension reference
   *    internally and DOES fire the restore event reliably.
   * 2. An earlier version of REBUILDING force-remounted TwinScene via a
   *    `key` bump, reasoning (by analogy with app.js's own manual rebuild
   *    step) that InstancedMesh data needed re-creating. Measured instead:
   *    doing so made `renderer.info.memory.geometries` grow 1->2 on every
   *    cycle -- a real leak, because unmounting the OLD TwinScene while the
   *    context is mid-restore does not reliably dispose its GPU geometry
   *    before the NEW instance's is counted. The correct fix, confirmed by
   *    measurement: do NOT remount. The InstancedMesh's `instanceMatrix`
   *    buffer attribute lives in a plain JS Float32Array the context loss
   *    never touches; three.js re-uploads it to the GPU on the next render
   *    on its own. REBUILDING below only needs to force that next render to
   *    happen at all (frameloop="demand" won't render on its own after a
   *    state change that doesn't touch three.js props) via `invalidate()`.
   */
  const handleContextLost = useCallback(() => {
    // Re-captured at the MOMENT OF LOSS, not only once at mount: a
    // legitimate scene change made for an unrelated reason before this
    // particular loss (e.g. SelectionHighlight adding its own wireframe
    // box on selection, TwinScene.tsx) is not "growth caused by recovery"
    // -- comparing against a stale mount-time baseline flagged exactly
    // that as a false leak during testing. Comparing pre-loss -> post-
    // restore is the correct, real question: did RECOVERY itself grow
    // anything, independent of whatever the scene legitimately contained
    // right before the loss.
    const gl = rendererRef.current;
    if (gl) {
      baselineRef.current = { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures };
    }
    setLifecycle('LOST');
  }, []);

  const handleContextRestored = useCallback(() => {
    setLifecycle('RESTORING');
    setLifecycle('REBUILDING');
    invalidateRef.current?.();
    // VERIFYING: give the forced render one frame to land, then compare
    // renderer.info against the pre-loss baseline.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const gl = rendererRef.current;
        const baseline = baselineRef.current;
        setLifecycle('VERIFYING');
        if (gl && baseline) {
          const now = { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures };
          const grew = now.geometries > baseline.geometries || now.textures > baseline.textures;
          setVerifyResult(
            grew
              ? `FAIL: geometries ${baseline.geometries}->${now.geometries}, textures ${baseline.textures}->${now.textures} (growth)`
              : `PASS: geometries ${baseline.geometries}->${now.geometries}, textures ${baseline.textures}->${now.textures} (no growth)`,
          );
        }
        setLifecycle('RECOVERED');
      });
    });
  }, []);

  const handleCreated = useCallback(
    ({ gl, invalidate }: RootState) => {
      rendererRef.current = gl;
      invalidateRef.current = invalidate;
      gl.domElement.addEventListener('webglcontextlost', handleContextLost);
      gl.domElement.addEventListener('webglcontextrestored', handleContextRestored);
      setLifecycle('READY');
      // Baseline must be captured AFTER the scene's own geometry/texture
      // upload, not at onCreated time (which fires before TwinScene's JSX
      // children have created their GPU resources) -- captured too early,
      // every real 0->N first-upload would misread as "growth" on
      // recovery. Two rAFs is the same settle margin VERIFYING below uses.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          baselineRef.current = { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures };
        });
      });
    },
    [handleContextLost, handleContextRestored],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
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
          onClick={() => rendererRef.current?.forceContextLoss()}
          className="rounded-sm border border-border px-2 py-1 text-xs text-danger"
        >
          Simulate context loss
        </button>
        <button
          type="button"
          onClick={() => rendererRef.current?.forceContextRestore()}
          className="rounded-sm border border-border px-2 py-1 text-xs text-success"
        >
          Restore context
        </button>
        <span className="text-xs text-text-secondary">lifecycle: {lifecycle}</span>
        <span className="text-xs text-text-secondary">reactRenders: {renderCountRef.current}</span>
        <button
          type="button"
          onClick={() => setStats(readStatsRef.current?.() ?? null)}
          className="ml-auto rounded-sm border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
        >
          Read renderer stats
        </button>
        {stats ? (
          <span className="text-xs text-text-secondary">
            calls={stats.calls} tris={stats.triangles} idleFrames(3s)={stats.idleFrames}
          </span>
        ) : null}
      </div>
      {verifyResult ? (
        <div className="border-b border-border bg-surface px-3 py-1 text-xs text-text-secondary">
          Recovery verification: {verifyResult}
        </div>
      ) : null}
      <div className="relative flex-1">
        <Canvas
          frameloop="demand"
          onCreated={handleCreated}
          camera={{ fov: 45, near: 0.1, far: 200 }}
          // Clamped, not "dpr=2 for everyone": R3F's own [min,max] range
          // form. At this spike's scale (64 boxes) no draw-call/triangle
          // difference is expected across the range -- only pixel count
          // does, measured in FACTORY_TWIN_R3F_SPIKE.md rather than assumed.
          dpr={[1, 2]}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 15, 5]} intensity={0.8} />
          <TwinScene selectedIndex={selected?.index ?? null} onSelect={setSelected} />
          <CameraController view={view} />
          <StatsProbe readStatsRef={readStatsRef} />
        </Canvas>
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-sm border border-border bg-surface/90 px-2 py-1 text-xs text-text-secondary">
          {selected ? `Selected: ${selected.id}` : 'No selection (click a box)'}
        </div>
      </div>
    </div>
  );
}

/**
 * Reads renderer.info + counts idle-frame renders over a fixed 3s window,
 * WITHOUT writing to React state every frame (that would itself defeat
 * demand-rendering by forcing a re-render loop). useFrame's own callback
 * runs only when R3F actually renders a frame (frameloop="demand"'s
 * contract) -- every increment here already IS the measurement.
 */
function StatsProbe({
  readStatsRef,
}: {
  readStatsRef: MutableRefObject<(() => { calls: number; triangles: number; idleFrames: number }) | null>;
}) {
  const { gl } = useThree();
  const idleFrameCount = useRef(0);
  const windowStart = useRef(performance.now());

  useFrame(() => {
    const elapsed = performance.now() - windowStart.current;
    if (elapsed < 3000) idleFrameCount.current++;
  });

  readStatsRef.current = () => ({
    calls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    idleFrames: idleFrameCount.current,
  });

  return null;
}
