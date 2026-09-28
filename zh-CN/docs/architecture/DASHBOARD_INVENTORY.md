# 仪表板清单 (Dashboard Inventory)

> **自动生成的文件 — 请勿手动编辑。** 使用以下命令重新生成：
> `node scripts/generate-dashboard-inventory.js`
>
> 真实数据源：`monitoring/grafana/dashboards/{drilling,infrastructure,manufacturing,vcp}/*.json`（title, uid, panel
> count, description — 全部直接从 JSON 读取，绝不手动输入）。
> 面板数量使用与
> `tests/lint/dashboard-linter.js` (`data.panels.length`) 完全相同的计算方式，因此该文件与
> linter 自身的控制台输出绝不会出现不一致。CI 检查
> (`node scripts/generate-dashboard-inventory.js --check`) 会在
> 此文件与当前仪表板内容不匹配时使构建失败。
>
> 最后生成时间：2026-09-28 | 仪表板总数：22 | 面板总数：225

## 01 · 钻孔车间运营 (Drilling Operations) (4)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-drilling-5-anomaly` | Drilling — 04 Fleet Anomaly & Root Cause Analysis | 8 | 全机群异常检测、主轴振动超差事件，以及针对 CNC 钻孔机群的多因素根因分析 (RCA)。 |
| `001` | Drilling — 01 Fleet Digital Twin & Overview | 1 | 车间实时 3D 数字孪生及所有数控钻孔机的高层运营概览。 |
| `ims-drilling-machine-detail` | Drilling — 03 Machine Investigation & Spindle Diagnostics | 5 | 单台钻孔机深度诊断控制台：主轴转速 (RPM)、电机负载、进给速度及钻头磨损遥测。 |
| `ims-drilling-history` | Drilling — 02 Shift Production & OEE Tracking | 3 | 按班次生产吞吐量、打孔次数 (Hit count)、板件产出及钻孔运营的整体设备效率 (OEE) 跟踪。 |

## 02 · 光刻车间运营 / LDI 制造 (10)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-easy-overview` | LDI — 01 Fleet Executive Overview | 8 | 同时查看整个 LDI 设备集群的最简单方法：无需设置模板变量，无需配置过滤器，打开即可。完全基于共享视图/函数构建。 |
| `ims-ldi-alarm-console` | LDI — 07 Live Alarm Management Console | 2 | 交互式警报确认/解决工作流 -- 将真实状态写入 public.ldi_alarm_lifecycle。作为只读 LDI — 02 Operator Andon Board（电视墙信息亭）的配套。 |
| `ims-ldi-alarm-dictionary` | LDI — 09 Alarm Code Dictionary & Corrective Actions | 3 | 参考查询仪表板：完整的供应商 Alarm Master 定义 + 任何 Alarm Code 的近期实际发生情况。通过 drill-down 链接打开。 |
| `ims-ldi-alarm-response` | LDI — 08 Alarm Response Metrics & MTTA/MTTR | 8 | 团队对警报的响应速度是否足够快？来自 public.ldi_alarm_lifecycle 的真实 MTTA/MTTR -- 无模拟数据。受众为轮班主管 / 制造负责人。 |
| `ims-ldi-engineering-analytics` | LDI — 06 Process Engineering Analytics & SPC | 16 | 第 3 层过程时间线：同步的多参数 RCA。temperature → humidity → scan_speed → air_vacuum → scale_x/y → pe_1~6 → je_1~4 → state。共享十字准线 + 固定轴缩放。 |
| `ims-ldi-factory-digital-twin` | LDI — 03 Factory 3D Digital Twin & Spatial Layout | 1 | 工厂 3D 数字孪生及空间布局。显示所有 10 台报告真实数据的 LDI 机器 (LDI-01..LDI-10)，按 5 个真实物理区域分组。 |
| `ims-ldi-machine-snapshot` | LDI — 05 Machine Deep-Dive Snapshot | 14 | 从过程时间线点击的确切毫秒处的 360° 机器快照。显示作业上下文、物理变量、PE 对齐、Cpk 和警报接近度。 |
| `ims-ldi-manufacturing` | LDI — 04 Manufacturing Fleet Command Center | 33 | 4 层 RCA 仪表板：高管 HUD + 机器遥测 + 生产上下文 + 警报流。模式驱动的命名。共享十字准线。固定轴缩放。 |
| `ims-ldi-operator-andon` | LDI — 02 Operator Andon Board (Shopfloor Kiosk) | 11 | 车间信息亭。符合 ISA-101 标准。零交互，零滚动。1280x720 分辨率。模板变量选择器和向下钻取链接行被隐藏。 |
| `ldi-data-readiness` | LDI — 10 Telemetry Signal Quality & Integration Readiness | 17 | 仅使用当前 PostgreSQL 行的基于证据的遥测信号质量与集成就绪状态仪表板。无模拟数据。 |

## 03 · 平台基础设施与 NOC (5)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-capacity` | Platform — 03 AIOps Predictive Capacity & Resource Forecasting | 16 | 通过 30 天线性回归预测 CPU、RAM 和磁盘的耗尽天数/饱和度，结合 Z-Score (>3sigma) 异常检测。侧重于基础设施。 |
| `ims-engineering` | Platform — 02 Host & Network Infrastructure Engineering Drill-Down | 25 | 单台服务器深度剖析：所选机器的 CPU/RAM/磁盘/温度/网络仪表和时间序列，加上旧版流水线 LDI 吞吐量/质量以及 Z-Score 异常检测面板。 |
| `ims-ingestion-latency` | Platform — 04 Ingestion Pipeline Latency & Telemetry SLO | 13 | 只读。来自迁移 081 的 ingest_ts 列的真实 source_ts -> ingest_ts 延迟证据 -- 无模拟数据。配套 tests/e2e/ingestion-latency-check.js。 |
| `ims-meta-monitoring` | Platform — 05 Pipeline Reliability & SRE Meta-Monitoring | 16 | 摄取流水线自身的健康状况：行/秒插入速率、批处理成功率、重试队列深度、断路器状态和设备轮询率。 |
| `ims-noc-overview` | Platform — 01 Network Operations Center (NOC) Overview | 7 | 仅限基础设施（服务器）网络运营中心 (NOC) 概览。 |

## 04 · 电镀车间运营 / VCP 垂直连续电镀线 (3)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-vcp-operations-console` | VCP — 02 Plating Line Operations Console | 7 | 垂直连续电镀 (VCP) 线的运营控制台：各线最新状态、正在电镀的批次、7 步槽液温度、18 个工位的电流电压及警报日志。 |
| `ims-vcp-overview` | VCP — 01 Plating Fleet Overview & Process Analytics | 10 | 电镀机群概览与过程分析：按状态统计小时数、槽液与工位电流设定值偏差、槽电阻、泵偏差、批次工艺配方合规性及警报。 |
| `ims-vcp-realtime-wall` | VCP — 03 Real-Time Plating Line Wall Display | 1 | 垂直连续电镀 (VCP) 线的实时电视墙显示：每条生产线一张卡片，显示状态、当前作业、槽温、18 台电镀整流器（A/B 面电流电压）、18 台循环泵。 |
