# Performance / Query Audit — Batch 2

**Method:** Rather than synthetic one-off `EXPLAIN ANALYZE` on all 178 dashboard queries individually (expensive, and only tests one parameter combination per query), pulled real production execution stats from `pg_stat_statements` (enabled, stats since 2026-08-24 01:10:13 UTC — roughly 24-29h of real traffic at review time). This directly answers the brief's own instruction that performance must be measured "across multiple scroll/refresh/variable-change scenarios, not a single snapshot" — `pg_stat_statements` aggregates exactly that, for real.

## Overall health

1,419 distinct normalized query shapes touching `ldi_*`/`v_ldi_*` objects. **1,390 (98.0%) execute at mean ≤500ms.** 29 exceed 500ms mean; broken down below.

## Self-disproven (not real findings)

Two query shapes matched entries in the >100,000ms bracket (mean 131,192ms/1 call and 129,762ms/2 calls). **Investigated and retracted**: grepped all 15 dashboard JSON files for the exact SQL text (`a.equipmentid, a.related_log_id, a.logdate, d.mo, d.log_id, d.time`) — zero matches in any live dashboard. This is leftover `pg_stat_statements` residue from this session's own P15-R manual correctness-diff work (the "byte-for-byte identical, 500 most recent alarms" comparison documented in `GRAFANA_FRONTEND_EXCELLENCE_P15R_AUDIT.md` §2 used this exact column list). Not a live defect. Same applies to a `SELECT a.logdate, d.time, (a.logdate - d.time) AS diff ...` entry (3,897ms/1 call) — matches the manual "max gap 23 seconds" verification query from the same P15-R session, also not dashboard-issued.

## Real finding — FINDING-03 (MEDIUM, needs clean re-verification)

**Andon Action Queue query (panel 8, `ims-ldi-operator-andon.json`) — post-fix real-traffic stats don't match the single-run verification claim.**

The exact live query text (matched character-for-character against the panel's current `rawSql`, including the P15-R 10-minute join bound) appears in `pg_stat_statements` as:
- mean 5,275.83ms / max 9,627.72ms / 47 calls
- mean 1,078.62ms / max 3,121.85ms / 47 calls (second parameter-normalized variant, likely different `machine_id` selection)

P15-R's own final report claimed "clean end-to-end query time: 2.2 seconds" — a single verification run. The real aggregate mean here is ~2.4x that, and the max (9.6s) exceeds the Andon board's 5-second refresh interval, meaning on some refreshes the query genuinely could not complete before the next one started — the same failure mode as the original P0, just far less frequent/severe.

**Honest caveat, not swept under the rug:** the 47-call count most likely originated from this session's OWN repeated P15-R debugging (documented in the audit as "fresh navigation, hard reload, 20+ second waits, multiple 5-second refresh cycles" — many manual reloads while diagnosing and then re-verifying the fix), not confirmed independent production/operator traffic. Cannot fully rule out contribution from real usage either, since stats were not reset between P15-R and this audit.

**Recommendation, not applied (audit-only, no fixes made):** `pg_stat_statements_reset()`, then observe the panel under normal 5-second-refresh viewing for a clean 5-10 minute window to get an uncontaminated mean/max. If the max still approaches or exceeds 5s under clean measurement, the 10-minute join-bound fix, while correct, may need a tighter interval or an index review — this was not re-investigated further this pass (out of scope for an audit-only rule against making further changes).

## Other >500ms entries — reviewed, no new defects

- **Scheduled materialized-view refreshes** (`v_ldi_rca_truth_test`: mean 5.1s/max 84.3s/752 calls; `v_ldi_rca_recent_window`: mean 0.7s/max 12.4s/752 calls) — both run on a 60s background cycle (migration 064). Combined they account for ~72% of all captured DB time in the window, which is expected and by design (they exist specifically so dashboard-facing queries don't pay this cost). The 84.3s single-call max on `v_ldi_rca_truth_test` is worth watching (approaches its own 60s cycle) but 752 calls at that rate over ~29h shows this is a rare outlier, not typical — not flagged as a defect, but noted for future monitoring.
- **Variable-population (dropdown) queries** (`DISTINCT fpn`/`process`/`mo` from raw `ldi_data`, 1 call each, 1.2–1.7s) — expected one-time cost for populating dashboard template variables from a large raw table. Real UX latency on first dashboard load, but low call volume and no existing budget rule covers this query shape. **LOW** — noted, not filed as a defect.
- **Analytical/SPC panels** (Machine Capability Ranking, PE/JE StdDev, Z-Score — 500–1,700ms) — all already carry `QUERY_BUDGET_EXEMPT` comments from a prior optimization pass (2026-08-06), documented as intentionally exempt (deep-dive analytical panels, not real-time operator glances). Consistent with their own documentation — no new issue.

## Tooling gap re-confirmed — FINDING-02 addendum

`tests/lint/query-budget-linter.js` only iterates `data.panels` — never recurses into `row.panels`. **39 of 178 queries (22%) are structurally invisible to this linter.** One nested query (`ims-ldi-engineering-analytics.json` panel 9, "◈ state") would match the linter's flag condition by SQL shape, but is independently exempted by panel type (`state-timeline`) and already carries its own `QUERY_BUDGET_EXEMPT` comment — so nothing currently slips through undetected, but the blind spot is real and should be fixed in the linter (recursion into row.panels) so future nested panels aren't silently unchecked.

## Verdict

No new CRITICAL or unexplained-regression query defects found. One MEDIUM finding (Andon Action Queue's post-fix performance needs a clean re-measurement, contaminated stats currently show worse-than-claimed numbers). One tooling-gap addendum (query-budget-linter row-recursion, consistent with the inventory-level finding already logged).
