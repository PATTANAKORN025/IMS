'use client';

import type { MutableRefObject } from 'react';
import { useThree } from '@react-three/fiber';
import type { ViewName, CameraState } from '@twin-domain/camera';
import type { Asset } from '@twin-domain/asset';
import type { LayerState } from '@twin-domain/layer';
import type { ReferenceOverlay } from '@twin-domain/reference';
import type { OperationalStateResolution } from '@twin-domain/data-quality';
import type { FactoryGeometryData } from '@/lib/geometry-adapter';
import FactoryGeometry from './FactoryGeometry';
import StructuralGrid from './StructuralGrid';
import Reference from './Reference';
import GeometryCameraController from './GeometryCameraController';
import Machines from '../machines/Machines';

export interface SceneStats {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** three.js has no direct `info.memory.materials` counter; `programs`
   *  (compiled shader programs, one per distinct material/geometry-
   *  attribute combination actually drawn) is the standard proxy the
   *  engine itself exposes for this -- disclosed as a proxy, not claimed
   *  as an exact material count. */
  programs: number;
}

/**
 * Step 5F single orchestration boundary (Section 1 of this step's
 * mission): the ONLY place Geometry, Machines, StructuralGrid, Reference,
 * and CameraController are composed together. Pure composition -- this
 * component owns NO WebGL lifecycle state of its own (no context-lost/
 * restored listeners, no `forceContextLoss/Restore` calls); that stays the
 * sole responsibility of `GeometryViewport.tsx`, which mounts this
 * component inside its `<Canvas>` and passes every piece of state
 * (`layers`, `selectedId`, `view`, tokens, camera/mount callbacks) down as
 * plain props. Nothing in this file reads or writes a WebGL context event.
 *
 *   GeometryViewport (Canvas mount + WebGL lifecycle + toolbar)
 *       -> GeometryScene (THIS FILE: pure composition)
 *           -> FactoryGeometry, StructuralGrid, Machines, Reference,
 *              GeometryCameraController
 *
 * Layer visibility (Step 5E) still flows through exactly one crossing
 * point per layer -- a `<group visible={layers.<id>}>` wrapper, unchanged
 * from Step 5E, just relocated into this new boundary rather than living
 * inline in GeometryViewport's own JSX.
 */
export default function GeometryScene({
  geometry,
  machines,
  reference,
  layers,
  selectedId,
  onSelect,
  view,
  resetToken,
  fitToken,
  onCameraStateChange,
  onControllerMount,
  readStatsRef,
  showOperationalState = false,
  operationalStateByAssetId,
}: {
  geometry: FactoryGeometryData;
  machines: readonly Asset[];
  reference: ReferenceOverlay;
  layers: LayerState;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  view: ViewName;
  resetToken: number;
  fitToken: number;
  onCameraStateChange?: (state: CameraState) => void;
  onControllerMount?: () => void;
  readStatsRef: MutableRefObject<(() => SceneStats) | null>;
  /** Step 6A: presentation-only operational-state coloring, threaded
   *  straight through to `Machines` -- this component still owns no
   *  lifecycle or adapter logic of its own, same composition-only rule as
   *  every other prop here. */
  showOperationalState?: boolean;
  operationalStateByAssetId?: ReadonlyMap<string, OperationalStateResolution>;
}) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[80, 100, 40]} intensity={0.9} />
      {/*
        UI control -> LayerState -> visibility only (Step 5E, unchanged).
        Each layer's mesh/InstancedMesh tree is ALWAYS mounted -- toggling a
        layer flips only the wrapping <group>'s `visible` prop (R3F sets
        Object3D.visible in place, no unmount/remount, no geometry
        disposal/recreation), the exact same architecture as app.js's own
        setLayerVisible() (app.js:813-820: "the objects stay in the scene
        graph, keep their geometry and keep polling").
      */}
      <group visible={layers.geometry}>
        <FactoryGeometry geometry={geometry} />
      </group>
      <group visible={layers.grid}>
        <StructuralGrid grid={geometry.grid} />
      </group>
      <group visible={layers.machines}>
        <Machines
          machines={machines}
          selectedId={selectedId}
          onSelect={onSelect}
          interactive={layers.machines}
          showOperationalState={showOperationalState}
          operationalStateByAssetId={operationalStateByAssetId}
        />
      </group>
      <group visible={layers.reference}>
        <Reference overlay={reference} />
      </group>
      <GeometryCameraController
        view={view}
        envelope={geometry.envelope}
        resetToken={resetToken}
        fitToken={fitToken}
        onCameraStateChange={onCameraStateChange}
        onMount={onControllerMount}
      />
      <StatsProbe readStatsRef={readStatsRef} />
    </>
  );
}

/**
 * Reads renderer.info on demand (via readStatsRef, populated inside the
 * Canvas where useThree() is valid), never written to React state
 * per-frame -- same discipline as Step 4's StatsProbe. Must live inside
 * <Canvas>; the button that triggers a read lives outside it, in
 * GeometryViewport's toolbar, and calls through the ref.
 */
function StatsProbe({ readStatsRef }: { readStatsRef: MutableRefObject<(() => SceneStats) | null> }) {
  const { gl } = useThree();
  readStatsRef.current = () => ({
    calls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    geometries: gl.info.memory.geometries,
    textures: gl.info.memory.textures,
    programs: gl.info.programs?.length ?? 0,
  });
  return null;
}
