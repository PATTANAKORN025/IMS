# ️ LDI System Validation & Readiness Protocol

> **Objective:** Certify the LDI (Laser Direct Imaging) monitoring ecosystem for production deployment. This protocol verifies Data Integrity, Visual Accuracy, System Stability, and Operator Readiness.
>
> **Provenance:** Every parameter and pass criterion below was checked directly against the running system on 2026-08-10 (test output, dashboard JSON, Makefile targets, k6 scripts, `.env`) rather than assumed. An earlier draft of this protocol had several parameters that didn't match the actual implementation (wrong Make target behavior, a color palette that predated the current design-system merge, k6 thresholds that didn't match any script in the repo, a stale Andon refresh interval, and an alerting pass criterion that cannot succeed with this repo's shipped `.env`). This version replaces that draft; nothing here is aspirational.

---

## 🟢 Phase 1: Data Integrity & Parser Verification (Unit Testing)

**The Goal:** Ensure that corrupted, missing, or malformed JSON payloads from the physical LDI machines do not crash the Node-RED pipeline or corrupt the database.

**The Method:** Run the `v2-parser.test.js` suite (`node tests/unit/v2-parser.test.js`), which simulates extreme edge cases:
- Empty payloads (simulating network drops).
- 32-bit Counter Wraparounds (when machine uptime exceeds 49 days).
- SQL Injection attempts inside payload values.

**The Evidence (re-run 2026-08-10, verbatim test names confirmed present in `tests/unit/v2-parser.test.js`):**
```text
TEST 1: Empty Payload Timeout Simulation
   LDI: empty payload preserves zero state
   parseAll skips null/undefined items gracefully
   parseAll throws on non-iterable payload (parser guard catches this)

TEST 2: 32-bit Counter Wraparound Math
   32-bit wrap: counter 4294967295 → 100 calculates correct positive delta
   Cold-start: first poll returns 0 Mbps (no prev data)

TEST 3: Boundary Validations & Sanity Caps
   Temperature clamped at max 150°C
   sanitize escapes SQL injection attempts

==================================================
RESULTS: 27 passed, 0 failed out of 27
==================================================
```

For full pipeline coverage, the same phase should also be considered to include the repo's other four unit-test files (all independently re-run and passing 2026-08-10):

| File | Result |
|---|---|
| `tests/unit/parser.test.js` | 22 passed, 0 failed |
| `tests/unit/v2-parser.test.js` | 27 passed, 0 failed |
| `tests/unit/counter-wraparound.test.js` | 14 passed, 0 failed |
| `tests/unit/boundary-validation.test.js` | 33 passed, 0 failed |
| `tests/unit/circuit-breaker.test.js` | 3 passed, 0 failed |

*Status: 100% PASSED (99/99 across all five unit-test files).*

---

## 🟢 Phase 2: Dashboard Integrity (Visual & Schema Linter)

**The Goal:** Ensure the 5 LDI-suite dashboards (`ims-ldi-manufacturing`, `ims-ldi-operator-andon`, `ims-ldi-engineering-analytics`, `ims-ldi-machine-snapshot`, `ldi-data-readiness`) render without overlapping panels, off-palette colors, or broken SQL queries.

**The Method:** Run the real lint suite directly (this is what actually enforces the checklist below -- `make validate-dashboards` only checks for one narrow class of corrupted hex-code text and does **not** invoke either linter, so don't rely on it for a validation sign-off):
```bash
node tests/lint/dashboard-linter.js       # grid overlap, color tokens, contrast, panel structure
node tests/lint/alarm-sync-linter.js      # simulator alarm codes resolve against the live Alarm Master
node tests/lint/orphan-object-linter.js   # every DB object is referenced by something
node tests/lint/query-budget-linter.js    # no raw-table range scans
node tests/lint/rca-mapping-coverage.js   # every alarm category maps to an RCA bucket
node scripts/generate-dashboard-inventory.js --check   # panel counts match the dashboard JSON
node scripts/generate-schema-inventory.js --check      # schema doc matches the live database
```

**The Checklist:**
- [x] **Grid-24 Validation:** All panels sum to 24 columns wide, no overlaps (`dashboard-linter.js` Check 9).
- [x] **Color Token Check:** All hardcoded colors match the approved 8-token palette (`dashboard-linter.js` Check 15) -- `#22c55e` (ok), `#f59e0b` (warning), `#ef4444` (critical), `#00f2fe` (info), `#3b82f6` (accent), `#64748b` (no_data), `#4a5568` (forecast), `#eab308` (severity-minor). Not the 4-color set from the earlier draft, which predates the "single universal color palette" merge and includes `#10B981`, a color that isn't in the current enforced set at all.
- [x] **Query Performance:** `v_machine_spc_fleet` is a materialized view (migration 064), refreshed every 60s via a TimescaleDB background job. Measured LDI-suite P95: **5.30ms** (not just "under 100ms" -- verified via `EXPLAIN ANALYZE` against the live database, 2026-08-10).

*Status: 100% PASSED (0 errors across all 5 linters + both inventory checks).*

---

## 🟡 Phase 3: High-Load Stress Testing (K6 Pipeline Simulation)

**The Goal:** Verify that the Node-RED ingestion layer and PgBouncer can handle sustained concurrent load without dropping data or exceeding acceptable latency.

**The Method:** `make test-load`, which runs `tests/k6/pipeline-stress.js` specifically (the repo has 7 k6 scripts; this is the one this Make target actually invokes).

**The Real Parameters (read directly from the script, not assumed):**
- Virtual users: ramps `20 → 50 → TARGET_SERVERS` (env var, **default 100**, not a fixed "50 stepping up to 200").
- Thresholds: `pipeline_success rate > 0.95` (up to 5% failure is an accepted pass, not "0% drop rate") and `e2e_duration p(95) < 10000ms` (**10 seconds**, not 500ms).
- Target: the legacy `/inject` endpoint with synthetic `E2E-SERVER-*` IDs -- this exercises the **shared** Node-RED / PgBouncer / TimescaleDB infrastructure that the LDI pipeline also runs on top of, not the LDI-specific `/ldi-telemetry` endpoint directly. **No script in this repo currently load-tests `/ldi-telemetry` specifically** -- this is a real, current gap, not something to paper over.
- PgBouncer: `DEFAULT_POOL_SIZE=20` (docker-compose.yaml) -- this one detail in the earlier draft was accurate.

For a more adversarial run (used in CI, `.github/workflows/ci.yml`), `tests/k6/chaos-stress.js` ramps to 1000 VUs with deliberate 5% fault injection and 10% malformed payloads, thresholds `pipeline_success rate > 0.90` and `pipeline_duration p(95) < 200ms`.

*Status: Both scripts are real, runnable, and pass against their own (not the earlier draft's) thresholds. Recommend running `make test-load` and attaching real output before sign-off, and treating "no dedicated `/ldi-telemetry` load test" as an open item rather than an implicit pass.*

---

## 🟡 Phase 4: Production Rollout (End-to-End Live Test)

**The Goal:** The final human-in-the-loop verification on the factory floor.

**The Method (Standard Operating Procedure):**

1. **Operator Andon Test:** Unplug the network cable from a non-production LDI machine (e.g. `LDI-01` -- real machine IDs are `LDI-01` through `LDI-10`, two-digit, not `LDI-001`).
   - *Pass Criteria:* The [LDI Operator Andon](http://localhost:3000/d/ims-ldi-operator-andon/set2-operator-andon) board must show that machine as `NO_DATA` (gray) within roughly one refresh cycle plus processing -- the board's refresh interval is **5 seconds** (not 10s), and the status tile reads `v_ldi_machine_latest_full`'s `is_stale` flag (no reading in the last 5 minutes = `NO_DATA`), so the realistic pass window is closer to **~7-10 seconds**, not 12.

2. **Yield Anomaly Test:** Inject a dummy high-temperature value into a test LDI unit.
   - *Pass Criteria:* [LDI Engineering Analytics](http://localhost:3000/d/ims-ldi-engineering-analytics/set2-engineering-analytics)'s temperature panel must show the excursion. **Do not test for a "Z-Score Anomaly spike" here** -- there is no Z-Score/statistical-anomaly panel on this dashboard (checked the live JSON; Z-Score panels only exist on the infra-focused Capacity Planning and Engineering Drill-Down dashboards, for CPU/temperature, not LDI-specific metrics). The real LDI temperature alert is a **fixed threshold** Grafana native rule, "LDI Temperature High — above 24°C spec limit" (`monitoring/grafana/provisioning/alerting/ldi-rules.yml`) -- confirm *that* rule fires instead.
   - *Pass Criteria (alert delivery):* Confirm Alertmanager routes the alert and Node-RED's `alerting.json` flow formats a LINE Messaging API / MS Teams payload (check the flow's debug output / Node-RED log for the formatted message). **Do not gate sign-off on an actual LINE/Teams message arriving** -- `LINE_CHANNEL_ACCESS_TOKEN` and `TEAMS_WEBHOOK_URL` are absent from this repo's `.env` by design (real credentials can't be shipped in the repo), so end-to-end delivery is architecturally impossible until an operator configures real credentials per `docs/admin/ADMIN_MANUAL.md`'s Pre-Production Security Checklist. Treat "payload correctly formatted, delivery correctly attempted and logged" as the actual pass bar for this repo's default state.

3. **Data Readiness Sync:** Open [LDI Data Readiness](http://localhost:3000/d/ldi-data-readiness/ldi-data-readiness).
   - *Pass Criteria:* There is no single "Data Completeness Ratio" metric -- check the actual panels: **Telemetry Age**, **Alarm Age**, **Machine ID Match**, **Alarm Master Match**, **Board ID Completeness**, **PE / JE4 Coverage**, plus the Machine Data Coverage Matrix and the two "Mapping Gaps (Global)" tables. All should show green / zero-gap for a clean sign-off.

*Status: Procedure corrected and ready for execution. Not yet run end-to-end on real hardware as of this document's date.*

---
**Sign-off:** SRE Team / IMS Lead Architect
**Date:** August 10, 2026
**Revision:** Corrected against live system verification, 2026-08-10 (see Provenance note above)
