# FT-EAP-STATE-04 — Real State Coverage (Phase 6)

Real numbers, disposable container and real authenticated production,
both confirmed identical. EAP mode, all 210 cells.

## Production mode (demo off — the honest, no-fallback answer)

| Bucket | Count | % of 210 |
|---|---:|---:|
| Total EAP objects | 210 | 100% |
| Real, valid (`source_type: REAL`, `quality: VALID`) | 0 | 0% |
| Real, stale (`source_type: REAL`, `quality: STALE`) | 0 | 0% |
| Real, no-data (`source_type: REAL`, `quality: NO_DATA`) | 0 | 0% |
| Real, unavailable (`source_type: REAL`, `quality: UNAVAILABLE`) | **210** | **100%** |
| Simulated (any) | 0 | 0% |

Every one of the 210 cells reads `REAL / UNAVAILABLE` in production mode —
verified by reading `window.__eap.operationalState()` for all 210 drawn
cells, not sampled. `UNAVAILABLE` rather than `NO_DATA` throughout: the
finding is source-level (no source exists to ask at all), not object-level
(a running source with nothing to say about one specific cell) — see
`EAP_OPERATIONAL_SOURCE_AUDIT.md`.

## Demo mode (on — the shipped default)

| Bucket | Count | % of 210 |
|---|---:|---:|
| Total EAP objects | 210 | 100% |
| Simulated, generated state (`quality: SIMULATION`) | 171 | 81.4% |
| Simulated, no-data (`quality: NO_DATA`, cell unattached) | 39 | 18.6% |
| Real (any) | 0 | 0% |

171 matches the machine-unit-attached population exactly (`unit_state:
'ATTACHED'`); the remaining 39 are cells with no machine unit to simulate
a state for, correctly reported `NO_DATA` rather than a fabricated state
even in demo mode.

## Reconciliation

Both modes: `210 = 210`, zone sums (`sum(state counts) + NO_DATA + STALE`
across all 12 zones) equal the factory total exactly, in both modes,
re-verified this phase — no cell counted twice, none dropped, in either
mode.

## Toggling between modes

Verified real, not asserted: switching `demoModeOn` from off to on and
back changes every cell's reported bucket immediately and consistently
(210/210 flips from `REAL/UNAVAILABLE` to a `SIMULATED` distribution and
back), with the reconciliation invariant holding at every step.
