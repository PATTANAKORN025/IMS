-- Device Registry table for dynamic SNMP target management
-- Created after device_registry function node was added to ingestion flow

CREATE TABLE IF NOT EXISTS public.machines (
    machine_id    TEXT PRIMARY KEY,
    hostname      TEXT NOT NULL,
    community     TEXT NOT NULL DEFAULT 'public',
    snmp_port     INT NOT NULL DEFAULT 161,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with simulator devices (dev mode)
INSERT INTO public.machines (machine_id, hostname, community, snmp_port) VALUES
    ('ERP-MASTER-WINDOWS', 'ims-snmpsim', 'Netk@', 161),
    ('ERP-MASTER-UBUNTU',  'ims-snmpsim', 'Netk@', 161)
ON CONFLICT (machine_id) DO NOTHING;
