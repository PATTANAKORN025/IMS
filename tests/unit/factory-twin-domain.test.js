/**
 * Tests for the new services/factory-twin-3d/domain/*.ts contracts
 * (Step 1 of the Next.js/R3F architecture evolution, see
 * docs/evidence/FACTORY_TWIN_DOMAIN_MODEL.md).
 *
 * These are DOMAIN CONTRACT tests, not a re-test of app.js/eap.js/wire.js
 * themselves (those already have their own suites). What this file checks:
 *
 *   1. Operational states  -- the domain's machine-state vocabulary stays
 *      in exact parity with the two existing, independently-maintained JS
 *      copies (lib/contracts.js, public/operational-status.js).
 *   2. Invalid combinations -- unrecognised/missing state never resolves
 *      to a plausible-looking state.
 *   3. DTO -> Domain        -- lib/wire.js's REAL projectEquipment output
 *      structurally satisfies the domain Asset/Machine contract.
 *   4. Geometry             -- domain extraction does not alter coordinates
 *      lib/wire.js's projectors already computed.
 *   5. Selection            -- the two selectable kinds app.js's pick
 *      handlers actually produce match SelectionState's kinds.
 *   6. Camera               -- CameraState's default view matches app.js's
 *      own default, and the shape is deterministic.
 *
 * Run: node tests/unit/factory-twin-domain.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { requireTs } = require('./lib/require-ts');

const DOMAIN_DIR = path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'domain');
const machineState = requireTs(path.join(DOMAIN_DIR, 'machine-state.ts'));
const cameraDomain = requireTs(path.join(DOMAIN_DIR, 'camera.ts'));

const operationalStatusSrc = require.resolve(
  '../../services/factory-twin-3d/public/operational-status.js',
);
// operational-status.js is an ES module (export const ...); read+eval its
// source against a tiny CJS shim rather than require()-ing it directly.
const fs = require('fs');
const vm = require('vm');
function loadEsmAsCjs(filePath) {
  const src = fs.readFileSync(filePath, 'utf8').replace(/^export\s+/gm, '');
  const sandbox = { module: { exports: {} }, exports: {} };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(`${src}\nmodule.exports = { OPERATIONAL_STATUS, STATUS_ORDER, BACKED_STATUSES, statusForMachineState, statusForAsset, DATA_QUALITY };`, sandbox, { filename: filePath });
  return sandbox.module.exports;
}
const operationalStatus = loadEsmAsCjs(operationalStatusSrc);

const contracts = require('../../services/factory-twin-3d/lib/contracts');
const wire = require('../../services/factory-twin-3d/lib/wire');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Operational states -- parity against both existing JS copies
// ---------------------------------------------------------------------------

test('MACHINE_STATE_ORDER has exactly the 8 plant states, matching operational-status.js', () => {
  assert.deepStrictEqual(
    [...machineState.MACHINE_STATE_ORDER].sort(),
    [...operationalStatus.STATUS_ORDER].sort(),
  );
  assert.strictEqual(machineState.MACHINE_STATE_ORDER.length, 8);
});

test('MACHINE_STATE_THEME matches public/operational-status.js field-by-field', () => {
  for (const key of machineState.MACHINE_STATE_ORDER) {
    const domain = machineState.MACHINE_STATE_THEME[key];
    const live = operationalStatus.OPERATIONAL_STATUS[key];
    assert.ok(live, `operational-status.js has no entry for ${key}`);
    assert.strictEqual(domain.label, live.label, `${key}.label`);
    assert.strictEqual(domain.glyph, live.glyph, `${key}.glyph`);
    assert.strictEqual(domain.color, live.color, `${key}.color`);
    assert.strictEqual(domain.hex, live.hex, `${key}.hex`);
    assert.strictEqual(domain.backed, live.backed, `${key}.backed`);
  }
});

test('MACHINE_STATE_THEME matches lib/contracts.js MACHINE_STATE_THEME (label/hex)', () => {
  for (const key of machineState.MACHINE_STATE_ORDER) {
    const domain = machineState.MACHINE_STATE_THEME[key];
    const live = contracts.MACHINE_STATE_THEME[contracts.MachineState[key]];
    assert.strictEqual(domain.hex, live.color, `${key}.hex vs contracts.js color`);
    assert.strictEqual(domain.label, live.label, `${key}.label vs contracts.js label`);
  }
});

test('BACKED_MACHINE_STATES matches operational-status.js BACKED_STATUSES exactly', () => {
  assert.deepStrictEqual(
    [...machineState.BACKED_MACHINE_STATES].sort(),
    [...operationalStatus.BACKED_STATUSES].sort(),
  );
  // The 4 states this deployment's backend can actually produce today.
  assert.deepStrictEqual([...machineState.BACKED_MACHINE_STATES].sort(), [
    'DOWN', 'IDLE', 'RUN', 'UNDEFINED',
  ]);
});

// ---------------------------------------------------------------------------
// 2. Invalid combinations
// ---------------------------------------------------------------------------

test('resolveMachineState never fabricates a plausible state for bad input', () => {
  assert.strictEqual(machineState.resolveMachineState(undefined), 'UNDEFINED');
  assert.strictEqual(machineState.resolveMachineState(null), 'UNDEFINED');
  assert.strictEqual(machineState.resolveMachineState(''), 'UNDEFINED');
  assert.strictEqual(machineState.resolveMachineState('NOT_A_REAL_STATE'), 'UNDEFINED');
  assert.strictEqual(machineState.resolveMachineState(42), 'UNDEFINED');
  // NO_DATA / UNAVAILABLE are not MachineStateCode values at all -- feeding
  // either in must not silently become DOWN (the exact mistake Step 1 was
  // asked to prevent).
  assert.strictEqual(machineState.resolveMachineState('NO_DATA'), 'UNDEFINED');
  assert.strictEqual(machineState.resolveMachineState('UNAVAILABLE'), 'UNDEFINED');
});

test('resolveMachineState round-trips every real state to itself', () => {
  for (const key of machineState.MACHINE_STATE_ORDER) {
    assert.strictEqual(machineState.resolveMachineState(key), key);
  }
});

test('resolveMachineState matches operational-status.js statusForMachineState for every input', () => {
  const inputs = [...machineState.MACHINE_STATE_ORDER, null, undefined, '', 'GARBAGE', 'NO_DATA'];
  for (const input of inputs) {
    assert.strictEqual(
      machineState.resolveMachineState(input),
      operationalStatus.statusForMachineState(input),
      `mismatch for input ${JSON.stringify(input)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. DTO -> Domain: lib/wire.js's real projectEquipment output structurally
//    satisfies the Asset contract (obviously-synthetic TEST-* fixture, same
//    convention as tests/unit/factory-twin-wire.test.js).
// ---------------------------------------------------------------------------

const REQUIRED_ASSET_FIELDS = [
  'id', 'position', 'rotation_deg', 'footprint', 'footprint_status',
  'footprint_source', 'footprint_shape', 'footprint_polygon', 'display_shape',
  'display_representation', 'display_source', 'operational_footprint',
  'operational_axis_offset_deg', 'orientation_geometry_mismatch',
  'operational_excludes_enclosure', 'display_area_error', 'overlaps_neighbour',
  'mirrored', 'geometry_status', 'confidence', 'source', 'height_status',
  'zone_id', 'zone_status', 'ims_device_id', 'mapping_status', 'status',
  'identity_status', 'evidence_source', 'evidence_source_record',
  'evidence_verified_at', 'evidence_confidence', 'live_status_eligible',
  'alarm_eligible', 'drill_down_eligible', 'duplicate_of', 'evidence_tier',
];

function fixtureEquipment(overrides) {
  return Object.assign({
    id: 'TEST-EQP-0001',
    position: { x: 1, y: 0, z: 2 },
    rotation_deg: 90,
    footprint_status: 'MEASURED_CAD',
    footprint: { width: 1.2, depth: 0.8 },
    footprint_source: 'cad_block_geometry',
    footprint_shape: 'rectangle',
    geometry_status: 'measured',
    confidence: 'high',
    source: 'TEST-cad',
    height_status: 'unknown',
    zone_id: 'zone-01',
    zone_status: 'INSIDE_ROOM',
  }, overrides);
}

test('wire.projectEquipment output has every Asset field (unmapped case)', () => {
  const projected = wire.projectEquipment(fixtureEquipment({}), {});
  assert.ok(projected, 'projectEquipment returned null for a valid fixture');
  for (const field of REQUIRED_ASSET_FIELDS) {
    assert.ok(field in projected, `Asset is missing field "${field}"`);
  }
  assert.strictEqual(projected.status, 'UNMAPPED');
  assert.strictEqual(projected.mapping_status, 'UNMAPPED_TO_IMS');
  assert.strictEqual(projected.ims_device_id, null);
  assert.strictEqual(projected.live_status_eligible, false);
});

test('isMachine() (via the compiled domain guard) agrees with wire.js eligibility', () => {
  const { isMachine } = machineStateModuleForAsset();
  const unmapped = wire.projectEquipment(fixtureEquipment({}), {});
  assert.strictEqual(isMachine(unmapped), false);

  // A CONFIRMED mapping, matching lib/mapping.js's real shape closely enough
  // for wire.js's own resolveMapping()/eligibility() to grant eligibility --
  // mirrors the fixture pattern in tests/unit/factory-twin-wire.test.js.
  const mapping = {
    'TEST-EQP-0002': {
      ims_device_id: 'TEST-DEVICE-01',
      mapping_status: 'confirmed',
      source: 'TEST',
      source_record: 'TEST',
      verified_at: '2026-01-01T00:00:00.000Z',
      confidence: 'high',
    },
  };
  const mapped = wire.projectEquipment(fixtureEquipment({ id: 'TEST-EQP-0002' }), mapping);
  assert.ok(mapped);
  if (mapped.live_status_eligible) {
    assert.strictEqual(isMachine(mapped), true);
    assert.strictEqual(mapped.ims_device_id, 'TEST-DEVICE-01');
  } else {
    // wire.js's real mapping-lib shape may require more fields than this
    // fixture supplies -- if so, this documents that rather than asserting
    // a false eligibility.
    assert.strictEqual(isMachine(mapped), false);
  }
});

function machineStateModuleForAsset() {
  return requireTs(path.join(DOMAIN_DIR, 'asset.ts'));
}

// ---------------------------------------------------------------------------
// 4. Geometry -- domain extraction does not alter authoritative coordinates
// ---------------------------------------------------------------------------

test('wire.projectEnvelope passes width/depth/height through unchanged', () => {
  const projected = wire.projectEnvelope({ width: 174.5, depth: 120.3, height: 8.4, clear_height_m: null });
  assert.deepStrictEqual(projected, { width: 174.5, depth: 120.3, height: 8.4, clear_height_m: null });
});

test('wire.projectColumn passes position through unchanged', () => {
  const projected = wire.projectColumn({ id: 'TEST-COL-01', position: { x: 12.25, z: -7.5 } });
  assert.ok(projected);
  assert.deepStrictEqual(projected.position, { x: 12.25, z: -7.5 });
});

test('wire.projectWall passes both endpoints through unchanged', () => {
  const projected = wire.projectWall({
    id: 'TEST-WALL-01', x1: 1.1, z1: 2.2, x2: 3.3, z2: 4.4, thickness: 0.2,
  });
  assert.ok(projected);
  assert.strictEqual(projected.x1, 1.1);
  assert.strictEqual(projected.z1, 2.2);
  assert.strictEqual(projected.x2, 3.3);
  assert.strictEqual(projected.z2, 4.4);
});

// ---------------------------------------------------------------------------
// 5. Selection -- matches app.js's two actual selectable kinds
// ---------------------------------------------------------------------------

test('selection.ts kinds match app.js pickEquipment()/pickColumn() (2 kinds + none)', () => {
  const selection = requireTs(path.join(DOMAIN_DIR, 'selection.ts'));
  const none = { kind: 'none' };
  assert.strictEqual(selection.isSelectionEmpty(none), true);
  assert.strictEqual(selection.isSelectionEmpty({ kind: 'equipment', asset: {} }), false);
  assert.strictEqual(selection.isSelectionEmpty({ kind: 'column', column: {} }), false);
});

// ---------------------------------------------------------------------------
// 6. Camera -- deterministic, matches app.js's own default
// ---------------------------------------------------------------------------

test('DEFAULT_VIEW matches app.js\'s own default (activeView = \'plan\')', () => {
  const appSrc = fs.readFileSync(
    path.join(DOMAIN_DIR, '..', 'public', 'app.js'),
    'utf8',
  );
  assert.ok(/let activeView = 'plan'/.test(appSrc), "app.js's default view drifted from 'plan'");
  assert.strictEqual(cameraDomain.DEFAULT_VIEW, 'plan');
});

test('CameraState construction is deterministic (same input -> structurally equal output)', () => {
  const build = () => ({
    view: cameraDomain.DEFAULT_VIEW,
    position: { x: 0, y: 40, z: 0 },
    target: { x: 0, y: 0, z: 0 },
  });
  assert.deepStrictEqual(build(), build());
  assert.deepStrictEqual(cameraDomain.VIEW_NAMES, ['plan', 'overview', 'building']);
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
