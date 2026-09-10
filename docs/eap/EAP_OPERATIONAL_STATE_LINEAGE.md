# FT-EAP-STATE — Operational State Data Lineage

Continues from `5a42961c` (FT-EAP-CALIBRATION). Audits, before writing any
code, exactly where every one of the seven plant states shown on the EAP map
comes from, per this phase's own required chain: SOURCE → TRANSFORM →
MAPPER → EAP OBJECT → RENDERER.

## The real answer, stated once

**There is no real operational-state source for any EAP cell.** This is not
new — it is the same fact `lib/eap-map.js`'s wire payload has stated on
every cell since FT-24.6: `status: 'UNKNOWN'`, `status_reason: 'no
authoritative IMS mapping exists for this cell'`, `live_status_eligible:
false`. Re-confirmed this phase by grep: zero references to
`ims_device_id`, `ldi_machine_id`, `/api/state`, or any LDI/TimescaleDB
table anywhere in `eap.html`, `eap.js` or `lib/eap-map.js`.

Given that, this phase's own Phase 7 instruction ("use real data where
available... do not create fake production state") has a real answer:
**nowhere is real state data available**, and the LDI coupling that would
make it available is explicitly forbidden by this same phase's own brief.
The only state-shaped data that exists on this page is the disclosed,
client-side SIMULATED overlay eap.js already shipped (FT-24.6 era, audited
again in FT-24.6/FT-EAP-UX). This phase does not invent a second source —
it traces the one that exists, gives it the canonical contract Phase 2
asks for, and fixes one real bug found while doing that.

## The two real chains on this page

### Chain 1 — the authoritative one (produces UNKNOWN for all 210 cells)

| Stage | What happens |
|---|---|
| SOURCE | None. No `ims_device_id`, no `ldi_machine_id`, no column anywhere links an EAP cell to a real machine. |
| TRANSFORM | n/a |
| MAPPER | `lib/eap-map.js`'s `projectCell()` — deliberately does not attempt one |
| EAP OBJECT | `status: 'UNKNOWN'`, `status_reason: '...'`, `live_status_eligible: false` (all 210 cells) |
| RENDERER | Never colours a cell from this. Read out only in the cell inspector's "Live status" row and the static "Status" section of the aside. |

### Chain 2 — the disclosed simulation (the only thing that paints the map)

| Stage | What happens |
|---|---|
| SOURCE | The cell's own `cell_id` string. Nothing external — not a poll, not a fixture file, not a request. |
| TRANSFORM | `hashString(cell_id)` — a deterministic 32-bit string hash, `% SIM_STATES.length` |
| MAPPER | `resolveOperationalState(cell)` (new this phase, `eap.js`) — the one function every caller now goes through |
| EAP OBJECT | `{ object_id, state, state_source, observed_at, quality, reason }` — the Phase 2 canonical record (below) |
| RENDERER | `paintStates()` (cell colour), the cell/zone inspector, and the new always-visible `#stateBreakdown` table |

`state_source` on every record to ever leave `resolveOperationalState` is
either `'SIMULATED'` or `'NONE'` — never `'IMS'` or `'LDI'`, because Chain 1
never produces a value to source one from. Nothing in this phase's changes
makes Chain 2 look more authoritative than Chain 1 already discloses it to
be.

## Distinguishing NO_DATA / UNAVAILABLE from OFF (Phase 1's explicit ask)

Before this phase, a cell with nothing to show could read as **"OFF
(simulation disabled)"** in the cell inspector — a real bug, found while
building the lineage above, not by a failing test. That string named the
real plant state OFF (which this simulation deliberately never assigns —
`SIM_STATES` excludes it, "a floor mid-shift is not powered down") for a
cell that had no state at all. Two genuinely different absences were being
run together:

- **NO_DATA** — the cell has no machine unit attached (`unit_state !==
  'ATTACHED'`). There is nothing to simulate a state *for*. This is a fact
  about the cell's own mapping, unrelated to whether simulation is running.
- **UNAVAILABLE** — the simulation itself is switched off. The source is
  not running, which is a different fact than the source running and
  reporting nothing.
- **OFF** — a real plant state, in `operational-status.js`'s own eight-word
  vocabulary, meaning powered down. This simulation can list it (legend
  completeness, per FT-EAP-UX) but never assigns it, and after this phase
  never *names* it for either of the above.

Fixed in the same commit that adds the canonical contract (Phase 2), not as
a separate patch — see `EAP_OPERATIONAL_STATE_SPEC.md`.

## What this phase did not touch

CAD geometry, `EAP_LAYOUT_FRAME` positions (including FT-EAP-CALIBRATION's
own Bonding correction), `lib/eap-map.js`'s wire contract, and the
authoritative `status: 'UNKNOWN'` chain are all unchanged. This phase adds
one new client-side module of logic (`resolveOperationalState` and its
aggregations) on top of the existing, already-disclosed simulation — it
does not add a new source, and it does not map any EAP cell to any LDI or
IMS identity.
