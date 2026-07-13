-- ══════════════════════════════════════════════════════════════
-- Migration 017: Predictive Capacity Planning View
-- Uses PostgreSQL linear regression to forecast disk exhaustion
-- ══════════════════════════════════════════════════════════════

-- ── Disk Exhaustion Forecast ────────────────────────────
-- For each device, computes linear regression over last 30 days of
-- daily disk usage, then projects when disk_used_gb will reach disk_total_gb.
--
-- Uses PostgreSQL's built-in regr_slope() / regr_intercept() aggregate functions
-- (available since PG 8.3, stable in PG 16).
--
-- Output: device_id, current_usage_gb, total_gb, daily_growth_gb,
--         days_until_full, projected_full_date

CREATE OR REPLACE VIEW public.v_disk_forecast AS
WITH daily_stats AS (
    SELECT
        device_id,
        bucket AS day,
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
        -- Linear regression: y = slope * x + intercept
        -- x = day number (0..29), y = disk_used_gb
        regr_slope(disk_used, EXTRACT(EPOCH FROM day)) AS slope,
        regr_intercept(disk_used, EXTRACT(EPOCH FROM day)) AS intercept,
        MAX(disk_used) AS current_usage,
        MAX(disk_total) AS total_gb,
        COUNT(*) AS data_points
    FROM daily_stats
    GROUP BY device_id
    HAVING COUNT(*) >= 7  -- Need at least 7 days of data for meaningful regression
),
forecast AS (
    SELECT
        device_id,
        ROUND(current_usage::numeric, 2) AS current_usage_gb,
        ROUND(total_gb::numeric, 2) AS total_gb,
        -- slope is in GB per epoch-second; convert to GB per day
        ROUND((slope * 86400)::numeric, 4) AS daily_growth_gb,
        CASE
            WHEN slope <= 0 THEN NULL  -- Not growing or shrinking
            WHEN total_gb <= current_usage THEN 0  -- Already full
            ELSE ROUND(((total_gb - current_usage) / (slope * 86400))::numeric, 0)
        END AS days_until_full,
        CASE
            WHEN slope <= 0 THEN NULL
            WHEN total_gb <= current_usage THEN NOW()
            ELSE NOW() + ((total_gb - current_usage) / (slope * 86400)) * INTERVAL '1 day'
        END AS projected_full_date,
        data_points
    FROM regression
)
SELECT * FROM forecast
ORDER BY days_until_full NULLS LAST, device_id;

COMMENT ON VIEW public.v_disk_forecast IS
    'Predictive capacity planning: linear regression forecast of disk exhaustion based on 30-day daily CAGG trend. Requires 7+ days of data.';
