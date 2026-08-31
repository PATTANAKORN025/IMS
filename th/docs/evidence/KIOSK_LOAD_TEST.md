> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Isolated Kiosk/Dashboard-Refresh Load Test

Run: 2026-08-21, `bash scripts/kiosk-load-test.sh 10 20 50 100`. HEAD at time of test: `71f73a8`.

## Why isolated infrastructure, not `ims_dr_test`

Prior audits measured 1 kiosk (~91ms) and 6 kiosks (~370-524ms) for real against the live stack. 15/20+
kiosk numbers were **reasoned, not measured** -- flagged explicitly as not real evidence. This run measures
them for real, without that caveat, and without touching the live shared environment.

`scripts/dr-test.sh`'s `ims_dr_test` throwaway database lives in the *same* `ims-timescaledb` container as
live `ims` -- fine for structural verification, but not for load testing, since two databases in one
Postgres instance still share CPU, `shared_buffers`, WAL, and disk I/O. A real concurrency test there could
have degraded the live simulator/dashboards. `scripts/kiosk-load-test.sh` instead starts a brand new,
disposable `timescale/timescaledb:2.29.0-pg16` container with **no network attachment to the app stack and
no host port published** (reachable only via `docker exec`), restores a fresh `pg_dump` of live `ims` into
it using the same `timescaledb_pre_restore()`/`timescaledb_post_restore()` + hypertable-FK-repair sequence
proven in `scripts/dr-test.sh` (`fix(dr): repair TimescaleDB backup/restore`, commit `a27ae65`), runs the
load entirely against that container, then destroys it (container + anonymous volume) on exit.

## What's under test

The real Action Queue panel SQL (Alarm Console / Operator Andon dashboards) -- the exact query PHASE 1 of
the DB planning-bottleneck fix (commit landed via `c7a394a`) targeted, and what a kiosk's `refresh: "5s"`
cycle actually re-runs. Each "kiosk" = one concurrent connection firing this query once; a level = that many
kiosks firing simultaneously (worst case: every kiosk's refresh timer lands on the same tick).

## Results (real numbers, 0 fabricated, 0 query failures at any level)

| Kiosks | Completed | Failed | min | p50 | p95 | p99 | max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10/10 | 0 | 247ms | 293ms | 307ms | 307ms | 307ms |
| 20 | 20/20 | 0 | 464ms | 589ms | 638ms | 638ms | 638ms |
| 50 | 50/50 | 0 | 1147ms | 1942ms | 2094ms | 2126ms | 2126ms |
| 100 | 100/100 | 0 | 2607ms | 3703ms | 4344ms | 4450ms | 4450ms |

Raw per-query timings: `scripts/dr-test-reports/loadtest-{10,20,50,100}-times-20260821T033749Z.txt`
(gitignored, kept locally as the underlying evidence for the table above).

## Reading this honestly

- **Zero query failures at any level.** No timeouts, no errors, no dropped connections up to 100 fully
  synchronized concurrent kiosks.
- **Latency scales up with concurrency, roughly linearly** -- expected for a single-container, CPU-bound
  query workload with no read replica and no connection pooler in front of it in this isolated setup.
- **This isolated container has no custom Postgres tuning** (`shared_buffers`, `work_mem`, etc.) --
  `docker-compose.yaml`'s `ims-timescaledb` service may be tuned differently. These numbers are a real,
  reproducible *scaling trend* on this specific isolated instance, not a claim about live production
  capacity under its actual resource allocation -- that would need the same test run with matching tuning,
  not asserted here without evidence.
- **100-kiosk p50 (3.7s) approaches the panel's own 5s refresh interval**; p99 (4.45s) is close enough to it
  that a slower moment could miss a refresh cycle. This is a genuine, disclosed capacity signal for a fully
  synchronized 100-kiosk worst case -- not a pass/fail gate this repo currently defines a threshold for, and
  not fixed here (no evidenced defect to fix; a real fix would be a product/infra decision -- staggered
  refresh, read replica, connection pooling -- out of scope for this test).
- Real-world kiosks refresh on independent timers, not perfectly synchronized, so this worst-case number is
  intentionally pessimistic versus typical production load -- disclosed here rather than smoothed over.

## Verdict

**Executed for real, isolated, non-destructive to live infrastructure.** 10/20/50 kiosks: clearly healthy
margin under the 5s refresh interval. 100 kiosks (fully synchronized worst case): functionally correct
(0 failures) but latency margin is thin against the refresh interval -- flagged as a capacity signal for
future kiosk fleet growth, not a blocking defect in current code.
