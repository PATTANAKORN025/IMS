# FT-14 — Asset Identity & Evidence: Design

Status: approved for implementation (contract only; no evidence source wired yet)
Depends on: FT-13.5 release (`release/factory-twin-floor1-v1`, PR #18)
Blocks: FT-15 (telemetry overlay), FT-16 (alarm/RCA), FT-17+ (analytics)

## 1. Problem

The Factory Twin's 433-record physical CAD candidate needs a real answer to
one question before any telemetry, alarm, or analytics feature can be built
on top of it: **is this physical asset actually a specific IMS device, and
how do we know?**

Getting this wrong in either direction is worse than not answering it:
- Inferring a mapping from position, numbering, or name similarity
  manufactures identity that looks like data. Every later feature (a status
  color, an alarm badge, a drill-down link) then quietly asserts something
  nobody verified.
- Refusing to define the contract at all pushes the same hard questions
  (what counts as evidence? what happens when two sources disagree? what
  happens when a mapping is later found wrong?) into FT-15, FT-16, and
  FT-17 independently, where three different features would each invent
  their own partial, inconsistent answer.

## 2. What already exists (grounding)

The codebase already contains two identity systems, unreconciled:

**`services/factory-twin-3d/lib/mapping.js`** — a complete, evidence-gated
contract, built for an earlier anonymous-grid design (`PhysicalSlot`,
`physical_slot_id` shaped `PHYS-F1-nnnn`):
- `MappingStatus`: `unresolved` (default) / `confirmed` / `conflicting`
  (two sources disagree, never auto-resolved) / `deprecated` (confirmed
  once, superseded, kept rather than rewritten).
- A mapping reaches `confirmed` only when a caller supplies `source`,
  `source_record`, and `verified_at`. Validation refuses to infer any of
  the three.
- Three separate namespaces (`physical_slot_id`, `ims_device_id`,
  `mes_machine_id`) that may never be merged without an authoritative
  record between them.
- Explicitly, permanently excludes: nearest-slot matching, sequential/
  numeric-order matching, name/string-similarity matching, coordinate-
  similarity matching, auto-promotion to confirmed.

This module is fully written and unit-tested (`tests/unit/factory-twin-
mapping.test.js`) but **is not `require`d anywhere in `server.js`** — dead
code today.

**The live 433-record CAD candidate** uses flat fields instead, set as
static literals in the private geometry JSON at extraction time:
`mapping_status: 'UNMAPPED_TO_IMS'`, `ims_device_id: null`,
`ims_machine_id: null`. No evidence trail, no lifecycle, no conflict
handling. `wire.js` projects these fields through unchanged.

Separately, `server.js` already runs real device discovery
(`refreshDevices()` / `DEVICE_IDS`, polling the DB on an interval) — but
nothing connects that list to a specific piece of equipment. This is why
production honestly reports "0 confirmed IMS mappings" for all 433 records
despite the database containing real devices: the wiring between "devices
exist" and "this CAD record is that device" was never built.

`operational-status.js`'s `statusForAsset(asset, stateByDeviceId)` already
assumes the target shape: it reads `asset.ims_device_id`, returns
`UNMAPPED` if absent, and only then resolves live state. It needs no
changes — it is the one piece already built assuming resolution exists.

## 3. Decision

**Retrofit `lib/mapping.js` onto the CAD equipment layer.** Generalize its
one namespace-specific field rather than build a third parallel system:

- Rename `physical_slot_id` → `asset_id` in the mapping record shape.
  `asset_id` accepts either an anonymous `PHYS-F1-nnnn` slot (legacy,
  still valid for any deployment still using that grid) or a CAD
  `cad_equipment_id` (`EQP-F1-0002`, `EQP-F1-0002-C01`, etc.) — format
  checked, not semantically distinguished; the mapping module does not
  need to know which kind of asset it is naming.
- `MappingStatus`, `confidence`, `source`, `source_record`, `verified_at`,
  and every validation rule in `mapping.js` carry over unchanged. This is
  a rename plus a wiring job, not a rewrite.

## 4. Storage

A new file, `services/factory-twin-3d/private/floor1-mapping.json` —
gitignored, same pattern as `floor1-geometry.json` and
`floor1-equipment-reference.json` (the existing public-engine/private-data
split). One record per `asset_id` with a mapping asserted; an asset with
no entry is `unresolved` by omission, matching `mapping.js`'s existing
"the default and the only honest state without a record."

**Not a database table.** FT-13's standing rule (`Do not change database
schema`) still applies, and there is no need to break it: the mapping file
is small, human-auditable, versionable independently of the geometry file,
and fits the exact pattern this codebase already uses for the geometry/
zones split (`lib/contracts.js`'s own stated reason: "keeps 'where physical
slots are' and 'what's confirmed to occupy them' independently editable").

## 5. Wire contract change

`wire.js`'s `projectEquipment()` currently reads `mapping_status` /
`ims_device_id` / `ims_machine_id` directly off the raw geometry record
(static literals). It changes to:

1. Load `floor1-mapping.json` once at startup (mirroring
   `loadPrivateGeometry()`'s existing pattern), keyed by `asset_id`.
2. For each equipment record, look up its `cad_equipment_id` in that
   table. No entry → `mapping_status: 'UNRESOLVED'`, `ims_device_id: null`.
   An entry → project its `mapping_status`, `ims_device_id`, `confidence`,
   and (new, additive) `evidence_source` / `verified_at` — so a future
   inspector panel can show *why* a mapping is trusted, not just that it
   is.
3. `mapping.js`'s own validator runs over the loaded file before it is
   served, the same fail-closed pattern `floor1-geometry-validator.js`
   already uses for geometry: a malformed mapping file must not reach the
   wire silently.

No change to `operational-status.js`, `diagnostics.js`'s existing counts,
or the client (`app.js`) — they already consume `ims_device_id` /
`mapping_status` by name; only where those values now genuinely come from
changes.

## 6. Evidence source: deferred, by design

No real evidence source (engineer walk-down, MES cross-reference, IMS
commissioning record) exists at this plant yet to populate
`floor1-mapping.json` with. FT-14 ships the contract, the storage shape,
the wire projection, and the validation — and, correctly, **zero confirmed
mappings**, identical to today's honest "0 confirmed IMS mappings" state.
Populating real mappings is a separate, later, human-driven process (likely
its own short spec once a source is chosen), not a data migration this
phase can or should fabricate.

## 7. Consumption contract for FT-15+

This is the part later phases must not each reinvent:

- **Eligible for live overlay** (state, alarm, last-seen, drill-down):
  `mapping_status === 'confirmed'` AND a non-null `ims_device_id`.
- **`conflicting`**: never eligible. Rendered distinctly (e.g. a warning
  glyph, not a state color) so a real disagreement is visible, never
  silently resolved to either candidate.
- **`deprecated`**: not eligible for *new* live overlay, but the historical
  record (who it used to map to, when superseded) remains queryable for
  RCA — a past incident must still resolve to what was true at the time.
- **`unresolved`**: physical-only presentation. No machine state (not
  `UNDEFINED`, not `OFF` — `operational-status.js`'s existing `UNMAPPED`
  data-quality indicator, unchanged). No drill-down target is created.

Any FT-15+ feature reads this same `mapping_status` field and applies
these same four rules — it does not re-derive eligibility from
`ims_device_id` truthiness alone (that was the old, evidence-free
shortcut this phase retires).

## 8. Non-goals (explicitly out of scope for FT-14)

- Populating any real confirmed mapping (§6).
- A UI for entering/editing mappings (a later phase, once a real evidence
  process exists).
- Touching the database schema.
- Changing `operational-status.js`'s eight-state vocabulary.
- Migrating the legacy `PhysicalSlot`/anonymous-grid system off
  `lib/mapping.js` — it keeps working unchanged; this only adds a second
  valid `asset_id` shape.

## 9. Testing plan

- Extend `tests/unit/factory-twin-mapping.test.js` for the renamed
  `asset_id` field and the CAD-shaped format pattern, alongside the
  existing `PHYS-F1-nnnn` one — additive, not a replacement.
- New `floor1-mapping-validator.js` lint (fail-closed on a malformed
  mapping file), matching `floor1-geometry-validator.js`'s existing
  pattern.
- Extend `tests/unit/factory-twin-wire.test.js` for the new projection
  path: no entry → UNRESOLVED; a confirmed entry → all evidence fields
  present; a conflicting entry → never treated as overlay-eligible.
- No change needed to `factory-twin-regression.js`'s existing assertions
  (all 433 records stay UNRESOLVED post-FT-14, matching today's live
  state) — a genuinely useful regression check: this phase must not
  quietly promote anything.
