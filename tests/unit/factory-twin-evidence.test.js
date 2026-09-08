/**
 * Unit tests for the evidence source registry and promotion rules.
 *
 * The rules in lib/evidence.js only earn their keep if they REFUSE things, so
 * most of what follows is rejection: sources without provenance, MES exports
 * claiming CONFIRMED, simulated placeholders trying to become real, and every
 * mapping basis this project has been tempted by (proximity, sequential ids,
 * name similarity, grid symmetry).
 *
 * Every value here is obviously synthetic. No real drawing, device, machine,
 * custodian or filename appears in this file.
 *
 * Run: node tests/unit/factory-twin-evidence.test.js
 */

'use strict';

const assert = require('assert');
const E = require('../../services/factory-twin-3d/lib/evidence');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}

const provenance = () => ({
  origin: 'TEST-ORIGIN',
  custodian: 'TEST-CUSTODIAN',
  received_at: '2026-01-01',
});

/** A well-formed drawing source: the baseline every negative case mutates. */
const drawing = (over = {}) => ({
  source_id: 'test-drawing-01',
  source_type: E.SourceType.DRAWING,
  extraction_method: E.ExtractionMethod.PIXEL_CALIBRATION,
  confidence: E.Confidence.HIGH,
  validation_status: E.ValidationStatus.VALIDATED,
  evidence_state: E.EvidenceState.MEASURED,
  disclosure: E.Disclosure.PRIVATE,
  provenance: provenance(),
  version: 1,
  timestamp: '2026-01-01T00:00:00Z',
  ...over,
});

/** The only source class that can confirm anything. */
const authoritative = (over = {}) => ({
  source_id: 'test-device-record-01',
  source_type: E.SourceType.DEVICE_MACHINE_RECORD,
  extraction_method: E.ExtractionMethod.VENDOR_EXPORT,
  confidence: E.Confidence.HIGH,
  validation_status: E.ValidationStatus.VALIDATED,
  evidence_state: E.EvidenceState.CONFIRMED,
  disclosure: E.Disclosure.INTERNAL,
  provenance: provenance(),
  version: 1,
  ...over,
});

// ── valid evidence ──
test('a well-formed drawing source validates', () => {
  assert.deepStrictEqual(E.validateSource(drawing()), { valid: true, errors: [] });
});

test('a well-formed authoritative record validates', () => {
  assert.strictEqual(E.validateSource(authoritative()).valid, true);
});

test('all five supported source classes are accepted when well-formed', () => {
  const states = {
    [E.SourceType.DRAWING]: E.EvidenceState.MEASURED,
    [E.SourceType.CAD_DXF]: E.EvidenceState.MEASURED,
    [E.SourceType.SECTION_ELEVATION]: E.EvidenceState.MEASURED,
    [E.SourceType.MES_EXPORT]: E.EvidenceState.OBSERVED,
    [E.SourceType.DEVICE_MACHINE_RECORD]: E.EvidenceState.OBSERVED,
  };
  for (const [type, state] of Object.entries(states)) {
    const r = E.validateSource(drawing({ source_type: type, evidence_state: state }));
    assert.strictEqual(r.valid, true, `${type}: ${r.errors.join('; ')}`);
  }
});

// ── invalid evidence ──
test('a non-object source is rejected rather than coerced', () => {
  for (const bad of [null, undefined, 'TEST-STRING', 42, []]) {
    assert.strictEqual(E.validateSource(bad).valid, false, `accepted ${JSON.stringify(bad)}`);
  }
});

test('an unknown source type is rejected, not treated as generic', () => {
  const r = E.validateSource(drawing({ source_type: 'TEST-UNKNOWN-TYPE' }));
  assert.strictEqual(r.valid, false);
});

test('a malformed source id is rejected', () => {
  for (const id of ['', 'AB', 'Has Spaces', '../traversal', 'UPPERCASE', 'x'.repeat(200)]) {
    assert.strictEqual(E.validateSource(drawing({ source_id: id })).valid, false, `accepted "${id}"`);
  }
});

test('a malformed version or timestamp is rejected', () => {
  assert.strictEqual(E.validateSource(drawing({ version: -1 })).valid, false);
  assert.strictEqual(E.validateSource(drawing({ version: 'TEST-NOT-A-NUMBER' })).valid, false);
  assert.strictEqual(E.validateSource(drawing({ version: Infinity })).valid, false);
  assert.strictEqual(E.validateSource(drawing({ timestamp: '' })).valid, false);
});

test('an absent version or timestamp is allowed — a scan may carry neither', () => {
  assert.strictEqual(E.validateSource(drawing({ version: undefined, timestamp: undefined })).valid, true);
});

// ── missing provenance ──
test('a source without provenance is rejected', () => {
  const r = E.validateSource(drawing({ provenance: undefined }));
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('provenance')));
});

test('provenance missing any one required field is rejected', () => {
  for (const field of ['origin', 'custodian', 'received_at']) {
    const p = provenance();
    delete p[field];
    assert.strictEqual(E.validateSource(drawing({ provenance: p })).valid, false, `accepted missing ${field}`);
  }
});

test('a blank provenance field does not satisfy the requirement', () => {
  assert.strictEqual(E.validateSource(drawing({ provenance: { ...provenance(), origin: '   ' } })).valid, false);
});

// ── source class ceilings ──
test('a MES export cannot assert CONFIRMED', () => {
  const r = E.validateSource(
    drawing({ source_type: E.SourceType.MES_EXPORT, evidence_state: E.EvidenceState.CONFIRMED })
  );
  assert.strictEqual(r.valid, false);
});

test('a drawing cannot assert CONFIRMED however well validated', () => {
  const r = E.validateSource(drawing({ evidence_state: E.EvidenceState.CONFIRMED }));
  assert.strictEqual(r.valid, false);
});

test('CONFIRMED additionally requires VALIDATED and HIGH confidence', () => {
  assert.strictEqual(E.validateSource(authoritative({ validation_status: E.ValidationStatus.PENDING })).valid, false);
  assert.strictEqual(E.validateSource(authoritative({ confidence: E.Confidence.MEDIUM })).valid, false);
});

// ── illegal state promotion ──
test('UNKNOWN may become MEASURED on a validated measuring source', () => {
  const r = E.canPromote(E.EvidenceState.UNKNOWN, E.EvidenceState.MEASURED, drawing());
  assert.strictEqual(r.allowed, true, r.reason);
});

test('DERIVED never becomes MEASURED', () => {
  const r = E.canPromote(E.EvidenceState.DERIVED, E.EvidenceState.MEASURED, drawing());
  assert.strictEqual(r.allowed, false);
  assert.ok(/DERIVED is not upgraded/.test(r.reason), r.reason);
});

test('an unvalidated source promotes nothing', () => {
  const r = E.canPromote(E.EvidenceState.UNKNOWN, E.EvidenceState.MEASURED, drawing({ validation_status: E.ValidationStatus.PENDING }));
  assert.strictEqual(r.allowed, false);
});

test('a weak source can establish the unknown but cannot revise a claim', () => {
  const weak = drawing({ confidence: E.Confidence.LOW });
  assert.strictEqual(E.canPromote(E.EvidenceState.UNKNOWN, E.EvidenceState.OBSERVED, weak).allowed, true);
  assert.strictEqual(E.canPromote(E.EvidenceState.OBSERVED, E.EvidenceState.MEASURED, weak).allowed, false);
});

test('a source cannot promote past its own class ceiling', () => {
  const mes = drawing({ source_type: E.SourceType.MES_EXPORT, evidence_state: E.EvidenceState.OBSERVED });
  assert.strictEqual(E.canPromote(E.EvidenceState.UNKNOWN, E.EvidenceState.MEASURED, mes).allowed, false);
});

test('OBSERVED becomes CONFIRMED only on an authoritative record', () => {
  assert.strictEqual(E.canPromote(E.EvidenceState.OBSERVED, E.EvidenceState.CONFIRMED, drawing()).allowed, false);
  assert.strictEqual(E.canPromote(E.EvidenceState.OBSERVED, E.EvidenceState.CONFIRMED, authoritative()).allowed, true);
});

test('a promotion driven by an invalid source is refused before anything else', () => {
  const r = E.canPromote(E.EvidenceState.UNKNOWN, E.EvidenceState.MEASURED, drawing({ provenance: undefined }));
  assert.strictEqual(r.allowed, false);
  assert.ok(/source rejected/.test(r.reason));
});

// ── simulated -> confirmed rejection ──
test('SIMULATED never promotes to CONFIRMED', () => {
  const r = E.canPromote(E.EvidenceState.SIMULATED, E.EvidenceState.CONFIRMED, authoritative());
  assert.strictEqual(r.allowed, false);
  assert.ok(/replaced by real evidence/.test(r.reason), r.reason);
});

test('SIMULATED promotes to nothing at all, and nothing promotes into it', () => {
  for (const to of Object.values(E.EvidenceState)) {
    if (to === E.EvidenceState.SIMULATED) continue;
    assert.strictEqual(
      E.canPromote(E.EvidenceState.SIMULATED, to, authoritative()).allowed,
      false,
      `SIMULATED -> ${to} was allowed`
    );
  }
  assert.strictEqual(E.canPromote(E.EvidenceState.OBSERVED, E.EvidenceState.SIMULATED, drawing()).allowed, false);
});

// ── mapping bases ──
test('proximity never creates a mapping', () => {
  const r = E.evaluateMappingProposal({ basis: E.REJECTED_MAPPING_BASIS.PROXIMITY, source: authoritative() });
  assert.strictEqual(r.allowed, false);
  assert.ok(/never sufficient/.test(r.reason));
});

test('sequential numbering never creates a mapping', () => {
  assert.strictEqual(
    E.evaluateMappingProposal({ basis: E.REJECTED_MAPPING_BASIS.SEQUENTIAL_ID, source: authoritative() }).allowed,
    false
  );
});

test('name similarity never creates a mapping', () => {
  assert.strictEqual(
    E.evaluateMappingProposal({ basis: E.REJECTED_MAPPING_BASIS.NAME_SIMILARITY, source: authoritative() }).allowed,
    false
  );
});

test('every listed rejected basis is refused, even with a perfect source', () => {
  for (const basis of Object.values(E.REJECTED_MAPPING_BASIS)) {
    assert.strictEqual(
      E.evaluateMappingProposal({ basis, source: authoritative() }).allowed,
      false,
      `${basis} was allowed`
    );
  }
});

test('an unrecognised basis is refused rather than assumed harmless', () => {
  assert.strictEqual(E.evaluateMappingProposal({ basis: 'TEST-NOVEL-BASIS', source: authoritative() }).allowed, false);
  assert.strictEqual(E.evaluateMappingProposal({}).allowed, false);
});

test('an authoritative basis backed by a non-authoritative source is refused', () => {
  const r = E.evaluateMappingProposal({ basis: E.AUTHORITATIVE_MAPPING_BASIS, source: drawing() });
  assert.strictEqual(r.allowed, false);
});

test('an authoritative basis with a validated authoritative record is the one accepted case', () => {
  const r = E.evaluateMappingProposal({ basis: E.AUTHORITATIVE_MAPPING_BASIS, source: authoritative() });
  assert.strictEqual(r.allowed, true, r.reason);
});

// ── duplicate and version handling ──
test('re-registering an identical source is idempotent', () => {
  const reg = E.createRegistry();
  assert.strictEqual(E.register(reg, drawing()).outcome, 'registered');
  assert.strictEqual(E.register(reg, drawing()).outcome, 'duplicate_ignored');
  assert.strictEqual(reg.sources.size, 1);
  assert.strictEqual(reg.conflicts.length, 0);
});

test('a higher version supersedes and the superseded version is retained', () => {
  const reg = E.createRegistry();
  E.register(reg, drawing({ version: 1 }));
  const r = E.register(reg, drawing({ version: 2, confidence: E.Confidence.MEDIUM }));
  assert.strictEqual(r.outcome, 'superseded');
  const stored = reg.sources.get('test-drawing-01');
  assert.strictEqual(stored.version, 2);
  assert.deepStrictEqual(stored.superseded.map((s) => s.version), [1]);
});

test('an older version arriving late does not overwrite', () => {
  const reg = E.createRegistry();
  E.register(reg, drawing({ version: 5 }));
  const r = E.register(reg, drawing({ version: 2 }));
  assert.strictEqual(r.outcome, 'stale_version_ignored');
  assert.strictEqual(reg.sources.get('test-drawing-01').version, 5);
});

test('an invalid source is never registered', () => {
  const reg = E.createRegistry();
  const r = E.register(reg, drawing({ provenance: undefined }));
  assert.strictEqual(r.accepted, false);
  assert.strictEqual(reg.sources.size, 0);
});

// ── conflicting evidence ──
test('a same-version disagreement is preserved as a conflict, not resolved', () => {
  const reg = E.createRegistry();
  E.register(reg, drawing({ version: 1, evidence_state: E.EvidenceState.MEASURED }));
  const r = E.register(reg, drawing({ version: 1, evidence_state: E.EvidenceState.OBSERVED }));
  assert.strictEqual(r.outcome, 'conflict');
  assert.strictEqual(reg.conflicts.length, 1);
  // The original claim is not silently replaced by the newcomer...
  assert.strictEqual(reg.sources.get('test-drawing-01').evidence_state, E.EvidenceState.MEASURED);
  // ...and it is flagged so nothing downstream treats it as settled.
  assert.strictEqual(reg.sources.get('test-drawing-01').validation_status, E.ValidationStatus.CONFLICTING);
});

test('a versionless disagreement also conflicts rather than last-write-wins', () => {
  const reg = E.createRegistry();
  E.register(reg, drawing({ version: undefined, confidence: E.Confidence.HIGH }));
  const r = E.register(reg, drawing({ version: undefined, confidence: E.Confidence.MEDIUM }));
  assert.strictEqual(r.outcome, 'conflict');
  assert.strictEqual(reg.sources.get('test-drawing-01').confidence, E.Confidence.HIGH);
});

// ── safe serialization ──
test('serialization emits counts and enums, never provenance text', () => {
  const reg = E.createRegistry();
  E.register(reg, drawing({
    provenance: {
      origin: 'TEST-SECRET-ORIGIN-PATH',
      custodian: 'TEST-PERSON-NAME',
      received_at: 'TEST-SECRET-DATE',
    },
  }));
  const s = JSON.stringify(E.serializeRegistry(reg));
  for (const needle of ['TEST-SECRET-ORIGIN-PATH', 'TEST-PERSON-NAME', 'TEST-SECRET-DATE']) {
    assert.ok(!s.includes(needle), `${needle} leaked`);
  }
  assert.strictEqual(E.serializeRegistry(reg).source_count, 1);
});

test('a PRIVATE source is counted but never named', () => {
  const reg = E.createRegistry();
  E.register(reg, drawing({ disclosure: E.Disclosure.PRIVATE }));
  const out = E.serializeRegistry(reg);
  assert.strictEqual(out.source_count, 1);
  assert.deepStrictEqual(out.public_source_ids, []);
});

test('a PUBLIC source may be named', () => {
  const reg = E.createRegistry();
  E.register(reg, drawing({ disclosure: E.Disclosure.PUBLIC }));
  assert.deepStrictEqual(E.serializeRegistry(reg).public_source_ids, ['test-drawing-01']);
});

test('serialized output contains only safe string shapes', () => {
  const reg = E.createRegistry();
  E.register(reg, drawing({ disclosure: E.Disclosure.PUBLIC }));
  E.register(reg, authoritative({ evidence_state: E.EvidenceState.OBSERVED }));
  const allowed = new Set([
    ...Object.values(E.SourceType),
    ...Object.values(E.EvidenceState),
    ...Object.values(E.ValidationStatus),
  ]);
  const walk = (node, at) => {
    if (node === null || typeof node === 'number' || typeof node === 'boolean') return;
    if (typeof node === 'string') {
      assert.ok(
        allowed.has(node) || /^[a-z0-9][a-z0-9_-]{2,63}$/.test(node),
        `unexpected string at ${at}: "${node}"`
      );
      return;
    }
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${at}[${i}]`));
    for (const [k, v] of Object.entries(node)) {
      assert.ok(allowed.has(k) || /^[a-z_]+$/.test(k), `unexpected key at ${at}: "${k}"`);
      walk(v, `${at}.${k}`);
    }
  };
  walk(E.serializeRegistry(reg), 'root');
});

test('an empty registry serializes to zeros rather than throwing', () => {
  const out = E.serializeRegistry(E.createRegistry());
  assert.strictEqual(out.source_count, 0);
  assert.strictEqual(out.conflict_count, 0);
  assert.deepStrictEqual(out.public_source_ids, []);
});

test('validating a source never mutates it', () => {
  const src = drawing();
  const before = JSON.stringify(src);
  E.validateSource(src);
  E.canPromote(E.EvidenceState.UNKNOWN, E.EvidenceState.MEASURED, src);
  assert.strictEqual(JSON.stringify(src), before);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
