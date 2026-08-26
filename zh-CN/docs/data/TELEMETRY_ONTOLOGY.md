# 遥测数据本体与数据字典 (Ontology)

本体定义了集成到 IMS 的所有设备的标准命名约定、单位和 JSON 有效载荷结构。

## 1. 命名约定 (Naming Conventions)
所有指标都必须使用明确的后缀来表示单位。
- 温度 (Temperature): `*_celsius`
- 压力 (Pressure): `*_bar`, `*_kpa`
- 速度 (Speed/Velocity): `*_rpm`, `*_mm_per_sec`
- 状态 (Status/State): `*_state` (整数枚举), `*_status` (字符串)

## 2. 标准 LDI 有效载荷 (HTTP POST)
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

## 3. SNMP 设备字典 (Linux/Juniper)
- `sys_cpu_utilization_percent`: 0-100 gauge.
- `sys_mem_available_bytes`: Int64 gauge.
- `if_in_octets` / `if_out_octets`: Counter64.
