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
    OPERATIONAL_STATUS, STATUS_ORDER, BACKED_STATUSES,
    statusForMachineState, statusForSlot,
  } = await import(pathToFileURL(modPath).href);

  test('the legend declares exactly the eight required states', () => {
    assert.deepStrictEqual([...STATUS_ORDER], [
      'NORMAL', 'WARNING', 'CRITICAL', 'OFFLINE',
      'STALE_DATA', 'MAINTENANCE', 'UNMAPPED', 'PRESENTATION_ONLY',
    ]);
    assert.deepStrictEqual(Object.keys(OPERATIONAL_STATUS).sort(), [...STATUS_ORDER].sort());
  });

  test('status is never carried by colour alone', () => {
    const glyphs = STATUS_ORDER.map((k) => OPERATIONAL_STATUS[k].glyph);
    assert.strictEqual(new Set(glyphs).size, glyphs.length,
      'two states share a glyph, so they differ only by colour');
    for (const k of STATUS_ORDER) {
      assert.ok(OPERATIONAL_STATUS[k].label.length > 0, `${k} has no text label`);
    }
  });

  test('only states with a real backend column are marked backed', () => {
    // lib/contracts.js is explicit that OFF and PM_STOP have no source column
    // in this schema, and no warning tier is derivable from STATE_SQL.
    assert.strictEqual(OPERATIONAL_STATUS.OFFLINE.backed, false);
    assert.strictEqual(OPERATIONAL_STATUS.MAINTENANCE.backed, false);
    assert.strictEqual(OPERATIONAL_STATUS.WARNING.backed, false);
    assert.strictEqual(OPERATIONAL_STATUS.NORMAL.backed, true);
    assert.strictEqual(OPERATIONAL_STATUS.CRITICAL.backed, true);
    assert.strictEqual(OPERATIONAL_STATUS.STALE_DATA.backed, true);
    assert.ok(!BACKED_STATUSES.includes('OFFLINE'));
    assert.ok(!BACKED_STATUSES.includes('MAINTENANCE'));
    assert.ok(!BACKED_STATUSES.includes('WARNING'));
  });

  test('an unresolvable state falls to UNMAPPED, never to NORMAL', () => {
    assert.strictEqual(statusForMachineState(null), 'UNMAPPED');
    assert.strictEqual(statusForMachineState(undefined), 'UNMAPPED');
    assert.strictEqual(statusForMachineState(''), 'UNMAPPED');
    assert.strictEqual(statusForMachineState('NOT_A_STATE'), 'UNMAPPED');
    assert.strictEqual(statusForMachineState('__proto__'), 'UNMAPPED');
    assert.strictEqual(statusForMachineState('constructor'), 'UNMAPPED');
  });

  test('known run-states map to their declared status', () => {
    assert.strictEqual(statusForMachineState('RUN'), 'NORMAL');
    assert.strictEqual(statusForMachineState('DOWN'), 'CRITICAL');
    assert.strictEqual(statusForMachineState('UNKNOWN'), 'STALE_DATA');
    assert.strictEqual(statusForMachineState('OFF'), 'OFFLINE');
    assert.strictEqual(statusForMachineState('PM_STOP'), 'MAINTENANCE');
  });

  test('a slot without an authoritative device id is UNMAPPED', () => {
    const live = new Map([['DEV-1', { state: 'RUN' }]]);
    assert.strictEqual(statusForSlot({ ims_device_id: null }, live), 'UNMAPPED');
    assert.strictEqual(statusForSlot({ ims_device_id: '' }, live), 'UNMAPPED');
    assert.strictEqual(statusForSlot({}, live), 'UNMAPPED');
    assert.strictEqual(statusForSlot(null, live), 'UNMAPPED');
  });

  test('a mapped slot with no live row is STALE, not NORMAL', () => {
    const live = new Map([['DEV-1', { state: 'RUN' }]]);
    assert.strictEqual(statusForSlot({ ims_device_id: 'DEV-2' }, live), 'STALE_DATA');
    assert.strictEqual(statusForSlot({ ims_device_id: 'DEV-1' }, live), 'NORMAL');
  });

  test('a slot cannot acquire a status from position, id or label', () => {
    const live = new Map([['DEV-1', { state: 'RUN' }]]);
    const slot = {
      slot_id: 'DEV-1',                       // id that looks like a device id
      zone_name: 'DEV-1',
      position: { x: 0, z: 0 },
      ims_device_id: null,
    };
    assert.strictEqual(statusForSlot(slot, live), 'UNMAPPED');
  });

  test('a missing or hostile state map cannot produce a live status', () => {
    assert.strictEqual(statusForSlot({ ims_device_id: 'DEV-1' }, null), 'UNMAPPED');
    assert.strictEqual(statusForSlot({ ims_device_id: 'DEV-1' }, {}), 'UNMAPPED');
  });

  test('the vocabulary tables are frozen', () => {
    assert.ok(Object.isFrozen(OPERATIONAL_STATUS));
    assert.ok(Object.isFrozen(OPERATIONAL_STATUS.NORMAL));
    assert.ok(Object.isFrozen(STATUS_ORDER));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
