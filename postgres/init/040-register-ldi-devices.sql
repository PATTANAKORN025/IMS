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
-- All share factory='3'/process='DF' with LDI-B01/LD2. Registered here
-- (not only in the import script) so a fresh deploy that later loads real
-- alarm data doesn't hit an FK violation.

INSERT INTO public.devices (device_id, hostname, device_type, enabled, location)
VALUES
  ('LDI-A01',  'ldi-a01',  'ldi', true, 'Site A - Zone 1'),
  ('LDI-A02', 'ldi-a02', 'ldi', true, 'Site A - Zone 1'),
  ('LDI-B01',      'ldi-b01',      'ldi', true, 'Site B - Zone 1'),
  ('LDI-B02',      'ldi-b02',      'ldi', true, 'Site B - Zone 1'),
  ('LDI-A03',        'ldi-a03',        'ldi', true, 'Site A - Zone 2'),
  ('LDI-A04',        'ldi-a04',        'ldi', true, 'Site A - Zone 2'),
  ('LDI-A05',         'ldi-a05',         'ldi', true, 'Site A - Zone 3'),
  ('LDI-A06',         'ldi-a06',         'ldi', true, 'Site A - Zone 3'),
  ('LDI-B03',   'ldi-b03',   'ldi', true, 'Site B - Zone 2'),
  ('LDI-B04',   'ldi-b04',   'ldi', true, 'Site B - Zone 2'),
  ('LDI-B05',      'ldi-b05',      'ldi', true, 'Site B - Zone 1'),
  ('LDI-B06',      'ldi-b06',      'ldi', true, 'Site B - Zone 1'),
  ('LDI-B07',          'ldi-b07',   'ldi', true, 'Site B - Zone 1')
ON CONFLICT (device_id) DO UPDATE SET
  device_type = EXCLUDED.device_type,
  location = EXCLUDED.location,
  enabled = EXCLUDED.enabled;
