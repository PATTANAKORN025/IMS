# Timestamp Integrity Audit (P0.3)

**Status: audited, documented. No code change required for this item -- findings below are the deliverable.**

## The real timestamp model, as it actually exists (not as claimed)

```
source/event  ->  ingest (Node-RED/JS)  ->  processing (Node-RED batch buffer)  ->  DB commit  ->  query  ->  dashboard
```

This system does **not** have 6 independent timestamps per row. What actually exists, per table:

| Table | "Event" column | Resolution (schema) | Resolution (actual, measured) | "Ingest" column | Resolution (actual) |
| --- | --- | --- | --- | --- | --- |
| `ldi_data` | `time` (JS `Date`, Node-RED-side) | `timestamptz(6)` (microsecond) | **millisecond only** -- every sample's microsecond field ends in `000` | `ingest_ts` (`clock_timestamp()`, Postgres-side) | genuine microsecond |
| `ldi_alarm_log` | `logdate` (JS `Date`) | `timestamptz(6)` | **millisecond only**, same pattern | `ingest_ts` (`clock_timestamp()`) | genuine microsecond |
| `sys_metrics` | `time` (SQL `NOW()`, Postgres-side, set inside the batch INSERT) | `timestamptz(6)` | **genuine microsecond** -- `NOW()` is Postgres-native, not JS-derived | `ingest_ts` (`clock_timestamp()`) | genuine microsecond |
| `net_metrics`, `ldi_metrics` | same as `sys_metrics` (`NOW()`) | `timestamptz(6)` | genuine microsecond | `ingest_ts` | genuine microsecond |

**Corrected claim**: the schema declares microsecond precision (`timestamptz(6)`) everywhere, and that's true for every `ingest_ts` column and for `sys_metrics`/`net_metrics`/`ldi_metrics`'s `time` column. But `ldi_data.time` and `ldi_alarm_log.logdate` -- the two tables whose "event" timestamp originates in Node-RED's JavaScript runtime (`new Date()` / `Date.now()`) rather than a Postgres-side `NOW()` call -- only carry **millisecond** resolution in practice, because JavaScript's native `Date` has no sub-millisecond component. This is not a bug to fix; it's a real, permanent ceiling on precision for those two tables given the current architecture (Node-RED generates the event timestamp client-side). **Do not claim microsecond-resolution telemetry for `ldi_data`/`ldi_alarm_log` -- the honest claim is millisecond for the event time, microsecond for ingest time.**

There is no separate "processing timestamp" column anywhere in the schema -- the batch-buffer stage (`sre_parser`'s 10s flush interval, or the `BATCH_INTERVAL_SEC` mechanism fixed in Phase A1) is real but not recorded per-row. The only two recorded instants per row are event-time and commit-time.

## Latency measurements (real, `tests/e2e/ingestion-latency-check.js`, last 15 minutes)

**Stage 1 — source → commit** (`ingest_ts - <event column>`):

| Table | n | P50 | P95 | P99 |
| --- | --- | --- | --- | --- |
| `ldi_data` | 871 | 8ms | 22ms | 38ms |
| `ldi_alarm_log` (causal, real correlation) | 3 | 5ms | 5ms | 5ms |
| `ldi_alarm_log` (nearest, noise-code) | 11 | 4204ms | 7172ms | 7173ms |
| `sys_metrics` | 108 | 0ms | 1ms | 1ms |
| `net_metrics` | 208 | 0ms | 1ms | 3ms |
| `ldi_metrics` | 108 | 0ms | 1ms | 2ms |

**Stage 2 — query-visible latency** (real `EXPLAIN ANALYZE` on the most-recent-row query): 0.07ms-0.31ms across all 5 tables.

**Do not confuse the `ldi_alarm_log (nearest)` row with real pipeline latency** -- per the user's own explicit caution and this session's earlier work (`ALARM_LATENCY_MEASUREMENT_NOTE.md`, `docs/architecture/specs/SPEC_SIMULATOR_REALISM.md` item 1): `almsim_gen`'s noise-code path still backdates its event timestamp by 0-9000ms before insert (`new Date(now - Math.floor(Math.random() * 9000))`, confirmed present in `nodered_data/flows.json` in this pass, unchanged from the earlier audit). The 4204-7173ms figures are that artificial delay showing up as apparent latency, not the pipeline being slow. The `link_basis` column (`'causal'` vs `'nearest'`) is exactly the provenance marker that distinguishes real pipeline latency (causal, 5ms) from this artifact (nearest, ~4-7s) -- used correctly here per the instruction not to conflate simulator event timing with actual ingestion latency.

`sys_metrics`/`net_metrics`/`ldi_metrics` showing ~0ms Stage-1 latency is a measurement-methodology artifact worth stating plainly, not a real "instant" pipeline: their event timestamp (`NOW()`) and commit timestamp (`clock_timestamp()`) are both set inside the same INSERT statement's execution, seconds after the actual SNMP poll happened -- Stage 1 for these tables measures "time between transaction start and statement completion," not "time from the real-world SNMP reading to being queryable." Real end-to-end latency for these tables (poll → committed) is not separately instrumented; only `ldi_data`/`ldi_alarm_log` have a genuine pre-Node-RED event timestamp to compare against.

## Anomaly checks (all measured live, this pass)

| Check | Result |
| --- | --- |
| Duplicate timestamps | `sys_metrics`: fixed by Phase A1 (0% as of that fix). Not re-swept across every other table in this pass -- `ldi_data`/`net_metrics`/`ldi_alarm_log` were confirmed 0-duplicate in the earlier `READ_ONLY_AUDIT_2026-08-15.md`, using `(device/eqp_id, time)` or `(logdate, logid)` as the dedup key, not timestamp alone; genuinely repeated exact-same-timestamp rows for the *same* machine were not separately re-checked here (see Known Limitations) |
| Out-of-order events | 0 rows where `ingest_ts < <event column>` across `ldi_data` and `ldi_alarm_log` -- commit never precedes the event it's for |
| Future timestamps | 0 rows with `time`/`logdate` > `NOW()` across `ldi_data`, `sys_metrics`, `ldi_alarm_log` |
| Timestamp truncation / second-level rounding | Not observed -- `sys_metrics`/`net_metrics`/`ldi_metrics` carry real sub-second precision (not rounded to whole seconds); `ldi_data`/`ldi_alarm_log` are millisecond-truncated (see above), not second-truncated |
| Artificial backdating | **Present and confirmed**, noise-code alarm path only (see Stage 1 table above) -- pre-existing known issue, not fixed in this pass (that's `SPEC_SIMULATOR_REALISM.md` item 1, a P1 simulator-realism item, out of P0.3's scope) |
| Batch timestamp artifacts | **Fixed by Phase A1** -- before that fix, `sys_metrics`'s multi-row batch `INSERT` used SQL `NOW()` per row, which Postgres evaluates once per statement, so every row in a batch shared one timestamp. Phase A1's cycle-gate means each device now produces one row per real cycle, so batches are typically single-row again, and this artifact no longer manifests in practice for `sys_metrics`. Not separately checked for `net_metrics`/`ldi_metrics`, which use the same batch/`NOW()` pattern and could show the same artifact if their per-cycle row count ever exceeds 1 (currently doesn't, per `net_metrics` showing exactly 1 row per interface per cycle in the Data Integrity Validation pass) |

## Known limitations (stated plainly, per the acceptance rule)

- `ldi_data`/`ldi_alarm_log` are **millisecond**-resolution at the event-time column, not microsecond, despite the schema's `timestamptz(6)` declaration -- an architectural ceiling (JS `Date`), not something this pass fixes.
- Duplicate-timestamp sweep for `ldi_data`/`net_metrics` in this specific pass relied on the earlier audit's dedup-key results, not a fresh re-run with timestamp-only grouping -- a genuinely repeated identical timestamp for the *same* device that differs in other columns wouldn't have been caught by either check. Flagged as a real gap, not closed here.
- `net_metrics`/`ldi_metrics` were not independently checked for the batch-timestamp artifact Phase A1 fixed for `sys_metrics` -- inferred safe from their current single-row-per-cycle behavior, not directly proven with a targeted test.
- No P95/P99 for `ldi_alarm_log (causal)` beyond n=3 -- too small a sample in a 15-minute window to be statistically meaningful (same `LDI_RCA_GUIDE.md`-style caveat as elsewhere in this project).
