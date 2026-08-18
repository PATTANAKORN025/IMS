# LDI RCA (Root Cause Analysis) Guide

> **Audience:** Process Engineering, QA/Audit, SRE/Operations.
> **Objective:** Explains the Root Cause Analysis (RCA) correlation methodology (Lift and Confidence) for alarms.
> **Provenance:** Every formula and figure below was checked directly against the live migrations and database on 2026-08-10.

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

---

## Root Cause Analysis Workflow (DMAIC-Lite)

When an alarm exhibits high correlation (Lift > 10, Confidence = OK) with an out-of-spec parameter, Engineering must execute this structured RCA workflow to find the physical fault.

### 1. Define & Measure
1. **Identify Target:** Open the `LDI Manufacturing` dashboard and check the **"Top Correlated Alarms (24h)"** panel.
2. **Quantify:** Note the specific Alarm Category and the correlated parameter (e.g., *THERMAL alarm correlated with HUMIDITY out of spec*).
3. **Verify:** Jump to `LDI Machine Snapshot` to verify that the parameter is physically drifting on the specific machines throwing the alarm.

### 2. Analyze (5-Why Physical Inspection)
Do not just reset the alarm. Go to the physical machine and ask "Why?" until the root hardware or process fault is found.
*Example for Humidity Correlation:*
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
| **VACUUM included?** | No (excluded — see migration 050)                                 | Yes                                                                                                            |
| **Materialized?**    | Yes (migration 064, 60s refresh)                                  | Yes (migration 064, 60s refresh)                                                                               |
| **Where it's read**  | LDI Manufacturing's "Top Correlated Alarms (24h)" panel           | LDI Engineering Analytics's "RCA Truth Test" panel                                                             |

## Current live figures (snapshot, 2026-08-15T02:35Z — see caveat below)

```text
Alarm Category                                    Alarm-Window % Baseline % Lift    Event Count Confidence
VACUUM (91009)                                                 -        0.0    -              0 LOW SAMPLE (n<30)
THERMAL (91008)                                              0.0        0.0    -            105 OK
MOTION (70004)                                              100.0        0.3 333.33            6 LOW SAMPLE (n<30)
ALIGNMENT/PE-JE (90001,90004,90005,90012,90013)              100.0        0.5 200.00           17 LOW SAMPLE (n<30)
HUMIDITY (91008)                                              100.0        9.9  10.10          105 OK
```

**Read this snapshot in context: it was taken ~1h25m after a full host/container reset** (see `docs/evidence/SOAK_TEST_LOG.md` Attempt 7 closeout), not after days of steady-state running like the 2026-08-10 snapshot this replaces. That explains the shape of these numbers, honestly:

- **VACUUM has 0 events** and no computable Lift yet — the vacuum weak-fault injection (see "Why VACUUM needed a specific fix" below) is a rare event; it simply hasn't fired since the reset. This is an expected statistical boundary, not a lack of correlation — re-check after VACUUM accumulates events.
- **THERMAL has 105 events but 0.0%/0.0% and no computable Lift** — both the alarm-window and the baseline currently show 0% temperature-out-of-spec, so there's no variation yet for Lift to measure (105 THERMAL alarms fired on the HUMIDITY flag being out of spec, not the TEMP flag — see the `HUMIDITY (91008)` row, same underlying alarm code, different flag).
- **MOTION and ALIGNMENT/PE-JE show real, large Lift values (333x, 200x) but both are LOW SAMPLE (n<30)** — directionally consistent with the 2026-08-10 snapshot's correlation existing, but not yet statistically solid this soon after reset.
- **HUMIDITY is the only category with both a computed Lift and `OK` confidence** (10.10, n=105) — this one is on solid statistical ground already.

**This is a point-in-time snapshot, not a permanent fact.** Lift figures on this live-ingesting mock system drift as the data window rolls, the simulator continues generating events, and (as this snapshot shows) as elapsed time since the last reset accumulates. Re-run `SELECT * FROM public.v_ldi_rca_truth_test ORDER BY "Lift" DESC;` for current numbers before citing one in a report — do not reuse either this snapshot or the 2026-08-10 one it replaces as if it were current. (An earlier version of `ARCHITECTURE.md` cited VACUUM at "7,352x" — that was accurate when measured 2026-08-07, and was already stale by 2026-08-10; the 2026-08-10 snapshot itself is now superseded by the numbers above for the same reason.)

## Why VACUUM (91009) needed a specific fix

VACUUM's out-of-spec threshold (`air_vacuum > -8 OR < -30`) is calibrated around the simulator's own DF INNER recipe range (migration 057 — simulator-derived, not a sourced vendor spec). Two supporting fixes were required for this correlation to be measurable at all:

1. **DF OUTER/SM machines correctly send `NULL`** for `air_vacuum` instead of a `0.0` "not applicable" sentinel (migration 054, backfilled to historical rows in migration 060) — a `0.0` would have been misread as a real out-of-spec reading.
2. **The telemetry generator injects rare weak-vacuum fault events** so there's a genuine excursion to correlate against (`ldisim_gen` in the built `nodered_data/flows.json`) — without deliberately injected faults, a purely healthy simulated process has nothing for RCA to find.

## Why MOTION (70004) sometimes shows low confidence

Scan-speed excursions are correctly correlated, just statistically rarer than thermal/humidity/alignment events in the current recipe distribution — in a 24-hour rolling window (`v_ldi_rca_recent_window`), event count can fall under the n≥30 floor. The full-dataset view (`v_ldi_rca_truth_test`) usually has enough accumulated events to clear it (56 in the snapshot above). Not a bug — the category earns "OK" confidence once enough events accumulate in whatever window is being read.

## Related documents

- `docs/architecture/LDI_SPC_GUIDE.md` — the companion process-capability (Cpk) methodology.
- `docs/operations/LDI_VALIDATION_PROTOCOL.md` — RCA truth-test assertions in the live-validation script (`tests/e2e/panel-data-check.js`).
- `docs/architecture/ALARM_SEVERITY_GUIDE.md` — the alarm taxonomy these correlations are computed against.
- `docs/architecture/ARCHITECTURE.md` — full system context, System Constraints & Technical Boundaries.

---
[⬅️ Back to IMS Platform Book](IMS_PLATFORM_BOOK.md) | [🏠 Main Repository](../../README.md)
