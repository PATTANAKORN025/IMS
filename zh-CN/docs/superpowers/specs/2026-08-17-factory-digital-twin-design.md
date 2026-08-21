<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# IMS LDI — 工厂数字孪生 (2D Canvas)：设计

> 状态：用户于 2026-08-17 批准，尚未实施。
> 路线图位置（用户指定的排名，不可重新排序）：
> 真实数据库 (Real DB) → 机器状态模型 (Machine State Model) → 2D Canvas → 深入分析 (Drill-down) → 生产/合规性 (Production/Compliance) →
> 性能验证 (Performance Validation) → 3D 数字孪生 (3D Digital Twin)。本规范涵盖直至
> 性能验证的所有内容。3D 明确不属于此范围。

## 目的

“查看工厂正在生产什么、每台机器在做什么、它位于何处、正在发生什么问题，以及这些问题如何影响生产/合规性�<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# IMS LDI — 工厂数字孪生 (2D Canvas)：设计

> 状态：用户于 2026-08-17 批准，尚未实施。
> 路线图位置（用户指定的排名，不可重新排序）：
> 真实数据库 (Real DB) → 机器状态模型 (Machine State Model) → 2D Canvas → 深入分析 (Drill-down) → 生产/合规性 (Production/Compliance) →
> 性能验证 (Performance Validation) → 3D 数字孪生 (3D Digital Twin)。本规范涵盖直至
> 性能验证的所有内容。3D 明确不属于此范围。

## 目的

“查看工厂正在生产什么、每台机器在做什么、它位于何处、正在发生什么问题，以及这些问题如何影响生产/合规性。” 这不是一个图表繁多的仪表板，而是一个能够一目了然地呈现工厂运行状态的可视化界面，并提供向下钻取 (drill-down) 至现有详细仪表板的功能。

## 硬性要求（用户指定，完全保留意图）

- 请勿修改 `ims-ldi-manufacturing.json` (制造指挥中心)。
- 请勿修改 `ims-ldi-operator-andon.json` (安灯看板)。
- 此仪表板中的任何位置均不得使用模拟/伪造数据。
- 仅使用真实的真实数据源 (`timescaledb`)。
- 机器状态、警报和生产状态必须全部可追溯到数据库中的真实数据行——所有查询模型都应重用现有的、经过验证的仪表板，而不是重新发明。
- `machine_id` 必须是唯一的。
- `board_id` 必须是唯一的。
- `board_no` 必须通过验证。
- 每个节点都有向下钻取功能。
- 每种颜色都有记录在案的语义 (不得使用未记录的原始十六进制值)。
- 禁止使用未记录的 Grafana CSS。
- 除已安装的插件外 (`docker-compose.yaml` 中的 `GF_INSTALL_PLUGINS`)，禁止安装外部 Grafana 插件。
- 性能预算应在构建之前定义，而不是之后。

## 影响此设计的实际发现（已在此会话中针对实时 DB/Grafana 进行了验证，而非假设）

1. **Canvas 面板是 Grafana 13.1.1 的核心/内置组件** —— 已通过 `GET /api/plugins`，`signature: internal` 确认。无需安装新插件；在架构上满足了“无外部插件”的约束。
2. **不存在真实的平面图坐标。** `public.devices.location` 仅包含 5 个粗略的区域标签：`Site A - Zone 1`、`Site A - Zone 2`、`Site A - Zone 3`、`Site B - Zone 1`、`Site B - Zone 2`。架构中没有任何 x/y 或经纬度列。选择的布局：画布上有 5 个带标签的区域块，机器以网格形式放置在其真实区域内（用户批准的选项）。节点**位置**是手动配置的画布设置（类似于 Andon 的重复面板块顺序）；节点**状态**是一个实时查询。这两者是不同的事物，绝不能在面板 JSON 及其描述中混为一谈。
3. **有 23 个注册的 `device_type='ldi'` 数据行，但只有 10 个实际报告数据。**
   `SELECT eqp_id, COUNT(*) FROM ldi_data WHERE time > NOW() - INTERVAL '24 hours' GROUP BY eqp_id` 恰好返回 `LDI-01`..`LDI-10`。另外 13 个 (`LDI-B07` 遗留, `ldi-b05/LD2`, `ldi-b01/LD2`, `LDI-A01`, `LDI-A02`, `ldi-a03/02`, `ldi-a05/02`, `ldi-b03/2`) 在注册表中是 `enabled=true`，但从未写入 `ldi_data` —— 它们是死条目/别名。画布仅显示 10 台实际报告的机器。这 13 个幽灵注册行是一个预先存在的数据质量问题，不在此仪表板的范围内，在此记录以避免日后被默默“重新发现”。
4. **100% 的真实数据行中 `board_id` 为空。**
   `SELECT COUNT(DISTINCT board_id) FROM ldi_data WHERE time > NOW() - INTERVAL '24 hours'` → 在 19,043 行中只有 1 个唯一值（空字符串）。字面上的“board_id 必须唯一”要求无法真正满足 —— 真实的摄取管道并未填充此列。
   **决定（用户批准）：使用 `log_id` 代替** —— 已验证在同一窗口期内它是 100% 非空且 100% 唯一的（19,119/19,119）。仪表板在 UI 中将此字段标记为“事件 ID (log_id)”(Event ID)，而不是“电路板 ID”(Board ID)，以避免暗示一种不存在的电路板跟踪能力。
5. **`board_no`/`total_board` 是真实且干净的数据。**
   在 19,053 行中，有 0 行违反了 `board_no <= total_board` 的规则；0 个负数；0 个非正数的 `total_board`；233 个唯一的 `board_no` 值；74 个唯一的 `total_board` 值。这确实可以作为每台机器的生产进度指示器 (`board_no/total_board`)。“board_no 必须通过验证”的要求通过此项检查得到满足，在构建时运行并在性能验证中重新检查。
6. **现有的查询分层约定保持不变。**
   `GRAFANA_DESIGN_SYSTEM.md` 第 10 节 / `tests/lint/query-budget-linter.js`：原始 `ldi_data` 仅用于最新值的查找（`LIMIT 1` / `DISTINCT ON`）；范围扫描必须通过 `ldi_data_1m` (≤6h)、`_15m` (6h–2d) 或 `_1h` (>2d)。画布上的每个节点查询都是针对原始 `ldi_data` 的最新值查找（与 Andon 已使用的 `v_ldi_machine_latest_full` 形状相同）—— 不需要新的分层规则，现有约定已涵盖此内容。
7. **实际性能预算已存在。**
   `tests/smoke/query-budget-check.sh`：实际目标为每次查询 300 毫秒，CI 在 2000 毫秒时硬失败 (hard-fail)。此仪表板采用相同的数字 —— 并非凭空捏造新预算，而是重用代码库中已强制执行的预算。
8. **现有的 CSS 注入约定本身未记录。**
   Andon 的面板 9999（`<style>[class*="-panel-container"]{...}</style>` 文本面板）在 `GRAFANA_DESIGN_SYSTEM.md` 中没有记录。鉴于“无未记录的 Grafana CSS”的要求，这个新仪表板使用 **零** CSS 注入 —— 所有样式均通过 Canvas 面板的原生 JSON 配置（填充、描边、圆角、文本）实现，这些是可检查的仪表板配置，而不是注入的原始 CSS。原有的 Andon 面板缺陷在此不作修复（超出了范围 —— 已标记，而不会被悄无声息地吸收进此任务中）。

## 两个验收标准差距（根据用户决定记录，并非伪造）

- **数据 / board_id 唯一**：无法按字面意思实现 —— 实际列未填充。用 `log_id`（真实的，唯一的，100% 填充的）代替，在 UI 中如实标记为“事件 ID”(Event ID)，而不是“电路板 ID”。
- **操作员 / 了解 SLA**：该系统中没有任何地方存在 SLA 阈值或目标（在此会话的早些时候已确认：MTTA/MTTR 仪表板发现 782 个警报生命周期中只有 0 个被确认，而且架构中不存在 SLA 配置表/值）。仪表板显示真实的自触发以来的耗时（Elapsed-time-since-fired）（在 Andon 的 Action Queue 中已计算的相同字段），并明确标记为“已用时间”(Elapsed)，而不是“SLA”或“SLA 遵从性”。

## 面板设计

**文件**: `monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json` (仅限新文件)

**顶部条带 — C 级 (C-Level)，一目了然，<5秒**:

| 统计 | 查询来源 | 重用于 |
| ---------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 车队可用性 % (Fleet Availability) | 已注册并启用的 LDI 车队，正在报告且正在运行的 | Andon 面板 1，逐字复制 |
| 活跃的关键/重大警报 | `ldi_alarm_lifecycle`，状态 ≠ RESOLVED | Andon 面板 2，逐字复制 |
| 未生产计数 | 当前处于 ALARM+IDLE+NO_DATA 状态的机器（生产影响的替代指标） | 新查询，状态分类与 Andon 的每台机器磁贴相同，已聚合 |
| 环境合规性 % | 温度 20-24°C 且湿度 50-60%RH，全车队 | Andon 面板 3，逐字复制 |

**画布 (Canvas) — 5 个区域块，10 个机器节点**:

- 填充颜色 = 机器状态（`0/1/2/3` → NO_DATA/IDLE/OK/ALARM），与 Andon 的每台机器重复磁贴使用相同的颜色标记和查询（`v_ldi_machine_latest_full` - 活跃警报覆盖）。
- 标签 = machine_id + 当前 MO。
- 生产进度 = 最新行中的 `board_no/total_board`。
- 警报徽章 = 该特定机器处于活动状态的关键/主要警报计数（形状与 Andon 面板 2 相同，范围限定为一个 `eqp_id`）。
- 点击目标 = `/d/ims-ldi-machine-snapshot/...`，使用与 Andon 的 Action Queue 表和制造指挥中心下钻链接已使用的相同 URL 参数模式（`var-machine_id`、`var-factory`、`var-mo`、`var-event_time_ms`、`from`、`to`）。
- 工具提示 (Tooltip) = 责任人（与 Andon 的 Action Queue 中已有的类别→团队映射相同），已用时间（真实数据，如实标记，不是 "SLA"），事件 ID（`log_id`，替代未填充的 `board_id`）。

**颜色图例 (Color legend)**：画布上的一个静态图例元素，将每种填充颜色映射到其状态名称，匹配 `GRAFANA_DESIGN_SYSTEM.md` 第 2.1 节标记 —— 与此代码库中其他地方使用的标记相同，而不是新调色板。

## 验收标准 — 可追溯性

| 复选框 | 满足条件 |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| C-Level：5 秒内了解生产状态 | 顶部条带，4 个统计数据，一目了然 |
| C-Level：有问题的机器 | 画布节点颜色 + 警报徽章 |
| C-Level：对生产的影响 | 未生产计数统计 |
| C-Level：合规风险 | 环境合规性 % 统计 |
| 操作员：每台机器需要做什么 | 节点标签 = 当前 MO |
| 操作员：需要管理哪些警报 | 警报徽章，点击跳转 |
| 操作员：责任人 (owner) | 工具提示，重用现有的 Owner 映射 |
| 操作员：SLA | **差距** —— 显示为已用时间 (Elapsed)，而不是 SLA（见上文） |
| 操作员：向下钻取 | 每个节点均可点击 → 机器快照 (Machine Snapshot) |
| 工程师：启用机器快照 | 向下钻取目标 |
| 工程师：原始遥测数据可追溯 | 机器快照 → 流程时间表（现有） |
| 工程师：警报可追溯 | 机器快照警报上下文（现有） |
| 工程师：RCA 可追溯 | `v_ldi_alarm_category`，与 Action Queue Owner 逻辑相同 |
| 数据：无模拟数据 | 所有查询均针对真实的 `ldi_data`/`ldi_alarm_log`/`ldi_alarm_lifecycle` |
| 数据：时间戳可追溯 | 在此会话中已审核的相同 `time`/`ingest_ts` 列 |
| 数据：board_id 唯一 | **差距** —— 用 `log_id` 替代（见上文） |
| 数据：machine_id 唯一 | `devices.device_id` 是主键 |
| 数据：通过预算查询 | `query-budget-linter.js` + `tests/smoke/query-budget-check.sh`，300ms 目标 |

## 性能验证（在宣告完成之前）

1. `node tests/lint/dashboard-linter.js` —— 0 个新错误。
2. `node tests/lint/query-budget-linter.js` —— 每个画布节点查询都是一个最新值的查询模型（`LIMIT 1`/`DISTINCT ON`），没有 range-scan 警告。
3. `bash tests/smoke/query-budget-check.sh` —— 实际上每次查询低于 300 毫秒（2000 毫秒即硬失败）。
4. 在生产信息亭参数下 (`kiosk=tv&autofitpanels`, 1280x720) 通过 Grafana 的渲染 API 进行真实渲染 —— 使用在此会话中验证 Andon Board 更改时使用的相同验证方法 —— 确认无滚动条 (zero scroll)，所有 10 个节点 + 顶部条带均可见且清晰易读。
5. `node scripts/generate-dashboard-inventory.js` —— 仪表板清单保持同步（新仪表板，计数 +1）。

## 明确排除在外的范围

- 3D 数字孪生（下一阶段路线图，并非本规范）。
- 修复 13 个幽灵设备注册行。
- 在摄取管道中填充真实的 `board_id`。
- 定义真实的 SLA 阈值/配置。
- 对 `ims-ldi-manufacturing.json` 或 `ims-ldi-operator-andon.json` 的任何更改。
- 记录/修复 Andon 现有的未记录的 CSS 注入面板（已注记为差距，但不在本规范中修复）。
