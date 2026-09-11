'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Asset } from '@twin-domain/asset';

/**
 * STATIC MACHINE RENDERING ONLY (Step 5B). This component owns geometry,
 * transform, and a neutral visual representation keyed to each machine's
 * stable `Asset.id` -- nothing else. It does NOT fetch (a typed `Asset[]`
 * prop is all it takes), does NOT own selection/operational/alarm/
 * inspector state, and attaches NO click handler -- Step 5B's own hard
 * rule against wiring selection yet.
 *
 * WHY NOT ONE COMPONENT PER MACHINE (Section 7's efficiency evaluation):
 * 431 machines share one unit box geometry and differ only by a 4x4
 * matrix + one tier color, exactly app.js's own justification for
 * InstancedMesh (app.js:1563: "TWO InstancedMeshes, not 344 objects").
 * A literal per-machine React component would mean 431 mounted
 * <mesh> elements -- no rendering benefit, real React/reconciler
 * overhead, and it would fight demand-rendering's whole point. Each
 * machine's `Asset.id` is still a first-class, stable per-instance
 * identity (carried in `instances[]`, exposed via `machineIdAt(index)`)
 * -- ready for a future selection step to resolve an instanceId back to
 * one Asset without owning that responsibility itself.
 *
 * Two InstancedMeshes, matching app.js's own buildEquipmentLayer() split
 * (app.js:1534-1680) collapsed from its 4 per-tier batches into 2 by
 * moving the tier distinction to per-instance color instead of a
 * separate mesh per tier -- same visual information (an operator can
 * still see which extents are measured vs. unresolved), 2 draw calls
 * instead of up to 4, measured and justified, not automatic.
 */

const EQUIPMENT_PRESENTATION_HEIGHT_M = 2.2;
const MARKER_HEIGHT_M = 0.08;
const UNRESOLVED_MARKER_M = 0.9;
const CAD_ROTATION_SIGN = 1;

const TIER_COLOR: Record<string, THREE.Color> = {
  MEASURED_CAD: new THREE.Color(0x4d6483),
  OBSERVED_CAD: new THREE.Color(0x4d6483),
  APPROXIMATION: new THREE.Color(0x3c516c),
};
const UNRESOLVED_COLOR = new THREE.Color(0x2b3a4d);

interface SizedInstance {
  asset: Asset;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  rotY: number;
  color: THREE.Color;
}

interface MarkerInstance {
  asset: Asset;
  x: number;
  y: number;
  z: number;
}

function buildInstances(machines: readonly Asset[]): { sized: SizedInstance[]; markers: MarkerInstance[] } {
  const sized: SizedInstance[] = [];
  const markers: MarkerInstance[] = [];

  for (const asset of machines) {
    const fp = asset.footprint;
    const op = asset.operational_footprint;
    const tier = asset.footprint_status;
    // Same sizing rule as app.js:1580-1585: only a footprint whose status
    // claims a measured/observed/approximated extent gets a body; every
    // record without one gets a marker. No default box.
    const isSizedTier = tier === 'MEASURED_CAD' || tier === 'OBSERVED_CAD' || tier === 'APPROXIMATION';
    const hasSize = isSizedTier && !!fp && Number.isFinite(fp.width) && Number.isFinite(fp.depth);

    if (!hasSize) {
      markers.push({ asset, x: asset.position.x, y: asset.position.y + MARKER_HEIGHT_M / 2, z: asset.position.z });
      continue;
    }

    const useOp = !!op && Number.isFinite(op.width) && Number.isFinite(op.depth);
    const w = useOp ? op!.width : fp!.width;
    const d = useOp ? op!.depth : fp!.depth;
    const offset = Number.isFinite(asset.operational_axis_offset_deg) ? asset.operational_axis_offset_deg! : 0;
    const rotY = Number.isFinite(asset.rotation_deg)
      ? (CAD_ROTATION_SIGN * (asset.rotation_deg! + offset) * Math.PI) / 180
      : 0;
    sized.push({
      asset,
      x: asset.position.x,
      y: asset.position.y + EQUIPMENT_PRESENTATION_HEIGHT_M / 2,
      z: asset.position.z,
      w,
      h: EQUIPMENT_PRESENTATION_HEIGHT_M,
      d,
      rotY,
      color: TIER_COLOR[tier ?? ''] ?? UNRESOLVED_COLOR,
    });
  }

  return { sized, markers };
}

export default function Machines({ machines }: { machines: readonly Asset[] }) {
  const sizedRef = useRef<THREE.InstancedMesh>(null);
  const markerRef = useRef<THREE.InstancedMesh>(null);
  const { sized, markers } = useMemo(() => buildInstances(machines), [machines]);

  useLayoutEffect(() => {
    const mesh = sizedRef.current;
    if (!mesh || sized.length === 0) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const axis = new THREE.Vector3(0, 1, 0);
    sized.forEach((inst, i) => {
      q.setFromAxisAngle(axis, inst.rotY);
      pos.set(inst.x, inst.y, inst.z);
      scale.set(inst.w, inst.h, inst.d);
      mesh.setMatrixAt(i, m.compose(pos, q, scale));
      mesh.setColorAt(i, inst.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [sized]);

  useLayoutEffect(() => {
    const mesh = markerRef.current;
    if (!mesh || markers.length === 0) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(UNRESOLVED_MARKER_M, MARKER_HEIGHT_M, UNRESOLVED_MARKER_M);
    markers.forEach((inst, i) => {
      pos.set(inst.x, inst.y, inst.z);
      mesh.setMatrixAt(i, m.compose(pos, q, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [markers]);

  return (
    <>
      {sized.length > 0 ? (
        <instancedMesh ref={sizedRef} args={[undefined, undefined, sized.length]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#4d6483" transparent opacity={0.9} />
        </instancedMesh>
      ) : null}
      {markers.length > 0 ? (
        <instancedMesh ref={markerRef} args={[undefined, undefined, markers.length]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#2b3a4d" transparent opacity={0.55} />
        </instancedMesh>
      ) : null}
    </>
  );
}
