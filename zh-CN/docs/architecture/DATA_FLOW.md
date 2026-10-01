<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>首页</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>文档索引</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS 遥测数据管道与全流程数据流转架构 (Data Flow Architecture)</h1>
  <p><b>多工业领域接入流水线、Node-RED 沙箱转换机制、PgBouncer 事务连接池、TimescaleDB CAGG 持续聚合链及 Grafana 消费呈现</b></p>
  <p>
    <a href="../../../docs/architecture/DATA_FLOW.md">English</a> |
    <a href="../../../th/docs/architecture/DATA_FLOW.md">ไทย</a> |
    <a href="DATA_FLOW.md">简体中文</a>
  </p>
</div>

---

> **受众对象:** SRE / 运维工程师、数据工程师、系统架构师、QA 质量保证团队  
> **遥测业务范围:** 涵盖四大工业领域 (IT/OT 基础设施网络、LDI 激光直接成像光刻、CNC 数控钻孔设备群、VCP 垂直连续电镀线)  
> **数据源真实性出处:** 下文提及的全部数据表、视图、计算逻辑及持续聚合视图均经过 live 数据库 (`timescaledb_information.continuous_aggregates`)、迁移脚本 013–091 以及运行中 Node-RED 流水线的严格校验。

---

## 1. 端到端多领域数据流向总拓扑 (Pipeline Topology)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart TB
  subgraph SOURCES["1. 工业现场运行遥测源"]
    SNMP_DEV["服务器 / 网络核心交换机\n(SNMP v2c 协议, 30 秒轮询)"]
    LDI_DEV["LDI 激光直接成像光刻机\n(HTTP POST /ldi-telemetry, 2 秒)"]
    DRL_DEV["CNC 数控钻孔机台群\n(机台事件与加工循环记录)"]
    VCP_DEV["VCP 垂直连续电镀生产线\n(槽体传感器与工艺运行日志)"]
  end

  subgraph INGESTION["2. 数据接入与标准化清洗层 (Node-RED)"]
    NR_INFRA["ingestion.json\nfork_5_ways -> sre_parser v10"]
    NR_LDI["ldi_ingestion.json\nSchema 校验, 预写暂存, O(1) GC 内存回收"]
  end

  subgraph POOL["3. 数据库连接池代理层"]
    PGB["PgBouncer 连接池\n(事务模式, 端口 5432, AUTH: scram-sha-256)"]
  end

  subgraph STORAGE["4. TimescaleDB 核心存储层 (仅限 public schema)"]
    subgraph HYPER["原始高频超表群 Hypertables (1 天切片时间跨度)"]
      HT_SYS[("sys_metrics & net_metrics")]
      HT_LDI[("ldi_data 与 ldi_alarm_log")]
      HT_STG[("ingest_staging")]
    end
    subgraph EAP_DB["次级业务数据库: eap_backup"]
      EAP_DRL[("machine_event 与 agent_log")]
      EAP_VCP[("vcp_upp, vcp_alarm, vcp_status_change")]
    end
    subgraph CAGGS["持续聚合物化层 (Continuous Aggregates)"]
      CAGG_1M[("1 分钟级汇总 (ldi_data_1m)")]
      CAGG_15M[("15 分钟级汇总 (ldi_data_15m)")]
      CAGG_1H[("1 小时级汇总与 ldi_data_hourly")]
    end
    subgraph COMPRESS["列式数据切片压缩"]
      COL[("超过 7 天切片执行列压缩\n分段维度: machine_id / device_id")]
    end
  end

  subgraph DISPATCH["5. 可视化呈现与警报分发层"]
    GRAF["Grafana 监控大屏 (22 块)\n遵循 Grid-24, 亚秒级快速查询"]
    PROM["Prometheus 指标拉取采集器"]
    AM["Alertmanager 告警路由内核"]
    WH["Node-RED /alert-webhook 适配器"]
    NOTIF["LINE Messaging API 与 MS Teams 通知通道"]
  end

  SNMP_DEV --> NR_INFRA
  LDI_DEV --> NR_LDI
  DRL_DEV -.->|"直接同步"| EAP_DRL
  VCP_DEV -.->|"直接同步"| EAP_VCP

  NR_INFRA -->|"批量 SQL 写入 (nodered_writer)"| PGB
  NR_LDI -->|"预写暂存与批量落盘 (nodered_writer)"| PGB

  PGB --> HT_SYS
  PGB --> HT_LDI
  PGB --> HT_STG

  HT_LDI --> CAGG_1M --> CAGG_15M --> CAGG_1H
  HT_LDI --> COL
  HT_SYS --> COL

  CAGGS --> GRAF
  HYPER --> GRAF
  EAP_DB -->|"drilling-timescaledb (直连 :5432)"| GRAF
  PROM --> AM --> WH --> NOTIF
  GRAF -->|"原生告警规则"| WH
```

---

## 2. Node-RED 沙箱转换与内存垃圾回收规范

在 **Node-RED 接入流水线** 内部，Function 节点运行于隔离的 V8 运行时中，系统禁止调用 `require()`，所有外部模块统一经由 `global.get()` 提取。为了彻底防止高并发写入洪峰 (>100,000 事件/秒) 引发内存溢出，数据转换严格遵循 **O(N) 单趟线性遍历** 与 **显式垃圾回收 (Explicit GC)** 规范：

```javascript
// Node-RED Function 节点数据标准化与 GC 内存回收示例
const pg = global.get('pg');
const pool = global.get('pgPool');

const rawPayload = msg.payload;
if (!Array.isArray(rawPayload) || rawPayload.length === 0) {
    return null;
}

const flatData = [];
const insertTime = new Date().toISOString();

// O(N) 单趟线性数据解析与转换
for (let i = 0; i < rawPayload.length; i++) {
    const item = rawPayload[i];
    flatData.push([
        insertTime,
        item.eqp_id,
        Number(item.pe1_intensity) || 0.0,
        Number(item.pe2_intensity) || 0.0,
        Number(item.thickness) || 0.0,
        Number(item.temperature) || 0.0,
        item.lot_id || 'UNKNOWN'
    ]);
}

// 构造参数化批量 SQL
const columns = '("time", machine_id, pe1_intensity, pe2_intensity, thickness, temperature, lot_id)';
const values = flatData.map((_, idx) => {
    const offset = idx * 7;
    return '($' + (offset + 1) + ', $' + (offset + 2) + ', $' + (offset + 3) + ', $' + (offset + 4) + ', $' + (offset + 5) + ', $' + (offset + 6) + ', $' + (offset + 7) + ')';
}).join(', ');

const query = `
    INSERT INTO public.ldi_data ${columns}
    VALUES ${values}
    ON CONFLICT (log_id, "time") DO NOTHING;
`;

const flattenedParams = flatData.flat();

// 严苛的显式垃圾回收纪律：彻底释放 V8 堆内存占用
flatData.length = 0;
msg.payload = null;

// 发送至 PgBouncer 连接池执行
msg.topic = query;
msg.params = flattenedParams;
return msg;
```

---

## 3. TimescaleDB 持续聚合汇总链路 (CAGG Rollup Chain)

入库至 `public.ldi_data` 的原始时序数据流经两个彼此独立的计算通道：

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart LR
  RAW[("ldi_data
原始时序超表
7 天后列压缩, 保留 180 天")]

  RAW -->|"1 分钟聚合"| M1[("ldi_data_1m
保留 30 天")]
  M1 -->|"15 分钟聚合"| M15[("ldi_data_15m
保留 90 天")]
  M15 -->|"1 小时聚合"| M1H[("ldi_data_1h
保留 2 年")]

  RAW -->|"小时级特征指标实时聚合
(avg_max_pe, peak_pe)
实时聚合特性: 启用"| MHOURLY[("ldi_data_hourly
保留 2 年")]

  RAW -->|"物化刷新间隔 60 秒"| SPC["v_machine_spc_fleet
v_ldi_rca_recent_window
v_ldi_rca_truth_test"]
```

* **级联多层预聚合 (`1m -> 15m -> 1h`):** 逐级汇总历史颗粒度，确保 Grafana 在加载大时间跨度 (7 天、30 天) 报表时实现亚秒级渲染。
* **实时直算小时聚合 (`ldi_data_hourly`):** 配置参数 `timescaledb.materialized_only = false` (迁移脚本 065)，直接基于原始表聚合关键质量指标 (`avg_max_pe`, `peak_pe`)，实现最新未物化数据与历史聚合的实时无缝拼合。

---

## 4. 报警上下文关联合并与根因分析流水线 (RCA)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart LR
  ALM_SIM["ldi_alarm_simulator.json"] --> ALOG[("ldi_alarm_log
实时报警日志流
保留 365 天")]
  MASTER[("ldi_alarm_ms_code
报警主字典表
登记超 1,820+ 报警代码")] -.->|"外键约束: alarm_code"| ALOG
  ALOG --> CTX["v_ldi_alarm_context
自动匹配前后 +-5 分钟遥测视窗"]
  CTX --> RCA["v_ldi_rca_recent_window
v_ldi_rca_truth_test"]
```

报警事件实时写入 `public.ldi_alarm_log` 并通过外键关联合法报警字典 `public.ldi_alarm_ms_code`。下游视图 (`v_ldi_alarm_context`) 会以报警发生时间为中心，自动抓取机器前后 ±5 分钟 的遥测窗口数据，为现场工程师提供统计学根因分析依据。

---

## 5. 核心架构约束与工程准则

1. **Schema 隔离铁律:** 所有数据表、视图及持续聚合必须存放于 `public` 命名空间，严禁引入 `ims.*`。
2. **PgBouncer 代理模式:** 强制使用事务模式，客户端通过 SCRAM 认证（`AUTH_TYPE: scram-sha-256`），严格禁止 Prepared Statements。
3. **写入操作幂等性:** 所有批量插入必须携带 `ON CONFLICT (log_id, "time") DO NOTHING`。
4. **外部敏感凭证安全:** 涉及 LINE 及 Teams 的通知密钥由运维人员本地注入，禁止提交至 Git 代码仓库。

---

[⬅️ 返回架构总览](ARCHITECTURE.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> 主代码仓库](../../README.md)
