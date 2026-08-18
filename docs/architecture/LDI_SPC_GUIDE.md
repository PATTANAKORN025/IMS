<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# LDI SPC (Statistical Process Control) Guide

> **Audience:** Process Engineering, QA/Audit, SRE/Operations.
> **Objective:** Defines the Statistical Process Control (SPC) mathematical models (Cpk) used across the manufacturing dashboards.
> **Provenance:** Every formula, threshold, and file reference below was checked directly against live migrations, dashboard JSON, and the golden-dataset test suite on 2026-08-10.

---

## What SPC means in this system

IMS tracks process capability (Cpk) for two measured quantities on every LDI exposure: **PE** (Position Error, 6 samples per board: `pe_1`..`pe_6`) and **JE** (Judgment Error, 4 samples per board: `je_1`..`je_4`), against each row's own recipe tolerance (`pe_setting`, `je_setting` — not a single hardcoded limit across all machines/recipes).

## The Cpk formula

```text
cp = tolerance / (3 * sigma)
cpk = LEAST( (tolerance - mean) / (3 * sigma), (mean + tolerance) / (3 * sigma) )
```

- **Mean:** Sample average (`AVG`)
- **Sigma:** Sample standard deviation (`STDDEV`, not population `STDDEV_POP`)
- **Tolerance:** Row-specific `pe_setting` or `je_setting`
- **Worst Cpk:** `LEAST(cpk_pe, cpk_je)` (the more constrained of the two measurements, not an average)

### Control Limits

- **Warning Limit:** Cpk < 1.33. Triggers alert rules in `monitoring/grafana/provisioning/alerting/ldi-rules.yml`.
- **Control Limit Violation:** Cpk ≤ 1.0 (Critical). Red line. Process is not capable. Produces scrap.

---

## Out of Control Action Plan (OCAP)

When the dashboard indicates a Cpk excursion, Process Engineering must execute the following workflow:

### Stage 1: Assessment (Cpk < 1.33)

**Trigger:** `LDI Process Capability — Cpk below 1.33` alert fires.

1. **Acknowledge:** Process Engineer claims the alert in the `Alarm Console`.
2. **Review Control Charts:** Open `LDI Engineering Analytics`. Examine the X-bar and R-charts for the affected machine.
   - _Is it a sudden shift or a gradual drift?_
3. **Check RCA Correlation:** Cross-reference `LDI_RCA_GUIDE.md`. Are there underlying Thermal or Vacuum anomalies correlating with this capability drop?
4. **Action:** The line **continues running**. Engineer begins tuning recipe parameters (e.g., laser dosage, alignment tolerances) to bring Cpk back > 1.33.

### Stage 2: Intervention (Cpk ≤ 1.0)

**Trigger:** Cpk drops below 1.0. The process is mathematically incapable of meeting tolerance. Defect generation is highly probable.

1. **STOP THE LINE:** Process Engineer authorizes the Shift Supervisor to halt the specific machine.
   - _Note: Unlike mechanical faults (which operators can stop independently), an SPC stop requires Engineering oversight to validate the data._
2. **Quarantine:** All panels processed by this machine in the last 60 minutes must be marked for QA re-inspection.
3. **Physical Audit:**
   - Perform test exposure on dummy glass.
   - Recalibrate optical alignment heads.
   - Clean vacuum platen.
4. **Verification Run:** Run 5 test panels. If Cpk on the test batch is > 1.33, production may resume.

---

## Where Cpk is computed — 5 independent implementations

This formula is **reimplemented independently in 5 places**, not shared via one function or view. Manual review confirmed they agree, but nothing structurally prevents one silently drifting from the others the next time someone edits one without the rest:

1. `monitoring/grafana/dashboards/manufacturing/ims-ldi-machine-snapshot.json` — panel 9 ("Worst Cpk")
2. `monitoring/grafana/dashboards/manufacturing/ims-ldi-manufacturing.json` — panel 17 ("Avg Cpk Fleet")
3. `monitoring/grafana/dashboards/manufacturing/ims-ldi-engineering-analytics.json` — panel 10 ("Machine Capability Ranking")
4. `public.v_machine_spc_fleet` — materialized view (migration 064, refreshed every 60s via TimescaleDB's background job scheduler), 24-hour rolling window (`"time" > NOW() - INTERVAL '24 hours'`)
5. `public.v_machine_spc_ranking` — plain view (migrations 027/032/041/048/059), not materialized

## The golden-dataset regression gate — current boundaries

`tests/e2e/golden-dataset-spc.js` inserts a small synthetic PE/JE dataset (hand-computed mean/sigma/Cpk, under a reserved `eqp_id` invisible to real dashboards) inside a transaction that always rolls back, and asserts all 5 implementations above produce the identical, textbook-correct Cpk.

> [!WARNING]
> **Live-verified status (2026-08-10): 5 of 7 assertions pass; 2 fail.**
> Both failures are against `v_machine_spc_fleet` specifically.
>
> - **Root cause:** Migration 064 converted that view from a plain view to a **materialized view**. A materialized view is a physically separate stored snapshot — it cannot see rows inserted inside the test's own uncommitted transaction.
> - **Impact:** The golden-dataset gate has been unable to verify `v_machine_spc_fleet`'s Cpk formula since migration 064 shipped. The other 3 dashboard-panel implementations and `v_machine_spc_ranking` still pass.
> - **Resolution:** This is a documented test-coverage boundary. Fixing it requires either exempting the materialized-view check or restructuring the test to `REFRESH MATERIALIZED VIEW` before asserting.

## Reading the SPC dashboards

- **Operator Andon Board** — no SPC detail, status-only (by design — floor operators need glanceable state, not statistics).
- **LDI Machine Snapshot** — per-machine Worst Cpk, PE1-6/JE1-4 raw values, control charts.
- **LDI Manufacturing (Command Center)** — fleet-wide average Cpk, KPI strip.
- **LDI Engineering Analytics & SPC** — the deep-dive: Machine Capability Ranking (all machines side-by-side), box plots, control charts (ECharts-based, converted from native Grafana panels for richer interaction).

## Related documents

- `docs/architecture/LDI_RCA_GUIDE.md` — how out-of-spec SPC excursions correlate with alarm events.
- `docs/architecture/ARCHITECTURE.md` — how the Cpk logic fits into the system boundary.
- `tests/e2e/golden-dataset-spc.js` — the actual source code of the regression gate.
- `docs/operations/LDI_VALIDATION_PROTOCOL.md` — production sign-off procedure, including the dashboard/schema linters that also cover SPC panels.

---

[⬅️ Back to IMS Platform Book](IMS_PLATFORM_BOOK.md) | [🏠 Main Repository](../../README.md)
