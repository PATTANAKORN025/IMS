/**
 * Floor 1 evidence intake gate — pure validation of ONE proposed evidence
 * record against `docs/floor1/evidence-intake-contract.md`'s promotion
 * policy.
 *
 * This module makes no promotion decisions of its own authority and writes
 * nothing: it answers "does this record's CONTENT satisfy the policy",
 * never "is this record accepted" — that remains a separate, out-of-band
 * human review step (`docs/evidence/FLOOR1_CONFIRMED_MAPPING_ACQUISITION_PLAN.md`
 * §6), the same separation `lib/mes-import.js`'s own header already
 * establishes for MES import candidates. Nothing here reads a database,
 * calls an API, touches `private/floor1-asset-mapping.json`, or mutates its
 * argument — a caller applying a CONFIRMED result is a distinct, explicit
 * act.
 *
 * Complements, never replaces, `lib/mapping.js`'s own `validateMappings()`
 * (the real engine that governs `private/floor1-asset-mapping.json`
 * itself) and `lib/evidence.js`'s own source-promotion rules. This module
 * operates one level earlier: on a single INTAKE record before it has ever
 * been considered for that file at all.
 */

'use strict';

/** Step 6E's own 6-state lifecycle, reused unchanged -- no new vocabulary. */
const MappingStatus = Object.freeze({
  UNMAPPED: 'UNMAPPED',
  CANDIDATE: 'CANDIDATE',
  CONFIRMED: 'CONFIRMED',
  AMBIGUOUS: 'AMBIGUOUS',
  RETIRED: 'RETIRED',
  INVALID: 'INVALID',
});
const KNOWN_STATUSES = new Set(Object.values(MappingStatus));

/** Evidence classes capable, in principle, of supporting identity. */
const DIRECT_EVIDENCE_TYPES = Object.freeze([
  'DIRECT_SYSTEM_RECORD',
  'NAMEPLATE_PHOTO',
  'PLC_SCADA_TAG_RECORD',
  'MES_RECORD',
  'CMMS_EAM_RECORD',
  'VENDOR_REGISTRY',
  'SITE_SURVEY',
  'ENGINEERING_DOCUMENT',
]);
const DIRECT_EVIDENCE_SET = new Set(DIRECT_EVIDENCE_TYPES);

/** Never identity evidence -- spatial/context only (evidence-intake-contract.md §2). */
const SPATIAL_EVIDENCE_TYPES = Object.freeze([
  'CAD_POSITION',
  'EAP_POSITION',
  'GEOMETRY_SIMILARITY',
  'NAME_SIMILARITY',
  'NEAREST_ASSET',
]);
const SPATIAL_EVIDENCE_SET = new Set(SPATIAL_EVIDENCE_TYPES);

const KNOWN_EVIDENCE_TYPES = new Set([...DIRECT_EVIDENCE_TYPES, ...SPATIAL_EVIDENCE_TYPES, 'OTHER']);

function isNonEmpty(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * @typedef {Object} EvidenceRecord
 * @property {string} [factoryTwinAssetId]
 * @property {string|null} [equipmentId]
 * @property {string|null} [physicalAssetId]
 * @property {string|null} [deviceId]
 * @property {string|null} [sourceSystemId]
 * @property {string} [evidenceType]
 * @property {string} [evidenceLocation]
 * @property {string} [sourceSystem]
 * @property {string} [sourceRecord]
 * @property {string} [provenance]
 * @property {string} [verifiedBy]
 * @property {string} [verifiedAt]
 * @property {string} [mappingStatus] - Caller's own declared status, if any. Checked for
 *   well-formedness only -- the returned `mappingStatus` is this function's own derived
 *   classification, not an echo.
 * @property {boolean} [conflict] - True when this identity claim is known to conflict with a
 *   different asset's claim over the same EquipmentId/PhysicalAssetId/DeviceId. Set by the
 *   caller (this module does not itself compare across records -- see
 *   `detectDuplicateSourceRecords` below for the one cross-record check it does own).
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Structural validity only. False for a record this module refuses
 *   to reason about at all (no asset to attach to, an unrecognised status/evidence-type value,
 *   an unparseable timestamp).
 * @property {string[]} errors - Structural problems. Non-empty implies valid === false.
 * @property {string[]} warnings - Policy gaps that block promotion but do not make the record
 *   itself malformed -- missing provenance, a partial identity chain, spatial-only evidence.
 * @property {boolean} promotionEligible - True only when every §3 promotion-policy requirement
 *   is satisfied. Never true for a structurally invalid record.
 * @property {string} mappingStatus - This function's own derived classification (not an echo of
 *   the caller's declared value), one of MappingStatus's six values.
 */

/**
 * Validates one proposed evidence record. Pure: no I/O, no mutation of `record`, deterministic
 * for the same input.
 *
 * @param {EvidenceRecord} record
 * @returns {ValidationResult}
 */
function validateEvidenceRecord(record) {
  const errors = [];
  const warnings = [];

  if (!record || typeof record !== 'object') {
    return {
      valid: false,
      errors: ['record must be an object'],
      warnings: [],
      promotionEligible: false,
      mappingStatus: MappingStatus.INVALID,
    };
  }

  // --- Structural checks -------------------------------------------------
  if (!isNonEmpty(record.factoryTwinAssetId)) {
    errors.push('factoryTwinAssetId is required');
  }

  if (record.mappingStatus !== undefined && record.mappingStatus !== null) {
    if (!KNOWN_STATUSES.has(record.mappingStatus)) {
      errors.push(`unknown mappingStatus "${record.mappingStatus}"`);
    }
  }

  let evidenceTypeKnown = true;
  if (record.evidenceType !== undefined && record.evidenceType !== null && record.evidenceType !== '') {
    if (!KNOWN_EVIDENCE_TYPES.has(record.evidenceType)) {
      errors.push(`unknown evidenceType "${record.evidenceType}"`);
      evidenceTypeKnown = false;
    }
  }

  if (isNonEmpty(record.verifiedAt) && Number.isNaN(Date.parse(record.verifiedAt))) {
    errors.push(`verifiedAt "${record.verifiedAt}" is not a valid ISO-8601 timestamp`);
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
      promotionEligible: false,
      mappingStatus: MappingStatus.INVALID,
    };
  }

  // --- Policy checks (structurally valid from here on) --------------------
  const isSpatialOnly = isNonEmpty(record.evidenceType) && SPATIAL_EVIDENCE_SET.has(record.evidenceType);
  const isDirect = isNonEmpty(record.evidenceType) && DIRECT_EVIDENCE_SET.has(record.evidenceType) && evidenceTypeKnown;
  const isUnknownSource = !isNonEmpty(record.evidenceType)
    || record.evidenceType === 'OTHER'
    || !isNonEmpty(record.sourceSystem);

  if (isSpatialOnly) {
    warnings.push('spatial/context evidence never establishes identity (evidence-intake-contract.md §2)');
  }
  if (isUnknownSource) {
    warnings.push('evidence source is unknown or unspecified ("OTHER" evidence type, or no sourceSystem named)');
  }

  const hasEquipment = isNonEmpty(record.equipmentId);
  const hasPhysical = isNonEmpty(record.physicalAssetId);
  const hasDevice = isNonEmpty(record.deviceId);
  const identityFieldCount = [hasEquipment, hasPhysical, hasDevice].filter(Boolean).length;
  const hasAnyIdentity = identityFieldCount > 0;
  const hasFullIdentityChain = hasEquipment && hasPhysical && hasDevice;

  if (hasAnyIdentity && !hasFullIdentityChain) {
    warnings.push('partial identity chain -- not eligible for CONFIRMED until EquipmentId, PhysicalAssetId and DeviceId all resolve');
  }
  if (hasAnyIdentity && !isNonEmpty(record.sourceSystemId)) {
    warnings.push('an identity field is asserted but sourceSystemId (which system asserted it) is missing');
  }

  if (!isNonEmpty(record.provenance)) warnings.push('missing provenance');
  if (!isNonEmpty(record.verifiedBy)) warnings.push('missing verified_by (reviewer)');
  if (!isNonEmpty(record.verifiedAt)) warnings.push('missing verified_at (verification timestamp)');

  const hasConflict = record.conflict === true;
  if (hasConflict) warnings.push('identity conflict -- claim disputed against a different asset');

  const promotionEligible = (
    isDirect
    && !isSpatialOnly
    && !isUnknownSource
    && hasFullIdentityChain
    && isNonEmpty(record.sourceSystemId)
    && !hasConflict
    && isNonEmpty(record.provenance)
    && isNonEmpty(record.verifiedBy)
    && isNonEmpty(record.verifiedAt)
  );

  let mappingStatus;
  if (hasConflict) {
    mappingStatus = MappingStatus.AMBIGUOUS;
  } else if (promotionEligible) {
    mappingStatus = MappingStatus.CONFIRMED;
  } else if (hasAnyIdentity && isDirect) {
    // Real, direct evidence exists for at least one identity field -- a genuine partial
    // state, never UNMAPPED and never fabricated into a false CONFIRMED.
    mappingStatus = MappingStatus.CANDIDATE;
  } else {
    mappingStatus = MappingStatus.UNMAPPED;
  }

  return { valid: true, errors, warnings, promotionEligible, mappingStatus };
}

/**
 * The one cross-record check this module owns: the same `sourceRecord` (within the same
 * `sourceSystem`) cited by promotion-eligible or identity-bearing claims for two DIFFERENT
 * Factory Twin assets. Mirrors `lib/mapping.js`'s own duplicate-claim detection
 * (`confirmedDevice`/`confirmedMachine` maps) one level earlier, before any record has reached
 * that file. Pure: no I/O, no mutation, deterministic order.
 *
 * @param {EvidenceRecord[]} records
 * @returns {{sourceSystem: string, sourceRecord: string, assetIds: string[]}[]}
 */
function detectDuplicateSourceRecords(records) {
  if (!Array.isArray(records)) return [];
  const bySourceKey = new Map();

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    if (!isNonEmpty(record.sourceSystem) || !isNonEmpty(record.sourceRecord)) continue;
    if (!isNonEmpty(record.factoryTwinAssetId)) continue;
    const hasIdentity = isNonEmpty(record.equipmentId) || isNonEmpty(record.physicalAssetId) || isNonEmpty(record.deviceId);
    if (!hasIdentity) continue; // duplicate citation of a source with no identity claim is not a conflict

    const key = `${record.sourceSystem}::${record.sourceRecord}`;
    if (!bySourceKey.has(key)) bySourceKey.set(key, new Set());
    bySourceKey.get(key).add(record.factoryTwinAssetId);
  }

  const duplicates = [];
  for (const [key, assetIds] of bySourceKey) {
    if (assetIds.size > 1) {
      const [sourceSystem, sourceRecord] = key.split('::');
      duplicates.push({ sourceSystem, sourceRecord, assetIds: [...assetIds].sort() });
    }
  }
  return duplicates;
}

module.exports = {
  MappingStatus,
  DIRECT_EVIDENCE_TYPES,
  SPATIAL_EVIDENCE_TYPES,
  validateEvidenceRecord,
  detectDuplicateSourceRecords,
};
