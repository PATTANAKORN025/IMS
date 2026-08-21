<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Controlled Scale Test (P1, Reliability Test Suite)

> Uses the existing k6 infrastructure (`tests/k6/pipeline-stress.js`), no new broker/tooling added, per the explicit instruction to use the current architecture first. `TARGET_SERVERS` env var drives the tier; the script's own staged ramp (30s→min(target,20), 1m→min(target,50), 1m→target, 30s→0) runs regardless of tier, so each run takes ~3 minutes wall-clock.
>
> The `/inject` endpoint routes synthetic `E2E-SERVER-NNN` devices through the **real** pipeline end-to-end (Resolve Device → Fork 5 Walker Threads → walk_cpu/storage/net/temp/ldi → `sre_parser` → batch buffer → `db_insert`) -- this is the same code path real SNMP-polled devices use, not a synthetic shortcut. 1,000 `E2E-SERVER-*` devices were already pre-registered in `public.devices` (not created for this test).

## Results by tier

| Tier | Success rate | Requests | Throughput | e2e P50 | e2e P95   | e2e max               |
| ---- | ------------ | -------- | ---------- | ------- | --------- | --------------------- |
| 4    | 100.00%      | 247      | 1.36/s     | 3ms     | 4ms       | 7ms                   |
| 50   | 100.00%      | 2,515    | 13.9/s     | 3ms     | 9ms       | 59ms                  |
| 100  | 100.00%      | 3,373    | 18.4/s     | 3ms     | 10ms      | 60ms                  |
| 250  | 100.00%      | 5,818    | 31.9/s     | 25ms    | **1.09s** | 2.54s                 |
| 500  | **96.32%**   | 7,807    | 42.8/s     | 696ms   | **2.93s** | 10s (timeout ceiling) |

**Real inflection point between 100 and 250 devices**: P95 latency jumps from 10ms to 1.09s (~100x) while success rate stays 100%. **Real failure threshold at 500**: 287 of 7,807 requests (3.68%) failed or timed out at the script's 10s HTTP timeout -- the system is still mostly functional at 500 but has crossed from "slow but reliable" into "measurably dropping/timing out requests."

## Bottleneck: Node-RED CPU, not the database

Sampled container stats live during the 500-device run (docker stats, 25s intervals) instead of after the run, since resource usage was found to settle back to idle within seconds of a run ending (a real methodology correction made mid-test -- the tier-4 post-run sample was misleadingly idle-looking for this reason):

| Sample | `ims-node-red` CPU | `ims-timescaledb` CPU | `ims-pgbouncer` CPU | PG connections |
| ------ | ------------------ | --------------------- | ------------------- | -------------- |
| 1      | 16.45%             | 49.73%                | 0.03%               | 21             |
| 2      | 39.83%             | 4.97%                 | 0.67%               | 21             |
| 3      | 33.23%             | 5.81%                 | 1.74%               | 21             |
| 4      | 118.46%            | 7.28%                 | 0.58%               | 21             |
| 5      | **134.84%**        | 6.39%                 | 1.09%               | 24             |
| 6      | **134.17%**        | 8.97%                 | 1.21%               | 26             |

`ims-node-red` climbed past 100% CPU (i.e., pegging a full core, single-threaded JS event loop saturating) while `ims-timescaledb` stayed mostly under 10% and `ims-pgbouncer` stayed under 2%. PG connection count only grew from 21 to 26. **This conclusively places the bottleneck in Node-RED's own compute capacity, not PostgreSQL/TimescaleDB and not PgBouncer's pooling** -- the database layer had substantial headroom throughout. This directly supports the instruction to not add a broker: the constraint isn't ingestion-path infrastructure, it's the single ingestion process's CPU. A fix, if pursued, should target Node-RED (horizontal scaling with multiple instances, or reducing the walker-fork pattern's per-request overhead), not the data layer.

## New finding: a concurrency race condition in the Phase A1 cycle-gate, surfaced only under scale-test conditions

Checking data integrity on the scale-test's own writes surfaced something real and unexpected: **74.4%** of `sys_metrics` rows written by `E2E-SERVER-*` devices during this test share a `(device_id, time)` pair with other rows (13,821 of 18,589). This looked, at first glance, like the Phase A1 duplicate-insert bug regressing -- it is not. Inspected one group in full:

```text
device_id      | time                           | cpu | ram   | disk   | temp | ingest_ts
E2E-SERVER-034 | 2026-08-15 05:06:16.799119+00  | 83.75 | 15360 | 476.84 | 92 | 05:06:16.7999
E2E-SERVER-034 | 2026-08-15 05:06:16.799119+00  | 0     | 0     | 0      | 0  | 05:06:16.800234
E2E-SERVER-034 | 2026-08-15 05:06:16.799119+00  | 0     | 15360 | 476.84 | 92 | 05:06:16.800256
E2E-SERVER-034 | 2026-08-15 05:06:16.799119+00  | 83.75 | 0     | 0      | 0  | 05:06:16.800266
E2E-SERVER-034 | 2026-08-15 05:06:16.799119+00  | 83.75 | 15360 | 476.84 | 92 | 05:06:16.800274
E2E-SERVER-034 | 2026-08-15 05:06:16.799119+00  | 83.75 | 15360 | 476.84 | 92 | 05:06:16.800281
E2E-SERVER-034 | 2026-08-15 05:06:16.799119+00  | 83.75 | 15360 | 476.84 | 92 | 05:06:16.800292
E2E-SERVER-034 | 2026-08-15 05:06:16.799119+00  | 83.75 | 15360 | 476.84 | 92 | 05:06:16.800308
```

All 8 `ingest_ts` values land within **~1.4 milliseconds** of each other -- these are near-simultaneous, not 10-30 seconds apart. Not byte-identical either (rules out a fan-in regression, which would show 8 identical rows) -- there's a mix of complete rows (cpu+ram+disk+temp all populated) and partial/zeroed rows, consistent with the `isEmpty` per-walker-type branches firing inconsistently under load.

**Root cause (design-level, not yet fixed)**: `sre_parser`'s cycle-gate (`flow.get(cycleKey) || {}; cycle[walkerType] = true; ...; flow.set(cycleKey, cycle)`) is a read-modify-write on shared `flow` context, not an atomic operation. Node-RED's walker nodes make real (async) SNMP calls to `snmpsim`, so their completion order across concurrent requests isn't guaranteed. Under real fleet conditions (10 devices, naturally staggered ~30s polls with real network latency between them), two polling cycles for the _same_ device essentially never overlap in-flight -- so this race window never opens. Under k6's synthetic load (500 concurrent VUs, each re-injecting the same device every 1-4 seconds, all hitting the same Node-RED process), multiple polling cycles for the same device _do_ overlap, and the non-atomic read-modify-write can let two overlapping cycles both observe "all three walker types have reported" and both push a row.

**This does not invalidate the P0 data-integrity findings** -- those were measured against the real fleet's actual 4-device, 30s-cadence operation, and remain valid (0% duplicate rate holds there, unaffected by this test). It's a genuine, separate discovery: a latent robustness gap in the Phase A1 fix that only matters if per-device poll concurrency ever increases substantially -- exactly the kind of thing scale testing is supposed to surface that normal operation wouldn't.

**Not fixed in this pass.** Per the standing discipline (one fix at a time, no bundling), this needs its own approved fix cycle -- candidate approaches: a proper lock/mutex around the cycle-gate's read-modify-write (Node-RED doesn't have a built-in primitive for this; would need a small counter-based or promise-queue pattern), or restructuring to accumulate walker results by a per-cycle correlation ID instead of overwriting shared per-device state.

## Other required metrics

| Metric                                 | Result                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Out-of-order rows (`ingest_ts < time`) | 0, across all 5 tiers                                                                                                                                                                                                                                                                                       |
| Future timestamps                      | 0                                                                                                                                                                                                                                                                                                           |
| Dropped rows                           | Not directly measured -- `pipeline_errors` counter (287 at tier 5) is the closest proxy: HTTP-level failures, not confirmed as DB-level drops specifically                                                                                                                                                  |
| Late rows                              | Not measured -- would need a defined "late" threshold not established elsewhere in this program                                                                                                                                                                                                             |
| API latency (Grafana/alarm-api)        | **Not measured in this pass** -- `tests/k6/grafana-query-stress.js` exists for this and wasn't run here; this test exercised the ingest path only                                                                                                                                                           |
| Dashboard load latency                 | **Not measured in this pass** -- same reason                                                                                                                                                                                                                                                                |
| PgBouncer pool stats (`SHOW POOLS`)    | **Not reachable** from this environment (connection refused on the expected admin port/path from both the timescaledb and pgbouncer containers) -- used `pg_stat_activity` count + `pgbouncer` container CPU as a practical proxy instead, noted as a real methodology limitation, not silently substituted |

## Scale ceiling

**Confirmed reliable through 250 devices** (100% success, though with real latency degradation starting around there). **Degraded but still mostly functional at 500** (96.32% success). Actual ceiling for "acceptably reliable" sits somewhere between 250 and 500 devices with the current single Node-RED process -- not pinned more precisely than that in this pass (would need intermediate tiers, e.g. 350/400, to narrow further). No architecture change proposed here -- per the instruction, that's only warranted once evidence proves the current architecture can't meet a specific target, and no target beyond "prove the current architecture first" was set for this pass.
