# Backlog: Simulator Realism + Alert Hygiene

> Prepared during the Evidence Consolidation Pass, 2026-08-14. **Not
> started** -- explicitly deferred until Soak Attempt 6 reaches 72h
> clean. Every item below states its current real state, verified
> against the live repo/database this pass, not assumed from memory.
>
> Detailed implementation specs (design, rollout plan, testing plan)
> for the items below live in `docs/architecture/specs/`:
> `SPEC_ALARM_ACTOR_IDENTITY.md`, `SPEC_SIMULATOR_REALISM.md`,
> `SPEC_ALERT_HYGIENE.md`.
>
> **Superseding priority, added 2026-08-14**: `SPEC_PG_POOL_RESILIENCE.md`
> outranks everything below. It fixes a real bug that just invalidated
> Soak Attempt 6 on its own (not dev activity) and can keep doing so
> to every subsequent attempt until fixed. Deploy that fix first, once
> the freeze lifts, before anything in Tracks A or B.
>
> **Second superseding item, added 2026-08-15**: `SPEC_RAM_METRIC_ACCUMULATION_BUG.md`.
> Found during the No-Data-panel dashboard audit -- every device's RAM
> metric accumulates additively across poll cycles instead of resetting,
> saturating at a 1TB safety clamp and pinning Fleet Health Score at a
> permanent 0% on every infrastructure dashboard. Deploy alongside the
> pg-pool fix (same Node-RED redeploy window) once the freeze lifts.

## Why these two, together

Both tracks were explicitly held back earlier this session because
ingestion reliability had to be verified and stable first ("otherwise
it will be creating KPIs based on unverified data"). That verification
is now done (`EVIDENCE_PACK.md` §1). These two tracks are next, in
priority order below, once the soak clock finishes.

---

## Track A: Simulator Realism

| Item                                                                                                          | Current state (verified 2026-08-14)                                                                                                                                                                            | Priority                                                               |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Remove artificial `logdate` backdating for noise-code alarms (`almsim_gen`, `new Date(now - random(0,9000))`) | Root-caused this pass -- currently makes `nearest`-path alarm latency evidence look 500-800x worse than reality. Dashboard/script now correctly label it as simulated, but the simulator itself still does it. | **High** -- directly caused a measurement-integrity incident this pass |
| Real noise/drift on temperature, humidity, vacuum, PE/JE, micro-stop, warm-up drift                           | Not started. `scan_speed` explicitly stays a recipe setpoint (user directive), not touched by this item.                                                                                                       | High (user's original priority order named these 6 explicitly)         |
| Re-run `LDI_ALARM_FIDELITY_AUDIT.md` queries, produce a fresh realism score                                   | Last score (58/100) is from 2026-08-11, predates the debounce/link_basis/rare-critical fixes (Phase D/E/F, applied same week). Current real score is unknown -- could be materially better, untested.          | High -- needed before claiming any realism improvement                 |
| Telemetry generator keeps ~25-45% of readings permanently out-of-spec (from the 58/100 audit)                 | Not fixed. This is _why_ condition-driven alarms fire almost continuously (91.4% of all alarms were condition-driven at audit time) instead of as discrete events.                                             | Medium-high, tied to the audit re-run above                            |

## Track B: Alert Hygiene

| Item                                                                                 | Current state (verified 2026-08-14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Priority                                                                                              |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Alarm actor-identity verification                                                    | **CORRECTED 2026-08-14: access control already exists**, this pass's original entry was wrong. `services/alarm-api` itself has no auth code, but `proxy/nginx.conf` gates `/alarm-api/` behind `auth_request` against Grafana's own `/api/user` (confirmed live in the nginx config, not just documented) -- an unauthenticated caller cannot reach the service at all. The real, narrower gap, per `SECURITY_MODEL.md`'s own stated limitation: `acknowledged_by`/`resolved_by` is free text the client sends, never cross-checked against the authenticated session's actual Grafana username -- so a logged-in operator could attribute an ack/resolve to a different name than their own. See `docs/architecture/specs/SPEC_ALARM_ACTOR_IDENTITY.md`. | Medium -- attribution integrity, not access control. Downgraded from "Highest" after re-verification. |
| MTTA / MTTR dashboard using real lifecycle data                                      | **Does not exist.** No dashboard or panel matches "MTTA"/"MTTR" anywhere in `monitoring/grafana/dashboards/`. `ldi_alarm_lifecycle` has the raw timestamps to build this from.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | High -- lifecycle data exists, nothing surfaces it                                                    |
| Rename "Critical Alarms" panels to match their actual query                          | **Still misleading.** 4 panels titled "Critical Alarms" / "Critical/Major Alarms" exist across `ims-easy-overview`, `ims-ldi-manufacturing`, `ims-ldi-alarm-console`, `ims-ldi-operator-andon`. Per the fidelity audit, the counted rows are Critical+Major combined and, in the live dataset, composed entirely of Major-severity events (0 Critical). Titles overclaim what's shown.                                                                                                                                                                                                                                                                                                                                                                    | Medium -- misleading label, not a functional bug                                                      |
| Move "Pipeline Heartbeat" panel off operator-facing dashboards to an admin dashboard | **Not moved.** Still present on both `ims-ldi-manufacturing` and `ims-ldi-operator-andon` (titled "◉ Pipeline Heartbeat", type `volkovlabs-echarts-panel`). A prior pass hid it on the Andon board via collapse rather than relocating it -- confirm that's still the case before assuming this is done.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Low-medium -- query-noise reduction, not correctness                                                  |
| Add lifecycle quality checks to the Data Readiness dashboard                         | Not started. `ldi-data-readiness` currently checks raw-data integrity, not alarm-lifecycle completeness (e.g., alarms stuck `OPEN` past a reasonable SLA, orphaned lifecycle rows).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Medium                                                                                                |
| Load-test the debounce mechanism against a real flood scenario                       | Not done -- see Trust Report criterion 4, "implemented, not stress-verified."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Medium -- needed to actually claim "flood suppression is running effectively"                         |

## Suggested order, once soak clears

1. Fresh realism audit score (cheap, read-only, tells you if Track A's other items are even still needed at current severity)
2. Remove noise-code `logdate` backdating (small, isolated, already root-caused)
3. Alarm actor-identity verification (small, isolated, closes a real if minor attribution gap)
4. Real environmental noise/drift (temp/humidity/vacuum/PE-JE/micro-stop/warm-up)
5. MTTA/MTTR dashboard + Critical-panel renames + lifecycle quality checks (grouped -- all consume `ldi_alarm_lifecycle`)
6. Heartbeat panel relocation, debounce load test (lowest urgency)

This order is a recommendation, not a commitment -- re-confirm priority with the user before starting, per the standing instruction not to begin any of this until Soak Attempt 6's 72h verdict is in.
