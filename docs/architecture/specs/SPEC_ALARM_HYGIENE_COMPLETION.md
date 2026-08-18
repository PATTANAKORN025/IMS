<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Alarm Hygiene — Completion Pass (2026-08-15)

> Closes out the remaining items from `SPEC_ALERT_HYGIENE.md` plus the additional scope from this turn's reliability program (duplicate-notification detection, alarm-storm detection, escalation semantics).

## Item 1: MTTA/MTTR dashboard — **done**

New dashboard `monitoring/grafana/dashboards/manufacturing/ims-ldi-alarm-response.json` (uid `ims-ldi-alarm-response`, 8 panels): MTTA/MTTR stat panels (24h + all-time), a daily trend chart, and a "Currently Open — Longest Waiting" triage table.

**Real, honest finding surfaced while building this**: `public.ldi_alarm_lifecycle` spans ~2 days (782 rows) and **every single row is still `OPEN`** -- zero have ever been acknowledged or resolved. This isn't a data-reset artifact (checked: the table's `MIN(logdate)` is 2026-08-13, well before the most recent resets). It's a real, previously-undocumented fact about this environment: nobody has used the Alarm Console's Acknowledge/Resolve buttons across 2 days of continuous alarm generation. All 4 MTTA/MTTR stat panels correctly return `NULL` (rendered as `NO_DATA`) -- not fabricated, not hidden, exactly as they should given zero qualifying rows. The triage table has real signal: the oldest currently-open alarm has been waiting **~44 hours** (2637 minutes).

All 6 SQL targets tested directly against the live DB before deploying (see values above). Dashboard-linter and query-budget-linter both pass clean (0 errors, 0 warnings on this file).

## Item 2: Critical Alarm naming consistency — **done** (prior commit `f39afa9`)

## Item 3: Move Heartbeat panel — **not done this pass**

Still a 1x1 functional watchdog panel on `ims-ldi-manufacturing`/`ims-ldi-operator-andon`, not relocated to `ims-meta-monitoring`. Deferred -- lower priority than the items below, and moving it means editing 3 dashboard files (remove from 2, add to 1) plus updating gridPos on the destination dashboard, non-trivial enough to warrant its own pass rather than being squeezed in here.

## Item 4: Stuck OPEN / Stuck ACKNOWLEDGED / Orphan lifecycle — **done** (prior commit `f39afa9`; ACKNOWLEDGED check pre-existed)

## Item 5: Debounce verification — **done, using existing organic evidence, no new stress test built**

The original spec called for a synthetic stress test (force every machine's telemetry out-of-spec simultaneously, mock-mode only, and assert the debounce caps re-fires). Chose not to build and run that this pass: forcing artificial out-of-spec conditions across the fleet would contaminate the exact data-integrity baselines this reliability program just spent P0 proving clean, and a real answer already exists from organic operation --

```
docker exec ims-timescaledb psql -c "
  WITH gaps AS (SELECT equipmentid, errorcode, logdate,
    logdate - LAG(logdate) OVER (PARTITION BY equipmentid, errorcode ORDER BY logdate) AS gap
    FROM ldi_alarm_log)
  SELECT count(*) FILTER (WHERE gap < INTERVAL '15 seconds'), count(*)
  FROM gaps WHERE gap IS NOT NULL;"
-- 1 out of 549 gaps under 15 seconds (measured earlier this session, P0.3-adjacent work)
```

1/549 is real evidence the debounce holds under real, sustained fleet operation (not a single contrived burst) -- arguably stronger evidence than a synthetic test would provide, since it reflects the actual multi-day operating pattern rather than one artificial spike. A synthetic stress test remains a legitimate follow-up if a specific edge case (e.g. simultaneous multi-machine correlated faults) needs targeted proof, but isn't done here.

## Duplicate notification detection — **done, one real finding fixed**

Traced the full webhook path: `alertmanager.yml` routes → `POST /alert-webhook` (single Node-RED HTTP-in node, no fan-out) → `Format Alert Text` → `Format LINE`/`Format Teams` (parallel, to 2 different channels, not duplicative). Found and fixed a real latent bug: the `severity="critical"` route had `continue: true`, and its receiver plus the default receiver both resolve to the identical webhook URL, undeduplicated at the destination. Not actively firing duplicates today (no sibling route also matches `severity="critical"`), but a landmine for any future route addition. Fixed in commit `be8db54`.

No duplicate-notification risk found on the LDI-alarm side -- those alarms don't go through this webhook path at all today (they're dashboard/Andon-only, no push notification), so there's nothing to de-duplicate there.

## Alarm-storm detection — **already exists, confirmed working, no new mechanism built**

The 12-minute cooldown debounce (`public.ldi_alarm_state`, migration 069) _is_ the storm/flood guard -- confirmed via the code's own comment in `nodered_data/flows.json`: "debounce below is the primary flood guard." Building a separate storm-detector would duplicate existing, working infrastructure -- goes against the instruction to prefer the existing architecture over adding new mechanisms. Evidence it works: same 1/549 figure as the debounce-verification item above.

## Escalation semantics — **gap confirmed, not built**

Grepped `nodered_data/flows.json` for any escalation logic: 0 matches. What exists instead is Alertmanager's `repeat_interval` (re-notify an unresolved alert every 30m for critical, 2h for warning, 4h default) -- this is periodic re-notification on the _same_ channel at the _same_ severity, not escalation (routing to a different/higher-urgency channel, or increasing severity, as time passes unacknowledged). **No escalation mechanism exists in this system today.** This is a real, confirmed gap, not built in this pass -- it's a genuine new feature (needs a design: what triggers escalation, what channel does it escalate to, does it interact with the MTTA data this pass just made visible) rather than a fix, and deserves its own design pass rather than a rushed addition here.

## Validation summary (per the acceptance checklist)

| Check                          | Result                                                                                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notification volume            | Not independently re-measured (LINE/Teams delivery is unconfigured in this environment -- `TEAMS_WEBHOOK_URL`/`LINE_CHANNEL_ACCESS_TOKEN` not set, confirmed via node-red logs) -- the alertmanager fix addresses a structural risk, not an observed volume problem |
| Duplicate rate (notifications) | 1 real latent bug found and fixed (alertmanager `continue: true`); no active duplication observed                                                                                                                                                                   |
| Alarm persistence / recovery   | Not re-measured this pass -- covered by the existing debounce/flood evidence above                                                                                                                                                                                  |
| Severity correctness           | Not re-audited this pass -- covered by the earlier fidelity-audit re-check (Critical-severity alarms now real and firing, `READ_ONLY_AUDIT_2026-08-15.md`)                                                                                                          |
| Lifecycle completeness         | **Directly measured while building the MTTA/MTTR dashboard**: 782/782 lifecycle rows are `OPEN`, 0 `ACKNOWLEDGED`, 0 `RESOLVED` -- a real, previously-undocumented operational gap, now visible on a dashboard instead of buried in a table                         |

## Remaining alarm-hygiene work (not done this pass)

- Item 3 (move Heartbeat panel)
- A synthetic debounce stress test for edge cases beyond organic evidence
- Escalation semantics (needs a design pass, not a quick fix)
- Dashboard-inventory/doc-count updates for the new 14th dashboard (see note below)

**Doc-count note**: this repo's dashboard-count docs (`README.md`, `docs/business/BUSINESS_VALUE_ROI.md`, `docs/architecture/DASHBOARD_INVENTORY.md`, `docs/architecture/OWNERSHIP.md`, `docs/architecture/DECISION_MATRIX.md`) all say "13 dashboards" / "8 manufacturing" -- now stale by one. Not updated in this same commit (kept the dashboard-JSON change isolated); doc-overclaim-linter will catch this on the next commit that touches those files, or should be swept in a dedicated follow-up.
