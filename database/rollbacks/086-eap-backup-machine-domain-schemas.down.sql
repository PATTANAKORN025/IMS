-- Rollback for migration 086 (eap_backup machine-domain schemas).
-- Drops only the views and schemas 086 created. DROP SCHEMA without CASCADE:
-- if anything else was later put in one of these schemas, the rollback stops
-- instead of deleting it. Physical tables are never touched.
--
-- Run: docker exec -i ims-timescaledb psql -U "$POSTGRES_USER" -d eap_backup -v ON_ERROR_STOP=1 \
--        < database/rollbacks/086-eap-backup-machine-domain-schemas.down.sql
-- then: DELETE FROM public.schema_migrations WHERE version = '086-eap-backup-machine-domain-schemas';  (on ims)

BEGIN;
DROP VIEW IF EXISTS catalog.object_registry;
DROP VIEW IF EXISTS shopfloor.alarm_log;
DROP VIEW IF EXISTS ldi.process_log, ldi.alarm_code_legacy, ldi.alarm_code, ldi.alarm_log;
DROP VIEW IF EXISTS vcp.status_change, vcp.alarm, vcp.upp;
DROP VIEW IF EXISTS drilling.agent_log, drilling.agent_status, drilling.telemetry, drilling.event;
DROP SCHEMA IF EXISTS catalog;
DROP SCHEMA IF EXISTS shopfloor;
DROP SCHEMA IF EXISTS ldi;
DROP SCHEMA IF EXISTS vcp;
DROP SCHEMA IF EXISTS drilling;
COMMIT;
