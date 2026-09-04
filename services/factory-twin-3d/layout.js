'use strict';

const fs = require('fs');
const {
  DEFAULT_ZONE_CLEARANCE,
  assertLayoutGeometry,
  normalizePolygon,
  polygonBounds,
  rectPolygon,
} = require('./geometry');

// Floor 1 is a logical, provisional arrangement derived only from the
// device registry's `location` values. It must not be presented as a
// surveyed physical floor plan until real coordinates are supplied.
const FLOOR = Object.freeze({
  id: 'floor-1',
  name: 'Floor 1',
  level: 1,
  layout_mode: 'provisional_logical',
  coordinate_source: 'public.devices.location',
  is_simulated: true,
});

const MACHINE_SPACING_X = 5;
const MACHINE_SPACING_Y = 5;
const ZONE_PADDING = 8;
const FLOOR_PADDING = 8;
const MAX_MACHINE_COLUMNS = 3;
const ZONE_CLEARANCE = 2;

function naturalCompare(left, right) {
  return String(left).localeCompare(String(right), 'en', {
    numeric: true,
    sensitivity: 'base',
  });
}

function normalizeLocation(location) {
  const value = String(location || '').trim();
  return value || 'Unassigned';
}

// Supported examples:
//   Site A - Zone 1
//   Factory 2 - DF INNER
// Anything else remains visible under a deterministic "Other" group.
function parseLocation(location) {
  const normalized = normalizeLocation(location);
  const parts = normalized.split(/\s+-\s+/, 2);
  if (parts.length === 2 && parts[0] && parts[1]) {
    return {
      location: normalized,
      group: parts[0],
      area: parts[1],
    };
  }
  return {
    location: normalized,
    group: normalized === 'Unassigned' ? 'Unassigned' : 'Other',
    area: normalized,
  };
}

function computeZoneSize(machineCount) {
  const columns = Math.max(1, Math.min(MAX_MACHINE_COLUMNS, machineCount));
  const rows = Math.max(1, Math.ceil(machineCount / columns));
  return {
    columns,
    rows,
    width: Math.max(16, (columns - 1) * MACHINE_SPACING_X + ZONE_PADDING * 2),
    depth: Math.max(14, (rows - 1) * MACHINE_SPACING_Y + ZONE_PADDING * 2),
  };
}

function computeBounds(zones) {
  if (zones.length === 0) {
    return {
      min_x: -10,
      max_x: 10,
      min_y: -8,
      max_y: 8,
      width: 20,
      depth: 16,
      center_x: 0,
      center_y: 0,
    };
  }

  const zoneBounds = zones.map((zone) => polygonBounds(zone.polygon));
  const minX = Math.min(...zoneBounds.map((bounds) => bounds.min_x)) - FLOOR_PADDING;
  const maxX = Math.max(...zoneBounds.map((bounds) => bounds.max_x)) + FLOOR_PADDING;
  const minY = Math.min(...zoneBounds.map((bounds) => bounds.min_y)) - FLOOR_PADDING;
  const maxY = Math.max(...zoneBounds.map((bounds) => bounds.max_y)) + FLOOR_PADDING;
  return {
    min_x: minX,
    max_x: maxX,
    min_y: minY,
    max_y: maxY,
    width: maxX - minX,
    depth: maxY - minY,
    center_x: (minX + maxX) / 2,
    center_y: (minY + maxY) / 2,
  };
}

function computeFloorOneLayout(deviceRows) {
  const byLocation = new Map();

  for (const row of deviceRows || []) {
    if (!row || !row.device_id) continue;
    const parsed = parseLocation(row.location);
    if (!byLocation.has(parsed.location)) {
      byLocation.set(parsed.location, {
        ...parsed,
        device_ids: [],
      });
    }
    byLocation.get(parsed.location).device_ids.push(String(row.device_id));
  }

  const byGroup = new Map();
  for (const zone of byLocation.values()) {
    if (!byGroup.has(zone.group)) byGroup.set(zone.group, []);
    byGroup.get(zone.group).push(zone);
  }

  const groupNames = [...byGroup.keys()].sort(naturalCompare);
  const zones = [];
  const machines = [];

  const groups = groupNames.map((groupName) => {
    const groupZones = byGroup.get(groupName)
      .sort((a, b) => naturalCompare(a.area, b.area))
      .map((zone) => ({
        ...zone,
        device_ids: [...zone.device_ids].sort(naturalCompare),
        size: computeZoneSize(zone.device_ids.length),
      }));
    return {
      name: groupName,
      zones: groupZones,
      depth: Math.max(...groupZones.map((zone) => zone.size.depth)),
    };
  });
  const totalDepth = groups.reduce((sum, group) => sum + group.depth, 0)
    + Math.max(0, groups.length - 1) * ZONE_CLEARANCE;
  let groupCursorY = -totalDepth / 2;

  groups.forEach((group) => {
    const groupWidth = group.zones.reduce((sum, zone) => sum + zone.size.width, 0)
      + Math.max(0, group.zones.length - 1) * ZONE_CLEARANCE;
    let zoneCursorX = -groupWidth / 2;
    const centerY = groupCursorY + group.depth / 2;

    group.zones.forEach((zone) => {
      const deviceIds = zone.device_ids;
      const size = zone.size;
      const centerX = zoneCursorX + size.width / 2;
      const zoneId = `${FLOOR.id}:${zone.location.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
      const polygon = rectPolygon(centerX, centerY, size.width, size.depth);
      const zoneBounds = polygonBounds(polygon);

      zones.push({
        zone_id: zoneId,
        name: zone.location,
        group: group.name,
        area: zone.area,
        center_x: centerX,
        center_y: centerY,
        width: size.width,
        depth: size.depth,
        polygon,
        label_x: zoneBounds.min_x + 0.8,
        label_y: zoneBounds.min_y + 1.7,
        machine_count: deviceIds.length,
      });

      const machineCenterX = (size.columns - 1) / 2;
      const machineRows = Math.ceil(deviceIds.length / size.columns);
      const machineCenterY = (machineRows - 1) / 2;

      deviceIds.forEach((deviceId, machineIndex) => {
        const column = machineIndex % size.columns;
        const row = Math.floor(machineIndex / size.columns);
        const factoryMatch = group.name.match(/^Factory\s+(\d+)/i);
        machines.push({
          device_id: deviceId,
          floor_id: FLOOR.id,
          floor_name: FLOOR.name,
          zone_id: zoneId,
          zone: zone.location,
          layout_group: group.name,
          area: zone.area,
          factory: factoryMatch ? factoryMatch[1] : null,
          pos_x: centerX + (column - machineCenterX) * MACHINE_SPACING_X,
          pos_y: centerY + (row - machineCenterY) * MACHINE_SPACING_Y,
          pos_z: 0,
          rot_x: 0,
          rot_y: 0,
          rot_z: 0,
          scale: 1,
          is_simulated: true,
          source: 'provisional_logical_floor_1',
        });
      });
      zoneCursorX += size.width + ZONE_CLEARANCE;
    });
    groupCursorY += group.depth + ZONE_CLEARANCE;
  });

  const geometryValidation = assertLayoutGeometry(zones, machines, {
    minZoneClearance: ZONE_CLEARANCE,
  });
  return {
    floor: { ...FLOOR },
    zones,
    machines,
    bounds: computeBounds(zones),
    geometry_validation: geometryValidation,
  };
}

function requireFiniteNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${fieldName} must be a finite number`);
  return number;
}

function requirePositiveNumber(value, fieldName) {
  const number = requireFiniteNumber(value, fieldName);
  if (number <= 0) throw new Error(`${fieldName} must be greater than zero`);
  return number;
}

function requireString(value, fieldName) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${fieldName} is required`);
  return text;
}

function loadConfiguredLayout(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) throw new Error(`configured floor layout not found: ${filePath}`);

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object') throw new Error('floor layout must be a JSON object');
  if (Number(parsed.schema_version) !== 1) throw new Error('floor layout schema_version must be 1');
  if (!parsed.floor || typeof parsed.floor !== 'object') throw new Error('floor layout requires floor metadata');
  if (!Array.isArray(parsed.zones)) throw new Error('floor layout requires a zones array');
  if (!Array.isArray(parsed.machines)) throw new Error('floor layout requires a machines array');

  const floorId = requireString(parsed.floor.id, 'floor.id');
  const floorName = requireString(parsed.floor.name, 'floor.name');
  const level = requireFiniteNumber(parsed.floor.level, 'floor.level');
  if (!Number.isInteger(level)) throw new Error('floor.level must be an integer');
  const layoutMode = requireString(parsed.floor.layout_mode, 'floor.layout_mode');
  const coordinateSource = requireString(parsed.floor.coordinate_source, 'floor.coordinate_source');
  const verificationStatus = requireString(parsed.floor.verification_status, 'floor.verification_status');
  if (!['DRAFT', 'REVIEWED', 'APPROVED'].includes(verificationStatus)) {
    throw new Error('floor.verification_status must be DRAFT, REVIEWED or APPROVED');
  }

  const zoneIds = new Set();
  const zones = parsed.zones.map((zone, index) => {
    const zoneId = String(zone.zone_id || '').trim();
    if (!zoneId) throw new Error(`zones[${index}].zone_id is required`);
    if (zoneIds.has(zoneId)) throw new Error(`duplicate zone_id: ${zoneId}`);
    zoneIds.add(zoneId);
    let fallbackPolygon = null;
    if (!Array.isArray(zone.polygon) || zone.polygon.length === 0) {
      const centerX = requireFiniteNumber(zone.center_x, `zones[${index}].center_x`);
      const centerY = requireFiniteNumber(zone.center_y, `zones[${index}].center_y`);
      const width = requirePositiveNumber(zone.width, `zones[${index}].width`);
      const depth = requirePositiveNumber(zone.depth, `zones[${index}].depth`);
      fallbackPolygon = rectPolygon(centerX, centerY, width, depth);
    }
    const polygon = normalizePolygon(zone.polygon, `zones[${index}].polygon`, fallbackPolygon);
    const bounds = polygonBounds(polygon);
    return {
      zone_id: zoneId,
      name: String(zone.name || zoneId),
      group: String(zone.group || floorName),
      area: String(zone.area || zone.name || zoneId),
      center_x: bounds.center_x,
      center_y: bounds.center_y,
      width: bounds.width,
      depth: bounds.depth,
      polygon,
      label_x: bounds.min_x + 0.8,
      label_y: bounds.min_y + 1.7,
    };
  });

  const assetIds = new Set();
  const machines = parsed.machines.map((machine, index) => {
    const assetId = String(machine.asset_id || machine.device_id || '').trim();
    if (!assetId) throw new Error(`machines[${index}].asset_id is required`);
    if (assetIds.has(assetId)) throw new Error(`duplicate asset_id: ${assetId}`);
    assetIds.add(assetId);
    const zoneId = String(machine.zone_id || '').trim();
    if (!zoneIds.has(zoneId)) throw new Error(`machines[${index}] references unknown zone_id: ${zoneId}`);
    const binding = machine.state_binding && typeof machine.state_binding === 'object'
      ? machine.state_binding
      : { type: 'unbound' };
    const bindingType = String(binding.type || 'unbound').toLowerCase();
    if (!['ldi', 'machine_event', 'status_api', 'unbound'].includes(bindingType)) {
      throw new Error(`machines[${index}].state_binding.type must be ldi, machine_event, status_api or unbound`);
    }
    const sourceId = binding.source_id ? String(binding.source_id).trim() : null;
    if (['ldi', 'machine_event', 'status_api'].includes(bindingType) && !sourceId) {
      throw new Error(`machines[${index}].state_binding.source_id is required for ${bindingType}`);
    }
    return {
      asset_id: assetId,
      device_id: assetId,
      display_name: String(machine.display_name || assetId),
      zone_id: zoneId,
      floor_id: floorId,
      floor_name: floorName,
      pos_x: requireFiniteNumber(machine.pos_x, `machines[${index}].pos_x`),
      pos_y: requireFiniteNumber(machine.pos_y, `machines[${index}].pos_y`),
      pos_z: requireFiniteNumber(machine.pos_z ?? 0, `machines[${index}].pos_z`),
      rot_x: requireFiniteNumber(machine.rot_x ?? 0, `machines[${index}].rot_x`),
      rot_y: requireFiniteNumber(machine.rot_y ?? 0, `machines[${index}].rot_y`),
      rot_z: requireFiniteNumber(machine.rot_z ?? 0, `machines[${index}].rot_z`),
      width: requirePositiveNumber(machine.width ?? 3.2, `machines[${index}].width`),
      height: requirePositiveNumber(machine.height ?? 1.45, `machines[${index}].height`),
      depth: requirePositiveNumber(machine.depth ?? 2.5, `machines[${index}].depth`),
      state_binding: {
        type: bindingType,
        source_id: sourceId,
      },
      is_simulated: verificationStatus !== 'APPROVED',
      source: coordinateSource,
    };
  });

  const machineCountByZone = new Map();
  for (const machine of machines) {
    machineCountByZone.set(machine.zone_id, (machineCountByZone.get(machine.zone_id) || 0) + 1);
  }
  for (const zone of zones) zone.machine_count = machineCountByZone.get(zone.zone_id) || 0;

  const geometryValidation = assertLayoutGeometry(zones, machines, {
    minZoneClearance: DEFAULT_ZONE_CLEARANCE,
  });

  const computedBounds = computeBounds(zones);
  const bounds = parsed.bounds
    ? {
        min_x: requireFiniteNumber(parsed.bounds.min_x, 'bounds.min_x'),
        max_x: requireFiniteNumber(parsed.bounds.max_x, 'bounds.max_x'),
        min_y: requireFiniteNumber(parsed.bounds.min_y, 'bounds.min_y'),
        max_y: requireFiniteNumber(parsed.bounds.max_y, 'bounds.max_y'),
        width: requirePositiveNumber(parsed.bounds.width, 'bounds.width'),
        depth: requirePositiveNumber(parsed.bounds.depth, 'bounds.depth'),
        center_x: requireFiniteNumber(parsed.bounds.center_x, 'bounds.center_x'),
        center_y: requireFiniteNumber(parsed.bounds.center_y, 'bounds.center_y'),
      }
    : computedBounds;

  return {
    schema_version: 1,
    floor: {
      id: floorId,
      name: floorName,
      level,
      layout_mode: layoutMode,
      coordinate_source: coordinateSource,
      verification_status: verificationStatus,
      inventory_status: parsed.floor.inventory_status
        ? String(parsed.floor.inventory_status)
        : 'INVENTORY_NOT_DECLARED',
      is_simulated: verificationStatus !== 'APPROVED',
    },
    zones,
    machines,
    bounds,
    geometry_validation: geometryValidation,
  };
}

module.exports = {
  FLOOR,
  computeFloorOneLayout,
  computeBounds,
  loadConfiguredLayout,
  parseLocation,
};
