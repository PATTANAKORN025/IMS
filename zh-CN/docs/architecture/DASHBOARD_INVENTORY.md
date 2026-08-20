# Dashboard Inventory

> **自动生成的文件 — 请勿手动编辑。** 使用以下命令重新生成：
> `node scripts/generate-dashboard-inventory.js`
>
> 真实数据源：`monitoring/grafana/dashboards/{infrastructure,manufacturing}/*.json`（title, uid, panel
> count, description — 全部直接从 JSON 读取，绝不手动输入）。
> 面板数量使用与
> `tests/lint/dashboard-linter.js` (`data.panels.length`) 完全相同的计算方式，因此该文件与
> linter 自身的控制台输出绝不会出现不一致。CI 检查
> (`node scripts/generate-dashboard-inventory.js --check`) 会在
> 此文件与当前仪表板内容不匹配时使构建失败。
>
> 最后生成时间：2026-08-18 | 仪表板总数：15 | 面板总数：190

## Infrastructure (5)

| UID                     | Title                                 | Panels | Purpose                                                                                                                                                      |
| ----------------------- | ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ims-capacity`          | IMS AIOps & Capacity Forecast         | 16     | 通过 30 天线性回归预测 CPU、RAM 和磁盘的剩余可用天数/饱和度，加上 Z-Score (>3sigma) 异常检测。侧重于基础设施。                                               |
| `ims-engineering`       | IMS Engineering Drill-Down            | 25     | 单台服务器深度剖析：所选机器的 CPU/RAM/磁盘/温度/网络仪表和时间序列，加上旧版流水线 LDI 吞吐量/质量以及 Z-Score 异常检测面板。                               |
| `ims-ingestion-latency` | IMS Ingestion Latency                 | 13     | 只读。来自迁移 081 的 ingest_ts 列的真实 source_ts -> ingest_ts 延迟证据 -- 无模拟数据，无交互式写入操作。作为 tests/e2e/ingestion-latency-check.js 的配套。 |
| `ims-meta-monitoring`   | IMS Pipeline Health & Meta-Monitoring | 16     | 摄取流水线自身的健康状况：行/秒插入速率、批处理成功率、重试队列深度、断路器状态和设备轮询率。监控的是流水线本身，而不是它所监控的设备集群。                  |
| `ims-noc-overview`      | IMS NOC Overview                      | 7      | 仅限基础设施（服务器） -- LDI 过程/质量指标存在于 Manufacturing 和 Machine Snapshot 仪表板上。                                                               |

## LDI Manufacturing (10)

| UID                             | Title                                                 | Panels | Purpose                                                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ims-easy-overview`             | IMS Easy Overview                                     | 8      | 同时查看整个 LDI 设备集群的最简单方法：无需设置模板变量，无需配置过滤器，只需打开即可。完全由本仓库的共享视图/函数（v_ldi_machine_latest_full, v_ldi_alarm_c...）构建。                                             |
| `ims-ldi-alarm-console`         | IMS LDI - Alarm Console                               | 2      | 交互式警报确认/解决工作流 -- 将真实状态写入 public.ldi_alarm_lifecycle。作为只读 IMS LDI - Operator Andon Board（电视墙信息亭，无交互元素）的配套。                                                                 |
| `ims-ldi-alarm-dictionary`      | IMS LDI - Alarm Dictionary                            | 3      | 参考查询仪表板：完整的供应商 Alarm Master 定义 + 任何 Alarm Code 的近期实际发生情况。不属于操作员/工程导航流程的一部分 -- 通过来自 Alarm Code 列的向下钻取链接打开...                                               |
| `ims-ldi-alarm-response`        | IMS LDI - Alarm Response (MTTA/MTTR)                  | 8      | 团队对警报的响应速度是否足够快？来自 public.ldi_alarm_lifecycle 的真实 MTTA/MTTR -- 无模拟数据。受众为轮班主管 / 制造负责人，与 Manufacturing Command Center 相同。                                                 |
| `ims-ldi-engineering-analytics` | IMS LDI - Engineering Analytics & SPC                 | 16     | 第 3 层过程时间线：同步的多参数 RCA。temperature → humidity → scan_speed → air_vacuum → scale_x/y → pe_1~~6 → je_1~~4 → state。共享十字准线 + 工具提示。固定轴缩放。                                                |
| `ims-ldi-factory-digital-twin`  | IMS LDI - Factory Digital Twin                        | 1      | TASK 3 -- 完整的 10 台机器 Canvas 工厂数字孪生，从 Task 2 的 2 台机器 POC 扩展而来。显示所有 10 台报告真实数据的 LDI 机器 (LDI-01..LDI-10)，这些机器被分组到其 5 个真实区域 (public.devices.location) 中，2 台机... |
| `ims-ldi-machine-snapshot`      | IMS LDI - Machine Snapshot                            | 14     | 从过程时间线点击的确切毫秒处的 360° 机器快照。显示作业上下文、物理变量、PE 对齐、Cpk 和警报接近度。                                                                                                                 |
| `ims-ldi-manufacturing`         | IMS LDI - Manufacturing Command Center                | 33     | 4 层 RCA 仪表板：高管 HUD + 机器遥测 + 生产上下文 + 警报流。模式驱动的命名。共享十字准线。固定轴缩放。                                                                                                              |
| `ims-ldi-operator-andon`        | IMS LDI - Operator Andon Board                        | 11     | 车间信息亭。符合 ISA-101 标准。零交互，零滚动。1280x720 分辨率。根据早期的 1920x1080 布局（系统审计第 5 阶段）重新设计：模板变量选择器和向下钻取链接行被隐藏...                                                     |
| `ldi-data-readiness`            | LDI Data Readiness & Integration Gaps (Real Database) | 17     | 仅使用当前 PostgreSQL 行的基于证据的就绪状态仪表板。无模拟数据。                                                                                                                                                    |
