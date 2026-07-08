-- IMS Migration Tracking Table
-- Tracks which migrations have been applied to prevent re-execution.
-- Used by scripts/migrate.sh

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version         TEXT PRIMARY KEY,
    filename        TEXT NOT NULL,
    applied_at      TIMESTAMPTZ DEFAULT NOW(),
    checksum        TEXT
);

-- Seed with the init SQL as the baseline migration (always applied on fresh install)
INSERT INTO public.schema_migrations (version, filename, checksum)
VALUES ('001-init-timescaledb', 'postgres/init/001-init-timescaledb.sql', 'builtin-v2')
ON CONFLICT (version) DO NOTHING;
