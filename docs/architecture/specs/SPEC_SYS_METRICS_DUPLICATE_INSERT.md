# Spec: sys_metrics Duplicate-Insert Fix (Phase A1)

**Status: deployed 2026-08-15, measurement in progress.** Approved by the user ahead of Soak Attempt 8 completing, on the reasoning that soaking a known-broken ingestion path for 72h produces evidence of the wrong thing. This ends Soak Attempt 8 -- see `docs/evidence/SOAK_TEST_LOG.md`.

## Root cause (traced node-by-node, `nodered_data/flows.json`)

`sre_parser` (function node, "SRE AIOps Parser v9 (Batch)") is invoked once per SNMP-walker-type completion (`cpu`, `storage`, `temp`, `net`, `ldi` each fire it separately). It keeps one shared per-device `state` object, updating only the slice relevant to whichever walker just reported. The bug: on every one of the 3 walker types that feed `sys_metrics` (`cpu`, `storage`, `temp`), it pushed a **full snapshot of the entire shared state** onto the batch buffer -- not once per real ~30s polling cycle (`inject_fleet`, `repeat: 30`), but once per constituent walker. All 3 land within the same window, each re-pushing the nearly-unchanged full state. Every 10s (`BATCH_INTERVAL_SEC`), the buffer flushes as one multi-row `INSERT ... VALUES (NOW(),...),(NOW(),...),(NOW(),...)` -- Postgres evaluates `NOW()` once per statement, so all rows in a flush share the exact same `time` value, which is why the duplicates were byte-identical down to the microsecond.

Confirmed isolated to `sys_metrics`: `net` and `ldi` walker types push to separate buffers, one push per completion each, no fan-in pattern -- `net_metrics` and `ldi_data`/`ldi_alarm_log` were all independently confirmed clean (0 duplicates) before this fix.

## Fix

Added a per-device cycle-gate in `sre_parser`, keyed off `flow` context (`sys_cycle_<device>`):

- On each `cpu`/`storage`/`temp` completion, mark that type seen in the pending cycle object instead of pushing immediately.
- Push the row (and reset the cycle) once **all 3** types have reported since the last push.
- **Safety timeout, 35 seconds** (`SYS_CYCLE_TIMEOUT_MS`, slightly above the 30s poll interval): if one walker type never reports (permanently down, misconfigured target, etc.), push whatever's been collected anyway rather than waiting forever. This is deliberate -- trading a possibly-incomplete row for guaranteed _no silent data loss_ is the right tradeoff per the stated priority order (duplicate-elimination must not create a new loss failure mode).

Diff is a single isolated line replacement plus one new constant -- nothing else in `sre_parser` touched, per the explicit instruction not to bundle this with the RAM/disk/alarm fixes.

## Deployment

`docker compose restart node-red` (single-service restart, not a full stack recreate) -- narrowest blast radius that still picks up the flow change. This is a real container restart and ends the current soak attempt; documented in `SOAK_TEST_LOG.md`.

## Measurement plan (before → after, all from live queries, not assumed)

1. **Duplicate rate**: `COUNT(*) - COUNT(DISTINCT (device_id,time))` over a fresh post-deploy window, same query used to find the bug. Target: ~0%.
2. **Completeness**: row count over a fixed post-deploy window should be consistent with the ~30s poll cadence × device count × window length -- not under-counting (silent loss) or over-counting (residual duplication).
3. **Timestamp resolution**: distinct `time` values across rows in the same flush window (previously collapsed to one shared value per flush).
4. **Latency**: `ingest_ts - time` distribution post-fix (both columns already existed; `ingest_ts` was `clock_timestamp()`, already per-row even under the bug -- `time` is the one that was broken).
5. **Resource/stability**: `ims-node-red` container stays healthy post-restart, no new errors in logs, `pipelineMetrics.inserts_failed` not climbing.

Results appended below once measured.

## Results

Deployed via `docker compose restart node-red` at 2026-08-15T03:31:09Z (`Started flows` logged at 03:31:21Z, clean, no errors). Measured over a ~4.5-minute post-restart window (03:31:22Z → 03:35:56Z), 4 active devices.

**Direct log proof of the bug, captured moments before the fix landed** -- the pre-restart tail of `docker logs ims-node-red` shows, repeatedly, every ~10s (`BATCH_INTERVAL_SEC`), 4 lines like `Batch INSERT [sys] ok: 3 rows` (one per device) -- literal confirmation of the exact mechanism diagnosed, not just a DB-side inference. Post-restart, the identical log line reads `Batch INSERT [sys] ok: 1 rows`, once per device, every ~30s (matching `inject_fleet`'s real poll cadence) instead of every ~10s -- the cycle-gate is visibly doing what it was designed to do.

| Metric                                                         | Before                                            | After                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Duplicate rate (`COUNT(*) - COUNT(DISTINCT (device_id,time))`) | 66.9% (8,911 / 13,317 rows, full history)         | **0.0%** (0 / 28 rows, post-fix window)                                                              |
| Rows per `(device_id, time)` pair                              | always 3 or 4, never 1                            | **always exactly 1** (28/28 pairs)                                                                   |
| Distinct `time` values per device                              | collapsed (shared `NOW()` per flush)              | **1:1** with row count (7 rows = 7 distinct times, all 4 devices)                                    |
| Sample-to-sample gap (completeness)                            | not measured pre-fix (masked by duplication)      | **29.99s avg, 29.988s-30.014s range**, matches the 30s poll trigger almost exactly, no gaps observed |
| Ingest latency (`ingest_ts - time`)                            | not comparable (shared `time`, meaningless delta) | **0.31-0.36ms average**, sub-millisecond and tight across all 4 devices                              |
| Pipeline errors/crashes since restart                          | --                                                | **0** (`docker logs` grepped for error/fail/crash)                                                   |
| `ims-node-red` resource use                                    | --                                                | 1.14% CPU, 63MiB / 2GiB memory -- no regression                                                      |

**Every dimension in the measurement plan passed.** No silent data loss observed (30s cadence held with no missed samples in the window), no duplication, timestamp resolution fully restored, latency bounded and small, pipeline stable, resource footprint unchanged.

**Caveat, stated plainly**: this is a ~4.5-minute observation window, not a soak. It proves the mechanism works exactly as designed and rules out an immediate regression, but it does not prove long-run stability (memory growth in the `flow` context's per-device cycle-tracking objects over days, behavior when a walker genuinely goes offline mid-cycle and the 35s timeout fires, etc.). That's what the next real soak attempt is for, once the rest of the approved fixes (RAM, disk, alarm hygiene) have also landed -- starting a new tracked soak attempt now, before those, would just get invalidated again by the next restart. See `docs/evidence/SOAK_TEST_LOG.md`.
