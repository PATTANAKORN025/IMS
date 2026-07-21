-- ══════════════════════════════════════════════════════════════
-- Migration 020: LDI Schema Type Alignment to Production
-- Aligns column types to match real production schema.
-- ══════════════════════════════════════════════════════════════

-- 1. Align ldi_data columns to production schema
ALTER TABLE public.ldi_data
    ALTER COLUMN resist TYPE VARCHAR(250),
    ALTER COLUMN log_id TYPE VARCHAR(50);

-- Add the missing Unique Index matching production
-- Note: ldi_data is a hypertable partitioned by "time".
-- Unique indexes on hypertables MUST include the partitioning column.
-- However, this index uses NULLS LAST / NULLS FIRST ordering which
-- TimescaleDB requires the partitioning column to be part of it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_logid
    ON public.ldi_data (log_id ASC NULLS LAST, "time" DESC NULLS FIRST);

-- 2. Align ldi_alarm_log columns to EXACT production schema
ALTER TABLE public.ldi_alarm_log
    ALTER COLUMN logid TYPE VARCHAR(50),
    ALTER COLUMN errorcode TYPE VARCHAR(50),
    ALTER COLUMN errortime TYPE VARCHAR(50),
    ALTER COLUMN equipmentid TYPE VARCHAR(50),
    ALTER COLUMN factory TYPE VARCHAR(1),
    ALTER COLUMN process TYPE VARCHAR(50);
