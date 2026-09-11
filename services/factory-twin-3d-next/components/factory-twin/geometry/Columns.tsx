'use client';

import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Column, Envelope } from '@twin-domain/geometry';

/**
 * app.js draws one THREE.Mesh per column (app.js:1390-1450, per-column
 * because each is individually pickable there). Step 5A explicitly
 * excludes selection semantics, so one InstancedMesh for all columns is a
 * legitimate simplification here, not a second data source -- per-instance
 * color still reproduces app.js's own MEDIUM-confidence-is-dimmer
 * convention (app.js's own comment: "a less certain detection never looks
 * as firm as a clear one") via InstancedMesh.setColorAt(), so the visual
 * distinction is not lost to the optimization.
 *
 * Height = envelope.height (full floor-to-floor), exactly app.js's own
 * documented "visualization convention, not evidence of clear height."
 * Default 0.3m plan size when a column's own footprint is missing,
 * matching app.js's fallback exactly.
 */
const HIGH_COLOR = new THREE.Color(0x5c6e88);
const MEDIUM_COLOR = new THREE.Color(0x3d4a5e);

export default function Columns({ columns, envelope }: { columns: readonly Column[]; envelope: Envelope }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const withPosition = columns.filter((c) => c.position);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const identityQ = new THREE.Quaternion();
    withPosition.forEach((col, i) => {
      const w = col.footprint?.width ?? 0.3;
      const d = col.footprint?.depth ?? 0.3;
      pos.set(col.position.x, envelope.height / 2, col.position.z);
      scale.set(w, envelope.height, d);
      mesh.setMatrixAt(i, m.compose(pos, identityQ, scale));
      const isMedium = col.confidence === 'medium' || col.confidence === 'MEDIUM';
      mesh.setColorAt(i, isMedium ? MEDIUM_COLOR : HIGH_COLOR);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [withPosition, envelope.height]);

  if (withPosition.length === 0) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, withPosition.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#5c6e88" />
    </instancedMesh>
  );
}
