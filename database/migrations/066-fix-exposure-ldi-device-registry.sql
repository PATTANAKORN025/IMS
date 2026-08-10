-- ══════════════════════════════════════════════════════════════
-- Migration 066: fix LDI-A01 / LDI-2B device registry entries
-- ══════════════════════════════════════════════════════════════
-- These two devices (real machine names containing a space -- see the
-- migration 065-adjacent parser fix in nodered_data/flows/ingestion.json
-- and nodered_data/lib/circuit-breaker.js for the crash that was also
-- blocking them) had registry rows left at schema defaults instead of
-- pointing at the mock SNMP simulator:
--   hostname       'ldi-a01' / 'ldi-a02' (does not resolve
--                  on the Docker network -- every simulated device must
--                  point at the ims-snmpsim container itself; snmpsim
--                  differentiates simulated devices by community string,
--                  not by hostname/IP, same pattern as the working
--                  E2E-SERVER-* rows: hostname='ims-snmpsim')
--   snmp_community 'public' (the column DEFAULT, never overridden --
--                  monitoring/snmpsim/ only has a apex_mock.snmprec file, so
--                  querying with community 'public' matches no simulated
--                  data at all; every walker call site defaults to
--                  'apex_mock' for exactly this reason)
--
-- Combined with the parser/circuit-breaker safeKey() fix, this was a
-- two-part blocker: even once the space-in-device-id crash stopped
-- dropping their poll cycles, there was nothing for the walker to
-- successfully reach.

UPDATE public.devices
SET hostname = 'ims-snmpsim',
    snmp_community = 'apex_mock'
WHERE device_id IN ('LDI-A01', 'LDI-A02')
  AND hostname <> 'ims-snmpsim';
