<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Read-Only Audit — Alarm Hygiene + RAM Bug Scope + Historical-Data Integrity + Simulator Realism

> **Audit only. Zero files modified, zero commits, zero container touches.** Ordered by the user explicitly to run during Soak Attempt 8 without disturbing it. Everything below is either a live query result, a live dashboard/screenshot check, or a static file read — no number is estimated or carried over from a prior pass without being re-verified against the live system.
>
> Date: 2026-08-15T02:35Z–03:05Z. System state: Soak Attempt 8 in progress (started ~2026-08-15T01:49Z after the host reboot documented in `docs/evidence/SOAK_TEST_LOG.md`), so most datasets are ~1–1.5 hours old, not multi-day.

---

## 1. Alarm Hygiene (re-check of `SPEC_ALERT_HYGIENE.md`, written 2026-08-14)

Re-verified all 5 items against current live dashboard JSON and DB state — the spec's own findings are dated but this confirms whether anything changed since.

| Item                                 | Spec said                                                                               | Confirmed today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. MTTA/MTTR dashboard               | Doesn't exist                                                                           | **Still doesn't exist** — `grep -ri "MTTA\|MTTR"` across all dashboard JSON: 0 matches                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2. Rename 2 "Critical Alarms" panels | 2 of 4 still wrong (`ims-easy-overview`, `ims-ldi-manufacturing`); 2 already fixed      | **Unchanged** — grep confirms exact same 2 panels still titled "Critical Alarms" / "Critical Alarms (1h)"; `ims-ldi-operator-andon`'s panel is correctly "Active Critical/Major Alarms (master-code matched)" (visually confirmed in this session's earlier screenshot too). `ims-ldi-alarm-console` has no Critical-Alarms-count panel at all (spec's premise about a 4th panel there doesn't hold — only 3 panels with this pattern actually exist, not 4; not a new problem, just a correction to the spec's own count) |
| 3. Move "Pipeline Heartbeat" panel   | Exists on both `ims-ldi-manufacturing` and `ims-ldi-operator-andon`, "hidden" not moved | **Unchanged, and now precisely characterized**: `gridPos` on the Andon board is `w:1, h:1` — a 1x1-unit panel, not CSS-hidden, not removed. It's a real functional watchdog (`SELECT NOW() AS time, 1 AS value` on every refresh cycle; per its own description, a stalled dashboard-refresh timer triggers this panel to force-reload the page). Moving it to `ims-meta-monitoring` (spec's recommendation) is still the right call — it's real infrastructure disguised as clutter, not decorative                       |
| 4. Data Readiness lifecycle checks   | 3 candidate checks proposed, none said to exist yet                                     | **Partially already done** — `ldi-data-readiness.json` already has a panel titled "◉ Stuck Acknowledged Alarms" (`WHERE l.status='ACKNOWLEDGED' AND l.acknowledged_at < NOW() - INTERVAL '2 hours'`) — this is exactly the spec's 3rd candidate check, already live. The other two (stuck-`OPEN`-past-SLA, orphaned lifecycle rows with no matching `ldi_alarm_log`) are **not** present — confirmed via full panel-title grep of the dashboard (16 panels total, none titled anything like "stuck open" or "orphan")      |
| 5. Debounce load test                | No script exists                                                                        | **Unchanged** — no file matching `*debounce*` under `tests/` or `scripts/`; only the migration and flow logic that _implements_ debounce exist, no test that stresses it                                                                                                                                                                                                                                                                                                                                                   |

**Net: item 4 is 1/3 done, everything else in this spec is exactly where it was on 2026-08-14.** Safe to batch-fix after soak (all 5 are dashboard-JSON-only or new-test-script — no container restart needed for any of them).

---

## 2. RAM accumulation bug — confirmed scope

`SPEC_RAM_METRIC_ACCUMULATION_BUG.md` (2026-08-15 earlier this session) named `ims-capacity` and `ims-noc-overview` as affected. Grepped all dashboard JSON for `ram_used_mb|ram_total_mb|ram_pct` this pass:

**3 dashboards affected, not 2**: `ims-capacity-planning.json`, `ims-noc-overview.json`, **and `ims-engineering-drilldown.json`** (its "RAM Usage" gauge, confirmed showing 100.00% in this session's earlier screenshot too — the spec doc under-counted by one; will fix that doc's verification checklist when the RAM fix itself is deployed).

---

## 3. Historical-data integrity — 3 independent findings, not 1

Went looking for gaps, duplicates, and generally whether the numbers in `sys_metrics`/`ldi_data`/`net_metrics`/`ldi_alarm_log` can be trusted. Found three separate, real problems — none of them touch the manufacturing telemetry (`ldi_data`) or alarm log (`ldi_alarm_log`) that RCA/SPC evidence is built on, which are both clean.

### 3a. Two real ingestion gaps in `sys_metrics` (infra telemetry only)

`time_bucket('15 min', time)` over the full `sys_metrics` history shows two multi-hour stretches with **zero rows**: `2026-08-13 09:45` → `2026-08-14 01:15` (~15.5h) and `2026-08-14 09:45` → `2026-08-15 01:15` (~15.5h). The second gap is independently corroborated by this session's earlier soak-log forensics (host powered off between the last Attempt-7 sample and the 2026-08-15T01:09:30Z reboot) — this is the same event seen from two different data sources, not a new mystery. The first gap wasn't previously investigated; worth a quick look before the next soak attempt starts (not done in this pass — read-only scope, and it's history, not urgent).

### 3b. `sys_metrics` is 67% duplicate rows — a real, previously-undiscovered bug, isolated to this one table

```sql
SELECT COUNT(*) AS total_rows, COUNT(*) - COUNT(DISTINCT (device_id,time)) AS extra_dup_rows FROM public.sys_metrics;
-- total_rows=13317  extra_dup_rows=8911  (66.9%)
```

Every single `(device_id, time)` pair has either exactly 3 or exactly 4 rows — never 1, never 2, never 5+ (4,307 pairs at 3x, 99 pairs at 4x). The duplicate rows are byte-identical (same disk/ram/cpu values, same microsecond timestamp), so this isn't clock-skew or retry-with-different-data — it's the same sample written multiple times.

**Root cause, traced node-by-node from `sre_parser` to the actual `INSERT`, no remaining inference** (follow-up pass, 2026-08-15T03:1x Z):

`sre_parser` (`nodered_data/flows.json`, function node, "SRE AIOps Parser v9 (Batch)") wires to exactly one downstream node: a `postgresql` node named `TimescaleDB` (`db_insert`), plus a debug node — no fan-out at the DB layer. So the multiplication happens _inside_ `sre_parser` itself, not from multiple insert paths. Reading its full function body:

- `sre_parser` is invoked once per SNMP-walker-type message (`walk_cpu`, `walk_storage`, `walk_net_get`, `walk_temp`, `walk_ldi` all wire into it separately — confirmed in the previous pass).
- It keeps one shared `state` object per device (`flow.get('dev_state_'+ctxKey)`), updating only the slice relevant to whichever `walkerType` just arrived (e.g. `walkerType === 'storage'` updates `state.ram_*`/`state.disk_*` only).
- **The bug is this line**: `if (walkerType === 'cpu' || walkerType === 'storage' || walkerType === 'temp') { ...; buffer.sys.push({device_id, cpu_cores: state.cpu_cores, ..., ram_total_mb: state.ram_total, ..., disk_total_gb: state.disk_total, ..., temp_c: state.temp}); }` — it pushes a **full snapshot of the entire shared `state`** (cpu + ram + disk + temp together) onto the `sys` batch buffer on _every one_ of the 3 walker-type completions, not once per real polling cycle. Three walkers land within the same ~10-second window, each re-pushing the nearly-unchanged full state — that's the "always 3, sometimes 4" (a 4th walker firing near a buffer-flush boundary) pattern exactly.
- Every `BATCH_INTERVAL_SEC` (10s), the accumulated `buffer.sys` array gets flushed as **one single multi-row `INSERT INTO sys_metrics (...) VALUES (NOW(),...),(NOW(),...),(NOW(),...)`** statement (`buildBatchQueries`). Postgres evaluates `NOW()` once per statement/transaction, not once per row — so all 3-4 rows in that one INSERT get the _exact same_ `time` value, which is why the duplicates share an identical microsecond timestamp down to the last digit, not just similar values.
- `net` and `ldi` walker types push to _separate_ buffers (`buffer.net`, `buffer.ldi`) exactly once per their own completion — no analogous multi-walker-into-one-row pattern exists for those tables, which is exactly why `net_metrics` came back clean in the blast-radius check below. (Note: `sre_parser`'s `ldi` branch writes to a table called `ldi_metrics`, not `ldi_data` — the 34-column manufacturing telemetry table checked for duplicates below is populated by a different mechanism entirely, not this function. Doesn't change the finding, just a naming clarification.)

**Exact fix location for Phase A1** (not written in this pass — audit only): `nodered_data/flows.json`, node id `sre_parser`, the line `if (walkerType === 'cpu' || walkerType === 'storage' || walkerType === 'temp') { enforceBufferLimit(buffer.sys, 'sys'); buffer.sys.push({...}); }`. Needs to push exactly once per real polling cycle (e.g. gate on the last walker type expected per cycle, or track which walker types have reported since the last push and only push once all three have landed) instead of once per constituent walker type.

**Blast radius**: confirmed isolated to `sys_metrics`. Checked `ldi_data` (0 duplicates / 34,689 rows), `ldi_alarm_log` (0 duplicates / 677 rows), `net_metrics` (0 duplicates / 8,546 rows) — all clean, because each of those is written from a single walker type (`ldi`, alarm-trigger logic, `net` respectively), not a fan-in. **This means every dashboard panel that does `COUNT(*)` or a rows/sec rate off `sys_metrics` directly (as opposed to averaging a ratio, which duplicates don't skew) has been over-reporting by roughly 3x this whole time.** Haven't audited which specific panels do a raw count vs. an average — that's a real follow-up, not done in this pass.

### 3c. `ubuntu.snmprec`'s disk config is mathematically pinned at 100% — separate bug from the RAM one

`ERP-MASTER-UBUNTU`'s `disk_used_gb == disk_total_gb` for **every single sample in its entire history** (back to 2026-08-13, the earliest data). Confirmed this is not the RAM accumulation bug (`parser.js`'s disk-handling code does a clean `=` replacement each cycle, not `+=` — read directly, not assumed).

Root cause is in `monitoring/snmpsim/ubuntu.snmprec` itself:

```
1.3.6.1.2.1.25.2.3.1.5.2|2|52428800          <- hrStorageSize (disk), STATIC
1.3.6.1.2.1.25.2.3.1.6.2|2:numeric|min=65536000,max=125000000,rate=50000   <- hrStorageUsed (disk), RANDOM WALK
```

The used-value's _minimum_ (65,536,000) already exceeds the static total (52,428,800) — used can never be less than ~125% of total by construction, and `parser.js`'s own `Math.min(diskUsedGb, diskTotalGb)` clamp then forces it down to exactly 100% every time, which is exactly what's observed. Compared against `windows.snmprec`, which uses the **same** used-range (`min=65536000,max=125000000` — identical numbers) but a correctly-sized total (`200000000`) that safely exceeds it. This is a copy-paste config bug: the used-range template was reused across both `.snmprec` files without recalculating `ubuntu.snmprec`'s disk size to stay above it.

**Correction (2026-08-15, P0.2 investigation)**: the "9,375 → 12,500 GB growth" above was wrong -- a measurement artifact from this doc's own `time_bucket('10 min', ...)` `AVG()` query, not a real trend. Checked the raw, unbucketed rows: `disk_total_gb` for `ERP-MASTER-UBUNTU` takes exactly 2 distinct values across its entire history -- `0` (9 rows, from the parser's `isOffline`/`isEmpty` zeroing branches during brief walker gaps) and `12500` (3,478 rows, every other sample). There is no intermediate value anywhere in the raw data. A 10-minute bucket that happens to average three `12500` rows with one `0` row produces `9375` -- an artifact of the averaging window, not a real progression. `disk_total_gb` has been pinned at exactly 12500 (matching the static `size × au` calculation) since the very first sample. No second mechanism exists; this was fully explained by the single `.snmprec` used-range misconfiguration already documented above.

---

## 4. Simulator realism — status re-check, not a full audit re-run

`LDI_ALARM_FIDELITY_AUDIT.md` (2026-08-11, scored 58/100) predates `Phase D` (debounce, task #183) and `Phase F` (rare Critical codes, task #185), both completed later per the task history. Re-checked its two biggest findings live rather than re-citing the stale score:

- **Finding #6 (no debounce, sustained flooding)**: re-checked. Of 549 alarm-to-same-alarm gaps measured today, only 1 is under 15 seconds (was hundreds, routinely, in the original audit). **Debounce is real and working.**
- **Finding #8/#9 (zero Critical-severity alarms possible)**: re-checked. Catalog now has 43 Critical rows (was 0), and **1 Critical-severity alarm has actually fired** in the live dataset (was structurally impossible before). **Fixed, verified with a live-fired event, not just a catalog change.**

**The 58/100 score is now stale in the positive direction** — a full audit re-run (all 10 sections, per `LDI_ALARM_FIDELITY_AUDIT.md`'s own appendix queries) would very likely score meaningfully higher, but wasn't re-run in full this pass (out of scope for a read-only spot-check; it's the right next step, not done here). The RCA Lift re-measurement from earlier this session (`LDI_RCA_GUIDE.md`, same caveat: small post-reset sample, most categories LOW SAMPLE) is a related, already-current data point — not repeated here.

`SPEC_SIMULATOR_REALISM.md`'s specific item 1 (noise-code backdating, exact fix diff already written) was re-read against the current `nodered_data/flows.json` — the diagnosed line is unchanged, the fix is still accurate and still not applied.

---

## Summary for batch remediation planning (after Soak Attempt 8 completes)

Ranked by evidence confidence and blast radius, not effort:

1. **`sys_metrics` 3-4x duplicate inserts** (§3b) — biggest number (67% of a whole table wasted, every raw-count panel off by ~3x), root cause traced to the walker-fan-in pattern but the exact insert-node wiring needs one more look before writing the fix. New finding, not in any prior spec doc — needs its own spec before the batch fix.
2. **RAM accumulation bug** (already spec'd, `SPEC_RAM_METRIC_ACCUMULATION_BUG.md`) — scope corrected to 3 dashboards.
3. **`ubuntu.snmprec` disk misconfiguration** (§3c) — new finding, config-file-only fix (no `parser.js` change needed), technically doesn't even need a Node-RED code redeploy — just correcting the `.snmprec` file and restarting the `snmpsim` container specifically. Worth checking whether that's a narrower, lower-risk restart than a full Node-RED redeploy.
4. **Alarm Hygiene items 1, 2, 3, 5** (`SPEC_ALERT_HYGIENE.md`) — all dashboard-JSON or new-test-script only, no container restart required for any of them; could go out **before** the other 3 land, independent of the soak cycle, if desired.
5. **Item 4's remaining 2 lifecycle checks** (stuck-OPEN, orphaned rows) — same category as #4, dashboard-only.
6. **Simulator realism items 2-4** (`SPEC_SIMULATOR_REALISM.md`) — still not designed in detail (noted as needing the brainstorming skill's real design process when that spec was written); backdating removal (item 1) is ready to ship as-is.
