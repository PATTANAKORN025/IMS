/**
 * MES import boundary — validation and dry-run planning.
 *
 * This module accepts a future structured export from the external
 * manufacturing system. It is deliberately NOT connected to that system, and
 * no real export exists yet; nothing here fabricates one.
 *
 * The boundary exists because of what an import must never be allowed to do.
 * A manufacturing export knows about machines. It does not know where they
 * are in this building, and it does not know which monitored device
 * corresponds to which machine. So an import here can:
 *
 *   - introduce MES machine records          (its own namespace)
 *   - propose a mapping when the export itself carries one, as a CANDIDATE
 *
 * and can never:
 *
 *   - create, move, resize or delete geometry
 *   - assign coordinates to anything
 *   - confirm a mapping on its own authority
 *   - relate identifiers by proximity, sequence, similarity or process type
 *
 * planImport() is a pure dry run: it reads, reports, and returns. Applying
 * anything is a separate, explicit act by the caller, which is what makes the
 * whole operation rollback-safe -- nothing has changed when the plan is
 * produced, so discarding the plan is a complete undo.
 */

'use strict';

const { MappingStatus } = require('./mapping');

/**
 * @readonly
 * @enum {string}
 */
const MesImportState = Object.freeze({
  /** Machine record accepted; no correspondence to anything else. */
  UNMAPPED: 'unmapped',
  /** The export itself proposes a slot. Proposed only -- never auto-confirmed. */
  CANDIDATE: 'candidate',
  /** Only reachable when the caller supplies provenance and explicit approval. */
  CONFIRMED: 'confirmed',
  /** Failed validation, or contradicts an existing confirmed mapping. */
  REJECTED: 'rejected',
});

const MES_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SLOT_ID = /^(PHYS-F\d+-\d{4}|TEST-SLOT-\d+)$/;
const PROCESS_GROUP = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/;

function validateRecord(rec, i) {
  const errors = [];
  const at = rec && rec.mes_id ? `mes record ${rec.mes_id}` : `mes record ${i}`;
  if (!rec || typeof rec !== 'object') return [`${at}: not an object`];

  if (typeof rec.mes_id !== 'string' || !MES_ID.test(rec.mes_id)) {
    errors.push(`${at}: mes_id "${rec.mes_id}" is missing or not a valid MES identifier`);
  }
  if (typeof rec.process_group !== 'string' || !PROCESS_GROUP.test(rec.process_group)) {
    errors.push(`${at}: process_group "${rec.process_group}" is missing or malformed`);
  }
  if (rec.status !== undefined && typeof rec.status !== 'string') {
    errors.push(`${at}: status must be a string when present`);
  }
  if (rec.source_timestamp !== undefined && rec.source_timestamp !== null) {
    if (Number.isNaN(Date.parse(rec.source_timestamp))) {
      errors.push(`${at}: source_timestamp "${rec.source_timestamp}" is not a valid ISO-8601 timestamp`);
    }
  }

  // Namespace separation. A device id arriving in a MES export is the single
  // most likely way the two namespaces get silently merged, so it is refused
  // outright rather than quietly ignored.
  if (rec.ims_device_id !== undefined) {
    errors.push(`${at}: ims_device_id must not appear in a MES export -- device identity is a separate namespace and cannot be asserted here`);
  }
  // Geometry is never an import's business.
  for (const field of ['position', 'x', 'z', 'footprint', 'width', 'depth', 'rotation']) {
    if (rec[field] !== undefined) {
      errors.push(`${at}: geometry field "${field}" must not appear in a MES export -- imports never assign or modify geometry`);
    }
  }
  if (rec.physical_slot_id !== undefined && rec.physical_slot_id !== null) {
    if (typeof rec.physical_slot_id !== 'string' || !SLOT_ID.test(rec.physical_slot_id)) {
      errors.push(`${at}: physical_slot_id "${rec.physical_slot_id}" does not match the slot namespace`);
    }
  }
  return errors;
}

/**
 * Produces a dry-run plan. Pure: no I/O, no mutation of any argument, and
 * deterministic for the same input.
 *
 * @param {Array<Object>} records - Parsed MES export rows.
 * @param {Object} [ctx]
 * @param {Set<string>} [ctx.knownSlotIds] - Slots that exist in the geometry.
 * @param {Map<string,string>} [ctx.confirmedSlotToMes] - Existing confirmed mappings, slot -> mes_id.
 * @param {boolean} [ctx.approveMappings=false] - Caller's explicit approval. Without it nothing reaches CONFIRMED.
 * @param {string} [ctx.source] - Provenance for confirmations.
 * @param {string} [ctx.verifiedAt] - ISO-8601 timestamp for confirmations.
 * @returns {Object} plan
 */
function planImport(records, ctx = {}) {
  const plan = {
    dryRun: true,
    accepted: [],
    rejected: [],
    conflicts: [],
    counts: { total: 0, unmapped: 0, candidate: 0, confirmed: 0, rejected: 0 },
    geometryWrites: 0, // structurally always zero; asserted by tests
    errors: [],
  };

  if (!Array.isArray(records)) {
    plan.errors.push('MES export must be an array of records');
    return plan;
  }
  plan.counts.total = records.length;

  const seen = new Set();
  const slotClaims = new Map(); // slot -> first mes_id claiming it

  records.forEach((rec, i) => {
    const errors = validateRecord(rec, i);
    const id = rec && rec.mes_id;

    if (id && seen.has(id)) errors.push(`mes record ${id}: duplicate mes_id in this export`);
    if (id) seen.add(id);

    const slot = rec && rec.physical_slot_id;
    if (slot && ctx.knownSlotIds && !ctx.knownSlotIds.has(slot)) {
      errors.push(`mes record ${id}: physical_slot_id "${slot}" does not exist in the geometry`);
    }
    if (slot) {
      const prior = slotClaims.get(slot);
      if (prior !== undefined && prior !== id) {
        errors.push(`mes record ${id}: physical_slot_id "${slot}" is already claimed by ${prior} in this export`);
      } else slotClaims.set(slot, id);

      const existing = ctx.confirmedSlotToMes && ctx.confirmedSlotToMes.get(slot);
      if (existing && existing !== id) {
        // Never silently overwrite a standing confirmation.
        plan.conflicts.push({ mes_id: id, physical_slot_id: slot, existing_mes_id: existing });
        errors.push(`mes record ${id}: slot "${slot}" already has a confirmed mapping to ${existing}`);
      }
    }

    if (errors.length > 0) {
      plan.rejected.push({ mes_id: id ?? null, state: MesImportState.REJECTED, errors });
      plan.counts.rejected++;
      plan.errors.push(...errors);
      return;
    }

    // A slot proposed by the export is a CANDIDATE, never a confirmation.
    // Reaching CONFIRMED additionally requires the caller to approve and to
    // supply provenance -- the export alone is not authority.
    let state = MesImportState.UNMAPPED;
    if (slot) {
      const approved = ctx.approveMappings === true && Boolean(ctx.source) && Boolean(ctx.verifiedAt);
      state = approved ? MesImportState.CONFIRMED : MesImportState.CANDIDATE;
    }

    plan.accepted.push({
      mes_id: id,
      process_group: rec.process_group,
      status: rec.status ?? null,
      source_timestamp: rec.source_timestamp ?? null,
      physical_slot_id: slot ?? null,
      state,
      // Mapping records are emitted in the shape lib/mapping.js validates, so
      // one contract governs identity everywhere.
      mapping:
        slot != null
          ? {
              physical_slot_id: slot,
              ims_device_id: null, // never asserted by a MES import
              mes_machine_id: id,
              mapping_status:
                state === MesImportState.CONFIRMED ? MappingStatus.CONFIRMED : MappingStatus.UNRESOLVED,
              confidence: state === MesImportState.CONFIRMED ? 'high' : 'unknown',
              source: state === MesImportState.CONFIRMED ? ctx.source : null,
              source_record: state === MesImportState.CONFIRMED ? id : null,
              verified_at: state === MesImportState.CONFIRMED ? ctx.verifiedAt : null,
            }
          : null,
    });
    plan.counts[state]++;
  });

  return plan;
}

module.exports = { MesImportState, planImport, validateRecord };
