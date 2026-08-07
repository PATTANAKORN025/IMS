-- ══════════════════════════════════════════════════════════════
-- 055: ldi_data.eqp_id / ldi_alarm_log.equipmentid -> devices FK
-- ══════════════════════════════════════════════════════════════
-- Data-quality audit (2026-08-06): sys_metrics, net_metrics, and
-- ldi_metrics all enforce device_id REFERENCES devices(device_id) ON
-- DELETE CASCADE (see postgres/init/001-init-timescaledb.sql). ldi_data
-- and ldi_alarm_log never got the same constraint, despite following the
-- identical "one row per known device" shape -- an inconsistency, not a
-- deliberate design choice. Currently zero orphans either direction
-- (verified live before writing this migration), so nothing to clean up
-- first; this only closes the door on a live-machine integration writing
-- telemetry/alarms for an eqp_id that was never registered in devices.
--
-- Both ldi_data and ldi_alarm_log are hypertables; a FOREIGN KEY FROM a
-- hypertable TO a regular table is supported (this is exactly the
-- existing sys_metrics/net_metrics/ldi_metrics pattern) -- the
-- restriction migration 051 documented is specifically about FKs BETWEEN
-- two hypertables, which this is not.

ALTER TABLE public.ldi_data
    ADD CONSTRAINT ldi_data_eqp_id_fkey
    FOREIGN KEY (eqp_id) REFERENCES public.devices(device_id) ON DELETE CASCADE;

ALTER TABLE public.ldi_alarm_log
    ADD CONSTRAINT ldi_alarm_log_equipmentid_fkey
    FOREIGN KEY (equipmentid) REFERENCES public.devices(device_id) ON DELETE CASCADE;
