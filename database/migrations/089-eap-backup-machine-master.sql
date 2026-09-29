-- Migration 089: drilling machine registry (eap_backup)
-- Target Database: eap_backup
--
-- public.machine_master maps each drilling equipment_id to its factory. The
-- Fleet Overview dashboard LEFT JOINs it: the card label reads "F<factory> -
-- <machine>" and the factory variable filters on it. A machine with events but
-- no row here still appears (as "F?"), so an unregistered machine is visible,
-- not silently dropped.
--
-- Schema only. The rows are plant data and are loaded on the server, e.g.
--   INSERT INTO public.machine_master (equipment_id, factory)
--   SELECT 'DRL' || LPAD(i::text, 3, '0') || '-M', '<factory>'
--   FROM generate_series(1, <count>) s(i)
--   ON CONFLICT (equipment_id) DO NOTHING;
-- The mock generator (scripts/mock/eap-mock-data.js) fills it for mock data.

SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'eap_backup') AS has_eap_backup \gset
\if :has_eap_backup
\connect eap_backup

CREATE TABLE IF NOT EXISTS public.machine_master (
    equipment_id VARCHAR(100) NOT NULL,
    brand        VARCHAR(50),
    model        VARCHAR(50),
    factory      VARCHAR(5),
    CONSTRAINT pk_machine_master PRIMARY KEY (equipment_id)
);
COMMENT ON TABLE public.machine_master IS
    'Drilling machine registry: factory, brand, model per equipment_id. Read by the Drilling Fleet Overview (factory label and filter). Migration 089.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_reader') THEN
        GRANT SELECT ON public.machine_master TO grafana_reader;
    END IF;
END
$$;

\else
\echo 'IMS_MIGRATION_DEFERRED 089: database eap_backup not present on this server; runs again on the next start'
\endif
