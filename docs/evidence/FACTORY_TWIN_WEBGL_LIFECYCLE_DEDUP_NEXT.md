# Factory Twin — Shared WebGL Lifecycle Hook (Step 9)

Migration Step 9 (`docs/evidence/FACTORY_TWIN_ARCHITECTURE_GAP_AUDIT.md`'s "Next step"
backlog). Extracts the WebGL context-loss/restore state machine, recovery verification, and
hydration-safe render-count display — previously an independent, verbatim-duplicated copy in
both `GeometryViewport.tsx` (`/geometry-candidate`) and `TwinViewport.tsx` (`/r3f-spike`) —
into one shared module: `services/factory-twin-3d-next/hooks/useWebglLifecycle.ts`.

**Direct motivation**: the ref-mutated-during-render hydration bug fixed in commit `727c98cd`
was found and fixed independently in both files because they were independent copies. This
step removes the duplication that let the same bug land twice, and that the original audit
(Step 2 of the migration table, "Highest" risk) and `GeometryViewport.tsx`'s own Step 5F
header comment already disclosed as a known, still-open cleanup opportunity.

## What moved into the hook

- `LifecycleState` type (`READY → LOST → RESTORING → REBUILDING → VERIFYING → RECOVERED`).
- `handleContextLost` / `handleContextRestored` / `handleCreated` — identical logic in both
  original files: baseline geometry/texture capture, `invalidate()`-only rebuild (never a
  force-remount — Step 4's own measured leak avoidance), two-`requestAnimationFrame` settle
  margin, PASS/FAIL `verifyResult` string.
- The hydration-safe render-count pattern fixed in `727c98cd`: `renderCountRef` (mutated every
  render, unchanged) + `hydrated` `useState` gate + mount-only `useEffect`.
- `rendererRef` / `invalidateRef` / `baselineRef`.

## What stayed component-specific

- `GeometryViewport.tsx`'s own `contextLostCount` / `contextRestoredCount` (Step 5F's scene-
  rebuild-contract evidence) and `controllerMounts` (driven by `GeometryScene`'s own mount
  callback) — `TwinViewport.tsx` never had these counters, so they are NOT baked into the
  hook itself. They are wired via the hook's `onContextLost`/`onContextRestored` optional
  callbacks, so `GeometryViewport.tsx`'s counters behave exactly as before, and
  `TwinViewport.tsx` (which passes neither callback) gets zero extra state, zero extra
  renders it didn't already have — the extraction is behavior-preserving for both, not just
  for the one that already had more instrumentation.
- Any file-specific readout (`stats`/`readStatsRef` shapes differ between the two components,
  `cameraState`/`layers`/`selection`/operational-state logic in `GeometryViewport.tsx` — none
  of this is lifecycle code, all untouched).

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds; `/geometry-candidate` still `ƒ` (dynamic), `/r3f-spike` still
  `○` (static), unchanged from before this step.
- `tests/playwright/factory-twin-next-hydration.js` — 10/10 (was 8, +2: both viewport files
  now asserted to import and call the shared hook rather than reimplementing the guard
  inline; the file's own header/checks updated to reflect the new architecture rather than
  comparing two independent copies).
- `tests/playwright/factory-twin-r3f-spike.js` (TwinViewport, full suite) — 45/45, including
  the lifecycle/recovery-verification/render-count assertions, unchanged from pre-extraction.
- `tests/playwright/factory-twin-r3f-camera.js` — 66/66.
- `tests/playwright/factory-twin-r3f-layers.js` — 69/69.
- `tests/playwright/factory-twin-r3f-operational-state.js` — 40/40.
- `tests/playwright/factory-twin-r3f-scene-orchestration.js` — 76/76, including the exact
  counters this step's own callback-wiring exists to keep correct: `controllerMounts` stays 1
  across 3 stress-loop iterations, `contextLost`/`contextRestored` climb exactly 1 per
  iteration, never duplicated.
- `node scripts/pre-commit.js` — all checks pass.

**Pre-existing, unrelated harness gap found, not caused by this step**: `factory-twin-r3f-
geometry.js`, `-machines.js`, `-selection.js` fail with `Cannot find module './backend-fetch'`
— `tests/unit/lib/require-ts.js` transpiles a single `.ts` file at a time and does not resolve
a same-directory sibling `.ts` import (`geometry-adapter.ts`'s own `import ... from
'./backend-fetch'`, added in Phase 12D). Confirmed pre-existing, not a regression from this
step: reverted both component files via `git stash` and re-ran `factory-twin-r3f-geometry.js`
against the unmodified pre-Step-9 code — identical failure, identical stack. Out of scope for
a WebGL-lifecycle extraction to fix; disclosed here rather than silently worked around.

## Scope verification

`git diff --stat` for this step: `GeometryViewport.tsx`, `TwinViewport.tsx` (both modified),
`hooks/useWebglLifecycle.ts` (new), `tests/playwright/factory-twin-next-hydration.js`
(modified). No CAD data, geometry/machine/reference adapter, identity mapping, operational-
state logic, API contract, nginx, or production-route file touched. No change to
`LifecycleState` values, transition order, or counter semantics for either component.

**Result: STEP 9 — DONE (PASS).**
