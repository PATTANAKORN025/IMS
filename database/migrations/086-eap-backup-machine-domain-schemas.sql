-- ============================================================================
-- Migration 086: one schema per machine domain in eap_backup (views only)
--
-- eap_backup keeps four machine domains side by side in `public` under five
-- naming styles: snake_case (vcp_upp, machine_event), an API prefix
-- (eap_api_vcp_*, the old VCP names, now passthrough views), upper case that
-- needs quoting ("DFI_LDI_ALARM_LOG"), CamelCase ("MachineAlarm", and columns
-- such as "LogDate"), and two view prefixes (v_, vw_).
--
-- This adds a canonical access layer without touching any physical object:
--   drilling.*   CNC drilling fleet (DRLnnn-M)
--   vcp.*        VCP plating lines (VCP01..03, also recorded as VCP001..003)
--   ldi.*        LDI exposure machines
--   shopfloor.*  machine_alarm_log: a multi-family shopfloor equipment fleet,
--                so it is plant-wide, not one line
--   catalog.object_registry   every object: domain, canonical and physical
--                name, time column and its zone, live row estimate and size
--
-- Rules this file keeps:
--   * No RENAME, no ALTER TABLE, no DROP of anything that already exists.
--     Ingestion, dashboards and alert rules keep reading the physical names.
--   * Views only, WITH (security_invoker = true): a view reads with the
--     caller's privileges, so it can never widen what a role may see.
--   * Column names become snake_case; values, types and rows are unchanged.
--     The one added column is vcp.*.line_code (see below).
--   * plc_mqtt is already its own schema with snake_case names; it is listed
--     in the catalog, not wrapped.
--
-- Evidence (2026-09-25): equipment ids per table and column types were read
-- from the live database; plant figures are kept out of this file. Undo with
-- database/rollbacks/086-eap-backup-machine-domain-schemas.down.sql.
-- ============================================================================

-- The runner opens every file on the ims database. Switch to eap_backup when
-- this server has it; skip cleanly otherwise, so db-migrate still completes.
SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'eap_backup') AS has_eap_backup \gset
\if :has_eap_backup
\connect eap_backup

BEGIN;

CREATE SCHEMA IF NOT EXISTS drilling;
CREATE SCHEMA IF NOT EXISTS vcp;
CREATE SCHEMA IF NOT EXISTS ldi;
CREATE SCHEMA IF NOT EXISTS shopfloor;
CREATE SCHEMA IF NOT EXISTS catalog;

COMMENT ON SCHEMA drilling  IS 'CNC drilling fleet (DRLnnn-M). Canonical views over public.machine_event, machine_telemetry, eap_status, agent_log. Migration 086.';
COMMENT ON SCHEMA vcp       IS 'VCP plating lines. Canonical views over public.vcp_upp, vcp_alarm, vcp_status_change (also reachable as public.eap_api_vcp_*). Migration 086.';
COMMENT ON SCHEMA ldi       IS 'LDI exposure machines in eap_backup. Canonical snake_case views over the upper/CamelCase LDI tables. The live LDI pipeline is in the ims database. Migration 086.';
COMMENT ON SCHEMA shopfloor IS 'Plant-wide alarm log from a multi-family shopfloor equipment fleet. Canonical view over public.machine_alarm_log. Migration 086.';
COMMENT ON SCHEMA catalog   IS 'Data catalog for eap_backup: catalog.object_registry lists every object with its domain and canonical name. Migration 086.';

-- ---------------------------------------------------------------- drilling
CREATE OR REPLACE VIEW drilling.event WITH (security_invoker = true) AS
SELECT id, message_id, equipment_id, message_type, event_type, event_code, event_message,
       event_time, sent_time, received_at, source, source_file, magazine_no, spindle, raw_item_code
FROM public.machine_event;
COMMENT ON VIEW drilling.event IS 'Drilling event stream, one row per machine message. Physical: public.machine_event (hypertable on event_time, timestamptz).';

CREATE OR REPLACE VIEW drilling.telemetry WITH (security_invoker = true) AS
SELECT message_id, equipment_id, event_time, sent_time, received_at, telemetry_data
FROM public.machine_telemetry;
COMMENT ON VIEW drilling.telemetry IS 'Drilling telemetry payloads (jsonb). Physical: public.machine_telemetry. Held 0 rows on 2026-09-25.';

CREATE OR REPLACE VIEW drilling.agent_status WITH (security_invoker = true) AS
SELECT equipment_id, message_id, agent_status, current_file, last_data_time, last_error, heartbeat,
       event_time, sent_time, received_at
FROM public.eap_status;
COMMENT ON VIEW drilling.agent_status IS 'Latest state of each drilling EAP file agent. Physical: public.eap_status.';

CREATE OR REPLACE VIEW drilling.agent_log WITH (security_invoker = true) AS
SELECT id, message_id, equipment_id, level, event_name, message, event_time, sent_time, received_at
FROM public.agent_log;
COMMENT ON VIEW drilling.agent_log IS 'Drilling EAP agent diagnostic log. Physical: public.agent_log (hypertable on event_time).';

-- ---------------------------------------------------------------- vcp
-- line_code: the physical line. Each VCP line was renamed on 2026-09-11 (VCP001-VCP
-- became VCP01-VCP, and so on), so the same line appears under two equipment_id
-- values; the last two digits of the first part name the line. Only *-VCP rows
-- are plating lines; VCP001-L gets NULL rather than a guessed line.
CREATE OR REPLACE VIEW vcp.upp WITH (security_invoker = true) AS
SELECT u.*,
       CASE WHEN u.equipment_id LIKE '%-VCP' THEN right(split_part(u.equipment_id, '-', 1), 2) END AS line_code
FROM public.vcp_upp u;
COMMENT ON VIEW vcp.upp IS 'VCP process snapshot, one row per line per ~60 s: 36 rectifier sides, 18 pumps, baths, job. Bath temperatures are name-swapped at source: preset_<bath> is the reading, actual_<bath> the setpoint; actual_prep is a setpoint. Physical: public.vcp_upp (log_date, timestamptz).';

CREATE OR REPLACE VIEW vcp.alarm WITH (security_invoker = true) AS
SELECT a.*,
       CASE WHEN a.equipment_id LIKE '%-VCP' THEN right(split_part(a.equipment_id, '-', 1), 2) END AS line_code
FROM public.vcp_alarm a;
COMMENT ON VIEW vcp.alarm IS 'VCP alarm events: alarm_status Triggered or Reset per error_code. Physical: public.vcp_alarm (log_date, timestamptz).';

CREATE OR REPLACE VIEW vcp.status_change WITH (security_invoker = true) AS
SELECT s.*,
       CASE WHEN s.equipment_id LIKE '%-VCP' THEN right(split_part(s.equipment_id, '-', 1), 2) END AS line_code
FROM public.vcp_status_change s;
COMMENT ON VIEW vcp.status_change IS 'VCP line state transitions (current_status). Physical: public.vcp_status_change (log_date, timestamptz).';

-- ---------------------------------------------------------------- ldi
CREATE OR REPLACE VIEW ldi.alarm_log WITH (security_invoker = true) AS
SELECT "LogId" AS log_id, "LogDate" AS log_date, "ErrorCode" AS error_code, "ErrorTime" AS error_time,
       "EquipmentID" AS equipment_id, "Factory" AS factory, "Process" AS process
FROM public."DFI_LDI_ALARM_LOG";
COMMENT ON VIEW ldi.alarm_log IS 'LDI alarm log (historical). log_date is timestamp without time zone: the source does not record the zone. Physical: public."DFI_LDI_ALARM_LOG".';

CREATE OR REPLACE VIEW ldi.alarm_code WITH (security_invoker = true) AS
SELECT "AlarmId" AS alarm_id, "AlarmType" AS alarm_type, "AlarmCode" AS alarm_code,
       "AlarmMsg" AS alarm_msg, "AlarmDetail" AS alarm_detail
FROM public."DFI_LDI_ALARM_MS_CODE";
COMMENT ON VIEW ldi.alarm_code IS 'LDI alarm code dictionary. Physical: public."DFI_LDI_ALARM_MS_CODE". Held 0 rows on 2026-09-25; the populated dictionary is ims.public.ldi_alarm_ms_code.';

CREATE OR REPLACE VIEW ldi.alarm_code_legacy WITH (security_invoker = true) AS
SELECT "AlarmId" AS alarm_id, "AlarmType" AS alarm_type, "AlarmCode" AS alarm_code,
       "AlarmMsg" AS alarm_msg, "AlarmDetail" AS alarm_detail
FROM public."MachineAlarm";
COMMENT ON VIEW ldi.alarm_code_legacy IS 'Second LDI alarm dictionary with the same five columns. Physical: public."MachineAlarm". Held 0 rows on 2026-09-25.';

CREATE OR REPLACE VIEW ldi.process_log WITH (security_invoker = true) AS
SELECT "LogId" AS log_id, "LogDate" AS log_date, "MO" AS mo, "FPN" AS fpn, "UserID" AS user_id,
       "ResistDosage" AS resist_dosage, "LayerName" AS layer_name, "ScaleX" AS scale_x, "ScaleY" AS scale_y,
       "ScaleMode" AS scale_mode, "PE" AS pe, "JE" AS je, "Temperature" AS temperature, "Humidity" AS humidity,
       "EquipmentID" AS equipment_id, "JESetting" AS je_setting, "PESetting" AS pe_setting, "State" AS state,
       "Resist" AS resist, "ScanSpeed" AS scan_speed, "AirVacuum" AS air_vacuum, "Thickness" AS thickness,
       "PrintedNumber" AS printed_number, "TotalNumber" AS total_number, "StartTime" AS start_time,
       "EndTime" AS end_time, "Factory" AS factory, "Process" AS process, "EqpTrxId" AS eqp_trx_id,
       "FilmNo" AS film_no, "BoardID" AS board_id, "ProcessStartTime" AS process_start_time,
       "ProcessEndTime" AS process_end_time
FROM public.machine_process_log;
COMMENT ON VIEW ldi.process_log IS 'LDI exposure process records (a historical sample). Every measured value is stored as text (character varying) at source, not cast here. Time columns are timestamp without time zone. Physical: public.machine_process_log.';

-- ---------------------------------------------------------------- shopfloor
CREATE OR REPLACE VIEW shopfloor.alarm_log WITH (security_invoker = true) AS
SELECT id, eqp_id AS equipment_id, event_time, report_type, alarm_type, alarm_code, created_at
FROM public.machine_alarm_log;
COMMENT ON VIEW shopfloor.alarm_log IS 'Plant-wide alarm log from a multi-family shopfloor equipment fleet (a historical sample). event_time is timestamp without time zone. Physical: public.machine_alarm_log (eqp_id).';

-- ---------------------------------------------------------------- catalog
CREATE OR REPLACE VIEW catalog.object_registry WITH (security_invoker = true) AS
WITH reg (domain, canonical, physical, time_column, time_zone, status, note) AS (
  VALUES
  ('drilling',  'drilling.event',          'public.machine_event',              'event_time',       'timestamptz',  'canonical', 'hypertable'),
  ('drilling',  'drilling.telemetry',      'public.machine_telemetry',          'event_time',       'timestamptz',  'canonical', 'empty on 2026-09-25'),
  ('drilling',  'drilling.agent_status',   'public.eap_status',                 'event_time',       'timestamptz',  'canonical', NULL),
  ('drilling',  'drilling.agent_log',      'public.agent_log',                  'event_time',       'timestamptz',  'canonical', 'hypertable'),
  ('drilling',  NULL,                      'public.v_machine_board_period',     NULL,               NULL,           'derived view', NULL),
  ('drilling',  NULL,                      'public.v_machine_board_timeline',   NULL,               NULL,           'derived view', NULL),
  ('drilling',  NULL,                      'public.vw_drl_machine_inventory',   'last_event_time',  'timestamptz',  'derived view', 'migration 084'),
  ('drilling',  NULL,                      'public.vw_drl_events',              'event_time',       'timestamptz',  'derived view', 'migration 084'),
  ('drilling',  NULL,                      'public.vw_drl_active_alarms',       'event_time',       'timestamptz',  'derived view', 'migration 084'),
  ('drilling',  NULL,                      'public.vw_drl_daily_shift_summary', NULL,               NULL,           'derived view', NULL),
  ('vcp',       'vcp.upp',                 'public.vcp_upp',                    'log_date',         'timestamptz',  'canonical', 'bath columns name-swapped at source'),
  ('vcp',       'vcp.alarm',               'public.vcp_alarm',                  'log_date',         'timestamptz',  'canonical', NULL),
  ('vcp',       'vcp.status_change',       'public.vcp_status_change',          'log_date',         'timestamptz',  'canonical', NULL),
  ('vcp',       'vcp.upp',                 'public.eap_api_vcp_upp',            'log_date',         'timestamptz',  'legacy name', 'passthrough view kept for existing dashboards and alert rules'),
  ('vcp',       'vcp.alarm',               'public.eap_api_vcp_alarm',          'log_date',         'timestamptz',  'legacy name', 'passthrough view kept for existing dashboards and alert rules'),
  ('vcp',       'vcp.status_change',       'public.eap_api_vcp_status_change',  'log_date',         'timestamptz',  'legacy name', 'passthrough view kept for existing dashboards and alert rules'),
  ('ldi',       'ldi.alarm_log',           'public."DFI_LDI_ALARM_LOG"',        'log_date',         'timestamp (zone not recorded)', 'canonical', NULL),
  ('ldi',       'ldi.alarm_code',          'public."DFI_LDI_ALARM_MS_CODE"',    NULL,               NULL,           'canonical', 'empty on 2026-09-25'),
  ('ldi',       'ldi.alarm_code_legacy',   'public."MachineAlarm"',             NULL,               NULL,           'canonical', 'empty on 2026-09-25'),
  ('ldi',       'ldi.process_log',         'public.machine_process_log',        'log_date',         'timestamp (zone not recorded)', 'canonical', 'values stored as text'),
  ('shopfloor', 'shopfloor.alarm_log',     'public.machine_alarm_log',          'event_time',       'timestamp (zone not recorded)', 'canonical', 'multi-family shopfloor fleet'),
  ('plc_mqtt',  'plc_mqtt.raw_event',      'plc_mqtt.raw_event',                'received_at',      'timestamptz',  'native schema', NULL),
  ('plc_mqtt',  'plc_mqtt.status_event',   'plc_mqtt.status_event',             'received_at',      'timestamptz',  'native schema', NULL),
  ('plc_mqtt',  'plc_mqtt.alarm_event',    'plc_mqtt.alarm_event',              'received_at',      'timestamptz',  'native schema', NULL),
  ('plc_mqtt',  'plc_mqtt.process_data_event', 'plc_mqtt.process_data_event',   'received_at',      'timestamptz',  'native schema', NULL),
  ('plc_mqtt',  'plc_mqtt.board_id_event', 'plc_mqtt.board_id_event',          'received_at',      'timestamptz',  'native schema', NULL),
  ('plc_mqtt',  'plc_mqtt.equipment',      'plc_mqtt.equipment',                NULL,               NULL,           'native schema', 'PLC registry'),
  ('plc_mqtt',  'plc_mqtt.equipment_activity', 'plc_mqtt.equipment_activity',   'last_seen_at',     'timestamptz',  'native schema', NULL),
  ('plc_mqtt',  'plc_mqtt.event_dedup',    'plc_mqtt.event_dedup',              'first_received_at','timestamptz',  'native schema', NULL),
  ('plc_mqtt',  'plc_mqtt.heartbeat_hourly','plc_mqtt.heartbeat_hourly',        'hour_utc',         'timestamptz',  'native schema', NULL)
)
SELECT r.domain,
       r.canonical      AS canonical_name,
       r.physical       AS physical_name,
       r.status,
       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' END AS physical_kind,
       r.time_column,
       r.time_zone,
       CASE WHEN c.relkind IN ('r', 'p') THEN NULLIF(c.reltuples, -1)::bigint END AS est_rows,
       CASE WHEN c.relkind IN ('r', 'p', 'm') THEN pg_size_pretty(pg_total_relation_size(c.oid)) END AS total_size,
       obj_description(c.oid, 'pg_class') AS physical_comment,
       r.note,
       c.oid IS NULL AS physical_missing
FROM reg r
LEFT JOIN pg_class c ON c.oid = to_regclass(r.physical);
COMMENT ON VIEW catalog.object_registry IS 'One row per eap_backup object: machine domain, canonical name (schema.view), physical name, time column and zone, live row estimate and size. physical_missing = true means the registry is out of date. Migration 086.';

-- ---------------------------------------------------------------- access
-- Read-only access for the dashboard role. security_invoker views still need
-- SELECT on the physical tables, which grafana_reader already holds.
GRANT USAGE ON SCHEMA drilling, vcp, ldi, shopfloor, catalog TO grafana_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA drilling, vcp, ldi, shopfloor, catalog TO grafana_reader;

COMMIT;

\else
\echo '086: database eap_backup not present on this server, skipped'
\endif
