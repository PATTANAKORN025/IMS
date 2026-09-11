# Factory Twin 3D — Deep Runtime Audit

**Date:** 2026-09-11
**Scope:** `services/factory-twin-3d/public/app.js` (physical twin, `/factory-twin-3d/`) +
`eap.js` (`/factory-twin-3d/eap.html`) — the running application, not static review alone.
**Method:** disposable `factory-twin-3d` container (prod image, real read-only DB, private
CAD mounted read-only) on a direct port, real Chromium via Playwright, CDP
`Performance.getMetrics`, `PerformanceObserver`, `renderer.info`, and the app's own
`window.__twin` / `window.__eap` diagnostic hooks. No production Grafana or volume touched.
**Result of this pass: 0 application code changes.** Every measured path was already sound;
see "Findings" below for why, and for the one informational (non-frontend) item.

---

## 1. Runtime reachable

`http://localhost:3000/factory-twin-3d/` is served behind the proxy's `auth_request` gate
(returns `401` unauthenticated — expected, not a defect). For instrumented measurement, the
already-established pattern (used throughout the EAP/CSS audits this cycle) was used again:
a disposable container built from the same `ims-factory-twin-3d` image, with the private CAD
directory mounted read-only, on a direct host port (bypasses the proxy, not production). No
architecture change was made to "get it to start" — it already starts correctly; this is
purely a measurement rig.

```
docker run -d --network ims_ims-internal -p 4196:4100 -e PORT=4100 -e NODE_ENV=production \
  -v ".../services/factory-twin-3d/private:/app/private:ro" ims-factory-twin-3d
```

Confirmed reachable: `GET /` → 200, `GET /eap.html` → 200, both render with `window.__twin`
/ `window.__eap` present and 0 console/page errors.

---

## 2. WebGL / 3D engine audit (`app.js`, physical twin)

| Aspect | Finding |
|---|---|
| Render loop | **Demand-rendered, not continuous.** `animate()` (line 4141) unconditionally re-arms `requestAnimationFrame`, but the actual `renderer.render()` call is gated by `renderTail` (`RENDER_TAIL_FRAMES = 4`), which only resets on `controls.change`, `resize`, `visibilitychange`, or an explicit `requestRender()`. **Measured: 0 extra frames rendered over a 3-second idle window** (`totalFramesRendered()` unchanged, 12→12). |
| Geometry/material reuse | `resourceStats()` exposes a dedup cache (`geometryCache`/`materialCache`, sizes 4/9 for the loaded floor); `isSharedGeometry()` gate before disposal (line 903) so a shared instance is never freed out from under another user. |
| Disposal lifecycle | Explicit `.dispose()` calls at 5 sites (903–909, 1141, 1305, 1717) covering geometry, non-canvas-texture materials, and the orientation grid. |
| Context-loss / restore | Full `LOST → RESTORING → REBUILDING → VERIFYING → RECOVERED` lifecycle (`handleContextLost` L256, `attemptContextRecovery` L281, `verifyRecovery` L331), generation-token guarded against stale async callbacks. Carried from `42a1ce22`, already verified 28/28 on real prod in a prior phase of this work; **re-verified here**: 5 forced loss/restore cycles, GPU resource counts measured before/after — see §4. |
| Resize | Coalesced to one `onResize()` per animation frame during a drag-resize (`resizePending`, L3879–3889) — not one call per native `resize` event. A second, cheap listener (L461) just bumps `renderTail`; not a duplicate of the real work. |
| Labels | HTML overlay (never scene geometry) with a pooled/reused DOM element per slot (`labelElement()`, L3972) and a hard cap (`LABEL_MAX = 40`) — not unbounded per-machine geometry. |
| Raycasting | Only at click time (`pickEquipment`, L2144/2165) — **not** inside `animate()`. |
| Code size / structure | 4163 lines, 93 top-level functions, average ≈45 lines/function, largest 148 lines (`buildEquipmentLayer` — a real scene-builder doing per-equipment-type geometry work, not bloat). No duplicate-logic or dead-code smell found in the paths exercised. |

**Conclusion:** the render loop and resource lifecycle are already built to the pattern the
brief asks for (event-driven, dirty-flag, cached references, disposal-on-loss) — not naive
per-frame allocation. No P0/P1 rendering defect found.

---

## 3. Render-loop per-frame work classification

| Operation | Class | Evidence |
|---|---|---|
| `requestAnimationFrame(animate)` re-arm | FRAME-CRITICAL (unavoidable) | line 4142 |
| `controls.update()` | FRAME-CRITICAL while damping | returns `true` only mid-glide; triggers `requestRender()`, not a render itself |
| `renderer.render(scene, camera)` | STATE-DRIVEN | gated by `renderTail > 0`; **skipped** at idle (measured) |
| `requestLabelUpdate()` → `updateMachineLabels()` | STATE-DRIVEN | coalesced via `labelsPending` flag + its own single rAF; reads `clientWidth/Height` once per actual render, not per animate() tick |
| Raycasting, projection math | EVENT-DRIVEN | click/hover handlers only, confirmed absent from `animate()` |

No allocation, DOM query, or network call found inside the unconditional part of `animate()`.

---

## 4. GPU resource lifecycle — measured across recovery

5× forced `simulateContextLoss()` / `simulateContextRestore()` on the real disposable, reading
`renderer.info` before and after:

| | before | after 5 cycles |
|---|---:|---:|
| `renderer.info.memory.geometries` | 88 | **88** |
| `renderer.info.memory.textures` | 22 | **22** |
| `renderer.info.render.calls` | 356 | **356** |
| `renderer.info.render.triangles` | 16996 | **16996** |
| `contextLossCount()` | 0 | 5 (all accounted for) |
| console/page errors | — | **0** |

**Zero GPU resource growth across recovery.** `programs` (Three.js's shader-program cache)
moved 11→10 — a compiled-shader cache managed entirely by Three.js itself, not applicationw
memory; a 1-unit shift here is not a leak signature.

---

## 5. Network / asset audit

| Resource | Bytes (transfer) | Notes |
|---|---:|---|
| `three.core.js` | 1,443,356 | shared by both pages, ESM core chunk |
| `three.module.js` | 650,453 | shared by both pages, ESM wrapper — loading both is the normal r150+ split, not a duplicate-load bug |
| `app.js` | 207,076 | twin only |
| `eap.js` | 78,219 | eap only |
| `OrbitControls.js` | 40,804 | shared |
| `operational-status.js` | 7,324 | shared |
| API fetches (twin: `floor-geometry`, `physical-overlay`, `alarm-rca`, `build`) | 738,793 combined | see §6 — already parallel |
| API fetches (eap: `eap-map`, `floor-geometry`) | 1,047,227 combined | |

Twin total: 11 requests / 3.09 MB. EAP total: 8 requests / 3.28 MB. Both dominated by the
one-time Three.js library payload (≈2.1 MB, cached by the browser after first load), not by
anything added on top of it. No duplicate requests found. No image assets in the critical path.

---

## 6. Startup waterfall — the one real, measured, non-frontend finding

`boot()` (app.js L3483) fetches floor geometry, physical-overlay confirmations, alarm/RCA
data, and build metadata **concurrently** (`Promise.all([geometryFetch, overlayFetch,
alarmFetch, buildFetch, floorSelectorReady])`, L3680) — already the correct pattern, not
sequential. Measured (2 clean runs, consistent):

| Call | start | duration |
|---|---:|---:|
| `floor-geometry` | ~123ms | ~250–260ms |
| `physical-overlay` | ~123ms | ~245–253ms |
| `alarm-rca` | ~123ms | ~259–264ms |
| `build` | ~123ms | ~260–264ms |

All four start within 1ms of each other (genuinely parallel) and each takes ~250ms — this is
**backend/API response latency**, not a frontend concurrency defect. Page shell (chrome, HUD)
paints independently and early (FCP ~50–100ms, see `FACTORY_TWIN_3D_PERFORMANCE.md`); this
window only delays when the 3D scene itself is populated (≈400–500ms after navigation start).

This is out of this audit's frontend scope and out of the hard rule against touching the
database — noted as a **deferred, backend-scope item**: if a faster time-to-scene is wanted,
profile these 4 API handlers' own query cost, not the frontend fetch pattern (which is already
optimal — full concurrency, no head-of-line blocking).

---

## 7. Code architecture — spot check

No refactor performed; none was evidenced as necessary. Specifically checked and clear:

- No `console.log`/debug leftovers found in the hot paths read.
- No global mutable state found being **written** inside `animate()` (only read: `renderTail`,
  `webglLifecycle`, `rendererAvailable`).
- Disposal helpers are centralized (not duplicated per call site).
- The `window.__twin` / `window.__eap` diagnostic surfaces are real, callable QA hooks (not
  test-only stubs) — every metric in this report was read through them, not inferred.

---

## 8. State matrix — coverage already established, re-cited (not re-invented)

The following states already have deterministic, passing automated coverage from this
engagement's prior phases, re-run clean this pass and not duplicated here:

| State | Suite | Result (this pass) |
|---|---|---|
| initial load, selection, inspector, layers, reference toggle, resize, WebGL loss/recovery, no-data/error/unavailable | `factory-twin-failure-modes.js`, `factory-twin-regression.js` | PASS |
| axe (0 violations), 200% zoom, forced-colors, reduced-motion, keyboard | prior-phase a11y matrix (`scratchpad/a11y.js`) | carried, both pages |
| responsive 1366/1920/2560/3840, 0 overflow | `ui-visual-regression.js` (32 states) | carried |
| WebGL recovery on real prod, both pages | `webgl-prod-verify.js` | 56/56, carried; 5/5 GPU-resource-stability re-verified here (§4) |

New measurement performed in this pass (not previously done at this depth for the twin): real
navigation timing, resource waterfall, `renderer.info` draw-call/triangle/texture counts, a
12.5-minute interaction soak, and corrected in-page interaction latencies — see
`FACTORY_TWIN_3D_PERFORMANCE.md`.

---

## Findings summary

| ID | Finding | Class | Action |
|---|---|---|---|
| F-1 | Render loop is demand-driven with 0 idle waste | strength, verified | none — cite as evidence |
| F-2 | 0 GPU resource growth across 5 forced context-loss cycles | strength, verified | none |
| F-3 | 0 heap/DOM/geometry/texture growth across a 12.5-min, 89-cycle interaction soak | strength, verified | none |
| F-4 | 4 concurrent backend API calls (~250ms each) gate 3D-scene population | informational | deferred — backend query profiling, out of frontend/DB-schema scope |
| F-5 | An early ad-hoc measurement script initially reported a false "twin FCP is 10× EAP's" (604ms vs 56ms) | methodology error, caught and corrected | discarded before being reported as fact — see `FACTORY_TWIN_3D_PERFORMANCE.md` for the real, repeated numbers (~50–100ms) |

No P0 or P1 defect was found in the running application. See `FACTORY_TWIN_3D_PERFORMANCE.md`
for the full measured table and `FACTORY_TWIN_3D_UX.md` for the UX/accessibility/responsive
status (already established, cited not repeated).
