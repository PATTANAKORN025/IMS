# Factory Twin 3D — React Three Fiber Runtime Spike (Step 4)

**Date:** 2026-09-11. **Scope:** `services/factory-twin-3d-next/components/factory-twin/
twin-viewport/` and the `/r3f-spike` route only — a technical spike, not a scene migration.
`services/factory-twin-3d/` (the live implementation) and `app/page.tsx` (Step 3's real shell
route) are untouched — confirmed by `git diff --quiet` against every Dockerfile-copied
legacy path, and the Step 3 test suite still passing 30/30 unchanged.

## Question

> Can React Three Fiber safely host the Factory Twin rendering runtime inside the new
> Next.js architecture, without migrating the real scene yet?

**Answer: partially yes, with one real, unresolved, load-bearing gap.** R3F hosts
instanced rendering, demand-loop discipline, and click-to-select cleanly, matching the
legacy app's own proven patterns. It does **not**, out of the box, recover from a simulated
WebGL context loss in this environment — a genuine finding, not a spike-script bug (isolated
and confirmed below), and the single most important open question before any real scene
migrates onto this runtime.

## What was built

```
components/factory-twin/twin-viewport/
  TwinViewport.tsx       Canvas host, frameloop="demand", context-loss wiring, stats readout
  TwinScene.tsx           64 synthetic boxes ("SPIKE-EQP-000".."063") as ONE InstancedMesh
  CameraController.tsx    3 view presets (plan/overview/building) via the domain's ViewName
app/r3f-spike/page.tsx    isolated route -- /factory-twin-3d/r3f-spike, NOT app/page.tsx
```

No `SelectionRaycaster.tsx` was written as a separate file: R3F attaches real pointer-event
raycasting to any mesh automatically (`onClick` on the `<instancedMesh>` in `TwinScene.tsx`,
using `event.instanceId`) — there is no separate manual `raycaster.setFromCamera()` /
`raycaster.intersectObjects()` call to write, unlike `app.js`'s `pickEquipment()`
(app.js:2162). **This is itself a real, positive comparative finding**: R3F's built-in
picking replaces a whole category of manual code the legacy app has to maintain itself.

## Version compatibility — a real finding, fixed before anything else

`@react-three/fiber@9.7.0` (latest stable) declares a peer dependency of
`react: '>=19 <19.3'`. Step 3 shipped on React 19.3.0. Verified directly (not assumed): a
clean `npm install` at React 19.3.0 with R3F 9.7.0 present produces an ERESOLVE peer warning;
downgrading to **React 19.2.8** (the latest patch inside R3F's declared range, and confirmed
compatible with Next 16.3.4's own peer range `^19.0.0`) installs with **zero warnings**. This
was a real, necessary change to `services/factory-twin-3d-next/package.json` shared by both
Step 3 and Step 4 code — re-ran Step 3's full 30-test suite after the downgrade to confirm no
regression (still 30/30). A `10.0.0-canary.*` R3F line exists but was not adopted — a canary
is not an appropriate spike baseline to recommend forward.

## Instancing / draw calls — matches the legacy app's own proven pattern

| Metric | Value | Method |
|---|---:|---|
| Draw calls for 64 instanced boxes | **1** | `gl.info.render.calls`, read via a `useFrame`-populated ref (never written to React state per-frame) |
| Triangles | 768 (64 × 12) | `gl.info.render.triangles`, same method |

Confirms R3F's `<instancedMesh>` primitive gives the same one-draw-call-for-N-objects
behavior `app.js`'s manual `THREE.InstancedMesh` usage already relies on (Architecture Gap
Audit §2C) — the pattern transfers, not just the library.

## Demand rendering — matches PR #23's own budget

`frameloop="demand"` (R3F's opt-in, not its default) was tested against a 3-second idle
window after one click-triggered render: **3 total frames rendered**, not the ~180 a
continuous 60fps loop would produce. Measured via a `useFrame` counter ref, read out only on
an explicit button click — never written to React state on every frame, per the hard rule
against putting render-loop values in React state. This matches `app.js`'s own demand-render
discipline (PR #23 §2: 0 extra frames over a 3s idle window) closely enough to conclude the
pattern is achievable in R3F, though R3F's own OrbitControls-driven invalidation triggers a
few more incidental frames than `app.js`'s hand-tuned `renderTail` counter — a difference
worth remeasuring at real scene scale, not treated as equivalent by assumption.

## Selection integration — real domain types, no new store

Clicking an instance calls `onSelect(instance)` with a plain `{id, index}` object (typed
locally in `TwinScene.tsx` as `SpikeInstance`, deliberately NOT the full `Asset` domain type —
this spike's placeholder geometry has no CAD identity to legitimately claim). Selection state
is a single `useState` in `TwinViewport.tsx` — **no global store was introduced**, per the
hard rule requiring measurement to justify one; nothing in this spike's scope needed
cross-component synchronization beyond one parent/child pair. `@react-three/drei` pulls in
`zustand` as its *own* internal transitive dependency (used by its unrelated `<Tunnel>`
HTML-portal helper) — not imported or used by any code in this spike, disclosed for full
transparency, not a store this work introduced.

Step 3's actual `Inspector.tsx`/`DataQualityBadge.tsx` components were deliberately **not**
rewired to this spike's selection state — doing so would mean editing already-verified Step 3
files for a spike-scoped change. Reusing them for real is Step 5's job, once a real `Asset`
(not a synthetic box) exists to select.

## WebGL context-loss/restore — THE real, unresolved finding

**Reproduced and isolated, not a script bug.** Sequence:

1. A bare `<canvas>` with `WEBGL_lose_context`, no R3F/Three.js involved at all: calling
   `loseContext()` then `restoreContext()` fires **both** `webglcontextlost` and
   `webglcontextrestored`, and `gl.isContextLost()` correctly returns `false` after —
   confirms the browser/environment mechanism itself works correctly in this exact
   Playwright/Chromium setup (ruling out the SwiftShader-software-renderer explanation that
   applied to an earlier, unrelated timing finding in this engagement's PR #23 work).
2. The same sequence through `TwinViewport.tsx`'s real R3F `<Canvas>`: `webglcontextlost`
   fires correctly (`THREE.WebGLRenderer: Context Lost.` logs to console, matching three.js's
   own documented internal handling). **`webglcontextrestored` never fires**, confirmed with
   a completely independent, freshly-attached raw listener on the same canvas element (not
   just this spike's own status label) and confirmed still absent after waiting 3 full
   seconds (not a timing artifact).

**Root cause not identified within this spike's scope** — that would be a debugging task,
not a spike question, and this step's brief is to prove/disprove viability, not to fix
three.js's internals. What is established: something about how `THREE.WebGLRenderer` (or
R3F's management of it) handles a lost context in this configuration suppresses the browser's
own restore event from ever reaching application code, even though the browser fires it fine
on a bare canvas.

**This directly confirms the Architecture Gap Audit's own risk ranking** (WebGL lifecycle:
"Highest" risk, the one subsystem flagged as needing independent, isolated proof before any
scene migration touches it) rather than merely repeating it — the audit predicted this
subsystem was dangerous; this spike is the first evidence that a naive migration would
actually lose the recovery guarantee the legacy app.js/eap.js's duplicated 5-state lifecycle
machinery (`LOST → RESTORING → REBUILDING → VERIFYING → RECOVERED`) currently provides.

**Not fixed in this spike, on purpose** — Rule: this is a technical spike, not the full scene
migration, and "prove viability" includes proving where it currently is NOT viable without
more work. `tests/playwright/factory-twin-r3f-spike.js` asserts the CURRENT (broken) behavior
explicitly, labeled `KNOWN GAP (not yet fixed)`, so a future real fix flips that specific
assertion to a visible failure rather than silently going unnoticed.

## Bundle cost — measured, disclosed

| Metric | Step 3 shell (`/`) | Step 4 spike (`/r3f-spike`) | Note |
|---|---:|---:|---|
| Total network transfer | ~7 KB (HTML+CSS+minimal JS) | **1,387,440 B (~1.35 MB)** | three.js + R3F + drei, production-minified |
| FCP | 164ms | 144ms | comparable — the heavy JS loads async, doesn't block first paint |
| Console/page errors | 0 | 0 | |

1.35MB is a real, unavoidable cost of introducing Three.js — smaller than the legacy app's own
measured ~2.1MB unminified `three.core.js` + `three.module.js` pair (PR #23 §5), because
Next's bundler tree-shakes the ESM import graph; still substantial, and this cost applies
once R3F is adopted for real, not just for this spike page.

## Hard-rule compliance checklist

- [x] No existing `/factory-twin-3d/` runtime file touched (`git diff --quiet` confirmed)
- [x] `app.js`/`eap.js` not rewritten
- [x] No CAD geometry used — 64 synthetic boxes, ids unmistakably fake (`SPIKE-EQP-###`)
- [x] No EAP semantics touched
- [x] No production/demo behavior touched
- [x] nginx/Grafana/PR #22/`main`/CI billing untouched
- [x] Existing Three.js tests not removed or weakened
- [x] No performance threshold lowered — Step 3's own budgets re-verified unchanged (30/30)
- [x] No fake telemetry — placeholder ids only, no device/state claims
- [x] No global state store introduced (drei's own internal, unused-by-this-code zustand
      dependency disclosed above, not adopted)
- [x] No render-loop value placed in React state (frame counts, renderer.info all read via
      refs, surfaced to state only on an explicit, discrete button click)
- [x] Not all meshes/models migrated — one synthetic 64-box grid only

## Tests

`tests/playwright/factory-twin-r3f-spike.js` — 9/9 pass, including the deliberately-inverted
"known gap" assertion described above.

## Verdict

**STEP 4 — R3F RUNTIME SPIKE: PASS, with one named, unresolved, blocking follow-up.**

R3F is viable for hosting instanced rendering, demand-loop discipline, and click-selection at
the pattern level proven here. It is **not yet proven safe for a real migration** until the
WebGL context-recovery gap above is root-caused and a fix (or an equivalent
manually-attached recovery mechanism, mirroring what `app.js`/`eap.js` already do by hand)
is demonstrated working through R3F. That investigation is the correct next spike-scoped
question — not a full scene migration, and not started here.
