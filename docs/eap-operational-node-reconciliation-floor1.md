<!--
  Reconciliation between the operational layout reference for Floor 1, the Floor 1
  CAD drawing, and the 331 raw-CAD machine candidates in the machine-node census.
  Data-model and forensic work only. No renderer, UI, Grafana, telemetry, Node-RED,
  database, Manufacturing Command Center or Operator Andon change belongs to it.
-->

# Floor 1 EAP Operational Node Reconciliation

Status: **reconciled, with 44 CAD candidates left unresolved and named as such.**

## A. Executive summary

The operational layout reference for Floor 1 draws **210 machine cells**: 199 carrying a
live status colour from the layout's own legend, and 11 drawn but unlit. That is the
population the first EAP release has to represent.

The raw-CAD census carries **331 machine candidates**. 331 does not become 210 by
deleting 121 rows. The two numbers count different things:

- In the west half of the floor the two sources agree almost exactly. 147 CAD
  candidates map one-for-one onto 148 layout cells; the drawing and the layout both
  draw one object per drill.
- In the east half the layout is *coarser* than the CAD. 121 CAD candidates fall inside
  zones the layout draws as 39 aggregated station cells — a cutting line drawn as seven
  named cells is more than thirty blocks in the drawing.
- In four zones the layout is *finer* than the CAD: it draws 10 more cells than CAD has
  candidates (laser drilling, oxide, PP, and one drill in the upper-left block).
- 44 CAD candidates sit in rooms the layout leaves empty. They are not deleted and not
  promoted; they are `UNRESOLVED`.
- 3 are drawn outside a machine block with no layout counterpart (`CAD_ONLY`), and 2 are
  duplicate INSERTs.

So the answer to *"does 331 become 209?"* is: **no — it becomes 210 layout cells, and
the 331 CAD candidates reconcile to them as 161 confirmed, 121 sub-components, 2
duplicates, 3 CAD-only and 44 unresolved.** The expected example in the request totalled
209; the single cell of difference is in the PP rack, where the layout draws 7 boxes
whose labels are not legible at the reference image's resolution. 7 is what the image
shows; it was not adjusted to reach 209.

A second, stricter count is also reported below: collapsing every sub-cell into the
station it belongs to (CCL002's seven cells into one cutting line, XRY001's five into
one X-ray line, and so on) gives **171 independent operational machines plus 2
unresolved unlit cells**. Which of the two numbers the EAP should carry is a product
decision, not a CAD fact; the dataset holds both.

Nothing in the CAD, the census, the renderer or any runtime was modified.

## B. Sources and what each one is allowed to prove

| Source | Proves | Does not prove |
|---|---|---|
| Operational layout reference (image) | which machines the EAP shows, their labels, their process grouping, their status colour | physical position, scale, orientation, footprint |
| Floor 1 CAD drawing | physical position, rotation, footprint, area zone | which objects the EAP shows, machine numbers (there are none) |
| Machine-node census (331 candidates) | the CAD-side population and its zoning | the operational node count |

The layout carries machine numbers; the CAD carries none. The 2 630 strings recovered
from the drawing produced **zero** machine-number matches, as recorded in the census.
The two identifier systems are therefore treated as separate evidence sources and are
never merged into an invented mapping.

## C. How the layout was read

Cells were transcribed by inspecting the reference image at 4× to 12×, and cross-checked
by an independent detector that segments the image into solid rectangles painted in one
of the six legend colours. The detector agrees exactly in eight of the twelve zones and
over-splits in the four densest ones, where the dark label text inside a cell cuts the
colour run; the transcribed reading is the one used, and it is self-validating — see §E.

The layout is a **schematic, not a scale drawing**. A least-squares affine fit from CAD
millimetres to layout pixels, anchored on eight features both sources name, leaves a
mean residual of **33.6 px** (roughly 4–6 m) and shows an anisotropy of **1.46**:
vertical distances are compressed against horizontal ones. Zone-level spatial
association is therefore sound; per-cell spatial matching inside a dense zone is not,
and was not used.

## D. The 331 CAD candidates, classified

| Category | Count |
|---|---:|
| CAD candidates | 331 |
| Confirmed operational nodes | 161 |
| Machine sub-components | 121 |
| Accessories | 0 |
| Structural / utility | 0 |
| Duplicate | 2 |
| CAD-only | 3 |
| Unresolved | 44 |

Every one of the 331 is classified. None was discarded.

Classification rules, applied in this order:

1. **DUPLICATE** — a second INSERT of the same block at the same transformed body
   position. Two found; both are kept in the dataset and flagged, not merged.
2. **UNRESOLVED** — the candidate's CAD zone has no layout counterpart at all, or it is
   a single outsized block inside a confirmed zone with no cell to match.
3. **CONFIRMED_OPERATIONAL_NODE** — the candidate's CAD zone links to a layout zone and
   CAD is at most as fine as the layout there, so every CAD node has a layout cell.
4. **CAD_ONLY** — inside a linked zone but drawn outside the machine block, with no
   layout cell in that position.
5. **MACHINE_SUBCOMPONENT** — inside a linked zone where CAD is finer than the layout,
   i.e. the layout aggregates the zone into named station cells.

No rule refers to rectangle area, and no candidate was reclassified to make a count come
out. `STRUCTURAL_UTILITY` is empty here because the census had already removed 1 366
structural INSERTs before this reconciliation began.

## E. Zone reconciliation

| Operational zone | Layout cells | CAD candidates | Confirmed | Sub-comp. | Dup | CAD-only | Unres. | Delta (CAD − layout) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A. DRILLING HOLD | 4 | 5 | 4 | 0 | 0 | 0 | 1 | +1 |
| B. DRILLING (upper left) | 103 | 102 | 102 | 0 | 0 | 0 | 0 | −1 |
| C. DRILLING (central vertical) | 41 | 44 | 41 | 0 | 0 | 3 | 0 | +3 |
| D. CUTTING | 13 | 33 | 0 | 32 | 1 | 0 | 0 | +20 |
| D2. Post-cut pair | 2 | 5 | 0 | 5 | 0 | 0 | 0 | +3 |
| E. DE-OXIDE | 3 | 4 | 0 | 4 | 0 | 0 | 0 | +1 |
| F. LASER DRILLING | 5 | 2 | 2 | 0 | 0 | 0 | 0 | −3 |
| G. XRY | 10 | 16 | 0 | 16 | 0 | 0 | 0 | +6 |
| H. BONDING | 3 | 16 | 0 | 16 | 0 | 0 | 0 | +13 |
| I. OXIDE | 11 | 7 | 7 | 0 | 0 | 0 | 0 | −4 |
| J. AUTO LAY UP | 8 | 48 | 0 | 48 | 0 | 0 | 0 | +40 |
| K. PP | 7 | 5 | 5 | 0 | 0 | 0 | 0 | −2 |
| **TOTAL (linked)** | **210** | **287** | **161** | **121** | **1** | **3** | **1** | **+77** |
| Unlinked CAD zones | 0 | 44 | 0 | 0 | 1 | 0 | 43 | +44 |
| **TOTAL** | **210** | **331** | | | | | | |

The request's zone list is followed exactly; no additional operational zone was invented.
Two entries need a word:

- **D2 (post-cut pair)** is the two-cell room the layout draws immediately above the
  cutting hall. The request's own example grouped it with cutting; it is kept separate
  here only so the counts stay auditable.
- **A and B** share one CAD area zone. They are split on block family, not on position:
  the four hold cells correspond to one four-instance family sitting against the west
  wall, everything else in that zone belongs to the drill families.

### Layout-zone to CAD-zone links, and the evidence for each

| Zone | CAD zone(s) | Link rule | Confidence |
|---|---|---|---|
| A | FZ-F1-0001 | drawing's area label + position + count | HIGH |
| B | FZ-F1-0001 | area label + position + count + grid shape | HIGH |
| C | FZ-F1-0002 | area label + position + count | HIGH |
| D | FZ-F1-0003 | area label + position | HIGH |
| D2 | FZ-F1-0010 | position only | MEDIUM |
| E | FZ-F1-0009 | position only | MEDIUM |
| F | FZ-F1-0024 | area label + position | HIGH |
| G | FZ-F1-0007 | area label + position | HIGH |
| H | FZ-F1-0036 | position only, CAD zone unnamed | LOW |
| I | FZ-F1-0016 | area label + position | MEDIUM |
| J | FZ-F1-0011, FZ-F1-0014, FZ-F1-0004 | area label + position | MEDIUM |
| K | FZ-F1-0006 | area label + position | HIGH |

Five CAD zones carrying 44 candidates have **no** layout counterpart: one 31-candidate
process area whose label names a process the layout never captions, and four small
zones (5, 5, 2, 1 candidates) that fall in rooms the layout leaves empty. They stay
`UNRESOLVED` pending the drawing owner's confirmation. The alternative — quietly folding
them into a neighbouring zone — would be fabrication.

## F. The special cases the request named

### FAM-02: the 8 × 5 grid

Confirmed from both sides, and the strongest single anchor in the reconciliation.

- CAD: 40 instances at 8 distinct x positions × 5 distinct y positions. The x positions
  fall into four pairs — 3.42 m within a pair, 5.08 m between pairs.
- Layout: 40 cells, machines **105–144**, in eight columns of five, and the columns fall
  into the same four visual pairs at the same spacing ratio.
- Placement used the **transformed physical body position**, never the INSERT point.
  This family's block draws its body about 880 m from its own base point with an equal
  and opposite INSERT offset, so its insertion points sit off the floor entirely. That
  defect is recorded in the census and is the reason the current equipment pipeline
  loses this grid.

Because both grids are 8 × 5 with matching column pairing and the affine fit shows no
mirroring, each layout number is linked to one CAD instance **positionally** (x
ascending → columns left to right, y descending → rows top to bottom). That link is
recorded in the private dataset as `grid_positional_link` and carries MEDIUM confidence:
it is derived from geometry, not from any identifier in the drawing.

### FAM-01 / FAM-03: ellipse-inflated hulls

Neither family's hull was used as machine identity. Their published hulls are 19.08 ×
11.30 m and 19.45 × 11.77 m, but their measured bodies are ≈ 4.63 × 2.13 m and ≈ 5.30 ×
2.15 m; the difference is multi-metre drafting ellipses around the machine. Identity here
comes from block family, zone membership and count — not from extent.

- Zone B: 35 FAM-01 + 27 FAM-03 = **62** candidates against **63** layout cells
  (machines 042–104). Delta **−1**.
- Zone C: **41** FAM-01 candidates against **41** layout cells (machines 001–041).
  Delta **0**.

The −1 in zone B is reported, not closed. The CAD's nine east-west rows in that block
(7, 7, 7, 7, 4, 7, 8, 8, 7) do not line up with the layout's two bands of columns
(34 cells above, 29 below), so the missing machine cannot be identified by position, and
no candidate was moved or invented to make the two totals agree.

### Layout numbering

The layout carries numbers; the CAD does not. Treated as separate evidence throughout.

## G. Machine number sequences, from the layout only

| Group | Expected | Detected | Missing | Duplicate |
|---|---:|---:|---:|---:|
| Drilling, upper-left grid (105–144) | 40 | 40 | 0 | 0 |
| Drilling, upper-left remainder (042–104) | 63 | 63 | 0 | 0 |
| Drilling, central vertical (001–041) | 41 | 41 | 0 | 0 |
| Laser drilling (001–005) | 5 | 5 | 0 | 0 |
| Post-cut pair (001–002) | 2 | 2 | 0 | 0 |
| Bonding (001) | 1 | 1 | 0 | 0 |
| Named cells (XRY, CCL, BWN, ULD, HOI, GRD, LDG, PRS, DLM, LTK, 1-H/1-C) | — | 47 | — | — |
| Unreadable labels (PP 7, bonding 2, oxide 2) | — | 11 | 11 unreadable | — |

Drilling numbers **001–144** are present exactly once each across zones B and C, with no
gap and no repeat — 144 numbers over 144 cells. This is the check that validates the
transcription: a miscount anywhere would have broken the run.

Numbers **do** repeat across zones — `001` appears in central drilling, laser drilling,
the post-cut pair and bonding. They are unique only within a zone, so any EAP node key
must be zone-scoped. This is a finding about the layout, not a defect.

The CAD detected **zero** machine numbers, so Missing/Duplicate cannot be computed on the
CAD side at all. No number was written into the CAD dataset.

## H. Duplicates

Two exact duplicates: same block definition, same transformed body position, same
rotation and scale, different CAD handles. One sits in an unlinked process zone, one in
the cutting zone. Both are classified `DUPLICATE` and both rows are retained. They are
*not* merged: the evidence distinguishes accidental double-drawing from intentional
instancing only for the second case, and neither is strong enough to delete a row.

Intentional instancing — the same block placed many times on purpose — is the normal
case here and is not treated as duplication: the drill families alone account for 143
deliberate instances.

## I. Two defensible node counts

| Counting rule | Count | What it means |
|---|---:|---|
| One node per layout cell | **210** | every independently coloured cell the EAP draws; 199 lit + 11 unlit |
| One node per independent operational machine | **171** (+2 unresolved unlit cells) | sub-cells collapsed into their station |

The second rule follows the request's operational-node definition literally: CCL001 and
CCL002 become 2 nodes rather than 13, XRY001 and XRY002 become 2 rather than 10, BWN001–
003 become 3 rather than 9, the hold's four cells become one station, and the auto lay-up
press cells collapse into their press. The first rule is what the reference layout
actually addresses and colours.

Both are published because they answer different questions, and neither was selected to
land near 209.

## J. What this does not establish

1. **No per-machine CAD identity.** The drawing has no machine numbers, so outside the
   8 × 5 grid no layout label is bound to a specific CAD handle. Zone, family and count
   are matched; individual machines are not. `cad_handle` is null on 170 of the 210 EAP
   nodes for exactly this reason.
2. **No physical position for a layout label.** Positions in the dataset come from the
   CAD and belong to CAD candidates. A layout label inherits a position only through the
   grid link.
3. **No IMS or telemetry mapping.** CAD machine node ≠ physical equipment record ≠ IMS
   machine ≠ telemetry device. No mapping data exists, so none was written.
4. **11 unreadable labels.** Seven PP boxes, two bonding cells and two oxide cells are
   drawn but their text is illegible at the reference image's resolution. They are
   counted as cells and labelled `UNREADABLE-n`; the PP count of 7 is the one place this
   reconciliation differs from the request's 209 example.
5. **44 unresolved CAD candidates**, including a 31-candidate process area the layout
   never captions.
6. **Zone H's link is LOW confidence** — position only, against an unnamed CAD zone.
7. **The layout is a schematic.** 1.46 anisotropy and a 33.6 px mean residual mean the
   image cannot be used to place anything.
8. **The layout is one moment in time.** Status colours are a snapshot; only the cell
   population, labels and grouping were used.
9. **The equipment pipeline still filters on insertion point**, so it still loses the
   8 × 5 grid. This reconciliation records that; it does not fix it.

## K. Where the data lives

The full mapping — 210 EAP node records and all 331 classified CAD candidates, with
handles, families, coordinates and rotations — is in the private, gitignored dataset
`services/factory-twin-3d/private/floor1-operational-machine-nodes.json`. Coordinates,
block names, layer names and drawing area labels are deliberately absent from this
report.

## L. Scope

Data model and forensic reconciliation only. The Factory Twin renderer, the EAP UI,
Grafana, telemetry, Node-RED, the database, the Manufacturing Command Center and the
Operator Andon are unchanged, and no geometry was optimised.
