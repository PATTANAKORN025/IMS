<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# Manufacturing Domain Architecture

> **目的 (Purpose)：** 记录 IMS 现有的单一制造流程 (LDI) 背后的通用模式，以便_下一个_流程类型（AOI、电镀 (plating)、蚀刻 (etching) 或钻孔 (drilling)）能够以增量形式添加——即新的迁移 (migration)、新的告警主表 (alarm master) 和新的仪表板三件套 (dashboard trio)——而不是重写现有的模式 (schema) 或仪表板。
>
> **出处 (Provenance)：** 以下描述的每一个模式都是真实存在且目前正在运行的 LDI 实现，已于 2026-08-10 针对生产环境的模式和仪表板 JSON 进行了核对——并非假设的目标架构。有关本文档所落实的计划，请参阅 `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §2。
>
> **非目标 (Non-goal)：** 本文档不涉及构建 AOI、电镀、蚀刻或钻孔的支持。目前这些领域尚无需求；现在进行构建将纯属推测。本文档仅仅是为了让模式做好_添加_新流程的准备，而不会干扰现有的 LDI。

---

## 模式说明（以 LDI 作为示例）

| 层级 (Layer)                         | LDI 的实现 (LDI's implementation)                                                                                                                                                                                                                                                                                                                                       | 下一个流程类型的通用模式 (Generic pattern for the next process type)                                                                                                                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **设备标识 (Device identity)**       | `public.devices.device_type = 'ldi'` (migration 013) 标识哪些行属于制造设备。`public.devices.process_type = 'ldi'` (migration 067/068) 标识是_哪个_制造流程，它独立于 `device_type` — 目前 `process_type` 对于所有非制造设备（服务器、网络设备）均为 `NULL`，且仅可能为 `'ldi'`。                                                                                       | 新的流程类型使用等同于 `device_type='ldi'` 的值进行注册（如果设备不属于 LDI 系列，则使用新值，例如 `device_type='aoi'`），并提供其自身的 `process_type` 值（如 `'aoi'`、`'plating'` 等）。`device_type` 和 `process_type` 刻意设计为独立的列 — 未来的流程可能会复用 `network` 轮询设备路径 (SNMP)，同时拥有独特的 `process_type`。 |
| **遥测存储 (Telemetry storage)**     | `public.ldi_data` — 一个超表 (hypertable)，包含 LDI 专有列（`pe_1..pe_6`、`je_1..je_4`、`thickness`、`scan_speed` 等），以 `(eqp_id, time)` 为键，外键 (FK) 关联至 `devices.device_id`。                                                                                                                                                                                | 每个流程类型对应一个超表，以 `(device_id, time)` 为键，外键 (FK) 关联至 `devices`。列名在设计上是特定于流程的（AOI 表将包含缺陷计数/检测分数列，而不是 PE/JE）— 不应试图强制跨流程共享相同的遥测模式，因为测量的指标截然不同。                                                                                                     |
| **告警主表 (Alarm master)**          | `public.ldi_alarm_ms_code` (code, severity, description) — 权威的告警目录；`public.ldi_alarm_log` 是事件流，通过外键关联到它。`tests/lint/alarm-sync-linter.js` 强制验证模拟器可生成的每一个代码都能针对此表进行解析。                                                                                                                                                  | 每个流程对应一个告警代码主表，具有相同的 `(code, severity, description)` 结构，相同的事件日志外键模式，以及相同的 linter 注册方式（`alarm-sync-linter.js` 已经从实时数据库读取，而不是使用硬编码的仅限 LDI 的列表 — 将其扩展到第二个流程只需添加配置，无需重写）。                                                                 |
| **SPC / RCA 视图 (SPC / RCA views)** | `public.v_machine_spc_fleet`、`public.v_ldi_rca_recent_window` (物化视图，migration 064) 在聚合之前都使用 `WHERE d.device_type = 'ldi' AND d.enabled` 进行了过滤。                                                                                                                                                                                                      | 两个视图只需修改一个 `WHERE` 子句即可覆盖第二个流程：要么参数化过滤器，要么（更简单，也符合此代码库现有的“每个关注点一个视图 (one view per concern)”风格）创建特定于流程的同级视图（如 `v_aoi_spc_fleet`），共享相同的 Cpk/RCA 计算逻辑，并通过相同的 `add_job` 后台作业模式进行刷新。                                             |
| **仪表板三件套 (Dashboard trio)**    | Andon（`ims-ldi-operator-andon.json`，一目了然的车间状态看板）、工程分析 / Engineering Analytics（`ims-ldi-engineering-analytics.json`，SPC/RCA 深入分析）、制造概览 / Manufacturing Overview（`ims-ldi-manufacturing.json`，KPI + 生产指挥中心） — 加上作为 LDI 专属附加组件的 `ims-easy-overview.json` (零配置机群一览) 和 `ldi-data-readiness.json` (数据质量审计)。 | 每个新流程类型至少获得 Andon + 工程分析 + 制造概览三件套，并在 `monitoring/grafana/dashboards/manufacturing/` 目录下进行配置（平台计划的 §1），带有 `tags: [..., "manufacturing"]` 标签，以便通过 `dashboard-linter.js` 的领域检查 (Check 18)。“easy overview”和“data readiness”仪表板是可选的附加组件，不属于必需的三件套。       |

---

## 新流程类型的引导检查清单 (Onboarding checklist for a new process type)

1. **迁移 (Migration)：** 在 `public.devices` 中使用适当的 `device_type` 和新的 `process_type` 值注册设备。如果流程需要自己的遥测列，在同一个迁移中创建超表（使用下一个顺序号 — 永远不要编辑已合并的迁移，请参阅 `IMS_MANUFACTURING_PLATFORM_V2.md` §7 版本控制策略）。
2. **告警主表 (Alarm master)：** 初始化一个 `<process>_alarm_ms_code` 表（code, severity, description）以及一个通过外键关联它的 `<process>_alarm_log` 事件表。
3. **SPC/RCA 视图 (SPC/RCA views)：** 遵循 `v_machine_spc_fleet` / `v_ldi_rca_recent_window` 模式添加特定流程的视图（物化视图，如果聚合不简单则通过 `add_job` 刷新 — 请参阅 migration 064 中关于何时值得使用物化视图而不是普通视图的理由）。
4. **仪表板三件套 (Dashboard trio)：** 构建 Andon / 工程分析 / 制造概览仪表板，放置在 `monitoring/grafana/dashboards/manufacturing/` 目录下，并打上 `manufacturing` 标签（以及流程名称，例如 `aoi`）。
5. **Linter 注册 (Linter registration)：** 扩展 `tests/lint/alarm-sync-linter.js` 和 `tests/lint/rca-mapping-coverage.js` 以包含新的告警主表 / 类别映射（根据本次会话之前的修复，两者都已经读取实时数据库/流程状态，而不是硬编码的仅限 LDI 列表 — 扩展它们是一种增量操作）。
6. **清单重新生成 (Inventory regeneration)：** 运行 `node scripts/generate-dashboard-inventory.js` 和 `node scripts/generate-schema-inventory.js`，以便生成的文档自动获取新的仪表板/表 — 永远不要手动编辑这两个文件。

以上任何步骤都不需要修改 LDI 现有的表、视图、仪表板或 linters —— 这正是该模式的核心意义所在。
