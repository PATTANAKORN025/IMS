-- Grant least-privilege read-only access for Grafana datasource
-- Created as part of SQL injection remediation (Round 14)
-- Safe to run on fresh install (001-init also creates this role)

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'grafana_reader') THEN
        CREATE ROLE grafana_reader WITH LOGIN PASSWORD 'grafana_secure';
    END IF;
END
$$;
GRANT CONNECT ON DATABASE ims TO grafana_reader;
GRANT USAGE ON SCHEMA public TO grafana_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO grafana_reader;
