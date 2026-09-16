'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Asset } from '@twin-domain/asset';
import { MACHINE_STATE_THEME, type MachineStateCode } from '@twin-domain/machine-state';
import type { OperationalStateResolution } from '@twin-domain/data-quality';

/**
 * Static machine rendering (Step 5B) + selection/picking (Step 5C). This
 * component owns geometry, transform, visual representation, and now
 * picking -- but NOT selection state itself (`selectedId` is a controlled
 * prop, owned by the parent, per the mission's "React updates only on
 * discrete selection events" rule) and NOT API/telemetry/alarm/inspector
 * data.
 *
 * WHY NOT ONE COMPONENT PER MACHINE: unchanged from Step 5B -- see that
 * step's own doc. 431 machines still share 2 InstancedMeshes; picking adds
 * onClick handlers to those same 2 meshes, not 431 new listeners.
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
/** Accent color, matching this app's own mirrored --accent/--focus token
 *  (app/tokens.css) -- not a new color invented for selection. */
const SELECTED_COLOR = new THREE.Color(0x38bdf8);
/**
 * Step 6A: NO_DATA/UNAVAILABLE render as this distinct neutral, matching
 * operational-status.js's own DATA_QUALITY.UNMAPPED color (0x64748b) --
 * never DOWN's red (0xef4444) and never any of the other 7 machine-state
 * colors either. This is the visual proof of the hard rule "NO_DATA != DOWN,
 * UNAVAILABLE != DOWN": a machine with no data source is a distinct color
 * from a machine that is actually down, on the same instanced mesh, at a
 * glance.
 */
const NO_DATA_COLOR = new THREE.Color(0x64748b);

function operationalColorFor(res: OperationalStateResolution | undefined): THREE.Color {
  if (res && res.quality === 'SIMULATION' && res.state) {
    const theme = MACHINE_STATE_THEME[res.state as MachineStateCode];
    if (theme) return new THREE.Color(theme.hex);
  }
  // Covers NO_DATA, UNAVAILABLE, and the currently-unreachable VALID/STALE
  // cases uniformly -- anything that is not a real simulated state renders
  // as "no data," never a guessed color.
  return NO_DATA_COLOR;
}

interface SizedInstance {
  id: string;
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
  id: string;
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
    const isSizedTier = tier === 'MEASURED_CAD' || tier === 'OBSERVED_CAD' || tier === 'APPROXIMATION';
    const hasSize = isSizedTier && !!fp && Number.isFinite(fp.width) && Number.isFinite(fp.depth);

    if (!hasSize) {
      markers.push({ id: asset.id, x: asset.position.x, y: asset.position.y + MARKER_HEIGHT_M / 2, z: asset.position.z });
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
      id: asset.id,
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

export default function Machines({
  machines,
  selectedId,
  onSelect,
  interactive = true,
  showOperationalState = false,
  operationalStateByAssetId,
}: {
  machines: readonly Asset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /**
   * Step 5E: gates picking, controlled by the `machines` LayerState flag
   * one level up (`GeometryViewport.tsx`). Real, measured reason this
   * exists rather than relying on the wrapping `<group visible={false}>`
   * alone: three.js's `Raycaster.intersectObject` never checks
   * `Object3D.visible` (confirmed by reading `three/src/core/Raycaster.js`
   * -- only the WebGLRenderer skips invisible objects when drawing) and
   * R3F's own pointer-event system builds on that same raycaster, so a
   * hidden `InstancedMesh` was still fully clickable until this gate was
   * added -- caught by this step's own layer+selection-coexistence
   * testing, not assumed away.
   */
  interactive?: boolean;
  /**
   * Step 6A: when true, the base instance color (before any selection
   * highlight) comes from each asset's resolved operational state instead
   * of its footprint tier. Default false -- the presentation-only feature
   * is opt-in, matching `operational-state-adapters.js`'s own default-off
   * demo-mode convention (eap.js:578), never surprising a viewer with a
   * wall of simulated color on load.
   */
  showOperationalState?: boolean;
  operationalStateByAssetId?: ReadonlyMap<string, OperationalStateResolution>;
}) {
  const sizedRef = useRef<THREE.InstancedMesh>(null);
  const markerRef = useRef<THREE.InstancedMesh>(null);
  const { sized, markers } = useMemo(() => buildInstances(machines), [machines]);

  // Explicit instanceId -> machine.id mapping (Section 3) -- never relies
  // on array order being implicit at the call site; both directions
  // (index->id via the arrays below, id->index via the Maps) are named.
  const sizedIds = useMemo(() => sized.map((s) => s.id), [sized]);
  const markerIds = useMemo(() => markers.map((m) => m.id), [markers]);
  const sizedIndexById = useMemo(() => new Map(sizedIds.map((id, i) => [id, i])), [sizedIds]);
  const markerIndexById = useMemo(() => new Map(markerIds.map((id, i) => [id, i])), [markerIds]);

  /**
   * Step 6A: the single source of truth for each instance's BASE color
   * (tier color, or operational-state color when the toggle is on) --
   * both the initial paint effect and the selection-revert branch below
   * read from these same two arrays, so a selected instance always reverts
   * to whichever base is currently active, never a stale one. Recomputed
   * only when `sized`/`markers`/`showOperationalState`/the resolution map
   * change -- a bounded, discrete recompute (once per toggle), never
   * per-frame, never per-machine-component.
   */
  const sizedDisplayColors = useMemo(
    () => sized.map((inst) => (showOperationalState
      ? operationalColorFor(operationalStateByAssetId?.get(inst.id))
      : inst.color)),
    [sized, showOperationalState, operationalStateByAssetId],
  );
  const markerDisplayColors = useMemo(
    () => markers.map((inst) => (showOperationalState
      ? operationalColorFor(operationalStateByAssetId?.get(inst.id))
      : UNRESOLVED_COLOR)),
    [markers, showOperationalState, operationalStateByAssetId],
  );

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
      mesh.setColorAt(i, sizedDisplayColors[i] ?? inst.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [sized, sizedDisplayColors]);

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
      mesh.setColorAt(i, markerDisplayColors[i] ?? UNRESOLVED_COLOR);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [markers, markerDisplayColors]);

  /**
   * Selection visual feedback (Section 5): the cheapest measured option --
   * an instanceColor swap on the already-existing InstancedMesh, not a new
   * geometry, not a second draw call, not a post-processing outline
   * package. Runs only when `selectedId` changes (a discrete event), never
   * per-frame. Reverts the previously-selected instance back to its real
   * tier color (never leaves a stale highlight) before applying the new one.
   */
  const previousSelectionRef = useRef<{ mesh: 'sized' | 'marker'; index: number } | null>(null);
  useEffect(() => {
    const prev = previousSelectionRef.current;
    if (prev) {
      if (prev.mesh === 'sized' && sizedRef.current) {
        sizedRef.current.setColorAt(prev.index, sizedDisplayColors[prev.index] ?? UNRESOLVED_COLOR);
        if (sizedRef.current.instanceColor) sizedRef.current.instanceColor.needsUpdate = true;
      } else if (prev.mesh === 'marker' && markerRef.current) {
        markerRef.current.setColorAt(prev.index, markerDisplayColors[prev.index] ?? UNRESOLVED_COLOR);
        if (markerRef.current.instanceColor) markerRef.current.instanceColor.needsUpdate = true;
      }
      previousSelectionRef.current = null;
    }

    if (selectedId === null) return;
    const sizedIndex = sizedIndexById.get(selectedId);
    if (sizedIndex !== undefined && sizedRef.current) {
      sizedRef.current.setColorAt(sizedIndex, SELECTED_COLOR);
      if (sizedRef.current.instanceColor) sizedRef.current.instanceColor.needsUpdate = true;
      previousSelectionRef.current = { mesh: 'sized', index: sizedIndex };
      return;
    }
    const markerIndex = markerIndexById.get(selectedId);
    if (markerIndex !== undefined && markerRef.current) {
      markerRef.current.setColorAt(markerIndex, SELECTED_COLOR);
      if (markerRef.current.instanceColor) markerRef.current.instanceColor.needsUpdate = true;
      previousSelectionRef.current = { mesh: 'marker', index: markerIndex };
    }
    // sizedDisplayColors/markerDisplayColors intentionally included: toggling
    // showOperationalState must re-run this effect so a currently-selected
    // instance re-reverts to (and stays on top of) the newly active base
    // color source, never a stale tier/operational color underneath it.
  }, [selectedId, sized, sizedIndexById, markerIndexById, sizedDisplayColors, markerDisplayColors]);

  /**
   * Picking (Section 2): R3F's own pointer-event raycasting, attached ONLY
   * to these 2 machine meshes. Floor/Walls/Columns/Openings/StructuralGrid
   * (Step 5A) have no onClick/onPointerX props at all, so R3F's internal
   * interaction candidate list never includes them -- confirmed by
   * inspection of those components' own source, not a separate
   * raycaster.layers mechanism (Section 10's own instruction: measure
   * before adding one). See the evidence doc for the measured pick
   * latency this already achieves.
   */
  function handleSizedClick(event: ThreeEvent<MouseEvent>) {
    if (!interactive) return;
    event.stopPropagation();
    const instanceId = event.instanceId;
    if (instanceId === undefined) return;
    const id = sizedIds[instanceId];
    if (id !== undefined) onSelect(id);
  }

  function handleMarkerClick(event: ThreeEvent<MouseEvent>) {
    if (!interactive) return;
    event.stopPropagation();
    const instanceId = event.instanceId;
    if (instanceId === undefined) return;
    const id = markerIds[instanceId];
    if (id !== undefined) onSelect(id);
  }

  return (
    <>
      {sized.length > 0 ? (
        <instancedMesh ref={sizedRef} args={[undefined, undefined, sized.length]} frustumCulled={false} onClick={handleSizedClick}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#4d6483" transparent opacity={0.9} />
        </instancedMesh>
      ) : null}
      {markers.length > 0 ? (
        <instancedMesh ref={markerRef} args={[undefined, undefined, markers.length]} frustumCulled={false} onClick={handleMarkerClick}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#2b3a4d" transparent opacity={0.55} />
        </instancedMesh>
      ) : null}
    </>
  );
}
