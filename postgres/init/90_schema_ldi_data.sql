-- LDI telemetry table (production DDL)
-- Source: ldi_data.sql

-- Table: public.ldi_data

-- DROP TABLE IF EXISTS public.ldi_data;

CREATE TABLE IF NOT EXISTS public.ldi_data
(
    "time" timestamp with time zone NOT NULL,
    factory character varying(10) COLLATE pg_catalog."default" NOT NULL,
    process character varying(250) COLLATE pg_catalog."default" NOT NULL,
    eqp_id character varying(250) COLLATE pg_catalog."default" NOT NULL,
    mo character varying(50) COLLATE pg_catalog."default" NOT NULL,
    fpn character varying(50) COLLATE pg_catalog."default" NOT NULL,
    layer_name character varying(250) COLLATE pg_catalog."default" NOT NULL,
    resist_dosage double precision,
    scale_x double precision,
    scale_y double precision,
    temperature double precision,
    humidity double precision,
    scan_speed double precision,
    air_vacuum double precision,
    thickness double precision,
    board_no smallint,
    total_board smallint,
    total_time double precision,
    filmno character varying(250) COLLATE pg_catalog."default",
    board_id character varying(250) COLLATE pg_catalog."default",
    resist character varying(250) COLLATE pg_catalog."default",
    state boolean,
    scale_mode character varying(250) COLLATE pg_catalog."default",
    pe_1 double precision,
    pe_2 double precision,
    pe_3 double precision,
    pe_4 double precision,
    pe_5 double precision,
    pe_6 double precision,
    je_1 double precision,
    je_2 double precision,
    je_3 double precision,
    je_4 double precision,
    pe_setting double precision,
    je_setting double precision,
    log_id character varying(50) COLLATE pg_catalog."default" NOT NULL
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.ldi_data
    OWNER to postgres;

GRANT ALL ON TABLE public.ldi_data TO eap WITH GRANT OPTION;

GRANT ALL ON TABLE public.ldi_data TO postgres;
-- Index: idx_logid

-- DROP INDEX IF EXISTS public.idx_logid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_logid
    ON public.ldi_data USING btree
    (log_id COLLATE pg_catalog."default" ASC NULLS LAST, "time" DESC NULLS FIRST)
    TABLESPACE pg_default;
-- Index: ldi_data_time_idx

-- DROP INDEX IF EXISTS public.ldi_data_time_idx;

CREATE INDEX IF NOT EXISTS ldi_data_time_idx
    ON public.ldi_data USING btree
    ("time" DESC NULLS FIRST)
    TABLESPACE pg_default;