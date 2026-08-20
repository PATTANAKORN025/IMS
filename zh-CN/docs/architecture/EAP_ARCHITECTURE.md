<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# 设备集成层架构 (EAP)

> **EAP = Equipment Automation Program (设备自动化程序)** — 基于 2026-08-10 确认的范围，属于 SECS/GEM 风格的设备集成（并非“企业应用平台” Enterprise Application Platform）。有关本文档实现的计划，请参见 `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` 第 3 节 (§3)。
>
> **现实检查，在此提前声明：** IMS 仅用于监控。它读取遥测数据并触发警报；它从不写入命令、下载配方或保存设备状态。目前该系统中没有任何物理的、支持 SECS/GEM 的工具 — LDI 机器是通过 SNMP 轮询/模拟的，而不是通过 SECS/GEM 连接的。本文档**不**声称符合 SECS/GEM 标准，未实现 HSMS 会话处理，也未模拟 SECS/GEM 设备。本文档主要记录了两个现有的真实适配器，并为目前不存在的第三个适配器定义了契约。
>
> **来源：** 下文中关于 SNMP 和 HTTP/JSON 适配器的描述是在 2026-08-10 直接对照 `nodered_data/flows/ingestion.json` 和 `nodered_data/flows/ldi_ingestion.json` 进行检查的，而非凭记忆编写。

---

## 模式：三个适配器，一个设备注册表

所有适配器的任务都是相同的，无论协议是什么：将物理或模拟设备的遥测数据和警报事件导入到 `public.devices` / 设备的遥测表中，并使用 `device_id` 作为贯穿整个系统（仪表板、SPC/RCA 视图、警报主机）的连接键 (join key)。适配器是由它获取数据的方式来定义的，而不是由它的数据输出目标来定义。

### 适配器 1 — SNMP (传统/基础设施设备)

- **位置：** `nodered_data/flows/ingestion.json` ("IMS Ingestion Pipeline" 选项卡)。
- **设备模型：** `public.devices` 表中 `device_type IN ('server','workstation','network')` 的行，保存 `hostname`, `ip_address`, `snmp_community`, `snmp_port`, `poll_interval`。
- **数据采集计划：** 每 30 秒，`fork_5_ways` 会为每个注册设备调度并行的 SNMP v2c walker (包括 CPU、Storage、Network、Temperature、LDI OIDs)。
- **事件/警报收集：** 在协议层面没有 — 该适配器仅用于遥测；警报是在下游基于摄入指标的阈值生成的，而不是作为原生 SNMP 陷阱 (traps) 携带。
- **数据采集计划 → 遥测映射：** `sre_parser` 维护每台设备的状态，并批量插入到 `sys_metrics` / `net_metrics` / `ldi_metrics` 中，以 `device_id` 为键。

### 适配器 2 — HTTP/JSON (LDI 制造遥测)

- **位置：** `nodered_data/flows/ldi_ingestion.json` ("IMS LDI Ingestion" 选项卡)。
- **设备模型：** `public.devices` 表中 `device_type='ldi'`, `process_type='ldi'` 的行 (数据迁移 067/068)。
- **数据采集计划：** 设备（或其模拟器）向 `POST /ldi-telemetry` 发送 JSON 数组批处理 POST 请求，通过与 `INGEST_API_KEY` 核对的 `x-api-key` 头进行身份验证。每个批次项目带有 `eqp_id` (映射到 `device_id`) 以及完整的 LDI 参数集 (PE1-6, JE1-4, thickness, scan_speed, resist_dosage, ...)。
- **事件/警报收集：** 并行的模拟器/生产者路径 (`ldi_alarm_simulator.json`) 写入 `public.ldi_alarm_log`，通过 `device_id` + `event_id` 与遥测数据关联（并非在同一个 POST 请求内携带 — 而是通过同一设备身份的独立事件流）。
- **数据采集计划 → 遥测映射：** 使用 `INSERT INTO public.ldi_data` 进行直接批量插入，配合 `ON CONFLICT (log_id, "time") DO NOTHING` 确保幂等性。

### 适配器 3 — SECS/GEM (未实现的契约，适用于未来的真实工具)

该适配器目前不存在任何代码。如果未来的某种工艺类型的设备确实支持 SECS/GEM，则它需要满足此契约才能接入相同的注册表和下游视图/仪表板，而无需更改其他任何内容：

| EAP 概念                    | 适配器 3 需要提供的内容                                                                                                                                                                                             | 映射至 (现有模式)    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **设备模型注册**            | 将工具注册为 `public.devices` 表中的一行，并带有 `device_id`、适当的 `device_type` 和 `process_type` (根据 `MANUFACTURING_DOMAIN.md`) — 这与适配器 1 和 2 使用相同的身份契约。                                      | `public.devices`     |
| **事件报告 → 警报映射**     | 将 SECS/GEM 事件报告（收集事件 ID，CEIDs）转换为该工艺的警报主机 + 警报日志表中的行，并以 `device_id` 为键 — 数据形态与 `ldi_alarm_ms_code`/`ldi_alarm_log` 相同。                                                  | 适配器 2 的警报路径  |
| **数据采集计划 → 遥测映射** | 将 SECS/GEM SVID/ECID 变量报告转换为该工艺遥测超表 (hypertable) 中的行，并以 `(device_id, time)` 为键 — 数据形态与 `ldi_data` 相同。                                                                                | 适配器 2 的遥测路径  |
| **版本控制 (Versioning)**   | 作为明确版本化的契约发布（例如 `adapter-contract-v1`），详见 `IMS_MANUFACTURING_PLATFORM_V2.md` 第 7 节 (§7) — 它是此代码库中唯一一个如果发生破坏性更改 (breaking change)，目前的 linter 或测试将无法捕获的集成点。 | 新需求，目前无类似物 |

在有真正支持 SECS/GEM 协议的工具需要连接之前，构建适配器 3 不在范围内 — 今天没有任何东西可以用于集成或测试，而模拟的 SECS/GEM 堆栈将只是推测性的基础设施，背后没有任何需求支撑。

---

## 安全边界说明

连接真实的适配器 3 工具将会跨入车间设备网络 (plant-floor equipment network) — 这是一个系统中目前不存在的新的外部信任边界。请参见 `IMS_MANUFACTURING_PLATFORM_V2.md` 第 8 节 (§8) (边界 3) — 在任何真实设备连接进来之前，该连接需要进行独立的安全加固审查 (hardening review)。本文档仅定义了数据契约，不包含针对该未来连接的网络/凭证加固内容。
