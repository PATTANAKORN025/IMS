<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# IMS — Full-System Audit Report

> **ARCHIVED — historical snapshot, dated 2026-08-05.** Not living documentation; numbers below (dashboard counts, migration counts, panel counts, etc.) reflect the system as it existed on that date and are known to be stale relative to the current system. Kept for historical record per docs/archive/README.md. For current information, see docs/architecture/ARCHITECTURE.md and docs/architecture/DASHBOARD_INVENTORY.md.

### Evidence from Live Dashboard Inspection of 8 Interfaces · 2026-08-05

---

## Methodology

| Layer                     | Method                                | Coverage                              |
| ------------------------- | ------------------------------------- | ------------------------------------- |
| **A. Static**             | Reviewing SQL / JSON / Flow code      | 9 dashboards · 126 panels · 65 nodes  |
| **B. Automated**          | 19 unit tests · 12 linter checks      | Schema, layout, alarm synchronization |
| **C. Visual (New Layer)** | Inspecting 8 live rendered dashboards | Elements undetected by Layers A and B |

**Key Methodological Finding:** Layer C identified **12 defects that completely bypassed Layers A and B**.
This occurs because queries with correct syntax and matching schemas can still yield NULL values or contradictory data.
→ **The existing automated testing system currently lacks a "live output validation" layer.**

---

# P0 — Contradictory Metrics (Most Critical)

## P0-1 · Yield Metrics for the Same System Diverge by 87 Percentage Points Across Two Interfaces

| Dashboard         | Displayed Value               | Underlying Formula                        |
| ----------------- | ----------------------------- | ----------------------------------------- |
| **NOC Overview**  | **87.10%** (Red — Critical)   | `$\max(|pe_1|, |je_1|) > 10$`        |
| **Manufacturing** | **99.6%** (Green — Excellent) | `$\max(|pe_1|, \dots, |pe_6|) \le pe\_setting$` |

**Root Cause — Three Fundamental Discrepancies in Logic:**

1. **NOC utilizes a hardcoded threshold of `10`**, whereas the actual `pe_setting` value is **25 / 50 / 75** depending on the product.
   → The NOC inaccurately flags products as "defective" despite them conforming to actual specifications.
2. **NOC solely evaluates `pe_1` and `je_1`**, ignoring the full set of 6 measurement points → This does not represent the metric utilized for actual quality determination.
3. **NOC measures "Risk" while Manufacturing measures "Yield"** — These constitute distinct definitions, yet end-users interpret them as identical metrics.

**Business Impact:** If executives consult the NOC, they will perceive an 87% defect rate in manufacturing quality.
If they consult the Manufacturing dashboard, they will perceive a 99.6% excellence rate — **This leads directly to flawed decision-making.**
Furthermore, when the contradiction is discovered, the credibility of the **entire system** will be simultaneously compromised.

**Resolution:** Enforce the NOC to query the identical logic utilized by Manufacturing via a centralized view.

```sql
CREATE OR REPLACE VIEW public.v_ldi_yield_1h AS
SELECT ROUND(100.0 * COUNT(*) FILTER (
         WHERE GREATEST(ABS(pe_1),ABS(pe_2),ABS(pe_3),
                        ABS(pe_4),ABS(pe_5),ABS(pe_6)) <= pe_setting)
       / NULLIF(COUNT(*) FILTER (WHERE pe_1 IS NOT NULL), 0)::NUMERIC, 1) AS yield_pct
FROM public.ldi_data
WHERE "time" > NOW() - INTERVAL '1 hour' AND COALESCE(pe_setting,0) > 2.0;
```

Subsequently, both dashboards will query this centralized view — **The metrics will remain consistently synchronized by architectural design, rather than by coincidence.**

---

# P0-2 · RCA Truth Test Reports "No Correlation" — And It Is Correct

Evidence from Engineering Analytics & SPC:

| Alarm Category   | Alarm-Window % | Baseline % | **Lift** | Events | Interpretation              |
| ---------------- | -------------- | ---------- | -------- | ------ | --------------------------- |
| ALIGNMENT/PE-JE  | 49.0%          | 44.8%      | **1.09** | 251    | Statistically insignificant |
| VACUUM (91009)   | 96.8%          | 100.0%     | **0.97** | 95     | **Sub-1 ratio**             |
| THERMAL (91008)  | 13.8%          | 16.6%      | **0.83** | 29     | Sub-1 ratio                 |
| HUMIDITY (91008) | 3.4%           | 9.9%       | **0.34** | 29     | Significantly Sub-1         |
| MOTION (70004)   | 0.0%           | 0.0%       | **0.00** | 19     | Insufficient data           |

**Interpretation:** A `Lift = 1` indicates zero correlation. A `Lift < 1` indicates an **inverse** correlation.

**This is not an RCA bug — The RCA mechanism operates correctly and reveals a critical truth:**

> The mock data generator spawns alarms randomly based on frequency, **without binding them to actual parameter values.**
> Consequently, the "vacuum" alarm is not triggered during genuine `air_vacuum` anomalies.

**Value Delivered:** The RCA Truth Test has successfully validated its capability to **detect false correlations**.
If it reported a high Lift on data lacking actual correlation, the diagnostic tool itself would be flawed — but it performed correctly.

**Action Item:** Rectify the **simulator**, not the RCA logic.

```javascript
// ldi_simulator.js — Ensure alarms are triggered by actual parameter anomalies
if (rec.air_vacuum > -10 && p.process === "DF INNER") emitAlarm("91009");
if (maxPE > rec.pe_setting * 0.9) emitAlarm("90005");
if (rec.temperature < 20 || rec.temperature > 24) emitAlarm("91008");
```

Post-modification, the Lift should surge to **> 2**. If it fails to do so, it indicates a genuine underlying bug within the RCA engine that requires investigation.

---

# P1 — Panels Rendering Without Data (15 instances detected)

## Engineering Drill-Down — Most severely impacted (10 panels)

```text
CPU Load · RAM Usage · Storage Saturation · Temperature      → "No data"
Memory Saturation · Network Bandwidth · Temperature Sensors   → "No data"
LDI Throughput · LDI Junction Efficiency · LDI Quality Scatter → "No data"
CPU Anomaly Score · Temperature Anomaly Score → "Data does not have a time field"
```

**Two Distinct Root Causes:**

- **"No data"** — The query is syntactically valid but yields zero rows matching the conditions (Machine/Interface variables remain unselected).
- **"Data does not have a time field"** — The query returns results but **lacks a `time` column**, despite the panel being configured as a timeseries → Genuine SQL bug.

## AIOps & Capacity Forecast — 3 out of 4 KPIs failed

```text
DISK: Days Until Full  → No data
RAM:  Days Until Full  → No data
CPU:  Days Until Saturation → No data
Days Until Full (Resource Battery) → No data
Fleet Health Score 91.30% →  Operational
```

## NOC Overview — Unreliable metrics

```text
CPU Load (Fleet Envelope)  → 0.00% completely flat trajectory   ← Should not be 0
RAM Saturation             → "AWAITING TELEMETRY"
Temperature Fleet Envelope → 65.0°C flat trajectory          ← Reflects server temp, not LDI
```

## Operator Andon — 2 completely vacant panels

```text
LIVE PRODUCTION            → Completely devoid of content
PE/JE VS SPEC LIMIT        → Completely devoid of content
```

**Severe Operational Impact** as the Andon serves as the primary live interface for operators throughout their shift, and these two specific panels dictate "current production status" and "real-time quality metrics."

---

# <img src="../assets/icons/circle-check.svg" width="18" height="18" align="center" /> P2 — Auto-Detected Data Quality Issues

Evidence from LDI Data Readiness (this specific dashboard performs exceptionally well):

## Genuine Issues Detected Autonomously by the System

| Metric                    | Value         | Assessment                                                                                                                                            |
| ------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Machine ID Match          | **100%**      | Successfully resolved from the previous 20% baseline                                                                                                  |
| Alarm Master Match        | **100%**      | Successfully resolved from the previous 0% baseline                                                                                                   |
| Telemetry Age / Alarm Age | 0.0 hour      | Telemetry is live                                                                                                                                     |
| **Board ID Completeness** | **8.0%**      | <img src="../assets/icons/circle-check.svg" width="18" height="18" align="center" /> Accurately reflects ground truth where data is 100% NULL |
| **PE / JE4 Coverage**     | **45% / 45%** | Correct (The DF INNER process does not measure PE)                                                                                                    |

## Duplicate Board Keys — Isolated exclusively to 2 machines

```text
LDI-01:  43,667 rows → 43,510 unique → 157 duplicate board keys
LDI-04:  28,683 rows → 28,562 unique → 121 duplicate
LDI-02,03,05..10:                        0 duplicate
```

**Highly Suspicious** — If this were a generator bug, it should manifest uniformly across all machines.
The fact that it occurs exclusively on LDI-01 and LDI-04 implies a divergence in logic.
(Both are DF INNER machines, yet LDI-02 and LDI-03 are also DF INNER and exhibit zero issues).

**Investigation Required:** The `UNIQUE INDEX idx_logid (log_id, time DESC)` should inherently prevent duplication.
→ This implies the duplication resides at the `(mo, board_no)` level rather than `log_id` = **It may indicate physical dual-counting of boards.**

## Inferred Sensor Capability — Autonomous System Observation

```text
LDI-01..04:  Vacuum "CONSTANT - VERIFY"   Scan Speed "CONSTANT - VERIFY"
LDI-05..10:  Vacuum "ALL ZERO - VERIFY"
```

The system flags these as "Persistent constant values — investigation recommended", which is **accurate based on the raw data**
(The recipe setting is intrinsically static, not dynamically measured). However, the messaging should be amended to
`"CONSTANT (recipe setting — expected)"` to prevent misinterpretation as an anomaly.

## LDI-03 / LDI-04 Displaying "Stale" Status in NOC

While Data Readiness reports Telemetry Age = 0.0 hour → **Contradiction.**
This stems from a NOC bug utilizing a disparate freshness threshold compared to Data Readiness.

---

# <img src="../assets/icons/circle-check.svg" width="18" height="18" align="center" /> P3 — Units and Formatting

```text
"255.03 currency-thb"   ← Requires formatting to ฿255.03
"574.00 currencyTHB"    ← Requires formatting to ฿574.00
Donut legend: "value value value"  ← Missing series nomenclature
```

**Successfully Resolved Items:** `µm`, `°C`, `%H`, `mm/s`, `kPa`, `mJ/cm²` all render accurately across
Machine Snapshot and Manufacturing interfaces — The `lengthum` bug has been comprehensively eliminated.

---

# Highly Functional Components (Do Not Modify)

| Dashboard             | Status                                                                                                            | Evidence                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Machine Snapshot**  | <img src="../assets/icons/circle-check.svg" width="18" height="18" align="center" /> Perfect              | All panels populated · Units 100% accurate · PE/JE PASS functioning · Cpk isolates PE/JE · Millisecond-precision event timeline |
| **Manufacturing**     | <img src="../assets/icons/circle-check.svg" width="18" height="18" align="center" /> Excellent            | Full KPI coverage · Populated tabular data · Dominant green compliance indicators · Footer RCA summary                          |
| **Engineering & SPC** | <img src="../assets/icons/circle-check.svg" width="18" height="18" align="center" /> Solid                | 6+4 PE/JE trajectories successfully uncoupled · Overlaid PE vs JE histograms · Validated Cpk PE 1.253 / JE 2.710                |
| **Data Readiness**    | <img src="../assets/icons/circle-check.svg" width="18" height="18" align="center" /> Outstanding          | Successfully identified 3 legitimate data anomalies autonomously                                                                |
| **Andon**             | <img src="../assets/icons/circle-check.svg" width="18" height="18" align="center" /> Partially Functional | KPIs + 10 machine tiles operate flawlessly · However, 2 panels remain unpopulated                                               |

**Most Impressive Achievement:** The Machine Capability Ranking displays **Cpk (PE) 1.253 and Cpk (JE) 2.710
in isolated, dedicated columns** alongside Worst Cpk and Confidence intervals — Conclusively proving that the architectural decoupling of the JE base from PE operates flawlessly as designed.

---

# Continuous Audit Framework

## Integrate Layer C into Automated Pipelines — The Most Critical Gap

The system currently possesses comprehensive unit tests and linters, but **lacks any mechanism to validate that panels render actual payload data.**

```javascript
// tests/e2e/panel-data-check.js  (New)
// Execute the actual SQL query for every panel against the database and verify row yields
for (const panel of allPanels) {
  const rows = await pg.query(resolveMacros(panel.rawSql));
  if (rows.length === 0)
    fail(`${dashboard}/${panel.title}: query returned 0 rows`);
  if (panel.type === "timeseries" && !rows.fields.includes("time"))
    fail(`${dashboard}/${panel.title}: timeseries lacks a 'time' column`);
}
```

**Pass Criteria:** Every panel must yield ≥1 row, and every timeseries panel must contain a `time` column.
→ This automated check will reliably catch the 15 currently malfunctioning panels without manual intervention.

## Implement Cross-Dashboard Consistency Verification

```sql
-- Identically named metrics across diverse dashboards must source from a unified view.
-- Prohibit hardcoded thresholds that should inherently map to pe_setting/je_setting.
```

**Pass Criteria:** Zero queries utilize hardcoded numerical thresholds for PE/JE metrics.
(They must unconditionally reference `pe_setting` / `je_setting` from the database layer).

---

# Execution Priority Sequence

| #   | Task                                                | Severity                                                                                        | Beneficiary                                 |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | **Consolidate Yield Logic into a Centralized View** | P0                                                                                              | Executives — Eradicates conflicting metrics |
| 2   | **Bind Simulator Alarms to Parameter Anomalies**    | P0                                                                                              | Process Engineers — Enables RCA validation  |
| 3   | Resolve 2 unpopulated panels in Andon               | P1                                                                                              | Shop-floor Operators                        |
| 4   | Resolve 15 "No data" panels                         | P1                                                                                              | All Stakeholders                            |
| 5   | Investigate duplicate board keys (LDI-01/04)        | <img src="../assets/icons/circle-check.svg" width="18" height="18" align="center" /> P2 | QA — Mitigates skewed board counts          |
| 6   | Integrate E2E panel-data verification into CI       | <img src="../assets/icons/circle-check.svg" width="18" height="18" align="center" /> P2 | Development Team — Prevents regression      |
| 7   | Rectify currency units + donut legend formatting    | <img src="../assets/icons/circle-check.svg" width="18" height="18" align="center" /> P3 | General interface polish                    |

---

# Stakeholder Executive Summaries

**Executive Board:** The system is fully operational across 5 of 9 interfaces. However, 1 critical issue demands immediate resolution:
A severe contradiction in Yield reporting (87% vs 99.6%) that directly undermines strategic decision-making.

**SRE / IT Operations:** 15 panels currently fail to render data. The implementation of E2E verification is mandatory, as the current linter
strictly validates syntax but fails to ensure actual data retrieval.

**QA Engineering:** Discovered 157 and 121 duplicate board keys isolated to LDI-01 and LDI-04.
An immediate investigation is required to determine whether this is a physical dual-counting error or an anomaly within the data simulator.

**Process Engineering:** The RCA Truth Test functions perfectly and accurately reports that
no statistically significant correlation currently exists (Lift ≈ 1) — Actionable root cause analysis requires authentic data or a corrected simulator.
Cpk (PE) stands at 1.253, which is categorized as "Acceptable" but falls below the stringent 1.33 industry benchmark.
