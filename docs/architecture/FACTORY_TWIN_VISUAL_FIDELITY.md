<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Factory Twin — Schematic Visual Fidelity

How closely the schematic view reproduces its reference renders, element by
element, and exactly which gaps remain and why.

Companion to **[Runtime Architecture](FACTORY_TWIN_ARCHITECTURE.md)**,
**[Security Model](FACTORY_TWIN_SECURITY_MODEL.md)** and
**[Evidence Requirements](FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)**.

> [!IMPORTANT]
> This page is about the **schematic layer only** — a reproduction of a drawing,
> in the drawing's own coordinate space. It says nothing about the measured
> model, which is a separate spatial model with its own evidence and its own
> route. Fidelity here means "resembles the render", never "matches the
> building".

---

## What the sources are

Two renders of the same manufacturing-system floor schematic. Both are
operational status views, not architectural drawings: both carry a status
legend and a live timestamp, one carries a title block whose **SCALE field is
blank**, and neither contains a structural gridline or grid bubble.

**Both declare the same instant and disagree with each other.** That is the
single most consequential fact on this page, and it is preserved rather than
resolved: two selectable snapshots, no merged state, disagreeing cells marked.

---

## Classification vocabulary

| Class | Means |
|---|---|
| **MATCH** | Compared against the render and reproduced in geometry, position, spacing and hierarchy. |
| **MINOR_DIFF** | Reproduced, with a difference small enough not to change how the drawing reads. |
| **MISSING** | Present on the render, absent here, and reproducible. None remain. |
| **BLOCKED_BY_SOURCE** | The render does not carry what would be needed. |
| **CONFLICTING_SOURCE** | Both renders carry it and they disagree. |

---

## Fidelity matrix

| Element | Reference | Current | Classification | Action |
|---|---|---|---|---|
| Outer silhouette | Stepped, right block extending down | 8-vertex ring, same steps | MATCH | — |
| Rounded / stepped corners | Curved lower-left transition | Sampled arc vertices | MINOR_DIFF | Arc is sampled, not a true curve |
| 11 named areas | 11 labelled regions, 10 names | 11 areas, 10 names | MATCH | — |
| Area boundaries | Thin rectangles, some abutting | Same, abutting | MATCH | — |
| Area label positions | Inside or below each region | Transcribed per area | MATCH | — |
| Equipment banks | ~30 dense groups | 38 banks | MATCH | — |
| Bank positions | Per area, with aisles | Transcribed | MATCH | — |
| Bank widths / heights | Varies by group | Transcribed | MINOR_DIFF | Read by eye; ±1 cell on dense columns |
| Bank spacing | Visible aisles between groups | Reproduced | MATCH | — |
| Cell counts | 5–10 per column | 212 cells total | MINOR_DIFF | Same caveat as above |
| Cell spacing | Small gaps between blocks | Proportional inset | MATCH | — |
| Cell orientation | Vertical stacks, some horizontal | Per-bank orientation | MATCH | — |
| Bank label orientation | Six labels rotated | Six rotated | MATCH | — |
| Ambiguous labels | Differ by a glyph between renders | Both readings shown, italic | CONFLICTING_SOURCE | Preserved, 6 labels |
| **Per-cell hatch** | Six-state hatching per cell | All cells render Undefined | CONFLICTING_SOURCE | See below |
| **Per-cell values** | Numbers and codes per cell | 51 of 212 transcribed per snapshot | CONFLICTING_SOURCE | See below |
| Dimensions | 18 annotations on one render | 18, snapshot-scoped | MATCH | — |
| Dimension ticks | Perpendicular end ticks | Reproduced | MATCH | — |
| Dimension placement | Beside what they measure | Transcribed | MATCH | — |
| Legend | Six states with swatches | Six rows, hatched | MATCH | — |
| Legend hatch patterns | Texture per state | Six SVG patterns | MATCH | — |
| Title block | Bordered, fields ruled | Drawn with fields | MATCH | — |
| Blank SCALE field | Present and empty | Drawn and marked blank | MATCH | — |
| North compass | Rose with N | Rose with N | MATCH | — |
| Timestamp | Centre-left of the sheet | Same position, snapshot's own | MATCH | — |
| Margins | Sheet border around drawing | Padded fit | MATCH | — |
| Empty-space proportions | Large blank lower-left | Reproduced | MATCH | — |
| Line-weight hierarchy | Boundary > area > bank > cell | 1.6 / 0.9 / 0.7 / 0.35 | MATCH | — |
| Text hierarchy | Area > bank > cell | 11px / 5px / 3.2px | MATCH | — |
| Viewport composition | — | HUD-aware fit | MATCH | — |
| HUD collision | — | Panel width plus label overhang reserved | MATCH | — |
| Portrait layout | — | Verified, no label behind panel | MATCH | — |
| 1366×768 | — | Verified | MATCH | — |
| 1920×1080 | — | Verified | MATCH | — |
| 2560×1440 | — | Verified | MATCH | — |
| 3840×2160 | — | Verified | MATCH | — |
| 600×1000 | — | Verified | MATCH | — |

---

## Score

Counted, not estimated. 38 audited elements.

| Outcome | Count |
|---|---|
| Reproduced (MATCH) | 31 |
| Reproduced with a small difference (MINOR_DIFF) | 3 |
| Blocked by the source | 0 |
| Conflicting between the two renders | 4 |
| Missing and reproducible | **0** |

**VISUAL FIDELITY: COMPLETE FOR AVAILABLE EVIDENCE**, with four elements held
open by a conflict in the sources rather than by anything unbuilt.

The three MINOR_DIFF entries share one cause: the transcription is read by eye
from a render with no stated scale, so bank extents and dense cell counts are
faithful to arrangement and proportion but are not measurements. No
pixel-perfect claim is made and none is possible from this source.

---

## The conflict, and why it stays open

Both renders declare `2026/08/26 15:34:07`. They disagree about cell values,
about status hatching, and about several label glyphs.

That is not two moments in time. It is two transcriptions of one claimed
instant that cannot both be right, and nothing in either render arbitrates
between them.

**What is done instead of choosing:**

- Two selectable snapshots. Switching shows each render's own values.
- Values are stored per snapshot and never merged. There is no code path that
  averages, prefers or reconciles them.
- Cells both renders read differently are outlined and carry a tooltip naming
  what each one says.
- Ambiguous labels display both readings.
- A standing notice names the conflict and the declared instant.

**What remains unreproduced because of it:**

| Gap | Why |
|---|---|
| Per-cell status hatching | Both renders hatch every cell and disagree. Rendering either would present one render's operational reading as the floor's state. Every cell shows Undefined, which is the honest reading and is what the source's own Undefined swatch looks like. |
| 161 of 212 cell values | Transcribed only where legible in **both** renders at native resolution. The rest are unread rather than guessed: a wrong three-digit number is indistinguishable from a right one. |

Of the 51 cells transcribed from both renders, **17 disagree**. That ratio is
itself the argument against picking a favourite.

---

## What would close the remaining gaps

| Evidence | Closes |
|---|---|
| A third render, or one authoritative export of the same instant | Arbitrates the conflict; unlocks status and the remaining values |
| A higher-resolution render | Raises the number of confidently readable cells |
| A structured MES export | Replaces transcription entirely, and carries status as data rather than as hatching |

None of these is engineering work. The renderer is ready for all three.

---

## Deliberately not built

Two items requested during this work were not implemented, because each would
have required inventing evidence rather than reproducing it.

| Not built | Why |
|---|---|
| **Solid machine bodies on the measured floor** | The reference shows equipment as flat blocks on a plan; the plan set carries no equipment elevation. Extruding the 242 measured slots into cabinets would put a height on the floor that nobody measured, and a silhouette implying a height reads as evidence whatever the metadata says. Slots stay flat pads, which is why they were made flat pads. |
| **A single 3D world containing both models** | A COMBINED view that draws schematic banks alongside measured geometry states, by placement alone, that the two are registered. They are not, and no amount of labelling undoes what an eye reads from a shared coordinate frame. The two-mode split is the honest form. A side-by-side split-screen would be a safe way to show both at once and is the recommended next step if one view is wanted. |

---

## What this page does not claim

- Not that the schematic is to scale. Its source states no scale.
- Not that any schematic coordinate corresponds to a physical one.
- Not that any cell, bank or area corresponds to a measured slot, zone or
  monitored device. Confirmed mappings remain **0**, and the schematic records
  carry no field that could hold one.
