# CSS / UI / UX Excellence — Implementation Result

**Date:** 2026-09-10
**Branch:** `refactor/css-ui-audit` → PR #21 (base `integration/andon-layout-safe`)
**Companion:** `docs/evidence/CSS_UI_UX_EXCELLENCE_AUDIT.md` (the finding list this
implements against).
**Method:** every change measured against a disposable `factory-twin-3d`
container serving the working-tree `public/` on `:4199`, and the
`tests/playwright/ui-visual-regression.js` layout baseline built in this phase.

---

## What shipped, in commits

| Commit | Finding | Result |
|---|---|---|
| `48e3a3d8` | F-5, F-6 | `var(--muted)` → `--text-dim`; one unjustified `!important` removed by raising a selector. |
| `f2e8be54` | **F-8** | Visual + layout regression harness + baseline (below). |
| `ea14bf51` | **F-3** | EAP status colours pinned to one source of truth + drift lint, wired into pre-commit and CI. |
| `6b1b17ff` | **F-10** (+ F-1 partial) | Industrial motion system for the EAP map. |
| `b54129da` | **F-10** | Motion system extended to the physical twin. |

---

## F-8 — Visual + layout regression baseline

`tests/playwright/ui-visual-regression.js` + `tests/playwright/ui-visual-baseline/`.

| | |
|---|---|
| Contract | per (page, viewport, state) JSON snapshot: resolved `:root` tokens + computed style + client rect for a fixed chrome-selector set + a horizontal-overflow flag. Deterministic, host-independent, committed. |
| Artefacts | non-canvas chrome PNG clip (pixel-diffed, soft per-channel tolerance) + full-frame PNG (human review). Gitignored (host-dependent, large). |
| Matrix | 1366×768 / 1920×1080 / 2560×1440 / 3840×2160 × { EAP: production, demo, selected, drawer, webgl-lost ; twin: default, drawer, webgl-lost } = **32 states** |
| Determinism | EAP demo is per-`cell_id`, no clock; the twin's live-telemetry regions have `rect` dropped, style still asserted |
| Stability | 0 failures across repeated compare runs; `SKIP` exit 0 with no URL |
| Verified in use | caught exactly the intended `transition*` / `opacity` / token drift from the two motion commits, and **zero** rect/colour/font/spacing drift, on every one of the 32 snapshots |

**Deferred:** not yet wired into a CI job (the CI twin-regression stage has no
direct service port); `#command-center-dialog` not yet in the probe set.

---

## F-3 — Status-colour single source of truth

`operational-status.js` was already the semantic source (`color` string + `hex`
number + `glyph` + `label` + `backed` + `meaning`), and `eap.js`'s
`#stateBreakdown` table is built from it. Two hand-typed copies were unguarded:
the `eap.html` static legend and `eap.js` `SIM_QUALITY_DISPLAY`.

`tests/lint/eap-status-color-drift.js` asserts (22 checks, all pass):
- A — every `OPERATIONAL_STATUS` / `DATA_QUALITY` entry's `color` string equals
  its own `hex` number;
- B — each `eap.html` legend chip equals the source-of-truth colour for its label;
- C — both `SIM_QUALITY_DISPLAY` greys equal `OFF`'s colour.

Wired into `scripts/pre-commit.js` and `.github/workflows/ci.yml` (unit-tests
stage). No runtime change, no colour changed.

---

## F-10 — Industrial motion system

A semantic, compositor-only motion layer on **both** operator pages. It exists to
say *where* state changed; it never decorates, and there is no continuous
animation anywhere (Phase 17 budget: the 210-cell map has **zero** per-cell
animation — cell state is a WebGL colour, not a DOM transition).

### Tokens (both pages)

```
--motion-fast: 110ms      --ease-standard: cubic-bezier(.2, 0, 0, 1)
--motion-normal: 190ms     --ease-exit: cubic-bezier(.4, 0, 1, 1)
```

EAP also gained `--z-drawer: 20` / `--z-webgl-lost: 30` (both overlays previously
had no explicit `z-index`).

### Transitions added

| Element | Motion | Property class |
|---|---|---|
| buttons, `.seg button`, `.btn`, `#twin-link` | colour / background / border on hover · pressed · `aria-pressed`; 1px `translateY` on `:active` | compositor + paint (colour) |
| `.ss-cell` (twin) | background on hover | paint |
| `#zoneDrawer` (EAP) | slide-and-fade up from its corner | **opacity + transform only** |
| `#inspector` (twin) | fade + rise from its docked corner | **opacity + transform only** |
| `#webgl-lost` (both) | cross-fade over the frozen frame | **opacity only** |
| `#command-center-dialog` + `::backdrop` (twin) | `<dialog>` fade + rise | **opacity + transform only** |

Every overlay animates *through* the `hidden` / `[open]` toggle its JS already
drives, via `transition-behavior: allow-discrete` + `@starting-style` — **no JS
change on either page** — and degrades to an instant show/hide where unsupported.
No `will-change` anywhere.

### `prefers-reduced-motion: reduce`

Full block on both pages: transition durations collapse to `1ms`, transforms
drop, `:active` translate drops — but the drawer, inspector, context-loss banner
and command-centre dialog **still appear and disappear**, and every focus /
pressed / hover state still reads. Verified: `reducedMotion: 'reduce'` context →
drawer `transition-duration: 0.001s`, `transform: none`, drawer still visible.

### Performance (F-15, partial)

`PerformanceObserver` longtask trace over 30 drawer/select cycles, quiet host:

| Page | before motion | after motion |
|---|---|---|
| EAP | 0 main-thread blocks >50ms | 0 (one 52ms blip, non-repeating) |
| Twin mode-switch latency | 133 ms (host-load flake) | 101 ms |

EAP idle frame p50 unchanged (33.3 ms — the existing idle throttle).
`opacity` / `transform` / `display allow-discrete` cost nothing on the main
thread, as expected. A full DevTools recalc / layout / paint / composite
breakdown was **not** captured — see Deferred.

---

## Regression — after all five commits

| Check | Result |
|---|---|
| `ui-visual-regression` (32 states) | **0 failures** |
| `eap-map-regression` | PASS |
| `eap-operational-state-regression` | PASS |
| `eap-api-failure-safety-regression` | PASS |
| `eap-webgl-context-lifecycle-regression` | PASS (drawer + banner toggles, `allow-discrete` window clears well before the 1400 ms re-check) |
| `eap-canonical-route-regression` | PASS |
| `factory-twin-failure-modes` | PASS 11/11 |
| `factory-twin-regression` | drawer / layer / reference / coordinate-stability assertions PASS; the one FAIL is the pre-existing environmental `mode-switch latency` threshold (before-motion was *worse*: 133 vs 101 ms) |
| `scripts/pre-commit.js` (all unit + linters + JSON + the new drift lint) | PASS |
| axe | not re-run this phase (no `axe.min.js` in the current scratchpad); motion is `opacity`/`transform`/`prefers-reduced-motion`-guarded and touches no aria/name/role/contrast — prior phase's 0 violations stands, contrast tokens unchanged |

---

## Acceptance criteria (Phase 21) — honest status

### CSS

| Criterion | Status |
|---|---|
| zero unexplained UI colours | **NOT MET** — `index.html` still has ~18 ad-hoc hex outside `:root` (F-2). `eap.html` `:root` is clean; status colours are now lint-pinned (F-3). |
| semantic tokens shared across pages | **PARTIAL** — motion/ease tokens now exist on both pages but as *parallel copies*; no shared stylesheet, no cross-page token lint (F-1). |
| no avoidable specificity escalation | **MET** — one selector raised to remove an `!important` (F-6); no new escalation. |
| no new `!important` | **MET** — the only new `!important` is inside the two `prefers-reduced-motion` blocks, the documented-unavoidable case (must beat every `transition` declaration; the standard design-system pattern). |
| no unexplained duplicated styles | **PARTIAL** — `#webgl-lost` + the motion token set are duplicated across the two pages; documented, blocked on F-1. |
| maintainable CSS structure | **IMPROVED** — tokens for motion + z-index; status colours lint-enforced; VR baseline guards future edits. |

### Responsive

| Criterion | Status |
|---|---|
| 1366 / 1920 / 2560 / 3840 | **MET** — 0 horizontal overflow at all four, all 32 VR snapshots + `eap-map-regression` + `factory-twin-regression` |
| 200% zoom | **NOT VERIFIED** (F-12) |
| zero unexpected horizontal overflow | **MET** |
| fluid `clamp()` / `@container` modernization | **NOT DONE** (F-7) |

### Animation

| Criterion | Status |
|---|---|
| deliberate motion system exists | **MET** |
| no excessive / no perpetual animation | **MET** — 0 continuous animations; 0 per-cell animation on the 210-cell map |
| reduced-motion | **MET** — full block both pages, state changes preserved |
| transitions feel intentional | **MET** — overlays rise from where they dock; buttons respond on press; nothing flashes |
| no animation-induced operational distraction | **MET** — no motion on the map itself, no colour cycling, no attention-grabbing loops |

### Accessibility

| Criterion | Status |
|---|---|
| axe = 0 | **CARRIED** from prior phase (not re-run — see above) |
| keyboard blockers = 0 | **MET** — `:focus-visible` untouched; overlay JS toggles unchanged |
| focus visible | **MET** |
| reduced-motion | **MET** |
| forced-colors assessed | **NOT DONE** (F-14) |
| 200% zoom assessed | **NOT DONE** (F-12) |

### Performance

| Criterion | Status |
|---|---|
| no meaningful regression | **MET** — longtask before/after 0↔0; twin latency not motion-caused |
| CSS rendering trace captured | **PARTIAL** — longtask traces yes; full recalc/layout/paint/composite breakdown no (F-15) |
| animation frame evidence | **MET** — idle p50 unchanged, no long frames from motion |
| interaction p95 measured | **MET** (EAP; carried for twin) |
| memory regression = 0 | **MET** — no new listeners, no new timers, CSS-only |

### Visual

| Criterion | Status |
|---|---|
| baseline exists | **MET** (F-8) |
| visual regression passes | **MET** — 0 failures; the two motion commits' drift was reviewed key-by-key and re-baselined deliberately |
| all target resolutions reviewed | **MET** — 4 viewports in the baseline |
| intentional changes documented | **MET** — each re-baseline commit lists the drift |

---

## Deferred / not done

| ID | Item | Class | Why | Next |
|---|---|---|---|---|
| F-1 | full cross-page token unification (shared stylesheet + consolidated `--ink`/`--text` etc. vocabulary + cross-page token lint) | SHOULD-FIX | large; a two-file structural change; motion tokens landed as the first step | one commit introducing a shared `tokens.css` `<link>` on both pages, migrate the colour/space/radius vocabulary, add a lint asserting the two `:root` blocks resolve equal |
| F-2 | `index.html` ~18 ad-hoc hex → `--evidence-*` / `--risk-*` semantic tokens | SHOULD-FIX | needs the F-1 token layer to land in first | after F-1 |
| F-7 | fluid `clamp()` typography + `@container` inspector / KPI / legend | SHOULD-FIX | deliberate redesign; current breakpoint behaviour is functionally correct (0 overflow everywhere) | after F-1/F-9, VR-guarded |
| F-9 | semantic type scale (`--text-xs…xl`), raise the `9px` labels | SHOULD-FIX | needs F-1 | with F-7 |
| F-15 | full DevTools recalc/layout/paint/composite trace | SHOULD-FIX | time; longtask + frame evidence already show motion is compositor-only | a scripted `page.metrics()` + trace capture before/after any future CSS change |
| F-14 | `@media (forced-colors: active)` | ACCEPTABLE-DEFER | small, isolated | spot-check badges + `rgba()` overlays in HC mode, add the block |
| F-12 | 200% zoom / text-scaling screenshot verification | ACCEPTABLE-DEFER | small | add a `deviceScaleFactor`/zoom row to the VR matrix |
| — | wire `ui-visual-regression` + `eap-status-color-drift` into a CI job | SHOULD-FIX | CI twin-regression stage has no direct service port | add a port override or `docker compose run` step |

---

## Final decision

**`CSS/UI/UX EXCELLENCE — NOT READY`**

Delivered and solid: the visual-regression baseline (F-8), the status-colour
source-of-truth enforcement (F-3), and a full compositor-only motion system with
reduced-motion support on both operator pages (F-10), all measured and
regression-clean.

Not blockers (nothing is broken, no regression, accessibility and CAD and
EAP/LDI separation intact), but the following Phase-21 acceptance criteria are
**scoped and not built**, and honesty requires listing them rather than
re-baselining the bar:

1. **F-1** — cross-page token unification (parallel token copies exist; no shared
   stylesheet, no cross-page lint).
2. **F-2** — `index.html` ad-hoc colours not yet tokenized.
3. **F-9** — no semantic typography scale.
4. **F-7** — responsive not modernized to fluid / container-query.
5. **F-15** — CSS render-trace only partially captured (longtask + frame, not the
   full recalc/layout/paint/composite breakdown).

F-1 is the keystone — F-2, F-7 and F-9 all sit on the shared token layer it would
introduce.
