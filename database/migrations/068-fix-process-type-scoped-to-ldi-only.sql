-- ══════════════════════════════════════════════════════════════
-- Migration 068: scope process_type to device_type='ldi' rows only
-- ══════════════════════════════════════════════════════════════
-- Migration 067 added public.devices.process_type as
-- `ADD COLUMN ... DEFAULT 'ldi'`. A column DEFAULT applies to every
-- existing row at ADD COLUMN time, not just device_type='ldi' rows --
-- caught live after applying 067: all 1002 device_type='server' rows
-- (the E2E-SERVER-* / ERP-MASTER-* synthetic/real infra devices) were
-- also backfilled to process_type='ldi', which is wrong -- process_type
-- has no defined meaning for non-'ldi' device_type rows yet (per
-- docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md §2, it becomes
-- meaningful once a future process type is actually onboarded).
--
-- Fixes the column default going forward and clears the incorrect
-- backfill on existing rows. device_type='ldi' rows are unaffected
-- (still 'ldi', same value, no behavior change for anything reading
-- device_type='ldi' as the join key).

ALTER TABLE public.devices
    ALTER COLUMN process_type DROP DEFAULT;

UPDATE public.devices
SET process_type = NULL
WHERE device_type <> 'ldi' AND process_type = 'ldi';

COMMENT ON COLUMN public.devices.process_type IS
    'Manufacturing process type, meaningful only for device_type=''ldi'' rows today (ldi | aoi | plating | etching | drilling -- only ''ldi'' exists). NULL for non-manufacturing devices. See docs/architecture/MANUFACTURING_DOMAIN.md.';
