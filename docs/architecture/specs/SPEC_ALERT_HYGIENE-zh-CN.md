<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# 规范：告警卫生审查 (Spec: Alert Hygiene Pass)

> 状态：**仅为规范，尚未实现。** 准备于 2026-08-14 的 Soak Attempt 6 冻结期间离线完成。生成此文档未触及任何仪表板/运行时文件。

## 项目 1：MTTA / MTTR 仪表板

**当前状态**：在 `monitoring/grafana/dashboards/` 的任何地方都没有 MTTA/MTTR 面板或仪表板（本轮执行了 grep，0 匹配）。用于计算这两个值的原始数据已经存在于 `public.ldi_alarm_lifecycle` 中：`logdate`/`logid`（告警触发），`acknowledged_at`（人员首次介入），`resolved_at`（关闭）。

**设计**：

- **MTTA**（平均确认时间）= 在 `WHERE acknowledged_at IS NOT NULL` 条件下的 `AVG(acknowledged_at - logdate)`，按照任何有用的维度分组（按机器、按严重程度、按班次）。由于 `ldi_alarm_lifecycle` 本身不携带严重程度，因此需要连接回 `ldi_alarm_ms_code`。
- **MTTR**（平均解决时间）= 在 `WHERE resolved_at IS NOT NULL` 条件下的 `AVG(resolved_at - logdate)`，具有相同的分组选项。
- 合理的 v1 范围：1 个单独的全新仪表板（不合并到现有的仪表板中 —— 这是一个独特的“团队对告警的响应情况如何”的问题，受众不同于 RCA/SPC 仪表板），2 个统计面板（当前 MTTA/MTTR，如过去 24 小时）+ 1 个趋势面板（选定范围内的每日 MTTA/MTTR）+ 1 个表格（按响应等待时间排序的，供分类处理的最严重违规告警）。
- **应当预先记录并在文档中强调的注意事项，而不是在实施期间才发现**：在模拟器模式 (mock-simulator) 下，除非有人真的定期点击 Ack/Resolve，否则 MTTA/MTTR 毫无意义 —— 在一个安静的模拟环境中，这个仪表板主要会显示空值或低样本量，这与数据接收延迟仪表板的“告警稀少/被抑制，预期样本量低”说明遵循同样的诚信要求。在新的仪表板的描述文本中明确说明这一点，不要让它看起来像是发生故障，而不是安静。
- 责任人/决策上下文（建成后依据 `DECISION_MATRIX.md` 模式）：“团队响应告警的速度够快吗？” —— 受众是班组长/制造负责人，与制造指挥中心 (Manufacturing Command Center) 相同。

## 项目 2：重命名“Critical Alarms”面板

**当前状态，本轮验证完毕**：分布在 `ims-easy-overview`、`ims-ldi-manufacturing`、`ims-ldi-alarm-console`、`ims-ldi-operator-andon` 上的 4 个面板标题为“Critical Alarms”/“Critical/Major Alarms”，但底层查询实际上是将严重级别 (Critical) 和主要级别 (Major) 加在一起统计，而且在实时数据集中，统计的行有 100% 都是主要级别（0 个严重级别）—— 根据最初的保真度审计得出的结论。四个面板中有两个的标题已经写着“Critical/Major”（本轮确认的 `ims-ldi-alarm-console`、`ims-ldi-operator-andon`）—— 只有 2 个实际上是错的：`ims-easy-overview` 的“Critical Alarms (1h)”和 `ims-ldi-manufacturing` 的“Critical Alarms”。

**设计**：将这两个面板的标题分别重命名为“Critical/Major Alarms (1h)”和“Critical/Major Alarms”，以匹配另外两个已经正确的面板。这纯粹是标题字符串的编辑，相同的查询，相同的面板 ID，相同的网格位置 (gridPos) —— 是整个文档中风险最低的项目。同时可以考虑，既然 F 阶段引入了 `RARE_CRITICAL_CODES` 意味着严重级别的行现在可能会切实发生（审计时发生不了），查询本身是否应该提供一个只包含严重级别的细分 —— 值得在决定是否拆分或仍觉得太早之前，检查一下当前的实时计数。

## 项目 3：移动“Pipeline Heartbeat”面板

**当前状态，本轮验证完毕**：“◉ Pipeline Heartbeat” (`volkovlabs-echarts-panel`) 同时存在于 `ims-ldi-manufacturing` 和 `ims-ldi-operator-andon`。前一轮（任务 #204）在安灯 (Andon) 看板上“隐藏”了它，而不是把它移走 —— 需要在假定它仍然只是显示切换或是已彻底删除之前，重新检查这两个仪表板上当前的 `gridPos`/折叠状态，因为自那以后的仪表板编辑可能会朝任何一个方向改变它。

**设计**：目前在这个包含 13 个仪表板的库存中，没有任何专用的“管理”仪表板供其移*入*。有两个可行的选项：

1. 创建一个新的小型管理/运维仪表板（将成为第 14 个仪表板，需要在 `DECISION_MATRIX.md` 和 `OWNERSHIP.md` 中有其自己的条目，加上需要更新仪表板冗余检查器所检查的所有仪表板数量统计文档 —— 对单个面板而言大动干戈）。
2. 已经存在 `ims-meta-monitoring`（“IMS 管道健康与元监控”），它的明确用途就是“监视管道本身”的仪表板 —— Pipeline Heartbeat 完全符合其声明的用途。把它移过去对现有仪表板而言只是做加法，并不是新增一个仪表板 —— 影响范围更小，比选项 1 更受推荐。

**建议**：选项 2（移至 `ims-meta-monitoring`），除非有本规范目前不知道的，操作员面对的仪表板特别需要看到实时心跳监控的理由 —— 在彻底从他们的视图中移除它之前，请先向每天使用这些仪表板的人进行确认。

## 项目 4：数据就绪性仪表板上的生命周期质量检查

**当前状态**：`ldi-data-readiness`（“LDI 数据就绪与集成差异”）会检查原始数据的完整性（根据其自身的描述：“仅使用当前 PostgreSQL 行，基于证据的就绪性仪表板”），而不是告警生命周期的完整性。

**设计，候选检查项**（每一个都是真实的、可供核查的 SQL 条件，而非模糊的“质量”姿态）：

- 卡在 `OPEN` 状态超过合理的 SLA 的告警（例如 `> 4 hours` —— 阈值需要一个真正的业务运营标准，而不是在这里随意编造）—— `SELECT count(*) FROM ldi_alarm_lifecycle WHERE status='OPEN' AND logdate < NOW() - INTERVAL '4 hours'`。
- 孤立的生命周期行：`ldi_alarm_lifecycle` 中 `(logdate, logid)` 组合在 `ldi_alarm_log` 中没有匹配行的记录（鉴于迁移 077 的外键约束这不应该发生，但就绪性仪表板存在的意义就在于用证据来捕获这些“不应发生”的状况，而不是依靠假设）。
- 永远没在一定时间窗口内达到 `RESOLVED` 状态的 `ACKNOWLEDGED` 行 —— 与“卡在 OPEN”截然不同，这是“卡在工作流中”。

**部署**：向现有仪表板添加面板，与项目 3 的推荐方法模式相同 —— 不需要创建新仪表板，也不需要更改清单文档数量。

## 项目 5：对防抖机制进行负载测试

**当前状态**：基于 `ldi_alarm_state` 的 12 分钟冷却机制已实现并通过了代码审查（阶段 D），但从未针对真正的风暴（例如，强制让所有机器的遥测数据同时超出规格范围）进行过压力验证。

**设计**：这是一项编写测试的任务，而不是更改仪表板/数据结构 —— 拥有这 5 个项目中最低的设计复杂度，但必须针对真正的环境运行才具有实际意义，这正是为何它被推迟到冻结期 (soak freeze) 之后执行的原因。候选方案：编写一个脚本，暂时让所有机器的 `ldi_data` 行处于超规格的范围（仅限模拟模式，绝不能对真实数据执行），在几个 10 秒跳变周期内观察 `ldi_alarm_log` 的插入率，并断言防抖机制确实根据 `COOLDOWN_MIN` 所暗示的逻辑限制了按（机器，代码）的重新触发。它以设置 `LDI_SIMULATOR_ENABLED=true` (模拟模式) 作为硬性前提条件 —— 如果错误地在真实数据模式下运行，需要发出强烈的警报。

## 排序注记

项目 2 和 4 属于附加性/低风险工作，在解除冻结之后可以合理地先做。项目 1 (MTTA/MTTR) 和项目 3 (心跳监控面板移动) 属于中等工作范围。项目 5 需要加倍小心，因为它刻意对告警管道施加压力 —— 将它安排在最后，且只在模拟模式下运行。
