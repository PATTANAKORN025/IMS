<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
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

- **数据库迁移** (`database/migrations/*.sql`): 严格按序号递增（当前至 `066`），由 `scripts/migrate-entrypoint.sh` 按顺序执行，合并后不可编辑或重新编号 — 修正始终是 _下一个_ 编号（例如 `064` → `065` → `066`）。
- **架构文档**: 使用日期追踪法（Status/Provenance 标明版本变更时间）。
- **集成适配器接口契约** (§3, EAP): 日后开发完成时，应当为其设计严格的语意化版本 (Semantic Versioning) 控制体系 (如 `adapter-contract-v1`)。

---

## 8. 安全边界设定 (Security Boundary)

本部分不再复读 `SECURITY.md` 的内容，而是专注于描述平台信任边界 (Trust boundaries)：

- **边界 1 — 宿主 ↔ Docker 网络 (维持原样):** 仅有 Grafana (3000)、Node-RED (1880)、Prometheus (9090) 和 Alertmanager (127.0.0.1 仅回环) 公开主机端口。PgBouncer、TimescaleDB 和 SNMP 模拟器仅限内部使用。本文档不改变此设定。
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

---

## 浸泡测试（Soak Test）— 状态（2026-08-10 开始，仍未关闭 — 尚未达到 72 小时）

**约束定义：** `scripts/soak-test-report.sh` 在其自身的头部注释中说明 -- 它 "不会自行运行 72 小时测试。" 浸泡测试需要针对未触碰的运行中 stack 的真实挂钟时间；任何单次工具调用都无法制造这些时间。以真实的通过/失败裁决关闭此阶段需要在真实时间过去之后才能检查。

**真实 `--summarize` 输出，运行于 2026-08-12T13:05Z（已过 52.5 小时，`IMS-SoakTest` 定时任务每 15 分钟运行）：**

```text
═══════════════════════════════════════════════════
 IMS Soak Test Summary
═══════════════════════════════════════════════════
Samples: 57 Window: 2026-08-10T08:34:21Z -> 2026-08-12T13:05:15Z (52.5h elapsed)
Window length: NOT YET 72h -- keep this script running periodically and re-summarize later.

Ingest failures ever nonzero in a sample: max=NaN (want 0)
Buffer overflows ever nonzero in a sample: max=NaN (want 0)
Samples where any container had restarted since last sample: 4 (want 0)
Samples with >=1 non-Watchdog alert firing: 37 (want 0)
DB size drift: NaNMB -> 157MB

VERDICT: FAIL -- see nonzero counters above
```

**这反映了临时阈值。** 对三个驱动因素进行了调查，而不是仅引用计数器：

- **`NaN` 值是脚本的问题，不是失败的证据：** 57 个样本中有 24 个的 inserts/failures/overflows/db_size 为 `NaN`（两个集群：2026-08-11T14:00-17:20 和 2026-08-12T08:05-10:35，每个约 ~2.5-3.5 小时连续样本），因为 `node-red:1880/metrics` 或 `psql` size 查询在采集时未响应。`sort -n` 将文字字符串 `"NaN"` 排到最后，因此 `MAX_FAILED`/`MAX_OVERFLOW` 打印 `NaN`，尽管日志中的每个 _数字_ 样本都显示两者均为 `0`。这是采集缺口，不是数据摄取实际失败的证据。
- **`ANY_RESTART=4`，全部在今天的工作之前**，由时间戳确认：`2026-08-11T04:22:14Z`、`2026-08-11T05:45:06Z`、`2026-08-12T08:05:15Z`、`2026-08-12T10:50:14Z`。这些都不对应于本次会话的 DR 测试（约在 ~2026-08-12T12:57-13:03Z 运行）-- DR 演练在 `docker kill` 后使用 `docker start`，这不会增加 Docker 自身的 `RestartCount`。这是 52.5 小时内 4 次真实重启事件，需要逐个调查。
- **`ANY_FIRING=37` 个样本有 >=1 个非 Watchdog 告警活跃** -- FAIL 的最大驱动因素。本轮未进行根因分析（需要每样本的告警历史，而 Alertmanager 不保留超出当前状态的历史，仅保留此日志的汇总计数）。当前活跃的唯一告警（`PipelineDataStalled`，critical）很可能是本次 summarize 运行前几分钟该会话自身 DR 容器终止演练的残留，预计将在下一次计划采样的样本上自动清除 —— 但这无法解释之前存在的其余 36 个历史触发记录，这些记录早于本次会话的工作，是一个真实的未决发现项。

**要关闭此阶段：** 让定时任务继续运行到 72 小时，然后重新运行 `--summarize`。37 次告警触发和 4 次重启事件是真实发现，需要各自独立调查。

---

## DR 测试 — 证据（Drill 1-2 于 2026-08-10 关闭；Drill 3 未运行）

**已交付：** `scripts/dr-test.sh`（3 个演练），`docs/operations/DR_TEST_PLAN.md`。

### Drill 1 — 备份/恢复：PASS

首次运行产生了假阴性验证（在快照 _之后_ 查询实时行数，因此实时摄取系统已向前推进了几行 — 不是恢复缺陷）。修复脚本以在快照前后记录实时计数，并检查恢复的计数落在该范围内。重新运行：

```text
devices=1025 ldi_data=52795 ldi_alarm_log=10405 (before snapshot)
devices=1025 ldi_data=52796 ldi_alarm_log=10405 (after snapshot)
devices=1025 ldi_data=52795 ldi_alarm_log=10405 (restored, ephemeral isolated database)
VERDICT: PASS -- snapshot export time: dump 1s, restore 18s, 22,284,869 bytes
```

### Drill 2 — 单容器丢失恢复（`ims-timescaledb`、`ims-node-red`）：已于 2026-08-12 找到根因并修复，现在 **PASS**

**原始发现（2026-08-10），复现并找到根因（2026-08-12）：** 重新运行 `docker kill ims-timescaledb`（SIGKILL），这次通过重复 `docker inspect` 轮询完整监视 5 分钟。结果：`RestartCount` 在整个 5 分钟内保持 `0` — 不是慢，是完全没有触发。首先排除了 compose 配置错误：`docker inspect` 确认 `RestartPolicy=unless-stopped, MaximumRetryCount=0` 已正确应用。问题是 Docker Desktop 的（WSL2 后端，server 29.6.2）重启策略引擎在之后未被调用。

**修复：** `scripts/container-watchdog.sh` — 外部 watchdog，轮询此 compose 文件中每个具有 `restart: unless-stopped` 的容器，并对未处于 `running` 状态的容器执行 `docker start`，补偿 Docker 自身重启引擎中已确认的缺口。

**使用活跃的 watchdog 重新运行（`--loop 5`），2026-08-12，跨两个关键容器的 6 次试验：**

```text
timescaledb: PASS -- recovered in 6s
node-red: PASS -- recovered in 6s
timescaledb: PASS -- recovered in 8s
node-red: PASS -- recovered in 3s
timescaledb: PASS -- recovered in 5s
node-red: PASS -- recovered in 6s
```

6/6 PASS，每次都是个位数秒恢复。**底层 Docker Desktop 重启策略缺口未修复**（超出本仓库控制范围）— 改变的是此环境现在拥有一个实际有效的补偿控制。

**同一演练发现的第二个级联问题：** 手动 `docker start` TimescaleDB 恢复正常后，LDI 摄取 **未** 在几分钟内自我恢复 — 与 PgBouncer `server_login_retry` 失败缓存行为相同。Node-RED pool 重连 watchdog（`ldiDbConnFailureStreak`，5 次连续失败阈值）在观察到的 ~6 分钟内 **未** 触发自动 Node-RED 重启 — `max(ldi_data.time)` 冻结在故障时间戳，直到手动执行 `docker restart ims-node-red`。**记录为未来迭代的约束**。

**事件中正常工作的部分：** 告警管道。Blackbox exporter 正确检测到 `timescaledb:5432` 宕机，Alertmanager 正确路由，Node-RED 的告警传递流程正确记录了 "ServiceDown" 通知（LINE/Teams 按设计跳过 — 默认无凭据）。

**`scripts/dr-test.sh` 因此改进：** container-loss 演练现在如果重启策略在 120s 内未触发，会回退到手动 `docker start`。

**此演练造成的总实际停机时间：** timescaledb 每次 kill ~2-3 分钟（2 次 kill）+ 第二次 kill 后 ~6 分钟的摄取恢复缺口 = 约 10 分钟的真实、刻意停机，已完全恢复并验证（恢复后 0 lint 错误，0 e2e 错误）。

### Drill 3 — 全栈重建：**未运行**

鉴于 Drill 2 刚刚证明此环境中的自动恢复不如预期可靠，在未确认仍然需要的情况下运行破坏性的全卷擦除演练会在已经令人惊讶的结果之上增加风险。延期等待明确确认 — 准备好时参见 `scripts/dr-test.sh full-recreate --confirm-destroy`。

---

## DR 测试 — 证据

---

## Phase A — 证据（2026-08-10 关闭）

**已交付：** 仪表板物理拆分到 `monitoring/grafana/dashboards/{infrastructure,manufacturing}/`，两个 Grafana provisioning providers（`IMS Infrastructure`、`IMS Manufacturing` 文件夹），所有 15 个仪表板上的 `manufacturing`/`infrastructure` 域标签，`dashboard-linter.js` Check 18 强制标签/文件夹一致性，migrations `067`+`068` 添加 `devices.process_type`，以及 `MANUFACTURING_DOMAIN.md`。

**实施期间的修正：** 计划草案 §1 根据标题（"Fleet at a Glance"）错误地将 `ims-easy-overview.json` 分类为 Infrastructure。其实际描述和面板（`v_ldi_machine_latest_full`、`v_ldi_alarm_context`、`f_ldi_yield_pct` — 全部 LDI 专用）确认它是 Manufacturing 内容；`scripts/generate-dashboard-inventory.js` 预先存在的 `LDI_UID_EXTRAS` 允许列表已同意。在实施前修正（4 infra / 8 manufacturing，而非 5/5）。

**实施期间捕获并修复的 bug：** migration `067` 的 `ADD COLUMN process_type TEXT DEFAULT 'ldi'` 将默认值回填到 _每一_ 行，而不仅仅是 `device_type='ldi'` 的行 — 通过 `SELECT device_type, process_type, count(*) ... GROUP BY 1,2` 实时验证，显示 1002 个 `device_type='server'` 行错误地携带 `process_type='ldi'`。使用 migration `068`（删除默认值，null 掉错误的回填）修复。重新验证：`ldi/ldi: 23 rows`，`server/NULL: 1002 rows` — 正确。

**测试证据（所有命令针对实时 stack 运行，2026-08-10）：**

| 检查项 | 结果 |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node tests/lint/dashboard-linter.js`（含新 Check 18） | 0 errors, 0 warnings |
| `node tests/lint/alarm-sync-linter.js` | 19/19 codes resolve |
| `node tests/lint/orphan-object-linter.js` | 0 orphans / 31 checked |
| `node tests/lint/query-budget-linter.js` | 0 errors, 0 warnings |
| `node tests/lint/rca-mapping-coverage.js` | 100% coverage |
| `node scripts/generate-dashboard-inventory.js --check` | up to date |
| `node scripts/generate-schema-inventory.js --check` | up to date |
| 5 个单元测试文件（`boundary-validation`、`parser`、`counter-wraparound`、`v2-parser`、`circuit-breaker`） | 99/99 passed |
| `node tests/e2e/panel-data-check.js` | 73 passed, 2 个预先存在的 warnings（与此更改无关的 0 行边界情况），0 errors |
| `node tests/e2e/query-timing-check.js` | 47 queries measured, P95 22.48ms (budget 80ms), 0 errors |
| Grafana 文件夹结构（实时，`docker compose up -d grafana` 后） | 通过 API + Playwright 截图确认：`IMS`（仅 library panels），`IMS Infrastructure`（4 个仪表板），`IMS Manufacturing`（6 个仪表板） |
| `devices.process_type` 实时数据 | `ldi/ldi: 23`，`server/NULL: 1002` — `068` 修复后正确 |

**尚未 commit/push** — 等待此证据审查。

---

## Phase C — 证据（2026-08-10 关闭）

**已交付：** `README.md` 的文档表现在链接到 `IMS_MANUFACTURING_PLATFORM_V2.md`、`MANUFACTURING_DOMAIN.md`、`EAP_ARCHITECTURE.md`、`OWNERSHIP.md`。`ARCHITECTURE.md` 的 System Constraints & Technical Boundaries 部分增加了指向所有四个文档的指针，而非复制内容。

**作为 Phase A 直接结果捕获并修复的偏差：** `README.md` 第 160 行说 "14 dashboards — 6 infrastructure, 8 LDI manufacturing"，在 Phase A 修正的 4/6 拆分交付后立即变为错误。在同一编辑中修复。

**测试证据：**

| 检查项 | 结果 |
| ------------------------------------------------------ | ------------------------------------ |
| 所有 4 个新文档链接指向真实文件 | `test -f` 4 条路径 — 已确认 |
| `node scripts/generate-dashboard-inventory.js --check` | up to date |
| `node scripts/generate-schema-inventory.js --check` | up to date |

**尚未 commit/push** — 等待此证据审查。

---

## Phase B — 证据（2026-08-10 关闭）

**已交付：** `EAP_ARCHITECTURE.md`、`OWNERSHIP.md`，扩展 `.github/CODEOWNERS` 以包含域范围的路径条目。

**实施期间的修正：** §4 的原始草案（在 Phase A 运行之前编写）将 CODEOWNERS 路径列为仪表板文件名 glob（`ims-ldi-*` 等）。Phase A 的实际结果 — 物理目录拆分 — 使基于目录的路径（`/monitoring/grafana/dashboards/manufacturing/`）更简单更精确；上方 §4 已更新以匹配现实。

**声明通过 grep 验证真实源代码，而非假设：**

| `EAP_ARCHITECTURE.md` 中的声明 | 验证对象 | 结果 |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Adapter 2 (HTTP/JSON) endpoint 为 `POST /ldi-telemetry`，通过 `x-api-key` header 对 `INGEST_API_KEY` 进行认证 | `nodered_data/flows/ldi_ingestion.json` | 已确认（`"url": "/ldi-telemetry"`，`msg.req?.headers?.['x-api-key']` 对 `global.get('INGEST_API_KEY')` 检查） |
| Adapter 2 批量插入为 `INSERT INTO public.ldi_data ... ON CONFLICT (log_id, "time") DO NOTHING` | 同上 | 已确认，SQL 完全匹配 |
| Adapter 1 (SNMP) 每 30 秒通过 `fork_5_ways` 轮询 | `nodered_data/flows/ingestion.json` | 已确认（`fork_5_ways` node 存在，`"repeat": "30"`） |
| CODEOWNERS 路径（`/monitoring/grafana/dashboards/{infrastructure,manufacturing}/`，4 个 `nodered_data/flows/*.json` 文件名）存在 | `ls nodered_data/flows/`，Phase A 的目录拆分 | 所有 5 条路径确认存在 |
| CODEOWNERS 语法 | 手动审查 GitHub 文档格式和本仓库已有的工作行 | 完全匹配（`<pattern> <owner>`，`/` 前缀的根相对路径，last-match-wins 语义） |

**尚未 commit/push** — 等待此证据审查。
