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

## Sources already evaluated and rejected

Recorded so they are not re-investigated:

| Source | Outcome |
|---|---|
| A CAD file present alongside the floor plans | **Rejected on content.** A single-part drawing on a small sheet at no fixed scale, unrelated to this facility. |
| Screenshot of the external manufacturing system | **Partially usable.** Establishes the identifier scheme and status vocabulary; not usable for census (resolution) or position (schematic). |
| The monitoring database | **No spatial content.** No floor, coordinate, grid reference or machine tag; locations are sanitized placeholders and no placement or layout table exists. |
| Plan sets for the building's other floors | **Used**, and the source of the floor-to-floor height. They do not carry sections, elevations, or clear height. |
