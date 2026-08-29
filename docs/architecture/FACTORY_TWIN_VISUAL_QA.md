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

Same scene, same build, captured in headless Chromium.

| Viewport | Cold load | Boot | Frame (median) | Frame p95 | FPS |
|---|---:|---:|---:|---:|---:|
| 1366×768 | 1330 ms | 574 ms | 37.1 ms | 56.1 ms | 27.0 |
| 1920×1080 | 1596 ms | 810 ms | 65.3 ms | 80.8 ms | 15.3 |
| 2560×1440 | 2154 ms | 1205 ms | 112.5 ms | 133.0 ms | 8.9 |
| 3840×2160 | 3435 ms | 2101 ms | 242.5 ms | 293.1 ms | 4.1 |
| 600×1000 (portrait) | 1254 ms | 487 ms | 24.0 ms | 27.2 ms | 41.7 |

Scene composition, constant across the four landscape viewports: **418 draw
calls · 4,546 triangles · 135 geometries (105 cached) · 4 materials · 30
textures**.

At 600×1000 the same scene issues **161 draw calls and 1,718 triangles** from
**39 geometries**. Nothing was removed: the narrower frustum culls most of the
floor, which is why that viewport is the fastest despite being the most
constrained. It is listed to show the shape of the workload, not as evidence
of an optimisation.

> [!WARNING]
> **These are not GPU numbers and must not be quoted as the twin's real
> performance.** Frame time scales almost exactly with pixel count — 7.9× the
> pixels for 6.5× the time — against only 4,546 triangles. That is a fill-rate
> signature under software rasterisation, not scene complexity. On real
> hardware this scene is trivial.

**No optimisation was performed on the strength of these numbers.** Instancing
would collapse 418 draw calls to roughly 4, but the benefit cannot be
demonstrated here, and optimising against a software rasteriser risks changing
rendering for no real gain. Draw calls are recorded as the lever if a
real-hardware measurement ever justifies pulling it.

Interaction latency exceeds the 100 ms target, bounded by frame time under
software rendering. It was not re-measured in the most recent run: an
end-to-end hover measurement here is dominated by frame time and automation
round-trips, so it cannot resolve the cost of the pointer path itself.

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

## Regression strategy

Four tiers, deliberately separated, because they fail for different reasons and
a merged suite hides which one broke.

| Tier | Runs | Asserts |
|---|---|---|
| **Contract unit tests** | Node, no container | Mapping refusals, MES import boundary, geometry mutation, diagnostics sanitization, evidence promotion. Pure semantics. |
| **Geometry validator** | Node, private data if present | That served geometry satisfies its own validation rules. |
| **Security regression** | Browser, through the proxy | Unauthenticated 401 on every route, traversal probes, no body leakage. |
| **Scene regression** | Browser, five viewports | Counts, framing, layer behaviour, inspector content, coordinate stability, console and network cleanliness. |

Every unit tier is registered in the pre-commit suite, so a semantic refusal
cannot be removed without a commit failing.

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
| Structural columns | 147 | Detection result; changes only if detection is re-run |
| Observed equipment slots | 242 | Detection result; same |
| Monitored devices | 23 | The live enabled device set |
| Confirmed physical mappings | **0** | No authoritative record exists |
| Zones rendered / withheld | 8 / 13 | Only validated tiers may render |

The regression suite derives counts from the API and reconciles them against
the scene rather than hardcoding them, so adding evidence does not require
editing the test.
