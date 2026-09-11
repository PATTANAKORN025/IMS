'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';

/**
 * A synthetic placeholder scene -- NOT the real Factory Twin geometry, NOT
 * CAD-derived, NOT wired to any live device. Ids are unmistakably
 * synthetic ("SPIKE-EQP-###"). The only thing under test here is whether
 * R3F can host the same LOAD-BEARING pattern the real app already relies
 * on (PR #23's audit, FACTORY_TWIN_ARCHITECTURE_GAP_AUDIT.md): N objects
 * drawn as ONE InstancedMesh, not N separate meshes.
 *
 * GRID_SIZE=8 -> 64 instances, deliberately small (this spike is not a
 * scale test -- draw-call/instancing BEHAVIOR is what's being proven, and
 * that behavior does not change with instance count).
 *
 * Per-instance transforms are set imperatively via the mesh ref
 * (instanceMatrix), never through React state or props re-rendered per
 * frame -- the hard rule this whole engagement enforces for render-loop
 * values applies here identically to how app.js already does it.
 */
const GRID_SIZE = 8;
const SPACING = 1.6;

export interface SpikeInstance {
  readonly id: string;
  readonly index: number;
}

export default function TwinScene({
  selectedIndex,
  onSelect,
}: {
  selectedIndex: number | null;
  onSelect: (instance: SpikeInstance | null) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const instances = useMemo<SpikeInstance[]>(() => {
    const list: SpikeInstance[] = [];
    let i = 0;
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        list.push({ id: `SPIKE-EQP-${String(i).padStart(3, '0')}`, index: i });
        i++;
      }
    }
    return list;
  }, []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    let i = 0;
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        dummy.position.set((col - GRID_SIZE / 2) * SPACING, 0.25, (row - GRID_SIZE / 2) * SPACING);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    const id = event.instanceId;
    if (id === undefined) return;
    onSelect(instances[id] ?? null);
  }

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, instances.length]}
        onClick={handleClick}
      >
        <boxGeometry args={[1, 0.5, 1]} />
        <meshStandardMaterial color="#38bdf8" />
      </instancedMesh>
      {selectedIndex !== null ? (
        <SelectionHighlight index={selectedIndex} />
      ) : null}
    </>
  );
}

/**
 * A single, separate, cheap wireframe box marking the current selection --
 * one extra draw call while something is selected, not a per-instance
 * color-buffer rewrite. Position computed from the same grid math as the
 * instances above (not read back from the GPU buffer).
 */
function SelectionHighlight({ index }: { index: number }) {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const x = (col - GRID_SIZE / 2) * SPACING;
  const z = (row - GRID_SIZE / 2) * SPACING;
  return (
    <mesh position={[x, 0.25, z]}>
      <boxGeometry args={[1.15, 0.65, 1.15]} />
      <meshBasicMaterial color="#f59e0b" wireframe />
    </mesh>
  );
}
