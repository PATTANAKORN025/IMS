-- ══════════════════════════════════════════════════════════════
-- 020: LDI Production Schema (idempotent create-or-tune, never destroys data)
-- ══════════════════════════════════════════════════════════════
-- Originally written as an unconditional DROP TABLE ... CASCADE on all 3
-- tables below, then CREATE -- safe only during early development before
-- this project had any real accumulated data. Found still marked
-- "pre-seeded" in schema_migrations (i.e. never actually executed)
-- against a live database holding 284k+ real ldi_data rows and several
-- dependent views (world-class audit P1-1) -- a literal run at this point
-- would have silently destroyed all of it via CASCADE. Rewritten to only
-- CREATE what's missing and to TUNE an already-existing table in place
-- (ALTER COLUMN TYPE, set_chunk_time_interval) instead of dropping it.
-- Mirrors postgres/init/001-init-timescaledb.sql, which defines this same
-- tuned shape for genuinely fresh deployments -- keep both in sync.

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
    resist_dosage   REAL,
    scale_x         REAL,
    scale_y         REAL,
    temperature     REAL,
    humidity        REAL,
    scan_speed      REAL,
    air_vacuum      REAL,
    thickness       REAL,
    board_no        SMALLINT,
    total_board     SMALLINT,
    total_time      REAL,
    filmno          VARCHAR(250),
    board_id        VARCHAR(250),
    resist          VARCHAR(250),
    state           BOOLEAN,
    scale_mode      VARCHAR(250),
    pe_1            REAL,
    pe_2            REAL,
    pe_3            REAL,
    pe_4            REAL,
    pe_5            REAL,
    pe_6            REAL,
    je_1            REAL,
    je_2            REAL,
    je_3            REAL,
    je_4            REAL,
    pe_setting      REAL,
    je_setting      REAL,
    log_id          VARCHAR(50)     NOT NULL
);

SELECT create_hypertable('public.ldi_data', 'time',
    chunk_time_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);

-- Tune an already-existing table (e.g. one created back when this schema
-- used DOUBLE PRECISION / 1-day chunks) in place. ALTER COLUMN ... TYPE to
-- an already-matching type, and set_chunk_time_interval to an
-- already-matching interval, are both no-ops -- safe to re-run.
ALTER TABLE public.ldi_data
    ALTER COLUMN resist_dosage TYPE REAL,
    ALTER COLUMN scale_x       TYPE REAL,
    ALTER COLUMN scale_y       TYPE REAL,
    ALTER COLUMN temperature   TYPE REAL,
    ALTER COLUMN humidity      TYPE REAL,
    ALTER COLUMN scan_speed    TYPE REAL,
    ALTER COLUMN air_vacuum    TYPE REAL,
    ALTER COLUMN thickness     TYPE REAL,
    ALTER COLUMN total_time    TYPE REAL,
    ALTER COLUMN pe_1          TYPE REAL,
    ALTER COLUMN pe_2          TYPE REAL,
    ALTER COLUMN pe_3          TYPE REAL,
    ALTER COLUMN pe_4          TYPE REAL,
    ALTER COLUMN pe_5          TYPE REAL,
    ALTER COLUMN pe_6          TYPE REAL,
    ALTER COLUMN je_1          TYPE REAL,
    ALTER COLUMN je_2          TYPE REAL,
    ALTER COLUMN je_3          TYPE REAL,
    ALTER COLUMN je_4          TYPE REAL,
    ALTER COLUMN pe_setting    TYPE REAL,
    ALTER COLUMN je_setting    TYPE REAL;

SELECT set_chunk_time_interval('public.ldi_data', INTERVAL '1 hour');

CREATE UNIQUE INDEX IF NOT EXISTS idx_logid
    ON public.ldi_data (log_id ASC NULLS LAST, "time" DESC NULLS FIRST);
CREATE INDEX IF NOT EXISTS ldi_data_time_idx
    ON public.ldi_data ("time" DESC NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_ldi_data_eqp_time
    ON public.ldi_data (eqp_id, "time" DESC);
CREATE INDEX IF NOT EXISTS idx_ldi_data_spc_ranking
    ON public.ldi_data (eqp_id, mo, fpn, "time" DESC);
CREATE INDEX IF NOT EXISTS idx_ldi_data_layer
    ON public.ldi_data (layer_name);

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
CREATE INDEX IF NOT EXISTS idx_ldi_alarm_equip_time
    ON public.ldi_alarm_log (equipmentid, logdate DESC);
CREATE INDEX IF NOT EXISTS idx_ldi_alarm_errorcode
    ON public.ldi_alarm_log (errorcode);

GRANT SELECT ON public.ldi_alarm_log TO grafana_reader;
