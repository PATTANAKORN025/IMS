-- Migration 009: Fleet Health view + CAGG retention policy
-- Idempotent — safe to re-run

-- 1. v_fleet_health: per-machine snapshot from raw telemetry (last 5 min)
CREATE OR REPLACE VIEW public.v_fleet_health AS
SELECT DISTINCT ON (m.machine_id)
    m.machine_id,
    ROUND((m.cpu_load_percent)::NUMERIC, 1) AS cpu_pct,
    ROUND((m.ram_used_mb / NULLIF(m.ram_total_mb, 0) * 100)::NUMERIC, 1) AS ram_pct,
    ROUND((m.disk_used_gb / NULLIF(m.disk_total_gb, 0) * 100)::NUMERIC, 1) AS disk_pct,
    ROUND(m.temp_c::NUMERIC, 0) AS temp_c,
    CASE
        WHEN m.cpu_load_percent > 90 OR m.ram_used_mb / NULLIF(m.ram_total_mb, 0) * 100 > 95
             OR m.disk_used_gb / NULLIF(m.disk_total_gb, 0) * 100 > 90 THEN 0
        WHEN m.cpu_load_percent > 80 OR m.ram_used_mb / NULLIF(m.ram_total_mb, 0) * 100 > 85
             OR m.disk_used_gb / NULLIF(m.disk_total_gb, 0) * 100 > 80 THEN 50
        ELSE 100
    END AS health_score,
    m.time
FROM public.machine_telemetry m
WHERE m.time > NOW() - INTERVAL '5 minutes'
ORDER BY m.machine_id, m.time DESC;

-- 2. Composite fleet score view (single-row aggregation)
CREATE OR REPLACE VIEW public.v_fleet_score AS
SELECT 'Fleet Score' AS metric,
       ROUND(AVG(health_score)::NUMERIC, 1) AS value
FROM public.v_fleet_health;

-- 3. CAGG retention — prevent infinite growth of continuous aggregates
SELECT add_retention_policy('telemetry_minute_summary', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('telemetry_hourly_summary', INTERVAL '90 days', if_not_exists => TRUE);
