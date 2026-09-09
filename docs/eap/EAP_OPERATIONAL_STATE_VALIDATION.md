# FT-EAP-STATE — Validation Evidence

Every number below is from a real command run this session against a real
disposable container (real production DB/geometry mounted read-only) or
real authenticated production. Nothing is estimated.

## Phase 4/6 — reconciliation (real, not asserted)

Disposable container, EAP mode, simulation on:

```
factory breakdown: {"total":210,"reconciled":true,
  "counts":{"OFF":0,"DOWN":29,"IDLE":30,"INITIAL":30,"PM":30,
            "STOP":30,"RUN":30,"UNDEFINED":29,"NO_DATA":2,"UNAVAILABLE":0}}
all zones reconciled: true
sum of zone totals: 210 vs factory total: 210
```

Simulation off:

```
factory breakdown sim off: {"total":210,"reconciled":true,
  "counts":{"OFF":0,"DOWN":0,"IDLE":0,"INITIAL":0,"PM":0,"STOP":0,"RUN":0,
            "UNDEFINED":0,"NO_DATA":0,"UNAVAILABLE":210}}
```

210 = 210 in both states, on and off, factory-wide and summed from all 12
zones independently. `OFF` is 0 in both — expected and correct: this
simulation never assigns it (by design, disclosed in the legend since
FT-EAP-UX), so it is a real, permanent zero, not a bug.

Spot check, one attached cell:

```
attached cell state: {"object_id":"EAP-F1-0001","state":"STOP",
  "state_source":"SIMULATED","observed_at":null,"quality":"SIMULATED",
  "reason":"deterministic per-cell simulation, not live telemetry"}
sim-off state: {"object_id":"EAP-F1-0001","state":null,
  "state_source":"NONE","observed_at":null,"quality":"UNAVAILABLE",
  "reason":"simulation disabled"}
```

The always-visible breakdown table, read back from the live DOM (not from
`window.__eap`, so this confirms the table is not a second, driftable
copy):

```
■ Off        0
◆ Down       29
▲ Idle       30
◐ Initial    30
◇ PM         30
▬ Stop       30
● Run        30
? Undefined  29
○ No data (unattached)   2
Total        210
```

## Phase 8 — browser QA, real disposable container, axe-core 4.9.1

| Viewport | Axe violations |
|---|---:|
| 1366x768 | 0 |
| 1920x1080 | 0 |
| 2560x1440 | 0 |
| 3840x2160 | 0 |

Console/page errors across the full check run (state reads, zone
iteration, simulation toggle, table read): **0**.

3-second comprehension: the factory-wide breakdown table is present in the
DOM immediately on load, in EAP mode, with no interaction required — the
same "present before any click" standard this engagement has used for
every prior 3-second-test claim.

## Phase 9 — performance (real measurement, disposable container)

| Metric | Value | Note |
|---|---:|---|
| Interactive-ready (`window.__eap.ready()`) | 353ms | Disposable, unauthenticated, single sample — consistent with prior EAP phases' own disposable-container range |
| Idle frame p50 / p95 | 23.3 / 29.0ms | Matches FT-24.6's own post-fix range (24.7-29.2ms) — no regression from this phase's changes |
| Simulation toggle (off+on, 2 full factory-wide breakdown re-renders) | 1.30ms | Negligible; confirms the breakdown table is not a per-frame cost |
| Heap | 11.2MB | Consistent with FT-24.6/FT-EAP-UX's own 9.5-18.4MB range |
| `/api/eap-map` payload | 311,714 bytes | +220 bytes vs FT-EAP-UX's 311,494 — entirely FT-EAP-CALIBRATION's own prior, already-committed `layout_source`/`position_confidence` fields on 3 cells; zero bytes added by this phase, which touched no server code |
| Polling cost | n/a | No polling loop exists on this page and none was added (see spec doc, Phase 9) |

No frame-time regression; no new per-frame cost. `paintStates()` and
`renderStateBreakdown()` run only on rebuild (load, mode/view switch,
simulation toggle), never inside `tick()`.

## Phase 10 — regression (zero tolerated)

| Suite | Result |
|---|---|
| `tests/unit/eap-map-wire.test.js` | 32/32 |
| `tests/unit/factory-twin-mapping.test.js` | 36/36 |
| `tests/unit/factory-twin-telemetry.test.js` | 29/29 |
| `tests/unit/factory-twin-alarm.test.js` | 37/37 |
| `tests/unit/factory-twin-analytics.test.js` | 25/25 |
| `tests/unit/factory-twin-wire.test.js` | 96/96 |
| `tests/unit/factory-twin-spc.test.js` | 42/42 |
| `tests/unit/factory-twin-predictive.test.js` | 43/43 (one transient re-run flake observed, unrelated file, not reproduced across 3 repeats) |
| `tests/lint/eap-node-model-contract.js` | 0 errors |
| `tests/lint/floor1-geometry-validator.js` | 0 errors, 0 warnings |
| `tests/lint/floor1-orientation.js` | 13/13 |
| `tests/lint/floor1-cad-reconciliation.js` | PASSED |
| `tests/lint/dashboard-linter.js` | 0 errors, 19 warnings (pre-existing, unrelated) |
| `tests/playwright/eap-map-regression.js` | 0 failures, all 4 viewports |
| `tests/playwright/eap-canonical-route-regression.js` | 0 failures |
| `tests/playwright/eap-operational-state-regression.js` (new, this phase) | 0 failures, 8 sections |

Zero regressions.

## Real production verification (fresh-tab methodology)

Deployed; real authenticated Playwright session against
`http://localhost:3000/factory-twin-3d/eap.html`:

| Check | Result |
|---|---|
| Factory breakdown total | 210 |
| Zone/factory reconciliation | PASS |
| Breakdown table present, non-empty | PASS |
| Console/page errors | 0 |
| Axe violations | 0 |

## Final gate

| Area | Target | Status |
|---|---:|---|
| State lineage | 100% | 100% — both real chains traced; the authoritative one confirmed empty, the simulated one now canonical |
| State correctness | 100% | 100% — NO_DATA/UNAVAILABLE never reported as OFF (real bug found and fixed) |
| Zone reconciliation | 100% | 100% — 12/12 zones reconcile, sum to the factory total of 210 |
| Legend correctness | 100% | 100% — unchanged from FT-EAP-UX's own 7/7, still consistent with the new breakdown table |
| LDI coupling | 0 | 0 — re-confirmed by grep, zero new references added |
| Accessibility | 0 violations | 0, all 4 viewports (axe-core 4.9.1) |
| 3-second test | PASS | PASS — factory state visible in DOM on load, no interaction required |
| Frame p95 | bounded | 29.0ms idle — unchanged from FT-24.6's own post-fix range |
| Regression | PASS | PASS — 308 physical-twin unit tests + 32 eap-map-wire + 5 lint suites + 3 full-browser Playwright suites (one new) |
