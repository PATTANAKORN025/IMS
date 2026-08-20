<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Decision Matrix

> 每个仪表板实际存在是为了支持什么运营决策，以及谁拥有它。于 2026 年 8 月 14 日汇编，证据巩固阶段（Evidence Consolidation Pass）。所有者数据来自 `OWNERSHIP.md`；面板数量/目的文本来自 `DASHBOARD_INVENTORY.md`（自动生成，请勿手动编辑该文件——此文件是基于其上的手工编写的分析）。
>
> 在这里，如果一个仪表板没有明确的决策，那么这个仪表板就不应该存在，或者在被信任之前需要先编写好决策说明。

## Infrastructure (owner: @PATTANAKORN025)

| Dashboard                             | Primary decision it supports                                                                                  | Audience                     | Evidence link                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------- |
| IMS NOC Overview                      | “现在是否有任何服务器宕机或性能下降？” 初步分诊（First-look triage）。                                        | On-call / NOC                | `ims-noc-overview` uid                             |
| IMS AIOps & Capacity Forecast         | “哪台机器的 CPU/RAM/磁盘会最先耗尽，我需要在什么时候采取行动？” 容量规划，而非事件响应（incident response）。 | Infra owner, planning        | `ims-capacity` uid                                 |
| IMS Engineering Drill-Down            | “我知道服务器 X 出了问题——请向我展示关于它的一切。” 根本原因分析（Root-cause），而非分诊。                    | Infra owner, post-triage     | `ims-engineering` uid                              |
| IMS Pipeline Health & Meta-Monitoring | “监控管道本身是否健康？” 监视监视者——与上面的机队（fleet）仪表板不同。                                        | Infra owner                  | `ims-meta-monitoring` uid                          |
| IMS Ingestion Latency                 | “数据到达数据库的速度是否快到足以被认为是‘实时的’？” 证据构件，而非运营仪表板——只读，这里没有警报路由。       | Engineering evidence / audit | `ims-ingestion-latency` uid, `EVIDENCE_PACK.md` §1 |

## Manufacturing (owner: @PATTANAKORN025)

| Dashboard                              | Primary decision it supports                                                                                                                                                          | Audience                                         | Evidence link                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| IMS LDI - Manufacturing Command Center | “现在生产线的运行情况如何，是否有任何事情即将成为问题？” 高管 HUD + 机器遥测 + 警报流集中在一个单一的 4 层视图中。                                                                    | Shift lead / manufacturing owner                 | `ims-ldi-manufacturing` uid                                               |
| IMS LDI - Operator Andon Board         | “现在有什么需要操作员动手处理的？” 零交互电视墙信息亭，符合 ISA-101 标准——故意不作为向下钻取（drill-down）工具。                                                                      | Line operators (TV wall)                         | `ims-ldi-operator-andon` uid, `docs/evidence/TV_WALL_FIELD_VALIDATION.md` |
| IMS LDI - Alarm Console                | “确认/解决这个特定的警报。” 唯一_交互式_的警报仪表板——将真实状态写入 `public.ldi_alarm_lifecycle`。                                                                                   | Line operators, on-call                          | `ims-ldi-alarm-console` uid                                               |
| IMS LDI - Alarm Response (MTTA/MTTR)   | “团队响应警报的速度够快吗？” 真实的 MTTA/MTTR 来自生命周期时间戳——截至 2026-08-15，坦白地说显示为 NO_DATA（有史以来 782 个警报中确认了 0 个），而是展示了一个实时的“最长等待”分诊台。 | Shift lead / manufacturing owner                 | `ims-ldi-alarm-response` uid, `SPEC_ALARM_HYGIENE_COMPLETION.md`          |
| IMS LDI - Alarm Dictionary             | “警报代码 X 实际上是什么意思，它触发的频率有多高？” 参考查询，而非监控平面——仅通过向下钻取到达。                                                                                      | Engineering, operators                           | `ims-ldi-alarm-dictionary` uid                                            |
| IMS LDI - Engineering Analytics & SPC  | “引导我了解事件发生前后参数变化的精确时间序列。” 同步的多参数 RCA（根本原因分析）时间线。                                                                                             | Process engineer, post-incident                  | `ims-ldi-engineering-analytics` uid, `docs/architecture/LDI_RCA_GUIDE.md` |
| IMS LDI - Machine Snapshot             | “这台机器在这个确切的毫秒时是什么样子的？” 针对时间点的深度钻取，可从 RCA 时间线访问。                                                                                                | Process engineer                                 | `ims-ldi-machine-snapshot` uid                                            |
| IMS Easy Overview                      | “无需任何设置即向我展示整个机队。” 没有过滤器，没有模板变量——为还不了解此系统的人准备的仪表板。                                                                                       | New user, quick check                            | `ims-easy-overview` uid                                                   |
| LDI Data Readiness & Integration Gaps  | “我可以信任即将用来构建 KPI 的数据吗？” 基于证据的准备状态检查，仅针对真实数据行，没有模拟数据。                                                                                      | Engineering, before building new dashboards/KPIs | `ldi-data-readiness` uid, `EVIDENCE_PACK.md` §5                           |
| IMS LDI - Factory Digital Twin         | “车间现场真正的物理瓶颈或异常在哪里？” 机器状态和路由约束的空间可视化。                                                                                                               | Shift lead / manufacturing owner                 | `ims-ldi-factory-digital-twin` uid                                        |

## Cross-cutting findings from building this matrix

- **没有一个仪表板缺乏决策。** 所有 15 个都映射到某人提出的一个真实问题。这在开始时并非必然保证——值得说明，因为它可能会走向另一个方向。
- **两个仪表板（“Manufacturing Command Center”和“Operator Andon Board”）都在回答“生产线运作如何”，但面向不同的受众（轮班主管与车间操作员）。** 并不多余——Andon 牌是故意设计为零交互/电视墙的，而指挥中心支持向下钻取（drill-down）。明确标记此配对，以免未来的审查者错误地将它们合并。
- **“Alarm Console”是此存储库中唯一执行写入操作的仪表板**（写入至 `ldi_alarm_lifecycle`）。其他所有仪表板（包括“Ingestion Latency”）均为只读。这是一个有意义的信任边界，值得保持可见性——只有一个写入平面，而不是十四个。
- **目前所有权属于单个人**（这两个领域的每个仪表板都是 `@PATTANAKORN025`）。`OWNERSHIP.md` 中的领域划分是为了_未来_第二个所有者设立的边界，而非今天存在此所有者的证据——不要过度声明此存储库目前尚未具备的组织成熟度。
