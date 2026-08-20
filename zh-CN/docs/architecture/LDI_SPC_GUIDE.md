<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# LDI SPC (统计过程控制) 指南

> **目标受众:** 工艺工程, 质量保证/审计, 站点可靠性工程/运营。
> **目标:** 定义所有制造仪表板中使用的统计过程控制 (SPC) 数学模型 (Cpk)。
> **出处:** 以下每个公式、阈值和文件引用均已于 2026-08-10 直接对照实时迁移 (live migrations)、仪表板 JSON 以及 golden-dataset 测试套件进行了核对。

---

## SPC 在本系统中的含义

IMS 在每次 LDI 曝光中追踪两个测量值的工艺能力 (Cpk)：**PE**（位置误差，每块板 6 个样本：`pe_1`..`pe_6`）和 **JE**（判断误差，每块板 4 个样本：`je_1`..`je_4`），并将它们与每行各自的配方公差（`pe_setting`、`je_setting` — 而不是所有机器/配方中单一的硬编码限制）进行对比。

## Cpk 公式

```text
cp = tolerance / (3 * sigma)
cpk = LEAST( (tolerance - mean) / (3 * sigma), (mean + tolerance) / (3 * sigma) )
```

- **平均值 (Mean):** 样本平均值 (`AVG`)
- **西格玛 (Sigma):** 样本标准差 (`STDDEV`，非总体标准差 `STDDEV_POP`)
- **公差 (Tolerance):** 特定行的 `pe_setting` 或 `je_setting`
- **最差 Cpk (Worst Cpk):** `LEAST(cpk_pe, cpk_je)`（两个测量值中更受限的一个，而不是平均值）

### 控制限 (Control Limits)

- **警告限 (Warning Limit):** Cpk < 1.33。触发 `monitoring/grafana/provisioning/alerting/ldi-rules.yml` 中的警报规则。
- **违反控制限 (Control Limit Violation):** Cpk ≤ 1.0 (严重)。红线。工艺能力不足。产生废品。

---

## 失控行动计划 (OCAP)

当仪表板显示 Cpk 出现偏差时，工艺工程部门必须执行以下工作流程：

### 阶段 1: 评估 (Cpk < 1.33)

**触发条件:** `LDI Process Capability — Cpk below 1.33` 警报触发。

1. **确认:** 工艺工程师在 `Alarm Console` 中认领该警报。
2. **审查控制图:** 打开 `LDI Engineering Analytics`。检查受影响机器的 X-bar 和 R-charts (控制图)。
   - _这是突然的偏移还是逐渐的漂移？_
3. **检查 RCA 相关性:** 交叉引用 `LDI_RCA_GUIDE.md`。是否存在与这种能力下降相关的潜在热或真空异常？
4. **行动:** 产线**继续运行**。工程师开始调整配方参数（例如，激光剂量，对准公差）以将 Cpk 恢复到 > 1.33。

### 阶段 2: 干预 (Cpk ≤ 1.0)

**触发条件:** Cpk 降至 1.0 以下。该工艺在数学上无法满足公差要求。极有可能产生缺陷。

1. **停止产线:** 工艺工程师授权当班主管停用特定机器。
   - _注意：与机械故障（操作员可以独立停止）不同，SPC 停机需要工程部门的监督来验证数据。_
2. **隔离:** 过去 60 分钟内由该机器处理的所有面板必须标记为 QA 重新检查。
3. **物理审计:**
   - 在虚拟玻璃 (dummy glass) 上进行测试曝光。
   - 重新校准光学对准头。
   - 清洁真空平台。
4. **验证运行:** 运行 5 个测试面板。如果测试批次的 Cpk > 1.33，则可以恢复生产。

---

## Cpk 的计算位置 — 5 个独立的实现

这个公式被**在 5 个地方独立重新实现**，而不是通过一个函数或视图共享。人工审查确认它们是一致的，但在结构上没有任何机制可以防止下次有人修改其中一个而未修改其余几个时，一个公式默默地偏离其他公式：

1. `monitoring/grafana/dashboards/manufacturing/ims-ldi-machine-snapshot.json` — 面板 9 ("Worst Cpk")
2. `monitoring/grafana/dashboards/manufacturing/ims-ldi-manufacturing.json` — 面板 17 ("Avg Cpk Fleet")
3. `monitoring/grafana/dashboards/manufacturing/ims-ldi-engineering-analytics.json` — 面板 10 ("Machine Capability Ranking")
4. `public.v_machine_spc_fleet` — 物化视图 (迁移 064，通过 TimescaleDB 的后台作业调度程序每 60 秒刷新一次)，24 小时滚动窗口 (`"time" > NOW() - INTERVAL '24 hours'`)
5. `public.v_machine_spc_ranking` — 普通视图 (迁移 027/032/041/048/059)，非物化

## golden-dataset 回归门禁 — 当前边界

`tests/e2e/golden-dataset-spc.js` 在一个始终会回滚的事务内部插入了一个小型的合成 PE/JE 数据集（手动计算了平均值/西格玛/Cpk，在实际仪表板中不可见的保留 `eqp_id` 下），并断言上述所有 5 个实现都会产生完全相同的、教科书般正确的 Cpk。

> [!WARNING]
> **已在实时环境中验证的状态 (2026-08-10): 7 个断言中有 5 个通过；2 个失败。**
> 这两个失败专门针对 `v_machine_spc_fleet`。
>
> - **根本原因:** 迁移 064 将该视图从普通视图转换为了**物化视图**。物化视图是一个物理上独立存储的快照——它无法看到在测试自己的未提交事务内插入的行。
> - **影响:** 自从迁移 064 发布以来，golden-dataset 门禁就一直无法验证 `v_machine_spc_fleet` 的 Cpk 公式。其他 3 个仪表板面板实现和 `v_machine_spc_ranking` 仍然通过。
> - **解决方案:** 这是一个已记录的测试覆盖边界。要解决它，需要要么豁免物化视图检查，要么将测试重构为在断言之前执行 `REFRESH MATERIALIZED VIEW`。

## 阅读 SPC 仪表板

- **操作员安灯看板 (Operator Andon Board)** — 没有 SPC 细节，只有状态（出于设计考量 — 车间操作员需要一目了然的状态，而不是统计数据）。
- **LDI 机器快照 (LDI Machine Snapshot)** — 每台机器的 Worst Cpk，PE1-6/JE1-4 原始值，控制图。
- **LDI 制造 (指挥中心) (LDI Manufacturing)** — 全车间 (fleet-wide) 平均 Cpk，KPI 条。
- **LDI 工程分析与 SPC (LDI Engineering Analytics & SPC)** — 深度分析：机器能力排名（所有机器并排比较），箱形图，控制图（基于 ECharts，从原生 Grafana 面板转换而来，具有更丰富的交互性）。

## 相关文档

- `docs/architecture/LDI_RCA_GUIDE.md` — 规格外的 SPC 偏差与报警事件的相关性。
- `docs/architecture/ARCHITECTURE.md` — Cpk 逻辑如何融入系统边界。
- `tests/e2e/golden-dataset-spc.js` — 回归门禁的实际源代码。
- `docs/operations/LDI_VALIDATION_PROTOCOL.md` — 生产签核程序，包括也覆盖了 SPC 面板的仪表板/模式 (schema) 检查器 (linters)。

---

[⬅️ 返回 IMS 平台手册](IMS_PLATFORM_BOOK.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> 主代码库](../../README.md)
