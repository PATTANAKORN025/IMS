<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页 (Home)</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引 (Docs Index)</b></a>
</div>
<br/>

# 仓库所有权 (Repository Ownership)

> 根据 `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` 第4节（于 2026-08-10 确认）：本仓库**保持为单一仓库（single-repo）**——已明确排除了多仓库拆分的方案，因为对于这种规模且只有一个所有者的仓库来说，这种拆分是不合理的。本文档提供了由 `.github/CODEOWNERS` 强制执行的内部目录/领域边界，以便未来的第二位所有者能拥有实际的交接边界，而不是一个宽泛的通配符。

## 两个领域 (The two domains)

|                             | 基础设施 (Infrastructure)                                                                                                                                                                             | 制造 (Manufacturing)                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **涵盖内容**                | NOC 概览、AIOps 及容量预测、工程钻取 (Engineering Drill-Down)、元监控 (Meta-Monitoring) —— 经由 SNMP 轮询的服务器/网络设备、以及共享的 TimescaleDB/PgBouncer/Grafana/Prometheus/Alertmanager 平台本身 | LDI 制造遥测与警报 —— 制造指挥中心、操作员安灯 (Operator Andon)、工程分析与 SPC、机器快照 (Machine Snapshot)、数据就绪性 (Data Readiness)、机队一览 (Fleet at a Glance) |
| **仪表板 (Dashboards)**     | `monitoring/grafana/dashboards/infrastructure/` (5 个仪表板，位于 Grafana 文件夹 "IMS Infrastructure" 中)                                                                                             | `monitoring/grafana/dashboards/manufacturing/` (9 个仪表板，位于 Grafana 文件夹 "IMS Manufacturing" 中)                                                                 |
| **Node-RED 数据流 (Flows)** | `nodered_data/flows/ingestion.json` (SNMP 适配器)                                                                                                                                                     | `nodered_data/flows/ldi_ingestion.json`、`ldi_alarm_simulator.json`、`ldi_simulator.json` (HTTP/JSON 适配器)                                                            |
| **数据库 (Database)**       | `public.devices` 中条件为 `device_type IN ('server','workstation','network')` 的数据行；`sys_metrics`、`net_metrics`、`ldi_metrics`                                                                   | `public.devices` 中条件为 `device_type='ldi'` 的数据行；`ldi_data`、`ldi_alarm_log`、`ldi_alarm_ms_code`                                                                |
| **当前所有者**              | @PATTANAKORN025                                                                                                                                                                                       | @PATTANAKORN025                                                                                                                                                         |

**由双方共享，不归属于任何一个特定领域：** `database/` (整个架构级别的更改，如 `public.devices` 本身)、`.github/` (CI/CD)、安全敏感文件（`.env.example`、`docker-compose*.yaml`、`SECURITY.md`）、`nodered_data/flows/alerting.json` (警报传递，读取两个领域的数据)、以及 Grafana 库面板（Library Panels，位于 `IMS` 文件夹 —— 跨两个领域仪表板使用的共享组件，通过 `scripts/provision-library-panels.sh` 进行配置）。这些内容保留在 `CODEOWNERS` 中的全仓库 `*` 所有者之下，且不划分为特定领域范围。

## 强制执行 (Enforcement)

`.github/CODEOWNERS` 是该边界的强制执行版本 —— 在那里添加的特定于领域的代码行（于 2026-08-10 添加）比通用的 `/nodered_data/flows/` 规则更为具体，并对它们所涵盖的文件具有优先权（CODEOWNERS 规则采用最后匹配者优先原则）。本文档解释了 _原因（why）_；而 `CODEOWNERS` 则是 GitHub 实际进行检查的 _内容（what）_。如果两者之间出现分歧，请以 `CODEOWNERS` 为准，因为这说明本文档已过时 —— 此时请更新本文档，而非反之。

## 为什么选择这个边界，而不是拆分仓库

进行物理的多仓库拆分（拆分为独立的 `infra-monitoring` 和 `manufacturing-monitoring` 仓库）曾被考虑过，但被明确排除了：这将需要在仓库边界之间分割共享的基础设施（一个 Docker Compose 堆栈、一个 TimescaleDB 实例、一个 Grafana 实例、共享的 Node-RED 警报），而在本仓库目前的规模和单人所有者的现实情况下，这无法带来任何运营效益 —— 只有切实的迁移成本（git 历史记录、CI、部署工具），却没有相应的收益。如果团队扩大并出现了真正独立的领域所有者，且具有各自独立的发布节奏，那么可以重新审视这项决定；但就目前而言并非如此。
