# Telemetry Data Ontology & Dictionary

This ontology defines the standard naming conventions, units, and JSON payload structures for all equipment integrated into IMS.

## 1. Naming Conventions
All metrics MUST use explicit suffixes to denote units.
- Temperature: `*_celsius`
- Pressure: `*_bar`, `*_kpa`
- Speed/Velocity: `*_rpm`, `*_mm_per_sec`
- Status/State: `*_state` (Integer enum), `*_status` (String)

## 2. Standard LDI Payload (HTTP POST)
**Endpoint**: `POST /ingest/ldi`
```json
{
  "equipment_id": "LDI-01",
  "timestamp": "2026-08-26T09:00:00Z",
  "metrics": {
    "spindle_speed_rpm": 12000,
    "chamber_temp_celsius": 24.5,
    "vacuum_pressure_bar": 1.2
  },
  "alarms": [
    {"code": "E-404", "severity": "CRITICAL", "message": "Vacuum loss"}
  ]
}
```

## 3. SNMP Device Dictionary (Linux/Juniper)
- `sys_cpu_utilization_percent`: 0-100 gauge.
- `sys_mem_available_bytes`: Int64 gauge.
- `if_in_octets` / `if_out_octets`: Counter64.
