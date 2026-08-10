-- ══════════════════════════════════════════════════════════════
-- Migration 067: add public.devices.process_type (Manufacturing Domain
-- Architecture forward-compatibility column)
-- ══════════════════════════════════════════════════════════════
-- See docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md §2 and
-- docs/architecture/MANUFACTURING_DOMAIN.md for the full rationale.
--
-- Today "manufacturing" in this schema is LDI by name: device_type='ldi'
-- is the only join key every LDI-specific view/dashboard uses. This column
-- adds an explicit process-type dimension alongside it, defaulted to 'ldi'
-- for every existing device so nothing that already filters on
-- device_type='ldi' changes behavior. It does not replace device_type
-- (which still distinguishes server/workstation/ldi/network at the
-- infrastructure level) -- process_type only has meaning for
-- device_type='ldi' rows today, and becomes meaningful for
-- device_type='network'-polled future process equipment (AOI, plating,
-- etching, drilling) once one is actually onboarded.
--
-- No existing view, dashboard, or linter reads this column yet -- it is
-- purely additive. Nothing breaks if it's never used again; the next
-- process type onboarding is what gives it a second value.

ALTER TABLE public.devices
    ADD COLUMN IF NOT EXISTS process_type TEXT DEFAULT 'ldi';

COMMENT ON COLUMN public.devices.process_type IS
    'Manufacturing process type for device_type=''ldi'' rows (ldi | aoi | plating | etching | drilling -- only ''ldi'' exists today). See docs/architecture/MANUFACTURING_DOMAIN.md.';

UPDATE public.devices
SET process_type = 'ldi'
WHERE device_type = 'ldi' AND process_type IS NULL;
