<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Factory Twin — Visual QA

Repeatable visual and performance QA for the Floor 1 twin.

Companion to **[Reconstruction Methodology](FACTORY_TWIN_RECONSTRUCTION.md)** and
**[Evidence Requirements](FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)**.

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

---

## Result vocabulary

| Result | Meaning |
|---|---|
| **PASS** | Asserted and observed. |
| **BLOCKED** | Could not be executed — an environmental precondition was unmet. Never reported as PASS. |
| **NOT TESTABLE** | Cannot be established by browser automation at all. |

---

## Viewport matrix

Checked at 1366×768, 1920×1080, 2560×1440 and 3840×2160.

| Check | Result | Notes |
|---|---|---|
| Page loads | PASS | all four |
| Scene boots | PASS | all four |
| No console errors | PASS | 0 at every viewport |
| No failed requests | PASS | 0 at every viewport |
| No NaN / Infinity transforms | PASS | every mesh position and scale checked |
| Layer counts reconcile with API | PASS | structural = columns + shell; operational = slots + machines; functional = zones served |
| Machines stay in their own coordinate system | PASS | positions byte-identical across every view switch |
| Operator / building view toggle | PASS | operator frames 106/148 structural meshes; building frames 148/148 |
| No clipping of structural geometry in building view | PASS | far plane widened with the fitted distance |
| Conflict zones remain withheld | PASS | zone-28 / zone-31 absent from the wire |
| Layer visibility toggles | PASS | mesh count, API results and machine count unchanged while hidden; restores identically |
| Inspector — slot | PASS | UNMAPPED badge, height "unknown — not in evidence" |
| Inspector — column | PASS | OBSERVED badge, detector densities, grid reference |
| Inspector — machine | PASS | SIMULATED badge, physical mapping NOT CONFIRMED |
| HUD / layer controls / evidence panel readable | PASS | visually inspected at 1920×1080 |
| z-fighting | PASS | none observed |
| Floating geometry | PASS | none observed; slot pads sit on the floor plane |
| Authenticated API assertions | **BLOCKED** | see below |
| GPU utilisation | **NOT TESTABLE** | see below |

### BLOCKED — authenticated assertions

The Grafana admin credential in `.env` returns 401. Authenticated checks
therefore cannot run in this environment, and weakening authentication to
produce a green run was not an option. The unauthenticated boundary checks do
run and pass. Scene assertions in the table above were verified manually
against the running container during development.

### NOT TESTABLE — GPU metrics

Headless Chromium rasterises in software. GPU utilisation, real frame rate and
real interaction latency cannot be obtained from it.

---

## Performance baseline

Same scene, same build, captured in headless Chromium.

| Viewport | Cold load | Boot | API | Frame (median) | Frame p95 | FPS | Interaction |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1366×768 | 1790 ms | 1005 ms | 149 ms | 41.0 ms | 49 ms | 24.4 | 129 ms |
| 1920×1080 | 1532 ms | 724 ms | 190 ms | 69.4 ms | 91 ms | 14.4 | 212 ms |
| 2560×1440 | 1912 ms | 1045 ms | 435 ms | 114.3 ms | 133 ms | 8.7 | — |
| 3840×2160 | 3625 ms | 2137 ms | 838 ms | 264.6 ms | 304 ms | 3.8 | — |

Scene composition, constant across viewports: **418 draw calls · 4,546
triangles · 135 geometries (105 cached) · 4 materials · 30 textures**.

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

Interaction latency exceeds the 100 ms target but is bounded by frame time
under software rendering.

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
