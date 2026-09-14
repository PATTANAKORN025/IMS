'use client';

import type { FactoryGeometryData } from '@/lib/geometry-adapter';
import Floor from './Floor';
import Walls from './Walls';
import Columns from './Columns';
import Openings from './Openings';

/**
 * Step 5A boundary: STATIC geometry only. Deliberately independent of
 * machine state, telemetry, alarms, SPC, LDI, or any API-polled data --
 * it takes one FactoryGeometryData snapshot as a prop and never fetches,
 * subscribes, or polls anything itself. Equipment/machines, selection, and
 * live state are explicitly a LATER migration step (see this step's own
 * "STOP" instruction) and have no component here yet.
 *
 * Step 5E: `StructuralGrid` moved OUT of this bundle to `GeometryViewport`'s
 * own scene composition -- the layer/reference architecture's `grid` layer
 * toggles independently of this component's `geometry` layer (mission's own
 * suggested 4-layer model lists them separately), so they can no longer
 * live in one non-decomposable group. This component's own children remain
 * one `geometry` layer, still built once and never torn down on a toggle.
 */
export default function FactoryGeometry({ geometry }: { geometry: FactoryGeometryData }) {
  return (
    <>
      <Floor envelope={geometry.envelope} footprintPolygon={geometry.footprintPolygon} />
      <Walls walls={geometry.walls} />
      <Columns columns={geometry.columns} envelope={geometry.envelope} />
      <Openings openings={geometry.openings} />
    </>
  );
}
