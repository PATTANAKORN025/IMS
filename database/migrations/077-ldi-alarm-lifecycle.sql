-- ══════════════════════════════════════════════════════════════
-- 077: real alarm lifecycle state (OPEN -> ACKNOWLEDGED -> RESOLVED)
-- ══════════════════════════════════════════════════════════════
-- public.ldi_alarm_log is a pure append-only event log (logid, logdate,
-- errorcode, equipmentid, ...) -- it records that an alarm fired, nothing
-- about what happened after. The Andon Action Queue panel has been
-- displaying a derived "Owner"/"Elapsed" pair computed purely from
-- errorcode->category lookup and now()-logdate, with no actual operator
-- interaction ever recorded anywhere. This migration adds the missing
-- state: a real per-alarm lifecycle row an operator write-path (not built
-- yet -- next phase) can transition through ack/resolve.
--
-- Design notes:
-- * Separate plain table, not columns on ldi_alarm_log itself.
--   ldi_alarm_log is a hypertable with a 7-day compression policy (see
--   policy_compression job on hypertable_id 8); lifecycle rows need
--   frequent single-row UPDATEs (ack now, resolve later, maybe days
--   apart) which is exactly the access pattern hypertable compression
--   punishes. A small mutable table keyed on the same (logdate, logid)
--   PK keeps the hot, frequently-updated state away from the append-only,
--   eventually-compressed fact table -- same separation already used for
--   ldi_alarm_state (migration 069), which is simulator-internal debounce
--   state rather than operator state.
-- * No backfill for pre-existing ldi_alarm_log rows. There is no real
--   record of what happened to historical alarms before this feature
--   existed, and defaulting them to OPEN (implies still unhandled) or
--   RESOLVED (implies someone closed them) would both be fabricated data
--   -- consistent with this project's stated "no falsified data"
--   principle. Pre-migration alarms simply have no lifecycle row; callers
--   LEFT JOIN and treat NULL status as "predates lifecycle tracking",
--   distinct from OPEN.
-- * State transitions are enforced by trigger, not left to the future
--   write-path application to get right: RESOLVED is terminal (no further
--   UPDATEs of any kind), ACKNOWLEDGED/RESOLVED require an actor
--   (acknowledged_by/resolved_by), and timestamps auto-stamp server-side
--   (now()) rather than trusting client-supplied times.

CREATE TABLE IF NOT EXISTS public.ldi_alarm_lifecycle (
    logid            VARCHAR(50)     NOT NULL,
    logdate          TIMESTAMPTZ     NOT NULL,
    status           VARCHAR(20)     NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
    acknowledged_at  TIMESTAMPTZ,
    acknowledged_by  VARCHAR(100),
    resolved_at      TIMESTAMPTZ,
    resolved_by      VARCHAR(100),
    resolution_note  TEXT,
    updated_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
    PRIMARY KEY (logdate, logid),
    FOREIGN KEY (logdate, logid) REFERENCES public.ldi_alarm_log (logdate, logid) ON DELETE CASCADE
);
COMMENT ON TABLE public.ldi_alarm_lifecycle IS
    'Real operator alarm state: OPEN -> ACKNOWLEDGED -> RESOLVED, one row per ldi_alarm_log event. Populated automatically as OPEN when the alarm fires (trg_ldi_alarm_lifecycle_init); transitions are actor-attributed and enforced by trg_ldi_alarm_lifecycle_guard. No row = alarm predates this feature, not the same as OPEN.';

CREATE INDEX IF NOT EXISTS idx_ldi_alarm_lifecycle_status
    ON public.ldi_alarm_lifecycle (status)
    WHERE status <> 'RESOLVED';

CREATE OR REPLACE FUNCTION public.f_ldi_alarm_lifecycle_init()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.ldi_alarm_lifecycle (logid, logdate, status)
    VALUES (NEW.logid, NEW.logdate, 'OPEN')
    ON CONFLICT (logdate, logid) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ldi_alarm_lifecycle_init
    AFTER INSERT ON public.ldi_alarm_log
    FOR EACH ROW EXECUTE FUNCTION public.f_ldi_alarm_lifecycle_init();

CREATE OR REPLACE FUNCTION public.f_ldi_alarm_lifecycle_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'RESOLVED' THEN
        RAISE EXCEPTION 'ldi_alarm_lifecycle: row (logdate=%, logid=%) is RESOLVED -- terminal, no further updates allowed', OLD.logdate, OLD.logid;
    END IF;

    IF NEW.status = OLD.status THEN
        -- editing resolution_note or similar before a real state change; no stamp changes
        NULL;
    ELSIF NEW.status = 'ACKNOWLEDGED' THEN
        IF OLD.status <> 'OPEN' THEN
            RAISE EXCEPTION 'ldi_alarm_lifecycle: invalid transition % -> ACKNOWLEDGED', OLD.status;
        END IF;
        IF NEW.acknowledged_by IS NULL THEN
            RAISE EXCEPTION 'ldi_alarm_lifecycle: acknowledged_by is required to transition to ACKNOWLEDGED';
        END IF;
        NEW.acknowledged_at := COALESCE(NEW.acknowledged_at, now());
    ELSIF NEW.status = 'RESOLVED' THEN
        IF OLD.status NOT IN ('OPEN', 'ACKNOWLEDGED') THEN
            RAISE EXCEPTION 'ldi_alarm_lifecycle: invalid transition % -> RESOLVED', OLD.status;
        END IF;
        IF NEW.resolved_by IS NULL THEN
            RAISE EXCEPTION 'ldi_alarm_lifecycle: resolved_by is required to transition to RESOLVED';
        END IF;
        NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    ELSIF NEW.status = 'OPEN' THEN
        RAISE EXCEPTION 'ldi_alarm_lifecycle: cannot transition % -> OPEN', OLD.status;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ldi_alarm_lifecycle_guard
    BEFORE UPDATE ON public.ldi_alarm_lifecycle
    FOR EACH ROW EXECUTE FUNCTION public.f_ldi_alarm_lifecycle_guard();

GRANT SELECT ON public.ldi_alarm_lifecycle TO grafana_reader;
