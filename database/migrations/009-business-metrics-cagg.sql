-- Masterpiece Polish #2: time_bucket_gapfill for smooth time-series
-- and business_metrics_hourly CAGG for pre-calculated business logic

-- ============================================================
-- GAPFILL helper: Replace direct queries with gapfilled versions
-- This is a reference — actual Grafana queries need $__interval and $__timeFilter
-- ============================================================

-- Example: Gapfilled CPU query for Grafana (use in panel rawSql):
-- SELECT
--   time_bucket_gapfill($__interval, bucket) AS time,
--   machine_id,
--   locf(avg(avg_cpu_load)) AS avg_cpu_load
-- FROM public.telemetry_minute_summary
-- WHERE $__timeFilter(bucket) AND machine_id = '${machine_id}'
-- GROUP BY time_bucket_gapfill($__interval, bucket), machine_id
-- ORDER BY 1

-- ============================================================
-- Business Metrics CAGG: Pre-calculated OEE, Power Cost, Yield Risk
-- ============================================================

-- 1. OEE (Overall Equipment Effectiveness)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.business_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  machine_id,
  -- Power Cost (THB/day) = avg_watts * 24 * 4.5 / 1000
  ROUND((AVG(ldi_power) * 24 * 4.5 / 1000)::NUMERIC, 2) AS power_cost_thb,
  -- Yield Risk: % of readings where PE or JE outside tolerance
  ROUND((100.0 * SUM(CASE WHEN ABS(ldi_pe) > 10 OR ABS(ldi_je) > 10 THEN 1 ELSE 0 END)
    / NULLIF(COUNT(*), 0))::NUMERIC, 1) AS yield_risk_pct,
  -- Average throughput
  ROUND(AVG(ldi_throughput)::NUMERIC, 2) AS avg_throughput,
  -- OEE = Availability * Performance * Quality
  CASE
    WHEN AVG(ldi_throughput) = 0 THEN 0
    ELSE ROUND((
      (AVG(ldi_throughput) / NULLIF(MAX(ldi_throughput), 0)) *
      (1 - (AVG(ldi_pe) + AVG(ldi_je)) / 200) * 100
    )::NUMERIC, 1)
  END AS oee_pct
FROM public.machine_telemetry
WHERE ldi_pe IS NOT NULL OR ldi_power IS NOT NULL
GROUP BY time_bucket('1 hour', time), machine_id
WITH NO DATA;

-- 2. Refresh policy for business_metrics_hourly
SELECT add_continuous_aggregate_policy('business_metrics_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

-- 3. Compression policy
ALTER MATERIALIZED VIEW public.business_metrics_hourly SET (timescaledb.compress,
  timescaledb.compress_segmentby = 'machine_id',
  timescaledb.compress_orderby = 'bucket'
);
SELECT add_compression_policy('business_metrics_hourly', INTERVAL '7 days');
