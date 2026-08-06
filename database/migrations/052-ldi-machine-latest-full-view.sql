-- ══════════════════════════════════════════════════════════════
-- 052: v_ldi_machine_latest_full — single source of truth for
-- "the latest full snapshot per machine"
-- ══════════════════════════════════════════════════════════════
-- Multiple dashboard panels each independently reimplement
-- "DISTINCT ON (eqp_id) ... ORDER BY eqp_id, time DESC" against raw
-- ldi_data to get the latest row per machine (Manufacturing's
-- "Production & Process Table", the Andon board's former Live
-- Production query, etc.) -- each picking a different subset of columns
-- and each independently deciding how to handle a machine with zero
-- recent data. This view is the one true "latest row per machine"
-- query: every registered+enabled LDI device (LEFT JOIN, so a silent
-- machine still shows a row instead of disappearing), every ldi_data
-- column, computed once.

CREATE OR REPLACE VIEW public.v_ldi_machine_latest_full AS
SELECT
    dev.device_id       AS eqp_id,
    dev.hostname,
    dev.location,
    dev.enabled,
    (latest.eqp_id IS NOT NULL) AS has_data,
    -- 5-minute staleness threshold, consistent with the "online" cutoff
    -- used elsewhere in this dashboard set. has_data=true + is_stale=true
    -- means "we know something about this machine, but it stopped
    -- reporting" -- distinct from has_data=false ("never reported at
    -- all"). Consumers that need freshness-aware behavior (fleet
    -- availability, "is it running now") should check is_stale;
    -- consumers that just want the last-known state regardless of age
    -- (traceability, "what was it doing") can ignore it.
    (latest.eqp_id IS NOT NULL AND latest."time" < NOW() - INTERVAL '5 minutes') AS is_stale,
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
    latest.pe_1, latest.pe_2, latest.pe_3, latest.pe_4, latest.pe_5, latest.pe_6,
    latest.je_1, latest.je_2, latest.je_3, latest.je_4,
    latest.pe_setting,
    latest.je_setting,
    latest.log_id
FROM public.devices dev
LEFT JOIN LATERAL (
    SELECT d.*
    FROM public.ldi_data d
    WHERE d.eqp_id = dev.device_id
    ORDER BY d."time" DESC
    LIMIT 1
) latest ON true
WHERE dev.device_type = 'ldi' AND dev.enabled;

GRANT SELECT ON public.v_ldi_machine_latest_full TO grafana_reader;
