-- ══════════════════════════════════════════════════════════════
-- 078: least-privilege DB role for the alarm-api write service
-- ══════════════════════════════════════════════════════════════
-- Operator Workflow phase 1: a new alarm-api service (services/alarm-api)
-- is the first real write path for ldi_alarm_lifecycle (migration 077) --
-- ack/resolve, called from a Grafana panel's browser-side JS. It must not
-- reuse ims_admin (superuser, used only by migrations/ops) or
-- grafana_reader (SELECT-only, used only by Grafana's datasource). New
-- role gets exactly what the service needs: SELECT+UPDATE on
-- ldi_alarm_lifecycle, nothing else. No INSERT -- lifecycle rows are only
-- ever created by trg_ldi_alarm_lifecycle_init on ldi_alarm_log insert
-- (migration 077), never by this service.
--
-- Password follows the same pattern as grafana_reader (postgres/init/
-- 002-grafana-readonly.sql + 003-grafana-password.sh): role created with
-- a placeholder, real password applied from the container's own
-- environment via psql's \getenv (client-side substitution, no change to
-- the shared migrate-entrypoint.sh runner needed). Requires
-- ALARM_API_DB_PASSWORD set in the db-migrate service's environment.

DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'alarm_api_writer') THEN
        CREATE ROLE alarm_api_writer WITH LOGIN PASSWORD 'CHANGE_ME';
    END IF;
END $$;

\getenv alarm_api_db_password ALARM_API_DB_PASSWORD
ALTER ROLE alarm_api_writer WITH PASSWORD :'alarm_api_db_password';

GRANT CONNECT ON DATABASE ims TO alarm_api_writer;
GRANT USAGE ON SCHEMA public TO alarm_api_writer;
GRANT SELECT, UPDATE ON public.ldi_alarm_lifecycle TO alarm_api_writer;
