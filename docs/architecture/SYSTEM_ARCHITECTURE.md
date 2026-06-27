# IMS (Industrial NOC Monitoring System) — Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        IMS Architecture (World-Class)                       │
│                    SNMP → Node-RED → TimescaleDB → Grafana                 │
│                    + Prometheus Alertmanager + Blackbox Exporter            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Layer 1: Edge / OT Layer (เครื่องจักรจริง)

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Machine 1       │  │  Machine 2       │  │  Machine N       │
│  YSPhotec LDI   │  │  YSPhotec LDI   │  │  (1000+ units)   │
│  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌────────────┐  │
│  │ CPU/RAM    │  │  │  │ CPU/RAM    │  │  │  │ CPU/RAM    │  │
│  │ Disk       │  │  │  │ Disk       │  │  │  │ Disk       │  │
│  │ Network    │  │  │  │ Network    │  │  │  │ Network    │  │
│  │ Temperature│  │  │  │ Temperature│  │  │  │ Temperature│  │
│  │ LDI Sensor │  │  │  │ LDI Sensor │  │  │  │ LDI Sensor │  │
│  │ WiFi RSSI  │  │  │  │ WiFi RSSI  │  │  │  │ WiFi RSSI  │  │
│  │ WiFi SNR   │  │  │  │ WiFi SNR   │  │  │  │ WiFi SNR   │  │
│  └────────────┘  │  │  └────────────┘  │  │  └────────────┘  │
│  Protocol: SNMP  │  │  Protocol: SNMP  │  │  Protocol: SNMP  │
│  v2c/v3 (RO)    │  │  v2c/v3 (RO)    │  │  v2c/v3 (RO)    │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Network Switch    │
                    │   (Ethernet/WiFi)   │
                    └──────────┬──────────┘
                               │
```

## Layer 2: Ingestion & Processing Layer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Docker Network (ims_network)                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Node-RED (port 1880)                             │    │
│  │                    Dual-Engine Walker                               │    │
│  │                                                                     │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │    │
│  │  │Walk CPU │  │Walk     │  │Walk     │  │Walk     │  │Walk     │ │    │
│  │  │4 OIDs   │  │Storage  │  │Network  │  │Temp     │  │LDI      │ │    │
│  │  │         │  │10 OIDs  │  │18 OIDs  │  │2 OIDs   │  │10 OIDs  │ │    │
│  │  │session. │  │session. │  │session. │  │session. │  │session. │ │    │
│  │  │get()    │  │get()    │  │get()    │  │get()    │  │get()    │ │    │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘ │    │
│  │       │            │            │            │            │        │    │
│  │       └────────────┴────────────┴────────────┴────────────┘        │    │
│  │                              │                                     │    │
│  │                    ┌─────────▼─────────┐                           │    │
│  │                    │  Join Barrier     │                           │    │
│  │                    │  (count=5, timeout=8s)                        │    │
│  │                    └─────────┬─────────┘                           │    │
│  │                              │                                     │    │
│  │                    ┌─────────▼─────────┐                           │    │
│  │                    │  SRE Parser v7    │                           │    │
│  │                    │  • Counter Wrap    │                           │    │
│  │                    │  • Memory Cleanup  │                           │    │
│  │                    │  • Deep Copy       │                           │    │
│  │                    │  • LDI + WiFi      │                           │    │
│  │                    │  • safeStr()       │                           │    │
│  │                    └─────────┬─────────┘                           │    │
│  │                              │                                     │    │
│  │                    ┌─────────▼─────────┐                           │    │
│  │                    │  PostgreSQL Node  │                           │    │
│  │                    │  (Parameterized)  │                           │    │
│  │                    └─────────┬─────────┘                           │    │
│  └──────────────────────────────┼─────────────────────────────────────┘    │
│                                 │                                          │
└─────────────────────────────────┼──────────────────────────────────────────┘
                                  │
```

## Layer 3: Storage Layer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐  │
│  │    PgBouncer     │      │   TimescaleDB    │      │   Prometheus     │  │
│  │    (port 6432)   │─────▶│   (port 5432)    │      │   (port 9090)    │  │
│  │                  │      │                  │      │                  │  │
│  │ • Connection Pool│      │ • Hypertable     │      │ • Metrics Store  │  │
│  │ • Transaction    │      │ • Continuous Agg │      │ • Alert Rules    │  │
│  │   Pooling Mode   │      │   (1-min, 1-hr)  │      │ • Z-Score Anomaly│  │
│  │ • max_client_conn│      │ • 28 Columns     │      │ • 38 Rules       │  │
│  │   = 200          │      │ • WiFi RSSI/SNR  │      │ • 13 Groups      │  │
│  └──────────────────┘      └──────────────────┘      └────────┬─────────┘  │
│                                                               │            │
│  ┌──────────────────┐      ┌──────────────────┐              │            │
│  │  SNMP Simulator  │      │ Blackbox Exporter│◀─────────────┘            │
│  │  (port 1161/udp) │      │   (port 9115)    │                          │
│  │                  │      │                  │                          │
│  │ • 92 Mock OIDs   │      │ • TCP Probes     │                          │
│  │ • LDI Enterprise │      │ • HTTP Probes    │                          │
│  │ • WiFi RSSI/SNR  │      │ • ICMP Probes    │                          │
│  │ • Counter Wrap   │      │ • SLA Monitoring │                          │
│  └──────────────────┘      └──────────────────┘                          │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

## Layer 4: Visualization & AIOps Layer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     Grafana (port 3000)                              │  │
│  │                     4 Dashboards, 34+ Panels                        │  │
│  │                                                                      │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │  │
│  │  │ NOC Overview │  │ System       │  │ Engineering  │  │Capacity │ │  │
│  │  │ (Executive)  │  │ Overview     │  │ Drill-Down   │  │Planning │ │  │
│  │  │              │  │              │  │              │  │         │ │  │
│  │  │ • Traffic    │  │ • CPU/RAM    │  │ • LDI Panels │  │ • Disk  │ │  │
│  │  │   Light      │  │ • Disk       │  │ • WiFi RSSI  │  │   Pred. │ │  │
│  │  │ • Fleet      │  │ • Network    │  │ • WiFi SNR   │  │ • Trend │ │  │
│  │  │   Status     │  │ • Temp       │  │ • Scatter    │  │   Lines │ │  │
│  │  │              │  │              │  │   Plot       │  │         │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────┘ │  │
│  │                                                                      │  │
│  │  SRE Color Palette:                                                  │  │
│  │  • eth0 RX: #1F60C4 (Dark Blue)    • wlan0 RX: #8E24AA (Purple)    │  │
│  │  • eth0 TX: #5794F2 (Light Blue)   • wlan0 TX: #E02F44 (Magenta)   │  │
│  │  • CPU: Yellow→Orange→Red           • RAM: Purple→Orange→Red        │  │
│  │  • Disk: Cyan→Blue→Red             • Temp: Green→Red                │  │
│  │  • WiFi RSSI: Cyan                 • WiFi SNR: Light Cyan           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │              Alertmanager (port 9093)                                │  │
│  │                                                                      │  │
│  │  • Inhibition Rules (Critical suppresses Warning)                    │  │
│  │  • Webhook → Node-RED → Teams/LINE formatting                       │  │
│  │  • Emoji Icons (🔥 Critical, ⚠️ Warning, ✅ Resolved)               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Summary

```
┌──────────┐    SNMP GET    ┌──────────┐    SQL INSERT    ┌──────────┐
│ Machine  │───────────────▶│ Node-RED │─────────────────▶│ Timescale│
│ (SNMP)   │   10s poll     │ (Parser) │   Parameterized  │   DB     │
└──────────┘                └──────────┘                  └─────┬────┘
                                                               │
                                                    SQL Query  │
                                                               ▼
┌──────────┐    Scrape      ┌──────────┐    Dashboard    ┌──────────┐
│Prometheus│◀───────────────│ Blackbox │◀────────────────│  Grafana │
│ (Alerts) │   30s interval │ Exporter │   HTTP/TCP/ICMP │(Vis/AIOps)│
└──────────┘                └──────────┘                  └──────────┘
```

## Database Schema (machine_telemetry — 28 Columns)

| Column | Type | Description |
|--------|------|-------------|
| time | timestamptz | Primary time dimension |
| machine_id | text | Machine identifier |
| cpu_cores | integer | Number of CPU cores |
| cpu_load_percent | double precision | CPU load percentage |
| ram_total_mb | double precision | Total RAM in MB |
| ram_used_mb | double precision | Used RAM in MB |
| ram_free_mb | double precision | Free RAM in MB |
| disk_total_gb | double precision | Total disk in GB |
| disk_used_gb | double precision | Used disk in GB |
| disk_free_gb | double precision | Free disk in GB |
| net_rx_bytes | bigint | Total RX bytes |
| net_tx_bytes | bigint | Total TX bytes |
| net_rx_errors | bigint | RX errors |
| net_rx_drops | bigint | RX drops |
| net_if_status | integer | Interface status (1=UP) |
| temp_c | double precision | Temperature in Celsius |
| rx_mbps | double precision | RX bandwidth in Mbps |
| tx_mbps | double precision | TX bandwidth in Mbps |
| interface_metrics | jsonb | Per-interface breakdown |
| ldi_throughput | integer | LDI throughput (units/hr) |
| ldi_humidity | integer | LDI humidity (%) |
| ldi_pe | integer | Position Error (µm) |
| ldi_je | integer | Judgment Error (µm) |
| ldi_power | integer | Power consumption (W) |
| ldi_vibration | integer | Vibration (mm/s) |
| ldi_uptime | bigint | LDI uptime |
| **wifi_rssi** | integer | WiFi Signal Strength (dBm) |
| **wifi_snr** | integer | WiFi Signal Quality (dB) |

## Continuous Aggregates

| View | Interval | Columns |
|------|----------|---------|
| telemetry_minute_summary | 1 min | All infrastructure + WiFi |
| ldi_minute_summary | 1 min | LDI metrics + WiFi |

## Prometheus Alert Rules (38 Rules, 13 Groups)

| Group | Rules | Purpose |
|-------|-------|---------|
| interface_health | InterfaceDown, InterfaceFlapping | Network link monitoring |
| network | WiFiPacketLoss, BandwidthZScore | WiFi + anomaly detection |
| system | ServiceDown, NodeREDDown, TelemetryGap | Infrastructure health |
| thermal | ThermalWarning, ThermalCritical | Temperature monitoring |
| cpu | CpuHigh, CpuZScore | CPU anomaly detection |
| memory | MemoryHigh, MemoryCritical | RAM monitoring |
| disk | DiskFull, DiskPredictedFull | Storage forecasting |
| sla | SLABreachWarning, SLABreachCritical | SLA monitoring |
| watchdog | Watchdog | Pipeline alive check |
| ldi_predictive | ThroughputCritical, PECritical, VibrationCritical, etc. | LDI quality |
| zscore_anomaly | BandwidthZScore, TemperatureZScore, CpuZScore | AIOps |
| blackbox | TargetDown | Probe monitoring |
| ldi | LDISensorDown | LDI sensor health |

## Architecture Principles

1. **Read-Only SNMP**: No write operations to machines — 100% safe
2. **Zero Data Loss**: Bulletproof parser with counter wrap detection
3. **Zero Alert Fatigue**: Inhibition rules suppress lower-severity alerts
4. **Horizontal Scalability**: Dynamic OID polling — no code changes for 1-1000+ machines
5. **AIOps Foundation**: Z-Score anomaly detection + predictive alerting
6. **SRE Standard**: Color palette, units, and dashboard hierarchy follow SRE best practices
