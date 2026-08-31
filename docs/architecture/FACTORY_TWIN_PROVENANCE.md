<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Factory Twin — Provenance

Where every object in the twin comes from, what it may claim, and what it is
forbidden from claiming.

Companion to **[Runtime Architecture](FACTORY_TWIN_ARCHITECTURE.md)**,
**[Security Model](FACTORY_TWIN_SECURITY_MODEL.md)**,
**[Evidence Requirements](FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)** and
**[Visual Fidelity](FACTORY_TWIN_VISUAL_FIDELITY.md)**.

---

## Four namespaces, never merged

The twin holds four different kinds of statement about one floor. Conflating
any two of them is the failure this system is built to prevent, so they are
kept apart in code rather than by convention.

| Namespace | What it is | Coordinates | Route |
|---|---|---|---|
| **MEASURED_PHYSICAL** | Building fabric traced from the architectural plan set | Metres, calibrated against the structural grid | `/api/floor-geometry` |
| **SCHEMATIC_OBSERVED** | A reproduction of a manufacturing-system floor render | Normalized drawing units, no scale | `/api/floor-schematic` |
| **IMS_LIVE** | Real telemetry from monitored devices | None — the database holds no position | `/api/state` |
| **UNMAPPED** | The relationship between any two of the above | — | — |

The separation is enforced by shape. Measured positions are `x`/`y`/`z`;
schematic positions are `sx`/`sy`. A value from one is refused by the other's
guard, in both directions, and both refusals are tested.

---

## Classification vocabulary

| Class | Means | Where it appears |
|---|---|---|
| `MEASURED` | Read from the plan set and cross-checked | Envelope, footprint, grid |
| `OBSERVED` | Detected and visually verified, no identity claim | Columns, equipment slots, functional zones |
| `SCHEMATIC_OBSERVED` | Visible on a reference render | Schematic areas, banks, labels |
| `SCHEMATIC_PRESENTATION_GROUP` | A grouping that exists to reproduce a drawing | Equipment banks |
| `SCHEMATIC_DERIVED` | A dimension read off a render, never measured | Bank width and height |
| `SCHEMATIC_ANNOTATION` | A number printed beside a line on a scaleless drawing | Dimension annotations |
| `SCHEMATIC_OBSERVED_LABEL` | Ink on a render, never an identity | Bank and cell labels |
| `CONFLICTING` | Two sources read it differently | the two renders declare one instant and disagree |
| `UNREADABLE` | Present but not legible; recorded as unknown | all 240 cell values and every cell status |
| `UNMAPPED` | No authoritative record relates it to anything | Every physical and IMS link |
| `SIMULATED` | Deliberately not real | Monitored device positions |

**No object moves between these silently.** Promotion requires an authoritative
source, and the promotion contract refuses every shortcut by name — proximity,
sequential ids, name similarity, grid symmetry, visual similarity, machine
ordering and MES numbering.

---

## What the selection panel states

Selecting anything in the schematic view reports its provenance rather than its
identity:

| Row | Example |
|---|---|
| Object | Schematic equipment bank |
| Source | Reference render FROOL1 |
| Classification | SCHEMATIC_OBSERVED |
| Grouping | SCHEMATIC_PRESENTATION_GROUP |
| Dimensions | SCHEMATIC_DERIVED — presentation only, not measured |
| Label reading | AMBIGUOUS — sources disagree |
| Cell values | CONFLICTING SOURCE — 7 cells |
| **Physical link** | **UNMAPPED** |
| **IMS link** | **UNMAPPED** |

The last two rows are the point. A drawing label looks like a machine name, and
an operator reading one has to be told in the same breath that it names nothing
in the monitoring system.

---

## Why there is no spatial IMS mapping

Not an omission, and not unfinished work. An audit of the whole repository
found nothing that relates the namespaces:

- **No asset-mapping document.** The private path holds geometry, zones and the
  schematic transcription only, so every slot is UNMAPPED by absence.
- **No spatial column in the device table.** Its `location` values are
  sanitized placeholders across five zones that correspond to nothing on
  either drawing.
- **No overlapping vocabulary.** The telemetry table's process field has three
  values; the schematic names ten areas; the two sets do not intersect.
- **Nothing in the pipeline carries position.** No flow, migration, view or
  fixture holds a slot id, coordinate, floor or machine tag.
- **The schematic references neither namespace.** Its records contain no slot
  id and no device id, verified by scanning the document for both patterns.

What is left is shape and position — matching things because they look alike or
sit in about the same place. That is exactly what the contract refuses, and the
refusal is doing its job: such a match would probably be right, and "probably
right" is the claim this system exists not to make.

---

## Live telemetry without a location

Telemetry is real and is displayed. Its position is not, so it is not drawn on
the floor.

The panel is titled **Unmapped IMS devices** and states plainly that spatial
mapping is unavailable. Device state, board counts and alarms are shown as
text. No device is placed on the schematic, and the monitored devices in the 3D
view sit on a synthetic grid that is labelled SIMULATED wherever it appears.

This gives real operational data without inventing a spatial relationship.

---

## Injecting a mapping later, without redesign

The architecture already anticipates one. Nothing about the following requires
a code change beyond the projection itself:

1. Drop an authoritative record into the private path: drawing label or slot
   id, the device it corresponds to, who asserted it, and when.
2. The mapping contract validates it — one device to one position, unknown
   identifiers rejected, conflicting assertions surfaced rather than resolved.
3. The evidence registry decides what it may assert. Only an authoritative
   device-machine record can reach CONFIRMED, and only when validated and
   high-confidence.
4. The geometry route's projection gains the field deliberately, in a reviewed
   change, and the slot's status stops being UNMAPPED.
5. Diagnostics' link counters move on their own — they are computed from the
   records, not hardcoded, which is what makes today's zero meaningful.

Until then the contracts stay unused and correct rather than being given
something to do.
