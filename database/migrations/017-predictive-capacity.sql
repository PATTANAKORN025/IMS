-- ══════════════════════════════════════════════════════════════
-- Migration 017: Predictive Capacity Planning View (FIXED)
-- Uses day-index (0..N) instead of epoch seconds for regression
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_disk_forecast AS
WITH daily_stats AS (
    SELECT
        device_id,
        bucket AS day,
        -- Row number gives us day-index 0..N (not epoch seconds!)
        ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY bucket) - 1 AS day_idx,
        AVG(avg_disk_used) AS disk_used,
        AVG(avg_disk_total) AS disk_total
    FROM public.sys_daily
    WHERE bucket > NOW() - INTERVAL '30 days'
      AND avg_disk_total > 0
    GROUP BY device_id, bucket
),
regression AS (
    SELECT
        device_id,
        -- Slope is now in GB per day (not GB per epoch-second!)
        regr_slope(disk_used, day_idx) AS slope,
        regr_intercept(disk_used, day_idx) AS intercept,
        MAX(disk_used) AS current_usage,
        MAX(disk_total) AS total_gb,
        MAX(day_idx) AS max_day_idx,
        COUNT(*) AS data_points
    FROM daily_stats
    GROUP BY device_id
    HAVING COUNT(*) >= 7
),
forecast AS (
    SELECT
        device_id,
        ROUND(current_usage::numeric, 2) AS current_usage_gb,
        ROUND(total_gb::numeric, 2) AS total_gb,
        -- Slope is already GB/day — no multiplication needed
        ROUND(COALESCE(slope, 0)::numeric, 4) AS daily_growth_gb,
        CASE
            WHEN COALESCE(slope, 0) <= 0 THEN NULL
            WHEN total_gb <= current_usage THEN 0
            -- days_until_full = remaining / daily_growth
            -- Bounded to max 3650 days (10 years) to prevent absurd forecasts
            ELSE LEAST(
                ROUND(((total_gb - current_usage) / slope)::numeric, 0),
                3650
            )
        END AS days_until_full,
        CASE
            WHEN COALESCE(slope, 0) <= 0 THEN NULL
            WHEN total_gb <= current_usage THEN NOW()
            ELSE NOW() + LEAST(
                ((total_gb - current_usage) / slope),
                3650
            ) * INTERVAL '1 day'
        END AS projected_full_date,
        data_points
    FROM regression
)
SELECT * FROM forecast
ORDER BY days_until_full NULLS LAST, device_id;

COMMENT ON VIEW public.v_disk_forecast IS
    'Predictive capacity planning: linear regression forecast of disk exhaustion. Uses day-index (not epoch) for stable slope. Bounded to 10-year max forecast.';
