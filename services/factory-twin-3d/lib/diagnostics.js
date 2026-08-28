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

/** Anonymous zone ids only: zone-NN. Anything else is replaced, never echoed. */
function safeZoneId(id) {
  return typeof id === 'string' && /^zone-\d{1,4}$/.test(id) ? id : 'zone-unknown';
}

/**
 * @param {Object} input
 * @param {Object|null} input.geometry - Private geometry document, or null.
 * @param {Object} input.zoneMeta - Zone layer meta (served/withheld/total/byConfidence/conflicts).
 * @param {number} input.confirmedMappings
 * @param {number} input.simulatedPlacements
 * @param {Object} [input.runtime] - Aggregate counters (requests, errors, durations).
 * @returns {Object} A response containing only counts, booleans and fixed enums.
 */
function buildDiagnostics({ geometry, zoneMeta = {}, confirmedMappings = 0, simulatedPlacements = 0, runtime = {} }) {
  const slots = geometry && Array.isArray(geometry.slots) ? geometry.slots : [];
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
      slot_count: slots.length,
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
      observed_slots: slots.length,
      simulated_machine_positions: count(simulatedPlacements),
      unknown_clear_height: envelope && envelope.clear_height_m == null ? 1 : 0,
      unknown_equipment_height: slots.filter((s) => s && s.height_status === 'unknown').length,
      confirmed_mappings: count(confirmedMappings),
      unresolved_mappings: Math.max(slots.length - count(confirmedMappings), 0),
      column_confidence: tallyConfidence(columns),
      slot_confidence: tallyConfidence(slots),
      zone_confidence: sanitizeTally(zoneMeta.byConfidence),
    },
    // Rebuilt field by field. ids are pattern-checked; status is a fixed enum;
    // free-text resolution notes are deliberately not carried.
    conflicts: (Array.isArray(zoneMeta.conflicts) ? zoneMeta.conflicts : []).map((c) => ({
      ids: (Array.isArray(c && c.ids) ? c.ids : []).map(safeZoneId),
      status: c && c.status === 'CONFLICT' ? 'CONFLICT' : 'UNKNOWN',
      member_count: Array.isArray(c && c.ids) ? c.ids.length : 0,
    })),
    runtime: {
      requests_total: count(runtime.requestsTotal),
      requests_failed: count(runtime.requestsFailed),
      geometry_load_ms_last: count(runtime.geometryLoadMs),
      geometry_parse_failures: count(runtime.geometryParseFailures),
      uptime_seconds: count(runtime.uptimeSeconds),
    },
  };
}

module.exports = { buildDiagnostics };
