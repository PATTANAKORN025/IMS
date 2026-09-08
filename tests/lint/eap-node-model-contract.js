#!/usr/bin/env node
/**
 * Contract check for the Floor 1 EAP node model.
 *
 * The model keeps three populations apart on purpose -- 331 CAD candidates, 210
 * EAP layout cells, 171 machine units -- and the whole value of it is that they
 * stay apart. The failure this guards against is the obvious one: somebody
 * blending the levels to make a single tidy number, deleting CAD candidates to
 * reach the cell count, merging cells to reach the unit count, or filling a null
 * cad_handle with a plausible-looking instance so the renderer has something to
 * draw. Each of those would be silent in the model itself and wrong on the floor.
 *
 * So this asserts the arithmetic that ties the three levels together, the
 * mapping-state counts, the golden 8x5 case in full, and the two discrepancies
 * that are known and deliberately open. It also refuses a cad_handle that does
 * not resolve to a candidate in the same document, which is what a fabricated
 * identity would look like.
 *
 * Reads only the private, host-local model. On a clone without it, the check
 * reports SKIP and exits zero -- there is nothing to contradict.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PRIVATE_DIR = process.env.FLOOR1_PRIVATE_DIR
  || path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'private');
const MODEL_PATH = path.join(PRIVATE_DIR, 'floor1-eap-node-model.json');

/** The three population sizes the forensic phases established. */
const CAD_CANDIDATES = 331;
const EAP_CELLS = 210;
const MACHINE_UNITS = 171;
/** How the cells and units decompose. */
const SINGLE_CELL_UNITS = 160;
const AGGREGATED_STATIONS = 11;
const CELLS_IN_STATIONS = 48;
const CELLS_WITHOUT_A_UNIT = 2;
/** Mapping states. Only the 8x5 grid is DIRECT; everything else is AMBIGUOUS. */
const DIRECT_CELLS = 40;
const AMBIGUOUS_CELLS = 170;
/** The golden case, measured from the drawing. */
const GRID_COLUMNS = 8;
const GRID_ROWS = 5;
const WITHIN_PAIR_M = 3.42;
const BETWEEN_PAIR_M = 5.08;
const GRID_FIRST = 105;
const GRID_LAST = 144;

let errors = 0;

function check(ok, label, detail) {
  if (ok) {
    console.log(`  PASS  ${label}`);
    return;
  }
  errors += 1;
  console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
}

function eq(actual, want, label) {
  check(actual === want, label, `expected ${want}, got ${actual}`);
}

console.log('EAP Node Model Contract');
console.log('='.repeat(50));

if (!fs.existsSync(MODEL_PATH)) {
  console.log('  SKIP  no EAP node model deployed -- the model is private and '
    + 'host-only; this check is skipped on a clone that does not carry it.');
  process.exit(0);
}

const model = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
const cells = model.eap_cells || [];
const units = model.machine_units || [];
const cad = model.cad_candidates || [];
const t = model.totals || {};

/* ---- the three levels stay three levels ------------------------------- */
eq(cad.length, CAD_CANDIDATES, 'CAD candidate records');
eq(cells.length, EAP_CELLS, 'EAP layout cell records');
eq(units.length, MACHINE_UNITS, 'machine unit records');
eq(model.summary && model.summary.cad_candidates, CAD_CANDIDATES, 'summary CAD count');
eq(model.summary && model.summary.eap_cells, EAP_CELLS, 'summary cell count');
eq(model.summary && model.summary.machine_units, MACHINE_UNITS, 'summary unit count');
eq(model.summary && model.summary.direct_cad_eap, DIRECT_CELLS, 'summary direct count');
eq(model.summary && model.summary.ambiguous_eap_cells, AMBIGUOUS_CELLS,
  'summary ambiguous count');

/* ---- the arithmetic that ties them together ---------------------------- */
const single = units.filter((u) => u.aggregation_type === 'SINGLE_CELL');
const stations = units.filter((u) => u.aggregation_type === 'AGGREGATED_STATION');
const cellsInStations = stations.reduce((s, u) => s + u.cell_ids.length, 0);
const unattached = cells.filter((c) => !c.machine_unit_id);
eq(single.length, SINGLE_CELL_UNITS, 'single-cell machine units');
eq(stations.length, AGGREGATED_STATIONS, 'aggregated station units');
eq(cellsInStations, CELLS_IN_STATIONS, 'cells belonging to aggregated stations');
eq(unattached.length, CELLS_WITHOUT_A_UNIT, 'cells attached to no machine unit');
check(single.length + stations.length === units.length,
  'single-cell units + station units == machine units');
check(single.length + cellsInStations + unattached.length === cells.length,
  'single-cell cells + station cells + unattached cells == EAP cells',
  `${single.length} + ${cellsInStations} + ${unattached.length} != ${cells.length}`);
check(unattached.every((c) => c.unit_state === 'UNASSIGNED'),
  'an unattached cell is UNASSIGNED on the unit axis');
check(!units.some((u) => u.cell_ids.length === 0),
  'no machine unit is empty, so an unattached cell can never be counted as a unit');

/* ---- one cell belongs to at most one unit ------------------------------ */
const claimed = new Map();
let doubleClaimed = 0;
for (const u of units) {
  for (const id of u.cell_ids) {
    if (claimed.has(id)) doubleClaimed += 1;
    claimed.set(id, u.unit_id);
  }
}
eq(doubleClaimed, 0, 'no cell is claimed by two machine units');
check(cells.filter((c) => c.machine_unit_id).every(
  (c) => claimed.get(c.eap_cell_id) === c.machine_unit_id),
'every cell agrees with the unit that lists it');

/* ---- mapping state ------------------------------------------------------ */
const byState = {};
for (const c of cells) byState[c.mapping_state] = (byState[c.mapping_state] || 0) + 1;
eq(byState.DIRECT || 0, DIRECT_CELLS, 'cells in mapping state DIRECT');
eq(byState.AMBIGUOUS || 0, AMBIGUOUS_CELLS, 'cells in mapping state AMBIGUOUS');
check(!cells.some((c) => c.mapping_state === 'UNMATCHED'),
  'UNMATCHED is not used: a cell whose zone or set is known is AMBIGUOUS');
const vocab = (model.state_vocabulary && model.state_vocabulary.cell_mapping_state) || {};
for (const s of ['DIRECT', 'SET_LEVEL', 'AMBIGUOUS', 'UNASSIGNED']) {
  check(Object.prototype.hasOwnProperty.call(vocab, s),
    `the vocabulary declares mapping state ${s}`);
}
check(cells.every((c) => vocab[c.mapping_state] !== undefined),
  'every cell carries a declared mapping state');

/* ---- no fabricated identity -------------------------------------------- */
const handles = new Set(cad.map((r) => r.cad_handle));
const nodeIds = new Set(cad.map((r) => r.machine_node_id));
const withHandle = cells.filter((c) => c.cad_handle);
eq(withHandle.length, DIRECT_CELLS, 'cells carrying a CAD handle');
check(withHandle.every((c) => handles.has(c.cad_handle)),
  'every CAD handle on a cell resolves to a candidate in this document');
check(withHandle.every((c) => nodeIds.has(c.machine_node_id)),
  'every machine node id on a cell resolves to a candidate in this document');
check(withHandle.every((c) => c.mapping_state === 'DIRECT'),
  'a cell only carries a handle when its mapping state is DIRECT');
check(cells.filter((c) => c.mapping_state === 'AMBIGUOUS')
  .every((c) => c.cad_handle === null && c.machine_node_id === null),
'an AMBIGUOUS cell carries no handle -- the gap is left open, not filled');
eq(t.eap_cells_without_a_cad_handle, AMBIGUOUS_CELLS,
  'cells still without a CAD handle');

/* ---- every unit declares what the contract requires --------------------- */
const required = ['unit_id', 'zone_id', 'cell_ids', 'aggregation_type',
  'cad_evidence', 'ims_mapping_state', 'confidence'];
const missing = units.filter((u) => required.some(
  (k) => u[k] === undefined || u[k] === null));
eq(missing.length, 0, 'every machine unit declares the required fields');
check(stations.every((u) => typeof u.aggregation_evidence === 'string'
  && u.aggregation_evidence.length > 20),
'every aggregation states the structure that proves it');
check(units.every((u) => u.ims_mapping_state === 'NOT_MAPPED'),
  'no unit claims an IMS mapping, because no mapping data exists');

/* ---- the golden case ---------------------------------------------------- */
const g = model.golden_case || {};
eq(g.cad_instances, DIRECT_CELLS, 'golden case: CAD instances');
eq(g.grid_columns, GRID_COLUMNS, 'golden case: grid columns');
eq(g.grid_rows, GRID_ROWS, 'golden case: grid rows');
eq(g.within_pair_spacing_m, WITHIN_PAIR_M, 'golden case: within-pair spacing (m)');
eq(g.between_pair_spacing_m, BETWEEN_PAIR_M, 'golden case: between-pair spacing (m)');
eq(g.mapping_state, 'DIRECT', 'golden case: mapping state');
eq(g.placement, 'TRANSFORMED_BODY_POSITION', 'golden case: placement rule');
check(g.insert_origin_offset_m_approx >= 800,
  'golden case: the INSERT base-point offset is recorded',
  `got ${g.insert_origin_offset_m_approx}`);
const gridNumbers = Object.keys(g.link || {}).map(Number).sort((a, b) => a - b);
eq(gridNumbers.length, DIRECT_CELLS, 'golden case: linked layout numbers');
eq(gridNumbers[0], GRID_FIRST, 'golden case: first layout number');
eq(gridNumbers[gridNumbers.length - 1], GRID_LAST, 'golden case: last layout number');
check(gridNumbers.every((n, i) => n === GRID_FIRST + i),
  'golden case: the layout numbers run unbroken with no repeat');
const linkedNodes = new Set(Object.values(g.link || {}));
eq(linkedNodes.size, DIRECT_CELLS, 'golden case: each number links to a distinct instance');
check([...linkedNodes].every((id) => nodeIds.has(id)),
  'golden case: every linked instance exists in the candidate set');

/* ---- the two known, open discrepancies ---------------------------------- */
const k = model.known_discrepancies || {};
const fam = k.fam01_fam03_deficit || {};
eq(fam.non_grid_cad, 62, 'FAM-01/FAM-03: CAD candidates outside the grid');
eq(fam.non_grid_cells, 63, 'FAM-01/FAM-03: layout cells outside the grid');
eq(fam.deficit, 1, 'FAM-01/FAM-03: deficit');
eq(fam.status, 'UNRESOLVED', 'FAM-01/FAM-03: still unresolved, not closed by invention');
const pp = k.pp_cells || {};
eq(pp.layout_cells, 7, 'PP: layout cells');
eq(pp.cad_candidates, 5, 'PP: CAD candidates');
eq(pp.deficit, 2, 'PP: deficit');
eq(pp.labels, 'UNREADABLE', 'PP: labels stay unreadable');

/* ---- one footprint per cell, and only one ------------------------------- */
const footprints = cells.filter((c) => c.eap_footprint);
eq(footprints.length, EAP_CELLS, 'cells carrying an EAP footprint');
check(footprints.every((c) => c.eap_footprint.frame === 'EAP_LAYOUT_FRAME'),
  'every footprint is in the EAP layout frame');
check(footprints.every((c) => c.eap_footprint.rotation_deg === 0),
  'every footprint rotation is zero, as the reference draws them');
check(footprints.every((c) => c.eap_footprint.width > 0 && c.eap_footprint.depth > 0),
  'every footprint has a positive extent');
check(footprints.every((c) => Number.isFinite(c.eap_footprint.x)
  && Number.isFinite(c.eap_footprint.z)),
'every footprint has a finite position');
check(footprints.every((c) => c.eap_footprint.height === null
  && c.eap_footprint.height_state === 'PRESENTATION_ONLY'),
'no footprint carries a height; height is presentation-only');
check(footprints.every((c) => c.eap_footprint.provenance === 'REFERENCE_LAYOUT'),
  'every footprint declares the reference layout as its provenance');
const frame = model.eap_frame || {};
eq(frame.id, 'EAP_LAYOUT_FRAME', 'the model declares the EAP frame');
eq(frame.is_metric, false, 'the EAP frame declares itself non-metric');
check(typeof frame.warning === 'string' && /schematic/i.test(frame.warning),
  'the EAP frame carries its schematic warning');
/* The CAD placement is evidence, kept apart from the drawn footprint so the map
   can never accidentally draw a machine at its CAD-world millimetre position in
   a frame that is not metric. */
const placed = cells.filter((c) => c.cad_placement);
eq(placed.length, DIRECT_CELLS, 'cells carrying a CAD placement as evidence');
check(placed.every((c) => c.cad_placement.frame === 'CAD_WORLD_MM'
  && c.cad_placement.placement_rule === 'TRANSFORMED_BODY_POSITION'),
'every CAD placement names its frame and the transformed-body rule');
check(placed.every((c) => c.mapping_state === 'DIRECT'),
  'only a DIRECT cell carries a CAD placement');

/* ---- spatial registration ------------------------------------------------
   The failure this guards against is a world position appearing on a cell whose
   identity nobody established -- which is what a fitted transform quietly
   applied to the whole floor would produce. A position may exist only where the
   evidence level says it was earned. */
const SPATIAL_LEVELS = ['DIRECT', 'STRUCTURAL', 'SET_LEVEL', 'LAYOUT_ONLY'];
const reg = model.spatial_registration || {};
check(cells.every((c) => SPATIAL_LEVELS.includes(c.spatial_evidence)),
  'every cell carries a declared spatial evidence level');
const spatial = {};
for (const c of cells) {
  spatial[c.spatial_evidence] = (spatial[c.spatial_evidence] || 0) + 1;
}
eq(spatial.DIRECT || 0, DIRECT_CELLS, 'cells with DIRECT spatial evidence');
eq((spatial.DIRECT || 0) + (spatial.STRUCTURAL || 0) + (spatial.SET_LEVEL || 0)
  + (spatial.LAYOUT_ONLY || 0), EAP_CELLS, 'spatial evidence levels sum to the population');
check(SPATIAL_LEVELS.every((l) => l in (reg.evidence_levels || {})),
  'the registration declares all four evidence levels, collapsed into none');
const positioned = cells.filter((c) => c.cad_world_position);
eq(positioned.length, spatial.DIRECT || 0,
  'cells carrying a CAD world position');
check(positioned.every((c) => c.spatial_evidence === 'DIRECT'
  || c.spatial_evidence === 'STRUCTURAL'),
'a world position exists only where the evidence is DIRECT or STRUCTURAL');
check(positioned.every((c) => c.cad_world_position.frame === 'CAD_WORLD_MM'
  && Number.isFinite(c.cad_world_position.x_mm)
  && Number.isFinite(c.cad_world_position.y_mm)),
'every world position names its frame and is finite');
check(positioned.every((c) => c.cad_placement
  && c.cad_placement.x_mm === c.cad_world_position.x_mm
  && c.cad_placement.y_mm === c.cad_world_position.y_mm),
'a world position agrees with the CAD placement it came from');
check(cells.filter((c) => c.spatial_evidence === 'SET_LEVEL'
  || c.spatial_evidence === 'LAYOUT_ONLY')
  .every((c) => c.cad_world_position === null && c.registration_residual_mm === null),
'a SET_LEVEL or LAYOUT_ONLY cell carries no world position and no residual');
check(cells.filter((c) => c.spatial_evidence !== 'DIRECT')
  .every((c) => c.cad_handle === null),
'the registration wrote no CAD handle');
check(cells.filter((c) => c.spatial_evidence === 'DIRECT')
  .every((c) => c.registration_method === 'CAD_INSTANCE_IDENTITY'
    && c.registration_residual_mm === 0),
'a DIRECT cell is placed by identity, not by a transform');
check(reg.global_transform_valid === false,
  'no global transform is claimed valid');
check(Array.isArray(reg.transforms_tested) && reg.transforms_tested.length >= 3,
  'the transforms that were tested are recorded with their residuals');
check((reg.transforms_tested || []).every((t) => t.residual_mm
  && Number.isFinite(t.residual_mm.p50) && typeof t.verdict === 'string'),
'every tested transform records a residual and a verdict');
check(typeof reg.anisotropy_note === 'string' && /anisotropic/i.test(reg.anisotropy_note),
  'the anisotropy is recorded rather than silently removed');
const zoneReg = reg.zones || [];
eq(zoneReg.length, 12, 'zones carrying a registration entry');
eq(zoneReg.reduce((s, z) => s + z.eap_cells, 0), EAP_CELLS,
  'registration zone table sums to the cell population');
check(zoneReg.every((z) => typeof z.stop_reason === 'string' && z.stop_reason.length > 20),
  'every zone states why its registration stops where it does');
check(zoneReg.filter((z) => z.cad_world_region).every(
  (z) => z.cad_world_region.derivation.includes('not a position')),
'a zone world region says it is a region, not a position');

/* ---- the registration is not allowed to become per-cell proof ----------- */
check(typeof model.affine_use === 'string' && /zone-level/i.test(model.affine_use),
  'the CAD-to-image registration is marked zone-level only');

/* ---- zone table reconciles --------------------------------------------- */
const zt = model.zone_table || [];
const zCells = zt.reduce((s, z) => s + z.layout_cells, 0);
const zUnits = zt.reduce((s, z) => s + z.machine_units, 0);
eq(zCells, EAP_CELLS, 'zone table: cells sum to the cell count');
eq(zUnits, MACHINE_UNITS, 'zone table: units sum to the unit count');
const linkedCad = zt.reduce((s, z) => s + z.cad_candidates, 0);
const orphanCad = cad.filter((r) => r.eap_relation === 'NO_EAP_CELL'
  && !r.eap_zone).length;
check(linkedCad + orphanCad === CAD_CANDIDATES,
  'zone table: linked candidates plus candidates with no layout zone == 331',
  `${linkedCad} + ${orphanCad}`);

console.log('='.repeat(50));
console.log(`Results: ${errors} error(s)`);
console.log(errors ? 'EAP NODE MODEL CONTRACT FAILED' : 'EAP NODE MODEL CONTRACT PASSED');
process.exit(errors ? 1 : 0);
