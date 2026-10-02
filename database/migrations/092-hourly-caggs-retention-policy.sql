-- Migration 092: Hourly CAGGs Retention Policies & Triage Query Indexes
-- Idempotent: safe to re-run

-- 1. Retention policies for hourly continuous aggregates (sys_hourly, net_hourly, ldi_hourly)
-- Ensures all hourly CAGGs have a bounded retention (2 years, matching ldi_data_hourly)
DO $$
BEGIN
    PERFORM remove_retention_policy('public.sys_hourly', if_exists => TRUE);
    PERFORM add_retention_policy('public.sys_hourly', INTERVAL '2 years', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    PERFORM remove_retention_policy('public.net_hourly', if_exists => TRUE);
    PERFORM add_retention_policy('public.net_hourly', INTERVAL '2 years', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    PERFORM remove_retention_policy('public.ldi_hourly', if_exists => TRUE);
    PERFORM add_retention_policy('public.ldi_hourly', INTERVAL '2 years', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Performance indexes for LDI Alarm Response (Triage queue acceleration)
CREATE INDEX IF NOT EXISTS idx_ldi_alarm_ms_code_code
    ON public.ldi_alarm_ms_code (alarm_code);

CREATE INDEX IF NOT EXISTS idx_ldi_alarm_lifecycle_open_date
    ON public.ldi_alarm_lifecycle (logdate ASC)
    WHERE status = 'OPEN';
