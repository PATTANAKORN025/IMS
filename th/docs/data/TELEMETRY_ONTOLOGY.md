# พจนานุกรมและโครงสร้างข้อมูล Telemetry (Ontology)

Ontology นี้กำหนดมาตรฐานชื่อ หน่วย และโครงสร้าง JSON Payload สำหรับอุปกรณ์ทั้งหมดที่เชื่อมต่อกับ IMS

## 1. มาตรฐานการตั้งชื่อ (Naming Conventions)
Metrics ทั้งหมดต้องมี Suffix (คำต่อท้าย) เพื่อระบุหน่วยเสมอ
- อุณหภูมิ (Temperature): `*_celsius`
- ความดัน (Pressure): `*_bar`, `*_kpa`
- ความเร็ว (Speed/Velocity): `*_rpm`, `*_mm_per_sec`
- สถานะ (Status/State): `*_state` (Integer enum), `*_status` (String)

## 2. Payload มาตรฐานสำหรับ LDI (HTTP POST)
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

## 3. พจนานุกรมอุปกรณ์ SNMP (Linux/Juniper)
- `sys_cpu_utilization_percent`: 0-100 gauge.
- `sys_mem_available_bytes`: Int64 gauge.
- `if_in_octets` / `if_out_octets`: Counter64.
