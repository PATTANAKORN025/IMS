<!--
  The canonical operational-footprint contract for Floor 1: which frames exist,
  which source wins, what a footprint means, and what the renderer is allowed to
  do with each level of evidence. Contract and wire only. No change to
  telemetry, the database schema, the Manufacturing Command Center, the Operator
  Andon, or the spatial-registration conclusions at 8005217.
-->

# Floor 1 EAP Canonical Operational Footprint

Status: **contract defined and enforced. Evidence coverage unchanged: 40 / 0 / 167 / 3.**

Continues from `8005217`, which is treated as an immutable baseline. That phase measured
what could be registered into CAD world space and found that only the 40 cells identity
already placed can be. This phase makes that result binding rather than merely recorded:
the wire now carries the evidence level, and the rules about what may be drawn and what
may show live status are stated in the payload and enforced by tests.

No attempt was made to increase world-position coverage, and none of the forbidden
routes to increasing it were used.

## A. Coordinate frames

Two frames exist. They are never mixed, and a value from one is never re-labelled as the
other.

| Frame | What it is | Metric | Who has one |
|---|---|---|---|
| `EAP_LAYOUT_FRAME` | the reference layout's own frame, scaled so the drawn factory width equals the floor width the CAD envelope states | **no** — anisotropic, vertical distances compressed | all 210 cells |
| `CAD_WORLD_MM` | the drawing's world millimetres, +y north | yes | 40 cells |

`EAP_LAYOUT_FRAME` is the canonical **drawing** frame: it is the only frame every cell
has, so it is what the map renders. It is not a measurement frame and must never be used
for a clearance, a distance or a machine size.

`CAD_WORLD_MM` is the canonical **physical** frame. Its coordinates locate the facility,
so they stay behind the wire: a client is told *whether* a cell has a world position,
never *what* it is.

## B. Source-of-truth hierarchy

For each question, exactly one source answers, and the others are not consulted:

| Question | Source of truth |
|---|---|
| Which cells exist, and their labels and grouping | the operational layout reference |
| Where a cell is drawn | the EAP footprint, in `EAP_LAYOUT_FRAME` |
| Where a machine physically stands | the CAD drawing, and only via a proven registration |
| Whether a cell is one drawing object | CAD identity, and only where a handle exists |
| Which cells form one machine | the layout's own printed grouping |
| Whether a cell may show live status | an authoritative IMS mapping, which does not yet exist |

The physical CAD equipment pipeline — 344 records, 270 measured rectangles — is *not* a
source of truth for this map. It answers a different question and has a different
population.

## C. The seven facts a cell carries, and why they are separate

| Fact | Field | Today |
|---|---|---|
| EAP layout position | `footprint` (x, z, rotation, width, depth) | all 210 |
| CAD world position | `has_cad_world_position` on the wire; coordinates stay private | 40 |
| CAD identity | `cad_evidence.has_cad_instance` | 40 |
| Operational footprint | `footprint` — the one geometry both 2D and 3D read | all 210 |
| Mapping state | `mapping_state` — DIRECT 40, AMBIGUOUS 170 | all 210 |
| Unit state | `unit_state` — ATTACHED 208, UNASSIGNED 2 | all 210 |
| Spatial evidence | `spatial_evidence` — DIRECT 40, STRUCTURAL 0, SET_LEVEL 167, LAYOUT_ONLY 3 | all 210 |

**CAD world position and CAD identity are independent fields, and that independence is
the point of this contract.** A cell may hold a world position with no identity — that is
what a STRUCTURAL registration produces — and a cell may hold an identity with no usable
world position. On this floor the two happen to coincide on all 40 cells, which is
exactly why the distinction has to be enforced by a test rather than left to memory: the
first structural registration will separate them, and nothing in the code should have
come to depend on their agreeing.

The footprint is likewise separate from both. It is the reference-layout rectangle, in a
non-metric frame, and it stays that even for a cell whose world position is known.

## D. Evidence rules

| Level | Means | Position | Residual |
|---|---|---|---|
| `DIRECT` | CAD identity and position proven | the identified instance's own transformed body position | 0 by construction |
| `STRUCTURAL` | identity unresolved; the CAD set and the EAP set correspond through count, geometry, ordering and zone, and a fitted transform reproduced the pairing | from that transform | measured, must be reported |
| `SET_LEVEL` | the CAD candidate set corresponds to the EAP set in the same zone; individual identity and order unproven | none — the zone gets a region | not applicable |
| `LAYOUT_ONLY` | only the reference-layout position is known | none | not applicable |

The four levels are never collapsed. A world position may exist **only** at `DIRECT` or
`STRUCTURAL`; the contract check fails in both directions — a position at `SET_LEVEL`, or
a permission to render in world space without a position.

## E. Renderer rules

| Level | What the renderer may do |
|---|---|
| `DIRECT` | a world-space footprint may be rendered from CAD evidence |
| `STRUCTURAL` | as `DIRECT` |
| `SET_LEVEL` | render at set or zone semantic level only — the zone is placed, the individual machine is not |
| `LAYOUT_ONLY` | reference-layout frame only |

Two rules apply at every level:

- **Unresolved cells are always drawn.** An unresolved identity is a fact about the
  evidence, never a reason to hide a machine. All 210 render, at full size, in place.
- **No cell is ever moved to fit the drawing.** Not by a nudge, not by a fitted transform
  that failed its residual test, not to make a zone look tidier.

The map today draws every cell in `EAP_LAYOUT_FRAME`, including the 40 that could be
drawn in world space. That is deliberate: mixing 40 surveyed positions with 170 schematic
ones in one picture would produce a map that is wrong in a way no viewer could see. The
payload records that those 40 are *permitted* a world render, so the day the coverage
changes the renderer has the flag it needs.

## F. Live-status eligibility

A cell may show live status only when **both** hold:

1. an authoritative IMS mapping exists for it, and
2. its spatial evidence is better than `LAYOUT_ONLY`.

No mapping exists for any cell, so today `live_status_eligible` is false on all 210 and
every `status` is `UNKNOWN`. The second condition is encoded now rather than remembered
later: a `LAYOUT_ONLY` cell is not known to correspond to anything in the plant, so it
cannot carry a machine's state even once mappings arrive.

The reference layout's colours are not status. They are a snapshot of another system on
the day the image was taken, they are not projected onto the wire under any name, and
only the boolean `reference_status_drawn` — evidence about the reference — crosses.

## G. Forbidden inference

None of these may create or improve a position, an identity or a status:

- nearest-neighbour matching as identity proof
- manual or "calibration" offsets
- screen-space or pixel scaling
- guessed machine identity, or a machine number that is not printed in the layout
- a zone-local transform forced past a poor residual
- dimension inference from neighbour spacing, zone width or cell size
- treating a reference-layout colour as a machine state
- treating the physical CAD equipment pipeline as the EAP node list

The rule behind all of them: a value may only exist where the evidence for it exists. A
plausible number is worse than a missing one, because a missing one is visible.

## H. Fallback behaviour

| Situation | Behaviour |
|---|---|
| No world position | draw in `EAP_LAYOUT_FRAME`, report the evidence level |
| No CAD identity | draw the cell, report zone-set evidence, leave the handle null |
| No machine unit | draw the cell, `unit_state: UNASSIGNED`, attach it to nothing |
| No legible label | draw the cell, pass the model's `UNREADABLE-n` through unchanged |
| No IMS mapping | `status: UNKNOWN` with the reason |
| Footprint incomplete or in the wrong frame | reject it rather than default it; the cell is reported without a footprint instead of drawn in the wrong place |
| Model not deployed | the route 404s and the map says so; nothing is synthesised |
| A state outside the vocabulary | fall back to the most conservative value (`AMBIGUOUS`, `UNASSIGNED`, `LOW`, `LAYOUT_ONLY`) |

## I. What changed

The wire now carries, per cell: `spatial_evidence`, `has_cad_world_position`,
`registration_method`, `registration_confidence`, `world_render_permitted`,
`live_status_eligible` and `live_status_blocked_by`. The payload carries a
`renderer_contract` block naming the rule for each level, a `live_status_contract`, and
the footprint contract's canonical frame. Counts now include the spatial-evidence
histogram and how many cells are world-render permitted and live-status eligible.

The renderer changed minimally and only to report the contract: the inspector shows the
spatial evidence, what frame the cell is drawn in, and why live status is not eligible;
the population panel lists the four evidence levels. **No geometry, camera, batching or
picking behaviour changed**, and no cell moved.

## J. Tests

| Check | Assertions | Where |
|---|---:|---|
| `tests/unit/eap-map-wire.test.js` | 24 | pre-commit |
| `tests/lint/eap-node-model-contract.js` | 94 | pre-commit |
| `tests/playwright/eap-map-regression.js` | 100 | `EAP_URL=… node …` |
| `tests/playwright/factory-twin-regression.js` | 518 | unchanged, green |

The eight rules this phase exists to hold are each a named test: no CAD position without
valid spatial evidence; a CAD position does not imply CAD identity; a CAD identity does
not imply a world position; `SET_LEVEL` does not imply an individual machine location; a
`LAYOUT_ONLY` cell can never carry live telemetry status, including once mappings exist;
an unresolved cell keeps everything needed to draw it; no physical mapping is fabricated;
and the fields the renderer already reads are still there, unchanged.

## K. Coverage, before and after

| Evidence | Before (`8005217`) | After |
|---|---:|---:|
| DIRECT | 40 | 40 |
| STRUCTURAL | 0 | 0 |
| SET_LEVEL | 167 | 167 |
| LAYOUT_ONLY | 3 | 3 |

Unchanged, deliberately. This phase added no coverage and claims none.

## L. Scope

Contract, wire projection, tests and documentation. The renderer changed only to report
the contract. No change to production telemetry, the database schema, Grafana, Node-RED,
the Manufacturing Command Center, the Operator Andon, the spatial-registration
conclusions, the 210-cell census, or any private CAD file.
