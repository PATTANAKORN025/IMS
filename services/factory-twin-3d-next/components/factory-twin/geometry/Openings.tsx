'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Opening, OpeningKind } from '@twin-domain/geometry';

/**
 * Grouped by kind, one InstancedMesh per kind (door/window/airshower) --
 * app.js's own buildOpenings() convention exactly (app.js:1231-1259),
 * including its exact marker size (0.9 x style.h x 0.25) and per-kind
 * height/color, since openings carry no CAD extent of their own (insertion
 * points only -- lib/wire.js's projectOpening header).
 */
const OPENING_STYLE: Record<OpeningKind, { color: string; h: number }> = {
  door: { color: '#38bdf8', h: 2.1 },
  window: { color: '#7dd3fc', h: 1.0 },
  airshower: { color: '#c4b5fd', h: 2.3 },
};

function OpeningGroup({ kind, items }: { kind: OpeningKind; items: readonly Opening[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const style = OPENING_STYLE[kind];

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(0.9, style.h, 0.25);
    items.forEach((o, i) => {
      pos.set(o.position.x, style.h / 2, o.position.z);
      mesh.setMatrixAt(i, m.compose(pos, q, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [items, style.h]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, items.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={style.color} />
    </instancedMesh>
  );
}

export default function Openings({ openings }: { openings: readonly Opening[] }) {
  const byKind = useMemo(() => {
    const map = new Map<OpeningKind, Opening[]>();
    for (const o of openings) {
      if (!map.has(o.kind)) map.set(o.kind, []);
      map.get(o.kind)!.push(o);
    }
    return map;
  }, [openings]);

  return (
    <>
      {[...byKind.entries()].map(([kind, items]) => (
        <OpeningGroup key={kind} kind={kind} items={items} />
      ))}
    </>
  );
}
