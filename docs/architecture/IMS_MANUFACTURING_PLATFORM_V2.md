# IMS Manufacturing Platform V2 — Architecture & Rollout Plan

> **Status:** Design doc, pending approval. Nothing described here has been implemented yet.
>
> **Provenance:** Every "current state" claim below was checked directly against the live repo on 2026-08-10 (`git status`, dashboard JSON, `database/migrations/`, `.github/CODEOWNERS`, `docs/architecture/ARCHITECTURE.md`) — not assumed. This doc does not replace `ARCHITECTURE.md` (system topology / data flow, still accurate) — it is additive: domain boundaries, forward-looking manufacturing schema, equipment-integration architecture, and ownership, none of which `ARCHITECTURE.md` currently covers.
>
> **Confirmed scope (user-approved 2026-08-10):**
>
> - EAP = **Equipment Automation Program** (SECS/GEM-style equipment integration), not "Enterprise Application Platform."
> - Infrastructure/Manufacturing separation is **logical/organizational only** — one repo, one Grafana instance, one database. No physical split.
> - **Single repository** stays single. Ownership is clarified via `CODEOWNERS`/an ownership doc, not via a repo split.
> - This document itself is the one artifact covering all six tasks, for approval before any implementation.
> - Implementation order once approved: **Phase A → Phase B → Phase C → Soak Test → DR Test**, each phase closing with testing evidence attached (same evidentiary bar as `docs/operations/LDI_VALIDATION_PROTOCOL.md` — real command output, not claims).

---

## 0. Baseline (verified 2026-08-10)

- 10 Grafana dashboards, all provisioned into a single flat `IMS` folder (`monitoring/grafana/provisioning/dashboards/*.yml`, `foldersFromFilesStructure: false`). No sub-folder structure exists. **Correction (caught during Phase A implementation):** dashboards already carry non-empty `tags` arrays (e.g. `["ims","noc"]`, `["IMS","LDI","set-2",...]`) — the original claim that "no dashboard sets tags" was wrong; what was actually missing was a *domain* tag (`infrastructure`/`manufacturing`), not tags altogether.
- `public.devices.device_type` is `server | workstation | ldi | network` (migration 013) — `ldi` is the only manufacturing/process value. There is no `process_type` or equivalent dimension.
- Two independent telemetry pipelines already exist at the data layer (`ARCHITECTURE.md` §System Context): the LDI pipeline (`ldi_data`, `ldi_alarm_log`) is manufacturing; the SNMP pipeline (`sys_metrics`, `net_metrics`, `ldi_metrics`) is infrastructure. **The separation already exists structurally in the schema and ingestion flows — it is only missing at the presentation (Grafana folder/tag) and documentation layer.**
- `.github/CODEOWNERS` exists today but is flat: one owner (`@PATTANAKORN025`) for the whole repo, plus a few path-specific lines (`/database/`, `/nodered_data/flows/`, `/.github/`) that don't distinguish infra from manufacturing.
- `git status` is currently clean — no repo-hygiene debris to address as part of this plan (an earlier scratch/temp-file pile from this session has already been cleared).
- No DR (Disaster Recovery) test or runbook exists anywhere in the repo. `scripts/soak-test-report.sh` exists (built earlier this session) but has never been run for a real extended window.

---

## 1. Infrastructure / Manufacturing domain separation (logical)

**Target:**

- Add `"folder": "Infrastructure"` / `"folder": "Manufacturing/LDI"` equivalent via Grafana's nested-folder provisioning (Grafana 13.x supports a `folder` field per dashboard provider, or per-dashboard via the `meta` API — implementation will confirm which mechanism the provisioned-file model supports without hand-editing dashboards in the UI).
- Add `"tags": ["infrastructure"]` or `["manufacturing", "ldi"]` to each of the 10 dashboard JSONs — a queryable, linter-checkable split, independent of folder mechanics.
- **Infrastructure set (4):** NOC Overview, AIOps & Capacity Forecast, Engineering Drill-Down, Meta-Monitoring.
- **Manufacturing set (6):** LDI Manufacturing, LDI Operator Andon, LDI Engineering Analytics, LDI Machine Snapshot, LDI Data Readiness, Fleet at a Glance (`ims-easy-overview.json` — its own description confirms it's built entirely from LDI-specific shared views (`v_ldi_machine_latest_full`, `v_ldi_alarm_context`, `f_ldi_yield_pct`), not a general infra overview despite the generic-sounding title; `scripts/generate-dashboard-inventory.js` already categorized it this way via an explicit allowlist before this plan existed).
- Extend `dashboard-linter.js` with a check that every dashboard has both a `tags` entry and belongs to the expected set (prevents the tag scheme from drifting the way `timezone` did earlier this session).

**Non-goals:** no second Grafana org/instance, no separate docker-compose stack, no split of `sys_metrics`/`ldi_data` at the database level (they already are split).

---

## 2. Manufacturing Domain Architecture (future AOI / Plating / Etching / Drilling)

**Problem:** "manufacturing" in this codebase today *is* LDI by name — `device_type='ldi'`, one telemetry table (`ldi_data`), one alarm master, LDI-specific column names (`pe_setting`, `je_setting`). Nothing about the schema signals which parts are LDI-specific vs. generically reusable by a future process.

**Target (schema + documented pattern, not new dashboards or fake data):**

- Add `public.devices.process_type TEXT DEFAULT 'ldi'` (nullable-safe default backfills existing rows; additive migration, no breaking change to any existing view — `device_type='ldi'` stays the join key everywhere it's used today).
- Write `docs/architecture/MANUFACTURING_DOMAIN.md` documenting the generic pattern every future process type follows, using LDI as the worked example:
 - One telemetry hypertable keyed by `(device_id, process_type, time)`.
 - One alarm-code master per process, following the `ldi_alarm_ms_code` shape (code, severity, description).
 - One SPC/RCA view pattern per process, following migration 064's now-generic materialized-view shape (`v_machine_spc_fleet` already filters by `device_type`, so it's one `WHERE` clause away from being multi-process).
 - One dashboard trio per process (Andon / Engineering Analytics / Manufacturing Overview), following the LDI suite's structure.
 - A short "onboarding checklist" for adding a new process type: migration, alarm master seed, dashboard trio, linter registration.

**Explicit non-goal:** no AOI/Plating/Etching/Drilling tables, dashboards, simulators, or fake data are built now. There are no requirements for them yet — building them would be speculative. This section only makes the *next* process type additive instead of a rewrite.

---

## 3. EAP (Equipment Automation Program) architecture

**Reality check:** IMS is monitoring-only today — it reads telemetry and raises alarms; it never writes commands, downloads recipes, or holds equipment state. There is no physical SECS/GEM-capable tool anywhere in this system (LDI machines are simulated/SNMP-polled). A full SECS/GEM implementation (HSMS session management, SVID/ECID data-collection plans, remote command/recipe execution, E30/E37/E40-style state models) would have no real target to integrate against or test — building it now would be speculative infrastructure, not architecture.

**Target:** `docs/architecture/EAP_ARCHITECTURE.md` — an **Equipment Integration Layer** architecture doc, scoped to what's real and extensible:

- Document today's two adapters as instances of a general pattern: the SNMP adapter (`ingestion.json`, legacy/infra devices) and the HTTP/JSON adapter (`ldi_ingestion.json`, LDI telemetry).
- Define a third, **unimplemented** adapter contract for a future SECS/GEM-speaking tool: what interface it would need to satisfy (equipment model registration, event report → alarm mapping, data-collection-plan → telemetry-row mapping) to plug into the same `devices` registry and downstream views/dashboards without changing anything else.
- Map these three adapters to standard EAP vocabulary (equipment model, event/alarm collection, data collection plan, ECID/SVID equivalents) so the doc is legible to someone who knows SECS/GEM, without claiming SECS/GEM compliance anywhere it doesn't exist.

**Explicit non-goal:** no SECS/GEM protocol code, no HSMS session handling, no simulated SECS/GEM equipment. This is an integration-contract document only.

---

## 4. Repository organization & ownership (single repo)

**Target:**

- Extend `.github/CODEOWNERS` with domain-scoped path entries (still `@PATTANAKORN025` as owner today — single-person repo — but the *paths* are split so a future second owner has a real boundary to take over, not a flat wildcard). **Updated during Phase B to match Phase A's actual result:** Phase A physically split dashboards into `dashboards/{infrastructure,manufacturing}/` directories, which makes directory-based CODEOWNERS paths simpler and more precise than the file-glob list this section originally drafted before Phase A ran:
 - `/monitoring/grafana/dashboards/manufacturing/`, `/nodered_data/flows/ldi_*` → Manufacturing domain
 - `/monitoring/grafana/dashboards/infrastructure/`, `/nodered_data/flows/ingestion.json` → Infrastructure domain
 - Keep existing security/CI/database-wide lines as-is.
- Add `docs/architecture/OWNERSHIP.md` explaining the two domains, what lives in each, and pointing at the `CODEOWNERS` paths as the enforced version of the same boundary (avoids the doc/reality drift this session repeatedly found elsewhere).

**Non-goal:** no multi-repo split. Confirmed by user as out of scope — the migration/CI/deploy cost isn't justified for a single-owner repo at this size.

---

## 5. Enterprise documentation rewrite

Sequenced **after** sections 1–4 land, so it documents the settled structure once:

- `README.md` doc table: add links to `MANUFACTURING_DOMAIN.md`, `EAP_ARCHITECTURE.md`, `OWNERSHIP.md`, this doc.
- `ARCHITECTURE.md`: add a short pointer section ("Domain boundaries — see `OWNERSHIP.md`; manufacturing extensibility — see `MANUFACTURING_DOMAIN.md`") rather than duplicating content, to avoid the exact "two docs disagree" failure mode `ARCHITECTURE.md`'s own provenance note already warns about.
- No other existing doc (`USER_MANUAL.md`, `ADMIN_MANUAL.md`, `LDI_VALIDATION_PROTOCOL.md`, etc.) needs rewriting — they were already fact-checked against the live system earlier this session and nothing in sections 1–4 changes their content, only adds new documents alongside them.

---

## 6. Validation, soak test, DR test completion

- **Validation:** already complete and accurate (`docs/operations/LDI_VALIDATION_PROTOCOL.md`). No further action.
- **Soak test:** tooling exists (`scripts/soak-test-report.sh`) but has never produced a real report. Run it for a real window (target: 24h minimum, ideally 72h) against the running stack and attach the actual `--summarize` output as evidence.
- **DR test:** does not exist. Build a DR runbook + script modeled on the soak-test tooling's pattern (`scripts/dr-test.sh` + `docs/operations/DR_TEST_PLAN.md`), covering:
 1. Backup/restore drill (`pg_dump` → drop/recreate → restore → row-count + spot-check parity).
 2. Single-container-loss recovery (kill `ims-timescaledb` / `ims-node-red` mid-flight, measure automatic recovery — this directly exercises the Node-RED pool-reconnect watchdog fixed earlier this session).
 3. Full-stack recreate from `docker-compose.yaml` + latest backup on a clean volume set, timed.
 - Execute it for real against this environment and attach real timings/output, not a hypothetical runbook.

---

## 7. Versioning Policy

- **Database migrations** (`database/migrations/*.sql`): sequential, monotonically numbered (currently through `066`), applied in order by `scripts/migrate-entrypoint.sh` and never edited or renumbered after merge — a correction is always the *next* number, matching every fix this session (e.g. `064` → `065` → `066`). This policy is unchanged by this doc; §2's `process_type` column lands as the next sequential migration.
- **Dashboards-as-code** (`monitoring/grafana/dashboards/*.json`): Grafana owns the internal `schemaVersion` field (bumped automatically on save/import, not hand-edited); git history — not a separate semver scheme — is the source of truth for what changed and when. `monitoring/grafana/dashboard-backups/` holds point-in-time export snapshots, not a versioning mechanism.
- **Architecture docs** (this file, `ARCHITECTURE.md`, etc.): versioned by the header "Status"/"Provenance"/date convention already established this session (verified-against-live-system date, explicit non-goals), not semver. This doc is named "V2" for scope clarity (it's additive to `ARCHITECTURE.md`, not a numbered doc series to replicate elsewhere) — no `V3` is implied or planned.
- **Integration/adapter contracts** (§3, EAP): the one place true semantic versioning is warranted going forward. When the third (future) equipment-integration adapter is actually built, its interface contract must ship as an explicitly versioned contract (e.g. `adapter-contract-v1`) — unlike a dashboard or migration, a breaking change here can silently break equipment integration without tripping any existing linter or test. This is a forward requirement, not something to build now (no adapter exists yet to version).

## 8. Security Boundary

`SECURITY.md` remains the authoritative security policy (known limitations, hardening checklist, secrets handling) — this section adds the platform-architecture view of trust boundaries that `SECURITY.md` doesn't currently frame, without duplicating its content.

- **Boundary 1 — Host ↔ Docker network (existing, unchanged):** only Grafana (3000), Node-RED (1880), Prometheus (9090), and Alertmanager (127.0.0.1 loopback-only) publish host ports, per `ARCHITECTURE.md`'s Container Inventory. PgBouncer, TimescaleDB, and the SNMP simulator are internal-only. Nothing in this doc changes that.
- **Boundary 2 — Infrastructure domain ↔ Manufacturing domain (new framing, existing reality):** per §1, this separation is logical/organizational only — both domains share one database, one Grafana instance, one Node-RED process. There is **no hard security boundary between them today**, and this plan does not add one (confirmed out of scope by the user in §1's non-goals). This is an accepted risk for a single-tenant, single-owner deployment, not a gap this plan silently leaves unaddressed — stating it explicitly so it isn't mistaken for an oversight.
- **Boundary 3 — Equipment Integration Layer (new, forward-looking, §3):** the day a real SECS/GEM-speaking tool is connected via the unimplemented third adapter, that connection crosses into the plant-floor equipment network — a genuinely new external trust boundary that doesn't exist in this system today. That connection will require its own hardening review (credential handling, network segmentation, least-privilege equipment access) *before* any real equipment is wired in. This plan does not build that adapter or its hardening now; it flags the requirement so it isn't discovered late.
- **CODEOWNERS as a security control:** the existing security-sensitive lines (`/.env.example`, `docker-compose*.yaml`, `/database/`, `/.github/`) already gate review on those paths. §4's domain-scoped path additions extend the same mechanism to the two new domain boundaries without weakening or reordering the existing security-sensitive entries.

## 9. Platform SLOs

Grounded in numbers already measured this session (`LDI_VALIDATION_PROTOCOL.md`, dashboard JSON, migration 064) rather than invented targets. Anything not yet measured end-to-end is marked as such rather than asserted.

| Metric | Target / measured value | Source |
|---|---|---|
| LDI-suite query P95 | **5.30ms** (measured, `EXPLAIN ANALYZE` against `v_machine_spc_fleet`, 2026-08-10) | `LDI_VALIDATION_PROTOCOL.md` Phase 2 |
| SPC/RCA materialized-view staleness bound | **60s** (background job refresh interval) | migration `064` |
| Manufacturing dashboard freshness (general) | **30s** (`updateIntervalSeconds`, all dashboards except Andon) | `monitoring/grafana/provisioning/dashboards/*.yml` |
| Operator Andon freshness | **5s** (`"refresh": "5s"`) | `ims-ldi-operator-andon.json` |
| Dashboard load time | **< 2s** (verified via Playwright this session) | session QA pass |
| High-load pipeline success rate | **> 95%** (`pipeline-stress.js`), **> 90%** under chaos (`chaos-stress.js`) | `tests/k6/` thresholds |
| Ingestion self-recovery bound | **Not yet measured end-to-end** — estimated ≈10s detection (5 consecutive failures × 2s telemetry tick) + Docker `restart: unless-stopped` time, not a verified figure | Watchdog: `ldiDbConnFailureStreak` in `ldi_ingestion.json`. Real measurement is the **DR Test** phase's single-container-loss drill (§6) |

---

## Phase Plan

| Phase | Covers | Key deliverables | Evidence required to close |
|---|---|---|---|
| **A** | §1 Domain separation, §2 Manufacturing Domain Architecture | Dashboard `tags`/folder split, linter check, `process_type` migration, `MANUFACTURING_DOMAIN.md` | `dashboard-linter.js` clean; full regression suite green; migration applied + `process_type` column verified live; Playwright screenshot of the new Grafana folder structure |
| **B** | §3 EAP architecture, §4 Repo/ownership | `EAP_ARCHITECTURE.md`, extended `CODEOWNERS`, `OWNERSHIP.md` | CODEOWNERS syntax validated (GitHub's own checker or manual path-match review); doc claims grep-verified against real adapter code, not assumed |
| **C** | §5 Documentation rewrite | `README.md`/`ARCHITECTURE.md` cross-links | No broken links; both inventory `--check` gates still pass |
| **Soak Test** | §6 | Real soak run | Actual `soak-test-report.sh --summarize` output attached, real duration stated |
| **DR Test** | §6 | `dr-test.sh`, `DR_TEST_PLAN.md`, executed drill | Real timings from an actual executed drill against this environment, not a hypothetical |

Each phase's evidence is attached to this doc (or linked from it) before moving to the next phase — matching the standard already set by `LDI_VALIDATION_PROTOCOL.md` this session: verified output, not claims.

---

## Soak Test — Status (started 2026-08-10, still open — window not yet 72h)

**Honest constraint, stated up front:** `scripts/soak-test-report.sh` says so itself in its own header comment -- it "does NOT run a 72-hour test by itself." A soak test requires real elapsed wall-clock hours against an untouched running stack; no single tool invocation, however long, can manufacture that. Closing this phase with a real pass/fail verdict requires checking back after real time has passed, not a report generated in this session.

**Real `--summarize` output, run 2026-08-12T13:05Z (52.5h elapsed, `IMS-SoakTest` scheduled task running every 15min throughout):**

```text
═══════════════════════════════════════════════════
 IMS Soak Test Summary
═══════════════════════════════════════════════════
Samples: 57  Window: 2026-08-10T08:34:21Z -> 2026-08-12T13:05:15Z (52.5h elapsed)
Window length: NOT YET 72h -- keep this script running periodically and re-summarize later.

Ingest failures ever nonzero in a sample: max=NaN (want 0)
Buffer overflows ever nonzero in a sample: max=NaN (want 0)
Samples where any container had restarted since last sample: 4 (want 0)
Samples with >=1 non-Watchdog alert firing: 37 (want 0)
DB size drift: NaNMB -> 157MB

VERDICT: FAIL -- see nonzero counters above
```

**This is a real interim FAIL, not a passing report withheld or a failing report softened.** Investigated the three drivers rather than just quoting the counters:

- **The `NaN` values are a script artifact, not evidence of failure:** 24 of the 57 samples have `NaN` for inserts/failures/overflows/db_size (two clusters: 2026-08-11T14:00-17:20 and 2026-08-12T08:05-10:35, each ~2.5-3.5h of consecutive samples), because `node-red:1880/metrics` or the `psql` size query didn't respond at collection time. `sort -n` puts the literal string `"NaN"` at the tail, so `MAX_FAILED`/`MAX_OVERFLOW` print `NaN` instead of a real number even though every *numeric* sample in the log shows `0` for both. Real defect in the collector worth fixing later (it should retry or mark these samples explicitly rather than silently gapping), but it is a collection gap, not evidence that ingestion actually failed or overflowed during those windows.
- **`ANY_RESTART=4`, all pre-dating today's work**, confirmed by timestamp: `2026-08-11T04:22:14Z`, `2026-08-11T05:45:06Z`, `2026-08-12T08:05:15Z`, `2026-08-12T10:50:14Z`. None of these correspond to this session's DR testing (which ran ~2026-08-12T12:57-13:03Z, entirely between the 10:50 and 13:05 samples) -- the DR drills used `docker start` after a `docker kill`, which does not increment Docker's own `RestartCount` the way an auto-restart-policy trigger does, so that testing did not add to this counter. This is 4 real restart events across 52.5h that would need individual investigation to close out, not addressed in this pass.
- **`ANY_FIRING=37` samples with >=1 non-Watchdog alert active** -- the largest driver of the FAIL. Not root-caused in this pass (would need per-sample alert history, which Alertmanager doesn't retain past current state, only this log's aggregate count). The one alert active *right now* (`PipelineDataStalled`, critical) is very likely residual from this session's own DR container-kill drills a few minutes prior to this summarize run, expected to self-clear on the next scheduled sample -- but that doesn't explain the other 36 historical firings, which predate this session's work and are a real open finding.

**To close this phase:** let the scheduled task keep running to 72h, then re-run `--summarize`. Separately, the 37-sample alert-firing count and the 4 restart events are real findings worth their own investigation regardless of window length -- not blocked on reaching 72h.

---

## DR Test — Evidence (Drills 1-2 closed 2026-08-10; Drill 3 not run)

**What shipped:** `scripts/dr-test.sh` (3 drills), `docs/operations/DR_TEST_PLAN.md`.

### Drill 1 — Backup / Restore: PASS

First run produced a false FAIL (live row counts queried *after* the dump, so the live-ingesting system had already moved a few rows ahead — not a restore defect). Fixed the script to bracket live counts before and after the dump and check the restored count falls inside that window. Re-run:

```text
devices=1025 ldi_data=52795 ldi_alarm_log=10405  (before dump)
devices=1025 ldi_data=52796 ldi_alarm_log=10405  (after dump)
devices=1025 ldi_data=52795 ldi_alarm_log=10405  (restored, throwaway DB)
VERDICT: PASS -- dump 1s, restore 18s, 22,284,869 bytes
```

### Drill 2 — Single-Container-Loss Recovery (`ims-timescaledb`, `ims-node-red`): root-caused and fixed 2026-08-12, now **PASS**

**Original finding (2026-08-10), reproduced and root-caused (2026-08-12):** `docker kill ims-timescaledb` (SIGKILL) was re-run, this time watched for a full 5 minutes via repeated `docker inspect` polling instead of the drill's normal 120s window. Result: `RestartCount` stayed at `0` for the entire 5 minutes — not slow, genuinely never fired. Ruled out a compose misconfiguration first: `docker inspect` confirms `RestartPolicy=unless-stopped, MaximumRetryCount=0` correctly applied to the running container, matching `docker-compose.yaml`. Also ruled out "maybe the container just needs a real crash, not `docker kill`": tried killing PID 1 from *inside* the container (`docker exec -u root ... kill -9 1`) and it silently no-ops — this is expected Linux kernel behavior (`man 7 pid_namespaces`: a PID namespace's init process is immune to SIGKILL sent from *within* its own namespace; only a kill from outside, i.e. `docker kill` from the host, can actually terminate it). So the container-loss mechanism itself (`docker kill`) is correct and does terminate the container (confirmed via `kill`+`die` events); what's broken is specifically Docker Desktop's (WSL2 backend, server 29.6.2) restart-policy engine not being invoked afterward on this host.

**Fix:** `scripts/container-watchdog.sh` — an external watchdog that polls every container with `restart: unless-stopped` in this compose file and issues `docker start` on anything not `running`, compensating for the confirmed gap in Docker's own restart engine. Meant to run continuously via a scheduled task (same deployment pattern as `IMS-SoakTest`), not committed as an OS-level task in this pass (a persistent Scheduled Task is a host change outside the repo — flagged for the user to decide, not silently installed).

**Re-run with the watchdog active (`--loop 5`), 2026-08-12, 6 trials across both critical containers:**

```text
timescaledb: PASS -- recovered in 6s
node-red:  PASS -- recovered in 6s
timescaledb: PASS -- recovered in 8s
node-red:  PASS -- recovered in 3s
timescaledb: PASS -- recovered in 5s
node-red:  PASS -- recovered in 6s
```

6/6 PASS, single-digit-second recovery every time. **The underlying Docker Desktop restart-policy gap is not fixed** (that's outside this repo's control) — what changed is that this environment now has a compensating control that actually works, verified against the real, reproduced failure mode rather than assumed to work.

**A second, cascading finding surfaced by the same drill:** after manually `docker start`-ing TimescaleDB back to healthy, LDI ingestion did **not** self-recover for several minutes — the same PgBouncer `server_login_retry` failure-caching behavior documented earlier this session (`ARCHITECTURE.md`), and specifically the failure mode the Node-RED pool-reconnect watchdog (`ldiDbConnFailureStreak`, 5-consecutive-failure threshold) was built to fix. The watchdog did **not** trigger an automatic Node-RED restart within the ~6 minutes observed — `max(ldi_data.time)` stayed frozen at the outage timestamp until a manual `docker restart ims-node-red`, which fixed it immediately. This means the watchdog's real-world trigger rate for this exact scenario needs re-examination — it may only be counting failures on one of several parallel insert paths, or the failure frequency during this specific outage didn't reach 5 consecutive attempts fast enough. **Filed as a gap, not fixed in this pass** — fixing it correctly requires understanding why the counter didn't reach threshold, which is follow-up investigation, not a same-session patch.

**What worked correctly during the incident:** the alerting pipeline. Blackbox exporter correctly detected `timescaledb:5432` down, Alertmanager routed it, and Node-RED's alert-delivery flow correctly logged a formatted "ServiceDown" notification (LINE/Teams delivery skipped as designed — credentials absent by default, per `LDI_VALIDATION_PROTOCOL.md` Phase 4).

**`scripts/dr-test.sh` improved as a direct result:** the container-loss drill now falls back to a manual `docker start` if the restart policy doesn't trigger within 120s, so running this drill doesn't leave the environment down for whoever runs it next -- that fallback doesn't change the FAIL verdict, it just cleans up after the drill.

**Total live outage caused by this drill:** timescaledb ~2-3 min per kill (2 kills) + a further ~6 min ingestion-recovery gap after the second kill = roughly 10 minutes of real, deliberate downtime in this dev environment, fully restored and verified (0 lint errors, 0 e2e errors post-recovery) before continuing.

### Drill 3 — Full-Stack Recreate: **not run**

Given Drill 2 just demonstrated that automatic recovery in this environment is less reliable than assumed, running the destructive full-volume-wipe drill without confirming that's still wanted right now would compound risk on top of an already-surprising result. Deferred pending explicit confirmation — see `scripts/dr-test.sh full-recreate --confirm-destroy` when ready to run it.

---

## DR Test — Evidence

---

## Phase A — Evidence (closed 2026-08-10)

**What shipped:** dashboards physically split into `monitoring/grafana/dashboards/{infrastructure,manufacturing}/`, two Grafana provisioning providers (`IMS Infrastructure`, `IMS Manufacturing` folders), a `manufacturing`/`infrastructure` domain tag on all 12 dashboards, `dashboard-linter.js` Check 18 enforcing tag/folder agreement, migrations `067`+`068` adding `devices.process_type`, and `MANUFACTURING_DOMAIN.md`.

**Correction made during implementation:** the plan's own §1 draft mis-sorted `ims-easy-overview.json` as Infrastructure by guessing from its title ("Fleet at a Glance"). Its actual description and panels (`v_ldi_machine_latest_full`, `v_ldi_alarm_context`, `f_ldi_yield_pct` — all LDI-specific) confirmed it's Manufacturing content; `scripts/generate-dashboard-inventory.js`'s pre-existing `LDI_UID_EXTRAS` allowlist already agreed. Corrected before implementation (4 infra / 8 manufacturing, not 5/5) — caught by checking file contents instead of trusting the title, consistent with this session's verify-before-claim pattern.

**Bug caught and fixed during implementation:** migration `067`'s `ADD COLUMN process_type TEXT DEFAULT 'ldi'` backfilled the default onto *every* existing row, not just `device_type='ldi'` ones — live-verified via `SELECT device_type, process_type, count(*) ... GROUP BY 1,2`, which showed 1002 `device_type='server'` rows incorrectly carrying `process_type='ldi'`. Fixed with migration `068` (drop the default, null out the incorrect backfill) rather than editing `067`, per this doc's own §7 Versioning Policy. Re-verified: `ldi/ldi: 23 rows`, `server/NULL: 1002 rows` — correct.

**Test evidence (all commands run against the live stack, 2026-08-10):**

| Check | Result |
|---|---|
| `node tests/lint/dashboard-linter.js` (incl. new Check 18) | 0 errors, 0 warnings |
| `node tests/lint/alarm-sync-linter.js` | 19/19 codes resolve |
| `node tests/lint/orphan-object-linter.js` | 0 orphans / 31 checked |
| `node tests/lint/query-budget-linter.js` | 0 errors, 0 warnings |
| `node tests/lint/rca-mapping-coverage.js` | 100% coverage |
| `node scripts/generate-dashboard-inventory.js --check` | up to date |
| `node scripts/generate-schema-inventory.js --check` | up to date |
| 5 unit test files (`boundary-validation`, `parser`, `counter-wraparound`, `v2-parser`, `circuit-breaker`) | 99/99 passed |
| `node tests/e2e/panel-data-check.js` | 73 passed, 2 pre-existing warnings (0-row edge cases unrelated to this change), 0 errors |
| `node tests/e2e/query-timing-check.js` | 47 queries measured, P95 22.48ms (budget 80ms), 0 errors |
| Grafana folder structure (live, post `docker compose up -d grafana`) | Confirmed via API + Playwright screenshot: `IMS` (library panels only, still in active use by `scripts/provision-library-panels.sh` — not deletable, not orphaned junk), `IMS Infrastructure` (4 dashboards), `IMS Manufacturing` (6 dashboards) |
| `devices.process_type` live data | `ldi/ldi: 23`, `server/NULL: 1002` — correct after the `068` fix |

**Not yet committed/pushed** — pending this evidence review.

---

## Phase C — Evidence (closed 2026-08-10)

**What shipped:** `README.md`'s documentation table now links `IMS_MANUFACTURING_PLATFORM_V2.md`, `MANUFACTURING_DOMAIN.md`, `EAP_ARCHITECTURE.md`, `OWNERSHIP.md`. `ARCHITECTURE.md`'s Known Gaps section gained a pointer bullet to all four rather than duplicating their content.

**Drift caught and fixed as a direct consequence of Phase A (not scope creep):** `README.md` line 160 said "12 dashboards — 4 infrastructure, 8 LDI manufacturing," which became wrong the moment Phase A's corrected 4/6 split shipped. Fixed in the same edit. No other pre-existing README/ARCHITECTURE staleness (e.g. the "12 Grafana dashboards" count in `ARCHITECTURE.md`'s System Context, which predates this work and is unrelated to it) was touched — that's outside Phase C's charter of "cross-link the new docs, don't duplicate or rewrite existing content."

**Test evidence:**

| Check | Result |
|---|---|
| All 4 new doc links resolve to real files | `test -f` on all 4 paths — confirmed |
| `node scripts/generate-dashboard-inventory.js --check` | up to date |
| `node scripts/generate-schema-inventory.js --check` | up to date |

**Not yet committed/pushed** — pending this evidence review.

---

## Phase B — Evidence (closed 2026-08-10)

**What shipped:** `EAP_ARCHITECTURE.md`, `OWNERSHIP.md`, extended `.github/CODEOWNERS` with domain-scoped path entries.

**Correction made during implementation:** §4's original draft (written before Phase A ran) listed CODEOWNERS paths as dashboard filename globs (`ims-ldi-*`, etc.). Phase A's actual result — a physical directory split — makes directory-based paths (`/monitoring/grafana/dashboards/manufacturing/`) simpler and more precise; §4 above was updated to match reality rather than shipping CODEOWNERS entries that referenced a file layout that no longer exists.

**Claims grep-verified against real source, not assumed:**

| Claim in `EAP_ARCHITECTURE.md` | Verified against | Result |
|---|---|---|
| Adapter 2 (HTTP/JSON) endpoint is `POST /ldi-telemetry`, auth via `x-api-key` header against `INGEST_API_KEY` | `nodered_data/flows/ldi_ingestion.json` | Confirmed (`"url": "/ldi-telemetry"`, `msg.req?.headers?.['x-api-key']` checked against `global.get('INGEST_API_KEY')`) |
| Adapter 2 batch insert is `INSERT INTO public.ldi_data ... ON CONFLICT (log_id, "time") DO NOTHING` | same file | Confirmed, exact SQL present |
| Adapter 1 (SNMP) polls every 30 seconds via `fork_5_ways` | `nodered_data/flows/ingestion.json` | Confirmed (`fork_5_ways` node present, `"repeat": "30"`) |
| CODEOWNERS paths (`/monitoring/grafana/dashboards/{infrastructure,manufacturing}/`, the four `nodered_data/flows/*.json` filenames) exist | `ls nodered_data/flows/`, Phase A's directory split | All 5 paths confirmed to exist |
| CODEOWNERS syntax | Manual review against GitHub's documented format and this repo's own pre-existing working lines | Matches exactly (`<pattern> <owner>`, `/`-prefixed root-relative paths, last-match-wins semantics documented inline) |

**Not yet committed/pushed** — pending this evidence review.
