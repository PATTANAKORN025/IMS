-- ============================================================================
-- Migration 087: least-privilege database roles for Node-RED and the
-- observability archiver
--
-- Both services connected as POSTGRES_USER, the superuser: a bug or a hostile
-- payload in a Node-RED function node could drop tables, read every role's
-- password hash, or run COPY ... PROGRAM on the database host. Each now gets a
-- role with exactly the table privileges its code uses, enumerated from the
-- SQL in nodered_data/flows/*.json and scripts/observability-archiver.sh:
--
--   nodered_writer
--     ingest_staging         write-ahead rows: INSERT ... RETURNING id, then
--                            UPDATE (attempts) or DELETE by id
--     ldi_data               INSERT ... ON CONFLICT DO NOTHING; SELECT for the
--                            alarm simulator's telemetry read and for the
--                            ldi_alarm_log link trigger (migration 051)
--     ldi_alarm_log          INSERT ... ON CONFLICT DO NOTHING
--     ldi_alarm_lifecycle    INSERT from trg_ldi_alarm_lifecycle_init (runs as
--                            the inserting role); SELECT + UPDATE for the
--                            simulator's ack/resolve of its own alarms
--     ldi_alarm_state        simulator debounce: SELECT, upsert
--     sys_metrics, net_metrics, ldi_metrics   SNMP / SRE INSERT
--     devices                SELECT (device registry)
--   observability_archiver
--     container_restart_audit  INSERT
--
-- Passwords come from NODERED_DB_PASSWORD / ARCHIVER_DB_PASSWORD in the
-- db-migrate environment (same \getenv pattern as 078). log_statement is
-- 'ddl' on this server, which would write ALTER ROLE ... PASSWORD to the
-- server log in clear text, so it is switched off for that one transaction.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nodered_writer') THEN
        CREATE ROLE nodered_writer WITH LOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'observability_archiver') THEN
        CREATE ROLE observability_archiver WITH LOGIN;
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO nodered_writer, observability_archiver', current_database());
END
$$;

\getenv nodered_db_password NODERED_DB_PASSWORD
\getenv archiver_db_password ARCHIVER_DB_PASSWORD
BEGIN;
SET LOCAL log_statement = 'none';
ALTER ROLE nodered_writer WITH PASSWORD :'nodered_db_password';
ALTER ROLE observability_archiver WITH PASSWORD :'archiver_db_password';
COMMIT;

GRANT USAGE ON SCHEMA public TO nodered_writer, observability_archiver;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingest_staging TO nodered_writer;
GRANT SELECT, INSERT ON public.ldi_data TO nodered_writer;
GRANT INSERT ON public.ldi_alarm_log TO nodered_writer;
GRANT SELECT, INSERT, UPDATE ON public.ldi_alarm_lifecycle TO nodered_writer;
GRANT SELECT, INSERT, UPDATE ON public.ldi_alarm_state TO nodered_writer;
GRANT INSERT ON public.sys_metrics, public.net_metrics, public.ldi_metrics TO nodered_writer;
GRANT SELECT ON public.devices TO nodered_writer;
GRANT USAGE ON SEQUENCE public.ingest_staging_id_seq TO nodered_writer;

GRANT INSERT ON public.container_restart_audit TO observability_archiver;
GRANT USAGE ON SEQUENCE public.container_restart_audit_id_seq TO observability_archiver;
