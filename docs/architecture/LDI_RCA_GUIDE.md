# LDI RCA (Root Cause Analysis) Guide

> **Audience:** process engineering, QA/audit, SRE/operations.
>
> **Provenance:** every formula and figure below was checked directly against the live migrations and database on 2026-08-10.

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

## Two views, two purposes — don't confuse them

|                      | `v_ldi_rca_recent_window`                                         | `v_ldi_rca_truth_test`                                                                                         |
| -------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Scope**            | Rolling 24-hour window                                            | Full dataset, all time                                                                                         |
| **Purpose**          | Operational KPI — "is RCA correlation still holding up right now" | Validation/truth-test — "does the simulator's fault-injection logic actually produce the claimed correlations" |
| **VACUUM included?** | No (excluded — see migration 050)                                 | Yes                                                                                                            |
| **Materialized?**    | Yes (migration 064, 60s refresh)                                  | Yes (migration 064, 60s refresh)                                                                               |
| **Where it's read**  | LDI Manufacturing's "Top Correlated Alarms (24h)" panel           | LDI Engineering Analytics's "RCA Truth Test" panel                                                             |

## Current live figures (snapshot, 2026-08-10 — see caveat below)

```text
Alarm Category         Alarm-Window % Baseline % Lift Event Count Confidence
MOTION (70004)            100.0  0.4 250.00   56 OK
VACUUM (91009)            100.0  14.2 7.04   2493 OK
THERMAL (91008)            73.1  16.6 4.40   1924 OK
HUMIDITY (91008)            44.0  10.1 4.36   1924 OK
ALIGNMENT/PE-JE (90001,90004,90005,90012,90013)    100.0  44.9 2.23   5201 OK
```

**This is a point-in-time snapshot, not a permanent fact.** Lift figures on this live-ingesting mock system drift as the data window rolls and the simulator continues generating events — a figure measured today will not exactly match a figure measured next week. Re-run `SELECT * FROM public.v_ldi_rca_truth_test ORDER BY "Lift" DESC;` for current numbers before citing one in a report. (An earlier version of `ARCHITECTURE.md` cited VACUUM at "7,352x" — that was accurate when measured 2026-08-07, and is not accurate now; this guide replaces that stale reference.)

## Why VACUUM (91009) needed a specific fix

VACUUM's out-of-spec threshold (`air_vacuum > -8 OR < -30`) is calibrated around the simulator's own DF INNER recipe range (migration 057 — simulator-derived, not a sourced vendor spec). Two supporting fixes were required for this correlation to be measurable at all:

1. **DF OUTER/SM machines correctly send `NULL`** for `air_vacuum` instead of a `0.0` "not applicable" sentinel (migration 054, backfilled to historical rows in migration 060) — a `0.0` would have been misread as a real out-of-spec reading.
2. **The telemetry generator injects rare weak-vacuum fault events** so there's a genuine excursion to correlate against (`ldisim_gen` in the built `nodered_data/flows.json`) — without deliberately injected faults, a purely healthy simulated process has nothing for RCA to find.

## Why MOTION (70004) sometimes shows low confidence

Scan-speed excursions are correctly correlated, just statistically rarer than thermal/humidity/alignment events in the current recipe distribution — in a 24-hour rolling window (`v_ldi_rca_recent_window`), event count can fall under the n≥30 floor. The full-dataset view (`v_ldi_rca_truth_test`) usually has enough accumulated events to clear it (56 in the snapshot above). Not a bug — the category earns "OK" confidence once enough events accumulate in whatever window is being read.

## Related documents

- `docs/architecture/LDI_SPC_GUIDE.md` — the companion process-capability (Cpk) methodology.
- `docs/architecture/ALARM_SEVERITY_GUIDE.md` — the alarm taxonomy these correlations are computed against.
- `docs/architecture/ARCHITECTURE.md` — full system context, Known Gaps.
