# พจนานุกรมและโครงสร้างข้อมูล Telemetry (Ontology)

Ontology นี้กำหนดมาตรฐานชื่อ หน่วย และโครงสร้าง JSON Payload สำหรับอุปกรณ์ทั้งหมดที่เชื่อมต่อกับ IMS

## 1. มาตรฐานการตั้งชื่อ (Naming Conventions)
Metrics ทั้งหมดต้องมี Suffix (คำต่อท้าย) เพื่อระบุหน่วยเสมอ
- อุณหภูมิ (Temperature): `*_celsius`
- ความดัน (Pressure): `*_bar`, `*_kpa`
- ความเร็ว (Speed/Velocity): `*_rpm`, `*_mm_per_sec`
- สถานะ (Status/State): `*_state` (Integer enum), `*_status` (String)

## 2. Payload มาตรฐานสำหรับ LDI (HTTP POST)
**Endpoint**: `POST /ldi-telemetry`
```json
{
  "time": "2026-08-26T09:00:00Z",
  "factory": "F1",
  "process": "LDI",
  "eqp_id": "LDI-01",
  "mo": "MO12345",
  "fpn": "PN9876",
  "layer_name": "L1",
  "resist_dosage": 45.5,
  "scale_x": 1.002,
  "scale_y": 0.998,
  "temperature": 24.5,
  "humidity": 45.0,
  "scan_speed": 120.0,
  "air_vacuum": -0.8,
  "thickness": 1.2,
  "board_no": 1,
  "total_board": 100,
  "total_time": 450.5,
  "filmno": "F001",
  "board_id": "B001",
  "resist": "R-100",
  "state": true,
  "scale_mode": "AUTO",
  "pe_1": 1.1,
  "je_1": 2.2,
  "pe_setting": 1.0,
  "je_setting": 2.0,
  "log_id": "LOG-5555"
}
```

## 3. พจนานุกรมอุปกรณ์ SNMP (Linux/Juniper)
- `sys_cpu_utilization_percent`: 0-100 gauge.
- `sys_mem_available_bytes`: Int64 gauge.
- `if_in_octets` / `if_out_octets`: Counter64.
