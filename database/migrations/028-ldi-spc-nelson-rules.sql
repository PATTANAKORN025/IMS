-- ══════════════════════════════════════════════════════════════
-- Migration 028: Nelson Rules Engine for LDI SPC
-- Detects process instability via 3 critical Nelson Rules.
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- v_ldi_nelson_rules_detection
-- 
-- For each data point per eqp_id:
--   - Computes rolling μ and σ over preceding 30 points
--   - Evaluates Nelson Rule 1 (beyond ±3σ)
--   - Evaluates Nelson Rule 2 (9 consecutive same-side)
--   - Evaluates Nelson Rule 3 (6 consecutive increasing/decreasing)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_ldi_nelson_rules_detection AS
WITH raw_pe AS (
    -- Step 1: Compute max absolute PE deviation per measurement
    SELECT
        d."time",
        d.eqp_id,
        GREATEST(
            ABS(COALESCE(d.pe_1,0)), ABS(COALESCE(d.pe_2,0)),
            ABS(COALESCE(d.pe_3,0)), ABS(COALESCE(d.pe_4,0)),
            ABS(COALESCE(d.pe_5,0)), ABS(COALESCE(d.pe_6,0))
        ) AS max_pe
    FROM public.ldi_data d
    WHERE d.pe_1 IS NOT NULL
),
rolling_stats AS (
    -- Step 2: Compute rolling μ and σ over 30 preceding points (including current)
    SELECT
        rp."time",
        rp.eqp_id,
        rp.max_pe,
        AVG(rp.max_pe) OVER w AS mu,
        STDDEV(rp.max_pe) OVER w AS sigma
    FROM raw_pe rp
    WINDOW w AS (
        PARTITION BY rp.eqp_id
        ORDER BY rp."time"
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    )
),
with_sides AS (
    -- Step 3: Determine which side of the mean each point falls on
    SELECT
        rs."time",
        rs.eqp_id,
        rs.max_pe,
        rs.mu,
        rs.sigma,
        CASE WHEN rs.max_pe > rs.mu THEN 1
             WHEN rs.max_pe < rs.mu THEN -1
             ELSE 0
        END AS side,
        -- Direction: +1 = increasing, -1 = decreasing, 0 = same
        rs.max_pe - LAG(rs.max_pe) OVER (PARTITION BY rs.eqp_id ORDER BY rs."time") AS delta
    FROM rolling_stats rs
),
rule_checks AS (
    -- Step 4: Check all three Nelson Rules per point
    SELECT
        ws."time",
        ws.eqp_id,
        ws.max_pe,
        ROUND(ws.mu::NUMERIC, 4) AS mu,
        ROUND(ws.sigma::NUMERIC, 4) AS sigma,
        ROUND((ws.mu + 3 * ws.sigma)::NUMERIC, 4) AS ucl,
        ROUND((ws.mu - 3 * ws.sigma)::NUMERIC, 4) AS lcl,

        -- Rule 1: Beyond 3σ
        CASE WHEN ws.sigma > 0 AND (
            ws.max_pe > ws.mu + 3 * ws.sigma OR
            ws.max_pe < ws.mu - 3 * ws.sigma
        ) THEN TRUE ELSE FALSE END AS rule1_beyond_3sigma,

        -- Rule 2: 9 consecutive points same side of mean
        CASE WHEN SUM(CASE WHEN ws2.side != 0 THEN ws2.side ELSE 0 END)
            OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) = 9
            OR
            SUM(CASE WHEN ws2.side != 0 THEN ws2.side ELSE 0 END)
            OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) = -9
        THEN TRUE ELSE FALSE END AS rule2_nine_same_side,

        -- Rule 3: 6 consecutive increasing OR decreasing
        CASE WHEN SUM(CASE WHEN ws2.delta > 0 THEN 1 WHEN ws2.delta < 0 THEN -1 ELSE 0 END)
            OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) = 6
            OR
            SUM(CASE WHEN ws2.delta > 0 THEN 1 WHEN ws2.delta < 0 THEN -1 ELSE 0 END)
            OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) = -6
        THEN TRUE ELSE FALSE END AS rule3_six_trend,

        -- Overall: any rule triggered
        CASE WHEN
            (ws.sigma > 0 AND (ws.max_pe > ws.mu + 3 * ws.sigma OR ws.max_pe < ws.mu - 3 * ws.sigma))
            OR
            SUM(CASE WHEN ws2.side != 0 THEN ws2.side ELSE 0 END)
            OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) IN (9, -9)
            OR
            SUM(CASE WHEN ws2.delta > 0 THEN 1 WHEN ws2.delta < 0 THEN -1 ELSE 0 END)
            OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) IN (6, -6)
        THEN TRUE ELSE FALSE END AS any_rule_triggered

    FROM with_sides ws
    -- Correlated subquery for Rule 2/3 window functions
    LEFT JOIN with_sides ws2 ON ws."time" = ws2."time" AND ws.eqp_id = ws2.eqp_id
)
SELECT * FROM rule_checks
ORDER BY eqp_id, "time" DESC;
