-- Migration 093: Ingest Staging Replay Worker Function
-- Idempotent: safe to re-run
-- Provides atomic, durable, and idempotent replay of pending batches in ingest_staging
-- (resolves the open gap from migration 081 where stalled batches were staged but never replayed).

CREATE OR REPLACE FUNCTION public.replay_staged_batches(p_limit INT DEFAULT 500)
RETURNS TABLE (
    replayed_batches INT,
    replayed_data_rows INT,
    replayed_alarm_rows INT,
    failed_batches INT
) LANGUAGE plpgsql AS $$
DECLARE
    r RECORD;
    v_batches INT := 0;
    v_data_rows INT := 0;
    v_alarm_rows INT := 0;
    v_failed INT := 0;
    v_count INT;
BEGIN
    FOR r IN (
        SELECT id, target_table, payload
        FROM public.ingest_staging
        WHERE status = 'pending'
        ORDER BY staged_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    ) LOOP
        BEGIN
            IF r.target_table = 'ldi_data' THEN
                INSERT INTO public.ldi_data (
                    time, factory, process, eqp_id, mo, fpn, layer_name, resist_dosage, scale_x, scale_y,
                    temperature, humidity, scan_speed, air_vacuum, thickness, board_no, total_board,
                    total_time, filmno, board_id, resist, state, scale_mode,
                    pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
                    je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id, ingest_ts
                )
                SELECT
                    r_rec.time::timestamptz, r_rec.factory, r_rec.process, r_rec.eqp_id, r_rec.mo, r_rec.fpn, r_rec.layer_name,
                    r_rec.resist_dosage, r_rec.scale_x, r_rec.scale_y, r_rec.temperature, r_rec.humidity, r_rec.scan_speed,
                    r_rec.air_vacuum, r_rec.thickness, r_rec.board_no, r_rec.total_board, r_rec.total_time, r_rec.filmno,
                    r_rec.board_id, r_rec.resist, r_rec.state, r_rec.scale_mode,
                    r_rec.pe_1, r_rec.pe_2, r_rec.pe_3, r_rec.pe_4, r_rec.pe_5, r_rec.pe_6,
                    r_rec.je_1, r_rec.je_2, r_rec.je_3, r_rec.je_4, r_rec.pe_setting, r_rec.je_setting, r_rec.log_id,
                    clock_timestamp()
                FROM jsonb_to_recordset(r.payload) AS r_rec(
                    time text, factory text, process text, eqp_id text, mo text, fpn text, layer_name text, resist_dosage real, scale_x real, scale_y real,
                    temperature real, humidity real, scan_speed real, air_vacuum real, thickness real, board_no int, total_board int,
                    total_time real, filmno text, board_id text, resist text, state boolean, scale_mode text,
                    pe_1 real, pe_2 real, pe_3 real, pe_4 real, pe_5 real, pe_6 real,
                    je_1 real, je_2 real, je_3 real, je_4 real, pe_setting real, je_setting real, log_id text
                )
                ON CONFLICT (log_id, "time") DO NOTHING;
                GET DIAGNOSTICS v_count = ROW_COUNT;
                v_data_rows := v_data_rows + v_count;

            ELSIF r.target_table = 'ldi_alarm_log' THEN
                INSERT INTO public.ldi_alarm_log (
                    logid, logdate, errorcode, errortime, equipmentid, factory, process, related_log_id, link_basis, ingest_ts
                )
                SELECT
                    r_rec.logid, r_rec.logdate::timestamptz, r_rec.errorcode, r_rec.errortime::timestamptz, r_rec.equipmentid,
                    r_rec.factory, r_rec.process, r_rec.related_log_id, r_rec.link_basis, clock_timestamp()
                FROM jsonb_to_recordset(r.payload) AS r_rec(
                    logid text, logdate text, errorcode text, errortime text, equipmentid text, factory text, process text, related_log_id text, link_basis text
                )
                ON CONFLICT (logdate, logid) DO NOTHING;
                GET DIAGNOSTICS v_count = ROW_COUNT;
                v_alarm_rows := v_alarm_rows + v_count;
            END IF;

            UPDATE public.ingest_staging
            SET status = 'committed', committed_at = clock_timestamp(), attempts = attempts + 1
            WHERE id = r.id;

            v_batches := v_batches + 1;

        EXCEPTION WHEN OTHERS THEN
            v_failed := v_failed + 1;
            UPDATE public.ingest_staging
            SET attempts = attempts + 1, last_error = SUBSTRING(SQLERRM, 1, 500)
            WHERE id = r.id;
        END;
    END LOOP;

    RETURN QUERY SELECT v_batches, v_data_rows, v_alarm_rows, v_failed;
END;
$$;

COMMENT ON FUNCTION public.replay_staged_batches(INT) IS
    'Durable replay worker for public.ingest_staging. Replays up to p_limit pending batches with ON CONFLICT DO NOTHING and marks them committed.';
