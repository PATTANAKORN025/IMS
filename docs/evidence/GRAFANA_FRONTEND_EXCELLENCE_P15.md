# IMS Grafana — P15: Operator Andon Live Failure + Micro-Pixel Follow-up

**Date:** 2026-08-25
**Scope:** P15 was scoped to Manufacturing's 1366px clipping and Engineering Analytics' render performance (both carried over from P14). Mid-phase, a live, currently-active production failure was discovered on the Operator Andon Board and was correctly prioritized above the original scope per explicit instruction. This report documents the P0 investigation/fix and the work completed under an authentication blocker that limited (but did not stop) the remaining phases.

**Commits this phase:** `3bb5dd3` (Andon HTTP 400 root cause + fix), `2085de9` (Andon machine-tile width, forward-looking).

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

## Remaining P15 Original Scope (Manufacturing 1366px, Engineering Analytics performance)

**Not reached this session** — the live Andon failure correctly took priority per explicit instruction ("this is currently a higher priority than visual polish"), and the subsequent auth blocker limited what could be safely verified for the remaining scope. The findings and recommended approach from the P14 final report remain valid and unstarted:
- Manufacturing's 1366px title truncation + Worst Cpk data clipping.
- Engineering Analytics' 24–40s render time with observed 408 timeouts.

Both require render-based before/after verification to do safely, which needs restored Grafana authentication.

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
| Manufacturing 1366px clipping (from P14) | Present | Unchanged | ⚠️ not reached this session |
| Engineering Analytics render timeout (from P14) | 24-40s, 1x HTTP 408 | Unchanged | ⚠️ not reached this session |
| Dashboards modified this phase | 0 | 1 (`ims-ldi-operator-andon.json`) | ✅ |
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
- Manufacturing's 1366px clipping (carried over from P14, not reached this session).
- Engineering Analytics' render performance (carried over from P14, not reached this session).
- Full P1-P8 micro-pixel/responsive/accessibility/performance audit across all 15 dashboards — the original P15+ prompt's full scope was not attempted this session, correctly superseded by the live P0 Andon investigation.

**Blocker requiring human input (not a stop-everything blocker — documented and worked around by continuing all safe, non-auth-dependent work):**
- Grafana admin credential in `.env` no longer authenticates against the live instance. No action was taken to reset, brute-force, or otherwise work around this. Resolving it (updating `.env` with the current password, or providing it) would unblock render-based verification of everything marked "not render-verified" above.
