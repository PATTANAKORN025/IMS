-- ============================================================================
-- Migration 091: merge ldi_data's legacy sub-day chunks into one per day
--
-- ldi_data ran with a 1-hour chunk interval until 2026-09-24 and 1 day since,
-- which left ~196 one-hour chunks (most of them compressed) for one month of
-- data. Any query on ldi_data that the planner cannot narrow by time at plan
-- time (MAX("time") over the table, the "full dataset scope" readiness and
-- snapshot panels, the alarm/telemetry joins) opens every chunk while
-- planning: about 1.1 s of planning per query, against single-digit
-- milliseconds of execution. Grafana sends those queries on every refresh.
--
-- merge_chunks() rewrites each run of adjacent sub-day chunks within one UTC
-- day into a single chunk. Rows, compression state and the hypertable's
-- policies are unchanged. A day with gaps (hours without a chunk) becomes one
-- chunk per contiguous run, since only adjacent chunks can be merged.
--
-- Measured on a restored copy of the live database: 203 -> 38 chunks,
-- planning of SELECT MAX("time") FROM ldi_data 1131 ms -> 138 ms, row count
-- and a per-row hash over the merged range identical, 20 s runtime.
--
-- Each merge commits on its own, so this must not run inside a transaction
-- (the migration runner does not wrap files). Locks: each merge holds an
-- exclusive lock on the chunks of one day for well under a second; the
-- current day's chunk, the one ingestion writes to, is never touched.
-- Idempotent: once merged there are no adjacent sub-day runs left, and on a
-- fresh install (1-day chunks only) the loop finds nothing.
-- ============================================================================

DO $$
DECLARE
  r record;
  merged int := 0;
BEGIN
  FOR r IN
    WITH c AS (
      SELECT format('%I.%I', chunk_schema, chunk_name)::regclass AS rel,
             range_start, range_end, range_start::date AS d
        FROM timescaledb_information.chunks
       WHERE hypertable_schema = 'public'
         AND hypertable_name = 'ldi_data'
         AND range_end - range_start < interval '1 day'
         AND range_end <= date_trunc('day', now())
    ), runs AS (
      SELECT *,
             sum(CASE WHEN range_start = prev_end AND d = prev_d THEN 0 ELSE 1 END)
               OVER (ORDER BY range_start) AS run
        FROM (SELECT *, lag(range_end) OVER (ORDER BY range_start) AS prev_end,
                        lag(d) OVER (ORDER BY range_start) AS prev_d
                FROM c) x
    )
    SELECT array_agg(rel ORDER BY range_start) AS rels
      FROM runs
     GROUP BY run
    HAVING count(*) > 1
  LOOP
    CALL public.merge_chunks(r.rels);
    merged := merged + 1;
    COMMIT;
  END LOOP;
  RAISE NOTICE 'ldi_data: merged % runs of sub-day chunks', merged;
END $$;
