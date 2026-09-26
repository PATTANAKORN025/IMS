/**
 * Evidence source registry and promotion rules.
 *
 * Every claim this twin makes is only as strong as the source it came from,
 * and the failure mode that matters is quiet promotion: an observed position
 * becomes a confirmed machine because two numbers looked close, a derived
 * height becomes a measured one because nobody re-checked, a simulated
 * placeholder becomes real because it had been on screen long enough.
 *
 * This module is the one place that decides whether a claim may strengthen.
 * It holds no facility data and no device inventory -- the live database is
 * the inventory, and duplicating it here would create a second truth to drift
 * against. It holds only descriptions of SOURCES: where something came from,
 * how it was extracted, how far it has been validated, and therefore what it
 * is allowed to assert.
 *
 * Nothing here is populated with real production evidence. The registry ships
 * empty; a real drawing, DXF, section or MES export is loaded at runtime and
 * has to pass these rules like anything else.
 *
 * Design rule: strengthening is always an explicit, provenanced act. There is
 * no code path in this file that raises a claim's evidence state as a side
 * effect of anything -- not registration, not validation, not agreement
 * between two sources.
 */

'use strict';

/**
 * What a claim is, epistemically. These are not severities and do not form a
 * single ladder: DERIVED and MEASURED are different KINDS of claim, not
 * different amounts of the same one.
 */
const EvidenceState = Object.freeze({
  MEASURED: 'MEASURED', // read off a source against a calibrated scale
  OBSERVED: 'OBSERVED', // detected in a source; position backed, identity not
  DERIVED: 'DERIVED', // computed from measured values; not itself measured
  SIMULATED: 'SIMULATED', // placeholder; deliberately not real
  UNKNOWN: 'UNKNOWN', // not in evidence, and shown as such
  CONFIRMED: 'CONFIRMED', // backed by an authoritative record
});

/** The kinds of source this pipeline is built to consume. */
const SourceType = Object.freeze({
  DRAWING: 'drawing', // scanned/printed engineering drawing
  MES_EXPORT: 'mes_export', // structured export from the MES
  CAD_DXF: 'cad_dxf', // vector CAD
  SECTION_ELEVATION: 'section_elevation', // section or elevation drawing
  DEVICE_MACHINE_RECORD: 'device_machine_record', // authoritative device<->machine record
});

const ExtractionMethod = Object.freeze({
  MANUAL_TRANSCRIPTION: 'manual_transcription',
  PIXEL_CALIBRATION: 'pixel_calibration',
  COLOUR_LAYER_SEPARATION: 'colour_layer_separation',
  VECTOR_PARSE: 'vector_parse',
  VENDOR_EXPORT: 'vendor_export',
  UNKNOWN: 'unknown',
});

const Confidence = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', UNKNOWN: 'UNKNOWN' });

const ValidationStatus = Object.freeze({
  PENDING: 'PENDING',
  VALIDATED: 'VALIDATED',
  REJECTED: 'REJECTED',
  CONFLICTING: 'CONFLICTING',
});

/**
 * Whether a source may leave the machine. Recorded on the source rather than
 * inferred at serialization time, because "is this publishable" is a property
 * of where it came from, not of who happens to be asking.
 */
const Disclosure = Object.freeze({ PRIVATE: 'PRIVATE', INTERNAL: 'INTERNAL', PUBLIC: 'PUBLIC' });

/**
 * The ceiling each source class can support. A drawing can measure a wall and
 * observe an equipment symbol; it cannot confirm which monitored device that
 * symbol is, because a drawing does not carry device identity at all. Only an
 * authoritative device<->machine record can reach CONFIRMED, and that is the
 * whole reason this table exists as data rather than as scattered ifs.
 */
const SOURCE_CAPABILITY = Object.freeze({
  [SourceType.DRAWING]: Object.freeze([EvidenceState.MEASURED, EvidenceState.OBSERVED, EvidenceState.DERIVED]),
  [SourceType.CAD_DXF]: Object.freeze([EvidenceState.MEASURED, EvidenceState.OBSERVED, EvidenceState.DERIVED]),
  [SourceType.SECTION_ELEVATION]: Object.freeze([EvidenceState.MEASURED, EvidenceState.DERIVED]),
  // A MES export names machines. It does not say where they are or which IMS
  // device polls them, so on its own it can only ever produce a candidate.
  [SourceType.MES_EXPORT]: Object.freeze([EvidenceState.OBSERVED]),
  [SourceType.DEVICE_MACHINE_RECORD]: Object.freeze([EvidenceState.CONFIRMED, EvidenceState.OBSERVED]),
});

/**
 * Bases that are never sufficient to create a mapping, listed explicitly so
 * that proposing one is a rejection with a named reason rather than a silent
 * pass. Every entry here is a real temptation this project has faced: the
 * slot nearest a device, the slot whose number matches, the machine whose
 * name looks similar, the grid that happens to be symmetric.
 */
const REJECTED_MAPPING_BASIS = Object.freeze({
  PROXIMITY: 'proximity',
  SEQUENTIAL_ID: 'sequential_id',
  NAME_SIMILARITY: 'name_similarity',
  GRID_SYMMETRY: 'grid_symmetry',
  VISUAL_SIMILARITY: 'visual_similarity',
  MACHINE_ORDERING: 'machine_ordering',
  MES_NUMBERING: 'mes_numbering',
});

const REJECTED_BASIS_VALUES = new Set(Object.values(REJECTED_MAPPING_BASIS));

/** The only basis that creates a mapping: an authoritative record, cited. */
const AUTHORITATIVE_MAPPING_BASIS = 'authoritative_device_machine_record';

const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function inEnum(v, obj) {
  return typeof v === 'string' && Object.values(obj).includes(v);
}

/**
 * Validates one evidence source description.
 *
 * Rejection is the default: a source that fails any rule is not registered in
 * a degraded form, because a half-trusted source in the registry is worse
 * than an absent one -- it looks like evidence at a glance.
 *
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateSource(src) {
  const errors = [];
  if (!src || typeof src !== 'object' || Array.isArray(src)) {
    return { valid: false, errors: ['source must be an object'] };
  }

  if (!isNonEmptyString(src.source_id) || !SOURCE_ID_PATTERN.test(src.source_id)) {
    errors.push('source_id must match /^[a-z0-9][a-z0-9_-]{2,63}$/');
  }
  if (!inEnum(src.source_type, SourceType)) errors.push(`source_type must be one of ${Object.values(SourceType).join(', ')}`);
  if (!inEnum(src.extraction_method, ExtractionMethod)) errors.push('extraction_method must be a known method');
  if (!inEnum(src.confidence, Confidence)) errors.push('confidence must be HIGH, MEDIUM, LOW or UNKNOWN');
  if (!inEnum(src.validation_status, ValidationStatus)) errors.push('validation_status must be a known status');
  if (!inEnum(src.evidence_state, EvidenceState)) errors.push('evidence_state must be a known evidence state');
  if (!inEnum(src.disclosure, Disclosure)) errors.push('disclosure must be PRIVATE, INTERNAL or PUBLIC');

  // Provenance is the load-bearing field. Without it a source cannot be
  // re-checked by anyone, which makes every claim built on it unfalsifiable.
  const p = src.provenance;
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    errors.push('provenance is required');
  } else {
    if (!isNonEmptyString(p.origin)) errors.push('provenance.origin is required');
    if (!isNonEmptyString(p.custodian)) errors.push('provenance.custodian is required');
    if (!isNonEmptyString(p.received_at)) errors.push('provenance.received_at is required');
  }

  // Version and timestamp are optional -- a scanned drawing genuinely may not
  // carry either -- but a malformed one is worse than an absent one, because
  // version ordering decides which of two sources supersedes the other.
  if (src.version != null && !(typeof src.version === 'number' && Number.isFinite(src.version) && src.version >= 0)) {
    errors.push('version, when present, must be a non-negative finite number');
  }
  if (src.timestamp != null && !isNonEmptyString(src.timestamp)) {
    errors.push('timestamp, when present, must be a non-empty string');
  }

  // A source cannot declare a state its own class cannot support. This is the
  // rule that stops a MES export from arriving pre-labelled CONFIRMED.
  if (inEnum(src.source_type, SourceType) && inEnum(src.evidence_state, EvidenceState)) {
    const allowed = SOURCE_CAPABILITY[src.source_type];
    if (!allowed.includes(src.evidence_state)) {
      errors.push(`a ${src.source_type} source cannot assert ${src.evidence_state}`);
    }
  }

  // CONFIRMED is the only state that asserts an authoritative correspondence,
  // so it carries the strictest entry conditions anywhere in this file.
  if (src.evidence_state === EvidenceState.CONFIRMED) {
    if (src.source_type !== SourceType.DEVICE_MACHINE_RECORD) {
      errors.push('only an authoritative device<->machine record may assert CONFIRMED');
    }
    if (src.validation_status !== ValidationStatus.VALIDATED) errors.push('CONFIRMED requires validation_status VALIDATED');
    if (src.confidence !== Confidence.HIGH) errors.push('CONFIRMED requires HIGH confidence');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Whether a claim may move from one evidence state to another on the strength
 * of a given source.
 *
 * Written as explicit named refusals rather than a numeric ladder, because
 * the interesting rules are not "higher beats lower". DERIVED cannot become
 * MEASURED no matter how good the source is: the fix for a derived value is
 * to measure it, which produces a new claim, not a promoted one.
 *
 * @returns {{allowed: boolean, reason: string}}
 */
function canPromote(from, to, source) {
  if (!inEnum(from, EvidenceState) || !inEnum(to, EvidenceState)) {
    return { allowed: false, reason: 'unknown evidence state' };
  }
  if (from === to) return { allowed: true, reason: 'no change' };

  const check = validateSource(source);
  if (!check.valid) return { allowed: false, reason: `source rejected: ${check.errors[0]}` };
  if (source.validation_status !== ValidationStatus.VALIDATED) {
    return { allowed: false, reason: 'source is not VALIDATED' };
  }
  if (!SOURCE_CAPABILITY[source.source_type].includes(to)) {
    return { allowed: false, reason: `a ${source.source_type} source cannot support ${to}` };
  }

  // Simulated data is a placeholder that was never evidence. It is replaced by
  // a real measurement, never upgraded into one -- allowing the transition
  // would let an invented coordinate inherit a real source's credibility.
  if (from === EvidenceState.SIMULATED) {
    return { allowed: false, reason: 'SIMULATED data is replaced by real evidence, never promoted' };
  }
  if (to === EvidenceState.SIMULATED) {
    return { allowed: false, reason: 'nothing is promoted INTO SIMULATED' };
  }

  // A derived value is arithmetic on measurements. Re-labelling it MEASURED
  // would claim someone put a scale on it, which nobody did.
  if (from === EvidenceState.DERIVED && to === EvidenceState.MEASURED) {
    return { allowed: false, reason: 'DERIVED is not upgraded to MEASURED; measure it and record a new claim' };
  }

  if (to === EvidenceState.CONFIRMED) {
    if (source.source_type !== SourceType.DEVICE_MACHINE_RECORD) {
      return { allowed: false, reason: 'only an authoritative device<->machine record confirms' };
    }
    if (source.confidence !== Confidence.HIGH) {
      return { allowed: false, reason: 'CONFIRMED requires HIGH confidence' };
    }
  }

  // A weak source cannot overwrite a stronger claim. LOW and UNKNOWN
  // confidence can establish something previously unknown, and nothing more.
  const weak = source.confidence === Confidence.LOW || source.confidence === Confidence.UNKNOWN;
  if (weak && from !== EvidenceState.UNKNOWN) {
    return { allowed: false, reason: 'a LOW/UNKNOWN-confidence source cannot revise an existing claim' };
  }

  return { allowed: true, reason: 'permitted' };
}

/**
 * Whether a proposed physical<->IMS mapping may be created.
 *
 * Kept separate from canPromote because a mapping is not a stronger version
 * of a position -- it is a different assertion entirely, about identity, and
 * it is the single claim this project has the least evidence for.
 *
 * @returns {{allowed: boolean, reason: string}}
 */
function evaluateMappingProposal({ basis, source } = {}) {
  if (!isNonEmptyString(basis)) return { allowed: false, reason: 'a mapping proposal must state its basis' };
  if (REJECTED_BASIS_VALUES.has(basis)) {
    return { allowed: false, reason: `${basis} is never sufficient to create a mapping` };
  }
  if (basis !== AUTHORITATIVE_MAPPING_BASIS) {
    return { allowed: false, reason: `unrecognised basis "${basis}"; only an authoritative record maps` };
  }
  const check = validateSource(source);
  if (!check.valid) return { allowed: false, reason: `source rejected: ${check.errors[0]}` };
  if (source.source_type !== SourceType.DEVICE_MACHINE_RECORD) {
    return { allowed: false, reason: 'basis claims an authoritative record but the source is not one' };
  }
  if (source.validation_status !== ValidationStatus.VALIDATED || source.confidence !== Confidence.HIGH) {
    return { allowed: false, reason: 'an authoritative mapping must be VALIDATED and HIGH confidence' };
  }
  return { allowed: true, reason: 'authoritative record cited' };
}

/**
 * In-memory registry of evidence sources.
 *
 * Deliberately not a device or machine inventory: it stores what a source IS,
 * never what it CONTAINS. The live database remains the only inventory.
 */
function createRegistry() {
  return { sources: new Map(), conflicts: [] };
}

function fingerprint(src) {
  // Identity of a source as far as supersession is concerned. Provenance is
  // included because the same file from a different custodian is a different
  // claim about where it came from.
  return [
    src.source_type,
    src.extraction_method,
    src.confidence,
    src.validation_status,
    src.evidence_state,
    src.disclosure,
    src.version == null ? '' : String(src.version),
    src.timestamp || '',
    src.provenance.origin,
    src.provenance.custodian,
  ].join('|');
}

/**
 * Registers a source.
 *
 * Duplicate handling has three distinct outcomes, because collapsing them
 * would lose the one that matters:
 *   - byte-identical re-registration is idempotent (re-reading the same file)
 *   - a higher version supersedes, and the superseded record is retained
 *   - a same-version disagreement is a CONFLICT and is never auto-resolved
 *
 * Conflicts are preserved rather than settled. Two sources disagreeing is
 * information; picking one silently destroys it.
 *
 * @returns {{accepted: boolean, outcome: string, errors: string[]}}
 */
function register(registry, src) {
  const check = validateSource(src);
  if (!check.valid) return { accepted: false, outcome: 'rejected', errors: check.errors };

  const existing = registry.sources.get(src.source_id);
  if (!existing) {
    registry.sources.set(src.source_id, { ...src, superseded: [] });
    return { accepted: true, outcome: 'registered', errors: [] };
  }

  if (fingerprint(existing) === fingerprint(src)) {
    return { accepted: true, outcome: 'duplicate_ignored', errors: [] };
  }

  const newV = typeof src.version === 'number' ? src.version : null;
  const oldV = typeof existing.version === 'number' ? existing.version : null;

  if (newV != null && oldV != null && newV > oldV) {
    const superseded = existing.superseded.concat([{ version: oldV, timestamp: existing.timestamp || null }]);
    registry.sources.set(src.source_id, { ...src, superseded });
    return { accepted: true, outcome: 'superseded', errors: [] };
  }
  if (newV != null && oldV != null && newV < oldV) {
    // An older version arriving late is not a conflict and must not overwrite.
    return { accepted: false, outcome: 'stale_version_ignored', errors: [] };
  }

  // Same version (or no version at all) but different content: preserve both.
  existing.validation_status = ValidationStatus.CONFLICTING;
  registry.conflicts.push({
    source_id: src.source_id,
    version: newV,
    reason: 'same-version disagreement',
  });
  return { accepted: false, outcome: 'conflict', errors: [] };
}

/**
 * Serialization for anything outside this process.
 *
 * Allowlist by construction, same discipline as lib/diagnostics.js: provenance
 * is free text written by whoever supplied the source, so it is counted and
 * never echoed. A source id is emitted only if it matches the id pattern, and
 * only for sources whose own disclosure says they may be named.
 */
function serializeRegistry(registry) {
  const byType = {};
  const byState = {};
  const byValidation = {};
  const publicIds = [];

  for (const src of registry.sources.values()) {
    byType[src.source_type] = (byType[src.source_type] || 0) + 1;
    byState[src.evidence_state] = (byState[src.evidence_state] || 0) + 1;
    byValidation[src.validation_status] = (byValidation[src.validation_status] || 0) + 1;
    if (src.disclosure === Disclosure.PUBLIC && SOURCE_ID_PATTERN.test(src.source_id)) {
      publicIds.push(src.source_id);
    }
  }

  return {
    source_count: registry.sources.size,
    by_type: byType,
    by_evidence_state: byState,
    by_validation_status: byValidation,
    conflict_count: registry.conflicts.length,
    // Ids only, no reason text: a conflict reason can quote a filename.
    conflict_source_ids: registry.conflicts
      .map((c) => c.source_id)
      .filter((id) => SOURCE_ID_PATTERN.test(id)),
    public_source_ids: publicIds,
  };
}

module.exports = {
  EvidenceState,
  SourceType,
  ExtractionMethod,
  Confidence,
  ValidationStatus,
  Disclosure,
  SOURCE_CAPABILITY,
  REJECTED_MAPPING_BASIS,
  AUTHORITATIVE_MAPPING_BASIS,
  validateSource,
  canPromote,
  evaluateMappingProposal,
  createRegistry,
  register,
  serializeRegistry,
};
