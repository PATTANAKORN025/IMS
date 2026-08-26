# Alarm Lifecycle / Alert Rules Audit — Batch 4/5

## Alarm-api idle DB crash — see Batch 1 (full-reaudit-report.md)

RETRACTED as a live concern — fixed, live-confirmed (`pool.on('error', ...)`, 5h+ uptime, 0 restarts, actively catching and recovering idle-timeout events).

## Alarm ack/resolve → audit trail — NOT VERIFIED (not exercised live this pass)

Did not perform a live ack/resolve UI action this pass. Confirmed via P15-R work and this session's Andon re-test that `public.ldi_alarm_lifecycle` is the audit-trail table (joined by `logdate`+`logid`) and that both `ims-ldi-alarm-console.json` and `ims-ldi-operator-andon.json` correctly filter on `l.status IS DISTINCT FROM 'RESOLVED'`. The actual write-path (does clicking Ack/Resolve in the Console correctly insert/update a lifecycle row and does the Andon board reflect it on next 5s refresh) was not exercised. `docs/evidence/FINAL_ACCEPTANCE_MATRIX_2026-08-15.md` itself notes "Alarm Console has zero engagement — MTTA/MTTR cannot be validated until someone actually uses the Ack/Resolve workflow" as an existing known-unvalidated risk, consistent with this pass also not closing that gap.

## Alert-rule audit — NOT VERIFIED

Brief §15 (Grafana alert rules, not just dashboard panels) was not audited this pass. `tests/lint/` has a rule (per memory/prior work) gating missing `ORDER BY` on time_series alerts (task #198, already completed in an earlier phase) — not re-verified this pass whether it still holds.

## Static blind-spot re-tests — partial

- Nested-row panel traversal gap: **CONFIRMED still present**, fully documented in `full-reaudit-report.md` and `performance-query-report.md` (affects both dashboard-inventory tooling and `query-budget-linter.js`).
- `date_bin()` coverage gap, scalar-aggregate time-filter gap: **NOT re-tested this pass** — brief named these as previously-known blind spots; out of scope for the time available this session.
