> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

# Dashboard Correctness and Gap Analysis — 2026-08-24

**Scope:** Draft PR #14, isolated Grafana preview on port 3300, and the mentor-provided read-only PostgreSQL database

**Decision:** READY FOR REVIEW AFTER CI IS ABLE TO RUN; NOT READY FOR PRODUCTION SIGN-OFF

**Method:** repository lint/tests, SELECT-only database validation, Grafana browser checks, and end-to-end MIS tile-to-Snapshot navigation

## Executive result

The four mentor-backed dashboards load from datasource UID `mentor-ldi-readonly` without datasource, plugin, or query errors in the tested flows. The database role can connect and SELECT from `ldi_data` but cannot INSERT. The MIS Command Center reports the two currently open incidents and the ten telemetry machines without deriving machine inventory from the five-machine alarm source.

Two traceability defects were found and fixed in this audit:

1. Machine Snapshot had hardcoded default context for `LDI-C-01` and an old event epoch. Opening it with `All` could therefore show the wrong machine.
2. MIS machine tiles did not provide a reliable machine-time drill-down. They now pass the clicked machine and that machine's latest telemetry epoch to Snapshot.

The browser retest passed: clicking the `EXPOSURE LDI-2` tile opened the same machine, displayed seven records from its 09:45 minute, and clicking 09:45:29 retained all seven minute records while updating the selected record context.

## Authoritative database facts

| Check | Verified result | Dashboard implication |
| --- | ---: | --- |
| `ldi_data` rows | 10,000 | Telemetry KPIs are based on this snapshot |
| Telemetry machines | 10 | Machine filters/layout must include all ten |
| Telemetry factories | 2 (`2`, `3`) | Factory 2 must not disappear when alarm data is selected |
| Telemetry time range | 2026-07-20 04:23–09:53 Asia/Bangkok | Snapshot and freshness use database-time context |
| `ldi_alarm_log` rows | 10,000 | Historical alarm/event totals are not active incident totals |
| Alarm-source machines | 5 | Alarm log must not be used as the machine registry |
| Alarm time range | 2026-04-10–2026-07-16 Asia/Bangkok | Alarm and telemetry ranges do not overlap |
| Incident rows | 4,062 | Deduplicated historical incidents |
| Open incidents | 2 | Current MIS action queue |
| Unacknowledged incidents | 2 | Immediate owner/action workload |
| Mapped alarm rows | 9,610 / 10,000 | 96.1% row mapping coverage |
| Distinct unmapped codes | 11 | Alarm dictionary governance remains incomplete |
| PE1 / JE4 row coverage | 45.0% / 45.0% | Cpk must show sample count/confidence and must not imply fleet-wide coverage |
| `board_id` coverage | 0.0% | `board_id` is unavailable in this source snapshot |
| `board_no` + `total_board` coverage | 100.0% | Production progress remains available despite missing `board_id` |

## Correct and retained

- Datasource credentials are supplied through environment variables; no real password is committed.
- Mentor datasource is non-editable and uses a SELECT-only database login.
- Machine inventory/filters use telemetry plus alarm sources rather than alarm rows alone.
- `mis_machine_status` produces ten rows: eight RUN and two ALARM at the database reference time.
- Open incident KPI and action queue both return the same two NEW/MAJOR incidents.
- Snapshot keeps the complete selected-minute list while an exact Timestamp changes the detail panels.
- Fixed historical dashboard time ranges are intentional because the mentor database is a frozen April–July 2026 snapshot.
- Missing process values remain N/A instead of being fabricated or replaced with zero.

## Missing data or governance — must not be invented in dashboards

| Missing item | Why it matters | Required source/owner |
| --- | --- | --- |
| Authoritative alarm severity matrix | Critical/Major/Minor routing cannot be signed off | Process owner / alarm workshop |
| Trigger and reset/clear conditions | Cannot prove active, acknowledged, resolved, or cleared lifecycle from event rows alone | PLC/vendor specification |
| Final factory X/Y/zone coordinates | Current machine layout is provisional, not a surveyed digital twin | Factory layout owner |
| Alarm code mappings for 11 codes | Problem, owner, severity, and action may be incomplete | Alarm master owner/vendor |
| PE/JE values for 55% of rows | Fleet-wide Cpk comparisons can be biased toward machines that report those fields | Equipment/vendor data contract |
| `board_id` values | Board-level unique trace ID is unavailable | Upstream equipment/interface owner |
| Confirmed owner/assignee directory and escalation SLA | Workflow cards cannot be treated as approved operations policy | MIS/maintenance/process management |

## Excess or redundant presentation

The MIS dashboard currently contains both a top machine/incident summary and a second `Latest Machine Health & Data Freshness` summary. The second section repeats RUN, DOWN, STALE, DB Time, and a machine table already represented above. It is not a correctness defect, but it increases reading time and should be consolidated after stakeholder confirmation. Keep one glanceable summary plus one detailed machine table.

The lower Incident Workflow section repeats Open Incidents and Unacknowledged from the first row. Retain the workflow queue, Critical Open, Over SLA, Deduplicated Incidents, and Repeated Events Collapsed; consider removing the two repeated stat cards when the final MIS layout is approved.

## Recommended additions

1. Add an explicit `Machines in Alarm` KPI distinct from `Open Incidents`; one machine may have multiple incidents.
2. Add a `Data Coverage / Confidence` badge beside every PE/JE Cpk KPI.
3. Show `Board ID` and `Board Progress` separately. This audit updates the readiness panel accordingly.
4. Add an `Unmapped distinct codes` KPI next to row-level mapping coverage.
5. After trigger/reset definitions arrive, add lifecycle KPIs for Active, Acknowledged, Resolved, MTTA, and MTTR using the approved event model.
6. After the final layout arrives, replace provisional repeated tiles with the approved Factory → Zone → Machine hierarchy.

## Automated validation

| Validation | Result |
| --- | --- |
| Dashboard linter | PASS — 0 errors; warnings remain for style/layout review |
| Query budget linter | PASS — 0 errors; two range-scan warnings documented |
| Alert rule linter | PASS — 0 errors |
| Documentation over-claim linter | PASS — 0 errors |
| Dashboard JSON parse | PASS |
| Node-RED flow build | PASS — 70 nodes, 5 tabs, no duplicate IDs |
| Browser datasource/plugin/query error scan in tested MIS/Snapshot path | PASS |
| MIS machine tile → exact Snapshot record | PASS |
| Timestamp selection retains selected-minute records | PASS |

## Remaining release blockers

1. GitHub Actions jobs are not executing because the repository owner's GitHub Actions/billing state blocks runner startup. A red check in this state is not test evidence.
2. Repository review approval is required.
3. Alarm Sync and RCA Coverage pre-commit checks require the expected integration database/container and must pass in the canonical CI/integration environment.
4. Responsive, 4K/TV wall, full 15-dashboard browser matrix, and performance p50/p95/max evidence remain incomplete.
5. Alarm severity, trigger/reset, final layout, and ownership/SLA definitions require external approval/data.

## PR recommendation

Keep PR #14 as Draft until GitHub Actions can start and the remaining integration checks run. After green CI and reviewer approval, mark it Ready for review. Do not merge this PR as production sign-off; it is a reviewed staging/preview and audit improvement with explicitly documented source-data limitations.
