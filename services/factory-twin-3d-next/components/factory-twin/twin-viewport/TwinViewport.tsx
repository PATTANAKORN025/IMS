'use client';

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
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
 * FrameCounter below.
 */
export default function TwinViewport() {
  const [view, setView] = useState<ViewName>(DEFAULT_VIEW);
  const [selected, setSelected] = useState<SpikeInstance | null>(null);
  const [contextStatus, setContextStatus] = useState<'ok' | 'lost' | 'restored'>('ok');
  const [stats, setStats] = useState<{ calls: number; triangles: number; idleFrames: number } | null>(null);
  const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
  const readStatsRef = useRef<(() => { calls: number; triangles: number; idleFrames: number }) | null>(null);

  const handleCreated = useCallback(
    ({ gl }: RootState) => {
      const canvas = gl.domElement;
      glRef.current = gl.getContext();
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        setContextStatus('lost');
      });
      canvas.addEventListener('webglcontextrestored', () => {
        setContextStatus('restored');
      });
    },
    [],
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
          onClick={() => {
            const ext = glRef.current?.getExtension('WEBGL_lose_context');
            ext?.loseContext();
          }}
          className="rounded-sm border border-border px-2 py-1 text-xs text-danger"
        >
          Simulate context loss
        </button>
        <button
          type="button"
          onClick={() => {
            const ext = glRef.current?.getExtension('WEBGL_lose_context');
            ext?.restoreContext();
          }}
          className="rounded-sm border border-border px-2 py-1 text-xs text-success"
        >
          Restore context
        </button>
        <span className="text-xs text-text-secondary">context: {contextStatus}</span>
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
      <div className="relative flex-1">
        <Canvas
          frameloop="demand"
          onCreated={handleCreated}
          camera={{ fov: 45, near: 0.1, far: 200 }}
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
