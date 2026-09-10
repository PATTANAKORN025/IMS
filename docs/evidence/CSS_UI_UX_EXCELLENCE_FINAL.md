# CSS / UI / UX Excellence — Final Implementation Result

**Date:** 2026-09-10
**Branch:** `refactor/css-ui-audit` → PR #21 (base `integration/andon-layout-safe`, which already contains PR #20)
**Companion:** `docs/evidence/CSS_UI_UX_EXCELLENCE_AUDIT.md` (the finding list).
**Method:** every change measured against a disposable `factory-twin-3d`
container serving the working-tree `public/` on `:4199`, plus the
`tests/playwright/ui-visual-regression.js` layout baseline, `scratchpad/a11y.js`
(axe-core 4.10.2 + 200% zoom + forced-colors), and `scratchpad/perf15.js`
(Chromium CDP `Performance.getMetrics`).

---

## Objective

Take the two operator pages served by `factory-twin-3d` — `index.html` (physical
twin) and `eap.html` (EAP SCADA Floor 1) — to production-grade industrial
SCADA/HMI CSS quality **without** touching correctness, CAD geometry, EAP
semantics, the production/demo boundary, accessibility, WebGL behaviour, or
runtime stability.

---

## Implementation summary (commits, newest last)

| Commit | Finding | What |
|---|---|---|
| `f2e8be54` | **F-8** | Visual + layout regression harness + a 32-state committed baseline |
| `ea14bf51` | **F-3** | EAP status colours pinned to `operational-status.js` + drift lint (pre-commit + CI) |
| `6b1b17ff` `b54129da` | **F-10** | Compositor-only industrial motion system, both pages, full `prefers-reduced-motion` |
| `39cc750a` | — | re-baseline after PR #20 merged into the branch |
| `9cccda4a` | **F-1 / F-2 / F-9** | one shared token vocabulary + parity lint; index.html ad-hoc colours tokenized; one semantic type scale |
| `bd4a5026` | **F-7 / F-15** | fluid `clamp()` aside + a `@container` KPI grid; CDP performance trace |

---

## Token architecture (F-1 / F-2 / F-3 / F-10)

One vocabulary, declared in an identical `:root` NAME set on both pages
(`tests/lint/css-token-parity.js` enforces it; in pre-commit + CI):

- **Scales — identical VALUES both pages:** `--space-1..5`, `--radius-sm/md/lg`
  (3/4/6), `--text-3xs..xl` (9…20px), `--motion-fast/normal/slow`
  (110/190/320 ms), `--ease-standard/exit/emphasis`, `--z-drawer/inspector/
  webgl-lost/dialog` (20/20/30/40).
- **Palette roles — shared NAMES:** `--bg`, `--surface`, `--surface-raised`,
  `--surface-sunken`, `--border`, `--border-strong`, `--text`,
  `--text-secondary`, `--text-muted`, `--accent`, `--focus`, `--warning`,
  `--danger`, `--success`, `--status-{run,down,idle,off,initial,pm,stop,
  undefined}`, `--quality-{unmapped,unavailable}`.
- **Deliberate divergence, marked and lint-required:** the two dark palettes stay
  separately tuned. The EAP map shows **no live status** so its signal colours
  are **muted** (`--warning #e0ac63`, `--success #7fd1a6`, `--accent #63a4ff`);
  the twin shows **real plant state** so its signal colours are **saturated**
  (`#f59e0b`, `#22c55e`, `#38bdf8`). Each page's contrast was measured against
  its own surfaces in prior FT-24 work. Every diverging line carries a
  `diverges:` note; the lint fails without it.
- **F-2:** `index.html`'s ~18 ad-hoc hex values outside `:root` are gone —
  `--evidence-{measured,observed,derived,simulated,confirmed}` (claim
  provenance), `--risk-{high,medium,low,none}` (risk tier), `--label-*` (machine
  label overlay), `--on-{danger,warning,success,accent}` (readable ink on a
  signal fill), `--surface-{hover,active}`. The evidence and risk ramps are
  data-visualisation semantics, kept as named tokens rather than folded into UI
  roles. Only `#0000EE` remains, inside a comment.
- **F-3:** the eight status colours + `--quality-unmapped` are assert-pinned to
  `operational-status.js` by `tests/lint/eap-status-color-drift.js` (22/22).

## Typography architecture (F-9)

One scale replaces 11 ad-hoc `font-size` literals per page:
`--text-3xs 9px · --text-2xs 10 · --text-xs 11 · --text-sm 12 · --text-base 13 ·
--text-md 14 · --text-lg 16 · --text-xl 20`. `--text-base` is a **fixed 13px**
with one clean `@media (min-width: 2560px)` step to 14px — no fluid base, so
computed type stays deterministic per breakpoint. `--text-3xs` (9px) is
intentional micro-type for the densest provenance/legend labels only, noted at
each use. `font-variant-numeric: tabular-nums` untouched on every numeric cell.
EAP: **0 font-size literals** remain. Twin: **0**.

## Responsive architecture (F-7)

- EAP aside: `1fr clamp(300px, 18vw, 380px)` — one fluid rule replacing a fixed
  340px track plus two width breakpoints. 300px @1366 (unchanged), 346 @1920,
  380 @2560+ (was a stepped 400). `#zoneDrawer` width
  `min(340px, calc(100vw - 28px))`.
- Twin: `#drawer` is `container-type: inline-size`; `#factory-status` is
  `repeat(2, minmax(0, 1fr))` with a `@container (max-width: 260px)`
  single-column fallback — the KPI grid sizes to the drawer, not the viewport.
- Container queries used in exactly **one** place, where the component's width
  genuinely should drive its layout. Not sprinkled.

## Motion architecture (F-10)

Compositor-only (`opacity` / `transform` / `display: allow-discrete`), no
`will-change`, no continuous animation, **zero** per-cell animation on the
210-cell map. Overlays (`#zoneDrawer`, `#inspector`, `#webgl-lost`,
`#command-center-dialog` + `::backdrop`) fade + rise from where they dock,
animating *through* the `hidden` / `[open]` toggle their JS already drives —
`allow-discrete` + `@starting-style`, no JS change. Buttons transition
colour/border on hover/press/`aria-pressed` with a 1px `:active` translate.
Full `@media (prefers-reduced-motion: reduce)` on both pages: durations to 1ms,
transforms dropped, every overlay still appears/disappears, every focus/press
state still reads.

---

## Accessibility verification (scratchpad/a11y.js, axe-core 4.10.2)

| Check | EAP | Twin |
|---|---|---|
| axe 1366 / 1920 / 2560 / 3840 | **0** / **0** / **0** / **0** | **0** / **0** / **0** / **0** |
| axe, overlay open (drawer / inspector) | **0** | **0** |
| axe at 200% zoom | **0** | **0** |
| 200% zoom — horizontal page scroll | **none** | **none** |
| 200% zoom — controls still rendered | 7/8 in fold, rest wrap (no clip) | 6/19 in fold, rest wrap (no clip, no h-scroll) |
| forced-colors (`forcedColors: active`) — renders + controls + no page error | **yes** | **yes** |

- `:focus-visible` global rule untouched on both pages. No `outline: none`.
- Status communicated by colour **and** glyph **and** label
  (`operational-status.js`, asserted by `eap-operational-state-regression.js`).
- Three prior contrast fixes (dim decorative glyph, never text) preserved through
  the token rename.
- **forced-colors limitation (documented):** there is no dedicated
  `@media (forced-colors: active)` block. Assessment: axe reports 0 violations in
  forced-colors emulation, the page renders, controls are present, no errors, and
  the browser enforces system colours + focus. An explicit block tuning
  `rgba()` overlay backgrounds and badge borders for High Contrast is a
  low-risk follow-up (F-14).

---

## Visual regression strategy (F-8)

`tests/playwright/ui-visual-regression.js` — per (page, viewport, state):
a **layout-snapshot JSON** (`:root` tokens + computed style + client rect for a
fixed chrome-selector set + overflow flag) is the committed diffable contract
(`tests/playwright/ui-visual-baseline/`, LF-pinned, outside the gitignored
screenshots tree). A non-canvas chrome PNG clip is pixel-diffed with a soft
per-channel tolerance; a full-frame PNG is a human-review artefact.

Matrix: 1366 / 1920 / 2560 / 3840 × { EAP: production, demo, selected, drawer,
webgl-lost ; twin: default, drawer, webgl-lost } = 32 states. Twin
live-telemetry regions have `rect` dropped, style still asserted.

Every re-baseline in this phase (F-10 ×2, F-1/2/9, F-7) was reviewed key-by-key
before updating: each drift key was a `transition*` / `opacity` / token /
`font-size` / `border-radius` / aside-width value that was the intended change —
**0 unexplained rect drift, 0 overflow, 0 control lost** across all 32 snapshots.

---

## Performance measurements (F-15)

Chromium CDP `Performance.getMetrics` deltas across a fixed interaction script
(EAP: select · deselect · open drawer · close · toggle sim ×2 · resize ×2 ·
WebGL loss/restore; twin: drawer ×2 · reference layer ×2 · command-centre
open/Esc · resize ×2), 1920×1080.

| Metric | EAP before | EAP after | Twin before | Twin after |
|---|---:|---:|---:|---:|
| LayoutCount | 14 | **14** | 67 | **68** |
| RecalcStyleCount | 34 | 37–39 | 94 | 95 |
| LayoutDuration | 0.018 s | 0.014 s | 0.034 s | 0.032 s |
| RecalcStyleDuration | 0.009 s | 0.007–0.025 s | 0.014 s | 0.016–0.018 s |
| ScriptDuration | 0.109 s | 0.079–0.090 s | 0.433 s | 0.42–0.45 s |
| TaskDuration | 1.47 s | 1.36–1.41 s | 7.90 s | 7.73–7.88 s |
| JSHeapUsedSize | ~1.5 MB | ~1.3–1.5 MB | ~1.8 MB | ~1.8–2.4 MB |

*"before" = the F-1..F-9 state, i.e. this trace isolates F-7 + the container
query.* Layout count identical bar the **+1** on the twin — the single new
containment context from `container-type: inline-size`. Recalc-style duration is
in the noise (< 25 ms total across ten interactions). Script and task duration
unchanged. **No measurable render cost** from the token layer, the motion
system, or the container query.

Motion-specific (earlier, `scratchpad/perfmeasure.js`): `PerformanceObserver`
longtask trace over 30 drawer/select cycles, quiet host — **0 ↔ 0** main-thread
blocks > 50 ms; EAP idle frame p50 unchanged (33.3 ms, the existing idle
throttle). 15-minute soak (prior phase) heap flat.

---

## EAP guarantees (F-18) — re-verified, not regressed

| Guarantee | Evidence |
|---|---|
| 210 cells / 12 zones / 40 DIRECT | `eap-map-regression` PASS |
| CAD geometry / coordinate stability | `factory-twin-regression` coordinate assertions PASS; `Factory Twin CAD Reconciliation` + `Orientation Proof` unit tests PASS |
| 7 plant states + NO_DATA + UNAVAILABLE distinct | `eap-operational-state-regression` PASS |
| production/demo separation, no silent simulation | `eap-operational-state-regression` section 0 PASS |
| EAP / LDI operational separation | 0 refs (prior audit); no new dependency added — CSS-only change |
| WebGL recovery | `eap-webgl-context-lifecycle-regression` PASS |
| API robustness | `eap-api-failure-safety-regression` PASS |
| axe = 0 | above |
| responsive overflow = 0 | above |

---

## Validation matrix (§21)

| Area | Result |
|---|---|
| CSS lint (token parity, status drift) | **PASS** |
| new `!important` | **0** outside the two `prefers-reduced-motion` blocks (documented, unavoidable) |
| ad-hoc semantic colours | **minimised** — 0 UI-role hex outside `:root`; evidence/risk ramps kept as named data-viz tokens |
| undefined CSS tokens | **0** (parity lint check 3) |
| visual regression | **PASS** (32/32) |
| responsive 1366 / 1920 / 2560 / 3840 | **PASS** — 0 overflow |
| 200% zoom | **PASS** — 0 h-scroll, 0 axe, no clip |
| keyboard | **PASS** — `:focus-visible` untouched, JS toggles unchanged |
| axe | **0 violations** — both pages × 4 res + overlay + 200% zoom |
| reduced motion | **PASS** — full block both pages, state changes preserved |
| forced colors | **PASS with documented limitation** — 0 axe, renders, no explicit `@media` block (F-14) |
| EAP geometry | **PASS** |
| EAP / LDI separation | **PASS** — CSS-only, no new dependency |
| WebGL recovery | **PASS** |
| CSS performance trace | **captured** (table above) |
| functional regression | EAP 5/5 **PASS**, `factory-twin-failure-modes` **PASS**; `factory-twin-regression` fails only its mode-switch-latency threshold — environmental (133 ms pre-motion vs 101–127 ms now; `app.js` untouched by this PR) |

---

## Known limitations / deferred

| ID | Item | Class | Note |
|---|---|---|---|
| F-14 | dedicated `@media (forced-colors: active)` block | ACCEPTABLE-DEFER | assessed clean (0 axe, renders, browser-enforced HC); an explicit block for `rgba()` overlays + badge borders is a small follow-up |
| F-13 | loading / empty / error / unavailable not one shared component | ACCEPTABLE-DEFER | each state is styled where it lives; content is semantically correct and honest (`eap-api-failure-safety` + `eap-operational-state` PASS); a `.state-block` consolidation touches app markup and is out of scope for a CSS PR |
| — | `factory-twin-regression` mode-switch latency threshold | ENVIRONMENTAL | fails identically with zero CSS changes on this loaded dev host; needs an idle host / CI runner or a threshold review (physical-twin test, not this PR's scope) |
| — | wire `ui-visual-regression` + the two CSS lints' Playwright half into a CI job | FOLLOW-UP | the two lints ARE in the CI unit-tests stage; the browser VR needs a compose port override |
| — | `#command-center-dialog` not in the VR probe set | FOLLOW-UP | its fade is verified functionally |

---

## Final decision

`CSS/UI/UX EXCELLENCE — READY`

All Phase-21 acceptance criteria pass with cited evidence: one shared token
vocabulary (lint-enforced), 0 ad-hoc UI colours, 0 undefined tokens, a semantic
type scale, fluid responsive layout with 0 overflow 1366–3840 and at 200% zoom,
a deliberate compositor-only motion system with a complete reduced-motion path,
**axe 0 violations everywhere**, a captured CSS performance trace showing no
render regression, and every EAP guarantee re-verified. The one failing check
(`factory-twin-regression` latency threshold) is environmental — it fails
identically without any CSS change — and forced-colors is assessed clean with an
explicit-block follow-up documented.
