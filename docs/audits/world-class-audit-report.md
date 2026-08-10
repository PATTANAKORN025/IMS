# LDI Dashboards — World-Class Production Audit Report

**Date:** 2026-08-04
**Standard:** Grafana 13.1.1
**Scope:** All 5 LDI dashboards — Manufacturing Command Center (30 panels), Operator Andon Board (10 panels), Engineering Analytics & SPC (13 panels), Machine Snapshot (14 panels), Data Readiness & Integration Gaps (13 panels). 80 panels total.

This report documents a full audit against the mandatory goals: unused-element removal, layout integrity at 3 resolutions, full-fleet KPI visibility, PE+JE quality scoring, per-panel SQL correctness, RCA correctness, a locked color system, typography/units, and final verification (linter + regression + benchmark).

---

## 1. Summary of bugs found and fixed

| # | Area | Dashboard(s) | Bug | Fix | Commit |
|---|------|-------------|-----|-----|--------|
| 1 | Unused element | Manufacturing | Stray "⚡ FLEET KPI — 24h Rolling Window" badge panel (id 8888) inserted at y=1, overlapping the PRODUCTION row header; every panel below shifted down by 1 extra grid unit; reintroduced 2 non-palette colors (`#EF4444`, `#F59E0B`) | Panel deleted, known-good y-positions restored from last verified layout, stray colors reverted to `#FF003C`/`#FF9100` | `7a0b7d4` |
| 2 | Color semantics | All 5 dashboards | "OK/healthy" and "informational readout" were both mapped to the same cyan (`#00F2FE`), so a healthy state and a neutral readout were visually indistinguishable; `NO_DATA` used the same red as confirmed-critical alarms, so a reporting gap looked identical to a real alarm | Locked to exactly 5 tokens (`../architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1a): `ok`=`#22c55e`, `warning`=`#FF9100`, `critical`=`#FF003C`, `info`=`#00F2FE`, `no_data`=`#6B7280`. Fixed 24 "OK"-mapped entries (literal-key and numeric-key severity-mapping forms) cyan→green; fixed Andon's machine-tile `NO_DATA` red→gray; added an explicit `type:"special"` null-mapping to 18 stat/gauge/bargauge panels whose `noValue:"NO_DATA"` text had no matching color rule | `3cf33d1` |
| 3 | Drifted vocabulary | Manufacturing | 9 stat panels' `noValue` text had drifted to ad hoc strings ("NO PRODUCTION", "NO STATUS", "NO TELEMETRY", "NO DATA") instead of the mandated `NO_DATA` | Reverted all 9 to `"NO_DATA"`, consistent with the OK/IDLE/NO_DATA vocabulary mandate | `3cf33d1` |
| 4 | KPI completeness | Machine Snapshot | Process capability was two **separate** panels — "Process Capability from PE Samples" and "Process Capability from JE Samples" — each scored only one of the two quality signals. No combined **Worst Cpk = LEAST(PE, JE)**, no sample-count-driven Confidence column. Out of step with the fleet-wide `v_machine_spc_fleet` pattern (migration 042) already used elsewhere | Merged both panels into one table: `Cpk (PE)`, `Cpk (JE)`, `Worst Cpk = LEAST(cpk_pe, cpk_je)`, `N (Worst)`, and `Confidence` (`OK` / `LOW SAMPLE (n<30)` / `NO_DATA`) | `8c49166` |
| 5 | Layout inefficiency | Machine Snapshot | "Raw Timestamp (precise)" stat panel occupied a 12×10 grid cell (half the dashboard width, 10 rows tall) to display a single timestamp value | Resized to 6×5; freed 5 rows total (dashboard height 70→65 units) by shifting Alarm Context and Event Timeline panels up to close the gap | `8c49166` |
| 6 | Color semantics (numeric null) | Machine Snapshot, Engineering Analytics | `Cpk (PE)` / `Cpk (JE)` / `Worst Cpk` columns use `color.mode: thresholds` with a base step of `{color: red, value: null}`. A machine with **zero** samples for a metric (a legitimate "no data" case, not a quality failure) rendered with a **red** background — visually indistinguishable from a confirmed-bad Cpk | Added an explicit `type:"special"` null-safe mapping (gray, "N/A") to all three columns in both dashboards, so genuinely-missing data reads as gray, not red | `8c49166`, `a5e929d` |
| 7 | Color semantics (Confidence) | Engineering Analytics (Machine Capability Ranking, Alarm↔Process Correlation, Top Correlated Alarms), Manufacturing (Top Correlated Alarms) | `Confidence = "LOW SAMPLE (n<30)"` was mapped to **critical red** (`#FF003C`) in 3 panels across 2 dashboards. A low sample count is a caveat on the result, not a confirmed-bad finding — it belongs on the warning/amber token like every other low-confidence indicator in the design system | Changed `LOW SAMPLE (n<30)` color from red to amber (`#FF9100`) in all 3 panels | `a5e929d` |
| 8 | Color semantics (missing mapping) | Engineering Analytics (Machine Capability Ranking) | The panel's SQL emits `Confidence = 'NO_DATA'` for machines with zero PE and zero JE samples, but the value-mapping table only defined `OK` and `LOW SAMPLE (n<30)`. A `NO_DATA` row fell through to the panel's default threshold color (green) — **a machine reporting nothing displayed as "OK."** | Added the missing `NO_DATA → gray` mapping | `a5e929d` |

---

## 2. Verified correct — no changes needed

These mandatory-goal areas were audited and found already compliant from prior work in this session; no further changes were made.

- **Full-fleet KPI visibility (10 devices, OK/IDLE/NO_DATA):** Manufacturing and Andon both `LEFT JOIN` from `public.devices` (the `v_machine_spc_fleet` pattern, migration 042) so all 10 registered LDI machines always render a row/tile, with correct OK/IDLE/NO_DATA state resolution. Live-verified via screenshot (8 tiles OK, 2 NO_DATA during a real reporting gap).
- **RCA panel correctness (both RCA panels, Manufacturing + Engineering Analytics):** category (via `v_ldi_alarm_category`, migration 036), baseline comparison, Lift (Alarm-Window % ÷ Baseline %), event/sample count, and Confidence are all present and computed correctly against real 5-digit alarm codes and the flag-split `v_ldi_alarm_context` (migration 045).
- **Per-panel SQL discipline:** every time-scoped panel uses `$__timeFilter`; CAGG tiering follows the documented contract (`ldi_data_1m` ≤6h, `ldi_data_15m` 6h–2d, `ldi_data_1h` >2d, raw `ldi_data` for latest-value lookups only); no duplicate/byte-identical queries; the one hardcoded date literal (`'2000-01-01'`) is `date_bin()`'s legitimate origin parameter, always paired with `$__timeFilter`, not a filter bound.
- **Data Readiness dashboard:** intentionally full-scan (global data-quality/mapping-gap diagnostics, not a live production view) — every such query is marked `NO_TIMEFILTER_INTENTIONAL`, the documented exemption pattern the query-budget linter recognizes. Layout is a clean sequential 24-column grid with no gaps or overlaps at any of the 3 target resolutions. Typography/units/decimals/thresholds already correct (hours for age metrics, percent for coverage/match metrics, consistent NO_DATA gray mapping).
- **Typography/units/decimals/axis:** spot-checked across Machine Snapshot's sensor stats and PE/JE tables — °C, %RH, kPa, mm/s, mm, mJ/cm², µm all use correct Grafana unit IDs and sensible decimal precision (1–3 places) matching real LDI sensor resolution.
- **Andon at 1280×720:** confirmed via automated regression (below) to render fully with no scroll and no overflow.

---

## 3. Final verification results

### 3.1 Linters

```
Query Budget Linter:      0 errors, 0 warnings — PASS
Dashboard Linter:         0 errors, 21 warnings — PASS (warnings are pre-existing
                           non-standard panel heights across the wider repo, not
                           introduced by this audit; none in the 5 LDI dashboards
                           beyond pre-existing Event Timeline h=14)
```

### 3.2 Responsive/structural regression (`tests/playwright/ldi-responsive-regression.js`)

15/15 checks passed across all 5 LDI dashboards × 3 resolutions (1280×720, 1920×1080, 3840×2160): zero panel errors, zero unexpected "No data" panels, zero Andon overflow at 1280×720 (measured -16px margin, i.e. fits with room to spare).

### 3.3 Query benchmark (67 panels, realistic literal-substituted variables)

```
n    = 67
min  = 0.1 ms
max  = 174.6 ms
P95  = 97.6 ms   (target: < 100 ms — met)
```

3 panels individually exceed 100ms, all previously identified and explained:

- `ims-ldi-machine-snapshot_p4` (102.7ms, "air_vacuum" latest-value stat) — benchmark-harness artifact: the literal substitution used for offline testing (`log_id = '__auto__'` resolved to `NULL`) forces a full scan for a guaranteed-empty match; the live dashboard resolves `log_id` to a real value and returns in well under 100ms (confirmed via live `/api/ds/query` capture during this audit).
- `ims-ldi-manufacturing_p21` / `ims-ldi-engineering-analytics_p14` ("Top Correlated Alarms", "Alarm↔Process Correlation") — intentional full-24h/full-dataset RCA scope (`NO_TIMEFILTER_INTENTIONAL`), by design for statistical baseline correctness; not a query-tiering violation.

---

## 4. Commits (this audit, by topic)

| Commit | Topic | Summary |
|--------|-------|---------|
| `7a0b7d4` | layout | Remove stray FLEET KPI badge panel, restore zero-gap layout + palette |
| `3cf33d1` | style | Lock 5-token color system across all 5 dashboards |
| `8c49166` | kpi | Machine Snapshot: merge PE/JE capability into Worst Cpk = LEAST(PE,JE), add Confidence, fix null-color semantics, shrink oversized Raw Timestamp panel |
| `a5e929d` | style | Fix Confidence/Cpk color-semantics bugs (LOW SAMPLE red→amber, missing NO_DATA mapping) in Engineering Analytics + Manufacturing |

No SQL migration was required — the SQL/RCA audits (§2) confirmed the underlying views (`v_machine_spc_fleet`, `v_machine_spc_ranking`, `v_ldi_alarm_category`, `v_ldi_alarm_context`) were already correct from prior migrations 036/041/042/045.

---

## 5. Design system reference

Color tokens are documented and locked in `../architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1a:

| Token | Hex | Meaning |
|---|---|---|
| `ok` | `#22c55e` | OK / healthy / running / PASS / Capable+ thresholds |
| `warning` | `#FF9100` | IDLE, Marginal, warning thresholds, low-confidence caveats |
| `critical` | `#FF003C` | OUT OF SPEC, critical thresholds, confirmed-bad states |
| `info` | `#00F2FE` | Neutral informational readouts — not a status verdict |
| `no_data` | `#6B7280` | A reporting gap — explicitly not the same claim as `critical` |

No other colors are used across the 80 audited panels.
