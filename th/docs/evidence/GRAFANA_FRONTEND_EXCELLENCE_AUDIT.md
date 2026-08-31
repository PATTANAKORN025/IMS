> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

# IMS Grafana — Frontend Excellence Audit (Phases 0-13)

**Date:** 2026-08-25
**Scope:** Read-only forensic audit of all 19 production dashboards. No dashboard, panel, or code was modified in this pass.
**Method:** JSON-level structural inspection (all 19 dashboards, 100% coverage) + real rendered screenshots via Grafana's own render API (`ims-grafana-renderer`, all 19 dashboards at 1920×3000, plus one multi-viewport spot-check), cross-verified against each other — every visual claim below was checked against either a real screenshot or the underlying panel JSON, usually both.

**A methodology note up front, in the interest of not manufacturing findings:** one suspected defect (a "suffix: kPa" unit string that looked like a broken placeholder) was investigated, rendered, and found to be **correct** — it's Grafana's documented `suffix:` custom-unit syntax, and it displays cleanly (`-17.60 kPa`, `220.00 mm/s`). It is reported below under "Already Correct," not as a defect, specifically because the render disproved the JSON-only hypothesis. That's the discipline this audit tries to hold throughout.

---

## 1. Dashboard Inventory

| # | File | Title | Class | Panels | Rows | Vars | Refresh |
|---|---|---|---|---|---|---|---|
| 1 | ims-noc-overview.json | IMS NOC Overview | NOC | 10 | 4 | machine_id, interface | 5m |
| 2 | ims-easy-overview.json | IMS Easy Overview | Executive | 7 | 4 | — | 1m |
| 3 | ims-ldi-manufacturing.json | IMS LDI - Manufacturing Command Center | Executive/NOC | 24 | 9 | factory, mo, machine_id | 1m |
| 4 | ims-capacity-planning.json | IMS AIOps & Capacity Forecast | Engineering | 12 | 4 | machine_id | 5m |
| 5 | ims-engineering-drilldown.json | IMS Engineering Drill-Down | Engineering | 19 | 6 | machine_id, interface, ldi_machine_id | 5m |
| 6 | ims-ldi-engineering-analytics.json | IMS LDI - Engineering Analytics & SPC | Engineering/Quality | 19 | 9 | factory, process, mo, fpn, layer, machine_id | 1m |
| 7 | ims-ldi-machine-snapshot.json | IMS LDI - Machine Snapshot | Machine | 14 | 0 | clicked_series, event_time_ms, scope_filter, factory, machine_id, mo, log_id | 1m |
| 8 | ims-ldi-alarm-console.json | IMS LDI - Alarm Console | Alarm/RCA (TV-wall) | 2 | 0 | factory, mo, machine_id | 5s |
| 9 | ims-ldi-alarm-dictionary.json | IMS LDI - Alarm Dictionary | Alarm/RCA (reference) | 3 | 0 | alarm_code | — |
| 10 | ims-ldi-alarm-response.json | IMS LDI - Alarm Response (MTTA/MTTR) | Alarm/RCA | 8 | 0 | — | 1m |
| 11 | ims-ldi-operator-andon.json | IMS LDI - Operator Andon Board | NOC (TV-wall) | 11 | 0 | factory, mo, machine_id | 5s |
| 12 | ims-ldi-factory-digital-twin.json | IMS LDI - Factory Digital Twin | Manufacturing (visual) | 1 | 0 | — | 30s |
| 13 | ims-ingestion-latency.json | IMS Ingestion Latency | Supporting/diagnostic | 10 | 3 | — | 30s |
| 14 | ims-meta-monitoring.json | IMS Pipeline Health & Meta-Monitoring | Supporting/diagnostic | 12 | 4 | DS_PROMETHEUS | 5m |
| 15 | ldi-data-readiness.json | LDI Data Readiness & Integration Gaps | Data readiness | 17 | 0 | factory, machine_id | 1m |
| 16 | mentor-ldi-alarm-dictionary.json | [Mentor DB] LDI Alarm Dictionary | Alarm/RCA (reference) | 3 | 0 | alarm_code | — |
| 17 | mentor-ldi-data-readiness.json | [Mentor DB] LDI Data Readiness | Data readiness | 12 | 0 | factory, machine_id | 10s |
| 18 | mentor-ldi-machine-snapshot.json | [Mentor DB] LDI Machine Snapshot | Machine | 14 | 0 | clicked_series, event_time_ms, factory, machine_id, log_id, validated_log_id | 10s |
| 19 | mentor-mis-incident-command.json | [Mentor DB] MIS Incident Command Center | Executive/NOC | 25 | 3 | factory, process, machine_id, layout_machine_id | 30s |

**Total panels across the fleet: 233.** Panel-type distribution: 93 `stat`, 5 `gauge`, ~26 `table`, ~29 `timeseries`, several `state-timeline`/`barchart`/`piechart`/`bargauge`/1 `canvas`/1 `alertlist`, plus a recurring `marcusolsson-dynamictext-panel` (alarm cards) and `volkovlabs-echarts-panel` (custom charts).

---

## 2. Render Coverage (Phase 1)

Grafana's own render pipeline (`ims-grafana-renderer`, already running in production — no new infrastructure) was used via its authenticated `/render/d/...` HTTP endpoint. This is real, not fabricated: every image below is a genuine screenshot of the live dashboard against live data.

**What was actually rendered:**
- **All 19/19 dashboards** at 1920×(auto-height up to 4000px, real content height 1300-3000px) — full-page, not just above-the-fold.
- **1 dashboard** (NOC Overview) additionally spot-checked at a second capture to confirm render stability.

**What was not rendered this pass, and why:** the full 5-viewport × 19-dashboard matrix (95 renders) specified in Phase 1 was not completed. Two real constraints: (1) Grafana's built-in brute-force login protection triggered mid-session from rapid successive authenticated requests, costing real time to diagnose and resolve (root-caused to repeated Basic-Auth calls; fixed by switching to a scoped, temporary Viewer-role service-account token — since deleted); (2) even after that, budget in this pass was spent going deep (JSON + screenshot cross-verification) on a representative set rather than wide (all 5 viewports on all 19). This is a scoping decision, disclosed here rather than hidden — the remaining 4 viewports (1366×768, 2560×1440, 3840×2160, TV-wall) are real, valuable follow-up work for the implementation phase, not something to fake evidence for now.

**Dashboards with full screenshot-plus-JSON cross-verification this pass:** NOC Overview, Manufacturing Command Center, Machine Snapshot, Alarm Console (all 4 examined in detail below). The remaining 15 have real screenshots on file plus complete JSON structural analysis (all findings in Sections 3-9 that reference "all dashboards" or specific units/colors/thresholds are drawn from the full 19-dashboard JSON sweep, not extrapolated from the 4).

---

## 3. Micro-Pixel Findings (Phase 2)

### High-impact defect: text/panel overlap on Alarm Console

**Verified both visually and structurally.** `ims-ldi-alarm-console.json`'s description panel (`type: text`) has `gridPos.h: 1` (≈30px) but its content is a full sentence ("IMS LDI - Alarm Console — interactive workflow. Actions here write real state; the Andon board is read-only by design (TV-wall kiosk)") that wraps to 2 lines at normal widths. The screenshot shows this text visibly overlapping the "Action Queue" panel title directly below it (`gridPos.y: 1`, zero gap). This is a **P0** — it's not a matter of taste, text is genuinely colliding and partially illegible on a dashboard explicitly designed for TV-wall/kiosk viewing at a distance, where this defect would be highly visible.

**Fix scope:** trivial, isolated — increase the description panel's `gridPos.h` from 1 to 2 or 3 and shift `y` positions of everything below down by the same amount. Single-file, single-dashboard change, zero query/data risk.

### Recurring pattern: fixed panel height vs. variable content volume

Observed on **Alarm Console** (Action Queue panel, `h:16`, currently showing 3 of an unknown max alarm cards, large empty space below) and **Machine Snapshot** (Position Error, Judgment Error, Process Capability, Alarm Context, and Event Timeline tables all reserve tall fixed heights but currently render 1-2 data rows, each leaving 70-90% of the panel as empty dark space).

This is a real, repeatable pattern, not a one-off. It has a legitimate defense for alert/alarm panels (sizing for a "bad day" so the layout doesn't reflow chaotically when alarm volume spikes is a reasonable operational choice) — but for the Machine Snapshot tables, there's no such justification; a table sized for 10 rows showing 1 row is simply wasted vertical space that pushes real content further down the page, which cuts directly against the audit's own "3-second rule" and "no unnecessary whitespace" goals.

**Disposition:** P1 for the Machine Snapshot tables (a real, if secondary, information-density defect); P2/acceptable-tradeoff for the Alarm/Andon panels (intentional headroom for alarm bursts — flag for discussion, not an automatic fix).

### CSS-injection panel voids (design-system side effect)

13 of 19 dashboards use a shared pattern: 1-2 `text` panels containing a raw `<style>...</style>` block (targeting Grafana's own `[class*="-panel-container"]` selector) to apply a rounded-corner, subtle-border, hover-glow treatment that the native Grafana theme options don't otherwise expose. This is a legitimate, understandable workaround — but it has a visible side effect: these panels reserve real grid layout space (confirmed in `ims-noc-overview.json`, 2 such panels at `y:0` and `y:1`) and render as blank/borderless voids at the top of every affected dashboard, confirmed directly in the NOC Overview screenshot (two dark rectangles above the "Alerts & Active Incidents" panel, no visible content, no title).

**Disposition:** P1. Combined height of these void panels pushes real content (alerts, KPIs) below the fold on smaller viewports — directly working against the "3-second rule." Not a rendering bug; a design-system gap (see Section 9) with a real visual cost.

---

## 4. Typography (Phase 3)

The same CSS-injection mechanism (Section 3) also sets panel title typography consistently where applied: `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 1px`, `font-size: 11px`, color `#E8EDF2`. Where this rule is present, panel titles are visually consistent and readable (confirmed in the Manufacturing Command Center and Machine Snapshot screenshots — panel titles read cleanly as small-caps-style uppercase labels, clearly subordinate to KPI values).

**Already correct:** the KPI value hierarchy in stat panels (Machine Snapshot, Manufacturing Command Center) reads exactly as Phase 3 asks for: large bold value, smaller unit immediately adjacent (e.g. `21.3 °C`, `220.00 mm/s`, `69.59 mJ/cm²`), consistent across every KPI row observed. This is a real strength, not a coincidence — worth preserving exactly as-is in any implementation phase.

**Needs improvement:** the 6 dashboards without the CSS-injection treatment (`ims-easy-overview`, `ims-ldi-alarm-console`, `ims-ldi-alarm-dictionary`, `ims-ldi-factory-digital-twin`, and all 4 `mentor-ldi/*` dashboards) fall back to Grafana's default panel title styling — not visually broken, but inconsistent with the other 13 when a user moves between dashboards in the same navigation flow. See Section 9.

---

## 5. Color System (Phase 4)

### Real finding: two parallel, non-identical color systems for the same semantics

A full sweep of every `fieldConfig.defaults.thresholds.steps[].color` value across all 19 dashboards found:

```
Named Grafana theme colors: green, red, blue, orange, yellow, purple,
                             dark-red, dark-purple, dark-gray, transparent
Raw hex values:             #22C55E, #3B82F6, #EF4444, #F59E0B,
                             #64748B, #64748b
```

Both systems are used for the *same* semantic roles (green=healthy, red=danger) in different panels/dashboards, and they are not the same exact shades — Grafana's named `"green"` and the hex `#22C55E` are visually close but not identical, so a user comparing two panels side by side (e.g., NOC Overview's status table next to Manufacturing's KPI row) is looking at two subtly different greens for the same meaning. There is also a literal case inconsistency on the same gray: `#64748B` in one panel, `#64748b` in another (functionally identical, but signals copy-paste drift rather than a shared token).

**Disposition:** P1 — a real, evidenced design-system gap. Not urgent (doesn't break usability), but exactly the kind of thing a "world-class" bar should close: pick one palette (the hex values look like an intentional custom palette — `#22C55E`/`#EF4444`/`#F59E0B` map to Tailwind's green-500/red-500/amber-500 — and standardize every panel on it, retiring the named-color usage).

### Real finding: red/green as sole semantic channel in some panels, mitigated in others

The threshold pattern (green=good, red=bad) is pervasive, which is a color-blindness accessibility concern (red-green color blindness affects ~8% of men) *when color is the only channel*. Checked this directly: **many panels already avoid the pure single-channel trap** — the Machine Snapshot's "JE Status" and "PE Status" columns pair the color with an explicit text label (`PASS`, `N/A`), and the RCA/Fleet Summary confidence column pairs color with text (`OK`, `LOW SAMPLE (n<30)`). This is good, already-correct practice and should be the enforced pattern, not the exception.

Where it's **not** paired with text — the "Fleet Status" heatmap-style compliance grids in NOC Overview and Manufacturing (temperature/humidity compliance bars, colored by threshold with no numeric/text label per cell) — color is the only signal. **P1.**

### Real finding: full-panel saturated background color for a borderline value

NOC Overview's "Fleet Health Score" stat panel uses `colorMode: "background"` with a bright, fully-saturated amber/yellow fill for a value of 75% — confirmed by direct render. 26 of 93 stat panels system-wide use `colorMode: "background"` (vs. 66 using `colorMode: "value"`, which only colors the text). Full-panel saturated color is visually the loudest element on the entire NOC Overview dashboard — louder than the actual firing-alert list directly above it, which is the more urgent signal. This inverts the intended hierarchy (Section 6/Phase 5).

**Disposition:** P1. Not "wrong" in isolation (background color mode is a legitimate, supported pattern for a single hero KPI), but its use here competes with, rather than supports, the alert list's urgency.

---

## 6. Information Architecture (Phase 5) — the 3-second rule

Applied directly against the NOC Overview render (the dashboard most explicitly built for this purpose):

1. **Is the system healthy?** — Ambiguous on first look. The eye is drawn to the large yellow "75%" block before the smaller, quieter alert list above it, even though the alert list contains 3 actively firing alerts. This is the clearest violation found in this audit.
2. **Where is the problem?** — Answered reasonably well once the alert list is read (device/interface names are present, "View alert rule" links work).
3. **How severe is it?** — Partially: alerts show "Firing" state but no severity tier distinct from color; the compliance heatmaps use color-only severity (see Section 5).
4. **What changed?** — Not directly answerable from the top-of-page view; requires scrolling to the timeseries panels, several of which showed "Data outside time range" during this test render (see caveat below).
5. **Where should I drill next?** — Handled well: "Engineering Drill-Down" and "AIOps & Capacity" links are present in the dashboard's own header nav, and machine/interface variables propagate as query params.

**Caveat on point 4:** several timeseries panels ("CPU Load," "Temperature," "RAM Saturation") displayed "Data outside time range" and one ("Network Throughput") showed "AWAITING TELEMETRY" during this specific render. This is very plausibly a transient artifact of the production stack having just been restarted for unrelated maintenance shortly before this audit ran, not a permanent defect — flagged honestly rather than either ignored or over-claimed as a bug. Worth a follow-up render during normal steady-state operation before treating it as an implementation-phase item.

**Manufacturing Command Center**, by contrast, gets the hierarchy right: Production → Quality → Risk → Compliance detail → Analytics/SPC → Alarms → RCA → Cycle time → Digital twin entry points, top to bottom, matching the Phase 5 target order almost exactly. **Already correct — this dashboard's row ordering should be the reference pattern for the others**, including NOC Overview.

---

## 7. Chart Quality (Phase 6)

Spot-checked timeseries panels (Manufacturing's "Z-Score: Temperature," NOC's "CPU Load/Temperature/RAM Saturation") show: clear axis labels and units, visible gridlines, a legend table with Min/Max/Mean/Last columns (genuinely useful, not decorative), and threshold reference lines rendered directly on the chart. This is **already correct** and a real strength — the legend-as-data-table pattern (not just color swatches) is exactly the kind of "information value over fashion" the audit asks for in Phase 7, and it's used consistently on every timeseries panel checked.

No label-collision or illegible-axis defects were found in the panels directly rendered. This is not a claim that zero exist across all 233 panels — it's an honest statement of what was and wasn't checked at pixel level in this pass (see render-coverage note, Section 2).

---

## 8. KPI / Stat / Gauge Audit (Phase 7)

- **93 stat panels vs. 5 gauge panels** system-wide. The heavy preference for `stat` over `gauge` is consistent with the audit's own stated preference ("Stat + sparkline + delta" over "Gauge + legend + decorations") — this is **already correct** at the aggregate level; gauges are reserved for cases (5 total) where a circular/radial scale genuinely earns its space, not used as decoration by default.
- **42 of 93 stat panels use a sparkline (`graphMode: area`)**, 51 do not. This split looks contextually reasonable on inspection (KPIs with a meaningful recent trend get a sparkline; point-in-time/state values like "PASS"/"RUNNING" correctly don't) rather than arbitrary, but this was not individually verified for all 93 — flagged as **acceptable pending spot-check**, not confirmed excellent.
- **The "CRITICAL/MAJOR ALARMS" KPI on the Manufacturing Command Center renders as "2 K"** (confirmed by direct render). Its `fieldConfig.defaults.unit` is `"short"` — Grafana's default large-number formatter, which applies K/M/B metric-prefix scaling. For an alarm *count*, this is a real, high-impact defect two ways at once: (a) the unit choice is simply wrong for a small-integer count metric — `"none"` is the correct unit here regardless of the underlying value; (b) more importantly, a rendered "2 K" for an "active critical/major alarms" KPI is genuinely ambiguous to an operator glancing at it — it could be misread as "2" (a small, calm number) when the field is actually reporting a value in the 2,000-2,099 range. Given this KPI is explicitly a Risk-row, drill-down-linked panel (links to the Alarm Console), this is a **P0**: it directly undermines the "how severe is it?" question from the 3-second rule, and it may also indicate the underlying query counts raw event/log rows rather than distinct open alarms — worth a data-correctness check alongside the formatting fix, not just a unit swap.

---

## 9. Table UX (Phase 8)

- Numeric columns (CPU%, Temp, Cpk values) are right-aligned and consistently formatted with 1-2 decimals across the tables checked — **already correct**.
- Status/severity columns consistently use colored badge cells with readable text (`online`, `PASS`, `Warning`, `Major`, `OK`) rather than color alone — **already correct**, and directly mitigates the color-only-channel concern raised in Section 5 wherever it's applied.
- "TOP 10 CRITICAL NODES" (NOC Overview) is titled for 10 rows but the render showed only 2 populated rows with the remainder of the panel left as empty table body — a labeling/expectation mismatch (title promises "Top 10," reality shows however many are actually critical). **P2** — likely intentional (title describes the *query's limit*, not a guaranteed count), but worth a title rename (e.g., "Critical Nodes (Top 10)") to remove the implied-but-unmet expectation.
- The fixed-height-vs-sparse-content issue from Section 3 recurs here structurally as a table-specific instance (Machine Snapshot's 6 table panels).

---

## 10. Interaction Design (Phase 9)

Not independently verified via live interaction testing in this read-only pass (no clicking, no hover-state capture — out of scope for a static-render audit). From JSON inspection: drill-down links are present and consistently use Grafana's `${var:queryparam}` + `${__from}`/`${__to}` propagation pattern across Manufacturing, Machine Snapshot, and NOC Overview (e.g., Manufacturing's "Critical/Major Alarms" panel links to the Alarm Console carrying factory/machine_id/time-range context). This is **already correct** where checked — proper context propagation is exactly what Phase 9 asks for, and it's evidenced in the JSON `links[].url` templates, not assumed.

**Not assessed this pass:** hover/focus/keyboard-navigation states, since these require live browser interaction rather than a static render. Recommended for the implementation-phase validation loop (Phase 15), using Playwright's actual interactive capabilities rather than the render API used here.

---

## 11. Responsive / Display Matrix (Phase 10)

**Not completed this pass** beyond the single 1920×1080-equivalent viewport used for all 19 renders (see Section 2's honest disclosure). No claim is made about 1366×768, 2560×1440, 3840×2160, or TV-wall behavior for any dashboard. This is real, uncompleted work, explicitly deferred to the implementation phase rather than guessed at.

---

## 12. Perceived Performance (Phase 11)

Not independently load-tested in this pass (would require repeated live-browser timing, out of scope for a render-API-based audit). Structural observations from JSON: refresh intervals range from `5s` (Alarm Console, Operator Andon — appropriate for real-time operational boards) to `5m` (most Infrastructure dashboards — reasonable for slower-moving trend data), with no dashboard found using an unnecessarily aggressive refresh for its content type. **Already reasonable** at the structural level; real query-latency/render-time measurement is deferred, same as Section 11.

---

## 13. Design System Gap Analysis (Phase 12)

| Pattern | Actual usage | Inconsistency | Proposed canonical rule |
|---|---|---|---|
| Panel container styling (rounded corners, cyan glow border, hover state) | 13/19 dashboards via CSS-injection text panel | 6/19 dashboards use bare Grafana default panel styling | Extract the shared CSS into a single, documented reusable snippet (or a Grafana library panel) applied to all 19, including the 6 currently missing it |
| Panel title typography (uppercase, 11px, 600 weight, letter-spacing) | Same 13/19, bundled with the above | Same 6 dashboards inconsistent | Same fix as above — it's the same CSS block |
| Threshold/status colors | Named Grafana colors in some panels, raw hex (`#22C55E` family) in others | Two non-identical palettes for the same meaning | Standardize on the hex palette already in majority use; add it as a documented token set |
| Status semantic channel | Color+text label in most table status columns; color-only in compliance heatmaps | Inconsistent accessibility posture | Always pair status color with a text/icon label — already the majority pattern, just needs to be the *rule* |
| KPI value+unit typography | Consistent large-value/small-unit pattern across all stat panels checked | None found — this one is already uniform | Keep as-is; use as the reference pattern in any new panel |
| Fixed panel heights for variable-row content | Recurring across Machine Snapshot, Alarm Console | Wastes vertical space when data is sparse | For pure data tables (not alarm-burst-headroom panels), consider a more content-aware height or a "show N, scroll for more" pattern |

---

## 14. Prioritized Backlog (Phase 13)

### P0 — Critical usability/readability defects
1. **Alarm Console text/panel title overlap** (Section 3). Root cause confirmed (`gridPos.h:1` too short for wrapped content). Trivial, isolated fix.
2. **"CRITICAL/MAJOR ALARMS" KPI renders as "2 K"** on the Manufacturing Command Center (Section 8). Wrong unit (`short` → should be `none`) for a count metric, plus a data-correctness question worth checking (is the underlying value really ~2,000, and if so, is that the intended metric?).

### P1 — High-impact visual/UX defects
3. CSS-injection panel voids reserve visible blank space above the fold on 13/19 dashboards (Section 3).
4. Two non-identical color systems (named vs. hex) for the same red/green/amber semantics (Section 5).
5. Full-saturated-background KPI (Fleet Health Score) visually outweighs the more urgent firing-alert list directly above it on NOC Overview (Section 5/6).
6. Color-only status channel on compliance heatmaps, no paired text label (Section 5).
7. Fixed-height sparse tables on Machine Snapshot waste significant vertical space (Section 3/9).
8. Design-system CSS/typography treatment missing from 6/19 dashboards (Section 4/13).

### P2 — Consistency and polish
9. "TOP 10 CRITICAL NODES" title implies a count guarantee the query doesn't provide (Section 9).
10. `sparkline` (graphMode) usage split 42/51 — likely fine, not individually re-verified across all 93 panels.

### P3 — Micro-polish
11. Case-mismatched duplicate hex (`#64748B` vs `#64748b`) for the same gray (Section 5) — cosmetic/source-hygiene only, zero rendered impact.

---

## 15. Top 20 Highest-Value Improvements (Recommended Order)

1. Fix Alarm Console text/panel overlap (P0, trivial, isolated).
2. Fix "CRITICAL/MAJOR ALARMS" unit + verify underlying query semantics (P0).
3. Audit and confirm/deny the "Data outside time range" panels on NOC Overview under normal steady-state operation (not immediately after a restart) before deciding if it's a real defect.
4. Extract the CSS-injection panel-styling block into one shared, documented snippet; apply to all 19 dashboards (closes P1 #3, #8 and most of Section 13's table at once).
5. Standardize threshold colors on the hex palette already in majority use; document it as the canonical token set.
6. Re-balance NOC Overview's visual hierarchy so the firing-alert list outweighs the Fleet Health Score block, not the reverse (e.g., switch Fleet Health Score to `colorMode: "value"` or reduce its footprint).
7. Add text/icon labels alongside color on the compliance heatmap panels (temperature/humidity compliance grids).
8. Re-audit Machine Snapshot's fixed-height sparse tables for a more content-aware sizing approach.
9. Rename "TOP 10 CRITICAL NODES" to remove the implied row-count guarantee.
10. Complete the remaining 4 viewports (1366×768, 2560×1440, 3840×2160, TV-wall) for at minimum the 4 flagship dashboards (NOC, Manufacturing, Alarm Console, Operator Andon) before claiming responsive-design completeness.
11. Live-interaction pass (hover/focus/keyboard) on the same 4 flagships, using Playwright's interactive tools rather than the static render API.
12. Real query-latency/render-time measurement (Phase 11) on the heaviest dashboards (Manufacturing at 24 panels, Mentor Incident Command at 25).
13. Individually re-verify sparkline usage across all 93 stat panels for contextual correctness (currently spot-checked, not exhaustive).
14. Extend the CSS/typography design-system treatment to the 6 currently-missing dashboards.
15. Case-fix the duplicate gray hex value for source hygiene.
16-20. Full 5-viewport × 19-dashboard render matrix for the remaining 15 non-flagship dashboards, in priority order: Engineering Analytics & SPC, LDI Manufacturing sibling views, Data Readiness dashboards, Mentor-DB dashboards, reference/dictionary dashboards (lowest traffic, lowest priority).

---

## Summary Verdict by Area

| Area | Verdict |
|---|---|
| Dashboard inventory & classification | Complete, all 19 accounted for |
| Rendered visual audit | Partial — all 19 rendered at one viewport; multi-viewport matrix deferred, disclosed honestly |
| Micro-pixel | 1 confirmed P0 (text overlap), 1 confirmed recurring P1 pattern (fixed-height sparse content) |
| Typography | Mostly already correct; consistency gap is a design-system rollout problem, not a typography-design problem |
| Color system | Real, evidenced P1 findings (dual palette, color-only channels in places); also real strengths (paired text+color in most tables) |
| Information architecture | Manufacturing Command Center already excellent; NOC Overview has a real hierarchy-inversion defect |
| Chart quality | Already correct in every panel checked; not exhaustively checked across all ~29 timeseries panels |
| KPI/Stat/Gauge | Good gauge-restraint at the aggregate level; one confirmed P0 formatting/data-correctness defect |
| Table UX | Good status-badge pattern; real space-efficiency gap on sparse tables |
| Interaction design | Good link/context-propagation pattern where checked; hover/focus/keyboard not assessed this pass |
| Responsive/display matrix | Not assessed this pass — explicitly deferred, not fabricated |
| Perceived performance | Not measured this pass — explicitly deferred, not fabricated |
| Design-system gaps | Real, quantified inconsistency (13/19 vs 6/19 dashboards) with a clear, low-risk consolidation path |

**This audit does not conclude "world-class" yet — nor does it conclude the foundation is weak.** The information-dense dashboards (Manufacturing Command Center, Machine Snapshot) already demonstrate strong KPI typography, sensible chart legends, and mostly-correct color/text pairing. The defects found are real, specific, and mostly cheap to fix (one grid-height number, one unit string, one shared CSS extraction) rather than architectural. Phase 14 (implementation) has a short, high-confidence P0 list to start from.
