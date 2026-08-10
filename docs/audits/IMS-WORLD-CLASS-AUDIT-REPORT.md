# IMS — World-Class Full-System Audit Report
### Scope: everything not covered by the LDI-dashboard audit merged earlier this session · 2026-08-05

---

## Methodology

This audit follows directly on from `IMS-FULL-SYSTEM-AUDIT.md` (all 9 LDI Grafana dashboards, the Node-RED simulator/ingestion flows, and several DB views — audited, fixed, and merged to `main` in the prior pass of this session). Re-auditing that ground would be wasted effort, so this pass deliberately covers what that one didn't:

| Area | Covered by |
|---|---|
| Monitoring/infra stack configs (Prometheus, Alertmanager, Blackbox, SNMP sim, PgBouncer, Grafana provisioning/library panels) | Fork 1 |
| Node-RED alerting flow, CI/CD pipeline (beyond `ci.yml`), `scripts/` directory, `db-migrate` service | Fork 2 |
| Full database migration history (23 files), `postgres/init/`, and the `docs/` set | Fork 3 |

All three ran read-only in parallel, cross-checking file contents against live system state (`docker logs`, read-only `psql` queries, running-container inspection) rather than relying on static review alone — the same "layer C" principle (query results, not just syntax) that drove the previous audit's most valuable findings.

**This is an audit-only pass.** No code was changed, no commits were made, nothing was fixed. Everything below is a finding to triage, not a completed fix.

---

## 🔴 P0 — Critical

### P0-1 · A production alert rule is actively failing every evaluation cycle, right now

`ldi-machine-alarm-005` (provisioned via `monitoring/grafana/provisioning/alerting/ldi-rules.yml`) has no `ORDER BY time` in its query — required for Grafana's time-series dataframe conversion. Confirmed live in `docker logs ims-grafana`:

```
level=error msg="Failed to evaluate rule" ... error="...failed to convert long to wide series...not sorted in ascending order by time"
level=info msg="Sending alerts to local notifier" count=1
```

This repeats on every ~5-minute evaluation cycle. Worse: it appears to fire a notification on each evaluation *error*, not on a real machine condition — meaning this rule is currently generating alert noise unrelated to actual LDI machine state, on a schedule.

**Fix:** add `ORDER BY time` (or the equivalent bucketed ordering) to the rule's query.

### P0-2 · Three inconsistent migration-runner scripts — this is *why* schema_migrations drifted

Three separate scripts apply migrations, each tracking differently:

- `scripts/migrate.sh` (manual/local) — `schema_migrations(version, filename, applied_at, checksum)`.
- `scripts/migrate-entrypoint.sh` — **the actual auto-run path**: docker-compose's `db-migrate` service runs this, and `node-red` has `depends_on: db-migrate: condition: service_completed_successfully` (`docker-compose.yaml:396-400`). Same table, **no `checksum` column**.
- `scripts/init-migrations.sh` — no tracking table at all; blindly re-runs every `.sql` file on every invocation and treats any non-idempotent migration's second-run failure as a genuine "FAILED".

Whichever script creates `schema_migrations` first wins the table's actual shape (`CREATE TABLE IF NOT EXISTS` is a no-op after that). In the standard `docker compose up` flow, `migrate-entrypoint.sh` always runs first — so **every standard deployment's live `schema_migrations` table lacks a `checksum` column entirely**. This is the direct mechanical cause of the "pre-seeded checksum" tracking anomaly the previous audit pass found and worked around (migration 038): it wasn't a one-off seeding mistake, it's a structural consequence of having three scripts that don't agree on what "applied" means.

**Fix:** collapse to one canonical migration runner, used everywhere (manual, `db-migrate` service, and any future init path).

### P0-3 · The alerting pipeline currently delivers to no one (synthesized across both infra and flow audits)

Every configured alert-delivery channel is broken, each in a different way:

- **Slack** (`monitoring/alertmanager/alertmanager.yml`, `ims-slack-critical` receiver): webhook URL is still the literal placeholder `https://hooks.slack.com/services/YOUR/WEBHOOK/URL`.
- **LINE Messaging API / MS Teams** (`nodered_data/flows/alerting.json`, the receiving end of Alertmanager's real, correctly-wired webhook to `node-red:1880/alert-webhook`): both delivery functions are implemented correctly, but `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_USER_ID`, and `TEAMS_WEBHOOK_URL` are all present-but-empty in the live `.env`. Both functions `node.warn(...); return null;` on empty config — no crash, no error surfaced anywhere except the Node-RED debug sidebar, which nobody is watching in production.
- **`line_notify` receiver** (`alertmanager.yml`): targets LINE's Notify API, which LINE discontinued in 2025. Also never routed to by any actual route. Doubly dead.
- **`ims-deadman` receiver**: defined, never routed to (the Watchdog route points to `'null'` instead).

Individually these are P1-ish misconfigurations. Together they mean: **if something goes critically wrong in this system right now, no human receives a notification anywhere outside the Grafana UI itself.** That's the actual operational risk, and it's severe enough to call out as its own top-level finding rather than let it get lost as four separate medium-severity line items.

**Fix:** pick one real channel (Slack webhook is the most work-configured path — just needs a real URL), get it delivering end-to-end, and verify with a real test alert before considering this closed. Remove the dead LINE Notify / deadman leftovers.

---

## 🟠 P1 — High

### P1-1 · This session's own schema tuning is dead on arrival for fresh deployments

Migration 020 (this session's `DOUBLE PRECISION → REAL`, 1-day → 1-hour chunk interval tuning) and `postgres/init/001-init-timescaledb.sql` both `CREATE TABLE IF NOT EXISTS public.ldi_data`. `init/001` runs first on any fresh bootstrap and still has the pre-tuning definition — so migration 020 silently no-ops on every new deployment. Ironically, this is exactly the "keep init/ and migrations/ in sync" discipline that migrations 041/047 explicitly comment on and honor; 020 doesn't have that comment and isn't in sync.

**Fix:** apply the same column-type/chunk-interval change to `postgres/init/001-init-timescaledb.sql`.

### P1-2 · `docs/ARCHITECTURE.md` is severely stale and internally self-contradictory

- Claims "3-4 dashboards" three separate times; the live system has 9. The entire LDI manufacturing dashboard family (Manufacturing, Andon, Engineering Analytics & SPC, Machine Snapshot, Data Readiness) isn't mentioned anywhere.
- The file is **two different architecture docs concatenated** — line 159 starts a second, differently-styled "Detailed System Architecture" section with its own duplicate Mermaid diagram, duplicate alert-flow diagram, duplicate component table. Reads like an unresolved bad merge.
- Self-contradicts on SNMP polling interval: 10s in prose (line 48) vs 30s in the interval table (line 467) and walker table (lines 322-326).
- Describes LDI telemetry as arriving via an SNMP walker — it actually arrives via HTTP POST from `ldi_simulator.json` to `/ldi-telemetry`. Not SNMP at all.

**Fix:** this needs a rewrite, not a patch — recommend treating it as a from-scratch doc pass once the code-level fixes above land, so it doesn't immediately go stale again.

### P1-3 · `ldi_metrics.vibration`-based critical alert can structurally never fire

`ims-ldi-vibration-critical` (threshold `vibration > 12`) — `vibration` is exactly 0 for 100% of ~2,300 rows across all 10 LDI machines. Same root cause as the already-known `ldi_metrics.throughput`/`power_watt` gap the LDI-dashboard audit found (the k6-synthetic ingestion pipeline never populates these fields for LDI-class devices) — this extends that finding into alerting, not just dashboards. A "critical" alert that can never fire is worse than no alert: it creates false confidence that vibration is monitored.

### P1-4 · `ci-flows.yml` structurally cannot pass

Runs on every push/PR to `main`. It builds `flows.json` via `node scripts/build-flows.js` (2-space JSON indent) then `git diff --exit-code` against the committed `flows.json` (4-space indent, confirmed). This diff can never be clean regardless of content — every line's leading whitespace differs, before even considering the canvas-position (`x`/`y`/`g`) drift between per-tab source files and the live-edited `flows.json` that would also trigger it.

### P1-5 · Two divergent "merge flows.json" implementations; the README documents the one CI doesn't run

`scripts/build-flows.js` (has duplicate-ID validation, actually used by `ci-flows.yml`) vs `scripts/build-flows.sh` (`jq -s 'add'`, no validation) — `README.md` and `.agents/skills/deploy-node-red-flow/SKILL.md` both document `build-flows.sh` as canonical. Same "parallel drifting implementations of one operation" pattern as P0-2's migration runners — this looks like a recurring habit in this codebase worth naming explicitly, not just fixing case-by-case.

---

## 🟡 P2 — Medium

| # | Area | Finding |
|---|---|---|
| 1 | `postgres/init/003-grafana-password.sh` | Hardcoded fallback password `grafana_secure` for the `grafana_reader` DB role if `GRAFANA_DB_PASSWORD` isn't set — same anti-pattern already fixed this session in `nodered_data/settings.js`, not swept here. |
| 2 | `database/migrations/038-rename-ldi-metrics-columns.sql` | Non-idempotent `ALTER TABLE ... RENAME COLUMN` with no existence guard, unlike every other rename in this codebase (e.g. migration 013 wraps in `DO $$ ... IF EXISTS ...`). Directly connects to P0-2 — this is exactly the kind of migration that breaks under `init-migrations.sh`'s blind-rerun behavior. |
| 3 | `monitoring/grafana/provisioning/libraries/libraries.yml` | Library-panel provisioning is completely non-functional: the panel definition lives in `monitoring/grafana/library-panels/`, a directory never mounted into the Grafana container at all (confirmed inside the running container — only `libraries.yml` present). Zero current consumers either way. |
| 4 | Connection pool sizing | Node-RED's PG pool was widened to `max: 50` this session; Grafana's datasource adds `maxOpenConns: 20`; both share PgBouncer's single `DEFAULT_POOL_SIZE: 20`. Transaction-mode pooling softens this, but it's a capacity-planning mismatch worth revisiting under real load. |
| 5 | SNMP simulator coverage gap | The ingestion flow's "Walk Temperature" node branches to Juniper-specific OIDs for `device_type='network_switch'`, but no `.snmprec` file simulates any `2636`-prefixed OID. Currently dormant (no switch is registered) — a trap for whenever one is. |
| 6 | `verify-db-health.sh` | Checks `sys_metrics`/`net_metrics`/`ldi_metrics` and their hourly CAGGs — never checks `ldi_data` or its `_1m/_15m/_1h` tiers, the actual real-telemetry path every LDI Grafana dashboard depends on. A "database health check" blind to the primary data path. |
| 7 | `scripts/analyze_dashboard.py`, `fix_dashboard.py`, `fix_validate.py` | One-off historical patch scripts (hardcoded filenames, docstrings referencing a specific already-applied past fix set) living in the general-purpose `scripts/` directory. Re-running any against the current, much-changed dashboards would likely no-op at best. Misleads anyone assuming `scripts/` is all maintained, reusable tooling. |

---

## 🟢 P3 — Low

- Prometheus, Alertmanager, Blackbox exporter, SNMP simulator, and the Grafana renderer have no `healthcheck:` block (PgBouncer and Grafana itself do) — inconsistent within an observability stack, and blocks any future `depends_on: condition: service_healthy` gating on them.
- `contactpoints.yml` comment references a `flows-ubuntu.json` that doesn't exist (current file is `alerting.json`) — stale comment only, the actual webhook wiring is correct.
- `blackbox.yml`'s `dns_resolution` module is defined but never scraped by `prometheus.yml` — harmless orphan.
- Three similarly-named, non-cross-referenced audit reports now exist (`docs/IMS-audit-report-2026-08-04.md`, `docs/world-class-audit-report.md`, root `IMS-FULL-SYSTEM-AUDIT.md`) — confirmed genuinely different scope, not duplicates, but a reader can't tell which is current without opening all three.
- `database/migrations/archive/README.md` claims archived migrations were "permanently deleted"; the directory actually still contains 8 SQL files + 3 table dumps. Confirmed harmless (migrate.sh's glob is non-recursive, never picks these up) — just a misleading README.
- `database/migrations/013-normalized-schema.sql`'s header comment says "Migration 011" — leftover from a renumbering.
- Two independent numbering sequences (`database/migrations/032-*` and `postgres/init/032-*`) share the number "032" for unrelated objects — confusing when grepping by number.
- `scripts/migrate.sh` redirects stdout/stderr to `/dev/null` before checking the exit code on failure — operator sees "FAILED" with no visible reason.
- `k6-test.yml` creates `secrets/postgres_password.txt`/`secrets/grafana_admin_password.txt` that nothing in `docker-compose.yaml` ever references — dead leftover from a prior Docker-secrets design.
- `release.yml` installs 2 semantic-release plugins (`changelog`, `git`) that `package.json`'s `release.plugins` never lists; also installs `semantic-release` with `--no-save` and no version pin, ignoring the committed lockfile.
- `scripts/snmp-discover.js` hardcodes a real internal IP and the same SNMP community string `SECURITY.md` already tracks as a known medium finding — extends that finding's footprint to one more file.
- `scripts/migrate.sh` doesn't transaction-wrap "apply migration" + "record in tracking table" — a crash between the two would cause a re-run next time. Narrow edge case.

---

## ✅ Checked and found genuinely fine

- **Migration idempotency**, broadly: ~19 of 23 migrations correctly use `IF NOT EXISTS`/`CREATE OR REPLACE`/`ON CONFLICT DO NOTHING`/exception-swallowing `DO $$` blocks. The non-idempotent ones are the exception, not the rule (see P2-2).
- **`archive/` is safely inert** — `migrate.sh`'s glob is non-recursive, never touches it.
- **Spot-checked pre-seeded `schema_migrations` rows beyond the already-known 038 case**: migration 041's `v_machine_spc_ranking` is confirmed correctly in sync between `postgres/init/001` and the migration file — not drifted. All 16 pre-seeded rows share one identical bulk-insert timestamp, confirming P0-2's root cause rather than 16 independent seeding mistakes.
- **`docs/TROUBLESHOOTING.md`** spot-checked accurate — its own guidance actually predicted this session's dashboard-refresh-rate fix.
- **`nodered_data/flows/alerting.json`** itself is solid: correct Alertmanager webhook schema handling, env-var-only credentials (no hardcoded secrets), proper error handling on both delivery paths. The problem is empty env vars and a dead upstream Slack config, not this flow's own code.
- **Two Z-score anomaly alert rules** (`ims-cpu-zscore-anomaly`, `ims-temp-zscore-anomaly`) correctly guard against divide-by-zero (`WHERE sigma > 0`) — fail safe, not broken, just currently inert given the mock data's zero-variance server temperature.
- **`datasources.yml`**: the `timescaledb` UID matches every dashboard reference exactly; password is a proper env-var reference, not hardcoded.
- **No hardcoded secrets** found anywhere in scope beyond the one already-known SNMP community-string issue (now confirmed in a second file too, see P3).
- `backup-db.sh`/`restore-db.sh`/`enable-stress-test.sql` are small, correct, and do what they say.
- `k6-test.yml`'s actual load-test logic and failure threshold (>5% HTTP error rate) is sound.
- Multiple workflow files triggering on the same push/PR event is normal GitHub Actions practice, not a redundancy bug.

**Not deeply reviewed** (flagging as unreviewed, not claiming clean): `docs/admin/`, `docs/business/`, `docs/user/`, `GRAFANA_DESIGN_SYSTEM.md`, `PANEL_TOKENS.md`, `phase2-baseline-metrics.md`, `phase2-benchmark-report.md`, `scaling-plan.md`, `deployment-readiness.md`, `IMS-master-development-plan.md`, and the 5 LDI-specific alert rules (`ldi-quality-drift-001`, `ldi-process-capability-002`, `ldi-je-drift-003`, `ldi-je-capability-004`, `ldi-temp-high-006` — scanned for structure, no red flags, but not line-by-line verified against live data the way `ldi-machine-alarm-005` was).

---

## Recommended action order

| # | Item | Severity | Why first |
|---|---|---|---|
| 1 | Fix `ldi-machine-alarm-005`'s missing `ORDER BY time` | 🔴 P0 | Actively generating alert noise every ~5 minutes right now |
| 2 | Collapse the 3 migration runners to 1 canonical script | 🔴 P0 | Root cause of the schema-tracking drift that's already bitten this project once (migration 038) |
| 3 | Get real alert delivery working end-to-end (pick one channel, verify with a real test alert) | 🔴 P0 | Nothing currently reaches a human when something breaks |
| 4 | Sync migration 020's schema tuning into `postgres/init/001` | 🟠 P1 | This session's own fix is currently a no-op on fresh deploys |
| 5 | Fix or retire `ci-flows.yml` | 🟠 P1 | A CI check that structurally cannot pass trains people to ignore CI failures |
| 6 | Rewrite `docs/ARCHITECTURE.md` from scratch | 🟠 P1 | Currently actively misleading (wrong dashboard count, wrong ingestion path, self-contradictory) |
| 7 | Remove or fix the vibration-critical alert | 🟠 P1 | A "critical" alert that can never fire is worse than none |
| 8 | Everything else in P2/P3 | 🟡🟢 | Real but not urgent |

---

## Summary by audience

**Management:** Three critical findings, none of them about the LDI manufacturing dashboards fixed earlier this session — they're about the operational scaffolding *around* the system. The one to care about most: **if something breaks badly right now, no one gets paged.** Every alert-delivery channel configured in this system is either a placeholder, has empty credentials, or targets a discontinued API. That's the single highest-leverage fix available.

**SRE / IT:** The migration-runner inconsistency (P0-2) is the real prize here — it's the mechanical explanation for tracking drift that was previously worked around case-by-case. Fixing it properly (one canonical runner) prevents this class of bug recurring. Also worth immediate attention: `ci-flows.yml` cannot currently pass under any circumstances, which means it's either already being ignored (bad) or blocking merges for no real reason (also bad) — worth checking which.

**QA:** A "critical" vibration alert that can structurally never fire, and a Cpk-adjacent stale architecture doc, are both instances of the same underlying pattern this project has now hit multiple times: things that *look* like they're checking something but structurally can't. Worth a standing check for this pattern specifically (does the threshold's underlying data ever actually vary?) whenever a new alert or dashboard panel is added.

**Process Engineer:** Nothing in this pass touches LDI process/quality logic directly — that was the prior audit. The one item with process relevance is the vibration alert (P1-3): if vibration monitoring is expected to be live, it currently isn't, for the same reason PE/JE throughput reporting was found broken for LDI machines in the prior audit (the k6-synthetic ingestion pipeline gap).
