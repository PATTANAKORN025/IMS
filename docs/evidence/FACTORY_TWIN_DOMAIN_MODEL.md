# Factory Twin 3D — Typed Domain Model (Step 1)

**Date:** 2026-09-11. **Scope:** `services/factory-twin-3d/domain/` only.
**Status:** Step 1 of the Next.js/React/TypeScript/Tailwind/R3F architecture evolution
(`docs/evidence/FACTORY_TWIN_ARCHITECTURE_GAP_AUDIT.md`, Migration plan Step 1).
**Runtime changes to the existing application: NONE.** `server.js`, `app.js`, `eap.js` and
every `lib/*.js` file are byte-for-byte unchanged. This is a new, additive, type-only layer.

---

## Why this exists, not just what it is

The audit found the codebase already has a domain-model-shaped file
(`lib/contracts.js`) that explicitly rejected TypeScript for a documented reason at the time
it was written: *"this repo has no frontend build toolchain anywhere... adding a TS compile
step here would be a new toolchain for one file, not a fit with how the rest of the repo
works."* That reasoning was correct **then**. The current mission explicitly changes that
premise — a framework/toolchain evolution is now underway — so the old constraint no longer
applies, but its spirit (don't force a build pipeline the rest of the repo doesn't have) is
still honored here: see "Compatibility strategy" below.

Re-reading the source (per the mission's explicit instruction not to trust the audit blindly)
surfaced two corrections to what the audit assumed:

1. **`lib/contracts.js` is half dead code.** Only `MachineState` and `MACHINE_STATE_THEME` are
   actually imported anywhere (`server.js:8`). `AssetMappingStatus`, `FactoryMachinePlacement`,
   the `PhysicalSlot` typedef under that name, and `SUPPORTED_SCHEMA_MAJOR` have **zero live
   callers** (confirmed by repo-wide grep) — they describe a superseded synthetic-grid
   architecture (`computePlacements()`) that real CAD data (`lib/wire.js`) replaced. The domain
   layer below models the **live** shape (`lib/wire.js`'s `projectEquipment` output), not the
   superseded typedefs the audit's table cited as "the closest thing to an existing domain
   type" — that praise was correct for `MachineState`/`MACHINE_STATE_THEME` and misleading for
   the rest of the file.
2. **`app.js` has no explicit "selection" state at all.** `pickEquipment()`/`pickColumn()`
   return an item directly into the inspector-render functions; "selection" is really "whatever
   the inspector currently shows," a DOM fact, not a tracked variable. `selection.ts` is
   therefore a **genuinely new boundary**, not a mechanical port — flagged as such in its own
   file header so a future reader doesn't assume it already existed.

## Domain boundaries created

```
services/factory-twin-3d/domain/
  spatial.ts        Point2, Point3, Footprint — shared coordinate primitives
  machine-state.ts  MachineStateCode, MACHINE_STATE_THEME, resolveMachineState()
  data-quality.ts   MappingStatus, IdentityLifecycle, StateSourceQuality, SourceType
  geometry.ts       Envelope, Column, Wall, WallLine, Opening, FootprintPolygon, StructuralGrid
  zone.ts           ZoneConfidenceTier, Zone
  asset.ts          Asset, Machine, isMachine()
  selection.ts       SelectionState, isSelectionEmpty()
  camera.ts         ViewName, CameraState, DEFAULT_VIEW
  index.ts          type-only barrel
  tsconfig.json     scoped, strict, isolatedModules, noEmit
```

Every file models a shape this codebase **already produces at runtime** — none is a forward
guess. See each file's header for its exact source (`lib/wire.js` line numbers,
`public/operational-status.js`, `lib/contracts.js`).

## The four axes that must never collapse into one another

This is the concrete answer to the mission's "do NOT allow `NO_DATA = DOWN`,
`UNAVAILABLE = DOWN`" rule — the codebase already keeps these four apart in four different
files; `data-quality.ts` is the first place that separation is asserted as a single, named,
cross-referenced contract instead of an implicit convention four files each partially honor:

| Axis | Type | Answers | Lives in |
|---|---|---|---|
| Machine run-state | `MachineStateCode` | Is this machine RUN/DOWN/IDLE/etc? | `machine-state.ts` |
| CAD↔device mapping | `MappingStatus` | Is this CAD asset linked to a real IMS device at all? | `data-quality.ts` |
| Mapping-record lifecycle | `IdentityLifecycle` | Was this mapping ever confirmed, and is it still trusted? | `data-quality.ts` |
| EAP cell state-source | `StateSourceQuality` | Is this EAP cell's state real, simulated, or absent, and why? | `data-quality.ts` |

## A real error this typing exercise caught

Modeling `Asset` against `lib/wire.js`'s literal `fromEnum()` behavior (`wire.js:237-239`,
which returns `null` for ANY missing/invalid enum field, independent of any other field's
value) revealed that six fields — `footprint_status`, `display_shape`, `geometry_status`,
`confidence`, `zone_status`, `height_status` — must be typed nullable, not the non-null type
first drafted. `display_shape: null` was observed on a real `projectEquipment()` call even
with a non-null `footprint`, disproving the first draft's assumption. Caught by
`tests/unit/factory-twin-domain.test.js`'s DTO fixture test before being committed as fact —
exactly the discipline this engagement's prior phases applied to runtime performance claims,
now applied to type claims. By contrast, `identity_status`/`evidence_confidence` (mapping-file
derived, gated by `lib/mapping.js`'s `validateMappings`/`resolveMapping` total-fallback
contract) are legitimately non-null and were left that way.

## DTO → Domain

No new adapter functions were written this step. `lib/wire.js`'s existing `project*()`
functions **are** the DTO→Domain boundary already — they are pure, already tested
(`tests/unit/factory-twin-wire.test.js`), and their output now has a name (`Asset`) and a
checked contract (the new tests) rather than being an untyped object literal. Writing a
second, parallel adapter layer on top would have been the "mechanical JS→TS conversion" the
mission explicitly warned against; typing the existing boundary was judged the smaller, more
honest move.

```
Backend DTO (lib/wire.js project*())
        │  (already the real boundary — pure, tested, unchanged)
        ▼
   Domain (this layer — Asset, Zone, Envelope, MachineStateCode, ...)
        │
        ▼
  Current Runtime (app.js / eap.js — UNCHANGED this step)
```

Future target (not built yet — Step 5+ of the migration plan):

```
Backend DTO (lib/wire.js project*())
        ▼
   Domain (unchanged from above)
        ├──► React UI (typed components consuming domain types)
        └──► R3F Scene (TwinScene tree consuming the same domain types)
```

## Compatibility strategy — "smallest mechanism," not a build pipeline

Nothing in the current runtime (`server.js`, `app.js`, `eap.js`) imports `domain/` yet, by
design — Step 1's hard rule is zero behavioral change, and wiring an unused-by-runtime type
layer into the shipped code would be exactly the "TypeScript conversion for its own sake" the
mission warned against. What exists instead, proven working this step:

- **Type-checking**: `npm run factory-twin:typecheck` → `tsc --noEmit` against a scoped
  `domain/tsconfig.json`. No emit, no dist folder, nothing the running app touches.
- **Test-time execution**: `tests/unit/lib/require-ts.js` transpiles one `.ts` file to CommonJS
  in memory via the TypeScript compiler API (`ts.transpileModule`) and runs it through Node's
  own module loader — no `ts-node`, no bundler, no new runtime dependency for the app. Domain
  files are written so every cross-file reference is `import type` (erased entirely by
  per-file transpilation), so no cross-file module resolution is ever needed at test time.

This is deliberately **not** a production answer — a real Next.js app will compile these files
itself. It is the minimum needed to make the domain layer's own claims checkable today,
without adopting a bundler before Migration-plan Step 3/4 (Next.js shell + the still-unresolved
nginx `basePath` question) are actually decided.

**Dependency note:** the root `node_modules` already carried an *undeclared* transitive
`typescript@7.0.2` (the new native "tsgo" preview, CLI-only — its npm package exports no
compiler API, only `version`/`versionMajorMinor`; confirmed by inspection, `transpileModule`/
`ModuleKind` are `undefined` on it). That version cannot run `ts.transpileModule` at all, so
Step 1 explicitly adds `typescript@^5.7.3` (the last classic, full-API stable release) as a
proper `devDependency` instead of relying on the incidental transitive install. This is a
correctness fix, not a preference: the native preview would have silently failed task 9's test
requirement.

## Tests

`tests/unit/factory-twin-domain.test.js`, 15 focused assertions (not a giant suite), run via
`node tests/unit/factory-twin-domain.test.js`, wired into `scripts/pre-commit.js` alongside a
`tsc --noEmit` gate:

| Category (mission §9) | Covered by |
|---|---|
| Operational states | `MACHINE_STATE_ORDER`/`MACHINE_STATE_THEME`/`BACKED_MACHINE_STATES` parity vs. both live JS copies |
| Invalid combinations | `resolveMachineState` never returns a plausible state for `undefined`/`null`/garbage/`'NO_DATA'`/`'UNAVAILABLE'` |
| DTO → Domain | `wire.projectEquipment()`'s real output checked field-by-field against `Asset`; `isMachine()` checked against both an eligible and an ineligible real projection |
| Geometry | `wire.projectEnvelope`/`projectColumn`/`projectWall` coordinates echoed exactly, unaltered |
| Selection | `SelectionState`'s 3 kinds matched against app.js's 2 actual pick paths + none |
| Camera | `DEFAULT_VIEW` matched against app.js's own `activeView` default; determinism check |

Result: **15/15 pass.**

## Performance

No runtime file changed → no runtime behavior to measure. `factory-twin-regression.js`,
`factory-twin-failure-modes.js`, and the EAP suites were re-run (not skipped) specifically to
confirm this claim rather than assume it — see the Architecture Gap Audit doc's Step 1 status
section for the run log.

## Remaining migration risks (unchanged from the Architecture Gap Audit, not addressed here)

- Next.js `basePath`/`assetPrefix` vs. the nginx `auth_request` proxy — still unspiked, per the
  mission's explicit instruction not to solve it in Step 1.
- `app.js`/`eap.js`'s duplicated WebGL context-loss lifecycle — still duplicated; this step
  touched neither file.
- No runtime code yet consumes `domain/` — the coexistence mechanism above is proven at test
  time only, which is what Step 1 asked for, not more.
