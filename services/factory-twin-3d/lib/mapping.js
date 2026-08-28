/**
 * Physical identity mapping — contract and validation.
 *
 * A mapping record is the ONLY thing that may relate the twin's separate
 * identifier namespaces to each other:
 *
 *   physical_slot_id  a position observed on the engineering drawing
 *   ims_device_id     a real monitored device
 *   mes_machine_id    a machine in the external manufacturing system
 *
 * These are three different namespaces. Nothing about a slot's position,
 * numbering, size or neighbours is evidence of which device or machine
 * occupies it. That is not a limitation of this module -- it is the reason
 * this module exists: the correspondence has to come from a record that
 * someone is accountable for, and this is where such a record is checked.
 *
 * Deliberately NOT provided, because each is a way of manufacturing identity
 * that would look like data afterwards:
 *   - nearest-slot / proximity matching
 *   - sequential or numeric-order matching
 *   - name or string-similarity matching
 *   - coordinate-similarity matching
 *   - promoting anything to `confirmed` automatically
 *
 * A record only reaches `confirmed` when a caller supplies a source, a source
 * record and a verification timestamp. Validation refuses to infer any of
 * them.
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
  physical_slot_id: /^(PHYS-F\d+-\d{4}|TEST-SLOT-\d+)$/,
  ims_device_id: /^[A-Za-z][A-Za-z0-9-]{1,63}$/,
  mes_machine_id: /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/,
});

/**
 * @typedef {Object} PhysicalIdentityMapping
 * @property {string} physical_slot_id - Geometry-only slot identifier. Required.
 * @property {string|null} ims_device_id - Monitored device, or null when unknown.
 * @property {string|null} mes_machine_id - External manufacturing-system machine, or null when unknown.
 * @property {MappingStatus} mapping_status
 * @property {'high'|'medium'|'low'|'unknown'} confidence
 * @property {string|null} source - What asserted this. Required for `confirmed`.
 * @property {string|null} source_record - The specific record within that source. Required for `confirmed`.
 * @property {string|null} verified_at - ISO-8601 timestamp. Required for `confirmed`.
 */

/**
 * Validates a set of mapping records. Pure: no I/O, no mutation, deterministic
 * order of findings, so the same input always produces the same report.
 *
 * @param {PhysicalIdentityMapping[]} records
 * @param {{knownSlotIds?: Set<string>}} [opts] - When supplied, every
 *   physical_slot_id must exist in it. Without it, slot existence is not
 *   checked (the caller may not have geometry loaded).
 * @returns {{ok: boolean, errors: string[], counts: Object}}
 */
function validateMappings(records, opts = {}) {
  const errors = [];
  const counts = { total: 0, unresolved: 0, confirmed: 0, conflicting: 0, deprecated: 0 };

  if (!Array.isArray(records)) {
    return { ok: false, errors: ['mapping records must be an array'], counts };
  }
  counts.total = records.length;

  const seenSlot = new Set();
  const confirmedDevice = new Map();
  const confirmedMachine = new Map();

  records.forEach((r, i) => {
    const at = `record ${i}`;
    if (!r || typeof r !== 'object') {
      errors.push(`${at}: not an object`);
      return;
    }
    const slot = r.physical_slot_id;
    const label = slot ? `mapping ${slot}` : at;

    if (typeof slot !== 'string' || !slot) {
      errors.push(`${at}: physical_slot_id is required`);
    } else {
      if (!NAMESPACE_PATTERN.physical_slot_id.test(slot)) {
        errors.push(`${label}: physical_slot_id "${slot}" does not match the slot namespace`);
      }
      if (seenSlot.has(slot)) errors.push(`${label}: duplicate physical_slot_id`);
      seenSlot.add(slot);
      if (opts.knownSlotIds && !opts.knownSlotIds.has(slot)) {
        errors.push(`${label}: physical_slot_id does not exist in the geometry`);
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
      if (r.ims_device_id) {
        const prev = confirmedDevice.get(r.ims_device_id);
        if (prev !== undefined) {
          errors.push(`${label}: ims_device_id "${r.ims_device_id}" is already confirmed on ${prev}`);
        } else confirmedDevice.set(r.ims_device_id, slot);
      }
      if (r.mes_machine_id) {
        const prev = confirmedMachine.get(r.mes_machine_id);
        if (prev !== undefined) {
          errors.push(`${label}: mes_machine_id "${r.mes_machine_id}" is already confirmed on ${prev}`);
        } else confirmedMachine.set(r.mes_machine_id, slot);
      }
    }
  });

  return { ok: errors.length === 0, errors, counts };
}

module.exports = { MappingStatus, NAMESPACE_PATTERN, validateMappings };
