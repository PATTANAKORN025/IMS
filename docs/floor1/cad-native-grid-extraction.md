# Floor 1 CAD-Native Grid Extraction

Phase 12H. Stops using Phase 12G's blind raw-coordinate heuristic as the
primary method, per this phase's own mission. `Apex3Layout/Floor1.dwg`,
`Floor1.dxf`, `private/floor1-geometry.json`, `lib/wire.js`, and every
CAD/registry/identity file remain byte-for-byte unmodified — confirmed
via `git status`/`git diff --check` at the end of this phase.

## 1. Coordinate semantics (DXF HEADER, read directly this phase)

Probed `Apex3Layout/Floor1.dxf`'s HEADER section directly (via the
existing, already-tested `iterateGroupPairs` from Phase 12G's
`tools/floor1/dxf-parser.js` -- no new parsing code needed for this):

| Variable | Value | Reading |
|---|---|---|
| `$INSUNITS` | `0` | **Unitless.** The file itself asserts no unit -- any mm interpretation must be earned from geometry, never read off the header. |
| `$MEASUREMENT` | `0` | Imperial-flavoured default setting; not a reliable unit signal (this is a dimension/hatch-pattern default many CAD users leave untouched). |
| `$UCSNAME` | `""` (empty) | No named UCS -- **World UCS is active.** |
| `$UCSORG` | `(0, 0, 0)` | Identity origin. |
| `$UCSXDIR` / `$UCSYDIR` | `(1,0,0)` / `(0,1,0)` | Identity axes -- **UCS == WCS, no rotation at the file level.** |
| `$EXTMIN` / `$EXTMAX` | X span ≈758,546 / Y span ≈155,612 / Z span ≈787,560 | Far larger than one floor's 174.5m × 120.3m footprint in any plausible unit -- this file's modelspace holds more than Floor 1 alone (confirmed independently below, §2). |
| `$INSBASE` | `(0,0,0)` | Default. |

Spot-checked entity-level extrusion (group 210) independently of the
HEADER-level UCS, since an entity can still be drawn in a rotated OCS
even with an identity file-level UCS: sampled 500,000 LINE entities,
found 290 (0.058%) with non-default extrusion. The overwhelming
majority of geometry is drawn in the default XY plane -- consistent
with a 2D plan-view floor plan; the non-default fraction is negligible
and not investigated further (out of proportion to its size).

**Conclusion**: WCS == UCS == the file's own native coordinate frame for
essentially all entities. This does NOT mean WCS == the runtime/served
grid's frame -- confirmed separately not to be the same (§3).

## 2. A prior, independent, rigorous audit of this exact file already exists

Before building anything new, searched for existing CAD-native work on
this file (mission §2's own instruction to prefer existing CAD-native
extraction over a new heuristic scanner) and found
**`docs/architecture/FLOOR1_DXF_FORENSIC_AUDIT.md`** -- a real,
already-committed, dated 2026-09-03 (i.e. before this session's own
Phase 9 onward), read-only forensic audit of this same
`Apex3Layout/Floor1.dxf`. It was missed by every prior phase's own
document search (9A, 12E, 12F) despite matching several of their own
search keywords -- a real gap in earlier phases' searches, corrected
here rather than repeated.

That audit is materially more rigorous than Phase 12G's own blind
geometric sweep:

- Streaming reader **validated against `ezdxf`** on a small companion
  file before being trusted (exact entity/TEXT/block-definition count
  match, extent match to the unit).
- Canonical coordinate frame derived from **real geometry
  correspondences** -- the `CAP` layer's bounding box (174500 × 120300
  exact) and the file's own largest `DIMENSION` entities (also
  174500.0/120300.0) -- never from the file's own untrustworthy header
  extents, and never from the 7 disputed points themselves (mission §5's
  own explicit rule).
- **Axis orientation measured, not assumed**: tested both Y
  orientations against column geometry, unflipped matched 57/100,
  flipped matched 2/100 -- decisive, empirical, reproducible.
- Modelspace inventoried precisely: 219,382 entities, 418 layers, 1,332
  block definitions, 1,828 INSERTs -- broadly consistent with Phase
  12G's own count (1,393,829 total entities across the whole file,
  since that count included BLOCKS-section entities this audit's
  modelspace-only count excludes; layer count matches exactly, 418).
- Confirms this file holds **far more than Floor 1's plan** -- equipment
  detail drawings, part sections, ~34k SPLINEs -- exactly why Phase
  12G's blind length/alignment heuristic found so much noise (66/53
  false-positive clusters at the 10m threshold, then almost nothing at
  60m -- both consistent with this audit's own finding that global
  extents are inflated by unrelated detail geometry, not a genuine
  building-spanning grid drawn as simple long lines).

## 3. What the audit found about the grid, and cross-reference against the 7 disputed positions

The audit's own §3/§6 state, as **exact agreement between raster-derived
and CAD column-centre geometry**:

- X interior pattern: `8500 ×8, 7450+9600 = 17050, 8850 ×8`
- X interior total: `155,850` (both sources)
- Full width: `9450 + 155850 + 9200 = 174,500` (matches the envelope exactly)
- Y bays: `10000 nominal`; **two spans the raster read as `9975`/`10025`
  are confirmed by CAD column-centre geometry to be exactly `10000`**
- The Y `2000`/`8000` bay split is confirmed real by CAD

This is NOT the live-served runtime grid re-stated -- it is a
**separate, independent re-derivation from column-centre CAD geometry**,
and it does not match the live `/api/floor-geometry` grid this session
fetched in Phase 12E/12F at several points. Cross-referencing directly
against Phase 12F's 7 disputed positions:

| axis | position | supplied | runtime (live API) | forensic CAD (column-centre) | status |
|---|---|---:|---:|---:|---|
| Y | G→H | 9975 | 10000 | **10000** (one of the "two spans" the audit names) | **SUPPLIED_WRONG** -- the audit explicitly describes `9975` as a raster misread it independently corrected to `10000`; the runtime value already matches that CAD-confirmed figure exactly |
| Y | F→G | 10000 | 9988 | **10000** (a "10000 nominal" bay, not one of the two named exceptions) | **RUNTIME_WRONG** (the live-served grid, `9988`, does not match the CAD-confirmed `10000`; the supplied value already did) |
| Y | E→F | 10025 | 10012 | **10000** (the other of the "two spans") | **BOTH_DIFFER** -- the audit names `10025` as the other raster misread it corrected to `10000`; the runtime's `10012` is closer to that but does not match it exactly either |
| X | 10→11 | 8500 | 7437 | consistent with the audited "`8500 ×8`" run | **AMBIGUOUS** -- the audit confirms 8 clean 8500mm bays exist adjacent to the 7450/9600 pair as a *pattern*, but its own summary does not label which of the 8 corresponds to grid line 10→11 specifically; cannot be classified MATCH/MISMATCH at the single-line level from this evidence alone |
| X | 11→12 | 7450 | 9613 | consistent with the audited "`7450+9600=17050`" pair | **AMBIGUOUS**, same reason -- the audit confirms this EXACT pair (7450, 9600) as a unit, strongly suggesting the supplied value here is CAD-consistent and the runtime's `9613` is not, but the audit's summary does not independently confirm the individual `7450` figure standing alone with a labeled position |
| X | 12→13 | 9600 | 8847 | consistent with the audited "`7450+9600=17050`" pair | **AMBIGUOUS**, same reason as above |
| X | 16→17 | 8500 | 8850 | consistent with the audited "`8850 ×8`" run | **AMBIGUOUS** -- the audit confirms 8 clean 8850mm bays exist, which the runtime's `8850` here already matches; the supplied `8500` at this position does not fit the audited pattern at all, but again the audit's summary does not label which specific line this is |

**Read this table carefully**: three of seven positions (Y-axis) have a
real, position-specific, evidence-backed classification. Four (X-axis)
have strong PATTERN-level corroboration -- the audited shape
(`8500×8, 7450+9600, 8850×8`) matches the supplied list's general
character far better than it matches the runtime's odd decimal values
(`7437`, `9613`, `8847`, `8853`) -- but not a label-specific,
line-by-line proof, because the forensic audit's own disclosure section
(§8 of that document) deliberately withholds the full per-line dataset
and absolute CAD origin as private facility information. This phase
does not have access to that underlying data beyond the summary
figures quoted above, and does not infer beyond what those figures
state.

## 4. Coordinate transform

The forensic audit's own canonical frame: floor-local millimetres,
origin at the `CAP` envelope's lower-left corner (`0..174500 x
0..120300`), axis orientation `z = y/1000 - 60.15` (empirically
measured, 57/100 vs 2/100). This is DERIVED from real geometry (the
`CAP` layer + `DIMENSION` entities), never from the 7 disputed points
themselves, satisfying this phase's own mission §5 requirement.

This phase did not independently re-derive that transform -- it already
exists, already correctly sourced, in the audit. Re-deriving it a
second time from scratch this phase would not have been more rigorous,
only redundant.

## 5. Block / XREF resolution

Checked specifically for Floor 1 content bound from an XREF (Phase 12G
found layer names like `F1-layout$0$...`, AutoCAD's own naming
convention for a bound external reference's layers): 13 such layers
exist, holding only wall/door/window/duct/equipment content (max 59
entities per layer, bounding boxes spanning at most ~42m -- a partial
detail area, not the full floor). **No grid-bearing layer found among
them.** The structural grid, wherever it lives in this file, is not
inside this particular bound XREF.

No rotated or non-unity-scale INSERT referencing grid-like content was
found this phase (Phase 12G's own block-local candidate search, at
either threshold, found only 1-3 non-grid entities total, already
reported in that phase's own docs).

## 6. CAD-native tooling availability (mission §2)

Checked explicitly this phase: no ODA File Converter, no AutoCAD/Teigha
object enabler, no `ezdxf`, no npm `dxf-parser`, nothing on `PATH`
resembling CAD-native tooling in this environment. Per mission §2's own
instruction ("If CAD-native tooling is NOT available: STOP and document
that the raw DXF parser is insufficient... do not add another heuristic
scanner") -- no new heuristic scanner was written this phase. Instead,
§2 above locates and uses REAL prior CAD-native work (the forensic
audit) rather than a weaker substitute.

## 7. Verification against mission §8's own bar

`GRID_RECONCILED` requires all 21 X-lines and 14 Z-lines identified,
the coordinate frame explained, block/XREF transforms resolved, AND
every one of the 7 disputed positions backed by evidence. This phase
reaches 3 of 7 (Y-axis) with position-specific evidence and 4 of 7
(X-axis) with pattern-level-only evidence -- not all 21+14 individual
lines, and not all 7 disputes at the single-line level. `GRID_RECONCILED`
is not claimed.

This is also not simple `GRID_SOURCE_UNRESOLVED` -- unlike Phase 12F/12G,
real authoritative evidence now exists and materially changes 2 of 7
positions from "no evidence either way" to a decisive call (Y G→H:
supplied wrong; Y F→G: the runtime-served value wrong), with 1 more
(Y E→F) showing both current sources differ from the CAD-confirmed
figure, and pattern-level (not yet line-level) evidence favoring the
supplied list's shape over the runtime's for the 4 X positions.

---

**Status: AUTHORITATIVE_GRID_CORRECTION_REQUIRED**

Real, independent, pre-existing CAD-native evidence (the forensic
audit, §2-§3 above) indicates the currently-served runtime grid
(`private/floor1-geometry.json`, served live at `/api/floor-geometry`)
likely contains a real error at Y-axis line F→G (served `9988`mm,
CAD-confirmed `10000`mm) and does not exactly match CAD at Y-axis E→F
either (served `10012`mm vs CAD-confirmed `10000`mm) -- while
confirming line G→H is already correct. Per this phase's own explicit
instruction, `private/floor1-geometry.json` is **not modified** by this
phase, even though a discrepancy appears real. This report is produced
first; runtime data changes require a separate, deliberate phase with
proper review, not a unilateral edit here.

**Recommended next step**: obtain the forensic audit's full underlying
per-line dataset (its own author/session, or a fresh CAD-native
re-extraction using the SAME validated methodology -- canonical frame
from the `CAP` layer + `DIMENSION` entities, axis orientation
empirically measured against column geometry) to convert this phase's
pattern-level X-axis findings and single-value Y-axis findings into a
complete, line-labeled dataset, THEN -- as a distinct, later phase, with
explicit human review -- correct `private/floor1-geometry.json`'s grid
arrays through proper change control.

Runtime impact of this phase: **NONE.** No CAD, geometry, registry, or
identity-mapping file was modified.
