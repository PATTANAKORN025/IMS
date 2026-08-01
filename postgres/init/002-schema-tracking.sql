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

INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('013-normalized-schema', '013-normalized-schema.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('014-cagg-retention', '014-cagg-retention.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('015-daily-weekly-caggs', '015-daily-weekly-caggs.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('016-aggressive-retention', '016-aggressive-retention.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('017-predictive-capacity', '017-predictive-capacity.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('018-high-fidelity-sys', '018-high-fidelity-sys.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('020-ldi-production-schema', '020-ldi-production-schema.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('027-ldi-spc-engine', '027-ldi-spc-engine.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('028-ldi-spc-nelson-rules', '028-ldi-spc-nelson-rules.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('030-ldi-machine-snapshot-view', '030-ldi-machine-snapshot-view.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('031-ldi-event-timeline', '031-ldi-event-timeline.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('032-spc-ranking-multivar-filter', '032-spc-ranking-multivar-filter.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('036-ldi-alarm-master-mock', '036-ldi-alarm-master-mock.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('038-rename-ldi-metrics-columns', '038-rename-ldi-metrics-columns.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('039-rca-alarm-view', '039-rca-alarm-view.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('040-register-ldi-devices', '040-register-ldi-devices.sql', 'pre-seeded') ON CONFLICT DO NOTHING;
