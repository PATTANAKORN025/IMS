-- ============================================================================
-- Migration 088: O(1) latest state per LDI machine
--
-- v_ldi_machine_latest_full found each machine's newest ldi_data row with a
-- LATERAL "ORDER BY time DESC LIMIT 1" per enabled device. Every call planned
-- against every chunk of the hypertable (planning alone took ~0.4 s at 700k
-- rows) and the cost grew with the table; the Andon board calls it every
-- 5 seconds and Easy Overview on every refresh.
--
-- public.ldi_machine_last_state keeps one row per machine, upserted by an
-- AFTER INSERT trigger on ldi_data. The view reads that table instead, with
-- the same columns in the same order, so no dashboard changes.
--
-- * Out-of-order rows (a replayed or late batch) only overwrite the stored row
--   when they are at least as new -- the WHERE on the upsert.
-- * Duplicates skipped by the ingestion's ON CONFLICT DO NOTHING insert no row,
--   so the trigger does not fire for them.
-- * The trigger function is SECURITY DEFINER with a fixed search_path, so the
--   ingesting role (nodered_writer, migration 087) needs no privilege on the
--   state table.
-- * Columns are listed explicitly: a column added to ldi_data later is simply
--   not copied, instead of breaking every insert.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ldi_machine_last_state (
    LIKE public.ldi_data INCLUDING DEFAULTS
);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ldi_machine_last_state_pkey') THEN
        ALTER TABLE public.ldi_machine_last_state ADD CONSTRAINT ldi_machine_last_state_pkey PRIMARY KEY (eqp_id);
    END IF;
END
$$;
COMMENT ON TABLE public.ldi_machine_last_state IS
    'Newest ldi_data row per eqp_id, maintained by trg_ldi_machine_last_state (migration 088). Read through v_ldi_machine_latest_full.';

CREATE OR REPLACE FUNCTION public.f_ldi_machine_last_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO public.ldi_machine_last_state ("time", factory, process, eqp_id, mo, fpn, layer_name, resist_dosage, scale_x, scale_y, temperature, humidity, scan_speed, air_vacuum, thickness, board_no, total_board, total_time, filmno, board_id, resist, state, scale_mode, pe_1, pe_2, pe_3, pe_4, pe_5, pe_6, je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id)
    VALUES (NEW."time", NEW.factory, NEW.process, NEW.eqp_id, NEW.mo, NEW.fpn, NEW.layer_name, NEW.resist_dosage, NEW.scale_x, NEW.scale_y, NEW.temperature, NEW.humidity, NEW.scan_speed, NEW.air_vacuum, NEW.thickness, NEW.board_no, NEW.total_board, NEW.total_time, NEW.filmno, NEW.board_id, NEW.resist, NEW.state, NEW.scale_mode, NEW.pe_1, NEW.pe_2, NEW.pe_3, NEW.pe_4, NEW.pe_5, NEW.pe_6, NEW.je_1, NEW.je_2, NEW.je_3, NEW.je_4, NEW.pe_setting, NEW.je_setting, NEW.log_id)
    ON CONFLICT (eqp_id) DO UPDATE
        SET "time" = EXCLUDED."time",
            factory = EXCLUDED.factory,
            process = EXCLUDED.process,
            mo = EXCLUDED.mo,
            fpn = EXCLUDED.fpn,
            layer_name = EXCLUDED.layer_name,
            resist_dosage = EXCLUDED.resist_dosage,
            scale_x = EXCLUDED.scale_x,
            scale_y = EXCLUDED.scale_y,
            temperature = EXCLUDED.temperature,
            humidity = EXCLUDED.humidity,
            scan_speed = EXCLUDED.scan_speed,
            air_vacuum = EXCLUDED.air_vacuum,
            thickness = EXCLUDED.thickness,
            board_no = EXCLUDED.board_no,
            total_board = EXCLUDED.total_board,
            total_time = EXCLUDED.total_time,
            filmno = EXCLUDED.filmno,
            board_id = EXCLUDED.board_id,
            resist = EXCLUDED.resist,
            state = EXCLUDED.state,
            scale_mode = EXCLUDED.scale_mode,
            pe_1 = EXCLUDED.pe_1,
            pe_2 = EXCLUDED.pe_2,
            pe_3 = EXCLUDED.pe_3,
            pe_4 = EXCLUDED.pe_4,
            pe_5 = EXCLUDED.pe_5,
            pe_6 = EXCLUDED.pe_6,
            je_1 = EXCLUDED.je_1,
            je_2 = EXCLUDED.je_2,
            je_3 = EXCLUDED.je_3,
            je_4 = EXCLUDED.je_4,
            pe_setting = EXCLUDED.pe_setting,
            je_setting = EXCLUDED.je_setting,
            log_id = EXCLUDED.log_id
        WHERE public.ldi_machine_last_state."time" <= EXCLUDED."time";
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.f_ldi_machine_last_state() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_ldi_machine_last_state ON public.ldi_data;
CREATE TRIGGER trg_ldi_machine_last_state
    AFTER INSERT ON public.ldi_data
    FOR EACH ROW EXECUTE FUNCTION public.f_ldi_machine_last_state();

-- Backfill after the trigger exists, with the same "only if newer" rule, so a
-- row inserted while this runs is not lost either way.
INSERT INTO public.ldi_machine_last_state ("time", factory, process, eqp_id, mo, fpn, layer_name, resist_dosage, scale_x, scale_y, temperature, humidity, scan_speed, air_vacuum, thickness, board_no, total_board, total_time, filmno, board_id, resist, state, scale_mode, pe_1, pe_2, pe_3, pe_4, pe_5, pe_6, je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id)
SELECT DISTINCT ON (eqp_id) "time", factory, process, eqp_id, mo, fpn, layer_name, resist_dosage, scale_x, scale_y, temperature, humidity, scan_speed, air_vacuum, thickness, board_no, total_board, total_time, filmno, board_id, resist, state, scale_mode, pe_1, pe_2, pe_3, pe_4, pe_5, pe_6, je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id
FROM public.ldi_data
ORDER BY eqp_id, "time" DESC
ON CONFLICT (eqp_id) DO UPDATE
    SET "time" = EXCLUDED."time",
            factory = EXCLUDED.factory,
            process = EXCLUDED.process,
            mo = EXCLUDED.mo,
            fpn = EXCLUDED.fpn,
            layer_name = EXCLUDED.layer_name,
            resist_dosage = EXCLUDED.resist_dosage,
            scale_x = EXCLUDED.scale_x,
            scale_y = EXCLUDED.scale_y,
            temperature = EXCLUDED.temperature,
            humidity = EXCLUDED.humidity,
            scan_speed = EXCLUDED.scan_speed,
            air_vacuum = EXCLUDED.air_vacuum,
            thickness = EXCLUDED.thickness,
            board_no = EXCLUDED.board_no,
            total_board = EXCLUDED.total_board,
            total_time = EXCLUDED.total_time,
            filmno = EXCLUDED.filmno,
            board_id = EXCLUDED.board_id,
            resist = EXCLUDED.resist,
            state = EXCLUDED.state,
            scale_mode = EXCLUDED.scale_mode,
            pe_1 = EXCLUDED.pe_1,
            pe_2 = EXCLUDED.pe_2,
            pe_3 = EXCLUDED.pe_3,
            pe_4 = EXCLUDED.pe_4,
            pe_5 = EXCLUDED.pe_5,
            pe_6 = EXCLUDED.pe_6,
            je_1 = EXCLUDED.je_1,
            je_2 = EXCLUDED.je_2,
            je_3 = EXCLUDED.je_3,
            je_4 = EXCLUDED.je_4,
            pe_setting = EXCLUDED.pe_setting,
            je_setting = EXCLUDED.je_setting,
            log_id = EXCLUDED.log_id
    WHERE public.ldi_machine_last_state."time" <= EXCLUDED."time";

GRANT SELECT ON public.ldi_machine_last_state TO grafana_reader;

CREATE OR REPLACE VIEW public.v_ldi_machine_latest_full AS
  SELECT dev.device_id AS eqp_id,
     dev.hostname,
     dev.location,
     dev.enabled,
     latest.eqp_id IS NOT NULL AS has_data,
     latest.eqp_id IS NOT NULL AND latest."time" < (now() - '00:05:00'::interval) AS is_stale,
     latest."time",
     latest.factory,
     latest.process,
     latest.mo,
     latest.fpn,
     latest.layer_name,
     latest.state,
     latest.board_no,
     latest.total_board,
     latest.total_time,
     latest.board_id,
     latest.filmno,
     latest.resist,
     latest.scale_mode,
     latest.temperature,
     latest.humidity,
     latest.scan_speed,
     latest.air_vacuum,
     latest.thickness,
     latest.resist_dosage,
     latest.scale_x,
     latest.scale_y,
     latest.pe_1,
     latest.pe_2,
     latest.pe_3,
     latest.pe_4,
     latest.pe_5,
     latest.pe_6,
     latest.je_1,
     latest.je_2,
     latest.je_3,
     latest.je_4,
     latest.pe_setting,
     latest.je_setting,
     latest.log_id
    FROM public.devices dev
      LEFT JOIN public.ldi_machine_last_state latest ON latest.eqp_id::text = dev.device_id
   WHERE dev.device_type = 'ldi'::text AND dev.enabled;
GRANT SELECT ON public.v_ldi_machine_latest_full TO grafana_reader;
