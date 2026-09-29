-- Migration 085: Drilling Fleet High-Performance Query & Watchdog Indexes
-- Target Database: eap_backup (Drilling TimescaleDB)
-- Purpose: Eliminate full-table sequential scans on machine_event (millions of rows)
--          and prevent 504 Gateway Timeouts on 30-day dashboard queries.

-- The runner opens every file on the ims database. Switch to eap_backup when this
-- server has it; skip cleanly otherwise (a fresh install has no eap_backup, and an
-- unconditional connect would fail db-migrate and hold back the services gated on it).
SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'eap_backup') AS has_eap_backup \gset
\if :has_eap_backup
\connect eap_backup

-- 1. Composite index for lateral joins (Equipment + Event Code + Time)
-- Accelerates all latest-state subqueries (Program, RPM/Feed, Spindle Mask, Holes)
CREATE INDEX IF NOT EXISTS ix_machine_event_eqp_code_time
ON public.machine_event (equipment_id, event_code, event_time DESC)
WHERE equipment_id IS NOT NULL AND event_code IS NOT NULL;

-- 2. Partial index for Anomaly & RCA panels
-- Reduces the search space to the small share of rows that are anomalies
CREATE INDEX IF NOT EXISTS ix_machine_event_anomalies
ON public.machine_event (event_time DESC, equipment_id, event_code)
WHERE (
  event_type IN ('ALARM', 'E')
  OR event_code LIKE '04%'
  OR event_code LIKE '07%'
  OR event_code IN ('0102', '0113', '0114', '0119', '0120', '0124', '0125', '0126', '0127', '0128', '0204', '0218')
);

-- 3. Document index metadata in PostgreSQL catalog
COMMENT ON INDEX public.ix_machine_event_eqp_code_time IS 
'High-speed lateral seek index for Drilling Fleet Overview (order-of-magnitude speedup on the fleet query)';

COMMENT ON INDEX public.ix_machine_event_anomalies IS 
'Partial index covering all Drilling alarm and anomaly event codes for 04-RCA dashboard';

\else
\echo 'IMS_MIGRATION_DEFERRED 085: database eap_backup not present on this server; runs again on the next start'
\endif
