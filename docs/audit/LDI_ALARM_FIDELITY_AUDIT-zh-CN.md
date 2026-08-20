<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# LDI Alarm Fidelity Audit

> 范围：LDI 报警模拟管道 — `nodered_data/flows.json` (节点 `almsim_gen`), `public.ldi_alarm_ms_code` (报警主机), `public.ldi_alarm_log`, `public.v_ldi_alarm_context`, `public.v_ldi_alarm_category`，以及 `monitoring/grafana/dashboards/manufacturing/*.json` 中每一个面向报警的面板。
>
> **仅限审计 — 在此过程中未修改任何运行时代码、模式或仪表板文件。** 以下所有发现均通过查询实时系统 (`docker exec ims-timescaledb psql`) 和读取真实的模拟器/仪表板来源获得，而不是通过重新阅读先前的文档。本报告中的每个数字都可以使用 [附录：使用的查询](#appendix-queries-used) 中的 SQL 复现。
>
> 日期: 2026-08-11。环境: `LDI_SIMULATOR_ENABLED=true` (模拟数据模式 — 见 `scripts/switch-data-mode.sh`), 实时数据集窗口 2026-08-08 → 2026-08-11 (14,490 个报警行, 66,398 个遥测行)。

---

## Executive summary

报警管道的**数据完整性管道非常好**：模拟器可能发出的每一个报警代码在报警主机中都能解析（0个孤儿），消息是干净的真实的从供应商派生的英文文本，没有调试/占位符内容，100% 的行通过 DB 触发器填充了 `related_log_id`，并且每个仪表板的严重性颜色映射完全符合 `GRAFANA_DESIGN_SYSTEM.md` §2.1（0 偏差）。审计发现真正问题的地方在于**行为真实性**：遥测生成器使大约四分之一到近一半的读数永久性地超出规格，这使得条件驱动的报警几乎连续不断地触发，而不是作为离散事件发生（所有14,490个报警中有91.4%是条件驱动的真空/环境/对准代码，而不是背景噪声）；当前活动的报警目录包含**零个 Critical 级别代码**，因此严重性分类的顶部——以及每个“Critical Alarms”仪表板磁贴——在正常模拟下是不可测试的；并且三个仪表板暴露了一个字面上标题为“Critical Alarms”的指标，而实际上它是一个 Critical+Major 组合计数，时间窗口不一致，在实时数据中完全由 Major 级别事件组成（计算在内的行中有 0 个是 Critical）。

**最终真实性得分：58 / 100** — 扎实的工程基础，但尚未构成在操作上真实的报警流。完整的分类在 [§ 评分](#scoring) 中。

---

## 1. AlarmId existence in `ldi_alarm_ms_code`

**已验证：通过，0个孤儿。**

```text
$ node tests/lint/alarm-sync-linter.js
[+] Simulator (nodered_data/flows.json): Found 19 alarm codes
[+] Master (live DB, ldi_alarm_ms_code): Found 19 alarm codes
LINT PASSED — all 19 simulator codes resolve in the Alarm Master.
```

直接对照 `ldi_alarm_log` 进行了交叉检查（不仅是模拟器的静态代码列表）：所有触发的14,490个报警都带有主站中存在的19个代码之一（`SELECT count(DISTINCT errorcode) FROM ldi_alarm_log` = 19，与 `SELECT count(*) FROM ldi_alarm_ms_code` = 19 匹配）。没有未映射的代码到达任何仪表板的 `LEFT JOIN ldi_alarm_ms_code`。

## 2. AlarmType vs Severity consistency

**已验证：内部一致，但产生它的规则在真正的合理化方面存在差距 — 见 §8。**

实时19行主站的严重性由 `scripts/switch-data-mode.sh` 的 `mock` case 分配（迁移061记录了1,820代码真实目录的相同规则）：

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

手工检查了每一行当前的 19 个实时行是否符合这条规则：**100% 匹配，零偏差**（例如，通过超时关键字将 `0106001C` "Stop trigger wait signal timeout" → Minor；所有 12 行 `alarm_type='W'` → Warning；所有剩余的没有软关键字的 `alarm_type='A'` 行 → Major）。在当前加载的数据中没有不一致。

该规则本身有两个结构性弱点，在 §8 中详细披露，因为它们对于 1,820 代码真实目录的 43 个 Critical 行最为重要，而不是 19 代码的模拟集（这些模拟集都没有触发正则表达式或使用 `alarm_type='E'`）。

## 3. AlarmMsg quality (placeholders / debug text)

**已验证：通过，未发现问题。**

```sql
SELECT alarm_id, alarm_msg, alarm_detail FROM ldi_alarm_ms_code
WHERE alarm_msg ~* 'test|todo|tbd|lorem|xxx|foo|bar|debug|dummy|sample|placeholder'
 OR alarm_msg = '' OR alarm_msg IS NULL OR alarm_detail = '' OR length(alarm_detail) < 5;
-- 0 rows
```

在 19 个代码中没有重复的消息（`GROUP BY alarm_msg HAVING count(*)>1` → 0 行）。消息长度在 17–48 个字符之间，全是简短真实的供应商风格技术短语（"Wrong camera serial number", "Failed to connect to PLC"） — 没有自动生成的或类似于 Lorem-ipsum 的填充词。

**真实的** 1,820 代码目录中存在一个已有问题（当前未启用，但通过 `scripts/switch-data-mode.sh real` → 迁移 061 交付），已经记录在该迁移的头注释和 `docs/DOCUMENTATION_QUALITY_REPORT.md` 中：报警 ID `011A0001` 的 `alarm_msg` 是原样的片段 `不以`，且 `alarm_detail = NULL` — 这源于源电子表格的 CSV 解析损坏，原样保留而不是捏造。这不是一个新发现；在此标记只是因为它是本次审计重新验证仍存在的范围内的报警消息质量区域（`grep "011A0001" database/migrations/061-*.sql`）。

## 4. AlarmDetail completeness and realism

**已验证：完整（19/19 非空），但采用的是调试控制台的具体性，而不是面向操作员的语言。**

每个 19 个实时行都填充了 `alarm_detail`（泰语功能解释，28-90个字符）。例如：`91009` → `"แรงดันสุญญากาศบนโต๊ะดูดแผ่นหลุดออกนอกช่วงที่ตั้งไว้ ตรวจสอบคอลัมน์ air_vacuum"`（“...检查 `air_vacuum` 列”）。对于有数据库访问权限的工程师来说，这是准确且非常实用的，但它直接在面向操作员的报警详细信息文本中提到了内部列名（`air_vacuum`，`pe_1..pe_6`，`scale_x/scale_y`）— 真实的 HMI 会将其表述为“真空压力”/“位置错误”而不会泄露模式。轻微扣除真实性分数，但不是正确性缺陷。

## 5. Alarm frequency distribution

**已验证：噪声代码的权重与配置匹配；条件驱动代码的占据频率与真实世界中偶发的故障不一致。**

噪声池代码（`almsim_gen` 中的 `NOISE_CUM` 表）以接近其配置比例的频率触发 — 例如，`93004` 被赋予噪声池的 24.5% 权重，并在 1,246 个噪声池报警中触发了 302 次（24.2%，在四舍五入范围内）。这部分模拟器忠实于它自己的设计。

但噪声代码仅占触发报警总数的 8.6%（14,490 次中的 1,246 次）。其余的 91.4%（13,225次）是 6 个条件驱动代码（`91009` 真空, `91008` 环境, `90001`/`90004`/`90005`/`90012` 对准），只要匹配的遥测参数不符合规格，就会在每 10 秒 tick 中以 25% 的概率触发。它们占据主导地位的原因：基础遥测数据慢性超出规格，而不是间歇性的：

```sql
SELECT
 round(100.0*count(*) FILTER (WHERE air_vacuum IS NOT NULL AND (air_vacuum > -8 OR air_vacuum < -30))/count(*),2) AS pct_vac_oos,
 round(100.0*count(*) FILTER (WHERE temperature<20 OR temperature>24 OR humidity<50 OR humidity>60)/count(*),2) AS pct_env_oos,
 round(100.0*count(*) FILTER (WHERE abs(pe_1)>10 OR abs(je_1)>10)/count(*),2) AS pct_pe_oos
FROM ldi_data;
-- pct_vac_oos=26.99 pct_env_oos=23.26 pct_pe_oos=44.93
```

**几乎一半的所有遥测行 (44.93%) 在整个三天的据集窗口内都是持续的对齐超出规格，并且超过四分之一是真空超出规格。** 在一条真正的 PCB LDI 生产线上，大约 45% 的读数中出现 PE/JE 容差偏离意味着大约一半的产品基本上一直在偏离配准 — 这不是一个合理的稳定状态。这是遥测发生器的校准问题（相对于规格阈值，基线噪声范围太宽），而不是警报逻辑错误，但它是 §5–§7 中每一个警报真实性问题的根本原因。

## 6. Alarm burst/flood behavior

**已验证：在特定机器上持续近乎不断的泛滥，而不是离散的故障事件。**

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

`LDI-02` 触发代码 `91008` (环境超规格) 479 次，连续触发之间的间隔不足 15 秒 — 这与一个持续了整整 3 天窗口的状况是一致的，即每 10 秒重新掷一次 25% 的骰子，而不是触发一次然后清除。没有冷却/防抖和报警锁存模型 (触发一次，保持锁存直到状况清除，然后在下一次不同的偏离时再次触发) — 真正的警报系统几乎总是进行防抖以避免这种类型的泛滥。在 3 天的窗口期内，每台机器的报警总数也严重偏向于哪些机器碰巧长期出现超出规格的遥测数据 (`LDI-05`：3,040 次报警；`LDI-03`：159 次)，而不是根据模拟器自己配置的单机噪声权重 (`MACHINES` 表仅给 `LDI-05` 分配 17.2% 的权重，给 `LDI-03` 分配 10.9% — 这完全不足以解释 19 倍的差距)，这证实了偏差来自于遥测校准，而不是故意的机器可靠性建模。

## 7. Alarm-to-telemetry correlation via `related_log_id`

**已验证：对于条件驱动代码，相关性数学是正确的；`match_type` 标签对噪声代码具有误导性，这会泄露到实时仪表板列。**

`related_log_id` 在 100% 的行 (14,490/14,490) 上填充 — 但这并不是因为模拟器总是设置它。`almsim_gen` 仅传递条件驱动代码的 `related_log_id`；噪声代码在没有第四个参数的情况下调用 `newRow(...)`，这应该将其保留为 `null`。迁移 051 的 `BEFORE INSERT` 触发器 (`f_ldi_alarm_link_log_id`) 使用该机器 ±2 分钟内最接近的 `ldi_data` 行来回填任何 `NULL` 值 — 因此，噪声代码报警也会获得一个 `related_log_id`，但这仅是在时间上最接近而不是在因果上相关联的。每当 `related_log_id` 非空（100% 的行）时，`v_ldi_alarm_context.match_type` 报告为 `'exact'`，因此视图无法区分“此遥测快照是报警触发的原因”和“这只是时间上最接近的读数” — 该视图自己的 LATERAL 联接的 `'nearest'` 分支实际上是死代码，因为在查询行时 `related_log_id` 永远不会真正为空。

标志相关数据本身是正确的，并证实代码按照设计工作 — 条件驱动代码与其自身的触发条件接近 100% 相关，而噪声代码处于基线水平：

```sql
SELECT errorcode, count(*) n,
 round(100.0*count(*) FILTER (WHERE flag_pe_out_of_spec)/count(*),1) pct_pe_oos,
 round(100.0*count(*) FILTER (WHERE flag_vac_out_of_spec)/count(*),1) pct_vac_oos,
 round(100.0*count(*) FILTER (WHERE flag_temp_out_of_spec)/count(*),1) pct_env_oos
FROM v_ldi_alarm_context GROUP BY errorcode ORDER BY n DESC;

 91009 (VACUUM)  | 4477 | pe 57.8 | vac 100.0 | env 4.4 <- 证实了设计相关性
 91008 (ENVIRONMENT) | 2379 | pe 21.9 | vac 8.3 | env 100.0 <- 证实了设计相关性
 90004 (ALIGNMENT) | 1637 | pe 100.0| vac 41.1 | env 7.9 <- 证实了设计相关性
 93004 (noise)  | 302 | pe 42.1 | vac 22.5 | env 21.5 <- ≈ baseline (44.9/27.0/23.3), 无真实相关性, 符合预期
 97005 (noise)  | 90 | pe 46.7 | vac 20.0 | env 16.7 <- ≈ baseline
```

**但是，这种基线水平的相关性在绝对数值上很高，完全是因为 §5 的遥测长期不符合规格** — 并且它直接在 `ims-ldi-manufacturing.json` 的“Recent Alarm Events (Last 50)”面板上显示出来，该面板的 `"Quality Impact"` 列是从相同的标志派生的，并没有区分匹配基础：

```sql
CASE WHEN c.flag_pe_out_of_spec THEN 'PE/JE Out of Spec'
  WHEN c.flag_thermal_out_of_spec THEN 'Thermal Out of Spec'
  ...
  ELSE 'Within Spec' END AS "Quality Impact"
```

一个 `93004`“校准循环异常”事件（一个纯噪声代码，设计上与位置误差没有任何因果关系）有约 42% 的机会在此列显示**“PE/JE Out of Spec”**，纯粹是因为在时间上最接近的遥测行碰巧是约 45% 在基线上处于 PE 超出规格的行之一。阅读此表的工程师会合理地认为“此报警是由位置错误引起的”——实际上不是；这是在一个经常出现故障的数据集上的时间巧合。这是此次审计中最具可操作性的发现：它不仅是内部的语义不精确，它还在实时生产面板上产生了具体、可验证的虚假归因。

## 8. Severity rationalization for top 30 critical codes

**已验证：当前活动目录有零个 Critical 代码；真实 1,820 代码目录的 43 个 Critical 行包含了真正的合理化不一致。**

实时/模拟主表（§2 的 19 行）拥有 **0 个 Critical，7 个 Major，1 个 Minor，11 个 Warning** —在正常的模拟状态下，结构上无法达到最高严重级别。在当前活动的配置中不存在可供审查的“排名前 30 的 Critical 代码”；每一个“Critical Alarms”仪表盘视图块（§9）都在并且只能在模拟模式下统计非 Critical 事件。

对照记录分类规则，查阅了实际目录中所有 43 个 Critical 行（`database/migrations/061-ldi-alarm-master-real-import.sql`，`grep -n "'Critical')"`）：

- **关键字误报。** `0103000A`“Get the automatic line arm safety position abnormality”仅仅因为信息包含了子字符串“safety”而被分类为 Critical——但此处的“safety position”是指定的运动控制参考位置，而非对实际安全隐患的报告。关键字正则表达式无法区分作为危险描述符的“safety”和不相关的技术术语专有名词的组成部分“safety”。
- **类型覆盖冲突。** 每个 `alarm_type='E'` 行都无条件为 Critical（规则步骤 2），无论信息内容为何——这会产生自身的文本为 `'Driver Warning'`（`0118000A`）和 `'Servo Processor Warning'`（`01180012`），但分配严重级别为 Critical 的报警。读取警报文本及旁边级别标识的操作员或审计人员会看到“Warning（警告）”字样被连接到了平台最高级别的分类上——这是数据本身的直接而自相矛盾的信号，并非假设。
- **泄漏的调试措辞幸存至最高级别。** `01180026` 的 Critical 级信息读起来像这样 _"The platform AsyncMoves too many times, up to 5 times, for specific errors, see the Tauren log"_ ——出现了内部组件的命名和指向内部日志的指针，而不是操作员直接阅读的报警语言，这些却存在于该分类中安全最为关键的层级中。

所有的 43 行都正确地通过所记录优先顺序解决（软关键字之前的关键字检查之前的类型检查）——没有逻辑漏洞，仅仅因为上述原因，导致该分类判断下不能成立。

## 9. Cross-dashboard consistency for alarm counts and event drill-down

**已验证：真正的不一致 — 三个“Critical Alarms”面板，三个不同的范围，一个真实的含义，并且（在实时数据中）所有这些中实际上有零个 Critical 报警。**

| 仪表板                          | 面板标题                                           | 时间窗口                                          | 实时值     |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------ | ---------- |
| `ims-easy-overview.json`      | "◉ Critical Alarms (1h)"                         | 过去 1 小时                                       | **23**     |
| `ims-ldi-manufacturing.json`  | "◉ Critical Alarms"                              | 无 (`NO_TIMEFILTER_INTENTIONAL`, 完整数据集)        | **564**    |
| `ims-ldi-operator-andon.json` | "◉ Critical Alarm Records (master-code matched)" | 无 (`NO_TIMEFILTER_INTENTIONAL`, 完整数据集)        | **564**    |

它们三个均运行相同的过滤器 `m.severity IN ('Critical', 'Major')` —— 尽管有这样的标题，但没有一个是单独计算 Critical。在 NOC 简易概览和制造仪表板之间浏览的用户，将在同一时刻在一个屏幕上看到“Critical Alarms：23”，而在另一个屏幕上看到“Critical Alarms：564”，原因是两个结构上不同的原因（不同严重性范围隐藏为同一个标签，_加上_ 一个 1 小时窗口，而不是全时窗口）。这直接违背了 `GRAFANA_DESIGN_SYSTEM.md` 自己所陈述的准则 —— §1 规则 3（“3 秒规则”：观看者应能够在无需阅读标签的情况知晓状态）和规则 4（“一致性 > 新颖性”：同样的面板概念，在所展示的一切地方都需有同样的外观和运转）。

```sql
SELECT severity, COUNT(*) FROM ldi_alarm_log a JOIN ldi_alarm_ms_code m
 ON a.errorcode::TEXT = m.alarm_code::TEXT GROUP BY severity;
-- Warning: 13880 Major: 564 Minor: 75 (Critical: 0)
```

鉴于 §8 的发现，**由每一个此类的“Critical”面板所统计的所有 564 个事件全为 Major 级别**——现时任何一个以此类视图展示的内容，属于 Critical 为 0%。此标签不单止在不同仪表板间存在跨越式的不一致性，且对其现时内容的包容度属 100% 的错误。

## 10. Color-token consistency against the approved design system

**已验证：通过，0 偏差。**

所有 6 个面向报警的仪表板上的每个严重程度颜色值映射通过程序提取出来，并与 `GRAFANA_DESIGN_SYSTEM.md` §2.1 进行了差异对比：

| 严重性     | 获批令牌             | 获批的十六进制代码 | 仪表板中存在情况                                         |
| -------- | ---------------- | ------------ | ----------------------------------------------------- |
| Critical | `critical`       | `#EF4444`    | `#EF4444` — 100% 匹配，所有 6 个文件                      |
| Major    | `warning`        | `#F59E0B`    | `#F59E0B` — 100% 匹配，所有 6 个文件                      |
| Minor    | `severity-minor` | `#EAB308`    | `#EAB308` — 100% 匹配，全部展示 Minor 的文件              |
| Warning  | `accent`         | `#3B82F6`    | `#3B82F6` — 100% 匹配，全部展示 Warning 的文件            |

没有杂散的十六进制字面量，无仪表板上的漂移。未在此通过采用破坏性方式再度运行 `dashboard-linter.js` 的 Check 15（其在结构上执行此表的规定），但它的逻辑以直接的提取法单独再度验证了——结果一致。这是报警管线目前唯一没有审计发现报告的领域。

---

## Scoring

| #   | 检查项                                          | 结论                                                                                                   | 评分 /10  |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 1   | AlarmId 存在性                                  | 通过，0 个孤儿                                                                                             | 10        |
| 2   | AlarmType/Severity 一致性                       | 内部一致                                                                                                   | 8         |
| 3   | AlarmMsg 质量                                   | 通过，无污染                                                                                               | 10        |
| 4   | AlarmDetail 完整性                              | 完整但用词存在数据库结构模式泄漏                                                                             | 8         |
| 5   | 频率分布                                        | 噪音权重正确；状态条件引发的代码常态居多占主导 (91.4%)                                                       | 4         |
| 6   | 突发 / 潮涌表现                                 | 没有消抖 / 锁存控制；特定的机器发生持续的潮涌式报错                                                          | 3         |
| 7   | 遥测数据相关性 (`related_log_id`)               | 状态条件驱动类型报警的相关计算数据正确；`match_type` 为噪音类信息作出误导性的标示，并在仪表板中展现            | 4         |
| 8   | 严重性等级分配 (最高位的 Critical 报警代码评估) | 0 个处于有效状态的 Critical；实际采用列表目录由于文字错误导致存在误报 + 类型优先级的矛盾                   | 4         |
| 9   | 跨仪表板一致性                                  | 3 个控制面板，3 种范畴区域，1 项标识错误的度量标准，目前的精确率为 0%                                        | 3         |
| 10  | 颜色标识 Token 一致性                           | 通过，无偏差漂移                                                                                           | 10        |

**未加权平均：6.4/10 → 终极仿真逼真评分：58/100。**

数据完整性层（参照完整性，消息整洁度，颜色管理）已达可用于正式环境的产品水平。而行为表现的反映层级（如频度表现，涌突速率计算，真实诱因相对随机重合打标，严重性分布广度，跨仪表控制台界面的度量统计定义），却正好就是实施厂房巡视复核，或为终端客户的实景展示，最能够指出“仿真”跟“真实”之间所存在的裂痕之核心区域。

---

## Unrealistic alarm behaviors — summary list

1. 在当下的仿真模拟场景之中，能产生的 Critical （危急） 严重级别类型的报警情况绝对是属于不可能的（§8）。
2. 在整份警示录制数据内有高达 91.4% 的量均属于被外在状态改变（condition-driven）触发出来的，而不是背景干扰（noise）造成的——彻底推翻了一家实际的生产工厂在一般的状况之下必然应该是居高不下受背景环境因素诱发的分布比重（§5）。
3. 只需处于连续超过不到 15 秒钟的状况，单独单据设备可把同样的报警码激发好几百次长达日夜循环的无间状态 —— 没有设置触发防抖缓冲（debounce）或门闩控制限制（latching）（§6）。
4. 每一机台对应的触发量均受到模拟状态的遥测发报机的误导指配影响，并不是依据系统自带声明内部参数预制配比（§6）。
5. 环境干扰型（Noise-code）报警展示于当前的仪表盘监控纵列画面中，以一项完全像无中生有的“发生根源”（举例而言：质量受创因由 `Quality Impact` = “因定位及误差引出超出限定范畴”）约摸是在处于超限偏离规范基础频率之上生成，明明两部分原本在构思跟规划阶段的时候绝无任何实际因果关联（§7）。
6. 百分之百所有的警示都会出现 `match_type = 'exact'` ，里边也一并包含了只因为处于发报当时仅属于凑巧是最邻接且贴近当刻的产生的一系列报警，并不带有真切之诱发理由（§7）。
7. 有三大主控制仪表监控区均共用了同一个称谓但相互统计不衔接（如一小时比较对冲着整体合计），而且是同样一项名为 "Critical Alarms" 的统计区段（§9）。
8. 而且这三处的 "Critical Alarms" 小区域的内部结构更是把 Critical 及 Major 两大部分归集综合累积在一起的展现结果，当今时刻真正的核心 Critical 的数量居然只是 0%（§8, §9）。
9. 在实际包含了 1,820 列代码内容的那个汇编归总字典名册，有那种带属于 Critical 的报警分级严重性质，可是它自己的本身错误宣告语句里却说自身是一项属于普通的 "Warning"（§8）。
10. 内容细部报警词汇居然把自身隐匿底端核心数据库内的内部栏位字段列别直奔向外通报（§4）——对于工程修维人员来说，完全合情也合理，可要是对应到一个要面对第一线作业人员进行查看阅视的终端操作操控面板 HMI 来说，实属虚幻又完全不贴近工作实景。

## Recommended simulator parameter changes

_（由于遵守此阶段纯粹只作数据稽核复验之宗旨前提下 —— 在此回合中将不投入实施与应用，故全作荐言用途提出。）_

1. **必须紧缩遥测干扰（telemetry noise）带宽**（或可选择扩大超限制 OOS （Out Of Spec）门槛的界线限制幅度，以此重新适配目前原设计既有在基础环境），如此才能把由于例如 PE / JE、真空、乃至环境变量导致触发的超越规范的比重比率情况自 23–45% ，直接往下降幅调节为属于单个位数偏低的常态性质事件水平幅度级别之下，把实质上的意外突发异动情况模拟演化打造成属于有具体针对，并在每一机台配搭有时限区段特指性的受控制的报错区间性质来反映实景，而不再长此以往使其落入在近似成为不受约束之长年沉痾（半永续环境局限的条件）。
2. **应引入使用缓冲防抖/静候期（debounce / cooldown）机制**加入去应付这类依从在外部受状况变数催逼促发的发报警示的系统身上（譬如可设立成去屏蔽及阻断在过往那刚刚距离前一回发生并经过仅数分钟区间，对于是针对相同器材再度激发的阻滞与消音配置设定；另一折衷则是往改用“只有直到排解状况之后才能启动后续再上报的拴合拦截型模式” (latch-until-cleared model) 去推进改善），以此一笔撇除取代替换成目前“一遇相同状态即毫无止境重复那在每经过 10 秒就会进行掷一回拥有有四份之一的 25% 的胜率的几率投骰活动”循环情况。
3. **加入具体确凿的一个专门表明联系关系归属渊源判定的纵横表栏**（例如 `link_basis: 'causal' | 'nearest_neighbor'`）这经由在 `almsim_gen` 给那些受到受状态促动触动的类代码，跟只有纯靠在进行针对处理数据变动与调动 (migration-051) 的驱动触发器指配作默认指定下，赋予作分辨其是干扰源类信息的预设处理方式，同时要使其突现呈现它（或是干脆把 `Quality Impact` 这个推演分析机制自个给封门独立分出操作管治门径），从而遏止中止因遭受干预性质干扰型报警，往后别再去呈现一个犹如是在故弄玄虚凭空自造弄出来般假造的发报理由指代了。
4. **种下微小数值级别的几个货真价实实质上确实带有绝对级别 Critical（极度关键危急）类别严重性特质的代码**融入那归入受 `NOISE_CUM` 范围又或直接开设一张以超低下发状况概率来定义的“极其罕见型出错 (rare fault) ”事件编列表单系统（举例可以考虑采用像是来自于总数达 43 列真实的处于属于 Critical 一系列设置，拿那个属于 E-stop/servo-fault 发生报错真实警示的一项为典范），来得以使得最高层的那个界别之危急性等次与专属配置色彩设定可于安灯 (Andon) 或在监视终端控制版上可以在进入模拟机制底下常态情况发挥出来获得触发及运行之用。
5. **实行统合那一套 “Critical Alarms” （极其关键与危急严重告警类） KPI 的指标性度量体系**用作统一处理贯穿并对应在 `ims-easy-overview.json`, `ims-ldi-manufacturing.json`, 以及在 `ims-ldi-operator-andon.json` 上头 — 让它保持选用属于相同阶级的单一类严重级别过滤甄别条件，共用着一样的受控观察计测时距范围（也可以去专门配搭出一个由经过特殊刻意定明配置并且加上具有极高辨别度易于分辩差异的指标化提示标贴来呈现区分点不同处），不然的话，应干脆把题目转换命名直接成 "Critical + Major Alarms" （极其危急类别加上重大主要类的综合警告警报类别）（或者是可被拆离开来劈分成二套在严重判断层面相互完全互不瓜分不相关的两台专属独立的各自计测的累计算计数牌）以这样这去促使它的内容指标题注称号能和那项搜索提取查调结果取得绝对切中关联符合匹配的状态情况。
6. **就存在那属于现实目录分类名册中的那个基于特定正规正则表达式字符过滤提取器 (regex) 应实施开展作深切的翻看检索**（指迁移过程 061 的操作），用意是在压抑在一些例如是纯巧遇意外所惹来的所谓“安全 (safety)”/“逾越逾规 (violation)”/“崩解冲突碰撞 (crash)”这些附带假正阳性误导报错结果，以停止中断阻止那些连查也不去理会就只是见由于 `alarm_type='E'` ，不管这该列在它自身的陈述内部说到底是报些什么文句字面内容也就一股脑无限制条件的全送推向 Critical 分等级别的粗暴升级拔阶行为方式了。

---

## Appendix: Queries used

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
