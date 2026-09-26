# FT-EAP-STATE-04 — Real State Integration & Production Source Policy

## Final decision (per this phase's own two acceptable outcomes)

**Outcome B.** No authoritative source exists (`EAP_OPERATIONAL_SOURCE_AUDIT.md`).
REAL operational state is left as `UNAVAILABLE` — not `NO_DATA`, since the
finding is source-level (nothing exists to ask), not object-level (a
running source with nothing to say about one particular cell). SIMULATED
stays explicitly available, opt-in, for demo/test, and this document names
exactly what external integration is still required (below). No third
outcome was manufactured.

## Canonical adapter (Phase 3) — unchanged shape, restated in this phase's field names

```
{
  object_id:   string | null
  state:       one of RUN/DOWN/IDLE/OFF/INITIAL/PM/STOP, or null
  source_type: 'REAL' | 'SIMULATED'
  quality:     'VALID' | 'STALE' | 'NO_DATA' | 'UNAVAILABLE' | 'SIMULATION'
  observed_at: timestamp | null
  reason:      string, always present
}
```

`NO_DATA` is never translated into `OFF`, `STOP`, or `PM` — enforced by
construction: `RealOperationalStateAdapter` and
`SimulatedOperationalStateAdapter` (`operational-state-adapters.js`) each
return one of these five quality values explicitly; nothing in the
resolution path ever substitutes a plant state for a quality flag.

## Production source policy (Phase 4) — the real change this phase makes

**Before this phase**: the resolver fell through from REAL to SIMULATED
automatically, unconditionally, whenever REAL reported `UNAVAILABLE` —
which, since REAL is always unavailable today, meant every resolution
silently became a simulated one. This was an automatic fallback, exactly
what this phase's own brief forbids ("Do NOT fallback from REAL to
SIMULATED automatically in production").

**After this phase**: `createOperationalStateResolver().resolve(cell, ctx)`
takes a `demoModeOn` flag.

- `demoModeOn: false` (**PRODUCTION**) — REAL is asked, its answer
  (`UNAVAILABLE` today) is returned exactly as given. SIMULATED is never
  consulted. Every cell reads `REAL / UNAVAILABLE`.
- `demoModeOn: true` (**DEMO**) — REAL is still asked first, every time;
  only because that call answers `UNAVAILABLE` does the resolver then ask
  SIMULATED, and the result is returned tagged `source_type: SIMULATED`.

In `eap.js`, `demoModeOn` is the existing "Simulation: ON/OFF" toggle
(`simulationOn`), now correctly reframed as the production/demo switch it
always conceptually needed to be. The page's shipped default
(`simulationOn = true`, demo mode on) is **unchanged** by this phase — a
silent flip to production-first would have been a real, user-visible
behavior change to a page relied on throughout this engagement's own
prior QA, and changing it was not what this phase asked for. What changed
is that turning it *off* now produces the real, honest, correctly-labeled
answer instead of a mislabeled one.

Verified real, not asserted: with demo mode off, every one of 210 cells'
`operationalState()` returns `source_type: 'REAL', quality: 'UNAVAILABLE'`,
`reason` citing the audit doc — disposable container and real
authenticated production, both confirmed.

## State mapping (Phase 5)

No source states exist to map. The table this phase's own template asks
for has one honest row:

| Source state | → Canonical state | Evidence | Transformation rule |
|---|---|---|---|
| *(none — no real source integrated)* | *(none)* | `EAP_OPERATIONAL_SOURCE_AUDIT.md` | n/a |

No mapping is guessed to fill this table. The day a real source exists,
its own state vocabulary populates this table with real evidence per row
— not before.

## UI (Phase 7)

`eap.html`'s new "Operational data source" section (`#opDataSourceNote`,
always visible, never behind a click) shows exactly one of two messages,
updated on load, on the simulation toggle, and — verified this phase —
even with zero WebGL context available:

- **Production** (demo off): *"OPERATIONAL DATA — REAL SOURCE UNAVAILABLE.
  No authoritative APEX3 operational-state source is integrated for this
  floor... Every cell reads REAL / UNAVAILABLE, not a fabricated state."*
- **Demo** (on, the shipped default): *"DEMO MODE — SIMULATED. Every
  operational-state value on this map is generated, not observed. No live
  source feeds it."*

The cell inspector's own "Operational state" row (FT-EAP-STATE-03) already
showed a visually distinct `[REAL]`/`[SIMULATED]` badge per cell; this
phase adds the page-level, always-visible version of the same fact so a
viewer does not have to click a cell to know which mode the whole map is
in.

## What a real integration would actually require

Named explicitly, per this phase's own "document exactly what external
source is still required":

1. **An authoritative EAP-cell-to-machine mapping** — today, zero of the
   210 EAP cells have a confirmed correspondence to any real IMS/LDI
   device (`lib/eap-map.js`'s own wire contract: `status: 'UNKNOWN'` on
   every cell). Without this, even a real state feed would have nowhere
   valid to attach on the map.
2. **A real PLC/SCADA/MES/historian connection** — none exists in this
   repository in any form (confirmed, `EAP_OPERATIONAL_SOURCE_AUDIT.md`).
   `mes-import.js` is the closest artifact and is explicitly an identity
   *mapping* boundary for a system that has no real export today, not a
   state feed of any kind.
3. Only with both of the above would `RealOperationalStateAdapter`'s own
   `resolve()` have anything real to return — at which point it is the
   one function that changes, per its own module comment.
