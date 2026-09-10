# 遥测数据本体与数据字典 (Ontology)

本体定义了集成到 IMS 的所有设备的标准命名约定、单位和 JSON 有效载荷结构。

## 1. 命名约定 (Naming Conventions)
所有指标都必须使用明确的后缀来表示单位。
- 温度 (Temperature): `*_celsius`
- 压力 (Pressure): `*_bar`, `*_kpa`
- 速度 (Speed/Velocity): `*_rpm`, `*_mm_per_sec`
- 状态 (Status/State): `*_state` (整数枚举), `*_status` (字符串)

## 2. 标准 LDI 有效载荷 (HTTP POST)
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

## 3. SNMP 设备字典 (Linux/Juniper)
- `sys_cpu_utilization_percent`: 0-100 gauge.
- `sys_mem_available_bytes`: Int64 gauge.
- `if_in_octets` / `if_out_octets`: Counter64.
