-- Grant least-privilege read-only access for Grafana datasource
-- Safe to run on fresh install (001-init also creates this role)

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'grafana_reader') THEN
        CREATE ROLE grafana_reader WITH LOGIN PASSWORD 'CHANGE_ME';
    END IF;
END
$$;

-- database and owner come from the session (POSTGRES_DB / POSTGRES_USER), not
-- hardcoded, so init still works when either is renamed in .env
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO grafana_reader', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO grafana_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO grafana_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO grafana_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO grafana_reader;
