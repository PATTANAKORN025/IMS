'use client';

import type { FactoryGeometryData } from '@/lib/geometry-adapter';
import Floor from './Floor';
import Walls from './Walls';
import Columns from './Columns';
import Openings from './Openings';
import StructuralGrid from './StructuralGrid';

/**
 * Step 5A boundary: STATIC geometry only. Deliberately independent of
 * machine state, telemetry, alarms, SPC, LDI, or any API-polled data --
 * it takes one FactoryGeometryData snapshot as a prop and never fetches,
 * subscribes, or polls anything itself. Equipment/machines, selection, and
 * live state are explicitly a LATER migration step (see this step's own
 * "STOP" instruction) and have no component here yet.
 */
export default function FactoryGeometry({ geometry }: { geometry: FactoryGeometryData }) {
  return (
    <>
      <Floor envelope={geometry.envelope} footprintPolygon={geometry.footprintPolygon} />
      <StructuralGrid grid={geometry.grid} />
      <Walls walls={geometry.walls} />
      <Columns columns={geometry.columns} envelope={geometry.envelope} />
      <Openings openings={geometry.openings} />
    </>
  );
}
