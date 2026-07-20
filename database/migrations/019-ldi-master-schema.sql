-- ══════════════════════════════════════════════════════════════
-- Migration 019: LDI Master Schema
-- Dedicated Laser Direct Imaging data engine, isolated from
-- standard IT monitoring. Optimized for TimescaleDB hypertables.
-- ══════════════════════════════════════════════════════════════

-- ── 1. LDI Telemetry (per-measurement row) ────────────────
CREATE TABLE public.ldi_data (
    "time"              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    eqp_id              TEXT            NOT NULL,
    factory             TEXT            DEFAULT '',
    process             TEXT            DEFAULT '',
    mo                  TEXT            DEFAULT '',
    fpn                 TEXT            DEFAULT '',
    layer_name          TEXT            DEFAULT '',
    resist_dosage       DOUBLE PRECISION,
    scale_x             DOUBLE PRECISION,
    scale_y             DOUBLE PRECISION,
    temperature         DOUBLE PRECISION,
    humidity            DOUBLE PRECISION,
    scan_speed          DOUBLE PRECISION,
    air_vacuum          DOUBLE PRECISION,
    thickness           DOUBLE PRECISION,
    board_no            INTEGER,
    total_board         INTEGER,
    total_time          DOUBLE PRECISION,
    filmno              TEXT            DEFAULT '',
    board_id            TEXT            DEFAULT '',
    resist              DOUBLE PRECISION,
    state               BOOLEAN         DEFAULT true,
    scale_mode          TEXT            DEFAULT '',
    pe_1                DOUBLE PRECISION,
    pe_2                DOUBLE PRECISION,
    pe_3                DOUBLE PRECISION,
    pe_4                DOUBLE PRECISION,
    pe_5                DOUBLE PRECISION,
    pe_6                DOUBLE PRECISION,
    je_1                DOUBLE PRECISION,
    je_2                DOUBLE PRECISION,
    je_3                DOUBLE PRECISION,
    je_4                DOUBLE PRECISION,
    pe_setting          DOUBLE PRECISION,
    je_setting          DOUBLE PRECISION,
    log_id              BIGINT
);

SELECT create_hypertable('public.ldi_data', 'time',
    chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_ldi_data_eqp_time
    ON public.ldi_data (eqp_id, "time" DESC);
CREATE INDEX IF NOT EXISTS idx_ldi_data_state
    ON public.ldi_data (state, "time" DESC);

-- ── 2. LDI Alarm Log (per-alarm row) ──────────────────────
CREATE TABLE public.ldi_alarm_log (
    logdate             TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    errorcode           INTEGER         NOT NULL,
    errortime           TIMESTAMPTZ,
    equipmentid         TEXT            NOT NULL,
    factory             TEXT            DEFAULT '',
    process             TEXT            DEFAULT '',
    logid               BIGSERIAL
);

SELECT create_hypertable('public.ldi_alarm_log', 'logdate',
    chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_alarm_log_equip_time
    ON public.ldi_alarm_log (equipmentid, logdate DESC);
CREATE INDEX IF NOT EXISTS idx_alarm_log_code
    ON public.ldi_alarm_log (errorcode);

-- ── 3. LDI Alarm Message Codes (reference table) ──────────
CREATE TABLE IF NOT EXISTS public.ldi_alarm_ms_code (
    alarm_id            SERIAL          PRIMARY KEY,
    alarm_type          TEXT            NOT NULL DEFAULT 'UNKNOWN',
    alarm_code          INTEGER         NOT NULL UNIQUE,
    alarm_msg           TEXT            NOT NULL DEFAULT '',
    alarm_detail        TEXT            DEFAULT ''
);

-- ── 4. Compression policies ───────────────────────────────
DO $$ BEGIN
    PERFORM add_compression_policy('public.ldi_data', INTERVAL '7 days', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    PERFORM add_compression_policy('public.ldi_alarm_log', INTERVAL '14 days', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 5. Retention policies ─────────────────────────────────
DO $$ BEGIN
    PERFORM add_retention_policy('public.ldi_data', INTERVAL '90 days', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    PERFORM add_retention_policy('public.ldi_alarm_log', INTERVAL '180 days', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 6. Grant permissions ──────────────────────────────────
GRANT SELECT ON public.ldi_data TO grafana_reader;
GRANT SELECT ON public.ldi_alarm_log TO grafana_reader;
GRANT SELECT ON public.ldi_alarm_ms_code TO grafana_reader;

-- ── 7. Migration record ───────────────────────────────────
INSERT INTO public.schema_migrations (version, filename, applied_at)
VALUES ('019', '019-ldi-master-schema.sql', NOW())
ON CONFLICT (version) DO NOTHING;
