<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS Industrial Telemetry Data Ontology & Dictionary</h1>
  <p><b>Unified naming standards, physical unit suffixes, JSON schemas, and database mappings across all 4 operational domains</b></p>
  <p>
    <a href="TELEMETRY_ONTOLOGY.md">English</a> |
    <a href="../../th/docs/data/TELEMETRY_ONTOLOGY.md">ไทย</a> |
    <a href="../../zh-CN/docs/data/TELEMETRY_ONTOLOGY.md">简体中文</a>
  </p>
</div>

---

## 1. Naming Conventions & Physical Units (SI Standards)

To guarantee interoperability and prevent ambiguity across diverse hardware manufacturers (LDI, CNC drilling, VCP plating lines, and server infrastructure), all metrics ingested into IMS adhere to strict naming conventions:

- Metric names use lowercase alphanumeric characters with snake_case (`[a-z0-9_]+`).
- Metric names **MUST** include an explicit suffix denoting the physical engineering unit:
  - **Temperature**: `*_celsius`
  - **Pressure & Vacuum**: `*_kpa`, `*_bar`
  - **Velocity & Speed**: `*_rpm`, `*_mm_per_sec`, `*_m_per_min`
  - **Vibration & Acceleration**: `*_mm_per_sec2`, `*_g`
  - **Electrical Current & Voltage**: `*_amp`, `*_volt`, `*_amp_per_dm2`
  - **Energy & Exposure Dosage**: `*_mj_per_cm2`
  - **Linear Dimensions & Offsets**: `*_mm`, `*_um`
  - **Time & Duration**: `*_sec`, `*_ms`, `*_min`
  - **Operational State**: `*_state` (boolean / integer enum), `*_status` (string token)
  - **Network & Storage Quantities**: `*_bytes`, `*_octets`, `*_packets`, `*_percent`

---

## 2. Laser Direct Imaging (LDI) Telemetry Schema

High-frequency time-series telemetry delivered from optical exposure machines.

- **Ingestion Path**: `POST /ldi-telemetry` (via Nginx reverse proxy)
- **Destination Hypertable**: `public.ldi_data` (1-hour chunk intervals)

### JSON Ingestion Payload

```json
{
  "time": "2026-09-28T04:00:00Z",
  "factory": "F1",
  "process": "LDI",
  "eqp_id": "LDI-01",
  "mo": "MO-001234",
  "fpn": "PN-5678",
  "layer_name": "L1",
  "resist_dosage": 45.5,
  "scale_x": 1.002,
  "scale_y": 0.998,
  "temperature": 24.5,
  "humidity": 45.0,
  "scan_speed": 120.0,
  "air_vacuum": -15.2,
  "thickness": 1.2,
  "board_no": 1,
  "total_board": 100,
  "total_time": 450.5,
  "state": true,
  "pe_1": 1.1,
  "je_1": 2.2,
  "log_id": "LOG-10001"
}
```

### Data Dictionary & Constraints

| Field Name | Data Type | Postgres Type | Engineering Unit | Nominal Range | Description |
|:-----------|:----------|:--------------|:-----------------|:--------------|:------------|
| `time` | ISO 8601 | `TIMESTAMPTZ` | UTC timestamp | Live time | Telemetry collection timestamp. |
| `factory` | String | `VARCHAR(16)` | Text ID | `F1` | Manufacturing plant code. |
| `process` | String | `VARCHAR(32)` | Text ID | `LDI`, `DF INNER` | Process stage classification. |
| `eqp_id` | String | `VARCHAR(32)` | Equipment ID | `LDI-01`..`LDI-10` | Unique equipment identifier. |
| `mo` | String | `VARCHAR(64)` | Work Order | `MO-000001`+ | Manufacturing Order number. |
| `fpn` | String | `VARCHAR(64)` | Part Number | `PN-0001`+ | Factory part number code. |
| `layer_name`| String | `VARCHAR(32)` | Layer ID | `L1`..`L12` | PCB layer being imaged. |
| `resist_dosage` | Float | `REAL` | $\text{mJ/cm}^2$ | 35.0 - 55.0 | Photoresist exposure light energy. |
| `scale_x` | Float | `REAL` | Ratio | 0.995 - 1.005 | Optical X-axis scaling factor. |
| `scale_y` | Float | `REAL` | Ratio | 0.995 - 1.005 | Optical Y-axis scaling factor. |
| `temperature` | Float | `REAL` | $^\circ\text{C}$ | 22.0 - 26.0 | Chamber ambient temperature. |
| `humidity` | Float | `REAL` | $\% \text{RH}$ | 40.0 - 55.0 | Chamber relative humidity. |
| `scan_speed` | Float | `REAL` | $\text{mm/s}$ | 80.0 - 160.0 | Optical head traverse speed. |
| `air_vacuum` | Float | `REAL` | $\text{kPa}$ | -25.0 - -10.0 | Chuck vacuum hold-down pressure. |
| `thickness` | Float | `REAL` | $\text{mm}$ | 0.4 - 3.2 | Core panel thickness. |
| `board_no` | Integer | `INTEGER` | Counter | 1 - 500 | Sequence number of board in lot. |
| `total_board`| Integer | `INTEGER` | Count | 10 - 1000 | Total expected boards in lot. |
| `total_time` | Float | `REAL` | Seconds | 100.0 - 3600.0| Cumulative exposure run time. |
| `state` | Boolean | `BOOLEAN` | True/False | `true` (running) | Current machine run status. |
| `pe_1` | Float | `REAL` | $\mu\text{m}$ | -5.0 - 5.0 | Measured position error channel 1. |
| `je_1` | Float | `REAL` | $\mu\text{m}$ | 0.0 - 4.0 | Measured optical jitter error. |
| `log_id` | String | `VARCHAR(64)` | Unique ID | `LOG-10001`+ | Correlated log trace record ID. |

---

## 3. CNC Mechanical Drilling Equipment Schema

Drilling fleet events, tool wear metrics, and spindle vibration readings.

- **Storage Location**: `eap_backup` database (table: `public.machine_event`)
- **Synthetic Generator**: `scripts/mock/eap-mock-data.js`

### Operational Metrics & Event Dictionary

| Metric / Field | Type | Engineering Unit | Typical Range | Description |
|:---------------|:-----|:-----------------|:--------------|:------------|
| `machine_id` | String | Alphanumeric | `DRL-01`..`DRL-12` | Drilling equipment identifier. |
| `spindle_id` | Integer | Identifier | 1 - 6 | Spindle head station number. |
| `spindle_rpm` | Integer | RPM | 15,000 - 200,000 | Spindle rotational speed. |
| `feed_rate_mm_per_min` | Float | $\text{mm/min}$ | 500 - 3,500 | Z-axis plunging feed speed. |
| `vibration_rms_mm_per_sec` | Float | $\text{mm/s}$ | 0.1 - 4.5 | High-frequency spindle RMS vibration. |
| `hit_count` | Integer | Counter | 0 - 3,500 | Number of drill holes on current tool. |
| `tool_diameter_mm` | Float | $\text{mm}$ | 0.10 - 6.35 | Micro-drill bit nominal diameter. |
| `bearing_temp_celsius` | Float | $^\circ\text{C}$ | 28.0 - 55.0 | Spindle bearing sleeve temperature. |
| `motor_load_percent` | Float | $\%$ | 10.0 - 85.0 | Spindle drive inverter load current. |
| `event_code` | String | Alphanumeric | `TOOL_CHANGE`, `ALARM` | Machine event transition token. |

---

## 4. Vertical Continuous Plating (VCP) Telemetry Schema

Chemical bath sensor telemetry, hoist movement events, and rectifier electrical parameters.

- **Storage Location**: `eap_backup` database (table: `public.vcp_upp`)

### Chemical Bath & Physical Parameters

| Parameter | Type | Unit | Nominal Specification | Description |
|:----------|:-----|:-----|:-----------------------|:------------|
| `line_id` | String | Text | `VCP-01`..`VCP-03` | Vertical Continuous Plating line code. |
| `line_speed_m_per_min` | Float | $\text{m/min}$ | 0.8 - 2.5 | Conveyor substrate traverse velocity. |
| `plating_time_min` | Float | Minutes | 20.0 - 60.0 | Substrate immersion dwell duration. |
| `rectifier_current_amp` | Float | Amperes | 100 - 1,200 | DC plating rectifier current output. |
| `current_density_asd` | Float | $\text{A/dm}^2$ | 1.0 - 3.5 | Surface area normalized current density. |
| `bath_copper_g_per_l` | Float | $\text{g/L}$ | 18.0 - 24.0 | $\text{Cu}^{2+}$ copper ion concentration. |
| `bath_acid_g_per_l` | Float | $\text{g/L}$ | 180.0 - 220.0 | $\text{H}_2\text{SO}_4$ sulfuric acid concentration. |
| `bath_chloride_ppm` | Float | $\text{ppm}$ | 40 - 80 | $\text{Cl}^-$ chloride ion additive level. |
| `bath_temp_celsius` | Float | $^\circ\text{C}$ | 22.0 - 28.0 | Active electrolytic bath temperature. |
| `dosing_pump_status` | Boolean | True/False | `true` (dosing active) | Chemical replenishment pump status. |

---

## 5. Enterprise Infrastructure SNMP Telemetry Dictionary

SNMP polling dictionary for Linux compute nodes and Juniper EX Ethernet switches.

- **Ingestion Path**: Polled via Node-RED sequential bulk SNMP walker (`UDP 161`)
- **Destination Hypertables**: `public.sys_metrics`, `public.net_metrics` (1-day chunk intervals)

### Host Compute Metrics (`sys_metrics`)

| Metric Name | SNMP OID | Type | Unit | Description |
|:------------|:---------|:-----|:-----|:------------|
| `sys_cpu_utilization_percent` | `1.3.6.1.4.1.2021.11.11.0` | Gauge | $\%$ (0-100) | Instantaneous aggregate CPU utilization. |
| `sys_mem_total_bytes` | `1.3.6.1.4.1.2021.4.5.0` | Gauge | Bytes | Total physical RAM installed on node. |
| `sys_mem_available_bytes` | `1.3.6.1.4.1.2021.4.6.0` | Gauge | Bytes | Available unallocated memory capacity. |
| `sys_disk_used_percent` | `1.3.6.1.4.1.2021.9.1.9.1` | Gauge | $\%$ (0-100) | Root filesystem volume disk utilization. |
| `sys_load_1m` | `1.3.6.1.4.1.2021.10.1.3.1` | Gauge | Ratio | Operating system 1-minute load average. |

### Network Switch Metrics (`net_metrics`)

| Metric Name | SNMP MIB | Type | Unit | Description |
|:------------|:---------|:-----|:-----|:------------|
| `if_in_octets` | `IF-MIB::ifHCInOctets` | Counter64 | Bytes (Octets) | Inbound interface traffic volume counter. |
| `if_out_octets` | `IF-MIB::ifHCOutOctets` | Counter64 | Bytes (Octets) | Outbound interface traffic volume counter. |
| `if_in_errors` | `IF-MIB::ifInErrors` | Counter32 | Packets | Number of inbound packet frame check errors. |
| `if_out_discards` | `IF-MIB::ifOutDiscards` | Counter32 | Packets | Outbound packets discarded due to queue buffer fullness. |
| `if_oper_status` | `IF-MIB::ifOperStatus` | Integer | Enum (1=Up, 2=Down) | Physical interface link carrier state. |

---

## 6. TimescaleDB Continuous Aggregates (CAGGs) Mapping

To accelerate queries across millions of historical rows, raw hypertables are pre-computed into Continuous Aggregates:

| Raw Table | Continuous Aggregate View | Bucket Interval | Refreshed Schedule | Retention |
|:----------|:--------------------------|:----------------|:-------------------|:----------|
| `public.ldi_data` | `public.ldi_data_1m` | 1 Minute | Every 1 minute | 14 Days |
| `public.ldi_data` | `public.ldi_data_15m` | 15 Minutes | Every 15 minutes | 90 Days |
| `public.ldi_data` | `public.ldi_data_1h` | 1 Hour | Every 1 hour | 2 Years |
| `public.sys_metrics` | `public.sys_metrics_1h` | 1 Hour | Every 1 hour | 2 Years |
| `public.net_metrics` | `public.net_metrics_1h` | 1 Hour | Every 1 hour | 2 Years |

```sql
-- Analytical query against 15-minute continuous aggregate
SELECT
  bucket AS "time",
  machine_id,
  ROUND(avg_temperature::numeric, 2) AS temperature,
  ROUND(avg_scan_speed::numeric, 2) AS scan_speed
FROM public.ldi_data_15m
WHERE machine_id = 'LDI-01'
  AND bucket > NOW() - INTERVAL '24 hours'
ORDER BY bucket ASC;
```
