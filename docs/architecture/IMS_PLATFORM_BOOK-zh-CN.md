# IMS 平台指南

> **所有 IMS 文档的起点。** 这是一个导航枢纽，而不是它所链接的文档的副本 —— 每个主题仅存放在一个位置，而本指南指向它。如果这里的内容与它所链接的文档不一致，则以链接的文档为准；本指南是地图，而不是领土本身。
>
> **出处：** 编译于 2026-08-10，在全面文档审计和重写（`docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` 的发布，以及本指南所属的更广泛的企业文档计划）之后。直接在本书中引用的每一个事实（不仅是链接）均已在当日对照生产系统进行了验证。

---

## 执行摘要

IMS 是一个跨越两个领域的监控平台 —— **基础设施**（服务器，网络设备）和 **LDI 制造**（PCB 激光直接成像生产线）—— 共享一个 TimescaleDB、一个 Grafana 实例（15 个仪表板，划分到 `Infrastructure`/`Manufacturing` 文件夹中），并通过 Grafana 原生规则和 Prometheus/Alertmanager 进行告警。制造方面包括真实的 SPC（Cpk 过程能力）和 RCA（告警与参数相关性）分析，而不仅仅是遥测展示。这两个领域在逻辑上是分离的（文件夹、标签、`CODEOWNERS`），但共享基础设施 —— 请参阅 `docs/architecture/OWNERSHIP.md` 以了解在当前系统规模下为什么物理拆分是不合理的原因。

---

## 按角色从这里开始

### 工厂管理 / 过程工程

1. [`docs/product/PRODUCT.md`](../product/PRODUCT.md) — 系统功能以及目标用户。
2. [`docs/architecture/LDI_SPC_GUIDE.md`](LDI_SPC_GUIDE.md) — 过程能力方法论。
3. [`docs/architecture/LDI_RCA_GUIDE.md`](LDI_RCA_GUIDE.md) — 根本原因关联方法论。
4. [`docs/architecture/ALARM_SEVERITY_GUIDE.md`](ALARM_SEVERITY_GUIDE.md) — 告警分类学。
5. [`docs/operations/SOP_OPERATOR.md`](../operations/SOP_OPERATOR.md) — 车间操作员标准操作程序（SOP）。

### SRE / 运维

1. [`docs/architecture/ARCHITECTURE.md`](ARCHITECTURE.md) — 系统拓扑、容器清单、**系统约束与技术边界 (System Constraints & Technical Boundaries)**。
2. [`docs/architecture/DATA_FLOW.md`](DATA_FLOW.md) — 端到端流水线（管道）图。
3. [`docs/operations/INCIDENT_RESPONSE.md`](../operations/INCIDENT_RESPONSE.md) — 包含真实根本原因的事故处理案例。
4. [`docs/operations/ALARM_PLAYBOOK.md`](../operations/ALARM_PLAYBOOK.md) — 每个告警的首响处理步骤。
5. [`docs/operations/BACKUP_RESTORE.md`](../operations/BACKUP_RESTORE.md) / [`docs/operations/DR_TEST_PLAN.md`](../operations/DR_TEST_PLAN.md) — 真实的、基于证据的灾难恢复（DR）程序。
6. [`docs/operations/TROUBLESHOOTING.md`](../operations/TROUBLESHOOTING.md) — 通用 SRE 调试命令。
7. [`docs/admin/ADMIN_MANUAL.md`](../admin/ADMIN_MANUAL.md) — 容器运维、设备注册、迁移。

### QA / 审计 / 合规

1. [`docs/architecture/DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) — 自动生成、CI 检查的表/列/视图参考。
2. [`docs/architecture/DASHBOARD_INVENTORY.md`](DASHBOARD_INVENTORY.md) — 自动生成、CI 检查的仪表板/面板参考。
3. [`docs/architecture/DATA_RETENTION.md`](DATA_RETENTION.md) — 实时数据保留策略，包括记录在案的治理差距。
4. [`docs/architecture/SECURITY_MODEL.md`](SECURITY_MODEL.md) + [`SECURITY.md`](../../SECURITY.md) — 信任边界和安全策略。
5. [`docs/operations/LDI_VALIDATION_PROTOCOL.md`](../operations/LDI_VALIDATION_PROTOCOL.md) — 具有实时验证证据的生产验收程序。
6. [`docs/operations/DEPLOYMENT_READINESS.md`](../operations/DEPLOYMENT_READINESS.md), [`RELEASE_CHECKLIST.md`](../operations/RELEASE_CHECKLIST.md) — 发布前检查门禁。

### 新晋开发者

1. [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — 工作流、约定、项目结构。
2. [`docs/architecture/ARCHITECTURE.md`](ARCHITECTURE.md) — 在修改任何东西之前阅读此内容。
3. [`docs/architecture/DATA_FLOW.md`](DATA_FLOW.md) — 数据实际如何流动。
4. [`docs/architecture/OWNERSHIP.md`](OWNERSHIP.md) — 谁拥有什么。
5. [`docs/architecture/GRAFANA_DESIGN_SYSTEM.md`](GRAFANA_DESIGN_SYSTEM.md) — 仪表板约定，由 CI 强制执行。

---

## 完整文档地图

### 架构与领域设计

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — 系统拓扑、容器清单、系统约束与技术边界 (System Constraints & Technical Boundaries)。
- [`ARCHITECTURE_DIAGRAM.md`](ARCHITECTURE_DIAGRAM.md) — Mermaid C4 图。
- [`DATA_FLOW.md`](DATA_FLOW.md) — 端到端数据流图。
- [`IMS_MANUFACTURING_PLATFORM_V2.md`](IMS_MANUFACTURING_PLATFORM_V2.md) — 基础设施/制造领域分离的发布计划及其真实证据日志（阶段 A/B/C、浸泡测试、DR 测试）。
- [`MANUFACTURING_DOMAIN.md`](MANUFACTURING_DOMAIN.md) — LDI 模式/仪表板模式以及未来过程类型（AOI、电镀、蚀刻、钻孔）的接入方式。
- [`EAP_ARCHITECTURE.md`](EAP_ARCHITECTURE.md) — 设备集成适配器（SNMP、HTTP/JSON 以及未实现的 SECS/GEM 契约）。
- [`OWNERSHIP.md`](OWNERSHIP.md) — 基础设施/制造领域边界，通过 `CODEOWNERS` 强制执行。
- [`SECURITY_MODEL.md`](SECURITY_MODEL.md) — 信任边界。

### 制造 (LDI) 领域指南

- [`LDI_SPC_GUIDE.md`](LDI_SPC_GUIDE.md) — 过程能力 (Cpk) 方法论。
- [`LDI_RCA_GUIDE.md`](LDI_RCA_GUIDE.md) — 根本原因关联 (提升度 Lift/置信度 Confidence) 方法论。
- [`ALARM_SEVERITY_GUIDE.md`](ALARM_SEVERITY_GUIDE.md) — 4 层严重性分类学与 ISA-18.2 范围。
- [`DATA_RETENTION.md`](DATA_RETENTION.md) — 实时保留/压缩策略。
- [`FUTURE_ANALYTICS.md`](FUTURE_ANALYTICS.md) — 仅在路线图中存在的概念（预测漂移、AI/异常评分、多因素 RCA），明确声明 **尚未实现** —— 在拥有其专属的黄金数据集测试之前，这里没有任何内容是真实的，这是与每个已交付的 SPC/RCA 计算相同的标准。

### 设计系统

- [`GRAFANA_DESIGN_SYSTEM.md`](GRAFANA_DESIGN_SYSTEM.md) — 颜色令牌 (color tokens)、排版、面板约定，由 `dashboard-linter.js` 强制执行。
- [`PANEL_TOKENS.md`](PANEL_TOKENS.md) — 单位/阈值令牌规范。

### 自动生成（CI 检查，严禁手动编辑）

- [`DASHBOARD_INVENTORY.md`](DASHBOARD_INVENTORY.md) — `node scripts/generate-dashboard-inventory.js`
- [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) — `node scripts/generate-schema-inventory.js`

### 运维操作

- [`../operations/SOP_OPERATOR.md`](../operations/SOP_OPERATOR.md) — 车间操作员 SOP。
- [`../operations/ALARM_PLAYBOOK.md`](../operations/ALARM_PLAYBOOK.md) — 告警首响处理。
- [`../operations/INCIDENT_RESPONSE.md`](../operations/INCIDENT_RESPONSE.md) — 事故严重性框架 + 处理案例。
- [`../operations/BACKUP_RESTORE.md`](../operations/BACKUP_RESTORE.md) — 包含实际耗时的备份/恢复程序。
- [`../operations/DR_TEST_PLAN.md`](../operations/DR_TEST_PLAN.md) — 灾难恢复演练。
- [`../operations/TROUBLESHOOTING.md`](../operations/TROUBLESHOOTING.md) — 通用 SRE 调试。
- [`../operations/SCALING_PLAN.md`](../operations/SCALING_PLAN.md) — 从 1 台扩展到 1000+ 台机器的扩展计划。
- [`../operations/LDI_VALIDATION_PROTOCOL.md`](../operations/LDI_VALIDATION_PROTOCOL.md) — 生产验收程序。
- [`../operations/DEPLOYMENT_READINESS.md`](../operations/DEPLOYMENT_READINESS.md), [`RELEASE_CHECKLIST.md`](../operations/RELEASE_CHECKLIST.md) — 发布门禁。
- [`../REAL-DATA-IMPORT.md`](../REAL-DATA-IMPORT.md) — 真实数据与模拟数据模式对比。

### 手册

- [`../user/USER_MANUAL.md`](../user/USER_MANUAL.md) — 仪表板指南、指标参考。
- [`../admin/ADMIN_MANUAL.md`](../admin/ADMIN_MANUAL.md) — 容器运维、设备注册、迁移、备份/恢复。

### 治理与流程

- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) — 开发工作流。
- [`../../SECURITY.md`](../../SECURITY.md) — 安全策略。
- [`../../.github/CODEOWNERS`](../../.github/CODEOWNERS) — 强制的所有权边界。

### 产品与业务背景

- [`../product/PRODUCT.md`](../product/PRODUCT.md) — 产品一页说明。
- [`../product/ONBOARDING_SCRIPT.md`](../product/ONBOARDING_SCRIPT.md) — 视频/GIF 录制分镜脚本。
- [`../business/BUSINESS_VALUE_ROI.md`](../business/BUSINESS_VALUE_ROI.md) — 执行级 ROI（投资回报率）叙述。

### 历史记录

- [`../archive/`](../archive/) — 带日期的特定时间点快照（审计报告、基准测试报告、实习回顾）。不是动态文档 —— 见 `docs/archive/README.md`。
- [`../DOCUMENTATION_QUALITY_REPORT.md`](../DOCUMENTATION_QUALITY_REPORT.md) — 与本指南本身一起生成的审计/重写报告。

---

## 术语表

有关完整上下文，请参阅 `docs/architecture/ARCHITECTURE.md` 的领域部分；简明词汇表如下：

| 术语              | 含义                                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IMS**           | 整体平台 —— 包含基础设施与 LDI 制造领域。                                                                                                                                                                        |
| **LDI**           | 激光直接成像 (Laser Direct Imaging) —— 本系统制造领域监控的 PCB 曝光过程。                                                                                                                                                         |
| **EAP**           | 设备自动化程序 (Equipment Automation Program) —— 类似 SECS/GEM 风格的设备集成（参见 `EAP_ARCHITECTURE.md`）；并非“企业应用平台 (Enterprise Application Platform)”。                                                                                                              |
| **SPC**           | 统计过程控制 (Statistical Process Control) —— 基于 Cpk 的过程能力跟踪（参见 `LDI_SPC_GUIDE.md`）。                                                                                                                                                        |
| **RCA**           | 根本原因分析 (Root Cause Analysis) —— 通过提升度 (Lift) 指标建立的告警与过程参数之间的相关性（参见 `LDI_RCA_GUIDE.md`），而非设备故障诊断。                                                                                                            |
| **Andon**         | 操作员安灯看板 (Operator Andon Board) —— 一个一目了然、仅显示状态的车间显示器，基于 ISA-101 (HMI 设计) 标准，注意不要与 ISA-18.2（告警管理）混淆。故意设计为非交互式（电视墙 kiosk）；请参阅告警控制台以了解操作员的写入路径。 |
| **Alarm Console** | 告警控制台 (`IMS LDI - Alarm Console`) —— 实际执行确认 (Acknowledge) / 解决 (Resolve) 操作的仪表板，通过 `services/alarm-api` 写入 `public.ldi_alarm_lifecycle` 表。它是只读的安灯看板的配套设施，而不是替代品。                     |
| **CAGG**          | TimescaleDB 连续聚合 (Continuous Aggregate) —— 一种增量更新的预计算汇总（参见 `DATA_FLOW.md` 中的汇总链）。                                                                                                                             |
| **Cpk**           | 过程能力指数 (Process capability index) —— 此处使用的精确公式请参见 `LDI_SPC_GUIDE.md`。                                                                                                                                                                   |
| **Lift**          | 提升度 —— RCA 相关强度指标，请参见 `LDI_RCA_GUIDE.md`。                                                                                                                                                                                        |

## 系统约束与技术边界 (System Constraints & Technical Boundaries)

`docs/architecture/ARCHITECTURE.md` 的“系统约束与技术边界”部分是本系统中技术规范与演进方向的唯一权威列表：

- SPC 黄金数据集回归套件的物化视图隔离集成测试验证。
- 部署与迁移脚本中的数据保留策略调优与应用配置。
- 在 DR (灾难恢复) 测试期间验证的特定环境下容器重启策略的行为特征。
- `ldi_metrics` 旧版流水线中保留供未来系统集成的参数。
- 系统定义的“类 ISA-18.2”风格告警分类学体系边界。

所有这些架构规范都基于经过验证的工程数据支撑，作为当前和未来平台架构升级的核心准则。
