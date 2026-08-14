# Backlog: Simulator Realism + Alert Hygiene

> Prepared during the Evidence Consolidation Pass, 2026-08-14. **Not
> started** -- explicitly deferred until Soak Attempt 6 reaches 72h
> clean. Every item below states its current real state, verified
> against the live repo/database this pass, not assumed from memory.

## Why these two, together

Both tracks were explicitly held back earlier this session because
ingestion reliability had to be verified and stable first ("otherwise
it will be creating KPIs based on unverified data"). That verification
is now done (`EVIDENCE_PACK.md` §1). These two tracks are next, in
priority order below, once the soak clock finishes.

---

## Track A: Simulator Realism

| Item | Current state (verified 2026-08-14) | Priority |
|---|---|---|
| Remove artificial `logdate` backdating for noise-code alarms (`almsim_gen`, `new Date(now - random(0,9000))`) | Root-caused this pass -- currently makes `nearest`-path alarm latency evidence look 500-800x worse than reality. Dashboard/script now correctly label it as simulated, but the simulator itself still does it. | **High** -- directly caused a measurement-integrity incident this pass |
| Real noise/drift on temperature, humidity, vacuum, PE/JE, micro-stop, warm-up drift | Not started. `scan_speed` explicitly stays a recipe setpoint (user directive), not touched by this item. | High (user's original priority order named these 6 explicitly) |
| Re-run `LDI_ALARM_FIDELITY_AUDIT.md` queries, produce a fresh realism score | Last score (58/100) is from 2026-08-11, predates the debounce/link_basis/rare-critical fixes (Phase D/E/F, applied same week). Current real score is unknown -- could be materially better, untested. | High -- needed before claiming any realism improvement |
| Telemetry generator keeps ~25-45% of readings permanently out-of-spec (from the 58/100 audit) | Not fixed. This is *why* condition-driven alarms fire almost continuously (91.4% of all alarms were condition-driven at audit time) instead of as discrete events. | Medium-high, tied to the audit re-run above |

## Track B: Alert Hygiene

| Item | Current state (verified 2026-08-14) | Priority |
|---|---|---|
| Authentication on `alarm-api` | **Not present.** Grepped `services/alarm-api` for auth/JWT/basic-auth/apikey patterns -- none found. The only interactive write surface in the whole system (`ldi_alarm_lifecycle` ack/resolve) is currently unauthenticated. | **Highest** -- this is a real security gap, not a polish item |
| MTTA / MTTR dashboard using real lifecycle data | **Does not exist.** No dashboard or panel matches "MTTA"/"MTTR" anywhere in `monitoring/grafana/dashboards/`. `ldi_alarm_lifecycle` has the raw timestamps to build this from. | High -- lifecycle data exists, nothing surfaces it |
| Rename "Critical Alarms" panels to match their actual query | **Still misleading.** 4 panels titled "Critical Alarms" / "Critical/Major Alarms" exist across `ims-easy-overview`, `ims-ldi-manufacturing`, `ims-ldi-alarm-console`, `ims-ldi-operator-andon`. Per the fidelity audit, the counted rows are Critical+Major combined and, in the live dataset, composed entirely of Major-severity events (0 Critical). Titles overclaim what's shown. | Medium -- misleading label, not a functional bug |
| Move "Pipeline Heartbeat" panel off operator-facing dashboards to an admin dashboard | **Not moved.** Still present on both `ims-ldi-manufacturing` and `ims-ldi-operator-andon` (titled "◉ Pipeline Heartbeat", type `volkovlabs-echarts-panel`). A prior pass hid it on the Andon board via collapse rather than relocating it -- confirm that's still the case before assuming this is done. | Low-medium -- query-noise reduction, not correctness |
| Add lifecycle quality checks to the Data Readiness dashboard | Not started. `ldi-data-readiness` currently checks raw-data integrity, not alarm-lifecycle completeness (e.g., alarms stuck `OPEN` past a reasonable SLA, orphaned lifecycle rows). | Medium |
| Load-test the debounce mechanism against a real flood scenario | Not done -- see Trust Report criterion 4, "implemented, not stress-verified." | Medium -- needed to actually claim "flood suppression is running effectively" |

## Suggested order, once soak clears

1. `alarm-api` auth (security gap, should not wait on anything else)
2. Fresh realism audit score (cheap, read-only, tells you if Track A's other items are even still needed at current severity)
3. Remove noise-code `logdate` backdating (small, isolated, already root-caused)
4. Real environmental noise/drift (temp/humidity/vacuum/PE-JE/micro-stop/warm-up)
5. MTTA/MTTR dashboard + Critical-panel renames + lifecycle quality checks (grouped -- all consume `ldi_alarm_lifecycle`)
6. Heartbeat panel relocation, debounce load test (lowest urgency)

This order is a recommendation, not a commitment -- re-confirm priority with the user before starting, per the standing instruction not to begin any of this until Soak Attempt 6's 72h verdict is in.
