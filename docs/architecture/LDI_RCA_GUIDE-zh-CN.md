<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
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
| **包含 VACUUM?**               | 否 (已排除 — 见迁移 050)                                | 是                                                                 |
| **已物化? (Materialized)**     | 是 (迁移 064, 60秒刷新)                                 | 是 (迁移 064, 60秒刷新)                                            |
| **读取位置 (Where it's read)** | LDI Manufacturing 的 "Top Correlated Alarms (24h)" 面板 | LDI Engineering Analytics 的 "RCA Truth Test" 面板                 |

## 当前实时数据 (快照, 2026-08-15T02:35Z — 请参阅下方注意事项)

```text
Alarm Category                                    Alarm-Window % Baseline % Lift    Event Count Confidence
VACUUM (91009)                                                 -        0.0    -              0 LOW SAMPLE (n<30)
THERMAL (91008)                                              0.0        0.0    -            105 OK
MOTION (70004)                                              100.0        0.3 333.33            6 LOW SAMPLE (n<30)
ALIGNMENT/PE-JE (90001,90004,90005,90012,90013)              100.0        0.5 200.00           17 LOW SAMPLE (n<30)
HUMIDITY (91008)                                              100.0        9.9  10.10          105 OK
```

**请在上下文中解读此快照：它是在主机/容器完全重置后约 1 小时 25 分钟拍摄的** (参见 `docs/evidence/SOAK_TEST_LOG.md` Attempt 7 收尾)，而不是像它所取代的 2026-08-10 快照那样经过了数天的稳定运行。老实说，这就解释了这些数字的形态：

- **VACUUM 有 0 个事件** 并且尚无计算出的提升度 (Lift) — 弱真空故障注入 (参见下面的“为什么 VACUUM 需要特定修复”) 是一个罕见事件；自重置以来它根本没有触发过。这是一个预期的统计边界，而不是缺乏关联性 — 请在 VACUUM 积累事件后重新检查。
- **THERMAL 有 105 个事件但 0.0%/0.0% 且没有可计算的 Lift** — 当前警报窗口和基线都显示 0% 的温度超出规格，因此还没有 Lift 可测量的变化 (由于 HUMIDITY 标志超出规格触发了 105 个 THERMAL 警报，而不是 TEMP 标志 — 参见 `HUMIDITY (91008)` 行，相同的底层警报代码，不同的标志)。
- **MOTION 和 ALIGNMENT/PE-JE 显示出真实的、巨大的 Lift 值 (333x, 200x) 但两者都是 LOW SAMPLE (n<30)** — 在方向上与 2026-08-10 快照的关联性一致，但在重置后这么短的时间内，统计上还不够可靠。
- **HUMIDITY 是唯一一个既有计算出的 Lift 又有 `OK` 置信度的类别** (10.10, n=105) — 这个类别已经具备了坚实的统计基础。

**这是一个时间点快照，不是永久事实。** 这个实时摄取数据的模拟系统上的提升度数据会随着数据窗口滚动、模拟器继续生成事件以及 (如本快照所示) 自上次重置以来经过的时间积累而发生偏移。在报告中引用当前数据之前，请重新运行 `SELECT * FROM public.v_ldi_rca_truth_test ORDER BY "Lift" DESC;` — 请勿重复使用此快照或它所取代的 2026-08-10 快照，就好像它们是最新的一样。(早期版本的 `ARCHITECTURE.md` 引用 VACUUM 为 "7,352x" — 该数据在 2026-08-07 测量时是准确的，但在 2026-08-10 已经过时；出于同样的原因，2026-08-10 的快照本身现在已被上述数字取代。)

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

[⬅️ 返回 IMS 平台手册](IMS_PLATFORM_BOOK.md) | [<img src="../../docs/assets/icons/home.svg" width="18" align="center" /> 主代码库](../../README.md)
