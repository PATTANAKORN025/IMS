# FT-17.5 — Fix Matrix

| Finding | Severity | Fixed this audit? | Files changed | Validation |
|---|---|---|---|---|
| P1-1: `buildDrillDownUrl` missing `var-clicked_series`/`var-log_id` | P1 | **Yes** | `services/factory-twin-3d/lib/telemetry.js`, `tests/unit/factory-twin-telemetry.test.js` | 29/29 unit tests; verified against real DB via disposable container with a test-only confirmed mapping |
| P1-2: FT-15/16/17 unit tests not wired into CI | P1 | **Yes** | `.github/workflows/ci.yml` | Diff confirmed; step shape matches existing FT-14 mapping-contract step |
| P2-1: dead code (`drillDownUrl`, `latestStateById`) | P2 | **Yes** | `services/factory-twin-3d/public/app.js` | `node --check` clean; inspector E2E 22/22; grep confirms zero remaining references |
| P2-2: `/api/alarm-rca` has no `drill_down_url` field | P2 | **Deferred** | — | See reasoning below |
| P3-1: retention documentation self-correction | P3 | **Documented** (no code to fix) | `docs/audit/FT17_5_SYSTEM_DEEP_AUDIT.md` §10 | No functional dependency existed; confirmed by grep of `lib/analytics.js` |
| `INVALID_DATA` quality state not implemented | Design note | **Deferred** | — | See reasoning below |

## Deferment reasons

**P2-2 (`/api/alarm-rca` drill-down URL):** FT-16 deliberately scoped
`lib/alarm.js` to return `machine_drilldown_eligible` (a boolean) without
constructing the URL itself, because doing so correctly requires threading
`from`/`to` window context and a `mo` value into `buildAlarmEvent` that
`lib/alarm.js`'s current pure-function signature doesn't carry. Building it
properly is a real, scoped addition (change `buildAlarmEvent`'s signature,
update all 21 existing alarm unit tests, update `queryAlarmHistory`'s call
site) — not a one-line fix, and not something this audit's "fix all safe
findings, no speculative redesign" mandate covers. Recommended as a small,
explicit follow-up task, not bundled here.

**`INVALID_DATA` quality state:** Phase 7 asked to "classify" real defects
found in the data and "add tests for every real defect found." This audit's
own real-data investigation (duplicate rows, impossible values, out-of-order
timestamps, 7-day window) found zero real invalid-value cases — the one real
anomaly found (a 15-hour sampling gap on LDI-01) is already correctly
represented as `INSUFFICIENT_DATA`, not `INVALID_DATA` (it is an absence of
data, not a wrong value). Adding an `INVALID_DATA` enum member with no real
case to classify would be exactly the "speculative redesign" this audit was
told not to bundle. Deferred until a real invalid-value case is found.

## Explicitly not touched (per hard rules)

- No DB schema change (no defect required one).
- No geometry change (no fresh defect proven).
- No Operator Andon/Grafana dashboard change (`ims-ldi-machine-snapshot.json`
  was read, not edited — the fix landed entirely in `lib/telemetry.js`,
  the Twin's own code, matching the dashboard's existing, unmodified
  contract).
- No history rewrite; the FT-16/FT-17 commit messages containing the
  retention over-claim remain as originally written.
