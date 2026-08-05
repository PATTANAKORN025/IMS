-- Migration 047: scope v_fleet_health/v_fleet_score to real servers only
--
-- Same bug class the audit fork found and fixed directly in NOC Overview's
-- CPU/RAM/Temperature panels: sys_metrics has a permanent zero-stub row per
-- LDI machine (device_type='ldi') alongside the 2 real servers
-- (device_type='server'). v_fleet_health joined sys_metrics to devices with
-- no device_type filter, so "Fleet Health Score" was averaging in 10
-- LDI zero-stubs against 2 real server readings -- diluting the number
-- toward whatever the stubs contribute, not a real infrastructure signal.
--
-- Part of "definitively separate NOC Infrastructure from Manufacturing":
-- this view backs NOC Overview's Fleet Health Score, which is meant to be
-- a pure server/infra metric.
CREATE OR REPLACE VIEW public.v_fleet_health AS
SELECT DISTINCT ON (d.device_id)
    d.device_id AS machine_id,
    ROUND((s.cpu_load_percent)::NUMERIC, 1) AS cpu_pct,
    ROUND((s.ram_used_mb / NULLIF(s.ram_total_mb, 0) * 100)::NUMERIC, 1) AS ram_pct,
    ROUND((s.disk_used_gb / NULLIF(s.disk_total_gb, 0) * 100)::NUMERIC, 1) AS disk_pct,
    ROUND(s.temp_c::NUMERIC, 0) AS temp_c,
    GREATEST(0, 100
        - GREATEST(0, s.cpu_load_percent - 70) * 1.5
        - GREATEST(0, (s.ram_used_mb / NULLIF(s.ram_total_mb, 0) * 100) - 75) * 2
        - GREATEST(0, (s.disk_used_gb / NULLIF(s.disk_total_gb, 0) * 100) - 80) * 2
    )::NUMERIC(5,1) AS health_score,
    s.time
FROM public.sys_metrics s
JOIN public.devices d ON d.device_id = s.device_id
WHERE s.time > NOW() - INTERVAL '5 minutes'
  AND d.device_type = 'server'
  AND d.enabled = true
ORDER BY d.device_id, s.time DESC;

CREATE OR REPLACE VIEW public.v_fleet_score AS
SELECT 'Fleet Score' AS metric, ROUND(AVG(health_score)::NUMERIC, 1) AS value
FROM public.v_fleet_health;
