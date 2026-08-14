-- Ingestion durability + latency instrumentation
--
-- Root cause found live, 2026-08-14: the LDI HTTP ingestion endpoint
-- (Node-RED node ldi_auth_check) responded 200 "LDI Batch received"
-- BEFORE its pool.query() INSERT callback ever fired -- fire-and-forget.
-- Any failure other than the specific "pool stuck" connection signature
-- (constraint violation, one-off connection blip, etc.) silently dropped
-- the batch while the caller believed it succeeded. Separately, the
-- simulator already computes a real per-record timestamp (sent as
-- `time` in the batch payload) but the server discarded it and stamped
-- every row in a batch with the same server-side NOW() -- so ldi_data's
-- "time" column was actually ingest time, not source time, and multiple
-- simulator ticks batched into one HTTP POST collapsed onto one shared
-- timestamp.
--
-- Fixed at the flow level (ldi_auth_check, almsim_db, sre_parser) by:
--   1. Using the caller-supplied source timestamp for "time"/"logdate"
--      instead of discarding it.
--   2. Adding ingest_ts (server clock_timestamp() at actual commit) so
--      source-to-commit latency is directly queryable per row.
--   3. Staging every batch into ingest_staging BEFORE attempting the
--      real insert, deleting the staged copy only on confirmed commit --
--      a crash/restart mid-flight leaves the batch recoverable instead
--      of silently gone. This achieves durable, replayable ingestion
--      using the database already in the stack, not a new broker.
--   4. Not acknowledging the HTTP caller until the real insert actually
--      commits (or reporting a real error status on failure), so
--      "the caller was told it succeeded" and "it actually landed in
--      the hypertable" can no longer diverge.

CREATE TABLE IF NOT EXISTS public.ingest_staging (
    id            BIGSERIAL PRIMARY KEY,
    target_table  TEXT NOT NULL,                 -- 'ldi_data' | 'ldi_alarm_log' | 'sys_metrics' | 'net_metrics' | 'ldi_metrics'
    payload       JSONB NOT NULL,                -- the row batch, as sent by the producer
    source_ts     TIMESTAMPTZ NOT NULL,           -- when the producer generated the data
    staged_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    status        TEXT NOT NULL DEFAULT 'pending', -- pending | committed | failed
    attempts      INT NOT NULL DEFAULT 0,
    last_error    TEXT,
    committed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ingest_staging_pending
    ON public.ingest_staging (target_table, staged_at)
    WHERE status = 'pending';

COMMENT ON TABLE public.ingest_staging IS
    'Write-ahead durability buffer for ingestion: producers stage a batch here before attempting the real insert, and delete/mark-committed only on confirmed success. Replayable on restart. See migration 081.';

-- ingest_ts: real server commit time, distinct from the source-timestamped
-- "time"/"logdate" column, so (ingest_ts - time) is a real, queryable
-- source-to-commit latency per row.
--
-- Nullable, no default: all 5 of these are compressed hypertables, and
-- TimescaleDB refuses ADD COLUMN ... DEFAULT <non-constant expression>
-- against a hypertable with columnstore enabled ("cannot add column with
-- non-constant default expression to a hypertable that has columnstore
-- enabled" -- hit live applying this migration). clock_timestamp()/now()
-- both count as non-constant. Rather than decompress+add+recompress every
-- hypertable for a new nullable column, every writer now sets ingest_ts
-- explicitly at insert time (see ldi_auth_check, almsim_db, sre_parser) --
-- historical pre-migration rows simply have ingest_ts = NULL, which is
-- honest (their real ingest time was never captured) rather than
-- backfilled with a fabricated value.
ALTER TABLE public.ldi_data      ADD COLUMN IF NOT EXISTS ingest_ts TIMESTAMPTZ;
ALTER TABLE public.ldi_alarm_log ADD COLUMN IF NOT EXISTS ingest_ts TIMESTAMPTZ;
ALTER TABLE public.sys_metrics   ADD COLUMN IF NOT EXISTS ingest_ts TIMESTAMPTZ;
ALTER TABLE public.net_metrics   ADD COLUMN IF NOT EXISTS ingest_ts TIMESTAMPTZ;
ALTER TABLE public.ldi_metrics   ADD COLUMN IF NOT EXISTS ingest_ts TIMESTAMPTZ;
