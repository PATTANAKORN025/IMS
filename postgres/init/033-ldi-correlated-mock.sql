-- 033-ldi-correlated-mock.sql
-- Intelligent, correlated mock data for 4 machines over 24 hours
-- Correlation logic: temperature drift → scale drift → PE spike
-- State logic: 5% chance of state=false → scan_speed=0, air_vacuum=0

-- Clear existing mock data
TRUNCATE TABLE public.ldi_data;

DO $$
DECLARE
    t TIMESTAMP;
    eqp VARCHAR;
    mo_val VARCHAR;
    fpn_val VARCHAR;
    layer_val VARCHAR;
    resist_val VARCHAR;
    temp_base FLOAT;
    hum_base FLOAT;
    scale_x_val FLOAT;
    scale_y_val FLOAT;
    pe_base FLOAT;
    state_val BOOLEAN;
    scan_val FLOAT;
    vacuum_val FLOAT;
    thick_val FLOAT;
    dosage_val FLOAT;
    board_val SMALLINT;
    total_val SMALLINT;
    total_time_val FLOAT;
    pe_s FLOAT;
    je_s FLOAT;
BEGIN
    -- Loop over 24 hours, 1-minute intervals
    FOR i IN 0..1439 LOOP
        t := NOW() - INTERVAL '24 hours' + (i * INTERVAL '1 minute') + (random() * INTERVAL '500 milliseconds');

        -- Cycle through 4 machines
        FOR m IN 1..4 LOOP
            eqp := CASE m
                WHEN 1 THEN 'LDIA-01'
                WHEN 2 THEN 'LDIA-02'
                WHEN 3 THEN 'LDI-C-01'
                WHEN 4 THEN 'LDI-C-02'
            END;

            -- State logic: 5% chance of downtime
            state_val := random() > 0.05;

            -- Job context (cycle through jobs)
            mo_val := 'MO-' || (1000 + (i / 60 + m)::INT)::TEXT;
            fpn_val := 'FPN-' || LPAD(((i / 120 + m) % 20 + 1)::TEXT, 3, '0');
            layer_val := CASE WHEN random() > 0.5 THEN 'Top Copper' ELSE 'Solder Mask' END;
            resist_val := 'SR-500 ' || CASE WHEN random() > 0.5 THEN 'G22' ELSE 'HB18' END;

            -- Base temperature (22°C ± 0.5 normally)
            temp_base := 22.0 + (random() - 0.5) * 1.0;
            hum_base := 55.0 + (random() - 0.5) * 5.0;

            -- ANOMALY: LDIA-02 thermal drift between hour 20-21 (NOW-4h to NOW-3h)
            IF eqp = 'LDIA-02' AND i >= 1200 AND i < 1260 THEN
                -- Ramping temperature from 22 to 25.5 over 60 minutes
                temp_base := 22.0 + ((i - 1200)::FLOAT / 60.0) * 3.5;
                hum_base := 55.0 + ((i - 1200)::FLOAT / 60.0) * 10.0;
            END IF;

            -- Scale drift follows temperature (thermal expansion)
            scale_x_val := 1.0 + (temp_base - 22.0) * 0.0005 + (random() - 0.5) * 0.0001;
            scale_y_val := 1.0 + (temp_base - 22.0) * 0.0004 + (random() - 0.5) * 0.0001;

            -- PE base: normally ±2, drifts with scale deviation
            pe_base := ABS(scale_x_val - 1.0) * 10000 + ABS(scale_y_val - 1.0) * 10000;

            -- Process parameters
            scan_val := CASE WHEN state_val THEN 115.0 + (random() - 0.5) * 5.0 ELSE 0 END;
            vacuum_val := CASE WHEN state_val THEN 0.0 ELSE 0 END;
            thick_val := 1.0 + (random() - 0.5) * 0.3;
            dosage_val := 500.0 + (random() - 0.5) * 20;
            board_val := (i % 120 + 1)::SMALLINT;
            total_val := 120::SMALLINT;
            total_time_val := 15.0 + random() * 5;

            -- PE values: normal ±2, anomaly LDIA-02 drifts to ±25
            pe_s := pe_base * 0.3;
            je_s := pe_base * 0.15;

            INSERT INTO public.ldi_data (
                "time", factory, process, eqp_id, mo, fpn, layer_name,
                resist_dosage, scale_x, scale_y, temperature, humidity,
                scan_speed, air_vacuum, thickness, board_no, total_board,
                total_time, filmno, board_id, resist, state, scale_mode,
                pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
                je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id
            ) VALUES (
                t, '3', 'SM', eqp, mo_val, fpn_val, layer_val,
                dosage_val, scale_x_val, scale_y_val, temp_base, hum_base,
                scan_val, vacuum_val, thick_val, board_val, total_val,
                total_time_val, NULL, NULL, resist_val, state_val, 'Auto',
                pe_s + (random() - 0.5) * 4, pe_s + (random() - 0.5) * 4,
                pe_s + (random() - 0.5) * 4, pe_s + (random() - 0.5) * 4,
                pe_s + (random() - 0.5) * 4, pe_s + (random() - 0.5) * 4,
                je_s + (random() - 0.5) * 2, je_s + (random() - 0.5) * 2,
                je_s + (random() - 0.5) * 2, je_s + (random() - 0.5) * 2,
                25.0, 25.0,
                gen_random_uuid()::VARCHAR
            );

            -- Insert correlated alarms for LDIA-02 during thermal drift
            IF eqp = 'LDIA-02' AND i >= 1200 AND i < 1260 AND (i - 1200) % 10 = 0 THEN
                INSERT INTO public.ldi_alarm_log (
                    logid, logdate, errorcode, errortime, equipmentid, factory, process
                ) VALUES (
                    gen_random_uuid()::VARCHAR, t,
                    '0C05003E', TO_CHAR(t, 'YYYYMMDDHH24MISS') || '000',
                    'LDIA-02', '3', 'SM'
                ) ON CONFLICT DO NOTHING;
            END IF;

            -- Insert correlated alarms for temperature drift
            IF eqp = 'LDIA-02' AND i >= 1200 AND i < 1260 AND temp_base > 24.5 AND (i - 1200) % 5 = 0 THEN
                INSERT INTO public.ldi_alarm_log (
                    logid, logdate, errorcode, errortime, equipmentid, factory, process
                ) VALUES (
                    gen_random_uuid()::VARCHAR, t,
                    '0C050065', TO_CHAR(t, 'YYYYMMDDHH24MISS') || '000',
                    'LDIA-02', '3', 'SM'
                ) ON CONFLICT DO NOTHING;
            END IF;

        END LOOP;
    END LOOP;
END $$;

-- Verify
SELECT eqp_id, COUNT(*) AS rows,
       MIN("time") AS earliest, MAX("time") AS latest
FROM public.ldi_data GROUP BY eqp_id ORDER BY eqp_id;
