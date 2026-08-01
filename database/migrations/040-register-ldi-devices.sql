-- Migration 040: Register LDI machines in devices table
-- Required for FK integrity and dashboard variable dropdowns

INSERT INTO public.devices (device_id, hostname, ip_address, device_type, enabled, location)
VALUES
  ('LDI-01', 'ldi-machine-01', '10.1.1.1', 'ldi', true, 'Factory 2 - DF INNER'),
  ('LDI-02', 'ldi-machine-02', '10.1.1.2', 'ldi', true, 'Factory 2 - DF INNER'),
  ('LDI-03', 'ldi-machine-03', '10.1.1.3', 'ldi', true, 'Factory 3 - DF INNER'),
  ('LDI-04', 'ldi-machine-04', '10.1.1.4', 'ldi', true, 'Factory 3 - DF INNER'),
  ('LDI-05', 'ldi-machine-05', '10.1.1.5', 'ldi', true, 'Factory 2 - DF OUTER'),
  ('LDI-06', 'ldi-machine-06', '10.1.1.6', 'ldi', true, 'Factory 2 - DF OUTER'),
  ('LDI-07', 'ldi-machine-07', '10.1.1.7', 'ldi', true, 'Factory 2 - SM'),
  ('LDI-08', 'ldi-machine-08', '10.1.1.8', 'ldi', true, 'Factory 2 - SM'),
  ('LDI-09', 'ldi-machine-09', '10.1.1.9', 'ldi', true, 'Factory 3 - SM'),
  ('LDI-10', 'ldi-machine-10', '10.1.1.10', 'ldi', true, 'Factory 3 - SM')
ON CONFLICT (device_id) DO UPDATE SET
  device_type = EXCLUDED.device_type,
  location = EXCLUDED.location,
  enabled = EXCLUDED.enabled;

