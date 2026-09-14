'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { StructuralGrid as StructuralGridData } from '@twin-domain/geometry';

/**
 * The surveyed structural grid, one merged BufferGeometry (one draw call
 * for every line, not one per line) -- app.js's buildStructuralGrid()
 * exactly (app.js:1115-1142), same GRID_Y=0.006 offset, same color.
 */
const GRID_Y = 0.006;

export default function StructuralGrid({ grid }: { grid: StructuralGridData | null }) {
  const geometry = useMemo(() => {
    if (!grid || grid.x.length < 2 || grid.z.length < 2) return null;
    const xVals = grid.x.map((l) => l.at);
    const zVals = grid.z.map((l) => l.at);
    const xMin = Math.min(...xVals);
    const xMax = Math.max(...xVals);
    const zMin = Math.min(...zVals);
    const zMax = Math.max(...zVals);
    const points: THREE.Vector3[] = [];
    for (const l of grid.x) points.push(new THREE.Vector3(l.at, GRID_Y, zMin), new THREE.Vector3(l.at, GRID_Y, zMax));
    for (const l of grid.z) points.push(new THREE.Vector3(xMin, GRID_Y, l.at), new THREE.Vector3(xMax, GRID_Y, l.at));
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [grid]);

  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#1e293b" />
    </lineSegments>
  );
}
