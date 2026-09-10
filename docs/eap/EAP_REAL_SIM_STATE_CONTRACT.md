# FT-EAP-STATE-03 — Real/Simulated Operational-State Contract

## The canonical record

One shape, returned by `resolveOperationalState(cell)` in `eap.js`
(delegating to `createOperationalStateResolver()` in the new
`operational-state-adapters.js`), read by every caller on the page — the
WebGL cell colour, the cell inspector, the zone/factory breakdown tables:

```
{
  object_id:   string | null
  state:       one of the 8 plant states, or null
  source_type: 'REAL' | 'SIMULATED'
  quality:     'VALID' | 'STALE' | 'NO_DATA' | 'UNAVAILABLE' | 'SIMULATION'
  observed_at: timestamp | null
  reason:      string, always present
}
```

Geometry, position and identity stay on `cell` (`footprint`,
`world_footprint`, `cad_evidence`, `machine_unit_id`) and are never
duplicated into this record — it is state, and only state.

## The two adapters

`RealOperationalStateAdapter` and `SimulatedOperationalStateAdapter`
(`operational-state-adapters.js`) both implement the same shape:
`{ source_type, isAvailable(), resolve(cell, ctx) }`. Neither the map, the
inspector, nor the breakdown tables know which one answered a given
call — that fact is in the record itself (`source_type`), not implied by
which function the caller happened to invoke.

`createOperationalStateResolver()`'s own `resolve()` is the only
orchestration logic: ask REAL first, always; fall through to SIMULATED
only because REAL's own answer has `quality === 'UNAVAILABLE'`. This is
not "assume real is unavailable and skip it" — REAL is asked on every
single resolution, and its answer is the one actually checked.

### RealOperationalStateAdapter

Answers `{ state: null, source_type: 'REAL', quality: 'UNAVAILABLE' }`
unconditionally today. See `EAP_OPERATIONAL_SOURCE_AUDIT.md` for the
repository-wide evidence this rests on. It is a real module — not a stub
left for later — so a future integration has exactly one file to change,
and "no real source" is a fact the data model asserts on every call
rather than a fact inferred from an adapter's absence.

### SimulatedOperationalStateAdapter

Client-side only, deterministic per `cell_id`, never touches `/api/state`
or any production telemetry (unchanged behavior from FT-EAP-STATE,
re-homed into its own module). Its `resolve()` returns, in order:

1. `quality: 'UNAVAILABLE'` if the simulation toggle is off — a
   source-level fact, checked first, overriding everything below it.
2. `quality: 'NO_DATA'` if the cell has no machine unit attached — an
   object-level fact, only reachable once the source itself is confirmed
   running.
3. `quality: 'SIMULATION'`, with a generated `state`, otherwise.

## Quality vocabulary (Phase 3/4)

| Value | Meaning | Reachable today? |
|---|---:|---|
| `VALID` | A real, fresh observation | No — no real source exists (see audit doc) |
| `STALE` | A real observation, too old to trust | No — same reason |
| `NO_DATA` | A source is available but has nothing for this object | Yes, via SIMULATED (an unattached cell) |
| `UNAVAILABLE` | The source itself is not running or does not exist | Yes, via REAL (always) and via SIMULATED (toggle off) |
| `SIMULATION` | A generated stand-in | Yes, via SIMULATED (attached cell, toggle on) |

`VALID` and `STALE` are listed, not omitted, for the same reason
`operational-status.js` lists `OFF`/`INITIAL`/`PM`/`STOP` with
`backed: false` — a vocabulary with silent holes is worse than one that
names what it cannot currently produce. Never set either without updating
`EAP_OPERATIONAL_SOURCE_AUDIT.md` with the real evidence that changed.

`NO_DATA`/`UNAVAILABLE`/`SIMULATION` are never collapsed into `OFF`,
`STOP`, or `PM` — the real bug this whole contract exists to prevent (see
FT-EAP-STATE's own lineage doc for the one that was actually found and
fixed: sim-off text once read "OFF (simulation disabled)").

## UI (Phase 8)

The cell inspector's "Operational state" row shows all three facts,
never merged into one string a viewer has to parse apart:

```
▬ Stop  [SIMULATED]   (quality = SIMULATION) — deterministic per-cell simulation, not live telemetry
```

The `[SIMULATED]`/`[REAL]` badge reuses this page's existing `.badge`
classes (`ok`/`warn`) — visually distinct, not just textually different,
so a viewer cannot mistake a simulated colour for a real one at a glance.
The plant-state legend (`RUN`/`DOWN`/.../`Off`) is unchanged and is never
the place source/quality is shown — that distinction stays in the
inspector and the breakdown tables, exactly where Phase 8 asked it to
stay separate from "the operational legend."

## What did not change

Zone/factory aggregation (`stateBreakdownOf`), the always-visible
breakdown table, and every existing call site's signature
(`resolveOperationalState(cell)`, one argument) are unchanged — this
phase re-homed the resolution logic into a testable adapter pair and
renamed two fields (`state_source` → `source_type`, quality value
`SIMULATED` → `SIMULATION`) to match this phase's own vocabulary; it did
not change what any existing caller receives structurally beyond that.
