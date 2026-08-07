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
-- in the real telemetry export (LDI001-LD1, LDI001-LD2, LDI_01) --
-- confirmed genuinely distinct from LDI002-LD1/LD2 by months of
-- concurrent, overlapping alarm activity (rules out "renamed over time").
-- All share factory='3'/process='DF' with LDI002-LD1/LD2. Registered here
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
  ('EXPOSURE LDI-2',  'exposure-ldi-2',  'ldi', true, 'Factory 2 - DF INNER'),
  ('EXPOSURE LDI-2B', 'exposure-ldi-2b', 'ldi', true, 'Factory 2 - DF INNER'),
  ('LDI002-LD1',      'ldi002-ld1',      'ldi', true, 'Factory 3 - DF INNER'),
  ('LDI002-LD2',      'ldi002-ld2',      'ldi', true, 'Factory 3 - DF INNER'),
  ('LDI-C-01',        'ldi-c-01',        'ldi', true, 'Factory 2 - DF OUTER'),
  ('LDI-C-02',        'ldi-c-02',        'ldi', true, 'Factory 2 - DF OUTER'),
  ('LDIA-01',         'ldia-01',         'ldi', true, 'Factory 2 - SM'),
  ('LDIA-02',         'ldia-02',         'ldi', true, 'Factory 2 - SM'),
  ('LDIA3-SM-LDI1',   'ldia3-sm-ldi1',   'ldi', true, 'Factory 3 - SM'),
  ('LDIA3-SM-LDI2',   'ldia3-sm-ldi2',   'ldi', true, 'Factory 3 - SM'),
  ('LDI001-LD1',      'ldi001-ld1',      'ldi', true, 'Factory 3 - DF INNER'),
  ('LDI001-LD2',      'ldi001-ld2',      'ldi', true, 'Factory 3 - DF INNER'),
  ('LDI_01',          'ldi-01-legacy',   'ldi', true, 'Factory 3 - DF INNER'),
  ('LDI-01',          'ldi-01',          'ldi', true, 'Factory 2 - DF INNER'),
  ('LDI-02',          'ldi-02',          'ldi', true, 'Factory 2 - DF INNER'),
  ('LDI-03',          'ldi-03',          'ldi', true, 'Factory 3 - DF INNER'),
  ('LDI-04',          'ldi-04',          'ldi', true, 'Factory 3 - DF INNER'),
  ('LDI-05',          'ldi-05',          'ldi', true, 'Factory 2 - DF OUTER'),
  ('LDI-06',          'ldi-06',          'ldi', true, 'Factory 2 - DF OUTER'),
  ('LDI-07',          'ldi-07',          'ldi', true, 'Factory 2 - SM'),
  ('LDI-08',          'ldi-08',          'ldi', true, 'Factory 2 - SM'),
  ('LDI-09',          'ldi-09',          'ldi', true, 'Factory 3 - SM'),
  ('LDI-10',          'ldi-10',          'ldi', true, 'Factory 3 - SM')
ON CONFLICT (device_id) DO UPDATE SET
  device_type = EXCLUDED.device_type,
  location = EXCLUDED.location,
  enabled = EXCLUDED.enabled;
