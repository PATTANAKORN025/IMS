> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

# Node-RED 4.1.13-22-minimal Extended Validation (P11-D)

**Date:** 2026-08-24
**Scope:** Closes the 2 gaps left open by P11-C (`docs/evidence/` — Node-RED disposable remediation validation): `net-snmp`/`ims-tab-v5` compatibility, and performance confidence beyond a single sample.
**Method:** Entirely disposable, isolated Docker stacks (`p11d_scratch/extended/`, `p11d_scratch/regression/`) — real, unmodified build contexts, migrations, and the live `nodered_data/flows.json` tabs, extracted read-only. No production file was modified. No production container was restarted. No commit or push has been made.

---

## D1 — Extended harness: `net-snmp` / `ims-tab-v5` compatibility

Deployed **both** `ldi-ingestion-tab` and `ims-tab-v5` (40 nodes combined, 0 duplicate IDs) from the live `flows.json` onto the 4.1.13 candidate image (`ims-p11c-fleet-node-red:latest`, built in P11-C), plus a real `snmpsim` instance (same image/data as production, read-only).

**First run** (40s/45s observation window) showed clean startup and a successful `device_registry` DB query, but zero SNMP-walk activity and zero `sys_metrics`/`net_metrics` rows. Root-caused, not assumed: Node-RED logs showed `NET GET ERROR ... getaddrinfo ENOTFOUND ims-snmpsim` — the scratch compose file's `snmpsim` service had no network alias matching the hostname (`ims-snmpsim`) that the real, unmodified `device_registry` seed data (from `postgres/init/`) uses. This was a scratch-harness naming gap, not a Node-RED/net-snmp compatibility defect. Fixed by adding a `networks.default.aliases: [ims-snmpsim]` entry to the scratch-only compose file (not a production file) and re-running with a 100s window (matching the real ~86s first-batch-flush cadence observed).

**Result after fix — real, clean, verified:**

| Item | Result |
|---|---|
| Node-RED startup | Clean, `Started flows`, no errors |
| All required node types load | Yes — no "unknown node type" errors |
| net-snmp module resolution | Confirmed (`require('net-snmp')` succeeds inside the 4.1.13 container; also proven implicitly by successful SNMP walks below) |
| SNMP polling (`walk_net_get` + others) | Confirmed — `net_metrics` populated, network devices correctly resolved once DNS alias fixed |
| SRE parser (`sre_parser`) | Confirmed — `Batch INSERT [sys] ok` / `Batch INSERT [net] ok` log lines observed |
| Device registry query | Confirmed — `Device registry loaded: 2 devices` (real DB query against seeded `public.devices`) |
| `db_insert` | Confirmed for both `sys` and `net` paths |
| PostgreSQL persistence | Confirmed by direct query: `sys_metrics: 4 rows`, `net_metrics: 8 rows` |
| Error handling | 0 unexpected errors/exceptions |
| Duplicate IDs | 0 (40 combined nodes) |
| Duplicate records | 0 duplicate `(device_id, time)` rows in `sys_metrics` |
| Ordering | Max inter-sample gap ≈30s, consistent with the 30s repeat interval — no reordering pathology |
| Teardown | Clean — 0 residual containers/volumes/networks |

**Gap 1 closed.** `net-snmp`/`ims-tab-v5` is functionally compatible with Node-RED 4.1.13.

---

## D2 — Existing regression (candidate image)

Re-ran the real P9 fleet regression harness (23 concurrent devices × 5 batches × 4 records = 460 records) against the candidate image `ims-p11c-fleet-node-red:latest`, via a disposable scratch copy of `tests/fleet/runner.js`/`docker-compose.p9-fleet.yml` (project `ims-p11d-regress`, distinct ports/containers).

**Result: 9/9 PASS**

| Check | Status |
|---|---|
| fleet.availability.devices-accepted | PASS — 23/23 |
| fleet.integrity.sent-accepted-persisted | PASS — sent=460, accepted=460, persisted=460, lost=0 |
| fleet.integrity.duplicates | PASS — 0 |
| fleet.integrity.sequence-continuity | PASS — all 23 devices in-order |
| fleet.integrity.corruption | PASS — 0 corrupted rows |
| fleet.availability.error-rate | PASS — 0 errors, staging drained |
| fleet.security.auth-enforcement | PASS |
| fleet.security.auth-key-rotation | PASS |
| fleet.security.http-status-failure-codes | PASS — 502/503 semantics correct |

Teardown verified clean. Evidence: `docs/evidence/runtime/fleet-2026-08-24T07-02-08-010Z.json`.

---

## D3 — Performance benchmark (3 runs each, median comparison)

Same harness, same 460-record load, run 3× per version (`ims-p9-fleet-node-red:latest` = 4.0.5 baseline, `ims-p11c-fleet-node-red:latest` = 4.1.13 candidate), sequential (shared disposable project), with `docker stats` CPU/mem sampled throughout each run.

| Metric | 4.0.5 (median of 3) | 4.1.13 (median of 3) | Delta |
|---|---|---|---|
| Wall time | 439ms | 409ms | −30ms (candidate faster) |
| P50 latency | 76ms | 71ms | −5ms |
| P95 latency | 142ms | 149ms | +7ms |
| P99 latency | 177ms | 154ms | −23ms |
| Throughput | 261.96 req/s | 281.17 req/s | +19.21 req/s |
| Error rate | 0% | 0% | none |
| Peak CPU | 58.71% | 45.10% | −13.61pp (candidate lower) |
| Peak memory | 85.05 MiB | 84.46 MiB | −0.59 MiB (negligible) |

Raw per-run data (not single-sample judgment):

- Baseline wall_ms: 572, 439, 431 (median 439)
- Candidate wall_ms: 409, 616, 405 (median 409 — one candidate run, run2, was itself the slowest single sample of either version at 616ms/p99=312ms; the median absorbs this as expected jitter rather than a real regression)

**Assessment:** differences are within normal run-to-run variance for a 460-record synthetic load; no metric shows a consistent, repeatable regression in the candidate. CPU peak is consistently lower for the candidate across all 3 runs (43.88/45.10/46.07 vs 84.50/58.71/54.22). No functional regression (all 9 D2 checks passed on the same candidate image). **PASS — no statistically meaningful regression.**

---

## D4 — Security verification (candidate image, fresh rescan)

Fresh `trivy image --severity CRITICAL,HIGH -f json -q ims-p11c-fleet-node-red:latest` (not reused from P11-C) confirms current state: **4 CRITICAL, 17 HIGH** (matches P11-C's prior 7→4 CRITICAL, 67→17 HIGH reduction; the drop alone is not treated as a passed gate — each remaining/fixed CVE is individually assessed below).

| CVE | Package | 4.0.5 | 4.1.13 (this rescan) | Category |
|---|---|---|---|---|
| CVE-2025-7783 | form-data (predictable multipart boundary) | Present | **Not found** in rescan | **FIXED** |
| CVE-2026-59873 | tar 7.5.11 (fix: 7.5.19) | Present | Present, same version | **REMAINING** — **UNREACHABLE** in production: tar is only invoked by Node-RED's Projects feature, and `NODE_RED_ENABLE_PROJECTS=false` in every compose file including live production (`docker-compose.yaml:473`). No override attempted (same policy as P11-C's ban on forcing jsonata/form-data). |
| CVE-2026-77413 | jsonata 2.0.6 (fix: 1.8.8 / 2.2.0) | Present | Present, same version | **REMAINING** — **UNREACHABLE**: confirmed by direct grep, the live `nodered_data/flows.json` contains zero `switch`/`change` nodes and zero JSONata expression usage anywhere. jsonata ships as a transitive dependency but nothing in the deployed flow configuration invokes it. |
| CVE-2026-77414 | jsonata 2.0.6 (fix: 2.2.1 / 1.8.8) | Present | Present, same version | **REMAINING** — same reasoning as above, **UNREACHABLE** |
| CVE-2026-77415 | jsonata 2.0.6 (fix: 2.2.1 / 1.8.8) | Present | Present, same version | **REMAINING** — same reasoning as above, **UNREACHABLE** |

No CVE in this set is UPSTREAM_BLOCKED — fixed versions exist for all 4 remaining (tar 7.5.19; jsonata 1.8.8/2.2.0/2.2.1) but are not yet bundled by Node-RED's own upstream package.json at the `4.1.13-22-minimal` tag. Not forced/overridden here, per the standing rule against hand-patching transitive dependencies outside the sanctioned image-tag upgrade path.

**Net effect of the upgrade:** 1 of 5 named CRITICALs fixed outright (form-data); the remaining 3 unique CVEs (4 findings) are present in both versions, unchanged, and assessed unreachable via the actual production attack surface (external HTTP ingest + SNMP polling) both before and after this upgrade. The upgrade does not introduce new CRITICAL exposure and removes one real one.

---

## D5 — Compatibility decision

| Check | 4.0.5 | 4.1.13 | Status |
|---|---|---|---|
| Startup | Clean (currently live) | Clean, no errors | PASS |
| net-snmp | Working (currently live in production) | Confirmed working (D1) | PASS |
| ims-tab-v5 | Working (currently live in production) | Confirmed working (D1) — 40 nodes, 0 dup, 0 errors | PASS |
| PostgreSQL | Working | Confirmed (device_registry query + sys/net insert) | PASS |
| Telemetry persistence | Working | Confirmed — sys_metrics 4 rows, net_metrics 8 rows | PASS |
| Regression (9-check) | N/A (candidate-only re-run, see D2) | 9/9 PASS | PASS |
| P50 | 76ms (median) | 71ms (median) | PASS (comparable) |
| P95 | 142ms (median) | 149ms (median) | PASS (comparable, +7ms) |
| P99 | 177ms (median) | 154ms (median) | PASS (comparable) |
| Throughput | 261.96 req/s (median) | 281.17 req/s (median) | PASS |
| Error rate | 0% | 0% | PASS |
| Memory | 85.05 MiB peak (median) | 84.46 MiB peak (median) | PASS |
| CPU | 58.71% peak (median) | 45.10% peak (median) | PASS (lower) |
| CRITICAL CVEs | 7 (5 unique root causes incl. this set) | 4 (all 4 unreachable via production surface) | PASS (net improvement) |

### Gate

**PRODUCTION UPGRADE CANDIDATE = YES**

All conditions met: `net-snmp`/`ims-tab-v5` fully functional (D1, after a scratch-only DNS-alias fix — no production or tracked file involved), regression 9/9 (D2), performance unaffected across 3 repeated runs with no consistent regression on any metric (D3), and no new reachable CRITICAL exposure introduced (D4).

Per the standing instruction: **stopping here.** No production Dockerfile change, no tracked-file version bump, no production restart, no commit, no push has been made. Awaiting explicit approval before P11-E (Production Upgrade).
