# FT-22 — Predictive Process Intelligence Validation Evidence

Every claim below traces to a real test run, a real curl/fetch against a
disposable container with the real production DB mounted, or a real
Playwright browser session. No number here is estimated.

## Unit tests (synthetic fixtures, per this phase's own instruction)

`node tests/unit/factory-twin-predictive.test.js` — **27 passed, 0 failed.**
Covers every item Phase 9 asked for:

| Phase 9 case | Test(s) |
|---|---|
| stable process | capability trajectory "stable" fixture, drift intelligence "flat direction" fixture |
| sustained shift | drift intelligence "sustained upward shift" (direction up, persistence sustained) |
| temporary shift | drift intelligence "temporary shift that reverts is transient" |
| monotonic drift | capability trajectory "declining"/"improving" fixtures, drift intelligence monotonic-ramp fixture |
| change-point | mixed baseline "recipe-change-like split" (change_point_index located via CUSUM) |
| heterogeneous baseline | mixed baseline heterogeneity-detected fixture, "does not suppress Nelson violations" fixture |
| insufficient sample | mixed baseline n<4 fixture, capability trajectory <2-valid-bucket fixture, forecast <3-point fixture |
| stale data | capability trajectory staleness fixture (freshness vs. now) |
| unavailable data | capability trajectory no-tolerance fixture, risk "UNKNOWN Cpk, no escalation" fixture |
| alarm-correlated shift | out of scope for this phase's own lib/predictive.js (no alarm-log join added — see Non-goals below); drift/Nelson evidence already names the exact sample where a shift starts, which is what an operator correlates against RCA manually via the existing alarm panel |

### Two real code defects found and fixed during testing (disclosed, not hidden)

1. **Capability trajectory "meaningful change" used OR, should be AND.**
   A synthetic near-zero-sigma fixture (Cpk in the 20s, essentially flat)
   produced buckets at 20.16/20.30/20.30/20.16/20.30 — a 0.7% relative
   wobble, but the 0.14 absolute difference alone tripped the
   `relative >= 10% OR absolute >= 0.10` gate, misclassifying pure noise as
   "improving". Fixed to require **both** bounds together (see
   `PREDICTIVE_SPEC.md`'s own explanation of why either bound alone fails
   in a different regime).
2. **Two-sample z-test returned `null` for a zero-variance-both-halves
   split.** A synthetic step-function fixture (20 points at 5, then 20 at
   25, each half individually constant) has a z-test denominator of
   exactly 0 — the formula is undefined there, but the fixture is the MOST
   extreme heterogeneity case, not the absence of one. Fixed to saturate at
   a large finite sentinel (±1,000,000 — not `Infinity`, which
   `JSON.stringify` silently turns into `null`, exactly the wrong outcome
   for the strongest possible evidence).

### Two test-fixture bugs found and fixed (the code was already correct)

1. An `INSUFFICIENT_DATA` trajectory test set `nowMs` 5 hours past its own
   single sample, which correctly triggered `STALE` first (freshness is
   checked before bucket-coverage, by design) — not a code bug. Fixed the
   fixture's `nowMs` to sit right after the sample instead.
2. A "temporary shift" CUSUM persistence test used a short 5-point shift
   followed by only 10 points of reversion — too short for the running
   C+/C- (this module never applies FIR/reset-to-zero, by `lib/spc.js`'s
   own documented design) to decay back under `h` before the tail-10
   window, so it correctly still read `sustained`. Not a code bug —
   `lib/spc.js`'s CUSUM behaves exactly as documented. Fixed the fixture to
   use a short shift (3 points) with a long reversion (40 points), which
   empirically decays back to `none` well before the tail window,
   confirmed via a real run before committing the fixture.

## Real production-data verification (disposable container, real DB, real geometry mount)

Built `ims-factory-twin-3d:ft22`, run against the real production database
(`grafana_reader`, read-only) and the real private-geometry bind mount, on
a disposable port — 23 real LDI devices discovered, never touching
production until every gate below passed.

| Check | Result |
|---|---|
| `/api/spc` regression | Identical response shape/values to FT-21 (LDI-02/JE/1h: `sample_count 533`, `cpk 6.378`, `CAPABLE`, `VALID`) — confirms `fetchSpcSeries()`'s extraction changed no existing behavior |
| `/api/predictive`, LDI-02/JE/1h | Real, coherent, fully-populated canonical response: `quality_state VALID`, trajectory `stable` (bucket Cpk 6.34→6.42→6.50→6.25→6.34), drift `up`/`transient`, 6 real Nelson violations named, risk `LOW` with 2 real evidence lines, forecast `MEDIUM` confidence estimate 6.33, top-level `confidence HIGH` |
| `/api/predictive`, LDI-01/PE/6h | Honest `quality_state UNAVAILABLE`, `sample_count 0`, `cpk.reason "no tolerance (pe_setting/je_setting) recorded for this window"` — the same real absent-PE-data fact FT-21 found for this device, not fabricated |
| Invalid metric / range / device | `400`/`400`/`404`, same error shapes as `/api/spc` (shared `validateSpcRequest()`) |
| `/api/predictive/risk-ranking?metric=JE&range=1h` | One query, real: 10 of 23 devices reported JE in this window (honest — not all devices run JE), sorted MEDIUM-then-LOW, each row citing real evidence (e.g. "Capability trajectory: declining across this window", "5 Nelson-rule violation(s)") |

## Real browser verification (Playwright, disposable container, all 4 target viewports)

`scratchpad/ft22_browser_qa.js` — real navigation, real drawer/History/SPC-panel/fleet-risk-panel flow, at 1366x768, 1920x1080, 2560x1440, 3840x2160:

- **Panel flow**: drawer → device list → a device's History → SPC panel
  (renders OBSERVED/CALCULATED/FORECAST, all three present, real content
  from real production) → metric switch → keyboard-driven range switch
  (`.focus()` + real `Enter` keypress, not a mouse click) → fleet-risk
  panel drill-down. 0 console/page errors at every viewport.
- **Request discipline (Phase 8)**, instrumented via real
  `page.on('request', ...)`, not inferred from code:
  - Opening `#spc-panel` fires **exactly 1** `/api/predictive` request, 0
    risk-ranking requests.
  - Opening `#fleet-risk-panel` fires **exactly 1**
    `/api/predictive/risk-ranking` request, 0 additional `/api/predictive`.
  - A full 5.5-second `/api/state` poll cycle with both panels open
    produces **zero** additional requests of either kind — confirmed, not
    assumed.
  - A metric change with the fleet panel open fires exactly 1 more of
    each (both are metric-scoped, both should refresh — verified this is
    the intended, not accidental, behavior).
  - A range change fires exactly 1 more of each again. Running totals
    (1→1→2→3 for predictive, 0→1→2→3 for risk-ranking) matched the
    predicted count exactly at every viewport.
- **Accessibility (axe-core 4.9.1): 0 violations at all 4 viewports**,
  after finding and fixing one real defect this phase's own testing
  surfaced: `.pi-label` used `--text-faint` (#5f7387), measured at
  3.58–3.90:1 contrast against this panel's real background colours — a
  `color-contrast` (serious) violation, below the 4.5:1 AA minimum for
  10.5px text (not large-text-exempt). Fixed by switching to `--text-dim`
  (#8ba0b8, 6.5–7.1:1 against the same backgrounds — computed, not
  guessed), the same token already used successfully elsewhere in this
  file. Re-scan: 0 violations, all 4 viewports.

## Full regression (zero tolerated)

`mapping` 36/36, `telemetry` 29/29, `alarm` 37/37, `analytics` 25/25,
`wire` 96/96, `spc` 42/42 (unchanged), `predictive` 27/27 (new),
`floor1-geometry-validator`/`floor1-orientation`/`floor1-cad-reconciliation`
all PASSED, unchanged — confirming this phase touched no geometry, mapping,
or DB schema.

## Non-goals, disclosed rather than silently skipped

- **Alarm/RCA correlation** (Phase 6's "→ alarm/RCA where applicable"):
  `source_event` names the device/metric/table/rows/last-sample-time, which
  is enough for an operator to manually cross-reference the existing
  alarm/RCA panel by device and time window. This phase did not add a
  server-side join against `ldi_alarm_log` inside `/api/predictive` itself
  — that would be new query surface against a table this module does not
  otherwise touch, and the existing alarm panel already answers "what
  alarms fired for this device/time" without duplicating that lookup here.
- **Fleet risk ranking is composite-metric-only (PE/JE)**: the only metrics
  with a real tolerance column, so the only ones a Cpk-based risk verdict
  means anything for. A non-composite metric (temperature, etc.) always has
  `cpk.quality UNAVAILABLE`, and `RiskLevel` for that would collapse to
  drift/Nelson evidence alone — disclosed as out of scope for the fleet
  ranking's own "which machine is least capable" question, not silently
  omitted.
