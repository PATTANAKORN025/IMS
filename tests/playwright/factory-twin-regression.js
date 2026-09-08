#!/usr/bin/env node
/**
 * Factory Twin 3D — browser regression.
 *
 * Runs against the twin as it is actually deployed: through the proxy, behind
 * Grafana's auth_request gate. Earlier ad-hoc checks published a temporary
 * host port to reach the container directly, which tested a path no real user
 * takes and left docker-compose.yaml dirty. This authenticates instead.
 *
 * What it asserts, and why each one has previously broken or nearly broken:
 *   - the private asset path is 401 unauthenticated (it once served the whole
 *     private/ directory to any logged-in user)
 *   - scene composition per layer, so a data regression shows up as a count
 *     rather than a vague "looks wrong"
 *   - no NaN/Infinity transform anywhere (a missing envelope height produced
 *     exactly this)
 *   - geometry/material sharing actually happened
 *   - conflicting zones stay withheld from the wire
 *   - layer visibility never mutates data
 *
 * Counts are read from the API in the same pass and compared against the
 * scene, so the test does not hardcode a census that will go stale the next
 * time evidence is added -- it checks that what was served is what was drawn.
 *
 * Usage:
 *   GRAFANA_URL=... GRAFANA_ADMIN_USER=... GRAFANA_ADMIN_PASSWORD=... \
 *     node tests/playwright/factory-twin-regression.js
 *
 * TWIN_DIRECT_URL escape hatch:
 *   TWIN_DIRECT_URL=http://localhost:4199/ node tests/playwright/factory-twin-regression.js
 *
 *   Points the SCENE checks at the service directly, skipping the login and
 *   the unauthenticated-boundary section. It exists because the Grafana
 *   credential in this environment currently returns 401, which would
 *   otherwise leave every scene assertion unrunnable rather than merely
 *   unverified-through-the-proxy.
 *
 *   It is explicitly NOT equivalent to the authenticated run and never
 *   reports as one: the proxy, the auth gate and the 401 boundary are not
 *   exercised at all, so a direct run proves the scene is correct and proves
 *   NOTHING about access control. The default path remains the authenticated
 *   one. Nothing about the service's auth is changed, disabled or bypassed --
 *   the gate lives in the proxy and is simply not on this route.
 */

'use strict';

const { chromium } = require('playwright');
const path = require('path');
// The ONE canonical corner generator, shared with the extractor, the validator
// and the reconciliation. The browser is measured against it; it is never
// reimplemented here, because a second convention is the bug it exists to stop.
const blocks = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'cad-blocks'));

const BASE_URL = process.env.GRAFANA_URL || 'http://localhost:3000';
const USER = process.env.GRAFANA_ADMIN_USER || process.env.GRAFANA_USER || 'admin';
const PASS = process.env.GRAFANA_ADMIN_PASSWORD || process.env.GRAFANA_PASS;
const DIRECT_URL = process.env.TWIN_DIRECT_URL || null;
const TWIN_URL = DIRECT_URL || `${BASE_URL}/factory-twin-3d/`;
// The bare service root now serves the EAP operational map (eap.html), the
// canonical Factory Twin entry point. This suite tests the older physical
// twin specifically -- window.__twin, layer toggles, the CAD reference
// overlay -- which stays reachable at its own filename rather than at root.
const PHYSICAL_TWIN_URL = `${TWIN_URL}index.html`;

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1440', width: 2560, height: 1440 },
  { name: '3840x2160', width: 3840, height: 2160 },
  // Portrait is not decorative: the camera fit divides the horizontal extent
  // by tan(fov/2) * aspect, so an aspect below 1 makes the depth axis the
  // binding one -- a real bug that only showed up once portrait was tested.
  { name: '600x1000 (portrait)', width: 600, height: 1000 },
];

// The toggles an operator actually has. Sub-layers exist because the four
// coarse layers each bundled two different evidence classes; the test drives
// the real controls rather than the internal grouping.
// Exactly the layers the panel offers, and the panel offers exactly the layers
// that hold something. The telemetry layer is gone: it was always empty,
// because no monitored device has an established position on this floor.
const LAYERS = ['shell', 'columns', 'walls', 'functional', 'equipment'];

const NO_GEOMETRY = 'no private geometry is deployed here';

/**
 * Tolerance for anything read back out of a three.js vertex buffer.
 *
 * Buffer attributes are Float32Array: a coordinate that goes in as a double
 * comes back with about seven significant digits, which at this building's
 * scale is a few micrometres. Everything measured through those buffers uses
 * this; everything compared against the API's own numbers stays exact.
 */
const FLOAT32_TOL_M = 5e-5;

/**
 * The resolution the model publishes coordinates at: metres to three decimals,
 * one millimetre. Two numbers both derived from millimetre-rounded vertices
 * can differ by that much and no more.
 */
const SERVED_COORDINATE_QUANTUM_M = 0.002;
const NO_DEVICES = 'no monitored devices in this database';
const NO_SCHEMATIC = 'no schematic transcription is deployed here';
const NO_DISPLAY_CONTRACT = 'this build has no display-mode contract (getDisplayAssetIds/applyDisplayMode)';

let failures = 0;
let skipped = 0;
function check(ok, label, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

// A precondition that is absent is not a passing assertion. CI has no private
// geometry -- it is gitignored -- so the checks that need it cannot run there.
// They are reported as SKIP with the reason, never folded into the pass count,
// so a green CI run never implies the geometry was verified.
function skip(label, why) {
  console.log(`  SKIP  ${label}  (${why})`);
  skipped++;
}

// Reads scene + API together so scene composition is compared against what
// the API actually served, rather than against a hardcoded census.
//
// FT-07B: the renderer sits behind a display-policy projection (classify ->
// dedupe -> filter-by-mode), so "what the API served" and "what should be
// drawn" are no longer the same set -- a display mode legitimately hides
// AUDIT/UNKNOWN/duplicate records the API still reports in full. Every
// api.equipment* field below is therefore scoped to the CURRENT mode's
// canonical display set (read from window.__twin.getDisplayAssetIds(), the
// same function applyDisplayMode() itself calls -- never re-derived here),
// so the dense per-machine reconciliation logic further down keeps
// comparing "drawn" against "should be drawn" exactly as it always has.
// The full, unfiltered evidence population survives separately as
// api.rawEquipmentTotal / api.rawEquipmentIds, which is what proves API
// completeness independent of any display mode.
async function snapshot(page) {
  return page.evaluate(async () => {
    const T = window.__twin;
    const perLayer = {};
    let meshes = 0;
    let badTransforms = 0;
    for (const [name, group] of Object.entries(T.layers)) {
      let n = 0;
      group.traverse((o) => {
        if (o.type === 'Mesh') n++;
      });
      perLayer[name] = n;
    }
    T.scene.traverse((o) => {
      if (o.type === 'Mesh') meshes++;
      const p = o.position;
      if (p && !(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) badTransforms++;
      const s = o.scale;
      if (s && !(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z))) badTransforms++;
    });
    const geo = await (await fetch('api/floor-geometry')).json();
    // FT-07B display-policy scoping -- see the comment on this function.
    // window.__twin.getDisplayAssetIds is a prototype hook (FT-07A/FT-07B);
    // on a build that predates it this is a no-op and geo.equipment is left
    // exactly as served, so every check below runs unchanged against the
    // pre-display-policy architecture.
    const rawEquipment = Array.isArray(geo.equipment) ? geo.equipment : [];
    const displayMode = typeof T.getDisplayMode === 'function' ? T.getDisplayMode() : null;
    const displayIds = typeof T.getDisplayAssetIds === 'function'
      ? new Set(T.getDisplayAssetIds(displayMode))
      : null;
    if (displayIds) geo.equipment = rawEquipment.filter((e) => displayIds.has(e.id));
    return {
      meshes,
      badTransforms,
      perLayer,
      visibility: Object.fromEntries(
        [...Object.entries(T.layers), ...Object.entries(T.sublayers)].map(([k, g]) => [k, g.visible])
      ),
      perSublayer: Object.fromEntries(
        Object.entries(T.sublayers).map(([k, g]) => {
          let n = 0;
          g.traverse((o) => {
            if (o.type === 'Mesh') n++;
          });
          return [k, n];
        })
      ),
      // Every rendered evidence position as one string. A camera change must
      // leave this identical; anything else means a view moved real data.
      coords: T.snapshotCoordinates(),
      resources: T.resourceStats(),
      footprintMeshes: T.footprintMeshes.length,
      equipmentMeshes: Array.isArray(T.equipmentInstances) ? T.equipmentInstances.length : 0,
      // The invented-machine-form layer is DELETED. Read defensively and
      // assert it stays absent: a number here would mean drawn volumes nobody
      // measured had come back on a floor read from CAD.
      hasPresentationRegistry: T.presentationMeshes !== undefined
        || T.sublayers.presentation !== undefined,
      equipmentCensus: T.equipmentCensus ? T.equipmentCensus() : null,
      // Rotation actually applied to the drawn pads, so the reconciliation can
      // compare the SCENE against the API rather than the API against itself.
      equipmentRotations: (Array.isArray(T.equipmentInstances) ? T.equipmentInstances : []).map(
        (i) => ({ id: i.item.id, y: i.rotY })
      ),
      // The DRAWN box, read out of the INSTANCE MATRIX the renderer uploaded.
      //
      // Instancing is where a display layer could most easily lose a machine:
      // a matrix is composed once, in bulk, and nothing about a wrong one looks
      // wrong. So the matrices are decomposed back into a position, a turn and
      // a size, and the four floor-plane corners are generated from them. This
      // is what the renderer actually put on screen, not what it was asked to.
      equipmentBoxes: (() => {
        const out = [];
        for (const mesh of (Array.isArray(T.equipmentBatches) ? T.equipmentBatches : [])) {
          const list = mesh.userData.instances || [];
          const e = mesh.matrix.elements; // batch transform, expected identity
          for (let i = 0; i < list.length; i += 1) {
            const inst = list[i];
            // three.js is an ES module here with no page global, so the
            // instance buffer is read directly rather than through Matrix4.
            const a = mesh.instanceMatrix.array;
            const o = i * 16;
            // Column-major, as three.js stores it. Basis vector lengths are the
            // scale; the translation column is the position.
            const sx = Math.hypot(a[o + 0], a[o + 1], a[o + 2]);
            const sy = Math.hypot(a[o + 4], a[o + 5], a[o + 6]);
            const sz = Math.hypot(a[o + 8], a[o + 9], a[o + 10]);
            const px = a[o + 12];
            const py = a[o + 13];
            const pz = a[o + 14];
            // Turn about +Y. A rotation about +Y puts -sin(theta) in m31,
            // which is element 2 of the column-major array -- getting that sign
            // wrong reports every machine at minus its own angle, and shows up
            // as a doubled error rather than as an obvious one.
            const rotY = Math.atan2(-a[o + 2] / (sx || 1), a[o + 0] / (sx || 1));
            // Corners straight off the matrix BASIS rather than off a
            // reconstructed angle: no convention to get wrong twice.
            const exX = a[o + 0] / (sx || 1);
            const exZ = a[o + 2] / (sx || 1);
            const ezX = a[o + 8] / (sz || 1);
            const ezZ = a[o + 10] / (sz || 1);
            const hw = sx / 2;
            const hd = sz / 2;
            const corners = [];
            for (const [u, v] of [[hw, hd], [-hw, hd], [-hw, -hd], [hw, -hd]]) {
              corners.push([
                Math.round((px + u * exX + v * ezX) * 1e6) / 1e6,
                Math.round((pz + u * exZ + v * ezZ) * 1e6) / 1e6,
              ]);
            }
            out.push({
              id: inst.item.id,
              x: px, y: py, z: pz, w: sx, h: sy, d: sz,
              rotY,
              batchIdentity: e[0] === 1 && e[5] === 1 && e[10] === 1
                && e[12] === 0 && e[13] === 0 && e[14] === 0,
              tier: inst.item.footprint_status,
              floorY: py - sy / 2,
              shape: inst.item.display_shape,
              corners,
            });
          }
        }
        return out;
      })(),
      // A TRUE_POLYGON record costs its own Mesh, not a box instance -- see
      // buildTruePolygonMeshes in app.js -- so it carries userData.item
      // directly rather than userData.instances. Verified by its own world
      // bounding box (the geometry's vertices ARE world coordinates already;
      // the mesh applies no further transform, per the coordinate contract),
      // not by decomposing an instance matrix that does not apply to it.
      equipmentPolygons: (() => {
        const out = [];
        for (const mesh of (Array.isArray(T.equipmentBatches) ? T.equipmentBatches : [])) {
          const item = mesh.userData.item;
          if (!item || !mesh.isMesh || mesh.isInstancedMesh) continue;
          mesh.geometry.computeBoundingBox();
          const bb = mesh.geometry.boundingBox;
          out.push({
            id: item.id,
            minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z,
            meshPosition: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
          });
        }
        return out;
      })(),
      // The placement the renderer computed, in full precision, before any
      // buffer: the record's own position, the size it was told to draw, and
      // the angle it turned to. "Nothing moved" is proved here.
      equipmentPlacements: (Array.isArray(T.equipmentInstances) ? T.equipmentInstances : []).map(
        (i) => ({ id: i.item.id, x: i.x, y: i.y, z: i.z, w: i.w, d: i.d, h: i.h, rotY: i.rotY })
      ),
      // How many DISTINCT box geometries the whole equipment layer costs. A
      // count, not a uuid: the identity of a cached geometry is a runtime
      // detail that changes whenever the layer is rebuilt, and it is the
      // SHARING that is under test.
      equipmentGeometries: new Set(
        (Array.isArray(T.equipmentBatches) ? T.equipmentBatches : []).map((m) => m.geometry.uuid)
      ).size,
      equipmentBatchCount: Array.isArray(T.equipmentBatches) ? T.equipmentBatches.length : 0,
      equipmentSceneObjects: (() => {
        let n = 0;
        T.sublayers.equipment.traverse((o) => { if (o.isMesh || o.isInstancedMesh) n += 1; });
        return n;
      })(),
      // Walls and openings are instanced: a few objects carrying hundreds of
      // spans. Counted as objects, because that is what the scene holds.
      wallMeshes: T.wallMeshes ? T.wallMeshes.length : 0,
      openingMeshes: T.openingMeshes ? T.openingMeshes.length : 0,
      structuralGrid: (() => {
        const g = T.getStructuralGrid();
        return g ? g.geometry.attributes.position.count / 2 : 0;
      })(),
      // The decorative helper must be gone once the surveyed grid is drawn:
      // one grid on screen, and that one evidence.
      orientationGridPresent: (() => {
        let found = false;
        T.layers.structural.traverse((o) => {
          if (o.type === 'GridHelper') found = true;
        });
        return found;
      })(),
      // There is no machine-mesh registry any more. Read defensively and
      // assert it stays absent: a number here would mean the synthetic
      // placement path had been reinstated.
      machineMeshes: Array.isArray(T.machineMeshes) ? T.machineMeshes.length : 0,
      hasMachineRegistry: T.machineMeshes !== undefined,
      api: {
        columns: geo.columns.length,
        walls: Array.isArray(geo.walls) ? geo.walls.length : 0,
        openings: Array.isArray(geo.openings) ? geo.openings.length : 0,
        // slots[] is not served at all any more. Read it defensively and
        // assert it stays absent -- its presence would mean the raster layer
        // was back on the wire.
        slotsServed: 'slots' in geo,
        // FT-07B: the full, UNFILTERED evidence population and the mode this
        // snapshot was scoped to -- api.equipment below (and everything
        // derived from it) is the display-policy-scoped subset instead, per
        // this function's header comment.
        rawEquipmentTotal: rawEquipment.length,
        rawEquipmentIds: rawEquipment.map((e) => e.id).sort(),
        // Unresolved-extent honesty is a claim about the FULL evidence
        // population, not about what one display mode chooses to draw --
        // PRIMARY legitimately shows zero UNRESOLVED records by design, and
        // that must never read as "the API stopped reporting them".
        rawEquipmentResolved: rawEquipment.filter(
          (e) => (e.footprint_status === 'MEASURED_CAD' || e.footprint_status === 'OBSERVED_CAD') && e.footprint
        ).length,
        rawEquipmentApproximated: rawEquipment.filter(
          (e) => e.footprint_status === 'APPROXIMATION' && e.footprint
        ).length,
        rawEquipmentUnresolved: rawEquipment.filter((e) => e.footprint_status === 'UNRESOLVED').length,
        displayMode,
        equipment: Array.isArray(geo.equipment) ? geo.equipment.length : 0,
        equipmentResolved: (geo.equipment || []).filter(
          (e) => (e.footprint_status === 'MEASURED_CAD' || e.footprint_status === 'OBSERVED_CAD')
            && e.footprint
        ).length,
        equipmentApproximated: (geo.equipment || []).filter(
          (e) => e.footprint_status === 'APPROXIMATION' && e.footprint
        ).length,
        // An approximation must declare its provenance. Without it a bound is
        // indistinguishable from a measurement on the wire.
        equipmentApproxWithoutSource: (geo.equipment || []).filter(
          (e) => e.footprint_status === 'APPROXIMATION' && e.footprint_source !== 'CAD_CORRELATED'
        ).length,
        // Display geometry, summarised. The renderer draws THIS; the measured
        // outline travels beside it for inspection and is drawn by nobody.
        displayShapes: (geo.equipment || []).reduce((acc, e) => {
          const k = e.display_shape || 'MISSING';
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {}),
        displayClassMissing: (geo.equipment || []).filter(
          (e) => !['OPERATIONAL_RECTANGLE', 'UNRESOLVED'].includes(e.display_shape)
        ).length,
        displayRectangles: (geo.equipment || []).filter(
          (e) => e.display_shape === 'OPERATIONAL_RECTANGLE'
        ).length,
        // A resolved record can choose TRUE_POLYGON over the rectangle path --
        // see display_representation in lib/wire.js -- and is drawn from its
        // own served outline instead of an InstancedMesh box. Counted
        // separately so the box-path assertions below know how many of the
        // "with an extent" / "OPERATIONAL_RECTANGLE" population never reaches
        // a box at all, without hardcoding which records those are.
        displayTruePolygon: (geo.equipment || []).filter(
          (e) => e.display_representation === 'TRUE_POLYGON'
        ).length,
        // The operational size, by id, and the axis offset it is drawn on.
        operationalFootprints: (geo.equipment || []).reduce((acc, e) => {
          if (e.operational_footprint) {
            acc[e.id] = {
              width: e.operational_footprint.width,
              depth: e.operational_footprint.depth,
              offset: e.operational_axis_offset_deg || 0,
              offset_x: e.operational_footprint.offset_x || 0,
              offset_z: e.operational_footprint.offset_z || 0,
            };
          }
          return acc;
        }, {}),
        // An operational rectangle may be tighter than the physical extent --
        // that is the point -- but never larger.
        operationalLargerThanPhysical: (geo.equipment || []).filter(
          (e) => e.operational_footprint && e.footprint
            && e.operational_footprint.width * e.operational_footprint.depth
              > e.footprint.width * e.footprint.depth + 1e-6
        ).length,
        // A record that says its body axis disagrees with the INSERT must NOT
        // have been turned: the flag exists instead of the turn.
        flaggedButTurned: (geo.equipment || []).filter(
          (e) => e.orientation_geometry_mismatch
            && Math.abs(e.operational_axis_offset_deg || 0) > 1e-9
        ).length,
        axisOverLimit: (geo.equipment || []).filter(
          (e) => Math.abs(e.operational_axis_offset_deg || 0) > 5 + 1e-9
        ).length,
        axisOffsetApplied: (geo.equipment || []).filter(
          (e) => Math.abs(e.operational_axis_offset_deg || 0) > 0.001
        ).length,
        orientationFlagged: (geo.equipment || []).filter(
          (e) => e.orientation_geometry_mismatch
        ).length,
        enclosuresExcluded: (geo.equipment || []).filter(
          (e) => e.operational_excludes_enclosure
        ).length,
        // The §22 cases, picked from the served record by their own properties
        // rather than by an id list that would rot the first time the drawing
        // is re-read.
        visualCases: (() => {
          const eq = (geo.equipment || []).filter((e) => e.footprint);
          const pick = (fn) => { const m = eq.filter(fn); return m.length ? m[0].id : null; };
          const bySize = eq.slice().sort(
            (a, b) => b.footprint.width * b.footprint.depth - a.footprint.width * a.footprint.depth
          );
          const near = (deg) => pick((e) => Math.abs(((e.rotation_deg % 360) + 360) % 360 - deg) < 0.5);
          return {
            axis0: near(0),
            axis90: near(90),
            offAxis: pick((e) => {
              const r = ((e.rotation_deg % 360) + 360) % 360;
              return Math.abs(r % 90) > 5 && Math.abs(r % 90) < 85;
            }),
            mirrored: pick((e) => e.mirrored),
            longest: bySize.length
              ? eq.slice().sort((a, b) => Math.max(b.footprint.width, b.footprint.depth)
                - Math.max(a.footprint.width, a.footprint.depth))[0].id : null,
            smallest: eq.length
              ? eq.slice().sort((a, b) => Math.min(a.footprint.width, a.footprint.depth)
                - Math.min(b.footprint.width, b.footprint.depth))[0].id : null,
            largest: bySize.length ? bySize[0].id : null,
            overlapping: pick((e) => e.overlaps_neighbour),
            roomCrossing: pick((e) => e.zone_status === 'CROSSES_ROOM_BOUNDARY'),
            enclosure: pick((e) => e.operational_excludes_enclosure),
            flagged: pick((e) => e.orientation_geometry_mismatch),
            unresolved: (() => {
              const u = (geo.equipment || []).filter((e) => !e.footprint);
              return u.length ? u[0].id : null;
            })(),
          };
        })(),
        displayOnUnresolved: (geo.equipment || []).filter(
          (e) => !e.footprint && e.display_shape !== 'UNRESOLVED'
        ).length,
        // NO DISPLAY GEOMETRY REACHES THE CLIENT. Not a smaller polygon -- none
        // at all. This is the structural half of the proof: the renderer has
        // one source for where a machine is, so there is nothing for a display
        // defect to move it with.
        displayGeometryOnWire: (geo.equipment || []).filter(
          (e) => 'display_polygon' in e || 'display_vertices' in e
        ).length,
        // The cost of the abstraction, as served. Every rectangle contains the
        // outline it was measured from, so this is never negative.
        displayAreaErrorMin: (geo.equipment || []).reduce(
          (n, e) => (typeof e.display_area_error === 'number'
            ? Math.min(n, e.display_area_error) : n), Infinity
        ),
        displayAreaErrorMax: (geo.equipment || []).reduce(
          (n, e) => (typeof e.display_area_error === 'number'
            ? Math.max(n, e.display_area_error) : n), 0
        ),
        measuredVertexTotal: (geo.equipment || []).reduce(
          (n, e) => n + (Array.isArray(e.footprint_polygon) ? e.footprint_polygon.length : 0), 0
        ),
        // The served extent, by id, so the scene can be measured against it.
        equipmentFootprints: (geo.equipment || []).reduce((acc, e) => {
          if (e.footprint) acc[e.id] = { width: e.footprint.width, depth: e.footprint.depth };
          return acc;
        }, {}),
        equipmentPositions: (geo.equipment || []).map((e) => {
          // The served delta from the machine's position to the operational
          // rectangle's own measured centre. Zero unless the record also
          // carries a body-axis offset -- the two are one measurement.
          const op = e.operational_footprint;
          const has = op && Number.isFinite(op.offset_x) && Number.isFinite(op.offset_z);
          return {
            id: e.id,
            x: e.position.x,
            z: e.position.z,
            deg: e.rotation_deg,
            ox: has ? op.offset_x : 0,
            oz: has ? op.offset_z : 0,
            axis: e.operational_axis_offset_deg || 0,
            enclosure: e.operational_excludes_enclosure === true,
            w: op && Number.isFinite(op.width) ? op.width : null,
            d: op && Number.isFinite(op.depth) ? op.depth : null,
          };
        }),
        equipmentUnresolved: (geo.equipment || []).filter(
          (e) => e.footprint_status === 'UNRESOLVED'
        ).length,
        // The canonical frame's own declaration, on the wire. Not served, so
        // read from the geometry the client got: a model whose z ordering
        // disagrees with the CAD would place every machine on the wrong side.
        equipmentZRange: (geo.equipment || []).reduce((r, e) => ({
          min: Math.min(r.min, e.position.z), max: Math.max(r.max, e.position.z),
        }), { min: Infinity, max: -Infinity }),
        equipmentWithFootprintButUnresolved: (geo.equipment || []).filter(
          (e) => e.footprint_status === 'UNRESOLVED' && e.footprint
        ).length,
        equipmentNonCadPosition: (geo.equipment || []).filter(
          (e) => e.geometry_status !== 'MEASURED_CAD'
        ).length,
        equipmentMapped: (geo.equipment || []).filter((e) => e.ims_device_id).length,
        equipmentRotationsServed: (geo.equipment || []).map(
          (e) => ({ id: e.id, deg: e.rotation_deg })
        ),
        zones: geo.functional_zones.length,
        zonesTotal: geo.functional_zones_meta ? geo.functional_zones_meta.total : null,
        conflictServed: geo.functional_zones.some((z) => ['zone-28', 'zone-31'].includes(z.id)),
        zoneNames: geo.functional_zones.map((z) => z.name).filter((n) => n !== null && n !== undefined),
        zonesNamedCount: geo.functional_zones.filter((z) => z.name).length,
        envelopeHeight: geo.envelope ? geo.envelope.height : null,
        footprintVertices: geo.footprint_polygon ? geo.footprint_polygon.vertices.length : 0,
        gridLines: geo.grid ? geo.grid.x.length + geo.grid.z.length : 0,
        clearHeight: geo.envelope ? geo.envelope.clear_height_m : null,
      },
    };
  });
}

async function run() {
  if (!PASS && !DIRECT_URL) {
    console.error('FATAL: GRAFANA_ADMIN_PASSWORD (or GRAFANA_PASS) env var not set.');
    process.exit(1);
  }
  // Direct mode exists so a blocked credential does not leave every scene
  // assertion unrunnable. It proves nothing about access control, and says so
  // both here and in the final banner.
  if (DIRECT_URL) {
    console.log(`DIRECT MODE (${DIRECT_URL}) - scene checks only.`);
    console.log('Auth gate, 401 boundary and traversal checks are NOT exercised in this mode.');
  }

  const browser = await chromium.launch({ headless: true });

  // ── Unauthenticated boundary, before any login ──
  if (!DIRECT_URL) {
  console.log('Unauthenticated access:');
  {
    const anon = await browser.newContext();
    const page = await anon.newPage();
    for (const path of [
      '',
      'api/floor-geometry',
      'api/state',
      'api/diagnostics',
      'api/floor-schematic',
      'private-assets/floor1-geometry.json',
    ]) {
      const res = await page.goto(TWIN_URL + path, { waitUntil: 'domcontentloaded' }).catch(() => null);
      const status = res ? res.status() : 0;
      check(status === 401, `401 without a session: /${path || ''}`, `got ${status}`);
    }

    // Traversal variants. Plain, encoded, nested and route-relative. None may
    // return private content; reaching the auth gate is itself a rejection.
    for (const attack of [
      '../private/floor1-geometry.json',
      '..%2fprivate%2ffloor1-geometry.json',
      '%2e%2e/%2e%2e/private/floor1-zones.json',
      'vendor/three/../../private/floor1-geometry.json',
      'api/floor-geometry/../../private/floor1-geometry.json',
      'private/floor1-geometry.json',
    ]) {
      const res = await page.goto(TWIN_URL + attack, { waitUntil: 'domcontentloaded' }).catch(() => null);
      const status = res ? res.status() : 0;
      const body = res ? await page.content().catch(() => '') : '';
      // Status alone is NOT the security property. A browser normalises a
      // leading ../ before sending, so the request leaves the twin's path
      // entirely and lands on Grafana, which 302s to its login page -- a 200
      // login page is a rejection, not a leak. What must hold is that no
      // private content comes back, whatever the status.
      const leaked = /footprint_polygon|slot_id|schema_version|"columns"|"envelope"/.test(body);
      check(!leaked, `traversal returns no private content: ${attack}`, `status ${status}${leaked ? ' LEAKED' : ''}`);
    }

    // An error response must never carry a stack trace or a filesystem path.
    const errRes = await page.goto(`${TWIN_URL}api/floor-geometry`, { waitUntil: 'domcontentloaded' }).catch(() => null);
    const errBody = errRes ? await page.content().catch(() => '') : '';
    check(!/at .*\(.*:\d+:\d+\)/.test(errBody), 'no stack trace in an unauthenticated response');
    check(!/\/app\/|C:\\\\/.test(errBody), 'no filesystem path in an unauthenticated response');

    await anon.close();
  }
  }

  const context = await browser.newContext({ viewport: VIEWPORTS[0] });
  const page = await context.newPage();

  // Service response hygiene. Only meaningful in direct mode: through the proxy
  // the auth gate answers first, so these assertions would be testing nginx.
  // Express's defaults are wrong here in two specific ways, and both are
  // disclosure rather than availability problems -- the default 404 echoes the
  // requested path back into the body, and the default error handler emits a
  // stack trace unless NODE_ENV happens to be production.
  if (DIRECT_URL) {
    console.log('Service response hygiene:');
    await page.goto(PHYSICAL_TWIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const probe = 'private/floor1-zones.json';
    const res = await page.request.get(TWIN_URL + probe, { failOnStatusCode: false });
    const body = await res.text();
    check(res.status() === 404, 'a private path is not served', `got ${res.status()}`);
    check(!body.includes(probe), 'the 404 body does not echo the requested path back');
    check(!/floor1|private|\.json/i.test(body), 'the 404 body names no private file');
    check(!/at .*\(.*:\d+:\d+\)/.test(body), 'the 404 body carries no stack trace');
    check(!/\/app\/|[A-Za-z]:\\/.test(body), 'the 404 body carries no filesystem path');
    const headers = res.headers();
    check(!('x-powered-by' in headers), 'the service does not advertise its framework');

    // Response headers. Each asserts a disclosure property, not a style rule.
    const api = await page.request.get(TWIN_URL + 'api/floor-geometry', { failOnStatusCode: false });
    const apiHeaders = api.headers();
    check(
      (apiHeaders['cache-control'] || '').includes('no-store'),
      'geometry is marked no-store so private-derived data is not cached',
      apiHeaders['cache-control'] || 'absent'
    );
    check(apiHeaders['x-content-type-options'] === 'nosniff', 'content type is not sniffable');
    check(apiHeaders['referrer-policy'] === 'no-referrer', 'no referrer is sent onward');
    check(apiHeaders['x-frame-options'] === 'DENY', 'the twin refuses to be framed');
    check(
      (apiHeaders['content-security-policy'] || '').includes("frame-ancestors 'none'"),
      'frame-ancestors is none'
    );
    check(
      (apiHeaders['content-type'] || '').startsWith('application/json'),
      'geometry is served as JSON, not as something a browser may execute'
    );
    check(!('access-control-allow-origin' in apiHeaders), 'no cross-origin access is granted');

    // The synthetic placement route is deleted, so it must 404 like any other
    // path that does not exist. Asserted rather than assumed: a route that
    // still answered would mean invented positions were still being served,
    // whether or not this client drew them.
    for (const probe of ['server.js', 'lib/wire.js', 'package.json', '.env', 'app.js.map', 'api/debug', 'api/placement']) {
      const r = await page.request.get(TWIN_URL + probe, { failOnStatusCode: false });
      check(r.status() === 404, `not served: /${probe}`, `got ${r.status()}`);
    }

    // The floor registry. A floor id is a client-supplied string used to build
    // a filesystem path, so it is probed here the way any other path parameter
    // would be. The property asserted is that a floor the server did not
    // discover cannot be addressed at all -- not that a particular hostile
    // string is rejected, which would only prove that one string was thought of.
    const cat = await page.request.get(TWIN_URL + 'api/floors', { failOnStatusCode: false });
    const catalogue = cat.status() === 200 ? await cat.json() : null;
    check(cat.status() === 200, 'the floor catalogue is served', `got ${cat.status()}`);
    check(catalogue !== null && Array.isArray(catalogue.floors),
      'the catalogue is a list of floors');
    const deployed = catalogue && Array.isArray(catalogue.floors) ? catalogue.floors : [];
    check(deployed.length >= 1, 'at least one floor is deployed', `${deployed.length}`);
    check(deployed.every((f) => /^floor[1-5]$/.test(f.id)),
      'every catalogue id is a floor id and nothing else');
    check(deployed.every((f) => f.label === `Floor ${f.ordinal}`),
      'every label is computed from the ordinal, not read from a document');
    check(deployed.every((f) => Object.keys(f).sort().join(',') === 'has_zones,id,label,ordinal'),
      'the catalogue carries no field beyond id, ordinal, label and has_zones');
    check(typeof (catalogue && catalogue.default) === 'string',
      'the catalogue names a default floor');

    const deployedIds = new Set(deployed.map((f) => f.id));
    const undeployed = ['floor1', 'floor2', 'floor3', 'floor4', 'floor5']
      .filter((id) => !deployedIds.has(id));
    for (const id of undeployed) {
      const r = await page.request.get(`${TWIN_URL}api/floor-geometry?floor=${id}`,
        { failOnStatusCode: false });
      const b = await r.text();
      check(r.status() === 404, `an undeployed floor is 404, not an empty floor: ${id}`,
        `got ${r.status()}`);
      check(!b.includes(id), `the ${id} refusal does not echo the requested id back`);
    }
    for (const hostile of [
      '..%2F..%2Fetc%2Fpasswd', 'floor1%2F..%2Ffloor1', '.%2Ffloor1', 'FLOOR1',
      'floor1%00', '__proto__', 'constructor', 'floor1%0A', 'floor6', 'floor0',
    ]) {
      const r = await page.request.get(`${TWIN_URL}api/floor-geometry?floor=${hostile}`,
        { failOnStatusCode: false });
      const b = await r.text();
      check(r.status() === 404, `a floor id that is not in the catalogue is refused: ${hostile}`,
        `got ${r.status()}`);
      check(b === '{"error":"not found"}',
        `the refusal body is the fixed one, with no echo: ${hostile}`, b.slice(0, 80));
    }
    // Omitting the parameter must still mean what it meant before floors
    // existed, or every client that predates the selector silently breaks.
    const noParam = await page.request.get(TWIN_URL + 'api/floor-geometry',
      { failOnStatusCode: false });
    const named = await page.request.get(
      `${TWIN_URL}api/floor-geometry?floor=${catalogue.default}`, { failOnStatusCode: false });
    check(noParam.status() === 200 && named.status() === 200,
      'the default floor answers with and without the parameter');
    check(await noParam.text() === await named.text(),
      'no parameter and the default floor return byte-identical geometry');

    // Every string the geometry route serves must be a safe token. Free text --
    // a note, a process name, a path -- cannot satisfy this, which is the
    // property being asserted rather than the absence of any particular word.
    //
    // ONE field is deliberately prose-shaped and therefore exempt from the
    // token rule: a functional zone's `name`, which is the drawing's own area
    // label. It is not unchecked -- it is held to lib/wire.js's ZONE_NAME
    // instead, which is the stricter guard of the two in every way that
    // matters: uppercase only, no dots, no slashes, no colons, 32 characters.
    // A path, a sentence of provenance or an author's note all contain
    // lowercase and so cannot pass it. The exemption is keyed to the field
    // path, so prose appearing anywhere else still fails.
    const strings = await page.evaluate(async () => {
      const geo = await (await fetch('api/floor-geometry')).json();
      const out = [];
      (function walk(o, path) {
        if (o === null || o === undefined) return;
        if (typeof o === 'string') { out.push({ path, value: o }); return; }
        if (Array.isArray(o)) { o.forEach((v) => walk(v, `${path}[]`)); return; }
        if (typeof o === 'object') {
          for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
        }
      })(geo, '$');
      return out;
    });
    const ZONE_NAME_FIELD = '$.functional_zones[].name';
    const nonToken = strings.filter(
      (s) => s.path !== ZONE_NAME_FIELD
        && !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(s.value));
    check(nonToken.length === 0, 'every served geometry string is a safe token', `${nonToken.length} free-text value(s)`);

    // The exempt field carries its own, stricter assertion rather than being
    // waved through: if a name ever stops matching ZONE_NAME, that is a leak.
    const names = strings.filter((s) => s.path === ZONE_NAME_FIELD).map((s) => s.value);
    const badNames = names.filter((v) => !/^[A-Z0-9][A-Z0-9 \-]{0,31}$/.test(v));
    check(badNames.length === 0, 'every zone name matches the zone-name guard exactly',
      `${badNames.length} of ${names.length} name(s) failed`);
    check(!names.some((v) => /[/\.:]/.test(v)),
      'no zone name can carry a path, a dot or a colon');

    // -- The raw CAD reference ------------------------------------------
    //
    // This route serves the drawing's own line-work, which makes it the most
    // disclosure-sensitive geometry endpoint on the service: the private
    // document behind it carries the drawing's real layer names, and those
    // name processes and vendors. What is asserted here is that none of that
    // survives the projection -- three keys per role, a role id drawn from a
    // fixed set, and nothing anywhere in the body that is not a number or one
    // of those ids.
    const rawRes = await page.request.get(`${TWIN_URL}api/floor-raw-cad`, { failOnStatusCode: false });
    const raw = rawRes.ok() ? await rawRes.json() : null;
    check(rawRes.status() === 200, 'the raw CAD reference answers', `got ${rawRes.status()}`);
    if (raw && raw.available) {
      const ROLES = new Set(['structure', 'structure-sections', 'columns', 'column-caps', 'walls-interior',
        'walls-cleanroom', 'walls-movable', 'partitions', 'doors', 'windows',
        'openings-airshower', 'area-boundaries', 'area-annotation']);
      const badKeys = [];
      const badIds = [];
      let badNumbers = 0;
      let declaredMismatch = 0;
      for (const role of raw.roles || []) {
        for (const k of Object.keys(role)) {
          if (k !== 'id' && k !== 'segment_count' && k !== 'segments') badKeys.push(`${role.id}.${k}`);
        }
        if (!ROLES.has(role.id)) badIds.push(String(role.id));
        if (!Array.isArray(role.segments) || role.segments.length % 4 !== 0) declaredMismatch++;
        else if (role.segment_count !== role.segments.length / 4) declaredMismatch++;
        for (const v of role.segments || []) {
          if (typeof v !== 'number' || !Number.isFinite(v)) { badNumbers++; break; }
        }
      }
      check(badKeys.length === 0, 'a raw CAD role carries only id, count and segments',
        badKeys.join(' | '));
      check(badIds.length === 0, 'every raw CAD role id is one of the fixed roles',
        badIds.join(' | '));
      check(badNumbers === 0, 'every raw CAD coordinate is a finite number',
        `${badNumbers} role(s) carried a non-number`);
      check(declaredMismatch === 0,
        'every raw CAD role declares the segment count it actually carries',
        `${declaredMismatch} mismatch(es)`);
      // The drawing's layer names are the specific thing that must not travel.
      // Searching the serialised body for a lowercase word is a blunt check and
      // that is the point: the projection emits no strings but role ids, so
      // anything word-shaped that is not a role id is a leak.
      const body = JSON.stringify(raw);
      const words = (body.match(/"[^"]*[a-z][^"]*"/g) || [])
        .map((s) => s.slice(1, -1))
        .filter((s) => !ROLES.has(s) && ![
          'floor1', 'floor2', 'floor3', 'floor4', 'floor5',
          'CAD_MM_Y_UP_FLOOR_LOCAL', 'floor', 'available', 'coordinate_system',
          'envelope_mm', 'width', 'depth', 'roles', 'id', 'segment_count',
          'segments', 'coverage', 'entities_carried', 'entities_excluded_by_layer',
          'excluded_layer_count', 'block_references_not_expanded',
        ].includes(s));
      check(words.length === 0,
        'the raw CAD response carries no free text, so no drawing layer name can leak',
        words.slice(0, 5).join(' | '));
      check(raw.coordinate_system === 'CAD_MM_Y_UP_FLOOR_LOCAL',
        "the raw reference declares the drawing's frame, not the model's",
        String(raw.coordinate_system));
      check(raw.coverage && raw.coverage.entities_excluded_by_layer > 0,
        'the reference reports what it leaves out rather than implying it is complete',
        `${raw.coverage ? raw.coverage.entities_excluded_by_layer : 'no coverage'} excluded`);
    } else {
      console.log('  SKIP  raw CAD reference checks (no reference document deployed)');
    }

    // An undeployed floor must 404 here for the same reason it does on the
    // geometry route: an empty reference would say the floor exists.
    for (const bad of ['floor9', '../floor1', 'floor1%00', '__proto__']) {
      const res = await page.request.get(
        `${TWIN_URL}api/floor-raw-cad?floor=${encodeURIComponent(bad)}`,
        { failOnStatusCode: false });
      check(res.status() === 404, `the raw CAD reference refuses a bad floor id: ${bad}`,
        `got ${res.status()}`);
    }
  }


  if (!DIRECT_URL) {
  console.log(`\nLogging in to ${BASE_URL} as ${USER}...`);
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="user"]', USER);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  // Same hard auth gate the dashboard suites use: /login answers 200, so a
  // failed login would otherwise sail through every check below.
  if (page.url().includes('/login') || (await page.locator('input[name="password"]').count()) > 0) {
    // Distinguish "this environment has no usable credential" from "the twin
    // regressed". Both are non-zero -- neither is ever reported as PASS -- but
    // conflating them makes a red CI run say nothing about the twin. Exit 78
    // (EX_CONFIG) marks a configuration precondition, not a product failure.
    console.error('');
    console.error('AUTH_REGRESSION_BLOCKED_EXTERNAL_CREDENTIAL');
    console.error(`  Grafana rejected the configured credential for user "${USER}" at ${BASE_URL}.`);
    console.error('  The authenticated half of this suite did not run and is NOT reported as passing.');
    console.error('  This is a credential/environment precondition, not a factory-twin defect:');
    console.error('  GF_SECURITY_ADMIN_PASSWORD seeds the admin password only at first');
    console.error('  initialisation of the Grafana database, so a password changed inside');
    console.error('  Grafana afterwards no longer matches the environment value.');
    console.error('  Resolve by supplying the current credential. Do NOT disable authentication,');
    console.error('  relax the proxy gate, or hardcode a replacement to make this run green.');
    console.error('  The unauthenticated boundary checks above DID run and their result stands.');
    console.error('  Scene assertions can be executed separately with TWIN_DIRECT_URL, which');
    console.error('  proves nothing about access control and says so in its own banner.');
    await browser.close();
    process.exit(78);
  }
  }
  if (!DIRECT_URL) console.log('Login verified.\n');

  let baseline = null;
  // FT-07B: the full evidence population read back on the very first
  // viewport, so every later viewport is checked for API completeness
  // against what THIS run actually served -- never against a hardcoded
  // census that would go stale the next time evidence is added.
  let rawEquipmentTotalBaseline = null;

  for (const vp of VIEWPORTS) {
    console.log(`Viewport ${vp.name}:`);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    const errors = [];
    const failed = [];
    const onConsole = (m) => {
      if (m.type() === 'error') errors.push(m.text());
    };
    const onFailed = (r) => failed.push(r.url());
    page.on('console', onConsole);
    page.on('requestfailed', onFailed);

    await page.goto(PHYSICAL_TWIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
    // Wait for the scene, not for machines. A deployment with no monitored
    // devices is a valid deployment -- CI runs against a database that has
    // none -- and waiting on a device that will never arrive would turn an
    // empty fleet into a timeout instead of a reported zero.
    await page.waitForFunction(() => window.__twin !== undefined, { timeout: 30000 });
    await page.waitForTimeout(2500);

    const s = await snapshot(page);

    // Scene composition is checked against what the API served, so adding
    // evidence later does not require editing this test.
    //
    // Structural meshes are the columns plus exactly ONE floor plate. Which
    // plate depends on the evidence: with a traced polygon it is the measured
    // slab and the synthetic-extent plate is retired, because two plates would
    // be two answers to "where is the building" and the synthetic one is the
    // wrong answer. Without geometry the synthetic plate is the only spatial
    // reference there is and stays. Either way the count is columns + 1.
    const measuredPlate = s.footprintMeshes > 0;
    const syntheticPlate = 0; // the synthetic floor plate is deleted
    // Plus the CAD building fabric: one instanced mesh for every wall, and one
    // per opening kind. These are added as objects, not per wall, which is the
    // whole point of instancing them -- ~900 walls must not cost ~900 meshes.
    const expectedStructural = s.api.columns
      + (measuredPlate ? s.footprintMeshes : syntheticPlate)
      + s.wallMeshes + s.openingMeshes;
    // The equipment layer is INSTANCED: a handful of batches carry every
    // machine, so the count that means anything is the number of INSTANCES,
    // checked separately below. What the mesh count must still show is that
    // nothing else has crept into the operational layer -- no monitored
    // device, no invented machine form, no raster slot.
    const expectedOperational = s.equipmentBatchCount;
    check(s.perLayer.structural === expectedStructural,
      'structural meshes = columns + floor plate + traced outline',
      `${s.perLayer.structural} vs ${expectedStructural}`);
    check(s.perLayer.functional === s.api.zones, 'functional meshes = zones served',
      `${s.perLayer.functional} vs ${s.api.zones}`);
    check(s.perSublayer.columns === s.api.columns, 'column sub-layer holds exactly the served columns',
      `${s.perSublayer.columns} vs ${s.api.columns}`);
    check(s.perSublayer.walls === s.wallMeshes + s.openingMeshes,
      'wall sub-layer holds exactly the wall and opening meshes',
      `${s.perSublayer.walls} vs ${s.wallMeshes + s.openingMeshes}`);
    // Instancing is the claim, so assert it: hundreds of walls, a handful of
    // objects. If a refactor ever drops back to one mesh per wall this fails
    // rather than quietly costing ~900 draw calls.
    check(s.api.walls === 0 || s.wallMeshes <= 2,
      'walls are instanced, not one mesh each',
      `${s.wallMeshes} mesh(es) for ${s.api.walls} walls`);
    // ANGLED WALLS REACH THE RENDERER. The drawing contains 70 m of wall that
    // is not axis-aligned, and for a long time the model contained none of it:
    // the extraction bucketed faces into horizontal and vertical by an absolute
    // 1 mm test, so anything canted was discarded. Serving them is only half
    // the fix -- an instanced box that is never rotated would draw them
    // axis-aligned anyway -- so what is asserted here is the rotation actually
    // applied to the instances, read back out of the instance matrices.
    const angledInstances = await page.evaluate(async () => {
      const out = { fromApi: 0, rotated: 0 };
      const geo = await (await fetch('api/floor-geometry')).json();
      // A DIRECTION test, not a displacement one. Comparing raw dx and dz in
      // metres calls a 30 m wall that drifts 4 mm "angled" while calling a
      // 0.5 m wall at 20 degrees straight, and then the two halves of this
      // check are measuring different things.
      for (const w of geo.walls || []) {
        const dx = w.x2 - w.x1;
        const dz = w.z2 - w.z1;
        const len = Math.hypot(dx, dz);
        if (len === 0) continue;
        if (Math.abs(dx / len) > 0.002 && Math.abs(dz / len) > 0.002) out.fromApi++;
      }
      for (const mesh of window.__twin.wallMeshes) {
        // The instance matrix is column-major, sixteen floats per instance. Its
        // first column is the box's local x axis after the transform, which is
        // the wall's own direction; a wall that was never turned has that axis
        // lying exactly on x or on z.
        const a = mesh.instanceMatrix.array;
        for (let i = 0; i < mesh.count; i++) {
          const ax = a[i * 16 + 0];
          const az = a[i * 16 + 2];
          const len = Math.hypot(ax, az);
          if (len === 0) continue;
          if (Math.abs(ax / len) > 0.002 && Math.abs(az / len) > 0.002) out.rotated++;
        }
      }
      return out;
    });
    check(angledInstances.fromApi === 0 || angledInstances.rotated >= angledInstances.fromApi,
      'every angled wall the API serves is drawn turned, not squared up',
      `${angledInstances.rotated} rotated instances for ${angledInstances.fromApi} angled walls`);
    check(s.perSublayer.equipment === s.equipmentBatchCount,
      'the equipment sub-layer holds only the instanced batches',
      `${s.perSublayer.equipment} object(s) for ${s.api.equipment} assets`);
    check(s.equipmentMeshes === s.api.equipment,
      'every served CAD asset is drawn as exactly one instance',
      `${s.equipmentMeshes} instance(s) vs ${s.api.equipment} served`);
    // FT-07B: API completeness is a SEPARATE claim from render count, and
    // must never be derived from it -- a display mode legitimately renders
    // fewer assets than the API reports without the API becoming
    // incomplete. Checked against this run's own first reading, not a
    // hardcoded number, for the same reason the file never hardcodes a
    // census (see the header comment).
    if (rawEquipmentTotalBaseline === null) rawEquipmentTotalBaseline = s.api.rawEquipmentTotal;
    check(s.api.rawEquipmentTotal > 0,
      'the API exposes the full evidence population, independent of display mode',
      `${s.api.rawEquipmentTotal} raw record(s), mode=${s.api.displayMode}`);
    check(s.api.equipment <= s.api.rawEquipmentTotal,
      'the display-filtered set is never larger than the full evidence population',
      `${s.api.equipment} displayed vs ${s.api.rawEquipmentTotal} total`);
    check(s.api.rawEquipmentTotal === rawEquipmentTotalBaseline,
      'switching viewport (a presentation concern) never changes what the API serves',
      `${s.api.rawEquipmentTotal} vs ${rawEquipmentTotalBaseline} first seen`);
    check(s.perLayer.operational === expectedOperational,
      'operational meshes = CAD equipment, and nothing else',
      `${s.perLayer.operational} vs ${expectedOperational}`);
    check(s.meshes === expectedStructural + s.api.zones + expectedOperational, 'total mesh count reconciles',
      `${s.meshes}`);

    check(s.badTransforms === 0, 'no NaN/Infinity transforms', `${s.badTransforms} bad`);
    // The synthetic placement path is DELETED, not disabled. These two assert
    // that: no machine mesh exists, and the registry that held them is gone.
    // A non-zero count here would mean invented positions were being drawn on
    // a floor read from CAD, which is the failure this whole change prevents.
    check(s.machineMeshes === 0, 'no monitored device is drawn on the floor',
      `${s.machineMeshes} machine mesh(es)`);
    check(s.hasMachineRegistry === false, 'the machine-mesh registry is gone, not merely empty');
    // The raster layer, deleted at three levels: the API no longer serves it,
    // the renderer no longer has a group for it, and the invented machine
    // forms that were drawn on top of it are gone with it. Each is asserted
    // separately, because any one of them coming back alone is a regression.
    check(s.api.slotsServed === false,
      'the raster slot layer is not served by the API at all');
    check(s.hasPresentationRegistry === false,
      'the invented machine-form layer is deleted, not merely hidden');
    check(s.equipmentMeshes === s.api.equipment,
      'every served CAD asset is drawn exactly once',
      `${s.equipmentMeshes} drawn vs ${s.api.equipment} served`);
    // The core evidence rule of this layer, checked on the wire rather than in
    // the extractor: an unresolved extent must be ABSENT, never a default box.
    check(s.api.equipmentWithFootprintButUnresolved === 0,
      'no UNRESOLVED extent carries a footprint anyway',
      `${s.api.equipmentWithFootprintButUnresolved} record(s)`);
    check(s.api.equipmentNonCadPosition === 0,
      'every equipment position claims MEASURED_CAD provenance',
      `${s.api.equipmentNonCadPosition} record(s) do not`);
    check(s.api.rawEquipmentTotal === 0 || s.api.rawEquipmentUnresolved > 0,
      'the full evidence population still reports unresolved extents rather than filling them all in',
      `${s.api.rawEquipmentResolved} measured, ${s.api.rawEquipmentApproximated} approximated, `
      + `${s.api.rawEquipmentUnresolved} UNRESOLVED (raw, ${s.api.rawEquipmentTotal} total)`);
    check(!s.api.conflictServed, 'conflicting zones withheld from the wire');

    // ── Building outline: the floor must read as THIS building ──
    // The envelope is only a bounding box, and a box is the same box for every
    // rectangular-ish building. The traced outline is what distinguishes them.
    if (!s.api.footprintVertices) {
      skip('the traced building outline is drawn', NO_GEOMETRY);
      skip('the surveyed structural grid replaces the orientation helper', NO_GEOMETRY);
    } else {
      check(s.api.footprintVertices >= 3, 'the served outline is a polygon',
        `${s.api.footprintVertices} vertices`);
      check(s.footprintMeshes === 1, 'the traced building outline is drawn',
        `${s.footprintMeshes} slab(s)`);
      check(s.structuralGrid === s.api.gridLines,
        'the surveyed structural grid replaces the orientation helper',
        `${s.structuralGrid} drawn vs ${s.api.gridLines} served`);
      check(!s.orientationGridPresent, 'the decorative orientation grid is retired once the surveyed grid arrives');
    }
    // Only meaningful where zones exist. With none served there is nothing
    // being withheld and nothing being over-served -- that is not a pass.
    if (!s.api.zonesTotal) skip('unvalidated zones withheld', NO_GEOMETRY);
    else check(s.api.zones < s.api.zonesTotal,
      'unvalidated zones withheld', `${s.api.zones} of ${s.api.zonesTotal}`);
    check(s.api.clearHeight === null, 'clear height still unmeasured (null, not estimated)');
    check(s.resources.materials < s.meshes / 10, 'materials shared, not per-mesh',
      `${s.resources.materials} materials for ${s.meshes} meshes`);
    check(s.resources.geometries < s.meshes, 'geometries shared',
      `${s.resources.geometries} geometries for ${s.meshes} meshes`);
    check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));
    check(failed.length === 0, 'no failed requests', failed.slice(0, 2).join(' | '));

    // -- Command-centre surface: chrome docks, the floor is never covered --
    //
    // The previous chrome was an opaque panel floating over the canvas. At
    // 1366x768 it covered roughly a third of the floor plan, and the camera fit
    // had to be computed around it. The rule now is stronger and testable: the
    // only element allowed to overlap the scene is the context panel, and only
    // once something is selected.
    // Reachability is measured in two passes with a real click between them,
    // because the drawer opens through a CSS grid transition: toggling the
    // class and measuring in the same frame reads every drawer control as zero
    // wide, which is the transition, not a layout fault.
    const REACH_FN = `(list) => {
      const bad = [];
      for (const sel of list) {
        const el = document.querySelector(sel);
        if (!el) { bad.push(sel + ' (missing)'); continue; }
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        const offscreen = r.width === 0 || r.height === 0
          || r.bottom > window.innerHeight + 1 || r.right > window.innerWidth + 1
          || r.top < -1 || r.left < -1;
        if (offscreen) {
          bad.push(sel + ' (' + Math.round(r.left) + ',' + Math.round(r.top) + ' '
            + Math.round(r.width) + 'x' + Math.round(r.height) + ')');
          continue;
        }
        // ON SCREEN IS NOT REACHABLE. A control can be laid out perfectly and
        // still be untouchable because something is painted over it, and that
        // is not a hypothetical: the WebGL canvas kept a full-window drawing
        // buffer when the drawer took its grid track, overflowed by the
        // drawer's width and covered every control in it. Geometry alone
        // reported all of them fine. Hit-testing the centre point is what an
        // actual pointer does, so it is what is asserted.
        const at = document.elementFromPoint(
          Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        if (!at || !(el === at || el.contains(at) || at.contains(el))) {
          bad.push(sel + ' (covered by ' + (at ? at.tagName.toLowerCase() : 'nothing') + ')');
        }
      }
      return bad;
    }`;

    const headerUnreachable = await page.evaluate(`(${REACH_FN})([
      '#topbar', '#status-strip',
      '#view-controls button[data-view="plan"]',
      '#view-controls button[data-view="overview"]',
      '#view-controls button[data-view="building"]',
      '#view-reset', '#drawer-toggle', '#build-id', '#data-quality'
    ])`);

    // Drive the drawer to a KNOWN state rather than assuming one. The viewport
    // loop reuses a single page, so a previous iteration that ended with the
    // drawer open turns this section's "open it" click into a "close it" click
    // -- which is how a working drawer got reported as a zero-width column at
    // whichever viewport happened to run second.
    const setDrawer = async (want) => {
      for (let i = 0; i < 3; i++) {
        const open = await page.evaluate(
          () => document.getElementById('drawer-toggle').getAttribute('aria-expanded') === 'true'
        );
        if (open === want) return;
        await page.click('#drawer-toggle');
        await page.waitForTimeout(250);
      }
    };
    await setDrawer(false);

    const stageClosed = await page.evaluate(
      () => document.getElementById('stage').getBoundingClientRect().width
    );

    await setDrawer(true);
    // Wait for the grid transition to finish rather than for a fixed delay. At
    // 3840x2160 the relayout takes longer than it does at 1366x768, and a
    // timeout tuned on the small viewport measured a drawer that was still
    // zero pixels wide -- a test-timing artefact reported as a layout fault.
    await page.waitForFunction(
      () => document.getElementById('drawer').getBoundingClientRect().width > 1,
      null,
      { timeout: 10000 },
    );
    await page.waitForTimeout(150);
    const drawerUnreachable = await page.evaluate(`(() => {
      const legend = document.getElementById('evidence-legend');
      const diag = document.getElementById('diagnostics');
      const unmapped = document.getElementById('unmapped-devices');
      const prior = [legend.open, diag.open, unmapped.open];
      legend.open = true; diag.open = true; unmapped.open = true;
      const bad = (${REACH_FN})([
        '#factory-status',
        '#layer-controls input[data-layer="shell"]',
        '#layer-controls input[data-layer="equipment"]',
        '#status-legend-body', '#evidence-summary',
        '#evidence-legend > summary', '#unmapped-devices > summary',
        '#diagnostics > summary'
      ]);
      legend.open = prior[0]; diag.open = prior[1]; unmapped.open = prior[2];
      return bad;
    })()`);
    const docked = await page.evaluate(() => {
      const stage = document.getElementById('stage').getBoundingClientRect();
      const drawer = document.getElementById('drawer').getBoundingClientRect();
      return {
        stageWidth: stage.width,
        overlaps: drawer.left < stage.right - 1 && drawer.right > stage.left + 1
          && drawer.top < stage.bottom - 1 && drawer.bottom > stage.top + 1,
        viewportWidth: window.innerWidth,
      };
    });
    await setDrawer(false);

    const surface = await page.evaluate(() => {
      // Nothing but the context panel may sit over the scene, and it starts
      // hidden. Measured by hit-testing the middle of the canvas.
      const scene = document.getElementById('scene').getBoundingClientRect();
      const atCentre = document.elementFromPoint(
        Math.round(scene.left + scene.width / 2),
        Math.round(scene.top + scene.height / 2)
      );
      const canvas = document.querySelector('canvas');
      return {
        inspectorHidden: document.getElementById('inspector').hidden,
        centreIsCanvas: Boolean(atCentre && atCentre.tagName === 'CANVAS'),
        horizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
        canvasLabelled: Boolean(canvas && canvas.getAttribute('aria-label')),
        // The chrome the rebuild removed. Any of these coming back means the
        // floating-HUD treatment has returned.
        legacyChrome: ['#hud', '#simulated-banner', '#mode-controls', '#schematic-panel',
          '#schematic', '.split-caption']
          .filter((sel) => document.querySelector(sel) !== null),
        legendRows: [...document.querySelectorAll('#evidence-legend dt')].map((dt) => ({
          text: dt.textContent.trim(),
          glyph: Boolean(dt.querySelector('.ev[aria-hidden="true"]')),
        })),
      };
    });
    surface.unreachable = headerUnreachable;
    surface.drawerUnreachable = drawerUnreachable;
    // Below 900 CSS pixels the drawer deliberately overlays instead of docking:
    // a 340 px track on a 600 px viewport would leave the floor unreadable, so
    // the narrow layout trades docking for a usable plan. The invariant that
    // holds at every width is the one asserted -- the floor pane never grows to
    // make room, and the drawer is dismissible.
    surface.overlapsStage = docked.viewportWidth > 900 ? docked.overlaps : false;
    surface.stageNeverGrew = docked.stageWidth <= stageClosed + 1;

    check(surface.unreachable.length === 0, 'every header control is reachable',
      surface.unreachable.join(' | '));
    check(surface.drawerUnreachable.length === 0,
      'every inspection-drawer control is reachable with the drawer open',
      surface.drawerUnreachable.join(' | '));
    check(!surface.overlapsStage,
      'the inspection drawer docks beside the floor rather than over it');
    check(surface.stageNeverGrew,
      'opening the drawer never widens the floor pane');
    check(surface.inspectorHidden,
      'the context panel stays hidden until something is selected');
    check(surface.centreIsCanvas,
      'the centre of the floor plan is the floor plan, not a panel');
    check(surface.legacyChrome.length === 0,
      'the floating HUD, banner, mode board and split panes are gone',
      surface.legacyChrome.join(' '));
    check(!surface.horizontalScroll, 'the page never scrolls horizontally');
    check(surface.canvasLabelled, 'the 3D canvas carries an accessible name');
    check(
      surface.legendRows.length === 6 && surface.legendRows.every((r) => r.glyph && /[A-Z]{6,}/.test(r.text)),
      'every evidence state is named in words and carries a non-colour glyph',
      `${surface.legendRows.length} rows`
    );

    // -- Status strip: exactly the eight plant states ---------------------
    //
    // The vocabulary is the point. An operator reading this board and an
    // operator reading the line's own HMI must see the same word for the same
    // machine, so the eight are asserted by name and in order, and the
    // monitoring dialect the twin used to invent is asserted absent.
    const strip = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#status-strip .ss-cell')];
      return {
        states: cells.filter((c) => !c.classList.contains('ss-quality'))
          .map((c) => c.dataset.state),
        labels: cells.map((c) => c.querySelector('.ss-label').textContent.trim()),
        values: cells.map((c) => c.querySelector('.ss-value').textContent.trim()),
        unbacked: cells.filter((c) => c.classList.contains('ss-off'))
          .map((c) => c.dataset.state),
        glyphsHidden: cells.every(
          (c) => c.querySelector('.ss-glyph').getAttribute('aria-hidden') === 'true'
        ),
        distinctGlyphs: new Set(
          cells.map((c) => c.querySelector('.ss-glyph').textContent)
        ).size,
        cellCount: cells.length,
        qualityCells: cells.filter((c) => c.classList.contains('ss-quality'))
          .map((c) => c.dataset.state),
        text: document.getElementById('status-strip').textContent,
        legendStates: [...document.querySelectorAll('#status-legend-body dt')]
          .map((dt) => dt.textContent.trim()),
      };
    });
    const REQUIRED_STATES = ['OFF', 'DOWN', 'IDLE', 'INITIAL', 'PM', 'STOP', 'RUN', 'UNDEFINED'];
    check(JSON.stringify(strip.states) === JSON.stringify(REQUIRED_STATES),
      'the status strip carries exactly the eight plant states, in order',
      strip.states.join(','));
    check(JSON.stringify(strip.qualityCells) === JSON.stringify(['UNMAPPED']),
      'unmapped is shown as a data-quality indicator, not as a ninth state',
      strip.qualityCells.join(','));
    check(!/NORMAL|WARNING|CRITICAL|OFFLINE|STALE|MAINTENANCE|PRESENTATION/i.test(strip.text),
      'no invented monitoring state appears on the board', strip.text.replace(/\s+/g, ' ').slice(0, 90));
    check(JSON.stringify(strip.unbacked) === JSON.stringify(['OFF', 'INITIAL', 'PM', 'STOP']),
      'exactly the four states with no source column are marked as such',
      strip.unbacked.join(','));
    // A state this deployment cannot derive shows a dash, never a zero. A zero
    // is a measurement; a dash is the absence of one.
    check(strip.states.every((st, i) => (
      ['OFF', 'INITIAL', 'PM', 'STOP'].includes(st) ? strip.values[i] === '–' : /^\d+$/.test(strip.values[i])
    )), 'an underivable state reports a dash, a derivable one reports a count',
    strip.values.join(','));
    check(strip.distinctGlyphs === strip.cellCount,
      'every state is distinguishable without colour', `${strip.distinctGlyphs} glyphs for ${strip.cellCount} cells`);
    check(strip.glyphsHidden, 'status glyphs are decorative to a screen reader; the label carries the meaning');
    check(strip.legendStates.length === 9,
      'the drawer legend explains all eight states plus the data-quality indicator',
      `${strip.legendStates.length} rows`);

    // -- Equipment reconciliation: the scene against the served model -----
    //
    // The complaint was that machines were the wrong size and on the wrong
    // side. Both were invisible from inside the model, so this compares what
    // the renderer actually drew against what the API served, per record.
    if (s.api.equipment === 0) {
      skip('every drawn asset carries the rotation the CAD stated', NO_GEOMETRY);
      skip('no drawn asset invents an extent', NO_GEOMETRY);
      skip('the 3D box is the 2D footprint extruded, at the same coordinates', NO_GEOMETRY);
    } else {
      const served = new Map(s.api.equipmentPositions.map((e) => [e.id, e]));

      // ROTATION. The canonical frame reflects z, and a reflection flips the
      // sense of a plan rotation, so the renderer applies the CAD angle about
      // +Y with sign +1. Under the previous mirrored frame the sign was -1;
      // getting the position right and the sign wrong puts every machine in
      // the correct place facing the wrong way, which no coordinate check
      // catches. This one does.
      let rotMismatch = 0;
      let worstRot = 0;
      let turnedBoxes = 0;
      for (const drawn of s.equipmentRotations) {
        const e = served.get(drawn.id);
        if (!e || e.deg == null) { rotMismatch++; continue; }
        turnedBoxes++;
        // The CAD rotation, plus the offset the record states between it and
        // the axis the machine's own block draws its body on. The offset is a
        // published number; it is not recomputed here.
        const op = s.api.operationalFootprints[drawn.id];
        const expected = (e.deg + (op ? op.offset : 0)) * Math.PI / 180;
        const d = Math.abs((drawn.y - expected) % (Math.PI * 2));
        const wrapped = Math.min(d, Math.PI * 2 - d);
        worstRot = Math.max(worstRot, wrapped);
        if (wrapped > 1e-9) rotMismatch++;
      }
      check(rotMismatch === 0, 'every drawn asset carries the rotation the CAD stated',
        `${turnedBoxes} boxes turned to the CAD angle, ${rotMismatch} mismatched, `
        + `worst ${(worstRot * 180 / Math.PI).toFixed(6)} deg`);

      // 2D -> 3D. There is exactly ONE mesh per asset and both views look at
      // it, so this measures that the mesh sits where the API said and is the
      // size the API said. A second, independently positioned 3D object is
      // precisely what this forbids.
      let worstPos = 0;
      let worstSize = 0;
      let offFloor = 0;
      let invented = 0;
      let sizedBoxes = 0;
      let markerBoxes = 0;
      let worstUpload = 0;
      const heights = new Set();
      // THE placement, in full precision, as the renderer computed it before
      // any buffer. This is where "nothing moved" has to be exact; the Float32
      // instance buffer below is checked separately and to its own precision.
      for (const inst of s.equipmentPlacements) {
        const e = served.get(inst.id);
        if (!e) { invented++; continue; }
        worstPos = Math.max(worstPos,
          Math.abs(inst.x - (e.x + e.ox)), Math.abs(inst.z - (e.z + e.oz)));
      }
      for (const box of s.equipmentBoxes) {
        const e = served.get(box.id);
        if (!e) { invented++; continue; }
        worstUpload = Math.max(worstUpload,
          Math.abs(box.x - (e.x + e.ox)), Math.abs(box.z - (e.z + e.oz)));
        // Every block stands ON the floor: its lowest drawn vertex is the floor
        // plane, not an arbitrary elevation.
        if (Math.abs(box.floorY) > FLOAT32_TOL_M) offFloor++;
        if (box.tier === 'MEASURED_CAD' || box.tier === 'OBSERVED_CAD'
          || box.tier === 'APPROXIMATION') {
          sizedBoxes++;
          // Rounded to the micrometre before comparing: a vertex read back out
          // of a Float32 buffer is not bit-identical to the number that went
          // in, and a micrometre is not a height difference.
          heights.add(Number(box.h.toFixed(6)));
        } else {
          markerBoxes++;
          // A marker must not carry a shape. A non-square one would mean a
          // dimension had been supplied from somewhere.
          if (box.w !== box.d) invented++;
        }
      }
      check(invented === 0, 'no drawn asset invents an extent',
        `${invented} asset(s) drawn with a shape they do not have`);
      check(worstPos === 0,
        'the 3D box is the 2D footprint extruded, at the same coordinates',
        `worst position delta ${worstPos} m across ${s.equipmentPlacements.length} placements`);
      // THE DELTA IS A MEASUREMENT, NOT A NUDGE. It exists only where the
      // record says its body axis is not its INSERT axis, it is bounded by the
      // machine's own size, and nothing else in the layer may carry one.
      let deltaWithoutAxis = 0;
      let deltaOverSize = 0;
      let worstDelta = 0;
      for (const e of s.api.equipmentPositions) {
        const mag = Math.hypot(e.ox, e.oz);
        worstDelta = Math.max(worstDelta, mag);
        if (mag > 1e-9 && Math.abs(e.axis) < 1e-9 && !e.enclosure) deltaWithoutAxis++;
        if (e.w !== null && e.d !== null && mag > Math.hypot(e.w, e.d) / 2) deltaOverSize++;
      }
      check(deltaWithoutAxis === 0 && deltaOverSize === 0,
        'the rectangle centre delta is a re-measurement, never a free move',
        `worst ${(worstDelta * 1000).toFixed(1)} mm, ${deltaWithoutAxis} with nothing re-measured, `
        + `${deltaOverSize} beyond the machine's own size`);
      check(worstUpload < FLOAT32_TOL_M,
        'the instance matrix uploaded is the placement, to Float32 precision',
        `worst ${worstUpload.toExponential(2)} m across ${s.equipmentBoxes.length} instances`);
      check(offFloor === 0, 'every equipment block stands on the floor plane',
        `${offFloor} floating`);
      // Height is PRESENTATION_ONLY, so it must be IDENTICAL everywhere. A
      // varying height would read as data, and there is no elevation data.
      check(heights.size <= 1,
        'every sized block shares one presentation height, because height is not evidence',
        `${heights.size} distinct height(s) across ${sizedBoxes} block(s)`);
      // A TRUE_POLYGON record has an extent too, and is drawn with one -- just
      // not a box instance, so it is excluded from the box tally by the same
      // count that put it here in the first place, not by its handle.
      check(sizedBoxes === s.api.equipmentResolved + s.api.equipmentApproximated
        - s.api.displayTruePolygon,
        'exactly the assets with an extent are drawn with one',
        `${sizedBoxes} vs ${s.api.equipmentResolved + s.api.equipmentApproximated} `
        + `(${s.api.displayTruePolygon} drawn as TRUE_POLYGON instead of a box)`);
      check(markerBoxes === s.api.equipmentUnresolved,
        'exactly the assets without an extent are drawn as markers',
        `${markerBoxes} vs ${s.api.equipmentUnresolved}`);

      // The DRAWN extent against the SERVED extent.
      let worstDrawnBox = 0;
      for (const box of s.equipmentBoxes) {
        const e = served.get(box.id);
        if (!e) continue;
        const op = s.api.operationalFootprints[box.id];
        if (!op) continue;
        worstDrawnBox = Math.max(worstDrawnBox,
          Math.abs(box.w - op.width), Math.abs(box.d - op.depth));
      }
      // An instance matrix is a Float32 buffer, so a size read back off the
      // GPU-bound array differs from the served metre in the seventh decimal.
      // The number that has to be exact is the one the renderer PLACED, which
      // is checked against the record on the instance list below.
      check(worstDrawnBox < FLOAT32_TOL_M,
        'every asset with an extent is drawn at exactly its operational size',
        `worst ${worstDrawnBox.toExponential(2)} m across ${sizedBoxes} boxes`);
      check(s.api.equipmentApproxWithoutSource === 0,
        'every approximated extent declares CAD_CORRELATED provenance',
        `${s.api.equipmentApproxWithoutSource} without it`);

      // -- THE OPERATIONAL RECTANGLE, AND THE PROOF THAT DRAWING IT MOVES
      //    NOTHING
      //
      // Every machine with a measured extent is drawn as one oriented
      // rectangle at its operational size. The risk is a symbol that quietly
      // moves, turns or resizes a machine, and instancing raises it: 270
      // matrices are composed in bulk and a wrong one looks like a right one.
      // So it is answered three ways:
      //
      //   STRUCTURALLY -- no display coordinates exist. A size and an offset
      //   reach the client; the position and the rotation are the physical
      //   record's own.
      //
      //   MEASURED -- the corners are recovered from the INSTANCE MATRIX the
      //   renderer uploaded and matched, both ways, against corners generated
      //   in Node by the one canonical helper from the served record.
      //
      //   BOUNDED -- an operational rectangle may be tighter than the physical
      //   extent, never larger, and a record that flags its body axis must not
      //   have been turned by it.
      check(s.api.displayClassMissing === 0,
        'every equipment record carries exactly one display class',
        `${s.api.displayClassMissing} without one; ${JSON.stringify(s.api.displayShapes)}`);
      check(s.api.displayGeometryOnWire === 0,
        'the display layer owns no coordinates: none are served',
        `${s.api.displayGeometryOnWire} record(s) carry display geometry on the wire`);
      check(s.api.displayOnUnresolved === 0,
        'an unresolved footprint acquires no rectangle',
        `${s.api.displayOnUnresolved} unresolved record(s) claim one`);
      check(s.api.displayAreaErrorMin >= 0,
        'a rectangle never cuts inside the geometry it is drawn around',
        `worst claimed +${(s.api.displayAreaErrorMax * 100).toFixed(1)}%, `
        + `smallest ${(s.api.displayAreaErrorMin * 100).toFixed(1)}%`);
      check(s.api.operationalLargerThanPhysical === 0,
        'the body axis tightens a rectangle, never grows one',
        `${s.api.operationalLargerThanPhysical} larger than their measured extent`);
      check(s.api.flaggedButTurned === 0,
        'a flagged body axis is reported, never acted on',
        `${s.api.orientationFlagged} flagged, ${s.api.flaggedButTurned} turned anyway`);
      check(s.api.axisOverLimit === 0,
        'no rectangle is turned beyond the body-axis limit',
        `${s.api.axisOverLimit} over 5 degrees; ${s.api.axisOffsetApplied} offsets applied`);

      let cornerWorst = 0;
      let cornerChecked = 0;
      let cornerCountWrong = 0;
      let batchTransformed = 0;
      for (const box of s.equipmentBoxes) {
        const e = served.get(box.id);
        const op = s.api.operationalFootprints[box.id];
        if (!box.batchIdentity) batchTransformed += 1;
        if (!e || !op || e.deg == null) continue;
        if (!Array.isArray(box.corners) || box.corners.length !== 4) {
          cornerCountWrong += 1;
          continue;
        }
        cornerChecked += 1;
        const want = blocks.twinBoxCorners(
          e.x + op.offset_x, e.z + op.offset_z, op.width, op.depth, e.deg + op.offset);
        for (const [wx, wz] of want) {
          let best = Infinity;
          for (const [dx, dz] of box.corners) best = Math.min(best, Math.hypot(dx - wx, dz - wz));
          cornerWorst = Math.max(cornerWorst, best);
        }
        for (const [dx, dz] of box.corners) {
          let best = Infinity;
          for (const [wx, wz] of want) best = Math.min(best, Math.hypot(dx - wx, dz - wz));
          cornerWorst = Math.max(cornerWorst, best);
        }
      }
      check(batchTransformed === 0,
        'an instanced batch adds no transform of its own',
        `${batchTransformed} batch(es) carry a non-identity matrix`);
      check(cornerCountWrong === 0,
        'every drawn machine is a four-cornered rectangle in plan',
        `${cornerCountWrong} with a different corner count`);
      check(cornerChecked === s.api.displayRectangles - s.api.displayTruePolygon
        && cornerChecked > 0,
        'every measured machine not on the TRUE_POLYGON path is drawn as a rectangle',
        `${cornerChecked} checked against ${s.api.displayRectangles} served `
        + `(${s.api.displayTruePolygon} of those are TRUE_POLYGON, not a rectangle)`);
      check(cornerWorst <= SERVED_COORDINATE_QUANTUM_M,
        'the drawn rectangle IS the record: same centre, same size, same angle',
        `worst corner ${(cornerWorst * 1000).toFixed(3)} mm across ${cornerChecked} machines`);
      check(worstPos === 0,
        'the rectangle is drawn where the record puts it, to the last bit',
        `worst centre delta ${worstPos} m across ${s.equipmentPlacements.length} drawn assets`);

      // -- Instancing -----------------------------------------------------
      //
      // The point of it: machines drawn as a box cost a handful of objects,
      // one geometry and one material per tier, and picking still names the
      // exact machine. A TRUE_POLYGON record costs one MORE object and one
      // MORE geometry each, because its shape is not shared with anything --
      // that is the price of drawing a real outline instead of a box, paid
      // once per such record, not per machine. The ceiling below is a few
      // tiers plus exactly that many, not a widened, unaccountable number.
      const polygonMeshCount = s.equipmentPolygons.length;
      check(s.equipmentSceneObjects === s.equipmentBatchCount
        && s.equipmentSceneObjects > 0
        && s.equipmentSceneObjects <= 4 + polygonMeshCount,
        'the equipment layer is drawn by a few instanced batches plus one mesh per TRUE_POLYGON record, not one object per machine',
        `${s.equipmentSceneObjects} scene object(s) for ${s.equipmentBoxes.length} boxed `
        + `+ ${polygonMeshCount} TRUE_POLYGON machine(s)`);
      check(s.equipmentGeometries === 1 + polygonMeshCount,
        'every BOXED machine shares ONE box geometry, and each TRUE_POLYGON record costs its own',
        `${s.equipmentGeometries} geometr(ies) across the batches, `
        + `expected 1 + ${polygonMeshCount}`);

      // -- The §22 visual cases -------------------------------------------
      //
      // Chosen from the served record by their own properties, so the list
      // cannot rot when the drawing is re-read. Each is verified as DRAWN:
      // where it is, how big it is, which way it faces.
      const drawnById = new Map(s.equipmentBoxes.map((b) => [b.id, b]));
      const polygonById = new Map(s.equipmentPolygons.map((p) => [p.id, p]));
      const placementById = new Map(s.equipmentPlacements.map((i) => [i.id, i]));
      const cases = s.api.visualCases;
      const caseNames = Object.keys(cases);
      let caseChecked = 0;
      let caseFailed = 0;
      const caseNotes = [];
      for (const name of caseNames) {
        const id = cases[name];
        if (!id) continue;
        const e = served.get(id);
        // A case whose record chose TRUE_POLYGON is not in equipmentBoxes at
        // all -- that is the whole point of the branch -- so it is verified
        // against its own mesh's world bounding box instead: centred on the
        // record's position, sized to the record's own footprint, within the
        // same float tolerance the box path uses.
        const poly = polygonById.get(id);
        if (e && poly) {
          const cx = (poly.minX + poly.maxX) / 2;
          const cz = (poly.minZ + poly.maxZ) / 2;
          const w = poly.maxX - poly.minX;
          const d = poly.maxZ - poly.minZ;
          const centreOff = Math.max(Math.abs(cx - e.x), Math.abs(cz - e.z));
          // A polygon's bbox centre is not its centroid -- an off-axis or
          // tapered outline legitimately sits off its own bbox centre -- so
          // this is bounded by the record's own footprint size, not by the
          // tight float tolerance a box's exact corner gets.
          const fp = s.api.equipmentFootprints[id];
          const tol = fp ? Math.max(fp.width, fp.depth) / 2 + FLOAT32_TOL_M : FLOAT32_TOL_M;
          if (centreOff > tol) { caseFailed += 1; caseNotes.push(`${name}: polygon centre off by ${centreOff}`); continue; }
          if (fp) {
            // footprint.width/depth are on the MACHINE's own rotated axes; the
            // polygon bbox above is world-axis-aligned, so a rotated machine's
            // world bbox is legitimately not width-by-depth -- it is the AABB
            // of a (width x depth) rectangle turned by the record's own CAD
            // rotation, the same standard formula the renderer's box path
            // gets for free from an unrotated instance and this path does not.
            const t = (e.deg || 0) * Math.PI / 180;
            const cos = Math.abs(Math.cos(t));
            const sin = Math.abs(Math.sin(t));
            const expectW = fp.width * cos + fp.depth * sin;
            const expectD = fp.width * sin + fp.depth * cos;
            if (w > expectW + FLOAT32_TOL_M || d > expectD + FLOAT32_TOL_M) {
              caseFailed += 1;
              caseNotes.push(`${name}: polygon bbox ${w}x${d} exceeds the served footprint's `
                + `own rotated AABB ${expectW}x${expectD}`);
              continue;
            }
          }
          caseChecked += 1;
          continue;
        }
        const box = drawnById.get(id);
        if (!box || !e) { caseFailed += 1; caseNotes.push(`${name}: not drawn`); continue; }
        caseChecked += 1;
        const op = s.api.operationalFootprints[id];
        const placed = placementById.get(id);
        // Against the record's own centre PLUS its published rectangle delta:
        // the machine's position is untouched, and the rectangle is drawn at
        // the centre the same geometry has on the axis it was measured on.
        const moved = placed
          ? Math.max(Math.abs(placed.x - (e.x + e.ox)), Math.abs(placed.z - (e.z + e.oz)))
          : Infinity;
        if (moved !== 0) { caseFailed += 1; caseNotes.push(`${name}: moved ${moved}`); continue; }
        if (op) {
          const sized = Math.max(Math.abs(box.w - op.width), Math.abs(box.d - op.depth));
          if (sized > FLOAT32_TOL_M) {
            caseFailed += 1;
            caseNotes.push(`${name}: size ${sized}`);
            continue;
          }
          const wantY = (e.deg + op.offset) * Math.PI / 180;
          const dY = Math.abs(((box.rotY - wantY) % (Math.PI * 2)));
          const wrapped = Math.min(dY, Math.PI * 2 - dY);
          if (wrapped > 1e-6) {
            caseFailed += 1;
            caseNotes.push(`${name}: angle ${(wrapped * 180 / Math.PI).toFixed(6)} deg`);
            continue;
          }
        } else if (box.w !== box.d) {
          caseFailed += 1;
          caseNotes.push(`${name}: an unresolved marker is not square`);
        }
      }
      check(caseFailed === 0 && caseChecked >= 10,
        'every named visual case is drawn where, and as, the record says',
        `${caseChecked} of ${caseNames.length} case(s) checked${caseNotes.length ? ': ' + caseNotes.join('; ') : ''}`);
    }

    // -- The invented machine-form layer is gone ---------------------------
    //
    // It drew a body for every machine on the floor, chosen from a table of
    // shapes nobody measured, standing at a raster-derived position. Its
    // absence is asserted rather than assumed: this was a whole rendering
    // path, and a rendering path can come back.
    const gone = await page.evaluate(() => {
      const T = window.__twin;
      let presentationTagged = 0;
      T.scene.traverse((o) => {
        if (o.userData && o.userData.presentation) presentationTagged++;
      });
      return {
        presentationTagged,
        sublayerNames: Object.keys(T.sublayers),
        api: ['presentationMeshes', 'presentationSpec', 'presentationCensus', 'presentationFormOf',
          'slotMeshes']
          .filter((k) => T[k] !== undefined),
      };
    });
    check(gone.presentationTagged === 0,
      'no object in the scene is tagged as a presentation form',
      `${gone.presentationTagged}`);
    check(!gone.sublayerNames.includes('presentation') && !gone.sublayerNames.includes('slots'),
      'neither the presentation nor the raster slot sub-layer exists',
      gone.sublayerNames.join(','));
    check(gone.api.length === 0,
      'the presentation and slot test hooks are deleted with their layers',
      gone.api.join(','));

    if (!baseline) baseline = s;

    page.off('console', onConsole);
    page.off('requestfailed', onFailed);
    console.log('');
  }

  // Whether this deployment actually has private geometry. It is gitignored,
  // so CI runs without it: the scene is then correctly empty of structure, and
  // the assertions that need an envelope have nothing to assert rather than
  // something to assert about zero.
  const hasGeometry = Boolean(baseline && baseline.api.envelopeHeight !== null);
  if (!hasGeometry) {
    console.log('No private geometry served -- geometry-dependent checks will be SKIPPED, not passed.');
    console.log('');
  }

  // ── Evidence semantics ──
  // These are the claims the twin is not allowed to make. Each has been a real
  // risk at some point in this reconstruction.
  console.log('Evidence semantics:');
  {
    const ev = await page.evaluate(async () => {
      const geo = await (await fetch('api/floor-geometry')).json();
      const diag = await (await fetch('api/diagnostics')).json().catch(() => null);
      return {
        slotsAllUnmapped: (geo.equipment || []).every((e) => e.status === 'UNMAPPED' && e.ims_device_id === null),
        slotsNoMesId: (geo.equipment || []).every((e) => e.mes_machine_id === undefined || e.mes_machine_id === null),
        heightsUnknown: (geo.equipment || []).every((e) => e.height_status === 'unknown'),
        clearHeightNull: geo.envelope ? geo.envelope.clear_height_m === null : null,
        // Equipment is deliberately EXCLUDED from this one. A low-confidence
        // asset here is a record whose extent the CAD did not establish, and
        // reporting that honestly is the point -- it is not a defect to fix by
        // dropping the record.
        noLowConfidenceGeometry: geo.columns.every((c) => c.confidence !== 'low'),
        servedZoneTiers: [...new Set(geo.functional_zones.map((z) => z.confidence))],
        confirmedMappings: diag ? diag.evidence.confirmed_mappings : null,
        simulatedPositions: diag ? diag.evidence.simulated_machine_positions : null,
      };
    });
    // These hold whether or not geometry is deployed: an empty set trivially
    // satisfies them, and that is the correct answer when nothing was served.
    check(ev.slotsAllUnmapped, 'every CAD asset remains UNMAPPED with a null device id');
    check(ev.slotsNoMesId, 'no CAD asset carries a MES machine id');
    check(ev.heightsUnknown, 'equipment height stays unknown, not defaulted into evidence');
    check(ev.noLowConfidenceGeometry, 'no LOW-confidence physical geometry is served');
    check(
      ev.servedZoneTiers.every((t) => t === 'HIGH' || t === 'MEDIUM'),
      'only HIGH/MEDIUM zones are served',
      ev.servedZoneTiers.join(',')
    );
    // This one genuinely needs an envelope to assert anything about.
    if (ev.clearHeightNull === null) skip('clear height stays null rather than estimated', NO_GEOMETRY);
    else check(ev.clearHeightNull, 'clear height stays null rather than estimated');
    check(ev.confirmedMappings === 0, 'confirmed mappings remains 0', `got ${ev.confirmedMappings}`);

    // ── Zone display names ──
    // Names are servable on this route and nowhere else. Whatever the count is,
    // every name must satisfy the label guard, and none may appear in
    // diagnostics -- which is pasted into tickets and logs.
    const nameGuard = /^[A-Z0-9][A-Z0-9 \-]{0,31}$/;
    check(
      baseline.api.zoneNames.every((n) => nameGuard.test(n)),
      'every served zone name is a drawing label, not free text',
      `${baseline.api.zonesNamedCount} named of ${baseline.api.zones}`
    );
    const diagText = await page.evaluate(async () => JSON.stringify(await (await fetch('api/diagnostics')).json()));
    check(
      baseline.api.zoneNames.every((n) => !diagText.includes(n)),
      'no zone name appears in diagnostics'
    );
    // ── Schematic reference layer ──
    // A second spatial model whose only safety property is that it can never be
    // mistaken for the measured one. These assert the separation, not the
    // drawing.
    const sch = await page.evaluate(async () => {
      const r = await fetch('api/floor-schematic');
      if (!r.ok) return null;
      const j = await r.json();
      const areas = Array.isArray(j.areas) ? j.areas : [];
      const snapshots = Array.isArray(j.snapshots) ? j.snapshots : [];
      return {
        raw: JSON.stringify(j),
        space: j.coordinate_space,
        areas: areas.length,
        snapshots: snapshots.map((s) => s.id),
        names: areas.map((a) => a.name).filter(Boolean),
        classes: [...new Set(areas.map((a) => a.source_class))],
        annotations: Array.isArray(j.annotations) ? j.annotations.length : 0,
      };
    });
    if (!sch || sch.areas === 0) {
      // No schematic transcription deployed -- the default for a public clone,
      // exactly as with the measured geometry. Reported, never passed.
      for (const label of [
        'the schematic payload names its own coordinate space',
        'the schematic emits no physical coordinate field',
        'every schematic area claims only SCHEMATIC_OBSERVED',
        'no schematic record carries an IMS identity',
        'every schematic area name is a drawing label, not free text',
        'both reference snapshots coexist without being merged',
        'no schematic area name appears in diagnostics',
      ]) {
        skip(label, NO_SCHEMATIC);
      }
    } else {
    check(sch.space === 'SCHEMATIC_NOT_PHYSICAL', 'the schematic payload names its own coordinate space', sch.space);
    check(!/"[xyz]":/.test(sch.raw), 'the schematic emits no physical coordinate field');
    check(
      sch.classes.every((c) => c === 'SCHEMATIC_OBSERVED' || c === null),
      'every schematic area claims only SCHEMATIC_OBSERVED',
      sch.classes.join(',')
    );
    check(!/IMS_CONNECTED|ims_device_id/.test(sch.raw), 'no schematic record carries an IMS identity');
    check(
      sch.names.every((n) => nameGuard.test(n)),
      'every schematic area name is a drawing label, not free text',
      `${sch.names.length} named`
    );
    // Two renders claiming one instant and disagreeing. Served as two, never
    // reconciled into one.
    check(sch.snapshots.length === 2 && new Set(sch.snapshots).size === 2,
      'both reference snapshots coexist without being merged', sch.snapshots.join(','));
    check(
      sch.names.every((n) => !diagText.includes(n)),
      'no schematic area name appears in diagnostics'
    );
    }

    // Today this is zero, and that is the honest state: the names exist on a
    // schematic that shares no reference frame with these measured polygons,
    // so attaching one would be inventing the correspondence. If this ever
    // becomes non-zero, an authoritative correspondence must have arrived.
    console.log(`  INFO  ${baseline.api.zonesNamedCount} of ${baseline.api.zones} served zones carry a drawing label`);
    // Only assertable where a fleet exists. Zero monitored devices is a real
    // deployment state, not a failed assertion about simulated positions.
    check(ev.simulatedPositions === 0, 'diagnostics reports zero simulated positions',
      `${ev.simulatedPositions}`);
    console.log('');
  }

  // ── View presets ──
  // Building framing is derived from the measured envelope, so without private
  // geometry the preset is correctly disabled and there is nothing to assert
  // about it. That is reported as skipped, not as passing.
  console.log('View presets:');
  if (!hasGeometry) {
    for (const label of [
      'building preset activates',
      'building preset frames the whole structure without clipping',
      'overview preset activates',
      'overview frames the whole structure',
      'overview frames every equipment position',
      'reset restores framing without changing which view is active',
      'switching views never changes API results',
      'no rendered coordinate changes across three view switches and a reset',
    ]) {
      skip(label, NO_GEOMETRY);
    }
    console.log('');
  } else {
    const before = await snapshot(page);

    await page.click('#view-controls button[data-view="building"]');
    await page.waitForTimeout(600);
    const inBuilding = await page.evaluate(() => {
      const T = window.__twin;
      let total = 0;
      let visible = 0;
      T.layers.structural.traverse((o) => {
        if (o.type !== 'Mesh') return;
        total++;
        const v = o.position.clone().project(T.camera);
        if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1) visible++;
      });
      return { total, visible, view: T.getView() };
    });
    check(inBuilding.view === 'building', 'building preset activates');
    check(
      inBuilding.visible === inBuilding.total,
      'building preset frames the whole structure without clipping',
      `${inBuilding.visible}/${inBuilding.total}`
    );
    // Overview frames both coordinate systems at once. It must contain the
    // whole structure AND every machine -- a preset that quietly drops one of
    // the two is worse than not offering it.
    await page.click('#view-controls button[data-view="overview"]');
    await page.waitForTimeout(600);
    const inOverview = await page.evaluate(() => {
      const T = window.__twin;
      const framed = (obj) => {
        const v = obj.position.clone().project(T.camera);
        return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1;
      };
      // An equipment INSTANCE is not an Object3D: it is a placement record, so
      // it is projected through the same camera by the page's own helper.
      const framedPoint = (p) => {
        const v = T.projectPoint(p.x, p.y, p.z);
        return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1;
      };
      let structTotal = 0;
      let structVisible = 0;
      T.layers.structural.traverse((o) => {
        if (o.type !== 'Mesh') return;
        structTotal++;
        if (framed(o)) structVisible++;
      });
      return {
        view: T.getView(),
        structTotal,
        structVisible,
        // The CAD equipment is everything operational on the floor now: no
        // monitored device is drawn, and no raster slot exists.
        slotsFramed: T.equipmentInstances.filter(framedPoint).length,
        slotTotal: T.equipmentInstances.length,
      };
    });
    check(inOverview.view === 'overview', 'overview preset activates');
    check(inOverview.structVisible === inOverview.structTotal, 'overview frames the whole structure',
      `${inOverview.structVisible}/${inOverview.structTotal}`);
    check(inOverview.slotsFramed === inOverview.slotTotal, 'overview frames every equipment position',
      `${inOverview.slotsFramed}/${inOverview.slotTotal}`);

    // Reset re-applies the ACTIVE view's framing rather than forcing operator.
    await page.evaluate(() => window.__twin.controls.target.set(999, 999, 999));
    await page.click('#view-reset');
    await page.waitForTimeout(400);
    check(await page.evaluate(() => window.__twin.getView()) === 'overview',
      'reset restores framing without changing which view is active');

    // Back to the primary view. 2D plan is the default and the one the rest of
    // the suite expects, and returning to it is itself the third switch this
    // coordinate check spans.
    await page.click('#view-controls button[data-view="plan"]');
    await page.waitForTimeout(600);
    const restored = await snapshot(page);
    check(JSON.stringify(restored.api) === JSON.stringify(before.api), 'switching views never changes API results');
    // Byte-level, across every evidence-backed mesh in the scene: a view is a
    // camera change and nothing else.
    check(restored.coords === before.coords,
      'no rendered coordinate changes across three view switches and a reset');
    console.log('');
  }

  // -- The raster schematic no longer renders in the canonical view -------
  //
  // It used to be a second mode of this page, with its own pane, its own
  // captions and a side-by-side layout. The canonical Factory Twin is the CAD
  // floor now, and mixing a not-to-scale drawing into the same page is how
  // raster geometry leaked into the physical view in the first place. The
  // transcription itself is NOT deleted -- /api/floor-schematic still serves
  // it, and its wire guarantees are still asserted above -- but nothing on
  // this page draws it.
  console.log('Raster schematic retired from the canonical view:');
  {
    const r = await page.evaluate(() => ({
      renderer: typeof window.__schematic,
      dom: ['#schematic', '#schematic-panel', '#schematic-badge', '#schematic-inspector',
        '#schematic-conflict', '#schematic-options', '#snapshot-controls', '.split-caption']
        .filter((sel) => document.querySelector(sel) !== null),
      scripts: [...document.querySelectorAll('script[src]')]
        .map((el) => el.getAttribute('src'))
        .filter((src) => /schematic|machine-forms/.test(src)),
      modeApi: typeof (window.__twin && window.__twin.setMode),
      views: [...document.querySelectorAll('#view-controls button[data-view]')]
        .map((btn) => btn.dataset.view),
    }));
    check(r.renderer === 'undefined',
      'the schematic renderer is not loaded by the canonical page', r.renderer);
    check(r.dom.length === 0,
      'no schematic pane, badge or caption exists in the canonical page', r.dom.join(' '));
    check(r.scripts.length === 0,
      'neither the schematic nor the machine-form module is fetched', r.scripts.join(' '));
    check(r.modeApi === 'undefined',
      'the mode board that switched between physical and schematic is gone');
    // 2D first, 3D second: physical accuracy is what this view is for right
    // now, so the plan is the primary view and it is listed first.
    check(JSON.stringify(r.views) === JSON.stringify(['plan', 'overview', 'building']),
      'the view controls are the 2D plan, the 3D overview and fit-to-floor, in that order',
      r.views.join(','));
    console.log('');
  }

  // ── Diagnostics ──
  console.log('Diagnostics:');
  {
    const openByDefault = await page.locator('#diagnostics').evaluate((e) => e.open);
    check(openByDefault === false, 'diagnostics stays collapsed for the default view');
    // Diagnostics lives in the inspection drawer, which is closed by default:
    // the default view is the floor plan, not a wall of counters. Open the
    // drawer first -- clicking a control inside a closed drawer is not a thing
    // an operator can do either.
    const drawerWasOpen = await page.evaluate(
      () => document.getElementById('app').classList.contains('drawer-open')
    );
    if (!drawerWasOpen) {
      await page.click('#drawer-toggle');
      await page.waitForTimeout(450);
    }
    check(await page.locator('#diagnostics > summary').isVisible(),
      'diagnostics is reachable once the inspection drawer is open');
    await page.click('#diagnostics > summary');
    await page.waitForTimeout(1200);
    const text = await page.locator('#diagnostics-body').innerText();
    check(text.includes('Confirmed mappings'), 'diagnostics reports confirmed mappings');
    check(text.includes('Observed columns') && text.includes('Simulated machine positions'),
      'diagnostics keeps evidence categories separate');
    check(!/PHYS-F1-|EQP-F1-|LDI-\d/.test(text), 'diagnostics leaks no object identifiers');
    check(text.includes('Equipment') || text.includes('equipment'),
      'diagnostics reports the CAD equipment layer');
    await page.click('#diagnostics > summary');
    if (!drawerWasOpen) {
      await page.click('#drawer-toggle');
      await page.waitForTimeout(450);
    }
    console.log('');
  }

  // -- The inspection drawer is chrome, never evidence --------------------
  //
  // The five-mode board is gone with the schematic it existed to switch to.
  // What remains that changes the page's shape is the drawer, and it carries
  // the same load-bearing guarantee the modes did: a byte-level coordinate
  // snapshot across opening and closing it, so chrome that quietly moved
  // geometry would fail here rather than be discovered in a screenshot months
  // later.
  console.log('Inspection drawer:');
  {
    const base = await page.evaluate(() => window.__twin.snapshotCoordinates());
    const closedStage = await page.evaluate(
      () => document.getElementById('stage').getBoundingClientRect().width
    );

    await page.click('#drawer-toggle');
    await page.waitForTimeout(500);
    const open = await page.evaluate(() => ({
      coords: window.__twin.snapshotCoordinates(),
      expanded: document.getElementById('drawer-toggle').getAttribute('aria-expanded'),
      stage: document.getElementById('stage').getBoundingClientRect().width,
      drawerVisible: document.getElementById('drawer').getBoundingClientRect().width > 0,
      // The renderer must have been resized to the narrower pane, or the model
      // is drawn at the wrong aspect and spills under the drawer.
      canvas: document.querySelector('canvas').getBoundingClientRect().width,
    }));

    await page.click('#drawer-toggle');
    await page.waitForTimeout(500);
    const closed = await page.evaluate(() => ({
      coords: window.__twin.snapshotCoordinates(),
      expanded: document.getElementById('drawer-toggle').getAttribute('aria-expanded'),
      stage: document.getElementById('stage').getBoundingClientRect().width,
    }));

    check(open.expanded === 'true' && closed.expanded === 'false',
      'the drawer control reports its own state to a screen reader',
      `${open.expanded} / ${closed.expanded}`);
    check(open.drawerVisible, 'opening the drawer shows it');
    // On a narrow viewport the drawer legitimately overlays instead of
    // docking, so the assertion is "the stage never grows", not a fixed width.
    check(open.stage <= closedStage + 1,
      'opening the drawer never widens the floor pane',
      `${closedStage} -> ${open.stage}`);
    check(Math.abs(open.canvas - open.stage) <= 2,
      'the renderer is resized to the pane it is drawn in, not to the window',
      `canvas ${open.canvas} vs stage ${open.stage}`);
    check(Math.abs(closed.stage - closedStage) <= 1,
      'closing the drawer restores the floor pane exactly',
      `${closedStage} -> ${closed.stage}`);
    check(open.coords === base && closed.coords === base,
      'opening and closing the drawer moves no measured coordinate');
    console.log('');
  }

  // ── Visibility is presentation only ──
  console.log('Layer visibility:');
  // The layer controls live in the inspection drawer, so it has to be open for
  // a pointer to reach them -- same as for an operator.
  const layerDrawerWasOpen = await page.evaluate(
    () => document.getElementById('app').classList.contains('drawer-open')
  );
  if (!layerDrawerWasOpen) {
    await page.click('#drawer-toggle');
    await page.waitForTimeout(450);
  }
  for (const layer of LAYERS) {
    await page.uncheck(`#layer-controls input[data-layer="${layer}"]`);
  }
  await page.waitForTimeout(500);
  const hidden = await snapshot(page);
  check(LAYERS.every((l) => hidden.visibility[l] === false), 'every toggled layer reported hidden',
    LAYERS.filter((l) => hidden.visibility[l] !== false).join(','));
  check(hidden.meshes === baseline.meshes, 'hiding does not delete meshes', `${hidden.meshes} vs ${baseline.meshes}`);
  check(JSON.stringify(hidden.api) === JSON.stringify(baseline.api), 'hiding does not change API results');

  // Restore each toggle to the state it started in rather than blanket-on, so
  // the comparison is against the baseline scene and not against a scene that
  // merely happens to have everything switched on.
  for (const layer of LAYERS) {
    const sel = `#layer-controls input[data-layer="${layer}"]`;
    if (baseline.visibility[layer]) await page.check(sel);
    else await page.uncheck(sel);
  }
  await page.waitForTimeout(500);
  if (!layerDrawerWasOpen) {
    await page.click('#drawer-toggle');
    await page.waitForTimeout(450);
  }
  const restored = await snapshot(page);
  // Name the field that moved. "the snapshot differs" is not a diagnosis, and
  // this snapshot has two dozen keys.
  const snapshotDrift = Object.keys(baseline).filter(
    (k) => JSON.stringify(baseline[k]) !== JSON.stringify(restored[k])
  );
  check(snapshotDrift.length === 0, 'restoring reproduces the baseline snapshot',
    snapshotDrift.map((k) => {
      const a = baseline[k];
      const b = restored[k];
      if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
        for (let i = 0; i < a.length; i += 1) {
          if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
            const fields = Object.keys(a[i] || {}).filter(
              (f) => JSON.stringify(a[i][f]) !== JSON.stringify(b[i][f])
            );
            return `${k}[${i}] ${fields.map(
              (f) => `${f} ${JSON.stringify(a[i][f])} -> ${JSON.stringify(b[i][f])}`
            ).join(', ')}`;
          }
        }
      }
      return `${k}: ${JSON.stringify(a).slice(0, 120)} -> ${JSON.stringify(b).slice(0, 120)}`;
    }).join(' | '));
  console.log('');

  // ── The raw CAD reference overlay ──
  //
  // The overlay exists so the reconstruction can be compared against its
  // source, which means the only interesting assertion is that the two land in
  // the same place. A screenshot cannot make that claim; comparing the served
  // room polygons against the drawn reference line-work can.
  console.log('Raw CAD reference overlay:');
  {
    const drawerWasOpen = await page.evaluate(
      () => document.getElementById('app').classList.contains('drawer-open'));
    if (!drawerWasOpen) {
      await page.click('#drawer-toggle');
      await page.waitForTimeout(450);
    }
    const beforeCoords = await page.evaluate(() => window.__twin.snapshotCoordinates());
    const idle = await page.evaluate(() => ({
      state: window.__twin.rawCadState(),
      visible: window.__twin.layers.reference.visible,
    }));
    check(idle.state === 'idle' && idle.visible === false,
      'the reference is neither fetched nor drawn until it is asked for',
      `${idle.state} / visible=${idle.visible}`);

    await page.check('#layer-controls input[data-layer="reference"]');
    const ready = await page.waitForFunction(
      () => ['ready', 'unavailable', 'error'].includes(window.__twin.rawCadState()),
      null, { timeout: 30000 },
    ).then(() => page.evaluate(() => ({
      state: window.__twin.rawCadState(),
      stats: window.__twin.rawCadStats(),
      visible: window.__twin.layers.reference.visible,
      status: document.getElementById('reference-status').textContent,
    })));

    if (ready.state !== 'ready') {
      console.log(`  SKIP  overlay checks (reference reported ${ready.state})`);
    } else {
      check(ready.visible && ready.stats.segments > 0,
        'switching the reference on draws the drawing line-work',
        `${ready.stats.segments} segments across ${ready.stats.roles.length} roles`);
      check(/\d/.test(ready.status),
        'the panel says how much reference was drawn', ready.status);

      // THE COMPARISON. Every vertex of every served room must coincide with an
      // endpoint of the drawn reference. The two arrive by different routes --
      // one through the model pipeline, one as untouched line-work through a
      // transform the client applies itself -- so agreement here means the
      // rooms really are the drawing's own boundaries and the frame that maps
      // between them is the right one. A mirrored frame fails this.
      const agreement = await page.evaluate(() => {
        const t = window.__twin;
        const ends = new Set();
        t.layers.reference.traverse((o) => {
          if (o.name !== 'cad:area-boundaries') return;
          const a = o.geometry.attributes.position.array;
          for (let i = 0; i < a.length; i += 3) {
            ends.add(`${Math.round(a[i] * 1000)}|${Math.round(a[i + 2] * 1000)}`);
          }
        });
        let vertices = 0;
        let matched = 0;
        for (const g of t.layers.functional.children) {
          const verts = g.userData && g.userData.vertices;
          if (!Array.isArray(verts)) continue;
          for (const v of verts) {
            vertices++;
            let hit = false;
            // A two-millimetre neighbourhood: the reference is drawn from
            // float32 attribute data, so a vertex can round to the far side of
            // a millimetre boundary without having moved.
            for (let dx = -2; dx <= 2 && !hit; dx++) {
              for (let dz = -2; dz <= 2 && !hit; dz++) {
                if (ends.has(`${Math.round(v.x * 1000) + dx}|${Math.round(v.z * 1000) + dz}`)) hit = true;
              }
            }
            if (hit) matched++;
          }
        }
        return { vertices, matched, endpoints: ends.size };
      });
      if (agreement.vertices === 0) {
        console.log('  SKIP  room-vs-reference agreement (the renderer keeps no zone vertices)');
      } else {
        check(agreement.matched === agreement.vertices,
          'every served room vertex lands on a raw drawing endpoint',
          `${agreement.matched} of ${agreement.vertices} against ${agreement.endpoints} endpoints`);
      }
    }

    await page.uncheck('#layer-controls input[data-layer="reference"]');
    await page.waitForTimeout(300);
    const afterCoords = await page.evaluate(() => window.__twin.snapshotCoordinates());
    const gone = await page.evaluate(() => window.__twin.layers.reference.visible);
    check(gone === false, 'switching the reference off removes it');
    check(afterCoords === beforeCoords,
      'the reference is an overlay: drawing it moves no measured coordinate');
    if (!drawerWasOpen) {
      await page.click('#drawer-toggle');
      await page.waitForTimeout(450);
    }
  }

  console.log('Inspection outlines and machine labels:');
    // -- Inspection outlines and machine labels ---------------------------
    //
    // Two presentation layers that must be provably presentation: the measured
    // outline is the geometry the display shape was derived FROM, and a caption
    // is a caption. Neither may add a mesh to the floor, and neither may move a
    // coordinate.
    const drawnAssets = await page.evaluate(() => window.__twin.equipmentInstances.length);
    if (drawnAssets === 0) {
      skip('the measured outlines are an inspection layer, off by default', NO_GEOMETRY);
      skip('machine labels are an overlay, not geometry', NO_GEOMETRY);
    } else {
      const before = await page.evaluate(() => {
        const T = window.__twin;
        return {
          visible: T.sublayers.measured.visible,
          objects: T.sublayers.measured.children.length,
          outlines: T.measuredOutlineCount(),
          equipmentMeshes: T.equipmentInstances.length,
          positions: T.equipmentInstances.map((i) => [i.x, i.y, i.z]),
        };
      });
      check(before.visible === false,
        'the measured outlines are an inspection layer, off by default',
        `visible=${before.visible}, ${before.objects} object(s) holding ${before.outlines} outlines`);
      check(before.objects <= 1,
        'every measured outline is drawn by ONE object, not one per machine',
        `${before.objects} object(s) for ${before.outlines} outlines`);

      const after = await page.evaluate(() => {
        const T = window.__twin;
        T.setLayerVisible('measured', true);
        return {
          visible: T.sublayers.measured.visible,
          equipmentMeshes: T.equipmentInstances.length,
          positions: T.equipmentInstances.map((i) => [i.x, i.y, i.z]),
        };
      });
      check(after.visible === true && after.equipmentMeshes === before.equipmentMeshes,
        'switching the measured outlines on adds no machine geometry',
        `${after.equipmentMeshes} meshes before and after`);
      check(JSON.stringify(after.positions) === JSON.stringify(before.positions),
        'the inspection layer is an overlay: drawing it moves no machine');
      await page.evaluate(() => window.__twin.setLayerVisible('measured', false));

      // A stated viewport, because the label layer is level of detail: the last
      // responsive case leaves the page 600 px wide, where nothing on a 174 m
      // floor is large enough to caption and the check would assert nothing.
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(400);
      // Back to the operator framing first. The label layer is level-of-detail:
      // at the building view nothing is close enough to caption, and a check
      // that runs at that zoom asserts nothing about what a label says.
      await page.evaluate(() => window.__twin.applyView('operator'));
      await page.waitForTimeout(700);
      const labels = await page.evaluate(() => {
        const T = window.__twin;
        T.updateMachineLabels();
        const stats = T.labelStats();
        const host = document.getElementById('machine-labels');
        const shown = host ? [...host.querySelectorAll('.machine-label')].filter((el) => !el.hidden) : [];
        return {
          stats,
          shownInDom: shown.length,
          text: shown.slice(0, 3).map((el) => el.textContent.trim()),
          sceneChildren: T.sublayers.equipment.children.length,
          batches: T.equipmentBatches.length,
          instanceCount: T.equipmentBatches.reduce((n, b) => n + b.count, 0),
          hostPointerEvents: host ? getComputedStyle(host).pointerEvents : null,
        };
      });
      check(labels.stats.shown > 0 && labels.stats.shown <= labels.stats.max
        && labels.shownInDom === labels.stats.shown,
        'machine labels are capped and the DOM matches the count',
        `${labels.stats.shown} shown, cap ${labels.stats.max}, ${labels.shownInDom} in the DOM`);
      // Instanced: the equipment layer holds one child per tier, never one per
      // machine, and captioning changes neither that count nor the instances.
      check(labels.sceneChildren === labels.batches
        && labels.instanceCount === drawnAssets,
        'machine labels are an overlay, not geometry',
        `${labels.sceneChildren} batch mesh(es) carrying ${labels.instanceCount} of ${drawnAssets} assets, ${labels.stats.shown} captions`);
      check(labels.hostPointerEvents === 'none',
        'labels never intercept a click meant for the floor',
        `pointer-events: ${labels.hostPointerEvents}`);
      // A caption carries the model's own id, never a CAD block or layer name.
      check(labels.text.every((t) => /^EQP-/.test(t)),
        'a label carries the model id, never a name out of the drawing',
        labels.text.join(' | ') || 'none shown at this zoom');

      const hidden = await page.evaluate(() => {
        const T = window.__twin;
        T.setLayerVisible('equipment', false);
        T.updateMachineLabels();
        const n = T.labelStats().shown;
        T.setLayerVisible('equipment', true);
        T.updateMachineLabels();
        return { hidden: n, restored: T.labelStats().shown };
      });
      check(hidden.hidden === 0,
        'hiding the equipment layer takes its captions with it',
        `${hidden.hidden} label(s) left behind, ${hidden.restored} restored`);
    }

  // ══════════════════════════════════════════════════════════════════════
  // FT-07B — Display-mode contract.
  //
  // Everything above measures whatever mode the twin boots into by default.
  // This section drives the actual mode switch and checks the contract
  // boundary explicitly:
  //
  //     API evidence -> display-policy projection -> rendered asset set
  //
  // It never assumes API records == meshes, and it never re-implements
  // classify/dedupe/filter: every "expected" set below is read from
  // window.__twin.getDisplayAssetIds(), the exact function applyDisplayMode
  // itself calls. A build without that hook (i.e. without the display-mode
  // architecture at all) reports this whole section SKIP rather than a
  // false pass or a false fail -- it is testing a contract that only
  // exists once FT-07A/B's client-side filtering is present.
  // ══════════════════════════════════════════════════════════════════════
  console.log('\nDisplay-mode contract:');
  // Close out the page/context every check above ran on FIRST -- it is
  // still holding a live canvas and render loop, and is not needed again.
  await context.close();
  // A DEDICATED BROWSER PROCESS, not a second context on the shared one.
  // Measured in-page (performance.now() around applyDisplayMode() itself,
  // inside the browser) the switch cost is sub-millisecond to ~3ms, every
  // time, on both this build and the shared page above. But the Node-side
  // wall-clock read on a second CONTEXT of the SAME browser process the
  // viewport loop just spent minutes on read 95-242ms -- CDP-channel/GPU
  // contention from that still-live page (open canvas, live render loop,
  // never closed) sharing the one browser process, not a cost this
  // architecture actually has. A genuinely separate process removes that
  // contention and measures what an operator's click really costs.
  const dcBrowser = await chromium.launch({ headless: true });
  const dcPage = await dcBrowser.newPage({ viewport: { width: 1920, height: 1080 } });
  await dcPage.goto(PHYSICAL_TWIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await dcPage.waitForFunction(() => window.__twin !== undefined, { timeout: 30000 });
  await dcPage.waitForTimeout(2000);

  const hasDisplayContract = await dcPage.evaluate(() => typeof window.__twin.getDisplayAssetIds === 'function'
    && typeof window.__twin.applyDisplayMode === 'function');

  if (!hasDisplayContract) {
    skip('mode contract: rendered IDs match the canonical display-policy projection', NO_DISPLAY_CONTRACT);
    skip('duplicate contract: proven pairs render once, both handles stay in provenance', NO_DISPLAY_CONTRACT);
    skip('source (API) immutability across mode switches', NO_DISPLAY_CONTRACT);
    skip('geometry immutability across a full mode round trip', NO_DISPLAY_CONTRACT);
    skip('20+ repeated mode switches: no mesh accumulation', NO_DISPLAY_CONTRACT);
    skip('mode-switch latency under the 100ms target', NO_DISPLAY_CONTRACT);
  } else {
    const MODES = ['PRIMARY', 'PRIMARY_AUDIT', 'PRIMARY_RECOVERED', 'ALL_ENGINEERING'];

    // -- API completeness + mode contract, all four modes ------------------
    console.log('  Mode verification:');
    const modeResults = [];
    for (const mode of MODES) {
      // rAF x2: one frame for the mode's rebuild, one for it to be uploaded,
      // before anything is read back off the renderer or the instance list.
      const r = await dcPage.evaluate(async (m) => {
        const T = window.__twin;
        T.applyDisplayMode(m);
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const geo = await (await fetch('api/floor-geometry')).json();
        return {
          apiRecords: Array.isArray(geo.equipment) ? geo.equipment.length : 0,
          expected: T.getDisplayAssetIds(m),
          actual: T.equipmentInstances.map((i) => i.item.id).sort(),
        };
      }, mode);
      const expectedSet = new Set(r.expected);
      const actualSet = new Set(r.actual);
      const missing = r.expected.filter((id) => !actualSet.has(id));
      const extra = r.actual.filter((id) => !expectedSet.has(id));
      modeResults.push({
        mode, apiRecords: r.apiRecords, expectedCount: r.expected.length, actualCount: r.actual.length, missing, extra,
      });
      console.log(`    ${mode}: API=${r.apiRecords} expected=${r.expected.length} actual=${r.actual.length} `
        + `missing=${missing.length} extra=${extra.length}`);
      check(missing.length === 0 && extra.length === 0,
        `${mode}: rendered asset IDs exactly match the canonical display-policy projection`,
        `${r.actual.length} rendered, ${r.expected.length} expected, ${missing.length} missing, ${extra.length} extra`);
      check(r.apiRecords === modeResults[0].apiRecords,
        `${mode}: switching display mode never changes the API's own record count`,
        `${r.apiRecords} record(s)`);
    }

    // -- Duplicate contract, checked at ALL_ENGINEERING (most permissive) --
    //
    // Pairs are read from the API's own duplicate_of field, never a
    // hardcoded id or handle list: cad_source_handle is deliberately never
    // served (see lib/wire.js's own field-by-field allowlist), so an id-pair
    // constant here would be the ONLY thing in the file naming raw CAD
    // provenance outside that one module. Reading duplicate_of instead is
    // not a second derivation of WHICH records are duplicates -- that
    // determination is made exactly once, server-side -- it is reading the
    // one place that determination is already published.
    console.log('  Duplicate verification:');
    const dupCheck = await dcPage.evaluate(async () => {
      const T = window.__twin;
      T.applyDisplayMode('ALL_ENGINEERING');
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const geo = await (await fetch('api/floor-geometry')).json();
      const byId = new Set((geo.equipment || []).map((e) => e.id));
      const renderedIds = new Set(T.equipmentInstances.map((i) => i.item.id));
      const pairs = (geo.equipment || []).filter((e) => e.duplicate_of)
        .map((e) => [e.duplicate_of, e.id]);
      return pairs.map(([primary, dup]) => ({
        pair: [primary, dup],
        sourcePresent: [primary, dup].map((id) => byId.has(id)),
        renderedCount: [primary, dup].filter((id) => renderedIds.has(id)).length,
      }));
    });
    check(dupCheck.length > 0, 'at least one proven duplicate pair exists to check',
      `${dupCheck.length} pair(s) found via duplicate_of`);
    for (const d of dupCheck) {
      console.log(`    ${d.pair.join(' <-> ')}: source present=${d.sourcePresent.join(',')} rendered=${d.renderedCount}`);
      check(d.sourcePresent.every(Boolean),
        `${d.pair.join(' <-> ')}: both ids remain in API provenance`,
        `present=${d.sourcePresent.join(',')}`);
      check(d.renderedCount === 1,
        `${d.pair.join(' <-> ')}: exactly one physical asset is rendered, even at ALL_ENGINEERING`,
        `rendered=${d.renderedCount}`);
    }

    // -- Source (API) immutability across every mode switch -----------------
    const fingerprintOf = () => dcPage.evaluate(() => {
      const raw = window.__twin.getRawApiEquipment ? window.__twin.getRawApiEquipment() : null;
      if (!raw) return null;
      return JSON.stringify(raw.map((e) => ({
        id: e.id,
        x: e.position && e.position.x,
        y: e.position && e.position.y,
        z: e.position && e.position.z,
        rot: e.rotation_deg,
        w: e.footprint && e.footprint.width,
        d: e.footprint && e.footprint.depth,
        footprint_status: e.footprint_status,
        physical_status: e.physical_status,
        duplicate_of: e.duplicate_of,
      })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
    });
    const fpBefore = await fingerprintOf();
    for (const mode of MODES) {
      // eslint-disable-next-line no-await-in-loop
      await dcPage.evaluate((m) => window.__twin.applyDisplayMode(m), mode);
    }
    const fpAfter = await fingerprintOf();
    check(fpBefore !== null && fpBefore === fpAfter,
      'the renderer never mutates the fetched API dataset while switching modes');

    // -- Geometry immutability: a full round trip through every mode --------
    const geomBefore = await dcPage.evaluate(() => {
      window.__twin.applyDisplayMode('ALL_ENGINEERING');
      return window.__twin.equipmentInstances.map(
        (i) => ({ id: i.item.id, x: i.x, y: i.y, z: i.z, w: i.w, d: i.d, h: i.h, rotY: i.rotY }),
      );
    });
    await dcPage.evaluate((modes) => {
      for (const m of modes) window.__twin.applyDisplayMode(m);
      window.__twin.applyDisplayMode('ALL_ENGINEERING');
    }, MODES);
    const geomAfter = await dcPage.evaluate(() => window.__twin.equipmentInstances.map(
      (i) => ({ id: i.item.id, x: i.x, y: i.y, z: i.z, w: i.w, d: i.d, h: i.h, rotY: i.rotY }),
    ));
    const beforeById = new Map(geomBefore.map((g) => [g.id, g]));
    let geomDrift = 0;
    for (const g of geomAfter) {
      const b = beforeById.get(g.id);
      if (!b) continue;
      if (b.x !== g.x || b.y !== g.y || b.z !== g.z || b.w !== g.w
        || b.d !== g.d || b.h !== g.h || b.rotY !== g.rotY) geomDrift += 1;
    }
    check(geomDrift === 0 && geomAfter.length > 0,
      'an asset visible before and after a full round trip through every mode keeps identical geometry',
      `${geomDrift} drifted of ${geomAfter.length} checked`);

    // -- 20+ repeated switches -------------------------------------------
    //
    // Two DELIBERATELY SEPARATE passes over the same 20-switch cycle, not
    // one loop measuring both: interleaving the accumulation read's
    // requestAnimationFrame wait into the latency loop (an earlier version
    // of this check did) pushed EVERY later switch to 95-240ms even though
    // in-page timing (performance.now() around applyDisplayMode() itself)
    // stayed under 3ms throughout -- headless/software-rendered Chromium
    // appears to deprioritize the next CDP command while still settling a
    // requested frame, which is overhead from asking, not from the switch.
    // Splitting the passes removes the interference; each pass measures
    // exactly the one thing its name says.
    const cycle = [];
    for (let rep = 0; rep < 5; rep++) cycle.push(...MODES); // 5 x 4 = 20 switches

    // -- Pass 1: latency. Nothing but the switch itself, back to back. ----
    const latencySamples = [];
    for (const mode of cycle) {
      const t0 = Date.now();
      // eslint-disable-next-line no-await-in-loop
      await dcPage.evaluate((m) => window.__twin.applyDisplayMode(m), mode);
      latencySamples.push({ mode, ms: Date.now() - t0 });
    }
    const maxSwitchMs = Math.max(...latencySamples.map((s2) => s2.ms));
    console.log(`    per-switch ms: ${latencySamples.map((s2) => `${s2.mode}=${s2.ms}`).join(', ')}`);
    check(latencySamples.length >= 20,
      `performed ${latencySamples.length} mode switches (>= 20 required)`);
    check(maxSwitchMs < 100,
      'mode-switch latency stays under the 100ms target across all 20+ switches',
      `max ${maxSwitchMs}ms`);

    // -- Pass 2: accumulation. Same cycle, this time letting each frame ----
    // actually present before reading the renderer back, so the read
    // cannot race the rAF tail and catch the PREVIOUS mode's counts.
    const accumSamples = [];
    for (const mode of cycle) {
      // eslint-disable-next-line no-await-in-loop
      const sample = await dcPage.evaluate(async (m) => {
        const T = window.__twin;
        T.applyDisplayMode(m);
        T.requestRender();
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        return {
          drawCalls: T.renderer.info.render.calls,
          triangles: T.renderer.info.render.triangles,
          geometries: T.renderer.info.memory.geometries,
          rendered: T.equipmentInstances.length,
          heap: (performance.memory && performance.memory.usedJSHeapSize) || null,
        };
      }, mode);
      accumSamples.push({ mode, ...sample });
    }
    // Draw calls and geometry count legitimately vary WITH the mode -- more
    // visible assets costs more of both -- but the SAME mode drawn twice,
    // anywhere in a 20-switch cycle, must cost exactly the same every time.
    // A variance above zero here is exactly the accumulation bug this phase
    // fixed: meshes from a previous mode never disposed, so a repeat of the
    // same mode keeps costing more.
    const drawCallVarianceByMode = MODES.map((m) => {
      const vals = accumSamples.filter((s2) => s2.mode === m).map((s2) => s2.drawCalls);
      return Math.max(...vals) - Math.min(...vals);
    });
    const geometryVarianceByMode = MODES.map((m) => {
      const vals = accumSamples.filter((s2) => s2.mode === m).map((s2) => s2.geometries);
      return Math.max(...vals) - Math.min(...vals);
    });
    const heapSamples = accumSamples.map((s2) => s2.heap).filter((h) => h !== null);
    console.log(`  20+ switch accumulation: ${accumSamples.length} switches, `
      + `draw-call variance by mode [${drawCallVarianceByMode.join(', ')}], `
      + `geometry variance by mode [${geometryVarianceByMode.join(', ')}]`
      + (heapSamples.length ? `, heap ${(heapSamples[0] / 1e6).toFixed(1)}MB -> ${(heapSamples[heapSamples.length - 1] / 1e6).toFixed(1)}MB` : ''));
    check(drawCallVarianceByMode.every((v) => v === 0),
      'repeating the same mode anywhere in a 20-switch cycle always costs the same draw calls (no mesh accumulation)',
      `variance by mode: ${MODES.map((m, i) => `${m}=${drawCallVarianceByMode[i]}`).join(', ')}`);
    check(geometryVarianceByMode.every((v) => v === 0),
      'repeating the same mode anywhere in a 20-switch cycle always costs the same geometry count',
      `variance by mode: ${MODES.map((m, i) => `${m}=${geometryVarianceByMode[i]}`).join(', ')}`);
    if (heapSamples.length < 2) {
      skip('JS heap stays within normal noise across repeated switching', 'performance.memory not exposed by this browser');
    } else {
      // Generous on purpose: GC timing is not deterministic, and this is a
      // leak smoke test, not a budget. A genuine per-switch leak of 20
      // uncollected mode datasets would blow well past 3x; ordinary GC noise
      // will not.
      const heapGrowthRatio = heapSamples[heapSamples.length - 1] / heapSamples[0];
      check(heapGrowthRatio < 3,
        'JS heap stays within normal noise across repeated switching, no runaway growth',
        `${(heapSamples[0] / 1e6).toFixed(1)}MB -> ${(heapSamples[heapSamples.length - 1] / 1e6).toFixed(1)}MB `
        + `(x${heapGrowthRatio.toFixed(2)})`);
    }
  }
  await dcBrowser.close();

  await browser.close();

  console.log(`\n${failures === 0 ? `FACTORY TWIN REGRESSION PASSED${DIRECT_URL ? ' (DIRECT MODE - access control NOT verified)' : ''}` : `FACTORY TWIN REGRESSION FAILED (${failures})`}`);
  if (skipped > 0) {
    console.log(`${skipped} check(s) SKIPPED and NOT counted as passing -- see the reasons above.`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
