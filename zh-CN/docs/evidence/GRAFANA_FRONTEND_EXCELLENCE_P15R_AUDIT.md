> [!NOTE]
> **自动翻译 / 深度技术数据**
> 本文档为深度技术审计/证据报告。为了保持专业术语的准确性，目前主要以英文原文为准。

# Grafana Frontend Excellence — P15-R Audit (Operator Andon Board Deep Dive)

**Date:** 2026-08-25
**Scope:** Deep, render-verified re-audit of `IMS LDI - Operator Andon Board`, per the P15-R instruction to not treat the earlier P15 closure as sufficient.
**Method:** Live browser (Playwright, already-authenticated session against `http://localhost:3000/`), direct TimescaleDB queries (`docker exec ... psql`), `EXPLAIN (ANALYZE, BUFFERS)`, dashboard-linter, JSON inspection.

## Honesty note on scope

P15-R's brief covers 33 sections (viewport matrix at 5 resolutions, axis micro-geometry, typography hierarchy, full accessibility pass, interaction QA, fleet-wide consistency matrix, visual regression harness, etc.). This audit did **not** execute all of them exhaustively. It went deep on the single highest-value target — Priority 0, the Operator Andon Board — found and fixed one severe, previously-undiscovered defect and one real secondary defect, and verified both live. Sections not covered are listed explicitly in §5 as **UNVERIFIED**, not claimed complete. This follows the brief's own rule: "If something cannot be tested, explicitly mark it as UNVERIFIED."

## 1. Baseline (P15-R0)

- `git status`: clean at session start. Created dedicated branch `perf/grafana-p15r-operator-andon` off `main` at `6b47131`.
- Read the full Andon Board JSON (11 panels + 2 repeated-tile templates, kiosk design: 1280x720, 20-grid-unit height ceiling, zero-scroll intent per its own `description` field).
- Confirmed live fleet size: 11 machines (`LDI-01`..`LDI-10`, `LDI-C-01`), up from the smaller count assumed when `maxPerRow: 8` was originally set — wraps machine tiles to a second row.
- **Concurrent-session note:** mid-session, `git reflog` showed an external process checked this repo out to `main` and committed (`0859d1b docs: finalize world-class polyglot audit`) while this audit was in progress. That commit and its files (`README.md`, `th/`, `zh-CN/` docs) were left untouched — not authored by this audit, out of scope, and touching them would risk clobbering someone else's in-progress work. All commits from this audit were made on the dedicated branch, isolated from that activity.

## 2. P0 Finding: Action Queue table permanently stuck loading

**Severity: P0.** The Action Queue table — the single highest-priority panel on the board per its own documented information hierarchy (active alarms rank above trend/KPI panels) — rendered as a bare title with no header, no rows, and a perpetual loading-bar, across every observation: fresh navigation, hard reload, 20+ second waits, multiple 5-second refresh cycles, and Grafana's own Query Inspector (which itself never resolved past "Loading" even after an explicit manual refresh click).

This was **not** a data problem: `docker exec ims-timescaledb psql` running the literal query returned real rows (verified 3 live Critical/Major alarms present at the time).

**Root cause**, found via `EXPLAIN (ANALYZE, BUFFERS)`: the query's `LEFT JOIN public.ldi_data d ON d.log_id = a.related_log_id` has no time bound. `ldi_data` is a TimescaleDB hypertable with 250+ chunks (many compressed). With no bound on `d.time`, TimescaleDB cannot exclude any chunks and must decompress and scan the entire hypertable to build the join's hash table — on every single 5-second dashboard refresh. Measured execution time: 36s (light load) to 115s (under concurrent load), against a 5-second refresh interval. The query could never finish before the next refresh superseded it, so the panel never had a chance to render.

**Fix:** bounded the join to `d.time BETWEEN a.logdate - INTERVAL '10 minutes' AND a.logdate + INTERVAL '10 minutes'`. Verified first that the real relationship holds: querying live data showed the related `ldi_data` row is always logged within seconds of its alarm (max observed gap: 23 seconds) — a 10-minute window is a ~25x safety margin, never at risk of excluding a genuine match.

**Verification:**
- `EXPLAIN ANALYZE` after the fix: the join node dropped from tens of thousands of ms to **4.4ms**, with TimescaleDB reporting chunk exclusion active. Clean end-to-end query time: **2.2 seconds** (previously never completed).
- Correctness: diffed the 500 most recent Critical/Major alarms (equipment, related_log_id, logdate, mo, log_id, time) between the original and bounded-join query — **byte-for-byte identical**.
- Live browser: after the fix, the panel renders correctly with real data and held stable across 4 consecutive 5-second refresh cycles (~22 seconds of continuous observation), where it had never once rendered before.
- Dashboard linter: 0 errors after the change. Pre-commit hook (all unit/lint/JSON suites): passed.

Committed as `6690787`.

## 3. P1 Finding: Action Queue had no room to show more than ~1 alarm row

**Severity: P1.** Even once queries return, the table only had `h:4` (roughly one visible alarm row before an internal scrollbar appears). The dashboard's own `description` states "zero interaction, zero scrolling" — an internal scrollbar on the board's most important panel during a real multi-alarm event (this system was observed with 2-6 simultaneous Critical/Major alarms earlier in this project's history) directly violates that design intent.

**Fix:** rebalanced height within the existing 20-grid-unit kiosk ceiling (`tests/lint/dashboard-linter.js` `MAX_HEIGHT`): Temperature/Humidity compliance timelines `h4→h3` each (secondary trend info, ranks below active alarms per the board's own hierarchy), Action Queue `h4→h5`. Net height unchanged, so the machine-tile rows below are unaffected (verified: no gaps/overlaps, tiles still start at the same `y`).

**Verification:** live render at 1280x720 (literal kiosk target resolution) confirms the taller table with full header row and readable alarm data. Dashboard linter and pre-commit suite pass.

Committed as `683d5b3`.

## 4. Investigated: bottom whitespace on the kiosk board

At 1280x720 (the literal kiosk design resolution), roughly the bottom ~20% of the canvas is empty background below the last machine-tile row. Two contributing factors were identified, not one:

1. **Screenshot-capture artifact** (documented in the prior P15-FINAL report): a `fullPage` Playwright screenshot of a page with an internal `overflow:auto` scroll container captures the container's unscrolled state, producing apparent "extra" blank space that doesn't reflect what a real scrolling user sees. This was confirmed on Engineering Analytics and applies generally.
2. **Genuine unused canvas at the literal kiosk resolution**: even a plain (non-fullPage) viewport screenshot at exactly 1280x720 — the dashboard's own documented target size — shows real empty space below the content, because the 20-grid-unit height budget was sized for the panel set as originally designed and doesn't dynamically grow to fill the viewport when Grafana's own grid-height compression leaves slack.

Given the 20-unit ceiling is a deliberate, lint-enforced constraint (also shared by two other kiosk dashboards), and stretching panels further would need either raising that ceiling fleet-wide or a per-dashboard exception, this is left as a **documented, accepted P2** rather than force-fit in this pass — it does not block readability of the content that is present, unlike the two defects above.

## 5. Explicitly not covered this pass (UNVERIFIED, not GO)

Per the brief's own honesty rule, the following P15-R phases were **not executed** in this session and must not be read as passing:

- Full responsive matrix at 1440×900, 2560×1440, 3840×2160 (only 1280×720 and, from the earlier P15 pass, 1920×1080 have real render evidence).
- Browser-zoom testing (100/125/150%).
- Axis/chart micro-geometry pass (tick density, label collision, gridline density) — not measured pixel-by-pixel this session.
- Full typography hierarchy audit across panel titles/KPI values/table text.
- Accessibility pass (contrast measurement, keyboard focus, tab order) beyond the pre-existing, already-documented color+text status pairing.
- Interaction QA (variable chaining, drill-down link context preservation) beyond what P14/P15 already verified for `mo`/`machine_id`.
- Fleet-wide cross-dashboard consistency defect matrix (only Andon received deep treatment this pass).
- Formal visual-regression harness (before/after screenshots exist for the two fixes above, but no automated pixel-diff tooling was built).

These remain real, legitimate follow-up work, not silently dropped.
