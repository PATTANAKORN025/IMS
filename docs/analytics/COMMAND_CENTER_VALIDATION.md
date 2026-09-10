# FT-24 — Executive Command Center Validation Evidence

Every claim below traces to a real test run, a real curl/fetch against a
disposable container with the real production DB mounted, a real
authenticated production Playwright session, or a real query against
production data. No number here is estimated.

## Unit tests (synthetic fixtures)

`node tests/unit/factory-twin-predictive.test.js` — **43 passed, 0
failed** (4 new this phase): `buildNextActionText` (plain OCAP text when
risk is `NONE`, a qualified text when `CAPABLE` + elevated risk, never
qualifies a non-`CAPABLE` state), and `buildExecutiveSummary` carrying the
new `factory`/`process`/`sample_quality`/`next_action`/
`mixed_baseline_detected` fields through (including a defensive test that
older-shape entries missing these fields never throw).

## Two real defects found and fixed during testing (disclosed, not hidden)

### 1. `next_action` visibly contradicted the risk badge

Real production check on LDI-04/JE: `risk: MEDIUM`, `cpk_state: CAPABLE`,
`next_action: "No action needed -- process is within capability."` — a
real, visible contradiction (MEDIUM risk next to "no action needed").
Root cause: `OCAP_NEXT_ACTION` is keyed on Cpk state alone and has no
concept of the risk level FT-22 separately computes from
trajectory/drift/mixed-baseline. Fixed with `buildNextActionText`, which
appends one disclosed qualifier only in this exact case (see
`COMMAND_CENTER_SPEC.md`). Re-verified on the same real LDI-04 finding:

> "No action needed -- process is within capability. Risk is elevated by
> trajectory/drift/mixed-baseline evidence above, not by Cpk itself --
> review that evidence before treating 'no action' as final."

### 2. A real over-fetch: 3 `/api/predictive` requests per Inspect click

Real Playwright request-count instrumentation on the first implementation
found 3 requests firing per Inspect click, not 1 — three independent
triggers (a premature panel-open render with the wrong device, the
existing `selectDeviceForHistory`'s own already-open check, and a
redundant trailing explicit call) all fired for one click. Fixed by
sequencing device/metric assignment before any render, adding a
`renderSpcAfter` opt-out to `selectDeviceForHistory`, and using one
transition-aware branch (`.open` fires a native `toggle` event only on an
actual false→true transition, so the already-open and closed-to-open
cases need different handling). Re-verified: **exactly 1**
`/api/predictive` request per Inspect click, all 4 viewports.

## A real performance regression found, root-caused, and fixed (Phase 8)

The first version of Phase 3's "machine/process" fields added `factory`/
`process` to every row of `runFleetRiskScan`'s main per-sample query.
Real measurement:

| Version | `executive-summary?range=6h` p95 (40-run samples) |
|---|---:|
| Before factory/process added (FT-23 baseline) | 69.1-69.5ms |
| factory/process on every row of the main query | 97.1-118.3ms (one sample: max 125ms) |
| factory/process split into a separate `DISTINCT ON` query, same row limit | still 97-118ms range -- the extra query alone was NOT the dominant cost |
| + `EXECUTIVE_SUMMARY_PER_DEVICE_LIMIT` lowered 500 → 300 | **warm p50 37.2ms, warm p95 50.4ms** (cold first-request: 65.8ms) |

Root cause, confirmed by isolating each change rather than guessing: the
`DISTINCT ON` query itself is cheap in isolation (3-30ms). The real driver
was the combined cost of the main per-sample scan running twice in
parallel (PE+JE) at a 500-row-per-device depth — a real, sustained cost
this deployment's Postgres/TimescaleDB pays under concurrent load, not a
missing index (`idx_ldi_data_eqp_time (eqp_id, time DESC)` already
covers this query shape). Lowering the executive view's own row depth
(never `risk-ranking`'s unchanged 2000) is the same disclosed trade-off
FT-23 already made once at 500 rows — this phase needed to make it again
at 300 once a real second field was added to the same scan. Data quality
at 300 rows/device is still `VALID` (well above the 30-sample confidence
threshold) on every real device checked.

## Real production-data verification (fresh-tab methodology, real DB)

Deployed to production (`docker compose build && up`), then 3 real
authenticated Playwright runs (login on one page, a NEW page in the same
context navigating directly to `/factory-twin-3d/` — the FT-20-established
methodology that avoids Chromium's same-origin heap-contamination
artifact):

| Metric | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| Interactive-ready | 2175ms | 1587ms | 1730ms |
| Exec data ready (Command Center opened to populated) | 537ms | 534ms | 533ms |
| Drilldown (Inspect click to Machine Snapshot link visible) | 845ms | 864ms | 957ms |
| Plant state | Down: 3, Run: 7, Undefined: 13 (real, unchanged all 3 runs) | | |
| Top risk | MEDIUM / LDI-09 (real, unchanged all 3 runs) | | |
| axe violations | 0 | 0 | 0 |
| Console errors | 0 | 0 | 0 |

**Interactive-ready: 1587-2175ms, over the 1.5s target on all 3 runs.**
This is not a regression this phase introduced (the Command Center adds
no boot-time fetch -- its one fetch is lazy, on the dialog's own open
event) and not re-measured differently than FT-20/FT-21's own prior
disclosure of this same tail risk (`UX_PERFORMANCE_BASELINE.md`,
`UX_FINAL_SCORECARD.md`'s FT-21 addendum) -- reported here plainly rather
than omitted because this phase's own gate table asks for it directly.

**Drilldown: 845-957ms, comfortably under the 2s target**, all 3 runs.

## Action continuity, real end-to-end (Phase 5/10)

Scanned every real risk row the Command Center showed in production and
queried `/api/predictive` directly for each:

| Device / metric | Related alarm (real) | `machine_drilldown_eligible` | RCA deep link |
|---|---|---|---|
| LDI-04/JE | `10006` (Major, OPTICS), real `event_time`/`log_id` | `false` | not applicable |
| LDI-08/PE | `01060013` (Major, COMMUNICATION) | `false` | not applicable |
| LDI-10/JE, LDI-10/PE | `10006` (Major, OPTICS) | `false` | not applicable |
| LDI-09/PE (today's #1 risk) | none in this window | n/a | n/a |

**`machine_drilldown_eligible` is `false` for every real alarm in this
deployment right now** -- not a defect, the SAME pre-existing, disclosed
fact this engagement has documented since FT-17.6/FT-19
(`identity_state: "unresolved"`, `physical_asset_id: null`: zero
CONFIRMED CAD-to-IMS asset mappings exist yet). The alarm CORRELATION
itself is real and working (real alarm code/message/severity/time/
duration, real `related_log_id`); the RCA *deep link* specifically needs a
confirmed physical-asset mapping this deployment does not have. "Where
applicable" (this phase's own Phase 5 wording) is the honest answer here:
alarm correlation is applicable and working, RCA deep-linking is not yet
applicable, and no CAD-to-IMS mapping was fabricated to make it appear
otherwise (a standing rule throughout this engagement).

**The achievable full chain was verified real, end to end**: real finding
(LDI-04/JE, MEDIUM risk, Cpk 2.37 CAPABLE, mixed-baseline suspected) →
real evidence (5 lines) → exact real telemetry event (`factory: "2"`,
`mo: "MO-138070"`, real `log_id`) → real Machine Snapshot URL → **confirmed
HTTP 200** on that exact URL in a real authenticated production request →
a real correlated alarm (code `10006`, Major, OPTICS) with an honestly
`null` RCA deep link for the reason above.

## Accessibility (Phase 9)

axe-core 4.9.1, all 4 target viewports (1366x768, 1920x1080, 2560x1440,
3840x2160), disposable container: **1 real violation found and fixed**
(`color-contrast`, `a[target="_blank"]`, 1.86-1.93:1 -- no rule anywhere
in this file had ever set an explicit link colour, so the Machine
Snapshot/RCA anchors rendered in the browser default link blue against
this app's dark theme; fixed with `--accent`, 8+:1, the same token already
verified elsewhere in this file). **0 violations after the fix**, all 4
viewports, disposable container. **0 violations**, 3 real production runs.

## Full regression (zero tolerated)

`mapping` 36/36, `telemetry` 29/29, `alarm` 37/37, `analytics` 25/25,
`wire` 96/96, `spc` 42/42 (unchanged), `predictive` 43/43 (39 FT-22/23 +
4 new), `floor1-geometry-validator`/`floor1-orientation`/
`floor1-cad-reconciliation` all PASSED, unchanged -- confirming this
phase touched no geometry, mapping, or DB schema. `/api/spc` re-confirmed
unchanged (LDI-02/JE/1h: `sample_count 598`, `cpk 6.32`).
