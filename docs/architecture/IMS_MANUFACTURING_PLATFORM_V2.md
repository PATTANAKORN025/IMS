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

- 10 Grafana dashboards, all provisioned into a single flat `IMS` folder (`monitoring/grafana/provisioning/dashboards/*.yml`, `foldersFromFilesStructure: false`). No dashboard sets `tags`. No sub-folder structure exists.
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
- **Infrastructure set (5):** NOC Overview, AIOps & Capacity Forecast, Engineering Drill-Down, Meta-Monitoring, Fleet at a Glance.
- **Manufacturing set (5):** LDI Manufacturing, LDI Operator Andon, LDI Engineering Analytics, LDI Machine Snapshot, LDI Data Readiness.
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

- Extend `.github/CODEOWNERS` with domain-scoped path entries (still `@PATTANAKORN025` as owner today — single-person repo — but the *paths* are split so a future second owner has a real boundary to take over, not a flat wildcard):
  - `/monitoring/grafana/dashboards/ims-ldi-*` , `/monitoring/grafana/dashboards/ldi-data-readiness.json`, `/nodered_data/flows/ldi_*` → Manufacturing domain
  - `/monitoring/grafana/dashboards/ims-noc-*`, `ims-capacity-planning.json`, `ims-engineering-drilldown.json`, `ims-meta-monitoring.json`, `ims-easy-overview.json`, `/nodered_data/flows/ingestion.json` → Infrastructure domain
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
