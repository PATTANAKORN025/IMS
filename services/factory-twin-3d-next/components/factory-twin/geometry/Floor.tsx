'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { Envelope, FootprintPolygon } from '@twin-domain/geometry';

/**
 * The floor slab (a filled Shape from the traced footprint polygon) + its
 * building-line outline + the envelope's wireframe bounding box -- app.js's
 * buildFloor()'s own three elements (app.js:1058-1105, envelope outline at
 * app.js:1403-1407), same colors, same Y-offsets (FOOTPRINT_Y=0.002),
 * reproduced here rather than copied by import (app.js stays untouched).
 */
const FOOTPRINT_Y = 0.002;

export default function Floor({
  envelope,
  footprintPolygon,
}: {
  envelope: Envelope;
  footprintPolygon: FootprintPolygon | null;
}) {
  const shapeGeometry = useMemo(() => {
    const verts = footprintPolygon?.vertices;
    if (!verts || verts.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(verts[0].x, verts[0].z);
    for (let i = 1; i < verts.length; i++) shape.lineTo(verts[i].x, verts[i].z);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [footprintPolygon]);

  const loopGeometry = useMemo(() => {
    const verts = footprintPolygon?.vertices;
    if (!verts || verts.length < 3) return null;
    return new THREE.BufferGeometry().setFromPoints(
      verts.map((v) => new THREE.Vector3(v.x, FOOTPRINT_Y + 0.01, v.z)),
    );
  }, [footprintPolygon]);

  const envelopeEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(envelope.width, envelope.height, envelope.depth)),
    [envelope.width, envelope.height, envelope.depth],
  );

  return (
    <>
      {shapeGeometry ? (
        <mesh geometry={shapeGeometry} rotation={[Math.PI / 2, 0, 0]} position={[0, FOOTPRINT_Y, 0]}>
          <meshStandardMaterial color="#1b2534" roughness={0.96} metalness={0.02} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ) : null}
      {loopGeometry ? (
        <lineLoop geometry={loopGeometry}>
          <lineBasicMaterial color="#93a8c4" />
        </lineLoop>
      ) : null}
      <lineSegments geometry={envelopeEdges} position={[0, envelope.height / 2, 0]}>
        <lineBasicMaterial color="#334155" />
      </lineSegments>
    </>
  );
}
