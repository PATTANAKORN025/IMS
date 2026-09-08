<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Factory Twin — Visual QA

Repeatable visual and performance QA for the Floor 1 twin.

Companion to **[Reconstruction Methodology](FACTORY_TWIN_RECONSTRUCTION.md)**,
**[Evidence Requirements](FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)**,
**[Runtime Architecture](FACTORY_TWIN_ARCHITECTURE.md)** and
**[Security Model](FACTORY_TWIN_SECURITY_MODEL.md)**.

---

## How to run

```bash
GRAFANA_URL=http://localhost:3000 \
GRAFANA_ADMIN_USER=... GRAFANA_ADMIN_PASSWORD=... \
  node tests/playwright/factory-twin-regression.js
```

The suite authenticates through Grafana and reaches the twin via the proxy —
the path a real user takes. It refuses to report PASS against a login page.

> [!IMPORTANT]
> Never publish a host port on the twin container to make a test easier. The
> container has no host port by design; reaching it directly bypasses the
> authentication gate the twin depends on.

### Direct scene mode

When the Grafana credential is unavailable, the scene assertions can still be
executed against a throwaway container reached directly:

```bash
TWIN_DIRECT_URL=http://localhost:<scratch-port>/   node tests/playwright/factory-twin-regression.js
```

> [!WARNING]
> Direct mode **proves nothing about access control**. It skips the proxy and
> therefore exercises no authentication gate at all; the suite says so in its
> header, its startup log and its final banner. Its results are evidence about
> the scene and nothing else, and the container it runs against is a scratch
> artefact to be removed afterwards — not a change to the deployed topology.

---

## Result vocabulary

| Result | Meaning |
|---|---|
| **PASS** | Asserted and observed. |
| **BLOCKED** | Could not be executed — an environmental precondition was unmet. Never reported as PASS. |
| **NOT TESTABLE** | Cannot be established by browser automation at all. |

---

## Viewport matrix

Checked at 1366×768, 1920×1080, 2560×1440, 3840×2160 and a 600×1000 portrait
viewport. Every row below holds at every one of the five.

| Check | Result | Notes |
|---|---|---|
| Page loads | PASS | all five |
| Scene boots | PASS | all five |
| No console errors | PASS | 0 at every viewport |
| No failed requests | PASS | 0 at every viewport |
| No NaN / Infinity transforms | PASS | every mesh position and scale checked |
| Layer counts reconcile with API | PASS | structural = columns + shell; operational = slots + machines; functional = zones served |
| Machines stay in their own coordinate system | PASS | positions byte-identical across every view switch |
| Operator / building view toggle | PASS | operator preserves its original framing byte-for-byte; building frames 148/148 structural meshes |
| Overview preset | PASS | frames the union of measured-building and synthetic-machine extents; both classes in frame |
| Sub-layer counts reconcile | PASS | column, slot and machine sub-layer meshes each match the API count |
| Reset preserves the active view | PASS | re-applies the current view's framing rather than forcing operator |
| Coordinates unchanged across view switches | PASS | fixed-precision snapshot of every rendered coordinate byte-identical before and after three switches plus a reset |
| No clipping of structural geometry in building view | PASS | far plane widened with the fitted distance |
| Conflict zones remain withheld | PASS | zone-28 / zone-31 absent from the wire |
| Layer visibility toggles | PASS | mesh count, API results and machine count unchanged while hidden; restores identically |
| Inspector — slot | PASS | UNMAPPED badge, height "unknown — not in evidence" |
| Inspector — column | PASS | OBSERVED badge, detector densities, grid reference |
| Inspector — machine | PASS | SIMULATED badge, physical mapping NOT CONFIRMED |
| HUD / layer controls / evidence panel readable | PASS | visually inspected at 1920×1080 |
| z-fighting | PASS | none observed |
| Floating geometry | PASS | none observed; slot pads sit on the floor plane |
| A private path is not served | PASS | 404 with a fixed body |
| The 404 body echoes nothing | PASS | no requested path, no private filename, no stack trace, no filesystem path |
| No framework banner header | PASS | `x-powered-by` absent |
| Every served geometry string is a safe token | PASS | 450 distinct values, 0 free text |
| Authenticated API assertions | **BLOCKED** | see below |
| GPU utilisation | **NOT TESTABLE** | see below |

### BLOCKED — authenticated assertions

The Grafana admin credential in `.env` returns 401. Authenticated checks
therefore cannot run in this environment, and weakening authentication to
produce a green run was not an option — see
**[Security Model](FACTORY_TWIN_SECURITY_MODEL.md)** for why that stays true
even when it is inconvenient.

This is an **external, pre-existing verification blocker**, not a defect in the
twin. It is cleared by supplying a working credential; nothing in the service,
the proxy or the test needs to change.

What still runs, and passes, in its absence:

- The **unauthenticated boundary** checks, through the proxy, asserting 401 and
  no body on every twin route.
- The **scene assertions**, via direct mode, which state in their own output
  that they exercise no auth gate.

The one thing that cannot be established here is the authenticated path
end-to-end: that a valid session reaches a correctly rendered scene through the
proxy. That assertion is deferred, not assumed.

### NOT TESTABLE — GPU metrics

Headless Chromium rasterises in software. GPU utilisation, real frame rate and
real interaction latency cannot be obtained from it.

---

## Performance baseline

Measured by `tests/perf/factory-twin-benchmark.js` against the running service,
same build, headless Chromium.

| Viewport | Boot | Frame (median) | Frame p95 | API | JS heap |
|---|---:|---:|---:|---:|---:|
| 1366x768 | 1546 ms | 69.5 ms | 80.5 ms | 224 ms | 13 MB |
| 1920x1080 | 1400 ms | 114.6 ms | 133.5 ms | 357 ms | 11 MB |
| 2560x1440 | 1797 ms | 191.7 ms | 216.3 ms | 590 ms | 11 MB |
| 3840x2160 | 2997 ms | 471.8 ms | 516.7 ms | 1477 ms | 10 MB |

Scene composition, **constant across all four viewports**: 550 draw calls,
16,444 triangles, 150 geometries (80 cached), 8 materials. Zero console errors
at every viewport.

The composition grew from 493 draw calls and 16,228 triangles when the room
layer went from 8 polygons to 32: the drawing's own closed area boundaries are
now served, so 24 more rooms are drawn.

**The rooms are not what the extra time costs.** Hiding the whole room layer
removes 115 draw calls and buys **1.7 ms of 118.8 ms, or 1.4 %**. The timings
above sit higher than the previous baseline (98.7 ms at 1920x1080) but this
measurement does not attribute that to the room work, and neither does anything
else here: it is a different container on a different run of a software
rasteriser, and run-to-run variance on this host is the more likely reading.
Recorded as unattributed rather than blamed on the nearest change.

### What the frame time is actually bound by

Frame time fits **55.5 ms per megapixel plus 11.2 ms fixed** across the four
viewports, at unchanged scene composition. That is a fill-rate signature.

The benchmark tests it directly rather than arguing from the fit. It hides
layers one at a time and reports what each removal buys, at 1920x1080:

| Scene | Draw calls | Triangles | Frame (median) | Change |
|---|---:|---:|---:|---:|
| All layers | 550 | 16,444 | 136.6 ms | |
| Without equipment and columns | 124 | 11,332 | 121.1 ms | -15.5 ms |
| Shell only | 4 | 18 | 74.0 ms | -47.1 ms |
| Empty scene | 0 | 0 | 16.8 ms | -57.2 ms |

**Removing 426 of 550 draw calls -- 77% of them -- changed the frame by 15.5 ms
of 136.6 ms, or 11%.** An empty scene still costs 16.8 ms, which is compositing
and not this application at all.

Two further measurements at 1920x1080, taken the same way:

| Change | Draw calls | Frame (median) | Cost |
|---|---:|---:|---:|
| Room layer hidden | 550 -> 435 | 118.8 -> 117.1 ms | **1.4 %** |
| Raw CAD overlay switched on | 550 -> 562 | 118.8 -> 129.8 ms | **8.5 %** |

The overlay's 9,416 segments cost twelve draw calls and about 11 ms when it is
open. It is off by default and fetched only on first use, so a floor view that
never opens it pays neither.

### Why instancing stays deferred

Columns and equipment are 202 and 224 individual meshes, and instancing them is
the obvious optimisation. The sweep above is why it has not been done: the
entire draw-call population of both layers is worth 15.5 ms in a 136.6 ms frame,
and the change is not free -- both layers are picked, so an InstancedMesh needs
an instanceId-to-record map, and the regression suite reconciles per-mesh
counts that would have to be rewritten. That is real risk and rework against an
11% ceiling on a number that does not describe production hardware anyway.

The lever is recorded, not taken. If a measurement on real hardware ever shows
draw calls mattering, the sweep is the thing to re-run first.

> [!WARNING]
> **None of these numbers is a GPU measurement and none may be quoted as the
> twin's real performance.** Headless Chromium rasterises in software. On real
> hardware, 16,444 triangles and 550 draw calls is a trivial scene.

Redundant work **was** removed from that pointer path — one ray per hover
instead of three, a cursor write only when the value changes, and an inspector
rebuild only when the hovered target changes. Those are justified as work that
provably has no observable effect, not by a measured speedup, and none is
claimed: the numbers above cannot show one. What they do show is that nothing
regressed — composition is identical and timings are within run-to-run noise.

---

## Findings and classification

Visual issues are classified before anything is changed. Only RENDERING and UX
issues are fixed automatically; a DATA or EVIDENCE finding is reported, never
"fixed" by adjusting measured geometry.

| # | Finding | Class | Resolution |
|---|---|---|---|
| 1 | Camera framing was tuned for the synthetic device spread and could not show the measured building | RENDERING/UX | **Fixed** — operator/building view modes, building framing derived from the measured envelope |
| 2 | Monitored devices cluster near the origin while measured geometry spans the full floor | **EVIDENCE LIMITATION** | **Not fixed, by design.** No authoritative record places these devices in the building; moving them would fabricate a position. Surfaced instead: the machine inspector labels position SIMULATED and mapping NOT CONFIRMED |
| 3 | The floor shell is sized from the synthetic device bounding box, so it competes with the real footprint | DATA | Open. Predates the real geometry. Not changed, because the shell honestly bounds what it was derived from |
| 4 | Slot pads rendered half below the floor plane | RENDERING | **Fixed** — pads now sit on the floor |

---

## What was examined and left alone

A code-level pass over geometry and material creation, duplicate resources,
raycasting, pointer and resize handlers, the animation loop, DOM updates, API
calls, JSON parsing, scene traversal and redraws found the following already in
place: geometry and material caches shared across meshes (135 geometries and 4
materials for 421 meshes), resize collapsed to one call per animation frame,
hover picking throttled to one pass per frame with a single shared ray,
diagnostics fetched lazily on first open, and the inspector rebuilt only when
the hovered target changes.

Two candidates remain deliberately unimplemented:

| Candidate | Status | Why |
|---|---|---|
| **Instancing** | DEFERRED | Would collapse the 426 column and equipment draw calls to roughly 2. Visual equivalence cannot be demonstrated under software rasterisation, and optimising against that risks changing rendering for no real gain. Recorded as the available lever if a real-hardware measurement ever justifies it. |
| **On-demand rendering** | DEFERRED | Would stop the loop when nothing changes. Damped orbit controls need continuous frames, so this is a behaviour change to interaction, not a tidy-up. |
| **Caching the server-side projection** | DEFERRED | The geometry route re-reads and re-projects the private files per request. At one request per page load, with the measured API latency above, there is no demonstrated problem to fix -- and an optimisation adopted because it sounds faster is how a cache-invalidation bug gets introduced into the one path that must never serve stale evidence. |

---

## Regression strategy

Four tiers, deliberately separated, because they fail for different reasons and
a merged suite hides which one broke.

| Tier | Runs | Asserts |
|---|---|---|
| **Contract unit tests** | Node, no container | Mapping refusals, MES import boundary, geometry mutation, diagnostics sanitization, evidence promotion. Pure semantics. |
| **Geometry validator** | Node, private data if present | That served geometry satisfies its own validation rules. |
| **Security regression** | Browser, through the proxy | Unauthenticated 401 on every route, traversal probes, no body leakage. |
| **Scene regression** | Browser, five viewports | Counts, framing, layer behaviour, inspector content, coordinate stability, console and network cleanliness. |

Every unit tier is registered in the pre-commit suite **and in CI**. They ran
only locally until an audit noticed that a pull request deleting a refusal --
the prototype-key guard, say, or the promotion ceiling -- passed CI unopposed.

A fifth tier now runs alongside them:

| Tier | Runs | Asserts |
|---|---|---|
| **Failure-mode regression** | Browser, faults injected into the API | That the twin stays honest when the API does not: 21 injected faults covering status codes, malformed and truncated bodies, wrong types, duplicate identifiers, unknown schema versions and evidence tiers, hostile extra fields, transport aborts and a request that never answers. Each asserts no uncaught exception, no NaN transform, nothing private on screen, and nothing presented as CONFIRMED. |

### Absent preconditions are reported, never passed

CI has no private geometry -- it is gitignored -- and a database may have no
monitored devices. Both are legitimate deployment states, so the suite
distinguishes three outcomes rather than two: checks needing an envelope or a
fleet report **SKIP** with the reason and are never folded into the pass count.
A green CI run therefore never implies the geometry was verified.

The same discipline covers the authenticated path. A rejected credential emits
`AUTH_REGRESSION_BLOCKED_EXTERNAL_CREDENTIAL` and exits 78, distinguishing a
configuration precondition from a product failure without ever reporting PASS.

Three properties keep the suite honest:

- **Counts are derived, never hardcoded.** The suite reads counts from the API
  and reconciles them against the scene. Real evidence arriving changes the
  numbers without requiring an edit to the test — and a number moving *without*
  new evidence is a regression the suite still catches.
- **A blocked precondition is never reported as PASS.** The result vocabulary
  above exists precisely so that "could not run" has somewhere to go.
- **Refusals are tested, not just behaviours.** The valuable assertions in this
  system are the things it declines to do: promote an observation, infer a
  mapping, serve an unvalidated zone, echo a private field. Those have explicit
  tests with hostile input.

---

## Standing invariants

These are evidence invariants, not arbitrary fixtures. A change to any of them
means either new evidence arrived or something regressed — both warrant
attention.

| Invariant | Value | Why fixed |
|---|---:|---|
| Structural columns | 120 | Detection result; changes only if detection is re-run |
| Observed equipment slots | 243 | Detection result; same |
| Monitored devices | 23 | The live enabled device set |
| Confirmed physical mappings | **0** | No authoritative record exists |
| Zones rendered / withheld | 0 / 0 | No zone file is deployed after the re-derivation |

The column and slot figures changed on 2026-08-31 when the private geometry was
re-derived from the source sheet after the working copy was deleted. They are
what the same method measures on the same drawing, reported as measured and not
tuned towards the previous 147 and 242. See
[Reconstruction](FACTORY_TWIN_RECONSTRUCTION.md) for the independent checks the
re-derivation passes: both printed dimension chains sum to their printed totals
with zero delta, and the traced footprint encloses 14,401 m² against the
sheet's own printed 14,430 m².

The regression suite derives counts from the API and reconciles them against
the scene rather than hardcoding them, so adding evidence does not require
editing the test.
