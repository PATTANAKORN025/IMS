'use client';

import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Wall } from '@twin-domain/geometry';

/**
 * One InstancedMesh for every wall segment -- the exact pattern
 * app.js's buildWalls() uses (app.js:1178-1211), reproduced here (not
 * copied by import -- app.js is untouched per this step's hard rule) so
 * the same "N walls, 1 draw call" property holds in R3F. Presentation
 * height (2.6m) is app.js's own documented "presentation choice", not an
 * authoritative CAD measurement -- walls carry no height in the data
 * model, matching app.js's WALL_PRESENTATION_HEIGHT_M constant exactly so
 * the two renderers are visually comparable, not coincidentally similar.
 */
const WALL_PRESENTATION_HEIGHT_M = 2.6;

export default function Walls({ walls }: { walls: readonly Wall[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let drawn = 0;
    for (const w of walls) {
      const dx = w.x2 - w.x1;
      const dz = w.z2 - w.z1;
      const len = Math.hypot(dx, dz);
      if (!(len > 0)) continue; // degenerate wall, same skip rule as app.js
      pos.set((w.x1 + w.x2) / 2, WALL_PRESENTATION_HEIGHT_M / 2, (w.z1 + w.z2) / 2);
      q.setFromAxisAngle(up, -Math.atan2(dz, dx));
      scale.set(len, WALL_PRESENTATION_HEIGHT_M, w.thickness);
      mesh.setMatrixAt(drawn, m.compose(pos, q, scale));
      drawn++;
    }
    mesh.count = drawn;
    mesh.instanceMatrix.needsUpdate = true;
  }, [walls]);

  if (walls.length === 0) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, walls.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#4a5d78" />
    </instancedMesh>
  );
}
