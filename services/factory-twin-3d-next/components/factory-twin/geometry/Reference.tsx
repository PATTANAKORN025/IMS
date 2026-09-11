'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { ReferenceOverlay } from '@twin-domain/reference';

const OVERLAY_Y = 0.12; // above every reconstructed surface (app.js:1331) -- reads as an overlay, not something standing on the floor
const OVERLAY_COLOR = 0xf59e0b; // app.js:1314, unchanged

/**
 * The raw CAD reference overlay (Step 5E). One `LineSegments` per role and
 * ONE shared material -- app.js's own `buildRawCad()` reasoning
 * (app.js:1298-1300): a role can be switched off without rebuilding
 * anything, and N roles cost one material rather than N. Geometry is built
 * once from `overlay.roles` (a `useMemo`, not per-render); the LAYER
 * toggle that hides this whole component wraps it in a `<group visible>`
 * one level up (`GeometryViewport.tsx`) rather than conditionally
 * unmounting it, so toggling never re-triggers this memo.
 */
export default function Reference({ overlay }: { overlay: ReferenceOverlay | null }) {
  // ONE shared material instance across every role (app.js:1298-1300's own
  // reasoning: N roles should cost one material, not N) -- built via
  // useMemo, passed by reference to every LineSegments below, not
  // recreated per role.
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: OVERLAY_COLOR, transparent: true, opacity: 0.85, depthTest: false }),
    [],
  );

  const roleGeometries = useMemo(() => {
    if (!overlay || !overlay.available) return [];
    return overlay.roles.map((role) => {
      const positions = new Float32Array(role.segments.length * 2 * 3);
      let o = 0;
      for (const seg of role.segments) {
        positions[o++] = seg.x1;
        positions[o++] = OVERLAY_Y;
        positions[o++] = seg.z1;
        positions[o++] = seg.x2;
        positions[o++] = OVERLAY_Y;
        positions[o++] = seg.z2;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      return { id: role.id, geometry };
    });
  }, [overlay]);

  if (roleGeometries.length === 0) return null;
  return (
    <>
      {roleGeometries.map(({ id, geometry }) => (
        <lineSegments key={id} geometry={geometry} material={material} renderOrder={10} />
      ))}
    </>
  );
}
