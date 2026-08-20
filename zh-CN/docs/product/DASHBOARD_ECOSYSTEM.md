<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# <img src="../../../docs/assets/icons/aperture.svg" width="18" align="center" /> IMS 仪表板生态系统：宏观到微观架构

**IMS（工业监控系统，Industrial Monitoring System）** 利用了包含 15 个仪表板的 "赛博朋克 HUD (Cyberpunk HUD)" 生态系统，旨在彻底消除警报疲劳，并弥合企业 IT 与物理操作技术 (OT) 之间的鸿沟。

本文档作为主目录，按 **高度（从宏观到微观，Altitude: Macro to Micro）** 进行结构化组织——确保正确的数据在确切的决策时刻传达给正确的人员角色。

---

## <img src="../../../docs/assets/icons/compass.svg" width="18" align="center" /> 5 层高度矩阵 (The 5-Tier Altitude Matrix)

该生态系统从 30,000 英尺的高管视角动态向下缩放，一直到地表以下的协议层。

### <img src="../../../docs/assets/icons/globe.svg" width="18" align="center" /> 级别 1：高管与舰队指挥 (30,000 英尺 - 宏观 MACRO)

_目标：为业务领导者和 NOC 指挥官提供即时的一瞥价值 (Glance-value)。重点关注整体健康状况、开启/关闭状态以及整体设备效率 (OEE)。_
_受众：C 级高管、工厂经理、NOC 指挥官_

1. **IMS 简易概览 (IMS Easy Overview)** (`ims-easy-overview.json`)
   - **目的：** 简化的业务级 KPI 跟踪。
   - **关键指标：** 全局系统正常运行时间、总制造产出以及二进制（开/关）的健康状态，摒弃了密集的工程技术噪音。
2. **IMS NOC 概览 (IMS NOC Overview)** (`ims-noc-overview.json`)
   - **目的：** 为 100 英寸电视墙设计的终极概览。
   - **关键指标：** 统一的舰队健康评分 (Fleet Health Score: 0-100)，前 10 名关键节点的排行榜，以及跨越 1,000 多个节点基础设施的 24 小时异常时间轴。
3. **LDI 制造指挥中心 (LDI Manufacturing Command Center)** (`ims-ldi-manufacturing.json`)
   - **目的：** 工厂车间的全景主视图。
   - **关键指标：** 整个激光直接成像 (LDI) 舰队的实时整体设备效率 (OEE)、物理良率以及生产瓶颈。

### ✈️ 级别 2：系统健康与可预测性 (10,000 英尺)

_目标：预测性操作 (AIOps)。在问题表现为系统宕机之前数天就将其解决。_
_受众：IT 部门主管、维护规划员、SRE（站点可靠性工程师）_

4. **LDI 工厂数字孪生 (LDI Factory Digital Twin)** (`ims-ldi-factory-digital-twin.json`)
   - **目的：** PCB 生产车间的实时物理代理 (Proxy)。
   - **关键指标：** 机器状态的空间映射，活跃异常的热力图 (Heatmaps)，以及物理布线与移动限制。
5. **IMS 容量规划 (IMS Capacity Planning)** (`ims-capacity-planning.json`)
   - **目的：** 利用连续聚合 (Continuous Aggregates) 进行预测性规划。
   - **关键指标：** 线性回归趋势线，精确计算磁盘阵列和网络带宽距离“达到 100% 满载的天数”。
6. **IMS 元监控 (IMS Meta-Monitoring)** (`ims-meta-monitoring.json`)
   - **目的：** “监控整个监控系统本身”。
   - **关键指标：** Node-RED 摄取管道吞吐量，SNMP walker 断路器 (Circuit Breaker) 状态，以及 TimescaleDB 查询预算。确保 IMS 平台本身永远不会发生静默故障。

### <img src="../../../docs/assets/icons/crosshair.svg" width="18" align="center" /> 级别 3：工程与深度分析 (1,000 英尺)

_目标：建立 IT 基础设施限制与 OT 制造良率之间的根本原因关联 (Root Cause Correlation)。_
_受众：系统管理员 (SysAdmins)、过程工程师、数据科学家_

7. **IMS 工程向下钻取 (IMS Engineering Drill-Down)** (`ims-engineering-drilldown.json`)
   - **目的：** 系统管理员的终极瑞士军刀。
   - **关键指标：** 通过变量切换查看单一服务器的微观指标。针对 CPU 窃取时间 (Steal time)、I/O 等待时间和丢包率，相对于 24 小时滚动基线执行 **Z-Score 异常检测**。
8. **LDI 工程分析 (LDI Engineering Analytics)** (`ims-ldi-engineering-analytics.json`)
   - **目的：** 深度过程工程数据科学。
   - **关键指标：** 将 OT 环境因素（如激光温度波动、真空压力下降）与结构性 PCB 良率缺陷相关联。
9. **IMS 摄取延迟 (IMS Ingestion Latency)** (`ims-ingestion-latency.json`)
   - **目的：** 微秒级延迟跟踪。
   - **关键指标：** 测量从工厂车间传感器发出信号，到数据通过 PgBouncer 成功提交到 PostgreSQL 之间的确切传播延迟 (Propagation delay)。

### <img src="../../../docs/assets/icons/server.svg" width="18" align="center" /> 级别 4：战术操作 (地面级别)

_目标：为操作物理硬件的人员提供二进制的、零延迟的决策支持。_
_受众：车间操作员、生产线主管、质量检验员_

10. **LDI 机器快照 (LDI Machine Snapshot)** (`ims-ldi-machine-snapshot.json`)
    - **目的：** 特定单台 LDI 机器的实时心跳。
    - **关键指标：** 当前加载的生产配方 (Recipe)，活跃激光功率，以及瞬时传感器读数。
11. **LDI 操作员安灯看板 (LDI Operator Andon)** (`ims-ldi-operator-andon.json`)
    - **目的：** 极其简化的高对比度状态板。
    - **关键指标：** 纯粹的红/绿视觉提示，作为“呼叫帮助”的安灯界面。如果是绿色，则继续工作。如果是红色，必须立即停线以防止产生废品。
12. **LDI 数据就绪状态 (LDI Data Readiness)** (`ldi-data-readiness.json`)
    - **目的：** 数据完整性验证 (Data Integrity Verification)。
    - **关键指标：** 在数据进入聚合阶段之前，于原始摄取层监控空值 (Null values)、架构损坏 (Schema corruption) 以及传感器离线状态。

### <img src="../../../docs/assets/icons/zoom-in.svg" width="18" align="center" /> 级别 5：事件管理与解决 (地表以下 - 微观 MICRO)

_目标：使用标准化剧本 (Playbooks) 对异常进行分诊 (Triaging)、确认并永久解决。_
_受众：L1/L2 支持团队、事件指挥官 (Incident Commanders)_

13. **LDI 警报控制台 (LDI Alarm Console)** (`ims-ldi-alarm-console.json`)
    - **目的：** 实时事件分诊与排查。
    - **关键指标：** 活动警报队列，相关异常的分组，以及实时确认状态 (Acknowledgment states)。
14. **LDI 警报响应 (LDI Alarm Response)** (`ims-ldi-alarm-response.json`)
    - **目的：** 事后分析 (Post-mortem) 与团队效率跟踪。
    - **关键指标：** 跟踪 SLA 合规性，平均修复时间 (MTTR)，问题升级频率，以及轮班绩效表现。
15. **LDI 警报字典 (LDI Alarm Dictionary)** (`ims-ldi-alarm-dictionary.json`)
    - **目的：** 决定性的警报映射系统。
    - **关键指标：** 静态查找表 (Static lookup tables)，将原始机器十六进制错误代码直接与 `ALARM_PLAYBOOK.md` 中人类可读的指令链接起来。

---

> [!NOTE]
> **设计理念提醒 (Design Philosophy Reminder)：** 这些仪表板都不会查询超过 24 小时时间范围的原始遥测数据。它们完全由 **TimescaleDB 连续聚合 (CAGGs)** 驱动，确保无论查询深度或用户并发量如何，都能保证亚秒级的加载时间。所有仪表板都符合 **Grid-24 纪律**，以实现数学上完美的布局缩放。
