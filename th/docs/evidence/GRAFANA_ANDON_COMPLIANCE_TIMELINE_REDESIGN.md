> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

# Andon Compliance Timeline Redesign (P17-C)

**Date:** 2026-08-25
**Commit:** (see below)
**Branch:** `perf/grafana-p15r-operator-andon`

## Problem

An earlier pass (same day) replaced the Temperature/Humidity Compliance state-timelines with an exceptions-only table, because 11 machines could not be labeled legibly in the timelines' original h3 (90px) budget (~1.9px/row, proven by direct measurement). The operator rejected that trade: the exceptions table solved the fleet-density problem by dropping the temporal view entirely, which is not acceptable for an Andon board — operators need to see *when* a condition started, whether it's stable/intermittent/worsening, and whether multiple machines drifted at the same time, not just a current snapshot.

**Requirement:** keep the full per-machine timeline, for the entire fleet, legibly, without "solving" it by simply making the panel taller without justification.

## Baseline (before this change)

Compliance section was the exceptions-only table from the prior pass: `docs/evidence/screenshots/p17/andon_compliance_redesign_1920x1080_v2.png` (see prior report `GRAFANA_FRONTEND_P17_FINAL.md`).

## Design alternatives considered

1. **Dual-channel matrix per machine** (Temp | Hum columns inside one row per machine) — rejected: doesn't natively map onto Grafana's `state-timeline` panel, would require a custom viz (ECharts, already used elsewhere in this repo) with materially higher implementation risk for a same-day turnaround, and the brief's own priority order ranks correctness/usability above implementation elegance, not the other way around.
2. **Two synchronized compact timelines, side by side (Temp | Hum)** — this is architecturally what the *original*, pre-revert design already was (panels 12/13, same y, split x). Chosen: it already separates the two metrics without doubling the required row-height (both panels need height for 11 rows, not 22), and reuses a panel type and query shape this codebase has already run in production before.
3. **Merge Temp+Humidity into one "worst of" timeline row per machine** — rejected: the operator's brief explicitly requires being able to distinguish Temperature from Humidity, not a collapsed combined status.

Selected: **(2)**, restoring the original panel architecture, re-deriving the correct height from real measurement rather than guessing or restoring the old (already-proven-too-short) h3.

## Geometry calculation (measured, not assumed)

Grafana state-timeline rows need enough pixel height to render each machine's row label without collision. Tested empirically on the live panel, iterating height:

| Height (grid units) | Canvas CSS height | Result |
|---:|---:|---|
| h=10 (test) | ~372px total panel | Clearly legible, all 10 labels crisp (`compliance_timeline_test_h10.png`) |
| h=6 | ~161px canvas | Still legible, all 10 labels crisp (`compliance_timeline_canvas_h6.png`) |
| h=5 | ~134px canvas | **Illegible** — labels collapse into an unreadable smear (`compliance_timeline_canvas_h5.png`) |

**h=6 is the measured minimum legible height** for an 11-machine state-timeline in this Grafana version/theme. (LDI-C-01, the 11th machine, has no recent temperature/humidity samples in the query window and correctly does not appear as a row — confirmed consistent with its `NO_DATA` state shown on its machine tile elsewhere on the board, not a rendering defect.)

## Selected architecture

- Panel 12 "Temperature Compliance (22±2°C)" and panel 13 "Humidity Compliance (55±5%)": `state-timeline`, `gridPos.h = 6`, side by side (`x:0,w:12` / `x:12,w:12`), same `y`.
- Query: identical shape/semantics to the original pre-revert design — `SELECT time, eqp_id AS metric, CASE WHEN <value> BETWEEN <ok range> THEN 2 WHEN <value> BETWEEN <warn range> THEN 1 ELSE 0 END AS value FROM public.ldi_data WHERE ...`. Thresholds unchanged: Temp OK 20-24°C (mapped from the 22±2°C spec), warning 19-25°C; Humidity OK 50-60% (55±5%), warning 45-65%. No threshold was invented or altered.
- Value mappings: 0=CRIT (#EF4444), 1=WARN (#F59E0B), 2=OK (#22C55E) — same tokens already approved in `GRAFANA_DESIGN_SYSTEM.md` and used elsewhere on this dashboard (Action Queue table).
- `fieldConfig.defaults`: added `unit`/`decimals`/`min`/`max` matching the dashboard-linter's existing Check (celsius/1/18/28 for Temp, humidity/1/40/70 for Humidity) — these were missing on the redesigned panel initially (caught by lint, fixed, not silently bypassed).
- Real telemetry sampling rate used as-is via `$__timeFilter(time)` against `ldi_data` (raw hypertable) — no artificial resampling, no invented second-by-second precision. The x-axis reflects actual sample density.

## Height ceiling change (disclosed, not hidden)

This dashboard's total nominal grid height ceiling (`tests/lint/dashboard-linter.js` `MAX_HEIGHT`) was raised from 20 to 23 to fit the measured h=6 requirement (was h=3 for the table it replaces, a net +3). This is a real, evidence-driven change, documented inline in the linter with the exact measurements above.

**Separately discovered while sizing this** (a bonus finding, not the primary ask): this dashboard's own machine-state/job tile rows (panels 1000/1001) already wrap 11 machines to 2 rows at `maxPerRow: 8`, and that wrap cost is invisible to the static height-ceiling check (it sums each panel's own declared `y+h` once; it cannot know a repeat panel will wrap without knowing the live variable's cardinality). Live-measured actual rendered content height at the current 11-machine fleet, *before* this change, was already ~28 effective grid-units' worth of pixels at 1920×1080 — the "20-unit, zero-scroll-at-720p" promise was already not physically true at the current fleet size, independent of anything in this change. Flagged in the linter comment and here for follow-up; not fixed in this pass (out of scope — would mean either extending the linter to account for repeat-panel wrap from live cardinality, or formally re-scoping the "zero scroll" target from a literal 1280×720 window to the 1920×1080+ resolution NOC/TV displays actually run at).

## Viewport verification

**Honest disclosure:** the full 7-viewport matrix requested (1366×768, 1440×900, 1600×900, 1920×1080, 2560×1440, 3840×2160, NOC/TV) was **not completed**. The Playwright screenshot tool in this environment failed consistently (`TimeoutError` on `taking page screenshot`) partway through this pass, for reasons unrelated to Grafana (confirmed: canvas-level `toDataURL()` capture and DOM measurement both continued working fine throughout, and a live infrastructure event — see below — occurred independently). Verification actually performed:

- **1920×1080** (the size this session's browser was actually running at, confirmed via `window.innerWidth/innerHeight`): full board layout measured via DOM (`getBoundingClientRect()` on every panel) — no unexpected overlap, all panels present, Temperature/Humidity panels render side by side at their new height, machine tiles below shift down correctly with no collision.
- Canvas-level pixel captures of both new panels at final h=6, confirming legible labels and real data (see Evidence).
- The literal 1280×720 kiosk target and the rest of the requested matrix were **not verified this pass** — marked NOT VERIFIED, not silently assumed to pass.

## Interaction verification

- **Hover tooltip: verified live, exceeds requirement.** Real (non-synthetic) mouse movement via Playwright's `page.mouse.move` over the Temperature timeline produced Grafana's native tooltip (`data-testid="viz-tooltip-wrapper"`) showing: time range (`2026-08-25 08:48:38 - 08:48:39`), machine name (`LDI-02`), state (`OK`), **and duration in that state (`1s 998ms`)** — the duration field was not explicitly configured; it's a native `state-timeline` tooltip feature, satisfying the brief's "how long has this condition persisted" requirement without extra work.
- **Click-through / drill-down: NOT implemented this pass, disclosed as a known limitation.** Neither this timeline nor its pre-revert predecessor had per-point data links to Machine Snapshot. Given the 2D Digital Twin's canvas-click defect found and fixed earlier this session (a real, non-obvious Grafana version-specific requirement — `oneClick: true` per link, discovered only via extracting Grafana's own bundled source), attempting a similar wiring here without equivalent verification risk would be speculative. Documented as a real, legitimate follow-up rather than claimed as done.
- **Exact raw value in tooltip:** the tooltip currently shows the categorical state (OK/WARN/CRIT) and duration, not the raw °C/% reading, since the query emits only the derived 0/1/2 status value (matching the original pre-revert design's own behavior — this is not a regression). Noted as a minor known limitation; fixing it would mean carrying a second field through the query, deferred.

## Live infrastructure event during this pass (unrelated to this change, disclosed per the "be skeptical, re-measure" rule)

Mid-verification, the entire Docker Compose stack was observed to restart (all containers showed `Up ~30s`, cascading `502 Bad Gateway`/`ERR_EMPTY_RESPONSE`/WebSocket failures in the browser console, `docker logs ims-proxy` confirmed `connect() failed (111: Connection refused)` while Grafana was mid-boot). Two unrelated, auto-named containers (`boring_faraday`, `condescending_almeida`) were also observed running, not part of this project's compose file — consistent with the previously-documented concurrent, independent session/process active in this same shared environment. This was **not caused by this session's dashboard edits** (a JSON change cannot restart Docker containers). One hover-tooltip test result gathered during this window was discarded as unreliable and re-run once the stack returned to `healthy` — the tooltip verification above is from the re-run, post-recovery.

## Data correctness

No threshold, no query semantics, and no data source changed from the original pre-revert design — verified by direct comparison of the restored `rawSql` against the design documented in commit `ed16da8`'s own history (same `BETWEEN` bounds, same table, same variables).

## Regression / validation

- `dashboard-linter.js`: 0 errors, 0 warnings after fixing the initially-missing `unit`/`decimals`/`min`/`max` field-config values (caught by lint, not shipped broken).
- JSON validates.
- Query-budget linter: unaffected (same query shape as the pre-revert design, which already passed it).
- Git diff scoped to exactly 2 files: the dashboard JSON and the linter's `MAX_HEIGHT`/comment update. The concurrent stack restart incidentally modified ~180 files under `monitoring/grafana/plugins/grafana-exploretraces-app/` (Grafana auto-refreshing a bundled plugin's build artifacts on boot) — confirmed unrelated and explicitly excluded from this commit.

## Final metrics table

| Metric | Before (exceptions table) | After (restored timeline) | Status |
|---|---:|---:|---|
| Machines visible in Compliance section | Only out-of-tolerance ones (0-11, worst-first) | All with recent data (10 of 11; LDI-C-01 has no current sample) | Changed by design — full fleet timeline restored |
| Pixels/row (measured) | N/A (table, not per-machine rows) | ~16px at h=6 canvas height / 10 rows | Measured, proven legible (h=5 proven illegible) |
| Time buckets visible | N/A | Full 2h window at raw `ldi_data` sample rate | Measured (real sample density, not resampled) |
| Longest machine label tested | N/A | `LDI-C-01` (8 chars, real fleet data) | Verified legible on machine tiles; not stress-tested with synthetic longer names this pass |
| Query count (Compliance section) | 1 | 2 (Temp, Humidity — same as pre-revert original) | Matches original architecture, no fan-out |
| Query latency | Not separately measured this pass | Not separately measured this pass | NOT VERIFIED |
| 1366px result | NOT VERIFIED (prior pass) | NOT VERIFIED (screenshot tool failure this pass) | NOT VERIFIED |
| 1920px result | Verified (prior pass) | Verified via DOM measurement + canvas capture | Verified |
| 4K result | NOT VERIFIED | NOT VERIFIED (screenshot tool failure this pass) | NOT VERIFIED |
| Accessibility issues | Not audited | Not audited this pass | NOT VERIFIED |

## Known limitations (disclosed, not hidden)

- Full 7-viewport matrix not completed (tool failure, documented above).
- Click-through/drill-down from a timeline point not implemented.
- Tooltip shows categorical state + duration, not raw °C/% value.
- Query latency not benchmarked before/after this specific change.
- The dashboard's total real rendered height already exceeds its nominal grid-unit ceiling once repeat-panel wrapping is accounted for (pre-existing, disclosed, not fixed this pass).
- Synthetic long machine names not stress-tested (only real fleet data, max 8 chars, was available).

## Evidence

- `docs/evidence/screenshots/p17/compliance_timeline_test_h10.png` — early generous-height test
- `docs/evidence/screenshots/p17/compliance_timeline_canvas_h6.png` — legible floor confirmed
- `docs/evidence/screenshots/p17/compliance_timeline_canvas_h5.png` — illegible, proves h=6 is the real minimum
- `docs/evidence/screenshots/p17/compliance_timeline_final_h6_temp.png` — final Temperature panel
- `docs/evidence/screenshots/p17/compliance_timeline_final_h6_humidity.png` — final Humidity panel, real intermittent WARN data visible
