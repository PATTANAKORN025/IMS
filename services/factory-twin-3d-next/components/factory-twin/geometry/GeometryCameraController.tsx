'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { PerspectiveCamera } from 'three';
import type { ViewName } from '@twin-domain/camera';
import { VIEW_NAMES } from '@twin-domain/camera';
import type { Envelope } from '@twin-domain/geometry';

/**
 * Same architecture as Step 4's CameraController.tsx (view is a discrete
 * prop, not a per-frame state write; OrbitControls owns orbit/zoom/pan
 * entirely inside three.js) -- NOT reused by import because Step 4's
 * presets are sized for its synthetic 8x8 box grid, not this real
 * building's 174.5x120.3m envelope. Presets below are computed FROM the
 * real envelope (mirroring app.js's own refitViews()/frameBounds()
 * intent: frame the actual measured building, not a hardcoded distance),
 * not copied constants.
 */
export default function GeometryCameraController({ view, envelope }: { view: ViewName; envelope: Envelope }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const span = Math.max(envelope.width, envelope.depth);

  useEffect(() => {
    const presets: Record<ViewName, { position: [number, number, number]; target: [number, number, number] }> = {
      plan: { position: [0, span * 0.9, 0.01], target: [0, 0, 0] },
      overview: { position: [span * 0.45, span * 0.35, span * 0.45], target: [0, 0, 0] },
      building: { position: [span * 0.7, span * 0.6, span * 0.7], target: [0, 0, 0] },
    };
    const preset = presets[view] ?? presets[VIEW_NAMES[0]];
    camera.position.set(...preset.position);
    const perspective = camera as PerspectiveCamera;
    perspective.far = span * 4;
    perspective.updateProjectionMatrix();
    controlsRef.current?.target.set(...preset.target);
    controlsRef.current?.update();
  }, [view, camera, span]);

  return <OrbitControls ref={controlsRef} makeDefault />;
}
