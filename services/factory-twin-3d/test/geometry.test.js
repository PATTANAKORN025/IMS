'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertLayoutGeometry,
  polygonDistance,
  rectPolygon,
  validateLayoutGeometry,
} = require('../geometry');

function zone(zoneId, centerX, centerY, width = 10, depth = 8) {
  return {
    zone_id: zoneId,
    polygon: rectPolygon(centerX, centerY, width, depth),
  };
}

function machine(deviceId, zoneId, posX, posY) {
  return {
    device_id: deviceId,
    zone_id: zoneId,
    pos_x: posX,
    pos_y: posY,
    width: 2,
    depth: 2,
    rot_y: 0,
  };
}

test('measures polygon clearance and accepts the 1.5-unit visual gap', () => {
  const left = zone('left', 0, 0);
  const right = zone('right', 11.5, 0);
  assert.equal(polygonDistance(left.polygon, right.polygon), 1.5);
  const report = validateLayoutGeometry([left, right], [], { minZoneClearance: 1.5 });
  assert.equal(report.valid, true);
  assert.equal(report.observed_min_zone_clearance, 1.5);
});

test('rejects overlapping zones and zones below the minimum clearance', () => {
  const overlap = validateLayoutGeometry([zone('a', 0, 0), zone('b', 8, 0)], []);
  assert.equal(overlap.valid, false);
  assert.equal(overlap.conflicts[0].type, 'zone_overlap');

  const tight = validateLayoutGeometry([zone('a', 0, 0), zone('b', 11, 0)], []);
  assert.equal(tight.valid, false);
  assert.equal(tight.conflicts[0].type, 'zone_clearance');
});

test('rejects machine collisions and machines outside their polygon zone', () => {
  const zones = [zone('a', 0, 0, 12, 10)];
  const machines = [
    machine('M-001', 'a', 0, 0),
    machine('M-002', 'a', 1, 0),
    machine('M-003', 'a', 8, 0),
  ];
  const report = validateLayoutGeometry(zones, machines);
  assert.equal(report.valid, false);
  assert.ok(report.conflicts.some((conflict) => conflict.type === 'machine_collision'));
  assert.ok(report.conflicts.some((conflict) => conflict.type === 'machine_outside_zone'));
  assert.throws(() => assertLayoutGeometry(zones, machines), /geometry validation failed/);
});
