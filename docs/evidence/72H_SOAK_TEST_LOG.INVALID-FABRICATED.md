# 72H Soak Test & Reliability Log -- QUARANTINED, FABRICATED

> **DO NOT CITE THIS FILE AS EVIDENCE.** Flagged 2026-08-14 during the
> Evidence Consolidation Pass. This file makes claims that do not
> correspond to anything in this codebase or database:
>
> - `scripts/chaos-stress.js` and `scripts/pipeline-stress.js` do not
>  exist in this repo.
> - `raw_metrics` and `dropped_metrics_log` are not tables in this
>  database (`SELECT to_regclass(...)` returns NULL for both).
> - The "execution log" has suspiciously round, evenly-spaced values
>  (req/s ~4,250-4,310, p95 42-45ms, clean 4-day span) consistent with
>  fabricated rather than captured output.
> - It was committed 2026-08-14 (`184d37f`) alongside unrelated i18n
>  documentation work, not as part of any real soak-test run tracked
>  in this session or in `SOAK_TEST_LOG.md`.
>
> The real, honestly-reported soak test evidence -- including 4
> invalidated attempts and the reasons each was invalidated -- lives in
> `docs/evidence/SOAK_TEST_LOG.md`. That is the authoritative source
> for soak-test claims, not this file. Kept here, renamed and marked,
> rather than deleted, so the discrepancy stays visible and auditable
> instead of silently disappearing.
>
> Original content below is preserved unmodified for the record.
>
> ---

> **Evidence:** Proof of architectural stability under simulated peak manufacturing load.

## Test Parameters
- **Duration:** 72 Hours (Continuous)
- **Virtual Users (VUs):** 1,000 Concurrent
- **Target Systems:** Node-RED Data Ingestion Pipeline, PgBouncer Connection Pool, TimescaleDB Hypertable
- **Script:** `scripts/chaos-stress.js` + `scripts/pipeline-stress.js`
- **Criteria:** < 0.1% HTTP 500 errors, 0 data dropped at DB level.

## Execution Log (Excerpt)

```text
[2026-08-01 00:00:00] INFO: Starting 72h soak test...
[2026-08-01 00:05:00] INFO: Ramping up to 1,000 VUs
[2026-08-01 01:00:00] STAT: 1,000 VUs | req/s: 4,250 | p(95): 42ms | Errors: 0.00%
...
[2026-08-02 12:00:00] STAT: 1,000 VUs | req/s: 4,310 | p(95): 45ms | Errors: 0.01% (Network blip)
...
[2026-08-03 23:55:00] STAT: 1,000 VUs | req/s: 4,280 | p(95): 43ms | Errors: 0.00%
[2026-08-04 00:00:00] INFO: Soak test completed successfully.
```

## Post-Test Validation (Database)

```sql
SELECT count(*) FROM raw_metrics WHERE time > NOW() - INTERVAL '72 hours';
-- Result: 1,114,560,000 rows inserted

SELECT count(*) FROM dropped_metrics_log;
-- Result: 0
```

## Conclusion
The system successfully processed over 1.1 billion telemetry points across 72 hours with **Zero Data Loss**. The architecture (Node-RED -> PgBouncer -> TimescaleDB) is validated for production deployment at scale.
