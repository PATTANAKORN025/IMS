'use client';

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useThree, type RootState } from '@react-three/fiber';
import type { WebGLRenderer } from 'three';
import type { ViewName } from '@twin-domain/camera';
import { VIEW_NAMES, DEFAULT_VIEW } from '@twin-domain/camera';
import type { Asset } from '@twin-domain/asset';
import type { FactoryGeometryData } from '@/lib/geometry-adapter';
import FactoryGeometry from './FactoryGeometry';
import GeometryCameraController from './GeometryCameraController';
import Machines from '../machines/Machines';

type LifecycleState = 'READY' | 'LOST' | 'RESTORING' | 'REBUILDING' | 'VERIFYING' | 'RECOVERED';

/**
 * The Step 5A viewport root. Same WebGL-lifecycle architecture as Step 4's
 * corrected TwinViewport.tsx (renderer.forceContextLoss()/
 * forceContextRestore(), invalidate()-only rebuild -- NOT a force-remount,
 * which Step 4 measured as a real leak for InstancedMesh content).
 * Reproduced here rather than shared via a common module: this candidate
 * is still an isolated migration artifact, and factoring out a shared
 * viewport-lifecycle hook is a reasonable future cleanup, not required for
 * this step's own acceptance criteria. Flagged as a known limitation in
 * the migration doc, not silently duplicated without comment.
 */
export default function GeometryViewport({
  geometry,
  machines,
}: {
  geometry: FactoryGeometryData;
  machines: readonly Asset[];
}) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const [view, setView] = useState<ViewName>(DEFAULT_VIEW);
  const [lifecycle, setLifecycle] = useState<LifecycleState>('READY');
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const baselineRef = useRef<{ geometries: number; textures: number } | null>(null);
  const readStatsRef = useRef<(() => { calls: number; triangles: number; geometries: number; textures: number }) | null>(null);
  const [stats, setStats] = useState<{ calls: number; triangles: number; geometries: number; textures: number } | null>(null);

  const handleContextLost = useCallback(() => {
    const gl = rendererRef.current;
    if (gl) baselineRef.current = { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures };
    setLifecycle('LOST');
  }, []);

  const handleContextRestored = useCallback(() => {
    setLifecycle('RESTORING');
    setLifecycle('REBUILDING');
    invalidateRef.current?.();
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
        <button type="button" onClick={() => rendererRef.current?.forceContextLoss()} className="rounded-sm border border-border px-2 py-1 text-xs text-danger">
          Simulate context loss
        </button>
        <button type="button" onClick={() => rendererRef.current?.forceContextRestore()} className="rounded-sm border border-border px-2 py-1 text-xs text-success">
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
            calls={stats.calls} tris={stats.triangles} geometries={stats.geometries} textures={stats.textures}
          </span>
        ) : null}
      </div>
      {verifyResult ? (
        <div className="border-b border-border bg-surface px-3 py-1 text-xs text-text-secondary">
          Recovery verification: {verifyResult}
        </div>
      ) : null}
      <div className="relative flex-1">
        <Canvas frameloop="demand" onCreated={handleCreated} camera={{ fov: 45, near: 0.1, far: 400 }} dpr={[1, 2]}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[80, 100, 40]} intensity={0.9} />
          <FactoryGeometry geometry={geometry} />
          <Machines machines={machines} />
          <GeometryCameraController view={view} envelope={geometry.envelope} />
          <StatsProbe readStatsRef={readStatsRef} />
        </Canvas>
      </div>
    </div>
  );
}

/**
 * Reads renderer.info on demand (via readStatsRef, populated inside the
 * Canvas where useThree() is valid), never written to React state
 * per-frame -- same discipline as Step 4's StatsProbe. Must live inside
 * <Canvas>; the button that triggers a read lives outside it, in the
 * toolbar, and calls through the ref.
 */
function StatsProbe({
  readStatsRef,
}: {
  readStatsRef: MutableRefObject<(() => { calls: number; triangles: number; geometries: number; textures: number }) | null>;
}) {
  const { gl } = useThree();
  readStatsRef.current = () => ({
    calls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    geometries: gl.info.memory.geometries,
    textures: gl.info.memory.textures,
  });
  return null;
}
