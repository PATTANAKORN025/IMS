/**
 * FT-15 — live telemetry overlay: freshness, and the identity-gated join
 * between real device telemetry and a physical CAD asset.
 *
 * Pure. No I/O, no DB access, no mutation -- exactly like lib/mapping.js,
 * for the same reason: this is the one place DEVICE IDENTITY (a real
 * monitored device, /api/state's own concern, untouched by this module),
 * PHYSICAL IDENTITY (lib/mapping.js's CONFIRMED/CONFLICTING/DEPRECATED/
 * UNRESOLVED lifecycle) and TELEMETRY STATE (freshness, machine state,
 * alarm) meet, so it is the one place their conflation would happen by
 * accident if this module did I/O of its own.
 *
 * THE GATE THIS MODULE EXISTS TO ENFORCE. A physical CAD asset receives
 * live state, alarm context and a drill-down link ONLY when
 * mapping.eligibility(identity.mapping_status).live_status_eligible is
 * true -- i.e. only when lib/mapping.js says CONFIRMED. Every other
 * lifecycle state (UNRESOLVED, CONFLICTING, DEPRECATED) produces NO
 * overlay entry for that asset, never a degraded or partial one.
 *
 * Real device telemetry (state, freshness, alarm) is computed and returned
 * for a device independently of whether any physical asset is mapped to
 * it -- an IMS-only device is not an error, it is the common case, and
 * /api/state (unchanged by this module) keeps serving it either way.
 */

'use strict';

const mapping = require('./mapping');

/**
 * @readonly
 * @enum {string}
 */
const Freshness = Object.freeze({
  /** Reporting, and within the staleness window. */
  LIVE: 'LIVE',
  /** Has reported before, but not within the staleness window. */
  STALE: 'STALE',
  /** Never reported (or the device is not one this deployment tracks). */
  NO_DATA: 'NO_DATA',
  /** The staleness fact itself could not be established. Never a default
   * for a normal query result -- reserved for a malformed input this
   * module refuses to guess about, so a query bug reads as UNKNOWN, never
   * as a plausible-looking LIVE. */
  UNKNOWN: 'UNKNOWN',
});

/**
 * Deterministic freshness from the SAME two booleans
 * v_ldi_machine_latest_full (migration 052) already computes and every
 * other consumer of that view already keys off -- has_data and is_stale,
 * on the view's own existing 5-minute threshold. Nothing here invents a
 * new timing semantic; it names the one this plant's schema already has.
 *
 * @param {boolean} hasData
 * @param {boolean} isStale
 * @returns {Freshness}
 */
function freshnessFor(hasData, isStale) {
  if (typeof hasData !== 'boolean' || typeof isStale !== 'boolean') return Freshness.UNKNOWN;
  if (!hasData) return Freshness.NO_DATA;
  return isStale ? Freshness.STALE : Freshness.LIVE;
}

/**
 * The one drill-down URL shape this deployment uses, reused verbatim from
 * monitoring/grafana/dashboards/manufacturing/ims-ldi-operator-andon.json's
 * Action Queue panel (var-machine_id/var-factory/var-mo/var-event_time_ms/
 * from/to) -- not a new convention invented for the Twin.
 *
 * Returns null (never a partial/malformed URL) if any required field is
 * missing -- a drill-down link that 404s or lands on the wrong machine is
 * worse than no link.
 *
 * @param {{machineId: string, factory: string, mo: string, eventTimeMs: number, from: string, to: string}} p
 * @returns {string|null}
 */
function buildDrillDownUrl(p) {
  if (!p || typeof p !== 'object') return null;
  const { machineId, factory, mo, eventTimeMs, from, to } = p;
  if (typeof machineId !== 'string' || !machineId) return null;
  if (typeof factory !== 'string' || !factory) return null;
  if (typeof mo !== 'string' && mo !== null) return null;
  if (!Number.isFinite(eventTimeMs)) return null;
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  const q = new URLSearchParams({
    'var-machine_id': machineId,
    'var-factory': factory,
    'var-mo': mo ?? '',
    'var-event_time_ms': String(eventTimeMs),
    from,
    to,
  });
  return `/d/ims-ldi-machine-snapshot/set2-machine-snapshot?${q.toString()}`;
}

/**
 * The FT-15 canonical device telemetry record. Pure reshaping of one
 * /api/state-shaped DB row plus its freshness -- this is DEVICE IDENTITY
 * and TELEMETRY STATE only, no physical asset anywhere in it. Returns null
 * for anything that is not a usable row, never a partially-filled record.
 *
 * @param {Object} row - one row from server.js's queryDeviceState()
 * @returns {Object|null}
 */
function projectDeviceTelemetry(row) {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.device_id !== 'string' || !row.device_id) return null;
  const freshness = freshnessFor(row.has_data, row.is_stale);
  return {
    device_id: row.device_id,
    timestamp: row.timestamp ?? null,
    state: row.machine_state,
    last_seen: row.last_seen ?? null,
    freshness,
    alarm: row.alarm ?? null,
    factory: row.factory ?? null,
    process: row.process ?? null,
    mo: row.mo ?? null,
  };
}

/**
 * The identity gate. Every FT-15+ physical-overlay decision runs through
 * this single function -- never re-derives eligibility from ims_device_id
 * truthiness, a lesson FT-14 already paid for once.
 *
 * @param {string} mappingStatus - a lib/mapping.js MappingStatus value
 * @returns {{live_status_eligible: boolean, alarm_eligible: boolean, drill_down_eligible: boolean}}
 */
function overlayEligibility(mappingStatus) {
  return mapping.eligibility(mappingStatus);
}

/**
 * Joins real device telemetry onto physical CAD assets -- the one place
 * PHYSICAL IDENTITY (mappingByAssetId, lib/mapping.js's canonical table)
 * and TELEMETRY STATE (telemetryByDeviceId, real /api/state-shaped rows)
 * meet. Pure: takes both tables already resolved/queried by the caller,
 * does no I/O and no re-derivation of either.
 *
 * An asset appears in the returned overlay ONLY when:
 *   1. lib/mapping.resolveMapping() finds a real entry for its asset_id,
 *   2. that entry's mapping_status is CONFIRMED (eligibility all true),
 *   3. its confirmed ims_device_id has a real telemetry row.
 * Any other combination (unresolved, conflicting, deprecated, confirmed
 * but the device itself is not currently registered/discovered) produces
 * NO entry for that asset -- never a partial one, never a fabricated
 * fallback. This is also where "0 confirmed mappings -> 0 physical live
 * attachments" is structurally guaranteed, not merely expected: with an
 * empty mappingByAssetId, resolveMapping returns UNRESOLVED_RECORD for
 * every assetId, eligibility is false for all of them, and the loop below
 * never assigns anything.
 *
 * @param {string[]} assetIds - every physical asset's own id (item.id)
 * @param {Object} mappingByAssetId - asset_id -> PhysicalIdentityMapping (validated)
 * @param {Map<string,Object>} telemetryByDeviceId - device_id -> projectDeviceTelemetry() result
 * @param {{from: string, to: string}} drillDownWindow - the caller's current time range, for the drill-down link only
 * @returns {{overlayByAssetId: Object, counts: {confirmed: number, liveAttached: number, alarmEligible: number, drillDownEligible: number}}}
 */
function resolvePhysicalOverlay(assetIds, mappingByAssetId, telemetryByDeviceId, drillDownWindow) {
  const overlayByAssetId = {};
  const counts = { confirmed: 0, liveAttached: 0, alarmEligible: 0, drillDownEligible: 0 };
  if (!Array.isArray(assetIds)) return { overlayByAssetId, counts };

  for (const assetId of assetIds) {
    const identity = mapping.resolveMapping(mappingByAssetId, assetId);
    if (identity.mapping_status === mapping.MappingStatus.CONFIRMED) counts.confirmed++;
    const elig = overlayEligibility(identity.mapping_status);
    // The gate. Everything below this line only ever runs for CONFIRMED.
    if (!elig.live_status_eligible) continue;
    const deviceId = identity.ims_device_id;
    if (typeof deviceId !== 'string' || !deviceId) continue;
    const telemetry = telemetryByDeviceId && typeof telemetryByDeviceId.get === 'function'
      ? telemetryByDeviceId.get(deviceId) : undefined;
    // Confirmed identity with no telemetry row for that device (not
    // currently registered/discovered, or the query simply found nothing)
    // is not an overlay entry -- there is nothing true to attach yet.
    if (!telemetry) continue;

    counts.liveAttached++;
    if (elig.alarm_eligible) counts.alarmEligible++;
    if (elig.drill_down_eligible) counts.drillDownEligible++;

    const dw = drillDownWindow && typeof drillDownWindow === 'object' ? drillDownWindow : {};
    overlayByAssetId[assetId] = {
      device_id: deviceId,
      identity_state: identity.mapping_status,
      physical_asset_id: assetId,
      live_status_eligible: elig.live_status_eligible,
      alarm_eligible: elig.alarm_eligible,
      drill_down_eligible: elig.drill_down_eligible,
      state: telemetry.state,
      freshness: telemetry.freshness,
      last_seen: telemetry.last_seen,
      alarm: elig.alarm_eligible ? telemetry.alarm : null,
      // The event a drill-down centres on is the active alarm's own
      // timestamp when one exists (lands the operator on the exact event),
      // or "now" for a machine with no active alarm (a generic current
      // snapshot) -- eligibility to drill down at all comes from identity
      // alone, never from whether an alarm happens to be active right now.
      drill_down_url: elig.drill_down_eligible
        ? buildDrillDownUrl({
            machineId: deviceId,
            factory: telemetry.factory,
            mo: telemetry.mo,
            eventTimeMs: telemetry.alarm ? telemetry.alarm.logdate_ms : Date.now(),
            from: dw.from,
            to: dw.to,
          })
        : null,
    };
  }

  return { overlayByAssetId, counts };
}

module.exports = {
  Freshness,
  freshnessFor,
  buildDrillDownUrl,
  projectDeviceTelemetry,
  overlayEligibility,
  resolvePhysicalOverlay,
};
