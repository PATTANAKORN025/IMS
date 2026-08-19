<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# IMS Grafana Design System

> [!IMPORTANT]
> 这确保了所有 IMS 仪表板（NOC Overview, Engineering Drill-Down, Capacity Planning，以及从第二阶段开始的 — LDI Manufacturing, LDI Engineering Analytics & SPC, LDI Machine Snapshot, LDI Operator Andon Board, LDI Data Readiness）都遵循相同的标准。集中在此处进行编辑，以防止跨文件产生偏差，从而确保在切换页面时，系统立即呈现出统一套件的视觉效果。
>
> 必须强调，本文档是一项 **契约**，而不仅仅是指导方针 — 每一个新面板（panel）在合并（merge）之前都必须遵守这些规则。

---

## 1. Design Principles

1. **Function first, beauty follows**（功能至上，美观其后） — 任何不能加速数据理解的美学设计都属于装饰性元素，必须予以剔除。
2. **Color always has a single meaning**（颜色应始终具有单一的含义，语义化而非装饰性） — 参见下方规则 3。
3. **3-Second Rule**（3秒规则） — 任何经过 NOC 显示屏的人都必须在不阅读标签的情况下，于 3 秒内判断出“当前一切是否正常”。
4. **Consistency > Novelty**（一致性优于新颖性） — 相同类型的面板无论出现在何处，都必须共享完全一致的外观（通过 Library Panels 实现）。
5. **Progressive disclosure**（渐进式信息披露） — NOC 旨在回答“我们需要打电话给某人吗？”，Engineering 用于回答“为什么？”，Capacity 则解答“接下来会发生什么？”。请勿在同一页面上混合不同深度的详细信息级别。

---

## 2. Color System

### 2.1 Semantic Palette — ONE table, every dashboard (merged 2026-08-08)

在此之前，此代码库运行着**两套**独立的调色板：一套是 §2.1 用于 NOC/Engineering/Capacity，
另一套是截然不同的“LDI Kiosk”调色板，用于 5 个 LDI 仪表板。在实际应用中，两套调色板
实际上已经在几乎所有地方演变为了**相同的**十六进制（hex）值（在编写本节之前，通过统计
所有 10 个仪表板文件中每个 `#RRGGBB` 字面量来验证）——
双表分离的设定已沦为文档里的虚构，而非实际的设计边界。
现已合并为一张表，应用于**全部 15 个仪表板**，包括 LDI kiosk 集合。
所有仪表板无一例外。

| Token            | Hex Code  | Meaning                             | Used For                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | --------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ok`             | `#22C55E` | Healthy / Normal                    | 健康（Healthy）、运行中（running）、通过（PASS）、Capable+ 阈值 — 任何表示“情况良好”的裁定状态                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `warning`        | `#F59E0B` | Monitor / Non-urgent                | 空闲（IDLE）、处于边缘（Marginal）、警告阈值（warning thresholds）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `critical`       | `#EF4444` | Danger / Immediate action required  | 规格外（OUT OF SPEC）、严重阈值（critical thresholds）、错误状态                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `info`           | `#00F2FE` | General data / Non-verdict          | 纯粹的 KPI 数字、机器名称标签、非警报类统计信息                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `accent`         | `#3B82F6` | Highlight / Active UI elements      | 导航高亮、交互元素                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `no_data`        | `#64748B` | Specifically NO_DATA                | 报告中的真切缺失 — 这种声明与表示“确认存在问题”的 `critical` _含义不同_。“我们不知道” ≠ “发生了故障”。每个 stat/gauge/bargauge 面板都必须通过 `type: "special", options.match: "null+nan"` 映射明确地携带这种颜色（或者，对于在 SQL 中将无数据行转换为特殊标记值的面板，使用匹配文本 `NO_DATA` 的值映射）—— Grafana 不会自动退回使用中性颜色。 除了当面板的后备状态是合法的业务零计数或已经带有更特定的语义标签（例如 NOC 的 `AWAITING TELEMETRY`）外，`noValue` 文本在任何地方都必须是字面字符串 `NO_DATA`（不能是 `N/A`/`-` 或 Grafana 默认的 "No data"）。 |
| `forecast`       | `#4A5568` | Forecast / Regression (dashed line) | 预测、回归、趋势投射 — 仅限虚线                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `severity-minor` | `#EAB308` | 4th alarm-severity tier             | 专门用于 ISA-18.2 “Minor” (次要) 严重度，有别于 `warning`/Major — 这两者刻意采用了不同的色调，以确保包含四个等级（Critical/Major/Minor/Warning）的严重度标尺能在视觉上清晰区分。它并非 6 个核心色之一；仅用于警报严重度的值映射中。                                                                                                                                                                                                                                                                                                                           |

**Strict Rules:**

- **禁止** 使用 Grafana 默认调色板 — 仅且必须使用此表中的标记（tokens）来传达状态。
- **禁止** 将固定颜色绑定到特定的机器/系列名称上，除了一种情况外：工厂中必须通过静态颜色区分的永久性实体机器 — 其映射关系必须在 §8 中进行声明。
- 红色 (`#EF4444`) 必须 **始终** 代表严重（critical） — 切勿将红色单纯用作图表序列的颜色，因为这会与警报语义发生冲突。
- 预测/回归/阈值参考线必须始终采用 `#4A5568` 虚线，不得使用明亮颜色以免与实际数据产生视觉竞争。
- 装饰性颜色（针对那些不具状态含义的线条以进行图表系列区分、背景、边框）不受此表限制 —— 一个仪表板不能仅仅由 6 种高饱和度颜色构建。只有当一种颜色从未用于传达任何对象的 OK/warning/critical/no-data 状态时，它才算作“装饰性”；如有疑问，即视为语义色。
- **Enforcement:** `tests/lint/dashboard-linter.js`（检查 15）会比对 `monitoring/grafana/dashboards/*.json` 中每一个 `thresholds.steps[].color` 和 `mappings[].options.color` 与此表的十六进制值是否匹配 —— 这里特别限定在这两个结构位置上，因为在这两处颜色_总是_承载语义的，这与纯粹的 `fixedColor`（用于图表系列区分，属于合理应用）不同。这正是实际的“核心”机制 —— 该文件中的 `APPROVED_TOKENS` 就是根据本表生成的；如果您在这里添加了 token，也请在那里同步添加。

### 2.1a (retired) — see history

自上述合并生效后，原有的“LDI Kiosk” 5 个 Token 表格 (`#22c55e`/`#FF9100`/`#FF003C`/`#00F2FE`/`#6B7280`)
已被弃用。其中的每个概念现已通过在实时 LDI 仪表板文件中_已占主导地位_的十六进制值，
以 1:1 的形式映射到了 §2.1 表格中 ——
LDI 仪表板的视觉标识（深色的 `#030407` 背景、Roboto Mono 字体）
未发生任何变化，改变的仅仅是代表状态颜色的字面量。关于合并之前进行的协调工作记录
（第二/三阶段零散实例的清理），请参阅 git 提交历史日志。

### 2.1b Accessibility — WCAG AA contrast (audited 2026-08-08)

当 Grafana 的 Stat/Gauge 使用 `colorMode: "background"` 时，无论背景实际亮度如何，它总是渲染出**白色**的值
文本 —— 这是基于经验验证，
而非根据 Grafana 文档的假设（在版本 13.1.1 中，没有针对浅色背景自动将文本切换为黑色的机制）。计算了
§2.1 中每个 Token 作为白底实心填充时的对比度：

| Token            | Hex       | White-text ratio | AA large (≥3:1) | AA normal (≥4.5:1) |
| ---------------- | --------- | ---------------- | --------------- | ------------------ |
| `ok`             | `#22C55E` | 2.28             |                 |                    |
| `warning`        | `#F59E0B` | 2.15             |                 |                    |
| `critical`       | `#EF4444` | 3.76             |                 |                    |
| `info`           | `#00F2FE` | 1.39             |                 |                    |
| `accent`         | `#3B82F6` | 3.68             |                 |                    |
| `no_data`        | `#64748B` | 4.76             |                 |                    |
| `severity-minor` | `#EAB308` | 1.92             |                 |                    |

**Fix applied, not just documented:** 每一个使用
`colorMode: "background"` 的 stat/gauge/bargauge 面板（共 31 个面板）都改为了 `colorMode: "value"` ——
代币颜色不变，现在显示为深色面板背景上的大型粗体文字，而不再是白色文字后面的实心填充背景。作为_文本_对比深色面板背景
（实质上是相同的比率，倒置过来），所有的 Token 都通过了 AA-large 测试，且除了 `no_data` 之外的其他颜色甚至通过了
全面的 AA-normal 测试（`no_data` 仅在本系统所使用的较大的 stat-value 尺寸上采用，所以 AA-large 是适用标准）。
这一调整还带来了一个额外好处：它现在在视觉上进一步加强了 §2.1 中 `ok`/`warning`/
`critical`（“这是判定结果”）与 `info`（“中立的数据读取，不是判定结果”）
的区分 —— 判定结果为实心填充方块，而中立数据读取则是深色方块上的彩色文字 ——
而不是让它们看起来雷同，只能通过其属于哪种具体颜色的实心方块来进行区分。

**One deliberate exception:** 安灯 (Andon) 板上的每台机器的红绿灯
方块（`monitoring/grafana/dashboards/manufacturing/ims-ldi-operator-andon.json`，面板
`1000`）依然保留了 `colorMode: "background"`。它们的作用是在
3-5 米外进行颜色_感知_，而非文本_阅读_ —— 在任何仍然能将十个方块并排容纳于 Kiosk 屏幕的面板尺寸下，
实心色块相比于彩色文字更能够让身在工厂另一侧的人一目了然，
这也正好匹配了真实的工业安灯的运作方式。WCAG 的文本对比度指标并未模拟
这种判断“方块是红色还是绿色”的任务，因此，如果在这里机械套用该指标，就会用
那些不契合该应用场景的指标，来牺牲掉实际的无障碍需求（一目了然性）。

**Enforcement:** `tests/lint/dashboard-linter.js`（检查 17）会针对任何
在各个文件的排除列表之外使用了 `colorMode: "background"` 的
stat/gauge/bargauge 面板发出警告，以防在添加新面板时暗中出现倒退情况。

### 2.2 Threshold Contract (衡量同一指标的所有面板必须保持一致)

| Metric             | Warning | Critical | Notes                              |
| ------------------ | ------- | -------- | ---------------------------------- |
| CPU Load %         | 80      | 90       |                                    |
| RAM Used %         | 85      | 95       |                                    |
| Disk Used %        | 80      | 90       |                                    |
| Temperature °C     | 45      | 55       | 得知具体机器规格后调整至实际数值   |
| LDI PE (µm, abs)   | 10      | 15       | 根据与 QA 协议的容差               |
| Fleet Health Score | < 70    | < 50     | 0-100 连续分布比例（不含阶跃函数） |

必须做到这些数字 **编写一次** 并通过字段配置模板进行重用，切勿在各个面板上重复手动输入阈值 — 如果某个值需要更改，请在一处修改并将其另存为 Library Panel 的字段配置。

---

## 3. Typography & Number Formatting

| Element                                | Rule                                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel title                            | 简短，不多于 4 个词，遵循首字母大写（Title Case），切勿在名称中包含单位（单位应属于坐标轴或图例）。                                                         |
| Panel description                      | 务必为每个面板包含此项，解释“这是什么 + 它是如何计算出来的”，通过悬停（ⓘ 图标）显示。                                                                       |
| Stat value font size (NOC / kiosk row) | NOC Overview 和 Andon Board 顶排 KPI 的尺寸需 ≥ 56px（已从原来的 32px 增加尺寸 — 以便在大型 NOC/kiosk 屏幕上能在较远处读取），同时配以 `titleSize` ≥ 16px。 |
| Stat value font size (Others)          | 常规 KPI 的尺寸 ≥ 32px。                                                                                                                                    |
| Table `cellHeight` (NOC / kiosk)       | 在 NOC Overview 和 Andon Board 的主表格中请始终设定为 `lg` — 默认的 `sm` 对于远距离阅读来说过小。                                                           |
| Unit                                   | 请始终为每个字段配置单位，切勿留下未经处理的数字（如 `%`, `°C`, `GB`, `Mbps`）。                                                                            |
| Decimal                                | 对于百分比（%）和温度，保留 1 位小数即可；如果是计数，请保留 0 位小数。                                                                                     |
| Time                                   | 使用 `dateTimeFromNow` 表示“最后一次出现的时间”（例如 "12s ago"），绝对时间仅预留给提示框（tooltip）使用。                                                  |
| Sentinel values                        | 特殊值（例如 9999 = 无增长）必须始终有对应的文本值映射；坚决避免展示那些看似系统错误的原始数字。                                                            |

---

## 4. Panel Type Decision Table

请基于 **数据的本质** 来选择面板类型，而非出于习惯：

| Data Type                          | Use Panel                           | Example in IMS                             |
| ---------------------------------- | ----------------------------------- | ------------------------------------------ |
| 单一最新值 + 侧边趋势对比          | **Stat** (`graphMode: area`)        | Latest CPU, Latest RAM                     |
| 设定了上限，需要提示“剩余量”的数据 | **Bar Gauge** / **Gauge**           | RAM %, Disk %                              |
| 时间轴上密集出现的各种状态         | **State Timeline**                  | Fleet uptime 24h                           |
| 连续的走势图，多序列的比较分析     | **Time Series**                     | CPU/RAM/Network history                    |
| 在某一特定时刻，各部分占整体的比例 | **Pie / Donut**                     | Traffic breakdown per interface            |
| 包含多个字段的详情表格             | **Table** + gauge cell + color text | Server Fleet Status                        |
| 探究 2 个变量间的相关性            | **XY Chart**                        | CPU vs Temperature                         |
| 正在活跃触发的警报                 | **Alert List**                      | Top row of NOC                             |
| 操作手册 (Runbook) 描述或相关链接  | **Text (Markdown)**                 | Notes beneath a row                        |
| 工厂车间的空间位置布局分布         | **Geomap (custom image)**           | Physical machine layout by production area |

**Prohibition:** 请勿将时间序列图表硬塞入小尺寸统计面板中（如 6×6），因为根本没有足够的空间来阅读坐标轴 —— 倘若必须在小空间里展现趋势，请使用 stat + 迷你图（sparkline）的组合替代。

---

## 5. Layout Grid System

### 5.1 Grid Rules (Standard Grafana 24 columns)

```text
┌─────────────────────────────────────────────────────┐
│ Row 1: KPI Strip  [4][4][4][4][4][4] h=4  │ ← 指示整体状态的单一指标
├─────────────────────────────────────────────────────┤
│ Row 2: Alert + Status [Alert List: 8][Table: 16] h=8│ ← 必须最优先查看的内容
├─────────────────────────────────────────────────────┤
│ Row 3: Trends (collapsible row by domain) h=8-10 │ ← 每行 1-2 个时间序列，宽度 12-24
├─────────────────────────────────────────────────────┤
│ Row N: Deep Debug (collapsed by default)  h=8  │ ← 原始表格，非关键级别
└─────────────────────────────────────────────────────┘
```

### 5.2 Width/Height Rules

| Panel type                         | Width (Columns) | Height |
| ---------------------------------- | --------------- | ------ |
| Stat (KPI)                         | 4–6             | 4      |
| Gauge / Bar Gauge                  | 6–8             | 6      |
| Primary Time Series                | 12–24           | 8      |
| Secondary Time Series (comparison) | 12              | 8      |
| Table                              | 16–24           | 8–10   |
| Alert List                         | 8               | 8      |
| Pie/Donut                          | 6–8             | 8      |

- 请勿在同一行中混用不同的高度（这会致使网格看起来错位）—— 如果面板高度不一致，请将它们拆分到不同的行里。
- 请务必采用 **Row** 对语义功能区（semantic zones）进行划分。赋予行直观明确的名称（如 `Compute`, `Network`, `Environmental`）并配上单一的 emoji 以充当视觉锚点。
- 对于非关键行（Non-critical rows），默认状态为 → `collapsed: true`。
- **Panel density (2026-08-08):** 那些未分行而垂直堆叠了超过大约 8 个面板的仪表板（在以前高度曾达到 126 个网格单元的 `IMS LDI - Engineering Analytics & SPC` 中尤为明显）必须基于语义分区（semantic zones）归组到行中，并将除了首个/最重要的行之外的其余行全部折叠——从而仅保留一个能迅速传达概览信息的简短头部列表，避免引发繁重的滚动操作。全部内容仍然完好无损，只是被隐藏在了可点击的标题头（headers）后。
- **Kiosk no-scroll ceiling (2026-08-08):** 根据第 1 节原则 5（“渐进式披露”——NOC 和 Easy Overview 用于解答“一切都好吗”，而 Andon 则是充当工厂车间的显示墙），有 3 个仪表板作为一瞥即得/大屏显示版（glance/kiosk boards），在 `tests/lint/dashboard-linter.js` 的 `MAX_HEIGHT` 中设定了硬性的 20 网格单元上限，并将其作为错误（error）而不仅是警告（warning）来执行。所有这 3 个都沿用了同一模式：只有与决策最为相关的单一首行维持展开状态（比如 Andon 的 KPI 条 + 机器区块，NOC 的告警列表，Easy Overview 的 KPI 条）—— 其它所有行都被折叠了起来，但在只需一次点击便可完全访问的范围内保留了完整内容。Engineering、Capacity、Machine-Snapshot 以及 Manufacturing 是根据相同原则有意设计为深潜探索类型的仪表板，它们**并不受制于** `MAX_HEIGHT` 限制——强行将它们压缩在 20 个单元内将违背它们本身的实际用途，且起不到应有的作用。

---

## 6. Interaction Standards

在所有文件中统一配置 **dashboard settings**：

| Setting                                | Value                                                       | Rationale                                                                                    |
| -------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Graph tooltip                          | `Shared crosshair`                                          | 拖动光标可以同步各面板的时间位置 — 这让人感觉它是一个有凝聚力的统一系统。                    |
| Tooltip mode (for multi-series panels) | `multi`                                                     | 在同一点同时显示所有序列的值。                                                               |
| `spanNulls`                            | `60000` (1 minute), not `true`                              | 图表中的间隙反映了实际发生的事件（系统停机故障），并且必须清晰可见，切不可被插值线掩饰覆盖。 |
| Default time range                     | NOC: `now-6h` / Engineering: `now-6h` / Capacity: `now-30d` | 这符合各个页面的实际使用行为；并未作统一化默认设置。                                         |
| Refresh rate                           | NOC/Engineering: `10s` / Capacity: `5m`                     | 契合数据的实际突变频率；进而防止出现不必要的查询。                                           |
| `allowUiUpdates` (provider)            | `false`                                                     | 严格落实仪表板即代码的准则，防范与 Git 版本出现偏离。                                        |

---

## 7. Graph-Specific Data Visualization Rules

- **Time-bounded `spanNulls`** (见规则 6)，绝不随意填平每个空隙。
- **Display thresholds as area shading**（将阈值显示为区域阴影，即 `thresholdsStyle: "area"` 或 `"line+area"`） 绝不能只是裸露的虚线 — 与细线相比，远处看淡红色背景会容易得多。
- **Accumulated counter values (SNMP errors/drops) must be converted to a rate before display**（累计计数器数值在展示之前必须在 SQL 层面使用 `LAG() OVER (...)` 转换成速率形式） — 绝对不能显示出一条永无止境向上攀爬的累计线，如果现状正在恶化，这种图形是根本无法判断读取的。
- **Data requiring a mirrored axis (e.g., TX below RX)**（那些需要镜像轴的数据，例如将发送流量放在接收流量下方）仅可以在视图层调用字段重写功能 `custom.transform: "negative-Y"` — 绝对不可以在 SQL 里面乘以 `-1`，因为这么做图例 / 提示框会展现出错误的负数值。
- **Forecast/regression series** （预测/回归走势序列）必须使用灰色虚线形式展现 (见 §2.1) ，并且在覆盖匹配器应用模板插值时（例如 `${machine_id}`），必须运用 `byRegexp` ，绝对不能使用字面的 `byName` ，原因在于 `byName` 并不会处理和插值模板相关的操作。
- **Legend:** 在拥有超过 3 个系列的走势图时，应将呈现模式配置为： `displayMode: table` + `placement: bottom` + 激活 `calcs: [mean, max, last]` —— 这样可以让图例不再仅仅作为颜色标记存在，而是成为一个迷你的信息数据表。

### 7.1 ECharts panels (`volkovlabs-echarts-panel`) — theming is not optional (added 2026-08-08)

该插件自身携带的默认配置是针对浅色模式以及多类别仪表板所设计的，
如不进行修改，它将与本系统的设计规范背道而驰：深色主题下会弹出 **白色的工具提示弹窗（tooltip popup）**，
并且——一旦系列数量超过 2-3 个——
**明艳的彩虹色分类调色板**（如亮蓝/紫/粉/橙等）就会介入，
这会把一个精准的仪表读数面板变成屏幕保护程序。在此前的某次审查通过的代码中，这两点问题都被交付上线，
但尽管底层工程逻辑是健全的，由于整个 SPC 部分被反馈为“显得杂乱无章”，
随后又不得不回滚——其缺陷纯粹源自主题设置，与图表选择本身无关。

在此系统中的每一个 `getOption` 函数均必须：

- 显式地将 `tooltip.backgroundColor`/`borderColor`/`textStyle.color` 设定为匹配暗色面板调色板的值
  （即 `rgba(18,22,26,0.95)` / `rgba(255,255,255,0.12)`
  / `#E8EDF2`）—— 严禁让 ECharts 的浅色模式工具提示保持激活状态。
- **切勿** 仅仅因为有很多个系列就为每个系列分配一种鲜艳的色彩。对于那种展示“N 个同类事物随时间变化”的图表（例如 10 台机器的原始采样数据），
  统一采用柔和中性的单调色彩（`#8B98A9`）来渲染所有这 N 个对象，并将显著的色彩保留给真正代表裁决意义的状态——举例来说，
  当前有且仅有一台机器超出了控制限制，那么赋予它 `critical` 红色，而其余的
  统统保持灰色。这就是将 §2.1 原则（“颜色具有唯一含义”）应用到一个并未为你强制执行该规范的插件上的具体体现。
- 当有两个类别确实在视觉上需要保持区分（如 PE 对比 JE 的箱线图），
  但又都不属于裁决性质的显示时，请从 **中性读数（neutral-readout）系列**（即 `info` `#00F2FE`，`accent` `#3B82F6`）中挑选两个令牌进行配置 ——
  切勿选用警告/危急令牌，也不可使用随意设定的非令牌十六进制颜色代码。
- 将 `xAxis`/`yAxis`/`legend` 的文本颜色样式设置为 `rgba(224,224,224,0.85)`，并将网格/分隔线的颜色设定为 `rgba(255,255,255,0.06-0.15)`，
  以此与系统内其余部分限制网格线显示的惯例保持同步（参见 §9 视觉干扰控制规则）。

参考实现范例：可参阅 `ims-ldi-engineering-analytics.json` 中的面板 17
(Thickness Control Chart) 和面板 12 (PE/JE Box Plot)。

---

## 8. Machine Identity Palette (如果需要将固定颜色绑定到实体机器上)

> 请在确定好要部署到生产环境的物理机器列表后，一次性填妥此表。严禁在除引用此表之外的其他任何地方创建固定的颜色覆盖设置。

| Machine ID                | Color | Notes |
| ------------------------- | ----- | ----- |
| _(Awaiting machine data)_ |       |       |

---

## 9. Reusability — Library Panels

若面板出现在超过 1 个仪表板中，则 **必须** 将其实现为库面板（Library Panels，只需编辑一次，即可处处更新） —— **但是这绝对只在 SQL/业务逻辑确凿相同的前提下才适用**，仅仅是面板名称相似不能作为理由：

- **Fleet Health Score** (stat) — 真正的库面板，`ims-lib-fleet-health-score`。在合并前，已确认在 `ims-capacity-planning.json` 和 `ims-noc-overview.json` 之间的查询语句是字节级别完全一致的（`SELECT value FROM public.v_fleet_score`）。
- **Availability / Critical Alarms / Running / Yield** — 在 2026-08-08 进行审核时，即便名称相近，也发现这些并非重复项：在各个仪表板的版本里存在实质上截然不同的 SQL 范围（例如：Manufacturing 中的 Yield 面板增加了一个 `machine_id` 模板过滤器和周期性环比的 "Delta %" 计算方法，而这在较简化的 Easy Overview 版本中是没有的；此外，在 Andon/Manufacturing/Easy-Overview 中，针对 "Availability"/"Running" 等面板的不同点在于它们是否按 `machine_id` 进行过滤，以及采用了哪种解决压缩块方案 (compression-chunk workaround)）。倘若强行将它们并入到一个共享面板中，将意味着改变每个仪表板实际进行的计算内容 —— 这超出了本环节的讨论范畴（在当前阶段明确将业务逻辑的修改排除在外）。如果日后有了统一为同一规范的查询/过滤范围的实质业务决定时，届时再重新执行这项审核工作并利用相同机制将选出的部分晋升为库面板。

**在本项目中实际的运作方式如下（Grafana 13.1.1 并不具备基于文件的库面板供给功能（provisioning）——只有 datasources/dashboards/alerting/plugins 具有该特性；此情况已由实际操作验证，而非单纯信任 Grafana 文档的配置供应说明部分）：**

1. 在 `monitoring/grafana/library-panels/<uid>.json` 内编写面板的具体规范 —— 格式： `{uid, name, kind: 1, model: {...full panel content...}}`。`uid` 采用手动精选配置并且维持稳定不变（不是借由 Grafana 自动产生的），所以就算它尚不存在，仪表板 JSON 也能引述之。
2. 运行 `bash scripts/provision-library-panels.sh` — 此为针对正在执行的 Grafana 实例运作的等幂 HTTP API 脚本（若遗失，借由 `POST /api/library-elements` 进行创建，若 uid 已经存在，则执行 `PATCH` 更新动作）。并未将其作为自动化服务组建在 `docker-compose` 体系下（因为目前这里没有任何既存镜像能不仰赖脆弱定制化建置便同时涵盖 curl 及 python3 功能） — 请在执行 `docker compose up` 完毕后，采取与运行 `scripts/import-real-data.sh` 相仿的模式手动启动之。
3. 在引用该项的仪表板 JSON 中，利用以下极简的替代部分来替换对应的面板： `{"id": <id>, "gridPos": {...}, "libraryPanel": {"uid": "<uid>", "name": "<name>"}}` — 此处完全没有内联（inline）设置的 `type`/`fieldConfig`/`options`/`targets`/`description` 等信息；所有内容都完全取自 Library Element。
4. `tests/lint/dashboard-linter.js` 将直接执行针对 `library-panels/*.json` 的检验（含 color tokens, description, noValue 等环节），原因是引用的占位型面板并没有包含任何可作比对的内联资料。

---

## 10. Pre-Merge Checklist for New Panels/Dashboards

- [ ] 颜色使用必须完全来自 §2.1 中的表格；严禁将固定的颜色绑定在具体的序列中，除非它们代表着工厂永久性实体机器。
- [ ] 阈值需与 §2.2 的协议相契合（如果是新指标，请先在该表新增一行）。
- [ ] 为每个字段均填写完善 `unit`（单位）和 `description`（描述）。
- [ ] 请依据 §4 中的表格要求挑选面板类型，切勿凭个人习惯做决定。
- [ ] 网格的宽高度须符合 §5.2 的规定；绝对不要在同一行里混合使用各异的高度设置。
- [ ] 确保 `spanNulls` 被设置为特定的数值，而不能使用 `true`。
- [ ] 若面板在别处有重复使用的情况 → 请在合并前将之转换为库面板（Library Panel）。
- [ ] 查询语句须顺应分层法则（raw ≤ latest value, minute CAGG ≤ 6h, hourly CAGG > 2d）。
- [ ] 执行了 `make test-visual` 的测试且反馈的截图效果契合预期要求。
- [ ] 跑完 `node tests/lint/dashboard-linter.js` 需无任何错误通过检测 —— 此 linter 会主动揪出那些游离于 §2.1 表格外的 hex 色彩代码。这也正是核心机制（"central token"）的真正体现，而绝不仅是这份纸上空谈的文档。

---

_这份文档是一份具备活力的文件 —— 请务必透过修改相关的 dashboard 时的同一 PR（拉取请求）顺带对其做更新。绝不允许让 Dashboard 和这份说明文档存在不同步的内容落差。_
