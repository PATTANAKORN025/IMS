<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS 工业遥测数据本体与数据字典 (Ontology)</h1>
  <p><b>统一命名规范、物理工程单位后缀、JSON Schema 以及跨 4 大生产与基础设施领域的数据库映射</b></p>
  <p>
    <a href="../../../docs/data/TELEMETRY_ONTOLOGY.md">English</a> |
    <a href="../../../th/docs/data/TELEMETRY_ONTOLOGY.md">ไทย</a> |
    <a href="TELEMETRY_ONTOLOGY.md">简体中文</a>
  </p>
</div>

---

## 1. 命名规范与物理工程单位 (SI Standards)

为确保跨不同设备厂商（LDI 曝光机、数控钻孔机、VCP 电镀线以及服务器网络基础设施）的系统互操作性并消除语义歧义，所有摄入 IMS 的遥测指标均严格遵循以下命名约定：

- 指标名称采用小写字母与数字，下划线分隔 (`[a-z0-9_]+`)。
- 指标名称 **必须** 包含指明物理工程单位的显式后缀：
  - **温度 (Temperature)**: `*_celsius`
  - **压力与真空度 (Pressure & Vacuum)**: `*_kpa`, `*_bar`
  - **线速度与转速 (Velocity & Speed)**: `*_rpm`, `*_mm_per_sec`, `*_m_per_min`
  - **振动与加速度 (Vibration & Acceleration)**: `*_mm_per_sec2`, `*_g`
  - **电流与电压 (Current & Voltage)**: `*_amp`, `*_volt`, `*_amp_per_dm2`
  - **曝光能量与剂量 (Energy & Exposure Dosage)**: `*_mj_per_cm2`
  - **几何尺寸与偏移量 (Linear Dimensions & Offsets)**: `*_mm`, `*_um`
  - **时间与持续时长 (Time & Duration)**: `*_sec`, `*_ms`, `*_min`
  - **运行状态 (Operational State)**: `*_state` (布尔型 / 整数枚举), `*_status` (字符串标识)
  - **网络与存储容量 (Network & Storage)**: `*_bytes`, `*_octets`, `*_packets`, `*_percent`

---

## 2. 激光直接成像机 (LDI) 遥测结构

来自光学曝光设备的高频时序遥测数据。

- **摄入路径 (Ingestion Path)**: `POST /ldi-telemetry` (通过 Nginx 反向代理)
- **目标超表 (Destination Hypertable)**: `public.ldi_data` (1 小时分区 Chunk 间隔)

### JSON 摄入有效载荷示例

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

### 数据字典与字段约束

| 字段名称 | 数据类型 | Postgres 类型 | 工程单位 | 标称范围 | 字段说明 |
|:---------|:---------|:--------------|:---------|:---------|:---------|
| `time` | ISO 8601 | `TIMESTAMPTZ` | UTC 时间戳 | 实时时间 | 遥测数据采集时间点 |
| `factory` | String | `VARCHAR(16)` | 文本标识 | `F1` | 生产工厂代码 |
| `process` | String | `VARCHAR(32)` | 文本标识 | `LDI`, `DF INNER` | 制造制程段分类 |
| `eqp_id` | String | `VARCHAR(32)` | 设备编号 | `LDI-01`..`LDI-10` | 唯一设备物理标识符 |
| `mo` | String | `VARCHAR(64)` | 工单编号 | `MO-000001`+ | 制造工单编号 (Manufacturing Order) |
| `fpn` | String | `VARCHAR(64)` | 料号编号 | `PN-0001`+ | 工厂物料料号 (Factory Part Number) |
| `layer_name`| String | `VARCHAR(32)` | 层别编号 | `L1`..`L12` | 正在成像的 PCB 芯板层别 |
| `resist_dosage` | Float | `REAL` | $\text{mJ/cm}^2$ | 35.0 - 55.0 | 光刻胶感光曝光光强能量 |
| `scale_x` | Float | `REAL` | 比例系数 | 0.995 - 1.005 | 光学 X 轴缩放补偿系数 |
| `scale_y` | Float | `REAL` | 比例系数 | 0.995 - 1.005 | 光学 Y 轴缩放补偿系数 |
| `temperature` | Float | `REAL` | $^\circ\text{C}$ | 22.0 - 26.0 | 曝光室环境温度 |
| `humidity` | Float | `REAL` | $\% \text{RH}$ | 40.0 - 55.0 | 曝光室相对湿度 |
| `scan_speed` | Float | `REAL` | $\text{mm/s}$ | 80.0 - 160.0 | 光学激光头扫描移动速度 |
| `air_vacuum` | Float | `REAL` | $\text{kPa}$ | -25.0 - -10.0 | 曝光平台吸附真空负压 |
| `thickness` | Float | `REAL` | $\text{mm}$ | 0.4 - 3.2 | 基板芯板标称厚度 |
| `board_no` | Integer | `INTEGER` | 计数器 | 1 - 500 | 生产批次内的板序号 |
| `total_board`| Integer | `INTEGER` | 计数值 | 10 - 1000 | 批次计划生产板总数 |
| `total_time` | Float | `REAL` | 秒 | 100.0 - 3600.0| 累计曝光作业耗时 |
| `state` | Boolean | `BOOLEAN` | True/False | `true` (running) | 设备实时运行状态 |
| `pe_1` | Float | `REAL` | $\mu\text{m}$ | -5.0 - 5.0 | 测量位置误差通道 1 (Position Error) |
| `je_1` | Float | `REAL` | $\mu\text{m}$ | 0.0 - 4.0 | 测量光学抖动误差 (Jitter Error) |
| `log_id` | String | `VARCHAR(64)` | 唯一 ID | `LOG-10001`+ | 关联日志跟踪记录编号 |

---

## 3. 数控机械钻孔机 (CNC Drilling) 数据结构

钻孔机群运行事件、刀具磨损指标与主轴高频振动读数。

- **存储位置**: `eap_backup` 数据库 (数据表: `public.machine_event`)
- **合成数据生成器**: `scripts/mock/eap-mock-data.js`

### 运行指标与事件字典

| 指标 / 字段 | 数据类型 | 工程单位 | 典型范围 | 字段说明 |
|:------------|:---------|:---------|:---------|:---------|
| `machine_id` | String | 字母数字 | `DRL-01`..`DRL-12` | 钻孔机物理编号 |
| `spindle_id` | Integer | 站位序号 | 1 - 6 | 主轴工作站位编号 |
| `spindle_rpm` | Integer | RPM | 15,000 - 200,000 | 主轴转速 |
| `feed_rate_mm_per_min` | Float | $\text{mm/min}$ | 500 - 3,500 | Z 轴下刀进给速度 |
| `vibration_rms_mm_per_sec` | Float | $\text{mm/s}$ | 0.1 - 4.5 | 主轴高频 RMS 振动速度 |
| `hit_count` | Integer | 计数器 | 0 - 3,500 | 当前钻针累计钻孔打击次数 |
| `tool_diameter_mm` | Float | $\text{mm}$ | 0.10 - 6.35 | 微钻钻头标称直径 |
| `bearing_temp_celsius` | Float | $^\circ\text{C}$ | 28.0 - 55.0 | 主轴套筒轴承温度 |
| `motor_load_percent` | Float | $\%$ | 10.0 - 85.0 | 主轴驱动变频器负载电流百分比 |
| `event_code` | String | 字母数字 | `TOOL_CHANGE`, `ALARM` | 机器状态变迁事件代码 |

---

## 4. 垂直连续电镀线 (VCP) 遥测结构

化学药水槽传感器监测、行车传送事件与整流器电气输出参数。

- **存储位置**: `eap_backup` 数据库 (数据表: `public.vcp_upp`)

### 药水槽与物理工艺参数

| 工艺参数 | 数据类型 | 单位 | 标称规格范围 | 参数说明 |
|:---------|:---------|:-----|:-------------|:---------|
| `line_id` | String | 文本 | `VCP-01`..`VCP-03` | 垂直连续电镀线编号 |
| `line_speed_m_per_min` | Float | $\text{m/min}$ | 0.8 - 2.5 | 传送链输送线速度 |
| `plating_time_min` | Float | 分钟 | 20.0 - 60.0 | 基板浸润电镀停留时间 |
| `rectifier_current_amp` | Float | 安培 | 100 - 1,200 | 直流电镀整流器输出电流 |
| `current_density_asd` | Float | $\text{A/dm}^2$ | 1.0 - 3.5 | 阴极表面积电流密度 |
| `bath_copper_g_per_l` | Float | $\text{g/L}$ | 18.0 - 24.0 | $\text{Cu}^{2+}$ 铜离子质量浓度 |
| `bath_acid_g_per_l` | Float | $\text{g/L}$ | 180.0 - 220.0 | $\text{H}_2\text{SO}_4$ 硫酸质量浓度 |
| `bath_chloride_ppm` | Float | $\text{ppm}$ | 40 - 80 | $\text{Cl}^-$ 氯离子添加剂浓度 |
| `bath_temp_celsius` | Float | $^\circ\text{C}$ | 22.0 - 28.0 | 电解电镀槽工作温度 |
| `dosing_pump_status` | Boolean | True/False | `true` (dosing active) | 自动药水补加泵运行状态 |

---

## 5. 企业 IT 基础设施 SNMP 遥测字典

针对 Linux 计算主机与 Juniper EX 以太网交换机的 SNMP 轮询字典。

- **摄入路径**: 通过 Node-RED 批量 SNMP walker 节点 (`UDP 161`)
- **目标超表**: `public.sys_metrics`, `public.net_metrics` (1 天分区 Chunk 间隔)

### 计算主机指标 (`sys_metrics`)

| 指标名称 | SNMP OID | 类型 | 单位 | 指标说明 |
|:---------|:---------|:-----|:-----|:---------|
| `sys_cpu_utilization_percent` | `1.3.6.1.4.1.2021.11.11.0` | Gauge | $\%$ (0-100) | 实时系统综合 CPU 使用率 |
| `sys_mem_total_bytes` | `1.3.6.1.4.1.2021.4.5.0` | Gauge | 字节 | 节点物理安装内存总容量 |
| `sys_mem_available_bytes` | `1.3.6.1.4.1.2021.4.6.0` | Gauge | 字节 | 系统可用未分配内存容量 |
| `sys_disk_used_percent` | `1.3.6.1.4.1.2021.9.1.9.1` | Gauge | $\%$ (0-100) | 根文件系统卷磁盘使用率 |
| `sys_load_1m` | `1.3.6.1.4.1.2021.10.1.3.1` | Gauge | 比率 | 操作系统 1 分钟平均负载 |

### 网络交换机指标 (`net_metrics`)

| 指标名称 | SNMP MIB | 类型 | 单位 | 指标说明 |
|:---------|:---------|:-----|:-----|:---------|
| `if_in_octets` | `IF-MIB::ifHCInOctets` | Counter64 | 字节 (八位组) | 入站接口流量累计计数器 |
| `if_out_octets` | `IF-MIB::ifHCOutOctets` | Counter64 | 字节 (八位组) | 出站接口流量累计计数器 |
| `if_in_errors` | `IF-MIB::ifInErrors` | Counter32 | 数据包 | 入站校验错误数据包数 |
| `if_out_discards` | `IF-MIB::ifOutDiscards` | Counter32 | 数据包 | 出站因队列满丢弃的数据包数 |
| `if_oper_status` | `IF-MIB::ifOperStatus` | Integer | 枚举 (1=Up, 2=Down) | 物理接口链路载波状态 |

---

## 6. TimescaleDB 持续聚合 (CAGGs) 映射表

为加速数百万历史时序记录的快速查询，原始超表会被预聚合计算为持续聚合视图 (Continuous Aggregates)：

| 原始超表 | 持续聚合视图 | 时间桶间隔 | 刷新调度周期 | 保留策略 |
|:---------|:-------------|:-----------|:-------------|:---------|
| `public.ldi_data` | `public.ldi_data_1m` | 1 分钟 | 每 1 分钟 | 14 天 |
| `public.ldi_data` | `public.ldi_data_15m` | 15 分钟 | 每 15 分钟 | 90 天 |
| `public.ldi_data` | `public.ldi_data_1h` | 1 小时 | 每 1 小时 | 2 年 |
| `public.sys_metrics` | `public.sys_metrics_1h` | 1 小时 | 每 1 小时 | 2 年 |
| `public.net_metrics` | `public.net_metrics_1h` | 1 小时 | 每 1 小时 | 2 年 |

```sql
-- 针对 15 分钟持续聚合视图的典型分析 SQL 查询
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
