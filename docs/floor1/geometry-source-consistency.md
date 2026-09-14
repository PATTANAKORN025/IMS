# Floor 1 Geometry Source Consistency Gate

Phase 12E. Read-only audit of externally-supplied structural-grid values
against the real, live, authoritative CAD-derived grid already served by
`/api/floor-geometry`. No CAD, geometry, identity mapping, or runtime
behavior changed by this document. `git diff --check` scoped to this
file only.

## 1. Supplied source data (as given, verbatim)

**X-Axis** — axes labeled 1–21, declared total 174500 (units unstated,
assumed mm — see §5).

```
9450, 8500, 8500, 8500, 8500, 8500, 8500, 8500, 8500, 8500,
7450, 9600, 8850, 8850, 8850, 8500, 8850, 8850, 8850, 9200
```

**Y-Axis** — axes labeled A–N, declared total 120300 (mm, assumed).

```
11600, 10000, 10000, 10000, 10025, 10000, 9975, 10000,
8000, 2000, 10000, 10000, 8700
```

Area/work references supplied separately in the same request are
**excluded from this analysis** per the mission's own instruction — not
interpreted as geometry dimensions here.

## 2. Counts

| Axis | Labels | Values supplied | Count match (1:1 per-label) |
|---|---|---|---|
| X | 1–21 (21 labels) | 20 | NO under a 1-value-per-label reading |
| Y | A–N (14 labels) | 13 | NO under a 1-value-per-label reading |

This matches the mission's own stated "expected finding" example exactly
— **but §6 below shows that framing is the wrong convention for this
data**, established by a real, live cross-check, not an assumption.

## 3. Calculated totals (independently summed, this phase)

| Axis | Sum of supplied values | Declared total | Difference |
|---|---:|---:|---:|
| X | 173800 | 174500 | **−700** |
| Y | 120300 | 120300 | **0 — exact match** |

## 4. Existing CAD comparison — the real, live authoritative source

`services/factory-twin-3d-next/lib/geometry-adapter.ts` reads
`grid.x`/`grid.z` from the SAME `/api/floor-geometry` endpoint this
whole migration already treats as authoritative (ultimately
`private/floor1-geometry.json`, gitignored, real CAD survey — see
`docs/evidence/FACTORY_TWIN_R3F_GEOMETRY_MIGRATION.md`, which already
documents "Structural grid: labeled axis lines (21 x-lines, 14 z-lines)"
and a live envelope of exactly `width: 174.5, depth: 120.3` — the SAME
two numbers as this phase's declared totals, in metres instead of mm).

Fetched live (`curl http://localhost:4196/api/floor-geometry`, the
disposable measurement container already running from this session's
earlier phases) and cross-checked directly rather than assumed:

- `envelope`: `{"width":174.5,"depth":120.3,"height":5}` — confirms
  174500mm / 120300mm are the REAL envelope dimensions, matching both
  declared totals exactly.
- `grid.x`: 21 entries, labels `"1"`–`"21"`, each a cumulative position
  in metres (e.g. `{"at":-87.25,"label":"1"}` … `{"at":87.25,"label":"21"}`).
- `grid.z`: 14 entries, labels `"A"`–`"N"`, same cumulative-position shape.

**These are cumulative coordinates, not spacings** — 21 X points and 14 Z
points, confirming the CAD's own structural grid has exactly 21 X-lines
and 14 Z-lines, matching the label counts exactly. The supplied data in
§1 is NOT this — it has one fewer entry per axis than the label count,
which is the correct shape for the **spacing BETWEEN consecutive grid
lines** (21 lines → 20 spacings; 14 lines → 13 spacings), not a
per-label value. See §6.

### Real spacings, derived from the live cumulative grid (this phase's own calculation, mm, rounded to the nearest whole mm from the raw metre deltas)

**X (20 values, line 1→2, 2→3, … 20→21):**
```
9450, 8500, 8500, 8500, 8500, 8500, 8500, 8500, 8500, 7437,
9613, 8847, 8853, 8850, 8850, 8850, 8850, 8850, 8850, 9200
```
Sum: **174500** — exact match to the declared X total.

**Y (13 values, line A→B, B→C, … M→N):**
```
11600, 10000, 10000, 10000, 10012, 9988, 10000, 10000,
8000, 2000, 10000, 10003, 8697
```
Sum: **120300** — exact match to the declared Y total.

### Position-by-position comparison: supplied vs. real CAD-derived spacing

**X-axis** (20 positions, both sequences the same length):

| # | Grid segment | Supplied | Real (CAD) | Match? |
|---|---|---:|---:|---|
| 1 | 1→2 | 9450 | 9450 | yes |
| 2–9 | 2→3 … 9→10 | 8500 ×8 | 8500 ×8 | yes |
| 10 | 10→11 | 8500 | **7437** | **NO (Δ +1063)** |
| 11 | 11→12 | 7450 | **9613** | **NO (Δ −2163)** |
| 12 | 12→13 | 9600 | **8847** | **NO (Δ +753)** |
| 13 | 13→14 | 8850 | 8853 | ~yes (3mm, rounding) |
| 14–15 | 14→15, 15→16 | 8850, 8850 | 8850, 8850 | yes |
| 16 | 16→17 | 8500 | **8850** | **NO (Δ −350)** |
| 17–19 | 17→18 … 19→20 | 8850 ×3 | 8850 ×3 | yes |
| 20 | 20→21 | 9200 | 9200 | yes |

Four real, non-rounding mismatches (positions 10, 11, 12, 16). Their
deltas (+1063 − 2163 + 753 − 350 = **−697**, ≈ the −700 total shortfall
after rounding) **fully explain** the §3 total discrepancy — this is not
one missing value plus 19 correct ones; it is a run of at least four
positions (10–12, and separately 16) that disagree with the live CAD,
while the surrounding values happen to agree.

**Y-axis** (13 positions, both sequences the same length):

| # | Grid segment | Supplied | Real (CAD) | Match? |
|---|---|---:|---:|---|
| 1–4 | A→B … D→E | 11600, 10000×3 | 11600, 10000×3 | yes |
| 5 | E→F | 10025 | **10012** | **NO (Δ +13)** |
| 6 | F→G | 10000 | **9988** | **NO (Δ +12)** |
| 7 | G→H | **9975** | **10000** | **NO (Δ −25)** |
| 8–11 | H→I … K→L | 10000, 8000, 2000, 10000 | 10000, 8000, 2000, 10000 | yes |
| 12 | L→M | 10000 | 10003 | ~yes (3mm, rounding) |
| 13 | M→N | 8700 | 8697 | ~yes (3mm, rounding) |

Three real mismatches at positions 5–7 (all clustered around the
E/F/G grid lines, the same region where the live CAD's own F-line sits
at a non-round `-8.538` rather than a clean design value — i.e. this is
the one region of the real grid that is itself not a tidy round number,
consistent with a surveyed/adjusted position rather than a pure design
grid). Their deltas (+13 +12 −25 = 0) **exactly cancel**, which is why
§3 shows the Y total matching perfectly even though three individual
positions do not. A total match at the axis level does NOT mean every
individual grid-line position matches — G's real absolute position
would land 25mm off from where this supplied sequence would place it if
walked cumulatively from A.

## 5. Unit assumption

Both declared totals (174500, 120300) equal the real live envelope
(174.5m, 120.3m) times 1000 exactly. **Millimetres**, consistent with
the one documented mm↔m convention already in this codebase
(`app.js`'s `cadToTwin()`, `FACTORY_TWIN_R3F_GEOMETRY_MIGRATION.md`).
Not assumed — confirmed against the live API response.

## 6. What kind of values are these? (mission's own check #6)

**Grid spacings between consecutive structural grid lines** — confirmed,
not assumed:
- Count (20 for 21 X-labels, 13 for 14 Y-labels) matches the
  N-labels → N−1-spacings convention exactly, the same convention the
  real CAD grid itself uses to go from 21/14 labeled lines to a drawn
  structural grid.
- NOT cumulative coordinates — a cumulative sequence for 21 X-lines
  would need 21 values (or 20 if starting implicitly at 0), and would
  be monotonically increasing from a fixed origin, which is not what
  either supplied list looks like when compared against the real
  cumulative `grid.x`/`grid.z` (§4).
- NOT room dimensions or center-to-center equipment distances — the
  supplied values structurally align one-to-one with the CAD's own
  bay-to-bay spacings (§4's position table), not with any equipment or
  zone dimension in this repository.

**The mission's own "expected finding" framing (21 values needed for
X, 14 for Y) is the wrong convention for this specific dataset** —
correctable now, with evidence, rather than left as an open question:
the real CAD grid itself is 21/14 labeled lines producing 20/13
spacings, and the supplied counts (20/13) already match that
convention exactly. The real, remaining problem is NOT a missing
value — it is that four X-axis positions and three Y-axis positions
(§4) do not match the live CAD's own spacings, even though the counts
are correct.

## 7. Authoritative-source status

- **The REAL authoritative source for Floor 1's structural grid already
  exists in this repository and was consulted directly**: the live
  `/api/floor-geometry` endpoint (`grid.x`/`grid.z`), backed by
  `private/floor1-geometry.json` (gitignored, real CAD survey data),
  unchanged by this phase.
- **The supplied values in §1 are NOT confirmed to come from that
  source, or from any other identified source in this repository.**
  Their origin (a drawing revision, a different survey, a manual
  transcription, a rounded/summarized export) is unknown. This phase
  does not have a document or system to attribute them to, and per the
  mission's own §8–§10, does not guess one.
- Where the supplied values agree with the live CAD (most positions),
  that agreement is informative but not proof of provenance — a
  correct value could come from any source that also read the same real
  grid.

## 8. Blocking questions

1. What document/system produced the §1 X/Y value lists? A name, a
   revision date, and a file path or system reference are needed before
   these values can be treated as anything but "externally supplied,
   unattributed."
2. For X-axis positions 10–12 and 16 (§4): is the LIVE CAD grid correct
   and the supplied list stale/wrong, or does the supplied list reflect
   a REAL, more recent as-built change to those four bays that the CAD
   survey (`private/floor1-geometry.json`) has not yet been updated to
   reflect? These are opposite conclusions and this phase cannot
   distinguish them from data alone.
3. For Y-axis positions 5–7 (§4, the E/F/G region): same question — is
   the live CAD's own non-round F-line position (`-8.538`) the more
   accurate as-built value, or does the supplied 10025/10000/9975
   sequence reflect a corrected/re-surveyed set of positions for that
   same region?
4. Is 174500/120300 in the supplied data intended as millimetres,
   confirmed only by numeric coincidence with the real envelope — is
   there a unit label on the original source document this phase never
   saw?

## 9. Exact data required to close the discrepancy

To resolve §4's remaining mismatches (not to accept either side by
default):

- The named source document/drawing/system for the §1 values, with a
  revision/date.
- For the 4 disputed X positions (grid lines 10–12, 16–17) and 3
  disputed Y positions (grid lines E–G): the underlying survey or
  as-built record that would confirm which value (supplied or live-CAD)
  reflects the current real structure.
- Confirmation of the units used in the original source of the §1
  values.
- If the supplied values are meant to supersede the CAD, the actual
  change-control record authorizing that (a re-survey report, an
  as-built revision) — this phase does not update
  `private/floor1-geometry.json` or the CAD/grid on the strength of an
  unattributed number list, matching mission §10.

## 10. What this phase did NOT do

- Did not infer, average, split, or otherwise fabricate the "missing"
  21st X value or 14th Y value — §6 shows no value is actually missing
  under the correct (spacing) convention, so there was nothing to
  infer in the first place.
- Did not update `private/floor1-geometry.json`, the live CAD, the
  structural grid, or any Floor 1 identity/mapping file.
- Did not silently prefer the supplied values or the live CAD where
  they disagree — both are reported, neither is corrected.

---

**Status: GEOMETRY_SOURCE_UNRESOLVED**

Seven individual grid-line positions (4 on X, 3 on Y) remain unreconciled
between the supplied data and the live, authoritative CAD grid. Axis-level
totals alone (§3) are not sufficient proof of correctness — the Y-axis
total matches exactly while still concealing three real positional
disagreements (§4) that cancel only in aggregate. No source document has
been identified for the supplied values (§7). Do not treat the supplied
X/Y lists as authoritative, and do not treat the live CAD as definitively
correct at the 7 disputed positions either, until §9's real-world evidence
is supplied.
