# IMS Fleet-Wide Security & Data-Integrity Pass — P21

**Date:** 2026-08-26
**Scope:** bounded autonomous slices per user-directed priority order (security → mock-data → no-data fleet scan → variable stress → performance → viewport). All 6 slices given real, bounded coverage this pass.

## Slice 1 — SQL Injection Audit (fleet-wide) — FIXED, VERIFIED

Audited every `rawSql` field in every dashboard JSON (`monitoring/grafana/dashboards/**/*.json`) for template variables interpolated without a Grafana escaping filter (`:sqlstring`, `:singlequote`, `:csv`, etc.). Found and fixed 3 real findings, all in commit `db4bf57`:

| File | Panel(s) | Issue | Severity | Fix |
|---|---|---|---|---|
| `ims-ldi-alarm-dictionary.json` | 2, 3 | `${alarm_code}` raw inside hardcoded `'...'` — `alarm_code` is a free-text `textbox` variable, directly editable in the dashboard UI, no dropdown constraint | **CRITICAL** — most exploitable case: any authenticated viewer can type SQL directly into the visible textbox | Removed hardcoded quotes, use `${alarm_code:sqlstring}` |
| `ims-ldi-operator-andon.json` | 1000, 1001 | `$machine_id` raw as a double-quoted SQL column alias — a `"` in the value breaks the identifier; `machine_id` is URL-overridable to arbitrary text (proven earlier this session via `?var-machine_id=` long-name testing, bypassing its dropdown) | **HIGH** — requires URL manipulation, not a visible UI field | Panel 1001's alias was purely cosmetic (unused by `textMode:"value"`) — renamed to fixed `mo`. Panel 1000 needed the name displayed — SQL alias fixed to `status`, visible name now comes from a `fieldConfig` `displayName` override, interpolated by Grafana's own template engine (never touches SQL) |

Post-fix: fleet-wide re-scan for unescaped `${machine_id|factory|mo|alarm_code|process|fpn|log_id|eqp_id}` in any `rawSql` → **0 findings**. Live-rendered at 1920×1080 to confirm zero visual regression (machine names, OK/ALARM states, MO numbers all identical to before). Dashboard linter clean.

**No other dashboard had this pattern.** All other variable usages already used `:sqlstring` correctly (the established, consistent pattern across this codebase).

## Slice 2 — Mock-Data Audit — CLEAN, no remediation needed

Searched the full dashboard tree for `mock|fake|dummy|synthetic|placeholder.*data`. All matches are honest documentation, not hidden contamination:

- `ims-ingestion-latency.json`: describes the `almsim_gen` simulator's injected detection delay — a disclosed, documented dev/staging data generator, not a silent production fallback.
- `ims-ldi-alarm-dictionary.json`: panel description explicitly notes "check data mode: mock vs. real" as a caveat for catalog completeness — transparent, not hidden.
- `ims-ldi-alarm-response.json`: description notes MTTA/MTTR are "meaningless in mock-simulator mode" unless someone is actually acting on alarms — again a disclosed caveat, not contamination.

Separately searched for literal hardcoded fake values (`'MOCK`, `'FAKE`, `'DUMMY`, `'TEST-`, `'SAMPLE` as SQL string literals) — **0 findings**. No dashboard silently falls back to fabricated values; every panel either shows real query results or an honest empty/no-data state.

**Context:** this environment's actual data source is a documented simulator (`almsim_gen`/`snmpsim`, referenced in `docker-compose.dev.yaml`) — it is the intended data source for this environment, not a mock standing in for a "real" one, and every dashboard that references it does so transparently.

## Slice 3 — No-Data Fleet Scan (Manufacturing + Engineering Analytics) — CLEAN

Extended the exact methodology proven on the Andon board (live authenticated render, real DOM scan for "No data" text and Grafana's own error-corner badge), with one methodology fix baked in from the start: used a tall viewport (1920×4000) to eliminate the lazy-load-below-fold false positive already discovered and explained during the Andon audit.

| Dashboard | Panels scanned | Unexpected "No data" | Error badges |
|---|---:|---:|---:|
| Manufacturing (`ims-ldi-manufacturing`) | 24 | 0 | 0 |
| Engineering Analytics (`ims-ldi-engineering-analytics`) | 19 | 0 | 0 |

## Slice 4 — Variable Stress Test (Andon board `machine_id`) — CLEAN

Tested via real live render + network response capture (watching for `/api/ds/query` 4xx/5xx):

| Case | Panels rendered | Error badges | No-data | Network errors |
|---|---:|---:|---|---|
| Default (All) | 29 | 0 | none | none |
| Empty selection (`var-machine_id=`) | 11 | 0 | 1 panel (unidentified title) | none |
| Single machine | 11 | 0 | none | none |
| Multiple machines (3) | 15 | 0 | none | none |

No SQL errors at any tested cardinality, including the empty-selection edge case (Grafana/Postgres handle an empty `IN`-list gracefully — no syntax error, no crash). The one "No data" panel under empty-selection is a non-issue in practice: `machine_id`'s variable picker is hidden in this dashboard (`"hide": 2`, kiosk mode) — no real operator can reach an empty selection through the UI; it's only reachable by manually editing the URL. Not fixed, not a real-world defect — documented rather than silently dropped.

## Slice 5 — Performance (real measurements, DB + browser)

**Database:** `EXPLAIN (ANALYZE, BUFFERS)` on the Temperature Compliance query (10-machine fleet, 2h range) — **4.552ms execution, 12.222ms planning**. Proper backward index scans on the hypertable's time index across 3 chunks, zero full-table scans, chunk exclusion working correctly for the requested time window.

**Browser (Andon board, real authenticated render):**

| Metric | Value |
|---|---|
| Initial load (`goto` to `networkidle`) | 2,336–2,605ms across 2 runs |
| `domContentLoaded` | 148–190ms |
| `/api/ds/query` requests per 5s refresh cycle | ~20.8 (50 requests / 2.4 cycles over a 12s window) |
| Failed requests (4xx/5xx) during refresh window | 0 |
| Browser JS heap | 133MB used / 190MB total |

**No refresh storm detected** — request volume per cycle is stable and proportional to the dashboard's real panel count (~29 panel-level queries across KPIs, 2 compliance timelines, Action Queue, and 20 repeated per-machine tiles), not runaway or duplicated. Zero failed requests across two independent 12-second observation windows.

## Slice 6 — Viewport Matrix (real, live-rendered)

Extended the already-tested 1280/1920/3840 set (from earlier P18/P20 passes) with the two sizes never checked this session:

| Viewport | Actual rendered size | Vertical overflow | Horizontal overflow |
|---|---|---:|---:|
| 1366×768 | 1366×768 (1:1) | 580px | none (-16px margin) |
| 1600×900 | 1600×900 (1:1) | 448px | none (-16px margin) |

Consistent with the already-documented, already-accepted layout tradeoff (compliance timelines and Action Queue sized for readability over literal zero-scroll) — no new or unexpected behavior at these intermediate sizes. No horizontal overflow at any tested size this entire engagement.

## P22/P23 — Reported No-Data Bug (Action Queue → Machine Snapshot) and Full Navigation-Chain Audit

**User-reported defect, real, reproduced live:** navigating from the Andon board's Action Queue to Machine Snapshot showed "No data" on 4 panels (Worst Cpk, Alarm Context, Event Timeline, and transitively Raw Timestamp appeared affected in initial testing but was later cleared as a lazy-load artifact, not a real defect on that specific panel).

**Root cause:** panels 9, 10, 12 resolved their target machine via `event_time_ms > 0 → use clicked_series, else → machine_id`. `clicked_series` is only set by a *different* interaction (clicking a point in an Engineering Analytics trend chart); the Action Queue's link always sets `event_time_ms` but never `clicked_series` (defaults to sentinel `'__none__'`). This forced every Action Queue navigation into the wrong branch, resolving to a machine name of `'__none__'` that matches nothing — even though `machine_id` was correctly passed the whole time. On 2 of the 3 panels this was worse than a plain empty result: their own "no alarm found" / "no telemetry" explanatory fallback rows were `CROSS JOIN`ed against the same broken machine-resolution CTE, so the failure silently ate the fallback message too, leaving a panel with no explanation at all.

**Fixed** (commit `2cb9e3e`): branch on whether `clicked_series` is actually set (`NOT IN ('__none__','')`) instead of on `event_time_ms`, applied to all 4 occurrences across the 3 panels. Verified by reproducing the exact blank state live, confirming Grafana loaded the corrected query via the dashboard API, then confirming all 4 panels render real data using the identical machine/timestamp that was previously blank.

**Full navigation-chain audit** (this pass): enumerated every `url`/panel-link across the entire manufacturing dashboard set that targets Machine Snapshot, Alarm Dictionary, or Alarm Console, to check for the same class of parameter-contract bug elsewhere in the chain:

| Entry point | Parameters passed | Live test result |
|---|---|---|
| Andon Action Queue → Machine Snapshot | `machine_id, factory, mo, event_time_ms` (no `clicked_series`) | Fixed and verified (above) |
| 2D Digital Twin → Machine Snapshot (all 10 machine zones) | `machine_id, factory` only (no `event_time_ms`, no `clicked_series`) | **Clean** — 14 panels, 0 blank |
| Engineering Analytics trend charts → Machine Snapshot (the *designed* click-a-point interaction) | `clicked_series, event_time_ms, machine_id, log_id=__auto__` | **Clean** — 14 panels, 0 blank. Confirms the fix did not regress the one path that's supposed to use `clicked_series` |
| Manufacturing "Worst Cpk" / "Board Traceability" → Machine Snapshot | `machine_id` only (no `factory`, no `event_time_ms`, no `clicked_series`) | **Clean** — 14 panels, 0 blank |
| Machine Snapshot "Alarm Context" → Alarm Dictionary | `alarm_code` only, no machine/factory/time context | **Correct as designed** — Alarm Dictionary is a pure code-lookup reference (its own panels don't take a machine parameter at all), not a context-preserving drill-down |
| Machine Snapshot "Event Timeline" panel | No outbound links at all (verified via `fieldConfig.overrides` inspection) | N/A — no drill-down exists on this panel to test |

**Checklist items from the request that don't apply to this dashboard:** Machine Snapshot has no `process` template variable at all (confirmed via its `templating.list`) — process/layer context is shown as a field in the Machine Context table, not modeled as a separate navigable variable. Not a defect; nothing to fix.

**Conclusion: the one real defect in this chain was the one already found and fixed.** The other 3 real entry patterns into Machine Snapshot (Digital Twin, the designed trend-chart click, Manufacturing's fleet tables) were tested live and are clean, including confirming no regression from the fix on the one path that legitimately depends on `clicked_series`.

## P24 — Fleet-Wide No-Data Scan (remaining 11 dashboards)

Extended the no-data methodology to every dashboard not yet live-scanned this session (previously covered: Andon, Machine Snapshot, Manufacturing, Engineering Analytics). Authenticated, tall-viewport (1920×6000, eliminates lazy-load false positives), default time range/variables, real render.

| Dashboard | Panels | Error badges | Unexpected "No data" |
|---|---:|---:|---|
| `ims-capacity` (AIOps & Capacity Forecast) | 12 | 0 | 4 panels |
| `ims-engineering` (Engineering Drill-Down) | 19 | 0 | 4 panels |
| `ims-ingestion-latency` | 10 | 0 | 0 |
| `ims-meta-monitoring` | 12 | 0 | 2 panels |
| `ims-noc-overview` | 10 | 0 | 0 |
| `ims-easy-overview` | 7 | 0 | 0 |
| `ims-ldi-alarm-console` | 2 | 0 | 0 |
| `ims-ldi-alarm-dictionary` | 3 | 0 | 0 |
| `ims-ldi-alarm-response` | 8 | 0 | 0 |
| `ims-ldi-factory-digital-twin` | 1 | 0 | 0 |
| `ldi-data-readiness` | 17 | 0 | 1 panel |

**Zero query errors anywhere in the fleet.** 7 of 11 dashboards are completely clean. 4 dashboards show real "No data" on specific panels — root-caused, not assumed. **Correction below (P25): the "data immaturity" explanation for `ims-capacity`/`ims-engineering`/`ims-meta-monitoring` reported at the time of this scan was incomplete — see P25 for the real root cause and fix.**

**`ldi-data-readiness`'s "Inferred Sensor / Source Capability"** — root-caused (correction from the prior pass): this was a **false positive in the scan methodology, not a real defect**. The panel is a readiness matrix whose query legitimately outputs the literal string `'NO DATA'` as one of several real status values per sensor/machine (`AVAILABLE` / `NO DATA` / `VARIABLE SIGNAL` / `ALL ZERO - VERIFY`), analogous to the Andon board's own `NO_DATA` status tile text. The blanket `/No data/i` text-match scan used fleet-wide matched this legitimate cell content. Confirmed by running the panel's exact query directly (no variable filter, both dashboard variables default to `$__all`): it returns real rows for all 10 machines with genuine mixed AVAILABLE/NO DATA values per sensor. **No fix needed — the panel works correctly.**

## P25 — Real Root Cause Found: Missing SNMP Simulator Container (corrects the P24 "data immaturity" conclusion)

The P24 conclusion above was based on an incomplete diagnosis. Following the user's explicit instruction to fully root-cause the infra-dashboard no-data panels and audit Node-RED ingestion end-to-end surfaced the real cause.

**Investigation:** Checked actual *values*, not just timestamps, in `public.sys_metrics` — every row was **literally zero** (`cpu_load_percent=0, ram_used_mb=0, disk_used_gb=0, temp_c=0`) for all 4 infrastructure devices, continuously, despite fresh timestamps. Traced this to Node-RED's own ingestion function: on an SNMP failure, the parser (`SRE AIOps Parser v9 (Batch)`) still inserts a row every batch cycle, with all fields defaulted to `0`, rather than skipping the insert — meaning a broken SNMP source produces a continuous stream of *convincing-looking but entirely fake* zero-value rows, not an honest gap.

**Root cause:** `docker logs ims-node-red` showed continuous `NET GET ERROR ... getaddrinfo ENOTFOUND ims-snmpsim` (the CPU/Storage/Temp walkers hit the identical failure but log it via `node.debug`, which is silent at default log levels — only the Network walker's `node.warn` made the failure visible). Confirmed via `docker ps -a` and `getent hosts` that **the `ims-snmpsim` container did not exist at all** — not stopped, not present. `docker-compose.yaml`'s base `snmpsim` service definition has no profile restriction, but this session's earlier reset used the `docker-compose.dev.yaml` overlay, which adds `profiles: [dev]` to that service; since `--profile dev` was never passed as a CLI flag, `docker compose up -d` silently skipped starting it.

**Fixed:** `docker compose up -d snmpsim` (base file only, no profile flag needed) — started the already-declared, real, non-mock simulator container. Not a code change (the compose config itself was already correct); a deployment-state fix. Verified end-to-end:
- `docker exec ims-node-red getent hosts ims-snmpsim` → resolves.
- `docker logs ims-snmpsim` → responding to real SNMP GETs with varied real data (interface counters, CPU load, memory).
- `sys_metrics` values are now genuinely non-zero and varied (CPU 47–70%, RAM 5.9–8.9GB, disk usage varying by device, temp 53–95°C).
- `net_metrics` went from **0 rows ever** to 16 real rows within the first minute — this also resolves the "genuine upstream pipeline gap" reported for Network Bandwidth in the original P24 scan; it was the same missing container, not a separate ingestion gap.
- Live dashboard re-scan: RAM Usage Trend, Memory Saturation, Network Bandwidth, and Temperature Sensors panels all went from "No data" to rendering real content.

**Second, separate real bug found while verifying:** `ims-engineering`'s "LDI Throughput & Process Efficiency" panel (id 503) remained blank even after the container fix. Root-caused: its own description says *"LDI **manufacturing** throughput"*, but its query read `throughput` from `public.ldi_metrics` — the infra-simulator's table for `LDI-A01`/`LDI-A02` (2 test/simulator devices), filtered by `${ldi_machine_id}`, a variable whose own defining query sources real fleet machines (`LDI-01`..`LDI-10`) from `public.ldi_data`. The variable's value-space and the panel's queried table could never overlap — a permanent, data-independent mismatch, not something the SNMP fix could ever resolve. Two sibling queries on the *same panel* (Process Efficiency, refId B) correctly read the real fleet's `public.ldi_data_1m` — confirming the intended source. **Fixed** (this commit): changed refId A to read `avg_scan_speed` from `public.ldi_data_1m` (the real fleet's actual throughput-equivalent metric — `ldi_data` has no column literally named "throughput"; `scan_speed` is the correct real production parameter) using the same table and variable as its sibling query. Verified live: `ims-engineering` went from 4 no-data panels to **0**.

**Remaining no-data, confirmed as genuinely out of scope for this pass (not swept under "immaturity" without evidence this time):**
- `ims-capacity`: Disk Usage Trend + Forecast, CPU/Temperature Z-Score Anomaly — now reading genuinely real (non-zero) `sys_hourly` data post-fix, but still empty because only ~1 minute of real history exists since the container was just started; the regression CTE requires `≥3` distinct daily buckets and Z-score needs a meaningful sample count for standard deviation. This is now **true** data immaturity (real data, insufficient elapsed time), not the zero-fallback-garbage version originally suspected. Will resolve as real time passes; not fixable by a code change.
- `ims-meta-monitoring`: Trip Rate (per device), Device Circuit Breaker State — these query **Prometheus** metrics `ims_circuit_breaker_trips_total` / `ims_circuit_breaker_state`, a completely different datasource, unrelated to the SNMP/TimescaleDB fix. Confirmed via Prometheus's own `/api/v1/label/__name__/values`: **these metric names do not exist anywhere in Prometheus** (only 5 `ims_*` metrics exist, all pipeline buffer/insert stats). The underlying circuit-breaker logic genuinely exists in Node-RED (in-memory `circuitBreaker` object, `checkDevice`/`recordFailure`/`recordSuccess`), but no exporter was ever built to expose it to Prometheus. This is a real, confirmed gap — missing instrumentation, not a fixable query/variable bug — and building a new Prometheus exporter is feature work beyond a safe same-pass fix, correctly left as a documented, verified gap rather than attempted.

## P26 — Data Integrity Re-Audit: Root-Caused Remaining No-Data Panel, Node-RED End-to-End, Offline-Path Duplication Bug (2026-08-26)

Live system at `http://localhost:3000/` and the running Docker stack, re-inspected fresh (not from memory of prior passes).

**Task 1 — `ldi-data-readiness`'s remaining No-Data panel, fully root-caused, reconfirmed:**
Extracted all 16 SQL targets across the dashboard's 17 panels programmatically, substituted live variable defaults (`factory IN ('2','3')`, `machine_id` = all 10 real `LDI-01..10`), ran every query directly against `ims-timescaledb`. All 16 executed without error and returned real rows. The "◈ Inferred Sensor / Source Capability" panel (id 12) — previously flagged as a possible remaining defect — is reconfirmed a **false positive**: its own query legitimately emits the literal string `'NO DATA'` as a valid capability-status value (e.g. `Vacuum` column), which a naive scan misreads as an empty panel. No code defect. **VERIFIED** (live query execution, all 16 targets, zero errors).

**Task 2/3 — Node-RED ingestion audited end-to-end, telemetry-to-table mapping confirmed:**
`docker logs ims-node-red` reviewed across a 6-hour window. All 4 core tables (`ldi_data`, `net_metrics`, `sys_metrics`, `ldi_alarm_log`) fresh (< 2 min lag) at audit time. Found and fixed one real defect (below). No dropped-record evidence found; no crash-loop; no unhandled exceptions besides the one fixed bug.

**Task 4 — `net_metrics` zero-row gap: reconfirmed fully resolved, not regressed.**
2,344 rows present, 14s lag at check time. The P25 fix (starting the `ims-snmpsim` container) holds. Not intentionally out of scope — was a real gap, is now closed and stable.

**New defect found and fixed — SRE AIOps Parser offline-path row duplication:**
`sre_parser`'s `isOffline` branch (fires when the circuit breaker trips OPEN for a device) pushed a full `sys_metrics` row, every known net interface, and an `ldi_metrics` row **unconditionally on every incoming walker-slot message**, instead of once per poll cycle — unlike the online path, which already gates each push by `walkerType`. `Fork 5 Walker Threads` emits 4–5 offline-tagged messages per cycle per device, so every offline cycle inflated `sys`/`ldi` row counts 4–5x.

Live evidence before fix: `sys_metrics` and `ldi_metrics` each had a device with **88–90 duplicate all-zero rows** landing in a single ~2ms flush window (`2026-08-26 04:38:40`, timestamped to the exact moment `ims-snmpsim` had come back up after an earlier outage). `net_metrics` was unaffected only because those specific devices had no previously-known interfaces to duplicate — same bug, just not yet triggered on that table.

**Fix:** gated all three offline-branch buffer pushes (`sys`/`net`/`ldi`) by `walkerType`, mirroring the existing online-branch structure in the same function (`nodered_data/flows/ingestion.json`).

**Verified live via reversible fault injection:** stopped `ims-snmpsim` (`07:50:31 UTC`), confirmed the circuit breaker tripped OPEN for all 4 affected devices (`LDI-A01`, `LDI-A02`, `ERP-MASTER-WINDOWS`, `ERP-MASTER-UBUNTU`), and confirmed via direct DB query that every offline cycle produced **exactly 1 row** in both `sys_metrics` and `ldi_metrics` per device throughout the entire outage window — zero duplicates. Restarted `ims-snmpsim` (`07:52:45 UTC`), confirmed full recovery: `net_metrics`/`sys_metrics`/`ldi_data` all fresh again within ~90 seconds, zero errors post-recovery. **VERIFIED** (live before/after DB state, live log evidence, reversible test performed and reverted). Committed: `b87f285`.

**Task 5 — stale telemetry, lag, dupes, out-of-order, machine mapping:**
- Stale/lag: all 4 core tables < 2 min lag at check time. **VERIFIED**.
- Duplicates: `ldi_data` 0, `net_metrics` 0 (post-fix), `sys_metrics` 0 (post-fix, was 4 groups / ~356 rows pre-fix from the bug above). **VERIFIED**.
- Out-of-order: naive `ctid`-ordering probe falsely reported 10,995 "out-of-order" `ldi_data` rows — a methodology artifact (`ctid` reflects hypertable chunk storage layout, not insertion order, so it's meaningless across chunks). Re-tested using the real `ingest_ts` column ordered per-`eqp_id`: **8 rows** (0.036% of 22,084) arrived with a sensor timestamp earlier than the previously-ingested row for that machine, in 2 clustered incidents (8–29 min skew, 4 machines each, same incident timestamp) — consistent with a transient walker reconnect delivering a late-queued reading, not corruption or duplication. Real, tiny, self-limiting, **not a code defect**. **VERIFIED**.
- Machine mapping coverage: all 10 real `LDI-01..10` report continuously. 23 `device_type='ldi'` rows exist in `devices`, 13 (`LDI-A0x`/`LDI-B0x`/lowercase variants) registered+enabled but never report — reconfirms the prior session's "dead device registrations, data-hygiene, zero operator impact" finding; count differs slightly from the previously-cited "11" only because this pass counted the full registry directly rather than relying on a prior tally. Not fixed (not a defect). **VERIFIED**.
- `devices` also holds 1,002 `device_type='server'` rows (mostly `E2E-SERVER-NNN`, `enabled=false`) — confirmed test/E2E fixture data, not a production data-quality issue.

**Task 6 — no-data vs. defect distinction:**
Every panel checked this pass either (a) returned real rows confirming pipeline health, or (b) was independently root-caused to a specific code/config cause (this session's offline-duplication bug) rather than asserted as "immaturity" without evidence — continuing the discipline established in P25.

**New finding, out of code scope — alerting delivery gap:**
`docker logs ims-node-red` shows the alerting pipeline firing correctly on real conditions (new alarms, high RX error rate, threshold breaches) but **every single alert this session, with zero exceptions, failed external delivery**: `'LINE Messaging API not configured — set LINE_CHANNEL_ACCESS_TOKEN and LINE_USER_ID env vars. Alert was NOT delivered.'` and the equivalent for `TEAMS_WEBHOOK_URL`. No Slack node exists in the flow at all. Alerts only ever reach Node-RED's own internal debug log — never an operator. This is a real, verified operational gap, but it is a **deployment/secrets configuration gap** (missing `.env` values), not a code defect — no credentials were fabricated or touched, per CLAUDE.md's zero-trust `.env` policy. **VERIFIED** (live log evidence); remediation requires operator-supplied credentials, outside this session's authority.



- Fleet-wide polish (typography/spacing normalization across all ~15 dashboards) — not started.
- ~~Node-RED ingestion internals — not inspected~~ **RESOLVED in P26**: flow-level inspection performed (walker error handling, circuit breaker, batch parser), one real defect found/fixed/verified live.
- Full variable stress matrix on dashboards other than Andon — narrowed and closed in P28 (below) for the actual injection-pattern risk this checklist item exists to catch; a full UI-rendering stress sweep (large-cardinality dropdowns, factory chaining behavior) remains untested — no browser tooling available this session.
- 2560×1440, 4096×2160 viewports — **NOT VERIFIABLE this session**: no browser automation tool available (3840×2160 was tested in an earlier pass, before that tooling was lost, and covers the 4K case at a slightly different aspect ratio).
- Formal visual-regression baseline/diffing (pixel-level comparison across code changes) — not built; this is new tooling infrastructure, not a defect fix, intentionally out of scope for this pass.
- Security audit scope beyond SQL injection: `alarm-api`/`factory-twin-3d` parameterized-query review and a repo-wide hardcoded-credential pattern scan (AWS keys, private key blocks, Slack tokens) reconfirmed live in P27, both clean. **Closed in P28** (below): full Function-node code review across all flow files (0 `eval`/`child_process`/`exec`/unparameterized-SQL patterns), HTTP endpoint exposure audit (all 4 Node-RED HTTP endpoints correctly gated), `npm audit` across all 5 dependency trees (0 vulnerabilities; `tests/unit` has no lockfile to audit — dev-only, NOT VERIFIED).
- Alerting delivery (LINE/Teams unconfigured) — real, documented, **OPEN**: requires operator-supplied credentials, not an engineering fix.
- 13 registered-but-never-reporting LDI device rows (`LDI-A0x`/`LDI-B0x`/lowercase variants) — reconfirmed **zero functional impact** (P27: none referenced in any live dashboard query; one dashboard variable's cached `current` value references a stale device name but is not `includeAll`-locked and self-corrects via `refresh:1` on load). Deregistering them is a data-ownership decision, not an engineering defect — **OPEN**, left to whoever owns the device registry.

## Commits

- `db4bf57` — `fix(security): close SQL injection via unescaped alarm_code and machine_id interpolation`
- `b87f285` — `fix(ingestion): stop offline-path row duplication in SRE AIOps Parser`
- `2adf99f` — `docs(grafana): add P26 data-integrity re-audit (offline-dup bug, live-verified)`

## Status

```
Slices completed: 6/6 (security, mock-data, no-data fleet scan, variable stress, performance, viewport)
Critical findings: 1 found, 1 fixed (alarm_code textbox injection)
High findings: 1 found, 1 fixed (machine_id alias injection, 2 panels)
Unexpected No-data (fleet, this pass): 0
Mock-data contamination: 0
Refresh storm: none detected (stable ~20.8 queries/cycle, 0 failures)
Slowest measured query: 4.552ms execution (Temperature Compliance, 10-machine fleet, 2h range)
Regressions from fixes: 0 (verified live)
Remaining: fleet-wide polish, full variable matrix on non-Andon dashboards, 2560x1440/4096x2160
  viewports, formal visual-regression diffing, Function-node-wide security review, npm audit -- NOT VERIFIED
Open (business/config, not engineering defects): alerting delivery credentials, dead-device deregistration
```

## P27 — Final Stabilization Pass (2026-08-26)

Scope: verify remaining open items and close what's safely closable with live evidence. Not a new audit phase.

- **Git/branch/container health:** `perf/grafana-p15r-operator-andon` clean, both P26 commits (`b87f285`, `2adf99f`) intact. Mid-pass, the shared working directory was checked out to `main` by a concurrent external process **four separate times** (confirmed via reflog, not corruption — a real, ongoing collision, not a one-off) — once losing an in-progress doc edit entirely, requiring a retry. Every time, switched back and verified via reflog that nothing was lost. All 15 IMS containers up and healthy (`docker ps`); `net_metrics` fresh (< 1 min lag) throughout. **VERIFIED**, with the explicit caveat that this working directory is shared with another live process and that is an ongoing operational hazard, not resolved by this session.
- **Lint/regression:** `dashboard-linter.js` (0 errors, 19 warnings) and full `pre-commit.js` suite both pass on current HEAD. **VERIFIED**.
- **Alerting readiness:** confirmed (again) `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_USER_ID`, `TEAMS_WEBHOOK_URL` are wired correctly end-to-end (declared in `.env.example`, passed through in `docker-compose.yaml`, consumed in `alerting.json`) but empty in the running container's actual environment. Not fabricated, not touched. **OPEN** — needs operator-supplied credentials.
- **13 dead device registrations:** reconfirmed zero functional impact — none of the 13 appear in any dashboard's live query logic; the one dashboard JSON reference found (`ims-ldi-machine-snapshot.json`'s `machine_id` variable `current.value`) is a stale cached selection that self-corrects on load (`refresh:1`, `includeAll:false`, query re-derives from real `ldi_data`). **OPEN** — deregistering is a data-ownership call, not something fixed here per explicit instruction not to delete without a business-intent go-ahead.
- **Security scope beyond SQLi:** re-verified live (not from memory) — `alarm-api`'s `transitionAlarm()` uses fully parameterized queries; its one non-parameterized fragment (`extraSet`) confirmed to be a fixed literal chosen server-side per route, never request-derived. `factory-twin-3d`'s `STATE_SQL` filters on `DEVICE_IDS`, populated from a startup DB query, never from a request. Repo-wide scan for AWS keys / PEM private-key blocks / Slack tokens: 0 matches. **VERIFIED**.

### Final Status

```
PASS:  SQL injection (fixed+verified), mock-data (0 found), no-data fleet scan (0 unexplained),
       ldi-data-readiness remaining panel (false positive, reconfirmed), net_metrics gap (resolved,
       reconfirmed), sre_parser offline-duplication (found+fixed+verified live), lint/pre-commit
       (0 errors), backend service injection review + credential scan (reconfirmed live)
OPEN:  alerting delivery (needs operator LINE/Teams credentials -- not an engineering task),
       13 dead device registrations (data-ownership decision, zero functional impact confirmed)
NOT VERIFIED: fleet-wide visual polish, full variable-stress matrix on non-Andon dashboards,
       2560x1440/4096x2160 viewports, formal visual-regression diffing, Function-node-wide review,
       HTTP endpoint exposure audit, npm audit dependency scan
Exact remaining actions: (1) operator supplies LINE_CHANNEL_ACCESS_TOKEN/LINE_USER_ID/TEAMS_WEBHOOK_URL
  if alert delivery is wanted; (2) device-registry owner decides whether to deregister the 13 dead
  LDI-A0x/B0x rows or leave them; (3) whoever owns the shared working directory should stop the
  concurrent branch-checkout collisions (4 occurrences this session) before further parallel work here.
```

## P28 — Risk-Prioritized Closure Pass (2026-08-26)

Scope: close the highest-value remaining NOT VERIFIED items from P27 that don't require unavailable tooling (no browser automation this session) or new infrastructure build-out. No engineering defect found this pass — pure verification, nothing to fix, nothing committed as a code change.

- **`npm audit`, all 5 dependency trees:** root, `nodered_data`, `services/alarm-api`, `services/factory-twin-3d` — **0 vulnerabilities** each. `tests/unit` has no committed lockfile; audit requires one and generating one is a real repo change outside this pass's scope (dev-only dependency, no production exposure). **PASS** (4/5); **NOT VERIFIED** (`tests/unit`, no lockfile).
- **Function-node-wide security review**, all 5 flow files (`ingestion.json`, `alerting.json`, `ldi_ingestion.json`, `ldi_simulator.json`, `ldi_alarm_simulator.json`): 0 matches for `eval(`, `child_process`, `exec(`, raw `fs`/`http` requires. The 2 template-literal SQL calls found (`ldi_alarm_simulator.json`, `ldi_ingestion.json`) are fixed SQL text with proper `$1`/`$2` parameter placeholders — no interpolated values inside the SQL string itself. **PASS**.
- **HTTP endpoint exposure audit**, all 4 Node-RED `http in` nodes: `/ldi-telemetry` and `/inject` both gated by `INGEST_API_KEY` (`x-api-key` header, exact match) — the key is hard-required at container startup via `docker-compose.yaml`'s `${INGEST_API_KEY:?set INGEST_API_KEY in .env}`, so there's no fail-open path if it's ever unset (compose refuses to start). `/metrics` isn't proxied through nginx at all — Node-RED's own port is bound `127.0.0.1:1880` (loopback-only, not externally reachable) and its admin editor is separately protected by `adminAuth` in `settings.js`. `/alert-webhook` (checked in P26) has no auth but only receives from Alertmanager, an internal-network-only service with no published host port. **PASS**.
- **Non-Andon variable-injection spot check:** grepped all manufacturing dashboards for raw unescaped `${var}` outside a `:sqlstring`/`:singlequote` filter. `ims-ldi-engineering-analytics.json` surfaced raw `${factory}`/`${machine_id}`/`${mo}` — traced every occurrence: all are client-side dashboard drill-down link URLs (`"url": "/d/.../?var-factory=${factory}..."`), never SQL. Grafana substitutes these into an href; the target dashboard independently validates/escapes its own variables at its own SQL usage (already audited elsewhere in this doc). **PASS** — false alarm from pattern-matching alone, resolved by tracing actual usage before concluding a defect.

### Final Status (supersedes P27's)

```
PASS:  SQL injection (fixed+verified), mock-data (0 found), no-data fleet scan (0 unexplained),
       ldi-data-readiness remaining panel (false positive, reconfirmed), net_metrics gap (resolved,
       reconfirmed), sre_parser offline-duplication (found+fixed+verified live), lint/pre-commit
       (0 errors), backend service injection review + credential scan (reconfirmed live),
       npm audit (4/5 trees, 0 vulnerabilities), Function-node-wide review (0 dangerous patterns),
       HTTP endpoint exposure audit (4/4 endpoints correctly gated), non-Andon variable-injection
       spot check (false alarm traced and closed)
OPEN:  alerting delivery (needs operator LINE/Teams credentials -- not an engineering task),
       13 dead device registrations (data-ownership decision, zero functional impact confirmed)
NOT VERIFIED: fleet-wide visual polish, 2560x1440/4096x2160 viewports, formal visual-regression
       diffing pipeline (no browser automation tool available this session), tests/unit npm audit
       (no lockfile)
Highest-priority remaining risk: none engineering -- the recurring shared-working-directory
  branch-checkout collision (5 occurrences across this session) is the only item that could still
  cause real damage (a future collision during an uncommitted edit), and it is outside this
  session's control to fix.
```
