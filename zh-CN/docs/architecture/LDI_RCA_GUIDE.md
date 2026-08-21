<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# LDI RCA (根本原因分析) 指南

> **受众:** 工艺工程 (Process Engineering), 质量保证/审计 (QA/Audit), SRE/运维 (Operations)。
> **目的:** 解释针对警报的根本原因分析 (RCA) 关联方法 (提升度 (Lift) 和置信度 (Confidence))。
> **来源:** 以下每个公式和数据都在 2026-08-10 针对在线迁移和数据库进行了直接核对。

---

## 本系统中 RCA 的含义

IMS 将 LDI 警报事件与工艺参数偏差相关联 — 旨在回答“当此警报触发时，底层工艺参数在此时刻是否确实超出规格，且比基线更频繁？” 这是一个统计关联性检查 (提升度)，而不是设备级的故障诊断。

## 提升度 (Lift) / 置信度 (Confidence) 指标

```text
Lift = (参数标志超出规格的警报上下文行数百分比)
  / (相同参数标志超出规格的所有行数百分比)

Confidence = 如果 event_count >= 30 为 "OK", 否则为 "LOW SAMPLE (n<30)"
```

Lift 为 1.0 意味着该警报与参数没有预测关系 (在此警报期间参数超出规格的频率与任何其他时间完全相同)。Lift > 1 意味着当此警报触发时，参数确实更有可能超出规格 — 值越高，关联性越强。之所以存在 `n < 30` 的置信度下限，是因为基于少量事件的提升度在统计上没有意义。

**迁移脚本 082 说明：** 两个 RCA 视图最初在计算 Lift 时，会先将百分比除以已经保留 1 位小数的数值，这导致任何真实基线舍入为 0.0% 的类别（THERMAL、VACUUM）的 Lift 都会悄无声息地变成空白，并使其他类别产生偏差（MOTION，约 9-22%）。迁移脚本 082（2026-08-19，在端到端系统审计之后）修复了此问题，改为对原始未舍入的分数进行除法 — 现在只有*显示*的百分比列被舍入到 1 位小数。它还删除了 `v_ldi_rca_recent_window` 中陈旧的 VACUUM 排除项（见上表），该排除项的存在理由早已不复存在（早在 7 个迁移脚本之前的迁移 057 就已修复了底层的阈值问题）。如果您在 2026-08-19 之前构建的仪表板上看到比预期更低或空白的 Lift 数据，那就是修复前的遗留行为 — 请以实时复查为准。

---

## 根本原因分析工作流 (DMAIC-Lite)

当警报与超出规格的参数表现出高度关联 (Lift > 10, Confidence = OK) 时，工程团队必须执行此结构化 RCA 工作流以找到物理故障。

### 1. 定义和测量 (Define & Measure)

1. **确定目标 (Identify Target):** 打开 `LDI Manufacturing` 仪表板，检查 **"Top Correlated Alarms (24h)"** 面板。
2. **量化 (Quantify):** 记下特定的警报类别和相关参数 (例如，_THERMAL 警报与 HUMIDITY 超出规格相关联_)。
3. **验证 (Verify):** 跳转到 `LDI Machine Snapshot`，验证触发警报的特定机器上的参数是否正在发生物理偏移。

### 2. 分析 (5-Why 物理检查)

不要只是重置警报。前往实体机器并连续询问“为什么？”，直到找到根本的硬件或工艺故障。
_湿度关联性示例:_

- **为什么触发了警报？** 湿度传感器报告 65% (限值: 50%)。
- **为什么湿度很高？** B 区洁净室 HVAC 回风口被堵塞。
- **为什么被堵塞？** 维护人员将过滤器包装留在了静压箱中。

### 3. 改进和控制 (解决和记录)

解决物理根本原因后，您必须记录发现的结果以形成闭环。

**标准化 RCA 结果格式:**
在换班记录/Jira/ServiceNow 中记录以下内容:

```text
[RCA REPORT]
Alarm Category: <类别> (Code: <代码>)
Correlated Parameter: <参数> (Lift: <X>)
Root Cause Identified: <物理故障>
Action Taken: <解决步骤>
Verification: <例如，15分钟后湿度降至 45%。警报已清除。>
```

---

## 两种视图，两种用途 — 不要混淆

|                                | `v_ldi_rca_recent_window`                               | `v_ldi_rca_truth_test`                                             |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------ |
| **范围 (Scope)**               | 滚动 24 小时窗口                                        | 完整数据集，所有时间                                               |
| **目的 (Purpose)**             | 运营 KPI — "RCA 关联性现在是否仍然成立"                 | 验证/真理测试 — "模拟器的故障注入逻辑是否确实产生了所声称的关联性" |
| **包含 VACUUM?**               | 是（重新校准阈值，迁移 057；自迁移 082 起包含 — 见下方注释） | 是                                                                 |
| **已物化? (Materialized)**     | 是 (迁移 064, 60秒刷新)                                 | 是 (迁移 064, 60秒刷新)                                            |
| **读取位置 (Where it's read)** | LDI Manufacturing 的 "Top Correlated Alarms (24h)" 面板 | LDI Engineering Analytics 的 "RCA Truth Test" 面板                 |

## 当前实时数据（快照，2026-08-19T07:24Z，migration-082 修复后 — 请参阅下方注意事项）

```text
Alarm Category                                    Alarm-Window % Baseline % Lift     Event Count Confidence
VACUUM (91009)                                                100.0        0.0  4956.96           4 LOW SAMPLE (n<30)
ALIGNMENT/PE-JE (90001,90004,90005,90012,90013)               100.0        0.8   125.83          70 OK
MOTION (70004)                                                100.0        0.2   420.59          27 LOW SAMPLE (n<30)
HUMIDITY (91008)                                                99.1       10.6     9.34         445 OK
THERMAL (91008)                                                  1.3        0.2     5.90         445 OK
```

（来自 `v_ldi_rca_truth_test`，完整数据集视图；`v_ldi_rca_recent_window` 的 24 小时操作视图现在也包含 VACUUM 行，当前为 `LOW SAMPLE (n<30, 0 events)`，因为过去 24 小时内没有真空故障触发 — 符合预期，不是错误。）

**这是 migration 082 之后拍摄的第一个快照**，该迁移修复了 Lift 双重舍入错误，并（仅针对 `v_ldi_rca_recent_window`）添加了 VACUUM。之前的 2026-08-15 快照显示 VACUUM 和 THERMAL 的 Lift 为空白/无法计算，尽管存在真实事件 — 那正是这个错误本身，而不是真正缺乏相关性。比较：THERMAL 现在显示真实的、计算出的 Lift（5.90），而不是空白；VACUUM 显示 4956.96，与 2026-08-19 审计期间手动验证的 ~4,925x 数字一致。

- **VACUUM 的 Lift（4956.96）是系统中最强的相关性** — 之前由于错误（truth-test）和排除（recent-window）在两个视图中都不可见。低样本量（此快照中 n=4）仍然适用 — 视为方向性强，尚未具有统计密度。
- **THERMAL 和 HUMIDITY 共享相同的底层警报代码（91008）** 但标记不同的参数 — THERMAL 的基线自然更稀有（0.2%）相比 HUMIDITY（10.6%），这就是为什么 THERMAL 的 Lift 比 HUMIDITY 对舍入错误更敏感。
- **ALIGNMENT/PE-JE 和 MOTION 都显示出大的、真实的 Lift 值**（125.83x，420.59x）— MOTION 在当前数据量下仍为 LOW SAMPLE，与下面"为什么 MOTION 有时表现出低置信度"部分一致。

**这是一个时间点快照，不是永久事实。** 这个实时摄取数据的模拟系统上的 Lift 数据会随着数据窗口滚动和模拟器继续生成事件而偏移。在报告中引用数据之前，请重新运行 `SELECT * FROM public.v_ldi_rca_truth_test ORDER BY "Lift" DESC;` — 请勿重复使用此快照或之前的快照（例如，此文档历史中的早期快照引用 VACUUM 为 "7,352x" 于 2026-08-07，当时是准确的，但因相同原因在此被取代，此外 migration-082 之前的一些数字也受到 Lift 错误本身的扭曲。）

## 为什么 VACUUM (91009) 需要特定修复

VACUUM 的规格外阈值 (`air_vacuum > -8 OR < -30`) 是围绕模拟器自身的 DF INNER 处方范围进行校准的 (迁移 057 — 派生自模拟器，而不是源自供应商规范)。为了能够测量这种关联性，需要进行两个支持性修复：

1. **DF OUTER/SM 机器正确发送 `air_vacuum` 的 `NULL`** 而不是 `0.0` 作为“不适用”的哨兵值 (迁移 054，在迁移 060 中回填到历史行) — 否则 `0.0` 会被误读为真实的超出规格读数。
2. **遥测生成器注入罕见的弱真空故障事件**，以便有真正的偏差可以关联 (在构建的 `nodered_data/flows.json` 中的 `ldisim_gen`) — 如果没有故意注入的故障，一个完全健康的模拟工艺就没有什么可以供 RCA 发现的。

## 为什么 MOTION (70004) 有时表现出低置信度

扫描速度偏差已正确关联，只是在统计学上比当前配方分布中的热量/湿度/对齐事件更罕见 — 在 24 小时滚动窗口 (`v_ldi_rca_recent_window`) 中，事件数量可能会低于 n≥30 的下限。完整数据集视图 (`v_ldi_rca_truth_test`) 通常有足够的累积事件来清除这一限制 (在上述快照中为 56 个)。这不是一个错误 — 一旦在所读取的任何窗口中积累了足够的事件，该类别就会获得 "OK" 的置信度。

## 相关文档

- `docs/architecture/LDI_SPC_GUIDE.md` — 伴随的工艺能力 (Cpk) 方法论。
- `docs/operations/LDI_VALIDATION_PROTOCOL.md` — 实时验证脚本 (`tests/e2e/panel-data-check.js`) 中的 RCA 真理测试断言。
- `docs/architecture/ALARM_SEVERITY_GUIDE.md` — 计算这些关联性所依据的警报分类。
- `docs/architecture/ARCHITECTURE.md` — 完整的系统上下文，系统约束和技术边界。

---

[⬅️ 返回 IMS 平台手册](IMS_PLATFORM_BOOK.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> 主代码库](../../README.md)
