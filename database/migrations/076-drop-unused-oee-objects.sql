-- ══════════════════════════════════════════════════════════════
-- Migration 076: drop ldi_oee_1m and ldi_master_config (unused)
-- ══════════════════════════════════════════════════════════════
-- Per this repo's §7 versioning policy, this is a new migration rather
-- than an edit to 074/075 -- those files stay as the historical record of
-- what was built and why; this one records that it was later removed.
--
-- Context: ldi_oee_1m (migration 075) backed a "Plant Overall OEE"
-- dashboard section that was built, then explicitly rolled back at the
-- user's direction -- Manufacturing dashboard was stripped back down to
-- its pre-OEE state (Executive KPI section, trend chart, and Alarm Pareto
-- all removed), leaving no panel anywhere querying either object.
-- ldi_master_config (migration 074) existed solely to supply
-- ideal_cycle_sec/downtime_cost_per_min/scrap_cost_per_board to the OEE
-- Performance calculation, so it has no remaining purpose either.
--
-- Both confirmed orphaned via tests/lint/orphan-object-linter.js before
-- writing this migration (0 dashboard panels reference either name).
-- Neither has an FK dependent from any other table. If OEE display comes
-- back, both can be recreated verbatim from migrations 074/075.

DO $$ BEGIN
    PERFORM remove_continuous_aggregate_policy('public.ldi_oee_1m', if_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    PERFORM remove_retention_policy('public.ldi_oee_1m', if_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP MATERIALIZED VIEW IF EXISTS public.ldi_oee_1m;

DROP TABLE IF EXISTS public.ldi_master_config;
