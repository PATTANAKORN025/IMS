# CSS / UI / UX Excellence Audit — IMS Factory Twin + EAP SCADA Floor 1

**Date:** 2026-09-10
**Scope:** the two operator-facing static pages served by `factory-twin-3d` —
`services/factory-twin-3d/public/index.html` (physical twin) and
`services/factory-twin-3d/public/eap.html` (EAP operational map) — plus their
JS style surface (`app.js`, `eap.js`, `operational-status.js`,
`operational-state-adapters.js`) and the dev-only `perf-harness.html`.
**Method:** full repository CSS inventory (grep census), selector/token/specificity
read-through, existing test-coverage review. No production change made beyond two
proven zero-risk defect fixes (below).

Grafana dashboards are JSON, not CSS, and out of scope. Node-RED dashboard CSS is
vendored (`nodered_data/node_modules`) and not authored here.

---

## Phase 0 — Frontend inventory

| Fact | Value |
|---|---|
| Standalone `.css` / `.scss` / `.sass` files (authored) | **0** — all CSS is a single `<style>` block per page |
| CSS frameworks | none |
| UI component libraries | none |
| Animation libraries | none |
| `index.html` `<style>` | lines 7–457, ~450 lines |
| `eap.html` `<style>` | lines 7–188, ~180 lines |
| `perf-harness.html` `<style>` | lines 7–94 (dev tool, not deployed to operators) |
| CSS-in-JS / `createElement('style')` / `cssText` | **0** |
| `@keyframes` anywhere | **0** |
| CSS `transition` declarations | **1** (`index.html` `#app { transition: grid-template-columns 140ms }`) |
| CSS `animation` declarations | **0** |
| `requestAnimationFrame` in JS | `app.js` ×8, `eap.js` ×3 — all legitimate (render loop, hover/resize debounce, double-rAF class-toggle timing); none drives CSS animation |
| `@media` queries | `index.html` ×3 (`max-width:900px`, `max-width:1200px`, `prefers-reduced-motion`), `eap.html` ×2 (`max-width:1400px`, `min-width:2200px`) |
| `@container` queries | **0** |
| `!important` | **1** (`index.html:316`) — fixed below |
| `z-index` declarations | **1** (`index.html:78`, `z-index: 40` on the mobile drawer) |
| inline `style="…"` attributes | `eap.html` legend/swatch rows only (~10), most reference tokens; the status-chip rows use raw hex — see F-3 |

### CSS classification (both pages)

| Class | Present | Notes |
|---|---|---|
| design tokens | yes | `:root` per page — see Phase 2 |
| global foundation / reset | yes | `*{box-sizing}`, `html,body` reset, `:focus-visible` (twin) |
| layout | yes | CSS Grid app-shell both pages, `min-width:0` on tracks |
| typography | partial | fixed `13px/1.45` base, no fluid scale, `tabular-nums` used on numeric cells |
| components | yes | buttons, `.seg`, badges, `.ss-cell`, `.fs-cell`, drawer, inspector, `.pi-*`, `.cc-*` |
| EAP/SCADA | yes | `eap.html` cells/zones/legend; status vocab in `operational-status.js` |
| Physical Twin | yes | `index.html` |
| monitoring / Grafana | n/a | JSON dashboards, no authored CSS |
| accessibility | yes | `:focus-visible`, `prefers-reduced-motion` (1 rule), contrast fixes documented FT-18…FT-24 |
| responsive | thin | 5 viewport `@media` total, all shell-level |
| animation | **near-absent** | see Phase 8 |
| temporary / legacy | 1 (`.summary-title { display:none }` — intentional, `app.js:2358` renders the node it hides) |
| duplicated / overridden | `#webgl-lost` block near-identical across the two pages (structural — no shared stylesheet) |
| suspicious / unused | none proven unused |

---

## Phase 2 — Design token inventory

### `index.html` `:root`

`--bg --panel --panel-2 --line --line-2 --text --text-dim --text-faint --accent
--warn --crit --ok --header-h --strip-h --drawer-w --radius`

### `eap.html` `:root`

`--bg --surface --surface-2 --line --line-strong --ink --ink-dim --ink-faint
--accent --cell --cell-world --cell-unassigned --warn --region --region-layout --ok`

### Findings

- **F-1 (SHOULD-FIX): two token vocabularies for the same roles.** `--text`/`--ink`,
  `--panel`/`--surface`, `--line-2`/`--line-strong`, `--text-dim`/`--ink-dim` are
  the same concepts named differently on the two pages. An engineer moving between
  the files re-learns the palette. No shared stylesheet exists to hold a common
  layer; both are served static from the same directory, so a shared
  `tokens.css` `<link>` is feasible but is a two-file refactor that needs a
  visual-regression baseline first (none exists — see F-8).
- **F-2 (SHOULD-FIX): `index.html` secondary palette is untokenized.** ~18 raw hex
  values outside `:root`: the evidence ramp (`.ev-measured #7dd3fc`, `.ev-observed
  #a5b4fc`, `.ev-derived #fbbf24`, `.ev-simulated #f472b6`), the risk ramp
  (`.pi-risk-HIGH/MEDIUM/LOW/NONE`), badge colours (`.badge-measured #7dd3fc`
  duplicates `.ev-measured`), and one-off text colours (`#9fd7a2`, `#172434`,
  `#1d3348`). These form a real second palette with real meaning (claim provenance,
  risk tier) and should be `--evidence-*` / `--risk-*` semantic tokens. Several are
  already duplicated (`#7dd3fc` appears twice, `#a5b4fc` twice).
- **F-3 (ADDRESSED 2026-09-10 — implementation phase):** `tests/lint/eap-status-color-drift.js`
  now fails if the `eap.html` static legend hex, the `eap.js` `SIM_QUALITY_DISPLAY`
  greys, or `operational-status.js`'s own `color` vs `hex` ever diverge. Wired into
  `scripts/pre-commit.js` and the CI unit-tests job. Original finding below.
- **F-3 (was SHOULD-FIX): EAP status colours hand-copied into markup.** The single
  source of truth is `operational-status.js` (`OPERATIONAL_STATUS[*].color` +
  `.hex` + `.glyph` + `.label` + `.backed` + `.meaning` — an exemplary Phase-4
  model). But the always-visible legend in `eap.html:348–356` re-types all nine
  hex values inline (`#475569 #22c55e #f59e0b #ef4444 #38bdf8 #3b82f6 #a855f7
  #94a3b8 #64748b`), and `eap.js:1311–1312` (`SIM_QUALITY_DISPLAY`) re-types
  `#475569`. They match today. Nothing enforces that they keep matching — change a
  colour in `operational-status.js` and the legend silently lies. Recommended fix:
  a lint assertion (`static legend hex === operational-status.js`) rather than
  runtime coupling of an accessibility fallback.
- **F-4 (ACCEPTABLE-DEFER): `eap.html` aside width is a magic number in 3 places.**
  `340px` (grid col), `340px` (`#zoneDrawer` width), plus `300px`/`400px` in the
  two `@media` rules. The twin already tokenizes the equivalent as `--drawer-w`.
  A `--aside-w` token would align the two pages.
- **F-5 (FIXED): `var(--muted)` is undefined.** `index.html:154`
  `#floor-picker label { color: var(--muted); … }` — no `--muted` token exists and
  no fallback given, so the declaration is invalid and the label inherits its
  colour. Latent today (`#floor-picker` is `[hidden]` with one floor) but a real
  defect. **Fixed:** `var(--text-dim)`.

### Token strengths (keep)

- One accent per page, restrained. No neon, no gradients, no glass, no animated
  backgrounds, no glow. Matches the brief's "operational not promotional" direction.
- `eap.html` `:root` is fully clean — every hex in the style block is a token.
- Contrast tokens carry their measured ratios in comments (`--ink-faint #828da0`
  "clears 4.5:1 against every surface it is used on").

---

## Phase 1 / 18 — CSS architecture & cascade

- **F-6 (FIXED): one unjustified `!important`.** `index.html:316`
  `.reference-toggle { … padding-top: 6px !important }`. The element is
  `<label class="reference-toggle">` inside `<fieldset id="layer-controls">`;
  `#layer-controls label` (0,1,1) was out-ranking `.reference-toggle` (0,1,0).
  **Fixed:** selector is now `#layer-controls label.reference-toggle` (0,2,1),
  wins on specificity, `!important` removed.
- Specificity is otherwise low and healthy. Deepest selector is
  `#command-center-dialog .fleet-risk-row .cc-inspect` (0,3,0) — dialog-scoped,
  reasonable. No `#a .b .c .d span` chains. No `:has()`.
- `z-index`: exactly one value (`40`) in the whole codebase. No scale is needed at
  this size, but if overlays grow, add `--z-drawer / --z-inspector / --z-webgl-lost /
  --z-dialog` rather than free integers. `#command-center-dialog` and
  `#inspector` currently rely on `<dialog>` top-layer / source order — document that.
- `#webgl-lost` block is duplicated near-verbatim between the two pages
  (`eap.html:115–129`, `index.html:287–301`), including the specificity-fix comment.
  Structural duplication (no shared stylesheet); acceptable until F-1 lands a
  shared file, then fold it in.
- Global leakage: none found. Bare-element rules (`button`, `dl`, `dt`, `dd`,
  `table`, `td`, `fieldset`, `legend`, `details`, `summary`) are scoped by being
  the only such elements on each single-purpose page — acceptable for a static
  page, would need namespacing if these pages ever compose.

---

## Phase 5 / 6 / 21 — Responsive

- **F-7 (SHOULD-FIX): responsiveness is viewport-breakpoint only, no fluid scale
  and no container queries.** 5 `@media` rules total. `eap.html` steps the aside
  `300 → 340 → 400px` at `1400`/`2200px` and bumps base font `13 → 14px` at
  `2200px` — coarse. There is no `clamp()` typography, no `min()/max()` sizing, no
  `@container`. The existing browser regressions (`eap-map-regression.js`,
  `factory-twin-regression.js`) already assert **0 horizontal overflow and all
  cells reachable at 1366 / 1920 / 2560 / 3840**, so the current system is
  *correct* at every target width — it is just not *fluid* between them. Upgrading
  to `clamp()` typography + a container-query drawer/inspector is a real
  improvement but is a deliberate redesign, not a defect fix.
- **F-8 (SHOULD-FIX): no pixel visual-regression coverage for these two pages.**
  `tests/playwright/screenshots/` holds Grafana + geometry-verification PNGs only.
  Any CSS refactor (F-1, F-2, F-7, motion) needs a before/after baseline at
  1366 / 1920 / 2560 / 3840 first. This is the prerequisite for every larger item.
- Logical properties: not used (`padding: 10px 16px` etc.). Low priority — no RTL
  requirement stated; Thai is LTR.
- `@media (hover: hover)` / pointer queries: not used. Buttons and `.ss-cell` give
  affordance via `cursor` + `:hover` + `:focus-visible`; click/keyboard both work
  (asserted by `factory-twin-regression`). Touch is not a stated target for a
  control-room wall display. ACCEPTABLE-DEFER.

---

## Phase 7 — Typography

- Base `13px/1.45` system stack with a real fallback chain on both pages. `eap.html`
  additionally names `ui-sans-serif`. Mono stack via `var(--mono, ui-monospace,…)`
  (has a fallback — fine).
- `font-variant-numeric: tabular-nums` correctly applied to `.ss-value`,
  `.fs-value`, `#evidence-summary .n`, `eap.html td:last-child`,
  `.cc-top-risk-device` — every numeric-alignment case.
- **F-9 (SHOULD-FIX): no semantic type scale.** Sizes are ad-hoc literals
  (`14 13 12 11.5 11 10.5 10 9.5 9px`). A `--text-xs … --text-xl` (or `clamp()`)
  scale would make the hierarchy explicit and fluid. `9px` labels
  (`.exec-section-title`, `.pi-label`, `.st-na`) are at the low edge of legibility
  on a wall display — candidates to raise when a scale is introduced.
- Long-text handling is already deliberate: `#data-quality` ellipsis with a
  `min-width` floor and a documented exception for the error state;
  `overflow-wrap: anywhere` on `eap.html dd`. Thai/English/mixed not separately
  screenshot-tested (F-8).

---

## Phase 8 / 9 / 10 / 11 / 12 — Motion

- **F-10 (SHOULD-FIX — the brief's headline gap): there is essentially no motion
  system.** One transition exists (grid-column width on drawer open, 140ms,
  reduced-motion-guarded). Everything else is instant: the `#inspector` appears on
  click with no fade, the `#zoneDrawer` (EAP) pops, `#webgl-lost` snaps in,
  `<dialog>`s appear hard, EAP cell selection is an immediate colour swap.
  - This was a *deliberate* "calm" choice in the prior hardening phase, and for a
    SCADA board that is defensible — but the brief specifically asks for a
    deliberate, semantic, compositor-friendly motion layer (enter/exit for
    overlays, selection feedback, state-change emphasis on *abnormal* cells only).
  - Recommended, if approved: a `--dur-fast/normal` + `--ease-*` token set; `opacity
    + transform` enter/exit on `#inspector`, `#zoneDrawer`, `#webgl-lost`, and the
    `<dialog>`s; a 1-step colour/scale transition on EAP cell `:selected`; **no**
    continuous animation, and **no** per-cell animation across the 210-cell map
    (Phase 20 budget). All of it behind `@media (prefers-reduced-motion: reduce)`
    which must keep the state change visible while removing the movement.
  - **Blocked on F-8** (need a visual + frame-timing baseline) and on the existing
    Playwright timing assertions (`factory-twin-regression` already flags
    mode-switch latency; added transitions must not inflate measured interaction
    time — they animate *after* the state commit).
- `prefers-reduced-motion`: honoured in JS (`app.js:161`, gates camera fly-to) and
  in one CSS rule. If F-10 lands, the reduced-motion block must grow to match.
- No `will-change` anywhere — correct (brief says do not blanket-add it).

---

## Phase 13 — Accessibility

- **Baseline is strong** and was hardened repeatedly (FT-18…FT-24 comments):
  `:focus-visible` global rule, never `outline: none`; dimming applied only to
  decorative glyphs, never text (three separate documented contrast fixes:
  `.ss-off`, `.st-off`, EAP legend chip); status never colour-alone (glyph +
  label load-bearing, enforced by `operational-status.js` and asserted by
  `eap-operational-state-regression.js`).
- Latest measured result (previous phase): **axe-core 0 violations**, EAP
  production + demo × 5 resolutions.
- **F-11 (ACCEPTABLE-DEFER): `forced-colors` / Windows High Contrast not handled.**
  No `@media (forced-colors: active)` block; token-driven colours will be
  overridden by the OS, which is mostly fine, but `currentColor` borders on badges
  and the `rgba()` overlay backgrounds (`#webgl-lost`, `#inspector`) should be
  spot-checked in forced-colors mode.
- **F-12 (ACCEPTABLE-DEFER): text-scaling / browser-zoom 200% not screenshot-tested.**
  Layout is grid + `overflow:auto` panels so it should reflow, but unverified
  (F-8).
- Physical twin not re-axe'd this pass (carried from prior phases; also EAP-audit
  DF-5).

---

## Phase 14 / 15 / 16 — SCADA map UX, overlays, states

- Selection / hover / click on the EAP map: handled in `eap.js` (WebGL pick +
  inspector). Selection is a colour change with no motion (F-10). Inspector opens
  instantly (F-10).
- Overlay model is consistent and documented: exactly two things ever sit over
  each canvas (`#inspector`/`#zoneDrawer` after a click, `#webgl-lost` only when
  the GPU context is gone), both cornered, capped (`max-height`), scroll-contained,
  dismissible. `<dialog>` used for the command centre (native top-layer + `::backdrop`
  + Esc). This part is already close to the brief's target — it mainly lacks
  entry/exit motion (F-10).
- Loading / empty / unavailable / error / demo states: all present and honest
  (`eap.js` `load()` hardening + `#opDataSourceNote`; `index.html`
  `.quality-error` with a Retry button). **F-13 (ACCEPTABLE-DEFER):** they are not
  visually unified into one state-block component — each is styled where it lives.
  Cosmetic; the content is correct.
- "Data unavailable must be unmistakable but calm; one dead source must not make
  the whole UI look broken" — currently satisfied: EAP shows `REAL / UNAVAILABLE`
  per cell without alarm colour; the twin's `#data-quality` degrades to one line.

---

## Phase 17 — Containment / rendering

- No `contain` / `content-visibility` / `contain-intrinsic-size` used.
  **F-14 (ACCEPTABLE-DEFER):** `#machine-list` (`max-height:260px`, `overflow:auto`,
  up to 433 rows) and `#drawer` are candidates for `contain: content` /
  `content-visibility: auto` — but only after measuring style-recalc cost, which
  the current 15-min soak (heap flat, single render loop) does not suggest is a
  problem. Evidence-driven only.

---

## Phase 26 — Performance (measured, prior phase, carried)

| Metric | Value |
|---|---|
| EAP `<style>` size | ~5.2 KB inline (no separate CSS request) |
| Twin `<style>` size | ~14 KB inline |
| EAP initial load / FCP / FMR | 102 ms / 148 ms / 363 ms |
| EAP idle frame p50 / p95 | 33.3 / 33.4 ms (deliberate ~30 fps idle throttle) |
| EAP interaction p50 (setMode/view/fit/drawer/pick) | all single-digit ms in-page |
| 15-min / 1668-cycle soak | JS heap flat 10.11 MB across 16 samples, single render loop, 0 errors |
| style recalc / layout / paint / composite breakdown | **not separately profiled** — see F-15 |

- **F-15 (SHOULD-FIX): no CSS-specific perf profiling (style recalc / layout /
  paint / composite / long-frame count) captured.** The animation-frame health is
  measured (soak, frame counter) but the brief's Phase 26 table needs a DevTools
  performance trace. Required before/after if F-10 (motion) proceeds.

---

## Highest-value problems, ranked

**Implementation phase (2026-09-10) — see `CSS_UI_UX_EXCELLENCE_FINAL.md`:**
F-5, F-6 **FIXED**. F-8 **BUILT** (`tests/playwright/ui-visual-regression.js` +
32-state baseline). F-3 **ENFORCED** (`tests/lint/eap-status-color-drift.js`, in
pre-commit + CI). F-10 **BUILT** (compositor-only motion system, both pages,
reduced-motion, measured). F-1 **PARTIAL** (motion/ease/z tokens on both pages,
still parallel copies). F-2, F-7, F-9, F-15 remain scoped-not-built.

| # | Finding | Class | Effort | Prereq |
|---|---|---|---|---|
| F-5 | `var(--muted)` undefined | **FIXED** | trivial | — |
| F-6 | unjustified `!important` | **FIXED** | trivial | — |
| F-3 | EAP status colours hand-copied into markup — drift risk | **ENFORCED (lint)** | done | — |
| F-8 | no visual-regression baseline for the 2 pages | **BUILT** | done | — |
| F-10 | no motion system (brief's headline ask) | **BUILT** | done | F-8 |
| F-1 | two token vocabularies / no shared layer | **PARTIAL** — motion/z tokens added both pages; colour vocabulary + shared stylesheet + cross-page lint still open | medium | F-8 |
| F-2 | `index.html` secondary palette untokenized | SHOULD-FIX | medium | F-8 |
| F-7 | breakpoint-only responsive, no fluid scale / `@container` | SHOULD-FIX | large | F-8 |
| F-9 | no semantic type scale; some `9px` labels | SHOULD-FIX | medium | F-1, F-8 |
| F-15 | no CSS perf trace (recalc/layout/paint/composite) | SHOULD-FIX | small | — |
| F-4 | EAP aside width magic number ×3 | ACCEPTABLE-DEFER | trivial | F-1 |
| F-11 | `forced-colors` not handled | ACCEPTABLE-DEFER | small | — |
| F-12 | zoom-200% / text-scaling untested | ACCEPTABLE-DEFER | small | F-8 |
| F-13 | loading/empty/error states not a unified component | ACCEPTABLE-DEFER | medium | F-1 |
| F-14 | `contain` / `content-visibility` unexplored | ACCEPTABLE-DEFER | small | measure first |

## What was changed this pass

Two proven, zero-visual-risk defect fixes only (per brief Phase 31 — no large
uncontrolled rewrite):

1. `index.html:154` — `var(--muted)` → `var(--text-dim)`.
2. `index.html:316` — `.reference-toggle` `!important` removed; selector raised to
   `#layer-controls label.reference-toggle`.

Everything else (F-1, F-2, F-3, F-7 … F-15) is **scoped, not built** — each is a
deliberate design change that the brief itself says must not be done blind, and
the motion / token / responsive items are all blocked on F-8 (a visual-regression
baseline that does not yet exist).

## Known limitations of this audit

- No DevTools performance trace captured (F-15) — CSS recalc/layout/paint/composite
  numbers in Phase 26 are absent.
- Physical twin not re-axe'd or zoom-tested this pass.
- Thai / mixed-language rendering not screenshot-verified.
- `perf-harness.html` reviewed only enough to confirm it is a dev tool, not an
  operator surface.
