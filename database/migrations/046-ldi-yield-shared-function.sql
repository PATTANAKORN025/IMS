-- Migration 046: Single source of truth for "LDI Yield %"
--
-- Audit finding (IMS-FULL-SYSTEM-AUDIT.md, P0-1): NOC Overview and Manufacturing
-- reported yield numbers 87.10% (NOC) vs 99.6% (Manufacturing) for the "same"
-- metric. Root cause was NOC using a hardcoded ±10 threshold and only pe_1/je_1,
-- while Manufacturing correctly compares all 6 PE / 4 JE points against the
-- per-row pe_setting/je_setting recipe limits.
--
-- Fix: both dashboards now call this one function. Same inputs -> same output,
-- by construction, not by coincidence.
CREATE OR REPLACE FUNCTION public.f_ldi_yield_pct(
    p_eqp_id TEXT[] DEFAULT NULL,
    p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 hour',
    p_until TIMESTAMPTZ DEFAULT NOW()
) RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
    WITH pe_yield AS (
        SELECT ROUND(100.0 * COUNT(*) FILTER (
            WHERE GREATEST(ABS(pe_1), ABS(pe_2), ABS(pe_3),
                           ABS(pe_4), ABS(pe_5), ABS(pe_6)) <= pe_setting
        ) / NULLIF(COUNT(*) FILTER (WHERE pe_1 IS NOT NULL), 0)::NUMERIC, 1) AS value
        FROM public.ldi_data
        WHERE "time" BETWEEN p_since AND p_until
          AND (p_eqp_id IS NULL OR eqp_id = ANY(p_eqp_id))
    ),
    je_yield AS (
        SELECT ROUND(100.0 * COUNT(*) FILTER (
            WHERE GREATEST(ABS(je_1), ABS(je_2), ABS(je_3), ABS(je_4)) <= je_setting
        ) / NULLIF(COUNT(*) FILTER (WHERE je_1 IS NOT NULL), 0)::NUMERIC, 1) AS value
        FROM public.ldi_data
        WHERE "time" BETWEEN p_since AND p_until
          AND (p_eqp_id IS NULL OR eqp_id = ANY(p_eqp_id))
    )
    SELECT COALESCE(LEAST(py.value, jy.value), py.value, jy.value)
    FROM pe_yield py, je_yield jy
$$;

COMMENT ON FUNCTION public.f_ldi_yield_pct IS
    'Fleet yield %: worst-case of PE-pass-rate and JE-pass-rate, each measured against pe_setting/je_setting (all 6 PE / 4 JE points, not just point 1). Shared by NOC Overview and Manufacturing dashboards so both always report an identical number for an identical scope.';
