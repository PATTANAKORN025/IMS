/**
 * Diagnostics serialization — allowlist by construction.
 *
 * Diagnostics describe private geometry, so a diagnostics response is the most
 * plausible accidental route for that geometry to become public: someone adds
 * a field to the private document, a spread carries it outward, and nobody
 * notices because the endpoint "only returns diagnostics".
 *
 * This module is therefore built to make that impossible rather than unlikely.
 * It never spreads, never copies an object through, and never iterates unknown
 * keys. Every value it returns is a count, a boolean, a fixed enum string, or a
 * number it computed itself. Object identity, coordinates, filenames, paths and
 * free text cannot pass through, because no code path here can emit them.
 *
 * The one exception is deliberate and audited: conflict entries carry anonymous
 * zone ids, which the main geometry API already publishes and which name no
 * real place. They are rebuilt field by field rather than passed through.
 *
 * Pure and side-effect free, so the guarantee can be tested directly by feeding
 * it deliberately poisoned input.
 */

'use strict';

/** Confidence buckets a caller is allowed to report. Anything else is dropped. */
const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low', 'unknown', 'HIGH', 'MEDIUM', 'LOW', 'REJECTED', 'UNRESOLVED']);

/** Coerces to a non-negative integer. Non-numbers become 0 rather than pass through. */
function count(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function bool(v) {
  return v === true;
}

/**
 * Tallies confidence tiers without letting an unexpected key become an output
 * field. An unrecognised tier is counted under "other" rather than echoed,
 * because echoing a key is echoing attacker- or author-controlled text.
 */
function tallyConfidence(items) {
  const out = {};
  let other = 0;
  for (const item of Array.isArray(items) ? items : []) {
    const tier = item && item.confidence;
    if (typeof tier === 'string' && ALLOWED_CONFIDENCE.has(tier)) {
      out[tier] = (out[tier] || 0) + 1;
    } else {
      other++;
    }
  }
  if (other > 0) out.other = other;
  return out;
}

/** Same rule applied to a caller-supplied tally object. */
function sanitizeTally(tally) {
  const out = {};
  let other = 0;
  for (const [k, v] of Object.entries(tally && typeof tally === 'object' ? tally : {})) {
    if (ALLOWED_CONFIDENCE.has(k)) out[k] = count(v);
    else other += count(v);
  }
  if (other > 0) out.other = other;
  return out;
}

/**
 * Latency histogram edges, in milliseconds. Fixed here rather than supplied,
 * so a caller cannot introduce a bucket name and therefore cannot introduce an
 * output field.
 */
const LATENCY_BUCKETS = Object.freeze(['lt_10ms', 'lt_50ms', 'lt_100ms', 'lt_500ms', 'gte_500ms']);

/** Reads only the known bucket names; an unknown key is dropped, never echoed. */
function bucketTally(buckets) {
  const src = buckets && typeof buckets === 'object' ? buckets : {};
  const out = {};
  for (const name of LATENCY_BUCKETS) out[name] = count(src[name]);
  return out;
}

/** Anonymous zone ids only: zone-NN. Anything else is replaced, never echoed. */
function safeZoneId(id) {
  return typeof id === 'string' && /^zone-\d{1,4}$/.test(id) ? id : 'zone-unknown';
}

/**
 * Coverage of the schematic reference layer, as counts only.
 *
 * The question this answers is the one an operator or a runbook actually asks:
 * how much of what the drawing shows is tied to anything real. Today the answer
 * is none of it, and that has to be visible from the safe endpoint rather than
 * inferable only by reading the code.
 *
 * Counts and nothing else. No area name, no drawing label, no coordinate --
 * this response is pasted into tickets, and the security model puts area names
 * on the authenticated geometry route and nowhere else. The two link counts are
 * computed from the records rather than hardcoded to zero, so the day a
 * schematic record does gain a slot or a device the number moves on its own.
 */
function schematicCoverage(schematic) {
  const d = schematic && typeof schematic === 'object' ? schematic : {};
  const areas = Array.isArray(d.areas) ? d.areas : [];
  const banks = Array.isArray(d.banks) ? d.banks : [];
  const snapshots = Array.isArray(d.snapshots) ? d.snapshots : [];
  const labels = banks.flatMap((b) => (Array.isArray(b && b.labels) ? b.labels : []));

  return {
    present: banks.length > 0 || areas.length > 0,
    areas: areas.length,
    banks: banks.length,
    cells: banks.reduce((n, b) => n + count(b && b.columns) * count(b && b.rows), 0),
    observed_labels: labels.length,
    ambiguous_labels: labels.filter((l) => l && l.ambiguous === true).length,
    snapshots: snapshots.length,
    // Two renders declaring one instant and disagreeing is a standing conflict,
    // and a count of it belongs where someone reading health will see it.
    conflicting_snapshots: snapshots.filter(
      (s) => Array.isArray(s && s.conflicts_with) && s.conflicts_with.length > 0
    ).length,
    // The coverage that matters. A schematic record has no field for either
    // today, so both are zero by construction -- and stay zero until an
    // authoritative record introduces one.
    linked_to_physical_slot: banks.filter((b) => b && b.physical_slot_id).length,
    linked_to_ims_device: banks.filter((b) => b && b.ims_device_id).length,
  };
}

/**
 * @param {Object} input
 * @param {Object|null} input.geometry - Private geometry document, or null.
 * @param {Object} input.zoneMeta - Zone layer meta (served/withheld/total/byConfidence/conflicts).
 * @param {number} input.confirmedMappings
 * @param {Object} [input.runtime] - Aggregate counters (requests, errors, durations).
 * @returns {Object} A response containing only counts, booleans and fixed enums.
 */
function buildDiagnostics({
  geometry,
  zoneMeta = {},
  confirmedMappings = 0,
  runtime = {},
  schematic = null,
}) {
  // equipment[] is the physical asset layer. slots[] -- the raster-derived
  // positions -- is not counted here at all: a diagnostics figure is a claim
  // about what the twin is showing, and the twin no longer shows them.
  const equipment = geometry && Array.isArray(geometry.equipment) ? geometry.equipment : [];
  const columns = geometry && Array.isArray(geometry.columns) ? geometry.columns : [];
  const envelope = geometry && geometry.envelope ? geometry.envelope : null;
  const footprint = geometry && geometry.footprint_polygon ? geometry.footprint_polygon : null;
  const grid = geometry && geometry.grid ? geometry.grid : null;

  // schema_version is matched against a strict semver pattern rather than
  // echoed, so a poisoned value cannot ride out on this field.
  const rawVersion = geometry && geometry.schema_version;
  const schemaVersion = typeof rawVersion === 'string' && /^\d+\.\d+\.\d+$/.test(rawVersion) ? rawVersion : null;

  return {
    data: {
      geometry_loaded: Boolean(geometry),
      geometry_schema_version: schemaVersion,
      envelope_present: Boolean(envelope),
      footprint_vertices: footprint && Array.isArray(footprint.vertices) ? footprint.vertices.length : 0,
      grid_x_lines: grid && Array.isArray(grid.x_lines) ? grid.x_lines.length : 0,
      grid_z_lines: grid && Array.isArray(grid.z_lines) ? grid.z_lines.length : 0,
      column_count: columns.length,
      equipment_count: equipment.length,
      equipment_footprint_resolved: equipment.filter(
        (e) => e && e.footprint_status === 'OBSERVED_CAD'
      ).length,
      equipment_footprint_unresolved: equipment.filter(
        (e) => e && e.footprint_status === 'UNRESOLVED'
      ).length,
      // Reported as a hard zero rather than dropped: a reader who remembers the
      // 243 raster slots should see that the count is now none, not find the
      // field missing and wonder whether it was renamed.
      raster_slot_count: 0,
      zone_count_rendered: count(zoneMeta.served),
      zone_count_withheld: count(zoneMeta.withheld),
      zone_count_total: count(zoneMeta.total),
    },
    // Evidence categories stay separate and are never summed: an observed
    // position and a monitored device are different claims.
    evidence: {
      measured_envelope: envelope ? 1 : 0,
      derived_floor_to_floor: envelope && envelope.floor_to_floor === true ? 1 : 0,
      observed_columns: columns.length,
      measured_equipment: equipment.length,
      // Reported as a hard zero rather than dropped. A reader who remembers
      // this floor once carried synthetic machine positions should see that it
      // now carries none, not find the field missing and wonder.
      simulated_machine_positions: 0,
      unknown_clear_height: envelope && envelope.clear_height_m == null ? 1 : 0,
      unknown_equipment_height: equipment.filter((e) => e && e.height_status === 'unknown').length,
      confirmed_mappings: count(confirmedMappings),
      unresolved_mappings: Math.max(equipment.length - count(confirmedMappings), 0),
      column_confidence: tallyConfidence(columns),
      equipment_confidence: tallyConfidence(equipment),
      zone_confidence: sanitizeTally(zoneMeta.byConfidence),
    },
    // Rebuilt field by field. ids are pattern-checked; status is a fixed enum;
    // free-text resolution notes are deliberately not carried.
    conflicts: (Array.isArray(zoneMeta.conflicts) ? zoneMeta.conflicts : []).map((c) => ({
      ids: (Array.isArray(c && c.ids) ? c.ids : []).map(safeZoneId),
      status: c && c.status === 'CONFLICT' ? 'CONFLICT' : 'UNKNOWN',
      member_count: Array.isArray(c && c.ids) ? c.ids.length : 0,
    })),
    schematic: schematicCoverage(schematic),
    runtime: {
      requests_total: count(runtime.requestsTotal),
      requests_failed: count(runtime.requestsFailed),
      geometry_load_ms_last: count(runtime.geometryLoadMs),
      geometry_parse_failures: count(runtime.geometryParseFailures),
      uptime_seconds: count(runtime.uptimeSeconds),
      // Fixed buckets, not per-request timings. A latency list would be an
      // ordered record of individual requests, which is a step back towards
      // "who asked for what"; a histogram over fixed edges answers "is this
      // service slow" without describing any single request.
      latency_buckets: bucketTally(runtime.latencyBuckets),
    },
  };
}

module.exports = { buildDiagnostics, LATENCY_BUCKETS };
