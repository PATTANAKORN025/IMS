'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { computeFloorOneLayout, loadConfiguredLayout, parseLocation } = require('../layout');

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

test('loads a private layout contract and preserves unbound state bindings', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-floor-layout-'));
  const file = path.join(tempDir, 'floor.local.json');
  fs.writeFileSync(file, JSON.stringify({
    schema_version: 1,
    floor: {
      id: 'private-floor-1',
      name: 'Private Floor 1',
      level: 1,
      layout_mode: 'private_local',
      coordinate_source: 'local_only',
      verification_status: 'DRAFT',
      private_note: 'must not leave the loader',
    },
    zones: [{
      zone_id: 'zone-a',
      name: 'Zone A',
      polygon: [
        { x: -10, y: -5 }, { x: 10, y: -5 }, { x: 10, y: 5 }, { x: -10, y: 5 },
      ],
      internal_note: 'private',
    }],
    machines: [{
      asset_id: 'ASSET-001',
      zone_id: 'zone-a',
      pos_x: 1,
      pos_y: 2,
      internal_ip: '192.0.2.1',
      state_binding: { type: 'unbound', source_id: null },
    }],
  }));

  const layout = loadConfiguredLayout(file);
  assert.equal(layout.floor.verification_status, 'DRAFT');
  assert.equal(layout.floor.is_simulated, true);
  assert.equal(layout.machines[0].device_id, 'ASSET-001');
  assert.equal(layout.machines[0].state_binding.type, 'unbound');
  assert.equal(layout.zones[0].machine_count, 1);
  assert.equal(layout.zones[0].polygon.length, 4);
  assert.equal(layout.geometry_validation.valid, true);
  assert.equal(Object.hasOwn(layout.floor, 'private_note'), false);
  assert.equal(Object.hasOwn(layout.zones[0], 'internal_note'), false);
  assert.equal(Object.hasOwn(layout.machines[0], 'internal_ip'), false);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('rejects duplicate assets and unknown zone references', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-floor-layout-invalid-'));
  const file = path.join(tempDir, 'floor.local.json');
  fs.writeFileSync(file, JSON.stringify({
    schema_version: 1,
    floor: {
      id: 'floor-1',
      name: 'Floor 1',
      level: 1,
      layout_mode: 'private_local',
      coordinate_source: 'local_only',
      verification_status: 'DRAFT',
    },
    zones: [{ zone_id: 'zone-a', name: 'Zone A', center_x: 0, center_y: 0, width: 20, depth: 10 }],
    machines: [{ asset_id: 'ASSET-001', zone_id: 'missing', pos_x: 0, pos_y: 0 }],
  }));
  assert.throws(() => loadConfiguredLayout(file), /unknown zone_id/);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('accepts status_api bindings only when a source ID is present', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-floor-layout-api-'));
  const file = path.join(tempDir, 'floor.local.json');
  const base = {
    schema_version: 1,
    floor: {
      id: 'floor-1', name: 'Floor 1', level: 1, layout_mode: 'private_local',
      coordinate_source: 'local_only', verification_status: 'DRAFT',
    },
    zones: [{ zone_id: 'zone-a', name: 'Zone A', center_x: 0, center_y: 0, width: 20, depth: 10 }],
    machines: [{
      asset_id: 'DRL-001', zone_id: 'zone-a', pos_x: 0, pos_y: 0,
      state_binding: { type: 'status_api', source_id: 'CFM-DRL-001' },
    }],
  };
  fs.writeFileSync(file, JSON.stringify(base));
  assert.equal(loadConfiguredLayout(file).machines[0].state_binding.type, 'status_api');
  base.machines[0].state_binding.source_id = null;
  fs.writeFileSync(file, JSON.stringify(base));
  assert.throws(() => loadConfiguredLayout(file), /required for status_api/);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('accepts machine_event bindings only when an equipment ID is present', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-floor-layout-machine-event-'));
  const file = path.join(tempDir, 'floor.local.json');
  const base = {
    schema_version: 1,
    floor: {
      id: 'floor-1', name: 'Floor 1', level: 1, layout_mode: 'private_local',
      coordinate_source: 'local_only', verification_status: 'DRAFT',
    },
    zones: [{ zone_id: 'zone-a', name: 'Zone A', center_x: 0, center_y: 0, width: 20, depth: 10 }],
    machines: [{
      asset_id: 'DRILL-054', zone_id: 'zone-a', pos_x: 0, pos_y: 0,
      state_binding: { type: 'machine_event', source_id: 'DRL054-M' },
    }],
  };
  fs.writeFileSync(file, JSON.stringify(base));
  assert.equal(loadConfiguredLayout(file).machines[0].state_binding.type, 'machine_event');
  assert.equal(loadConfiguredLayout(file).machines[0].state_binding.source_id, 'DRL054-M');
  base.machines[0].state_binding.source_id = null;
  fs.writeFileSync(file, JSON.stringify(base));
  assert.throws(() => loadConfiguredLayout(file), /required for machine_event/);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('rejects a missing configured file and invalid dimensions', () => {
  assert.throws(
    () => loadConfiguredLayout(path.join(os.tmpdir(), 'definitely-missing-floor-layout.json')),
    /not found/,
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-floor-layout-dimension-'));
  const file = path.join(tempDir, 'floor.local.json');
  fs.writeFileSync(file, JSON.stringify({
    schema_version: 1,
    floor: {
      id: 'floor-1',
      name: 'Floor 1',
      level: 1,
      layout_mode: 'private_local',
      coordinate_source: 'local_only',
      verification_status: 'DRAFT',
    },
    zones: [{ zone_id: 'zone-a', name: 'Zone A', center_x: 0, center_y: 0, width: 0, depth: 10 }],
    machines: [],
  }));
  assert.throws(() => loadConfiguredLayout(file), /greater than zero/);
  fs.rmSync(tempDir, { recursive: true, force: true });
});
