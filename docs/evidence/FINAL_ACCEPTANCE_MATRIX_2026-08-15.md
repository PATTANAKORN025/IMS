# Final Acceptance Matrix

> No metric below is claimed "100% real" or "100% accurate" -- wording follows: verified, observed, measured, unknown, insufficient sample, simulated, inferred, not yet validated. Every row cites the evidence doc it came from; none are asserted from memory.

| Metric | Target | Actual | Evidence | Status |
| --- | --- | --- | --- | --- |
| Data loss (sys_metrics/net_metrics/ldi_data) | 0 | 0 over a 34-min post-fix window; 0 buffer overflows, 0 circuit-breaker trips | `DATA_INTEGRITY_VALIDATION_2026-08-15.md` | **Verified** (short window) |
| Duplicate rate (sys_metrics, real fleet) | 0% | 66.9% → 0.0% | `SPEC_SYS_METRICS_DUPLICATE_INSERT.md` | **Verified**, fixed |
| Duplicate rate (sys_metrics, under scale-test concurrency) | 0% | 74.4% under 500 concurrent overlapping polls for the same devices | `SCALE_TEST_2026-08-15.md` | **Observed regression under a condition the real fleet doesn't create** -- new race condition, not yet fixed |
| Timestamp precision | Documented, not overclaimed | `ldi_data`/`ldi_alarm_log`: millisecond (JS `Date`), not microsecond despite `timestamptz(6)` schema. `sys_metrics`/`net_metrics`/`ldi_metrics`: genuine microsecond (Postgres `NOW()`) | `SPEC_TIMESTAMP_INTEGRITY.md` | **Verified and documented**, previously overclaimed implicitly by the schema type alone |
| Timestamp ordering | 0 out-of-order, 0 future | 0 rows where `ingest_ts` < event time; 0 future timestamps, across `ldi_data`, `sys_metrics`, `ldi_alarm_log` | `SPEC_TIMESTAMP_INTEGRITY.md` | **Verified** |
| Ingest P95 (`ldi_data`, real traffic) | Bounded, documented | 22ms | `SPEC_TIMESTAMP_INTEGRITY.md` (live re-run of `tests/e2e/ingestion-latency-check.js`) | **Measured** |
| Ingest P99 (`ldi_data`, real traffic) | Bounded, documented | 38ms | same | **Measured** |
| Ingest P95 (scale test, 250 concurrent devices) | -- | 1.09s | `SCALE_TEST_2026-08-15.md` | **Measured** -- real inflection point, not a target violation (no target was set for this tier) |
| Ingest P95 (scale test, 500 concurrent devices) | -- | 2.93s, 3.68% requests failed/timed out | `SCALE_TEST_2026-08-15.md` | **Measured** -- real ceiling found between 250-500 |
| API latency (alarm-api, Grafana) | -- | Not measured this program | -- | **Not yet validated** |
| Dashboard load P95 | -- | Not measured this program | -- | **Not yet validated** |
| CPU (`ims-node-red`, idle/light load) | Stable | 0-5% at ≤100 concurrent devices | `SCALE_TEST_2026-08-15.md` | **Measured** |
| CPU (`ims-node-red`, 500 concurrent) | -- | 118-135% (single core saturating) | `SCALE_TEST_2026-08-15.md` | **Measured** -- confirmed bottleneck |
| CPU (`ims-timescaledb`, all tiers) | Stable | <10% throughout, even at 500 concurrent | `SCALE_TEST_2026-08-15.md` | **Measured** -- DB layer has substantial headroom |
| RAM stability (`ims-node-red`) | No leak over short window | 129→339MiB over one 500-device test run | `SCALE_TEST_2026-08-15.md` | **Observed over ~3 minutes only** -- insufficient sample for a leak claim either way; the 2h/6h/12h endurance run (in progress) is what would actually validate this |
| DB connections | Stable, bounded | 20-26 across all 5 scale tiers | `SCALE_TEST_2026-08-15.md` | **Measured** |
| PgBouncer pool utilization | -- | Admin console (`SHOW POOLS`) not reachable from this environment; container CPU stayed <2% as a proxy | `SCALE_TEST_2026-08-15.md` | **Not directly measured** -- real tooling gap, stated plainly |
| Scale ceiling | Identify actual bottleneck | Reliable through 250 devices; degraded (96.32% success) at 500. Bottleneck: Node-RED CPU, not the DB. No ceiling narrower than "somewhere between 250-500" established | `SCALE_TEST_2026-08-15.md` | **Measured**, not fully pinned down (would need 350/400 intermediate tiers) |
| Alarm rate / mix realism | Noise-dominant (realistic) | 80.7% noise / 19.3% condition-driven (was 8.6%/91.4% at the 2026-08-11 audit) | `SIMULATOR_REALISM_AUDIT_2026-08-15.md` | **Verified**, a real and major fix that predates this session and was previously undocumented |
| Duplicate alarms (notification-level) | 0 | 1 latent risk found (alertmanager `continue: true` + duplicate-URL receivers), not actively firing, now fixed | `SPEC_ALARM_HYGIENE_COMPLETION.md`, commit `be8db54` | **Fixed** |
| Critical alarm behavior | Reachable, real | 43 Critical-severity codes now exist (was 0 at the 2026-08-11 audit) and have actually fired live | `READ_ONLY_AUDIT_2026-08-15.md` | **Verified** (cross-referenced from an earlier pass this session, not re-measured fresh here) |
| Alarm lifecycle completeness | Auditable | 782/782 lifecycle rows are `OPEN` -- 0 ever `ACKNOWLEDGED`/`RESOLVED` across ~2 days of real operation | `SPEC_ALARM_HYGIENE_COMPLETION.md` | **Verified, and a real operational gap** -- not a broken dashboard, an honest reflection of zero operator engagement to date |
| Recovery time (fault injection) | -- | Not executed -- plan only | `FAULT_INJECTION_PLAN.md` | **Not yet validated** -- deliberately, per instruction |
| Unexpected restarts (this session) | 0 unplanned | 0 -- every restart this session was a deliberate, approved deploy step (Phase A1, P0.1, P0.2, alertmanager fix) or a diagnosed host power event (Attempt 7, predates this program) | `SOAK_TEST_LOG.md` | **Verified** for the reliability-program window; historical gaps (below) predate it |
| Historical gaps | Reconciled | 2 found: one root-caused (host reboot, evidenced), one marked **UNKNOWN** (forensic tooling didn't exist yet at the time -- not guessed) | `HISTORICAL_DATA_RECONCILIATION_2026-08-15.md` | **Verified / partially unknown, stated honestly** |
| Simulator realism | Evidence-classified | vacuum/temp/PE/JE: normal variation (fixed from 23-45% OOS to ~0-0.7%, previously undocumented). Humidity: still 9.85% OOS, machine-specific, simulator artifact not yet recalibrated. scan_speed/pe_setting/je_setting: fixed recipe/setpoint. thickness: unclassified (no documented spec limit exists). power/vibration: deprioritized (confirmed unused by any decision-making dashboard) | `SIMULATOR_REALISM_AUDIT_2026-08-15.md` | **Mixed** -- mostly verified-healthy, one real gap (humidity) found and left unfixed, one parameter (thickness) genuinely unclassifiable with current documentation |
| Known unresolved risks | Documented | See list below | -- | -- |

## Known unresolved risks (not fixed in this program, stated plainly)

1. **PgBouncer `client_idle_timeout` pool-crash bug** (`SPEC_PG_POOL_RESILIENCE.md`) -- root-caused, fix designed, **not deployed**. This is the highest-priority undeployed fix; every fault-injection scenario touching PostgreSQL/PgBouncer is explicitly gated on it shipping first.
2. **Phase A1 cycle-gate race condition** (`SCALE_TEST_2026-08-15.md`) -- new, found only under scale-test concurrency, doesn't affect the real fleet's actual operating pattern, not yet fixed.
3. **Humidity out-of-spec rate** (9.85%, machine-specific) -- the one parameter the earlier telemetry recalibration (whoever/whenever it happened) apparently missed.
4. **Alarm Console has zero engagement** -- not a system defect, but a real operational fact: MTTA/MTTR cannot be validated until someone actually uses the Ack/Resolve workflow.
5. **Escalation semantics** -- confirmed not to exist in this system at all (only periodic re-notification via Alertmanager's `repeat_interval`, not true escalation). Needs its own design pass.
6. **Heartbeat panel** not relocated (Alarm Hygiene item 3) -- still functional, just not moved to its recommended home.
7. **Thickness** has no documented tolerance/spec limit anywhere found in this repo -- can't be classified as realistic or not without one.
8. **API and dashboard-load latency** were not measured in this program -- `tests/k6/grafana-query-stress.js` exists and would need a dedicated pass.
9. **PgBouncer's own pool-utilization stats** were not directly reachable from this environment -- a real tooling gap in observability, not just an unmeasured metric.
10. **RAM-stability-over-time** for `ims-node-red` is only observed over ~3 minutes (the scale test's own duration) -- the in-progress 2h/6h/12h endurance run is what would actually answer whether memory grows unbounded over hours.

## What this program does NOT claim

Per the explicit instruction: nothing in this document or any doc it references claims "100% real" or "100% accurate." Every fix is described with its actual measured before/after, every audit states what it did and did not cover, and every open item above is listed as open rather than omitted.
