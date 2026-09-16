# Factory Twin 3D — Next.js React UI Shell (Step 3)

**Date:** 2026-09-11. **Scope:** `services/factory-twin-3d-next/` only — a new, isolated
service directory, not wired into `proxy/nginx.conf`, `docker-compose.yaml`, or any
`Dockerfile`. `services/factory-twin-3d/` (the live implementation at `/factory-twin-3d/`)
is byte-for-byte unchanged — confirmed by `git diff --quiet` against every path its own
Dockerfile copies.

## What was built

```
services/factory-twin-3d-next/
  next.config.ts          basePath '/factory-twin-3d', output 'standalone' (Step 2 spike settings)
  tsconfig.json            @twin-domain/* path alias -> ../factory-twin-3d/domain/*
  postcss.config.mjs       Tailwind v4 plugin
  app/
    layout.tsx             Server Component — root shell
    page.tsx                Server Component — renders TwinShell
    globals.css             Tailwind import + @theme inline token mapping
    tokens.css               mirrored semantic tokens (see "Design system" below)
  components/factory-twin/
    TwinShell.tsx            Server Component — composes everything
    TwinHeader.tsx           Server Component — title + placeholder environment indicator
    TwinToolbar.tsx          Client Component — view-switch buttons (own local state)
    LayerControls.tsx        Client Component — layer-visibility checkboxes (own local state)
    Inspector.tsx            Client Component — selection state + example-asset demo
    StatusBadge.tsx          Server Component — renders a MachineStateCode from the domain theme
    DataQualityBadge.tsx     Server Component — renders a MappingStatus
    ViewportFrame.tsx        Server Component — THE renderer boundary (see below)
```

**Framework versions:** Next.js 16.3.4, React 19.3.0, TypeScript 5.7.3, Tailwind CSS 4.3.3 —
the exact stack decided and spiked in Steps 1.5/2 (`FACTORY_TWIN_NEXTJS_VERSION_DECISION.md`,
`FACTORY_TWIN_NEXTJS_PROXY_SPIKE.md`). No unnecessary dependency added: the only new packages
beyond Next/React/TS/Tailwind are `@tailwindcss/postcss` and `postcss` (Tailwind v4's own
required build plugin — not optional) and, at the repo root, `axe-core` (test tooling for
this step's explicit "run axe" requirement, not an app dependency).

## The renderer boundary (Rule 3 — Three.js NOT migrated)

`ViewportFrame.tsx` is a plain, static, server-rendered `<div>` — no `<canvas>`, no WebGL, no
client JS. Verified by the test suite: `no canvas element exists yet (Three.js not migrated)`
passes. The explicit seam:

```
React UI (this app)
     |
     v
TwinViewport boundary   <-- ViewportFrame.tsx, exactly this component
     |
     v
Future R3F / Three.js runtime   <-- NOT built. Separate future spike.
```

## Domain integration (Rule 5 — no recreated types)

Every component imports Step 1's domain types/values directly via a `@twin-domain/*` path
alias resolving to `../factory-twin-3d/domain/*` — confirmed working end-to-end at both
`tsc --noEmit` and real `next build` (Turbopack) time, and confirmed in the rendered output
(the legend's badge colors — `#22c55e`/`#ef4444`/`#f59e0b`/`#94a3b8` — are read live from
`MACHINE_STATE_THEME`, not restated in this app). No `Machine`/`Zone`/`Asset`/
`OperationalState`/`DataQuality`/`SelectionState`/`CameraState` type is redefined here.

**One real cross-service build constraint found and resolved**: Turbopack's `turbopack.root`
option, if set to this app's own directory (the natural way to silence its workspace-root
warning), makes Turbopack refuse to resolve the `../factory-twin-3d/domain` import — confirmed
by a real failed build. Left at Turbopack's own wider inferred default instead; the cosmetic
warning is accepted, documented in `next.config.ts` with the reason, rather than "fixed" in a
way that breaks the domain import.

## Server/Client boundaries (Rule 6)

| Component | Type | Why |
|---|---|---|
| `layout.tsx`, `page.tsx`, `TwinShell.tsx`, `TwinHeader.tsx`, `ViewportFrame.tsx`, `StatusBadge.tsx`, `DataQualityBadge.tsx` | **Server** | No hook, no event handler, no browser-only API |
| `TwinToolbar.tsx`, `LayerControls.tsx`, `Inspector.tsx` | **Client** (`'use client'`) | Each owns real interactive state (`useState`) and attaches real event handlers |

The route is prerendered as **static content** (`next build`'s own output: `○ (Static)
prerendered as static content`) — the page itself does no server-side data fetch (none
exists yet; this step is UI-only), and the interactive islands hydrate independently. This is
the "static shell server-renderable, interactive state isolated" architecture the brief asked
for, demonstrated with real component boundaries, not merely asserted.

`Inspector.tsx` also renders `DataQualityBadge` internally — necessarily part of the client
bundle there, because the badge's content depends on client-only selection state that doesn't
exist until after a click. `TwinShell.tsx`'s own "Legend" section renders `StatusBadge`
genuinely server-side (real proof both boundaries work, not just the client one).

## No fabricated data (Rule 4)

The only example data is `Inspector.tsx`'s `PLACEHOLDER_ASSET` — id
`PLACEHOLDER-ASSET-001` (unmistakably synthetic), `status: 'UNMAPPED'`,
`live_status_eligible: false`. Selecting it in the UI shows **no machine-state badge at
all**, because `operational-status.js`'s real rule (an unmapped asset carries no machine
state, ever) applies even to this placeholder — verified by the test
`unmapped placeholder shows NO machine-state badge (honesty rule preserved)`. The
environment indicator in `TwinHeader.tsx` is explicitly labeled `(placeholder)` with a title
attribute disclosing it is not wired to any real signal.

## Design system (Rule 7 — no second design system)

`app/tokens.css` mirrors the exact hex values of `services/factory-twin-3d/public/index.html`'s
real `:root` block (PR #21) for the semantic roles this step's brief listed: `background`,
`surface`, `border`, `text-primary/secondary/muted`, `accent`, `success`, `warning`, `danger`,
`focus`. **`info` does not exist as its own token in the legacy system** — aliased to
`--accent` here, the same pattern the legacy CSS already uses for `--focus` ("diverges: =
--accent"). Disclosed in `tokens.css`'s own header comment, not silently invented.

`app/globals.css`'s `@theme inline` block maps these to Tailwind utilities (`bg-surface`,
`text-text-primary`, etc.) so every component uses semantic class names — **zero raw hex
literals appear in any `.tsx` file** (verified by grep during review; the one `style={{color:
theme.color}}` in `StatusBadge.tsx` reads a runtime value from the domain theme object, not a
literal in this file). Verified end-to-end by the test asserting the rendered `<body>`'s
computed background color resolves to the mirrored `--bg` token exactly (`rgb(11, 16, 23)`).

**A real accessibility defect this mirroring surfaced and fixed**: `--text-muted` (`#5f7387`)
cannot reach WCAG AA's 4.5:1 normal-text contrast ratio against *either* `--surface`
(3.58:1) or `--bg` (3.90:1) — computed directly, not estimated. Every component that
initially used it for real informational text (the environment badge, the viewport
placeholder label, the legend caption, the inspector's empty-state text) was switched to
`--text-secondary` (6.52–7.10:1, comfortably passes). The `--text-muted` token itself stays defined and mapped to a `text-text-muted` Tailwind
utility via `@theme inline` — just unused by any component in this step — since Rule 7
requires preserving the role for a future, correctly-sized use, not deleting it. **Not audited this step**: the legacy `eap.html`'s own
4 real `--text-muted` usages (`.mode-note`, two other selectors, `dt`) — this finding is
about this new shell's component choices, not a claim that the legacy page has the same
defect (it may use larger text or different context; not checked here, flagged as a
follow-up).

## Responsive + accessibility results (Rules 9–10)

`tests/playwright/factory-twin-next-shell.js`, run against the built `next start` output:

| Check | 1366×768 | 1920×1080 | 2560×1440 | 3840×2160 | 1024×768 | 1440×900 |
|---|---|---|---|---|---|---|
| No horizontal overflow | PASS (0px) | PASS (0px) | PASS (0px) | PASS (0px) | PASS (0px) | PASS (0px) |
| axe: 0 serious/critical violations | PASS | PASS | PASS | PASS | PASS | PASS |

Also verified (one representative viewport each, per "not a duplicate of the whole suite"):
keyboard focus visibility (first Tab stop shows a visible outline), `prefers-reduced-motion`
(renders with no error — no animation exists to reduce), `forced-colors: active` (renders
with no error), 200% zoom (no crash; some overflow at 200% zoom is expected/scrollable
behavior, not a defect — the check confirms the page still functions, not zero scroll).

**30/30 test assertions pass** (7 failed on the first run — the axe color-contrast defect
above and a test-timing artifact where the FCP paint-timing entry was read before the browser
populated it; both root-caused and fixed, not worked around).

## Performance (Rule 11 — measured, not assumed)

| Metric | Value | Budget | Status |
|---|---:|---:|---|
| HTML response / load | 132ms | — | informational |
| FCP | 164ms | < 1000ms | **PASS** |
| LCP | 164ms | < 1000ms (twin's own PR #23 budget) | **PASS** |
| DOMContentLoaded | 37ms | — | informational |
| DOM node count | 58 | < 300 (shell, not bloated) | **PASS** |
| Transfer size | 3,473 B (HTML) | — | informational, excludes `_next/static` JS/CSS chunks |
| Console/page errors | 0 | 0 | **PASS** |

No comparison to the legacy Three.js scene's own FCP/LCP is meaningful yet — this shell has
no scene to compare against (Rule 3). These numbers are a baseline for *this* shell, to be
re-measured once the renderer boundary gets real content behind it.

## Routing / deployment (Rules 12–13)

Runs at `/factory-twin-3d/` via `basePath`, on its own dev port (4310), completely isolated
from the real deployment. `proxy/nginx.conf` was not touched. The legacy `/factory-twin-3d/`
Express implementation remains the only thing actually served at that path in production —
confirmed unchanged (`git diff --quiet` above). Rollback is trivial: delete
`services/factory-twin-3d-next/`, nothing else references it.

## Tests (Rule 14)

`tests/playwright/factory-twin-next-shell.js` — one focused file, not a duplicate of the
existing Factory Twin suite (which remains authoritative for the real implementation, per
Rule 15). Requires the shell running (`cd services/factory-twin-3d-next && npm run build &&
npm run start`, then `node tests/playwright/factory-twin-next-shell.js`). **Not wired into
`scripts/pre-commit.js` or CI** — this app has no deployment yet for CI to build/serve, and
adding a CI job for an unreferenced, isolated directory was judged premature; noted here as a
deferred item, not silently skipped.

## Remaining risks / deferred items

- The `--text-muted` legacy-usage audit noted above (eap.html only, not blocking this step).
- No CI job for `services/factory-twin-3d-next/` yet — manual test invocation only.
- `next/image`'s own asset-proxy path remains untested (carried from the Step 2 spike's own
  disclosure, unchanged — this step added no image usage).
- The renderer boundary is intentionally empty; the actual R3F/Three.js migration is a
  separate future spike, per this step's explicit scope limit.

## Verdict

**STEP 3 — NEXT.JS REACT UI SHELL: PASS.**
