-- ══════════════════════════════════════════════════════════════
-- 020: LDI Production Schema (DROP + CREATE only, no data)
-- Run by: docker compose up (via 001-init) or manually for existing DBs
-- ══════════════════════════════════════════════════════════════

-- 1. DROP EXISTING TABLES (idempotent)
DROP TABLE IF EXISTS public.ldi_data CASCADE;
DROP TABLE IF EXISTS public.ldi_alarm_log CASCADE;
DROP TABLE IF EXISTS public.ldi_alarm_ms_code CASCADE;

-- 2a. ldi_alarm_ms_code (reference table)
CREATE TABLE IF NOT EXISTS public.ldi_alarm_ms_code (
    alarm_id    VARCHAR(15) NOT NULL,
    alarm_type  VARCHAR(50),
    alarm_code  VARCHAR(50),
    alarm_msg   VARCHAR(500),
    alarm_detail VARCHAR(500),
    CONSTRAINT ldi_alarm_ms_code_pkey PRIMARY KEY (alarm_id)
);
GRANT SELECT ON public.ldi_alarm_ms_code TO grafana_reader;

-- 2b. ldi_data (TimescaleDB hypertable)
CREATE TABLE IF NOT EXISTS public.ldi_data (
    "time"          TIMESTAMPTZ     NOT NULL,
    factory         VARCHAR(10)     NOT NULL,
    process         VARCHAR(250)    NOT NULL,
    eqp_id          VARCHAR(250)    NOT NULL,
    mo              VARCHAR(50)     NOT NULL,
    fpn             VARCHAR(50)     NOT NULL,
    layer_name      VARCHAR(250)    NOT NULL,
    resist_dosage   DOUBLE PRECISION,
    scale_x         DOUBLE PRECISION,
    scale_y         DOUBLE PRECISION,
    temperature     DOUBLE PRECISION,
    humidity        DOUBLE PRECISION,
    scan_speed      DOUBLE PRECISION,
    air_vacuum      DOUBLE PRECISION,
    thickness       DOUBLE PRECISION,
    board_no        SMALLINT,
    total_board     SMALLINT,
    total_time      DOUBLE PRECISION,
    filmno          VARCHAR(250),
    board_id        VARCHAR(250),
    resist          VARCHAR(250),
    state           BOOLEAN,
    scale_mode      VARCHAR(250),
    pe_1            DOUBLE PRECISION,
    pe_2            DOUBLE PRECISION,
    pe_3            DOUBLE PRECISION,
    pe_4            DOUBLE PRECISION,
    pe_5            DOUBLE PRECISION,
    pe_6            DOUBLE PRECISION,
    je_1            DOUBLE PRECISION,
    je_2            DOUBLE PRECISION,
    je_3            DOUBLE PRECISION,
    je_4            DOUBLE PRECISION,
    pe_setting      DOUBLE PRECISION,
    je_setting      DOUBLE PRECISION,
    log_id          VARCHAR(50)     NOT NULL
);

SELECT create_hypertable('public.ldi_data', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS idx_logid
    ON public.ldi_data (log_id ASC NULLS LAST, "time" DESC NULLS FIRST);
CREATE INDEX IF NOT EXISTS ldi_data_time_idx
    ON public.ldi_data ("time" DESC NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_ldi_data_eqp_time
    ON public.ldi_data (eqp_id, "time" DESC);

GRANT SELECT ON public.ldi_data TO grafana_reader;

-- 2c. ldi_alarm_log (TimescaleDB hypertable)
CREATE TABLE IF NOT EXISTS public.ldi_alarm_log (
    logid       VARCHAR(50)     NOT NULL,
    logdate     TIMESTAMPTZ     NOT NULL,
    errorcode   VARCHAR(50),
    errortime   VARCHAR(50),
    equipmentid VARCHAR(50),
    factory     VARCHAR(1),
    process     VARCHAR(50),
    CONSTRAINT pk_ldi_alarm_data PRIMARY KEY (logdate, logid)
);

SELECT create_hypertable('public.ldi_alarm_log', 'logdate',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_ldi_alarm_logid
    ON public.ldi_alarm_log (logid ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS ldi_alarm_log_logdate_idx
    ON public.ldi_alarm_log (logdate DESC NULLS FIRST);

GRANT SELECT ON public.ldi_alarm_log TO grafana_reader;
