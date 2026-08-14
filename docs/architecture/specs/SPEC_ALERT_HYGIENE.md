# Spec: Alert Hygiene Pass

> Status: **spec only, not implemented.** Prepared offline during the
> Soak Attempt 6 freeze, 2026-08-14. No dashboard/runtime file touched
> to produce this document.

## Item 1: MTTA / MTTR dashboard

**Current state**: no MTTA/MTTR panel or dashboard exists anywhere in
`monitoring/grafana/dashboards/` (grepped this pass, 0 matches). The
raw data to compute both already exists in
`public.ldi_alarm_lifecycle`: `logdate`/`logid` (alarm fired),
`acknowledged_at` (first human touch), `resolved_at` (closed).

**Design**:

- **MTTA** (mean time to acknowledge) = `AVG(acknowledged_at - logdate)`
  over `WHERE acknowledged_at IS NOT NULL`, grouped by whatever
  dimension is useful (per-machine, per-severity, per-shift). Severity
  needs a join back to `ldi_alarm_ms_code` since `ldi_alarm_lifecycle`
  itself doesn't carry it.
- **MTTR** (mean time to resolve) = `AVG(resolved_at - logdate)` over
  `WHERE resolved_at IS NOT NULL`, same grouping options.
- Reasonable v1 scope: single new dashboard (not folded into an
  existing one -- this is a distinct "how well is the team responding"
  question, different audience from the RCA/SPC dashboards), 2 stat
  panels (current MTTA/MTTR, e.g. last 24h) + 1 trend panel (daily
  MTTA/MTTR over the selected range) + 1 table (worst-offender alarms
  by time-to-ack, for triage).
- **Real caveat to document up front, not discover during
  implementation**: MTTA/MTTR are meaningless in mock-simulator mode
  unless someone is actually clicking Ack/Resolve regularly -- in a
  quiet mock environment this dashboard will show mostly nulls/low-n,
  same honesty requirement as the ingestion-latency dashboard's
  "alarms are rare/debounced, low sample count expected" caveat.
  State that explicitly in the new dashboard's description text, don't
  let it look broken instead of quiet.
- Owner/decision context (per `DECISION_MATRIX.md`'s pattern once
  built): "Is the team responding to alarms fast enough?" -- shift
  lead / manufacturing owner audience, same as Manufacturing Command
  Center.

## Item 2: Rename "Critical Alarms" panels

**Current state, verified this pass**: 4 panels across
`ims-easy-overview`, `ims-ldi-manufacturing`, `ims-ldi-alarm-console`,
`ims-ldi-operator-andon` are titled "Critical Alarms" / "Critical/Major
Alarms" but the underlying queries count Critical **and** Major
severity together, and in the live dataset the counted rows are 100%
Major (0 Critical) -- per the original fidelity audit. Two of the four
panels already say "Critical/Major" in the title
(`ims-ldi-alarm-console`, `ims-ldi-operator-andon`, confirmed this
pass) -- only 2 are actually wrong: `ims-easy-overview`'s "Critical
Alarms (1h)" and `ims-ldi-manufacturing`'s "Critical Alarms".

**Design**: rename those 2 panel titles to "Critical/Major Alarms
(1h)" and "Critical/Major Alarms" respectively, matching the other 2
that already got this right. Purely a title-string edit, same query,
same panel ID, same gridPos -- lowest-risk item in this whole document.
Consider at the same time whether the query itself should offer a
true Critical-only breakout now that Phase F's `RARE_CRITICAL_CODES`
means Critical-severity rows can actually occur (they couldn't at
audit time) -- worth checking the current live count before deciding
whether a split is warranted or still premature.

## Item 3: Move "Pipeline Heartbeat" panel

**Current state, verified this pass**: "◉ Pipeline Heartbeat"
(`volkovlabs-echarts-panel`) exists on both `ims-ldi-manufacturing` and
`ims-ldi-operator-andon`. A prior pass (task #204) "hid" it on the
Andon board rather than relocating it -- need to re-check its current
`gridPos`/collapse state on both dashboards before assuming this is
still just a display toggle vs. actually removed, since dashboard
edits since then could have changed it either way.

**Design**: no dedicated "admin" dashboard currently exists in this
repo's 13-dashboard inventory to move it *to*. Two real options:

1. Create a small new admin/ops dashboard (would be dashboard #14,
   needs its own entry in `DECISION_MATRIX.md` and `OWNERSHIP.md`,
   plus updates to every dashboard-count doc the overclaim linter
   checks -- non-trivial for a single panel).
   `ims-meta-monitoring` ("IMS Pipeline Health & Meta-Monitoring")
   already exists and is explicitly the "watches the pipeline itself"
   dashboard -- Pipeline Heartbeat fits its stated purpose exactly.
   Moving it there is additive to an existing dashboard, not a new
   one -- lower blast radius, recommended over option 1.

**Recommendation**: option 2 (move into `ims-meta-monitoring`), unless
there's a reason operator-facing dashboards specifically need a live
heartbeat visible that this spec doesn't currently know about --
confirm with whoever uses those dashboards day-to-day before removing
it from their view entirely.

## Item 4: Lifecycle quality checks on Data Readiness dashboard

**Current state**: `ldi-data-readiness` ("LDI Data Readiness &
Integration Gaps") checks raw-data integrity (per its own description:
"Evidence-based readiness dashboard using only current PostgreSQL
rows"), not alarm-lifecycle completeness.

**Design, candidate checks** (each a real, checkable SQL condition,
not a vague "quality" gesture):

- Alarms stuck `OPEN` past a reasonable SLA (e.g. `> 4 hours` --
  threshold needs a real operational answer, not invented here) --
  `SELECT count(*) FROM ldi_alarm_lifecycle WHERE status='OPEN' AND logdate < NOW() - INTERVAL '4 hours'`.
- Orphaned lifecycle rows: a `ldi_alarm_lifecycle` row whose
  `(logdate, logid)` has no matching `ldi_alarm_log` row (shouldn't
  happen given the FK from migration 077, but the readiness dashboard
  exists precisely to catch "shouldn't happen" cases with evidence
  instead of assumption).
- `ACKNOWLEDGED` rows that never reach `RESOLVED` within some window --
  distinct from "stuck OPEN," this is "stuck mid-workflow."

**Rollout**: additive panels to an existing dashboard, same pattern as
Item 3's recommended approach -- no new dashboard, no inventory-count
doc changes needed.

## Item 5: Load-test the debounce mechanism

**Current state**: `ldi_alarm_state`-based 12-minute cooldown is
implemented and code-reviewed (Phase D), never stress-verified against
an actual flood (e.g. forcing every machine's telemetry out-of-spec
simultaneously).

**Design**: this is a test-writing task, not a dashboard/schema change
-- lowest design complexity of all 5 items, but needs to run *against*
a real environment to mean anything, which is exactly why it's
deferred past the soak freeze. Candidate approach: a script that
temporarily forces `ldi_data` rows for all machines into out-of-spec
ranges (mock-mode only, never against real data), watches
`ldi_alarm_log` insert rate over several 10s ticks, and asserts the
debounce actually caps re-fires per (machine, code) to what
`COOLDOWN_MIN` implies. Needs `LDI_SIMULATOR_ENABLED=true` (mock mode)
as a hard precondition -- flag loudly if run against real data mode by
mistake.

## Sequencing note

Items 2 and 4 are additive/low-risk and could reasonably go first once
the freeze lifts. Item 1 (MTTA/MTTR) and Item 3 (Heartbeat move) are
medium scope. Item 5 needs the most care since it deliberately
stresses the alarm pipeline -- schedule it last, and only in mock mode.
