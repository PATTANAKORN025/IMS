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
> kind of fact.** The building is measured, the columns and slots are observed,
> the machines are placed on a synthetic grid, and nothing at all is confirmed
> as a physical identity. The interface is built to keep those apart. Reading
> them as one picture is the failure mode this system exists to prevent.

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

## Views

Three camera presets. **A view changes the camera and nothing else.** No view
moves an object, changes a coordinate, or alters an evidence state — the
regression suite asserts the rendered coordinate string is byte-identical
before and after every switch.

| View | Framing | Use it for |
|---|---|---|
| **Operator** | The framing operator work was tuned against; machines stay legible at working size, structural context visible around them. | Day-to-day monitoring. |
| **Building** | Frames the measured envelope. All structural geometry is in frame. | Understanding where things are in the real building. |
| **Overview** | **The default.** Frames the union of the measured envelope and the synthetic machine grid, so the whole floor is on screen at once. | Executive / NOC walkthrough, and the first question anyone asks: what is the state of the floor. |

The default is Overview rather than Operator because the view opens on the
factory, not on a corner of it. The Operator framing is one click away and is
unchanged. If the measured geometry has not loaded — or a deployment has none
— Overview cannot be derived, and the fixed Operator camera is what you get.

> [!WARNING]
> **Overview frames a union, not a registration.** The measured building and
> the synthetic machine grid are two unrelated coordinate systems. Overview
> merely puts both in frame at once. Their relative placement on screen means
> nothing, and no alignment between them should ever be inferred from it.

**Building and Overview stay disabled until the data that defines them
arrives.** A disabled button means the measured envelope has not loaded — the
usual cause on a fresh clone, which has no private geometry.

**Reset camera to view framing** re-applies the framing of whichever view you
are currently in. It does not send you back to Operator: which view you are in
is your choice, where orbiting has left the camera is not.

---

## Layers

One toggle per evidence class, not per convenience grouping. Hiding a layer
hides meshes; it never removes an object, changes a count, or alters an API
result.

| Layer | Contains | Evidence class |
|---|---|---|
| **Floor shell** | Floor plate, orientation grid, measured envelope outline | MEASURED envelope, plus a rendering aid |
| **Columns** | Structural columns read from the CAD | MEASURED_CAD |
| **Walls and openings** | Interior walls and partitions, plus doors, windows and air showers | MEASURED_CAD plan and thickness; **height is PRESENTATION_ONLY** |
| **Functional zones** | Validated process/functional areas only | OBSERVED (validated tier only) |
| **Equipment slots** | Detected equipment positions | OBSERVED, no identity |
| **Simulated machines** | Monitored devices at synthetic positions | Real state, SIMULATED position |
| **Labels** | Live device state overlays | Telemetry |

Each toggle carries a live count in the panel — for example the zone toggle
reports validated versus withheld. **Withheld zones are never rendered at any
toggle setting**; they failed validation or are party to an unresolved
conflict, and a toggle is not permitted to promote them.

---

## Status legend

Eight states, and the panel is explicit about which of them this deployment
can actually show.

| State | Means |
|---|---|
| **NORMAL** | Mapped asset reporting a running state. |
| **WARNING** | *No source.* No warning tier is derivable today — active alarms collapse straight to CRITICAL. |
| **CRITICAL** | Mapped asset with an active Critical or Major alarm. |
| **OFFLINE** | *No source.* No column in this schema reports powered-off. |
| **STALE DATA** | Mapped asset whose telemetry is missing or past its freshness window. |
| **MAINTENANCE** | *No source.* No column in this schema reports planned maintenance. |
| **UNMAPPED** | A CAD asset with no authoritative link to an IMS device. Carries no status at all. |
| **PRESENTATION ONLY** | A drawn form standing in for an asset. Never a measurement, never a status. |

Three states are marked **NO SOURCE** in the panel. That is a statement about
the *system*, not about the floor: it means this deployment has no column that
could ever light that lamp, which is a different and more useful fact than "no
machine is currently in that state". Read a missing WARNING as "not
measurable here", never as "nothing is warning".

Two rules hold regardless of what is on screen:

- **An asset whose state cannot be established shows UNMAPPED, never NORMAL.**
  A failed lookup must never read as a healthy machine.
- **A status requires an authoritative device mapping.** Position, numbering
  and name similarity never produce one. With **0 confirmed mappings today,
  every physical asset on this floor is UNMAPPED** and no live status is drawn
  on any of them.

Every row carries a distinct glyph as well as a colour, so the vocabulary
survives a monochrome screen, a projector, and colour-blind vision.

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
| `UNMAPPED` | No authoritative record ties this position to a device. This is the state of **every** slot today. |
| `NOT CONFIRMED` | A mapping has not been established. It is not "probably right". |
| height `unknown — not in evidence` | A plan view carries no equipment elevation. Nothing was estimated. |
| `SIMULATED` on a machine | The state is live; the position is not real. |

The inspector uses a distinct visual treatment from the machine palette on
purpose: an observed slot must never borrow the visual language of a monitored
device.

---

## Accessibility

- **Keyboard:** view buttons, the reset button, every layer checkbox and the
  legend disclosure are native controls and reachable by <kbd>Tab</kbd>;
  <kbd>Space</kbd> / <kbd>Enter</kbd> activate them. Camera orbit is a pointer
  interaction, but the three view presets and reset give keyboard-only users a
  full set of framings without it.
- **Visible focus:** focus outlines are explicit, not the suppressed default.
- **Contrast:** HUD and panel text meet the 4.5:1 ratio against the panel
  background at the sizes used.
- **Never colour alone:** every evidence state carries a glyph and a word.
- **Live regions:** the inspector announces politely rather than interrupting.

Verified at 1366×768, 1920×1080, 2560×1440, 3840×2160 and a 600×1000 portrait
viewport. See **[Visual QA](FACTORY_TWIN_VISUAL_QA.md)**.

---

## What this view cannot tell you

Do not go looking for these; they are absent because no source exists.

- Which physical machine any slot is (**0 confirmed mappings**).
- Interior walls, doors or lift pits.
- Clear ceiling height, or the height of any piece of equipment.
- A complete equipment census.

**[Evidence Requirements](FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)** states
exactly what would unlock each.
