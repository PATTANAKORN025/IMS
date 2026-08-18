<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# IMS LDI Manufacturing Command Center — Next-Phase Audit & Design

Status: **Design/spec only. No implementation.** Written after the 3D Factory Digital Twin was frozen as a validated baseline (Tasks 4.1–4.4, all reviewed/approved, uncommitted, not touched further by this document).

## 0. Purpose

Audit what already exists in the platform relevant to nine requested focus areas, then propose a design for the next phase before any file is touched:

1. C-Level factory overview
2. Production & Compliance
3. Analytics & SPC
4. System Alarms
5. 2D Factory Digital Twin integration
6. 3D Factory Digital Twin integration
7. Operator drill-down
8. Production impact of alarms
9. Factory → Zone → Machine → Alarm → Production traceability

This is not a from-scratch design. The single biggest audit finding is that most of this was already designed once and is either live, orphaned, or half-wired. The next phase is predominantly **repair and integration**, not net-new construction.

---

## 1. Audit

### 1.1 Dashboard inventory (real, from `docs/architecture/DASHBOARD_INVENTORY.md`, regenerated from live JSON)

15 dashboards, 178 panels total. The 10 in the "LDI Manufacturing" group are the relevant surface for this phase:

| UID                             | Purpose (as documented)                                                               | Relevant to phase item |
| ------------------------------- | ------------------------------------------------------------------------------------- | ---------------------- |
| `ims-ldi-manufacturing`         | 4-Layer RCA: Executive HUD + Telemetry + Production Context + Alarm Stream, 21 panels | 1, 2, 3, 4, 9          |
| `ims-easy-overview`             | Fleet-wide, zero-config, built on governed views/functions                            | 1                      |
| `ims-ldi-operator-andon`        | TV-wall kiosk, 1280×720, zero interaction                                             | 1, 7                   |
| `ims-ldi-alarm-console`         | Interactive ack/resolve, writes `ldi_alarm_lifecycle`                                 | 4, 8                   |
| `ims-ldi-alarm-response`        | Real MTTA/MTTR from `ldi_alarm_lifecycle`                                             | 4, 8                   |
| `ims-ldi-alarm-dictionary`      | Alarm-code reference lookup, drill-in only                                            | 4                      |
| `ims-ldi-engineering-analytics` | Layer-3 RCA + SPC control charts, CUSUM/Nelson Rules                                  | 3, 8                   |
| `ims-ldi-machine-snapshot`      | 360° per-machine snapshot at a clicked timestamp                                      | 7, 9                   |
| `ims-ldi-factory-digital-twin`  | 2D Canvas twin, 10 machines / 5 zones                                                 | 5, 7, 9                |
| `ldi-data-readiness`            | Evidence-based DB readiness, no simulated data                                        | (support only)         |

Plus, outside the dashboard layer: `services/factory-twin-3d/` (3D twin, just frozen, item 6), `services/alarm-api/` (ack/resolve write endpoints, item 4/8).

### 1.2 Finding A — Manufacturing Command Center already has 5 designed sections that are silently broken

`ims-ldi-manufacturing.json` has row panels titled exactly:

- `◈ PRODUCTION & COMPLIANCE` (row id 10001)
- `◈ ANALYTICS & SPC` (row id 10003)
- `◈ SYSTEM ALARMS` (row id 10004)
- `◈ RCA FLEET SUMMARY` (row id 10006)
- `◈ CYCLE TIME & TRACEABILITY` (row id 10013)

These map almost one-to-one onto phase items 2, 3, 4, 8, 9. Each row has `collapsed: false` but its content panels live only in a stale `panels: [...]` array nested _inside_ the row object — a structure Grafana only renders when a row is `collapsed: true`. With `collapsed: false`, Grafana expects those panels as siblings in the dashboard's top-level `panels[]` array with their own `gridPos`; they are not there. **Net effect: 9 fully-built panels exist in the JSON and are invisible in the live dashboard.** Confirmed directly (not inferred) by parsing the JSON and diffing `panels[]` (flat, 21 entries, matches the inventory's panel count) against each row's orphaned `panels` sub-array:

| Row                       | Orphaned panel                  | Type           |
| ------------------------- | ------------------------------- | -------------- |
| PRODUCTION & COMPLIANCE   | Production & Process Table      | table          |
|                           | Temperature Compliance (22±2°C) | state-timeline |
|                           | Humidity Compliance (55±5%)     | state-timeline |
| ANALYTICS & SPC           | Calculated Time per Board       | heatmap        |
|                           | Z-Score: temperature            | timeseries     |
| SYSTEM ALARMS             | Recent Alarm Events (Last 50)   | table          |
| RCA FLEET SUMMARY         | Top Correlated Alarms (24h)     | table          |
| CYCLE TIME & TRACEABILITY | Avg Cycle Time (Fleet)          | stat           |
|                           | Board Traceability              | table          |

The dashboard currently renders only its top section (Executive HUD: PRODUCTION / QUALITY / RISK rows, 13 stat/table panels, y=0–15) plus one Pipeline Heartbeat panel — everything below y=16 is empty screen space in the live dashboard despite 9 fully-specified panels sitting unused in the file. This is very likely leftover from a row-collapse/expand edit that didn't re-flatten the panel array. It was not touched or fixed by this document — verification only.

**Implication for the design below**: sections 2 (Production & Compliance), 3 (Analytics & SPC), and part of 4 (System Alarms) and 9 (Traceability) already have a first-draft query/panel design sitting in this file. The next-phase plan should audit each orphaned panel's `targets` (SQL) for correctness and reuse against current schema before writing anything from scratch.

### 1.3 Finding B — the alarm subsystem is real, multi-layered, and already supports most of item 8

- `public.ldi_alarm_log` / `ldi_alarm_ms_code` (master dictionary) / `ldi_alarm_lifecycle` (ack/resolve state machine: `status` OPEN→ACK→RESOLVED, `acknowledged_by`/`resolved_by`/`resolution_note`) / `v_ldi_alarm_category` (category rollup).
- `public.v_ldi_alarm_context` (`postgres/init/039-rca-alarm-view.sql`) already joins each alarm to the machine's telemetry in the preceding 5 minutes and flags `flag_temp_out_of_spec` / `flag_vac_out_of_spec` / `flag_pe_out_of_spec` — this is a working, live, real "did this alarm coincide with an out-of-spec process condition" join. Directly relevant to item 8 (production impact of alarms) and already used by Engineering Analytics' RCA panels.
- `public.v_ldi_rca_truth_test` (materialized, `database/migrations/064-materialize-spc-fleet-rca-views.sql`) goes further: for each alarm category it computes an observed out-of-spec **rate during the alarm window vs. a fleet baseline rate**, and a **lift ratio**, with a `LOW SAMPLE (n<30)` confidence flag. This is a genuine, already-computed "how much does this alarm class actually correlate with a production/quality problem" statistic — not something that needs to be invented for item 8, only surfaced.
- `services/alarm-api/` (Express, real DB writes to `ldi_alarm_lifecycle`, proxied at `/alarm-api/` behind the same `auth_request` gate the 3D twin reuses) already implements the write side (`POST /alarms/ack`, `POST /alarms/resolve`) that `ims-ldi-alarm-console.json` calls into.
- Refresh cadence: `v_machine_spc_fleet`, `v_ldi_rca_recent_window`, `v_ldi_rca_truth_test` are TimescaleDB materialized views refreshed every 1 minute via a background job (`add_job('public.refresh_spc_fleet_rca_mvs', INTERVAL '1 minute')`) — no `pg_cron` dependency, self-contained.

### 1.4 Finding C — SPC data already exists at fleet scale, separate from the per-machine RCA dashboard

`public.v_machine_spc_fleet` (materialized) gives, per `eqp_id` + `location`: `n_pe`/`cp_pe`/`cpk_pe`/`pe_pass_rate`, the same for JE, plus `worst_cpk`/`worst_n`. This is the fleet-wide SPC summary `ims-easy-overview.json` already draws its "Avg Cpk (Fleet)" stat from. Item 3 (Analytics & SPC) at the Command Center level can reuse this directly rather than re-deriving Cpk math; the deeper per-parameter control charts (CUSUM, Nelson Rules, Thickness/Scale control charts) already live in `ims-ldi-engineering-analytics.json` and should stay there — item 3 in the Command Center is a summary/navigation surface into that dashboard, not a duplicate of it.

### 1.5 Finding D — the traceability chain (item 9) exists as disconnected fragments, not one path

Real pieces, each independently confirmed present and populated this session or in adjacent tasks:

- **Factory → Zone**: `public.devices.location` — exactly 5 real string values, no numeric/x-y coordinate columns. This is the same zone model both the 2D and 3D twins use.
- **Zone → Machine**: `public.devices.device_id`, `device_type='ldi'`, 10 of 23 registered rows actually reporting (`LDI-01`..`LDI-10`).
- **Machine → Alarm**: `ldi_alarm_log.equipmentid` → `ldi_alarm_ms_code` → `ldi_alarm_lifecycle` (by `logid`+`logdate`) → `v_ldi_alarm_category`.
- **Alarm → Production**: `v_ldi_alarm_context` (5-minute telemetry join + spec-flags) and `v_ldi_rca_truth_test` (category-level lift), both described above.
- **Machine → Production/Board**: `public.v_ldi_machine_latest_full` (`board_no`, `total_board`, `mo`, `log_id`), `v_ldi_machine_snapshot`, `v_ldi_event_timeline`, and the orphaned "Board Traceability" table panel in Finding A.

No dashboard currently presents these as one connected click-path (Factory → Zone → Machine → Alarm → Production). The closest existing thing is the twins' drill-down convention (`var-machine_id`+`var-factory` → Machine Snapshot, defaults resolving to "latest event, all MOs") plus Machine Snapshot's own "Alarm Context (±5 min)" panel — that's Machine → Alarm and Machine → Production already joined at the leaf. What's missing is the Factory/Zone entry point and an Alarm → Production summary at the top of the chain, not the underlying data.

### 1.6 Finding E — operator drill-down (item 7) convention is already proven, twice

Both twins and the Action Queue / Alarm Console pattern converge on the same URL contract, independently verified across four SDD tasks this session:

```
/d/ims-ldi-machine-snapshot/set2-machine-snapshot?var-machine_id=<eqp_id>&var-factory=<factory>&from=...&to=...
```

Omitting `var-mo`/`var-event_time_ms` deliberately resolves Machine Snapshot's own variable defaults to "latest event, all MOs" (verified against `ims-ldi-machine-snapshot.json`'s variable query logic three separate times: 2D POC, 2D full build, 3D POC). This is the standing convention — the next phase should reuse it verbatim for any new drill-down entry point (C-Level overview → zone, zone → machine, etc.), not invent a second convention.

### 1.7 Finding F — 2D and 3D twins are both real, both frozen/stable, and currently isolated from the Command Center

Neither `ims-ldi-factory-digital-twin.json` (2D) nor `services/factory-twin-3d/` (3D) is linked from `ims-ldi-manufacturing.json` or vice versa. They are freestanding. Both already expose the same state/board/MO/alarm data per machine and the same drill-down target. Item 5 and 6 are therefore an **integration** problem (where do these live relative to the Command Center — embedded panel, top-level nav link, or a switcher), not a rebuild.

### 1.8 What's genuinely missing (not just orphaned)

- No single "C-Level factory overview" surface exists yet that sits above per-machine detail — `ims-easy-overview.json` is the closest (zero-config fleet glance) but is framed as an ops/engineering fast-path, not an executive summary, and has no zone/factory rollup.
- No panel anywhere aggregates "alarms and their measured production impact" into one ranked view for a manufacturing owner — the math exists (`v_ldi_rca_truth_test`), the presentation doesn't.
- No dashboard currently offers the full Factory → Zone → Machine → Alarm → Production click path as a single guided flow; each hop's data exists, the connective navigation doesn't.

---

## 2. Design proposal

### 2.1 Principle: repair before rebuild

Given Finding A, the first concrete task of the next phase's implementation (not this document) should be re-flattening `ims-ldi-manufacturing.json`'s 5 broken rows before any new panel is designed — auditing each orphaned panel's SQL against the current schema (some may predate schema changes made later in this session, e.g. `board_id`/`log_id` findings) and either restoring, correcting, or deliberately replacing each one. This is expected to resolve a meaningful fraction of items 2, 3, 4, and 9 without new panel design at all.

### 2.2 Per-item design direction

1. **C-Level factory overview** — new top section (or new dashboard — open question, see §3) one level above `ims-easy-overview`'s fleet-glance: factory/zone rollup (5 zones), not per-machine. Reuses `v_ldi_machine_latest_full` + `devices.location` grouping already proven in both twins.
2. **Production & Compliance** — repair the existing orphaned row first (Production & Process Table, Temp/Humidity Compliance timelines — the same panel _type_ already proven working on Operator Andon). Verify the orphaned panels' queries still match current schema before restoring.
3. **Analytics & SPC** — repair the orphaned row (Calculated Time per Board, Z-Score temperature) as the Command Center's summary layer, backed by `v_machine_spc_fleet` (already 1-minute-refreshed) for fleet Cpk, with a documented "see Engineering Analytics for full SPC control charts" drill-out rather than duplicating that dashboard's depth.
4. **System Alarms** — repair the orphaned "Recent Alarm Events" table; decide whether Command Center should also embed Alarm Console's ack/resolve affordance or stay read-only-status with a drill-out link (open question, §3) — Andon Board's existing "read-only status, separate interactive Alarm Console" split is the established precedent to follow unless there's a reason to diverge.
5. **2D Factory Digital Twin integration** — add a real navigation link (not embedding — Canvas panels are heavy and the twin is already a full dashboard) from Command Center to `ims-ldi-factory-digital-twin`, and vice versa if useful. No new query work needed; the twin's data is already equivalent to what Command Center's per-machine layer shows.
6. **3D Factory Digital Twin integration** — same navigational integration as item 5, via the existing `/factory-twin-3d/` nginx route (already `auth_request`-gated on the same Grafana session, no new auth work). 3D twin is frozen per the user's explicit instruction this session — no code changes to it as part of this phase unless separately re-authorized.
7. **Operator drill-down** — extend the proven `var-machine_id`+`var-factory` → Machine Snapshot convention (Finding E) to any new zone/factory-level entry point built for item 1, so a C-Level view can drill zone → machine using the same contract everything else already uses.
8. **Production impact of alarms** — surface `v_ldi_rca_truth_test`'s existing lift/confidence computation directly (repairs the orphaned "Top Correlated Alarms" row, Finding A/B) rather than computing a new correlation from scratch. `v_ldi_alarm_context`'s per-alarm spec-flags are the row-level version of the same idea, already available for a detail table.
9. **Factory → Zone → Machine → Alarm → Production traceability** — this is the connective-navigation gap (Finding D/E), not a data gap. Design as a single guided click path using the already-proven drill-down convention at each hop: C-Level overview (zone rollup) → zone detail (machine list, reusing the twins' zone grouping) → machine (Machine Snapshot, already shows alarm context + production context together) — repairing the orphaned "Board Traceability" panel closes the Machine → Production leg specifically.

### 2.3 Explicitly deferred / out of scope for the next phase's implementation plan

- No 3D twin changes (frozen, per explicit instruction).
- No new database migration assumed necessary yet — every finding above points at _existing_ views/functions/tables; if the implementation plan later finds a genuine data gap, that should be flagged explicitly then, not assumed now.
- No CAD models, no machine-to-machine process connections, no invented factory coordinates (standing constraints, unchanged).
- No decision yet on dashboard topology (one Command Center dashboard grown further vs. a new C-Level dashboard vs. restructuring existing ones) — see open questions below; this is a design choice for the next planning pass, not decided by this audit.

---

## 3. Open questions (for the next planning/design pass, not answered here)

1. **Topology**: does the C-Level overview (item 1) become a new top section inside `ims-ldi-manufacturing.json`, or a new standalone dashboard above it in the nav? Manufacturing Command Center is already at 21 declared panels (9 orphaned); adding a zone/factory rollup on top may be better as its own entry point.
2. **System Alarms interactivity**: read-only status (Andon precedent) or embed Alarm Console's ack/resolve (new precedent)?
3. **2D vs 3D twin as the "canonical" drill-in from Command Center**: link both, link one with the other as a secondary option, or a user-facing switcher? Both are real and current; no technical reason yet to prefer one.
4. **Traceability UX**: single dashboard with progressive drill-down links (current site-wide convention) vs. a dedicated "trace this board/alarm" dashboard that pulls all five hops onto one screen — the former matches every existing pattern in this repo, the latter would be a new pattern.
5. **Orphaned-panel repair scope**: are the 9 orphaned panels' underlying SQL queries still valid against the current schema (some may be older than later schema changes discovered this session, e.g. `board_id` being empty / `log_id` substitution)? This needs a query-by-query audit as part of the next implementation task, not assumed clean here.

---

## 4. What this document did not do

No file was modified. No dashboard JSON was touched, restored, or repaired. No migration was written. No query was run except read-only `SELECT`/`\d`/`psql` introspection and read-only `git`/file inspection. This is audit + design only, per instruction.
