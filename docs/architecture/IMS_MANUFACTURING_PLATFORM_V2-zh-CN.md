<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# IMS 制造平台 V2 — 架构与推出计划 (IMS Manufacturing Platform V2 — Architecture & Rollout Plan)

> **状态：** 设计文档，待批准。此文档描述的任何内容尚未实际实施。
>
> **出处：** 以下每一个关于“当前状态”的断言都在 2026-08-10 直接对照真实的代码库进行了核实（通过 `git status`、dashboard JSON、`database/migrations/`、`.github/CODEOWNERS` 以及 `docs/architecture/ARCHITECTURE.md`），而非主观假设。本文档并非旨在取代 `ARCHITECTURE.md`（系统拓扑/数据流依然准确无误），而是对其进行补充：涵盖了域边界（domain boundaries）、面向未来的制造数据模型（manufacturing schema）、设备集成架构以及所有权归属——这些都是目前 `ARCHITECTURE.md` 尚未涉及的内容。
>
> **确认范围（由用户在 2026-08-10 批准）：**
>
> - EAP = **设备自动化程序 (Equipment Automation Program)**（SECS/GEM 风格的设备集成），而非“企业应用平台”。
> - 基础设施与生产制造的分离**仅限于逻辑层面与组织层面** — 采用单一的代码仓库、单一的 Grafana 实例和单一的数据库。不存在物理隔离。
> - **单一仓库**架构保持不变。所有权的界定将通过更新 `CODEOWNERS` 或专属的所有权文档来完成，而非拆分仓库。
> - 在进行任何实施工作之前，必须先批准这唯一的一份涵盖全部六项任务的设计文档。
> - 一旦获批，实施顺序为：**阶段 A → 阶段 B → 阶段 C → 浸泡测试 (Soak Test) → 灾备测试 (DR Test)**，每一阶段结束都必须附上验证证据（证据标准同 `docs/operations/LDI_VALIDATION_PROTOCOL.md` 一致 — 采用真实命令输出，拒绝空口无凭）。

---

## 0. 基线状况 (于 2026-08-10 核实)

- 10 个 Grafana 仪表板全部配置在 `IMS` 这一单一的扁平文件夹中（`monitoring/grafana/provisioning/dashboards/*.yml`，`foldersFromFilesStructure: false`），不存在子文件夹结构。**更正（在阶段 A 实施过程中发现）：** 仪表板实际上已经包含非空的 `tags` 数组（例如 `["ims","noc"]`，`["IMS","LDI","set-2",...]`）— 因此之前断言的“没有仪表板设置标签”是不正确的；真正缺失的其实是一个**域标签** (`infrastructure` 或 `manufacturing`)，而不是根本没有标签。
- 数据库 `public.devices.device_type` 字段的值包含 `server | workstation | ldi | network` (migration 013) — 其中 `ldi` 是唯一与制造/生产相关的分类。当前系统没有类似 `process_type` (工序类型) 的维度划分。
- 在数据架构层，两条独立的遥测数据处理流水线已经成型（参见 `ARCHITECTURE.md` §System Context）：其中，LDI 流水线 (`ldi_data`，`ldi_alarm_log`) 负责制造数据；而 SNMP 流水线 (`sys_metrics`，`net_metrics`，`ldi_metrics`) 则处理基础设施指标。**事实上，系统在表结构和数据摄入层面上已经实现了隔离 —— 仅仅在展现层（如 Grafana 文件夹/标签划分）和文档记录上有所缺失。**
- 尽管 `.github/CODEOWNERS` 已存在，但内容依然扁平化：整个仓库归属于单一责任人 (`@PATTANAKORN025`)，加上少数针对特定路径（如 `/database/`，`/nodered_data/flows/`，`/.github/`）的规则，未能区分出基础架构和制造领域的所有权。
- 目前 `git status` 工作区完全整洁 — 没有遗留的系统垃圾需要在此次计划中清理。
- 整个代码库中不存在任何灾难恢复 (DR) 测试记录或运行手册。虽有 `scripts/soak-test-report.sh`（早前已写好），但尚未使用它执行过真实的长时间压力运行测试。

---

## 1. 基础设施与生产制造领域的划分 (逻辑层面)

**目标：**

- 通过 Grafana 的嵌套文件夹配置，添加类似 `"folder": "Infrastructure"` / `"folder": "Manufacturing/LDI"` 的配置（Grafana 13.x 支持在 provisioned 配置文件层或通过 `meta` API 进行按域存放，实施期间将确认最合适的无手工干预方案）。
- 为全部 10 个仪表板 JSON 文件分别打上 `"tags": ["infrastructure"]` 或 `["manufacturing", "ldi"]` 的标签 — 此标签分类既可查询也受代码审查工具 (linter) 约束，不受制于物理文件夹机制。
- **基础设施集 (4个)：** NOC Overview, AIOps & Capacity Forecast, Engineering Drill-Down, Meta-Monitoring。
- **制造集 (6个)：** LDI Manufacturing, LDI Operator Andon, LDI Engineering Analytics, LDI Machine Snapshot, LDI Data Readiness, Fleet at a Glance（尽管名为概览，实则使用 LDI 专用视图）。
- 扩展 `dashboard-linter.js` 检查规则：强制所有仪表板必须拥有 `tags` 条目，并确保其分类符合预期。

**明确排除在外的目标：** 不设立第二个 Grafana 组织/实例，不增加分离的 docker-compose 堆栈，亦不在数据库级拆分 `sys_metrics`/`ldi_data`（它们本来就已经分离）。

---

## 2. 制造域架构 (展望 AOI / 电镀 / 蚀刻 / 钻孔 环节)

**问题：** 目前在系统里，“制造 (manufacturing)”从命名到实现都仅指代 LDI —— `device_type='ldi'`、唯一一张遥测数据表 (`ldi_data`)，以及使用 LDI 专有列名 (`pe_setting`, `je_setting`) 等。没有机制能标识出这其中哪些是专属于 LDI 的特性，哪些是日后能复用于其他工序的通用属性。

**目标（数据库架构 + 规范文档，不直接制作全新仪表板或捏造虚假数据）：**

- 添加字段 `public.devices.process_type TEXT DEFAULT 'ldi'`（这是一种安全的字段追加方式，兼容所有的现存视图查询）。
- 撰写 `docs/architecture/MANUFACTURING_DOMAIN.md` 文档以确立未来新增工艺类型所需遵守的通用模式（以 LDI 为示范）：
  - 一个遥测超表 (hypertable)，主键包含 `(device_id, process_type, time)`。
  - 每个流程一套独立的警报主表 (alarm-code master)，结构类似 `ldi_alarm_ms_code`。
  - 每个流程一套 SPC/RCA 视图模式。
  - 每个流程对应的一组三合一仪表板 (Andon / Engineering Analytics / Manufacturing Overview)。
  - 一份极简版“流程入驻指南 (onboarding checklist)”。

**明确排除在外的目标：** 不会在当下开发关于 AOI、电镀、蚀刻或钻孔的具体数据表、仪表板。

---

## 3. EAP (设备自动化程序) 架构

**现实情况：** 现阶段的 IMS 系统仅做单向监控 —— 即读取遥测数据及触发警报，它并不承担反向的控制指令下发、配方 (recipe) 下载或者维护设备运行状态。目前系统未真正外接任何基于 SECS/GEM 协议的物理设备。

**目标：** `docs/architecture/EAP_ARCHITECTURE.md` — 这是一份聚焦现实可行且可扩展的**设备集成层**架构说明：

- 归纳总结现存的两种适配器模式：SNMP 适配器（负责老旧或底层架构设备）和 HTTP/JSON 适配器（面向 LDI 数据集成）。
- 勾画出并界定第三种（尚在规划中的）专用于 SECS/GEM 协议集成的适配器契约。
- 将上述三类适配器在概念上与标准的 EAP 术语 (设备模型、事件/告警采集、数据采集计划等) 一一对齐。

**明确排除在外的目标：** 没有 SECS/GEM 底层协议代码的开发，没有 HSMS 会话维护机制，也不编写 SECS/GEM 设备模拟器。本文仅为纯粹的集成架构契约说明。

---

## 4. 仓库结构与所有权 (保持单库架构)

**目标：**

- 细化 `.github/CODEOWNERS`，按照域边界划定不同的目录路径权限：
  - `/monitoring/grafana/dashboards/manufacturing/`, `/nodered_data/flows/ldi_*` → 制造领域 (Manufacturing)
  - `/monitoring/grafana/dashboards/infrastructure/`, `/nodered_data/flows/ingestion.json` → 基础设施领域 (Infrastructure)
- 保持原有的安全及 CI 敏感文件路径规则。
- 引入一份 `docs/architecture/OWNERSHIP.md` 文档，以说明以上两大领域各自的范畴及其目录对应的归属权，与 `CODEOWNERS` 形成强一致的管理规范。

**明确排除在外的目标：** 绝不进行多仓库 (multi-repo) 拆分。

---

## 5. 企业级文档体系的重构

本阶段排定在第 1 至 4 项落地**之后**执行，以保证基于确定的新结构撰写文档：

- `README.md` 文档表格：添加入口链接，直达 `MANUFACTURING_DOMAIN.md`、`EAP_ARCHITECTURE.md`、`OWNERSHIP.md` 和本设计案。
- `ARCHITECTURE.md`：以指引段落的形式建立导航索引，不再重复抄录其内容，以免出现“两个文档自相矛盾”的问题。

---

## 6. 系统验证、浸泡测试 (Soak Test) 及灾难恢复 (DR) 测试闭环

- **验证阶段:** 已经完美闭环（参见 `docs/operations/LDI_VALIDATION_PROTOCOL.md`），无须赘述。
- **浸泡测试 (Soak test):** 执行已有脚本，针对当前真实运行栈实施大于 24 小时 (建议 72 小时) 的长效测试，并将 `--summarize` 作为实际指标呈递。
- **灾难恢复测试 (DR test):** 开发 `scripts/dr-test.sh` 工具及执行计划 `docs/operations/DR_TEST_PLAN.md`：
  1. 数据库备份与还原演练 (Backup/restore drill) (包含 `pg_dump`，销毁与恢复，比对数据行数的一致性)。
  2. 模拟单容器崩溃的自修复演练 (强杀 `ims-timescaledb` / `ims-node-red`)。
  3. 执行由零到一的全栈重建测试。

---

## 7. 版本控制策略 (Versioning Policy)

- **数据库迁移** (`database/migrations/*.sql`): 只能进行单向的序号递增 (如 `066`)。
- **架构文档**: 使用日期追踪法（Status/Provenance 标明版本变更时间）。
- **集成适配器接口契约** (§3, EAP): 日后开发完成时，应当为其设计严格的语意化版本 (Semantic Versioning) 控制体系 (如 `adapter-contract-v1`)。

---

## 8. 安全边界设定 (Security Boundary)

本部分不再复读 `SECURITY.md` 的内容，而是专注于描述平台信任边界 (Trust boundaries)：

- **边界 1 — 宿主 ↔ Docker 网络 (维持原样):** 只有极少数指定端口暴露到外部。
- **边界 2 — 基础设施 ↔ 制造网络 (逻辑划分):** 系统在两者之间**不设**硬性的强制安全拦截 (无跨租户风险)。
- **边界 3 — 工业设备集成网络通信 (远期展望, §3):** 即将与 SECS/GEM 集成时，它将直接穿透工厂生产网络层，届时必须严格执行新一轮的安全审查机制。

---

## 9. 平台服务水平目标 (Platform SLOs)

| 监控项目 | 目标达成数值 / 实测值 | 参考来源 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| LDI 查询延迟 P95 值 (LDI-suite query P95)       | **5.30 毫秒** (实测，对 `v_machine_spc_fleet` 使用 `EXPLAIN ANALYZE` 抓取)                                                                                     | `LDI_VALIDATION_PROTOCOL.md` 阶段 2                                                                                                     |
| 统计/物化视图延迟范围 | **60 秒** (后台异步任务的执行频率)                                                                                                                              | migration `064`                                                                                                                          |
| Dashboard 数据加载延迟 (Dashboard load time) | **< 2 秒** (在本轮 QA 中经 Playwright 实测确认)                                                                                                                        | 实时系统 QA 测试                                                                                                                          |
| 高压下的流水线容错通过率 | **> 95%** (`pipeline-stress.js`), **> 90%** (在注入混沌故障 `chaos-stress.js` 时的测试结果)                                                                                            | `tests/k6/` 预设的安全底线                                                                                                                   |
| 服务崩溃后的自行恢复恢复耗时 (Ingestion self-recovery) | **实测确认: 小于 10 秒** | 由最新添加的外部服务监控脚本 (Watchdog) 在 DR 测试中得到验证 |

*(备注：文中所提阶段 A、B、C 及 DR 测试在 2026-08-10 及 2026-08-12 期间已全部获得实质性的闭环与确认，其实测数据与记录已全量存留。)*
