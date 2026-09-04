# Dashboard Inventory

> **Generated file — do not hand-edit.** Regenerate with:
> `node scripts/generate-dashboard-inventory.js`
>
> Source of truth: `monitoring/grafana/dashboards/{infrastructure,manufacturing}/*.json` (title, uid, panel
> count, description — all read directly from the JSON, never hand-typed).
> Panel counts use the identical computation as
> `tests/lint/dashboard-linter.js` (`data.panels.length`), so this file and
> the linter's own console output can never disagree. A CI check
> (`node scripts/generate-dashboard-inventory.js --check`) fails the build
> if this file doesn't match what the dashboards currently say.
>
> Last generated: 2026-09-01 | Total dashboards: 16 | Total panels: 209

## Infrastructure (5)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-capacity` | IMS AIOps & Capacity Forecast | 16 | Days-until-full/saturation forecasts for CPU, RAM, and disk via 30-day linear regression, plus Z-Score (>3sigma) anomaly detection. Infrastructure-focused. |
| `ims-engineering` | IMS Engineering Drill-Down | 25 | Per-server deep dive: CPU/RAM/disk/temperature/network gauges and timeseries for a selected machine, plus legacy-pipeline LDI throughput/quality and Z-Score anomaly panels. |
| `ims-ingestion-latency` | IMS Ingestion Latency | 13 | Read-only. Real source_ts -> ingest_ts latency evidence from migration 081's ingest_ts columns -- no simulated data, no interactive write actions. Companion to tests/e2e/ingestion-latency-check.js. |
| `ims-meta-monitoring` | IMS Pipeline Health & Meta-Monitoring | 16 | The ingestion pipeline's own health: rows/sec insert rate, batch success rate, retry queue depth, circuit breaker state, and device poll rates. Watches the pipeline, not the fleet it monitors. |
| `ims-noc-overview` | IMS NOC Overview | 7 | Infrastructure-only (servers) -- LDI process/quality metrics live on the Manufacturing and Machine Snapshot dashboards. |

## LDI Manufacturing (11)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-drilling-machine-detail` | IMS Drilling Machine Detail | 19 | Read-only drilling-machine detail for the real public.machine_event source: latest-known state, observed performance, decoded historical error context, sampled status history, raw event records, and source traceabilit... |
| `ims-easy-overview` | IMS Easy Overview | 8 | The easiest way to see the whole LDI fleet at once: no template variables to set, no filters to configure, just open it. Built entirely from this repo's shared views/functions (v_ldi_machine_latest_full, v_ldi_alarm_c... |
| `ims-ldi-alarm-console` | IMS LDI - Alarm Console | 2 | Interactive alarm acknowledge/resolve workflow -- writes real state to public.ldi_alarm_lifecycle. Companion to the read-only IMS LDI - Operator Andon Board (TV-wall kiosk, no interactive elements). |
| `ims-ldi-alarm-dictionary` | IMS LDI - Alarm Dictionary | 3 | Reference lookup dashboard: full vendor Alarm Master definition + recent live occurrences for any Alarm Code. Not part of the operator/engineering navigation flow -- opened via drill-down link from the Alarm Code colu... |
| `ims-ldi-alarm-response` | IMS LDI - Alarm Response (MTTA/MTTR) | 8 | Is the team responding to alarms fast enough? Real MTTA/MTTR from public.ldi_alarm_lifecycle -- no simulated data. Shift lead / manufacturing owner audience, same as Manufacturing Command Center. |
| `ims-ldi-engineering-analytics` | IMS LDI - Engineering Analytics & SPC | 16 | Layer 3 Process Timeline: synchronized multi-parameter RCA. temperature → humidity → scan_speed → air_vacuum → scale_x/y → pe_1~6 → je_1~4 → state. Shared crosshair + tooltip. Fixed axis scaling. |
| `ims-ldi-factory-digital-twin` | IMS LDI - Factory Digital Twin | 1 | TASK 3 -- Full 10-machine Canvas Factory Digital Twin, scaled from the Task 2 2-machine POC. Shows all 10 real reporting LDI machines (LDI-01..LDI-10) grouped into their 5 real zones (public.devices.location), 2 machi... |
| `ims-ldi-machine-snapshot` | IMS LDI - Machine Snapshot | 14 | 360° machine snapshot at the exact millisecond clicked from Process Timeline. Shows job context, physical variables, PE alignment, Cpk, and alarm proximity. |
| `ims-ldi-manufacturing` | IMS LDI - Manufacturing Command Center | 33 | 4-Layer RCA Dashboard: Executive HUD + Machine Telemetry + Production Context + Alarm Stream. Schema-driven naming. Shared crosshair. Fixed axis scaling. |
| `ims-ldi-operator-andon` | IMS LDI - Operator Andon Board | 11 | Factory floor kiosk. ISA-101 compliant. Zero interaction, zero scrolling. 1280x720. Redesigned from an earlier 1920x1080 layout (System Audit Phase 5): template-variable pickers and the drill-down links row are hidden... |
| `ldi-data-readiness` | LDI Data Readiness & Integration Gaps (Real Database) | 17 | Evidence-based readiness dashboard using only current PostgreSQL rows. No simulated data. |
