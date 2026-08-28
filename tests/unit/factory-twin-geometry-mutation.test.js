/**
 * Mutation tests for the Floor 1 geometry validator.
 *
 * A validator that only ever sees valid data proves nothing. Each case here
 * takes a known-good geometry, corrupts exactly one thing, and asserts the
 * validator fails with the matching message — then asserts the uncorrupted
 * baseline still passes, so a rule that fires on everything is caught too.
 *
 * Fixtures are built in a temp directory and the validator is pointed at them
 * via FACTORY_TWIN_PRIVATE_DIR. The real private data is never modified.
 *
 * When no private geometry exists on this machine the suite SKIPS rather than
 * fails: absence is the expected state on a fresh clone, and a skipped run is
 * honest where a green run would not be.
 *
 * Run: node tests/unit/factory-twin-geometry-mutation.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REAL_DIR = path.join(__dirname, '..', '..', 'services', 'factory-twin-3d', 'private');
const VALIDATOR = path.join(__dirname, '..', 'lint', 'floor1-geometry-validator.js');
const GEO = path.join(REAL_DIR, 'floor1-geometry.json');
const ZONES = path.join(REAL_DIR, 'floor1-zones.json');

if (!fs.existsSync(GEO)) {
  console.log('  SKIP  no private geometry on this machine — mutation tests need a baseline to corrupt');
  console.log('\n0 passed, 0 failed, 1 skipped');
  process.exit(0);
}

const baseGeometry = JSON.parse(fs.readFileSync(GEO, 'utf8'));
const baseZones = fs.existsSync(ZONES) ? fs.readFileSync(ZONES, 'utf8') : null;

let passed = 0;
let failed = 0;

// Returns { ok, output }. The validator exits non-zero on failure.
function runValidator(geometry) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-mutation-'));
  try {
    fs.writeFileSync(path.join(dir, 'floor1-geometry.json'), JSON.stringify(geometry));
    if (baseZones) fs.writeFileSync(path.join(dir, 'floor1-zones.json'), baseZones);
    try {
      const out = execFileSync(process.execPath, [VALIDATOR], {
        env: { ...process.env, FACTORY_TWIN_PRIVATE_DIR: dir },
        encoding: 'utf8',
      });
      return { ok: true, output: out };
    } catch (e) {
      return { ok: false, output: `${e.stdout || ''}${e.stderr || ''}` };
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const clone = () => JSON.parse(JSON.stringify(baseGeometry));

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}

// A corruption must fail, and must fail for the stated reason.
function mutation(name, mutate, needle) {
  test(name, () => {
    const g = clone();
    mutate(g);
    const res = runValidator(g);
    assert.ok(!res.ok, 'validator accepted corrupted geometry');
    assert.ok(
      res.output.includes(needle),
      `expected an error mentioning "${needle}", got:\n${res.output.split('\n').filter((l) => l.includes('ERROR')).join('\n')}`
    );
  });
}

// ── the control: without it, a rule that fires on everything looks like a pass ──
test('the uncorrupted baseline passes', () => {
  const res = runValidator(clone());
  assert.ok(res.ok, `baseline failed:\n${res.output}`);
});

// ── schema and coordinate system ──
mutation('unsupported schema major is rejected', (g) => { g.schema_version = '99.0.0'; }, 'this runtime supports major');
mutation('malformed schema_version is rejected', (g) => { g.schema_version = 'two'; }, 'malformed schema_version');
mutation('non-metre units are rejected', (g) => { g.coordinate_system.units = 'feet'; }, 'units must be "metres"');
mutation('a floor level without a source is rejected', (g) => { delete g.coordinate_system.floor_level_source; }, 'no floor_level_source');

// ── height semantics ──
mutation('an unsourced clear height is rejected', (g) => { g.envelope.clear_height_m = 4; }, 'no clear_height_source');
mutation('a clear height above floor-to-floor is rejected', (g) => {
  g.envelope.clear_height_m = 99; g.envelope.clear_height_source = 'synthetic';
}, 'contradictory height semantics');
mutation('floor_to_floor without a derivation is rejected', (g) => { delete g.envelope.height_source; }, 'height_source is missing');

// ── footprint topology ──
mutation('a repeated first vertex is rejected', (g) => {
  g.footprint_polygon.vertices.push({ ...g.footprint_polygon.vertices[0] });
}, 'implicitly closed');
mutation('a non-finite footprint vertex is rejected', (g) => {
  g.footprint_polygon.vertices[0].x = null;
}, 'not a valid number');
mutation('a stale winding record is rejected', (g) => {
  g.footprint_polygon.winding = g.footprint_polygon.winding === 'CW' ? 'CCW' : 'CW';
}, 'winding is recorded as');

// ── grid ──
mutation('a grid span total that disagrees with the envelope is rejected', (g) => {
  g.grid.x_spans_mm[0] += 5000;
}, 'spans sum to');
mutation('a non-finite grid line is rejected', (g) => { g.grid.z_lines[2] = Infinity; }, 'is not finite');

// ── columns ──
mutation('a column outside the footprint is rejected', (g) => {
  g.columns[0].position.x = -86.9; g.columns[0].position.z = 59.9;
}, 'outside the validated footprint');
mutation('a column without detector evidence is rejected', (g) => { delete g.columns[1].detector; }, 'no detector metadata');
mutation('a duplicate column id is rejected', (g) => { g.columns[1].id = g.columns[0].id; }, 'duplicate column id');
mutation('a LOW-confidence column is rejected', (g) => { g.columns[0].confidence = 'low'; }, 'LOW-confidence structural geometry');
mutation('a zero-width column is rejected', (g) => { g.columns[0].footprint.width = 0; }, 'must be > 0');
mutation('columns without their detection block are rejected', (g) => { delete g.column_detection; }, 'column_detection metadata is missing');

// ── slots ──
mutation('a slot outside the footprint is rejected', (g) => {
  g.slots[0].position.x = -86.9; g.slots[0].position.z = 59.9;
}, 'outside the validated footprint');
mutation('a slot without detection metadata is rejected', (g) => { delete g.slots[0].detection; }, 'no detection metadata');
mutation('a slot without geometry_status is rejected', (g) => { delete g.slots[0].geometry_status; }, 'missing geometry_status');
mutation('a LOW-confidence slot is rejected', (g) => { g.slots[0].confidence = 'low'; }, 'LOW-confidence equipment geometry');
mutation('a dangling slot zone reference is rejected', (g) => { g.slots[0].zone_id = 'zone-does-not-exist'; }, 'does not exist in the zone file');
mutation('slots without their detection block are rejected', (g) => { delete g.equipment_detection; }, 'equipment_detection metadata is missing');
mutation('a slot claiming a live machine state while unmapped is rejected', (g) => { g.slots[0].status = 'RUN'; }, 'unmapped slots must be geometry-only');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
