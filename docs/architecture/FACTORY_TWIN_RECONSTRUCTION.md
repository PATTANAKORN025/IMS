<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Factory Twin — Reconstruction Methodology

How the Floor 1 digital twin was built, what it is allowed to claim, and what
it is not.

> [!IMPORTANT]
> This document contains **no facility geometry**. Dimensions, coordinates,
> areas and process names live only in the private, gitignored data files
> described under [Private/public boundary](#privatepublic-boundary). What is
> documented here is method, contract and limitation.

---

## 0. Current state

What the twin holds today, and on what basis. Status words are used strictly:

| Word | Means |
|---|---|
| **CONFIRMED** | Read directly from the source, cross-checked, and agreeing with an independent value. |
| **OBSERVED** | Detected from the drawing and visually verified, but not independently corroborated. |
| **DERIVED** | Computed from confirmed inputs rather than read. |
| **SIMULATED** | Deliberately not real. Present so the system has something to render. |
| **BLOCKED** | Absent because the source does not exist — not because it was skipped. |
| **WITHHELD** | Extracted, but deliberately not served or drawn because it did not pass validation. |

| Asset | Count | Status | Evidence |
|---|---:|---|---|
| Envelope | 1 | CONFIRMED | Printed dimension chains on the plan set |
| Floor-to-floor height | 1 | DERIVED | Difference between printed floor levels across four plans |
| Clear height | — | BLOCKED | No section or elevation exists |
| Footprint polygon | 1 | CONFIRMED | Perimeter traced by ink-coverage measurement; area agrees with the printed figure |
| Structural grid | 1 | CONFIRMED | Printed spans; totals match, cross-checked against bubble spacing |
| Structural columns | 147 | OBSERVED | Shape detection at grid intersections, thresholds calibrated on verified samples |
| Equipment slots | 242 | OBSERVED | Colour-separated component detection, machine-scale filtered |
| Equipment height | — | BLOCKED | A plan view carries no equipment elevation |
| Monitored devices | 23 | SIMULATED position | Live telemetry is real; position is a synthetic grid |
| Physical mappings | 0 | BLOCKED | No authoritative record relates the namespaces |
| Functional zones (rendered) | 8 | OBSERVED | Area-layer boundaries accepted against printed areas |
| Functional zones (withheld) | 13 | WITHHELD | Failed area validation or party to an unresolved conflict |
| Interior walls | 0 | BLOCKED | Floor is open-plan; no closed wall network exists to recover |
| Doors | 0 | BLOCKED | Dependent on interior walls |
| Lift pits | 0 | BLOCKED | Symbols merge with adjacent structure |
| MES census | — | BLOCKED | Only source is a low-resolution screenshot |

**Not complete, and not claimed to be.** Six rows are BLOCKED, each on a
missing source rather than unfinished work. See
**[Evidence Requirements](FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)** for what
would unlock them and what a new source is allowed to claim once it arrives,
and **[Visual QA](FACTORY_TWIN_VISUAL_QA.md)** for the current QA and
performance baseline.

Four distinctions carry most of the weight of this document, and collapsing any
one of them produces a specific wrong decision rather than a rounding error:
**Observed ≠ Confirmed. Simulated ≠ Real. Derived ≠ Measured. Unknown ≠
Missing.** The consequences of each are tabulated in the
**[Operator Guide](FACTORY_TWIN_OPERATOR_GUIDE.md)**.

---

## 1. Reconstruction methodology

The twin was reconstructed from a confidential engineering floor plan held
outside the repository. Every geometric object was produced by the same loop:

1. **Characterise the symbol** at native resolution before writing any
   detector — establish what the thing actually looks like on the drawing.
2. **Calibrate thresholds on verified samples**, positive and negative. Every
   detector in this system has its thresholds derived from measurements of
   confirmed instances, never from intuition.
3. **Detect**, using the weakest assumption that works.
4. **Verify visually** at native resolution on a random sample of both
   detections and rejections.
5. **Record rejections** alongside detections. An object that failed
   detection is disclosed, never silently dropped.

Two methodological rules did the most work:

- **Colour separation.** Equipment is drawn on its own colour layers, so a
  detected component is not contaminated by unrelated linework. This is why
  equipment could be recovered where walls could not.
- **Shape tests over connectivity.** Structural symbols frequently touch
  adjacent linework, which defeats connected-component sizing. Testing for a
  symbol's *shape* against an integral image is immune to that, and recovered
  roughly twice as many columns as the connectivity approach.

### What was tried and abandoned

Recording these matters as much as the successes, because each rules out an
approach a future contributor would otherwise retry:

| Approach | Outcome |
|---|---|
| Flood-fill from room labels | **Failed.** Labels merged into one region larger than the whole building. The floor is largely open-plan; there is no closed interior wall network to recover. |
| Flood-fill against the area layer | **Failed.** Area boundaries are interrupted wherever equipment crosses them. Bridging the gaps far enough to close them would have fabricated boundaries. |
| Ray-cast + interior trace against the area layer | **Worked, partially.** Recovered the zones that are genuinely rectangular; zones with complex outlines remain rejected. |
| Connectivity-based structural detection | **Superseded** by the shape test, for the reason above. |

---

## 2. Evidence confidence model

Every digitized object carries a tier. The tiers are about **evidence
quality**, not about how good the result looks.

| Tier | Meaning |
|---|---|
| `HIGH` | Directly and unambiguously observed; where a repeated symbol exists, consistent with it. |
| `MEDIUM` | Observed, but with reduced separability — surrounding clutter, or a shape whose exact boundary is less certain. |
| `LOW` | A candidate that survives detection but whose geometry is not trustworthy. **Retained as metadata; never rendered.** |
| `REJECTED` | Failed validation. No geometry emitted. |
| `UNRESOLVED` | No defensible boundary found. No geometry emitted. |

Two rules are enforced in code, not merely documented:

- **Unvalidated geometry cannot render.** The API re-derives the renderable
  filter rather than trusting the data file's own flag, and the renderer
  applies the same guard again. Neither a hand-edited file nor a client-side
  change alone can promote an unvalidated object into the scene.
- **A conflict is never silently resolved.** Where two candidate boundaries
  contradict each other, both are retained and neither is drawn. Picking the
  one whose area matches better is specifically forbidden — that would be
  using the acceptance test as a generator.

### Printed values are validation, never input

Where the drawing prints an area, that value is used **only** to accept or
reject a boundary that was already traced from linework. No vertex has ever
been placed, moved or scaled to improve agreement with a printed number.

---

## 3. Coordinate system

- Metres. One scene unit is one real metre.
- Origin is the grid-envelope bounding-box centre — a **geometric reference
  only**. There is no survey datum and no geospatial claim.
- `x` follows the numbered structural grid axis, `z` the lettered axis, `y` is
  elevation.

### Height semantics

This distinction is load-bearing and easy to get wrong:

- **Floor-to-floor height is known**, derived from the floor levels printed on
  the building's plan set — consecutive levels differ by a constant interval.
- **Clear height under the slab is not known.** No section or elevation exists
  in any available source. It is recorded as `null` and the validator rejects
  any value supplied without a source.
- **Equipment height is not known.** A plan view carries no equipment
  elevation. The API's fallback is a *rendering default*, which is why slots
  are drawn as low flat pads rather than machine-shaped volumes — the
  silhouette must not imply a height nobody measured.

---

## 4. Object namespace model

Four identifier spaces exist. **They must never be merged without an
authoritative record.**

| Namespace | Origin | Notes |
|---|---|---|
| Geometry slot id | This reconstruction | Geometry only, carries no identity. |
| IMS `device_id` | The monitoring database | Real monitored devices. |
| MES machine id | An external manufacturing system | Prefixed per process group — **not** a flat sequence. |
| Zone id | This reconstruction | Anonymous functional area. |

Proximity, numbering order, and count coincidence are **not** evidence of
identity. A count matching between two namespaces is a coincidence until an
authoritative record says otherwise.

### Layer model

Objects are grouped by the kind of claim they make, and an object belongs to
exactly one layer:

| Layer | Sub-layer | Contains |
|---|---|---|
| `structural` | `shell` | Building envelope, footprint, orientation grid |
| `structural` | `columns` | Structural columns |
| `functional` | — | Validated process/functional areas |
| `operational` | `slots` | Observed equipment positions |
| `operational` | `machines` | Monitored devices at synthetic positions |
| `telemetry` | — | Live device state overlays |

The sub-layer split exists so an operator can separate two different claims
that would otherwise share one toggle: a measured envelope from a detected
column, and an observed position from a simulated device. Runtime detail is in
**[Runtime Architecture](FACTORY_TWIN_ARCHITECTURE.md)**; what each toggle
means to a reader is in the
**[Operator Guide](FACTORY_TWIN_OPERATOR_GUIDE.md)**.

Camera presets are **framing only**. Switching a view never moves an object,
changes a coordinate or alters an evidence state, and the regression suite
proves it by comparing a fixed-precision snapshot of every rendered coordinate
before and after switching.

---

## 5. Private/public boundary

| Where | What |
|---|---|
| **Public (this repository)** | Schemas, loaders, renderers, validators, contracts, methodology. |
| **Private (gitignored, runtime-only)** | All real geometry — envelope, footprint, grid, columns, equipment positions, zone boundaries. |
| **Outside the repository entirely** | The source engineering drawing. |

Enforcement is layered, not trusted to `.gitignore` alone:

- The private directory is gitignored and excluded from the Docker build
  context; the service image uses an allowlist `COPY` and never copies it.
- The private directory is **not** served as static content. It was, once —
  that route exposed every file in it to any authenticated user at a guessable
  URL, and was removed. Real geometry now reaches the browser only through the
  shaped API.
- A leak scanner runs over every tracked file in the pre-commit suite.
- All twin routes sit behind the proxy's authentication gate.

---

## 6. Mapping readiness

**No physical-to-device mapping exists, and none has been invented.**

The monitoring database carries no floor, no coordinates, no grid reference
and no machine tag; device locations are sanitized placeholder labels and no
placement or layout table exists. There is therefore nothing to map *from*.

The architecture is nonetheless ready for one: geometry and identity are
stored separately and joined at request time, so an authoritative mapping can
be introduced without touching a single geometry file. Until one exists, every
equipment position reports as unmapped, and the renderer keeps unmapped
positions visually distinct from real devices — an unidentified position must
never read as a confirmed machine.

---

## 7. Known limitations

Stated as **absence of evidence**, not as unfinished implementation. None of
these is blocked on effort; each is blocked on a source that does not exist.

| Not available | Why |
|---|---|
| Authoritative equipment census | The only census source is a low-resolution screenshot of an external system; counting it reliably is not possible. |
| Device-to-position mapping | No authoritative record relates the namespaces. |
| Interior walls | The floor is largely open-plan. The drawing's line work does not enclose, and equipment outlines share the structural layer. |
| Doors and openings | Dependent on interior walls. |
| Lift pits | Their symbols merge with adjacent structure, so they cannot be isolated. |
| Clear ceiling height | No section or elevation exists in any available source. |
| Equipment height | Not present in a plan view. |

The reconstruction is **evidence-backed but incomplete**, and is not claimed
to be otherwise.

---

## 8. Future evidence requirements

See **[Factory Twin — Evidence Requirements](FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)**
for the prioritized list of sources that would unlock the items above.
