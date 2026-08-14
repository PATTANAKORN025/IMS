# IMS 警报与报警响应手册

> **目标：** 将一线响应步骤与本系统实际生成的警报和报警代码映射。下述所有代码和规则名称均于 2026-08-10 直接对照实时数据库和配置的警报规则文件进行了核对——这取代了早期使用虚构代码（`SYS-001`、`NET-002`、`LDI-001`）（这些代码在系统中从未存在过）的版本。
>
> IMS 拥有 **三个独立的警报层**，且它们使用不同的词汇——切勿混淆：
> 1. **LDI 机器报警代码** —— 来自物理/模拟设备本身的数字代码，存储于 `public.ldi_alarm_log`，分类于 `public.ldi_alarm_ms_code`。完整分类见 `ALARM_SEVERITY_GUIDE.md`。
> 2. **Grafana 原生警报规则** —— Grafana 针对数据库评估的阈值/异常规则，分为 LDI 专用（`monitoring/grafana/provisioning/alerting/ldi-rules.yml`）和基础设施（`rules.yml`）。
> 3. **Prometheus/Alertmanager 规则** —— 平台本身的元监控（`monitoring/prometheus/rules/ims-alerts.yml`）——用于监控 IMS 管道是否健康，而非“机器是否超标”。

这三层通过相同的传输路径路由：Grafana 原生警报直接触发；Prometheus 警报经过 Alertmanager → Node-RED 的 `/alert-webhook`（`nodered_data/flows/alerting.json`），后者格式化为 LINE Messaging API 和 MS Teams 的有效载荷。**向 LINE/Teams 的实际发送需要 `LINE_CHANNEL_ACCESS_TOKEN` 和 `TEAMS_WEBHOOK_URL`，出于设计考虑，这些并未在 `.env` 中提供**——格式化和发送尝试逻辑已证明是正确的，并在失败时大声报错（`node.error()` + Node-RED 中持续的红色状态），但在操作员根据 `docs/admin/ADMIN_MANUAL.md` 配置真实凭据之前，任何信息都不会送达相关人员。

---

## 1. LDI 机器报警代码

以下 19 个代码是当前 `ldi_alarm_simulator.json` 实际生成的代码（已针对 `ldi_alarm_log` 实时确认）；`ldi_alarm_ms_code` 中的完整目录包含更多代码（从真实的历史导出数据导入），但大多数在模拟器中未激活。这些代码如何与工艺参数相关联，见 `LDI_RCA_GUIDE.md`。

| 代码 | 严重性 | 消息 | 首次响应 |
|---|---|---|---|
| `01060009` | 严重 | 错误的相机序列号 | 相机/视觉子系统故障——检查物理相机连接和机器控制器上的序列号配置。 |
| `0106000C` | 严重 | 无法停止相机 | 视觉子系统故障——如果重试无法清除，对相机模块重新上电。 |
| `01060013` | 严重 | 发现相同 IP | 机器本地网络上的网络地址冲突——检查是否有重复设备。 |
| `010E0064` | 严重 | 电机类型未定义 | 运动控制器配置故障——验证电机类型是否在机器配方/配置中设置。 |
| `01100001` | 严重 | 无法连接到 PLC | PLC 通信中断——首要检查 PLC 的电源和网络链路。 |
| `01130002` | 严重 | 通信异常 | 机器控制器上的通用通信故障——检查电缆和控制器日志。 |
| `10006` | 严重 | 无法将成像设备设置为保护模式 | 在安全模式转换期间发生成像设备故障——在清除之前不要恢复曝光。 |
| `0106001C` | 轻微 | 停止触发等待信号超时 | 停止触发器上的时序/信号问题——通常是瞬态的，监控是否重复发生。 |
| `70004` | 警告 | 位置同步输出超速 | 扫描速度偏差——见 `LDI_RCA_GUIDE.md` 的 MOTION 类别；与 `ldi_data` 中的 `scan_speed` 相关。 |
| `80001` | 警告 | 等待子图纸准备数据超时 | 上游数据准备延迟，并非机器故障本身——检查该作业的 MES/数据流。 |
| `90001` | 警告 | 内层与抓取点对齐失败 | 对齐/配准问题——见 `LDI_RCA_GUIDE.md` 的 ALIGNMENT/PE-JE 类别。 |
| `90004` | 警告 | 外层与抓取点对齐失败 | 与 `90001` 类别相同，针对外层。 |
| `90005` | 警告 | 配准误差（PE/JE）超差 | 直接违反 PE/JE 公差——在 `LDI Engineering Analytics` 中检查特定机器的 SPC 面板。 |
| `90012` | 警告 | 对齐失败，操作员取消曝光 | 操作员取消——与操作员确认这是有意的，而非重复的无声故障。 |
| `91008` | 警告 | 环境温度或湿度异常 | 环境偏差——见 `LDI_RCA_GUIDE.md` 的 THERMAL/HUMIDITY 类别；与 `ldi_data` 中的 `temperature`/`humidity` 相关。 |
| `91009` | 警告 | 真空压力超出控制范围 | 见 `LDI_RCA_GUIDE.md` 的 VACUUM 类别；与 `air_vacuum` 相关。 |
| `92013` | 警告 | 网络连接超时 | 机器到工厂的网络问题——检查与 SNMP/HTTP 遥测相同网络路径。 |
| `93004` | 警告 | 校准周期异常 | 定期校准未完成——检查机器校准日志。 |
| `97005` | 警告 | 数据库连接异常 | 机器自身的本地缓冲/数据库，非 IMS 的 TimescaleDB——检查机器控制器的本地存储。 |

**在哪里查看实时数据：** `IMS LDI - Operator Andon Board` 的 Action Queue 面板（只读，5秒刷新）显示尚未解决的关键/严重报警；相应的 SQL 是 `SELECT * FROM public.ldi_alarm_log ORDER BY logdate DESC LIMIT 50;`。**要确认或解决报警**，请使用 `IMS LDI - Alarm Console`——安灯板被有意设计为非交互式的电视墙终端；Alarm Console 是单独的仪表板，这些操作实际上会写入 `public.ldi_alarm_lifecycle`。

---

## 2. Grafana 原生警报规则 — LDI (`ldi-rules.yml`)

| 规则 | 含义 | 调查内容 |
|---|---|---|
| **LDI Quality Drift — Max PE exceeds tolerance** | 机器最差的 PE（位置误差）样本突破了 `pe_setting` 公差。 | `LDI Engineering Analytics` → 受影响机器的 SPC 面板。 |
| **LDI Process Capability — Cpk below 1.33** | 基于 PE 的 Cpk 降至 1.33 行业标准能力下限以下。 | 同一个仪表板；检查是单次偏差还是持续漂移——见 `LDI_SPC_GUIDE.md`。 |
| **LDI Quality Drift — Max JE exceeds tolerance** | 与 PE 漂移相同，针对 JE（判断误差）。 | 同一个仪表板，JE 面板。 |
| **LDI JE Process Capability — Cpk below 1.33** | 基于 JE 的 Cpk 低于 1.33。 | 同一个仪表板。 |
| **LDI Machine Alarm — new alarm in database** | `ldi_alarm_log` 中增加了一行。这是作为兜底的“发生了某事”规则——检查上文第 1 节寻找特定代码。 | 操作员安灯板。 |
| **LDI Temperature High — above 24°C spec limit** | 固定阈值规则，并非 Z-Score 异常——见 `LDI_RCA_GUIDE.md` 中的说明，LDI 侧没有统计异常面板，只有这个固定阈值。 | `LDI Engineering Analytics` 温度面板。 |

## 3. Grafana 原生警报规则 — 基础设施 (`rules.yml`)

| 规则 | 范围 |
|---|---|
| High CPU / RAM / Disk Usage | 服务器/工作站资源阈值。 |
| High Temperature | 服务器机箱温度。 |
| High Network Error Rate / Network Packet Drops / Interface Down | 网络接口健康状况。 |
| Bandwidth Saturation Forecast | 预测性——容量呈饱和趋势，尚未突破。 |
| CPU Z-Score Anomaly (>3σ) / Temperature Z-Score Anomaly (>3σ) | 统计异常检测——仅限基础设施。**LDI 侧没有等效的 Z-Score 面板**（见上文的 `LDI Temperature High`，它采用固定阈值替代）。 |
| LDI Vibration Critical | **已暂停。** 已确认每台 LDI 设备的 `ldi_metrics.vibration` 始终为 `0`（传统 `ldi_metrics` 管道中的已知缺口，而非 `ldi_data`——见 `ARCHITECTURE.md` 的已知缺口）。该规则在修复之前无法有效触发；它被暂停，而不是静默失效。 |

从 `NOC Overview` 或 `Engineering Drill-Down` 开始调查基础设施警报。

## 4. Prometheus / Alertmanager 规则 (`ims-alerts.yml`)

这些规则监控 **IMS 自身管道的健康状况**，而非机器或服务器状态——即“监控系统本身是否工作”。

| 规则 | 含义 | 首次响应 |
|---|---|---|
| `PrometheusDown` / `AlertmanagerDown` / `TargetDown` / `HighScrapeErrors` | 监控堆栈自身的组件不健康。 | 执行 `docker ps` 检查受影响的容器；见 `INCIDENT_RESPONSE.md`。 |
| `ServiceDown` / `ServiceHighLatency` / `SLABreachWarning` | 针对监控端点（例如 Grafana 的 `/api/health`）的 blackbox-exporter 探针失败。 | 直接检查目标服务；注意，这可能是故意重建容器的瞬时假象——见 `DR_TEST_PLAN.md` 演练 2 寻找真实示例。 |
| `SSLCertExpiring` | 监控端点的 TLS 证书即将过期。 | 在过期前续期。 |
| `Watchdog` | 持续触发的心跳，确认 Alertmanager 的路由工作正常——**并非** 真实事故。在扫描实际触发的警报时排除它。 |
| `PipelineDataStalled` / `PipelineDataDegraded` / `PipelineHighErrorRate` | Node-RED 摄取管道健康状况——遥测数据流停滞/降级/错误率高。 | `Meta-Monitoring` 仪表板；检查 `ims-node-red` 日志寻找特定的故障特征（见 `INCIDENT_RESPONSE.md` 的工作示例）。 |
| `CircuitBreakerOpen` | 设备的 SNMP 断路器跳闸（多次失败后由 CLOSED 变为 OPEN）。 | 检查特定设备的连通性；断路器在冷却后自动复位为 HALF_OPEN。 |

---

*版本 2.0，修正于 2026-08-10 ——见 `docs/architecture/IMS_MANUFACT简述_PLATFORM_V2.md` 了解此修复所属的更广泛文档计划。*
