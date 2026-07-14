-- ══════════════════════════════════════════════════════════════
-- Migration 017: Predictive Capacity Planning View (Formatted)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_disk_forecast AS
WITH
    daily_stats AS (
        SELECT
            device_id,
            AVG(avg_disk_used)    AS disk_used,
            AVG(avg_disk_total)   AS disk_total,
            EXTRACT(EPOCH FROM time_bucket('1 day', bucket)) / 86400 AS day_num
        FROM
            public.sys_hourly
        WHERE
            bucket > NOW() - INTERVAL '30 days'
            AND avg_disk_total > 0
        GROUP BY
            device_id,
            time_bucket('1 day', bucket)
    ),
    regression AS (
        SELECT
            device_id,
            COALESCE(regr_slope(disk_used, day_num), 0::DOUBLE PRECISION)   AS slope,
            COALESCE(regr_intercept(disk_used, day_num), 0::DOUBLE PRECISION) AS intercept,
            MAX(disk_used)  AS current_usage,
            MAX(disk_total) AS total_gb,
            COUNT(*)        AS data_points
        FROM
            daily_stats
        GROUP BY
            device_id
        HAVING
            COUNT(*) >= 7
    ),
    forecast AS (
        SELECT
            device_id,
            ROUND(current_usage::NUMERIC, 2) AS current_usage_gb,
            ROUND(total_gb::NUMERIC, 2)      AS total_gb,
            ROUND(COALESCE(slope, 0)::NUMERIC, 4) AS daily_growth_gb,
            CASE
                WHEN COALESCE(slope, 0) <= 0 THEN NULL
                WHEN total_gb <= current_usage THEN 0
                ELSE LEAST(
                    ROUND(((total_gb - current_usage) / slope)::NUMERIC, 0),
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
        FROM
            regression
    )
SELECT *
FROM forecast
ORDER BY days_until_full NULLS LAST, device_id;

COMMENT ON VIEW public.v_disk_forecast IS
    'Predictive capacity planning: linear regression forecast of disk exhaustion. Uses day-index (not epoch) for stable slope. Bounded to 10-year max forecast.';
