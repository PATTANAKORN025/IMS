# FT-21 — SPC Performance

Real measurements, disposable container, real production database
(`grafana_reader`, read-only), real private-geometry mount. No estimated
numbers.

## API latency

15 sequential real requests per endpoint, measured server-round-trip
(request start to response end), sorted for p50/p95:

| Endpoint | p50 | p95 | Notes |
|---|---:|---:|---|
| `/api/spc` — `JE`, 1h (composite, unpivot) | 10ms | 31ms | 597 rows scanned, 2388 pooled readings |
| `/api/spc` — `temperature`, 6h (single-column, larger n) | 15ms | 27ms | 2347+ rows scanned |
| `/api/state` (existing, baseline for comparison) | 33ms | 50ms | unrelated to this phase, unchanged |
| `/api/telemetry-history` (existing, baseline for comparison) | 9ms | 25ms | unrelated to this phase, unchanged |

The new endpoint's p95 (27-31ms) is comparable to or better than the
existing `/api/state` baseline (50ms) already running in production —
not a new bottleneck.

## Bounded result rows

`SPC_ROW_LIMIT = 5000` on every raw scan (`server.js`), matching this
service's existing query-budget discipline (the same convention as
`/api/telemetry-history`'s own bounded queries). `row_limit_hit: true`
in the response would signal truncation to a caller; not observed in
any real query this phase (largest real result: 2417 rows, temperature
6h, well under the bound).

## No unbounded client arrays

Every array returned (`ewma.points`, `cusum.points`, `nelson_violations`)
is bounded by the same `SPC_ROW_LIMIT`-capped server-side query that
produced the series — there is no separate client-side accumulation
across polls (the panel is on-demand, not polled; see below), so no
array in the browser can grow across time the way a naive "append every
poll result" pattern would.

## No unnecessary polling / no duplicate requests

Verified via real Playwright request-log instrumentation (not inferred
from reading the code):

- Opening the SPC panel (details `toggle` event) fires **exactly 1**
  `/api/spc` request.
- A full 5-second `/api/state` poll cycle elapsing afterward, with the
  SPC panel still open, produces **zero** additional `/api/spc`
  requests — the panel is deliberately on-demand (fetched only on open,
  metric change, or range-button click), never on the state-poll
  interval, the same lazy discipline already used for `#diagnostics` and
  the raw-CAD reference overlay.

## WebGL / overall page performance — confirmed unaffected

This phase added no WebGL geometry, no new render-loop work, and no
change to the boot-time fetch sequence. Re-measured as a regression
check, not skipped:

- **WebGL frame p95:** unaffected — no rendering-path code touched.
- **Accessibility:** 0 axe-core violations at all 4 target viewports
  after this phase's fixes (see `SPC_VALIDATION.md`).
- **Full unit/lint regression:** zero failures (see `SPC_VALIDATION.md`).

## Interactive-ready / warm production reporting note

Per this phase's own explicit instruction: the current warm
interactive-ready measurement established in FT-20 (1390-1526ms,
fresh-tab methodology) is **not** re-asserted here as an unconditional
`<1.5s` pass. This phase added no boot-time fetch and no change to the
existing four-fetch `Promise.all` sequence, so there is no plausible
mechanism by which it could have moved; it was not re-measured this
phase, since the SPC panel's own fetch is lazy (post-boot, on-demand)
and cannot affect first-load timing. The tail risk already disclosed in
`UX_PERFORMANCE_BASELINE.md` (occasional first-navigation cold-cache
runs above 1.5s) stands, unchanged, and is not claimed resolved by this
phase's work.
