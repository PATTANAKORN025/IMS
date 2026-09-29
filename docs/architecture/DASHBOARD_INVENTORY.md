# Dashboard Inventory

> **Generated file — do not hand-edit.** Regenerate with:
> `node scripts/generate-dashboard-inventory.js`
>
> Source of truth: `monitoring/grafana/dashboards/{drilling,infrastructure,manufacturing,vcp}/*.json` (title, uid, panel
> count, description — all read directly from the JSON, never hand-typed).
> Panel counts use the identical computation as
> `tests/lint/dashboard-linter.js` (`data.panels.length`), so this file and
> the linter's own console output can never disagree. A CI check
> (`node scripts/generate-dashboard-inventory.js --check`) fails the build
> if this file doesn't match what the dashboards currently say.
>
> Last generated: 2026-09-29 | Total dashboards: 22 | Total panels: 225

## 01 · Drilling Operations (4)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-drilling-5-anomaly` | Drilling — 04 Fleet Anomaly & Root Cause Analysis | 8 | Fleet anomaly detection, spindle vibration out-of-spec events, and multi-factor root cause analysis across the CNC drilling fleet. |
| `001` | Drilling — 01 Fleet Digital Twin & Overview | 1 | Live 3D shopfloor digital twin and high-level operational overview of all CNC drilling machines. |
| `ims-drilling-machine-detail` | Drilling — 03 Machine Investigation & Spindle Diagnostics | 5 | Deep-dive diagnostic console for individual drilling machines: spindle RPM, motor load, feed rate, and drill bit wear telemetry. |
| `ims-drilling-history` | Drilling — 02 Shift Production & OEE Tracking | 3 | Shift-by-shift production throughput, hit count, panel output, and overall equipment effectiveness (OEE) tracking for drilling operations. |

## 02 · Lithography Operations / LDI Manufacturing (10)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-easy-overview` | LDI — 01 Fleet Executive Overview | 8 | The easiest way to see the whole LDI fleet at once: no template variables to set, no filters to configure, just open it. Built entirely from this repo's shared views/functions (v_ldi_machine_latest_full, v_ldi_alarm_c... |
| `ims-ldi-alarm-console` | LDI — 07 Live Alarm Management Console | 2 | Interactive alarm acknowledge/resolve workflow -- writes real state to public.ldi_alarm_lifecycle. Companion to the read-only IMS LDI - Operator Andon Board (TV-wall kiosk, no interactive elements). |
| `ims-ldi-alarm-dictionary` | LDI — 09 Alarm Code Dictionary & Corrective Actions | 3 | Reference lookup dashboard: full vendor Alarm Master definition + recent live occurrences for any Alarm Code. Not part of the operator/engineering navigation flow -- opened via drill-down link from the Alarm Code colu... |
| `ims-ldi-alarm-response` | LDI — 08 Alarm Response Metrics & MTTA/MTTR | 8 | Is the team responding to alarms fast enough? Real MTTA/MTTR from public.ldi_alarm_lifecycle -- no simulated data. Shift lead / manufacturing owner audience, same as Manufacturing Command Center. |
| `ims-ldi-engineering-analytics` | LDI — 06 Process Engineering Analytics & SPC | 16 | Layer 3 Process Timeline: synchronized multi-parameter RCA. temperature → humidity → scan_speed → air_vacuum → scale_x/y → pe_1~6 → je_1~4 → state. Shared crosshair + tooltip. Fixed axis scaling. |
| `ims-ldi-factory-digital-twin` | LDI — 03 Factory 3D Digital Twin & Spatial Layout | 1 | TASK 3 -- Full 10-machine Canvas Factory Digital Twin, scaled from the Task 2 2-machine POC. Shows all 10 real reporting LDI machines (LDI-01..LDI-10) grouped into their 5 real zones (public.devices.location), 2 machi... |
| `ims-ldi-machine-snapshot` | LDI — 05 Machine Deep-Dive Snapshot | 14 | 360° machine snapshot at the exact millisecond clicked from Process Timeline. Shows job context, physical variables, PE alignment, Cpk, and alarm proximity. |
| `ims-ldi-manufacturing` | LDI — 04 Manufacturing Fleet Command Center | 33 | 4-Layer RCA Dashboard: Executive HUD + Machine Telemetry + Production Context + Alarm Stream. Schema-driven naming. Shared crosshair. Fixed axis scaling. |
| `ims-ldi-operator-andon` | LDI — 02 Operator Andon Board (Shopfloor Kiosk) | 11 | Factory floor kiosk. ISA-101 compliant. Zero interaction, zero scrolling. 1280x720. Redesigned from an earlier 1920x1080 layout (System Audit Phase 5): template-variable pickers and the drill-down links row are hidden... |
| `ldi-data-readiness` | LDI — 10 Telemetry Signal Quality & Integration Readiness | 17 | Evidence-based readiness dashboard using only current PostgreSQL rows. No simulated data. |

## 03 · Platform Infrastructure & NOC (5)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-capacity` | Platform — 03 AIOps Predictive Capacity & Resource Forecasting | 16 | Days-until-full/saturation forecasts for CPU, RAM, and disk via 30-day linear regression, plus Z-Score (>3sigma) anomaly detection. Infrastructure-focused. |
| `ims-engineering` | Platform — 02 Host & Network Infrastructure Engineering Drill-Down | 25 | Per-server deep dive: CPU/RAM/disk/temperature/network gauges and timeseries for a selected machine, plus legacy-pipeline LDI throughput/quality and Z-Score anomaly panels. |
| `ims-ingestion-latency` | Platform — 04 Ingestion Pipeline Latency & Telemetry SLO | 13 | Read-only. Real source_ts -> ingest_ts latency evidence from migration 081's ingest_ts columns -- no simulated data, no interactive write actions. Companion to tests/e2e/ingestion-latency-check.js. |
| `ims-meta-monitoring` | Platform — 05 Pipeline Reliability & SRE Meta-Monitoring | 16 | The ingestion pipeline's own health: rows/sec insert rate, batch success rate, retry queue depth, circuit breaker state, and device poll rates. Watches the pipeline, not the fleet it monitors. |
| `ims-noc-overview` | Platform — 01 Network Operations Center (NOC) Overview | 7 | Infrastructure-only (servers) -- LDI process/quality metrics live on the Manufacturing and Machine Snapshot dashboards. |

## 04 · Plating Operations / VCP Line (3)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-vcp-operations-console` | VCP — 02 Plating Line Operations Console | 7 | Operations console for the vertical copper plating (VCP) lines: the latest state of each line, the job being plated, the 7-step bath temperatures, current and voltage of the 18 stations, and the alarm log. Every value... |
| `ims-vcp-overview` | VCP — 01 Plating Fleet Overview & Process Analytics | 10 | Fleet overview and process analytics for the vertical copper plating (VCP) lines: hours by state, bath and station-current deviation from setpoint, cell resistance, pump deviation, recipe compliance by lot, and the al... |
| `ims-vcp-realtime-wall` | VCP — 03 Real-Time Plating Line Wall Display | 1 | Wall display for the vertical copper plating (VCP) lines: one card per line with state, current job, bath temperatures, the 18 plating rectifiers (current and voltage of side A and side B), the 18 circulation pumps an... |
