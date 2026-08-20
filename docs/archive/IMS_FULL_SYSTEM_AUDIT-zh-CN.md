<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页 (Home)</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引 (Docs Index)</b></a>
</div>
<br/>

# IMS — 全系统审计报告 (Full-System Audit Report)

> **已归档 — 历史快照，日期：2026-08-05。** 非活动文档；以下数字（仪表板数量、迁移数量、面板数量等）反映了系统在当天的状态，且已知相对于当前系统已经过时。根据 docs/archive/README.md 作为历史记录保留。获取当前信息，请参阅 docs/architecture/ARCHITECTURE.md 和 docs/architecture/DASHBOARD_INVENTORY.md。

### 对 8 个界面的实时仪表板检查的证据 · 2026-08-05

---

## 方法论 (Methodology)

| 层级 (Layer)              | 方法 (Method)                           | 覆盖范围 (Coverage)                     |
| ------------------------- | --------------------------------------- | --------------------------------------- |
| **A. 静态 (Static)**      | 审查 SQL / JSON / Flow 代码             | 9 个仪表板 · 126 个面板 · 65 个节点     |
| **B. 自动化 (Automated)** | 19 项单元测试 · 12 项 linter 检查       | 架构 (Schema)、布局、警报同步           |
| **C. 视觉 (Visual - 新层)** | 检查 8 个实时渲染的仪表板               | 被 A 和 B 层遗漏的元素                  |

**主要的方法论发现：** C 层发现了 **12 个完全绕过了 A 层和 B 层的缺陷**。
发生这种情况是因为具有正确语法和匹配架构的查询，仍可能产生 NULL 值或相互矛盾的数据。
→ **现有的自动化测试系统目前缺乏“实时输出验证 (live output validation)”层。**

---

# P0 — 相互矛盾的指标 (最关键)

## P0-1 · 两个界面中同一系统的良率 (Yield) 指标存在 87 个百分点的分歧

| 仪表板 (Dashboard)    | 显示值 (Displayed Value)         | 基础公式 (Underlying Formula)             |
| --------------------- | -------------------------------- | ----------------------------------------- |
| **NOC 概览**          | **87.10%** (红色 — 严重)         | `ABS(pe_1) > 10 OR ABS(je_1) > 10`        |
| **制造 (Manufacturing)** | **99.6%** (绿色 — 极佳)          | `GREATEST(ABS(pe_1..pe_6)) <= pe_setting` |

**根本原因 — 逻辑上的三个根本差异：**

1. **NOC 使用了硬编码的阈值 `10`**，而实际的 `pe_setting` 值根据产品不同为 **25 / 50 / 75**。
   → 尽管产品符合实际规格，NOC 却错误地将其标记为“缺陷”。
2. **NOC 仅评估 `pe_1` 和 `je_1`**，忽略了全部 6 个测量点 → 这不能代表用于实际质量确定的指标。
3. **NOC 测量“风险 (Risk)”，而制造测量“良率 (Yield)”** — 这是两个截然不同的定义，但最终用户却将它们视为相同的指标。

**业务影响：** 如果高管查阅 NOC，他们会认为制造质量存在 87% 的缺陷率。
如果他们查阅制造仪表板，他们会看到 99.6% 的卓越率 — **这直接导致了错误的决策。**
此外，一旦发现这种矛盾，**整个系统** 的可信度将立即受到破坏。

**解决方案：** 强制 NOC 通过集中式视图 (centralized view) 查询与制造部门相同的逻辑。

```sql
CREATE OR REPLACE VIEW public.v_ldi_yield_1h AS
SELECT ROUND(100.0 * COUNT(*) FILTER (
         WHERE GREATEST(ABS(pe_1),ABS(pe_2),ABS(pe_3),
                        ABS(pe_4),ABS(pe_5),ABS(pe_6)) <= pe_setting)
       / NULLIF(COUNT(*) FILTER (WHERE pe_1 IS NOT NULL), 0)::NUMERIC, 1) AS yield_pct
FROM public.ldi_data
WHERE "time" > NOW() - INTERVAL '1 hour' AND COALESCE(pe_setting,0) > 2.0;
```

随后，两个仪表板都将查询这个集中式视图 — **这些指标将通过架构设计保持一致的同步，而不是出于巧合。**

---

# P0-2 · RCA 真实性测试报告“无相关性” — 它是正确的

来自工程分析 (Engineering Analytics) & SPC 的证据：

| 警报类别 (Alarm Category) | 警报窗口 % (Alarm-Window %) | 基线 % (Baseline %) | **提升度 (Lift)** | 事件 (Events) | 解释 (Interpretation)           |
| ------------------------- | --------------------------- | ------------------- | ----------------- | ------------- | ------------------------------- |
| ALIGNMENT/PE-JE           | 49.0%                       | 44.8%               | **1.09**          | 251           | 统计上不显著                    |
| VACUUM (91009)            | 96.8%                       | 100.0%              | **0.97**          | 95            | **低于 1 的比率 (Sub-1 ratio)** |
| THERMAL (91008)           | 13.8%                       | 16.6%               | **0.83**          | 29            | 低于 1 的比率                   |
| HUMIDITY (91008)          | 3.4%                        | 9.9%                | **0.34**          | 29            | 显著低于 1                      |
| MOTION (70004)            | 0.0%                        | 0.0%                | **0.00**          | 19            | 数据不足                        |

**解释：** `Lift = 1` 表示零相关。`Lift < 1` 表示 **负** 相关 (inverse correlation)。

**这不是 RCA 的缺陷 — RCA 机制运作正确，揭示了一个关键的真相：**

> 模拟数据生成器根据频率随机生成警报，**没有将它们与实际参数值绑定。**
> 因此，“真空 (vacuum)”警报并没有在真正的 `air_vacuum` 异常期间被触发。

**交付价值：** RCA 真实性测试成功验证了其检测 **错误相关性 (false correlations)** 的能力。
如果在缺乏实际相关性的数据上报告了高 Lift，则说明诊断工具本身存在缺陷 — 但它表现得很正确。

**行动项目 (Action Item)：** 修正 **模拟器 (simulator)**，而不是 RCA 逻辑。

```javascript
// ldi_simulator.js — 确保警报由实际的参数异常触发
if (rec.air_vacuum > -10 && p.process === "DF INNER") emitAlarm("91009");
if (maxPE > rec.pe_setting * 0.9) emitAlarm("90005");
if (rec.temperature < 20 || rec.temperature > 24) emitAlarm("91008");
```

修改后，Lift 值应激增至 **> 2**。如果未发生此情况，则表明 RCA 引擎内部存在需要调查的真正潜在缺陷。

---

# P1 — 面板渲染无数据 (检测到 15 个实例)

## Engineering Drill-Down — 受影响最严重 (10 个面板)

```text
CPU 负载 (CPU Load) · RAM 使用率 (RAM Usage) · 存储饱和度 (Storage Saturation) · 温度 (Temperature)      → "无数据 (No data)"
内存饱和度 (Memory Saturation) · 网络带宽 (Network Bandwidth) · 温度传感器 (Temperature Sensors)   → "无数据"
LDI 吞吐量 (LDI Throughput) · LDI 结效率 (LDI Junction Efficiency) · LDI 质量散布 (LDI Quality Scatter) → "无数据"
CPU 异常分数 · 温度异常分数 → "数据没有时间字段 (Data does not have a time field)"
```

**两个截然不同的根本原因：**

- **"无数据 (No data)"** — 查询语法有效，但返回的符合条件的行数为零（机器/接口变量未被选择）。
- **"数据没有时间字段 (Data does not have a time field)"** — 查询返回了结果，但 **缺少 `time` 列**，尽管面板被配置为时间序列 (timeseries) → 真正的 SQL 缺陷。

## AIOps & 容量预测 (Capacity Forecast) — 4 个 KPI 中有 3 个失败

```text
磁盘 (DISK)：距离满载的天数  → 无数据
RAM： 距离满载的天数  → 无数据
CPU： 距离饱和的天数 → 无数据
距离满载的天数 (资源电池) → 无数据
车队健康分数 (Fleet Health Score) 91.30% →  运行中 (Operational)
```

## NOC 概览 — 不可靠的指标

```text
CPU 负载 (车队包络)  → 0.00% 轨迹完全平滑   ← 不应为 0
RAM 饱和度             → "等待遥测 (AWAITING TELEMETRY)"
温度车队包络 (Temperature Fleet Envelope) → 65.0°C 平滑轨迹          ← 反映服务器温度，而非 LDI
```

## 操作员暗灯 (Operator Andon) — 2 个完全空白的面板

```text
实时生产 (LIVE PRODUCTION)            → 完全缺乏内容
PE/JE 对比规格限制 (PE/JE VS SPEC LIMIT)        → 完全缺乏内容
```

**严重的运营影响**，因为 Andon 是操作员在整个轮班期间的主要实时界面，而这两个特定面板决定了“当前生产状态”和“实时质量指标”。

---

# <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P2 — 自动检测到的数据质量问题

来自 LDI Data Readiness 的证据（此特定仪表板表现极其出色）：

## 系统自主检测到的真正问题

| 指标 (Metric)             | 值 (Value)    | 评估 (Assessment)                                                                                                                                     |
| ------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 机器 ID 匹配 (Machine ID Match) | **100%**      | 已成功从之前 20% 的基线解决                                                                                                                           |
| 警报主机匹配 (Alarm Master Match) | **100%**      | 已成功从之前 0% 的基线解决                                                                                                                            |
| 遥测年龄 / 警报年龄 (Telemetry Age) | 0.0 小时      | 遥测是实时的                                                                                                                                          |
| **板卡 ID 完整性 (Board ID Completeness)** | **8.0%**      | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 在数据为 100% NULL 的情况下准确反映了真实情况            |
| **PE / JE4 覆盖率**       | **45% / 45%** | 正确（DF INNER 工艺不测量 PE）                                                                                                                        |

## 重复的板卡密钥 (Duplicate Board Keys) — 仅隔离在 2 台机器上

```text
LDI-01:  43,667 行 → 43,510 唯一 → 157 个重复的板卡密钥
LDI-04:  28,683 行 → 28,562 唯一 → 121 个重复
LDI-02,03,05..10:                        0 个重复
```

**高度可疑** — 如果这是生成器的缺陷，它应该均匀地表现在所有机器上。
它排他性地发生在 LDI-01 和 LDI-04 上，暗示逻辑上存在分歧。
（两台都是 DF INNER 机器，然而 LDI-02 和 LDI-03 也是 DF INNER，却表现出零问题）。

**需要调查：** `UNIQUE INDEX idx_logid (log_id, time DESC)` 应该从根本上防止重复。
→ 这意味着重复发生在 `(mo, board_no)` 级别，而不是 `log_id` 级别 = **这可能表明板卡被物理地重复计算了。**

## 推断的传感器能力 — 自动系统观察

```text
LDI-01..04:  真空 "常量 - 验证 (CONSTANT - VERIFY)"   扫描速度 "常量 - 验证 (CONSTANT - VERIFY)"
LDI-05..10:  真空 "全零 - 验证 (ALL ZERO - VERIFY)"
```

系统将这些标记为“持久恒定值 — 建议调查”，这 **基于原始数据是准确的**
（配方设置本质上是静态的，而非动态测量）。但是，消息传递应修改为
`"常量 (配方设置 — 符合预期)"`，以防止被误解为异常。

## LDI-03 / LDI-04 在 NOC 中显示“过时 (Stale)”状态

虽然 Data Readiness 报告遥测年龄 = 0.0 小时 → **存在矛盾。**
这源于 NOC 错误，它使用了与 Data Readiness 不同的新鲜度阈值。

---

# <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P3 — 单位和格式

```text
"255.03 currency-thb"   ← 需要格式化为 ฿255.03
"574.00 currencyTHB"    ← 需要格式化为 ฿574.00
甜甜圈图例："value value value"  ← 缺少序列术语 (series nomenclature)
```

**成功解决的项目：** `µm`、`°C`、`%H`、`mm/s`、`kPa`、`mJ/cm²` 现在都可以准确渲染
Machine Snapshot 和 Manufacturing 界面 — `lengthum` 错误已被彻底消除。

---

# 高度功能的组件 (请勿修改)

| 仪表板 (Dashboard)    | 状态 (Status)                                                                                                     | 证据 (Evidence)                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Machine Snapshot**  | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 完美 (Perfect)         | 所有面板均有数据 · 单位 100% 准确 · PE/JE PASS 功能正常 · Cpk 分离了 PE/JE · 毫秒级精度的事件时间线                                |
| **Manufacturing**     | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 优秀 (Excellent)       | 完整的 KPI 覆盖 · 填充的表格数据 · 占主导地位的绿色合规指标 · 底部 RCA 摘要                                                     |
| **Engineering & SPC** | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 稳固 (Solid)           | 6+4 PE/JE 轨迹成功解耦 · 叠加的 PE 与 JE 直方图 · 经验证的 Cpk PE 1.253 / JE 2.710                                              |
| **Data Readiness**    | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 杰出 (Outstanding)     | 成功自动识别了 3 个合法的数据异常                                                                                               |
| **Andon**             | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> 部分功能正常 (Partially) | KPIs + 10 个机器磁贴完美运行 · 但是，2 个面板仍然未填充                                                                         |

**最令人印象深刻的成就：** Machine Capability Ranking 在 **独立的、专用的列中显示了 Cpk (PE) 1.253 和 Cpk (JE) 2.710**
以及 Worst Cpk 和置信区间 (Confidence intervals) — 最终证明了将 JE 基础从 PE 中架构解耦的设计完美无缺地运行了。

---

# 持续审计框架 (Continuous Audit Framework)

## 将 Layer C 集成到自动化管道中 — 最关键的差距

系统目前拥有全面的单元测试和 linters，但 **缺乏任何机制来验证面板是否渲染了实际有效负载数据。**

```javascript
// tests/e2e/panel-data-check.js  (New)
// 针对数据库执行每个面板的实际 SQL 查询并验证返回的行数
for (const panel of allPanels) {
  const rows = await pg.query(resolveMacros(panel.rawSql));
  if (rows.length === 0)
    fail(`${dashboard}/${panel.title}: query returned 0 rows`);
  if (panel.type === "timeseries" && !rows.fields.includes("time"))
    fail(`${dashboard}/${panel.title}: timeseries lacks a 'time' column`);
}
```

**通过标准 (Pass Criteria)：** 每个面板必须产生 ≥1 行，且每个时间序列面板必须包含 `time` 列。
→ 这种自动化检查将可靠地捕获当前 15 个出现故障的面板，而无需人工干预。

## 实施跨仪表板的一致性验证

```sql
-- 跨不同仪表板的同名指标必须来源于统一视图。
-- 禁止使用硬编码阈值，其本质上应映射到 pe_setting/je_setting。
```

**通过标准 (Pass Criteria)：** 零查询对 PE/JE 指标使用硬编码的数值阈值。
（它们必须无条件地引用来自数据库层的 `pe_setting` / `je_setting`）。

---

# 执行优先级顺序 (Execution Priority Sequence)

| 编号 | 任务 (Task)                                         | 严重性 (Severity)                                                                               | 受益者 (Beneficiary)                        |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | **将良率 (Yield) 逻辑整合为集中式视图**             | P0                                                                                              | 高管 — 消除相互冲突的指标                   |
| 2   | **将模拟器警报与参数异常绑定**                      | P0                                                                                              | 工艺工程师 — 启用 RCA 验证                  |
| 3   | 解决 Andon 中 2 个未填充的面板                      | P1                                                                                              | 车间操作员                                  |
| 4   | 解决 15 个“无数据 (No data)”面板                    | P1                                                                                              | 所有利益相关者                              |
| 5   | 调查重复的板卡密钥 (LDI-01/04)                      | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P2 | QA — 缓解歪曲的板卡计数                     |
| 6   | 将 E2E 面板数据验证集成到 CI 中                     | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P2 | 开发团队 — 防止回归 (regression)            |
| 7   | 修正货币单位 + 甜甜圈图例格式                       | <img src="../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> P3 | 通用界面完善                                |

---

# 利益相关者执行摘要 (Stakeholder Executive Summaries)

**执行董事会 (Executive Board)：** 系统在 9 个界面中有 5 个处于全面运行状态。但是，有 1 个关键问题需要立即解决：
良率报告中的严重矛盾（87% 对比 99.6%），这直接破坏了战略决策。

**SRE / IT 运营：** 目前有 15 个面板无法渲染数据。强制要求实施 E2E 验证，因为当前的 linter
仅严格验证语法，但无法确保实际数据检索。

**QA 工程：** 发现分别孤立于 LDI-01 和 LDI-04 的 157 和 121 个重复板卡密钥。
需要立即调查，以确定这是物理重复计数错误还是数据模拟器内的异常。

**工艺工程 (Process Engineering)：** RCA 真实性测试完美运行并准确报告
目前不存在统计学上显著的相关性 (Lift ≈ 1) — 可操作的根本原因分析需要真实数据或修正后的模拟器。
Cpk (PE) 目前为 1.253，被归类为“可接受 (Acceptable)”，但低于 1.33 的严格行业基准。
