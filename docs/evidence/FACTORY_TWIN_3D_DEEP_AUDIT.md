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

---

## Phase 2 — Deep Optimization Audit (this pass, continuing from PR #23)

**Date:** 2026-09-11. Same disposable-container method as above. **1 application code
change this pass** — see §2A.

### 2A. API latency attribution — refining F-4

F-4 above named "4 concurrent backend API calls, ~250ms each" as informational/deferred.
This pass measured the actual mechanism instead of leaving it as a black box.

**Step 1 — ruled out the CAD bundle.** `floor1-cad-bundle.json` (14.4MB, 239ms to parse
standalone) is not loaded by any of the 4 `boot()` endpoints — confirmed by reading every
loader each endpoint calls. Not the cause.

**Step 2 — isolated the handler cost with `curl`** (bypasses the browser and the
Docker-Desktop/WSL2 network stack entirely, so this is the backend's own cost, nothing else):

| Call | curl solo | 4-concurrent (curl) |
|---|---:|---:|
| `/api/build` | 3–9 ms | — |
| `/api/floor-geometry` | 73–84 ms | — |
| all 4 together | — | 213 ms total |

This alone contradicts the browser-measured "~250ms each, uniform" — the real backend cost is
much smaller and non-uniform. The browser's Resource Timing numbers in §6 were themselves
partly inflated by the measurement environment (Playwright-via-Docker-Desktop-WSL2 network
path), not purely backend work — a methodology refinement of §6, not a reversal of it (the
calls genuinely are concurrent and backend-latency-bound; the magnitude was overstated).

**Step 3 — found the real, fixable cost: zero caching on 3 private-file loaders.**
`loadPrivateGeometry`, `loadPrivateAssetMapping`, `loadPrivateZones` in `server.js` each did a
synchronous `fs.readFileSync` + `JSON.parse` on **every call**, and `boot()` calls geometry
twice (`/api/floor-geometry` + `/api/physical-overlay`) and mapping twice
(`/api/physical-overlay` + `/api/alarm-rca`) on every single page load, for files that never
change while the container runs. Verified via grep (`geometry\.\w+\s*=|mapping\[|delete
geometry|...`) that no caller mutates the returned object — safe to share one parsed instance.

**Fix implemented:** `readPrivateJsonCached()` — an mtime-validated cache (`Map` keyed by file
path, invalidated by `fs.statSync().mtimeMs` change, so a real deployment update to the file is
still picked up with no restart). Wired into all 3 hot-path loaders. Deliberately **not**
applied to `loadPrivateRawCad`/`loadPrivateSchematic` — outside the measured `boot()` path
(rawcad is diagnostic-only per its own existing comment).

| Metric | Before | After | Method |
|---|---:|---:|---|
| `/api/floor-geometry` solo (curl) | 73–84 ms | 34–36 ms | direct curl, container port 4196 |
| 4-concurrent total (curl) | 213 ms | 124 ms | direct curl, same |

**Root-cause category (per the required list):** the ~250ms browser-observed figure is a mix
of (2) API handler cost — now measured and reduced by caching — and (1) frontend/network
measurement-environment overhead (Docker-Desktop/WSL2 path inflating the browser's own
Resource Timing numbers relative to curl's direct measurement). Not database (`/api/build` and
`/api/floor-geometry` do no DB query), not serialization (payloads are small), not
"unavoidable" (the caching fix proves part of it was avoidable).

**Step 4 — a second, larger, non-code-fixable gap found in the same investigation.** Even
after the 5 `boot()` fetches resolve (~400–530ms after navigation start), `window.__twin`
does not become defined until **~1050–2450ms** after navigation start across repeated runs —
a materially larger and more variable gap than the fetch batch itself. Traced with 3
independent, non-invasive instrumentation passes (CDP `Profiler`, a diagnostic `fetch` wrapper
injected via `addInitScript`, and a `longtask` `PerformanceObserver` — none of which touch
`app.js`):

- CDP CPU profile of the whole boot window: `buildFloor`/`buildFunctionalZones`/
  `updateEvidenceSummary`/`applyDisplayMode`/`buildEquipmentLayer` (the synchronous
  scene-construction calls inside `loadFloorGeometry()`) total **~5ms of JS self-time
  combined** — ruling out the scene-build hypothesis from earlier in this pass.
- `longtask` observer found a single dominant long task per boot, **618–1177ms**, starting
  right around when the fetch batch resolves — this, not JS execution, is where the time goes.
- `WEBGL_debug_renderer_info` reports this environment's GPU as
  `ANGLE (..., Vulkan 1.3.0 (SwiftShader Device (Subzero) ...), SwiftShader driver)` — a
  **software** rasterizer, not real GPU hardware. 356 draw calls / ~17k triangles is trivial
  for real GPU hardware (sub-millisecond) but not for software rasterization.
- Directly timed `WebGL2RenderingContext.prototype.{compileShader,linkProgram}` via a wrapper:
  0ms measured (compile is async/offloaded) — ruling out shader-compile-on-main-thread as the
  literal mechanism.

**Conclusion:** the long task is native (GPU-command-processing) time, invisible to the JS
profiler (CDP attributes it to the generic `(program)` bucket, 1380ms of it in one run,
dwarfing every named function), consistent with software rasterization of the first frame(s)
in this specific sandboxed Playwright/Docker measurement environment. This is a **measurement-
environment artifact**, not an application defect: the same category of false signal already
disclosed once this engagement (F-5, the 604ms FCP reading) and once in the PR23 phase (the
30-second click-timeout misread) — caught, root-caused with hardware evidence, and **not**
used to justify any code change, per "do not optimize blindly" and "do not fabricate
metrics." On real GPU hardware, this scene's draw-call/triangle counts (already confirmed
minimal and stable, §2/§4 above) would not be expected to reproduce a multi-hundred-millisecond
long task. No fix applied for this finding — there is nothing in application code to fix.

### 2B. Startup waterfall

| Stage | Measured | Note |
|---|---:|---|
| navigationStart → DOMContentLoaded | ~120–150ms | stable across runs |
| navigationStart → FCP | ~50–100ms | carried from Phase 1, re-consistent |
| navigationStart → LCP | ~108ms | carried from Phase 1 |
| navigationStart → `boot()` fetch batch dispatched | ~250–340ms | script parse/eval of the ~2.1MB Three.js bundle + app.js dominates this window |
| `boot()` fetch batch resolved (5 requests) | ~400–530ms | after caching fix; concurrent, confirmed via `req.timing()` |
| navigationStart → `window.__twin` ready (`__twinBootMs`) | ~1050–2450ms, run-to-run variance | dominated by the §2A Step 4 long task, not by the fetch batch |

**Top 3 startup contributors, ranked:**

1. **The post-fetch long task (§2A Step 4).** Largest and most variable single contributor.
   Root-caused to the sandboxed environment's software GPU rasterizer, not application code —
   not optimized, per the rule against blind optimization and against faking evidence for an
   environment artifact.
2. **The `boot()` fetch batch itself (~150–250ms wall, post-caching-fix).** Already the
   correct pattern (full concurrency, `Promise.all`) — reduced further this pass by the
   file-cache fix (§2A).
3. **Initial script parse/eval (~250–340ms before the first fetch dispatches).** Dominated by
   the one-time Three.js library payload (~2.1MB), cached by the browser after first load
   (§5 above) — not app-specific bloat, not re-optimized (would require reducing the 3D
   library itself, out of scope and not evidenced as a real problem: FCP/LCP are already well
   under budget through this window).

No further optimization applied beyond the §2A cache fix — the other two contributors are
either already optimal (concurrent fetch) or not attributable to application code (long
task/environment, library payload).

### 2C. WebGL rendering — re-confirmed, no new change

Already covered in depth in §2/§3/§4 above and unchanged this pass. This pass additionally
confirmed **instancing is already implemented**, not a gap: `grep` of `app.js` shows
`InstancedMesh` used for walls (`~900 walls cost one draw call rather than 900`, comment at
line 1170) and for equipment (`TWO InstancedMeshes, not 344 objects`, line 1563), with
raycasting against instances (not per-object), matching the spec's own candidate-optimization
list item-for-item as already-done. Draw calls (326–356) and triangles (10.4k–17.0k) were
already measured stable across a 12.5-minute soak in Phase 1 and are unaffected by the Phase 2
caching fix (server-side only). No geometry/material/instancing change made — measurement does
not show a real bottleneck here to justify one.

### 2D. 30-minute soak — PASS

Genuine 1810-second (30.2-minute), 210-cycle run completed against the post-caching-fix
container. **PASS**: heap and DOM each took exactly one bounded step (+0.67MB at t+1228s,
+27 nodes early) and then held flat for the remainder of the run; geometries/textures/cached
counts never moved; 0 context loss, 0 page/console/network errors across the full run. Full
table in `FACTORY_TWIN_3D_PERFORMANCE.md`. That document also discloses (not uses) a
reproduced Playwright-`click()`-timeout artifact in the same run's latency block — same known
measurement-harness issue as Phase 1, not a new finding.

### 2E. UX quality review

No UI/markup/CSS file was touched this pass (the only change is server-side caching, invisible
to the operator). `FACTORY_TWIN_3D_UX.md`'s Phase 1 findings stand unchanged. The one
Phase-2-specific UX question — does the software-rasterizer startup delay found in §2A Step 4
affect real operators — is answered no: it is a sandboxed-test-environment artifact tied to
SwiftShader, not to real GPU hardware an operator kiosk would use.

### 2F. Implementation table

| Issue | Measurement | Change | Before | After | Risk |
|---|---|---|---|---|---|
| `loadPrivateGeometry`/`loadPrivateAssetMapping`/`loadPrivateZones` re-read+re-parse their file on every call, called 2x each per page load | curl solo `/api/floor-geometry` 73–84ms; 4-concurrent 213ms | added `readPrivateJsonCached()`, mtime-validated `Map` cache, wired into all 3 loaders (`server.js`) | 73–84ms solo / 213ms 4-concurrent | 34–36ms solo / 124ms 4-concurrent | Low — cache invalidates on file mtime change (real deploys still picked up, no restart needed); verified no caller mutates the returned object (grep); full regression suite passes unchanged |

Only one issue met the bar ("modify only when a measured issue exists"). The startup long
task (F-8) was measured but is not an application-code issue — no row added for it, per the
same rule.

### Phase 2 findings summary

| ID | Finding | Class | Action |
|---|---|---|---|
| F-6 | 3 private-file loaders had no cache despite being called 2× per page load each | real, measured defect | **fixed** — `readPrivateJsonCached()`, `server.js` |
| F-7 | Browser-measured "~250ms per API call" was itself partly a measurement-environment artifact, not pure backend cost | methodology refinement | disclosed, not treated as fact; curl-isolated numbers used instead |
| F-8 | A 618–1177ms long task dominates the gap between the fetch batch resolving and `window.__twin` ready | real, measured, but environment-caused (software GPU rasterizer, not app code) | **not fixed** — no application defect exists to fix; documented and excluded from any "improvement" claim |
| F-9 | Instancing (walls, equipment) already implemented — not a gap | strength, re-confirmed | none |

### Phase 2 conclusion

One real, measured, safe backend fix applied and verified (F-6). One measurement refinement
disclosed rather than acted on (F-7). One large but environment-caused gap fully root-caused
and explicitly **not** used to justify a code change (F-8), consistent with this engagement's
standing rule against fabricating improvements. Instancing re-confirmed already in place
(F-9). 30-minute soak run to completion and passed with bounded, explained resource behavior.
No P0/P1 application defect found in Phase 2, same as Phase 1.

---

## Final verdict

**FACTORY TWIN 3D — READY FOR PRODUCTION**

Basis: render loop, GPU resource lifecycle, context-loss recovery, instancing, disposal, and
accessibility/responsive/motion work were already sound (Phase 1, 0 code changes needed).
Phase 2 found and fixed one real backend inefficiency (uncached private-file reads, now
measured ~2× faster on the affected endpoints), ran the full 30-minute soak to completion with
bounded resource behavior and 0 errors, and root-caused the one large remaining timing
signal (a post-fetch long task) to this sandboxed test environment's software GPU rasterizer
rather than to application code — disclosed in full rather than used to justify a fix that
measurement did not support. No known P0/P1 defect remains. Deferred, non-blocking items:
Thai/English long-label matrix and a dedicated `forced-colors` block (both carried from the
CSS phase, unchanged), and re-validating the Phase 2 startup-timing finding on real (non-
SwiftShader) GPU hardware if that becomes available, purely for confirmation, not because
current evidence indicates a defect.

Not merged: this work stays on `perf/factory-twin-3d-deep-audit`, per standing instruction not
to merge PR #23 automatically or touch `main`/PR #22/CI billing.
