-- Masterpiece Polish: Tighten retention to 30 days for raw data
-- (CAGGs retain hourly/minute summaries longer)

-- Current: 90 days raw data retention (job 1001)
-- New: 30 days raw data retention — saves ~66% disk
SELECT remove_retention_policy('machine_telemetry', if_exists => true);
SELECT add_retention_policy('machine_telemetry', INTERVAL '30 days');

-- Verify
SELECT job_id, application_name, config
FROM timescaledb_information.jobs
WHERE hypertable_name = 'machine_telemetry';
