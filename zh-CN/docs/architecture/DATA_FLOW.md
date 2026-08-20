<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# 数据流

> **目标读者：** SRE/运维，新开发者，QA/审计。
>
> **来源溯源：** 以下的每一个表/视图名称及连续聚合 (CAGG) 关系，均已在 2026-08-10 直接通过生产数据库 (`timescaledb_information.continuous_aggregates`) 和实际的迁移脚本 (migrations) 进行了核对。

---

## 端到端：双流水线

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart TB
 subgraph INFRA["基础设施流水线"]
  DEV["服务器 / 网络设备\n(SNMP v2c)"] -->|"每 30 秒轮询"| WALK["ingestion.json\nfork_5_ways -> sre_parser"]
  WALK --> SYS[("sys_metrics")]
  WALK --> NET[("net_metrics")]
  WALK --> LDIM[("ldi_metrics\n(遗留表，若干列始终为 0)")]
 end

 subgraph LDI["LDI 制造流水线"]
  SIM["ldi_simulator.json\n2 秒 tick"] -->|"POST /ldi-telemetry\nx-api-key 认证"| ING["ldi_ingestion.json"]
  ING --> LDID[("ldi_data\n超表 (hypertable)")]
  ALMSIM["ldi_alarm_simulator.json\n10 秒 tick"] --> ALOG[("ldi_alarm_log")]
 end

 SYS --> GRAFANA["Grafana\n15 个仪表板\n(基础设施 / 制造 文件夹)"]
 NET --> GRAFANA
 LDID --> GRAFANA
 ALOG --> GRAFANA

 GRAFANA -->|"原生告警规则"| WEBHOOK["Node-RED /alert-webhook"]
 PROM["Prometheus"] -->|"抓取 sys_metrics 相关的导出器 + Node-RED 健康状态"| AM["Alertmanager"]
 AM --> WEBHOOK
 WEBHOOK --> LINE["LINE 消息 API"]
 WEBHOOK --> TEAMS["MS Teams Webhook"]

 style INFRA fill:#1e293b,stroke:#3b82f6,color:#e2e8f0
 style LDI fill:#1e293b,stroke:#22c55e,color:#e2e8f0
```

**分发注意事项：** LINE/Teams 消息分发需要运维人员配置 `LINE_CHANNEL_ACCESS_TOKEN`/`TEAMS_WEBHOOK_URL` — 根据设计，这些变量在当前代码库的 `.env` 文件中是被省略的。直到分发之前的格式化和尝试分发逻辑都是真实且正确的。

---

## LDI 遥测数据：CAGG 汇总链

原始的 `ldi_data` 数据提供给两条独立的聚合路径，每条路径服务于不同目的 —— 不要认为它们是冗余的：

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart LR
 RAW[("ldi_data\n原始数据，7 天压缩\n180 天保留")]

 RAW -->|"1 分钟汇总"| M1[("ldi_data_1m\n30 天保留")]
 M1 -->|"15 分钟汇总"| M15[("ldi_data_15m\n90 天保留")]
 M15 -->|"1 小时汇总"| M1H[("ldi_data_1h\n2 年保留")]

 RAW -->|"直接的每小时分析\n(avg_max_pe, peak_pe 等)\n开启实时聚合"| MHOURLY[("ldi_data_hourly\n2 年保留")]

 RAW -->|"物化视图，60 秒刷新"| SPCVIEW["v_machine_spc_fleet\nv_ldi_rca_recent_window\nv_ldi_rca_truth_test"]
```

`ldi_data_1m → 15m → 1h` 是一条链式汇总路径（每一级汇总其下一级的数据），用于提升仪表板时间范围查询的性能。`ldi_data_hourly` 是一个 _独立的_、专门构建的每小时视图，直接从原始数据计算得出，拥有其专属的分析列（`avg_max_pe`，`peak_pe` 等），并且设置了 `timescaledb.materialized_only = false`（实时聚合 — 位于迁移脚本 065 中），因为这些特定的指标需要反映当前正在进行的这一小时的局部数据，而不是等待下一次预定的刷新。

## 告警主表与严重程度

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart LR
 ALMSIM["ldi_alarm_simulator.json"] --> ALOG[("ldi_alarm_log\n事件流\n365 天保留")]
 MASTER[("ldi_alarm_ms_code\n代码 + 严重程度 + 消息\n1,820+ 个代码，19 个模拟器激活状态")] -.->|"外键: alarm_code"| ALOG
 ALOG --> CTX["v_ldi_alarm_context\n(关联遥测数据 ±时间窗口)"]
 CTX --> RCA["v_ldi_rca_recent_window\nv_ldi_rca_truth_test"]
```

请参阅 `docs/architecture/ALARM_SEVERITY_GUIDE.md` 和 `docs/architecture/LDI_RCA_GUIDE.md` 了解构建于此基础上的分类法与相关性方法论。

## 相关文档

- `docs/architecture/ARCHITECTURE.md` — 完整的系统上下文，容器清单。
- `docs/architecture/DATABASE_SCHEMA.md` — 自动生成的表/列/视图参考。
- `docs/architecture/DATA_RETENTION.md` — 上文展示的保留/压缩数值，包含治理注意事项。
- `docs/architecture/EAP_ARCHITECTURE.md` — 更为详细的两种数据接入 (ingestion) 适配器 (SNMP, HTTP/JSON)。
