# Data Flow

> **Audience:** SRE/operations, new developers, QA/audit.
>
> **Provenance:** every table/view name and CAGG relationship below was checked directly against the live database (`timescaledb_information.continuous_aggregates`) and the real migrations on 2026-08-10.

---

## End-to-end: both pipelines

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart TB
 subgraph INFRA["Infrastructure pipeline"]
  DEV["Servers / network devices\n(SNMP v2c)"] -->|"poll every 30s"| WALK["ingestion.json\nfork_5_ways -> sre_parser"]
  WALK --> SYS[("sys_metrics")]
  WALK --> NET[("net_metrics")]
  WALK --> LDIM[("ldi_metrics\n(legacy, several columns always 0)")]
 end

 subgraph LDI["LDI manufacturing pipeline"]
  SIM["ldi_simulator.json\n2s tick"] -->|"POST /ldi-telemetry\nx-api-key auth"| ING["ldi_ingestion.json"]
  ING --> LDID[("ldi_data\nhypertable")]
  ALMSIM["ldi_alarm_simulator.json\n10s tick"] --> ALOG[("ldi_alarm_log")]
 end

 SYS --> GRAFANA["Grafana\n15 dashboards\n(Infrastructure / Manufacturing folders)"]
 NET --> GRAFANA
 LDID --> GRAFANA
 ALOG --> GRAFANA

 GRAFANA -->|"native alert rules"| WEBHOOK["Node-RED /alert-webhook"]
 PROM["Prometheus"] -->|"scrapes sys_metrics-adjacent exporters + Node-RED health"| AM["Alertmanager"]
 AM --> WEBHOOK
 WEBHOOK --> LINE["LINE Messaging API"]
 WEBHOOK --> TEAMS["MS Teams webhook"]

 style INFRA fill:#1e293b,stroke:#3b82f6,color:#e2e8f0
 style LDI fill:#1e293b,stroke:#22c55e,color:#e2e8f0
```

**Delivery caveat:** LINE/Teams delivery requires operator-configured `LINE_CHANNEL_ACCESS_TOKEN`/`TEAMS_WEBHOOK_URL` — absent from `.env` by design in this repo. The formatting and delivery-attempt logic up to that point is real and correct.

---

## LDI telemetry: the CAGG rollup chain

Raw `ldi_data` feeds two independent aggregation paths, each serving a different purpose — don't assume they're redundant:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart LR
 RAW[("ldi_data\nraw, 7d compression\n180d retention")]

 RAW -->|"1m rollup"| M1[("ldi_data_1m\n30d retention")]
 M1 -->|"15m rollup"| M15[("ldi_data_15m\n90d retention")]
 M15 -->|"1h rollup"| M1H[("ldi_data_1h\n2yr retention")]

 RAW -->|"direct hourly analytics\n(avg_max_pe, peak_pe, etc.)\nreal-time aggregation ON"| MHOURLY[("ldi_data_hourly\n2yr retention")]

 RAW -->|"materialized, 60s refresh"| SPCVIEW["v_machine_spc_fleet\nv_ldi_rca_recent_window\nv_ldi_rca_truth_test"]
```

`ldi_data_1m → 15m → 1h` is a chained rollup (each level aggregates the level below it) for dashboard time-range performance. `ldi_data_hourly` is a _separate_, purpose-built hourly view computed directly from raw data with its own analytical columns (`avg_max_pe`, `peak_pe`, and more) and `timescaledb.materialized_only = false` (real-time aggregation — migration 065), because those specific metrics need to reflect the current partial hour, not wait for the next scheduled refresh.

## Alarm master + severity

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart LR
 ALMSIM["ldi_alarm_simulator.json"] --> ALOG[("ldi_alarm_log\nevent stream\n365d retention")]
 MASTER[("ldi_alarm_ms_code\ncode + severity + msg\n1,820+ codes, 19 simulator-active")] -.->|"FK: alarm_code"| ALOG
 ALOG --> CTX["v_ldi_alarm_context\n(joins telemetry ±window)"]
 CTX --> RCA["v_ldi_rca_recent_window\nv_ldi_rca_truth_test"]
```

See `docs/architecture/ALARM_SEVERITY_GUIDE.md` and `docs/architecture/LDI_RCA_GUIDE.md` for the taxonomy and correlation methodology built on top of this.

## Related documents

- `docs/architecture/ARCHITECTURE.md` — full system context, container inventory.
- `docs/architecture/DATABASE_SCHEMA.md` — auto-generated table/column/view reference.
- `docs/architecture/DATA_RETENTION.md` — the retention/compression numbers shown above, with governance caveats.
- `docs/architecture/EAP_ARCHITECTURE.md` — the two ingestion adapters (SNMP, HTTP/JSON) in more detail.
