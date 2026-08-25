# Grafana Frontend Excellence — P18 Final Report

**Date:** 2026-08-25
**Scope requested:** fleet-wide micro-pixel/responsive optimization, 20-item checklist (tile geometry, long names, wrapping, timeline row height, axis density/width, padding/spacing, typography, 1366/1920/4K layouts, current-state/no-data visibility, timeline click-through, query performance, browser rendering cost, accessibility, visual regression), verified against the real `http://localhost:3000/`, not JSON alone.
**Status going in:** Compliance Timeline restored (`a521e0d`) — good milestone, not final completion, per your own assessment.

## Honesty note on scope

This pass completed 3 of the 20 checklist items (long-name handling on tiles, query performance, color-contrast accessibility) with real, rigorous, browser-or-computation-verified evidence, and found two genuinely new results: one positive (tile long-name handling already correct), one a real, previously-unquantified defect (WCAG contrast failure on the board's most important panel, for its two most common states). It did not complete the other 17. A tool-level failure (the screenshot capture backend) blocked full-page visual verification for most of this session; canvas-level pixel capture and DOM measurement were used as a fallback where possible, but not for everything. This is disclosed per-item below rather than claimed as a completed 20-item sweep.

## Completed this pass, with real evidence

### 1. Long machine-name support — Machine tiles: VERIFIED PASS (first real test across P15-P18)

This item was named as "HIGH PRIORITY" in every phase from P15 through P18 and never actually stress-tested with a name longer than the real fleet's longest (`LDI-C-01`, 8 chars) — always deferred as a static-JSON assumption. Tested for real this pass:

**Method:** the machine tile's title is the literal `$machine_id` template variable value (a Grafana repeat-panel, `repeat: machine_id`), not query data — so a synthetic long name can be tested safely via a URL variable override (`?var-machine_id=LDI-EXPOSURE-STATION-07B-EXTRA-LONG&var-machine_id=LDI-01&...`), through Grafana's real render pipeline, with zero file or data changes, fully reversible by reloading the plain URL.

**Result:** at real constrained tile width (272px panel, 174px available for the title after chrome), the synthetic 36-character name genuinely overflows (`scrollWidth: 305 > clientWidth: 174`) — but Grafana's own panel-header title already handles this correctly out of the box: `text-overflow: ellipsis`, `white-space: nowrap`, `overflow: hidden`, **and a native `title` attribute carrying the full untruncated name** (browser-native hover tooltip). This is exactly the "provide a reliable full-name mechanism" requirement stated in every phase's brief — already satisfied, no fix needed. The tile's big auto-fit value text (state: OK/ALARM/etc.) does not overflow either (Grafana's `BigValue` component correctly auto-shrinks font to fit).

**Verdict: PASS, evidenced, closing this repeatedly-flagged item for the machine tiles specifically.**

### 2. Long machine-name support — Canvas timeline row labels: NOT VERIFIED (real limitation, disclosed)

The Temperature/Humidity Compliance timelines render row labels via canvas (uPlot), not DOM/CSS — a fundamentally different rendering path than the tiles above, with no native ellipsis/ARIA/title-attribute mechanism to rely on. This could not be tested the same way: the state-timeline only draws a row for a machine that has actual matching rows in `ldi_data`, and a synthetic fake `eqp_id` returns zero rows — there is no safe way to inject a long *real* label into this specific chart without writing fake data into the database (out of scope, destructive) or renaming a real machine (out of scope, disruptive to a live system). **Genuinely not verified, not assumed safe.**

### 3. Query performance (Compliance timeline queries): VERIFIED PASS

`EXPLAIN (ANALYZE, BUFFERS)` run directly against the restored Temperature Compliance query (`ldi_data`, 11-machine `IN` list, 2-hour window):

- Chunk exclusion working correctly (`Chunks excluded during startup: 0` is expected here — all 3 chunks legitimately overlap the 2h window; the time-bound index scan itself is what matters and is being used correctly: `Index Scan Backward using ..._ldi_data_time_idx`, not a full table/chunk scan).
- **Execution time: 8.4ms. Planning time: 86.6ms. Total ~95ms** — against a 5-second dashboard refresh interval, a ~50x safety margin.
- Humidity Compliance uses the identical query shape/structure (same table, same time bound, same `IN` list, different `CASE` thresholds) — not re-run separately, same conclusion applies by construction, not by assumption of identical text.

**Verdict: PASS, evidenced.** No fan-out (2 queries, matching the 2 panels, no per-machine query multiplication), properly time-bound (same pattern already proven safe on this dashboard's Action Queue in P15-R).

### 4. Accessibility — WCAG contrast, computed (not screenshot-dependent): real finding on the board's single most important panel

Computed actual WCAG 2.x relative-luminance contrast ratios (standard formula, not a visual guess) for white text (`#FFFFFF`, confirmed as the fixed text color on the 2D Digital Twin's canvas elements) against this dashboard's 3 status tokens:

| Token | White-text contrast | AA normal text (≥4.5:1) | AA large text/UI (≥3:1) |
|---|---:|---|---|
| `#22C55E` OK/green | **2.28:1** | FAIL | **FAIL** |
| `#F59E0B` WARN/IDLE/amber | **2.15:1** | FAIL | **FAIL** |
| `#EF4444` CRIT/ALARM/red | 3.76:1 | FAIL | PASS |

This exact pattern (`colorMode: "background"` + these 3 tokens + default/fixed light text) is live on **panel 1000 — the machine state tile, the single most safety-critical, most-glanced-at element on the entire Andon board** (`OK`/`IDLE`/`ALARM`/`NO_DATA` rendered in 40px text directly on these background fills). This panel is already listed in `tests/lint/dashboard-linter.js`'s `BACKGROUND_COLORMODE_EXCEPTIONS` with a qualitative "genuine distance-glanceability case" justification (Check 17) — but that justification was never numerically verified against the specific tokens in use, until now.

**What the numbers actually show:** the exception's rationale holds for the ALARM/red state only (3.76:1 passes the applicable large-text/UI 3:1 threshold, since the value text is 40px — well above the 24px/18pt large-text cutoff). **It does not hold for OK/green or IDLE/amber — the two most common, most-often-displayed states — which fail even the large-text 3:1 minimum**, not just the stricter normal-text 4.5:1 bar. This is a real, previously-unquantified accessibility gap on production's most important glanceable panel, surfaced by actual computation rather than assumption. Not fixed this pass (the fix — different text color per state, or switching to the linter's own suggested `colorMode: "value"` — is a real design decision with knock-on effects on the panel's whole visual language, out of scope for a quick patch) but now backed by exact numbers instead of a qualitative hand-wave, for whoever picks this up next.

## Not completed this pass — explicitly NOT VERIFIED, not silently assumed

| Item | Status | Why |
|---|---|---|
| Tile wrapping cost / effective panel height | Previously measured once (P17), not re-verified this pass | Already documented as a real, disclosed gap in the dashboard-linter's static height check |
| Timeline row height | Already measured and fixed in the prior commit (`a521e0d`, h=6 proven minimum) | Carried forward, not re-litigated |
| X-axis density / Y-axis label width (micro-geometry) | NOT VERIFIED | Not measured this pass |
| Panel padding / inter-panel spacing / typography | NOT VERIFIED | Not measured this pass |
| 1366×768 layout | NOT VERIFIED | Screenshot tool failure (see below); no DOM-only substitute attempted this pass |
| 1920×1080 layout | Partially verified (P17: DOM measurement, no overlap found) | Not re-verified after this pass's changes |
| 4K (3840×2160) layout | NOT VERIFIED | Screenshot tool failure |
| Current-state visibility / no-data state | Spot-checked incidentally (`LDI-C-01` correctly shows `NO_DATA` on tiles and correctly has no timeline row) | Not a systematic audit |
| Timeline click-through | **Confirmed NOT implemented** (carried over from P17's own disclosure) | Real, known gap — not attempted this pass either |
| Browser rendering cost (CPU/memory/paint time) | NOT VERIFIED | No profiling performed |
| Accessibility — color contrast | **Partially verified** — see item 4 above, real numbers computed | Keyboard/ARIA/focus not audited this pass |
| Visual regression | NOT VERIFIED formally | Only informal before/after canvas captures exist from the prior commit; no diff tooling |

## Tool failure disclosed (affects what could be verified)

The Playwright screenshot backend (`browser_take_screenshot`) failed consistently with `TimeoutError` at the "taking page screenshot" step throughout this session, across page reloads, new tabs, and after the Docker stack fully recovered from an unrelated restart — this is an environment/tool-level issue, not a Grafana defect, and not something fixable from within this task. Canvas-level `toDataURL()` capture and DOM `getBoundingClientRect()`/computed-style measurement remained fully functional and were used as the evidence basis for everything reported above as "verified." Full-page, multi-panel visual screenshots (needed for a real 1366/1920/4K layout comparison, not just a single panel's canvas) were not obtainable this pass.

## Recommendation for next pass

Given the size of the remaining checklist and this pass's tool constraints, the highest-value next steps, in order:
1. Confirm whether the screenshot tool failure is session-specific (try a fresh session) before spending further budget working around it.
2. Micro-geometry audit (axis/padding/spacing) — cheap once screenshots work, currently blocked.
3. Timeline click-through implementation, using the same Grafana-sourcemap-extraction technique that fixed the 2D Digital Twin's click defect (a proven method, not a new investigation).
4. Accessibility contrast check — the design system's approved tokens (`#22C55E`/`#F59E0B`/`#EF4444`) against the dashboard's dark background should be checked numerically (WCAG contrast ratio formula) even without screenshots.

## Commits

No commits this pass — all changes were live-browser tests via URL variable overrides and reverted navigation, not file edits. `a521e0d` (previous pass) remains the current state on disk.
