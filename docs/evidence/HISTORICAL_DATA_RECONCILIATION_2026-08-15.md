<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Historical Data Reconciliation (P1, Reliability Test Suite)

> Investigates every confirmed historical gap and runs a general integrity sweep. Read-only, no container touch.

## The named gap: `sys_metrics` 2026-08-13 ~09:45 → 2026-08-14 ~01:15

**Precise boundaries** (not the approximate ones in the original finding): last sample `2026-08-13T09:38:54.731941Z`, first sample after `2026-08-14T01:18:00.205962Z`. Gap length: **~15h39m**.

**Full-stack, not partial**: `ldi_data` and `ldi_alarm_log` show the identical pattern --

| Table           | Last before gap | First after gap |
| --------------- | --------------- | --------------- |
| `sys_metrics`   | 09:38:54.73     | 01:18:00.21     |
| `ldi_data`      | 09:38:53.45     | 01:14:05.17     |
| `ldi_alarm_log` | 09:38:33.65     | 01:14:06.86     |

All 3 independent tables stop within 21 seconds of each other and resume within ~4 minutes of each other. This is strong evidence of a single event affecting the whole stack simultaneously (host power-cycle, full `docker compose down`/`up`, or similar), not an independent per-table or per-service failure.

**Root cause: UNKNOWN.** Checked `public.container_restart_audit` (built later in this project's history specifically to forensically diagnose events like this) -- its own earliest record is `2026-08-14T04:24:25Z`, **after** this gap ended. The mechanism didn't exist yet when this happened, so there is no direct restart-event evidence, no host-boot-time log accessible for that date, and nothing else in the current schema records host-level events from that far back. Per the explicit instruction not to invent explanations: **this gap's cause is UNKNOWN**, not "probably a restart" or any other guess. What is confirmed, not guessed: it was a real, full-stack, simultaneous outage lasting ~15h39m, not data loss disguised as a gap (no partial/corrupted rows found bracketing it) and not an artifact of a single table's bug.

## Other gaps checked this session (for completeness, not re-investigated here)

- **2026-08-14 ~09:45 → 2026-08-15 ~01:15** (`sys_metrics`, found during the earlier read-only audit): already root-caused with direct evidence in `docs/evidence/SOAK_TEST_LOG.md`'s Attempt 7 closeout -- host `LastBootUpTime` confirmed via `wmic`, matched to container `StartedAt` timestamps within 2 seconds, `IMS-SoakTest` scheduled task's `NumberOfMissedRuns` confirmed the collection mechanism itself stalled. This one has a real, evidenced cause (host power event); not UNKNOWN.

## General integrity sweep

| Check                                                      | Result                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Future timestamps (`time`/`logdate` > `NOW()`)             | 0 across `ldi_data`, `sys_metrics`, `ldi_alarm_log` (measured in `SPEC_TIMESTAMP_INTEGRITY.md`, P0.3)                                                                                                                                                                            |
| Out-of-order events (`ingest_ts` < event time)             | 0 across `ldi_data`, `ldi_alarm_log` (same source)                                                                                                                                                                                                                               |
| Duplicate rows                                             | `sys_metrics`: was 66.9%, fixed to 0% (Phase A1). `ldi_data`, `ldi_alarm_log`, `net_metrics`: confirmed 0 duplicates (`READ_ONLY_AUDIT_2026-08-15.md` §3)                                                                                                                        |
| Impossible values (RAM/disk > 100%, negative values, etc.) | RAM was pinned at exactly 100% for every device -- fixed, P0.1. Disk was pinned at exactly 100% for `ERP-MASTER-UBUNTU` -- fixed, P0.2. No negative-value or >100% findings beyond these two, which are now both fixed                                                           |
| NULL critical fields                                       | Checked: `ldi_alarm_log.equipmentid`/`.errorcode`, `sys_metrics.device_id`, `net_metrics.device_id`, `ldi_data.eqp_id` -- **0 NULLs across all 5 fields, all tables**                                                                                                            |
| Machine mapping failures                                   | Covered by the existing `ldi-data-readiness` dashboard's "Machine ID Mapping Gaps" and "Alarm Code Mapping Gaps" panels (both confirmed populated with real, non-error data in this session's earlier work) -- not re-run fresh in this pass, referencing existing live evidence |

## Reconciliation summary

Two real historical gaps exist in `sys_metrics` (and, for the older one, also `ldi_data`/`ldi_alarm_log`). One has a confirmed cause (host reboot, 2026-08-14→15, evidenced). One does not and is marked UNKNOWN (2026-08-13→14) because the forensic tooling needed to determine its cause didn't exist yet at the time. Both predate every fix in this reliability pass -- neither gap represents an ongoing risk from currently-deployed code. NULL-critical-field sweep: clean, 0 across all 5 checked fields. A fresh machine-mapping-gap re-run (vs. referencing the existing dashboard's live state) remains the one open item from this pass.
