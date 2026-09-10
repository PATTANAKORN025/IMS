> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

# Dashboard Traceability Test

**Owner:** Person 1 — Dashboard / Grafana / UX / Traceability  
**Environment:** Friend IMS isolated preview (`http://localhost:3300`)  
**Status:** IN PROGRESS  
**Last verified:** 2026-08-24

## Required navigation hierarchy

`Command Center → 2D Digital Twin → Factory → Zone → Machine → Snapshot`

## Acceptance criteria

1. Link opens a valid Grafana/3D destination and never returns 404 or blank content.
2. `factory`, `zone`, `machine_id`, time range and event/log context are preserved where applicable.
3. The destination machine must exactly match the machine clicked at the source.
4. Clicking a Timestamp may update detail panels but must not unexpectedly discard the minute record list.
5. Browser Back must return to the previous context without silently changing filters.

## Current results

| Test | Status | Notes |
|---|---|---|
| Digital Twin machine color follows DB snapshot | PASS | Fixed and verified on Preview 3300 |
| MIS machine tile → Snapshot | PASS | Browser-tested with `EXPOSURE LDI-2`; machine and latest telemetry epoch were preserved |
| Andon status uses database time | PASS | Prevents browser-clock mismatch |
| Machine Snapshot context | PASS (tested path) | Seven records in the selected 09:45 minute remained visible after selecting 09:45:29; full ten-machine matrix remains incomplete |
| Factory/Zone context preservation | PENDING | Requires real layout and authoritative zone mapping |
| All 15 Dashboard links | PENDING | Browser evidence incomplete |
| Grafana 404 scan | PENDING | Comprehensive scan incomplete |

## Verified browser evidence — 2026-08-24

| Source | Clicked value | Destination context | Result |
| --- | --- | --- | --- |
| Mentor MIS machine tile | `EXPOSURE LDI-2` | `machine_id=EXPOSURE LDI-2`, latest telemetry epoch `1784515558591` | PASS |
| Snapshot minute table | `2026-07-20 09:45:29` | Same machine and all seven 09:45 records retained | PASS |

The audit also removed hardcoded default Snapshot context (`LDI-C-01` and a stale epoch). Direct navigation now starts with `All` and no implicit clicked series.

## Test evidence template

For every link, record:

| Source | Clicked value | Destination URL | Expected context | Actual context | Result | Screenshot |
|---|---|---|---|---|---|---|
| — | — | — | — | — | PENDING | — |

## Known boundaries

- The standalone Factory 3D page is a Friend IMS prototype with simulated positions; it is not the authoritative Grafana 3000 dashboard.
- Machine coordinates remain provisional until the real surveyed factory layout is supplied.
- Synthetic alarms must not be used as proof of real trigger/reset behavior.

## Remaining actions

- [ ] Test every machine card and scene object
- [ ] Test all sibling canvas elements for the same machine link
- [ ] Verify Factory and Zone mappings against the approved master data
- [ ] Verify Snapshot machine, log ID and timestamp
- [ ] Capture screenshots before and after every navigation
- [ ] Record failures with reproducible URLs

## Final sign-off

Traceability is accepted only when all navigation paths pass with matching source/destination context and linked screenshots.
