<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>主页</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# 只读审计 — 告警卫生 + RAM 漏洞范围 + 历史数据完整性 + 模拟器真实性

> **仅限审计。零文件修改，零提交，零容器触碰。** 用户明确命令在 Soak Attempt 8 期间运行且不造成干扰。以下所有内容均为实时查询结果、实时仪表板/屏幕截图检查或静态文件读取 — 没有任何数字是估计出来的或从未经验证的历史版本中结转过来的。
>
> 日期: 2026-08-15T02:35Z–03:05Z。系统状态: Soak Attempt 8 正在进行中 (在 `docs/evidence/SOAK_TEST_LOG.md` 记录的重启之后约于 2026-08-15T01:49Z 开始)，因此大多数数据集已有约 1-1.5 小时，而不是好几天。

---

## 1. 告警卫生（重审 `SPEC_ALERT_HYGIENE.md`，写于 2026-08-14）

根据当前实时仪表板的 JSON 和 DB 状态重新验证了全部 5 个项目 — 规范本身的结果已过时，但这证实了从那时起是否发生了任何变化。

| 项目 | 规范所言 | 今日确认 |
| --- | --- | --- |
| 1. MTTA/MTTR 仪表板 | 不存在 | **仍不存在** — 在整个仪表板 JSON 中 `grep -ri "MTTA\|MTTR"`: 0 个匹配 |
| 2. 重命名 2 个 "Critical Alarms" 面板 | 4 个中仍有 2 个错误 (`ims-easy-overview`, `ims-ldi-manufacturing`); 已修复 2 个 | **无变化** — grep 确认相同的 2 个面板仍然命名为 "Critical Alarms" / "Critical Alarms (1h)"; `ims-ldi-operator-andon` 的面板是正确的 "Active Critical/Major Alarms (master-code matched)" (在此会话之前的屏幕截图中也已目测确认)。`ims-ldi-alarm-console` 根本没有 Critical-Alarms 计数面板 (规范关于那里有第四个面板的前提是不成立的 — 实际上只有 3 个遵循此模式的面板，而不是 4 个；不是新问题，只是对规范自身计数的纠正) |
| 3. 移动 "Pipeline Heartbeat" 面板 | 在 `ims-ldi-manufacturing` 和 `ims-ldi-operator-andon` 上均存在，“已隐藏” 未被移动 | **无变化，目前已精准描述特征**: Andon 板上的 `gridPos` 是 `w:1, h:1` — 一个 1x1 单位的面板，未被 CSS 隐藏，也未被移除。它是一个真正的功能看门狗（每次刷新周期 `SELECT NOW() AS time, 1 AS value`；根据其自身描述，停滞的仪表板刷新计时器会触发此面板强制重新加载页面）。将其移至 `ims-meta-monitoring`（规范的建议）仍然是正确的决定 — 它是一个伪装成杂乱界面的真正基础设施，而非装饰物 |
| 4. 数据就绪度生命周期检查 | 提出了 3 个候选检查，没有一个被说成已经存在 | **部分已完成** — `ldi-data-readiness.json` 已经有一个名为 "◉ Stuck Acknowledged Alarms" 的面板 (`WHERE l.status='ACKNOWLEDGED' AND l.acknowledged_at < NOW() - INTERVAL '2 hours'`) — 这完全是规范中的第 3 个候选检查，已经上线。另外两个 (停滞在 `OPEN` 超过 SLA 的状态，没有匹配的 `ldi_alarm_log` 的孤立生命周期行) **不存在** — 通过对仪表板进行全量面板标题的 grep 确认（共 16 个面板，没有任何名称类似于 "stuck open" 或 "orphan"） |
| 5. 防抖负载测试 | 不存在脚本 | **无变化** — `tests/` 或 `scripts/` 下没有匹配 `*debounce*` 的文件；只有 _实施_ 防抖的迁移和流程逻辑存在，没有对其进行压力测试的测试 |

**结论：第 4 项完成了 1/3，该规范中的其他所有内容都与 2026-08-14 完全一致。** 在 soak 之后进行批量修复是安全的（所有 5 项都仅涉及仪表板 JSON 或新的测试脚本 — 都不需要重启容器）。

---

## 2. RAM 累积漏洞 — 确认范围

`SPEC_RAM_METRIC_ACCUMULATION_BUG.md` (此次会话稍早时的 2026-08-15) 指出 `ims-capacity` 和 `ims-noc-overview` 受到影响。在此次流程中在所有仪表板 JSON 中通过 grep 查找 `ram_used_mb|ram_total_mb|ram_pct`：

**受影响的是 3 个仪表板，而不是 2 个**：`ims-capacity-planning.json`，`ims-noc-overview.json`，**以及 `ims-engineering-drilldown.json`**（其 "RAM Usage" 仪表，确认在此次会话稍早的屏幕截图中也显示为 100.00% — 规范文档少算了一个；将在部署 RAM 修复本身时，修复该文档的验证清单）。

---

## 3. 历史数据完整性 — 3 个独立发现，而不是 1 个

去寻找漏洞、重复项，并大致了解 `sys_metrics`/`ldi_data`/`net_metrics`/`ldi_alarm_log` 中的数字是否可信。发现了三个各自独立的真实问题 — 其中没有一个涉及制造遥测 (`ldi_data`) 或告警日志 (`ldi_alarm_log`) 这些 RCA/SPC 证据所依赖的内容，它们都是干净的。

### 3a. `sys_metrics` 中的两次实际摄取间断 (仅限基础架构遥测)

针对 `sys_metrics` 完整历史的 `time_bucket('15 min', time)` 显示有两段长达数小时的时间 **行数为零**：`2026-08-13 09:45` → `2026-08-14 01:15` (约 15.5 小时) 和 `2026-08-14 09:45` → `2026-08-15 01:15` (约 15.5 小时)。第二次间断得到了此次会话早前 soak-log 取证的独立证实 (主机在最后一次 Attempt-7 采样和 2026-08-15T01:09:30Z 重启之间关闭了电源) — 这是从两个不同数据源观察到的同一事件，而不是一个新的未解之谜。第一个间断以前没有被调查过；值得在下一次 soak 尝试开始之前快速查看一下 (在这个过程中没有做 — 只读范围，而且是历史记录，不紧急)。

### 3b. `sys_metrics` 有 67% 的重复行 — 一个真实的、以前未被发现的错误，仅限于这一个表

```sql
SELECT COUNT(*) AS total_rows, COUNT(*) - COUNT(DISTINCT (device_id,time)) AS extra_dup_rows FROM public.sys_metrics;
-- total_rows=13317  extra_dup_rows=8911  (66.9%)
```

每一个 `(device_id, time)` 对要么正好有 3 行，要么正好有 4 行 — 从来没有 1 行，从来没有 2 行，从来没有 5+ 行 (4,307 对是 3 倍，99 对是 4 倍)。重复的行在字节级别上是完全相同的 (相同的 disk/ram/cpu 值，相同的微秒时间戳)，所以这不是时钟偏移或者使用不同数据重试 — 这是对同一样本的多次写入。

**根本原因，从 `sre_parser` 逐节点追踪到实际的 `INSERT`，没有任何剩余的推断** (跟进审计，2026-08-15T03:1x Z)：

- `sre_parser` (`nodered_data/flows.json`，函数节点，"SRE AIOps Parser v9 (Batch)") 仅连接到一个下游节点：名为 `TimescaleDB` (`db_insert`) 的 `postgresql` 节点，外加一个调试节点 — 在 DB 层没有扇出。因此乘法发生在 `sre_parser` 本身_内部_，而不是来自多个插入路径。读取其完整函数体：
- 每个 SNMP 轮询器类型的消息 (`walk_cpu`、`walk_storage`、`walk_net_get`、`walk_temp`、`walk_ldi` 均分别连接到它里面 — 在上一轮审计中确认) 会调用 `sre_parser` 一次。
- 它为每个设备保留一个共享的 `state` 对象 (`flow.get('dev_state_'+ctxKey)`)，仅更新与刚到达的 `walkerType` 相关的部分 (例如 `walkerType === 'storage'` 仅更新 `state.ram_*`/`state.disk_*`)。
- **错误在于这一行**：`if (walkerType === 'cpu' || walkerType === 'storage' || walkerType === 'temp') { ...; buffer.sys.push({device_id, cpu_cores: state.cpu_cores, ..., ram_total_mb: state.ram_total, ..., disk_total_gb: state.disk_total, ..., temp_c: state.temp}); }` — 它会在 3 种轮询器类型每次完成时，都将一个**完整共享 `state` 的完整快照** (cpu + ram + disk + temp 在一起) 推送到 `sys` 批处理缓冲区上，而不是在每次真正的轮询周期一次。三个轮询器在相同的约 10 秒窗口内着陆，每个轮询器都重新推送几乎未改变的完整状态 — 这完全符合“总是 3，有时 4” (第四个轮询器在缓冲区刷新边界附近触发) 的模式。
- 每过 `BATCH_INTERVAL_SEC` (10s)，积累的 `buffer.sys` 数组将被刷新为**单条多行 `INSERT INTO sys_metrics (...) VALUES (NOW(),...),(NOW(),...),(NOW(),...)`** 语句 (`buildBatchQueries`)。Postgres 针对每个语句/事务评估一次 `NOW()`，而不是每行一次 — 因此在那个 INSERT 中的所有 3-4 行都获得了_完全相同_的 `time` 值，这就是为什么重复项共享相同精确到最后一位的微秒时间戳，而不仅仅是相似的值。
- `net` 和 `ldi` 轮询器类型会在它们各自完成后将数据分别推送到_独立的_缓冲区（`buffer.net`，`buffer.ldi`）正好一次 — 对于这些表不存在将多个轮询器合为一行的类似模式，这恰恰是 `net_metrics` 在下方的爆炸半径检查中显示为干净的原因。（注：`sre_parser` 的 `ldi` 分支写入一个名为 `ldi_metrics` 的表，而不是 `ldi_data` — 下方检查重复项的包含 34 列的制造遥测表是由完全不同的机制填充的，而不是此函数。这并未改变发现结果，只是对命名的澄清。）

**阶段 A1 的确切修复位置**（此轮中未编写 — 仅限审计）：`nodered_data/flows.json`，节点 ID `sre_parser`，对应的代码行 `if (walkerType === 'cpu' || walkerType === 'storage' || walkerType === 'temp') { enforceBufferLimit(buffer.sys, 'sys'); buffer.sys.push({...}); }`。需要在每个实际轮询周期恰好推送一次（例如，控制在预期每周期最后一种轮询类型时发生，或者跟踪自上次推送以来哪些类型的轮询器已报告，并在所有三个都到达后才推送一次），而不是对每个组成的轮询器类型各推送一次。

**爆炸半径**：确认仅限于 `sys_metrics`。检查了 `ldi_data` (0 个重复项 / 34,689 行)，`ldi_alarm_log` (0 个重复项 / 677 行)，`net_metrics` (0 个重复项 / 8,546 行) — 全部干净，因为它们每一个都是由单一的轮询器类型（分别为 `ldi`、alarm-trigger logic、`net`）写入的，而不是扇入。**这意味着每个仪表板面板如果直接针对 `sys_metrics` 执行 `COUNT(*)` 或 行数/秒 的速率计算（相对地取比例平均值则不会被重复项扭曲），它在这一整段时间内的报告数值都大概偏高了 3 倍。** 尚未审计哪些具体的面板进行的是原始计数还是平均值计算 — 这是一个真正的后续行动，在这个过程中未完成。

### 3c. `ubuntu.snmprec` 的磁盘配置在数学上被固定为 100% — 这是独立于 RAM 漏洞的另一个漏洞

`ERP-MASTER-UBUNTU` 的 `disk_used_gb == disk_total_gb` 出现在**它整个历史记录中的每一个样本**里 (回溯到 2026-08-13，最早的数据)。确认这不是 RAM 累加漏洞 (`parser.js` 处理磁盘的代码在每个周期都执行干净的 `=` 替换，而不是 `+=` — 这是直接读取的，而不是推断的)。

根本原因在于 `monitoring/snmpsim/ubuntu.snmprec` 本身：

```
1.3.6.1.2.1.25.2.3.1.5.2|2|52428800          <- hrStorageSize (磁盘), 静态
1.3.6.1.2.1.25.2.3.1.6.2|2:numeric|min=65536000,max=125000000,rate=50000   <- hrStorageUsed (磁盘), 随机漫步
```

已用值的_最小值_ (65,536,000) 已经超过了静态总量 (52,428,800) — 根据结构设计，已用值永远不可能小于总量的约 125%，而 `parser.js` 自带的 `Math.min(diskUsedGb, diskTotalGb)` 钳位功能进而每次都将其强行压低至正好 100%，这完全符合观察结果。与 `windows.snmprec` 比较，它使用了**相同**的已用值范围（`min=65536000,max=125000000` — 完全一样的数字），但却拥有一个尺寸正确且能安全包容该范围的总量（`200000000`）。这是一个复制粘贴配置错误：已用范围的模板在这两个 `.snmprec` 文件中被重复使用，但没有重新计算 `ubuntu.snmprec` 的磁盘大小使其保持在此之上。

**纠正 (2026-08-15, P0.2 调查)**：上述“9,375 → 12,500 GB 增长”是错误的——这是本文档自身 `time_bucket('10 min', ...)` `AVG()` 查询的测量假象，并非真实趋势。检查了未分桶的原始行数据：`ERP-MASTER-UBUNTU` 的 `disk_total_gb` 在其整个历史记录中只精确取过 2 个不同的值——`0`（9 行，来自解析器在轮询器短暂间断期间的 `isOffline`/`isEmpty` 清零分支）和 `12500`（3,478 行，每一个其他样本）。原始数据中没有任何地方出现中间值。碰巧将三个 `12500` 的行与一个 `0` 的行在 10 分钟桶中取平均值产生了 `9375`——这是平均窗口的假象，并非真实的发展进程。`disk_total_gb` 自第一个样本起就精确地固定在 12500（与静态 `size × au` 计算相匹配）。不存在第二种机制；这完全由上述已记录的单一 `.snmprec` 占用范围配置错误所解释。

---

## 4. 模拟器真实性 — 状态重新检查，而不是完整的审计重跑

`LDI_ALARM_FIDELITY_AUDIT.md` (2026-08-11，得分为 58/100) 早于 `Phase D` (防抖，任务 #183) 和 `Phase F` (罕见的关键代码，任务 #185)，根据任务历史，后两者是在较晚的时候完成的。通过实时重新检查了它的两个最大的发现，而不是重新引用过时的分数：

- **发现 #6 (没有防抖，持续泛洪)**：已重新检查。在今天测量的 549 个“对同一告警”的间隔中，只有一个不到 15 秒（在原始审计中，通常是几百个）。**防抖是真实且起作用的。**
- **发现 #8/#9 (不可能发生严重级别为 Critical 的告警)**：已重新检查。现在的目录有 43 个关键行（过去是 0），而且在实时数据集中**已经触发了 1 次严重级别为 Critical 的告警**（以前在结构上是不可能的）。**已修复，通过现场触发事件得到验证，而不仅仅是变更目录。**

**目前 58/100 的得分向好的方向过时了** — 重新运行完整的审计 (包括所有 10 个部分，根据 `LDI_ALARM_FIDELITY_AUDIT.md` 自己的附录查询) 很有可能会得到显著提高的分数，但在这个检查轮次中并没有完全重新运行 (超出了只读抽查的范围；这是正确的下一步行动，但此处未做)。此会话早期重新测量的 RCA Lift (`LDI_RCA_GUIDE.md`，同样的警告：重置后的样本小，多数类别为 LOW SAMPLE) 也是一个相关的、属于当前的数据点 — 此处不再重复。

`SPEC_SIMULATOR_REALISM.md` 中具体的第 1 项（噪声代码回溯，精确的修复 diff 已编写）根据当前的 `nodered_data/flows.json` 进行了重读 — 被诊断的那一行未发生改变，修复方案仍然准确且尚未应用。

---

## 批量修复规划摘要 (在 Soak Attempt 8 完成后)

按证据置信度和爆炸半径排序，而非工作量：

1. **`sys_metrics` 3-4倍重复插入** (§3b) — 数量最大 (整个表的 67% 被浪费，每个进行原始计数的面板偏差约 3 倍)，根本原因追踪至 walker-fan-in 模式，但在编写修复程序之前，确切的 insert-node 接线还需要再看一遍。新的发现，未在之前的任何规范文档中体现 — 在批量修复前需要有自己的规范。
2. **RAM 累加漏洞** (已定规范，`SPEC_RAM_METRIC_ACCUMULATION_BUG.md`) — 范围修正为 3 个仪表板。
3. **`ubuntu.snmprec` 磁盘配置错误** (§3c) — 新发现，仅在配置文件修复 (不需要更改 `parser.js`)，从技术上讲甚至不需要重新部署 Node-RED 代码 — 只需要纠正 `.snmprec` 文件并专门重启 `snmpsim` 容器。值得检查这是否比全面重新部署 Node-RED 影响更小、风险更低的重启。
4. **告警卫生项目 1、2、3、5** (`SPEC_ALERT_HYGIENE.md`) — 所有这些仅涉及仪表板 JSON 或新测试脚本，不需要针对其中任何一项重新启动容器；如果需要的话，它们可以在其它 3 项落地**之前**发布，且独立于 soak 周期。
5. **第 4 项的其余 2 个生命周期检查** (卡在 OPEN 状态、孤立的行) — 与 #4 的类别相同，仅限仪表板。
6. **模拟器真实性项目 2-4** (`SPEC_SIMULATOR_REALISM.md`) — 尚未进行详细设计 (在编写该规范时已注明需要头脑风暴技能来参与真正的设计过程)；去除回溯 (项目 1) 已准备好按原样发布。
