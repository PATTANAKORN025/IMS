> [!NOTE]
> **自动翻译 / 深度技术数据**
> 本文档为深度技术审计/证据报告。为了保持专业术语的准确性，目前主要以英文原文为准。

# Executive Demo Script — IMS Grafana

**Audience:** plant management, executives, prospective customers.
**Duration:** 5-10 minutes.
**Prerequisite:** live production Grafana reachable (`http://<host>:${GRAFANA_PORT:-3000}`), telemetry flowing (verify with `docs/operations-runbook.md`'s health-check section before starting).

Every screen and metric referenced below is a real, already-shipped dashboard/panel — nothing here is aspirational or requires new work.

---

## 1. Executive opening (30s)

Open **IMS NOC Overview** (`ims-noc-overview`, Infrastructure folder). This is the system's front door — no filters to set, no variables to configure.

Say: *"This is the live state of our industrial monitoring platform right now — not a snapshot, not a demo dataset."*

Point at the top row: server health at a glance.

## 2. Fleet health (1 min)

Navigate to **IMS Easy Overview** (`ims-easy-overview`, Manufacturing folder) — 8 panels, zero template variables, built entirely from the shared `v_ldi_machine_latest_full` / `v_ldi_alarm_context` views.

Say: *"Every LDI machine in the fleet, one screen, no setup — this is what a floor supervisor sees walking past a monitor."*

Point at the worst-Cpk panel (sourced from the canonical `public.v_machine_spc_fleet` materialized view, refreshed every 60s).

## 3. Production overview (1-2 min)

Navigate to **IMS LDI - Manufacturing Command Center** (`ims-ldi-manufacturing`, 33 panels) — the 4-Layer RCA Dashboard: Executive HUD → Machine Telemetry → Production Context → Alarm Stream.

Say: *"This is the same platform going one level deeper — executive KPIs, live telemetry, and the alarm stream, all schema-driven, all synchronized on the same timeline crosshair."*

## 4. Machine drill-down (1-2 min)

From either dashboard above, click a machine or a point on a chart. This lands on **IMS LDI - Machine Snapshot** (`ims-ldi-machine-snapshot`, 14 panels) — a 360° view at the exact millisecond clicked, carrying the machine ID and timestamp forward automatically.

Say: *"One click, and we're at the exact moment and machine that data point came from — job context, physical variables, PE alignment, Cpk, and any nearby alarm."*

## 5. Quality / SPC (1 min)

Point out the Cpk panels already visible on the Machine Snapshot and Manufacturing Command Center screens (combined PE + JE process capability, worst-Cpk = LEAST(Cpk PE, Cpk JE), confidence-flagged when the deciding sample count is below 30).

Optionally open **IMS LDI - Engineering Analytics & SPC** (`ims-ldi-engineering-analytics`, 16 panels) for the deeper per-machine PE/JE breakdown with synchronized multi-parameter RCA timeline (temperature → humidity → scan_speed → air_vacuum → scale_x/y → pe_1-6 → je_1-4 → state).

## 6. Alarm / RCA (1 min)

Navigate to **IMS LDI - Operator Andon Board** (`ims-ldi-operator-andon`, 11 panels) — the actual factory-floor kiosk view, ISA-101 compliant, zero interaction, zero scrolling, tuned for 1280×720.

Say: *"This is literally what runs on the shop-floor TV. No mouse, no scrolling — status is visible from across the room."*

Then open **IMS LDI - Alarm Response (MTTA/MTTR)** (`ims-ldi-alarm-response`, 8 panels) for real mean-time-to-acknowledge/resolve numbers sourced from `public.ldi_alarm_lifecycle` — not simulated.

## 7. Telemetry / data freshness (1 min)

Navigate to **IMS Pipeline Health & Meta-Monitoring** (`ims-meta-monitoring`, Infrastructure, 16 panels).

Say: *"This dashboard watches the pipeline itself, not the fleet — insert rate, batch success rate, retry-queue depth, circuit-breaker state. If data ever goes stale, this is where it shows first."*

Optionally show **IMS Ingestion Latency** (`ims-ingestion-latency`, read-only, 13 panels) for real source-to-database latency evidence.

## 8. Navigation flow (30s)

Recap the drill-down path used throughout: **Fleet → Engineering → Machine Snapshot → Alarm Context → Raw Record** — every link in this chain preserves machine ID, factory, process, and the clicked timestamp, so context is never lost between screens.

## 9. Executive observations

Close on what the audience should walk away with:
- **System health** is visible at a glance without configuration.
- **Data freshness** is itself monitored, not assumed.
- **Drill-down** goes from fleet-wide to a single millisecond in 2-3 clicks, with full context preserved.
- Every number shown is a **real, live query** against production data — nothing is a canned demo screenshot.

---

## Example 7-minute sequence

| Time | Screen | Focus |
|---|---|---|
| 0:00-0:30 | IMS NOC Overview | Server health at a glance |
| 0:30-1:30 | IMS Easy Overview | Whole fleet, zero setup |
| 1:30-3:00 | IMS LDI - Manufacturing Command Center | Executive KPIs → telemetry → alarms |
| 3:00-4:30 | IMS LDI - Machine Snapshot (via drill-down click) | One machine, one moment, full context |
| 4:30-5:30 | IMS LDI - Operator Andon Board | The actual shop-floor kiosk view |
| 5:30-6:30 | IMS LDI - Alarm Response (MTTA/MTTR) | Real response-time numbers |
| 6:30-7:00 | IMS Pipeline Health & Meta-Monitoring | Data freshness is monitored too |

**Expected outcome:** the audience leaves understanding that this is a live, production system with real data integrity guarantees — not a mockup — and that any operator can go from "something's wrong" to "here's the exact machine and moment" in under a minute.
