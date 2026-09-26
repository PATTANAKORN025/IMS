# FT-24 — Executive Command Center Performance

Real measurements only. Methodology matches every prior phase's own:
disposable container with the real production DB/geometry mount for
isolated API measurement, real authenticated fresh-tab Playwright sessions
for the full user journey on production.

## API latency

| Endpoint | Warm p50 | Warm p95 | Notes |
|---|---:|---:|---|
| `/api/predictive/executive-summary?range=6h` | 37.2ms | 50.4ms | after fixing a real regression -- see `COMMAND_CENTER_VALIDATION.md` |
| `/api/predictive/executive-summary?range=1h` | ~30ms | ~45ms | |
| `/api/predictive?device_id=X&metric=Y&range=1h` | ~19ms | ~27ms | unchanged from FT-23 |
| `/api/predictive/risk-ranking` | unchanged from FT-23 | unchanged from FT-23 | its own 2000-row-per-device depth untouched |
| `/api/spc` | unchanged | unchanged | regression-confirmed identical |

All under the 100ms target on a warm connection. A cold first-request
outlier (65.8ms, still under target) is a known, previously-disclosed
JIT/connection-pool warm-up cost (FT-22/23), not new to this phase.

## Payload sizes (measured, not estimated)

| Endpoint | Real response size |
|---|---:|
| `/api/predictive/executive-summary?range=6h` | 3.6 KB |
| `/api/predictive/risk-ranking?metric=JE&range=1h` | 7.1 KB |
| `/api/predictive?device_id=LDI-04&metric=JE&range=6h` | 400 KB |

The Command Center's own fetch (`executive-summary`) is small by design --
exactly the "decision compression" the objective asked for. The 400KB
single-device `/api/predictive` payload (mostly `ewma_points`/
`cusum_points`, one entry per sample -- up to ~2400 samples at 6h) is
**pre-existing from FT-22, unchanged by this phase**. It was measured, not
ignored: the real drilldown journey that fetches it still completed in
845-957ms in production (under the 2s target), so no optimization is
applied here without a proven gap -- consistent with this phase's own "do
not optimize without evidence" instruction. If a future phase needs a
faster drilldown, trimming `ewma_points`/`cusum_points` to only the
out-of-control/signaling subset (rather than every sample) would be the
evidence-backed next step; not done here because nothing measured demands
it yet.

## Complete user journey (Phase 8), real authenticated production, 3 fresh-tab runs

```
page load -> executive data ready -> interactive-ready -> click Inspect -> Machine Snapshot link visible
```

| Step | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| Interactive-ready (`window.__twin !== undefined`) | 2175ms | 1587ms | 1730ms |
| Command Center opened -> populated (executive data ready) | 537ms | 534ms | 533ms |
| Inspect click -> Machine Snapshot link visible (drilldown) | 845ms | 864ms | 957ms |

**Interactive-ready: 1587-2175ms — over the 1.5s target on all 3 runs,
honestly reported.** Not a regression introduced by this phase (the
Command Center's button/dialog are static markup with zero boot-time
fetch; its one fetch is lazy, only on the dialog's own open event) and
consistent with the SAME tail risk FT-20/FT-21 already measured and
disclosed for this service's existing boot sequence
(`UX_PERFORMANCE_BASELINE.md`). This phase did not attempt to fix it --
doing so would mean touching the existing four-fetch boot `Promise.all`
or the WebGL/geometry load path, neither of which this phase's own scope
covers, and "do not optimize without evidence" cuts against a speculative
fix for a pre-existing, already-disclosed number.

**Drilldown: 845-957ms, comfortably under the 2s target**, all 3 runs.

## Network / API fan-out

Real Playwright request-count instrumentation, disposable container, all
4 viewports:

- Boot sequence: unchanged from FT-17-23 (the existing 4-fetch
  `Promise.all`; Command Center adds nothing to it).
- Opening Command Center: **exactly 1** `/api/predictive/executive-summary`
  request.
- Changing its range buttons: **exactly 1** more per change.
- Clicking Inspect: **exactly 1** `/api/predictive` request (fixed from an
  initial, real 3-request bug -- see `COMMAND_CENTER_VALIDATION.md`), plus
  the pre-existing, unchanged `/api/telemetry-history`/`/api/alarm-rca`
  pair the device-history section has always fired since FT-17.
- No polling anywhere in the Command Center: it is entirely
  open/click-triggered, never on the 5-second `/api/state` interval.

## Memory

Real production, fresh-tab methodology (the FT-20-established discipline
that avoids Chromium's same-origin heap-contamination artifact): 14.5-19.6
MB across 3 runs -- consistent with FT-20's own "memory regression: NOT
REPRODUCED" finding and FT-21/22/23's own subsequent readings. No new
soak test run this phase (the Command Center's own state -- one dialog,
one small fetch result -- cannot accumulate across polls the way a
render-loop leak would; this was confirmed via the same request-count
instrumentation above, not asserted).

## Rendering / WebGL / long tasks

Unaffected: this phase added no WebGL geometry, no new render-loop work,
and the Command Center dialog renders as ordinary DOM (no canvas
interaction). Not re-measured as a regression check because there is no
plausible mechanism by which a `<dialog>` and two fetches could move
WebGL frame timing.
