-- ============================================================================
-- Migration 084: Enterprise Data Organization & Governance (eap_backup)
--
-- Objective:
--   Organize multi-machine database architecture at world-class enterprise level.
--   STRICT REQUIREMENT: NO PHYSICAL TABLE RENAMES (Zero Ingestion Disruption).
--
-- Architecture:
--   1. Data Catalog & Schema Governance (COMMENT ON TABLE / COLUMN)
--   2. Canonical Semantic Views for Drilling Operations (vw_drl_*)
--   3. Machine Fleet Registry & Real-Time Spindle Topology
-- ============================================================================

-- The runner (scripts/migrate-entrypoint.sh) opens every file on the ims database,
-- where none of these objects exist. Switch to eap_backup when this server has it
-- (it exists only where the EAP backup was restored); skip cleanly otherwise, so a
-- fresh install still completes db-migrate and the services gated on it start.
SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'eap_backup') AS has_eap_backup \gset
\if :has_eap_backup
\connect eap_backup

-- ----------------------------------------------------------------------------
-- 1. DATA GOVERNANCE & TABLE CATALOG (PostgreSQL Data Dictionary Comments)
-- ----------------------------------------------------------------------------

-- [Domain 1: CNC Drilling Operations - 6-Spindle Fleet]
COMMENT ON TABLE public.machine_event IS 
'DOMAIN: DRILLING (CNC) | Equipment: DRLnnn-M | Ingestion: EAP File Agent / Node-RED | Type: TimescaleDB Hypertable | Telemetry & event stream';

COMMENT ON TABLE public.machine_telemetry IS 
'DOMAIN: DRILLING (CNC) | Equipment: DRLnnn-M | Ingestion: Node-RED / JSON Payload | Raw high-frequency spindle telemetry';

COMMENT ON TABLE public.eap_status IS 
'DOMAIN: DRILLING (CNC) | Equipment: DRLnnn-M | Ingestion: EAP Agent Heartbeat | Machine agent health, heartbeat, and polling file tracking';

COMMENT ON TABLE public.agent_log IS 
'DOMAIN: DRILLING (CNC) | Equipment: DRLnnn-M | Ingestion: EAP Agent Daemon | Diagnostic, connectivity, and parser execution logs';

-- [Domain 2: Vertical Continuous Plating - VCP Process Line]
COMMENT ON TABLE public.vcp_upp IS 
'DOMAIN: PLATING (VCP Line) | Equipment: VCP001 ~ VCP003 | Ingestion: EAP PLC Poller | Type: Flat wide telemetry (200+ rectifier, voltage, ampere, and pump metrics)';

COMMENT ON TABLE public.vcp_alarm IS 
'DOMAIN: PLATING (VCP Line) | Equipment: VCP001 ~ VCP003 | Ingestion: EAP Alarm Handler | Tank level, chemical temperature, and motor drive alarm log';

COMMENT ON TABLE public.vcp_status_change IS 
'DOMAIN: PLATING (VCP Line) | Equipment: VCP001 ~ VCP003 | Ingestion: EAP Status Daemon | Plating line state machine transition history (RUN, STOP, IDLE)';

-- [Domain 3: Lithography Direct Imaging - LDI Process Line & Auxiliary]
COMMENT ON TABLE public.machine_process_log IS 
'DOMAIN: LDI (Lithography PCB) | Equipment: LDI exposure machines | Ingestion: LDI Ingest Daemon | PCB panel exposure parameters (ScaleX, ScaleY, Dosage, PE/JE)';

COMMENT ON TABLE public."DFI_LDI_ALARM_LOG" IS 
'DOMAIN: LDI (Lithography PCB) | Equipment: LDI exposure machines | Ingestion: Legacy LDI Logger | Optical alignment, laser source, and stage motion alarm logs';

COMMENT ON TABLE public."DFI_LDI_ALARM_MS_CODE" IS 
'DOMAIN: LDI (Lithography PCB) | Master Dictionary | Static lookup table for LDI alarm codes, descriptions, and corrective actions';

COMMENT ON TABLE public."MachineAlarm" IS 
'DOMAIN: LDI (Lithography PCB) | Master Dictionary (Legacy Alias) | Mirror lookup table for legacy LDI alarm dictionaries';

COMMENT ON TABLE public.machine_alarm_log IS 
'DOMAIN: MANUFACTURING (Auxiliary Lines) | Equipment: CCL, DFR, DID lines | Ingestion: Shopfloor Alarms | Multi-station alarm log';


-- ----------------------------------------------------------------------------
-- 2. CANONICAL DRILLING VIEWS (Semantic Clean Access Layer)
-- ----------------------------------------------------------------------------

-- View 1: Machine Registry & Real-Time Fleet Inventory
CREATE OR REPLACE VIEW public.vw_drl_machine_inventory AS
WITH RECURSIVE eqp_list AS (
  (SELECT equipment_id FROM public.machine_event WHERE equipment_id IS NOT NULL ORDER BY equipment_id LIMIT 1)
  UNION ALL
  SELECT (SELECT equipment_id FROM public.machine_event WHERE equipment_id > t.equipment_id AND equipment_id IS NOT NULL ORDER BY equipment_id LIMIT 1)
  FROM eqp_list t
  WHERE t.equipment_id IS NOT NULL
),
latest_events AS (
  SELECT e.equipment_id, me.*
  FROM eqp_list e
  CROSS JOIN LATERAL (
    SELECT event_type, event_code, event_message, event_time, id
    FROM public.machine_event m
    WHERE m.equipment_id = e.equipment_id
    ORDER BY m.event_time DESC, m.id DESC
    LIMIT 1
  ) me
)
SELECT
  l.equipment_id AS machine_id,
  'CNC Drilling (6-Spindle)' AS machine_model,
  l.event_time AS last_event_time,
  l.event_time AT TIME ZONE 'Asia/Bangkok' AS last_event_time_bkk,
  ROUND(EXTRACT(EPOCH FROM (NOW() - l.event_time)) / 3600.0, 1) AS hours_since_telemetry,
  CASE 
    WHEN NOW() - l.event_time >= INTERVAL '2 hours' THEN 'OFFLINE'
    WHEN NOW() - l.event_time >= INTERVAL '1 hour' AND (l.event_code IN ('0112', '0114', '0201', '0109', '0302') OR l.event_type = 'RUN') THEN 'STANDBY'
    WHEN l.event_code IN ('0408', '0417', '0120') THEN 'ALARM'
    WHEN (l.event_type IN ('ALARM', 'E') OR l.event_code LIKE '04%' OR l.event_code LIKE '07%')
         AND l.event_code NOT IN ('0101', '0115') 
         AND l.event_message NOT ILIKE '%Emergency Stop Released%' THEN 'ALARM'
    WHEN l.event_code IN ('0110', '0214', '0215', '0308', '0310', '0211', '0115', '0119') OR l.event_type = 'TOOL_CHANGE' THEN 'TOOL_CHANGE'
    WHEN l.event_code = '0108' OR l.event_type = 'STOP' THEN 'STOP'
    WHEN l.event_code IN ('0112', '0114', '0201', '0109', '0302') OR (l.event_code = '0101' AND l.event_message ILIKE '[START]:%') OR l.event_type = 'RUN' THEN 'RUN'
    ELSE 'STANDBY'
  END AS current_status,
  COALESCE(NULLIF(TRIM(regexp_replace(l.event_message, '\s*\(\s*Key\s*''[0-9]''\s*to\s*check\s*\)', '', 'gi')), ''), 'Normal execution') AS last_message
FROM latest_events l
ORDER BY l.equipment_id;

COMMENT ON VIEW public.vw_drl_machine_inventory IS 
'Enterprise View: Complete catalog of the CNC drilling fleet with live operational status and last telemetry';


-- View 2: Canonical Drilling Events (Sanitized & Standardized)
CREATE OR REPLACE VIEW public.vw_drl_events AS
SELECT
  id,
  equipment_id AS machine_id,
  event_time,
  event_time AT TIME ZONE 'Asia/Bangkok' AS event_time_bkk,
  message_type,
  event_type,
  CASE 
    WHEN event_code ~ '^[0-9]+' AND (event_type IN ('ALARM', 'E') OR event_code LIKE '04%') THEN 'E-' || event_code
    WHEN event_code ~ '^[0-9]+' THEN 'M-' || event_code
    ELSE event_code
  END AS formatted_code,
  event_code AS raw_code,
  COALESCE(NULLIF(TRIM(regexp_replace(event_message, '\s*\(\s*Key\s*''[0-9]''\s*to\s*check\s*\)', '', 'gi')), ''), 'Normal execution') AS clean_message,
  event_message AS raw_message,
  COALESCE((regexp_match(event_message, '(?i)spin[a-z]*[[:space:]]*#?([0-9]+)'))[1], spindle, '-') AS affected_spindle,
  source_file
FROM public.machine_event;

COMMENT ON VIEW public.vw_drl_events IS 
'Enterprise View: Normalized Drilling event stream with Bangkok timestamps, standardized codes, and cleaned prompt messages';


-- View 3: Active Alarms Stream (High-Priority Operator View)
CREATE OR REPLACE VIEW public.vw_drl_active_alarms AS
SELECT
  id,
  equipment_id AS machine_id,
  event_time,
  event_time AT TIME ZONE 'Asia/Bangkok' AS event_time_bkk,
  CASE WHEN event_code ~ '^[0-9]+' THEN 'E-' || event_code ELSE event_code END AS alarm_code,
  COALESCE(NULLIF(TRIM(regexp_replace(event_message, '\s*\(\s*Key\s*''[0-9]''\s*to\s*check\s*\)', '', 'gi')), ''), 'Alarm condition detected') AS alarm_message,
  COALESCE((regexp_match(event_message, '(?i)spin[a-z]*[[:space:]]*#?([0-9]+)'))[1], spindle, 'Fleet') AS spindle_target,
  ROUND(EXTRACT(EPOCH FROM (NOW() - event_time)) / 60.0)::int AS elapsed_minutes
FROM public.machine_event
WHERE (
  event_type IN ('ALARM', 'E')
  OR event_code IN ('0408', '0417', '0120')
  OR event_code LIKE '04%'
  OR event_code LIKE '07%'
)
AND event_code NOT IN ('0101', '0115')
AND event_message NOT ILIKE '%Emergency Stop Released%'
ORDER BY event_time DESC;

COMMENT ON VIEW public.vw_drl_active_alarms IS
'Enterprise View: Filtered stream of active and historical alarm incidents for CNC Drilling operations';

\else
\echo 'IMS_MIGRATION_DEFERRED 084: database eap_backup not present on this server; runs again on the next start'
\endif
