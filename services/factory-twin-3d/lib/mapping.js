/**
 * Physical identity mapping — contract and validation.
 *
 * This is the canonical identity engine for EVERY physical asset the twin
 * draws (FT-14) -- an anonymous engineering-drawing slot and a named CAD
 * equipment record are the same kind of thing to this module: a physical
 * position that may or may not correspond to a real monitored device.
 *
 * A mapping record is the ONLY thing that may relate the twin's separate
 * identifier namespaces to each other:
 *
 *   asset_id          a physical position: an anonymous drawing slot
 *                     (PHYS-F<n>-nnnn) or a CAD equipment/component id
 *                     (EQP-F<n>-nnnn, optionally -C<nn> for a station or
 *                     production-line child)
 *   ims_device_id     a real monitored device
 *   mes_machine_id    a machine in the external manufacturing system
 *
 * These are three different namespaces. Nothing about an asset's position,
 * numbering, size, neighbours, parent grouping (a PHYSICAL_STATION or
 * PRODUCTION_LINE's children included) or EAP zone membership is evidence of
 * which device or machine occupies it. That is not a limitation of this
 * module -- it is the reason this module exists: the correspondence has to
 * come from a record that someone is accountable for, and this is where such
 * a record is checked.
 *
 * Deliberately NOT provided, because each is a way of manufacturing identity
 * that would look like data afterwards:
 *   - nearest-slot / proximity matching
 *   - sequential or numeric-order matching
 *   - name or string-similarity matching
 *   - coordinate-similarity matching
 *   - inheriting a parent station/line's mapping onto its children, or a
 *     child's mapping onto its parent
 *   - promoting anything to `confirmed` automatically
 *
 * A record only reaches `confirmed` when a caller supplies a source, a source
 * record and a verification timestamp. Validation refuses to infer any of
 * them. Two confirmed records that claim the same device or machine are a
 * validation ERROR, not a silent pick -- the whole file is rejected fail-
 * closed by the loader rather than serving either claim (see server.js's
 * loadPrivateAssetMapping).
 */

'use strict';

/**
 * @readonly
 * @enum {string}
 */
const MappingStatus = Object.freeze({
  /** No correspondence asserted. The default and the only honest state without a record. */
  UNRESOLVED: 'unresolved',
  /** Asserted by an authoritative record, with provenance. */
  CONFIRMED: 'confirmed',
  /** Two or more records disagree. Retained as a conflict; never auto-resolved. */
  CONFLICTING: 'conflicting',
  /** Was confirmed once, superseded. Kept so history is not silently rewritten. */
  DEPRECATED: 'deprecated',
});

const VALID_STATUS = new Set(Object.values(MappingStatus));
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low', 'unknown']);

// Namespace shapes. These are format checks, not identity checks: they catch a
// value pasted into the wrong field, which is the realistic way two namespaces
// get merged by accident.
const NAMESPACE_PATTERN = Object.freeze({
  // PHYS-F<n>-nnnn: the legacy anonymous engineering-drawing slot. EQP-F<n>-
  // nnnn: a CAD equipment record's own id. The optional -C<nn> suffix is a
  // PHYSICAL_COMPONENT belonging to a PHYSICAL_STATION or PRODUCTION_LINE
  // parent (e.g. EQP-F1-0002-C01) -- a component is its own asset_id here,
  // never resolved through its parent's.
  asset_id: /^(PHYS-F\d+-\d{4}|TEST-SLOT-\d+|EQP-F\d+-\d{4}(-C\d{2})?)$/,
  ims_device_id: /^[A-Za-z][A-Za-z0-9-]{1,63}$/,
  mes_machine_id: /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/,
});

/**
 * @typedef {Object} PhysicalIdentityMapping
 * @property {string} asset_id - Geometry-only physical identifier (slot or CAD equipment/component). Required.
 * @property {string|null} ims_device_id - Monitored device, or null when unknown.
 * @property {string|null} mes_machine_id - External manufacturing-system machine, or null when unknown.
 * @property {MappingStatus} mapping_status
 * @property {'high'|'medium'|'low'|'unknown'} confidence
 * @property {string|null} source - What asserted this. Required for `confirmed`.
 * @property {string|null} source_record - The specific record within that source. Required for `confirmed`.
 * @property {string|null} verified_at - ISO-8601 timestamp. Required for `confirmed`.
 */

/** The only honest answer for an asset with no record, or a record this
 * module refuses to trust (malformed, or looked up by a hostile key). Frozen
 * so nothing downstream can accidentally mutate a shared default into a
 * fabricated mapping. */
const UNRESOLVED_RECORD = Object.freeze({
  asset_id: null,
  ims_device_id: null,
  mes_machine_id: null,
  mapping_status: MappingStatus.UNRESOLVED,
  confidence: 'unknown',
  source: null,
  source_record: null,
  verified_at: null,
});

/**
 * Validates a set of mapping records. Pure: no I/O, no mutation, deterministic
 * order of findings, so the same input always produces the same report.
 *
 * @param {PhysicalIdentityMapping[]} records
 * @param {{knownAssetIds?: Set<string>}} [opts] - When supplied, every
 *   asset_id must exist in it. Without it, asset existence is not checked
 *   (the caller may not have geometry loaded).
 * @returns {{ok: boolean, errors: string[], counts: Object}}
 */
function validateMappings(records, opts = {}) {
  const errors = [];
  const counts = { total: 0, unresolved: 0, confirmed: 0, conflicting: 0, deprecated: 0 };

  if (!Array.isArray(records)) {
    return { ok: false, errors: ['mapping records must be an array'], counts };
  }
  counts.total = records.length;

  const seenAsset = new Set();
  const confirmedDevice = new Map();
  const confirmedMachine = new Map();

  records.forEach((r, i) => {
    const at = `record ${i}`;
    if (!r || typeof r !== 'object') {
      errors.push(`${at}: not an object`);
      return;
    }
    const asset = r.asset_id;
    const label = asset ? `mapping ${asset}` : at;

    if (typeof asset !== 'string' || !asset) {
      errors.push(`${at}: asset_id is required`);
    } else {
      if (!NAMESPACE_PATTERN.asset_id.test(asset)) {
        errors.push(`${label}: asset_id "${asset}" does not match the asset namespace`);
      }
      if (seenAsset.has(asset)) errors.push(`${label}: duplicate asset_id`);
      seenAsset.add(asset);
      if (opts.knownAssetIds && !opts.knownAssetIds.has(asset)) {
        errors.push(`${label}: asset_id does not exist in the geometry`);
      }
    }

    for (const field of ['ims_device_id', 'mes_machine_id']) {
      const v = r[field];
      if (v === null || v === undefined) continue;
      if (typeof v !== 'string' || !NAMESPACE_PATTERN[field].test(v)) {
        errors.push(`${label}: ${field} "${v}" does not match the ${field} namespace`);
      }
    }

    if (!VALID_STATUS.has(r.mapping_status)) {
      errors.push(`${label}: invalid mapping_status "${r.mapping_status}"`);
    } else {
      counts[r.mapping_status]++;
    }
    if (!VALID_CONFIDENCE.has(r.confidence)) {
      errors.push(`${label}: invalid confidence "${r.confidence}"`);
    }

    if (r.mapping_status === MappingStatus.CONFIRMED) {
      // A confirmation without provenance is an assertion nobody owns.
      for (const field of ['source', 'source_record', 'verified_at']) {
        if (!r[field]) errors.push(`${label}: confirmed mapping requires ${field}`);
      }
      if (r.verified_at && Number.isNaN(Date.parse(r.verified_at))) {
        errors.push(`${label}: verified_at "${r.verified_at}" is not a valid ISO-8601 timestamp`);
      }
      if (!r.ims_device_id && !r.mes_machine_id) {
        errors.push(`${label}: confirmed mapping asserts no ims_device_id and no mes_machine_id`);
      }
      // One device occupies one position, and one position holds one machine.
      // Two CONFIRMED records claiming the same device -- e.g. a parent
      // station and a mis-keyed child, or two independent evidence sources
      // disagreeing -- is a validation ERROR, not a pick: the loader rejects
      // the whole file fail-closed rather than silently choosing either
      // asset_id (see server.js's loadPrivateAssetMapping).
      if (r.ims_device_id) {
        const prev = confirmedDevice.get(r.ims_device_id);
        if (prev !== undefined) {
          errors.push(`${label}: ims_device_id "${r.ims_device_id}" is already confirmed on ${prev}`);
        } else confirmedDevice.set(r.ims_device_id, asset);
      }
      if (r.mes_machine_id) {
        const prev = confirmedMachine.get(r.mes_machine_id);
        if (prev !== undefined) {
          errors.push(`${label}: mes_machine_id "${r.mes_machine_id}" is already confirmed on ${prev}`);
        } else confirmedMachine.set(r.mes_machine_id, asset);
      }
    }
  });

  return { ok: errors.length === 0, errors, counts };
}

/**
 * Looks an asset up in a validated mapping table without letting an
 * inherited property answer for a hostile key. Mirrors the wire layer's own
 * hasOwnProperty-guarded lookup pattern for the same reason: on a plain
 * object, `table['constructor']` answers with a function, and an id that is
 * not a safe token must not be able to walk the prototype chain into one.
 *
 * Returns UNRESOLVED_RECORD -- never throws, never invents a device -- for
 * anything it does not trust: a missing table, a hostile or malformed
 * assetId, an entry that isn't a validated record. A caller only ever sees a
 * mapping this function itself vouches for.
 *
 * @param {Object|null} mappingByAssetId - asset_id -> PhysicalIdentityMapping, already validated.
 * @param {string} assetId
 * @returns {PhysicalIdentityMapping}
 */
// A generic safe-key gate, deliberately weaker than NAMESPACE_PATTERN.asset_id
// (this is not a namespace check -- see the comment below) but strong enough
// to defeat `__proto__`: JSON.parse legitimately creates `__proto__` as a real
// OWN data property carrying whatever the document's author put there, so
// hasOwnProperty alone does not catch it the way it catches `constructor` (a
// genuinely inherited, never-own property). Requiring the key start with an
// alphanumeric character rejects `__proto__` before its value is ever looked
// at, at the cost of nothing a real asset_id (or a reasonable test fixture id)
// would ever need to start with.
const SAFE_KEY = /^[A-Za-z0-9]/;

function resolveMapping(mappingByAssetId, assetId) {
  if (!mappingByAssetId || typeof mappingByAssetId !== 'object') return UNRESOLVED_RECORD;
  if (typeof assetId !== 'string' || !SAFE_KEY.test(assetId)) return UNRESOLVED_RECORD;
  // hasOwnProperty catches the OTHER half of this vector: `constructor`,
  // `toString`, `valueOf`, `isPrototypeOf` and friends answer with an
  // inherited function on a plain object, never a real own entry. Namespace
  // SHAPE (is this actually an EQP-/PHYS- id) is a mapping-FILE validation
  // concern (validateMappings, above) -- checking it again here would refuse
  // a legitimately looked-up id that simply isn't asset-shaped test fixture
  // data, which is a fixture's business, not this function's.
  if (!Object.prototype.hasOwnProperty.call(mappingByAssetId, assetId)) return UNRESOLVED_RECORD;
  const r = mappingByAssetId[assetId];
  if (!r || typeof r !== 'object' || !VALID_STATUS.has(r.mapping_status)) return UNRESOLVED_RECORD;
  return r;
}

/**
 * The one place FT-15+ (telemetry), FT-16 (alarm/RCA) and any future
 * drill-down consult to decide whether identity-dependent behavior may run
 * for a mapping's current lifecycle state. Deterministic and total: every
 * MappingStatus value produces an answer.
 *
 * Only `confirmed` is eligible. `conflicting` and `deprecated` are NOT
 * merely "not yet confirmed" -- a conflicting mapping was once asserted and
 * is now known unreliable, and a deprecated one was correct once and no
 * longer is; both must read the same as `unresolved` to every live-status,
 * alarm and drill-down consumer, never as a degraded-but-usable confirm.
 *
 * @param {MappingStatus} status
 * @returns {{live_status_eligible: boolean, alarm_eligible: boolean, drill_down_eligible: boolean}}
 */
function eligibility(status) {
  const on = status === MappingStatus.CONFIRMED;
  return { live_status_eligible: on, alarm_eligible: on, drill_down_eligible: on };
}

module.exports = {
  MappingStatus, NAMESPACE_PATTERN, UNRESOLVED_RECORD,
  validateMappings, resolveMapping, eligibility,
};
