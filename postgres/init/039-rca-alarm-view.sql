CREATE OR REPLACE VIEW v_ldi_alarm_context AS
SELECT 
    a.logdate AS alarm_time,
    a.equipmentid AS eqp_id,
    a.errorcode,
    m.alarm_msg,
    d.temperature,
    d.humidity,
    d.air_vacuum,
    d.pe_1,
    d.je_1,
    (d.temperature < 20 OR d.temperature > 24 OR d.humidity < 50 OR d.humidity > 60) AS flag_temp_out_of_spec,
    (d.air_vacuum > -50 OR d.air_vacuum < -95) AS flag_vac_out_of_spec,
    (ABS(d.pe_1) > 10 OR ABS(d.je_1) > 10) AS flag_pe_out_of_spec
FROM ldi_alarm_log a
LEFT JOIN ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
LEFT JOIN LATERAL (
    SELECT temperature, humidity, air_vacuum, pe_1, je_1
    FROM ldi_data d
    WHERE d.eqp_id = a.equipmentid
      AND d.time <= a.logdate
      AND d.time >= a.logdate - INTERVAL '5 minutes'
    ORDER BY d.time DESC
    LIMIT 1
) d ON true;
