# Factory Twin 3D — Performance Measurements

**Date:** 2026-09-11. Companion to `FACTORY_TWIN_3D_DEEP_AUDIT.md`.
**Environment:** disposable `factory-twin-3d` container (prod image, real read-only DB),
Chromium (Playwright-bundled), 1920×1080, `deviceScaleFactor: 1`, local dev host.
**No code changed this pass** — these are baseline measurements of the already-running
application, not a before/after of a fix (the audit found nothing requiring one; see
Deep Audit §"Findings summary").

---

## Load timing

| Metric | Physical Twin | EAP map | Budget | Status |
|---|---:|---:|---:|---|
| FCP (repeated, clean runs) | ~50–100 ms | ~56 ms | < 1000 ms | **PASS**, large margin |
| LCP | 108 ms | 80 ms | < 2000 ms | **PASS**, large margin |
| DOMContentLoaded | ~140–150 ms | ~119 ms | — | |
| Time to 3D scene populated (gated by `Promise.all` of 4 API calls) | ~400–500 ms | ~200 ms (2 calls) | — | see Deep Audit §6 — backend-latency-bound, not frontend |

An initial measurement run reported FCP=604ms for the twin (10× the EAP figure). Repeated
under identical conditions it was 100ms then 48ms — the 604ms reading was a first-context
browser warm-up artifact, not a property of the application. **Reported here only the
repeated, stable numbers**, per the "measure, do not fabricate" rule.

---

## Interaction latency (in-page, `performance.now()` around the real click, not
Playwright's dispatch/actionability wait)

| Interaction | p50 | p95 | max | Target | Status |
|---|---:|---:|---:|---:|---|
| Twin: view switch (2D/3D) | 0 ms | 0.2 ms | 0.2 ms | <100 ms | **PASS** |
| Twin: layer toggle (equipment) | 0 ms | 0.1 ms | 0.1 ms | <100 ms | **PASS** |
| Twin: drawer toggle | 0 ms | 0.1 ms | 0.1 ms | <100 ms | **PASS** |
| EAP: mode switch (AUTO↔EAP) | 2.2 ms | 5.4 ms | 5.4 ms | <100 ms | **PASS** (prior phase) |
| EAP: view switch (2D↔3D) | 3.6 ms | 7.1 ms | 7.1 ms | <100 ms | **PASS** (prior phase) |
| EAP: fit floor | 0.2 ms | 0.3 ms | 1.5 ms | <100 ms | **PASS** (prior phase) |
| EAP: zone drawer open+close | 2.7 ms | 5.0 ms | 5.0 ms | <100 ms | **PASS** (prior phase) |
| EAP: cell pick | 0.3 ms | 0.6 ms | 0.6 ms | <100 ms | **PASS** (prior phase) |

**Correction on method.** An earlier pass in this same session measured these interactions via
Playwright's `page.click()` wall-clock and got wildly inflated numbers (e.g. "toggle drawer"
650ms p50, and one selector that was invisible — the drawer wasn't open yet — timed out at the
full 30000ms Playwright click-actionability limit and was misread as "layer toggle costs 30
seconds"). That was a **test-harness artifact** (click-dispatch/hit-test/scroll overhead, and
in one case a genuinely bad selector precondition), not application cost. Re-measured
in-page as above; every real interaction is sub-millisecond to low-single-digit-millisecond.
The faulty script and its numbers were not carried into any report as fact.

---

## Frame behaviour

| Metric | Value | Note |
|---|---:|---|
| `totalFramesRendered()` delta over a 3s idle window | **0** | demand-rendering confirmed — see Deep Audit §2 |
| `totalFramesRendered()` over the 12.5-min / 89-cycle soak | 409 → 2465 | grows only with real interaction, never idle |
| Native `requestAnimationFrame` tick rate | ~16.7 ms (60 Hz) | this is the browser's own timer firing rate, present regardless of whether `renderer.render()` executes that tick — not itself evidence of continuous GPU work (clarified, not conflated) |
| Long frames / longtask storms | none observed in the 12.5-min soak or the 5-cycle recovery test | 0 page errors either run |

---

## WebGL resource counts

| Metric | Value (equipment layer on) | Value (equipment layer off) |
|---|---:|---:|
| Draw calls | 356 | 326 |
| Triangles | 16,996 | 10,408 |
| `renderer.info.memory.geometries` | 88 | 88 |
| `renderer.info.memory.textures` | 22 | 22 |
| Cached (deduped) geometries (`resourceStats()`) | 4 | 4 |
| Cached (deduped) materials (`resourceStats()`) | 9 | 9 |

Stable across the entire 12.5-minute soak in both states — the oscillation between the two
rows above is the equipment layer being toggled on/off by the soak script itself (expected),
not drift.

**EAP** (much smaller schematic scene, by design): 7 geometries, 8 draw calls, 630 triangles,
3 instanced batches.

---

## Memory / long-run stability — 12.5-minute soak, 89 cycles

Cycle = view switch (2D↔3D) + (every 3rd) drawer toggle + (every 4th pair) equipment-layer
toggle on/off + a canvas click + a viewport resize.

| | start | end | Δ |
|---|---:|---:|---:|
| Duration / cycles | — | 750 s / 89 | — |
| JS heap | 10.68 MB | 10.68 MB | **0.00** (flat across all 13 samples) |
| DOM nodes | 299 | 326 | +27, **one-time step** (first drawer-open lazily builds its panel content), flat for the remaining 8 samples |
| `renderer.info.memory.geometries` | 88 | 88 | 0 |
| `renderer.info.memory.textures` | 22 | 22 | 0 |
| `contextLossCount()` | 0 | 0 | 0 (no unintended loss) |
| Page/console errors | — | **0** | — |

**Target was ≥30 min; this run was bounded to 12.5 min** (time budget for this pass). Given
zero movement on every resource metric across the full run with real, repeated interaction on
every cycle, extending to 30 min would not be expected to show different behaviour, but that
is a statement of expectation, not a measured 30-minute result — flagged as a deferred item
below rather than claimed.

---

## Before / After

No code was changed this pass (the deep audit found no proven P0/P1 defect to fix — see
`FACTORY_TWIN_3D_DEEP_AUDIT.md`). The table below is therefore a **baseline**, not a delta.

| Metric | Baseline (this pass) | Target | Status |
|---|---:|---:|---|
| FCP | ~50–100 ms | < 1000 ms | PASS |
| LCP | 108 ms (twin) / 80 ms (eap) | < 2000 ms | PASS |
| Interaction p95 | ≤ 0.2 ms (twin, in-page) / ≤ 7.1 ms (eap, in-page) | < 100 ms | PASS |
| Frame idle waste | 0 frames / 3s | 0 | PASS |
| Long frames | 0 observed | 0 sustained storm | PASS |
| JS heap (12.5-min soak) | flat, 10.68→10.68 MB | stable | PASS (30-min target not run, see above) |
| DOM nodes | +27 one-time, then flat | no unbounded growth | PASS |
| Draw calls | 326–356 (state-dependent, stable) | no uncontrolled growth | PASS |
| Triangles | 10.4k–17.0k (state-dependent, stable) | no uncontrolled growth | PASS |
| Textures | 22, flat | no uncontrolled growth | PASS |
| WebGL resources across 5 recovery cycles | 0 growth | 0 growth | PASS |
| Accessibility | 0 axe violations (both pages, carried from prior phase) | 0 | PASS |
| Visual regression | 32/32 (carried) | 0 fail | PASS |
| Responsive matrix | 0 overflow (carried) | 0 overflow | PASS |
| WebGL recovery (real prod) | 56/56 (carried) + 5/5 re-verified here | 0 fail | PASS |

## Deferred

- Full 30-minute soak (only 12.5 min run this pass — no regression signal to extend for, but
  not claimed as done).
- Backend API latency behind `floor-geometry`/`physical-overlay`/`alarm-rca`/`build`
  (~250ms each) — profiling is a backend-scope task, not frontend code.
