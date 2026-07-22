-- LDI alarm code lookup table (production DDL)
-- Source: ldi_alarm_ms_code.sql

-- Table: public.ldi_alarm_ms_code

-- DROP TABLE IF EXISTS public.ldi_alarm_ms_code;

CREATE TABLE IF NOT EXISTS public.ldi_alarm_ms_code
(
    alarm_id character varying(15) COLLATE pg_catalog."default" NOT NULL,
    alarm_type character varying(50) COLLATE pg_catalog."default",
    alarm_code character varying(50) COLLATE pg_catalog."default",
    alarm_msg character varying(500) COLLATE pg_catalog."default",
    alarm_detail character varying(500) COLLATE pg_catalog."default",
    CONSTRAINT ldi_alarm_ms_code_pkey PRIMARY KEY (alarm_id)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.ldi_alarm_ms_code
    OWNER to eap;

REVOKE ALL ON TABLE public.ldi_alarm_ms_code FROM eap;

GRANT INSERT, DELETE, SELECT, UPDATE ON TABLE public.ldi_alarm_ms_code TO eap;