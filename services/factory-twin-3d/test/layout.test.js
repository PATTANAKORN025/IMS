'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeFloorOneLayout, parseLocation } = require('../layout');

const TEN_DEVICE_ROWS = [
  ['LDI-01', 'Site A - Zone 1'],
  ['LDI-02', 'Site A - Zone 1'],
  ['LDI-03', 'Site B - Zone 1'],
  ['LDI-04', 'Site B - Zone 1'],
  ['LDI-05', 'Site A - Zone 2'],
  ['LDI-06', 'Site A - Zone 2'],
  ['LDI-07', 'Site A - Zone 3'],
  ['LDI-08', 'Site A - Zone 3'],
  ['LDI-09', 'Site B - Zone 2'],
  ['LDI-10', 'Site B - Zone 2'],
].map(([device_id, location]) => ({ device_id, location }));

test('parses both Site/Zone and Factory/Process registry labels', () => {
  assert.deepEqual(parseLocation('Site A - Zone 1'), {
    location: 'Site A - Zone 1',
    group: 'Site A',
    area: 'Zone 1',
  });
  assert.deepEqual(parseLocation('Factory 2 - DF INNER'), {
    location: 'Factory 2 - DF INNER',
    group: 'Factory 2',
    area: 'DF INNER',
  });
});

test('builds a deterministic Floor 1 layout for all registered machines', () => {
  const forward = computeFloorOneLayout(TEN_DEVICE_ROWS);
  const reversed = computeFloorOneLayout([...TEN_DEVICE_ROWS].reverse());

  assert.equal(forward.floor.id, 'floor-1');
  assert.equal(forward.floor.layout_mode, 'provisional_logical');
  assert.equal(forward.floor.is_simulated, true);
  assert.equal(forward.zones.length, 5);
  assert.equal(forward.machines.length, 10);
  assert.deepEqual(forward, reversed);
});

test('uses separate logical rows for Site A and Site B', () => {
  const layout = computeFloorOneLayout(TEN_DEVICE_ROWS);
  const siteAY = new Set(layout.zones.filter((zone) => zone.group === 'Site A').map((zone) => zone.center_y));
  const siteBY = new Set(layout.zones.filter((zone) => zone.group === 'Site B').map((zone) => zone.center_y));

  assert.equal(siteAY.size, 1);
  assert.equal(siteBY.size, 1);
  assert.notEqual([...siteAY][0], [...siteBY][0]);
});

test('never overlaps machine coordinates when a zone grows beyond two machines', () => {
  const expandedRows = Array.from({ length: 23 }, (_, index) => ({
    device_id: `LDI-${String(index + 1).padStart(2, '0')}`,
    location: index < 9 ? 'Site A - Zone 1' : index < 16 ? 'Site A - Zone 2' : 'Site B - Zone 1',
  }));
  const layout = computeFloorOneLayout(expandedRows);
  const coordinates = layout.machines.map((machine) => `${machine.pos_x},${machine.pos_y}`);

  assert.equal(layout.machines.length, 23);
  assert.equal(new Set(coordinates).size, 23);
  assert.ok(layout.machines.every((machine) => machine.source === 'provisional_logical_floor_1'));
});
