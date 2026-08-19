<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# LDI RCA (Root Cause Analysis) Guide

> **Audience:** Process Engineering, QA/Audit, SRE/Operations.
> **Objective:** Explains the Root Cause Analysis (RCA) correlation methodology (Lift and Confidence) for alarms.
> **Provenance:** Every formula and figure below was checked directly against the live migrations and database on 2026-08-19 (migration 082).

---

## What RCA means in this system

IMS correlates LDI alarm events against process-parameter excursions — answering "when this alarm fires, is the underlying process parameter actually out of spec at that moment, more often than baseline?" This is a statistical correlation check (Lift), not equipment-level fault diagnosis.

## The Lift / Confidence metric

```text
Lift = (% of alarm-context rows where the parameter flag is out-of-spec)
  / (% of ALL rows where that same parameter flag is out-of-spec)

Confidence = "OK" if event_count >= 30, else "LOW SAMPLE (n<30)"
```

A Lift of 1.0 means the alarm has no predictive relationship to the parameter (it's out-of-spec exactly as often around this alarm as anywhere else). Lift > 1 means the parameter is genuinely more likely to be out of spec when this alarm fires — the higher, the stronger the correlation. The `n < 30` confidence floor exists because Lift on a handful of events is not statistically meaningful.

**Migration 082 note:** both RCA views originally computed Lift by dividing already-1-decimal-rounded percentages, which silently blanked Lift for any category whose true baseline rounded to 0.0% (THERMAL, VACUUM) and skewed others (MOTION, ~9-22%). Migration 082 (2026-08-19, following an end-to-end system audit) fixed this to divide raw, unrounded fractions — only the *displayed* percentage columns are rounded to 1 decimal now. It also removed `v_ldi_rca_recent_window`'s stale VACUUM exclusion (see the table above), which had outlived the reason for it (migration 057 already fixed the underlying threshold problem, 7 migrations earlier). If you see a Lift figure that looks lower/blanker than expected on a dashboard built before 2026-08-19, that's the pre-fix behavior — re-check live.

---

## Root Cause Analysis Workflow (DMAIC-Lite)

When an alarm exhibits high correlation (Lift > 10, Confidence = OK) with an out-of-spec parameter, Engineering must execute this structured RCA workflow to find the physical fault.

### 1. Define & Measure

1. **Identify Target:** Open the `LDI Manufacturing` dashboard and check the **"Top Correlated Alarms (24h)"** panel.
2. **Quantify:** Note the specific Alarm Category and the correlated parameter (e.g., _THERMAL alarm correlated with HUMIDITY out of spec_).
3. **Verify:** Jump to `LDI Machine Snapshot` to verify that the parameter is physically drifting on the specific machines throwing the alarm.

### 2. Analyze (5-Why Physical Inspection)

Do not just reset the alarm. Go to the physical machine and ask "Why?" until the root hardware or process fault is found.
_Example for Humidity Correlation:_

- **Why did the alarm fire?** The humidity sensor reported 65% (Limit: 50%).
- **Why is humidity high?** The cleanroom sector B HVAC return vent is blocked.
- **Why is it blocked?** Maintenance left filter packaging in the plenum.

### 3. Improve & Control (Resolution & Documentation)

Once the physical root cause is resolved, you must document the finding to close the loop.

**Standardized RCA Outcome Format:**
Log the following in the shift ticket/Jira/ServiceNow:

```text
[RCA REPORT]
Alarm Category: <Category> (Code: <Code>)
Correlated Parameter: <Parameter> (Lift: <X>)
Root Cause Identified: <Physical Fault>
Action Taken: <Resolution Steps>
Verification: <e.g., Humidity dropped to 45% after 15 mins. Alarm cleared.>
```

---

## Two views, two purposes — don't confuse them

|                      | `v_ldi_rca_recent_window`                                         | `v_ldi_rca_truth_test`                                                                                         |
| -------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Scope**            | Rolling 24-hour window                                            | Full dataset, all time                                                                                         |
| **Purpose**          | Operational KPI — "is RCA correlation still holding up right now" | Validation/truth-test — "does the simulator's fault-injection logic actually produce the claimed correlations" |
| **VACUUM included?** | Yes (recalibrated threshold, migration 057; included since migration 082 — see note below) | Yes                                                                                                            |
| **Materialized?**    | Yes (migration 064, 60s refresh)                                  | Yes (migration 064, 60s refresh)                                                                               |
| **Where it's read**  | LDI Manufacturing's "Top Correlated Alarms (24h)" panel           | LDI Engineering Analytics's "RCA Truth Test" panel                                                             |

## Current live figures (snapshot, 2026-08-19T07:24Z, post migration-082 fix — see caveat below)

```text
Alarm Category                                    Alarm-Window % Baseline % Lift     Event Count Confidence
VACUUM (91009)                                                100.0        0.0  4956.96           4 LOW SAMPLE (n<30)
ALIGNMENT/PE-JE (90001,90004,90005,90012,90013)               100.0        0.8   125.83          70 OK
MOTION (70004)                                                100.0        0.2   420.59          27 LOW SAMPLE (n<30)
HUMIDITY (91008)                                                99.1       10.6     9.34         445 OK
THERMAL (91008)                                                  1.3        0.2     5.90         445 OK
```
(from `v_ldi_rca_truth_test`, full-dataset view; `v_ldi_rca_recent_window`'s 24h operational view now also carries a VACUUM row, currently `LOW SAMPLE (n<30, 0 events)` since no vacuum fault has fired in the last 24h — expected, not a bug.)

**This is the first snapshot taken after migration 082**, which fixed the Lift double-rounding bug and (for `v_ldi_rca_recent_window` only) added VACUUM. The prior 2026-08-15 snapshot this replaces showed VACUUM and THERMAL with blank/no-computable Lift despite having real events — that was this exact bug, not a genuine lack of correlation. Compare: THERMAL now shows a real, computed Lift (5.90) instead of blank; VACUUM shows 4956.96, consistent with the ~4,925x figure hand-verified during the 2026-08-19 audit that found this bug.

- **VACUUM's Lift (4956.96) is the strongest correlation in the system** — previously invisible on both views due to the bug (truth-test) and the exclusion (recent-window). Low sample size (n=4 in this snapshot) still applies — treat as directionally strong, not yet statistically dense.
- **THERMAL and HUMIDITY share the same underlying alarm code (91008)** but flag different parameters — THERMAL's baseline is naturally much rarer (0.2%) than HUMIDITY's (10.6%), which is why THERMAL's Lift is more sensitive to the rounding bug than HUMIDITY's ever was.
- **ALIGNMENT/PE-JE and MOTION both show large, real Lift values** (125.83x, 420.59x) — MOTION remains LOW SAMPLE at this data volume, consistent with the "Why MOTION sometimes shows low confidence" section below.

**This is a point-in-time snapshot, not a permanent fact.** Lift figures on this live-ingesting mock system drift as the data window rolls and the simulator continues generating events. Re-run `SELECT * FROM public.v_ldi_rca_truth_test ORDER BY "Lift" DESC;` for current numbers before citing one in a report — do not reuse this or any prior snapshot as if it were current. (Earlier snapshots in this doc's history, e.g. one citing VACUUM at "7,352x" on 2026-08-07, were accurate at the time but are superseded here for the same reason, on top of some pre-082 figures also having been distorted by the Lift bug itself.)

## Why VACUUM (91009) needed a specific fix

VACUUM's out-of-spec threshold (`air_vacuum > -8 OR < -30`) is calibrated around the simulator's own DF INNER recipe range (migration 057 — simulator-derived, not a sourced vendor spec). Two supporting fixes were required for this correlation to be measurable at all:

1. **DF OUTER/SM machines correctly send `NULL`** for `air_vacuum` instead of a `0.0` "not applicable" sentinel (migration 054, backfilled to historical rows in migration 060) — a `0.0` would have been misread as a real out-of-spec reading.
2. **The telemetry generator injects rare weak-vacuum fault events** so there's a genuine excursion to correlate against (`ldisim_gen` in the built `nodered_data/flows.json`) — without deliberately injected faults, a purely healthy simulated process has nothing for RCA to find.

## Why MOTION (70004) sometimes shows low confidence

Scan-speed excursions are correctly correlated, just statistically rarer than thermal/humidity/alignment events in the current recipe distribution — in a 24-hour rolling window (`v_ldi_rca_recent_window`), event count can fall under the n≥30 floor. The full-dataset view (`v_ldi_rca_truth_test`) accumulates events faster than the rolling window (27 in the snapshot above, still short of the n≥30 floor at this data volume) but will clear it as the dataset grows. Not a bug — the category earns "OK" confidence once enough events accumulate in whatever window is being read.

## Related documents

- `docs/architecture/LDI_SPC_GUIDE.md` — the companion process-capability (Cpk) methodology.
- `docs/operations/LDI_VALIDATION_PROTOCOL.md` — RCA truth-test assertions in the live-validation script (`tests/e2e/panel-data-check.js`).
- `docs/architecture/ALARM_SEVERITY_GUIDE.md` — the alarm taxonomy these correlations are computed against.
- `docs/architecture/ARCHITECTURE.md` — full system context, System Constraints & Technical Boundaries.

---

[⬅️ Back to IMS Platform Book](IMS_PLATFORM_BOOK.md) | [<img src="../../docs/assets/icons/home.svg" width="18" align="center" /> Main Repository](../../README.md)
