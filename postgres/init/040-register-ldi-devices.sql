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
  ('LDI_01',          'ldi-01-legacy',   'ldi', true, 'Factory 3 - DF INNER')
ON CONFLICT (device_id) DO UPDATE SET
  device_type = EXCLUDED.device_type,
  location = EXCLUDED.location,
  enabled = EXCLUDED.enabled;
