-- Migration 038: Rename ldi_metrics columns to match ldi_data standard
-- This ensures the SRE AIOps Parser and Grafana dashboards work correctly.
--
-- Guarded (DO $$ ... IF EXISTS ...) rather than a plain RENAME COLUMN:
-- this repo has 3 different migration-tracking histories in play (manual
-- runs, the docker-compose db-migrate service, and past ad hoc drift), and
-- this exact migration was found live-applied to the database while its
-- schema_migrations row was still unmarked -- a plain RENAME COLUMN would
-- error on a second run against an already-migrated DB. Matches the guard
-- pattern already established in migration 013.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ldi_metrics' AND column_name = 'pressure'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ldi_metrics' AND column_name = 'pe_1'
    ) THEN
        ALTER TABLE public.ldi_metrics RENAME COLUMN pressure TO pe_1;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ldi_metrics' AND column_name = 'joule_effect'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ldi_metrics' AND column_name = 'je_1'
    ) THEN
        ALTER TABLE public.ldi_metrics RENAME COLUMN joule_effect TO je_1;
    END IF;
END $$;
