-- ══════════════════════════════════════════════════════════════
-- Migration 016: Aggressive Retention Policies
-- Idempotent: safe to re-run
-- ══════════════════════════════════════════════════════════════

-- ── First, remove existing retention policies ───────────
-- We remove then re-add to ensure the new intervals take effect.
-- remove_retention_policy is idempotent (no-op if policy doesn't exist).

DO $$ BEGIN PERFORM remove_retention_policy('public.sys_metrics', if_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM remove_retention_policy('public.net_metrics', if_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM remove_retention_policy('public.ldi_metrics', if_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── Raw data: Drop after 14 days ───────────────────────
-- Rationale: Raw data is high-volume. After 14 days, hourly CAGGs
-- provide sufficient resolution for operational dashboards.
DO $$ BEGIN PERFORM add_retention_policy('public.sys_metrics', INTERVAL '14 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM add_retention_policy('public.net_metrics', INTERVAL '14 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM add_retention_policy('public.ldi_metrics', INTERVAL '14 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── Hourly CAGGs: Drop after 90 days ───────────────────
-- Rationale: Daily CAGGs cover 90d+ range. Hourly granularity
-- only needed for recent operational troubleshooting.
DO $$ BEGIN PERFORM remove_retention_policy('public.sys_hourly', if_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM remove_retention_policy('public.net_hourly', if_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM remove_retention_policy('public.ldi_hourly', if_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN PERFORM add_retention_policy('public.sys_hourly', INTERVAL '90 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM add_retention_policy('public.net_hourly', INTERVAL '90 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM add_retention_policy('public.ldi_hourly', INTERVAL '90 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── Daily CAGGs: Drop after 2 years ────────────────────
-- Rationale: Weekly/monthly summaries cover 2yr+ range.
-- Daily granularity for capacity planning and trend analysis.
-- NOTE: These policies only take effect after 015-daily-weekly-caggs.sql runs.
DO $$ BEGIN PERFORM add_retention_policy('public.sys_daily', INTERVAL '2 years', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM add_retention_policy('public.net_daily', INTERVAL '2 years', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM add_retention_policy('public.ldi_daily', INTERVAL '2 years', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── Compression: Tighten to 3 days for high-volume tables ─
-- Rationale: sys_metrics and net_metrics are write-heavy.
-- Compressing at 3 days instead of 7 reduces active table size.
DO $$ BEGIN PERFORM remove_compression_policy('public.sys_metrics', if_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM remove_compression_policy('public.net_metrics', if_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN PERFORM add_compression_policy('public.sys_metrics', INTERVAL '3 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM add_compression_policy('public.net_metrics', INTERVAL '3 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
-- ldi_metrics: keep 7-day compression (low write volume)
