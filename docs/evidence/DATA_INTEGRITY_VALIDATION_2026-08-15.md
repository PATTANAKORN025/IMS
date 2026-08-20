<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Data Integrity Validation (P0, Reliability Test Suite)

> "Must prove no data loss." Read-only, no container touch. Window: 2026-08-15T03:31:22Z → 04:05:21Z (~34 min), immediately following the Phase A1 `sys_metrics` fix -- chosen deliberately so this validation covers the fixed pipeline, not the pre-fix one.

## Method

For each ingestion table, either (a) row-count-vs-expected against a known fixed poll interval, or (b) gap-distribution analysis when the interval isn't fixed -- plus a check of the pipeline's own internal failure counters (buffer overflows, circuit-breaker trips) for silent-loss signals that wouldn't show up as a row-count gap at all.

## `sys_metrics` (fixed-interval, 30s via `inject_fleet`)

| Device             | Rows | Expected (window / 30s) |
| ------------------ | ---- | ----------------------- |
| ERP-MASTER-UBUNTU  | 66   | 66.0003                 |
| ERP-MASTER-WINDOWS | 66   | 65.9991                 |
| LDI-A01     | 66   | 65.9988                 |
| LDI-A02    | 66   | 65.9990                 |

Exact match, all 4 devices. **No loss, no residual duplication** (consistent with A1's own measurement).

## `net_metrics` (same 30s trigger, 2 interfaces/device)

66 rows per `(device_id, iface_name)` pair, all 8 pairs, identical to `sys_metrics`'s count. Clean.

## `ldi_data` (per-machine variable cadence -- methodology correction made mid-validation)

**First pass was wrong and is recorded here on purpose, not quietly fixed**: assumed a uniform 2s cadence (from the `ldisim_tick` inject node) and got numbers that looked like 3.5%-34% of "expected" -- alarming on its face. That assumption was false: `ldisim_tick` drives the simulator's internal clock for all 10 machines, not a 1:1 "one row per machine per tick." Re-checked with gap-distribution analysis instead of an assumed rate:

| Machine   | Rows    | Min gap | Avg gap | Max gap |
| --------- | ------- | ------- | ------- | ------- |
| LDI-01/02 | 337     | 5.998s  | 6.026s  | 8.007s  |
| LDI-03/04 | 221     | 7.999s  | 9.181s  | 10.008s |
| LDI-05/06 | 348-350 | ~4.0s   | ~5.8s   | ~6.0s   |
| LDI-07/08 | 74      | 26.007s | 27.039s | 28.019s |
| LDI-09/10 | 33      | 58.020s | 58.814s | 60.031s |

Each machine has its own **tight, internally consistent** cadence (min ≈ avg ≈ max, no long-tail outliers) -- different machines genuinely sample at different real rates (consistent with the readiness dashboard's earlier finding of differing per-machine telemetry-row throughput, itself tied to process/recipe type -- "DF INNER" vs "SM" etc). No gap suggests a dropped sample. **Clean, once measured the right way.**

## Pipeline-internal failure signals

```text
docker logs ims-node-red --since 2026-08-15T03:31:22Z | grep -i "overflow|failed"  -> 0 matches
docker logs ims-node-red --since 2026-08-15T03:31:22Z | grep -i "circuit"          -> 0 matches
```

No buffer overflows (the `BUFFER_MAX=200` safety-drop path never triggered), no circuit-breaker trips (no device was marked unhealthy/skipped) in this window.

## Not covered in this pass

- `ldi_alarm_log` -- already confirmed 0 duplicates in `READ_ONLY_AUDIT_2026-08-15.md` §3; not re-checked here with a new method since alarms are event-driven, not cadence-based, and duplication (not completeness) was the relevant risk there.
- Cross-checking the pipeline's self-reported `pipelineMetrics.inserts_ok` counter against DB row sums -- attempted, the `/metrics` HTTP path wasn't reachable the way expected and `ims-meta-monitoring`'s panels read from Prometheus, not that in-memory counter directly. Not chased further: the row-count/gap method used above is stronger evidence anyway (it's the DB's own ground truth, not a self-reported application counter that could itself be wrong).
- This is a 34-minute window, not an endurance test. Confirms no loss under current conditions; does not prove stability over hours (that's the 2h/6h/12h endurance items in `RELIABILITY_TEST_SUITE.md`).

## Verdict

**No data loss found**, across all 3 tables checked, using two different valid methods (fixed-rate comparison and gap-distribution analysis), plus zero internal failure-counter signals. P0 "Data integrity validation" item: **done** for this window; endurance items still needed for a longer-duration claim.
