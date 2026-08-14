# LDI SPC (Statistical Process Control) Guide

> **Audience:** process engineering, QA/audit, SRE/operations.
>
> **Provenance:** every formula, threshold, and file reference below was checked directly against the live migrations, dashboard JSON, and the golden-dataset test suite on 2026-08-10.

---

## What SPC means in this system

IMS tracks process capability (Cpk) for two measured quantities on every LDI exposure: **PE** (Position Error, 6 samples per board: `pe_1`..`pe_6`) and **JE** (Judgment Error, 4 samples per board: `je_1`..`je_4`), against each row's own recipe tolerance (`pe_setting`, `je_setting` — not a single hardcoded limit across all machines/recipes).

## The Cpk formula

```text
cp = tolerance / (3 * sigma)
cpk = LEAST( (tolerance - mean) / (3 * sigma), (mean + tolerance) / (3 * sigma) )
```

Where `mean` = sample average (`AVG`), `sigma` = sample standard deviation (`STDDEV`, not population `STDDEV_POP`), and `tolerance` is that row's own `pe_setting`/`je_setting`. A machine's **Worst Cpk** is `LEAST(cpk_pe, cpk_je)` — the more constrained of the two measurements, not an average.

**Industry-standard floor: Cpk ≥ 1.33.** Below this, the "LDI Process Capability — Cpk below 1.33" and "LDI JE Process Capability — Cpk below 1.33" Grafana alert rules fire (`monitoring/grafana/provisioning/alerting/ldi-rules.yml`).

## Where Cpk is computed — 5 independent implementations

This formula is **reimplemented independently in 5 places**, not shared via one function or view. Manual review confirmed they agree, but nothing structurally prevents one silently drifting from the others the next time someone edits one without the rest:

1. `monitoring/grafana/dashboards/manufacturing/ims-ldi-machine-snapshot.json` — panel 9 ("Worst Cpk")
2. `monitoring/grafana/dashboards/manufacturing/ims-ldi-manufacturing.json` — panel 17 ("Avg Cpk Fleet")
3. `monitoring/grafana/dashboards/manufacturing/ims-ldi-engineering-analytics.json` — panel 10 ("Machine Capability Ranking")
4. `public.v_machine_spc_fleet` — materialized view (migration 064, refreshed every 60s via TimescaleDB's background job scheduler), 24-hour rolling window (`"time" > NOW() - INTERVAL '24 hours'`)
5. `public.v_machine_spc_ranking` — plain view (migrations 027/032/041/048/059), not materialized

## The golden-dataset regression gate — and a real, current gap in it

`tests/e2e/golden-dataset-spc.js` inserts a small synthetic PE/JE dataset (hand-computed mean/sigma/Cpk, under a reserved `eqp_id` invisible to real dashboards) inside a transaction that always rolls back, and asserts all 5 implementations above produce the identical, textbook-correct Cpk.

**Live-verified status, 2026-08-10: 5 of 7 assertions pass; 2 fail.** Both failures are against `v_machine_spc_fleet` specifically. Root cause: migration 064 converted that view from a plain view to a **materialized view**. A materialized view is a physically separate stored snapshot — it cannot see rows inserted inside the test's own uncommitted transaction, so the test's query against it returns nothing meaningful for the synthetic device. This means **the golden-dataset gate has been unable to actually verify `v_machine_spc_fleet`'s Cpk formula since migration 064 shipped**, even though the view itself may well still be computing correctly (the other 3 dashboard-panel implementations and `v_machine_spc_ranking`, none of which are materialized, still pass and provide real coverage of the same formula). This is a real, open test-coverage gap — not fixed in this documentation pass (fixing it requires either exempting the materialized-view check with a documented reason, or restructuring the test to `REFRESH MATERIALIZED VIEW` before asserting, both of which are engineering changes outside a docs-only pass). Filed in `ARCHITECTURE.md`'s Known Gaps.

## Reading the SPC dashboards

- **Operator Andon Board** — no SPC detail, status-only (by design — floor operators need glanceable state, not statistics).
- **LDI Machine Snapshot** — per-machine Worst Cpk, PE1-6/JE1-4 raw values, control charts.
- **LDI Manufacturing (Command Center)** — fleet-wide average Cpk, KPI strip.
- **LDI Engineering Analytics & SPC** — the deep-dive: Machine Capability Ranking (all machines side-by-side), box plots, control charts (ECharts-based, converted from native Grafana panels for richer interaction).

## Related documents

- `docs/architecture/LDI_RCA_GUIDE.md` — how out-of-spec SPC excursions correlate with alarm events.
- `docs/architecture/ARCHITECTURE.md` — full system context, Known Gaps.
- `docs/operations/LDI_VALIDATION_PROTOCOL.md` — production sign-off procedure, including the dashboard/schema linters that also cover SPC panels.
