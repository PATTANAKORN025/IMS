'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { ViewName } from '@twin-domain/camera';
import { VIEW_NAMES } from '@twin-domain/camera';

/**
 * Client Component (must be, per R3F: everything inside <Canvas> runs in
 * the client-only WebGL tree). Mirrors app.js's VIEWS()/applyView()
 * structure (three named presets, camera position + orbit target) -- NOT
 * real CAD-derived numbers, a small synthetic spread sized for this
 * spike's placeholder grid (see TwinScene.tsx).
 *
 * `view` is a discrete prop change (an operator clicking a view button),
 * not a per-frame value -- setting camera.position imperatively in a
 * useEffect keyed on `view` is the correct place for it, not React state
 * read every frame. OrbitControls' own drag/zoom state stays entirely
 * inside three.js/drei, never lifted into React, per the hard rule
 * against putting render-loop values in React state.
 */
const VIEW_PRESETS: Record<ViewName, { position: [number, number, number]; target: [number, number, number] }> = {
  plan: { position: [0, 30, 0.01], target: [0, 0, 0] },
  overview: { position: [14, 12, 14], target: [0, 0, 0] },
  building: { position: [24, 20, 24], target: [0, 0, 0] },
};

export default function CameraController({ view }: { view: ViewName }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();

  useEffect(() => {
    const preset = VIEW_PRESETS[view] ?? VIEW_PRESETS[VIEW_NAMES[0]];
    camera.position.set(...preset.position);
    controlsRef.current?.target.set(...preset.target);
    controlsRef.current?.update();
  }, [view, camera]);

  return <OrbitControls ref={controlsRef} makeDefault />;
}
