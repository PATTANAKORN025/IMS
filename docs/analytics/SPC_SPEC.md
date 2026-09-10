# FT-21 — SPC / Process Stability Engine (Factory Twin)

`services/factory-twin-3d/lib/spc.js`, `GET /api/spc`, and a compact panel
inside the existing Factory Twin device-history drawer section. Scoped to
Factory Twin only, per this engagement's standing rule — Grafana/Andon
untouched.

## Why this is not a 6th competing Cpk formula

`docs/architecture/LDI_SPC_GUIDE.md` already documents Cpk, independently
reimplemented in 5 places (3 dashboard panels, 2 DB views) with a real,
disclosed drift risk. This module reproduces the SAME documented formula
— pooled mean/`STDDEV_SAMP` over every unpivoted PE/JE reading, tolerance
averaged over the window, `LEAST()` of the two-sided capability — verified
byte-for-byte in `tests/unit/factory-twin-spc.test.js` against the exact
fixture `tests/e2e/golden-dataset-spc.js` already uses. This is a 6th
instance of an already-5-times-duplicated formula (unavoidable — a
Grafana panel query cannot import a Node.js module), not a 6th different
one. The genuinely new capability is EWMA, CUSUM, Nelson-rule evaluation,
and drift velocity — none of which exist anywhere else in this codebase.

## Data source and scope boundary

SPC needs the true individual-sample sequence, never an AVG-of-AVG CAGG
bucket — the same "raw `ldi_data` only" rule `lib/analytics.js`'s
`extendedStatsAvailable()` already enforces for min/max/median/p95/stddev,
reused verbatim rather than a second boundary. Consequently:

- **Supported ranges: 15m, 1h, 6h only.** A request for 24h/7d/30d is
  rejected (400) with an explicit reason, not silently downgraded to an
  averaged tier that would misrepresent aggregated data as individual
  process observations.
- **Row bound:** `SPC_ROW_LIMIT = 5000` on the raw scan, matching this
  service's existing query-budget discipline.

## Metrics

- **Composite (`PE`, `JE`):** unpivots `pe_1..pe_6` / `je_1..je_4` per
  row (the same `LATERAL VALUES` technique Machine Snapshot panel 9
  already uses), pools every individual reading for Cpk, and uses each
  row's own mean-of-its-readings as one point on the time series for
  EWMA/CUSUM/Nelson/drift — the classical X-bar subgrouping convention
  (each panel/board event is one subgroup), not an arbitrary shortcut.
  Tolerance = `AVG(pe_setting)` / `AVG(je_setting)` over the window,
  matching the existing panels exactly.
- **Any other `AVG_METRICS` column** (temperature, humidity, etc.): each
  row's own value is the series point directly. **Cpk is UNAVAILABLE**
  for these — this schema has no spec-limit/tolerance column for them,
  and no invented one is substituted.

## Baseline definition — Phase I, not Phase II

Every statistic (Cpk, EWMA target/sigma, CUSUM target/sigma, Nelson-rule
mu/sigma) is computed from the SAME window being analyzed — a real,
standard SPC technique ("Phase I capability analysis"), not a comparison
against a separate, fixed historical baseline ("Phase II monitoring").
This is disclosed explicitly (`baseline_definition` field in every API
response) rather than implied to be something it is not. Practical
consequence, observed and verified this phase: a longer window that
spans a real recipe/product change can legitimately trigger MORE
simultaneous Nelson-rule violations than a shorter, more homogeneous
window over the same device — confirmed real, not a bug (see
`SPC_VALIDATION.md`).

## Sample sufficiency

`MIN_SAMPLES_FOR_CONFIDENT_CPK = 30` — not invented for this module,
copied from Machine Snapshot panel 9's own `Confidence` column
(`CASE WHEN ... n<30 THEN 'LOW SAMPLE (n<30)' ELSE 'OK' END`). Below 30
pooled samples, Cpk quality is `INSUFFICIENT_DATA` (the analytics.js
`Quality` enum, reused rather than a new one) with a real, specific
reason string (`only N of 30 minimum samples in this window`) — the
number itself is still returned, never suppressed; the caller decides
whether to show a low-confidence figure, the same convention
`lib/analytics.js`'s `projectTrendPoint` already uses.

## Stability vocabulary — the plant's own OCAP stages, not a new one

`StabilityState`: `CAPABLE` (Cpk ≥ 1.33), `ASSESSMENT` (1.0 ≤ Cpk < 1.33,
OCAP Stage 1), `INTERVENTION` (Cpk < 1.0, OCAP Stage 2), `UNKNOWN` (Cpk
could not be computed). These are `docs/architecture/LDI_SPC_GUIDE.md`'s
own OCAP stage names and thresholds — not a generic Normal/Warning/
Critical traffic light invented for this phase. The panel's own "next
action" text is the guide's own Stage 1/Stage 2 language verbatim.

## UI — five real questions, no new visual vocabulary

The panel (inside the existing device-history drawer section, same
`.btn-mini`/`.history-ranges`/`aria-live` conventions FT-17 already
established) answers, per this phase's own requirement:

1. **Is the process stable?** — Cpk state (CAPABLE/ASSESSMENT/
   INTERVENTION/UNKNOWN) plus a real Nelson-rule violation list.
2. **How far from baseline?** — the Cpk number itself, plus EWMA/CUSUM
   detail in the raw API response for a future deeper chart.
3. **Is drift increasing?** — `drift.accelerating`, a real computed
   boolean (front-half vs. back-half linear-regression slope
   comparison), never asserted from the whole-window slope alone.
4. **Which machine/metric?** — stated directly in the summary line.
5. **What should the operator inspect next?** — the OCAP stage's own
   real next-action text.

Lazy: fetched only while the panel is open (same discipline as the
existing Diagnostics/Raw CAD reference sections), never on the 5-second
state-poll interval — verified via request-count instrumentation (see
`SPC_PERFORMANCE.md`).

## Files

- `services/factory-twin-3d/lib/spc.js` — pure, no I/O, mirrors
  `lib/mapping.js`/`lib/telemetry.js`/`lib/analytics.js`'s own discipline.
- `services/factory-twin-3d/server.js` — `GET /api/spc`.
- `services/factory-twin-3d/public/index.html` / `app.js` — the drawer
  panel.
- `tests/unit/factory-twin-spc.test.js` — 42 tests, including exact
  cross-verification against `tests/e2e/golden-dataset-spc.js`'s fixture.
