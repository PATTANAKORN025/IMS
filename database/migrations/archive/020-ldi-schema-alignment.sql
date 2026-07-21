-- ══════════════════════════════════════════════════════════════
-- Migration 020: LDI Schema Alignment to Production
-- Aligns ALL column types, PKs, and indexes to match real
-- production schema files (ldi_data.sql, ldi_alarm_log.sql,
-- ldi_alarm_ms_code.sql).
-- ══════════════════════════════════════════════════════════════

-- 1. ldi_data: Fix 2 column types + add missing index
ALTER TABLE public.ldi_data
    ALTER COLUMN resist TYPE VARCHAR(250),
    ALTER COLUMN log_id TYPE VARCHAR(50);

-- Unique index matching production: (log_id, time DESC)
CREATE UNIQUE INDEX IF NOT EXISTS idx_logid
    ON public.ldi_data (log_id ASC NULLS LAST, "time" DESC NULLS FIRST);

-- Time index matching production
CREATE INDEX IF NOT EXISTS ldi_data_time_idx
    ON public.ldi_data ("time" DESC NULLS FIRST);

-- 2. ldi_alarm_log: Align ALL columns to production VARCHAR types
ALTER TABLE public.ldi_alarm_log
    ALTER COLUMN logid TYPE VARCHAR(50),
    ALTER COLUMN errorcode TYPE VARCHAR(50),
    ALTER COLUMN errortime TYPE VARCHAR(50),
    ALTER COLUMN equipmentid TYPE VARCHAR(50),
    ALTER COLUMN factory TYPE VARCHAR(1),
    ALTER COLUMN process TYPE VARCHAR(50);

-- Add PRIMARY KEY matching production: (logdate, logid)
-- TimescaleDB hypertable PK MUST include the partitioning column (logdate)
DO $$ BEGIN
    ALTER TABLE public.ldi_alarm_log
        ADD CONSTRAINT pk_ldi_alarm_data PRIMARY KEY (logdate, logid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add indexes matching production
CREATE INDEX IF NOT EXISTS idx_ldi_alarm_logid
    ON public.ldi_alarm_log (logid ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS ldi_alarm_log_logdate_idx
    ON public.ldi_alarm_log (logdate DESC NULLS FIRST);

-- 3. ldi_alarm_ms_code: Align types to production
--    Real schema: alarm_id VARCHAR(15) PK, alarm_code VARCHAR(50)
--    Migration 019: alarm_id SERIAL PK, alarm_code INTEGER UNIQUE

-- Drop old SERIAL-based structure and recreate with VARCHAR types
DROP TABLE IF EXISTS public.ldi_alarm_ms_code CASCADE;

CREATE TABLE IF NOT EXISTS public.ldi_alarm_ms_code (
    alarm_id    VARCHAR(15) NOT NULL,
    alarm_type  VARCHAR(50),
    alarm_code  VARCHAR(50),
    alarm_msg   VARCHAR(500),
    alarm_detail VARCHAR(500),
    CONSTRAINT ldi_alarm_ms_code_pkey PRIMARY KEY (alarm_id)
);

GRANT SELECT ON public.ldi_alarm_ms_code TO grafana_reader;
