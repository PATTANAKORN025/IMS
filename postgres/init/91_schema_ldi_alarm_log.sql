-- LDI alarm log table (production DDL)
-- Source: ldi_alarm_log.sql

-- Table: public.ldi_alarm_log

-- DROP TABLE IF EXISTS public.ldi_alarm_log;

CREATE TABLE IF NOT EXISTS public.ldi_alarm_log
(
    logid character varying(50) COLLATE pg_catalog."default" NOT NULL,
    logdate timestamp with time zone NOT NULL,
    errorcode character varying(50) COLLATE pg_catalog."default",
    errortime character varying(50) COLLATE pg_catalog."default",
    equipmentid character varying(50) COLLATE pg_catalog."default",
    factory character varying(1) COLLATE pg_catalog."default",
    process character varying(50) COLLATE pg_catalog."default",
    CONSTRAINT pk_ldi_alarm_data PRIMARY KEY (logdate, logid)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.ldi_alarm_log
    OWNER to admin;

REVOKE ALL ON TABLE public.ldi_alarm_log FROM eap;

GRANT ALL ON TABLE public.ldi_alarm_log TO admin;

GRANT INSERT, DELETE, SELECT, UPDATE ON TABLE public.ldi_alarm_log TO eap;
-- Index: idx_ldi_alarm_logid

-- DROP INDEX IF EXISTS public.idx_ldi_alarm_logid;

CREATE INDEX IF NOT EXISTS idx_ldi_alarm_logid
    ON public.ldi_alarm_log USING btree
    (logid COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: ldi_alarm_log_logdate_idx

-- DROP INDEX IF EXISTS public.ldi_alarm_log_logdate_idx;

CREATE INDEX IF NOT EXISTS ldi_alarm_log_logdate_idx
    ON public.ldi_alarm_log USING btree
    (logdate DESC NULLS FIRST)
    TABLESPACE pg_default;