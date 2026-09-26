<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Factory Twin — Presentation Model

> [!CAUTION]
> **SUPERSEDED — the machine-form layer this document describes is deleted.**
>
> It drew a body for every machine on the floor, chosen from a table of shapes
> nobody measured, standing at a position digitised from a scan of a printed
> sheet. Two unmeasured claims stacked, rendered at the same visual weight as
> the CAD geometry beside them.
>
> Equipment now comes from the drawing's own block references: position and
> rotation are `MEASURED_CAD`, extent is `OBSERVED_CAD` where the CAD
> establishes it and `UNRESOLVED` where it does not — and where it does not,
> the renderer draws a fixed marker and says so rather than supplying a body.
> See **[Reconstruction §0.3](FACTORY_TWIN_RECONSTRUCTION.md)**.
>
> This document is retained because the *rules* below — how a presentation
> claim must be labelled, and why it may never be promoted to evidence — still
> govern the two presentation constants that remain (wall height and column
> height). The machine-form library, its instanced meshes, its census and its
> layer toggle are gone from the code.

The third layer: geometry drawn to be understood rather than to be believed,
and the rules that keep it from becoming evidence.

Companion to **[Provenance](FACTORY_TWIN_PROVENANCE.md)**,
**[Runtime Architecture](FACTORY_TWIN_ARCHITECTURE.md)** and
**[Visual Fidelity](FACTORY_TWIN_VISUAL_FIDELITY.md)**.

---

## Three layers, one floor

| Layer | What it asserts | Coordinates | Default |
|---|---|---|---|
| **Measured physical** | This is where the building is | Metres, calibrated | On |
| **Schematic observed** | This is what the drawing shows | Drawing units, no scale | Separate view |
| **Presentation** | This is roughly what it might look like | Metres, borrowed from the measured layer | **Off** |

The presentation layer is off by default, and that default is the argument.
What this view claims when you open it is the measured floor. The presentation
model is something an operator turns on, having been told what it is.

---

## What is measured, and what is not

This is the whole distinction, so it is worth being exact.

| Property | Source | Class |
|---|---|---|
| Machine position (x, z) | Traced from the drawing | **OBSERVED** |
| Machine footprint (width, depth) | Measured from the drawn symbol | **OBSERVED** |
| Machine height | **Nothing.** A plan view carries no elevation | **PRESENTATION_ONLY** |
| Plinth, cabinet, enclosure, light strip proportions | A visual convention chosen here | **PRESENTATION_ONLY** |
| The fact that a machine is box-shaped at all | A visual convention chosen here | **PRESENTATION_ONLY** |

Every horizontal dimension comes from evidence. **Every vertical dimension is
invented, deliberately, and labelled.**

---

## Why inferred geometry is allowed here

The observed equipment positions render as flat pads in the measured layer, and
that was a correct decision: a silhouette implying a height nobody measured
reads as evidence whatever the metadata says.

But a floor of flat grey pads communicates almost nothing about a factory.
An operator cannot see aisles, cannot judge density, cannot tell equipment from
markings. The view becomes technically honest and practically useless.

The presentation layer resolves that by being a **separate, named, default-off
layer** rather than by relaxing the rule. The flat pads still exist underneath
and still carry the honest claim. The presentation bodies are an additional
drawing on top, and every one of them says what it is.

---

## Why it can never become evidence

Four things stop it, and none relies on anyone remembering the rule:

1. **Its own layer.** The presentation model lives in its own group, separate
   from the observed slots. Nothing reads it as slot geometry because it is not
   slot geometry.
2. **Its own classification.** Every object carries
   `classification: PRESENTATION_ONLY` and a note stating that heights are a
   drawing convention. The classification is on the object, not in a comment.
3. **The promotion contract refuses it.** `PRESENTATION_ONLY` is not a member of
   the evidence state enum at all. There is no path from here to OBSERVED,
   MEASURED or CONFIRMED, because the states do not connect.
4. **It never reaches the wire.** The presentation model is built in the
   browser from data the API already served. It is not in any private document,
   is not projected, and cannot be mistaken for a served field.

A test asserts the classification on every object, and another asserts that
building the layer moves no measured coordinate.

---

## How it is built

One `InstancedMesh` per (form, part). Twenty-one objects stand in for every
machine on the floor, and the layer costs **21 draw calls** rather than the
roughly one thousand that individual meshes would.

Machines are **not all one shape**. Equipment is drawn on six colour-separated
layers of the source sheet, and members of a layer repeat one symbol. Which
layer a symbol came from is served per slot as `detection.layer`, and it is the
only input the form model reads:

| Drawing layer (OBSERVED) | Form (PRESENTATION_ONLY) | Height |
|---|---|---:|
| black | Large process machine | 3.52 m |
| magenta | Medium process machine | 2.62 m |
| blue | In-line column station | 2.74 m |
| red | Bench with overhead gantry | 1.97 m |
| green | Transfer deck | 0.76 m |
| yellow | Control cabinet | 2.12 m |
| *unrecognised* | Unclassified block | 1.22 m |

The grouping is OBSERVED; the form is invented. Form names are shape words and
never process words — a form called "drilling machine" would assert that a
group is the drilling area's equipment, which is the mapping no evidence in
this project supports. An unrecognised layer falls through to the plainest
shape in the set, so an unknown group never looks better resolved than a known
one, and every height is a constant of its form, so no machine's height can
carry information about that machine.

That choice is about cost, and the cost is measured: the layer adds **4 draw
calls** and about 11,600 triangles. Drawn as individual meshes the same model
would be roughly a thousand meshes and a thousand draw calls. Instancing is
chosen here at build time for a reason that can be stated, rather than
retrofitted onto existing geometry whose visual equivalence would have to be
proven first.

Positions and footprints come from the served slots. Heights come from a single
frozen constant block, so every machine is identical vertically — a deliberate
signal that the height carries no information.

The status light strip is a **shape, not an indicator**. No cell status is in
evidence, the two reference renders disagree about status, and a coloured light
would be a claim. It is drawn unlit and uncoloured by any state.

---

## Replacing it with real data later

The presentation layer is designed to be deleted, not extended.

| Evidence that arrives | What happens |
|---|---|
| An equipment schedule with real heights | Heights move from the frozen constant into the served slot record, classified MEASURED. The presentation layer stops being needed for height. |
| Vector CAD with equipment solids | Replaces the procedural bodies entirely; the layer is removed rather than corrected. |
| An authoritative device-machine record | Unrelated to this layer. It changes what a slot *is*, not what it looks like. See [Provenance](FACTORY_TWIN_PROVENANCE.md). |

Nothing downstream depends on the presentation model existing. Turning it off
leaves the measured floor exactly as it was before this layer was written,
which the regression asserts by comparing the rendered coordinate snapshot
across the toggle.

---

## What was not built, and why

| Not built | Reason |
|---|---|
| Real machine heights | No source carries one. The constant here is a convention and says so. |
| Status-coloured lights | Status is not in evidence and the two renders disagree about it. |
| Cameras named after schematic areas | A camera called "Drilling" framing measured geometry would assert that the schematic area maps to that part of the building. It does not, and no such mapping exists. |
| A single 3D world holding measured and schematic geometry | Placement alone asserts registration. The two share no reference frame. |
