-- ══════════════════════════════════════════════════════════════
-- 051: ldi_alarm_log.related_log_id — a specific event link to ldi_data.log_id
-- ══════════════════════════════════════════════════════════════
-- v_ldi_machine_snapshot already correlates ldi_data rows to nearby alarms
-- via a LATERAL join (nearest ldi_alarm_log row within +/-2 minutes,
-- recomputed on every query). This migration adds the mirror-image link
-- as a real, stored, indexed column on ldi_alarm_log -- so "which exact
-- telemetry snapshot was active when this alarm fired" is an O(1) lookup
-- instead of a recomputed nearest-neighbor scan every time.
--
-- ldi_alarm_log.logid (e.g. 'SIM-ALM-1785913154528-LDI-01-91009-434153')
-- and ldi_data.log_id (e.g. 'SIM-01-1003-133') are two independent ID
-- spaces from different generators -- they never share values, so a
-- literal FOREIGN KEY between logid and log_id would be nonsensical.
-- related_log_id is a new column specifically for this cross-reference.
--
-- TimescaleDB does not support real FOREIGN KEY constraints between two
-- hypertables (both ldi_data and ldi_alarm_log are hypertables) -- the
-- trigger below is the closest equivalent: it auto-computes
-- related_log_id via the same nearest-row-within-2-minutes rule
-- v_ldi_machine_snapshot already uses, and validates that the resulting
-- (or caller-provided) value actually exists in ldi_data before allowing
-- the row through.

ALTER TABLE public.ldi_alarm_log ADD COLUMN IF NOT EXISTS related_log_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_ldi_alarm_related_log_id
    ON public.ldi_alarm_log (related_log_id);

-- Backfill existing rows using the nearest-telemetry-row rule.
UPDATE public.ldi_alarm_log a
SET related_log_id = (
    SELECT d.log_id
    FROM public.ldi_data d
    WHERE d.eqp_id = a.equipmentid
      AND d."time" BETWEEN a.logdate - INTERVAL '2 minutes' AND a.logdate + INTERVAL '2 minutes'
    ORDER BY ABS(EXTRACT(EPOCH FROM (d."time" - a.logdate)))
    LIMIT 1
)
WHERE a.related_log_id IS NULL;

CREATE OR REPLACE FUNCTION public.f_ldi_alarm_link_log_id() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.related_log_id IS NULL THEN
        SELECT d.log_id INTO NEW.related_log_id
        FROM public.ldi_data d
        WHERE d.eqp_id = NEW.equipmentid
          AND d."time" BETWEEN NEW.logdate - INTERVAL '2 minutes' AND NEW.logdate + INTERVAL '2 minutes'
        ORDER BY ABS(EXTRACT(EPOCH FROM (d."time" - NEW.logdate)))
        LIMIT 1;
    ELSIF NOT EXISTS (SELECT 1 FROM public.ldi_data d WHERE d.log_id = NEW.related_log_id) THEN
        RAISE EXCEPTION 'ldi_alarm_log.related_log_id % does not exist in ldi_data.log_id', NEW.related_log_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ldi_alarm_link_log_id ON public.ldi_alarm_log;
CREATE TRIGGER trg_ldi_alarm_link_log_id
    BEFORE INSERT OR UPDATE ON public.ldi_alarm_log
    FOR EACH ROW EXECUTE FUNCTION public.f_ldi_alarm_link_log_id();
