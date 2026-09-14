# Floor 1 Grid Reconciliation Matrix

Phase 12F. Attempts to resolve, with authoritative evidence, the 7
grid-line-spacing discrepancies Phase 12E
(`docs/floor1/geometry-source-consistency.md`) found between an
externally-supplied X/Y value list and the live CAD-derived structural
grid. No CAD, geometry, registry, or identity-mapping file modified.
No transform changed. The 700mm/individual-position deltas are reported
exactly as found — never distributed, smoothed, or normalized away.

## 1. Authoritative-source inventory

| Source | Location | Classification | Why |
|---|---|---|---|
| Floor1 architectural/structural plan set (DWG) | `Apex3Layout/Floor1.dwg` (58.9 MB) | **AUTHORITATIVE-CANDIDATE, PRESENT, NOT INDEPENDENTLY RE-VERIFIED THIS PHASE** | Real, local, gitignored (`.gitignore:146`) facility drawing — never committed, matching this whole migration's own real-data discipline. `docs/architecture/FACTORY_TWIN_PROVENANCE.md` classifies the served grid as `MEASURED` — "read from the plan set and cross-checked" — i.e. this file IS the documented origin of the live CAD grid. This phase could not independently re-extract the 7 disputed positions from it — see §3. |
| Floor1 architectural/structural plan set (DXF) | `Apex3Layout/Floor1.dxf` (412.5 MB, ASCII DXF, confirmed via header read) | Same as above | The same drawing set in interchange format. Same re-verification limit. |
| `private/floor1-geometry.json` (`grid.x_lines`/`grid.x_labels`/`grid.z_lines`/`grid.z_labels`, read by `lib/wire.js`'s `projectGrid()`, served live at `/api/floor-geometry`'s `grid` field) | `services/factory-twin-3d/private/` (gitignored) | **SUPPORTING** | This is "the live CAD" side of every comparison in this document and in Phase 12E. Confirmed via `lib/wire.js:394-416` (`projectGrid`) that this repository's own server code only PROJECTS (unit/shape normalization) an already-extracted `grid` object — it does not itself parse DWG/DXF. The DWG/DXF → `grid.x_lines`/`grid.z_lines` extraction was performed once, externally, by a process/person not present in this codebase. Real, `MEASURED`-classified per PROVENANCE.md, but not a human-signed drawing package and not independently re-derivable here — SUPPORTING, not AUTHORITATIVE, by this document's own vocabulary. |
| `docs/architecture/FACTORY_TWIN_PROVENANCE.md` | `docs/architecture/` | SUPPORTING (process documentation) | Confirms the grid's classification (`MEASURED`) and namespace (`MEASURED_PHYSICAL`), but names no drawing number, revision, date, or engineer — a methodology statement, not a position-level audit trail for the 7 disputed spacings. |
| The §1 X/Y value lists supplied this phase (and Phase 12E) | (request text only — no file) | **UNKNOWN** | No source document, system, revision, or attribution has been identified anywhere in this repository for these specific numbers, in this phase or Phase 12E. Cannot be elevated above UNKNOWN without one. |
| Any approved/stamped architectural or structural drawing PDF, IFC/BIM export, or named survey report | — | **NOT FOUND** | Searched `docs/`, repo root, and the working tree for `.ifc`/`.rvt`/drawing-PDF patterns and grid/axis/survey keywords (see §3) — nothing beyond the DWG/DXF pair above and their JSON projection. |

## 2. The 7 discrepancies (exact, from Phase 12E, re-verified here)

Cumulative positions assume the supplied spacing sequence starts at the
SAME line-1/line-A origin as the live CAD (`-87250` mm for X line 1,
`-60150` mm for Y line A) — this is an assumption made only to compute a
comparable cumulative walk, not a claim about the supplied data's own
origin, which is unstated.

| axis | grid_label | supplied_value_mm | live_cad_value_mm | delta_mm | cumulative_position_supplied_mm | cumulative_position_cad_mm | status |
|---|---|---:|---:|---:|---:|---:|---|
| X | 10→11 | 8500 | 7437 | +1063 | −1300 (line 11) | −2363 (line 11) | UNRESOLVED |
| X | 11→12 | 7450 | 9613 | −2163 | 6150 (line 12) | 7250 (line 12) | UNRESOLVED |
| X | 12→13 | 9600 | 8847 | +753 | 15750 (line 13) | 16097 (line 13) | UNRESOLVED |
| X | 16→17 | 8500 | 8850 | −350 | 50800 (line 17) | 51500 (line 17) | UNRESOLVED |
| Y | E→F | 10025 | 10012 | +13 | −8525 (line F) | −8538 (line F) | UNRESOLVED |
| Y | F→G | 10000 | 9988 | +12 | 1475 (line G) | 1450 (line G) | UNRESOLVED |
| Y | G→H | 9975 | 10000 | −25 | 11450 (line H) | 11450 (line H) | UNRESOLVED |

None of the six deltas above have been rounded away — each is the exact
millimetre difference between the two sources.

**Notable, exact fact from this table, worth stating plainly**: the Y-axis
cumulative position at line H matches exactly (11450 = 11450) between the
two sources, even though none of the three spacings feeding into it
(E→F, F→G, G→H) individually match. The three deltas (+13, +12, −25)
sum to exactly zero. A downstream cumulative match is not evidence that
the intervening spacings are correct — this is the concrete, numeric
version of the warning Phase 12E and this mission's own §5 both make:
aggregate/downstream agreement is not proof of individual-position
correctness.

## 3. What was actually attempted against the DWG/DXF, and why it did not resolve the 7 positions

This phase did not stop at "no source found" without trying the real
one first:

1. Confirmed `Apex3Layout/Floor1.dxf` is ASCII DXF (header bytes read:
   `0\r\nSECTION\r\n2\r\nHEADER\r\n...`), not binary — in principle
   readable without a specialized CAD library.
2. Searched the first 15 MB (a generous bound for a HEADER/TABLES
   section that normally precedes the bulk BLOCKS/ENTITIES data) for
   layer names matching `GRID`, `AXIS`, `S-GRID`, `A-GRID`,
   `COLUMN-GRID` and similar conventional structural-grid layer naming
   — **zero matches**.
3. Confirmed via `services/factory-twin-3d/lib/wire.js`'s own
   `projectGrid()` (lines 394-416) that this codebase's real,
   production extraction pipeline does NOT parse DWG/DXF at all — it
   only reshapes an already-extracted `grid.x_lines`/`grid.z_lines`
   array that some earlier, external, undocumented process produced.
   There is no DXF-parsing tool anywhere in this repository to borrow.
4. Did not attempt a blind keyword/coordinate grep across the full
   412 MB file: DXF's own group-code format interleaves plain small
   integers (`0`, `1`, `2`, `10`, `11`...) as STRUCTURAL MARKERS
   throughout the entire file, indistinguishable from grid-label text
   content without a real, stateful entity parser (tracking which
   group code follows an `ENTITIES`/`TEXT`/`LINE` marker, on which
   layer). A line-based text search would produce false matches by
   construction, not a genuine extraction — doing so anyway would have
   been choosing a number "based on plausibility," exactly what this
   mission's §3/§5 forbid.

**Conclusion**: the real, authoritative source for this facility's grid
(the plan set) exists locally and is not a hypothetical "ask engineering
for a drawing" gap — the file is already here. What is missing is (a) a
DXF-capable parsing tool in this environment to safely re-extract the 7
specific positions from it, and (b) any named attribution for the
supplied X/Y value lists this phase was asked to reconcile against it.

## 4. Classification (mission §4 vocabulary)

All 7 rows: **AMBIGUOUS** — a real disagreement exists between two real
data points (the supplied values and the live CAD), but no third,
independently authoritative reading of these specific 7 positions was
obtainable this phase (§3). Per mission §4's own rule, `SUPPLIED_WRONG`
or `CAD_WRONG` is never assigned without an authoritative source proving
it — neither exists here, so neither classification is used for any row.

## 5. Confidence

- **High confidence** that the 7 deltas themselves are correctly
  computed (re-derived independently in this phase from the live
  `/api/floor-geometry` response and the exact supplied value list;
  cross-checked against Phase 12E's own numbers — identical).
- **High confidence** that the live CAD grid is `MEASURED`/plan-set-derived
  in general (PROVENANCE.md), which is meaningfully stronger provenance
  than the supplied list's current zero attribution — but this is
  process-level confidence, not position-level proof, and is
  deliberately NOT used here to declare the CAD correct at these 7
  specific positions (mission §5's own explicit prohibition).
- **Zero confidence** in the supplied list's provenance — still
  unattributed after two phases of asking.

## 6. Unresolved questions

Same four as Phase 12E §8, still open, plus one new one from this
phase's own investigation:

1. What document/system produced the supplied X/Y value lists? (unchanged)
2. Is the live CAD correct at grid lines 10–12/16-17 (X) and E–H (Y),
   or does the supplied list reflect a real, more recent as-built
   change the CAD survey has not caught up to? (unchanged)
3. Is the live CAD's own non-round F-line position (`-8.538m`) itself
   the accurate as-built value? (unchanged)
4. What units and origin does the supplied list actually use? (unchanged)
5. **New**: is there a DXF-capable parsing tool this engagement is
   authorized to install/use, so the 7 positions can be re-extracted
   directly from `Apex3Layout/Floor1.dxf` rather than trusted at one
   remove via `private/floor1-geometry.json`?

## 7. Recommended next action

In order of how directly each one would close this discrepancy:

1. **Re-extract the 7 disputed grid-line coordinates directly from
   `Apex3Layout/Floor1.dxf`** using a proper DXF entity parser (e.g. a
   Node `dxf-parser` package, or exporting the grid layer from AutoCAD/
   a CAD viewer to a plain coordinate list) — this is the fastest path
   to an independently-verifiable answer, since the source file is
   already present locally and needs no new data collection.
2. Identify and produce the source document for the supplied X/Y
   value lists (name, revision, date) so it can be classified and
   weighed on its own merits rather than as an anonymous number list.
3. If (1) confirms the live CAD at all 7 positions, this phase's own
   AMBIGUOUS classification is superseded by CAD_WRONG-ruled-out /
   MATCHED for those rows in a future phase — not assumed here.
4. If (1) is not feasible, a named, qualified person re-reading those
   7 specific dimensions directly off the plan set (with attribution)
   would serve the same purpose.

---

**Status: GRID_SOURCE_UNRESOLVED**

The authoritative plan set (`Apex3Layout/Floor1.dwg`/`.dxf`) is present in
this repository's working tree, but this phase lacks the tooling to
safely, independently re-extract and verify the 7 disputed grid-line
positions from it (§3) — a real, closable gap, not a missing document.
The supplied X/Y value lists remain unattributed to any source. Neither
the supplied values nor the live CAD is treated as correct at these 7
positions. No CAD, geometry, registry, or identity-mapping file was
modified by this phase.
