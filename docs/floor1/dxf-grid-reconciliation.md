# Floor1.dxf Grid Reconciliation

Phase 12G. DXF-extracted grid clusters (from the real drawing, this
phase's own single-pass parse) versus what this tool could geometrically
reconstruct. This document reports what the PARSER actually found --
it does not assume the extraction is complete or correct merely because
clusters exist. See `docs/floor1/dxf-extraction-provenance.md` for the
full run record and known limitations.

**Read this before the tables below**: 1 of 21 expected X positions and 2
of 14 expected Z positions is not "mostly reconciled" -- it means this
extraction did not find the structural grid at all. Inspected directly
(`docs/floor1/dxf-extraction-provenance.md`'s own "Threshold experiments"
section): the single X candidate is on layer `FRAME` inside a small
equipment block, and the two Z candidates are both on layer `00.Wall FCD`
(a wall/ceiling-detail layer), 1163mm apart from each other -- not 14
building-spanning axis lines. The "N" label match on both Z rows below is
very likely coincidental (a stray "N" character found within the 3m
proximity tolerance, not a confirmed grid-line bubble label) -- reported
as the tool found it, not treated as confirmation.

## X-axis: 1 candidate cluster(s) found (21 expected)

| # | Position (mm) | Label (proximity match) | Segment count | Layers |
|---|---:|---|---:|---|
| 1 | -709491.097 | (none found) | 1 | FRAME |

## Z-axis: 2 candidate cluster(s) found (14 expected)

| # | Position (mm) | Label (proximity match) | Segment count | Layers |
|---|---:|---|---:|---|
| 1 | -116028.632 | N | 1 | 00.Wall FCD |
| 2 | -114867.746 | N | 1 | 00.Wall FCD |

## Block-local candidates requiring INSERT resolution

Resolved (flattened through a zero-rotation INSERT): 1
Unresolved: 2

| Handle | Block | Reason |
|---|---|---|
| FD350 | *D555 | UNRESOLVED_EXTERNAL_REFERENCE: no INSERT in ENTITIES references this block |
| FD357 | *D556 | UNRESOLVED_EXTERNAL_REFERENCE: no INSERT in ENTITIES references this block |

## Reconciliation against the supplied engineering values (mission §7)

Not performed as a position-by-position comparison. With only 1 X-axis
and 2 Z-axis candidates extracted -- none of them confidently a real
grid line (see the caveat above and the provenance doc's threshold
experiments) -- there are no genuine 20-X/13-Z DXF-derived intervals to
compare the supplied spacing list against. Computing intervals from 1-2
non-grid candidates and comparing them to the 20/13 supplied values
would manufacture a false comparison, not report a real one. Per this
mission's own §5 rule ("do not silently correct... do not fabricate"),
this section states that limit plainly rather than filling it with a
number.

The one comparison that DOES remain valid, and was already established
in Phase 12E/12F: the supplied lists' declared totals (174500mm X,
120300mm Y) match the live API's served envelope (174.5m x 120.3m)
exactly. This DXF extraction neither strengthens nor weakens that
specific fact -- it is unrelated to whether the DXF's own raw grid
geometry could be found (it could not, this phase).
