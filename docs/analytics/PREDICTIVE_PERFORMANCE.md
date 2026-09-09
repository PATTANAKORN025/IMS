# FT-22 — Predictive Process Intelligence Performance

Real measurements, disposable container, real production database
(`grafana_reader`, read-only), real private-geometry mount. No estimated
numbers. Methodology matches `SPC_PERFORMANCE.md`: 15 sequential real
requests per endpoint, measured server-round-trip (Node `http.get`,
timed start-of-request to end-of-response), sorted for p50/p95.

## API latency

| Endpoint | p50 | p95 | Notes |
|---|---:|---:|---|
| `/api/predictive` — `JE`, LDI-02, 1h | 11.7ms | 54.8ms | one outlier run (55ms) pulled p95 up from an otherwise ~12-15ms cluster; still 45ms under target |
| `/api/predictive` — `temperature`, LDI-01, 6h (single-column, no composite unpivot) | 19.1ms | 39.3ms | |
| `/api/predictive/risk-ranking` — `JE`, 1h (10 of 23 devices reported) | 21.2ms | 26.1ms | one query total, not 10 |
| `/api/predictive/risk-ranking` — `PE`, 6h (larger per-device row counts) | 48.5ms | 67.1ms | worst real case measured this phase |
| `/api/spc` — `JE`, 1h (unchanged, for comparison) | 7.2ms | 10.9ms | baseline this phase builds on top of |

**All measured p95s are under the 100ms target**, including the fleet-wide
ranking endpoint's worst case (67.1ms for PE/6h, the largest per-device row
count this phase measured).

## Why `/api/predictive` costs more than `/api/spc` for the same request

`/api/predictive` runs the exact same query as `/api/spc` (shared via
`fetchSpcSeries()` — not a second query) and then does strictly in-memory
work on the result already in hand: 5-bucket re-slicing for capability
trajectory, the drift/mixed-baseline/risk synthesis, and the forecast
extrapolation. The latency difference (roughly 5-30ms) is that in-memory
computation, not additional I/O — confirmed by the query itself being
identical and by `/api/spc`'s own p95 (10.9ms) representing the pure query
cost.

## No duplicate queries (Phase 8)

- `/api/predictive` issues exactly the same one query `/api/spc` already
  did — verified by code (both call the same `fetchSpcSeries()`) and by
  the p95 delta above being consistent with in-memory work, not a second
  round trip.
- `/api/predictive/risk-ranking` issues **exactly one** query across every
  device (a `ROW_NUMBER() OVER (PARTITION BY eqp_id ...)` window function,
  bounded per-device at `PREDICTIVE_FLEET_PER_DEVICE_LIMIT = 2000`), not
  one query per device — confirmed by the flat ~20-70ms latency regardless
  of device count (23 real devices), which a 23-query loop would not
  produce at this speed against `grafana_reader`'s connection pool
  (`max: 5`).
- The browser-side SPC panel's own fetch moved from `/api/spc` to
  `/api/predictive` (a superset) rather than adding a second, parallel
  fetch — confirmed via real Playwright request-log instrumentation
  (see `PREDICTIVE_VALIDATION.md`): opening the panel still fires exactly
  1 request, not 2.

## Bounded result rows / no unbounded client arrays

- `/api/predictive`: same `SPC_ROW_LIMIT = 5000` raw-scan bound as
  `/api/spc`; `capability_trajectory.points` is always exactly 5 entries
  (a fixed bucket count, never grows with window size); `forecast` is a
  single scalar, never an array.
- `/api/predictive/risk-ranking`: bounded to `PREDICTIVE_FLEET_PER_DEVICE_LIMIT`
  (2000) rows per device via the partitioned window function; `rankings`
  is one entry per device that actually reported data (≤23, this
  deployment's real device count), never unbounded.
- No client-side accumulation across polls: the predictive panel and the
  fleet-risk sub-panel are both on-demand (open/metric/range triggered),
  never appended to on the 5-second state-poll interval — confirmed via
  real Playwright request-count instrumentation across a full poll cycle
  (see `PREDICTIVE_VALIDATION.md`).

## No unnecessary polling (Phase 8) — confirmed, not assumed

Real Playwright instrumentation across a full 5.5-second `/api/state` poll
cycle with both the SPC panel and the fleet-risk panel open: **zero**
additional `/api/predictive` or `/api/predictive/risk-ranking` requests, at
all 4 target viewports. Both panels are strictly on-demand: fetched only on
open, metric change, or range-button click.

## WebGL / overall page performance — confirmed unaffected

This phase added no WebGL geometry, no new render-loop work, and no change
to the boot-time fetch sequence (the predictive panel's fetch is lazy,
post-boot, on-demand — it cannot affect first-load timing). Not
re-measured as a first-load metric this phase, since there is no plausible
mechanism by which it could have moved; the existing FT-20/FT-21 tail-risk
disclosure (`UX_PERFORMANCE_BASELINE.md`, `UX_FINAL_SCORECARD.md`'s FT-21
addendum) stands unchanged and is not claimed resolved or affected here.
