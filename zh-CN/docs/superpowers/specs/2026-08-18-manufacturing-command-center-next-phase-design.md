<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../../README.md"><img src="../../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../../../../docs/README.md"><img src="../../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

# IMS LDI 制造指挥中心 — 下一阶段审计与设计

状态：**仅设计/规范。不涉及实施。** 在 3D 工厂数字孪生作为经验证的基线被冻结后编写（任务 4.1–4.4，所有内容均已审查/批准，未提交，且本文档不再进一步修改）。

## 0. 目的

审计平台中已存在、与九个特定关注领域相关的内容，然后提出下一阶段的设计方案，然后再开始修改文件：

1. C 级 (C-Level) 工厂概览
2. 生产与合规 (Production & Compliance)
3. 分析与 SPC (Analytics & SPC)
4. 系统警报 (System Alarms)
5. 2D 工厂数字孪生集成
6. 3D 工厂数字孪生集成
7. 操作员向下钻取 (Operator drill-down)
8. 警报的生产影响
9. 工厂 → 区域 → 机器 → 警报 → 生产的可追溯性

这不是一个从零开始的设计。审计最大的发现是：上述大部分内容之前都已设计过，目前处于正在运行、被遗弃或连接了一半的状态。因此，下一阶段主要工作是 **修复和集成**，而不是全新的建设。

---

## 1. 审计

### 1.1 仪表板清单 (真实数据，来自 `docs/architecture/DASHBOARD_INVENTORY.md`，从实时 JSON 重新生成)

共 15 个仪表板，178 个面板 (panels)。位于 “LDI Manufacturing” 组的 10 个仪表板是本阶段的相关核心：

| UID                             | 目的 (如文档所述)                                                               | 相关阶段项 |
| ------------------------------- | ------------------------------------------------------------------------------------- | ---------------------- |
| `ims-ldi-manufacturing`         | 4 层 RCA：执行 HUD + 遥测 + 生产上下文 + 警报流，21 个面板 | 1, 2, 3, 4, 9          |
| `ims-easy-overview`             | 全车队规模 (Fleet-wide)，零配置，建立在受控的 views/functions 之上                    | 1                      |
| `ims-ldi-operator-andon`        | 电视墙信息亭，1280×720，零交互                                            | 1, 7                   |
| `ims-ldi-alarm-console`         | 交互式确认/解决 (ack/resolve)，写入 `ldi_alarm_lifecycle`                                 | 4, 8                   |
| `ims-ldi-alarm-response`        | 真实的 MTTA/MTTR，来自 `ldi_alarm_lifecycle`                                             | 4, 8                   |
| `ims-ldi-alarm-dictionary`      | 警报代码参考查找，仅支持深入钻取                                            | 4                      |
| `ims-ldi-engineering-analytics` | 第 3 层 RCA + SPC 控制图，CUSUM/Nelson 规则                                  | 3, 8                   |
| `ims-ldi-machine-snapshot`      | 每台机器在点击的时间戳下的 360° 全景快照                                      | 7, 9                   |
| `ims-ldi-factory-digital-twin`  | 2D 画布孪生 (2D Canvas twin)，10 台机器 / 5 个区域                                                 | 5, 7, 9                |
| `ldi-data-readiness`            | 基于证据的 DB 就绪状态，没有模拟数据                                        | (仅用于支持)         |

另外，在仪表板层之外：`services/factory-twin-3d/`（3D 孪生，刚刚冻结，项目 6），`services/alarm-api/`（ack/resolve 写入端点，项目 4/8）。

### 1.2 发现 A — 制造指挥中心已经有 5 个设计好的部分，但它们在静默中已失效

`ims-ldi-manufacturing.json` 的行面板 (row panels) 标题名称如下：

- `◈ PRODUCTION & COMPLIANCE` (row id 10001)
- `◈ ANALYTICS & SPC` (row id 10003)
- `◈ SYSTEM ALARMS` (row id 10004)
- `◈ RCA FLEET SUMMARY` (row id 10006)
- `◈ CYCLE TIME & TRACEABILITY` (row id 10013)

这些内容几乎与阶段项目 2、3、4、8、9 一一对应。每一行的 `collapsed: false` 但它的内容面板只存在于一个嵌套在行对象内部的已失效的 `panels: [...]` 数组中 — 这种结构 Grafana 仅在行为 `collapsed: true` 时才渲染。当为 `collapsed: false` 时，Grafana 期望这些面板与它们自己的 `gridPos` 作为仪表板顶层 `panels[]` 数组中的同级元素存在；但它们不在那里。**最终结果：JSON 文件中存在 9 个构建完成的面板，但在实时仪表板中不可见。** 通过解析 JSON 以及把 `panels[]`（平面化的，21 个条目，与清单的面板计数匹配）与每一行被遗弃的 `panels` 子数组进行对比（diffing）直接证实了这点（非推断）：

| 行 (Row)                       | 被遗弃的面板 (Orphaned panel)                  | 类型 (Type)           |
| ------------------------- | ------------------------------- | -------------- |
| PRODUCTION & COMPLIANCE   | Production & Process Table      | table          |
|                           | Temperature Compliance (22±2°C) | state-timeline |
|                           | Humidity Compliance (55±5%)     | state-timeline |
| ANALYTICS & SPC           | Calculated Time per Board       | heatmap        |
|                           | Z-Score: temperature            | timeseries     |
| SYSTEM ALARMS             | Recent Alarm Events (Last 50)   | table          |
| RCA FLEET SUMMARY         | Top Correlated Alarms (24h)     | table          |
| CYCLE TIME & TRACEABILITY | Avg Cycle Time (Fleet)          | stat           |
|                           | Board Traceability              | table          |

目前，仪表板仅呈现其顶部部分（执行 HUD：PRODUCTION / QUALITY / RISK 行，13 个 stat/table 面板，y=0–15）以及一个 Pipeline Heartbeat 面板 — y=16 以下的所有内容在实时仪表板中都是空白屏幕，尽管有 9 个已完整指定的面板一直放置于文件中未被使用。这很可能是某个行折叠/展开 (row-collapse/expand) 操作遗留下来的问题，该操作没有对面板数组重新进行展平化 (re-flatten)。本文档未触及或修复此问题 — 仅作验证。

**对以下设计的启示**：第 2 部分 (生产与合规)、第 3 部分 (分析与 SPC)，以及部分第 4 (系统警报) 和 9 (可追溯性) 的查询/面板设计初稿已经在这个文件里。下一阶段计划应该审计每一个被遗弃面板的 `targets`（SQL）正确性，并在当前架构上重用它们，而不是从零开始。

### 1.3 发现 B — 警报子系统是真实的、多层的，并且已支持项目 8 的大部分内容

- `public.ldi_alarm_log` / `ldi_alarm_ms_code` (主字典) / `ldi_alarm_lifecycle` (确认/解决状态机：`status` OPEN→ACK→RESOLVED, `acknowledged_by`/`resolved_by`/`resolution_note`) / `v_ldi_alarm_category` (类别汇总)。
- `public.v_ldi_alarm_context` (`postgres/init/039-rca-alarm-view.sql`) 已经将每个警报与过去 5 分钟的机器遥测数据关联起来，并添加了标志 `flag_temp_out_of_spec` / `flag_vac_out_of_spec` / `flag_pe_out_of_spec` — 这是一个工作正常、实时的、真实的“此警报是否与超规格过程条件同时发生”的联接 (join)。它与项目 8 (警报对生产的影响) 直接相关，且已经被 Engineering Analytics 的 RCA 面板使用。
- `public.v_ldi_rca_truth_test` (物化视图, `database/migrations/064-materialize-spc-fleet-rca-views.sql`) 则更进一步：对于每个警报类别，它计算在警报窗口期观察到的**超规格率与整个车队基线率的对比**，以及一个**提升比率 (lift ratio)**，并附带一个 `LOW SAMPLE (n<30)` 的置信度标志。这是一种真正计算得出的“这类警报与生产/质量问题的实际相关性有多大”的统计数据 —— 这并非项目 8 需要从头创建的东西，只是需要呈现出来而已。
- `services/alarm-api/` (Express, 真实数据库写入 `ldi_alarm_lifecycle`, 通过 `/alarm-api/` 进行代理，设置在与 3D 孪生重用的相同 `auth_request` 之后) 已经实现了写入端 (`POST /alarms/ack`, `POST /alarms/resolve`)，`ims-ldi-alarm-console.json` 会调用它。
- 刷新频率：`v_machine_spc_fleet`、`v_ldi_rca_recent_window`、`v_ldi_rca_truth_test` 是 TimescaleDB 的物化视图，每 1 分钟通过后台任务刷新一次（`add_job('public.refresh_spc_fleet_rca_mvs', INTERVAL '1 minute')`）—— 不依赖 `pg_cron`，是自包含的。

### 1.4 发现 C — 车队规模的 SPC 数据已经存在，独立于每台机器的 RCA 仪表板

`public.v_machine_spc_fleet` (物化) 根据 `eqp_id` + `location` 提供了：`n_pe`/`cp_pe`/`cpk_pe`/`pe_pass_rate`、JE 的相同数据，以及 `worst_cpk`/`worst_n`。这正是全车队 SPC 概览，`ims-easy-overview.json` 从中提取其“平均 Cpk（车队）”(Avg Cpk (Fleet)) 统计数据。指挥中心级别的项目 3 (分析与 SPC) 可以直接复用此数据，而不是重新推导 Cpk 计算；更深层次的单参数控制图（CUSUM、Nelson 规则、厚度/比例控制图）已经存在于 `ims-ldi-engineering-analytics.json`，并应保留在那里 —— 指挥中心的第 3 项应作为深入查看该仪表板的摘要/导航界面，而非重复该仪表板的深度内容。

### 1.5 发现 D — 可追溯性链条 (项目 9) 以分散的碎片存在，尚未连接成单一路径

各部分数据是真实的，并且均已在本次会话或相关任务中独立证实其已填充：

- **工厂 → 区域**：`public.devices.location` — 正好有 5 个真实的字符串值，没有数值/x-y 坐标列。这也是 2D 和 3D 孪生使用的同一区域模型。
- **区域 → 机器**：`public.devices.device_id`，`device_type='ldi'`，23 个注册行中有 10 个实际在报告数据（`LDI-01`..`LDI-10`）。
- **机器 → 警报**：`ldi_alarm_log.equipmentid` → `ldi_alarm_ms_code` → `ldi_alarm_lifecycle` (按 `logid`+`logdate`) → `v_ldi_alarm_category`。
- **警报 → 生产**：`v_ldi_alarm_context` (5 分钟遥测结合 + 规格标识) 和 `v_ldi_rca_truth_test` (类别级别的提升率，category-level lift)，两者均在上文描述。
- **机器 → 生产/板**：`public.v_ldi_machine_latest_full` (`board_no`, `total_board`, `mo`, `log_id`), `v_ldi_machine_snapshot`, `v_ldi_event_timeline`，以及发现 A 中孤立的 "Board Traceability" 表格面板。

目前没有哪个仪表板将这些呈现为连贯的点击路径（工厂 → 区域 → 机器 → 警报 → 生产）。现存最接近的是孪生系统的向下钻取约定（`var-machine_id`+`var-factory` → 机器快照，默认解析为“最新事件，所有 MO”）以及机器快照自身的 "Alarm Context (±5 min)" 面板 — 也就是在叶节点级已连接的 “机器 → 警报” 和 “机器 → 生产”。所缺失的是工厂/区域的入口点，以及在链条顶部，而不是在底层数据的 “警报 → 生产” 汇总。

### 1.6 发现 E — 操作员向下钻取 (项目 7) 约定已被证明有效，且有两例

两个孪生以及 Action Queue / Alarm Console 模式都汇聚在同一 URL 约定上，本次会话中已跨越四个 SDD 任务进行独立验证：

```
/d/ims-ldi-machine-snapshot/set2-machine-snapshot?var-machine_id=<eqp_id>&var-factory=<factory>&from=...&to=...
```

特意省略 `var-mo`/`var-event_time_ms` 以将机器快照自身的变量默认值解析为“最新事件，所有 MO”（已针对 `ims-ldi-machine-snapshot.json` 的变量查询逻辑进行了三次单独的验证：2D POC，2D 完整构建，3D POC）。这就是现有约定 — 下一阶段应将此约定原封不动地复用于针对项目 1 建立的任何新区域/工厂级入口点，因此 C 级视图可以通过其他功能都在使用的相同约定向下钻取到区域 → 机器。

### 1.7 发现 F — 2D 和 3D 孪生都是真实的，都已冻结/稳定，并且目前均与指挥中心隔离

不论是 `ims-ldi-factory-digital-twin.json` (2D) 还是 `services/factory-twin-3d/` (3D)，都没有被 `ims-ldi-manufacturing.json` 链接，反之亦然。它们是独立运作的。二者已经呈现了每台机器相同的状态/板材/MO/警报数据及相同的向下钻取目标。项目 5 和项目 6 本质上是 **整合** 问题 (该将这些东西置于何处以关联指挥中心：是作为一个内嵌的面板，顶层导航链接，抑或开关器)，而不是重新建设。

### 1.8 真正缺失的部分（而不仅仅是被遗弃的部分）

- 还没有建立比机器细节高出一级的“C-Level 级工厂总览”界面 — 最接近的是 `ims-easy-overview.json`（零配置车队概览），但其定位为面向操作员/工程师的快车道，不是执行主管概览，也没有区域/工厂级聚合。
- 没有面板能为制造负责人汇聚起“警报及其被测出的对生产的影响”并以单个排序列表展现出来 — 计算存在（`v_ldi_rca_truth_test`），展示未落实。
- 还没有一个面板能够将从工厂 → 区域 → 机器 → 警报 → 生产 的整个链路作为一条受引导的点击路线提供；每一步跳跃的数据存在，只是缺少将其贯穿连结的导航设计。

---

## 2. 设计提案

### 2.1 原则：先修复后重建

基于发现 A，下一阶段实施的第一个具体任务（不是本文档的任务）应当是在设计任何新面板之前重新扁平化 `ims-ldi-manufacturing.json` 中损坏的 5 个行 — 审计各个被孤立的面板底层使用的 SQL，判定是否与当前架构仍然相符（其中某些语句甚至要老于后来在会话中发现并完成的架构变更，比如 `board_id` 为空 / `log_id` 替换 等），然后再执行恢复，纠正，或有意识的替换。这预计能够显著解决项目 2、3、4 和 9，而且完全不需要对新面板进行设计。

### 2.2 各项设计方向

1. **C 级 (C-Level) 工厂概览** — 一个新顶级部分（或者成为一个新的仪表板 — 这是个悬而未决的问题，请参阅第 §3 节）。层次置于 `ims-easy-overview` 之上。工厂/区域汇总（5个区域）代替按机器分类，并采用已在两个孪生系统中得到验证的 `v_ldi_machine_latest_full` + `devices.location` 分组方式复用。
2. **生产与合规 (Production & Compliance)** — 首先修复现有被遗弃行（Production & Process Table, Temp/Humidity Compliance timelines — 这些已经存在于操作员 Andon 看板，并成功证明可行）。在还原孤立面板查询前验证是否与现存构架匹配。
3. **分析与 SPC (Analytics & SPC)** — 修复被遗弃的行 (Calculated Time per Board, Z-Score temperature)，将其作为指挥中心的总结层，通过 `v_machine_spc_fleet` 为支撑进行车队级全貌展示，并附上注明“查看 Engineering Analytics 以获取完整的 SPC 控制图表”的扩展钻取链结，而不再单纯在深度上与该特定面板重复功能。
4. **系统警报 (System Alarms)** — 修复废弃的“近期警报事件” (Recent Alarm Events) 的表格；考虑究竟应让指挥中心嵌入警报控制台提供的 ack/resolve 互动元素，抑或始终保持它的只读状态加上一个外链（待确定问题, §3 节） — 遵循 Andon Board 原有的“独立处理读取控制及另外警报操作”的常规方法，除非存在特殊理由。
5. **2D 工厂数字孪生集成** — 将一个物理导航链接添加至指挥中心以及 `ims-ldi-factory-digital-twin` (而非内置—因Canvas 面板属于重资源类型，并且其孪生自身已属于一个完备型表盘)，若双向均有用的话则设置双向。没有新增查询代码工作；毕竟该孪生自身拥有的数据已经可匹配于指挥中心现今在底层展现的单独每机信息。
6. **3D 工厂数字孪生集成** — 和第 5 项同样的导航结合概念；不过这是藉由现存 `/factory-twin-3d/` nginx 路径，并在相同于前述通过 `auth_request` 检验机制（该过程由同样的 Grafana 实现无需额外校验工作）。3D 孪生依照用户在本议程中明指：此工作环节不允许进行相关代码变更操作，若未另外核可则保持冻结。
7. **操作员向下钻取 (Operator drill-down)** — 延续已证实过的约定即使用 `var-machine_id`+`var-factory` → Machine Snapshot (发现 E) ，并且应用至那些专为第一项创建好的、全新级别下的工区/厂区的任何出发入口；使在C级视图也一样能藉此被统一采纳之连结架构向钻工区 → 器械。
8. **警报的生产影响** — 找出直接展示 `v_ldi_rca_truth_test` 升利差/信度数据之法（这也是将之前废旧的“最高关联事件” (Top Correlated Alarms) 进行的改旧维新，见发现A/B）从而不需求得一个另外构制新算法的数据。属于该想法表行的行层版，既 `v_ldi_alarm_context` 下每条警报警示条件，同样也被做为能给细节化之表盘用之直接选取材料。
9. **工厂 → 区域 → 机器 → 警报 → 生产 的可追溯性** — 实因属于跳动导引链路缺乏所造成（发现 D/E）却非材料之缺乏造成；在此将其构建为一个可直观被点击之受指导跳转路线 (guided click path) 时，每个单独跳动都应继续复用上述所列现存受认许规则机制，具体如： 从 C-Level 的综观级（区域整合）→ 区域性细节信息页面（带孪生原具同样设备归拢之仪器列表形式） → 具体设施对象（具备原有将两方面如警示环境连带出料情态结合一体的机具瞬像仪界面 Machine Snapshot ）— 此也使得将那份弃除不用过的 “Board Traceability 面板”恢复之行为，特此弥合这其中 “设施对象 → 具体制造情形”这最后的阶段跳跃缺口。

### 2.3 下一阶段实施计划中明确推迟/排除的范围

- 不修改 3D 孪生（依照明确的说明予以冻结）。
- 目前尚未设想新的数据库迁移作业 — 本文每一个“既成现实发现点”都是瞄准 *早已具备* 的视图/函数/数据表上作考察：假令后来付诸方案于实际上才找出问题与材料之间的现实缺损，那就等彼时在将其提列处理；不提前无谓猜测。
- 不存在三维建模、亦无跨设备交互，亦不用去构造加工假定厂区参数信息等 (现存之拘束条目且无修改)。
- 不需预先把面板形位组合(topology)结构确定下来 （究竟是以一个成长完备版的指挥台抑或全新单列一个 C 级概览的界面、甚至对旧版的解体改编等问题）— 请阅读未决议的问题环节：这些应该留至在实施工作做具体打算再决断的选项。在审计之时不下判断定论。

---

## 3. 悬而未决的问题（留作下一次规划/设计讨论，此处不作答）

1. **Topology (拓扑/结构)**: C 级工厂概览（项目 1）应该置于 `ims-ldi-manufacturing.json` 内顶层区新建；还是成为一个与原项并行的新表板挂置到总导航顶层? — 因为 制造指挥中心 已具有定案下的21件 面板(含其那9项遭置除不用的)；若硬性加注一项 宏观厂内统汇层 于之上； 或许反更利以新独立门户方式开启更佳。
2. **System Alarms (系统警报)**: 只取读静态性质 (Andon 面板做出的前例)，还是引入 含有确认与解除互动特质 的 警示控制中心 （为一创新设定例题）？
3. **将 2D 或是 3D 孪生版，设定为由指挥中心深入剖析的 "主要途径（canonical）"**：是将两者全部并列还是指定一条作主要而由另外的通道兼附之？或是给予一用户前端的选钮自行裁量? 这俩目前均属当前可实现使用; 没有技术障碍或倾向性的偏向差别。
4. **Traceability UX (追踪路径使用体现)**: 是应依靠单一屏幕并按层下剖式的层进联结模式解决全五环之跃进过程呢 （此为平台现存通用方法）；或者是开创一类专用如 "去追根索骥该基板及事件" 界面；此将会归整把跨过之跳进流程收拢全归在一项呈现面板里面去操作——如果是用其前者就是跟随原定已然既定之前案；用之以其后者则是启新了一类崭新互动操作之呈现规则了。
5. **遗弃面板修复的范围 (Orphaned-panel repair scope)**:  这九个早已搁置没被用的控制面其里下带有的各句SQL查询字法与最新的模型还能相互协调匹配否？ (部分或许是在被找到以前便已经被修正了比如像如 `board_id` 为空值而用代换之`log_id`等状况发生过)。这部分实须把每一句指令都去审查检验才能放入下一环节做工作流程, 不应在此视其安好而放之不管。

---

## 4. 本文档未执行的操作

没有修改任何文件。没有对任何 JSON 仪表板进行接触、恢复或者修正。没有写新的迁移方案， 也没执行除了单纯之 `SELECT`/`\d`/`psql` 静态内容探察外之任何的检索语句查询（或者是纯用于阅读特质性质在 `git`/file 上做的检视）。正如交代的那样仅仅做：审查 (audit) + 及架构。
