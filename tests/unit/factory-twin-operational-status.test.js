/**
 * Operational status vocabulary tests — public/operational-status.js
 *
 * These are not shape tests. The module encodes two promises an operator
 * relies on, and each one gets a test that fails loudly if it is ever broken:
 *
 *   1. A state that cannot be established never reads as a healthy machine.
 *   2. A status lamp is never advertised as backed unless a real column
 *      feeds it.
 *
 * Run: node tests/unit/factory-twin-operational-status.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

async function main() {
  const modPath = path.join(
    __dirname, '..', '..', 'services', 'factory-twin-3d', 'public',
    'operational-status.js'
  );
  const {
    OPERATIONAL_STATUS, STATUS_ORDER, BACKED_STATUSES, DATA_QUALITY,
    statusForMachineState, statusForAsset,
  } = await import(pathToFileURL(modPath).href);

  test('the legend declares exactly the eight plant states, in order', () => {
    assert.deepStrictEqual([...STATUS_ORDER], [
      'OFF', 'DOWN', 'IDLE', 'INITIAL', 'PM', 'STOP', 'RUN', 'UNDEFINED',
    ]);
    assert.deepStrictEqual(Object.keys(OPERATIONAL_STATUS).sort(), [...STATUS_ORDER].sort());
  });

  test('the monitoring dialect the twin invented is gone', () => {
    // These read as plant states but are not: they were this view's own
    // vocabulary, and an operator comparing the board against the line's HMI
    // had to translate. None of them may reappear as a machine state.
    for (const gone of ['NORMAL', 'WARNING', 'CRITICAL', 'OFFLINE',
      'STALE_DATA', 'MAINTENANCE', 'PRESENTATION_ONLY']) {
      assert.ok(!(gone in OPERATIONAL_STATUS), `${gone} is back in the machine states`);
      assert.ok(!STATUS_ORDER.includes(gone), `${gone} is back in the legend order`);
    }
  });

  test('data quality is held apart from the machine states', () => {
    // UNMAPPED is a fact about the record, not about the machine. Folding it
    // into the eight would let a missing mapping read as a plant condition.
    assert.ok(!('UNMAPPED' in OPERATIONAL_STATUS));
    assert.ok(!STATUS_ORDER.includes('UNMAPPED'));
    assert.ok(DATA_QUALITY.UNMAPPED, 'UNMAPPED is not declared as a data-quality indicator');
    assert.ok(DATA_QUALITY.UNMAPPED.label.length > 0);
  });

  test('status is never carried by colour alone', () => {
    const glyphs = STATUS_ORDER.map((k) => OPERATIONAL_STATUS[k].glyph);
    assert.strictEqual(new Set(glyphs).size, glyphs.length,
      'two states share a glyph, so they differ only by colour');
    for (const k of STATUS_ORDER) {
      assert.ok(OPERATIONAL_STATUS[k].label.length > 0, `${k} has no text label`);
    }
    assert.ok(!glyphs.includes(DATA_QUALITY.UNMAPPED.glyph),
      'the data-quality glyph collides with a machine state');
  });

  test('only states with a real backend column are marked backed', () => {
    // STATE_SQL derives exactly four outcomes. lib/contracts.js is explicit
    // that OFF, INITIAL, PM and STOP have no source column in this schema.
    assert.strictEqual(OPERATIONAL_STATUS.RUN.backed, true);
    assert.strictEqual(OPERATIONAL_STATUS.IDLE.backed, true);
    assert.strictEqual(OPERATIONAL_STATUS.DOWN.backed, true);
    assert.strictEqual(OPERATIONAL_STATUS.UNDEFINED.backed, true);
    for (const unbacked of ['OFF', 'INITIAL', 'PM', 'STOP']) {
      assert.strictEqual(OPERATIONAL_STATUS[unbacked].backed, false, `${unbacked} claims a source`);
      assert.ok(!BACKED_STATUSES.includes(unbacked));
    }
    assert.strictEqual(BACKED_STATUSES.length, 4);
  });

  test('every state carries a machineState, and they are all distinct', () => {
    // The legend and the renderer key on the same vocabulary. A state with no
    // machineState, or two sharing one, would let a lookup answer for the
    // wrong lamp.
    const seen = new Set();
    for (const k of STATUS_ORDER) {
      const ms = OPERATIONAL_STATUS[k].machineState;
      assert.ok(typeof ms === 'string' && ms.length > 0, `${k} carries no machineState`);
      assert.ok(!seen.has(ms), `machineState ${ms} is claimed twice`);
      seen.add(ms);
    }
  });

  test('an unresolvable state falls to UNDEFINED, never to a plausible one', () => {
    // UNDEFINED, specifically: not OFF, which would assert a powered-down
    // machine, and not RUN, which would assert a healthy one.
    for (const bad of [null, undefined, '', 'NOT_A_STATE', '__proto__', 'constructor', 7, {}]) {
      assert.strictEqual(statusForMachineState(bad), 'UNDEFINED', `${String(bad)} resolved elsewhere`);
    }
  });

  test('known run-states map to themselves', () => {
    for (const k of STATUS_ORDER) {
      assert.strictEqual(statusForMachineState(OPERATIONAL_STATUS[k].machineState), k);
    }
  });

  test('an asset without an authoritative device id is UNMAPPED', () => {
    const live = new Map([['DEV-1', { machine_state: 'RUN' }]]);
    assert.strictEqual(statusForAsset({ ims_device_id: null }, live), 'UNMAPPED');
    assert.strictEqual(statusForAsset({ ims_device_id: '' }, live), 'UNMAPPED');
    assert.strictEqual(statusForAsset({}, live), 'UNMAPPED');
    assert.strictEqual(statusForAsset(null, live), 'UNMAPPED');
  });

  test('a mapped asset with no live row is UNDEFINED, not UNMAPPED', () => {
    // The distinction matters: the link exists, so the record is fine. What is
    // missing is telemetry, and that is exactly what UNDEFINED names.
    const live = new Map([['DEV-1', { machine_state: 'RUN' }]]);
    assert.strictEqual(statusForAsset({ ims_device_id: 'DEV-2' }, live), 'UNDEFINED');
    assert.strictEqual(statusForAsset({ ims_device_id: 'DEV-1' }, live), 'RUN');
  });

  test('an asset cannot acquire a status from position, id or label', () => {
    const live = new Map([['DEV-1', { machine_state: 'RUN' }]]);
    const asset = {
      id: 'DEV-1',                             // id that looks like a device id
      zone_name: 'DEV-1',
      position: { x: 0, z: 0 },
      ims_device_id: null,
    };
    assert.strictEqual(statusForAsset(asset, live), 'UNMAPPED');
  });

  test('a missing or hostile state map cannot produce a live status', () => {
    assert.strictEqual(statusForAsset({ ims_device_id: 'DEV-1' }, null), 'UNMAPPED');
    assert.strictEqual(statusForAsset({ ims_device_id: 'DEV-1' }, {}), 'UNMAPPED');
  });

  test('the vocabulary tables are frozen', () => {
    assert.ok(Object.isFrozen(OPERATIONAL_STATUS));
    assert.ok(Object.isFrozen(OPERATIONAL_STATUS.RUN));
    assert.ok(Object.isFrozen(STATUS_ORDER));
    assert.ok(Object.isFrozen(DATA_QUALITY));
    assert.ok(Object.isFrozen(DATA_QUALITY.UNMAPPED));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
