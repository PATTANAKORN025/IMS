/**
 * FT-16 — alarm / RCA context. Pure, no I/O, same discipline as
 * lib/mapping.js and lib/telemetry.js.
 *
 * ALARM EVENT != PHYSICAL ASSET. An alarm belongs to a real IMS device and
 * a real telemetry event; only a CONFIRMED lib/mapping.js entry may ever
 * attach it to a physical CAD asset. This module never infers that
 * attachment from proximity, zone, numbering or any CAD fact -- it takes
 * a reverse device_id -> asset_id table the caller already built from the
 * canonical mapping table, and looks a device up in it exactly once.
 *
 * THE EXACT-EVENT RULE THIS MODULE PRESERVES, NOT RE-DERIVES: a real,
 * already-migrated trigger (051-ldi-alarm-log-event-link.sql) either
 * copies the correct ldi_data.log_id into ldi_alarm_log.related_log_id at
 * insert time, or validates a caller-supplied one actually exists --
 * related_log_id can never point at a non-existent row. The existing
 * public.v_ldi_alarm_context view (053/057/058/062/063) resolves that
 * link with an 'exact' match on related_log_id, falling back to the
 * 'nearest' prior ldi_data row for the same equipment within 5 minutes
 * ONLY when related_log_id is null, and reports which one it used as
 * match_type. server.js's queryAlarmRCA() reuses that SAME two-tier rule
 * (inlined, not re-derived -- see its own comment for why it cannot
 * simply FROM the view) precisely because this project's own existing
 * rule already allows the "nearest" fallback FT-16's own spec says not to
 * invent -- an existing rule, not a new one. match_type null (neither
 * branch matched anything) is the only case this module calls
 * RCA_EVENT_UNRESOLVED.
 */

'use strict';

const mapping = require('./mapping');

/** @readonly @enum {string} */
const AlarmLifecycle = Object.freeze({
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED',
});

/** @readonly @enum {string} */
const EventResolution = Object.freeze({
  EXACT: 'exact',
  NEAREST: 'nearest',
  UNRESOLVED: 'RCA_EVENT_UNRESOLVED',
});

/**
 * Active means "not yet resolved" -- identical to the convention
 * server.js's own STATE_SQL and the Alarm Console dashboard already use
 * (`l.status IS DISTINCT FROM 'RESOLVED'`). No lifecycle row at all
 * (migration 077: alarms that predate lifecycle tracking) counts as
 * active by that same existing rule -- NULL is distinct from 'RESOLVED'.
 *
 * @param {string|null|undefined} lifecycleStatus
 * @returns {boolean}
 */
function isActive(lifecycleStatus) {
  return lifecycleStatus !== AlarmLifecycle.RESOLVED;
}

/**
 * Duration since the alarm fired: to its real resolved_at if resolved
 * (never fabricated -- resolved_at is stamped server-side by migration
 * 077's own trigger, never client-supplied), otherwise to "now" -- the
 * same open-ended elapsed time the existing Alarm Console already shows,
 * generalized to also produce a real, non-fabricated number once resolved.
 *
 * @param {string|Date} logdate
 * @param {string|Date|null} resolvedAt
 * @param {Date} [now]
 * @returns {number|null} milliseconds, or null if logdate is unusable
 */
function durationMs(logdate, resolvedAt, now = new Date()) {
  const start = new Date(logdate).getTime();
  if (!Number.isFinite(start)) return null;
  const end = resolvedAt ? new Date(resolvedAt).getTime() : now.getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

/**
 * The exactness of the RCA telemetry correlation, straight from
 * v_ldi_alarm_context's own match_type column (or this module's inlined
 * equivalent of it) -- never re-derived, never guessed from a timestamp
 * delta computed independently.
 *
 * @param {string|null|undefined} matchType - 'exact' | 'nearest' | null
 * @returns {EventResolution}
 */
function resolveEventType(matchType) {
  if (matchType === 'exact') return EventResolution.EXACT;
  if (matchType === 'nearest') return EventResolution.NEAREST;
  return EventResolution.UNRESOLVED;
}

/**
 * The identity gate for alarm/RCA context -- reuses lib/mapping.js's
 * eligibility() verbatim, renamed to FT-16's own two field names. Only
 * CONFIRMED opens both; CONFLICTING, DEPRECATED and UNRESOLVED all close
 * both, identically -- no fallback identity, no partial credit.
 *
 * @param {string} mappingStatus - a lib/mapping.js MappingStatus value
 * @returns {{physical_overlay_eligible: boolean, machine_drilldown_eligible: boolean}}
 */
function alarmEligibility(mappingStatus) {
  const e = mapping.eligibility(mappingStatus);
  return {
    physical_overlay_eligible: e.alarm_eligible,
    machine_drilldown_eligible: e.drill_down_eligible,
  };
}

/**
 * Assembles one FT-16 canonical alarm event from an already-queried SQL
 * row (server.js's queryAlarmRCA) and the physical identity already
 * resolved for it. Pure reshaping -- no query, no lookup, no I/O.
 *
 * Keeps three identifier spaces visibly separate, per FT-16's own
 * contract: DEVICE ALARM IDENTITY (alarm_id/device_id/alarm_code/...),
 * PHYSICAL ASSET IDENTITY (identity_state/physical_asset_id/eligibility),
 * TELEMETRY EVENT IDENTITY (exact_event/optional_context, built by the
 * caller and passed straight through, never merged into this record's
 * other fields).
 *
 * @param {Object} row - one row from server.js's alarm RCA query
 * @param {{identity_state: string, physical_asset_id: string|null}} identity
 * @param {Object|null} exactEvent - the resolved telemetry event, or null
 * @param {Object[]|null} contextWindow - bounded preceding/following rows, or null (not fetched)
 * @returns {Object|null}
 */
function buildAlarmEvent(row, identity, exactEvent, contextWindow) {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.device_id !== 'string' || !row.device_id) return null;
  const elig = alarmEligibility(identity.identity_state);
  const active = isActive(row.lifecycle_status);
  return {
    alarm_id: row.logid,
    device_id: row.device_id,
    alarm_code: row.errorcode,
    alarm_msg: row.alarm_msg ?? null,
    severity: row.severity ?? null,
    category: row.category ?? null,
    event_time: row.logdate,
    related_log_id: row.related_log_id ?? null,
    active,
    lifecycle_status: row.lifecycle_status ?? null, // null = predates migration 077, distinct from OPEN
    cleared_time: row.resolved_at ?? null,
    duration_ms: durationMs(row.logdate, row.resolved_at ?? null),
    factory: row.factory ?? null,
    process: row.process ?? null,
    identity_state: identity.identity_state,
    physical_asset_id: identity.physical_asset_id,
    physical_overlay_eligible: elig.physical_overlay_eligible,
    machine_drilldown_eligible: elig.machine_drilldown_eligible,
    // Only ever populated when eligibility is open -- see server.js's
    // queryAlarmRCA, which never even computes these for an ineligible row.
    exact_event: elig.physical_overlay_eligible ? exactEvent : null,
    optional_context: elig.physical_overlay_eligible ? (contextWindow ?? null) : null,
  };
}

// Precedence when more than one asset_id names the same device_id under a
// non-confirmed status (validateMappings only guards against a collision
// among CONFIRMED entries -- nothing stops two UNRESOLVED or CONFLICTING
// records independently naming one device, and CONFLICTING is exactly the
// status an author sets to record that this happened). CONFIRMED always
// wins when one exists (at most one ever can, by validateMappings' own
// guarantee); otherwise the more informative non-confirmed status wins,
// so a genuine CONFLICTING record is never masked by an unrelated
// UNRESOLVED one for the same device. A deterministic tie-break, not a
// new identity rule -- eligibility is false for every status but
// CONFIRMED regardless of which one is reported here.
const STATUS_PRECEDENCE = [
  mapping.MappingStatus.CONFIRMED,
  mapping.MappingStatus.CONFLICTING,
  mapping.MappingStatus.DEPRECATED,
  mapping.MappingStatus.UNRESOLVED,
];

/**
 * Reverse index: real device_id -> the highest-precedence
 * {status, assetId} naming it. Built once per request from the same
 * canonical mapping table lib/mapping.js already validates.
 *
 * @param {Object} mappingByAssetId - asset_id -> PhysicalIdentityMapping
 * @returns {Map<string,{status: string, assetId: string}>} device_id -> {status, assetId}
 */
function reverseIdentityIndex(mappingByAssetId) {
  const byDevice = new Map();
  if (!mappingByAssetId || typeof mappingByAssetId !== 'object') return byDevice;
  for (const [assetId, record] of Object.entries(mappingByAssetId)) {
    if (!record || typeof record.ims_device_id !== 'string' || !record.ims_device_id) continue;
    const status = record.mapping_status;
    const deviceId = record.ims_device_id;
    const existing = byDevice.get(deviceId);
    if (!existing || STATUS_PRECEDENCE.indexOf(status) < STATUS_PRECEDENCE.indexOf(existing.status)) {
      byDevice.set(deviceId, { status, assetId });
    }
  }
  return byDevice;
}

/**
 * Identity for one alarm's device_id: whatever the reverse index found
 * naming it, or UNRESOLVED with no asset at all if nothing does -- an
 * alarm on a device nothing claims is not an error, it is the common case
 * (FT-15's own "IMS-only device" case, restated for alarms).
 *
 * @param {string} deviceId
 * @param {Map<string,{status: string, assetId: string}>} reverseIndex
 * @returns {{identity_state: string, physical_asset_id: string|null}}
 */
function identityForDevice(deviceId, reverseIndex) {
  const found = reverseIndex && typeof reverseIndex.get === 'function' ? reverseIndex.get(deviceId) : undefined;
  return found
    ? { identity_state: found.status, physical_asset_id: found.assetId }
    : { identity_state: mapping.MappingStatus.UNRESOLVED, physical_asset_id: null };
}

module.exports = {
  AlarmLifecycle,
  EventResolution,
  isActive,
  durationMs,
  resolveEventType,
  alarmEligibility,
  buildAlarmEvent,
  reverseIdentityIndex,
  identityForDevice,
};
