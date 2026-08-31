> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

# IMS Grafana — P15: Operator Andon Live Failure + Micro-Pixel Follow-up

**Date:** 2026-08-25
**Scope:** P15 was scoped to Manufacturing's 1366px clipping and Engineering Analytics' render performance (both carried over from P14). Mid-phase, a live, currently-active production failure was discovered on the Operator Andon Board and was correctly prioritized above the original scope per explicit instruction. This report documents the P0 investigation/fix and the work completed under an authentication blocker that limited (but did not stop) the remaining phases.

**Commits this phase:** `3bb5dd3` (Andon HTTP 400 root cause + fix), `2085de9` (Andon machine-tile width, forward-looking), `e184185` (Manufacturing 1366px table-width fix), `3119194` (Engineering Analytics query optimization, `IN()` → `ANY(ARRAY[])`), `32e7ad0` (fleet-wide completion of the same `mo`/`fpn` pattern).

**Update — resumed after the auth blocker, per explicit instruction to continue automatically:** the original P15 scope (Manufacturing 1366px, Engineering Analytics performance) was completed using the same non-authenticated evidence sources (dashboard JSON, direct `psql`, `EXPLAIN ANALYZE`, `pgbouncer` stats) that resolved the Andon P0. Grafana authentication remained unavailable throughout (confirmed via a single, non-repeated check before resuming, and again at the end of this phase) — not worked around, per the standing rule. Everything below that depends on live rendering is still honestly marked as such.

---

## Authentication Blocker (disclosed, not worked around)

Partway through this phase, Grafana admin API/basic-auth stopped authenticating with the credential in `.env` (`[password-auth.invalid] invalid password` — a genuine credential mismatch, not the earlier brute-force lockout pattern seen in P14). Live Grafana logs during this window showed the actual user actively logged into their own browser session, which strongly suggests the admin password was changed directly (e.g. via the Grafana UI) without updating `.env` — Grafana only reads `GF_SECURITY_ADMIN_PASSWORD` to seed the admin account on first boot; it does not sync back to `.env` on later changes.

**Per explicit instruction, this was NOT worked around:** no brute-forcing, no password reset, no repeated retries beyond a single confirmatory check. This blocked rendering-dependent verification (live screenshots, responsive matrix re-checks, before/after render comparisons) for the remainder of this phase. All other investigation continued using non-authenticated evidence: dashboard JSON, direct `psql` queries against the live database, Docker container logs and resource stats, and the `dashboard-linter.js`/`pre-commit.js` validation suite — none of which require Grafana credentials.

**Everything below that would normally carry a render-based "verified visually" claim is instead marked "not re-rendered — auth blocker" and is honestly incomplete pending either the current admin password or the browser-cached dashboard picking up the fix on next reload.**

---

## P0 — Live Operator Andon Board HTTP 400 Failure

### P0.1 — Root cause, proven with evidence at every step

**Observed:** ~1,231 HTTP 400 responses in 30 minutes on `/api/ds/query` for the Andon Board, each taking 3.6–4.9 seconds before failing, matching the dashboard's 5s auto-refresh — a self-sustaining failure loop the actual user was watching happen live.

**Investigation, in order, each step ruling something in or out with evidence:**

1. **SQL syntax** — ruled out. Every one of the dashboard's 9 panel queries (7 unique query bodies) was extracted from the JSON and run directly against the live TimescaleDB with the real, fully-substituted "All" values for `factory`/`machine_id`/`mo`. All executed cleanly, no SQL errors.
2. **Database-side timeout/overload** — ruled out. `pgbouncer`'s own stats during the failure window showed only 3–4 queries/sec system-wide — nowhere near what 9+ panels refreshing every 5s would produce if they were actually reaching Postgres. This is decisive evidence the failing queries never reached the database.
3. **nginx body-size limits** — ruled out. The user's browser was connecting to Grafana's own port directly (`referer=http://localhost:3000/...`), not through the `ims-proxy` nginx reverse proxy at all.
4. **Postgres query cost** — ruled out as the bottleneck. `EXPLAIN ANALYZE` on the most expensive affected query showed planning time dropping only 23ms → 15ms with the suspect filter removed, and execution time was ~1ms either way. The database was never slow.
5. **Grafana container resource pressure** — investigated directly via `docker stats`: memory stayed flat around 785MB (of a 1GiB hard limit) across multiple samples — not spiking, ruling out simple OOM/memory-pressure as the mechanism. CPU did spike (up to 20.8%) during a refresh cycle, consistent with **expensive in-process work happening before any SQL is dispatched**.

**Confirmed root cause:** all 3 of the Andon Board's template variables (`factory`, `mo`, `machine_id`) are permanently hidden (`hide: 2`) and locked to `$__all` — there is no UI control that could ever set them to anything else. The `mo` variable specifically has **1,608 distinct values** in the live database. Every 5s refresh required Grafana to build and quote-escape a ~19KB `IN (...)` list for `mo` across **6 real call sites** (5 panel queries + the `machine_id` variable's own population query) before any of that SQL was ever sent to the datasource — this in-process string-building, not the database, is what the CPU spike and multi-second delay before failure were spent on.

### P0.2 — Fix, with correctness proof

Removed the `mo IN (${mo:sqlstring})` clause from all 6 sites. This is provably a no-op removal, not a behavior change:
- **0 NULL `mo` values** exist in `public.ldi_data` (verified directly) — so "filter by every possible value" and "don't filter at all" are mathematically identical result sets.
- The variable can never be set to anything other than "All" (no UI path exists), so this equivalence holds permanently for this dashboard, not just at the moment of testing.
- **Verified identical output**: ran the affected "Environmental Compliance" query both ways against live data — both returned `90`.

`factory` (3 values) and `machine_id` (11 values) were deliberately **left untouched** — their cardinality is trivial and they were not the proven bottleneck; touching them would add diff/risk for no measurable gain (matches the "smallest reasonable change" principle).

**Important caveat, disclosed not hidden:** this fix takes effect on the *next* dashboard load. A browser tab that already has the Andon Board open keeps its own in-memory copy of the panel query definitions and will keep sending the old (expensive but not incorrect) queries every 5s refresh until the page itself is reloaded — Grafana's auto-refresh re-fetches *data*, not dashboard *definitions*. This was not verifiable as "fixed and confirmed" via the live session because of the auth blocker preventing a controlled re-check; it is reported as "root-caused, fixed, and provably correct" rather than "confirmed resolved in the live session."

### Also found, forward-looking (P1.3)

`public.devices` already has 2 enabled LDI devices with names up to 15 characters including a space (`EXPOSURE LDI-2B`, `EXPOSURE LDI-2`) — longer than any currently-live `machine_id` (max 8 chars). These devices have no telemetry rows yet, so they don't currently appear as Andon tiles, but the moment they report data they will repeat into the machine-identity stat panels (previously `w:2`, ~114–160px) and would clip. Widened to `w:3` (maxPerRow 10→8 to preserve clean 24-unit rows) — a real, evidenced, purely-additive fix, **not re-rendered to visually confirm** due to the auth blocker. Disclosed as such.

### Also found, deferred (P1.4)

The Action Queue table (panel 8, ~12 columns: Machine/Severity/Status/Alarm Type/Alarm Msg/Alarm Detail/Factory/MO/When/Elapsed/Owner/Action) has **no explicit `custom.width` overrides on any column** — Grafana auto-distributes equally, which for 12 columns at typical widths likely under-serves long free-text columns (Alarm Msg, Alarm Detail) and over-serves short ones (Severity, Status). This is a real finding, but assigning specific column widths without being able to render and check the result would be guessing, not engineering — **deferred, not fixed**, pending either restored auth or a disposable-stack render check.

### Also found, benign (not fixed)

Grafana logs show a recurring `"failed to walk provisioned dashboards" error="stat /var/lib/grafana/dashboards/mentor-ldi: no such file or directory"` every ~30s, tied to the mentor-ldi provider removed in a separate commit (`8e7ea7e`). No current provisioning YAML defines this provider anymore — it's stale internal Grafana state (provisioners registered in Grafana's own DB don't always fully unregister when the YAML entry is removed, without a restart). Purely cosmetic log noise, not a functional break. Fixing it would require a Grafana container restart, which is a materially bigger, unrelated action than this cosmetic issue justifies — **documented, not actioned**.

---

## P15-A (resumed) — Manufacturing 1366px Clipping

**Root cause** (from P14's `D_manufacturing_1366.png` render, re-confirmed in this dashboard's current JSON): the Worst Cpk table (panel 18) has 2 columns with no explicit `custom.width`, so Grafana's equal auto-distribution at a ~320px panel width (1366px viewport, w:6 of 24) clips the Worst Cpk value badge — real data loss, not just a title truncation.

**Fix:** added `custom.width: 90` to the Machine column (fits the fixed `LDI-NN` ID format used throughout this system), leaving Worst Cpk to auto-fill the remainder. Purely additive — cannot introduce new clipping, only reduce or eliminate existing clipping.

**Not fixed, deliberately:** the ~6 panel-title truncations found in P14 ("AVG CPK (FLE...", "CRITICAL/MAJ...", etc.) — cosmetic only (Grafana shows the full title on hover regardless), and shortening titles without render verification risks confusing users for uncertain visual gain. Documented, not silently dropped.

**Verification status:** JSON-valid, lint-clean. **Not render-verified** — auth blocker.

## P15-B (resumed) — Engineering Analytics Performance

**Root cause, measured not assumed:** unlike Andon's `mo`, this dashboard's `mo`/`fpn`/etc. variables are genuinely operator-facing (`hide:0`) — not safely removable. Two have very high cardinality: `mo` = 1,608 distinct values, **`fpn` = 1,555 distinct values** (a second high-cardinality variable, newly discovered this phase), both appearing together in ~20 of the dashboard's ~26 query targets.

`EXPLAIN ANALYZE` on the most expensive affected query (PE StdDev-by-machine, a `CROSS JOIN LATERAL` unpivot over raw `ldi_data`, already flagged `QUERY_BUDGET_EXEMPT` by a prior 2026-08-06 optimization pass that found no further improvement for the query's fundamental *shape*) with both variables at full "All" selection: **303ms planning + 105ms execution** — for one of ~20 queries in a single dashboard load.

**Fix:** rewrote `column IN (${var:sqlstring})` → `column = ANY(ARRAY[${var:sqlstring}])` for `mo` and `fpn` specifically (34 call sites in this dashboard). Verified semantically identical — both forms returned byte-identical result rows on live data. Measured improvement on the same query: **303ms → 82ms planning (−73%), 105ms → 21ms execution (−80%)**. Verified non-negative on cheaper continuous-aggregate-based queries too (25ms → 24ms — smaller win, never a regression). This rewrite was then extended fleet-wide: found and fixed the identical `mo` pattern on `ims-ldi-alarm-console.json` (hidden/locked, same as Andon — removed entirely, 2 sites) and `ims-ldi-manufacturing.json` (visible/operator-facing, same as here — rewrote to `ANY(ARRAY[])`, 15 sites). A full sweep confirms zero remaining `mo`/`fpn` `IN()` occurrences across all 15 dashboards.

**Honest scope of this fix:** this addresses Postgres-side planning/execution cost across ~20 queries — a real, measured, safe improvement. It does **not** fully explain the 24–40s dashboard-level render times observed in P14, which also include Grafana's own per-panel dispatch overhead and the 2 `volkovlabs-echarts-panel` custom charts' own client-side rendering cost, neither of which could be measured without render access. **Not claimed as a complete fix** — reported as what it actually is: a real, proven, partial improvement.

**Verification status:** JSON-valid, lint-clean, query-level correctness and timing proven via direct Postgres testing. **End-to-end dashboard render time not re-measured** — auth blocker.

---

## Metric Table

| Metric | Before | After | Status |
|---|---:|---:|---|
| Andon HTTP 400 rate | ~1,231 in 30 min (continuous, self-sustaining) | Root cause removed from the dashboard definition; live confirmation pending page reload / restored auth | ✅ fixed, ⚠️ not live-confirmed |
| Andon `mo` filter call sites | 6 (5 panels + 1 variable query) | 0 | ✅ |
| Andon Postgres planning time (affected query) | 23ms | 15ms | ✅ measured |
| Andon query correctness | — | Identical result (90) with and without the removed filter | ✅ proven |
| Andon machine-tile width | w:2 (~114-160px) | w:3 (~171-240px) | ✅ applied, ⚠️ not render-verified |
| Andon Action Queue column widths | Auto-distributed, 12 columns | Unchanged | ⚠️ deferred (needs render access) |
| Stale mentor-ldi provisioning log noise | Present | Present (unfixed) | ⚠️ documented, deferred (needs restart) |
| Manufacturing 1366px Worst Cpk data clipping | Present (real data loss) | Fixed via explicit column width | ✅ fixed, ⚠️ not render-verified |
| Manufacturing panel-title truncation | Present (cosmetic) | Unchanged | ⚠️ deferred (cosmetic, mitigated by hover) |
| Engineering Analytics query planning cost (worst case measured) | 303ms | 82ms (−73%) | ✅ measured |
| Engineering Analytics query execution cost (worst case measured) | 105ms | 21ms (−80%) | ✅ measured |
| Engineering Analytics `mo`/`fpn` `IN()` call sites | 34 | 0 (rewritten to `ANY(ARRAY[])`) | ✅ |
| Fleet-wide `mo`/`fpn` high-cardinality `IN()` occurrences | 2 dashboards affected (Andon, Alarm Console) + 2 more found (Manufacturing, Engineering Analytics) = 4 dashboards, ~57 call sites total | 0 remaining anywhere in the 15-dashboard fleet | ✅ fully closed |
| Engineering Analytics end-to-end render time (from P14) | 24-40s, 1x HTTP 408 | Not re-measured (query-level cost proven lower; full render time needs auth) | ⚠️ partial fix, not fully re-verified |
| Dashboards modified this phase | 0 | 4 (`ims-ldi-operator-andon.json`, `ims-ldi-manufacturing.json`, `ims-ldi-engineering-analytics.json`, `ims-ldi-alarm-console.json`) | ✅ |
| Lint errors/warnings | 0/0 | 0/0 | ✅ |
| Viewports tested | 0 (auth blocker) | 0 | ⚠️ blocked |
| Auth-dependent verification | — | Blocked, disclosed, not worked around | ⚠️ documented blocker |

---

## Architecture Decisions

### Decision 1: Remove the `mo` filter entirely rather than optimize its construction

- **Problem:** Expensive per-refresh SQL-string construction for a 1,608-value variable, on a dashboard where that variable can never be anything but "All."
- **Evidence:** `hide:2` + `current.value: "$__all"` with no UI control; 0 NULL values in the underlying column; identical query results proven with and without the filter.
- **Alternatives considered:** (a) chain `mo` to `machine_id`/`factory` to shrink its effective option set — rejected, since even a chained-but-still-"All" selection on a hidden variable doesn't reduce the fundamental problem (it's still building a large IN-list, just a smaller one); (b) cache the built query string across refreshes — rejected as more complex and not addressing the root architectural mismatch (a filter that can never filter anything shouldn't exist); (c) remove the filter entirely — **chosen**, because it's the smallest possible change that eliminates 100% of the proven cost with a mathematical correctness proof, not a heuristic one.
- **Performance impact:** Eliminates the dominant proven cost (in-process string-building for 1,608 values, 6 times per refresh).
- **UX impact:** None — operators never had a way to interact with this variable.
- **Regression risk:** Effectively zero, given the proof of query-result equivalence and the impossibility of the variable ever holding a different value.

### Decision 2: Widen Andon machine tiles proactively, before the clipping is visibly observed

- **Problem:** Real, already-provisioned device names (up to 15 chars) exceed the current tile width, but haven't triggered visible clipping yet because those devices aren't emitting telemetry.
- **Evidence:** Direct query of `public.devices`, cross-referenced against `public.ldi_data`'s actual `eqp_id` values.
- **Alternatives considered:** (a) wait until the devices go live and clipping is actually observed — rejected, since the fix is cheap, safe, and purely additive right now, and waiting only means fixing it under live-incident pressure later; (b) truncate/abbreviate long names in the query itself — rejected, since operators must always be able to identify the exact machine (explicit requirement), and abbreviation risks ambiguity; (c) widen the tile — **chosen**, a minimal, reversible, non-destructive grid change.
- **Performance impact:** None (layout-only change).
- **UX impact:** Positive once these devices go live; neutral today (same 11-device layout, just 8-per-row instead of 10-per-row, one grid row taller).
- **Regression risk:** Low. Not visually re-verified due to the auth blocker — this is the one open risk in an otherwise well-evidenced change.

---

## Architecture Decisions (P15-A / P15-B, resumed)

### Decision 3: Table column width over grid restructuring (Manufacturing)

- **Problem:** Worst Cpk table clips real data at 1366px.
- **Evidence:** P14's render + confirmed absence of `custom.width` in the current JSON.
- **Alternatives considered:** (a) widen the whole panel (w:6 → w:8+) — rejected, breaks the 4-across row's alignment with its siblings; (b) drop the `filterable` header icon — rejected, removes real functionality for a cosmetic gain; (c) explicit column width — **chosen**, smallest possible change, cannot regress.
- **Performance/UX/regression impact:** None/positive/near-zero.

### Decision 4: `IN()` → `ANY(ARRAY[])` rewrite over variable removal or dashboard restructuring (Engineering Analytics)

- **Problem:** Expensive per-refresh SQL cost from 2 high-cardinality, genuinely-operator-facing variables.
- **Evidence:** `EXPLAIN ANALYZE` before/after, correctness proof via identical result rows.
- **Alternatives considered:** (a) remove the filters like Andon — rejected, these variables are real, used features here, not permanently-locked no-ops; (b) split the dashboard into multiple linked dashboards (the "if necessary" last-resort option in the original prompt) — rejected as premature: a real, safe, much smaller fix existed and was proven effective first; (c) rewrite the SQL predicate form — **chosen**, semantically inert, empirically faster, zero functional change for operators.
- **Performance impact:** Real, measured (−73% to −80% on the tested query). **UX impact:** none (operators see identical filtering behavior). **Regression risk:** near-zero (proven identical output).

## Remaining Limitations

**Fixed:**
- Andon Board's `mo`-variable query cost (root cause of the live HTTP 400 failures).

**Fixed, pending live confirmation:**
- Same fix — correctness proven mathematically and via direct query comparison, but not confirmed against the actual live failing session due to the auth blocker plus the browser-cache-of-dashboard-definitions behavior.

**Accepted (real limitation, deliberate tradeoff):**
- Andon machine-tile widening trades 2 fewer tiles per row (10→8) for meaningfully more per-tile width — judged a good tradeoff given only 11 devices currently exist.

**Grafana/platform limitation:**
- A dashboard's already-open browser tab does not re-fetch its own definition on auto-refresh, only its data — any JSON-level dashboard fix requires either a page reload or waiting for the next fresh page load, not something fixable from the server side alone.
- Removing a dashboard's provisioning YAML entry does not always fully unregister it from Grafana's own internal state without a restart (the stale "Mentor LDI Read-only" log noise).

**Deferred (real, documented, needs restored auth or a disposable-stack render check):**
- Action Queue table's column widths (12 columns, no explicit sizing).
- Manufacturing's panel-title truncation (cosmetic only; the data-clipping instance is fixed).
- Engineering Analytics' full end-to-end render time — the proven query-level fix (73-80% reduction on the measured worst case) is real but not confirmed to fully resolve the 24-40s/408-timeout render experience, since Grafana-side dispatch overhead and the 2 ECharts panels' own rendering cost couldn't be measured without auth.
- Full P1-P8 micro-pixel/responsive/accessibility/performance audit across all 15 dashboards — the original P15+ prompt's full scope was not attempted this session; P15-A and P15-B (the two specific carry-over items from P14) were completed to the extent possible without render access.

**Blocker requiring human input (not a stop-everything blocker — documented and worked around by continuing all safe, non-auth-dependent work):**
- Grafana admin credential in `.env` no longer authenticates against the live instance. No action was taken to reset, brute-force, or otherwise work around this. Resolving it (updating `.env` with the current password, or providing it) would unblock render-based verification of everything marked "not render-verified" above.
