'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RootState } from '@react-three/fiber';
import type { WebGLRenderer } from 'three';

/**
 * Step 9 extraction. Before this, `GeometryViewport.tsx` and
 * `TwinViewport.tsx` each carried their own independent copy of this exact
 * state machine (`READY -> LOST -> RESTORING -> REBUILDING -> VERIFYING ->
 * RECOVERED`), the same `handleContextLost`/`handleContextRestored`/
 * `handleCreated` shape, and the same hydration-safe render-count display
 * pattern -- disclosed as a known duplication since Step 5F/Step 4
 * (`GeometryViewport.tsx`'s own header comment), and the direct cause of
 * the same ref-mutated-during-render hydration bug landing independently
 * in both files (fixed in commit 727c98cd). This hook is the single
 * source of truth both components now consume instead.
 *
 * `onContextLost`/`onContextRestored` are optional extension points for a
 * consumer's OWN additional bookkeeping (e.g. `GeometryViewport.tsx`'s
 * Step 5F `contextLostCount`/`contextRestoredCount` counters) -- the hook
 * itself does not track them, so a consumer that passes neither callback
 * (e.g. `TwinViewport.tsx`) gets byte-identical render/state behavior to
 * its pre-extraction code, not extra state it never had.
 */

export type LifecycleState = 'READY' | 'LOST' | 'RESTORING' | 'REBUILDING' | 'VERIFYING' | 'RECOVERED';

export interface UseWebglLifecycleOptions {
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

export interface WebglLifecycle {
  lifecycle: LifecycleState;
  verifyResult: string | null;
  /** Hydration-safe: 0 on server and on every client render up to and
   * including the one that hydrates, the real per-render count after. */
  renderCount: number;
  rendererRef: React.MutableRefObject<WebGLRenderer | null>;
  invalidateRef: React.MutableRefObject<(() => void) | null>;
  handleCreated: (state: RootState) => void;
}

export function useWebglLifecycle(options: UseWebglLifecycleOptions = {}): WebglLifecycle {
  const { onContextLost, onContextRestored } = options;

  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const [lifecycle, setLifecycle] = useState<LifecycleState>('READY');
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const baselineRef = useRef<{ geometries: number; textures: number } | null>(null);

  const handleContextLost = useCallback(() => {
    const gl = rendererRef.current;
    if (gl) {
      baselineRef.current = { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures };
    }
    onContextLost?.();
    setLifecycle('LOST');
  }, [onContextLost]);

  const handleContextRestored = useCallback(() => {
    onContextRestored?.();
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
  }, [onContextRestored]);

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

  return {
    lifecycle,
    verifyResult,
    renderCount: hydrated ? renderCountRef.current : 0,
    rendererRef,
    invalidateRef,
    handleCreated,
  };
}
