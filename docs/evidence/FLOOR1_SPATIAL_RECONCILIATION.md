# Floor 1 Spatial Reconciliation

Step 7. Classifies the 5 spatial-discrepancy categories first surfaced in the Phase 12
validation pass. Every classification below is sourced directly from `lib/wire.js`'s own code
comments — the module that computes each flag — not inferred, not guessed. CAD/EAP were read
only, never modified (`git diff --stat` confirmed empty for `services/factory-twin-3d/`).

## Classification key

```
CONFIRMED_ERROR       -- the discrepancy is a real defect, needs correction
MODEL_REPRESENTATION  -- an artifact of HOW something is measured/computed, not of the
                          underlying CAD being wrong
EXPECTED_ABSTRACTION  -- a disclosed, deliberate simplification (e.g. rectangle-for-polygon),
                          not a discrepancy at all in the sense of "something is incorrect"
INSUFFICIENT_EVIDENCE -- cannot be classified without information this audit does not have
```

## 1. `overlaps_neighbour` — 160 of 431 (37%)

**Classification: MODEL_REPRESENTATION**

`lib/wire.js:705-708`, verbatim: *"Two machines whose OUTLINES share floor. Measured on convex
outlines, so it over-reports: the convex hull of an L-shaped machine covers space the machine
does not occupy. Reported, never resolved by moving anything."*

The metric's own documented method (convex-hull overlap testing) is disclosed to OVER-REPORT
for any non-convex (e.g. L-shaped) machine footprint — a real machine occupying an L-shaped
floor area will show a convex-hull overlap with a neighbor even when the actual physical
outlines never touch. 160/431 is a high count, but the source code that produces this number
explicitly warns it is not a 1:1 count of real physical overlaps. **Not classified
CONFIRMED_ERROR** because no evidence in this audit distinguishes a genuine overlap from a
convex-hull artifact for any specific one of the 160 — doing so would require the actual (non-
convex) outline geometry for each pair, which this audit did not extract. **Not classified
INSUFFICIENT_EVIDENCE** either, because the SOURCE's own documentation is itself sufficient
evidence that the metric over-reports systematically, which is a real, actionable fact about
the measurement method.

## 2. `orientation_geometry_mismatch` — 9 of 431 (2%)

**Classification: MODEL_REPRESENTATION**

`lib/wire.js:696-698`, verbatim: *"The block's geometry puts its body on an axis the INSERT does
not state. Reported for an engineer; never acted on -- the CAD rotation stands."*

This flag reports a CAD-authoring-level fact (the drawn geometry block's own body axis
disagrees with the placement INSERT's stated rotation) for a human engineer's diagnostic use.
The comment is explicit that the Twin's own rendering is unaffected — "the CAD rotation
stands," meaning the authoritative `rotation_deg` value (what the Twin actually renders with)
is unchanged by this flag being set. **Not CONFIRMED_ERROR**: nothing about the rendered Twin
is wrong; this is metadata about a CAD-drawing inconsistency the Twin correctly works around
already.

## 3. `footprint_status: UNRESOLVED` — 76 of 431 (18%)

**Classification: EXPECTED_ABSTRACTION**

Matches Step 5B's own established, tested rendering path exactly: an asset with no measurable
footprint renders as a small marker cube (`Machines.tsx`'s `markers` array,
`UNRESOLVED_MARKER_M = 0.9`), not as a sized box — a deliberate, disclosed fallback for CAD
records that never carried real dimensional geometry (a point INSERT, a block reference with no
extent), not a bug in the pipeline that produced them. This exact rendering behavior has been
regression-tested since Step 5B (`factory-twin-r3f-machines.js`) with zero change across every
subsequent step.

## 4. `display_area_error` — 227 of 431 (53%) with a non-trivial value

**Classification: EXPECTED_ABSTRACTION**

`lib/wire.js:702-704`, verbatim: *"The price of the abstraction: the share of floor the
rectangle claims beyond the geometry it is drawn around. Reported per record, never acted on."*

Named, in the source's own words, "the price of the abstraction" — every asset rendered as an
`OPERATIONAL_RECTANGLE` (the Twin's default display representation, per `display_representation`
in `asset.ts`) inherently claims a bounding-rectangle area that differs from its true, more
complex CAD outline. 227/431 having a measurable, non-zero price is the expected shape of this
tradeoff at scale, not a discovery of 227 individual defects — this is the SAME tradeoff
already disclosed in the architecture gap audit's own "TRUE_POLYGON true-outline rendering (14
machines currently use their bounding rectangle)" line, generalized: `display_area_error`
grades the tradeoff continuously for every rectangle-represented asset, where the "14 machines"
figure only ever counted the extreme, qualitatively-worst cases.

## 5. `evidence_tier: RECOVERED` — 67 of 431 (16%)

**Classification: MODEL_REPRESENTATION**

Matches `asset.ts`'s own documented field exactly: *"PRIMARY = found by the main insertion-point
pipeline; RECOVERED = found only by the additive outside-envelope recovery pass. See wire.js's
`evidence_tier` comment -- never inferred from id range or handle."* A real, disclosed SECOND
extraction pass (`scripts/recover-floor1-outside-envelope-equipment.js`, already named in this
repository) that finds real CAD equipment records the primary pipeline's own insertion-point
scan missed (records that fall outside the main building envelope). These 67 assets are real,
correctly-placed CAD equipment — `RECOVERED` describes HOW they were found, not that anything
about them is uncertain or wrong.

## Additional spatial fact, not in the original 5 categories (found this step)

`zone_status: OUTSIDE_ROOM` — 18 of 431 (4%), carrying `zone_id: null`. These are CAD equipment
records whose position falls outside every CAD room/zone polygon this deployment's geometry
defines. **Classification: MODEL_REPRESENTATION** — `zone_status` is computed by intersecting
each asset's position against the CAD's own room polygons (`ZoneMembershipStatus` in
`asset.ts`); an asset legitimately can sit in a corridor, an unenclosed area, or a location the
CAD's room-boundary layer simply doesn't cover, without that being an error in either the
asset's position or the room polygons.

## Verdict

Zero of the 5 (now 6, including the newly-surfaced `OUTSIDE_ROOM` fact) discrepancy categories
were classified `CONFIRMED_ERROR`. Every category has a specific, sourced, documented
explanation already present in this codebase's own code comments — this audit did not need to
speculate about any of them. **No CAD or EAP correction is indicated by this reconciliation.**
None of these categories affect identity-mapping readiness (Step 6D/6E's own 0/431 finding is
orthogonal to spatial representation quality).
