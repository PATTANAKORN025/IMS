'use strict';

/**
 * The EAP operational map's wire projection.
 *
 * The renderer used to derive its node list from the physical CAD equipment
 * pipeline. That pipeline answers a different question -- where is the plant's
 * equipment, measured -- and answering it produced a display that did not match
 * the operational layout the floor actually works from. The EAP map reads the
 * node model instead: 210 operational cells, 171 machine units, and the mapping
 * state of each. The 331 CAD candidates stay behind this boundary; they are
 * forensic evidence, not a display source.
 *
 * Two rules govern what crosses the wire.
 *
 * The first is disclosure. The model is private: it carries block names, layer
 * names, CAD handles and CAD-world millimetre coordinates, and the last of those
 * would locate the facility. None of it is projected. What a client gets is the
 * EAP footprint -- schematic, in the layout's own frame -- plus opaque ids,
 * counts and fixed enums. The projection is a whitelist for that reason: a new
 * private field added to the model upstream cannot leak through a spread.
 *
 * The second is honesty about status. The reference layout is coloured, and
 * those colours are a snapshot of somebody else's system on the day the image
 * was taken. They are not this system's telemetry and there is no authoritative
 * mapping from a cell to an IMS machine, so every cell's status is UNKNOWN and
 * the colours are not projected at all. What is projected is whether the
 * reference drew the cell lit -- evidence about the reference, not a machine
 * state -- so the map can say "this cell was drawn without status" without any
 * of it turning into a fake RUN or ALARM.
 */

const fs = require('fs');
const path = require('path');

/** Fixed enums. A value outside these never reaches a client. */
const MAPPING_STATES = new Set(['DIRECT', 'SET_LEVEL', 'AMBIGUOUS', 'UNASSIGNED']);
const UNIT_STATES = new Set(['ATTACHED', 'UNASSIGNED']);
const CONFIDENCES = new Set(['HIGH', 'MEDIUM', 'LOW']);
const AGGREGATIONS = new Set(['SINGLE_CELL', 'AGGREGATED_STATION']);
const IMS_STATES = new Set(['NOT_MAPPED']);
const GEOMETRY_SOURCES = new Set(['COLOUR_STRIP', 'COLOUR_RECT', 'UNLIT_BORDER']);
const SPATIAL_EVIDENCE = new Set(['DIRECT', 'STRUCTURAL', 'SET_LEVEL', 'LAYOUT_ONLY']);
const REGISTRATION_METHODS = new Set([
  'CAD_INSTANCE_IDENTITY', 'ZONE_SET_CORRESPONDENCE', 'NONE',
]);

/**
 * The renderer contract, in one place because it is the rule the rest of the
 * system will be tempted to break.
 *
 * A world-space footprint may only be drawn where the cell's position in the
 * world was actually established -- by identity, or by a structural registration
 * that survived its own residual test. Everywhere else the cell is drawn in the
 * reference-layout frame, and the payload says so, so a client cannot mistake a
 * schematic position for a surveyed one.
 */
function worldRenderPermitted(spatial) {
  return spatial === 'DIRECT' || spatial === 'STRUCTURAL';
}

/**
 * Live status eligibility.
 *
 * Two conditions, and both are needed. There must be an authoritative mapping
 * from this cell to an IMS machine -- there is none today, on any cell. And the
 * cell must be more than a drawing on a schematic: a LAYOUT_ONLY cell is not
 * known to correspond to anything in the plant, so even once mappings exist it
 * cannot carry a machine's state. Encoding both now means the rule holds when
 * the first mapping arrives rather than being remembered at that point.
 */
function liveStatusEligible(spatial, imsMapped) {
  if (!imsMapped) return false;
  return spatial !== 'LAYOUT_ONLY';
}

function enumOr(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function num(value) {
  return Number.isFinite(value) ? value : null;
}

/**
 * A footprint reaches the client only if it is complete and in the frame the
 * model declares. A half-built footprint would still draw -- as a rectangle in
 * the wrong place -- so it is rejected rather than defaulted.
 */
function projectFootprint(raw) {
  if (!raw || raw.frame !== 'EAP_LAYOUT_FRAME') return null;
  const x = num(raw.x);
  const z = num(raw.z);
  const width = num(raw.width);
  const depth = num(raw.depth);
  const rotation = num(raw.rotation_deg);
  if (x === null || z === null || rotation === null) return null;
  if (!(width > 0) || !(depth > 0)) return null;
  return {
    frame: 'EAP_LAYOUT_FRAME',
    x,
    z,
    rotation_deg: rotation,
    width,
    depth,
    // Height is a viewing constant. No authoritative CAD height exists for any
    // cell, so the model carries none and the wire carries none; the 3D view
    // picks its own and says so.
    height_state: 'PRESENTATION_ONLY',
    geometry_confidence: enumOr(raw.geometry_confidence, CONFIDENCES, 'LOW'),
    measurement: enumOr(raw.measurement, GEOMETRY_SOURCES, 'UNLIT_BORDER'),
    provenance: raw.provenance === 'REFERENCE_LAYOUT' ? 'REFERENCE_LAYOUT' : 'UNKNOWN',
  };
}

/**
 * CAD evidence, reduced to what a viewer can act on: whether a named instance
 * backs this cell, which CAD area zone it came from, and how many candidates
 * that zone holds. The handle itself stays private -- it is an index into the
 * drawing, and the drawing is not something the normal UI is allowed to browse.
 */
function projectCadEvidence(raw, hasInstance) {
  if (!raw) return { relation: 'NONE', has_cad_instance: false };
  const zones = Array.isArray(raw.cad_zone_ids)
    ? raw.cad_zone_ids.filter((z) => typeof z === 'string' && /^FZ-F1-\d{4}$/.test(z))
    : [];
  return {
    relation: raw.relation === 'DIRECT' ? 'DIRECT' : 'ZONE_SET',
    has_cad_instance: Boolean(hasInstance),
    cad_zone_ids: zones,
    cad_candidates_in_zone: Number.isFinite(raw.cad_candidates_in_zone)
      ? raw.cad_candidates_in_zone : null,
    rule: typeof raw.rule === 'string' ? raw.rule : null,
  };
}

function projectCell(raw) {
  const footprint = projectFootprint(raw.eap_footprint);
  const mappingState = enumOr(raw.mapping_state, MAPPING_STATES, 'AMBIGUOUS');
  const spatialEvidence = enumOr(raw.spatial_evidence, SPATIAL_EVIDENCE, 'LAYOUT_ONLY');
  return {
    cell_id: String(raw.eap_cell_id),
    zone_id: String(raw.zone_id),
    zone_caption: String(raw.zone_caption),
    process: String(raw.process_group),
    // The reference layout's own label. Where the reference is illegible the
    // model says so, and that string is passed through unchanged rather than
    // replaced with a guess or a machine number.
    reference_label: typeof raw.layout_label === 'string' ? raw.layout_label : null,
    footprint,
    mapping_state: mappingState,
    unit_state: enumOr(raw.unit_state, UNIT_STATES, 'UNASSIGNED'),
    machine_unit_id: typeof raw.machine_unit_id === 'string' ? raw.machine_unit_id : null,
    confidence: enumOr(raw.confidence, CONFIDENCES, 'LOW'),
    cad_evidence: projectCadEvidence(raw.cad_evidence, Boolean(raw.cad_handle)),
    // Where this cell stands in the world, and on what evidence. The evidence
    // level crosses the wire; the CAD-world millimetres behind it never do --
    // they would locate the facility, and a client needs to know whether a
    // world position exists, not what it is.
    spatial_evidence: spatialEvidence,
    has_cad_world_position: Boolean(raw.cad_world_position),
    registration_method: enumOr(raw.registration_method, REGISTRATION_METHODS, 'NONE'),
    registration_confidence: enumOr(raw.registration_confidence, CONFIDENCES, 'LOW'),
    world_render_permitted: worldRenderPermitted(spatialEvidence),
    // No mapping from a cell to an IMS machine exists, so there is no status to
    // report. UNKNOWN is the honest value and the only one this route can emit.
    status: 'UNKNOWN',
    status_reason: 'no authoritative IMS mapping exists for this cell',
    // Evidence about the reference image, not a machine state.
    reference_status_drawn: Boolean(raw.status_colour_present),
    live_status_eligible: liveStatusEligible(spatialEvidence, false),
    live_status_blocked_by: 'no authoritative IMS mapping exists for any cell on '
      + 'this floor',
  };
}

function projectUnit(raw) {
  return {
    unit_id: String(raw.unit_id),
    zone_id: String(raw.zone_id),
    process: String(raw.process_group),
    // The station name the reference prints beside the group, with the zone
    // prefix the model uses internally removed.
    reference_label: typeof raw.unit_key === 'string'
      ? raw.unit_key.split(':').pop() : null,
    cell_ids: Array.isArray(raw.cell_ids) ? raw.cell_ids.map(String) : [],
    aggregation_type: enumOr(raw.aggregation_type, AGGREGATIONS, 'SINGLE_CELL'),
    aggregation_evidence: typeof raw.aggregation_evidence === 'string'
      ? raw.aggregation_evidence : null,
    ims_mapping_state: enumOr(raw.ims_mapping_state, IMS_STATES, 'NOT_MAPPED'),
    confidence: enumOr(raw.confidence, CONFIDENCES, 'LOW'),
  };
}

/**
 * Zone outlines are derived from the cells they contain, not from a room
 * polygon: the model has no room geometry, and inventing one would put a wall
 * on the map that the drawing never drew. A bounding box over member cells is
 * honest about what it is -- the extent of the cells in that zone -- and is
 * labelled that way.
 */
function zoneOutlines(cells) {
  const byZone = new Map();
  for (const cell of cells) {
    if (!cell.footprint) continue;
    const f = cell.footprint;
    let z = byZone.get(cell.zone_id);
    if (!z) {
      z = {
        zone_id: cell.zone_id,
        caption: cell.zone_caption,
        process: cell.process,
        cells: 0,
        min_x: Infinity,
        max_x: -Infinity,
        min_z: Infinity,
        max_z: -Infinity,
      };
      byZone.set(cell.zone_id, z);
    }
    z.cells += 1;
    z.min_x = Math.min(z.min_x, f.x - f.width / 2);
    z.max_x = Math.max(z.max_x, f.x + f.width / 2);
    z.min_z = Math.min(z.min_z, f.z - f.depth / 2);
    z.max_z = Math.max(z.max_z, f.z + f.depth / 2);
  }
  return [...byZone.values()].map((z) => ({
    zone_id: z.zone_id,
    caption: z.caption,
    process: z.process,
    cells: z.cells,
    extent: {
      x: (z.min_x + z.max_x) / 2,
      z: (z.min_z + z.max_z) / 2,
      width: z.max_x - z.min_x,
      depth: z.max_z - z.min_z,
    },
    derivation: 'bounding extent of the cells in this zone; not a room boundary',
  }));
}

function projectFrame(raw) {
  if (!raw || raw.id !== 'EAP_LAYOUT_FRAME') return null;
  const extent = raw.extent_m || {};
  return {
    id: 'EAP_LAYOUT_FRAME',
    is_metric: false,
    axes: typeof raw.axes === 'string' ? raw.axes : null,
    extent: { width: num(extent.width), depth: num(extent.depth) },
    warning: typeof raw.warning === 'string' ? raw.warning : null,
  };
}

/** Read the private model. Returns null when it is not deployed. */
function loadModel(privateDir) {
  const file = path.join(privateDir, 'floor1-eap-node-model.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

/**
 * Build the wire payload. Counts are recomputed from the projected records
 * rather than copied from the model's own summary, so a payload can never claim
 * a population it did not actually send.
 */
function project(model) {
  if (!model || !Array.isArray(model.eap_cells) || !Array.isArray(model.machine_units)) {
    return null;
  }
  const cells = model.eap_cells.map(projectCell);
  const units = model.machine_units.map(projectUnit);
  const byState = {};
  const bySpatial = {};
  for (const cell of cells) {
    byState[cell.mapping_state] = (byState[cell.mapping_state] || 0) + 1;
    bySpatial[cell.spatial_evidence] = (bySpatial[cell.spatial_evidence] || 0) + 1;
  }
  const stations = units.filter((u) => u.aggregation_type === 'AGGREGATED_STATION');
  return {
    schema_version: '1.0.0',
    source: 'EAP node model',
    frame: projectFrame(model.eap_frame),
    footprint_contract: {
      rule: 'the 2D map and the 3D box read one footprint; there is no independent '
        + '3D geometry',
      height: 'PRESENTATION_ONLY',
      canonical_frame: 'EAP_LAYOUT_FRAME',
      note: 'the footprint every cell carries is the reference-layout one. A CAD '
        + 'world position, where it exists, is a separate fact and is not the '
        + 'drawn footprint.',
    },
    renderer_contract: {
      DIRECT: 'the world position of this cell is established, so a world-space '
        + 'footprint may be rendered from CAD evidence',
      STRUCTURAL: 'as DIRECT: the set correspondence is proven and a fitted '
        + 'transform reproduced it',
      SET_LEVEL: 'render at set or zone semantic level only; the zone is placed, '
        + 'the individual machine is not',
      LAYOUT_ONLY: 'reference-layout frame only',
      unresolved_cells: 'always drawn. An unresolved identity is a fact about the '
        + 'evidence, never a reason to hide a machine.',
      never: 'no cell is moved to fit the drawing, and no world position is '
        + 'inferred from a neighbour, an offset, a screen size or a machine number',
    },
    live_status_contract: {
      rule: 'a cell may show live status only when an authoritative IMS mapping '
        + 'exists for it AND its spatial evidence is better than LAYOUT_ONLY',
      state_today: 'no mapping exists for any cell, so every status is UNKNOWN',
    },
    counts: {
      cells: cells.length,
      cells_with_a_footprint: cells.filter((c) => c.footprint).length,
      machine_units: units.length,
      single_cell_units: units.length - stations.length,
      aggregated_station_units: stations.length,
      cells_in_aggregated_stations: stations.reduce((s, u) => s + u.cell_ids.length, 0),
      cells_unassigned_to_a_unit: cells.filter((c) => c.unit_state === 'UNASSIGNED').length,
      mapping_state: byState,
      cells_with_a_cad_instance: cells.filter((c) => c.cad_evidence.has_cad_instance).length,
      cells_with_a_cad_world_position: cells.filter((c) => c.has_cad_world_position).length,
      cells_world_render_permitted: cells.filter((c) => c.world_render_permitted).length,
      cells_live_status_eligible: cells.filter((c) => c.live_status_eligible).length,
      spatial_evidence: bySpatial,
      reference_status_drawn: cells.filter((c) => c.reference_status_drawn).length,
    },
    zones: zoneOutlines(cells),
    cells,
    machine_units: units,
  };
}

module.exports = {
  loadModel, project, projectCell, projectUnit, zoneOutlines,
  worldRenderPermitted, liveStatusEligible,
};
