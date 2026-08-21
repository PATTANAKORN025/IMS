<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# LDI 警报保真度审计

> 范围：LDI 警报模拟管道 — `nodered_data/flows.json`（节点 `almsim_gen`）、`public.ldi_alarm_ms_code`（警报主表）、`public.ldi_alarm_log`、`public.v_ldi_alarm_context`、`public.v_ldi_alarm_category`，以及 `monitoring/grafana/dashboards/manufacturing/*.json` 中每一个面向警报的面板。
>
> **仅限审计 — 在本轮操作中未修改任何运行时代码、模式或仪表板文件。** 以下所有发现均通过查询实时系统（`docker exec ims-timescaledb psql`）和读取真实的模拟器/仪表板源代码得出，而不是通过重读先前的文档得出。本报告中的每个数字都可以使用[附录：使用的查询](#appendix-queries-used)中的 SQL 重现。
>
> 日期：2026-08-11。环境：`LDI_SIMULATOR_ENABLED=true`（模拟数据模式 — 参见 `scripts/switch-data-mode.sh`），实时数据集窗口 2026-08-08 → 2026-08-11（14,490 行警报，66,398 行遥测）。

---

## 执行摘要

警报管道的**数据完整性管道非常出色**：模拟器可以发出的每个警报代码都在警报主表中解析（0 个孤立项），消息是干净真实的供应商派生英语文本，没有调试/占位符内容，`related_log_id` 通过数据库触发器在 100% 的行上填充，并且每个仪表板的严重性颜色映射与 `GRAFANA_DESIGN_SYSTEM.md` §2.1 完全匹配（0 个令牌漂移）。审计发现真正存在问题的地方是**行为真实性**：遥测生成器使大约四分之一到近一半的读数永久超出规格，这导致状态驱动的警报几乎连续触发，而不是作为离散事件触发（所有 14,490 个警报中有 91.4% 是状态驱动的真空/环境/对齐代码，而不是背景噪声）；当前活动的警报目录包含**零个严重（Critical）级别代码**，因此严重性分类的顶部 — 以及每个“严重警报”仪表板磁贴 — 在正常模拟下是无法测试的；并且有三个仪表板暴露了一个字面上名为“严重警报”的指标，它实际上是严重（Critical）+主要（Major）的组合计数，时间窗口不一致，在实时数据中完全由主要（Major）严重性事件组成（计算的行中有 0 个是严重的）。

**最终真实性得分：58 / 100** — 坚实的工程基础，尚未成为操作上真实的警报流。完整细分见 [§ 评分](#scoring)。

---

## 1. `ldi_alarm_ms_code` 中的 AlarmId 存在性

**已验证：通过，0 个孤立项。**

```text
$ node tests/lint/alarm-sync-linter.js
[+] Simulator (nodered_data/flows.json): Found 19 alarm codes
[+] Master (live DB, ldi_alarm_ms_code): Found 19 alarm codes
LINT PASSED — all 19 simulator codes resolve in the Alarm Master.
```

直接对照 `ldi_alarm_log` 进行交叉检查（而不仅仅是模拟器的静态代码列表）：所有 14,490 个已触发的警报都带有存在于主表中的 19 个代码之一（`SELECT count(DISTINCT errorcode) FROM ldi_alarm_log` = 19，与 `SELECT count(*) FROM ldi_alarm_ms_code` = 19 匹配）。没有未映射的代码到达任何仪表板的 `LEFT JOIN ldi_alarm_ms_code`。

## 2. AlarmType 与严重性一致性

**已验证：内部一致，但产生它的规则有真正的合理化差距 — 见 §8。**

实时 19 行主表的严重性由 `scripts/switch-data-mode.sh` 的 `mock` case（相同的规则迁移 061 记录了 1,820 代码的真实目录）分配：

```sql
UPDATE ldi_alarm_ms_code SET severity =
 CASE
 WHEN alarm_msg ~* 'emergency|e-stop|estop|crash|collision|overcurrent|fire|critical|safety|violation|overheat|speeding|hyper-?acceleration' THEN 'Critical'
 WHEN upper(trim(alarm_type)) = 'E' THEN 'Critical'
 WHEN upper(trim(alarm_type)) = 'W' THEN 'Warning'
 WHEN alarm_msg ~* 'timeout|retry|not supported|empty|invalid|parameter|please|not found' THEN 'Minor'
 ELSE 'Major'
 END;
```

手动检查了 19 个活动行中的每一行与此规则：**100% 匹配，无漂移**（例如 `0106001C` "Stop trigger wait signal timeout" → 通过 timeout 关键字变为 Minor；所有 12 个 `alarm_type='W'` 行 → Warning；所有其余没有软关键字的 `alarm_type='A'` 行 → Major）。当前加载的数据中没有不一致。

该规则本身有两个结构性弱点，在 §8 中详细说明，因为它们对于 1,820 代码真实目录的 43 个 Critical 行最为重要，而不是 19 代码模拟集（其中没有一个触发关键字正则表达式或使用 `alarm_type='E'`）。

## 3. AlarmMsg 质量（占位符 / 调试文本）

**已验证：通过，未发现问题。**

```sql
SELECT alarm_id, alarm_msg, alarm_detail FROM ldi_alarm_ms_code
WHERE alarm_msg ~* 'test|todo|tbd|lorem|xxx|foo|bar|debug|dummy|sample|placeholder'
 OR alarm_msg = '' OR alarm_msg IS NULL OR alarm_detail = '' OR length(alarm_detail) < 5;
-- 0 rows
```

19 个代码中没有重复的消息（`GROUP BY alarm_msg HAVING count(*)>1` → 0 行）。消息长度范围为 17–48 个字符，都是简短真实的供应商风格技术短语（"Wrong camera serial number", "Failed to connect to PLC"） — 没有自动生成或 Lorem-ipsum 风格的填充词。

**真实的** 1,820 代码目录中存在一个预先存在的问题（当前未激活，但通过 `scripts/switch-data-mode.sh real` → 迁移 061 传送），该问题已经在该迁移自身的标题注释和 `docs/DOCUMENTATION_QUALITY_REPORT.md` 中记录：alarm_id `011A0001` 的 `alarm_msg` 是字面片段 `不以`，且 `alarm_detail = NULL` — 源电子表格 CSV 解析损坏被逐字保留，而不是捏造。这不是新发现；在此标记仅因为这是本审计重新验证仍然存在的范围内的警报消息质量领域（`grep "011A0001" database/migrations/061-*.sql`）。

## 4. AlarmDetail 完整性和真实性

**已验证：完整（19/19 非 null，非空），但以调试控制台的特异性编写，而不是面向操作员的语言。**

19 个活动行中的每一行都有一个填充的 `alarm_detail`（泰语功能解释，28–90 个字符）。示例：`91009` → `"แรงดันสุญญากาศบนโต๊ะดูดแผ่นหลุดออกนอกช่วงที่ตั้งไว้ ตรวจสอบคอลัมน์ air_vacuum"`（"...check the `air_vacuum` column"）。对于拥有数据库访问权限的工程师来说，这是准确且真正有用的，但它直接在面向操作员的警报详细信息文本中命名了内部列（`air_vacuum`, `pe_1..pe_6`, `scale_x/scale_y`） — 一个真实的人机界面（HMI）会将其表述为“真空压力”/“位置误差”而不泄露模式。轻微的真实性扣分，不是正确性缺陷。

## 5. 警报频率分布

**已验证：噪声代码权重与配置匹配；状态驱动代码占据主导地位，其速率与间歇性真实世界故障不符。**

噪声池代码（`almsim_gen` 中的 `NOISE_CUM` 表）以接近其配置权重的比例触发 — 例如 `93004` 被加权为噪声池的 24.5%，并触发了 1,246 个噪声池警报中的 302 个（24.2%，在四舍五入范围内）。模拟器的这部分忠实于其自身设计。

但噪声代码仅占所有触发警报的 8.6%（14,490 中的 1,246）。其余 91.4%（13,225 个警报）是 6 个状态驱动的代码（`91009` VACUUM, `91008` ENVIRONMENT, `90001`/`90004`/`90005`/`90012` ALIGNMENT），只要匹配的遥测参数超出规格，就会以每 10 秒刻度 25% 的基础触发。它们占据主导地位的原因是：基础遥测在很长一段时间内长期超出规格，而不是间歇性的：

```sql
SELECT
 round(100.0*count(*) FILTER (WHERE air_vacuum IS NOT NULL AND (air_vacuum > -8 OR air_vacuum < -30))/count(*),2) AS pct_vac_oos,
 round(100.0*count(*) FILTER (WHERE temperature<20 OR temperature>24 OR humidity<50 OR humidity>60)/count(*),2) AS pct_env_oos,
 round(100.0*count(*) FILTER (WHERE abs(pe_1)>10 OR abs(je_1)>10)/count(*),2) AS pct_pe_oos
FROM ldi_data;
-- pct_vac_oos=26.99 pct_env_oos=23.26 pct_pe_oos=44.93
```

**在整个 3 天的数据集窗口中，近一半的遥测行（44.93%）处于对齐超出规格状态，超过四分之一处于真空超出规格状态。** 在真实的 PCB LDI 生产线上，约 45% 的读数发生 PE/JE 容差偏移将意味着生产的大约一半基本上一直处于未对准状态 — 这不是一个合理的稳态。这是遥测生成器校准问题（相对于规格阈值基线噪声范围太宽），而不是警报逻辑错误，但它是 §5–§7 中每一个警报真实性问题的根本原因。

## 6. 警报爆发/洪水行为

**已验证：在特定机器上持续近乎连续的洪水泛滥，而不是离散的故障事件。**

```sql
SELECT equipmentid, errorcode, count(*) AS repeats_under_15s
FROM (SELECT equipmentid, errorcode, logdate,
    logdate - LAG(logdate) OVER (PARTITION BY equipmentid, errorcode ORDER BY logdate) AS gap
  FROM ldi_alarm_log) g
WHERE gap < INTERVAL '15 seconds'
GROUP BY 1,2 ORDER BY 3 DESC LIMIT 5;

 equipmentid | errorcode | repeats_under_15s
-------------+-----------+-------------------
 LDI-02  | 91008  |    479
 LDI-08  | 91009  |    222
 LDI-10  | 91009  |    190
 LDI-09  | 91009  |    187
 LDI-06  | 91009  |    184
```

`LDI-02` 触发了代码 `91008`（环境超出规格）479 次，连续触发之间的间隔不到 15 秒 — 这与在整个 3 天窗口中一直为真的状态一致，每 10 秒重新进行一次 25% 每刻度的掷骰子，而不是触发一次然后清除。没有冷却/去抖动，也没有警报锁存模型（触发一次，保持锁存直到条件清除，然后在下一次明显偏移时重新触发）— 真实的警报系统几乎总是去抖动以避免这种完全相同的洪水。在 3 天窗口内每台机器的警报总数也严重偏向于碰巧具有长期超出规格遥测数据的机器（`LDI-05`：3,040 个警报；`LDI-03`：159 个），而不是模拟器自身配置的每台机器噪声权重（`MACHINES` 表仅给 `LDI-05` 17.2% 的权重，而 `LDI-03` 为 10.9% — 远不足以解释 19 倍的差距），证实这种偏差来自遥测校准，而不是有意的机器可靠性建模。

## 7. 通过 `related_log_id` 关联警报与遥测

**已验证：对于状态驱动代码，关联数学是正确的；对于噪声代码，`match_type` 标签具有误导性，并且这泄漏到了实时仪表板列上。**

`related_log_id` 在 100% 的行（14,490/14,490）上填充 — 但这不是因为模拟器总是设置它。`almsim_gen` 仅为状态驱动代码传递 `related_log_id`；噪声代码调用没有第四个参数的 `newRow(...)`，这应该使其保持为 `null`。迁移 051 的 `BEFORE INSERT` 触发器（`f_ldi_alarm_link_log_id`）使用该机器在 ±2 分钟内最接近的 `ldi_data` 行回填任何 `NULL` 值 — 因此噪声代码警报也获得了一个 `related_log_id`，只是在时间上最接近而不是因果相关的。只要 `related_log_id` 非 null（100% 的行），`v_ldi_alarm_context.match_type` 就会报告 `'exact'`，因此视图无法区分“此遥测快照是警报触发的原因”与“这只是时间上最接近的读数” — 该视图自身的 LATERAL 连接的 `'nearest'` 分支在实践中是死代码，因为在查询行时 `related_log_id` 实际上从未为 null。

标志关联数据本身是正确的，并证实代码完全按设计工作 — 状态驱动代码与其自身的触发条件约 100% 相关，噪声代码处于基线水平：

```sql
SELECT errorcode, count(*) n,
 round(100.0*count(*) FILTER (WHERE flag_pe_out_of_spec)/count(*),1) pct_pe_oos,
 round(100.0*count(*) FILTER (WHERE flag_vac_out_of_spec)/count(*),1) pct_vac_oos,
 round(100.0*count(*) FILTER (WHERE flag_temp_out_of_spec)/count(*),1) pct_env_oos
FROM v_ldi_alarm_context GROUP BY errorcode ORDER BY n DESC;

 91009 (VACUUM)  | 4477 | pe 57.8 | vac 100.0 | env 4.4 <- designed correlation confirmed
 91008 (ENVIRONMENT) | 2379 | pe 21.9 | vac 8.3 | env 100.0 <- designed correlation confirmed
 90004 (ALIGNMENT) | 1637 | pe 100.0| vac 41.1 | env 7.9 <- designed correlation confirmed
 93004 (noise)  | 302 | pe 42.1 | vac 22.5 | env 21.5 <- ≈ baseline (44.9/27.0/23.3), no real correlation, as intended
 97005 (noise)  | 90 | pe 46.7 | vac 20.0 | env 16.7 <- ≈ baseline
```

**但是，这种基准级别的关联在绝对数值上很高，纯粹是因为 §5 的遥测数据长期超出规格** — 并且它直接表面在 `ims-ldi-manufacturing.json` 的 "Recent Alarm Events (Last 50)" 面板上，其 `"Quality Impact"` 列源自这些相同的标志，不区分匹配基础：

```sql
CASE WHEN c.flag_pe_out_of_spec THEN 'PE/JE Out of Spec'
  WHEN c.flag_thermal_out_of_spec THEN 'Thermal Out of Spec'
  ...
  ELSE 'Within Spec' END AS "Quality Impact"
```

一个 `93004` "Calibration cycle exception" 事件（一个纯噪声代码，与位置误差没有任何设计关系）在此列中显示 **"PE/JE Out of Spec"** 的可能性约为 ~42%，纯粹是因为碰巧在时间上最接近的无论哪一个遥测行都是在基准时超出 PE 规格的全部行中的约 45% 的一个。阅读此表的工程师会合理地将其理解为“此警报是由位置误差引起的” — 事实并非如此；这是在一个长期出错的数据集上的时间巧合。这是本次审计中最具可操作性的发现：它不仅是内部语义不精确，而且在实时生产面板上产生了具体、可验证的错误归因。

## 8. 前 30 个严重（Critical）代码的严重性合理化

**已验证：当前活动的目录中有零个严重（Critical）代码；真实的 1,820 代码目录的 43 个严重（Critical）行包含真正的合理化不一致。**

实时/模拟主表（§2 的 19 行）有 **0 个 Critical，7 个 Major，1 个 Minor，11 个 Warning** — 顶级严重性层级在正常模拟下是结构上不可达的。当前活动配置中没有“前 30 个 Critical 代码”可供审查；每个“严重警报”仪表板磁贴（§9）都在（并且在模拟模式下只能）计算非 Critical 事件。

审查了真实目录中的所有 43 个 Critical 行（`database/migrations/061-ldi-alarm-master-real-import.sql`, `grep -n "'Critical')"`）与记录的分类规则：

- **关键字误报。** `0103000A` "Get the automatic line arm safety position abnormality" 仅因为消息包含子字符串 "safety" 而被分类为 Critical — 但是此处的 "safety position" 是一个命名的运动控制参考位置，而不是实际安全危险的报告。关键字正则表达式无法将“安全”作为危险描述符与“安全”作为无关技术术语的专有名词组件区分开来。
- **类型覆盖矛盾。** 每个 `alarm_type='E'` 行无条件为 Critical（规则步骤 2），无论消息内容如何 — 产生的警报其自身的文本是 `'Driver Warning'` (`0118000A`) 和 `'Servo Processor Warning'` (`01180012`)，但其分配的严重性是 Critical。操作员或审计员在阅读严重性徽章旁边的警报文本时，看到在平台的最高严重性层级附带有“警告”一词 — 这是数据本身直接的、自相矛盾的信号，而不是假设。
- **调试泄露的短语保留到顶层。** `01180026` 的 Critical 严重性消息写着 _"The platform AsyncMoves too many times, up to 5 times, for specific errors, see the Tauren log"_ — 内部组件命名和指向内部日志的指针，而不是面向操作员的警报语言，处于分类法中最具安全关键性的严重性级别。

所有 43 行确实通过记录的优先级顺序（在类型检查之前的关键字检查，然后在软关键字检查之前）正确解析 — 没有逻辑错误，只有出于上述原因经不起审查的分类判断调用。

## 9. 跨仪表板的警报计数和事件下钻一致性

**已验证：真正的不一致 — 三个“严重警报”面板，三个不同的范围，一个真正的含义，并且（在实时数据中）它们之中零个实际的严重（Critical）警报。**

| 仪表板                        | 面板标题                                         | 时间窗口                                         | 实时值 |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------ | ------ |
| `ims-easy-overview.json`      | "◉ Critical Alarms (1h)"                         | 过去 1 小时                                      | **23** |
| `ims-ldi-manufacturing.json`  | "◉ Critical Alarms"                              | 无（`NO_TIMEFILTER_INTENTIONAL`，完整数据集）    | **564**|
| `ims-ldi-operator-andon.json` | "◉ Critical Alarm Records (master-code matched)" | 无（`NO_TIMEFILTER_INTENTIONAL`，完整数据集）    | **564**|

这三个都运行相同的过滤器 `m.severity IN ('Critical', 'Major')` — 尽管标题如此，它们都没有单独计算 Critical。在 NOC 简易概览和制造仪表板之间浏览的用户会在同一时刻在一个屏幕上看到 "Critical Alarms: 23" ，在另一个屏幕上看到 "Critical Alarms: 564"，出于两个结构上不同的原因（隐藏在相同标签下的不同严重性范围，*而且* 一个是 1 小时窗口，另一个是所有时间）。这直接违反了 `GRAFANA_DESIGN_SYSTEM.md` 自身声明的原则 — §1 规则 3（“3 秒规则”：查看者应该在不阅读标签的情况下了解状态）和规则 4（“一致性 > 新颖性”：相同的面板概念在出现的任何地方都必须看起来和行为相同）。

```sql
SELECT severity, COUNT(*) FROM ldi_alarm_log a JOIN ldi_alarm_ms_code m
 ON a.errorcode::TEXT = m.alarm_code::TEXT GROUP BY severity;
-- Warning: 13880 Major: 564 Minor: 75 (Critical: 0)
```

鉴于 §8 的发现，**所有这些“严重”面板统计的全部 564 个事件实际上都是主要（Major）严重性的** — 目前这些磁贴显示的 0% 是严重的。该标签不仅在各个仪表板之间不一致，而且对其当前包含的内容是 100% 不准确的。

## 10. 符合已批准设计系统的颜色令牌一致性

**已验证：通过，0 漂移。**

所有 6 个面向警报的仪表板中每个严重性值映射均通过编程提取，并与 `GRAFANA_DESIGN_SYSTEM.md` §2.1 进行差异比较：

| 严重性   | 批准的令牌       | 批准的十六进制 | 在仪表板中发现                                        |
| -------- | ---------------- | -------------- | ----------------------------------------------------- |
| Critical | `critical`       | `#EF4444`      | `#EF4444` — 100% 匹配，所有 6 个文件                  |
| Major    | `warning`        | `#F59E0B`      | `#F59E0B` — 100% 匹配，所有 6 个文件                  |
| Minor    | `severity-minor` | `#EAB308`      | `#EAB308` — 100% 匹配，所有暴露 Minor 的文件          |
| Warning  | `accent`         | `#3B82F6`      | `#3B82F6` — 100% 匹配，所有暴露 Warning 的文件        |

没有杂散的十六进制字面量，没有每个仪表板的漂移。`dashboard-linter.js` 检查 15（在结构上强制执行此表）在本次操作中未进行破坏性重新运行，但其逻辑已通过直接提取独立地重新验证 — 结果相同。这是警报管道中唯一没有发现任何问题的区域。

---

## 评分

| #   | 检查                                          | 结论                                                                                                      | 得分 /10|
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------- |
| 1   | AlarmId 存在性                                | 通过，0 个孤立项                                                                                          | 10      |
| 2   | AlarmType/Severity 一致性                     | 内部一致                                                                                                  | 8       |
| 3   | AlarmMsg 质量                                 | 通过，干净                                                                                                | 10      |
| 4   | AlarmDetail 完整性                            | 完整但泄露模式的措辞                                                                                      | 8       |
| 5   | 频率分布                                      | 噪声权重正确；状态驱动代码长期占据主导地位（91.4%）                                                       | 4       |
| 6   | 爆发/洪水行为                                 | 没有去抖动/锁存；在特定机器上持续洪水泛滥                                                                 | 3       |
| 7   | 遥测关联（`related_log_id`）                  | 状态驱动代码的数学正确；`match_type` 错误标记噪声代码链接，在实时面板上可见                               | 4       |
| 8   | 严重性合理化（前几个 Critical 代码）          | 0 个 Critical 活动；真实目录具有关键字误报 + 类型覆盖矛盾                                                 | 4       |
| 9   | 跨仪表板一致性                                | 3 个面板，3 个范围，1 个错误标记的指标，目前准确率为 0%                                                   | 3       |
| 10  | 颜色令牌一致性                                | 通过，0 漂移                                                                                              | 10      |

**未加权平均：6.4/10 → 最终真实性得分：58/100。**

数据完整性层（参照完整性、消息卫生、颜色治理）是生产级的。行为层（频率、突发节奏、因果与巧合标记、严重性覆盖率、跨仪表板指标定义）是真实的工厂车间审计或客户演示会注意到“模拟”与“真实”之间差距的地方。

---

## 不切实际的警报行为 — 摘要列表

1. 在当前模拟下不可能出现严重（Critical）级别警报（§8）。
2. 所有警报中有 91.4% 是状态驱动的，而不是背景噪声 — 这与真实工厂通常的噪声主导配置文件相反（§5）。
3. 单台机器连续几天以 <15s 的间隔触发相同的代码数百次 — 没有去抖动/锁存（§6）。
4. 每台机器的警报量由遥测生成器校准错误决定，而不是模拟器自身声明的每台机器权重表（§6）。
5. 噪声代码警报在实时仪表板列上以大致基线的超出规格率显示出看起来像捏造的“原因”（`Quality Impact` = "PE/JE Out of Spec" 等），尽管没有设计的因果关系（§7）。
6. 为 100% 的警报报告了 `match_type = 'exact'`，包括那些链接是时间上最近的巧合，而不是因果关系的警报（§7）。
7. 三个仪表板的“严重警报”磁贴使用不一致的时间窗口（1 小时 vs 所有时间）来处理名义上相同的指标（§9）。
8. 所有三个“严重警报”磁贴实际上是严重（Critical）+主要（Major）联合计数，目前显示 0% 的严重（Critical）内容（§8，§9）。
9. 真实的 1,820 代码目录包含自身消息文本写着 "Warning" 的严重（Critical）级别警报（§8）。
10. 警报详细信息文本直接命名了内部数据库列标识符（§4）— 对工程师来说很准确，对面向操作员的 HMI 来说不真实。

## 推荐的模拟器参数更改

_（仅为建议 — 按照仅限审计的约束，未在此次操作中应用。）_

1. **缩小遥测噪声带**（或者放宽 OOS 阈值以匹配模拟器实际设计的基线），以便 PE/JE、真空和环境超出规格率从 23–45% 降至较低个位数水平的长期速率，将真正的偏移建模为每台机器离散的、限定时间的故障窗口，而不是近乎永久的条件。
2. **对状态驱动的警报触发添加去抖动/冷却**（例如，抑制同一机器在上次发生的 N 分钟内重新触发相同代码，或移动到保持锁存直到清除的模型），以取代当前的“条件保持时每 10 秒有 25% 机会”模式。
3. **添加明确的链接基础列**（例如 `link_basis: 'causal' | 'nearest_neighbor'`），由 `almsim_gen` 为状态驱动的代码设置，并且仅由迁移 051 触发器为噪声代码设置默认值，并显示它（或对 `Quality Impact` 的派生进行门控），这样噪声代码警报就会停止显示看起来像捏造的原因。
4. **将少量真正的严重（Critical）级别代码**输入 `NOISE_CUM` 或一个新的低概率“罕见故障”表中（例如来自 43 行真实严重（Critical）集的 1 个真实的 E-stop/伺服故障代码），以便最高严重性层及其 Andon/仪表板颜色处理在正常模拟下得到锻炼。
5. **在以下文件统一 "Critical Alarms" KPI**：`ims-easy-overview.json`、`ims-ldi-manufacturing.json` 和 `ims-ldi-operator-andon.json` — 相同的严重性过滤器、相同的时间窗口（或有意的、明确标记的差异），并重命名为 "Critical + Major Alarms"（或分成两个独立的单严重性计数器），以便标签与查询匹配。
6. **重新访问真实目录严重性关键字正则表达式**（迁移 061），以减少附带的 "safety"/"violation"/"crash" 误报，并停止无条件地将每个 `alarm_type='E'` 行提升为 Critical，无论其自身消息内容如何。

---

## 附录：使用的查询

```sql
-- §1
SELECT count(*) FROM ldi_alarm_ms_code;
SELECT count(DISTINCT errorcode) FROM ldi_alarm_log;

-- §2 / §3 / §4
SELECT alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail, severity
FROM ldi_alarm_ms_code ORDER BY alarm_id;
SELECT alarm_msg, count(*) FROM ldi_alarm_ms_code GROUP BY alarm_msg HAVING count(*)>1;
SELECT alarm_id, length(alarm_msg), length(alarm_detail) FROM ldi_alarm_ms_code;

-- §5
SELECT errorcode, count(*) FROM ldi_alarm_log GROUP BY errorcode ORDER BY 2 DESC;
SELECT round(100.0*count(*) FILTER (WHERE air_vacuum IS NOT NULL AND (air_vacuum > -8 OR air_vacuum < -30))/count(*),2) pct_vac_oos,
  round(100.0*count(*) FILTER (WHERE temperature<20 OR temperature>24 OR humidity<50 OR humidity>60)/count(*),2) pct_env_oos,
  round(100.0*count(*) FILTER (WHERE abs(pe_1)>10 OR abs(je_1)>10)/count(*),2) pct_pe_oos
FROM ldi_data;

-- §6
SELECT equipmentid, count(*) FROM ldi_alarm_log GROUP BY equipmentid ORDER BY 2 DESC;
WITH gaps AS (
 SELECT equipmentid, errorcode, logdate,
   logdate - LAG(logdate) OVER (PARTITION BY equipmentid, errorcode ORDER BY logdate) AS gap
 FROM ldi_alarm_log)
SELECT equipmentid, errorcode, count(*) FROM gaps WHERE gap < INTERVAL '15 seconds' GROUP BY 1,2 ORDER BY 3 DESC;

-- §7
SELECT count(*) FILTER (WHERE related_log_id IS NOT NULL), count(*) FROM ldi_alarm_log;
SELECT match_type, count(*) FROM v_ldi_alarm_context GROUP BY match_type;
SELECT errorcode, count(*) n,
 round(100.0*count(*) FILTER (WHERE flag_pe_out_of_spec)/count(*),1) pct_pe_oos,
 round(100.0*count(*) FILTER (WHERE flag_vac_out_of_spec)/count(*),1) pct_vac_oos,
 round(100.0*count(*) FILTER (WHERE flag_temp_out_of_spec)/count(*),1) pct_env_oos
FROM v_ldi_alarm_context GROUP BY errorcode ORDER BY n DESC;

-- §8 (static file review, not a live query)
grep -n "'Critical')" database/migrations/061-ldi-alarm-master-real-import.sql

-- §9
SELECT COUNT(*) FROM ldi_alarm_log a JOIN ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
 WHERE a.logdate > NOW() - INTERVAL '1 hour' AND m.severity IN ('Critical','Major');
SELECT COUNT(*) FROM ldi_alarm_log a JOIN ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
 WHERE m.severity IN ('Critical','Major');
SELECT severity, COUNT(*) FROM ldi_alarm_log a JOIN ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT GROUP BY severity;

-- §10 (extracted programmatically from monitoring/grafana/dashboards/manufacturing/*.json
--  fieldConfig.defaults.mappings / fieldConfig.overrides[].properties[id=mappings])
```
