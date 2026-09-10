# EAP SCADA Floor 1 — Full System Audit, Fix & Production Hardening

**Date:** 2026-09-10
**Branch:** `fix/eap-scada-floor1-hardening` (from `integration/andon-layout-safe`, which carries `42a1ce22` + the origin/perf Factory-Twin/EAP work + Operator-Andon merge PR #19)
**Scope:** the EAP operational map (`/factory-twin-3d/eap.html`, `eap.js`) as primary; the physical Floor 1 twin (`/factory-twin-3d/`, `app.js`) for WebGL lifecycle + status semantics, per the "audit both pages" decision.
**Method:** disposable `factory-twin-3d` container (prod image, real read-only DB, private data mounted read-only) for the test matrix; the real authenticated production stack for serving-truth and WebGL-recovery verification. No production Grafana, volume or config touched.

---

## Executive Summary

The EAP frontend was found in good shape — extensively hardened by prior phases (WebGL context-loss lifecycle, API-failure safety, the canonical operational-state contract, the canonical route). Baseline: **all 5 EAP Playwright suites already passed.**

**One real defect fixed:** `eap.js` defaulted `simulationOn = true`, so a viewer opening the map saw generated per-cell states they had not asked for — contradicting the file's own resolver comment ("default-off framing") and the project rule that production must never substitute simulation for an absent real source. Changed the default to OFF; the map now shows **REAL / UNAVAILABLE** for every cell on first load, with demo mode a deliberate, viewer-initiated opt-in. Deployed and verified in a fresh authenticated browser.

**No `FINAL PASS` claim.** The success-criteria checklist (§ below) has items proven, items environmental, and items deferred. Two Playwright checks fail for reasons unrelated to this work (host-load latency; Grafana's own broken app-plugins), documented as such, not converted to PASS.

---

## Serving Truth

| Fact | Value |
|---|---|
| Current branch | `fix/eap-scada-floor1-hardening` @ `c6cc4e85` |
| HEAD before this work | `81a82e8e` (Andon×FT integration merge, PR #19) |
| `origin/main` | `38e3c7f9` |
| Canonical route `/factory-twin-3d/` serves | **physical twin** — `index.html` → `app.js`, `window.__twin`, title "Factory Twin — Floor 1". Enforced by `tests/playwright/eap-canonical-route-regression.js`. |
| EAP map served at | `/factory-twin-3d/eap.html` → `eap.js`, `window.__eap`, title "Floor 1 EAP Operational Map" |
| Route decision history | `575c173c` (EAP canonical) → `47f29fcd` (twin canonical) → `cd52b34a` (EAP canonical) → current server.js comment: physical twin canonical, EAP a deliberate layer. |
| Container image (pre-deploy) | built `2026-09-10T01:20`, digest `sha256:7295d15f…`; served `app.js` matched local `42a1ce22`, **not** `origin/perf` (whose `app.js` lacks the full WebGL recovery) |
| Deploy performed | `docker compose build factory-twin-3d && up -d` → new build `706fb094fa5bdd52` |
| Served == committed (post-deploy, LF-normalized) | `eap.js` `947435d2…` == HEAD; `eap.html` `732a7778…` == HEAD ✅ |
| WebGL context-loss banner (user report: "…Reload to recover") | **Not present** in current source or served assets. Current `app.js`/`eap.js` both carry the full lifecycle (`LOST→RESTORING→REBUILDING→VERIFYING→RECOVERED`). Confirmed a stale browser tab (user agreed; a fresh authenticated tab shows banner hidden, 0 errors, canvas rendering — twice). |

The `max-age=0` + `ETag` cache headers on the static assets mean a browser revalidates every load; a stale tab only persists if left open across the deploy without a reload.

---

## Frontend Audit (EAP)

| Area | Result |
|---|---|
| `load()` API path | Hardened (FT-SCADA-AUDIT): try/catch on `fetch`, on `.json()`, `isWellFormedEapPayload()` shape guard; honest headline per failure; `payload` left `null` so nothing downstream mistakes a failed load for data. |
| Polling | **None.** EAP is a static census map (`load()` called once). No `setInterval` for data → task's "no duplicate polling" satisfied by design. |
| Three.js lifecycle | Single render loop (`tick`), gated on `rendererAvailable && payload && cam2d` and on `webglLifecycle ∈ {READY, VERIFYING}`. No per-frame rebuilds. Instanced meshes (columns / cells / zone fills / markers). |
| Context-creation failure | `showCreationFailure()` runs synchronously at module-init if GPU is unavailable; DOM facts (headline, counts, legend, breakdown) still render; renderer refs guarded; click/pointer listeners bound only `if (rendererAvailable)`. |
| Mode / view / fit / drawer / selection | All exercised in the 60-cycle soak and the map regression — no accumulation, no error. |
| Empty / error / loading states | Distinct honest headlines; `#opDataSourceNote` always visible with a mode-aware message. |
| Keyboard / a11y | `<main>` landmark, `aside` labelled + focusable, toggle buttons carry `aria-pressed`, `#webgl-lost` `role="alert"`. axe: 0 violations (see below). |

**Change made:** header simulation toggle now syncs its label + `aria-pressed` from the real initial state on first paint (previously only updated on click).

---

## EAP Semantic Audit

| Check | Result |
|---|---|
| LDI / `/api/state` / `/api/alarm` / `ldi_data` / `machine_state` references in `eap.js`, `eap.html`, `eap-map.js`, `operational-state-adapters.js` | **Zero.** (The only substring hits are `LDI` inside "rebui**LDI**ng".) EAP operational state comes only from `operational-state-adapters.js`. |
| REAL adapter | `isAvailable() → false`, `resolve() → {state:null, quality:UNAVAILABLE, source_type:REAL, reason: "no authoritative APEX3 operational-state source…"}` — always. |
| Production default (post-fix) | `simulationOn = false` → every cell resolves `REAL / UNAVAILABLE`, no substitution. "Live status eligible: 0" shown honestly. |
| Demo mode | Explicit, viewer-initiated (`setSimulation(true)`); `SIMULATION` quality on every generated record; `observed_at` always `null`; deterministic per `cell_id`; `SIM_STATES` excludes `OFF`. |
| `UNDEFINED` / `UNMAPPED` vs machine states | Kept distinct — `UNMAPPED` after a separator, not a 9th state; `UNAVAILABLE`/`NO_DATA` are `quality`, never `state`. |
| 210 cells / 12 zones reconciled | ✅ `factoryStateBreakdown().total === 210`, `reconciled === true`; every zone breakdown sums to its own cell count; 12 zone totals sum to 210. |
| Physical twin "Down N" counter | Real `/api/state` **LDI-device** telemetry on the *physical twin* page, framed as "0 confirmed IMS mappings · Unmapped 433", device-level ("devices down"), never painted onto a floor position. `inspector-e2e` confirms no live-state reaches the scene or inspector and nothing shows `CONFIRMED`. Not an EAP leak (separate page, separate domain). See Deferred DF-1 for the labelling nuance. |

---

## CAD Audit

- `210 cells / 12 zones / 40 DIRECT / 170 layout-only / 171 machine units` served by `/api/eap-map` (from the private `floor1-eap-node-model.json`), unchanged by this work.
- No geometry moved. No machine identity, coordinate, number or mapping invented.
- Private data (`services/factory-twin-3d/private/*.json`, incl. `floor1-cad-bundle.json` 15 MB) confirmed gitignored (`.gitignore:162`), never staged. `git status` clean of it throughout.
- `Apex3Layout/01 LayoutApex3-F1.jpg` not present in this checkout (private); not required for this audit.

---

## WebGL Lifecycle Audit

Verified against **the real authenticated production pages** (not source inspection, not the disposable) — `scratchpad/webgl-prod-verify.js`, using each page's own `simulateContextLoss()` / `simulateContextRestore()` QA hooks (real `renderer.forceContextLoss/Restore`).

| Page | Result |
|---|---|
| Physical Twin `/factory-twin-3d/` | **28/28 PASS** |
| EAP `/factory-twin-3d/eap.html` | **28/28 PASS** |

Each page, per run: starts READY / banner hidden → 3× {force loss → LOST + banner visible + HUD/aside still populated → force restore → back to READY → banner re-hidden → real frames progressed → camera preserved exactly → exactly one loss counted} → loss-during-recovery settles to a single healthy render loop → **0 page/console errors**.

This closes task §3's open question: the physical twin's recovery is now **proven equivalent** to EAP's, on the served assets.

Plus `eap-webgl-context-lifecycle-regression.js` (real forced loss/restore, drawer untouched, 5× repeated cycles with no DOM/loop accumulation, FAILED escalation on no-restore, keyboard-focusable Retry) — PASS, twice.

---

## API Failure Audit

`eap-api-failure-safety-regression.js` — PASS, twice:

| Forced failure | Result |
|---|---|
| HTTP 500 | headline "EAP model not deployed on this host", 0 uncaught |
| 200 + invalid JSON | headline "…malformed response", 0 uncaught |
| 200 + `{}` | headline "…unexpected response shape", 0 uncaught |
| request never resolves | stays "loading…", never a fabricated population |

Network error path (`fetch` throws) → "EAP model unreachable — network error". `/api/floor-geometry` failure is caught separately (`floor = null`, map still renders).

---

## Accessibility Audit

`scratchpad/eap-axe-soak.js`, axe-core 4.10.2, `resultTypes: ['violations']`, EAP mode:

| Mode | 1366×768 | 1440×900 | 1920×1080 | 2560×1440 | 3840×2160 |
|---|---|---|---|---|---|
| production (sim OFF) | 0 | 0 | 0 | 0 | 0 |
| demo (sim ON) | 0 | 0 | 0 | 0 | 0 |

**Full matrix, 0 violations.** Not re-run on the physical twin this pass (prior FT phases carry its axe history) — noted as not-covered, not claimed.

---

## Performance Audit

Physical twin (`factory-twin-regression.js`, disposable):
- 20+ mode switches; geometry-count variance 0, draw-call variance 0 per mode; JS heap 21.7 MB → 21.7 MB (×1.00).
- **FAIL** `mode-switch latency … max 108ms` (rerun: 122ms) vs the 100ms target. **Environmental** — a prior phase's controlled `git worktree` A/B on the *unmodified* baseline failed the same threshold (127ms) on this host under container load (~15 prod containers + the disposable). No code path in this work touches the twin's mode switch.

EAP soak (below): fps recovered 12 → 46 over the run; single render loop (`totalFramesRendered` monotonic 24 → 1065).

Frame-timing p50/p95, initial-load and first-meaningful-render numbers were measured in the **Final Closure Pass** (below): load 102 ms, FCP 148 ms, FMR 363 ms, idle frame p50/p95 33.3/33.4 ms, every interaction single-digit ms in-page. DF-3 closed.

---

## Memory / GPU Audit

`scratchpad/eap-axe-soak.js` — bounded soak, EAP `/eap.html`, 1920×1080:

| Metric | Start | End | Δ |
|---|---|---|---|
| cycles / duration | — | 60 / 36.6 s | — |
| DOM nodes | 196 | 197 | +1 |
| canvases | 3 | 3 | 0 |
| JS heap (MB) | 10.11 | 10.11 | 0.00 |
| three.js geometries | 7 | 2 | −5 (ended in a lower-instance mode) |
| draw calls | 8 | 3 | −5 (same) |
| instanced batches | 3 | 2 | −1 (same) |
| context-loss count | 0 | 0 | 0 |
| **page / console errors** | — | **[] (0)** | — |

Cycle = mode switch + view switch + Fit-floor click + (every 4th) zone-drawer open/close + (every 3rd) random cell pick + viewport resize. No heap growth, no DOM/canvas/batch accumulation, no leaked render loop. A 15-minute / 1668-cycle soak was run in the **Final Closure Pass** (below) — heap flat 10.11 MB across all 16 samples, 0 errors. DF-4 closed.

---

## Security / Privacy Audit

| Item | Finding |
|---|---|
| Secrets / tokens / credentials in EAP frontend | None. |
| Private CAD committed | None. `private/` gitignored; `private-data-leak-scanner.js` + `repo-hygiene-linter.js` PASS. |
| `/api/eap-map`, `/api/floor-geometry`, `/api/floor-raw-cad`, `/api/diagnostics` | All under the proxy's `auth_request /auth-check` (Grafana session) — `proxy/nginx.conf:103`. The container publishes **no host port** (`docker-compose.yaml`), so these are unreachable except through the authenticated proxy. `/api/floor-raw-cad` returns derived numbers (envelope_mm, roles, coverage) — never the raw DWG/DXF — and only to an authenticated caller. This is the existing architecture-level boundary; **no new security architecture introduced.** |
| Source maps | None served. |
| Production/demo boundary | Now correct: demo is opt-in; the REAL adapter is never bypassed unless a viewer turns simulation on. |

---

## Production / Demo Separation

`resolveOperationalState(cell)` → `operationalStateResolver.resolve(cell, { demoModeOn: simulationOn })`:
- `simulationOn === false` (default): returns the REAL adapter's own `UNAVAILABLE` record. **No fallback to SIMULATED.**
- `simulationOn === true`: the single explicit exception — SIMULATED stands in, `quality: SIMULATION`, disclosed by an always-visible `#opDataSourceNote` ("DEMO MODE — SIMULATED") and the header toggle state.

There is no environment variable gating this — it is a per-viewer UI toggle that now ships OFF. An env-gated default was considered and deferred (DF-2).

---

## Bugs Found

| ID | Sev | Description |
|---|---|---|
| B-1 | P1 | `eap.js` `simulationOn` defaulted `true` — production map showed generated states with no opt-in; contradicted the file's own "default-off framing" comment and the no-silent-simulation rule. |
| B-2 | P3 | Header simulation toggle label/`aria-pressed` were only updated on click, not synced to the initial state. |

## Bugs Fixed

| ID | Fix | Verification |
|---|---|---|
| B-1 | `simulationOn = false`; `eap.html` toggle ships "Simulation: OFF" / `aria-pressed=false`; "Simulated status" aside reworded to describe both states; `eap-operational-state-regression.js` gained a "section 0" asserting the production default and now enables demo mode explicitly before the SIMULATED-contract sections (coverage widened, no assertion weakened). | 5/5 EAP suites (×2); axe 0×10; soak 0 errors; fresh authenticated prod browser shows "Simulation: OFF", banner hidden, 0 errors. |
| B-2 | `syncSimToggle(on)` sets both text and `aria-pressed`, called once for the initial state and on every toggle. | axe + the new test's toggle assertion. |

## Deferred Findings

| ID | Sev | Item | Reason | Evidence | Risk | Next action |
|---|---|---|---|---|---|---|
| DF-1 | P3 | Physical-twin status strip shows "Down N / Run N" for LDI devices without an explicit "IMS DEVICES — NOT PLACED ON THIS FLOOR" caption (task §7 wording). | The twin is a separate domain (task §1 says don't modify unnecessarily); the counts are real device telemetry, framed as "0 confirmed IMS mappings · Unmapped 433"; `inspector-e2e` + `factory-twin-regression` already prove no state reaches the scene/inspector and nothing shows `CONFIRMED`. Changing tested twin behaviour needs its own measure→fix→verify cycle and a product call on the exact wording. | `scratchpad/eap-probe.json`; app.js:3229–3335; `factory-twin-inspector-e2e` PASS (19/20). | Low — no fabricated state, honest framing already present. | Add a one-line "device roll-up, not floor state" caption above the strip in a twin-scoped change with the physical-twin suites re-run. |
| DF-2 | P3 | No env-gated production/demo default (`EAP_DEMO_MODE`). | The default is now OFF (safe); an env var is a cleaner separation but more surface, and demo is still reachable by anyone via the toggle. | eap.js:570. | Low. | Add `EAP_DEMO_MODE` (default off in prod compose) if a deployment needs the map to boot in demo without a click. |
| DF-3 | P2 | ~~Frame p50/p95, initial-load, first-meaningful-render not separately instrumented for EAP.~~ **CLOSED 2026-09-10** — see Final Closure Pass. | — | `scratchpad/eap-perf.json`: load 102 ms, FCP 148 ms, FMR 363 ms, idle frame p50/p95 33.3/33.4 ms, interactions single-digit ms. | — | Done. |
| DF-4 | P3 | ~~Only a 60-cycle / ~37 s soak; no 15–30 min run.~~ **CLOSED 2026-09-10** — see Final Closure Pass. | — | `scratchpad/soak.js`: 901 s / 1668 cycles, heap flat 10.11 MB across all 16 samples, 0 errors, frames monotonic. | — | A quiet-host GA soak still advisable before a GA claim, but bounded resource stability is proven. |
| DF-5 | P3 | Physical twin not re-axe'd this pass. | Scope focus on EAP; prior FT phases carry its axe history. | — | Low. | Fold the twin into the axe matrix next FT pass. |

---

## Regression Results

| Suite | Result | Note |
|---|---|---|
| `eap-map-regression` | **PASS** ×2 | |
| `eap-canonical-route-regression` | **PASS** ×2 | root = physical twin, eap.html = EAP, both reachable |
| `eap-operational-state-regression` | **PASS** ×2 | with the new production-default section |
| `eap-webgl-context-lifecycle-regression` | **PASS** ×2 | |
| `eap-api-failure-safety-regression` | **PASS** ×2 | |
| `factory-twin-failure-modes` | **PASS** (11/11) | |
| `factory-twin-inspector-e2e` (vs real prod) | 19/20 | the 1 FAIL is Grafana's own `grafana-lokiexplore-app` / `grafana-exploretraces-app` plugin `module.js` 404s bleeding through the auth shell — not a twin error; all twin assertions (no live-state leak, 0 confirmed mappings, empty overlay) PASS |
| `factory-twin-regression` | 10/11 | the 1 FAIL is `mode-switch latency max 108–122ms` vs 100ms — environmental (prior baseline A/B failed identically on this loaded host); heap flat, 0 accumulation |
| `private-data-leak-scanner`, `repo-hygiene-linter` | **PASS** | |
| pre-commit hook (unit + JSON validation) | **PASS** | |

---

## Production Verification

1. `docker compose build factory-twin-3d` → new image; `up -d` → container `Up (healthy)`, build tag `706fb094fa5bdd52`.
2. Served `eap.js` contains `let simulationOn = false` (count 1), `= true` (count 0).
3. Served == committed (LF-normalized): `eap.js` `947435d2…`, `eap.html` `732a7778…`.
4. Fresh authenticated browser (Grafana login → `/factory-twin-3d/…`):
   - `/factory-twin-3d/` → physical twin, `window.__twin`, banner hidden, 0 console/page/failed requests, canvas rendering.
   - `/factory-twin-3d/eap.html` → EAP, `window.__eap`, **"Simulation: OFF"**, banner hidden, 0 console/page/failed requests, 3 canvases, 210 cells, "Live status eligible: 0".
5. WebGL recovery re-verified on both real pages (56/56).

---

## Remaining Risks

- **Latency threshold** (`factory-twin-regression`) will keep failing on a loaded CI/host runner. It is a threshold-vs-environment mismatch, not a regression; a dedicated idle-host run or a documented tolerance bump is the real fix (out of this scope).
- **`inspector-e2e` console-error assertion** is polluted by Grafana's broken bundled app-plugins. Either fix/remove those Grafana plugins or scope the test's console-error filter to same-origin `factory-twin-3d` errors.
- The map is **honest but sparse** in production default (all UNAVAILABLE). That is correct given no real source — but a viewer expecting a live SCADA board must be told (the `#opDataSourceNote` does this; the toggle label does this).
- `42a1ce22`'s physical-twin WebGL recovery reaches production only through the `integration/andon-layout-safe` lineage (PR #19) or this branch. `origin/perf` / `origin/main` still serve the older `app.js` without it.

---

## Final Closure Pass — 2026-09-10 (PR #20 merge readiness)

Re-verification for the "Final EAP Closure & Production Readiness" brief. Deployed image `sha256:1c43279e2776…` (built `2026-09-10T03:41`, right after `c6cc4e85`); disposable `ims-eap-verify` container (prod image + private data, read-only); real authenticated prod stack for WebGL.

### Serving truth (re-confirmed)

| Fact | Value |
|---|---|
| HEAD | `8dfa44c1` (`fix/eap-scada-floor1-hardening`), `origin` in sync |
| Served `eap.js` == committed (LF-normalised) | `289fc272…` == HEAD ✅ |
| Served `eap.html` == committed | `d21ee950…` == HEAD ✅ |
| Deployed image | `sha256:1c43279e2776…`, container `Up (healthy)` |
| Branch vs base `integration/andon-layout-safe` | 0 behind, 2 ahead; `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN` |
| Base vs `origin/main` | base 8 behind / 176 ahead — PR #19's lineage, not #20's. #20 reaches `main` only when #19 does. |

### Regression re-run (all fresh this pass)

| Suite | Result |
|---|---|
| `eap-canonical-route-regression` | **PASS** — root = physical twin, `eap.html` = EAP, 210 cells / 12 zones / 40 DIRECT |
| `eap-map-regression` | **PASS** — evidence contract, status `UNKNOWN` while unmapped, 1366→3840 no overflow |
| `eap-operational-state-regression` | **PASS** — section 0 production default + demo contract |
| `eap-api-failure-safety-regression` | **PASS** — 500 / bad JSON / `{}` / never-resolves |
| `eap-webgl-context-lifecycle-regression` | **PASS** — loss/restore, camera + selection preserved, 5× repeat no accumulation, FAILED escalation, keyboard Retry |
| `scripts/pre-commit.js` (all unit + all linters + JSON validation + EAP node-model contract) | **PASS** — "All checks passed" |
| `factory-twin-failure-modes` (`TWIN_DIRECT_URL`) | **PASS** 11/11 |
| `factory-twin-regression` | 10/11 — only `mode-switch latency` (108–122ms vs 100ms; one fully-clean run this pass); heap flat, 0 mesh / draw-call accumulation |
| `factory-twin-inspector-e2e` (vs real prod) | 19/20 — the 1 FAIL is Grafana's own `grafana-lokiexplore-app` / `grafana-exploretraces-app` `module.js` 404s + Grafana-Live WS 403; all twin assertions PASS |
| axe-core — EAP prod + demo × 1366 / 1440 / 1920 / 2560 / 3840 | **0 violations**, full 10-cell matrix |
| WebGL recovery on **real prod** (`webgl-prod-verify.js`), both pages | **56/56** — 3× loss/restore + loss-during-recovery, camera preserved exactly, exactly one loss counted each, 0 page/console errors on both pages |

The `factory-twin-failure-modes` "placement route → 401" only reproduces when the suite is pointed at the auth proxy (`GRAFANA_URL`) instead of the service (`TWIN_DIRECT_URL`): the proxy's `auth_request` answers `401` before the app can answer `404`. Against the service directly it is a real `404`. Harness usage, not a regression.

### Performance — measured (closes DF-3)

`scratchpad/eap-perf.js`, disposable container, 1920×1080:

| Metric | Value |
|---|---|
| initial load (`load` event) | 102 ms |
| FCP / first-paint | 148 ms |
| first-meaningful-render (`__eap.ready()`) | 363 ms |
| idle frame delta p50 / p95 / p99 | 33.3 / 33.4 / 50.0 ms (deliberate ~30 fps idle throttle; frame counter monotonic) |
| `setMode` AUTO↔EAP | p50 2.2 / p95 5.4 ms |
| `setView` 2d↔3d | p50 3.6 / p95 7.1 ms |
| Fit floor (`resetCamera`, in-page) | p50 0.2 / max 1.5 ms |
| zone drawer open + close | p50 2.7 / p95 5.0 ms |
| cell pick | p50 0.3 / p95 0.6 ms |

Every user interaction is single-digit ms in-page, well under the 100 ms target. (An earlier 274 ms reading for Fit was Playwright click-actionability RTT, not page cost — the in-page handler is sub-millisecond.)

### Memory — 15-minute soak (closes DF-4)

`scratchpad/soak.js`, disposable container, 1920×1080, crash-resilient (every 60 s sample appended to disk). 16 samples:

| | start | end | Δ |
|---|---|---|---|
| duration / cycles | — | 901 s / 1668 | — |
| JS heap (MB) | 10.11 | 10.11 | **0.00** (10.11 on every one of the 16 samples) |
| DOM nodes | 196 | 197 | +1 (oscillates 196↔231 by active mode, never accumulates) |
| canvases | 3 | 3 | 0 |
| three.js geometries | 7 | 2 | mode-dependent, no monotone growth |
| instanced batches | 3 | 2 | mode-dependent |
| context-loss count | 0 | 0 | 0 |
| `totalFramesRendered` | 20 | 26 250 | monotonic (single render loop) |
| **page / console errors** | — | **0** | — |

Plus the earlier 60-cycle bounded soak (flat 10.11→10.11 MB, 0 errors) and a 103-cycle interim reading from a first long run whose scratchpad was wiped mid-run (heap 10.11 MB, 0 errors).

### Deferred findings — merge classification

| ID | Sev | Classification | Rationale (evidence) |
|---|---|---|---|
| DF-1 | P3 | **ACCEPTABLE-DEFER** | Physical-twin status-strip caption wording. Separate page/domain — task §1 & §8 say do not modify the twin unnecessarily. `inspector-e2e` + `factory-twin-regression` + `webgl-prod-verify` prove 0 fabricated state, 0 `CONFIRMED` badges, honest "0 confirmed IMS mappings · Unmapped 433" already on screen, no LDI state on a floor position. Cosmetic. Not a blocker. |
| DF-2 | P3 | **ACCEPTABLE-DEFER** | Env-gated demo default (`EAP_DEMO_MODE`). Default is already OFF (safe); an env var is cleaner separation but more surface and does not change production behaviour. Not a blocker. |
| DF-3 | P2 | **CLOSED** this pass | p50/p95 + load + interaction latencies measured above. |
| DF-4 | P3 | **CLOSED** this pass | 15-min / 1668-cycle soak, heap flat across all 16 samples, 0 errors. A quiet-host GA soak is still advisable before any GA claim, but the merge-relevant question (bounded resource stability) is answered. |
| DF-5 | P3 | **ACCEPTABLE-DEFER** | Physical-twin re-axe. EAP is this PR's scope; prior FT phases carry the twin's axe history. Belongs to the next FT pass. Not a blocker. |

### Self-review of the diff

4 files, +313 / −10. `eap.js`: `simulationOn = false` + `syncSimToggle` helper. `eap.html`: toggle default `aria-pressed=false` + reworded "Simulated status" aside. `eap-operational-state-regression.js`: section 0 + explicit demo enable (coverage widened, no assertion weakened). No secrets, no CAD, no `.env`, no accidental files. `simToggleBtn` closure + `setSimulation` module-var mutation verified — no dangling-state bug. `.github/copilot-instructions.md` (pre-existing unrelated ` M`) left untouched.

### Merge criteria (brief §16)

| Requirement | State |
|---|---|
| no true blocker | ✅ |
| required checks pass | ✅ (no CI checks bound to this branch; full local suite green) |
| regression passes | ✅ (5/5 EAP + full unit/lint + failure-modes direct + one fully-clean twin-regression run) |
| accessibility passes | ✅ (0 / 10 axe) |
| production/demo separation | ✅ |
| CAD integrity | ✅ (194/194 vertices, CAD-reconciliation unit test, geometry untouched) |
| EAP/LDI separation | ✅ (0 operational refs) |
| WebGL recovery | ✅ (56/56 real prod + 5/5 lifecycle suite) |
| branch state understood | ✅ (0 behind base, MERGEABLE / CLEAN) |
| diff focused, no accidental files | ✅ |

**PR #20 scope verdict: `READY TO MERGE`** into `integration/andon-layout-safe`. PR flipped Draft → Ready for Review. The merge click is left to the repo owner: the base is itself an unmerged integration branch (PR #19), so the merge order / target is the owner's call.

Full brief §25 `FINAL PASS` (whole repo) is still not claimable: criterion 28 stays PARTIAL for two documented non-EAP failures (`factory-twin-regression` latency threshold on a loaded host; `factory-twin-inspector-e2e` Grafana-plugin console noise), and DF-1 / DF-2 / DF-5 are twin-side / infra deferrals outside this PR's scope.

---

## Final Success Criteria

| # | Criterion | Status |
|---|---|---|
| 1 | canonical `/factory-twin-3d/` serves the intended app | **PASS** — serves the physical twin by current design; EAP at `/eap.html`. (Task premise "root = EAP" does not match the committed architecture; audited both.) |
| 2 | source and deployed assets match | **PASS** (LF-normalized) |
| 3 | EAP Playwright 5/5 | **PASS** ×2 |
| 4 | no frontend uncaught errors | **PASS** (EAP); twin 0 errors in WebGL run |
| 5–8 | API failure / malformed JSON / empty / network / timeout | **PASS** |
| 9–11 | EAP 0 LDI refs / no LDI leak / no fake machine state | **PASS** |
| 12 | no silent simulation fallback in production | **PASS** (fixed) |
| 13 | demo simulation explicitly disclosed | **PASS** |
| 14–15 | 210 cells / 12 zones reconciled | **PASS** |
| 16 | CAD geometry still validated | **PASS** (untouched; `floor1-geometry-validator` PASS) |
| 17–20 | WebGL creation-fail / loss / restore / recovery verified | **PASS** (56/56 on real prod, both pages) |
| 21–22 | no duplicate render loop / polling | **PASS** (EAP has no polling; single loop) |
| 23 | no resource growth in bounded soak | **PASS** (60 cycles + 15-min / 1668-cycle soak, heap flat 10.11 MB across all 16 samples) |
| 24 | axe = 0 for completed matrix | **PASS** (EAP prod+demo ×5 res) |
| 25 | responsive layouts verified | **PASS** (EAP, 0 horiz overflow 1366→3840; aside is an intended scroll panel) |
| 26–27 | privacy / secrets clean | **PASS** |
| 28 | regression clean | **PARTIAL** — 2 documented non-EAP failures (twin latency threshold on a loaded host; Grafana-plugin console noise in `inspector-e2e`), not fixed here |
| 29 | production serving verified from a fresh authenticated browser | **PASS** |
| — | EAP frame p50/p95 (DF-3), 15-min soak (DF-4) | **CLOSED** in the Final Closure Pass above |
| — | twin axe (DF-5), twin caption (DF-1), env-gated demo (DF-2) | **ACCEPTABLE-DEFER** — twin-side / infra, outside this PR's scope |

**PR #20 scope: `READY TO MERGE`.** The primary defect is fixed, deployed and verified; the EAP frontend is technically and semantically correct, robust, and honest about the absent real source; the full EAP regression + a11y + WebGL + 15-min soak are green.

**Whole-repo brief §25 `FINAL PASS`: not claimed** — criterion 28 stays PARTIAL for the two documented non-EAP failures, and DF-1 / DF-2 / DF-5 are deferred by evidence (twin-side, not this PR's scope).
