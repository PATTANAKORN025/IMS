# 🛑 ARCHIVED MIGRATIONS CLEARED. DO NOT ADD SCRIPTS HERE. ONLY USE 013 AND 014 FOR V2 SCHEMA.

The legacy V1 migration scripts (001-012) that referenced `machine_telemetry` and `machines` have been permanently deleted. The current schema initialization is entirely handled by `postgres/init/001-init-timescaledb.sql` (V2 normalized architecture).
