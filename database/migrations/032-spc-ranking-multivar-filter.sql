-- ══════════════════════════════════════════════════════════════
-- Migration 032: v_machine_spc_ranking — multi-variable filtering
-- ══════════════════════════════════════════════════════════════
-- Exposes factory/mo/fpn/layer_name on v_machine_spc_ranking so Grafana
-- dashboards can filter SPC ranking by production context, not just eqp_id.
-- Grouping granularity moves from (eqp_id) to (eqp_id, factory, mo, fpn,
-- layer_name) — Cpk/Cpk(JE) are now computed per job/part/layer instead of
-- blending every job a machine has touched in the trailing 2h window.
-- Mirrors postgres/init/001-init-timescaledb.sql — keep in sync.

DROP VIEW IF EXISTS public.v_machine_spc_ranking CASCADE;
CREATE OR REPLACE VIEW public.v_machine_spc_ranking AS
WITH base AS (
    SELECT eqp_id, factory, mo, fpn, layer_name,
           GREATEST(ABS(COALESCE(pe_1,0)), ABS(COALESCE(pe_2,0)),
                     ABS(COALESCE(pe_3,0)), ABS(COALESCE(pe_4,0)),
                     ABS(COALESCE(pe_5,0)), ABS(COALESCE(pe_6,0))) AS max_pe,
           COALESCE(pe_setting, 25.0) AS pe_val,
           GREATEST(ABS(COALESCE(je_1,0)), ABS(COALESCE(je_2,0)),
                     ABS(COALESCE(je_3,0)), ABS(COALESCE(je_4,0))) AS max_je,
           COALESCE(je_setting, 25.0) AS je_val
    FROM public.ldi_data
    WHERE pe_1 IS NOT NULL
      AND COALESCE(pe_setting, 0) > 2.0
      AND "time" > (SELECT MAX("time") - INTERVAL '2 hours' FROM public.ldi_data)
),
pe_stats AS (
    SELECT eqp_id, factory, mo, fpn, layer_name,
           AVG(max_pe) AS mu, STDDEV(max_pe) AS sigma,
           AVG(pe_val) AS setting_val, COUNT(*) AS sample_count
    FROM base GROUP BY eqp_id, factory, mo, fpn, layer_name
),
je_stats AS (
    SELECT eqp_id, factory, mo, fpn, layer_name,
           AVG(max_je) AS mu, STDDEV(max_je) AS sigma,
           AVG(je_val) AS setting_val
    FROM base WHERE max_je > 0 GROUP BY eqp_id, factory, mo, fpn, layer_name
)
SELECT p.eqp_id, p.factory, p.mo, p.fpn, p.layer_name, p.sample_count,
       ROUND(p.mu::NUMERIC, 3) AS mean_pe,
       ROUND(p.sigma::NUMERIC, 3) AS stddev_pe,
       ROUND((p.setting_val * 2 / NULLIF(6 * p.sigma, 0))::NUMERIC, 3) AS cp,
       ROUND(LEAST((p.setting_val - p.mu) / NULLIF(3 * p.sigma, 0), (p.mu - (-p.setting_val)) / NULLIF(3 * p.sigma, 0))::NUMERIC, 3) AS cpk,
       CASE
           WHEN LEAST((p.setting_val - p.mu) / NULLIF(3 * p.sigma, 0), (p.mu - (-p.setting_val)) / NULLIF(3 * p.sigma, 0)) >= 2.0 THEN 'World Class'
           WHEN LEAST((p.setting_val - p.mu) / NULLIF(3 * p.sigma, 0), (p.mu - (-p.setting_val)) / NULLIF(3 * p.sigma, 0)) >= 1.67 THEN 'Excellent'
           WHEN LEAST((p.setting_val - p.mu) / NULLIF(3 * p.sigma, 0), (p.mu - (-p.setting_val)) / NULLIF(3 * p.sigma, 0)) >= 1.33 THEN 'Capable'
           WHEN LEAST((p.setting_val - p.mu) / NULLIF(3 * p.sigma, 0), (p.mu - (-p.setting_val)) / NULLIF(3 * p.sigma, 0)) >= 1.0 THEN 'Marginally Capable'
           ELSE 'Not Capable'
       END AS capability_class,
       ROUND(j.mu::NUMERIC, 3) AS mean_je,
       ROUND(j.sigma::NUMERIC, 3) AS stddev_je,
       ROUND((j.setting_val * 2 / NULLIF(6 * j.sigma, 0))::NUMERIC, 3) AS cp_je,
       ROUND(LEAST((j.setting_val - j.mu) / NULLIF(3 * j.sigma, 0), (j.mu - (-j.setting_val)) / NULLIF(3 * j.sigma, 0))::NUMERIC, 3) AS cpk_je,
       CASE
           WHEN LEAST((j.setting_val - j.mu) / NULLIF(3 * j.sigma, 0), (j.mu - (-j.setting_val)) / NULLIF(3 * j.sigma, 0)) >= 2.0 THEN 'World Class'
           WHEN LEAST((j.setting_val - j.mu) / NULLIF(3 * j.sigma, 0), (j.mu - (-j.setting_val)) / NULLIF(3 * j.sigma, 0)) >= 1.67 THEN 'Excellent'
           WHEN LEAST((j.setting_val - j.mu) / NULLIF(3 * j.sigma, 0), (j.mu - (-j.setting_val)) / NULLIF(3 * j.sigma, 0)) >= 1.33 THEN 'Capable'
           WHEN LEAST((j.setting_val - j.mu) / NULLIF(3 * j.sigma, 0), (j.mu - (-j.setting_val)) / NULLIF(3 * j.sigma, 0)) >= 1.0 THEN 'Marginally Capable'
           ELSE 'Not Capable'
       END AS capability_class_je
FROM pe_stats p
LEFT JOIN je_stats j ON p.eqp_id = j.eqp_id AND p.factory = j.factory AND p.mo = j.mo
    AND p.fpn = j.fpn AND p.layer_name = j.layer_name
WHERE p.sigma > 0 ORDER BY cpk DESC;
