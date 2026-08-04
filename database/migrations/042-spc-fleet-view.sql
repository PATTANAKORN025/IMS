-- ══════════════════════════════════════════════════════════════
-- Migration 042: v_machine_spc_fleet — always-on fleet-wide SPC view
-- ══════════════════════════════════════════════════════════════
-- v_machine_spc_ranking (migration 041) is scoped to a rolling 2 hours and
-- grouped per (eqp_id, factory, mo, fpn, layer_name) — right for engineering
-- drill-down, wrong for a Manufacturing KPI strip: a machine idle for over
-- 2h, or between job/part/layer changes, silently drops out of that view.
--
-- v_machine_spc_fleet fixes that for fleet-level reporting:
--   - LEFT JOINs from public.devices (device_type = 'ldi' AND enabled), so
--     every registered LDI machine always has a row, even with zero data
--     in the last 24h — "sees all machines at all times" instead of only
--     the ones that happened to report recently.
--   - Rolling 24h window (vs. 2h) so short idle gaps don't blank a machine.
--   - Grouped by eqp_id only (fleet-wide), not per job/part/layer.
--   - mu/sigma computed from signed, unpivoted pe_1..6 / je_1..4 samples
--     (same fix as migration 041 — true two-sided Cpk, not one-sided Cpu).
--   - Exposes pe_pass_rate / je_pass_rate (% of individual samples within
--     +/- setting) and worst_cpk = LEAST(cpk_pe, cpk_je) per machine, for
--     the Manufacturing "Worst Cpk (Fleet)" / "JE Pass Rate (Fleet)" /
--     "Machine Count (Fleet)" KPIs.
--
-- Deliberately NOT filtered by factory/mo/fpn/layer/machine_id — panels
-- reading this view are meant to always reflect the full registered fleet
-- regardless of the dashboard's current filter selection.

DROP VIEW IF EXISTS public.v_machine_spc_fleet CASCADE;
CREATE OR REPLACE VIEW public.v_machine_spc_fleet AS
WITH pe_base AS (
    SELECT eqp_id, pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
           COALESCE(pe_setting, 25.0) AS pe_val
    FROM public.ldi_data
    WHERE pe_1 IS NOT NULL
      AND COALESCE(pe_setting, 0) > 2.0
      AND "time" > NOW() - INTERVAL '24 hours'
),
pe_samples AS (
    SELECT eqp_id, pe_val, v.pe
    FROM pe_base
    CROSS JOIN LATERAL (VALUES (pe_1),(pe_2),(pe_3),(pe_4),(pe_5),(pe_6)) v(pe)
    WHERE v.pe IS NOT NULL
),
pe_stats AS (
    SELECT eqp_id, COUNT(*) AS n_pe,
           COUNT(*) FILTER (WHERE ABS(pe) <= pe_val) AS pass_pe,
           AVG(pe) AS mu, STDDEV(pe) AS sigma, AVG(pe_val) AS setting_val
    FROM pe_samples GROUP BY eqp_id
),
pe_capability AS (
    SELECT *,
           setting_val / NULLIF(3 * sigma, 0) AS cp_pe,
           LEAST((setting_val - mu) / NULLIF(3 * sigma, 0),
                 (mu + setting_val) / NULLIF(3 * sigma, 0)) AS cpk_pe
    FROM pe_stats
),
je_base AS (
    SELECT eqp_id, je_1, je_2, je_3, je_4,
           COALESCE(je_setting, 25.0) AS je_val
    FROM public.ldi_data
    WHERE je_1 IS NOT NULL
      AND COALESCE(je_setting, 0) > 2.0
      AND "time" > NOW() - INTERVAL '24 hours'
),
je_samples AS (
    SELECT eqp_id, je_val, v.je
    FROM je_base
    CROSS JOIN LATERAL (VALUES (je_1),(je_2),(je_3),(je_4)) v(je)
    WHERE v.je IS NOT NULL
),
je_stats AS (
    SELECT eqp_id, COUNT(*) AS n_je,
           COUNT(*) FILTER (WHERE ABS(je) <= je_val) AS pass_je,
           AVG(je) AS mu, STDDEV(je) AS sigma, AVG(je_val) AS setting_val
    FROM je_samples GROUP BY eqp_id
),
je_capability AS (
    SELECT *,
           setting_val / NULLIF(3 * sigma, 0) AS cp_je,
           LEAST((setting_val - mu) / NULLIF(3 * sigma, 0),
                 (mu + setting_val) / NULLIF(3 * sigma, 0)) AS cpk_je
    FROM je_stats
)
SELECT d.device_id AS eqp_id,
       d.location,
       p.n_pe,
       ROUND(p.cp_pe::NUMERIC, 3) AS cp_pe,
       ROUND(p.cpk_pe::NUMERIC, 3) AS cpk_pe,
       ROUND((100.0 * p.pass_pe / NULLIF(p.n_pe, 0))::NUMERIC, 1) AS pe_pass_rate,
       j.n_je,
       ROUND(j.cp_je::NUMERIC, 3) AS cp_je,
       ROUND(j.cpk_je::NUMERIC, 3) AS cpk_je,
       ROUND((100.0 * j.pass_je / NULLIF(j.n_je, 0))::NUMERIC, 1) AS je_pass_rate,
       ROUND((CASE
           WHEN p.cpk_pe IS NULL THEN j.cpk_je
           WHEN j.cpk_je IS NULL THEN p.cpk_pe
           ELSE LEAST(p.cpk_pe, j.cpk_je)
       END)::NUMERIC, 3) AS worst_cpk,
       CASE
           WHEN p.cpk_pe IS NULL THEN j.n_je
           WHEN j.cpk_je IS NULL THEN p.n_pe
           WHEN p.cpk_pe <= j.cpk_je THEN p.n_pe
           ELSE j.n_je
       END AS worst_n
FROM public.devices d
LEFT JOIN pe_capability p ON p.eqp_id = d.device_id
LEFT JOIN je_capability j ON j.eqp_id = d.device_id
WHERE d.device_type = 'ldi' AND d.enabled;
