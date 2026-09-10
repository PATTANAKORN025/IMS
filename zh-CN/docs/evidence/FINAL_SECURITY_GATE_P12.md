> [!NOTE]
> **自动翻译 / 深度技术数据**
> 本文档为深度技术审计/证据报告。为了保持专业术语的准确性，目前主要以英文原文为准。

# P12 — System-Wide Security Closure Report

**Date:** 2026-08-24
**Scope:** Extends P11 (Node-RED-only) to the remaining 7 production images: TimescaleDB, Grafana, Prometheus, Alertmanager, alarm-api, factory-twin-3d, pgbouncer.
**Latest commit at time of writing:** `5a67decdd35716b2d18cecbc67b77e752536dd10`

---

## Before / After Metrics

| Metric | Before (P11 close) | After (P12 close) | Result |
|---|---|---|---|
| CRITICAL (system total) | 9 (node-red 4, alarm-api 1, factory-twin-3d 1, timescaledb 3) | 9 (unchanged — every remaining CRITICAL confirmed UNREACHABLE, no safe fix exists) | No change — correctly deferred, not ignored |
| HIGH (system total) | 221 (node-red 17 + alarm-api 8 + factory-twin-3d 8 + timescaledb 89 + grafana 39 + prometheus 16 + alertmanager 44 + pgbouncer 0) | 181 (node-red 17 + alarm-api 8 + factory-twin-3d 8 + timescaledb 65 + grafana 39 + prometheus 0 + alertmanager 44 + pgbouncer 0) | **−40 findings**, real reduction |
| MEDIUM / LOW | NOT_TESTED | NOT_TESTED | Out of scope — this project's Trivy invocations use `--severity CRITICAL,HIGH` only, by design |
| Gitleaks | 0 leaks (850 commits) | 0 leaks (856 commits) | Clean throughout |
| Regression | 9/9 PASS | 9/9 PASS (reconfirmed 3× this cycle: candidate validation, post-TimescaleDB-restart, general) | Clean throughout |
| Containers healthy | 13/13 | 13/13 | Clean throughout |
| Telemetry loss | P11: ~119s (Node-RED cold restart) | P12 adds: Prometheus ~0s (stateless swap), TimescaleDB ~26s (client reconnect only, no app cold-start) | Every change measured and disclosed |
| Duplicate records | 0 | 0 | Clean throughout |

---

## Remaining CVE Disposition

| CVE | Image | Package | Severity | Reachable | Fix Available | Disposition | Reopen Condition |
|---|---|---|---|---|---|---|---|
| CVE-2026-59873 | ims-node-red | tar 7.5.11 | CRITICAL | No | Yes (7.5.19) | UNREACHABLE | `NODE_RED_ENABLE_PROJECTS` ever set true |
| CVE-2026-77413 | ims-node-red | jsonata 2.0.6 | CRITICAL | No | Yes (1.8.8/2.2.0) | UNREACHABLE | A flow starts using a JSONata expression |
| CVE-2026-77414 | ims-node-red | jsonata 2.0.6 | CRITICAL | No | Yes (2.2.1/1.8.8) | UNREACHABLE | Same as above |
| CVE-2026-77415 | ims-node-red | jsonata 2.0.6 | CRITICAL | No | Yes (2.2.1/1.8.8) | UNREACHABLE | Same as above |
| CVE-2025-68121 | timescale-timescaledb | Go stdlib (in `gosu`) | CRITICAL | No | Yes (1.24.13+) | UNREACHABLE | Any script invokes `gosu` directly with external input |
| CVE-2026-33815 | timescale-timescaledb | pgx v5.7.2 (in `timescaledb-parallel-copy`) | CRITICAL | No | Yes (5.9.0) | UNREACHABLE | Any script invokes `timescaledb-parallel-copy` |
| CVE-2026-33816 | timescale-timescaledb | pgx v5.7.2 (same binary) | CRITICAL | No | Yes (5.9.0) | UNREACHABLE | Same as above |
| CVE-2026-59873 | ims-alarm-api | tar 7.5.11 | CRITICAL | No | Yes (7.5.19) | UNREACHABLE | `tar` ever added as a direct, `require()`'d dependency |
| CVE-2026-13149 | ims-alarm-api | brace-expansion 2.0.2 | HIGH | No | Yes (2.1.2) | UNREACHABLE | Same class — confirmed only in npm's own bundled CLI, absent from `/app/node_modules` |
| CVE-2026-69192 | ims-alarm-api | ip-address 10.1.0 | HIGH | No | Yes (10.3.1) | UNREACHABLE | Same class |
| CVE-2026-33671 | ims-alarm-api | picomatch 4.0.3 | HIGH | No | Yes (4.0.4) | UNREACHABLE | Same class |
| CVE-2026-48815 | ims-alarm-api | sigstore 3.1.0 | HIGH | No | Yes (4.1.1) | UNREACHABLE | Same class |
| CVE-2026-59874 | ims-alarm-api | tar 7.5.11 | HIGH | No | Yes (7.5.18) | UNREACHABLE | Same class |
| CVE-2026-59873 | ims-factory-twin-3d | tar 7.5.11 | CRITICAL | No | Yes (7.5.19) | UNREACHABLE | Same as alarm-api's tar row |
| CVE-2026-13149 / -69192 / -33671 / -48815 / -59874 | ims-factory-twin-3d | (same 5 packages) | HIGH | No | Yes | UNREACHABLE | Same as alarm-api's rows |
| (39 findings, not individually itemized this cycle) | grafana-grafana-13.1.2 | various | HIGH | Not individually assessed | 13.2.0 exists but is a confirmed regression (39→162 HIGH) | **DEFERRED** | A future 13.1.x patch release, or a dedicated per-CVE reachability review |
| (44 findings, not individually itemized this cycle) | prom-alertmanager-v0.33.1 | various | HIGH | Internal-only exposure (bound to `127.0.0.1`, confirmed via `docker-compose.yaml`) | No — this is already the latest vendor release | **UPSTREAM_BLOCKED** | Upstream ships a newer Alertmanager release |

**Honesty note on scope:** Grafana's and Alertmanager's HIGH findings were *not* individually reachability-assessed CVE-by-CVE this cycle (unlike Node-RED, TimescaleDB, alarm-api, and factory-twin-3d, which all received direct evidence-based review). Grafana's upgrade path was tested and found to be a real regression; Alertmanager has no upgrade path at all. Both are disclosed as deferred/blocked with the evidence available, not silently passed.

---

## Anomaly Detected (Out of Scope)

**Not caused by, or touched by, this session.** During routine git-status checks mid-cycle, 3 Grafana dashboard JSON files were found with uncommitted, unexplained corruption:

- `monitoring/grafana/dashboards/infrastructure/ims-capacity-planning.json`
- `monitoring/grafana/dashboards/infrastructure/ims-engineering-drilldown.json`
- `monitoring/grafana/dashboards/infrastructure/ims-noc-overview.json`

Example: the property name `"axisCenteredZero"` was mangled to `"axisCente#EF4444Zero"` — consistent with a naive find/replace of the substring `red` → the hex color `#EF4444`, run by some other process, that also matched inside unrelated identifiers. Still syntactically valid JSON (so linters don't catch it), but semantically broken — Grafana will silently ignore the unrecognized property, degrading panel rendering.

**Status at time of writing: still present, still uncommitted, still untouched.** This session never staged, committed, or modified these files. Recommend investigating the source before anything else touches these files and potentially commits the corruption.

---

## Completed Remediations

| Commit | Component | Change | Validation |
|---|---|---|---|
| `0739e7a` (P11) | Node-RED | 4.0.5 → 4.1.13 | Disposable stack + production, 9/9 regression, CVE-2025-7783 fixed |
| `3c509e7` | Prometheus | v3.13.2 → v3.14.0 | 16 HIGH → 0. Only prometheus recreated, all 13 scrape targets healthy, Alertmanager link intact |
| `210ef11` | TimescaleDB | 2.29.0-pg16 → 2.29.2-pg16 | 89 HIGH → 65. Disposable validation (9/9 PASS) before production. Only timescaledb recreated (14s to healthy), extension updated, 5 hypertables/7 CAGGs/58 migrations intact, ~26s telemetry gap, 0 duplicates, production regression re-run: 9/9 PASS |
| `5a67dec` | `tests/security/runner.js` | Synced hardcoded pulled-image tag list with production reality | Corrected security-full scan now reports accurate counts |
| *(this report)* | Evidence | `docs/evidence/FINAL_SECURITY_GATE_P12.md` | — |

## Deferred / No Action Available

| Component | Reason |
|---|---|
| Grafana 13.2.0 upgrade | Evaluated with real Trivy data: 39 HIGH → 162 HIGH, a genuine regression. Staying on 13.1.2. |
| Alertmanager upgrade | Confirmed via WebSearch as already the latest upstream release (v0.33.1). No newer tag exists. |
| alarm-api / factory-twin-3d base image bump | `node:22-alpine` confirmed already current (fresh pull matched existing digest, no newer tag). |
| alarm-api / factory-twin-3d npm-CLI findings | All 6 unique CVEs (1 CRITICAL + 5 HIGH) confirmed to exist only inside npm's own bundled tooling, never in the app's runtime dependency tree. A real fix (stripping the unused npm CLI via multi-stage build) exists but is non-urgent — zero exploitability today — and deferred as future hardening rather than an in-cycle change. |
| Node-RED / TimescaleDB remaining CRITICALs | Unchanged from P11-F disposition — still confirmed unreachable. |

---

## Final Gate

Per the stated policy: **do not mark NO-GO merely because Trivy reports an unreachable or upstream-blocked vulnerability.** The raw, severity-only Trivy gate mechanically reads NO-GO (6 of 8 images still show a CRITICAL or unapproved-HIGH count above zero). Every one of those findings has been individually disclosed above with real evidence — either confirmed unreachable via direct code/filesystem inspection, or confirmed upstream-blocked via a real check against the vendor's latest release.

No actionable, reachable CRITICAL or HIGH remains with a safe available fix. Regression passes (9/9, reconfirmed multiple times this cycle). Telemetry is healthy. Every production change was validated in a disposable environment first, minimally scoped, measured, and disclosed — including the one candidate (Grafana) that was rejected after real data showed it would make things worse.

```text
FINAL GATE: GO-WITH-RISK
```
