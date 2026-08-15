# Evidence-Driven Reliability Test Suite

> Replaces the original "wait 72h for a clean soak, then batch-fix" plan. Decided 2026-08-15, after Phase A1 (`sys_metrics` duplicate-insert fix) proved that soaking a known-broken ingestion path for 72h produces evidence of the wrong thing.
>
> **The reasoning, stated plainly**: a single 72-hour clock is a proxy for reliability, not reliability itself. Four properties matter more than duration -- **data integrity, scalability, recovery, and endurance** -- and each can be proven independently, faster, with a tighter fix→measure→approve loop than waiting on one long uninterrupted window. The 72h soak is demoted to optional (P3), not deleted -- it's still useful as a final long-duration confidence check once the P0/P1/P2 items are done, but it is no longer the gate everything else waits behind.

## Backlog

| Priority | Task | Reason | Status |
| --- | --- | --- | --- |
| P0 | `sys_metrics` duplicate-insert fix | 67% data duplication | **Done** -- `SPEC_SYS_METRICS_DUPLICATE_INSERT.md`, verified 66.9%→0.0% |
| P0 | Data integrity validation | Must prove no data loss | **Done** (34-min window) -- `DATA_INTEGRITY_VALIDATION_2026-08-15.md`; endurance items re-check over longer windows |
| P0 | RAM accumulation fix | Incorrect metric | **Done** -- `SPEC_RAM_METRIC_ACCUMULATION_BUG.md`, verified stable/realistic across 3 devices, no side effects |
| P0 | Ubuntu disk simulator fix | Unrealistic disk simulation | **Done** -- `SPEC_UBUNTU_DISK_SNMPREC_FIX.md`, 100% pinned → 37.2%, healthy 36-69% band, history preserved, snmpsim-only restart |
| P0 | Timestamp integrity | Support millisecond-resolution evidence | **Done** -- `SPEC_TIMESTAMP_INTEGRITY.md`. Real finding: `ldi_data`/`ldi_alarm_log` are millisecond (JS `Date`), not microsecond despite schema; `sys_metrics`/`net_metrics`/`ldi_metrics` genuinely microsecond (Postgres `NOW()`). 0 future/out-of-order timestamps. Noise-code backdating confirmed still present (known, unfixed P1 item) |
| P1 | Alarm hygiene | Reduce alert noise | Spec'd, not started -- `SPEC_ALERT_HYGIENE.md` |
| P1 | Fault injection | Prove recovery | Not started |
| P1 | Scale test 4→500 devices | Prove scalability | Not started |
| P1 | 2h endurance | Stability | Not started |
| P2 | 6h endurance | Release confidence | Not started |
| P2 | 12h endurance | Final confidence | Not started |
| P3 | 72h soak | Optional evidence | Demoted from gate to optional final check |

## Working rules (carried forward from Phase A1)

- **One fix at a time.** Each P0/P1 fix gets deployed, measured, and reported before the next one starts -- this is what makes "which change fixed what" provable, and what makes each fix's evidence trustworthy on its own instead of tangled with 2-3 others.
- **3-layer evidence standard stays in force**: code diff + runtime measurement + user-visible confirmation, before anything gets called "fixed." "PARTIALLY VERIFIED" when a layer is missing.
- **Read-only investigation vs. a fix that needs a restart are different approval tiers.** Investigation/measurement (data integrity checks, fault-injection *design*, scale-test *planning*) can proceed without a new restart-approval each time. Anything that edits `nodered_data/flows.json`, `monitoring/snmpsim/*.snmprec`, or requires `docker compose restart`/`recreate` waits for an explicit go-ahead, same as A1 did.
- **No new numbered soak attempt starts until the P0/P1 items are through** -- starting one earlier just gets invalidated by the next restart, as already happened to Attempts 1-8.
