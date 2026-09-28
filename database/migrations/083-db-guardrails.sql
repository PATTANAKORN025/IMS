-- 083: guardrails for the shared database server.
--
-- Why: on 2026-09-24 two LDI alert rules evaluated public.v_machine_spc_ranking
-- every 5 minutes, each run took over 40 s, and the runs piled up until the
-- server thrashed and refused connections ("sorry, too many clients already").
-- EXPLAIN ANALYZE showed the cause was JIT, not I/O: thousands of functions
-- compiled for a small query that returns 0 rows. With jit off the same query
-- runs in well under a second. jit=off itself is a server setting (docker-compose.yaml
-- -c jit=off, plus ALTER SYSTEM on the running server); this file holds the
-- per-role and per-database parts.

-- A dashboard or alert query that runs away is cancelled instead of piling up.
-- The heaviest VCP board at 30 days under 3 concurrent viewers took 38 s.
ALTER ROLE grafana_reader SET statement_timeout = '60s';

-- eap_backup was left with timescaledb.restoring=on after a pg_restore. The
-- setting belongs only inside timescaledb_pre_restore()/timescaledb_post_restore();
-- left on, it disables TimescaleDB's planner hooks and job scheduler for that
-- database. The database exists only where the VCP backup was restored.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_database WHERE datname = 'eap_backup') THEN
        EXECUTE 'ALTER DATABASE eap_backup RESET timescaledb.restoring';
    END IF;
END
$$;

-- ldi_alarm_log cannot be compressed: ldi_alarm_lifecycle (operator acknowledge
-- and resolve) holds a foreign key into it, and compress_chunk() fails with
-- "found a FK into a chunk while truncating". The columnstore job failed on every
-- run. The table is small, so compression buys nothing; the foreign key keeps the
-- operator record consistent, so the policy goes and the key stays.
SELECT remove_compression_policy('public.ldi_alarm_log', if_exists => true);

-- ldi_data was chunked by the hour: hundreds of tiny chunks. Every query plans
-- across all of them (over a second of planning for the RCA truth test) and a
-- per-row lookup pays chunk exclusion once per row. One day per chunk suits this
-- volume. This applies to new chunks only; the hourly ones age out under the
-- 180-day retention policy.
SELECT set_chunk_time_interval('public.ldi_data', INTERVAL '1 day');

-- The RCA truth test looks up the telemetry around each of thousands of alarms. With
-- ChunkAppend each lookup re-runs chunk exclusion over every ldi_data chunk, and
-- the refresh took 13-15 s every minute; without it the same query returns the
-- same rows in about 6 s. SET LOCAL ends with the job's transaction.
CREATE OR REPLACE PROCEDURE public.refresh_spc_fleet_rca_mvs(job_id INT, config JSONB)
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_machine_spc_fleet;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_ldi_rca_recent_window;
    SET LOCAL timescaledb.enable_chunk_append = off;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_ldi_rca_truth_test;
END;
$$;
