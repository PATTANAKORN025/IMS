<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Factory Twin — Operator Guide

How to read the Floor 1 twin without over-reading it.

Companion to **[Reconstruction Methodology](FACTORY_TWIN_RECONSTRUCTION.md)**,
**[Runtime Architecture](FACTORY_TWIN_ARCHITECTURE.md)** and
**[Security Model](FACTORY_TWIN_SECURITY_MODEL.md)**.

> [!IMPORTANT]
> The single most important thing on this page: **what you see is not all one
> kind of fact.** The building, its columns and its walls are read from the
> CAD; equipment positions and rotations are read from the CAD; most equipment
> *extents* are not established at all; no monitored device is drawn anywhere;
> and nothing is confirmed as a physical identity. The interface is built to
> keep those apart. Reading them as one picture is the failure mode this system
> exists to prevent.

---

## The four distinctions

These are not pedantry. Each one, collapsed, produces a specific wrong decision.

| Distinction | What collapsing it would cause |
|---|---|
| **Observed ≠ Confirmed** | A detected column or slot is evidence-backed but carries **no identity**. Treating an observed slot as a known machine attributes live state to equipment nobody has identified. |
| **Simulated ≠ Real** | Machine *state* is real telemetry. Machine *position* is a synthetic grid. Walking the floor to the place a machine appears on screen leads to the wrong place. |
| **Derived ≠ Measured** | Floor-to-floor height is computed from printed levels. Clear height under the slab is not known at all. Using the derived figure as a clearance is a physical-safety error. |
| **Unknown ≠ Missing** | A blank height, an unmapped slot or an absent wall means *no source exists*, not that someone forgot. Nothing is pending; something is absent. |

---

## The screen

The chrome **docks**. Header, status strip, floor and inspection drawer are
layout tracks, not floating windows, so nothing is ever drawn on top of the
floor plan. Opening the drawer narrows the plan; it never covers it.

```
HEADER          factory identity · view controls · data quality · build id · Inspection
STATUS STRIP    Off  Down  Idle  Initial  PM  Stop  Run  Undefined  |  Unmapped
FLOOR                                                        INSPECTION DRAWER
                the plan or the model, full width              factory KPIs
                                                               layers
                CONTEXT PANEL appears here, bottom-left,       machine states
                only after you select something                evidence
                                                               devices
                                                               diagnostics
```

The **context panel** is the one element allowed over the floor, it appears
only on selection, and it is capped and scrollable. The regression suite
hit-tests the centre of the canvas at five viewports — 1366×768, 1920×1080,
2560×1440, 3840×2160 and 600×1000 portrait — and fails if anything but the
canvas is there.

Below 900 px wide the drawer overlays instead of docking: a 340 px track on a
600 px screen would leave the plan unreadable. The invariant that holds at
every width is that **the floor pane never grows to make room** and the drawer
is always dismissible.

**Build identity is on screen.** The `build …` chip in the header is the
running build's fingerprint, fetched from `/api/build` and computed at boot
from the bytes of the source files actually in the running image. It is not a
constant written into the page — a constant says whatever it said when someone
last edited it, which is exactly how a stale deployment stays invisible. Two
services showing the same fingerprint are running identical code.

---

## Views

Three camera presets, **2D first**. Physical accuracy is what this twin is for
right now, so the plan is the primary view. **A view changes the camera and
nothing else** — no view moves an object, changes a coordinate, or alters an
evidence state, and the regression asserts the rendered coordinate string is
byte-identical before and after every switch.

| View | Framing | Use it for |
|---|---|---|
| **2D Plan** | **The default.** Straight down: the CAD floor plan — outline, walls at measured thickness, columns, openings, areas, equipment. | Checking the twin against the drawing. Reading the floor as a drawing. |
| **3D** | Oblique, fitted to the whole floor. | Executive / NOC walkthrough; understanding the building as a volume. |
| **Fit floor** | Frames the measured envelope. All structural geometry in frame. | Getting back to a known framing after orbiting. |

All three are the same scene and the same coordinates seen from different
angles — not separate drawings — so the plan and the 3D model can never
disagree about where a wall is.

The hand-tuned **Operator** camera is gone. It framed a synthetic device grid
that no longer exists, so it framed empty floor.

**Views stay disabled until the data that defines them arrives.** A disabled
button means the measured envelope has not loaded — the usual cause on a fresh
clone, which has no private geometry.

**Reset camera** re-applies the framing of whichever view you are in. It does
not switch views: which view you are in is your choice; where orbiting has left
the camera is not.

---

## Layers

One toggle per evidence class, not per convenience grouping. Hiding a layer
hides meshes; it never removes an object, changes a count, or alters an API
result.

| Layer | Contains | Evidence class |
|---|---|---|
| **Floor shell** | Floor plate, measured envelope outline, surveyed gridlines | MEASURED envelope |
| **Columns** | Structural columns read from the CAD | MEASURED_CAD |
| **Walls and openings** | Interior walls and partitions, plus doors, windows and air showers | MEASURED_CAD plan and thickness; **height is PRESENTATION_ONLY** |
| **Functional zones** | Validated process/functional areas only | OBSERVED_CAD (validated tier only) |
| **Equipment** | CAD block references: 224 positions, 63 with a measured extent | MEASURED_CAD position and rotation; OBSERVED_CAD or UNRESOLVED extent |

Each toggle carries a live count — for example the zone toggle reports
validated versus withheld, and the equipment toggle reports how many extents
are UNRESOLVED. **Withheld zones are never rendered at any toggle setting**;
they failed validation or are party to an unresolved conflict, and a toggle is
not permitted to promote them.

---

## Reading the equipment

Every asset on the floor comes from a CAD block reference, and each one carries
**two claims of different strength**:

| | Claim | Drawn as |
|---|---|---|
| **Position and rotation** | `MEASURED_CAD` — stated by the drawing's own `INSERT` record. Nothing is traced, snapped, averaged or fitted. | Where and how it sits |
| **Extent** | `OBSERVED_CAD` for 63 assets, `UNRESOLVED` for 161 | A solid, lighter pad — or a small uniform marker |

**A uniform marker means the CAD did not establish that machine's size.** The
block bounding box overlapped a neighbour, or centred off the floor, which
means it measures a service envelope or a leader rather than the machine body.
No default box is substituted. Every unresolved marker is the same size on
purpose: it must not be mistakable for a measurement.

**Height is unknown for every asset.** A plan view carries no equipment
elevation, so everything is a flat pad, never a volume that would imply a
height nobody read.

---

## What is no longer drawn

Three things were removed, and each was removed at the data path rather than
hidden:

- **Every monitored device.** The twin used to draw all 23 on a synthetic
  grid. The route, the computation, the meshes and the floor plate sized from
  them are deleted. On a floor read from CAD, an invented position beside a
  measured one is indistinguishable to the eye. Telemetry is still real and
  still polled every 5 s; it drives the status strip and the device list, and
  it colours nothing on the floor.
- **The 243 raster equipment slots.** Digitised from a scan of a printed
  sheet: left/right placement, extent and orientation were all the raster's,
  not the drawing's. They are retained in the private document as a superseded
  record and served nowhere.
- **The invented machine forms.** A body chosen from a table of shapes nobody
  measured, drawn on top of those raster positions — two unmeasured claims
  stacked, rendered at the same visual weight as the CAD beside them.

Nothing in the scene opens a machine drill-down, because nothing in the scene
*is* a machine. A drill-down would have to start from a position, and no
position on this floor is tied to a device by an authoritative record.

The **raster schematic view** is also gone from this page. The transcription
itself still exists and `/api/floor-schematic` still serves it, but the
canonical Factory Twin is the CAD floor, and mixing a not-to-scale drawing into
the same page is how raster geometry leaked into the physical view.

---

## Status strip — exactly eight states

These are the plant's own words, not a monitoring dialect invented by this
view. An operator reading this board and an operator reading the line's HMI
see the same word for the same machine.

| State | Means |
|---|---|
| **Off** | *No source.* Powered down. No column in this schema reports it. |
| **Down** | Active Critical or Major alarm on a mapped asset. |
| **Idle** | Mapped asset present and reporting, not running. |
| **Initial** | *No source.* Warm-up or start-of-job. |
| **PM** | *No source.* Planned maintenance. |
| **Stop** | *No source.* Deliberately stopped. |
| **Run** | Mapped asset running with no active alarm. |
| **Undefined** | Mapped asset whose evidence is insufficient to name a state. |

Four are marked **NO SOURCE** and show a **dash, never a zero**. That is a
statement about the *system*, not the floor: this deployment has no column that
could light those lamps. A zero would be a measurement ("none are in PM"); a
dash is the truth ("this system cannot tell you").

**Unmapped is not a ninth state.** It sits after a separator because it is a
fact about the *record* — the asset has no authoritative link to a device — not
about the machine. An unmapped asset is not Off, and it is not Undefined
either; no machine state applies to it at all.

Two rules hold regardless of what is on screen:

- **A machine whose state cannot be established shows Undefined**, never a
  plausible-looking Idle, Off or Run. A failed lookup must never read as a
  healthy machine, and it must not read as a powered-down one either.
- **A status requires an authoritative device mapping.** Position, numbering
  and name similarity never produce one. With **0 confirmed mappings today,
  every physical asset on this floor is Unmapped** and no live status is drawn
  on any of them.

Every row carries a distinct glyph as well as a colour, so the vocabulary
survives a monochrome screen, a projector, and colour-blind vision.

The states that were removed — NORMAL, WARNING, CRITICAL, OFFLINE, STALE DATA,
MAINTENANCE, PRESENTATION ONLY — were this view's own invention. The
regression fails if any of them reappears on the board.

---

## Evidence legend

Open **Evidence legend** in the panel. Every state is shown as **glyph +
word**, with colour only reinforcing:

| Glyph | State | Means |
|---|---|---|
| ▣ | **MEASURED** | Read from the source and cross-checked. |
| ▲ | **DERIVED** | Computed from measured inputs, not read. |
| ◆ | **OBSERVED** | Detected and visually verified; **no identity claim**. |
| ◇ | **SIMULATED** | Deliberately not real. |
| ? | **UNKNOWN** | No source exists. Not pending. |
| ✓ | **CONFIRMED** | Authoritative. **Nothing in this build is CONFIRMED.** |

Colour is never the only channel. On a monochrome screen, or with any colour
vision deficiency, the glyph and the word both still carry the state.

---

## Inspector

Hovering an object opens the inspector. It reports only safe aggregate
metadata: **object type, evidence state, provenance class, confidence, mapping
state, height state.**

It deliberately does not expose filenames, filesystem paths, source-document
content, vendor names, process names or credentials. If you need a value that
is not there, it is withheld by design — see the
**[Security Model](FACTORY_TWIN_SECURITY_MODEL.md)**.

What you will see, and what it means:

| Field reads | Means |
|---|---|
| `UNMAPPED` | No authoritative record ties this position to a device. This is the state of **every** asset today. |
| Footprint `UNRESOLVED — not established by the CAD` | The block bounding box measures more than the machine. No extent is claimed and none is drawn. |
| Position evidence `MEASURED_CAD` | Read straight out of a CAD `INSERT`: insertion point and rotation are the drawing's own. |
| Footprint evidence `OBSERVED_CAD` | The block's bounding box, which measures everything the block draws. Weaker than the position beside it. |
| height `unknown — not in evidence` | A plan view carries no equipment elevation. Nothing was estimated. |

The inspector states the position and the extent as **two separate rows with
two separate evidence tiers**, because they are two claims of different
strength on the same record. Reading them as one is the specific mistake this
layout prevents.

---

## Accessibility

- **Keyboard:** view buttons, the reset button, the Inspection toggle, every
  layer checkbox and every disclosure are native controls reachable by
  <kbd>Tab</kbd>;
  <kbd>Space</kbd> / <kbd>Enter</kbd> activate them. Camera orbit is a pointer
  interaction, but the three view presets and reset give keyboard-only users a
  full set of framings without it.
- **Visible focus:** focus outlines are explicit, not the suppressed default.
- **Contrast:** header, status strip and drawer text meet the 4.5:1 ratio against the panel
  background at the sizes used.
- **Never colour alone:** every evidence state carries a glyph and a word.
- **Live regions:** the inspector announces politely rather than interrupting.

Verified at 1366×768, 1920×1080, 2560×1440, 3840×2160 and a 600×1000 portrait
viewport. See **[Visual QA](FACTORY_TWIN_VISUAL_QA.md)**.

---

## What this view cannot tell you

Do not go looking for these; they are absent because no source exists.

- Which physical machine any asset is (**0 confirmed mappings**).
- The size of 161 of the 224 assets (**extent UNRESOLVED**).
- Lift pits.
- Clear ceiling height, or the height of any piece of equipment.
- A complete equipment census.

**[Evidence Requirements](FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)** states
exactly what would unlock each.
