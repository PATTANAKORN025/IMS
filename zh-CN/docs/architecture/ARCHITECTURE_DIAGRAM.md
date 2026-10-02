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
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: C4 第 1 层：系统上下文
  accDescr: 四类用户通过浏览器使用 IMS；IMS 通过 HTTP 接收 LDI 遥测、通过 SNMP 轮询服务器与交换机、读取工厂钻孔与 VCP 数据库，并向 LINE 与 Microsoft Teams 发送告警。

  subgraph PEOPLE["用户"]
    NOC["NOC 操作员<br/>[人员]<br/>基础设施健康"]:::actor
    PE["工艺工程师<br/>[人员]<br/>LDI 良率、SPC、RCA"]:::actor
    DRL["钻孔专员<br/>[人员]<br/>机台事件与告警"]:::actor
    VCPT["电镀技术员<br/>[人员]<br/>槽液、电流、线速"]:::actor
  end

  IMS["IMS<br/>[软件系统]<br/>采集、存储、22 个仪表板、告警"]:::app

  subgraph EXT["外部系统"]
    LDIM["LDI 机台<br/>[外部]<br/>HTTP JSON"]:::ext
    NET["服务器与交换机<br/>[外部]<br/>SNMP v2c agent"]:::ext
    EAPSRC["工厂 EAP 数据库<br/>[外部]<br/>钻孔与 VCP 记录"]:::ext
    MSG["LINE · Microsoft Teams<br/>[外部]"]:::notify
  end

  NOC -->|"HTTP :3000"| IMS
  PE -->|"HTTP :3000"| IMS
  DRL -->|"HTTP :3000"| IMS
  VCPT -->|"HTTP :3000"| IMS
  LDIM -->|"POST /ldi-telemetry · X-API-Key"| IMS
  NET -->|"SNMP v2c · UDP 161 · 被轮询"| IMS
  EAPSRC -.->|"恢复到 eap_backup"| IMS
  IMS -->|"HTTPS"| MSG

  subgraph LEGEND["图例 · 箭头 = 数据流向"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_actor["人员"]:::actor ~~~ LG_app["IMS 服务"]:::app ~~~ LG_ext["外部系统"]:::ext ~~~ LG_notify["通知"]:::notify
    end
  end
  MSG ~~~ LEGEND
  style LEGEND fill:transparent,stroke:#94a3b8,stroke-dasharray:3 3
  style LEGEND_0 fill:transparent,stroke:transparent
  classDef actor fill:#475569,stroke:#1e293b,color:#ffffff,stroke-width:1px
  classDef ext fill:#57534e,stroke:#292524,color:#ffffff,stroke-width:1px
  classDef ingress fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff,stroke-width:1px
  classDef app fill:#0f766e,stroke:#134e4a,color:#ffffff,stroke-width:1px
  classDef flow fill:#0e7490,stroke:#164e63,color:#ffffff,stroke-width:1px
  classDef store fill:#b45309,stroke:#78350f,color:#ffffff,stroke-width:1px
  classDef viz fill:#4338ca,stroke:#312e81,color:#ffffff,stroke-width:1px
  classDef obs fill:#6d28d9,stroke:#4c1d95,color:#ffffff,stroke-width:1px
  classDef notify fill:#b91c1c,stroke:#7f1d1d,color:#ffffff,stroke-width:1px
  classDef future fill:#f8fafc,stroke:#94a3b8,color:#475569,stroke-width:1px,stroke-dasharray:4 3
```

---

## 2. 容器拓扑模型图 (C4 Model - Level 2: Container Topology)

本图详细展示了 IMS Docker Compose 环境下的全部 16 项服务、内部容器网络架构以及外部端口映射：

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: C4 第 2 层：16 个容器
  accDescr: 全部 16 个 Docker Compose 服务及其连接：nginx 是唯一监听所有网卡的端口；数据服务位于 ims-internal；监控位于 ims-monitoring；archiver 只能通过隔离网络 ims-docker-api 上的 socket proxy 访问 Docker。

  USER["用户 · 浏览器"]:::actor
  EDGE["LDI 机台 · SNMP 设备"]:::ext

  subgraph INGRESS["主机端口 3000，所有网卡"]
    PROXY["proxy · nginx 1.31<br/>ims-proxy"]:::ingress
  end

  subgraph APP["应用 · ims-internal"]
    GRAF["grafana 13.1.2<br/>22 个仪表板"]:::viz
    RENDER["renderer<br/>图像渲染"]:::app
    ALARM["alarm-api :4000<br/>Express"]:::app
    TWIN["factory-twin-3d :4100<br/>Express"]:::app
    NR["node-red :1880<br/>5 个流程文件"]:::flow
    SNMPSIM["snmpsim<br/>模拟 agent"]:::app
  end

  subgraph DATA["数据 · ims-internal"]
    MIG["db-migrate<br/>一次性，迁移 013–093"]:::app
    PGB["pgbouncer :5432<br/>SCRAM"]:::app
    TSDB[("timescaledb :5432<br/>ims · eap_backup")]:::store
    PGADMIN["pgadmin<br/>127.0.0.1:5050"]:::app
  end

  subgraph MONNET["监控 · ims-monitoring"]
    PROM["prometheus<br/>127.0.0.1:9090"]:::obs
    AM["alertmanager<br/>127.0.0.1:9093"]:::obs
    BBOX["blackbox-exporter<br/>127.0.0.1:9115"]:::obs
  end

  subgraph DOCKERAPI["ims-docker-api · 内部，无出口"]
    ARCH["observability-archiver<br/>同时位于 ims-internal"]:::app
    SOCK["docker-socket-proxy<br/>只读端点"]:::app
  end

  USER -->|"HTTP :3000"| PROXY
  EDGE -->|"POST /ldi-telemetry"| PROXY
  EDGE -->|"SNMP v2c"| NR
  SNMPSIM -->|"SNMP v2c"| NR
  PROXY --> GRAF
  PROXY -->|"auth_request /alarm-api/"| ALARM
  PROXY -->|"auth_request /factory-twin-3d/"| TWIN
  PROXY -->|"/ldi-telemetry · /inject"| NR
  GRAF <-->|"渲染请求 / 回调"| RENDER
  GRAF -->|"timescaledb"| PGB
  GRAF -->|"drilling-timescaledb"| TSDB
  ALARM -->|"alarm_api_writer"| PGB
  TWIN --> PGB
  NR -->|"nodered_writer"| PGB
  ARCH -->|"observability_archiver"| TSDB
  PGB --> TSDB
  MIG --> TSDB
  PGADMIN --> TSDB
  NR -->|"/metrics"| PROM
  BBOX -->|"探测结果"| PROM
  PROM --> AM
  AM -->|"/alert-webhook"| NR
  GRAF -->|"/alert-webhook"| NR
  ARCH -->|"HTTP :2375"| SOCK

  subgraph LEGEND["图例 · 箭头 = 数据流向"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_actor["人员"]:::actor ~~~ LG_ext["外部系统"]:::ext ~~~ LG_ingress["入口 / 网关"]:::ingress ~~~ LG_flow["Node-RED 流程"]:::flow ~~~ LG_app["IMS 服务"]:::app
    end
    subgraph LEGEND_1[" "]
      direction LR
      LG_store["数据存储"]:::store ~~~ LG_viz["Grafana / UI"]:::viz ~~~ LG_obs["监控"]:::obs
    end
    LEGEND_0 ~~~ LEGEND_1
  end
  SOCK ~~~ LEGEND
  style LEGEND fill:transparent,stroke:#94a3b8,stroke-dasharray:3 3
  style LEGEND_0 fill:transparent,stroke:transparent
  style LEGEND_1 fill:transparent,stroke:transparent
  classDef actor fill:#475569,stroke:#1e293b,color:#ffffff,stroke-width:1px
  classDef ext fill:#57534e,stroke:#292524,color:#ffffff,stroke-width:1px
  classDef ingress fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff,stroke-width:1px
  classDef app fill:#0f766e,stroke:#134e4a,color:#ffffff,stroke-width:1px
  classDef flow fill:#0e7490,stroke:#164e63,color:#ffffff,stroke-width:1px
  classDef store fill:#b45309,stroke:#78350f,color:#ffffff,stroke-width:1px
  classDef viz fill:#4338ca,stroke:#312e81,color:#ffffff,stroke-width:1px
  classDef obs fill:#6d28d9,stroke:#4c1d95,color:#ffffff,stroke-width:1px
  classDef notify fill:#b91c1c,stroke:#7f1d1d,color:#ffffff,stroke-width:1px
  classDef future fill:#f8fafc,stroke:#94a3b8,color:#475569,stroke-width:1px,stroke-dasharray:4 3
```

---

## 3. Node-RED 流水线组件模型图 (C4 Model - Level 3: Components)

展现 `ims-node-red` 容器内部的模块化拆分流程与数据处理管线：

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: C4 第 3 层：Node-RED 组件
  accDescr: nodered_data/flows 中的 5 个流程文件及各自写入的内容：带断路器和文件重试队列的 SNMP 轮询、先写 staging 的 LDI 采集、两个模拟器以及告警投递。

  subgraph F1["ingestion.json"]
    T30["Poll Fleet · 每 30 秒"]:::flow
    REG["设备注册表<br/>public.devices · 每 5 分钟刷新"]:::flow
    CB["断路器<br/>失败 2 次后打开 · 冷却 5 分钟"]:::flow
    FORK["fork_5_ways<br/>CPU · 存储 · 网络 · 温度 · LDI"]:::flow
    PARSER["SRE AIOps Parser v9<br/>每设备状态 · 批量缓冲"]:::flow
    RETRY["重试队列<br/>/data/retry_queue.json · 每 30 秒处理"]:::flow
    INJ["POST /inject<br/>压测数据生成器"]:::flow
    MET["GET /metrics<br/>ims_pipeline_* · ims_circuit_breaker_*"]:::flow
  end

  subgraph F2["ldi_ingestion.json"]
    LPOST["POST /ldi-telemetry"]:::flow
    AUTH["校验 X-API-Key → 401"]:::flow
    VAL["JSON 数组，36 列<br/>必须有 eqp_id + log_id → 400 / 413"]:::flow
    STG["暂存批次 → 失败返回 503"]:::flow
    INS["写入 ldi_data → 失败返回 502"]:::flow
    DONE["删除暂存行 → 200"]:::flow
  end

  subgraph F3["模拟器"]
    SIMLDI["ldi_simulator.json<br/>每 2 秒 · OU 模型"]:::flow
    SIMALM["ldi_alarm_simulator.json<br/>每 10 秒 · 暂存后写入"]:::flow
  end

  subgraph F4["alerting.json"]
    HOOK["POST /alert-webhook"]:::flow
    BEARER["校验 Bearer token"]:::flow
    FMT["格式化 LINE 消息 / Teams Adaptive Card"]:::flow
  end

  PGB["PgBouncer :5432 · nodered_writer"]:::app
  TSDB[("TimescaleDB · ims")]:::store
  NOTIFY["LINE · MS Teams"]:::notify
  PROM["Prometheus"]:::obs

  T30 --> REG --> CB --> FORK --> PARSER
  INJ --> FORK
  PARSER -->|"sys_metrics · net_metrics · ldi_metrics"| PGB
  PARSER -.->|"写入失败时"| RETRY
  RETRY -->|"最多重试 5 次"| PGB
  LPOST --> AUTH --> VAL --> STG --> INS --> DONE
  STG -->|"ingest_staging"| PGB
  INS -->|"ldi_data"| PGB
  SIMLDI -->|"127.0.0.1:1880/ldi-telemetry"| LPOST
  SIMALM -->|"ingest_staging · ldi_alarm_log · ldi_alarm_lifecycle"| PGB
  HOOK --> BEARER --> FMT --> NOTIFY
  PGB --> TSDB
  MET --> PROM

  subgraph LEGEND["图例 · 箭头 = 数据流向"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_flow["Node-RED 流程"]:::flow ~~~ LG_app["IMS 服务"]:::app ~~~ LG_store["数据存储"]:::store ~~~ LG_obs["监控"]:::obs ~~~ LG_notify["通知"]:::notify
    end
  end
  PROM ~~~ LEGEND
  style LEGEND fill:transparent,stroke:#94a3b8,stroke-dasharray:3 3
  style LEGEND_0 fill:transparent,stroke:transparent
  classDef actor fill:#475569,stroke:#1e293b,color:#ffffff,stroke-width:1px
  classDef ext fill:#57534e,stroke:#292524,color:#ffffff,stroke-width:1px
  classDef ingress fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff,stroke-width:1px
  classDef app fill:#0f766e,stroke:#134e4a,color:#ffffff,stroke-width:1px
  classDef flow fill:#0e7490,stroke:#164e63,color:#ffffff,stroke-width:1px
  classDef store fill:#b45309,stroke:#78350f,color:#ffffff,stroke-width:1px
  classDef viz fill:#4338ca,stroke:#312e81,color:#ffffff,stroke-width:1px
  classDef obs fill:#6d28d9,stroke:#4c1d95,color:#ffffff,stroke-width:1px
  classDef notify fill:#b91c1c,stroke:#7f1d1d,color:#ffffff,stroke-width:1px
  classDef future fill:#f8fafc,stroke:#94a3b8,color:#475569,stroke-width:1px,stroke-dasharray:4 3
```

---

## 4. 高频遥测数据写入与渲染时序图 (High-Throughput Sequence Flow)

展示从 LDI 曝光机硬件采集开始，经网关接入、批量持久化到 Grafana 亚秒级聚合查询渲染的全链路：

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
sequenceDiagram
  accTitle: 先写 staging 的 LDI 遥测采集
  accDescr: 批次只有在提交后才会被确认：Node-RED 先写入 ingest_staging，再写入 ldi_data，删除暂存副本并返回 200；失败时返回 400、401、413、503 或 502，写入失败时暂存副本保留以便恢复。
  autonumber
  participant M as LDI 机台
  participant P as nginx (ims-proxy)
  participant N as ldi_ingestion.json
  participant B as PgBouncer
  participant T as TimescaleDB
  M->>P: POST /ldi-telemetry · X-API-Key · JSON array
  Note over P: 每客户端 50 r/s，突发 100
  P->>N: 转发到 node-red:1880
  alt key 错误 / 请求体错误 / 行数过多
    N-->>M: 401 · 400 · 413
  else 批次有效
    N->>B: INSERT INTO ingest_staging RETURNING id
    B->>T: 写入暂存批次
    alt 暂存失败
      N-->>M: 503 · 未接收
    else 已暂存
      N->>B: INSERT INTO ldi_data … ON CONFLICT DO NOTHING
      B->>T: 写入行（源时间戳）
      alt 写入失败
        N->>B: UPDATE ingest_staging SET attempts + 1
        N-->>M: 502 · 保留暂存副本
      else 已提交
        N->>B: DELETE FROM ingest_staging WHERE id
        N-->>M: 200 OK
      end
    end
  end
  Note over T: CAGG 策略每分钟刷新 ldi_data_1m
```

---

## 5. 告警全生命周期确定性状态流转时序图 (Alarm Lifecycle Sequence)

展示从告警产生、操作员确认到工程人员排查解决的全流程闭环：

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
sequenceDiagram
  accTitle: 告警确认与解决
  accDescr: 操作员在告警控制台确认告警、工程师解决告警；nginx 先校验 Grafana 会话，alarm-api 再更新 ldi_alarm_lifecycle，执行人始终为会话登录用户。
  autonumber
  actor O as 操作员 / 工程师
  participant P as nginx
  participant G as Grafana /api/user
  participant A as alarm-api
  participant D as ldi_alarm_lifecycle
  Note over D: 新告警行初始为 OPEN（触发器）
  O->>P: POST /alarm-api/alarms/ack · {logdate_ms, logid}
  P->>G: auth_request · 会话 cookie
  alt 会话无效
    P-->>O: 401
  else Viewer 角色
    A-->>O: 403
  else Editor / Admin
    P->>A: 转发 + 会话登录名
    A->>D: UPDATE … SET status = 'ACKNOWLEDGED' WHERE status = 'OPEN'
    A-->>O: 200 · 若不是 OPEN 则 409
  end
  O->>P: POST /alarm-api/alarms/resolve · {logdate_ms, logid, resolution_note}
  P->>G: auth_request
  P->>A: 转发
  A->>D: UPDATE … SET status = 'RESOLVED' WHERE status IN ('OPEN', 'ACKNOWLEDGED')
  A-->>O: 200 · 若已 RESOLVED 则 409
```

---

## 6. SNMP 采集容错机制：熔断器模式 (Circuit Breaker Pattern)

防止边缘设备失联或网络震荡时引发 SNMP 请求雪崩效应：

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
sequenceDiagram
  accTitle: SNMP 断路器
  accDescr: 每 30 秒的轮询会检查保存在 Node-RED 流上下文中的每设备断路器：连续失败 2 次即打开，打开时跳过该设备，5 分钟后下一次轮询作为单次探测，决定关闭或重新打开。
  autonumber
  participant T as Poll Fleet (30 s)
  participant C as 断路器 · 流上下文 cb_DEVICE
  participant W as SNMP walker
  participant D as 设备
  participant P as Parser v9
  T->>C: checkDevice()
  alt CLOSED
    C-->>W: 允许
    W->>D: GETBULK (UDP 161, timeout 6000 ms)
    alt 有响应
      D-->>W: varbinds
      W->>C: recordSuccess() · failures = 0
      W->>P: 指标 → 批量写入
    else 超时
      W->>C: recordFailure() · failures + 1
      Note over C: 连续第 2 次失败 → OPEN，trips + 1
      W->>P: 离线心跳 → 指标置零
    end
  else OPEN 未满 5 分钟
    C-->>T: 本轮跳过该设备
  else OPEN 已满 5 分钟
    C->>C: HALF_OPEN
    C-->>W: 允许一次探测
    W->>D: GETBULK
    alt 探测成功
      W->>C: recordSuccess() → CLOSED
    else 探测失败
      W->>C: recordFailure() → OPEN
    end
  end
  Note over C: 在 GET /metrics 导出为 ims_circuit_breaker_state / _trips_total
```

---

## 7. 时序数据分层存储与连续聚合架构 (TimescaleDB Topology)

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: Hypertable、连续聚合与保留策略
  accDescr: 原始 hypertable 供给 7 个连续聚合；每个框显示实际数据库中配置的刷新计划与保留期。3 个基础设施小时聚合没有保留策略。

  subgraph RAW["原始 hypertable"]
    LDI[("ldi_data<br/>1 天分块 · 7 天后压缩 · 保留 180 天")]:::store
    INF[("sys_metrics · net_metrics · ldi_metrics<br/>1 天分块 · 7 天后压缩 · 保留 30 天")]:::store
    ALM[("ldi_alarm_log<br/>7 天分块 · 保留 365 天")]:::store
  end

  subgraph LDICAGG["LDI 聚合"]
    C1M[("ldi_data_1m<br/>每 1 分钟 · 窗口 2 小时 · 保留 30 天")]:::store
    C15[("ldi_data_15m<br/>每 15 分钟 · 窗口 3 小时 · 保留 90 天")]:::store
    C1H[("ldi_data_1h<br/>每 1 小时 · 窗口 1 天 · 保留 2 年")]:::store
    CHR[("ldi_data_hourly<br/>每 1 小时 · 窗口 3 天 · 实时 · 保留 2 年")]:::store
  end

  subgraph INFCAGG["基础设施聚合"]
    SH[("sys_hourly · net_hourly · ldi_hourly<br/>每 30 分钟 · 窗口 6 小时 · 无保留策略")]:::store
  end

  LDI --> C1M --> C15 --> C1H
  LDI --> CHR
  INF --> SH

  subgraph LEGEND["图例 · 箭头 = 数据流向"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_store["数据存储"]:::store
    end
  end
  SH ~~~ LEGEND
  style LEGEND fill:transparent,stroke:#94a3b8,stroke-dasharray:3 3
  style LEGEND_0 fill:transparent,stroke:transparent
  classDef actor fill:#475569,stroke:#1e293b,color:#ffffff,stroke-width:1px
  classDef ext fill:#57534e,stroke:#292524,color:#ffffff,stroke-width:1px
  classDef ingress fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff,stroke-width:1px
  classDef app fill:#0f766e,stroke:#134e4a,color:#ffffff,stroke-width:1px
  classDef flow fill:#0e7490,stroke:#164e63,color:#ffffff,stroke-width:1px
  classDef store fill:#b45309,stroke:#78350f,color:#ffffff,stroke-width:1px
  classDef viz fill:#4338ca,stroke:#312e81,color:#ffffff,stroke-width:1px
  classDef obs fill:#6d28d9,stroke:#4c1d95,color:#ffffff,stroke-width:1px
  classDef notify fill:#b91c1c,stroke:#7f1d1d,color:#ffffff,stroke-width:1px
  classDef future fill:#f8fafc,stroke:#94a3b8,color:#475569,stroke-width:1px,stroke-dasharray:4 3
```

---

## 8. 4 大业务领域仪表板生态图谱 (Dashboard Ecosystem)

系统内置纳管的全部 22 个 Grafana 仪表板划分在 4 大核心业务领域中：

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart TB
  accTitle: 按文件夹划分的 22 个预置仪表板
  accDescr: 4 个 Grafana 文件夹及其仪表板标题和 UID；钻孔与 VCP 通过 drilling-timescaledb 数据源读取 eap_backup 数据库，LDI 与平台仪表板通过 PgBouncer 读取 ims 数据库。
  EAP[("eap_backup · drilling-timescaledb")]:::store
  IMS[("ims · timescaledb 经 PgBouncer")]:::store
  subgraph DRL["01 · 钻孔 (CNC)"]
    DRL0["01 Fleet Digital Twin & Overview<br/><code>001</code>"]:::viz
    DRL1["02 Shift Production & OEE Tracking<br/><code>ims-drilling-history</code>"]:::viz
    DRL2["03 Machine Investigation & Spindle Diagnostics<br/><code>ims-drilling-machine-detail</code>"]:::viz
    DRL3["04 Fleet Anomaly & Root Cause Analysis<br/><code>ims-drilling-5-anomaly</code>"]:::viz
  end
  EAP --> DRL
  subgraph VCP["04 · 电镀 (VCP)"]
    VCP0["01 Plating Fleet Overview & Process Analytics<br/><code>ims-vcp-overview</code>"]:::viz
    VCP1["02 Plating Line Operations Console<br/><code>ims-vcp-operations-console</code>"]:::viz
    VCP2["03 Real-Time Plating Line Wall Display<br/><code>ims-vcp-realtime-wall</code>"]:::viz
  end
  EAP --> VCP
  subgraph LDI["02 · 光刻 (LDI)"]
    LDI0["01 Fleet Executive Overview<br/><code>ims-easy-overview</code>"]:::viz
    LDI1["02 Operator Andon Board (Shopfloor Kiosk)<br/><code>ims-ldi-operator-andon</code>"]:::viz
    LDI2["03 Factory 3D Digital Twin & Spatial Layout<br/><code>ims-ldi-factory-digital-twin</code>"]:::viz
    LDI3["04 Manufacturing Fleet Command Center<br/><code>ims-ldi-manufacturing</code>"]:::viz
    LDI4["05 Machine Deep-Dive Snapshot<br/><code>ims-ldi-machine-snapshot</code>"]:::viz
    LDI5["06 Process Engineering Analytics & SPC<br/><code>ims-ldi-engineering-analytics</code>"]:::viz
    LDI6["07 Live Alarm Management Console<br/><code>ims-ldi-alarm-console</code>"]:::viz
    LDI7["08 Alarm Response Metrics & MTTA/MTTR<br/><code>ims-ldi-alarm-response</code>"]:::viz
    LDI8["09 Alarm Code Dictionary & Corrective Actions<br/><code>ims-ldi-alarm-dictionary</code>"]:::viz
    LDI9["10 Telemetry Signal Quality & Integration Readiness<br/><code>ldi-data-readiness</code>"]:::viz
  end
  IMS --> LDI
  subgraph PLT["03 · 平台与 NOC"]
    PLT0["01 Network Operations Center (NOC) Overview<br/><code>ims-noc-overview</code>"]:::viz
    PLT1["02 Host & Network Infrastructure Engineering Drill-Down<br/><code>ims-engineering</code>"]:::viz
    PLT2["03 AIOps Predictive Capacity & Resource Forecasting<br/><code>ims-capacity</code>"]:::viz
    PLT3["04 Ingestion Pipeline Latency & Telemetry SLO<br/><code>ims-ingestion-latency</code>"]:::viz
    PLT4["05 Pipeline Reliability & SRE Meta-Monitoring<br/><code>ims-meta-monitoring</code>"]:::viz
  end
  IMS --> PLT

  subgraph LEGEND["图例 · 箭头 = 数据流向"]
    direction TB
    subgraph LEGEND_0[" "]
      direction LR
      LG_store["数据存储"]:::store ~~~ LG_viz["Grafana / UI"]:::viz
    end
  end
  PLT ~~~ LEGEND
  style LEGEND fill:transparent,stroke:#94a3b8,stroke-dasharray:3 3
  style LEGEND_0 fill:transparent,stroke:transparent
  classDef actor fill:#475569,stroke:#1e293b,color:#ffffff,stroke-width:1px
  classDef ext fill:#57534e,stroke:#292524,color:#ffffff,stroke-width:1px
  classDef ingress fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff,stroke-width:1px
  classDef app fill:#0f766e,stroke:#134e4a,color:#ffffff,stroke-width:1px
  classDef flow fill:#0e7490,stroke:#164e63,color:#ffffff,stroke-width:1px
  classDef store fill:#b45309,stroke:#78350f,color:#ffffff,stroke-width:1px
  classDef viz fill:#4338ca,stroke:#312e81,color:#ffffff,stroke-width:1px
  classDef obs fill:#6d28d9,stroke:#4c1d95,color:#ffffff,stroke-width:1px
  classDef notify fill:#b91c1c,stroke:#7f1d1d,color:#ffffff,stroke-width:1px
  classDef future fill:#f8fafc,stroke:#94a3b8,color:#475569,stroke-width:1px,stroke-dasharray:4 3
```

---

## 9. 真实生产环境架构巡检命令 (Verification Commands)

直接通过命令行核验当前运行的容器与数据库内部状态：

```bash
# 1. 检查全量 14 个运行中容器的状态与端口暴露情况
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 2. 检查 PgBouncer 连接池客户端及服务端连接复用状态
docker exec -i ims-timescaledb psql -U ims_admin -p 5432 -h ims-pgbouncer -d ims -c "SHOW POOLS;"

# 3. 检查 TimescaleDB 内部各超表的数据块分布与压缩率
docker exec -i ims-timescaledb psql -U ims_admin -d ims -c "
SELECT hypertable_name, num_chunks, total_size, compressed_total_size
FROM timescaledb_information.hypertables
ORDER BY total_size DESC;"

# 4. 检查连续聚合视图的刷新任务与调度间隔
docker exec -i ims-timescaledb psql -U ims_admin -d ims -c "
SELECT view_name, schedule_interval, max_interval_per_job
FROM timescaledb_information.continuous_aggregate_stats;"
```
