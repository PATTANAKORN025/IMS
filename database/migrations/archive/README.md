# 🛑 ARCHIVE ONLY - DO NOT RUN

These migration scripts are deprecated and kept strictly for historical reference. 
The current schema initialization relies on the V2 normalized architecture in `postgres/init/001-init-timescaledb.sql`.

## What Changed (V1 → V2)

| V1 (Deprecated) | V2 (Current) |
|---|---|
| `public.machine_telemetry` (wide table) | `public.sys_metrics`, `public.net_metrics`, `public.ldi_metrics` (normalized) |
| `public.machines` | `public.devices` (single registry) |
| `telemetry_minute_summary` | `sys_hourly`, `net_hourly`, `ldi_hourly` (CAGGs) |
| `interface_metrics` (JSONB column) | `net_metrics` (per-interface rows) |

## Do NOT

- ❌ Run these scripts against a V2 database
- ❌ Reference `machine_telemetry` in any new code
- ❌ Use `machines` table — it has been deleted
- ❌ Modify these files — they are read-only history
