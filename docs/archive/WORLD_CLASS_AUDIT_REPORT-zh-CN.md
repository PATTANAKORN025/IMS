<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# LDI Dashboards — World-Class Production Audit Report

> **ARCHIVED — historical snapshot, dated 2026-08-04.** 不是活动文档；下面的数据（仪表板数量、迁移数量、面板数量等）反映的是该日期的系统状态，且已知相对于当前系统已过时。根据 docs/archive/README.md 的规定保留以作历史记录。有关当前信息，请参阅 docs/architecture/ARCHITECTURE.md 和 docs/architecture/DASHBOARD_INVENTORY.md。

**Date:** 2026-08-04
**Standard:** Grafana 13.1.1
**Scope:** 所有 5 个 LDI 仪表板 — Manufacturing Command Center（30 个面板），Operator Andon Board（10 个面板），Engineering Analytics & SPC（13 个面板），Machine Snapshot（14 个面板），Data Readiness & Integration Gaps（13 个面板）。共 80 个面板。

本报告记录了针对强制性目标的全面审计：移除未使用的元素、3 种分辨率下的布局完整性、全车间 KPI 可见性、PE+JE 质量评分、每个面板的 SQL 正确性、RCA 正确性、锁定的颜色系统、排版/单位，以及最终验证（linter + 自动回归测试 + 性能基准测试）。

---

## 1. Summary of bugs found and fixed

| #   | Area                              | Dashboard(s)                                                                                                                                | Bug                                                                                                                                                                                                                                                                                                                                                                         | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Commit               |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| 1   | Unused element                    | Manufacturing                                                                                                                               | 多余的 "FLEET KPI — 24h Rolling Window" 标记面板（id 8888）被插入到 y=1，与 PRODUCTION 行标题重叠；其下的每个面板向下移动了 1 个额外的网格单位；重新引入了 2 种非调色板颜色（`#EF4444`, `#F59E0B`）                                                                                                                                                                         | 删除了该面板，从上次验证的布局中恢复了已知正常的 y 位置，多余颜色恢复为 `#FF003C`/`#FF9100`                                                                                                                                                                                                                                                                                                                                                                              | `7a0b7d4`            |
| 2   | Color semantics                   | 所有 5 个仪表板                                                                                                                             | "OK/healthy" 和 "informational readout" 都映射到了相同的青色（`#00F2FE`），因此健康状态和中性读数在视觉上无法区分；`NO_DATA` 使用了与已确认严重警报相同的红色，导致报告间隙看起来与真实警报完全相同                                                                                                                                                                         | 严格锁定为 5 种颜色配置（`../architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1a）：`ok`=`#22c55e`，`warning`=`#FF9100`，`critical`=`#FF003C`，`info`=`#00F2FE`，`no_data`=`#6B7280`。将 24 个 "OK" 映射条目（字面键和数字键严重性映射形式）从青色修复为绿色；将 Andon 的机器磁贴 `NO_DATA` 红色修复为灰色；向 18 个 `noValue:"NO_DATA"` 文本没有匹配颜色规则的 stat/gauge/bargauge 面板添加了明确的 `type:"special"` 空值映射 | `3cf33d1`            |
| 3   | Drifted vocabulary                | Manufacturing                                                                                                                               | 9 个状态面板的 `noValue` 文本偏离为特定的字符串（"NO PRODUCTION", "NO STATUS", "NO TELEMETRY", "NO DATA"），而不是强制规定的 `NO_DATA`                                                                                                                                                                                                                                      | 将所有 9 个面板恢复为 `"NO_DATA"`，与 OK/IDLE/NO_DATA 词汇规定保持一致                                                                                                                                                                                                                                                                                                                                                                                                   | `3cf33d1`            |
| 4   | KPI completeness                  | Machine Snapshot                                                                                                                            | 过程能力（Process capability）分为**两个独立的面板** — "Process Capability from PE Samples" 和 "Process Capability from JE Samples" — 每个面板仅对两个质量信号之一进行评分。没有综合的 **Worst Cpk = LEAST(PE, JE)**，没有由样本数驱动的 Confidence 列。与全车间范围内已使用的 `v_machine_spc_fleet` 模式（迁移 042）不一致                                               | 将两个面板合并为一个表格：`Cpk (PE)`、`Cpk (JE)`、`Worst Cpk = LEAST(cpk_pe, cpk_je)`、`N (Worst)` 和 `Confidence`（`OK` / `LOW SAMPLE (n<30)` / `NO_DATA`）                                                                                                                                                                                                                                                                                                               | `8c49166`            |
| 5   | Layout inefficiency               | Machine Snapshot                                                                                                                            | "Raw Timestamp (precise)" 状态面板占用了一个 12×10 的网格单元（仪表板宽度的一半，高度为 10 行）来显示一个时间戳值                                                                                                                                                                                                                                                           | 调整为 6×5 大小；通过向上移动 Alarm Context 和 Event Timeline 面板来闭合间隙，总共释放了 5 行（仪表板高度从 70 缩小至 65 个单位）                                                                                                                                                                                                                                                                                                                                        | `8c49166`            |
| 6   | Color semantics (numeric null)    | Machine Snapshot, Engineering Analytics                                                                                                     | `Cpk (PE)` / `Cpk (JE)` / `Worst Cpk` 列使用 `color.mode: thresholds` 配合基准阈值 `{color: red, value: null}`。如果某台机器指标的样本数为**零**（这是一个合理的“无数据”情况，而不是质量故障），会渲染出**红色**背景 —— 在视觉上无法与确诊的不良 Cpk 区分。                                                                                                               | 向两个仪表板中的所有三个列添加了明确的 `type:"special"` 空值安全映射（灰色，"N/A"），使真正丢失的数据显示为灰色而不是红色。                                                                                                                                                                                                                                                                                                                                              | `8c49166`, `a5e929d` |
| 7   | Color semantics (Confidence)      | Engineering Analytics (Machine Capability Ranking, Alarm↔Process Correlation, Top Correlated Alarms), Manufacturing (Top Correlated Alarms) | `Confidence = "LOW SAMPLE (n<30)"` 在 2 个仪表板的 3 个面板中被映射为**严重红色**（`#FF003C`）。较低的样本数是对结果的警示条件，而不是已确认的坏结果 —— 就像设计系统中的所有其他低置信度指标一样，它应该使用警告/琥珀色配置。                                                                                                                                             | 在所有 3 个面板中，将 `LOW SAMPLE (n<30)` 的颜色从红色更改为琥珀色（`#FF9100`）。                                                                                                                                                                                                                                                                                                                                                                                        | `a5e929d`            |
| 8   | Color semantics (missing mapping) | Engineering Analytics (Machine Capability Ranking)                                                                                          | 该面板的 SQL 为 PE 样本数和 JE 样本数均为零的机器输出 `Confidence = 'NO_DATA'`，但值映射表仅定义了 `OK` 和 `LOW SAMPLE (n<30)`。`NO_DATA` 行落入了面板默认的阈值颜色（绿色） —— **未报告任何数据的机器被显示为“正常”。**                                                                                                                                                  | 添加了缺失的 `NO_DATA → 灰色` 映射。                                                                                                                                                                                                                                                                                                                                                                                                                                     | `a5e929d`            |

---

## 2. Verified correct — no changes needed

这些强制性目标区域已进行了审计，并在本会话的先前工作中被确认为已经符合要求；不需要进一步更改。

- **Full-fleet KPI visibility (10 devices, OK/IDLE/NO_DATA):** Manufacturing 和 Andon 仪表板都通过 `LEFT JOIN` 联合了 `public.devices` 表（这是来自迁移 042 的 `v_machine_spc_fleet` 模式），因此所有 10 台已注册的 LDI 机器总是被渲染成对应的行或磁贴，同时具备正确的 OK/IDLE/NO_DATA 状态解析。已通过实时截图验证（在真实的报告间隙期间，8 个磁贴显示正常，2 个显示 NO_DATA）。
- **RCA panel correctness (both RCA panels, Manufacturing + Engineering Analytics):** 分类（通过 `v_ldi_alarm_category`，迁移 036）、基准比较、Lift（报警窗口百分比 ÷ 基准百分比）、事件/样本计数，以及置信度（Confidence），都可基于真实的 5 位数报警代码和拆分后的标志 `v_ldi_alarm_context`（迁移 045）正确计算得出。
- **Per-panel SQL discipline:** 每一个具备时间范围作用域的面板都使用了 `$__timeFilter` 宏；CAGG（连续聚合）层级严格遵守文档中说明的契约（`ldi_data_1m` 用于 ≤6h 的范围，`ldi_data_15m` 用于 6h–2d 的范围，`ldi_data_1h` 用于 >2d 的范围，原始 `ldi_data` 仅用于最新值的查找）；没有任何重复的/字节级一致的查询；代码中唯一硬编码的日期字面量（`'2000-01-01'`）是 `date_bin()` 期望的合法起始点参数，且始终与 `$__timeFilter` 成对使用，并非被当做过滤边界。
- **Data Readiness dashboard:** 它被有意设计为全表扫描类型（旨在进行全局数据质量/映射间隙的诊断，并非作为实时生产视图使用）—— 它的所有查询都被明确标记了 `NO_TIMEFILTER_INTENTIONAL` 注释，该查询预算检测器（linter）可以识别出此文档记录的豁免模式。页面布局为整洁顺序的 24 列网格系统，在 3 种目标分辨率的显示中皆不存在间隙或重叠；排版字体、单位、小数位和阈值都已配置正确（年限指标按小时计算，覆盖/匹配率按百分比计算，并统一映射了代表 NO_DATA 的灰色）。
- **Typography/units/decimals/axis:** 抽查了 Machine Snapshot 仪表板的传感器统计数值及 PE/JE 结果表 —— 诸如 °C, %RH, kPa, mm/s, mm, mJ/cm², µm 均使用了正确的 Grafana 单位 ID 并在合理范围内保留了小数精度（1-3 位），与真实的 LDI 传感器分辨率相符。
- **Andon at 1280×720:** 通过下文提到的自动回归测试得以确认，界面可以完全渲染展示，不需要滚动也未出现内容溢出。

---

## 3. Final verification results

### 3.1 Linters

```text
Query Budget Linter:      0 errors, 0 warnings — PASS
Dashboard Linter:         0 errors, 21 warnings — PASS（这些警告是代码库中早先
                           存在的非标准面板高度引起的，并非此次审计引入的；除了
                           之前就已经存在的 Event Timeline h=14 外，LDI 的
                           5 个仪表板中没有此类问题）
```

### 3.2 Responsive/structural regression (`tests/playwright/ldi-responsive-regression.js`)

所有 5 个 LDI 仪表板在 3 种分辨率（1280×720，1920×1080，3840×2160）下的 15/15 项测试全部通过：0 个面板错误，0 个意外的“No data”面板，Andon 仪表板在 1280×720 分辨率下溢出量为 0（测得的余量为 -16px，这意味着界面完全能放入屏幕中，并且还有多余空间）。

### 3.3 Query benchmark (67 panels, realistic literal-substituted variables)

```text
n    = 67
min  = 0.1 ms
max  = 174.6 ms
P95  = 97.6 ms   (target: < 100 ms — met)
```

有 3 个面板的查询耗时超出了 100ms，它们都在此前被确认并作出了解释：

- `ims-ldi-machine-snapshot_p4` (102.7ms, "air_vacuum" 的最新统计值) — 基准测试工具引起的情况：离线测试期间使用的字面量替换（`log_id = '__auto__'` 被解析为 `NULL`）迫使系统执行了一次全表扫描并确定了该查询毫无结果返回；实时的仪表板能够把 `log_id` 解析为一个真实值，并且能够在远低于 100ms 的时间内返回数据（本次审计中抓取了其实时的 `/api/ds/query` 请求予以确认）。
- `ims-ldi-manufacturing_p21` / `ims-ldi-engineering-analytics_p14` ("Top Correlated Alarms", "Alarm↔Process Correlation") — 设计上为了确保统计基线的正确性，它们有意扫描了 24 小时/完整数据集范围的数据（使用了 `NO_TIMEFILTER_INTENTIONAL`），所以这并不是对于查询分层的违规。

---

## 4. Commits (this audit, by topic)

| Commit    | Topic  | Summary                                                                                                                                                |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `7a0b7d4` | layout | 移除了多余的 FLEET KPI 标记面板，恢复了零间隙布局和调色板                                                                                              |
| `3cf33d1` | style  | 在所有 5 个仪表板上锁定 5 令牌（token）颜色系统                                                                                                        |
| `8c49166` | kpi    | Machine Snapshot：合并 PE/JE 的指标以得出 Worst Cpk = LEAST(PE,JE)，新增 Confidence 参数，修复空值的语义配置漏洞，缩小尺寸过大的 Raw Timestamp 面板 |
| `a5e929d` | style  | 修复了 Engineering Analytics 和 Manufacturing 中存在的 Confidence/Cpk 颜色语义错误（LOW SAMPLE 从红改为琥珀色，增加缺失的 NO_DATA 映射规则）          |

不需要进行 SQL 迁移 —— SQL/RCA 审计（§2）确认了底层视图（`v_machine_spc_fleet`、`v_machine_spc_ranking`、`v_ldi_alarm_category`、`v_ldi_alarm_context`）在先前的 036/041/042/045 迁移中已经正确无误。

---

## 5. Design system reference

颜色配置令牌已记录并锁定在 `../architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1a 中：

| Token      | Hex       | Meaning                                                       |
| ---------- | --------- | ------------------------------------------------------------- |
| `ok`       | `#22c55e` | OK / 运行状况良好 / running / PASS / 合格以上的阈值           |
| `warning`  | `#FF9100` | IDLE, 边缘情况，警告阈值，低置信度警示                        |
| `critical` | `#FF003C` | OUT OF SPEC, 严重阈值，已确认的不良状态                       |
| `info`     | `#00F2FE` | 中性的信息读数 —— 不作为状态判定                              |
| `no_data`  | `#6B7280` | 数据报告间隙 —— 明确这与 `critical`（严重状态）并非同一概念   |

在经过审计的 80 个面板中未使用任何其他颜色。
