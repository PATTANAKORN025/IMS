# FT-24.5 — Interactive-Ready Root-Cause Analysis

Real Playwright traces, real production DB/geometry, real authenticated
sessions. No synthetic/estimated numbers. This document supersedes the
"1587-2175ms, over target" reading FT-24 reported honestly at the time --
that number was real, but its root cause was not yet investigated. It now
has been.

## The headline finding: the "over target" reading was a real, reproducible test-methodology artifact, not a real production defect

Every prior phase's browser-based interactive-ready measurement (FT-22,
FT-23, FT-24) used `page.goto(url, { waitUntil: 'networkidle' })` before
polling for `window.__twin`. Playwright's `networkidle` condition waits
for **zero network connections for 500ms**. This service's boot sequence
ends with `pollState()` (the initial `/api/state` fetch); the very next
network activity is the NEXT poll, 5000ms later (`POLL_MS`). So
`networkidle` cannot resolve until (last-boot-fetch-completion + 500ms) --
a fixed, unavoidable 500ms tax that has nothing to do with when the app
actually becomes interactive.

**Controlled proof** (Phase 1, real production, fresh-tab, 5 runs per
condition, same code, same session):

| `waitUntil` condition | External total (interactive-ready as measured) | Internal `window.__twinBootMs` |
|---|---:|---:|
| `load` | 1052-1272ms | 948-1153ms |
| `domcontentloaded` | 960-1307ms | 860-1183ms |
| `networkidle` | 1426-1618ms | 809-1050ms |

The internal timer (`window.__twinBootMs`, the app's own `t1 - t0` around
its real async work) is **statistically indistinguishable across all three
conditions** (~810-1210ms range in every column) -- proving the app itself
does the same amount of work regardless of which `waitUntil` a test
script chooses. The external "total" number moves by almost exactly 500ms
between `load`/`domcontentloaded` and `networkidle` -- the fixed quiet-window
tax, confirmed by that math holding precisely across all 15 runs used to
build this table (`networkidle`'s `goto()` call alone consistently
absorbed ~1.4-1.6s -- see the raw trace below).

Raw evidence for one representative `networkidle` run (`goto()` returned
after 1546ms; `waitForFunction` then resolved in **14ms**, because
`window.__twin` had already been true for hundreds of milliseconds before
`goto()`'s own artificial wait finished):

```
run1 [waitUntil=networkidle]: goto=1546ms, goto->twinDefined=14ms, TOTAL=1560ms, internal twinBootMs=994
```

**A real human user never waits for "networkidle."** That is a browser-
automation concept with no user-facing meaning here; a real visitor
perceives the app as ready the moment `window.__twin` exists and the
canvas responds to input -- exactly the internal signal `twinBootMs`
already measures, and exactly what `load`/`domcontentloaded` +
`waitForFunction` correctly captures without the extra tax.

**This does not retroactively "fix" every past report** -- it explains,
with controlled evidence, why FT-22/23/24's own real, honestly-reported
1587-2175ms readings were as high as they were, and shows the true
user-perceived interactive-ready cost has been consistently ~850-1300ms
across all three conditions and both code variants tested this phase (see
below). FT-18's own original baseline (1287-1427ms, no stated
`networkidle` use) was, in hindsight, the methodologically correct one;
the `networkidle` habit was introduced in later phases' own convenience
scripts and is retired as of this phase.

## Phase 2 — critical path decomposition

| Task | Classification | Real measured cost |
|---|---|---:|
| Script fetch (`app.js`, `three.module.js`, `three.core.js`, `OrbitControls.js`, `operational-status.js`) | CRITICAL | ~50-100ms (cached after first load; `three.core.js` is the largest single asset, ~1.4MB uncompressed, 7-94ms observed) |
| `api/floors` (floor catalogue) | **was CRITICAL, now DEFERRED** in the common case -- see Phase 3 | 11-28ms round trip, previously fully serial before the 4 parallel fetches could even start |
| `api/floor-geometry` (real CAD floor, 433 equipment) | CRITICAL | 86-284ms, the largest of the 4 parallel fetches |
| `api/physical-overlay` | CRITICAL (blocks `Promise.all`, but small) | 67-261ms |
| `api/alarm-rca` | CRITICAL (blocks `Promise.all`, but small) | 157-314ms |
| `api/build` | CRITICAL (blocks `Promise.all`, but tiny) | 11-282ms |
| `api/state` (first poll) | CRITICAL -- `window.__twin` is not set until this resolves | 65-75ms |
| Floor-picker DOM population (`setUpFloorSelector`'s non-fetch half) | OPTIONAL/DEFERRED -- hidden entirely with <2 floors (this deployment's real state) | negligible once decoupled from the network wait |
| WebGL renderer/scene construction (`buildFloor`, materials, labels) | CRITICAL, but already inside the measured `api/floor-geometry` await chain, not a separate gate | included in the 86-284ms figure above, not additive |

No task was found to be silently CRITICAL that should have been
DEFERRED/OPTIONAL, except the one identified in Phase 3.

## Phase 3 — network: the one real sequential dependency, found and removed

`setUpFloorSelector()` was `await`-ed **before** `geometryUrl` could be
computed, because `geometryUrl` embedded `floorId`. This put `api/floors`'s
own real round trip (11-28ms typical, observed up to ~250ms combined with
render-thread contention in some Phase 1 traces) entirely **before** the 4
parallel fetches could start at all -- a genuine, provable sequential
dependency, not assumed.

**Provably safe to remove in the common case**: `server.js`'s own
`requestedFloor(req, list)` resolves a request with **no** `?floor=` query
parameter to `floors.defaultFloor(list)` -- the exact same value
`setUpFloorSelector()`'s client-side fallback (`body.default`) would also
produce. So the bare endpoint (`api/floor-geometry`, no query string) and
the fully-resolved explicit one (`api/floor-geometry?floor=<default>`) are
**byte-identical requests to the server** whenever the visitor did not
explicitly ask for a floor. A bookmarked/explicit `?floor=X` link (the one
case where an untrusted string must still be validated against the real
catalogue before it reaches a fetch URL) keeps the original, unchanged,
sequential, safe path.

**Fix**: `boot()` now checks whether the page's own URL carries a `floor`
query parameter. If not (the overwhelmingly common case -- direct
navigation, no bookmark), it uses the bare endpoints immediately and lets
`setUpFloorSelector()` run **concurrently** with the 4 fetches (its result
is still awaited before boot completes, so the floor-picker UI is never
left half-built). If a `floor` parameter IS present, the original
sequential, catalogue-validated behavior is unchanged.

## Phase 4 — JavaScript

No long tasks, no large synchronous loops, and no unnecessary startup work
were found beyond the network-sequencing issue above. Script parse/execute
time (from Resource Timing, `initiatorType: 'script'`) is 7-94ms total
across all 5 boot scripts combined, real production, cache-primed --not a
contributor worth chasing. JSON parsing of the ~735KB real floor-geometry
payload was not separately instrumented (it is included inside the
already-measured fetch `duration`); no evidence surfaced that it, rather
than the network transfer itself, dominates that fetch's cost.

## Phase 5 — WebGL

Renderer/scene construction happens synchronously inside the awaited
`api/floor-geometry` fetch handler (`buildFloor`), so it is already
counted inside that fetch's own measured duration, not a separate,
hidden gate on `window.__twin`. **Steady-state WebGL frame p95 (idle
orbit, 2-second-settled sampling -- FT-18's own established methodology,
not the first frames right at boot which include a real, pre-existing,
viewport-dependent GPU/shader warm-up spike unrelated to this phase's own
fix): 17.7-17.9ms, all 4 viewports, both before and after this phase's
change** -- confirming the fix touched none of the render path. (The
warm-up spike itself -- 37-55ms in the first 60 frames at 1366x768 and
3840x2160 specifically -- is real, pre-existing, present in both the
before and after variant equally, and out of this phase's own scope; not
"fixed" here, since Phase 8's own instruction is to fix only the measured
bottleneck this phase set out to find, which was interactive-ready, not
steady-state frame cost.) No staged initialization (Phase 5's own
suggested UI-interactive -> essential scene -> secondary geometry
approach) was needed: WebGL was never the bottleneck.

## Phase 6 — controlled A/B (disposable environment, real production DB/geometry, identical everything else)

`git worktree` checkout of commit `280a00d1` (A, before) built as its own
disposable image; current code (B, after) built as another; both run
against the SAME real production database and the SAME real
private-geometry mount, on separate ports, 8 real runs each,
`waitUntil: 'load'` (the corrected methodology):

| Variant | Total: min / median / max | `twinBootMs`: min / median / max |
|---|---:|---:|
| A (before) | 1106 / 1154 / 1425ms | 1007 / 1047 / 1295ms |
| B (after) | 1014 / 1087 / 1139ms | 911 / 965 / 1006ms |

**A real, modest, reproducible improvement**: median ~67ms faster, and the
**tail improved more than the median** (max 1425ms -> 1139ms, a ~286ms
reduction) -- consistent with removing one full sequential network round
trip, whose latency variance had been landing directly in the tail. Real
production, corrected methodology, 5 fresh-tab runs after deploying B:
**total 1123-1380ms, `twinBootMs` 983-1210ms** -- comfortably under the
1500ms target on every run, not just on average.

## Phase 7 — target

| Milestone | Measured (after fix, real production) | Target | Status |
|---|---:|---:|---|
| T1 first content (`first-contentful-paint`) | 36-64ms | <500ms | PASS |
| T3 interactive-ready (`window.__twin`, corrected methodology) | 1123-1380ms (5 fresh-tab runs) | <1500ms | **PASS**, all 5 runs, not just the median |
| T4 fully loaded (`loadEventEnd`) | 112-286ms (fires before boot's own async work completes, since it does not wait on `fetch`) | <3000ms | PASS |

<1500ms was reached without sacrificing correctness (floor/equipment
counts unchanged, 433 equipment / 431 rendered instances, identical before
and after) or UX (no content removed -- see Phase 8).

## Phase 8 — remediation summary

One change: `services/factory-twin-3d/public/app.js`'s `boot()` skips
waiting for `api/floors` before starting the 4 parallel fetches, ONLY when
no `?floor=` query parameter is present (the common case); the explicit-
floor path is byte-for-byte unchanged. No content removed, no geometry or
mapping touched, no DB schema touched. Full verification performed --
syntax check, full unit/lint regression (unaffected, this is a pure
client-side change), 4-viewport browser QA (0 axe violations, 0 console
errors, correct floor/geometry counts), production-like A/B (8 runs/
variant), before/after timing (above), memory check (14.5MB, consistent
with FT-20-23's own prior readings), WebGL p95 check (17.7-17.9ms,
unaffected).

## Phase 9 — production verification

Deployed; real authenticated fresh-tab verification, corrected
methodology, 5 runs: **1123-1380ms total, 0 console errors, 0 axe
violations, 14.5MB heap** (consistent, no regression). No P0/P1. Full
regression PASS. WebGL p95 17.7-17.9ms (<25ms). No data behavior changed
(floor resolution logic identical for every real-world URL this
deployment's visitors actually use -- only the internal wait sequencing
changed).
