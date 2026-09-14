# Floor 1 Grid Correction — Engineering Decision Package

Phase 12I. Converts Phase 12E/12F/12H's forensic findings into a
controlled decision package. **This is not a CAD-editing phase.** No
runtime correction is authorized by this document. Read-only:
`private/floor1-geometry.json`, `lib/wire.js`, `/api/floor-geometry`,
Factory Twin rendering, CAD source files, the Floor 1 registry, identity
mappings, the database, nginx, and Grafana are all confirmed unmodified
by this phase.

Every value below is taken verbatim from the three already-committed
source documents this phase re-read (not reinterpreted):
`docs/floor1/geometry-source-consistency.md` (Phase 12E),
`docs/floor1/cad-native-grid-extraction.md` (Phase 12H), and
`docs/architecture/FLOOR1_DXF_FORENSIC_AUDIT.md` (the pre-existing
independent audit Phase 12H found and cited).

## A. What is proven

- **Envelope**: 174.5m × 120.3m (174500mm × 120300mm). Confirmed by
  three independent sources: the live `/api/floor-geometry` envelope,
  the forensic audit's `CAP` layer bounding box, and the forensic
  audit's own largest `DIMENSION` entities. Exact agreement, to the
  millimetre.
- **Grid topology**: 21 X-lines, 14 Z-lines. Confirmed by the live API
  (`grid.x`/`grid.z` array lengths) and the forensic audit
  (`docs/architecture/FLOOR1_DXF_FORENSIC_AUDIT.md` §3, "Structural
  grid: labeled axis lines (21 x-lines, 14 z-lines)").
- **Three confirmed discrepancies** (position-level evidence,
  `docs/floor1/cad-native-grid-extraction.md` §3):
  - **Y grid line G→H**: supplied value `9975mm` is confirmed wrong
    (the forensic audit's own words: one of "two spans" raster
    misread, independently corrected by CAD column-centre geometry to
    exactly `10000mm`). The runtime-served value (`10000mm`) already
    matches that CAD-confirmed figure.
  - **Y grid line F→G**: runtime-served value `9988mm` does not match
    either the supplied value (`10000mm`) or the forensic CAD value
    (`10000mm`), which agree with each other exactly.
  - **Y grid line E→F**: neither the supplied value (`10025mm`) nor the
    runtime-served value (`10012mm`) matches the forensic audit's other
    named raster-misread correction (`10000mm` exact) — both differ
    from it, by different amounts.
- **The overall X-axis shape** (`8500mm ×8`, `7450+9600=17050mm`,
  `8850mm ×8`) is independently confirmed by the forensic audit as
  matching between raster-derived and CAD column-centre geometry, and
  that shape resembles the supplied value list's general character far
  more closely than the runtime-served grid's odd decimal values
  (`7437`/`9613`/`8847`/`8853`mm).

## B. What is NOT proven

- **No full, line-labeled, 21-position X-axis coordinate table exists
  in any document this repository has access to.** The forensic audit's
  own disclosure section explicitly withholds the full per-line dataset
  and the absolute CAD origin as private facility information (its own
  §8). This phase does not have it, has not derived it, and does not
  guess it.
- **No authoritative, line-specific correction for any of the 4
  unresolved X positions** (grid segments 10→11, 11→12, 12→13, 16→17).
  The forensic audit corroborates the *pattern* those four positions
  should plausibly follow, but does not name which of its "8 clean
  8500mm bays" or "8 clean 8850mm bays" corresponds to which specific
  labeled grid line. Treating pattern-level agreement as line-level
  proof would be exactly the "choosing based on plausibility" this
  whole investigation (Phase 12F §5 onward) has consistently refused to
  do.
- **The E→F correspondence itself is an inference, not a labeled fact.**
  The forensic audit names a second raster-misread correction
  (`10000mm` exact) without a line label; this repository's own
  documents (Phase 12H) matched it to grid line E→F only because its
  before-correction value (`10025mm`) happens to equal the supplied
  list's own E→F value exactly. That is strong circumstantial evidence,
  not an independently labeled confirmation.
- **No human engineering reviewer has examined or approved any of the
  7 positions.** Every decision below is `PENDING_REVIEW` for exactly
  this reason.

## C. Correction rule

A runtime grid value in `private/floor1-geometry.json` may be changed
in a future, separate phase **only when all six of the following hold**:

1. Authoritative engineering evidence exists for that specific value
   (not a pattern, not an aggregate total).
2. The exact grid line (an unambiguous label, e.g. `10→11` or `F→G`)
   is identified in that evidence, not inferred by value-matching.
3. The unit and coordinate frame of that evidence is verified against
   the runtime's own millimetre, floor-local frame (established via
   real geometry — the `CAP` layer / `DIMENSION` entities / documented
   axis-orientation measurement — never assumed, never fitted from the
   disputed points themselves).
4. Provenance is recorded: source document, revision, date, and how the
   value was obtained.
5. A named, real reviewer with authority over this drawing has signed
   off (see `docs/floor1/grid-correction-review-request.md`).
6. The correction is independently reproducible by someone else, from
   the recorded provenance alone.

None of the 7 positions in §B currently satisfy all six. **Zero
corrections are approved by this document.**

## D. Explicitly prohibited (no silent correction)

None of the following are acceptable substitutes for the six conditions
in §C, regardless of how tempting or how small the residual gap looks:

- Spreading the 700mm X-axis total delta evenly across the 4 disputed
  X lines to make the sum match.
- Choosing whichever of the supplied / runtime / forensic-pattern value
  is numerically closest to the others, absent a labeled source for
  that specific line.
- Treating aggregate envelope agreement (§A, all three sources agree on
  174500/120300 overall) as proof that any *individual* line inside
  that envelope is correct — an error can exist inside an envelope that
  sums correctly (already demonstrated concretely: the Y-axis total in
  Phase 12E matched exactly while 3 individual Y spacings were wrong).
- Averaging the CAD-pattern value and the supplied value for the 4
  unresolved X positions.
- Changing `private/floor1-geometry.json`, test fixtures, or any
  reconciliation script's own tolerance to make an existing test pass.
- Changing a coordinate because it "looks right" against the drawing
  visually, without a recorded, reproducible source.

## Cross-reference

Full per-line detail, deltas, and provenance:
`docs/floor1/grid-correction-decision.csv`. Human sign-off checklist:
`docs/floor1/grid-correction-review-request.md`.

---

**Status: WAITING_FOR_ENGINEERING_GRID_DECISION**

No runtime, CAD, registry, or identity file was modified by this phase.
Do not proceed to a geometry-correction phase until
`docs/floor1/grid-correction-review-request.md` has a named reviewer's
explicit APPROVE/REJECT/REVISE decision recorded for each of the 7
positions, at which point a **separate, later, controlled correction
phase** should produce a before/after coordinate table, regression
tests, and rollback evidence — not this phase, and not automatically.
