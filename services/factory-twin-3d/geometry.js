'use strict';

const EPSILON = 1e-9;
const DEFAULT_ZONE_CLEARANCE = 1.5;

function finiteNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${fieldName} must be a finite number`);
  return number;
}

function rectPolygon(centerX, centerY, width, depth) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return [
    { x: centerX - halfWidth, y: centerY - halfDepth },
    { x: centerX + halfWidth, y: centerY - halfDepth },
    { x: centerX + halfWidth, y: centerY + halfDepth },
    { x: centerX - halfWidth, y: centerY + halfDepth },
  ];
}

function normalizePolygon(value, fieldName, fallback = null) {
  const source = Array.isArray(value) && value.length > 0 ? value : fallback;
  if (!Array.isArray(source) || source.length < 3) {
    throw new Error(`${fieldName} must contain at least three points`);
  }
  const points = source.map((point, index) => {
    const x = Array.isArray(point) ? point[0] : point?.x;
    const y = Array.isArray(point) ? point[1] : point?.y;
    return {
      x: finiteNumber(x, `${fieldName}[${index}].x`),
      y: finiteNumber(y, `${fieldName}[${index}].y`),
    };
  });
  const twiceArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  if (Math.abs(twiceArea) <= EPSILON) throw new Error(`${fieldName} must enclose a non-zero area`);
  return points;
}

function polygonBounds(points) {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
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

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point, a, b) {
  return Math.abs(orientation(a, b, point)) <= EPSILON
    && point.x >= Math.min(a.x, b.x) - EPSILON
    && point.x <= Math.max(a.x, b.x) + EPSILON
    && point.y >= Math.min(a.y, b.y) - EPSILON
    && point.y <= Math.max(a.y, b.y) + EPSILON;
}

function segmentsIntersect(a, b, c, d) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return (Math.abs(abC) <= EPSILON && pointOnSegment(c, a, b))
    || (Math.abs(abD) <= EPSILON && pointOnSegment(d, a, b))
    || (Math.abs(cdA) <= EPSILON && pointOnSegment(a, c, d))
    || (Math.abs(cdB) <= EPSILON && pointOnSegment(b, c, d));
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[j];
    const b = polygon[i];
    if (pointOnSegment(point, a, b)) return true;
    const crosses = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonsIntersect(left, right) {
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = left[(i + 1) % left.length];
    for (let j = 0; j < right.length; j += 1) {
      const c = right[j];
      const d = right[(j + 1) % right.length];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return pointInPolygon(left[0], right) || pointInPolygon(right[0], left);
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function polygonDistance(left, right) {
  if (polygonsIntersect(left, right)) return 0;
  let distance = Number.POSITIVE_INFINITY;
  for (const point of left) {
    for (let i = 0; i < right.length; i += 1) {
      distance = Math.min(distance, pointSegmentDistance(point, right[i], right[(i + 1) % right.length]));
    }
  }
  for (const point of right) {
    for (let i = 0; i < left.length; i += 1) {
      distance = Math.min(distance, pointSegmentDistance(point, left[i], left[(i + 1) % left.length]));
    }
  }
  return distance;
}

function machinePolygon(machine) {
  const centerX = Number(machine.pos_x) || 0;
  const centerY = Number(machine.pos_y) || 0;
  const halfWidth = (Number(machine.width) || 3.2) / 2;
  const halfDepth = (Number(machine.depth) || 2.5) / 2;
  const rotation = Number(machine.rot_y) || 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([x, y]) => ({
    x: centerX + x * cos - y * sin,
    y: centerY + x * sin + y * cos,
  }));
}

function validateLayoutGeometry(zones, machines, { minZoneClearance = DEFAULT_ZONE_CLEARANCE } = {}) {
  const conflicts = [];
  let minimumZoneClearance = null;
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      const distance = polygonDistance(zones[i].polygon, zones[j].polygon);
      minimumZoneClearance = minimumZoneClearance === null
        ? distance
        : Math.min(minimumZoneClearance, distance);
      if (distance < minZoneClearance - EPSILON) {
        conflicts.push({
          type: distance <= EPSILON ? 'zone_overlap' : 'zone_clearance',
          left: zones[i].zone_id,
          right: zones[j].zone_id,
          distance: Number(distance.toFixed(3)),
        });
      }
    }
  }

  const zoneById = new Map(zones.map((zone) => [zone.zone_id, zone]));
  const machinePolygons = machines.map((machine) => ({ machine, polygon: machinePolygon(machine) }));
  for (const entry of machinePolygons) {
    const zone = zoneById.get(entry.machine.zone_id);
    if (zone && entry.polygon.some((point) => !pointInPolygon(point, zone.polygon))) {
      conflicts.push({ type: 'machine_outside_zone', machine: entry.machine.device_id, zone: zone.zone_id });
    }
  }
  for (let i = 0; i < machinePolygons.length; i += 1) {
    for (let j = i + 1; j < machinePolygons.length; j += 1) {
      if (polygonsIntersect(machinePolygons[i].polygon, machinePolygons[j].polygon)) {
        conflicts.push({
          type: 'machine_collision',
          left: machinePolygons[i].machine.device_id,
          right: machinePolygons[j].machine.device_id,
        });
      }
    }
  }

  return {
    valid: conflicts.length === 0,
    min_zone_clearance: minZoneClearance,
    observed_min_zone_clearance: minimumZoneClearance === null
      ? null
      : Number(minimumZoneClearance.toFixed(3)),
    zone_pairs_checked: (zones.length * (zones.length - 1)) / 2,
    machine_pairs_checked: (machines.length * (machines.length - 1)) / 2,
    conflicts,
  };
}

function assertLayoutGeometry(zones, machines, options) {
  const report = validateLayoutGeometry(zones, machines, options);
  if (!report.valid) {
    const sample = report.conflicts.slice(0, 8).map((conflict) => JSON.stringify(conflict)).join('; ');
    throw new Error(`floor layout geometry validation failed: ${sample}`);
  }
  return report;
}

module.exports = {
  DEFAULT_ZONE_CLEARANCE,
  assertLayoutGeometry,
  machinePolygon,
  normalizePolygon,
  pointInPolygon,
  polygonBounds,
  polygonDistance,
  polygonsIntersect,
  rectPolygon,
  validateLayoutGeometry,
};
