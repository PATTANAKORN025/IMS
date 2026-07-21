-- ══════════════════════════════════════════════════════════════
-- Migration 027: SPC Statistical Engine + Continuous Aggregates
-- Transforms LDI from monitoring to Engineering Analytics Platform.
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- 1. CONTINUOUS AGGREGATE: ldi_hourly
-- Pre-computed hourly rollups for dashboard performance.
-- ══════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW IF NOT EXISTS public.ldi_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', "time") AS bucket,
    eqp_id,
    ROUND(AVG(temperature)::NUMERIC, 2) AS avg_temperature,
    ROUND(AVG(humidity)::NUMERIC, 2) AS avg_humidity,
    ROUND(AVG(scan_speed)::NUMERIC, 1) AS avg_scan_speed,
    ROUND(AVG(resist_dosage)::NUMERIC, 1) AS avg_resist_dosage,
    ROUND(AVG(air_vacuum)::NUMERIC, 2) AS avg_air_vacuum,
    ROUND(AVG(thickness)::NUMERIC, 3) AS avg_thickness,
    ROUND(MAX(temperature)::NUMERIC, 2) AS max_temperature,
    ROUND(MIN(temperature)::NUMERIC, 2) AS min_temperature,
    ROUND(MAX(humidity)::NUMERIC, 2) AS max_humidity,
    ROUND(MIN(humidity)::NUMERIC, 2) AS min_humidity,
    ROUND(AVG((COALESCE(pe_1,0)+COALESCE(pe_2,0)+COALESCE(pe_3,0)+COALESCE(pe_4,0)+COALESCE(pe_5,0)+COALESCE(pe_6,0))/NULLIF(CASE WHEN pe_1 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN pe_2 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN pe_3 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN pe_4 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN pe_5 IS NOT NULL THEN 1 ELSE 0 END+CASE WHEN pe_6 IS NOT NULL THEN 1 ELSE 0 END, 0))::NUMERIC, 3) AS avg_pe,
    ROUND(MAX(GREATEST(ABS(COALESCE(pe_1,0)), ABS(COALESCE(pe_2,0)), ABS(COALESCE(pe_3,0)), ABS(COALESCE(pe_4,0)), ABS(COALESCE(pe_5,0)), ABS(COALESCE(pe_6,0))))::NUMERIC, 2) AS max_abs_pe,
    ROUND(AVG(total_time / NULLIF(total_board, 0))::NUMERIC, 2) AS avg_cycle_time,
    COUNT(DISTINCT eqp_id) AS machine_count
FROM public.ldi_data
WHERE pe_1 IS NOT NULL
GROUP BY time_bucket('1 hour', "time"), eqp_id
WITH NO DATA;

-- ══════════════════════════════════════════════════════════════
-- 2. SPC FUNCTION: Cp, Cpk, Pp, Ppk
-- ══════════════════════════════════════════════════════════════

-- 2a. Cp = (USL - LSL) / (6 * sigma)
-- 2b. Cpk = min((USL - mean) / (3*sigma), (mean - LSL) / (3*sigma))
-- For PE: LSL = -pe_setting, USL = +pe_setting
CREATE OR REPLACE FUNCTION public.calc_pe_capability(
    p_eqp_id VARCHAR,
    p_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
    eqp_id VARCHAR,
    sample_count BIGINT,
    mean_pe NUMERIC,
    stddev_pe NUMERIC,
    cp NUMERIC,
    cpk NUMERIC,
    sigma_level NUMERIC,
    spec_upper NUMERIC,
    spec_lower NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT d.eqp_id,
               GREATEST(ABS(COALESCE(d.pe_1,0)), ABS(COALESCE(d.pe_2,0)),
                         ABS(COALESCE(d.pe_3,0)), ABS(COALESCE(d.pe_4,0)),
                         ABS(COALESCE(d.pe_5,0)), ABS(COALESCE(d.pe_6,0))) AS max_pe,
               COALESCE(d.pe_setting, 25.0) AS setting
        FROM public.ldi_data d
        WHERE d.eqp_id = p_eqp_id
          AND d."time" >= NOW() - (p_minutes || ' minutes')::INTERVAL
          AND d.pe_1 IS NOT NULL
    ),
    stats AS (
        SELECT b.eqp_id,
               AVG(b.max_pe) AS mu,
               STDDEV(b.max_pe) AS sigma,
               AVG(b.setting) AS setting_val,
               COUNT(*) AS cnt
        FROM base b
        GROUP BY b.eqp_id
    )
    SELECT s.eqp_id::VARCHAR,
           s.cnt AS sample_count,
           ROUND(s.mu::NUMERIC, 3) AS mean_pe,
           ROUND(s.sigma::NUMERIC, 3) AS stddev_pe,
           ROUND((s.setting_val * 2 / NULLIF(6 * s.sigma, 0))::NUMERIC, 3) AS cp,
           ROUND((LEAST((s.setting_val - s.mu) / NULLIF(3 * s.sigma, 0),
                         (s.mu - (-s.setting_val)) / NULLIF(3 * s.sigma, 0)))::NUMERIC, 3) AS cpk,
           ROUND((2 * LEAST((s.setting_val - s.mu) / NULLIF(3 * s.sigma, 0),
                           (s.mu - (-s.setting_val)) / NULLIF(3 * s.sigma, 0)) + 1.5)::NUMERIC, 2) AS sigma_level,
           ROUND(s.setting_val::NUMERIC, 1) AS spec_upper,
           ROUND((-s.setting_val)::NUMERIC, 1) AS spec_lower
    FROM stats s
    WHERE s.sigma > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- ══════════════════════════════════════════════════════════════
-- 3. SPC FUNCTION: EWMA (Exponentially Weighted Moving Average)
-- EWMA_t = lambda * X_t + (1 - lambda) * EWMA_{t-1}
-- λ = 0.2 (standard for manufacturing SPC)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.calc_ewma(
    p_eqp_id VARCHAR,
    p_lambda NUMERIC DEFAULT 0.2,
    p_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
    "time" TIMESTAMPTZ,
    eqp_id VARCHAR,
    raw_value NUMERIC,
    ewma_value NUMERIC,
    ucl NUMERIC,
    lcl NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH raw_data AS (
        SELECT d."time", d.eqp_id,
               GREATEST(ABS(COALESCE(d.pe_1,0)), ABS(COALESCE(d.pe_2,0)),
                         ABS(COALESCE(d.pe_3,0)), ABS(COALESCE(d.pe_4,0)),
                         ABS(COALESCE(d.pe_5,0)), ABS(COALESCE(d.pe_6,0))) AS max_pe
        FROM public.ldi_data d
        WHERE d.eqp_id = p_eqp_id
          AND d."time" >= NOW() - (p_minutes || ' minutes')::INTERVAL
          AND d.pe_1 IS NOT NULL
        ORDER BY d."time" ASC
    ),
    running_stats AS (
        SELECT rd."time", rd.eqp_id, rd.max_pe,
               AVG(rd.max_pe) OVER (ORDER BY rd."time" ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS mu,
               STDDEV(rd.max_pe) OVER (ORDER BY rd."time" ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS sigma
        FROM raw_data rd
    ),
    ewma_calc AS (
        SELECT rs."time", rs.eqp_id, rs.max_pe,
               SUM((1 - p_lambda) ^ (ROW_NUMBER() OVER (ORDER BY rs."time") - 1) * rs.max_pe)
               OVER (ORDER BY rs."time") AS ewma_raw
        FROM running_stats rs
    )
    SELECT ec."time"::TIMESTAMPTZ,
           ec.eqp_id::VARCHAR,
           ROUND(ec.max_pe::NUMERIC, 3) AS raw_value,
           ROUND(ec.ewma_raw::NUMERIC, 3) AS ewma_value,
           ROUND((25.0 * SQRT(p_lambda / (2 - p_lambda)))::NUMERIC, 3) AS ucl,
           ROUND((-25.0 * SQRT(p_lambda / (2 - p_lambda)))::NUMERIC, 3) AS lcl
    FROM ewma_calc ec
    ORDER BY ec."time" ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ══════════════════════════════════════════════════════════════
-- 4. SPC FUNCTION: CUSUM (Cumulative Sum)
-- Detects small persistent shifts in process mean.
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.calc_cusum(
    p_eqp_id VARCHAR,
    p_target NUMERIC DEFAULT 0.0,
    p_k NUMERIC DEFAULT 0.5,
    p_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
    "time" TIMESTAMPTZ,
    eqp_id VARCHAR,
    raw_value NUMERIC,
    cusum_pos NUMERIC,
    cusum_neg NUMERIC,
    alarm BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH raw_data AS (
        SELECT d."time", d.eqp_id,
               GREATEST(ABS(COALESCE(d.pe_1,0)), ABS(COALESCE(d.pe_2,0)),
                         ABS(COALESCE(d.pe_3,0)), ABS(COALESCE(d.pe_4,0)),
                         ABS(COALESCE(d.pe_5,0)), ABS(COALESCE(d.pe_6,0))) AS max_pe
        FROM public.ldi_data d
        WHERE d.eqp_id = p_eqp_id
          AND d."time" >= NOW() - (p_minutes || ' minutes')::INTERVAL
          AND d.pe_1 IS NOT NULL
        ORDER BY d."time" ASC
    )
    SELECT rd."time"::TIMESTAMPTZ,
           rd.eqp_id::VARCHAR,
           ROUND(rd.max_pe::NUMERIC, 3),
           ROUND(GREATEST(0, rd.max_pe - p_target - p_k) + COALESCE(
               LAG(GREATEST(0, rd.max_pe - p_target - p_k)) OVER (ORDER BY rd."time"), 0
           )::NUMERIC, 3),
           ROUND(GREATEST(0, p_target - rd.max_pe - p_k) + COALESCE(
               LAG(GREATEST(0, p_target - rd.max_pe - p_k)) OVER (ORDER BY rd."time"), 0
           )::NUMERIC, 3),
           (GREATEST(0, rd.max_pe - p_target - p_k) + COALESCE(
               LAG(GREATEST(0, rd.max_pe - p_target - p_k)) OVER (ORDER BY rd."time"), 0
           ) > 10 OR GREATEST(0, p_target - rd.max_pe - p_k) + COALESCE(
               LAG(GREATEST(0, p_target - rd.max_pe - p_k)) OVER (ORDER BY rd."time"), 0
           ) > 10)
    FROM raw_data rd
    ORDER BY rd."time" ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ══════════════════════════════════════════════════════════════
-- 5. MACHINE RANKING VIEW (by Cpk — best to worst)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_machine_spc_ranking AS
WITH base AS (
    SELECT eqp_id,
           GREATEST(ABS(COALESCE(pe_1,0)), ABS(COALESCE(pe_2,0)),
                     ABS(COALESCE(pe_3,0)), ABS(COALESCE(pe_4,0)),
                     ABS(COALESCE(pe_5,0)), ABS(COALESCE(pe_6,0))) AS max_pe,
           COALESCE(pe_setting, 25.0) AS setting
    FROM public.ldi_data
    WHERE pe_1 IS NOT NULL AND "time" > NOW() - INTERVAL '1 hour'
),
stats AS (
    SELECT eqp_id, AVG(max_pe) AS mu, STDDEV(max_pe) AS sigma,
           AVG(setting) AS setting_val, COUNT(*) AS sample_count
    FROM base GROUP BY eqp_id
)
SELECT s.eqp_id,
       s.sample_count,
       ROUND(s.mu::NUMERIC, 3) AS mean_pe,
       ROUND(s.sigma::NUMERIC, 3) AS stddev_pe,
       ROUND((s.setting_val * 2 / NULLIF(6 * s.sigma, 0))::NUMERIC, 3) AS cp,
       ROUND(LEAST((s.setting_val - s.mu) / NULLIF(3 * s.sigma, 0),
                     (s.mu - (-s.setting_val)) / NULLIF(3 * s.sigma, 0))::NUMERIC, 3) AS cpk,
       CASE
           WHEN s.sigma = 0 THEN 'Perfect'
           WHEN LEAST((s.setting_val - s.mu) / NULLIF(3 * s.sigma, 0),
                       (s.mu - (-s.setting_val)) / NULLIF(3 * s.sigma, 0)) >= 2.0 THEN 'World Class'
           WHEN LEAST((s.setting_val - s.mu) / NULLIF(3 * s.sigma, 0),
                       (s.mu - (-s.setting_val)) / NULLIF(3 * s.sigma, 0)) >= 1.67 THEN 'Excellent'
           WHEN LEAST((s.setting_val - s.mu) / NULLIF(3 * s.sigma, 0),
                       (s.mu - (-s.setting_val)) / NULLIF(3 * s.sigma, 0)) >= 1.33 THEN 'Capable'
           WHEN LEAST((s.setting_val - s.mu) / NULLIF(3 * s.sigma, 0),
                       (s.mu - (-s.setting_val)) / NULLIF(3 * s.sigma, 0)) >= 1.0 THEN 'Marginally Capable'
           ELSE 'Not Capable'
       END AS capability_class
FROM stats s
WHERE s.sigma > 0
ORDER BY cpk DESC;

-- ══════════════════════════════════════════════════════════════
-- 6. PROCESS STABILITY INDEX (Composite Score 0-100)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_process_stability AS
WITH temp_stats AS (
    SELECT eqp_id,
           AVG(temperature) AS temp_mu,
           STDDEV(temperature) AS temp_sigma
    FROM public.ldi_data WHERE "time" > NOW() - INTERVAL '1 hour'
    AND temperature IS NOT NULL GROUP BY eqp_id
),
hum_stats AS (
    SELECT eqp_id,
           AVG(humidity) AS hum_mu,
           STDDEV(humidity) AS hum_sigma
    FROM public.ldi_data WHERE "time" > NOW() - INTERVAL '1 hour'
    AND humidity IS NOT NULL GROUP BY eqp_id
),
pe_stats AS (
    SELECT eqp_id,
           AVG(GREATEST(ABS(COALESCE(pe_1,0)), ABS(COALESCE(pe_2,0)),
                        ABS(COALESCE(pe_3,0)), ABS(COALESCE(pe_4,0)),
                        ABS(COALESCE(pe_5,0)), ABS(COALESCE(pe_6,0)))) AS pe_mu,
           STDDEV(GREATEST(ABS(COALESCE(pe_1,0)), ABS(COALESCE(pe_2,0)),
                           ABS(COALESCE(pe_3,0)), ABS(COALESCE(pe_4,0)),
                           ABS(COALESCE(pe_5,0)), ABS(COALESCE(pe_6,0)))) AS pe_sigma
    FROM public.ldi_data WHERE "time" > NOW() - INTERVAL '1 hour'
    AND pe_1 IS NOT NULL GROUP BY eqp_id
)
SELECT
    COALESCE(t.eqp_id, h.eqp_id, pe.eqp_id) AS eqp_id,
    -- Temperature stability (0-33 points): lower sigma = more stable
    GREATEST(0, 33 - COALESCE(t.temp_sigma, 99) * 10)::NUMERIC(5,1) AS temp_score,
    -- Humidity stability (0-33 points)
    GREATEST(0, 33 - COALESCE(h.hum_sigma, 99) * 10)::NUMERIC(5,1) AS hum_score,
    -- PE stability (0-34 points): lower sigma and lower mean = better
    GREATEST(0, 34 - COALESCE(pe.pe_sigma, 99) * 5 - COALESCE(pe.pe_mu, 99) * 2)::NUMERIC(5,1) AS pe_score,
    -- Composite
    GREATEST(0, GREATEST(0, 33 - COALESCE(t.temp_sigma, 99) * 10) +
             GREATEST(0, 33 - COALESCE(h.hum_sigma, 99) * 10) +
             GREATEST(0, 34 - COALESCE(pe.pe_sigma, 99) * 5 - COALESCE(pe.pe_mu, 99) * 2))::NUMERIC(5,1) AS stability_index
FROM temp_stats t
FULL OUTER JOIN hum_stats h ON t.eqp_id = h.eqp_id
FULL OUTER JOIN pe_stats pe ON COALESCE(t.eqp_id, h.eqp_id) = pe.eqp_id
ORDER BY stability_index DESC;

-- ══════════════════════════════════════════════════════════════
-- 7. Refresh continuous aggregate
-- ══════════════════════════════════════════════════════════════
CALL refresh_continuous_aggregate('public.ldi_hourly', NULL, NULL);
