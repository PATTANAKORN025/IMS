CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

CREATE SCHEMA IF NOT EXISTS ims;

CREATE TABLE IF NOT EXISTS ims.machine_telemetry (
    recorded_at TIMESTAMPTZ NOT NULL,
    machine_id TEXT NOT NULL,
    job_id TEXT,
    source TEXT NOT NULL DEFAULT 'nodered',
    temperature_c DOUBLE PRECISION,
    humidity_pct DOUBLE PRECISION,
    vacuum_pa DOUBLE PRECISION,
    lamp_hours DOUBLE PRECISION,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    quality_status TEXT NOT NULL DEFAULT 'raw',
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable (
        'ims.machine_telemetry', 'recorded_at', if_not_exists => TRUE, migrate_data => TRUE
    );

CREATE INDEX IF NOT EXISTS ix_machine_telemetry_machine_time ON ims.machine_telemetry (machine_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS ix_machine_telemetry_job_time ON ims.machine_telemetry (job_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS ix_machine_telemetry_quality_time ON ims.machine_telemetry (
    quality_status,
    recorded_at DESC
);

ALTER TABLE ims.machine_telemetry SET(
    timescaledb.compress,
    timescaledb.compress_segmentby = 'machine_id',
    timescaledb.compress_orderby = 'recorded_at DESC'
);

CREATE MATERIALIZED VIEW IF NOT EXISTS ims.machine_telemetry_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket ('1 hour', recorded_at) AS bucket,
    machine_id,
    avg(temperature_c) AS avg_temperature_c,
    max(temperature_c) AS max_temperature_c,
    avg(humidity_pct) AS avg_humidity_pct,
    avg(vacuum_pa) AS avg_vacuum_pa,
    avg(lamp_hours) AS avg_lamp_hours,
    count(*) AS samples
FROM ims.machine_telemetry
GROUP BY
    1,
    2
WITH
    NO DATA;

SELECT add_retention_policy (
        'ims.machine_telemetry', INTERVAL '365 days'
    );

SELECT add_compression_policy (
        'ims.machine_telemetry', INTERVAL '7 days'
    );

SELECT
    add_continuous_aggregate_policy (
        'ims.machine_telemetry_1h',
        start_offset = > INTERVAL '7 days',
        end_offset = > INTERVAL '5 minutes',
        schedule_interval = > INTERVAL '5 minutes'
    );
