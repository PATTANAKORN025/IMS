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
> Last generated: 2026-08-10 | Total dashboards: 10 | Total panels: 144

## Infrastructure (4)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-capacity` | IMS AIOps & Capacity Forecast | 17 | Days-until-full/saturation forecasts for CPU, RAM, and disk via 30-day linear regression, plus Z-Score (>3sigma) anomaly detection. Infrastructure-focused. |
| `ims-engineering` | IMS Engineering Drill-Down | 26 | Per-server deep dive: CPU/RAM/disk/temperature/network gauges and timeseries for a selected machine, plus legacy-pipeline LDI throughput/quality and Z-Score anomaly panels. |
| `ims-meta-monitoring` | IMS Pipeline Health & Meta-Monitoring | 16 | The ingestion pipeline's own health: rows/sec insert rate, batch success rate, retry queue depth, circuit breaker state, and device poll rates. Watches the pipeline, not the fleet it monitors. |
| `ims-noc-overview` | IMS NOC Overview | 8 | Infrastructure-only (servers) -- LDI process/quality metrics live on the Manufacturing and Machine Snapshot dashboards. |

## LDI Manufacturing (6)

| UID | Title | Panels | Purpose |
|---|---|---|---|
| `ims-easy-overview` | IMS Easy Overview | 8 | The easiest way to see the whole LDI fleet at once: no template variables to set, no filters to configure, just open it. Built entirely from this repo's shared views/functions (v_ldi_machine_latest_full, v_ldi_alarm_c... |
| `ims-ldi-engineering-analytics` | IMS LDI - Engineering Analytics & SPC | 12 | Layer 3 Process Timeline: synchronized multi-parameter RCA. temperature → humidity → scan_speed → air_vacuum → scale_x/y → pe_1~6 → je_1~4 → state. Shared crosshair + tooltip. Fixed axis scaling. |
| `ims-ldi-machine-snapshot` | IMS LDI - Machine Snapshot | 14 | 360° machine snapshot at the exact millisecond clicked from Process Timeline. Shows job context, physical variables, PE alignment, Cpk, and alarm proximity. |
| `ims-ldi-manufacturing` | IMS LDI - Manufacturing Command Center | 22 | 4-Layer RCA Dashboard: Executive HUD + Machine Telemetry + Production Context + Alarm Stream. Schema-driven naming. Shared crosshair. Fixed axis scaling. |
| `ims-ldi-operator-andon` | IMS LDI - Operator Andon Board | 8 | Factory floor kiosk. ISA-101 compliant. Zero interaction, zero scrolling. 1280x720. Redesigned from an earlier 1920x1080 layout (World-Class Audit Phase 5): template-variable pickers and the drill-down links row are h... |
| `ldi-data-readiness` | LDI Data Readiness & Integration Gaps (Real Database) | 13 | Evidence-based readiness dashboard using only current PostgreSQL rows. No simulated data. |
