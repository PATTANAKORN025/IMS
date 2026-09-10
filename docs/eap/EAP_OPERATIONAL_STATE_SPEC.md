# FT-EAP-STATE — Operational State Spec

## Phase 2 — canonical state contract

One function, `resolveOperationalState(cell)` in `eap.js`, is now the only
place a state is derived. Every other reader — `paintStates()`, the cell
inspector, the zone inspector, the factory-wide breakdown table, and the
`window.__eap` QA surface — calls it or one of its two aggregations
(`factoryStateBreakdown`, `zoneStateBreakdown`) rather than re-deriving its
own notion of "what state is this."

```
{
  object_id:    string            // the cell this record describes
  state:        one of the 8 plant states, or null
  state_source: 'SIMULATED' | 'NONE'
  observed_at:  null              // always -- see below
  quality:      'SIMULATED' | 'NO_DATA' | 'UNAVAILABLE'
  reason:       string            // always present, human-readable
}
```

`observed_at` is always `null`. The simulation has no clock — it is a pure
function of `cell_id`, not a sampled reading — so there is no real
observation time to report. Stamping the render time on it would dress a
static function call up as telemetry, which this phase's own "do not
create fake production state" rules out as firmly as inventing the state
itself would.

Geometry, position and identity are never duplicated into this record —
they stay on `cell` (`footprint`, `world_footprint`, `cad_evidence`,
`machine_unit_id`, etc.), exactly where FT-24.6/eap-map.js's own contract
already keeps them. This record is state, and only state.

`quality` is never `'OK'`: nothing this page shows is a real observation,
so nothing earns the quality label a real one would.

## Phase 3 — rendering

Unchanged from the existing, already-audited (FT-24.6, FT-EAP-UX)
per-cell colour + legend: the seven plant states plus Off, each with its
own colour AND its own glyph, from `operational-status.js`'s single shared
vocabulary — no second palette invented for this phase.

**New this phase**: an always-visible, DOM-text breakdown table
(`#stateBreakdown`, in the aside, never hover- or click-gated) listing
every non-zero bucket as `chip + glyph + label → count`. This is the same
role app.js's own HUD list already plays for the physical twin — that
page's own comment names it "the accessibility fallback" — applied to EAP
for the first time. Before this phase, the *only* accessible-equivalent for
a cell's simulated colour was the per-cell inspector, which requires a
click; a viewer who cannot resolve the map's colours had no factory-wide
answer available without clicking through some number of the 210 cells
individually. The table closes that gap without adding a second colour
system or a new interaction model — it is a `<table>`, styled identically
to the existing `#counts` table two headings above it.

Reference-image note (unchanged from FT-EAP-UX): the reference's own legend
visually merges Initial/PM/Stop into one blue swatch; this page keeps them
distinct per this phase's own "semantic state values must remain distinct"
instruction — a deliberate, disclosed divergence, not a defect.

## Phase 4 — zone aggregation

`zoneStateBreakdown(zoneId)` and `factoryStateBreakdown()` both call the
same `stateBreakdownOf(cells)`, so a zone total and the factory total can
never diverge on methodology. Every cell lands in exactly one of nine
buckets — the seven plant states, `NO_DATA`, or `UNAVAILABLE` — and the
function carries its own reconciliation check (`reconciled: total ===
sum(all buckets)`), logged to console as a warning (never thrown, never
hidden) if it ever disagrees. It cannot disagree by construction — every
cell take exactly one branch in `resolveOperationalState` — so this is a
belt-and-braces alarm for a future change that breaks that invariant, not
a condition expected to fire.

Real measured result, all 210 cells, all 12 zones, simulation on: zone
totals sum to 210, matching the factory-wide total exactly (see
`EAP_OPERATIONAL_STATE_VALIDATION.md`).

The zone inspector (opened by clicking a zone or a zone card) now shows its
own zone's breakdown under a "Simulated state in this zone (N of M)" line,
using the identical resolver and identical row format as the factory-wide
table.

## Phase 5 — SCADA UX hierarchy

The existing hierarchy (Factory → Floor → Zone → Equipment → Detail) is
unchanged in navigation — this phase adds "State" into it without adding a
new page or a new mode:

- **Factory state**: the always-visible `#stateBreakdown` table — the
  3-second answer to "what is the factory state," present in the DOM
  before any click.
- **Zone state**: the zone inspector's new breakdown line, one click away.
- **Equipment state**: the cell inspector's existing "Simulated status"
  row, now sourced from the canonical resolver and carrying `state_source`
  and `quality` explicitly rather than a hand-written string.
- **Detail / next action**: unchanged from FT-EAP-UX's own finding — this
  page's honest "next action" is still "open a zone or a cell," because no
  authoritative mapping exists to name a real one. Nothing here fabricates
  an OCAP-style recommendation off simulated data; simulated state answers
  "what," never "what to do about it."

No new page, panel wall, or dashboard section was added — one table and
one inspector addition, both reusing the existing aside layout and its
established `dl`/`table`/`.note` styling.

## Phase 6 — data quality, not confused with a machine state

`NO_DATA` and `UNAVAILABLE` are counted in every breakdown alongside the
seven plant states, but never rendered with a plant-state colour and never
named as one — a real bug fix (see `EAP_OPERATIONAL_STATE_LINEAGE.md`)
replaced the old inspector text that had, in one case, called an
unavailable cell "OFF". They are local to `eap.js`
(`SIM_QUALITY_DISPLAY`), deliberately kept separate from both
`OPERATIONAL_STATUS` (the eight real plant states) and
`operational-status.js`'s own `DATA_QUALITY.UNMAPPED` (a different fact —
"no authoritative IMS link" — that module already reserves for the
physical twin). Reusing `DATA_QUALITY.UNMAPPED` for "not attached to a
machine unit in this reference layout" would have blurred a distinction
that module exists specifically to keep apart.

## Phase 7 — real data

None exists to use (see the lineage doc). No fixture, poll, or synthetic
generator was added beyond the simulation this page already shipped; its
default (`simulationOn = true`) is unchanged, since changing shipped
default behavior was not asked for and was not this phase's problem to
solve.

## Phase 9 — performance discipline

No polling loop exists on this page (confirmed by grep: no `setInterval`
anywhere in `eap.js`) and none was added — the simulation is a pure,
static function of `cell_id`, so there is nothing to poll and inventing a
periodic re-shuffle would fabricate dynamism this floor's own data does not
have. State is recomputed only on the events that already trigger a
rebuild — initial load, mode/view switch, and the simulation toggle — never
per animation frame; `paintStates()` (colour write) and
`renderStateBreakdown()` (table write) are the only two per-rebuild costs
this phase added, both measured (see the validation doc) at low
single-digit milliseconds, not once per frame.
