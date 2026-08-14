-- Container restart audit table
--
-- Soak Test Attempt 4 (docs/evidence/SOAK_TEST_LOG.md) found the soak
-- script's own restart detection was blind to manual `docker compose
-- restart` (only RestartCount, which never fires for that path). Fixed
-- there for the soak script's own point-in-time sampling, but that's
-- still poll-based and only watches 3 containers. This table is the
-- durable, event-driven record: scripts/observability-archiver.sh
-- subscribes to `docker events` and inserts a row here for every
-- start/die/restart/kill/oom on every container, independent of any
-- polling interval and independent of Docker's own json-file log
-- rotation (which is what made the 2026-08-13 16h simulator outage
-- unforensicable after the fact -- see DR_DRILL_3_FINDINGS.md /
-- SOAK_TEST_LOG.md Attempt 1).
CREATE TABLE IF NOT EXISTS public.container_restart_audit (
    id            BIGSERIAL PRIMARY KEY,
    container_name TEXT NOT NULL,
    event_action  TEXT NOT NULL,        -- start | die | restart | kill | oom
    event_time    TIMESTAMPTZ NOT NULL,
    raw_event     JSONB NOT NULL,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restart_audit_container_time
    ON public.container_restart_audit (container_name, event_time DESC);

CREATE INDEX IF NOT EXISTS idx_restart_audit_action_time
    ON public.container_restart_audit (event_action, event_time DESC);

COMMENT ON TABLE public.container_restart_audit IS
    'Event-driven container lifecycle audit, fed by scripts/observability-archiver.sh subscribing to `docker events`. Durable (DB-backed) record independent of Docker''s own rotating container logs.';
