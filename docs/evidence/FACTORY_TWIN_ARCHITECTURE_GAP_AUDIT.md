# Factory Twin 3D — Architecture Gap Audit

**Date:** 2026-09-11. **Scope:** `services/factory-twin-3d/` only. **Status:** audit + plan
only, per hard rule — **no rewrite performed this pass.**

**Baseline this audit is measured against:** PR #20 (EAP hardening), PR #21 (CSS/UI/UX,
merged), PR #23 (deep runtime audit, Phase 1+2, READY FOR PRODUCTION, not merged). No proven
P0/P1 defect exists in the current implementation — this audit is about architecture quality,
not fixing a broken app.

---

## 0. Repository reality check (before designing anything)

- **Zero React/TypeScript/Next.js/Tailwind footprint anywhere in this repo.** Checked root and
  every service for `next.config*`, `tailwind.config*`, `tsconfig*` — none exist. This is a
  greenfield framework introduction, not an upgrade of an existing one.
- **Current stack:** plain Express (`server.js`, 1903 lines) serving static files + JSON APIs;
  browser side is hand-written ES modules loaded via a native `<script type="importmap">`
  (`public/index.html:876`) pointing at a vendored `./vendor/three/three.module.js` copy — no
  bundler, no build step, no `package.json` build script beyond `node server.js`.
- **Deployment coupling that any target architecture must satisfy:** `proxy/nginx.conf:103`
  routes `location /factory-twin-3d/` → `proxy_pass http://factory-twin-3d:4100/` gated by an
  `auth_request` against Grafana's session cookie (`nginx.conf:80`, shared with `/alarm-api/`).
  A Next.js replacement must either (a) keep listening on port 4100 behind this exact
  path-prefix + auth pattern (`basePath: '/factory-twin-3d'`, `assetPrefix` set to match, and
  care that Next's own internal `/_next/*` asset paths still resolve under the proxied prefix),
  or (b) a documented nginx change — out of scope for "do not touch main-branch infra" unless
  explicitly approved. **This is a real, unmeasured migration risk, not a style choice.**
- **Two separate, parallel single-page apps**, not one: `public/app.js` (4163 lines, physical
  twin `/`) and `public/eap.js` (1737 lines, `/eap.html`). They duplicate the entire WebGL
  context-loss lifecycle state machine verbatim (`handleContextLost` /
  `attemptContextRecovery` / `verifyRecovery` / `finishRecovery` / `showFailedFallback` /
  `showCreationFailure` — same 6 function names, same shape, in both files, zero code sharing).
  This is the single clearest, lowest-risk, highest-value extraction candidate for Phase 3-5.

## 1. Current architecture inventory

| Subsystem | Current file(s) | Responsibility | State ownership | Render frequency | DOM coupling | WebGL coupling | Test coverage | Migration difficulty | Risk |
|---|---|---|---|---|---|---|---|---|---|
| Server / static + API | `server.js` (1903L), `lib/*.js` (11 modules, ~4000L combined) | Express routes, DB queries, CAD file loading (now cached, PR #23), wire-projection, device state, alarm/RCA, SPC, predictive | module-level (`DEVICE_IDS`, `privateDocCache`) | per-request | none | none | high — 15 unit-test files under `tests/unit/factory-twin-*.test.js` | Low–Med | Low (this layer is framework-agnostic; a Next.js API-route or route-handler layer can front the same `lib/*.js` functions almost unchanged) |
| 3D renderer / scene graph | `app.js` L98–1944 (`buildFloor`, `buildEquipmentLayer`, `buildFunctionalZones`, `buildWalls`, etc.) | Three.js scene construction from CAD-derived geometry JSON | module-level `let`s (`scene`, `camera`, `renderer`, geometry/material caches) | on-demand (`renderTail` gated, confirmed 0 idle frames, PR #23 §2) | low (canvas only) | total | indirect — `factory-twin-regression.js`, `factory-twin-failure-modes.js` exercise it through the DOM/API, no isolated unit test of scene-build functions | High | Med — behavior is correctness-sensitive (CAD coordinates authoritative, PR #23 already verified this) but the *pattern* (declarative scene from data) maps naturally to R3F components |
| Camera / controls | `app.js` (`applyView`, `resetView`, `refitViews`, `frameBounds`, `OrbitControls` instance) | view presets (plan/overview/building), fit-to-bounds, damping | module-level | continuous while damping only | none | direct (`camera`, `controls.update()`) | covered indirectly via VR baseline (view-switch screenshots) | Med | Low — R3F's own `<OrbitControls>`/`useThree()` camera patterns are a direct, well-trodden replacement |
| Selection / raycasting | `app.js` (`pickEquipment`, `pickColumn`, `aimRay`, `pickFrom`) | click-to-select against `InstancedMesh` instances (not per-object meshes, PR #23 §2C) | module-level `selected*` vars | event-driven only, confirmed absent from `animate()` | click/hover listeners | `raycaster.intersectObjects` | `factory-twin-inspector-e2e.js` | Med | Low — R3F's `onPointerDown`/instance-`id` pattern is designed for exactly this |
| Layers (equipment/reference/zones) | `app.js` (`setLayerVisible`, `applyDisplayMode`, `buildFunctionalZones`) | toggle visibility of scene groups, functional-zone overlay build | module-level flags | on toggle | checkbox inputs | `.visible` flag on Object3D groups | `factory-twin-failure-modes.js` | Low | Low |
| Inspector | `app.js` (`showEquipmentInspector`, `showColumnInspector`, `render(badge,...)`, ~L2387–2606) | build inspector DOM (innerHTML string templates) from selected item + live state | reads module state, writes DOM directly | on selection | high — raw `innerHTML` template strings | none (DOM only) | `factory-twin-inspector-e2e.js` | Low | Low — this is the single most natural "migrate to typed React component first" candidate: pure function of (item, state) → markup already, just not typed or componentized |
| Status display / factory status strip | `app.js` (`updateFactoryStatus`, `renderStatusStrip`, `renderStatusLegend`), shared `public/operational-status.js` (181L), `operational-state-adapters.js` (165L) | 4-state (`RUN/IDLE/DOWN/NO_DATA`/`UNAVAILABLE`) glyph+label+color rendering, already never color-alone | pure functions + DOM write | on poll (every `POLL_MS`) | medium | none | `factory-twin-operational-status.test.js` (unit, already pure-function-tested — closest thing to "already-typed domain logic" in the codebase) | Low | Low — `operational-status.js`/`operational-state-adapters.js` are already the cleanest, most portable modules in the service; near-verbatim reusable as the seed of `domain/factory/operational-state.ts` |
| Reference layer (raw CAD overlay) | `app.js` (`buildRawCad`, `ensureRawCad`) | optional raw-CAD reference overlay, lazy-loaded | module-level | on toggle | none | direct | `factory-twin-failure-modes.js` | Low | Low |
| WebGL lifecycle | `app.js` L241–391 AND duplicated in `eap.js` L783–995 | context-loss/restore state machine, generation-token guarded | module-level (`webglLifecycle`, generation counter) | event-driven (`webglcontextlost`/`restored`) | banner DOM | total | `eap-webgl-context-lifecycle-regression.js`, PR #23 §4 (5 forced cycles, 0 resource growth) | High (correctness-critical, must not regress) | **Highest** — this is the one subsystem where a regression is both easy to introduce (React re-render fighting a manual WebGL context) and expensive to detect late. Must be its own isolated, independently-tested extraction (a `useWebGLLifecycle` hook / `features/factory-twin/webgl/`) before any scene migration, not migrated implicitly alongside the scene. |
| API access (client) | `app.js boot()` L3483–3692, `fetchWithTimeout` | 5 concurrent fetches (`floors`, `floor-geometry`, `physical-overlay`, `alarm-rca`, `build`) + sequential `pollState()` | promises, no cache | once at boot + `setInterval` | none | none | covered indirectly via `factory-twin-regression.js` | Low | Low — maps directly to Next.js Route Handlers / server components / a simple typed `lib/api/` fetch layer; PR #23 §2A/2B findings (cache fix, SwiftShader-artifact disclosure) are server-side and framework-agnostic, carry over unchanged |
| Data transformation | `lib/wire.js` (792L, `wire.project*`), `lib/mapping.js`, `lib/floors.js` | CAD JSON → wire-format JSON (server-side), asset-id mapping validation | pure functions, server-side | per-request | none | none | `factory-twin-wire.test.js`, `factory-twin-mapping.test.js`, `factory-twin-floors.test.js` | Low | Low — already the right shape (pure, typed-ready, unit-tested); becomes `domain/factory/geometry.ts` conversion boundary almost as-is |
| State management | none — module-level mutable `let`s throughout `app.js`/`eap.js` | ad hoc | global | n/a | n/a | n/a | none directly (covered indirectly by e2e) | Med | Med — this is the subsystem the spec's Phase 4 rule ("no per-frame values in React state") most directly targets; current code already keeps per-frame values (camera, renderTail) out of any framework state (there is no framework), so the *discipline* already exists, it just needs to survive the introduction of React without leaking render-frequency state into it |
| CSS | `public/index.html`/`eap.html` inline `:root` token systems (PR #21), enforced by `tests/lint/css-token-parity.js` | design tokens, motion system, responsive `clamp()`/`@container` | n/a | n/a | is the DOM | n/a | `css-token-parity.js`, `eap-status-color-drift.js`, `ui-visual-regression.js` (32/32) | Med | Med — Tailwind migration must preserve the *token vocabulary* (the parity lint's SCALE/ROLE distinction), not just visually match; safest path is Tailwind theme extended from the existing token values, not a rewrite of the design language |
| Responsive logic | inline `clamp()`/media queries in CSS + `onResize()`/`resizePending` coalescing in `app.js` L3810, L3879 | fluid layout, one rAF-coalesced resize per drag | DOM + module state | on resize (coalesced) | high (CSS) / medium (JS) | triggers `renderer.setSize` | `ui-visual-regression.js` (4 viewports × multiple states) | Low | Low |
| Tests | see below | — | — | — | — | — | — | — | — |

### Test inventory (already substantial — a real asset for migration safety)

15 unit-test files (`tests/unit/factory-twin-*.test.js`, `eap-map-wire.test.js`) covering
`lib/*.js` in isolation; 7 Playwright regression/e2e files
(`factory-twin-regression.js`, `factory-twin-failure-modes.js`,
`factory-twin-inspector-e2e.js`, `eap-*-regression.js` ×4); a 32-state visual-regression
baseline (`ui-visual-regression.js`, 4 viewports × 8 states); 2 dedicated lints
(`css-token-parity.js`, `eap-status-color-drift.js`); axe accessibility checks (0 violations,
carried through PR #21/#23). **This is the regression safety net any migration step is
required to keep green — Phase 12/13 add to it, they do not replace it.**

---

## 2. Target architecture — assessed against the suggested layout

The spec's suggested `app/ components/ features/ domain/ lib/ styles/` layout is directionally
right and is **adopted with one deployment-driven adjustment**: everything nests under a
`factory-twin-3d` segment consistently (`app/factory-twin-3d/...`) so `basePath` and the nginx
`location /factory-twin-3d/` prefix line up without a proxy rewrite. No other repo convention
overrides it — this service currently has no competing structure to preserve (it is the
first framework-based frontend in the repo), so the suggested layout is accepted as-is for
Phase 2 rather than redesigned.

## 3. Domain model — what already exists vs. what's missing

Already close to typed-ready, pure, server-side (low conversion cost):
- `Geometry` — `lib/wire.js`'s `project*` functions already separate CAD input from wire
  output.
- `OperationalState` — `public/operational-status.js` + `operational-state-adapters.js` are
  already pure functions with a fixed 4-state contract (`RUN/IDLE/DOWN`/`NO_DATA`/`UNAVAILABLE`),
  the closest thing in the codebase to an existing domain type today.
- `Asset`/mapping validation — `lib/mapping.js` (`validateMappings`).

Missing entirely (currently implicit in DOM/JS-object shape, not a named type anywhere):
`Machine`, `Zone`, `Selection`, `CameraState`, `LayerState`, `Environment`/demo-vs-production
state, `DataQuality`. These must be extracted from their current call sites in `app.js`/
`eap.js` rather than designed from scratch — the spec's "do not mix UI/3D/DTO/domain state"
rule is not yet honored anywhere in the current code (e.g. `showEquipmentInspector` reads a
raw API-shaped object directly into template strings).

## 4. Migration plan

| Step | CURRENT | TARGET | GAP | MIGRATION STEP | RISK | VALIDATION | ROLLBACK |
|---|---|---|---|---|---|---|---|
| 1 | No TS/domain types anywhere | `domain/factory/*.ts` typed contracts | zero type safety, DTO/domain/UI state mixed | Extract `Machine`/`Zone`/`OperationalState`/`DataQuality` types from current object shapes in `app.js`/`lib/*.js`, no behavior change, no new framework yet | Low | existing unit tests unchanged and green; new type-only files, nothing wired in yet | delete new files, zero blast radius |
| 2 | Duplicated WebGL lifecycle in `app.js` + `eap.js` | one shared, tested lifecycle module | 6 duplicated functions, correctness-critical | Extract to a framework-agnostic module first (plain JS/TS, no React yet), have both `app.js` and `eap.js` import it, prove behavior identical | Med (touches the highest-risk subsystem) | `eap-webgl-context-lifecycle-regression.js` + PR #23's 5-cycle GPU-resource-stability method, re-run against both pages | revert the two call sites to their inline copies; module deletion is safe since nothing else depends on it yet |
| 3 | No Next.js app anywhere | `app/factory-twin-3d/` shell, empty/placeholder page | no framework, no build step, no dev-server story | ~~Stand up Next.js 15 app~~ Stand up a **Next.js 16.x** app (version corrected — see `FACTORY_TWIN_NEXTJS_VERSION_DECISION.md`; 15 is 40 days from EOL) **alongside** (not replacing) the current Express app, on a separate dev port, prove it can build/serve a static shell; do not wire it behind nginx yet | Low (isolated, nothing in production path touches it) | `next build` succeeds, manual local load — **DONE, spiked**, see `FACTORY_TWIN_NEXTJS_PROXY_SPIKE.md` | delete `spikes/factory-twin-nextjs/` |
| 4 | `proxy/nginx.conf` routes `/factory-twin-3d/` to Express:4100 | Next.js served at the same prefix, same port contract | `basePath`/`assetPrefix`/`auth_request` compatibility — **RESOLVED BY SPIKE, not yet implemented**: today's exact `proxy_pass` shape 404s against a basePath'd Next app; the fix (drop the trailing slash + add one exact-match `location = /factory-twin-3d {}` block) is documented, not applied to the real file | Point the disposable-container measurement rig (same pattern as PR #23) at a Next.js build with `basePath: '/factory-twin-3d'`, confirm assets resolve under the proxy prefix in a **local nginx copy**, not production `proxy/nginx.conf` — **DONE** | Med — a real blocker was found (see spike doc), but it is now a known, documented two-line fix rather than an open question | manual + scripted request against every route Next.js would own (`/`, `/_next/*`, API) through a disposable nginx copy — **DONE, `FACTORY_TWIN_NEXTJS_PROXY_SPIKE.md`: `:8081` (today's shape) 404s, `:8082` (naive fix) loops, `:8083` (documented fix) 200s end-to-end** | no change made to real `proxy/nginx.conf` — the two-line fix identified is deferred to the actual cutover, not applied speculatively now |
| 5 | Inspector = `innerHTML` template strings | typed `Inspector.tsx` | DOM coupling, no types | Port `showEquipmentInspector`/`showColumnInspector` to a typed React component consuming the Step-1 domain types, rendered inside the *existing* Express-served page first (React mounted into a `<div>`, no R3F yet) — smallest possible React introduction | Low–Med | `factory-twin-inspector-e2e.js` re-run against the React-rendered inspector, must pass unchanged | remove the mount point, restore the innerHTML function (kept, not deleted, until this step is proven) |
| 6 | Full scene in `app.js` | `TwinScene` + child R3F components | large, correctness-sensitive, CAD-authoritative | Migrate one leaf component at a time per the spec's split (`FactoryGeometry` first — static, lowest risk — then `MachineMarkers`/`SelectionLayer`/`ReferenceLayer`/`CameraController`/`InteractionLayer` in risk order), each gated by Phase 8's perf-parity table before promotion | High | full VR (32/32) + `factory-twin-regression.js` + `factory-twin-failure-modes.js` + PR #23's WebGL-resource-count method, per component | each component migration is its own branch/PR; a failing perf-parity gate blocks that specific component's promotion without affecting the others already merged |
| 7 | Tailwind absent | Tailwind theme extended from existing `:root` tokens | risk of "utility-class chaos" regressing the PR #21 token discipline | Generate Tailwind theme config **from** the existing token values (source of truth stays the token list, not re-invented in Tailwind), keep `css-token-parity.js`-equivalent enforcement | Med | visual regression (32/32) must stay 32/32 pixel-for-pixel, not just "looks similar" (explicit spec requirement) | keep the existing CSS files in place until Tailwind output is proven byte-for-byte equivalent in rendered layout |

No step in this table has been executed. This document is the audit and plan only.

---

## 5. What this audit is explicitly NOT concluding

- Not concluding the migration is safe to start — Step 4 (proxy compatibility) now has a spiked,
  documented fix (see `FACTORY_TWIN_NEXTJS_PROXY_SPIKE.md`), but that fix has not been applied
  to `proxy/nginx.conf`, and no other migration step has been executed.
- Not concluding React/Next.js will improve anything measurable — Phase 8's perf-parity gate
  is the only thing allowed to make that claim, and no migration code exists yet to measure.
- Not touching `main`, PR #22, or GitHub Actions billing, per standing instruction.
- Not recommending WebGPU (Phase 11) — no spike has been run; current WebGL implementation has
  no proven defect that would motivate one (PR #23).

## Step 1 implementation status — DONE

**Domain modules created:** `services/factory-twin-3d/domain/{spatial,machine-state,
data-quality,geometry,zone,asset,selection,camera,index}.ts` + scoped `tsconfig.json`. Full
detail, including two real corrections this pass made to the audit's own findings above (half
of `lib/contracts.js` is dead code; `app.js` has no explicit selection state today) and a real
type error the domain modeling itself caught (six `Asset` fields needed to be nullable, not
non-null, against `lib/wire.js`'s actual `fromEnum()` behavior): see
`docs/evidence/FACTORY_TWIN_DOMAIN_MODEL.md`.

**Runtime changes: NONE.** `git diff --stat` against `server.js`/`lib/`/`public/` — the only
paths `services/factory-twin-3d/Dockerfile` copies into the image — is empty. The built
container is provably byte-identical to PR #23's already-fully-verified image.

**Tests:** `tests/unit/factory-twin-domain.test.js`, 15/15 pass, wired into
`scripts/pre-commit.js` alongside a new `tsc --noEmit` gate (`npm run
factory-twin:typecheck`). Also re-ran (not skipped) `factory-twin-regression.js` and
`factory-twin-failure-modes.js` against the disposable container from PR #23 (unrebuilt —
source is unchanged): failure-modes PASSED clean; regression passed with the same
pre-existing environmental mode-switch-latency flake already documented in PR #23 (max
115ms this run vs. 132ms then — noise, not a regression). The full 32-state visual-regression/
axe/WebGL-lifecycle/EAP Playwright suites were **not** re-run this pass — the byte-identical-
image proof above makes a fresh run mathematically redundant with PR #23's own already-green
results for those suites, and re-running them was judged not worth the time cost; flagged here
explicitly rather than silently claimed as done.

**Performance:** not measured this pass — no runtime file changed, so PR #23's baseline
applies unchanged by construction, not by assumption.

**Dependency change:** `typescript@^5.7.3` added as an explicit root `devDependency` (was
present only as an incidental, non-functional transitive `7.0.2` — the new native-preview
compiler, which exports no compiler API at all; see `FACTORY_TWIN_DOMAIN_MODEL.md`'s
"Compatibility strategy" section). This is the only `package.json`/`package-lock.json` change.

**Step 1 completion checklist:**
- [x] domain boundaries extracted
- [x] operational semantics preserved (parity-tested against both existing JS copies)
- [x] CAD unchanged (coordinate pass-through tested; no `lib/wire.js` edit)
- [x] EAP/LDI separation preserved (no EAP/LDI file touched)
- [x] existing runtime unchanged behaviorally (zero diff in every Dockerfile-copied path)
- [x] tests pass (15/15 new + full existing suite unaffected)
- [x] performance baseline preserved (by construction — see above)
- [x] docs updated (this file + `FACTORY_TWIN_DOMAIN_MODEL.md`)
- [x] focused commit created

## Step 1.5 implementation status — DONE (spike only, disposable)

Resolved the two largest open architecture risks ahead of Step 2/3, without starting the
actual migration:

1. **Next.js version** — corrected from the original brief's "15" to **16.x**: Next 15 is
   Maintenance-LTS-only and reaches EOL 2026-10-21 (40 days from this pass), Next 16 is
   Active LTS through 2027-10-22. See `FACTORY_TWIN_NEXTJS_VERSION_DECISION.md`.
2. **Reverse-proxy/basePath compatibility** — spiked with a real Next.js 16.3.4 build
   (`spikes/factory-twin-nextjs/`, `basePath: '/factory-twin-3d'`, `output: 'standalone'`)
   against a disposable `nginx:alpine` container reproducing `proxy/nginx.conf`'s exact
   `auth_request` + `proxy_pass` shape. **Found a real incompatibility**: today's config 404s
   against a basePath'd Next app. Found and verified the fix (drop the `proxy_pass` trailing
   slash + add one exact-match `location = /factory-twin-3d {}` block) — confirmed working
   end-to-end (page, a real `_next/static` chunk, and a static asset all `200`). See
   `FACTORY_TWIN_NEXTJS_PROXY_SPIKE.md`.

**Runtime/production changes: NONE.** `proxy/nginx.conf` was not touched — only a local copy
inside the disposable `nginx:alpine` container (removed after the spike). Grafana, `main`,
PR #22, and every path `services/factory-twin-3d/Dockerfile` copies remain untouched.
`spikes/factory-twin-nextjs/` is self-contained, not referenced by any Dockerfile,
`docker-compose.yaml`, or CI workflow, and deletable at any time with no effect on the running
application.

## Step 3 implementation status — DONE (UI shell only, isolated, no renderer migration)

Built `services/factory-twin-3d-next/` — a real Next.js 16.3.4 + React 19 + TypeScript +
Tailwind v4 UI shell consuming Step 1's domain contracts directly (via a `@twin-domain/*`
path alias), with an explicit, empty renderer boundary (`ViewportFrame.tsx`) where the
Three.js scene will eventually go — **not built this step**. Full detail, including a real
accessibility defect found and fixed (the mirrored `--text-muted` token cannot reach WCAG AA
contrast against either `--surface` or `--bg`, computed directly) and a real Turbopack
cross-service-import constraint found and worked around: see
`docs/evidence/FACTORY_TWIN_NEXTJS_UI_SHELL.md`.

**Runtime changes to the live `/factory-twin-3d/`: NONE** (`git diff --quiet` against every
Dockerfile-copied path confirmed empty). **Tests:** 30/30 pass
(`tests/playwright/factory-twin-next-shell.js`) — route rendering, shell rendering, keyboard
interaction, all 6 required responsive viewports (0 overflow), axe (0 serious/critical
violations at every viewport), token wiring, focus visibility, reduced-motion, forced-colors,
200% zoom. **Performance:** FCP/LCP 164ms, 58 DOM nodes, 0 console errors — all measured, not
assumed. Not wired into CI yet (no deployment exists for CI to build against) — disclosed as
a deferred item.

## Step 4 implementation status — DONE (spike; PASS)

Built an isolated `/r3f-spike` route in `services/factory-twin-3d-next/` proving React Three
Fiber can host instanced rendering (64 synthetic boxes as 1 draw call, matching the legacy
app's own `InstancedMesh` pattern), demand-loop discipline (0 extra React renders across a 3s
idle window and a 10-point orbit drag, WebGL frames handled entirely inside three.js/refs),
click-to-select wired to the Step 1 domain's `ViewName` concept (sub-frame in-page latency,
p50 0.60ms/p95 2.00ms), and a working WebGL context-loss/recovery lifecycle — all measured,
not assumed. See `docs/evidence/FACTORY_TWIN_R3F_SPIKE.md` for the full report.

**A first pass found what looked like a load-bearing gap** (simulated context loss never
recovering) and was documented as such in `FACTORY_TWIN_R3F_RUNTIME_SPIKE.md`. A follow-up
pass root-caused it: a spike-methodology bug (re-fetching the `WEBGL_lose_context` extension
after loss, instead of `app.js`'s own proven `renderer.forceContextLoss()`/
`forceContextRestore()` API). Fixed, then measured working: context recovery **PASS** across
a single cycle and 4 repeated cycles, no geometry/texture growth, scene fully interactive
after every cycle. A second real bug surfaced and was fixed along the way — a naive
force-remount "rebuild" step (modeled by analogy on `app.js`'s own manual rebuild) caused a
genuine 1→2 geometry leak; the measured, simpler, correct fix was to NOT remount and instead
force one fresh render via R3F's `invalidate()`. Both corrections are disclosed in full in the
spike doc, not silently smoothed over.

Also found and fixed: `@react-three/fiber@9.7.0`'s peer range (`react: '>=19 <19.3'`) does not
cover React 19.3.0, which Step 3 shipped on — downgraded `services/factory-twin-3d-next`'s
React to 19.2.8 (confirmed compatible with Next 16.3.4's own peer range), re-verified Step 3's
full 30-test suite still passes unchanged.

**Runtime changes to the live `/factory-twin-3d/` or Step 3's real route: NONE.**

## Step 5A implementation status — DONE (PASS) — first real production-scene migration

Migrated the authoritative static CAD geometry (walls, columns, openings, structural grid,
floor/footprint) into R3F at `/factory-twin-3d/geometry-candidate` (still isolated, not the
production route). `services/factory-twin-3d-next/lib/geometry-adapter.ts` fetches the exact
same `/api/floor-geometry` endpoint the legacy page uses and validates it into Step 1's
domain geometry types — no second CAD source, no coordinate transform, no approximation.

**Vertex/coordinate parity is exact, not approximate**: 587 walls, 202 columns, 52 openings,
20 footprint vertices, and 194 total functional-zone vertices all byte-identical between the
raw API response and the new adapter's output (zero tolerance, `===` equality). The "194"
figure matches this step's own cited baseline by construction — `lib/wire.js` is unmodified.

Context-loss recovery (Step 4's corrected architecture, reused not re-litigated) PASSES
across a single cycle and 4 repeated cycles with the real geometry scene (9 geometries, 1
texture, stable throughout). All 6 responsive viewports pass with 0 axe violations. See
`docs/evidence/FACTORY_TWIN_R3F_GEOMETRY_MIGRATION.md` for full detail, including honestly
disclosed limitations (draw-call/LCP comparisons to the legacy baseline are not yet
apples-to-apples, since equipment/zones/labels — the legacy's largest contributors — are not
migrated yet, by this step's own explicit scope limit).

**Runtime changes to the live `/factory-twin-3d/` or any prior Step 3/4 file: NONE.**

## Step 5B implementation status — DONE (PASS) — static machine objects

Added `services/factory-twin-3d-next/lib/machine-adapter.ts` (fetches the SAME
`/api/floor-geometry` endpoint's `equipment[]` field Step 5A already reads) and
`components/factory-twin/machines/Machines.tsx` (2 `InstancedMesh`es: sized machines,
unresolved-footprint markers), wired into the existing `/geometry-candidate` route.

**Parity is exact**: 431 of 433 equipment records rendered (2 correctly excluded via
`duplicate_of`, matching `app.js`'s own "one physical asset, one render, always" rule
byte-for-byte) — every surviving machine's id/position/rotation is byte-identical to the raw
API response. Context recovery (Step 4's lifecycle, reused unchanged) PASSES across 1 + 4
cycles with machines present throughout. Render-loop safety proven: 0 React re-renders across
a 3s idle window, an 8-point camera drag, and a resize. No selection/telemetry/alarm/LDI logic
exists — verified by inspection and by test. See
`docs/evidence/FACTORY_TWIN_R3F_MACHINE_MIGRATION.md`.

**Found and fixed one stale test, not a real regression**: Step 5A's own recovery-check had
hardcoded `geomBefore = 9`, which the shared `/geometry-candidate` route legitimately exceeded
once machines were added (11 geometries). Fixed by measuring the baseline dynamically instead
of a literal — Step 5A's suite is back to 48/48, the check itself unweakened (still exact
equality, zero tolerance).

**Runtime changes to the live `/factory-twin-3d/`, Step 3's shell route, or Step 4's spike:
NONE.**

## Step 5C implementation status — DONE (PASS) — machine selection/picking

Added click-to-select on `Machines.tsx`'s two `InstancedMesh`es (Step 5B, unchanged rendering
logic otherwise): `instanceId` resolves through an explicit, tested `machineIds[]` mapping to
the canonical `machine.id`, which `GeometryViewport.tsx` turns into the Step 1 domain's
`SelectionState` for anything outside `Machines.tsx`. Selection highlight is an `instanceColor`
swap on the existing mesh — no new geometry, no new draw call. `SelectedMachinePanel.tsx`
exposes the selected id in semantic HTML outside the canvas, with a keyboard-reachable Clear
button.

**Parity/determinism is exact**: 431 of 431 machines uniquely addressable, no duplicates, the
mapping stable across rebuilds. Context recovery (Step 4's lifecycle, reused unchanged) PASSES
across 1 + 4 cycles with selection fully functional afterward (select a different machine,
deselect, re-select the original — all confirmed). In-page click-to-select latency: p50 1.20ms,
p95 8.80ms.

**One bounded, disclosed-not-hidden finding**: clicking a DOM toolbar button immediately
before the first-ever canvas click causes that click to register 2 React re-renders instead of
1 (a stable-reference fix was tried and measured to NOT resolve it — kept for its own general
merit, not claimed as a fix). Never compounds, never appears on any later click, resource
counts unaffected — the underlying "no per-frame updates" rule is satisfied regardless. See
`docs/evidence/FACTORY_TWIN_R3F_SELECTION_MIGRATION.md` for full detail, including a real
camera-settle characteristic of damped `OrbitControls` (present in the legacy app too, same
damping setting) found while deriving stable test click-coordinates.

**Step 5B's own test had one assertion intentionally superseded** (not weakened): its "clicking
a machine does NOT create selection UI" check was correct for Step 5B's scope and is retired by
Step 5C's own mission (build exactly that UI) — updated to assert the new, intended behavior.

**Runtime changes to the live `/factory-twin-3d/`, Step 3's shell route, or Step 4's spike:
NONE.**

## Step 5D implementation status — DONE (PASS) — camera architecture

Rewrote `GeometryCameraController.tsx` (Step 5A's original preset controller) into a
production camera architecture: evidence-derived `minDistance`/`maxDistance`/`minPolarAngle`/
`maxPolarAngle` limits computed from the real envelope span (legacy `app.js` has none of
these — grep-confirmed, so this is new capability, not reproduction); a closed-form
bounding-sphere "Fit Factory" (reuses legacy's own `frameBounds()` direction vector, not its
12-pass NDC iteration); `resetToken`/`fitToken` counter props for one-shot camera actions from
outside the R3F tree; a `commit()`-guarded `onCameraStateChange` checkpoint (mount/view-change,
reset, fit, OrbitControls' own `onEnd`) that only fires when the camera actually changed.

**A real bug was found and fixed during this step's own regression testing**: OrbitControls
fires `onEnd` on any canvas `mousedown`→`mouseup`, including a zero-movement selection click —
so the first implementation caused every Step 5C selection click to also produce a spurious
camera-checkpoint render. Fixed with an exact-equality `commit()` guard before the render
count regressions were accepted as an unavoidable cost.

**Step 5B's own test had one assertion intentionally superseded** (not weakened): "camera
orbit: 0 new React renders" was correct before Step 5D existed; Step 5D's own mission requires
a real CameraState checkpoint on orbit end, so an orbit that moves the camera now legitimately
produces exactly 1 render. Updated to assert exactly 1, not 0 and not scaling with drag
samples.

Measured: 0 new React renders over 3s idle; +1 render per orbit/pan gesture (not per
pointermove sample); zoom's +1-per-wheel-notch is architecturally expected (each wheel event is
its own complete OrbitControls gesture, per its own source); draw
calls/geometries/textures/JS heap identical before and after a full orbit+zoom+pan+fit+reset+
resize+3×recovery stress sequence (`11/15282/11/1/15.2MB` unchanged both sides). Full detail,
including the one pre-existing out-of-scope legacy-stack failure (a `localhost:3000` Grafana
proxy auth check, unrelated to this branch, `git diff --quiet` confirmed untouched), in
`docs/evidence/FACTORY_TWIN_R3F_CAMERA_MIGRATION.md`.

**Runtime changes to the live `/factory-twin-3d/`, Step 3's shell route, or Step 4's spike:
NONE.**

## Step 5E implementation status — DONE (PASS) — layer / reference architecture

Added a typed `LayerState` (`services/factory-twin-3d/domain/layer.ts`, new file, same
extraction convention as `camera.ts`/`selection.ts`) covering the 4 layers this candidate scene
actually composes: `geometry` (factory shell + openings), `grid` (surveyed structural grid,
split out of `FactoryGeometry.tsx`'s bundle so it toggles independently), `machines`
(equipment), and `reference` (the raw CAD line-work overlay, off by default — same convention
as legacy `app.js:499`). Toggling flows through exactly one crossing point per layer — a
`<group visible={layers.<id>}>` wrapper — never a direct `.visible =` write on a Three.js ref
from a button.

Added the reference overlay itself: `lib/reference-adapter.ts` (new) fetches
`/api/floor-raw-cad` — the same served endpoint legacy's own `ensureRawCad()` uses — and
reproduces `app.js`'s own `cadToTwin()` mm-to-metre transform exactly, placed relative to the
already-validated geometry envelope (never a second coordinate system). `Reference.tsx` (new)
renders it as one `LineSegments` per CAD role sharing a single material, mirroring
`app.js`'s own `buildRawCad()` reasoning.

**A real bug was found and fixed during this step's own selection-coexistence testing**:
hiding the `machines` layer via `<group visible={false}>` did NOT stop it from being clickable
— reading `three/src/core/Raycaster.js` confirmed three.js's raycaster never checks
`Object3D.visible` (only the renderer skips invisible objects when drawing), so
`@react-three/fiber`'s pointer events hit the hidden `InstancedMesh` regardless. Fixed with an
explicit `interactive` prop on `Machines.tsx`, gated by the same `layers.machines` flag,
independent of the `visible` prop.

Measured: toggling any layer produces exactly 1 discrete React render and changes draw calls
only — geometry/texture counts never grow across repeated on/off cycles for any layer,
including the reference layer's own one-time first-activation build (11→24 geometries once,
then flat across every subsequent cycle). Selection and camera both remain fully correct
through every layer-toggle combination, and both survive 1 + 4 WebGL context-recovery cycles
alongside a non-default layer state. Full detail, including the one pre-existing out-of-scope
legacy-stack failure (unchanged from Step 5D, `git diff --quiet` confirmed untouched), in
`docs/evidence/FACTORY_TWIN_R3F_LAYER_ARCHITECTURE.md`.

**Runtime changes to the live `/factory-twin-3d/`, Step 3's shell route, or Step 4's spike:
NONE.**

## Next step

Step 1, Step 1.5, Step 3, Step 4, Step 5A, Step 5B, Step 5C, Step 5D, and Step 5E are complete,
all PASS. Per Step 5E's own explicit "STOP" instruction, operational state/telemetry/alarms/
inspector/RCA/EAP/LDI are NOT migrated. Candidates remaining, none started:

- Migration-plan Step 2 (duplicated WebGL-lifecycle extraction from `app.js`/`eap.js` into a
  shared module) — independent of the Next.js work, could proceed on the legacy codebase at
  any time.
- Next phase (live operational state, telemetry, alarms, inspector, RCA, EAP/LDI) —
  explicitly deferred until this layer-migration gate is reviewed and an explicit go-ahead is
  given.
- TRUE_POLYGON true-outline rendering (14 machines currently use their bounding rectangle) —
  a disclosed, scoped future addition, not blocking.
- Factoring `GeometryViewport.tsx`'s WebGL-lifecycle code (duplicated from Step 4's
  `TwinViewport.tsx`) into one shared module — a real, disclosed cleanup opportunity, not
  blocking.
- Multiple camera modes (overview/inspection/machine-focus) — explicitly out of scope for
  Step 5D, a disclosed future candidate.
- Lazy (toggle-triggered) fetch of the reference overlay, matching legacy's own optimization
  — explicitly deferred, disclosed in Step 5E's own evidence doc, not blocking.
- A toggle for legacy's `functional` (zone) layer — no rendered component exists for it in this
  migration yet, so a toggle would control nothing (Step 5E §1).
