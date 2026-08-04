-- ══════════════════════════════════════════════════════════════
-- Migration 041: v_machine_spc_ranking — fix JE starvation + Cpk
-- ══════════════════════════════════════════════════════════════
-- Two bugs in migration 032's v_machine_spc_ranking:
--
-- 1. JE starvation: je_stats was derived FROM base, which is filtered
--    on `pe_1 IS NOT NULL AND pe_setting > 2.0`. Any machine that only
--    reports JE (no PE) was excluded before je_stats ever saw it, so it
--    got zero quality metrics at all. pe_base/je_base are now independent
--    CTEs (each filtered on its own column), joined at the end with
--    FULL OUTER JOIN instead of LEFT JOIN so PE-only, JE-only, and
--    PE+JE machines all surface.
--
-- 2. Mislabeled Cpk: mu/sigma were computed from max_pe = GREATEST(ABS(...)),
--    an always-nonnegative quantity, then fed into a two-sided
--    LEAST((spec-mu)/3sigma, (mu+spec)/3sigma) formula. Because mu >= 0,
--    (mu+spec)/3sigma is always the larger branch, so LEAST() always
--    picks (spec-mu)/3sigma — i.e. this only ever computed one-sided Cpu
--    while calling it Cpk. Inputs now come from the signed, unpivoted
--    pe_1..pe_6 / je_1..je_4 samples (same pattern already used by the
--    "Machine PE Capability" panel in ims-ldi-engineering-analytics.json),
--    so the existing LEAST() formula is now a real two-sided Cpk.
--
-- Also exposes sample_count_je (previously only PE's sample_count was
-- selected), since "how many JE samples was this Cpk computed from" is
-- exactly the visibility gap bug #1 was about.
--
-- Caveat carried forward from review: PE1-PE6 (and JE1-JE4) are not
-- independent samples — real data shows symmetric pairs (e.g. pe_2 ≈
-- -pe_5). Unpivoting them into one sample per point can understate sigma
-- vs. the process engineering team's actual Cpk convention. Flagging for
-- Process Engineering review; the alerting thresholds (ldi-rules.yml,
-- 1.33) are unchanged by this migration.
--
-- Mirrors postgres/init/001-init-timescaledb.sql — keep in sync.

DROP VIEW IF EXISTS public.v_machine_spc_ranking CASCADE;
CREATE OR REPLACE VIEW public.v_machine_spc_ranking AS
WITH pe_base AS (
    SELECT eqp_id, factory, mo, fpn, layer_name,
           pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
           COALESCE(pe_setting, 25.0) AS pe_val
    FROM public.ldi_data
    WHERE pe_1 IS NOT NULL
      AND COALESCE(pe_setting, 0) > 2.0
      AND "time" > (SELECT MAX("time") - INTERVAL '2 hours' FROM public.ldi_data)
),
pe_samples AS (
    SELECT eqp_id, factory, mo, fpn, layer_name, pe_val, v.pe
    FROM pe_base
    CROSS JOIN LATERAL (VALUES (pe_1),(pe_2),(pe_3),(pe_4),(pe_5),(pe_6)) v(pe)
    WHERE v.pe IS NOT NULL
),
pe_stats AS (
    SELECT eqp_id, factory, mo, fpn, layer_name,
           AVG(pe) AS mu, STDDEV(pe) AS sigma,
           AVG(pe_val) AS setting_val, COUNT(*) AS sample_count
    FROM pe_samples GROUP BY eqp_id, factory, mo, fpn, layer_name
),
pe_capability AS (
    SELECT *,
           setting_val / NULLIF(3 * sigma, 0) AS cp,
           LEAST((setting_val - mu) / NULLIF(3 * sigma, 0),
                 (mu + setting_val) / NULLIF(3 * sigma, 0)) AS cpk
    FROM pe_stats
),
je_base AS (
    SELECT eqp_id, factory, mo, fpn, layer_name,
           je_1, je_2, je_3, je_4,
           COALESCE(je_setting, 25.0) AS je_val
    FROM public.ldi_data
    WHERE je_1 IS NOT NULL
      AND COALESCE(je_setting, 0) > 2.0
      AND "time" > (SELECT MAX("time") - INTERVAL '2 hours' FROM public.ldi_data)
),
je_samples AS (
    SELECT eqp_id, factory, mo, fpn, layer_name, je_val, v.je
    FROM je_base
    CROSS JOIN LATERAL (VALUES (je_1),(je_2),(je_3),(je_4)) v(je)
    WHERE v.je IS NOT NULL
),
je_stats AS (
    SELECT eqp_id, factory, mo, fpn, layer_name,
           AVG(je) AS mu, STDDEV(je) AS sigma,
           AVG(je_val) AS setting_val, COUNT(*) AS sample_count
    FROM je_samples GROUP BY eqp_id, factory, mo, fpn, layer_name
),
je_capability AS (
    SELECT *,
           setting_val / NULLIF(3 * sigma, 0) AS cp,
           LEAST((setting_val - mu) / NULLIF(3 * sigma, 0),
                 (mu + setting_val) / NULLIF(3 * sigma, 0)) AS cpk
    FROM je_stats
)
SELECT COALESCE(p.eqp_id, j.eqp_id) AS eqp_id,
       COALESCE(p.factory, j.factory) AS factory,
       COALESCE(p.mo, j.mo) AS mo,
       COALESCE(p.fpn, j.fpn) AS fpn,
       COALESCE(p.layer_name, j.layer_name) AS layer_name,
       p.sample_count,
       ROUND(p.mu::NUMERIC, 3) AS mean_pe,
       ROUND(p.sigma::NUMERIC, 3) AS stddev_pe,
       ROUND(p.cp::NUMERIC, 3) AS cp,
       ROUND(p.cpk::NUMERIC, 3) AS cpk,
       CASE
           WHEN p.cpk IS NULL THEN NULL
           WHEN p.cpk >= 2.0 THEN 'World Class'
           WHEN p.cpk >= 1.67 THEN 'Excellent'
           WHEN p.cpk >= 1.33 THEN 'Capable'
           WHEN p.cpk >= 1.0 THEN 'Marginally Capable'
           ELSE 'Not Capable'
       END AS capability_class,
       j.sample_count AS sample_count_je,
       ROUND(j.mu::NUMERIC, 3) AS mean_je,
       ROUND(j.sigma::NUMERIC, 3) AS stddev_je,
       ROUND(j.cp::NUMERIC, 3) AS cp_je,
       ROUND(j.cpk::NUMERIC, 3) AS cpk_je,
       CASE
           WHEN j.cpk IS NULL THEN NULL
           WHEN j.cpk >= 2.0 THEN 'World Class'
           WHEN j.cpk >= 1.67 THEN 'Excellent'
           WHEN j.cpk >= 1.33 THEN 'Capable'
           WHEN j.cpk >= 1.0 THEN 'Marginally Capable'
           ELSE 'Not Capable'
       END AS capability_class_je
FROM pe_capability p
FULL OUTER JOIN je_capability j
    ON p.eqp_id = j.eqp_id AND p.factory = j.factory AND p.mo = j.mo
   AND p.fpn = j.fpn AND p.layer_name = j.layer_name
WHERE COALESCE(p.sigma, j.sigma) > 0
ORDER BY cpk DESC NULLS LAST;
