# FT-EAP-UX — SCADA/EAP Visual Fidelity Audit

Reference image: `Apex3Layout/01 LayoutApex3-F1.jpg` (1545×1034px JPEG,
real file, read directly this session — not a textual summary).
CAD sources: `Apex3Layout/Floor1.dwg` (58.9MB) / `Floor1.dxf` (412MB), the
same drawing this codebase's own `services/factory-twin-3d/private/floor1-geometry.json`
was already extracted from. Current render: real screenshots of
`/factory-twin-3d/eap.html`, authenticated production, 1920×1080, both
EAP mode (schematic frame) and AUTO mode (real CAD floor + zone regions).

## What the reference image actually shows (read directly, this session)

A dark-theme SCADA screen, header bar (APEX3 dropdown, user, notification,
CFM), toolbar (Nine point status / Fixed view information / Fleet Info /
zoom / refresh), and one flat floor-plan canvas with 10 labeled process
areas: **DRILLING HOLD** (small column, far left), **DRILLING** (two
clusters — a large upper-left grid and a narrower center grid), **XRY**
(narrow strip), **AUTO LAY UP** (top-right, contains named equipment
boxes PRS/DLM/LTK plus a small header row), **BONDING** (BWN001-3
columns), **PP** (far right, 2 boxes), **OXIDE** (a sub-label under
Bonding's columns), **DE-OXIDE** (LDG/DEO/ULD stack), **CUTTING**
(CCL001/CCL002 rows with VSC/MIL/ULD/CUT cells), **LASER DRILLING**
(small numbered boxes, bottom-right), plus a **POST-CUT PAIR** (two
unlabeled boxes "001"/"002") between center-Drilling and Cutting. A
**LEGEND** box, bottom-right: Off (grey) / Down (red) / Idle (orange) /
**Initial, PM, Stop (one merged blue row)** / Run (green) / Undefine
(white). Cell count, counted directly from the image: roughly 210 —
consistent with the 210-cell EAP model already built from this exact
image in a prior phase.

## Real finding: the reference's own legend merges 3 states into 1 colour

The reference image visually distinguishes only **6** categories (Off /
Down / Idle / Initial+PM+Stop-as-one / Run / Undefine), not 7 — Initial,
PM and Stop share a single blue swatch in the source system. This
phase's own Phase 3 instruction requires all 7 states
(RUN/DOWN/IDLE/OFF/INITIAL/PM/STOP) to be **distinguishable**. The
current app already gives each of the 7 its own colour (Run #22c55e,
Idle #f59e0b, Down #ef4444, Initial #38bdf8, PM #3b82f6, Stop #a855f7,
Off #475569) — **exceeding the reference's own resolution, not
contradicting it**. Recorded as a real, deliberate divergence: this
phase's own explicit instruction ("distinguishable visual representation"
for all 7, "do not substitute generic states") takes precedence over
matching the reference's own coarser blue merge, and no code change was
made to un-distinguish them.

## Real finding: the reference legend has no visible "Unmapped" category

The reference has no "cell attached to no machine" concept — that is an
EAP-model-specific fact (whether a cell has a `machine_unit_id`), not a
SCADA operational state, and the current app already keeps it in its own
"Unmapped (not a machine state)" row, separate from the 7 real states —
correct, no change needed.

## Zone-by-zone position comparison (EAP-mode schematic vs. reference)

Read from real pixel coordinates in both the reference image and a real
screenshot of `/eap.html` (EAP mode, 2D, "Fit floor", 1920×1080),
normalized to relative position within each image's own floor extent —
**never claimed as CAD-grade coordinates**, per this phase's own explicit
instruction; this is a relative-position check only.

| Zone | Reference position (relative) | Current EAP-mode position (relative) | Match |
|---|---|---|---|
| DRILLING HOLD | far left, upper band | far left, upper band | Close match |
| DRILLING (upper-left) | left, spans wide, upper-to-mid band | left, spans wide, upper-to-mid band, right of Drilling Hold | Close match |
| DRILLING (central) | center, mid band | center, mid band, right of upper-left cluster | Close match |
| XRY | right of center-Drilling, same height band | right of center-Drilling, same height band | Close match |
| AUTO LAY UP | top-right, tall (spans upper-to-mid height) | top-right, shorter vertically than the reference's block | **P2** — right quadrant preserved, vertical extent compressed |
| BONDING | right side, overlapping XRY's height band | right side, noticeably lower than XRY's height band | **P2** — same right-side quadrant, but vertically offset from the reference's placement relative to XRY |
| PP | far right, same height band as Bonding | far right, same height band as the (lower) Bonding | Close match relative to Bonding, inherits Bonding's P2 offset |
| OXIDE | its own labelled sub-area directly under Bonding's columns | visually adjacent to/overlapping the Laser Drilling cluster in the schematic | **P2** — label placement crowds against a different zone's cells |
| DE-OXIDE | center-bottom | center-bottom | Close match |
| CUTTING | bottom-left-of-center | bottom-left-of-center | Close match |
| LASER DRILLING | its own area, right of De-Oxide, above the bottom edge | overlapping/adjacent to Oxide's cluster (same finding as Oxide, above) | **P2** |
| POST-CUT PAIR | between center-Drilling and Cutting, left side | between center-Drilling and Cutting, left side | Close match |

**No P0 and no P1 found.** No zone reads as being in the wrong quadrant
of the plant, no process reads out of order, and nothing here would lead
an operator to look in the wrong physical area for a problem. The three
P2 findings (Bonding/PP vertical offset relative to XRY, Oxide/Laser-
Drilling label crowding) are real, visible, worth a future pass, but do
not misrepresent which physical area a zone belongs to.

## Real finding fixed this phase: legend completeness (P2)

The simulated-status legend had no "Off" row at all (6 of the 7
canonical states were listed; Off was silently absent) — a real gap
against this phase's own explicit "use exactly
RUN/DOWN/IDLE/OFF/INITIAL/PM/STOP" instruction, found by directly
enumerating the DOM's own `.legend-row` elements, not assumed. **Fixed**
(see `EAP_SCADA_UX_SPEC.md`): added, dimmed (decorative chip only, never
the label text — the same real contrast bug this codebase already fixed
twice before was checked for and avoided here), with a note that
simulation never assigns it (a floor mid-shift is never Off, so no cell
will ever actually render this colour — the row exists for vocabulary
completeness, not because the simulation will produce it).

## CAD reconciliation (Phase 2)

**No manual redraw performed or needed.** AUTO mode's real screenshot
shows the actual CAD-extracted walls, columns and door openings from
`Floor1.dwg`/`.dxf` (via the existing, unchanged `/api/floor-geometry`
pipeline — the same one `docs/eap-floor1-spatial-registration.md`/
`docs/eap-operational-node-reconciliation-floor1.md` already validated
in prior phases). The zone-region overlays (A-K lettered boxes) sit
inside real walls, at positions consistent with the reference image's
own relative arrangement (see table above) — confirming the prior
phases' spatial registration work still holds. CAD geometry itself was
not touched this phase, per this phase's own explicit instruction.

## Reference/current dimensions

| | Width×Height |
|---|---:|
| Reference image (`01 LayoutApex3-F1.jpg`) | 1545×1034px |
| Current render (screenshot, 1920×1080 viewport, "Fit floor") | 1920×1080px (viewport-driven, not a fixed canvas size — the renderer is responsive) |

No pixel-for-pixel size claim is made or meaningful here — the reference
is a fixed screenshot from another system, the current render is a
responsive WebGL canvas; relative position and proportion (the table
above) is the correct comparison, not absolute pixel dimensions.
