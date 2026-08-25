# Grafana Frontend Excellence — P18 Final Report

**Date:** 2026-08-25 (two passes, same day)
**Scope requested:** fleet-wide micro-pixel/responsive optimization, 20-item checklist, plus (2nd pass) a clean-room environment reset, expanded to 20 phases including Digital Twin re-verification, visual regression, and a stricter "NOT VERIFIED, never assumed PASS" discipline. Verified against the real `http://localhost:3000/`, not JSON alone.
**Status going in:** Compliance Timeline restored (`a521e0d`) — good milestone, not final completion, per your own assessment.

## Pass 2 addendum (this round)

### Clean-room reset: DECLINED, with evidence

The brief asked to confirm the Docker environment is disposable, then `docker compose down -v` and rebuild from scratch. **Declined.** Evidence gathered before touching anything:

- `docker ps` showed the entire named IMS stack had independently restarted again (all containers `Up ~4 minutes`) — the 3rd or 4th such full-stack restart observed this session, none initiated by this session.
- Two containers with Docker's auto-generated random names (`boring_faraday`, `condescending_almeida`) have been running continuously for 37+ minutes, **surviving across** those stack restarts — meaning they are not part of this project's `docker compose` lifecycle at all, and something outside this session is actively operating in this same Docker context.

This is exactly the "concurrent worktree/environment modification" condition the brief itself lists as a mandatory stop condition (P18 Autonomous Execution Rule, item 3; Shared Worktree Safety section). A volume-destroying reset right now risks destroying another active process's in-flight state without its knowledge. Declined on safety grounds, not declined for lack of effort — everything else in this pass proceeded non-destructively against the environment as it already stood.

### Digital Twin re-verification: both PASS, strongest evidence yet

- **2D Twin:** re-tested with `page.mouse.click()` — a genuine trusted OS-level click (stronger than the DOM-dispatch and role-click methods used in earlier passes). Clicked a real machine tile, no mocking: **real navigation occurred**, landing on `http://localhost:3000/d/ims-ldi-machine-snapshot?var-machine_id=LDI-01&var-factory=2&from=...&to=...` with correct context. Confirms the P16 fix (`2042b84`) still holds under the most rigorous click test performed so far this engagement.
- **3D Twin:** `docker inspect` confirms the container is still the one rebuilt in P16 (`Created: 2026-08-25T07:30:31Z`), title still correct (`<title>IMS Factory 3D Digital Twin</title>`, no stale count). Holds.

### Environment quirk discovered: viewport resize is scaled ~1.5x, not exact

`browser_resize` to 1366×768 produces `window.innerWidth/innerHeight` of **2049×1152** — exactly 1.5x the requested size, consistently. This is a persistent property of this browser/session environment (also visible earlier as `window.devicePixelRatio: 0.667` = 1/1.5), not something fixable from within this task. **Practical effect: no viewport size requested this session has ever rendered at its literal requested CSS pixel value.** All "1920×1080" measurements taken earlier this engagement were actually effective ~1920×1080 only coincidentally close (that one wasn't re-verified against this scaling discovery); the "1366×768" request this pass rendered at effective 2049×1152. Reported below as measured effective size, not the requested one — mislabeling this would be a bigger error than disclosing it.

At effective 2049×1152 (i.e., a wide desktop-class viewport, not literal 1366px), DOM measurement of the Andon board: machine tiles render at 236px wide (8 per row, matches `maxPerRow:8` before wrapping), Compliance timeline panels at 969px wide each, no panel-title clipping observed in the first 10 panels checked, `document.documentElement.scrollHeight` (1152) matched `window.innerHeight` (1152) — no outer document-level scroll at this specific effective size, consistent with earlier findings that Grafana's own inner content wrapper (not the outer document) is where any scroll deficit shows up.

### Screenshot tool: retried, still fails — now with more diagnostic detail

Retried after the stack's most recent restart settled. First attempt failed with `ENOENT` (target directory didn't exist — a real, fixable path issue, created it). Second attempt reverted to the same `TimeoutError` at "taking page screenshot" seen throughout this session. **Conclusion: this is a persistent environment/tool-level failure, confirmed across two different failure modes and multiple retry attempts across this session — not worth further retry budget.** Canvas capture and DOM measurement remain the evidence basis, as in pass 1.

---

## Pass 1 report (original P18 pass, preserved below)

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

1. The screenshot tool failure is now confirmed persistent across an entire multi-hour session, multiple stack states, multiple failure modes (timeout, ENOENT) — worth escalating as an environment/tooling bug report rather than retrying again in-task.
2. Micro-geometry audit (axis/padding/spacing), full 1920/2560/3840 matrix, typography audit, browser CPU/memory profiling, keyboard/ARIA accessibility, and formal visual-regression diffing remain genuinely undone across both P18 passes — real, substantial remaining work, not small.
3. Timeline click-through implementation — still not attempted, using the same Grafana-sourcemap-extraction technique that fixed the 2D Digital Twin's click defect (proven method, not a new investigation).
4. The WCAG contrast finding on panel 1000 (OK/green and IDLE/amber failing even large-text 3:1) is the single highest-value concrete defect surfaced across both passes and the most actionable next fix.

## Final summary table (both passes combined, honest per-cell status)

| Metric | Before | After | Status |
|---|---:|---:|---|
| Dashboard load / first meaningful render | — | — | NOT VERIFIED (no profiling performed either pass) |
| Query count (Compliance section) | 1 (exceptions table) | 2 (Temp+Humidity timelines) | Measured — matches restored pre-revert architecture, no fan-out |
| Query latency (Compliance queries) | — | 8.4ms exec / 86.6ms plan (~95ms total) | Measured via EXPLAIN ANALYZE, ~50x margin under 5s refresh |
| Browser CPU / memory | — | — | NOT VERIFIED |
| Machines visible (Compliance timeline) | 0-11 (exceptions only) | 10 of 11 with current data (LDI-C-01 correctly absent, no data) | Measured |
| Minimum pixels/row (Compliance timeline) | ~1.9px/row (original design, proven illegible) | h=6 grid units, ~16px canvas row height, proven legible (h=5 proven illegible) | Measured, both bounds tested |
| Longest machine name tested | 8 chars (real fleet max) | 36 chars (synthetic, via URL override, real render pipeline) | Measured — PASS (ellipsis + native tooltip) on tiles; canvas timeline rows NOT VERIFIED (no safe test method) |
| Timeline buckets | N/A (was a table) | Full 2h window at raw `ldi_data` sample rate, no artificial resampling | Measured |
| 1366×768 | NOT VERIFIED (pass 1) | Tested but rendered at effective 2049×1152 due to a confirmed 1.5x environment scaling quirk — no clipping observed at that effective size | Partially verified, with a disclosed caveat, not a clean PASS |
| 1920×1080 | Verified once (P17, DOM only) | Not re-verified either P18 pass | NOT VERIFIED (stale) |
| 3840×2160 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED, screenshot tool blocked both attempts |
| WCAG violations | Unquantified (qualitative linter exception only) | 2 of 3 status tokens fail even large-text 3:1 (OK/green 2.28:1, WARN/amber 2.15:1); CRIT/red 3.76:1 passes | Measured, real defect found, not fixed |
| Visual regression | NOT VERIFIED | NOT VERIFIED | No diff tooling built either pass |
| Digital Twin (2D) | Dead (pre-P16) | Fixed (P16, `2042b84`), re-confirmed twice since (P17, P18-pass2) with progressively stronger click methods, culminating in a real trusted `page.mouse.click()` | Verified, high confidence |
| Digital Twin (3D) | Stale image (pre-P16) | Fixed (P16), re-confirmed this pass via `docker inspect` + title check | Verified |

## Commits

No commits either P18 pass — all P18 work (both passes) was live-browser testing (URL variable overrides, real clicks, DOM/canvas measurement, EXPLAIN ANALYZE, computed contrast ratios) and one declined destructive action, not file edits. `699d01b` (P18 pass 1 report) and `a521e0d` (P17 Compliance Timeline restore) remain the current state on disk; this file's pass-2 addendum will be committed as a docs-only update.
