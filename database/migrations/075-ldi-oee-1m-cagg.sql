-- ══════════════════════════════════════════════════════════════
-- Migration 075: ldi_oee_1m — dedicated OEE continuous aggregate
-- ══════════════════════════════════════════════════════════════
-- The "Plant Overall OEE (%)" panel (ims-ldi-manufacturing.json) was
-- removed twice (see git history a13db95, 7e7434b) because it had nowhere
-- safe to query from:
--   - the first attempt queried ldi_data_1m (migration 043), which never
--     carried an availability/quality signal by deliberate design -- that
--     migration's own header explains a raw boolean `state` would average
--     away meaningfully at 1-minute resolution. True, but the fix isn't
--     "add state to ldi_data_1m", it's "add the pre-aggregated ratios OEE
--     actually needs" -- which is what this migration does, in a new,
--     dedicated CAGG rather than mutating the existing one.
--   - the fallback re-query against raw ldi_data scanned the full
--     dashboard-selected time range with no bound -- exactly the
--     range-scan-against-raw-table anti-pattern the CAGG tiers (see
--     docs/GRAFANA_DESIGN_SYSTEM.md §10) exist to prevent -- and it still
--     hit a "missing relation" error on top of that.
--
-- Why a NEW CAGG (ldi_oee_1m) instead of extending ldi_data_1m in place:
-- ldi_data_15m is built FROM ldi_data_1m (CAGG-on-CAGG, migration 044),
-- and TimescaleDB has no ALTER path for a continuous aggregate's defining
-- query -- changing ldi_data_1m means DROP + recreate, which cascades
-- into dropping ldi_data_15m (and anything built on that) too. OEE only
-- needs a handful of columns and doesn't need the mo/fpn/layer_name
-- grouping granularity the trend-panel CAGGs carry, so a small dedicated
-- aggregate is both safer (zero blast radius on the existing tier
-- hierarchy) and cheaper to refresh than widening the shared one.
--
-- Columns are plain FILTER/DISTINCT partial aggregates -- verified live
-- against this TimescaleDB instance (2.29.0) before writing this
-- migration that both CAGGs support them:
--   - running_count:  COUNT(*) FILTER (WHERE state = true) -- combines by
--     SUM across any re-aggregation window; paired with sample_count for
--     Availability = running_count / sample_count.
--   - in_spec_count:  COUNT(*) FILTER (WHERE the same GREATEST(ABS(pe_1..6))
--     <= pe_setting check the removed panel used per-row) -- a plain
--     filtered count, combines by SUM. Not the same problem as the
--     Cpk/StdDev exemption in query-budget-linter.js: Cpk needs raw signed
--     samples to compute variance; a pass/fail spec check only needs the
--     count of rows that passed, which a CAGG can carry directly.
--   - board_count:    COUNT(DISTINCT board_no) per (bucket, eqp_id).
--     Grouping only by eqp_id (not mo) matches the removed panel's own
--     GROUP BY eqp_id exactly, so this preserves its existing behavior
--     (and its existing limitation: a board_no that repeats across
--     different MOs on the same machine was already undercounted by the
--     original raw-table query the same way -- not a regression this
--     migration introduces).

CREATE MATERIALIZED VIEW IF NOT EXISTS public.ldi_oee_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', "time") AS bucket,
    eqp_id, factory,
    COUNT(*)                             AS sample_count,
    COUNT(*) FILTER (WHERE state = true) AS running_count,
    COUNT(*) FILTER (WHERE GREATEST(ABS(COALESCE(pe_1, 0)), ABS(COALESCE(pe_2, 0)), ABS(COALESCE(pe_3, 0)),
                                     ABS(COALESCE(pe_4, 0)), ABS(COALESCE(pe_5, 0)), ABS(COALESCE(pe_6, 0)))
                             <= pe_setting) AS in_spec_count,
    COUNT(DISTINCT board_no)             AS board_count
FROM public.ldi_data
GROUP BY bucket, eqp_id, factory
WITH NO DATA;

-- Refresh every minute; leave the last minute unaggregated (still settling),
-- same cadence as ldi_data_1m.
DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.ldi_oee_1m',
        start_offset      => INTERVAL '2 hours',
        end_offset        => INTERVAL '1 minute',
        schedule_interval => INTERVAL '1 minute',
        if_not_exists     => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Real-time aggregation, same reasoning as ldi_data_1m: panels reading
-- this CAGG shouldn't show data staler than the underlying ingestion lag.
ALTER MATERIALIZED VIEW public.ldi_oee_1m SET (timescaledb.materialized_only = false);

-- Same retention window as ldi_data_1m -- OEE is a rolling operational KPI,
-- not a long-term audit record (that's ldi_data/ldi_alarm_log's job).
SELECT add_retention_policy('public.ldi_oee_1m', INTERVAL '30 days', if_not_exists => true);
