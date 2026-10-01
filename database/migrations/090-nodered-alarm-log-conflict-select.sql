-- ============================================================================
-- Migration 090: let nodered_writer use ON CONFLICT on ldi_alarm_log
--
-- 087 granted nodered_writer INSERT only on ldi_alarm_log. The alarm
-- simulator's insert is INSERT ... ON CONFLICT (logdate, logid) DO NOTHING,
-- and PostgreSQL requires SELECT on the columns of an ON CONFLICT target, so
-- every alarm insert failed with "permission denied for table ldi_alarm_log"
-- once Node-RED switched to nodered_writer. (ldi_data's identical upsert works
-- because 087 also grants SELECT on that table.)
--
-- Grants SELECT on the two conflict-target columns only, not the whole table:
-- the role still cannot read alarm content it has no use for.
-- ============================================================================

GRANT SELECT (logdate, logid) ON public.ldi_alarm_log TO nodered_writer;
