-- Migration 040: Register LDI machines in devices table
-- Required for FK integrity and dashboard variable dropdowns
--
-- Real-data cutover (2026-08-07): device_id/hostname replaced with the
-- real fleet's actual identifiers (previously synthetic LDI-01..LDI-10),
-- confirmed against the real ldi_data telemetry export -- same 4 DF INNER
-- + 2 DF OUTER + 4 SM / 2-factory shape, same factory/location bucketing,
-- just real names instead of placeholders. These are equipment
-- identifiers (schema/reference metadata), not the bulk real telemetry/
-- alarm rows -- those stay out of git per docs/REAL-DATA-IMPORT.md and
-- are loaded separately via scripts/import-real-data.sh.
--
-- Also adds 3 equipment IDs that appear only in the real alarm log, never
-- in the real telemetry export (LDI-B05, LDI-B06, LDI-B07) --
-- confirmed genuinely distinct from LDI-B01/LD2 by months of
-- concurrent, overlapping alarm activity (rules out "renamed over time").
-- All share factory='3'/process='DF' with LDI002-LD-- Migration 040: Register LDI machines in devices table
-- Required for FK integrity and dashboard variable dropdowns
--
-- Real-data cutover (2026-08-07): device_id/hostname replaced with the
-- real fleet's actual identifiers (previously synthetic LDI-01..LDI-10),
-- confirmed against the real ldi_data telemetry export -- same 4 DF INNER
-- + 2 DF OUTER + 4 SM / 2-factory shape, same factory/location bucketing,
-- just real names instead of placeholders. These are equipment
-- identifiers (schema/reference metadata), not the bulk real telemetry/
-- alarm rows -- those stay out of git per docs/REAL-DATA-IMPORT.md and
-- are loaded separately via scripts/import-real-data.sh.
--
-- Also adds 3 equipment IDs that appear only in the real alarm log, never
-- in the real telemetry export (ldi-b05, ldi-b06, LDI-B07) --
-- confirmed genuinely distinct from ldi-b01/LD2 by months of
-- concurrent, overlapping alarm activity (rules out "renamed over time").
-- All share factory='3'/process='DF' with ldi-b01/LD2. Registered here
-- (not only in the import script) so a fresh deploy that later loads real
-- alarm data doesn't hit an FK violation.
--
-- Mock↔real switch (2026-08-07): also re-registers the original 10
-- synthetic LDI-01..LDI-10 devices the Node-RED simulator has always
-- written (nodered_data/flows.json ldisim_gen's P{} config -- location/
-- process/factory below are copied 1:1 from there, not guessed), since
-- migration 055's ldi_data_eqp_id_fkey / ldi_alarm_log_equipmentid_fkey
-- FK constraints reject inserts for any eqp_id not in this table. Both
-- device sets now live here permanently so a fresh deploy supports either
-- data mode without a further migration -- scripts/switch-data-mode.sh
-- only ever changes which TABLES have rows, never this seed.

INSERT INTO public.devices (device_id, hostname, device_type, enabled, location)
VALUES
  ('LDI-A01',  'ldi-a01',  'ldi', true, 'Site A - Zone 1'),
  ('LDI-A02', 'ldi-a01b', 'ldi', true, 'Site A - Zone 1'),
  ('ldi-b01',      'ldi-b01',      'ldi', true, 'Site B - Zone 1'),
  ('ldi-b02',      'ldi-b02',      'ldi', true, 'Site B - Zone 1'),
  ('ldi-a03',        'ldi-a03',        'ldi', true, 'Site A - Zone 2'),
  ('ldi-a04',        'ldi-a04',        'ldi', true, 'Site A - Zone 2'),
  ('ldi-a05',         'ldi-a05',         'ldi', true, 'Site A - Zone 3'),
  ('ldi-a06',         'ldi-a06',         'ldi', true, 'Site A - Zone 3'),
  ('ldi-b03',   'ldi-b03',   'ldi', true, 'Site B - Zone 2'),
  ('ldi-b04',   'ldi-b04',   'ldi', true, 'Site B - Zone 2'),
  ('ldi-b05',      'ldi-b05',      'ldi', true, 'Site B - Zone 1'),
  ('ldi-b06',      'ldi-b06',      'ldi', true, 'Site B - Zone 1'),
  ('LDI-B07',          'ldi-b07',   'ldi', true, 'Site B - Zone 1'),
  ('LDI-01',          'ldi-01',          'ldi', true, 'Site A - Zone 1'),
  ('LDI-02',          'ldi-02',          'ldi', true, 'Site A - Zone 1'),
  ('LDI-03',          'ldi-03',          'ldi', true, 'Site B - Zone 1'),
  ('LDI-04',          'ldi-04',          'ldi', true, 'Site B - Zone 1'),
  ('LDI-05',          'ldi-05',          'ldi', true, 'Site A - Zone 2'),
  ('LDI-06',          'ldi-06',          'ldi', true, 'Site A - Zone 2'),
  ('LDI-07',          'ldi-07',          'ldi', true, 'Site A - Zone 3'),
  ('LDI-08',          'ldi-08',          'ldi', true, 'Site A - Zone 3'),
  ('LDI-09',          'ldi-09',          'ldi', true, 'Site B - Zone 2'),
  ('LDI-10',          'ldi-10',          'ldi', true, 'Site B - Zone 2')
ON CONFLICT (device_id) DO UPDATE SET
  device_type = EXCLUDED.device_type,
  location = EXCLUDED.location,
  enabled = EXCLUDED.enabled;
