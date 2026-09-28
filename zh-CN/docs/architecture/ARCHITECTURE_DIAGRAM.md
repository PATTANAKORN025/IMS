<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS 可视化架构与系统拓扑参考 (Visual Architecture Reference)</h1>
  <p><b>工业监控系统的全景 C4 模型、动态时序流、网关安全拓扑与分层存储结构</b></p>
  <p>
    <a href="../../../docs/architecture/ARCHITECTURE_DIAGRAM.md">English</a> |
    <a href="../../../th/docs/architecture/ARCHITECTURE_DIAGRAM.md">ไทย</a> |
    <a href="ARCHITECTURE_DIAGRAM.md">简体中文</a>
  </p>
</div>

---

> [!TIP]
> **原始 Mermaid 定义文件**：如需在 IDE 插件或 CI 流水线中独立渲染，可直接访问原始 Mermaid 文件：[ims-system-architecture.mermaid](../../../docs/architecture/ims-system-architecture.mermaid)。

## 1. 系统上下文模型图 (C4 Model - Level 1: System Context)

系统上下文图展示了运维操作员、工艺工程师、车间现场设备、企业 IT 计算集群、网络交换机以及外部告警分发平台与 IMS 核心遥测引擎的交互关系。

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
C4Context
 title IMS 工业监控系统上下文模型图 (System Context Diagram)

 Person(noc_op, "NOC 运维工程师", "监控企业级基础设施健康状况、服务器负载与网络接口告警。")
 Person(proc_eng, "工艺质量工程师", "分析 LDI 曝光良率、Cpk 工艺制程能力，并执行根本原因分析 (RCA)。")
 Person(drill_eng, "钻孔技术专家", "排查 CNC 主轴振动异常、钻孔命中计数与刀具寿命损耗。")
 Person(vcp_tech, "电镀工艺技术员", "实时监控 VCP 电镀线速、药水槽温度及整流器电流密度。")

 System_Ext(ldi_mach, "LDI 激光曝光设备", "高精密直接成像曝光机，通过 HTTP/JSON 推送高频制造遥测。")
 System_Ext(cnc_drill, "CNC 数控钻孔机群", "机械钻孔机群将主轴转速、进给速率及机台事件写入 eap_backup。")
 System_Ext(vcp_lines, "VCP 连续电镀产线", "垂直连续电镀线记录化学药水槽参数及行车状态至 eap_backup。")
 System_Ext(servers, "Linux 生产服务器机群", "计算集群通过 SNMP v2c 提供 CPU、内存及磁盘利用率遥测。")
 System_Ext(switches, "Juniper 工业交换机", "交换网络通过 SNMP 提供接口吞吐字节数及端口丢包计数器。")
 System_Ext(line_teams, "LINE / MS Teams", "外部通知系统，负责向当班工程团队推送严重级别异常。")

 System(ims, "IMS 监控平台", "集中遥测接入、事务级连接池持久化存储及 22 个赛博朋克 HUD 仪表板。")

 Rel(noc_op, ims, "查看 NOC 总览与容量预测仪表板", "HTTPS / 端口 3000")
 Rel(proc_eng, ims, "检查 LDI 制造控制中心与 SPC 分析", "HTTPS / 端口 3000")
 Rel(drill_eng, ims, "分析钻孔机群概览与振动异常诊断", "HTTPS / 端口 3000")
 Rel(vcp_tech, ims, "监视 VCP 运营大屏与车间实时看板", "HTTPS / 端口 3000")

 Rel(ldi_mach, ims, "流式推送制造遥测数据", "HTTP POST /ldi-telemetry")
 Rel(cnc_drill, ims, "写入机台事件与设备状态", "PostgreSQL / eap_backup")
 Rel(vcp_lines, ims, "同步药水槽传感器遥测", "PostgreSQL / eap_backup")
 Rel(ims, servers, "采集主机性能指标", "SNMP v2c / UDP 161")
 Rel(ims, switches, "采集网络流量与接口统计", "SNMP v2c / UDP 161")
 Rel(ims, line_teams, "分发关键故障告警通知", "HTTPS Webhooks")
```

---

## 2. 容器拓扑模型图 (C4 Model - Level 2: Container Topology)

本图详细展示了 IMS Docker Compose 环境下的全部 15 项服务、内部容器网络架构以及外部端口映射：

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
C4Container
 title IMS 容器架构拓扑图 (15 项服务)

 Person(user, "工程师与运维人员", "通过浏览器访问监控仪表板、三维数字孪生与告警处置 API。")
 System_Ext(ext_dev, "车间现场工业边缘设备", "LDI、CNC 钻机、VCP 电镀线、服务器、交换机。")

 System_Boundary(c1, "IMS 内部容器网络 (ims_net)") {
   Container(proxy, "反向代理 (ims-proxy)", "Nginx Alpine", "统一入口网关、客户端限流与会话安全鉴权。")
   Container(grafana, "Grafana 13 (ims-grafana)", "Go", "承载涵盖 4 大业务领域的 22 个赛博朋克 HUD 仪表板。")
   Container(alarm_api, "告警 API (ims-alarm-api)", "Node.js Express", "管理 public.ldi_alarm_lifecycle 表上的告警确认与解决生命周期。")
   Container(twin_3d, "三维数字孪生 (ims-factory-twin-3d)", "Node.js Express", "一楼车间数字孪生空间可视化服务（只读模式）。")
   Container(renderer, "图像渲染引擎 (ims-grafana-renderer)", "Chromium", "生成用于告警通知与报表的面板静态 PNG 截图。")

   Container(nodered, "接入流水线 (ims-node-red)", "Node.js / Node-RED", "并行轮询采集、遥测解析、队列缓冲与告警路由。")
   Container(pgbouncer, "连接池管理器 (ims-pgbouncer)", "C / PgBouncer", "事务级连接池化，保护 TimescaleDB 免受并发耗尽。")
   ContainerDb(timescaledb, "TimescaleDB (ims-timescaledb)", "PostgreSQL 16 + TimescaleDB", "持久化存储超表 (Hypertables)、连续聚合 (CAGGs) 与告警记录。")

   Container(prometheus, "Prometheus (ims-prometheus)", "Go", "抓取服务状态指标并执行告警评估规则。")
   Container(alertmanager, "Alertmanager (ims-alertmanager)", "Go", "处理告警去重、抑制及向 Node-RED 投递通知。")
   Container(blackbox, "黑盒探针 (ims-blackbox)", "Go", "执行 HTTP/TCP 探针以验证系统服务 SLA。")
   Container(snmpsim, "SNMP 模拟器 (ims-snmpsim)", "Python", "本地开发环境下模拟 Linux 主机与交换机节点。")
   Container(archiver, "可观测性归档器 (ims-observability-archiver)", "Bash", "定期备份容器与数据库监控快照至 ops-logs。")
   Container(db_migrate, "数据库迁移器 (ims-db-migrate)", "Bash / psql", "一次性执行脚本，顺序运行 001 至 086 迁移文件。")
   Container(pgadmin, "PgAdmin 4 (ims-pgadmin4)", "Python", "Web 端数据库管理平台 (映射端口 5050)。")
 }

 Rel(user, proxy, "访问界面与各服务接口", "HTTPS / 端口 3000")
 Rel(ext_dev, proxy, "推送设备遥测", "POST /ldi-telemetry")
 Rel(nodered, ext_dev, "采集 SNMP 遥测", "UDP 161")

 Rel(proxy, grafana, "反向代理 UI 及 Grafana 内部接口", "HTTP :3000")
 Rel(proxy, alarm_api, "反向代理 /alarm-api/* (已鉴权)", "HTTP :4000")
 Rel(proxy, twin_3d, "反向代理 /factory-twin-3d/* (已鉴权)", "HTTP :4100")
 Rel(proxy, nodered, "反向代理 /ldi-telemetry 及 /inject", "HTTP :1880")
 Rel(proxy, grafana, "内部鉴权校验 (/auth-check)", "HTTP :3000")

 Rel(grafana, renderer, "请求渲染面板截图", "HTTP :8081")
 Rel(grafana, pgbouncer, "查询 CAGG 预聚合视图", "TCP :6432")
 Rel(alarm_api, pgbouncer, "更新告警生命周期 (alarm_api_writer 权限)", "TCP :6432")
 Rel(nodered, pgbouncer, "批量写入遥测数据 (Batch INSERT)", "TCP :6432")
 Rel(pgbouncer, timescaledb, "事务级数据库连接", "TCP :5432")

 Rel(prometheus, timescaledb, "抓取性能指标", "TCP :5432")
 Rel(prometheus, alertmanager, "触发告警事件", "HTTP :9093")
 Rel(alertmanager, nodered, "发送 Webhook 至 /alert-webhook", "HTTP :1880")
```

---

## 3. Node-RED 流水线组件模型图 (C4 Model - Level 3: Components)

展现 `ims-node-red` 容器内部的模块化拆分流程与数据处理管线：

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart TD
  subgraph IngressPoints ["入口触发点与接入端点"]
    TMR["定时轮询触发器 (每 30 秒)"]
    HTTP_LDI["POST /ldi-telemetry\n(经 Nginx 统一网关转发)"]
    HTTP_INJ["POST /inject\n(通用指标注入端点)"]
    AM_HOOK["POST /alert-webhook\n(Alertmanager 告警接入)"]
  end

  subgraph SplitFlows ["拆分流程模块 (nodered_data/flows/)"]
    subgraph Flow01 ["01-snmp-poller.json"]
      REG["设备注册表内存缓存\n(每 5 分钟从 public.devices 刷新)"]
      CB["熔断器状态机\n(状态: CLOSED / OPEN / HALF_OPEN)"]
      FORK["五路并行分支 fork_5_ways\n(CPU, 网络, 存储, 温度, LDI)"]
      PARSER["数据解析器 sre_parser v10\n(维护单机上下文, O(N) 复杂度)"]
    end

    subgraph Flow02 ["02-ldi-ingest.json"]
      AUTH_CHK["API Key 校验逻辑\n(比对 INGEST_API_KEY)"]
      SCHEMA_VAL["JSON 架构断言验证\n(校验 22 个标准字段)"]
      LDI_BUF["内存数据缓冲队列\n(显式内存垃圾回收: flatData.length=0)"]
    end

    subgraph Flow03 ["03-alarm-engine.json"]
      COND_EVAL["实时条件评估引擎\n(比对实时遥测阈值超限)"]
      AM_DISP["告警分发装配器\n(封装事件并投递至 Alertmanager)"]
    end

    subgraph Flow04 ["04-storage-writer.json"]
      FLUSH_TMR["批量落盘定时器 (10 秒)"]
      BATCH_BUILD["多行 SQL 构造器\n(INSERT INTO public.ldi_data...)"]
      PG_CLIENT["PgBouncer 连接客户端\n(global.get('pg'), 事务模式)"]
    end

    subgraph FlowAlerting ["alerting.json"]
      MSG_FMT["通知卡片格式化引擎\n(组装 Adaptive Cards 与 JSON)"]
      LINE_API["LINE Messaging API 发送器\n(附带认证令牌推送消息)"]
      TEAMS_API["MS Teams Webhook 发送器\n(推送富文本自适应卡片)"]
    end
  end

  subgraph PersistenceTier ["数据持久化层"]
    PGB["PgBouncer (:6432)"]
    TSDB[("TimescaleDB (:5432)\npublic.ldi_data\npublic.sys_metrics")]
  end

  TMR --> REG --> CB --> FORK --> PARSER --> BATCH_BUILD
  HTTP_LDI --> AUTH_CHK --> SCHEMA_VAL --> LDI_BUF --> BATCH_BUILD
  HTTP_INJ --> SCHEMA_VAL

  LDI_BUF --> COND_EVAL --> AM_DISP
  FLUSH_TMR --> BATCH_BUILD --> PG_CLIENT --> PGB --> TSDB

  AM_HOOK --> MSG_FMT
  MSG_FMT --> LINE_API
  MSG_FMT --> TEAMS_API
```

---

## 4. 高频遥测数据写入与渲染时序图 (High-Throughput Sequence Flow)

展示从 LDI 曝光机硬件采集开始，经网关接入、批量持久化到 Grafana 亚秒级聚合查询渲染的全链路：

```mermaid
sequenceDiagram
  autonumber
  participant Machine as LDI 曝光机现场设备
  participant Proxy as Nginx 统一网关 (ims-proxy)
  participant NodeRed as 数据接入流水线 (ims-node-red)
  participant PgBouncer as PgBouncer 连接池 (:6432)
  participant TimescaleDB as TimescaleDB (:5432)
  participant Grafana as Grafana 监控大屏 (:3000)

  Machine->>Proxy: POST /ldi-telemetry (JSON 载荷 + X-API-Key)
  Proxy->>Proxy: 执行网关限流控制 (rate=100r/s burst=2500)
  Proxy->>NodeRed: 转发至内部 :1880/ldi-telemetry 端点
  NodeRed->>NodeRed: 校验密钥并断言 22 个字段类型合法性
  NodeRed-->>Proxy: 202 Accepted {"status": "accepted", "records_queued": 1}
  Proxy-->>Machine: 202 Accepted

  Note over NodeRed: 内存队列持续累积 10 秒时间窗口内的数据
  NodeRed->>NodeRed: 构造多行批量 INSERT 语句 (VALUES 包含 NOW())
  NodeRed->>PgBouncer: 执行批量 SQL 写入事务
  PgBouncer->>TimescaleDB: 写入超表 public.ldi_data (1 小时数据块 Chunk)
  NodeRed->>NodeRed: 显式垃圾回收 (flatData.length = 0, msg.payload = null)

  Note over TimescaleDB: 连续聚合引擎按调度策略自动触发
  TimescaleDB->>TimescaleDB: 刷新聚合数据至 public.ldi_data_15m 视图

  Grafana->>PgBouncer: SELECT bucket AS time, avg_temperature FROM ldi_data_15m
  PgBouncer->>TimescaleDB: 运行预聚合高性能分析查询
  TimescaleDB-->>Grafana: 亚秒级返回已计算完毕的指标数据
  Grafana-->>Grafana: 在 Cyberpunk HUD 仪表板上实时绘制曲线
```

---

## 5. 告警全生命周期确定性状态流转时序图 (Alarm Lifecycle Sequence)

展示从告警产生、操作员确认到工程人员排查解决的全流程闭环：

```mermaid
sequenceDiagram
  autonumber
  actor Operator as NOC 当班操作员
  actor Engineer as 现场维护工程师
  participant Browser as 浏览器终端
  participant Proxy as Nginx 统一网关 (:3000)
  participant AlarmAPI as 告警微服务 (ims-alarm-api :4000)
  participant DB as TimescaleDB (public.ldi_alarm_lifecycle)

  Note over DB: 遥测引擎检测到设备参数超标 (状态: OPEN)

  Operator->>Browser: 打开 "IMS LDI - Alarm Console" 控制台
  Browser->>Proxy: GET /d/ims-ldi-alarm-console
  Proxy->>Browser: 返回活动告警面板，显示当前 OPEN 状态列表

  Operator->>Browser: 针对告警 LOG-10001 点击 "确认" (Acknowledge)
  Browser->>Proxy: POST /alarm-api/alarms/ack (携带登录 Cookie)
  Proxy->>Proxy: 子请求 GET /auth-check 校验 Grafana 用户会话 (200 OK)
  Proxy->>AlarmAPI: 转发 POST /alarms/ack {"logid": "LOG-10001", "acknowledged_by": "operator-01"}
  AlarmAPI->>DB: UPDATE ldi_alarm_lifecycle SET status='ACKNOWLEDGED', acknowledged_by='operator-01' WHERE status='OPEN'
  DB-->>AlarmAPI: 数据库记录更新成功 (返回 1 行)
  AlarmAPI-->>Proxy: 200 OK (返回更新后的 JSON 实体)
  Proxy-->>Browser: 200 OK (仪表板将该告警显示更新为琥珀黄 Amber)

  Note over Engineer: 工程师排查硬件故障并更换工作台气动滤芯
  Engineer->>Browser: 点击 "解决" (Resolve) 并填写排查说明
  Browser->>Proxy: POST /alarm-api/alarms/resolve {"logid": "LOG-10001", "resolved_by": "engineer-02", "resolution_note": "已更换滤芯"}
  Proxy->>Proxy: 校验用户会话 GET /auth-check (200 OK)
  Proxy->>AlarmAPI: 转发 POST /alarms/resolve
  AlarmAPI->>DB: UPDATE ldi_alarm_lifecycle SET status='RESOLVED', resolved_by='engineer-02', resolution_note='...' WHERE status IN ('OPEN', 'ACKNOWLEDGED')
  DB-->>AlarmAPI: 数据库记录更新成功
  AlarmAPI-->>Proxy: 200 OK
  Proxy-->>Browser: 200 OK (仪表板将状态变更为春绿 Green 已解决)
```

---

## 6. SNMP 采集容错机制：熔断器模式 (Circuit Breaker Pattern)

防止边缘设备失联或网络震荡时引发 SNMP 请求雪崩效应：

```mermaid
sequenceDiagram
  autonumber
  participant Timer as Node-RED 调度定时器 (每 30 秒)
  participant Walker as SNMP 批量采集器
  participant Breaker as 熔断器状态机 (Context State)
  participant Target as 目标边缘设备 (离线故障)
  participant DB as TimescaleDB (sys_metrics)

  Timer->>Walker: 触发本轮采集周期
  Walker->>Breaker: 查询目标设备 "SW-CORE-01" 运行状态

  alt 熔断器状态为 CLOSED (健康通行)
    Walker->>Target: 发送 SNMP GETBULK 请求 (UDP 161)
    Target--xWalker: 无响应 (超时 5000ms)
    Walker->>Breaker: 记录异常计数 (failureCount++)

    alt failureCount < 2
      Breaker-->>Walker: 维持 CLOSED 状态 (下轮继续尝试)
    else failureCount >= 2
      Breaker->>Breaker: 切换状态为 OPEN (立即熔断)
      Breaker->>DB: 写入节点离线状态 (即刻将各项指标置 0 以免误判)
      Note over Breaker: 启动 120 秒静默冷却计时器
    end

  else 熔断器状态为 OPEN (熔断阻断)
    Breaker-->>Walker: 拦截采集请求 (保护物理网络免受风暴冲击)
    Note over Walker: 跳过本轮 SNMP 报文发送

  else 冷却超时结束: 切换为 HALF_OPEN (半开探测模式)
    Breaker->>Walker: 仅允许发送单条轻量探测请求
    Walker->>Target: 发送轻量 SNMP GET 请求
    alt 设备已恢复
      Target-->>Walker: 返回正常响应报文
      Walker->>Breaker: 清空计数 failureCount = 0; 切换为 CLOSED
      Breaker->>DB: 恢复节点在线状态
    else 探测失败
      Target--xWalker: 依旧超时
      Walker->>Breaker: 重新进入 OPEN 熔断状态; 重启 120 秒冷却
    end
  end
```

---

## 7. 时序数据分层存储与连续聚合架构 (TimescaleDB Topology)

```mermaid
flowchart TD
  subgraph Ingestion ["原始遥测写入层"]
    RAW_LDI["public.ldi_data\n(超表，每 1 小时一个数据块 Chunk)"]
    RAW_INFRA["public.sys_metrics 与 net_metrics\n(超表，每 1 天一个数据块 Chunk)"]
    RAW_ALARM["public.ldi_alarm_log\n(超表，每 7 天一个数据块 Chunk)"]
  end

  subgraph CAGG_Tier1 ["第一层：分钟级预聚合"]
    CAGG_1M["public.ldi_data_1m\n(每 1 分钟计算一次最近 1 小时)"]
    CAGG_OEE_1M["public.ldi_oee_1m\n(车间实时产线稼动率)"]
  end

  subgraph CAGG_Tier2 ["第二层：15 分钟与小时级聚合"]
    CAGG_15M["public.ldi_data_15m\n(每 15 分钟计算一次)\n供制造与指挥中心仪表板读取"]
    CAGG_1H["public.ldi_data_1h\n(每 1 小时计算一次)\n供 SPC 分析及长期趋势大屏读取"]
    INFRA_1H["public.sys_metrics_1h 与 net_metrics_1h\n(基础设施小时级汇总)"]
  end

  subgraph CAGG_Tier3 ["第三层：天级与周级宏观归档"]
    CAGG_1D["public.ldi_data_1d\n(每 6 小时计算一次)\n用于长期容量预测规划"]
    CAGG_1W["public.ldi_data_1w\n(每 6 小时计算一次)\n良率历史归档"]
  end

  subgraph Retention ["生命周期保留策略 (实测系统配置)"]
    RET_RAW["原始遥测数据：30 天 (基础设施) / 180 天 (LDI)"]
    RET_HOURLY["小时级聚合数据：2 年"]
    RET_ALARM["告警日志记录：365 天"]
  end

  RAW_LDI --> CAGG_1M --> CAGG_15M --> CAGG_1H --> CAGG_1D --> CAGG_1W
  RAW_LDI --> CAGG_OEE_1M
  RAW_INFRA --> INFRA_1H

  RAW_LDI -.-> RET_RAW
  RAW_INFRA -.-> RET_RAW
  RAW_ALARM -.-> RET_ALARM
  CAGG_1H -.-> RET_HOURLY
```

---

## 8. 4 大业务领域仪表板生态图谱 (Dashboard Ecosystem)

系统内置纳管的全部 22 个 Grafana 仪表板划分在 4 大核心业务领域中：

```mermaid
flowchart LR
  subgraph D1 ["01. 数控钻孔 CNC 领域 (4 个仪表板)"]
    DR1["机群总览 (Fleet Overview)"]
    DR2["班次生产看板 (Shift Production)"]
    DR3["单机深入排查 (Machine Investigation)"]
    DR4["异常与根因分析 (Anomaly Analysis)"]
  end

  subgraph D2 ["02. 激光曝光 LDI 领域 (10 个仪表板)"]
    LDI1["制造指挥中心 (Manufacturing Center)"]
    LDI2["操作员安灯看板 (Andon Board)"]
    LDI3["告警控制台 (Alarm Console)"]
    LDI4["告警响应 MTTA/MTTR (Alarm Response)"]
    LDI5["告警字典查询 (Alarm Dictionary)"]
    LDI6["车间数字孪生 (Digital Twin Canvas)"]
    LDI7["工程分析与 SPC (Engineering & SPC)"]
    LDI8["单机快照分析 (Machine Snapshot)"]
    LDI9["数据就绪与集成度 (Data Readiness)"]
    LDI10["极简速览总览 (Easy Overview)"]
  end

  subgraph D3 ["03. 基础设施与 NOC 领域 (5 个仪表板)"]
    NOC1["NOC 监控总览 (NOC Overview)"]
    NOC2["工程钻取诊断 (Engineering Drill-Down)"]
    NOC3["AIOps 容量预测 (Capacity Forecast)"]
    NOC4["流水线接入延迟 (Ingestion Latency)"]
    NOC5["元监控与健康 (Meta-Monitoring)"]
  end

  subgraph D4 ["04. 垂直电镀 VCP 领域 (3 个仪表板)"]
    VCP1["电镀机群总览 (VCP Overview)"]
    VCP2["运营控制台 (Operations Console)"]
    VCP3["车间实时大屏 (Real-Time Wall)"]
  end

  style D1 fill:#1a1f2e,stroke:#3B82F6,color:#e2e8f0
  style D2 fill:#1a1f2e,stroke:#10B981,color:#e2e8f0
  style D3 fill:#1a1f2e,stroke:#F59E0B,color:#e2e8f0
  style D4 fill:#1a1f2e,stroke:#8B5CF6,color:#e2e8f0
```

---

## 9. 真实生产环境架构巡检命令 (Verification Commands)

直接通过命令行核验当前运行的容器与数据库内部状态：

```bash
# 1. 检查全量 14 个运行中容器的状态与端口暴露情况
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 2. 检查 PgBouncer 连接池客户端及服务端连接复用状态
docker exec -i ims-timescaledb psql -U ims_admin -p 6432 -h ims-pgbouncer -d ims_telemetry -c "SHOW POOLS;"

# 3. 检查 TimescaleDB 内部各超表的数据块分布与压缩率
docker exec -i ims-timescaledb psql -U ims_admin -d ims_telemetry -c "
SELECT hypertable_name, num_chunks, total_size, compressed_total_size
FROM timescaledb_information.hypertables
ORDER BY total_size DESC;"

# 4. 检查连续聚合视图的刷新任务与调度间隔
docker exec -i ims-timescaledb psql -U ims_admin -d ims_telemetry -c "
SELECT view_name, schedule_interval, max_interval_per_job
FROM timescaledb_information.continuous_aggregate_stats;"
```
