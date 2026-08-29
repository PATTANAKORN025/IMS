<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Factory Twin — Evidence Requirements

What the twin still cannot represent, and precisely what would unlock each
capability.

Companion to **[Factory Twin — Reconstruction Methodology](FACTORY_TWIN_RECONSTRUCTION.md)**.

> [!NOTE]
> Everything below is blocked on **a source that does not exist**, not on
> implementation effort. Adding engineering time to the current sources will
> not move any of these.

---

## Priority 1 — Manufacturing system export

**Unlocks:** an authoritative equipment census; the status vocabulary that the
existing machine-state model already anticipates; per-process grouping.

| | |
|---|---|
| **Required fields** | Machine identifier (with its process-group prefix intact), process group, status, and — if present — any facility-side asset tag. |
| **Format** | Any structured export: CSV, JSON, or a read-only view. A screenshot is not sufficient; that is precisely what blocks this today. |
| **Validation required** | Schema and namespace validation; duplicate detection; confirmation that identifiers are not silently renumbered between exports. |
| **Security implications** | Will contain real process names and may contain operator identities. Must land in the private, gitignored data path and must never be committed. Any operator identity should be stripped at the boundary, not stored and filtered later. |

**Explicitly does not unlock:** positions. That system's layout is schematic
and not to scale; its coordinates must never be treated as physical.

---

## Priority 2 — Vector CAD of this floor

**Unlocks:** the largest single gain available — interior walls, doors, lift
pits, and exact rather than digitized boundaries. It would also replace every
pixel-derived coordinate with an authored one.

| | |
|---|---|
| **Required fields** | Named layers, closed polylines for area boundaries, and wall geometry as distinct entities. Millimetre units. |
| **Format** | DXF or DWG of the correct floor. |
| **Validation required** | Confirm it is the correct floor and the correct building before any use — a CAD file already present in the source folder turned out to be an unrelated single-part drawing, and was rejected on content, not assumed. Cross-check its grid against the established calibration. |
| **Security implications** | Same class as the source drawing: outside the repository, never in the Docker context, never served. |

---

## Priority 3 — Architectural section or elevation

**Unlocks:** clear ceiling height, currently `null`. Would let structural
objects be drawn to their real height instead of the disclosed floor-to-floor
visualization convention.

| | |
|---|---|
| **Required fields** | A dimensioned vertical section through the floor, or an elevation with floor and soffit levels. |
| **Validation required** | The derived clear height must be less than the known floor-to-floor height; the validator already enforces this. It must be supplied with its source — an unsourced value is rejected as an estimate. |
| **Security implications** | Same as any facility drawing. |

---

## Priority 4 — Authoritative device-to-machine mapping

**Unlocks:** live telemetry on real physical positions — the capability that
makes this a digital twin rather than a measured model.

| | |
|---|---|
| **Required fields** | Device identifier, the machine identifier it corresponds to, who asserted the correspondence, and when. |
| **Format** | A maintained record — a table, an export, or a signed-off spreadsheet. |
| **Validation required** | One device to one position and one position to one device; unknown identifiers rejected rather than created; conflicting assertions surfaced as conflicts rather than resolved by preference. |
| **Security implications** | Ties real equipment to real network devices. Private path only. |

> [!WARNING]
> This mapping must come from a record, never from inference. Proximity,
> numbering order, and count coincidence are not evidence. If the number of
> devices ever happens to match the number of detected positions, that is a
> coincidence and must not be treated as a correspondence.

---

## Evidence promotion contract

When one of the sources above arrives, what it is *allowed to claim* is decided
in code, not in review. `services/factory-twin-3d/lib/evidence.js` holds that
contract; `tests/unit/factory-twin-evidence.test.js` holds its proof.

It is a **contract, not an inventory**. It stores no machine records and
duplicates nothing that lives in the database.

### What a source must carry

Every registered source declares: source type, provenance, extraction method,
confidence, validation status, evidence state, version or timestamp where
available, and disclosure status.

**Missing or blank provenance rejects the source.** So does a malformed one —
an unrecognised source type is rejected outright rather than degraded to a
generic one, because a source nobody can classify is a source nobody can bound.

### What each class may assert

Each source class has a ceiling. A source cannot promote a claim past its own
class, however well validated it is.

| Source class | States it may assert |
|---|---|
| Drawing-derived | MEASURED, OBSERVED, DERIVED |
| CAD / DXF | MEASURED, OBSERVED, DERIVED |
| Section / elevation | MEASURED, DERIVED |
| Structured MES export | OBSERVED only — it names machines; it does not say where they are or which device polls them |
| Authoritative device-to-machine record | CONFIRMED, OBSERVED |

CONFIRMED additionally requires validated status and high confidence. **Only an
authoritative record can reach it**, which is why the twin reports 0 confirmed
mappings and will continue to until Priority 4 arrives.

### Promotions that are refused

| Refusal | Reason |
|---|---|
| DERIVED never becomes MEASURED | Computing a value does not measure it. |
| SIMULATED promotes to nothing, and nothing promotes into it | Simulated data is a placeholder, not a weak observation. |
| An unvalidated source promotes nothing | Validation is a precondition, not a tiebreaker. |
| A low or unknown-confidence source may establish the previously UNKNOWN, but may not revise an existing claim | Weak evidence can fill a void; it cannot overturn stronger evidence. |
| Disagreeing sources are preserved as a conflict | Resolving by preference would make the acceptance test into a generator. |
| Absence of evidence stays UNKNOWN | Silence is not a value. |

### Mapping bases that are refused

A physical-to-device mapping may be created from **one** basis: an
authoritative device-machine record, backed by a validated source of that
class. Everything else is refused by name:

proximity · sequential identifiers · name similarity · grid symmetry · visual
similarity · machine ordering · MES numbering

An unrecognised basis is refused as well, rather than assumed harmless. A
plausible-looking basis nobody enumerated is exactly how an inferred mapping
would get in.

### Duplicates, versions and conflicts

- Re-registering an identical source is idempotent.
- A higher version supersedes, and the superseded version is retained.
- An older version arriving late does not overwrite a newer one.
- A same-version disagreement, or a disagreement between versionless sources,
  is preserved as a conflict rather than resolved by last write.

### Serialization

Registry output is allowlist-by-construction: counts and enum values only, ids
only where they match a safe pattern, provenance text never echoed, and sources
marked `PRIVATE` counted but never named. See
**[Security Model](FACTORY_TWIN_SECURITY_MODEL.md)**.

---

## Integration procedure for a new source

The same sequence applies to an MES export, a DXF, a section, or a mapping
record. It is deliberately dull.

1. **Verify identity before use.** Confirm the artefact is this building and
   this floor. A CAD file already present alongside the floor plans turned out
   to be an unrelated single-part drawing; it was rejected on content, not
   assumed on filename.
2. **Place it in the private path.** `services/factory-twin-3d/private/`, which
   is gitignored, bind-mounted read-only, and never copied into an image. It
   never enters the repository, the Docker build context, or a ticket
   attachment.
3. **Strip identities at the boundary.** Operator names and similar personal
   data are removed on import, not stored and filtered later.
4. **Register the source** with its full descriptor. Missing provenance stops
   here, by design.
5. **Let validation decide the state.** Do not hand-set an evidence state to
   the one you expect; let the contract derive what the source may assert.
6. **Extend the serving allowlist deliberately.** A new field reaches the wire
   only when someone adds it to the route's allowlist in a reviewed change.
7. **Re-run the suite.** The standing invariants in
   **[Visual QA](FACTORY_TWIN_VISUAL_QA.md)** are expected to move when real
   evidence arrives — that is the point — but every change must be attributable
   to the new source rather than to a regression.
8. **Update the current-state table** in
   **[Reconstruction Methodology](FACTORY_TWIN_RECONSTRUCTION.md)**, including
   any row that moves off BLOCKED.

> [!IMPORTANT]
> Steps 4 and 5 are where fabrication would enter if it ever did. A source that
> cannot support a claim must be allowed to fail to support it.

## Sources already evaluated and rejected

Recorded so they are not re-investigated:

| Source | Outcome |
|---|---|
| A CAD file present alongside the floor plans | **Rejected on content.** A single-part drawing on a small sheet at no fixed scale, unrelated to this facility. |
| Screenshot of the external manufacturing system | **Partially usable.** Establishes the identifier scheme and status vocabulary; not usable for census (resolution) or position (schematic). |
| The monitoring database | **No spatial content.** No floor, coordinate, grid reference or machine tag; locations are sanitized placeholders and no placement or layout table exists. |
| Plan sets for the building's other floors | **Used**, and the source of the floor-to-floor height. They do not carry sections, elevations, or clear height. |
