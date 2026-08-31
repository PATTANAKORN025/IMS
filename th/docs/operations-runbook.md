> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

# IMS Operations Runbook

**Scope:** day-to-day operation, troubleshooting, and safe-recovery reference for the production Docker Compose stack. Every command below is tagged by risk tier — read it before running anything.

**Command risk tiers:**
- 🟢 **READ-ONLY** — inspects state, changes nothing. Safe to run anytime.
- 🟡 **SAFE ACTION** — reversible, scoped, no data loss (e.g. recreating one stateless container).
- 🔴 **PRODUCTION-IMPACTING** — causes a service interruption, touches persistent data, or is not trivially reversible. Requires deliberate judgment, not routine use.

This document never includes actual credential values. See "Credential/secret handling" below for where real secrets live and how to reason about them without printing them.

---

## 1. System architecture overview

Data flow: `SNMP/HTTP → Node-RED → PgBouncer (transaction pooling) → TimescaleDB (hypertables/CAGGs) → Grafana`. Metrics also flow `Prometheus (scrapes targets) → Alertmanager`. `nginx` (`ims-proxy`) fronts Grafana and Node-RED's `/ldi-telemetry` HTTP endpoint.

Full architecture detail: `docs/architecture/` (see `IMS_PLATFORM_BOOK.md` for the master reference, `SECURITY_MODEL.md` for the trust boundary, `DATA_FLOW.md` for the ingestion pipeline).

## 2. Container / service inventory

| Container | Role | Has healthcheck |
|---|---|---|
| `ims-timescaledb` | Primary database (PostgreSQL 16 + TimescaleDB) | Yes |
| `ims-pgbouncer` | Connection pooler in front of TimescaleDB | Yes |
| `ims-node-red` | Ingestion pipeline (SNMP polling, HTTP `/ldi-telemetry`, batching, insert) | Yes |
| `ims-proxy` | nginx — fronts Grafana + Node-RED HTTP endpoints | Yes |
| `ims-grafana` | Dashboards | Yes |
| `ims-grafana-renderer` | Headless render service for Grafana image export/alerts | Yes |
| `ims-prometheus` | Metrics scraping + storage | No (checked via `/-/healthy`) |
| `ims-alertmanager` | Alert routing | No (checked via API) |
| `ims-blackbox` | Prometheus blackbox exporter (HTTP/TCP/ICMP probes) | No |
| `ims-snmpsim` | SNMP simulator (non-production device targets) | No |
| `ims-alarm-api` | Custom Node.js service — alarm-related API | Yes |
| `ims-factory-twin-3d` | Custom Node.js service — 3D factory twin | Yes |
| `ims-observability-archiver` | Background archival job | No |
| `ims-db-migrate` | One-shot migration runner (exits after applying migrations, does not stay up) | N/A |
| `ims-pgadmin4` | pgAdmin — database admin UI (not part of the runtime data path) | Not typically needed for production ops |

## 3. Health checks

🟢 **READ-ONLY**

```bash
docker ps --format "{{.Names}}\t{{.Status}}"          # all containers, at a glance
docker inspect <container> --format "{{.State.Health.Status}}"
```

Or use the repo's own scripted checks:

```bash
./scripts/verify-deployment.sh      # Linux — full deployment sanity check
./scripts/verify-deployment.ps1     # Windows — same
./scripts/verify-db-health.sh       # TimescaleDB-specific
./scripts/verify-db-health.ps1
```

For a full, evidence-based readiness read (not just "is it up"), see `scripts/production-assurance.js` — see section 12 below.

## 4. Grafana troubleshooting

🟢 Check: `curl -o /dev/null -w "%{http_code}" http://127.0.0.1:${GRAFANA_PORT:-3000}/login` (expect `200`).
🟢 Check logs: `docker logs ims-grafana --tail 100`.
🟢 Check datasource connectivity: Grafana UI → Connections → Data sources → Test.

Common symptom: Grafana returns `502` through nginx after another container (commonly `ims-timescaledb`) was recreated. nginx caches the upstream's resolved IP and doesn't automatically re-resolve.

🟡 **SAFE ACTION** — fix: `docker compose -p ims restart ims-proxy` (nginx only, stateless, no data impact).

## 5. Node-RED troubleshooting

🟢 Check startup/flow logs: `docker logs ims-node-red --tail 100` — look for `Started flows` and any `[error]` lines.
🟢 Check flow integrity (no duplicate node IDs): the repo's `tests/fleet/runner.js` disposable-stack regression exercises this end-to-end (see section 11).
🟢 Check auth: a `401 Unauthorized` on `/ldi-telemetry` with a correct key indicates `INGEST_API_KEY` mismatch between `.env` and the caller — never diagnose this by printing the key value.

🔴 **PRODUCTION-IMPACTING** — recreating `ims-node-red` causes an ingestion gap while the flow engine cold-starts (observed ~2 minutes in practice). Only do this for an actual fix (e.g. a flow or image change), not routine troubleshooting:

```bash
docker compose -p ims up -d --no-deps node-red
```

## 6. PostgreSQL / TimescaleDB troubleshooting

🟢 Connectivity: `docker exec ims-timescaledb pg_isready -U $POSTGRES_USER -d $POSTGRES_DB`.
🟢 Active connections: `docker exec ims-timescaledb psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT count(*) FROM pg_stat_activity;"`.
🟢 Extension version (after any TimescaleDB image bump): `SELECT extversion FROM pg_extension WHERE extname='timescaledb';`.
🟢 Migration state: `SELECT count(*) FROM public.schema_migrations;`.

🔴 **PRODUCTION-IMPACTING** — recreating `ims-timescaledb` interrupts every dependent service's connection (pgbouncer, Node-RED, Grafana, alarm-api) until they reconnect — in practice this has been observed to resolve itself within seconds to ~30s without manual intervention, but always re-verify telemetry resumed (section 11) afterward. **After any TimescaleDB image version change, `ALTER EXTENSION timescaledb UPDATE;` must be run manually** — a bare image swap does not update the installed extension's catalog version.

🔴 Applying a new migration: `./scripts/migrate.sh` — review the migration file first; this is schema-changing and not trivially reversible without a matching down-migration.

## 7. Prometheus troubleshooting

🟢 Health: `curl http://127.0.0.1:${PROMETHEUS_PORT:-9090}/-/healthy`.
🟢 Target status: `curl http://127.0.0.1:${PROMETHEUS_PORT:-9090}/api/v1/targets` — look for `"health":"down"` entries.
🟢 Alertmanager link: `curl http://127.0.0.1:${PROMETHEUS_PORT:-9090}/api/v1/alertmanagers`.

🟡 Recreate (stateless swap, e.g. after a config change): `docker compose -p ims up -d --no-deps prometheus`. Scrape state resets and targets take one scrape interval to re-report healthy — this is expected, not a fault.

## 8. Alertmanager troubleshooting

🟢 Health: `curl http://127.0.0.1:${ALERTMANAGER_PORT:-9093}/-/healthy`.
🟢 Active alerts: `curl http://127.0.0.1:${ALERTMANAGER_PORT:-9093}/api/v2/alerts`.

Bound to `127.0.0.1` only per `docker-compose.yaml` — not reachable from outside the host by design.

## 9. nginx / proxy troubleshooting

🟢 Check config loaded without error: `docker logs ims-proxy --tail 50`.
🟡 Reload after a config file change: `docker compose -p ims restart ims-proxy` (stateless).

See section 4 for the stale-upstream-IP symptom, the most common nginx issue in this stack.

## 10. Telemetry ingestion troubleshooting

🟢 Recent row counts (sanity, not a strict check):

```sql
SELECT 'ldi_data', count(*) FROM public.ldi_data WHERE ingest_ts > now() - interval '5 minutes'
UNION ALL SELECT 'sys_metrics', count(*) FROM public.sys_metrics WHERE time > now() - interval '5 minutes'
UNION ALL SELECT 'net_metrics', count(*) FROM public.net_metrics WHERE time > now() - interval '5 minutes';
```

🟢 Duplicate detection: `SELECT log_id, count(*) FROM public.ldi_data WHERE ingest_ts > now() - interval '30 minutes' GROUP BY log_id HAVING count(*) > 1;` — expect zero rows.
🟢 The **IMS Pipeline Health & Meta-Monitoring** Grafana dashboard (`ims-meta-monitoring`) surfaces insert rate, batch success rate, retry-queue depth, and circuit-breaker state visually — check this first before querying manually.

## Common failure symptoms → likely cause

| Symptom | Likely cause | Where to look |
|---|---|---|
| Grafana `502` via nginx | Stale nginx upstream IP after a dependent container was recreated | Section 4 |
| `/ldi-telemetry` returns `401` | `INGEST_API_KEY` mismatch | Section 5 |
| `/ldi-telemetry` returns `502` on a real batch | FK violation — device not registered in `public.devices` | Check `docker logs ims-node-red` for the exact constraint name |
| `/ldi-telemetry` returns `503` | Staging insert failed — TimescaleDB/pgbouncer unreachable | Section 6, then section 9 |
| Telemetry rows stop growing | Ingestion pipeline stalled, or TimescaleDB/pgbouncer down | Section 10, then sections 5-6 |
| Duplicate `log_id` rows appear | Real regression — should never happen; the disposable-stack fleet regression (section 11) explicitly guards this | Escalate — see section 16 |

## 11. Safe restart order

When multiple services need attention, restart in dependency order to avoid cascading reconnection storms:

1. `ims-timescaledb` (if needed at all — see section 6, PRODUCTION-IMPACTING)
2. `ims-pgbouncer`
3. `ims-node-red`
4. `ims-proxy` (last, so it picks up fresh upstream IPs for everything above)

**Never restart multiple unrelated services in one operation** — recreate one container at a time (`--no-deps` flag) and verify health before moving to the next.

After any production change, re-run the real regression:

```bash
node tests/fleet/runner.js
```

This builds a fully isolated, disposable stack (distinct project name, ports, containers — never touches production data) and requires 9/9 checks to pass: device acceptance, integrity, duplicates, sequence continuity, corruption, error rate, auth enforcement, key rotation, and failure-path HTTP status codes.

## 12. Rollback guidance

For an image-tag change (Node-RED, TimescaleDB, Prometheus, etc.): revert the tag in `docker-compose.yaml` to the previous known-good value, then recreate only that container (`--no-deps`). For TimescaleDB specifically, do not attempt to downgrade the extension version via `ALTER EXTENSION` — an extension version downgrade is not a supported, reliably-reversible operation; if a TimescaleDB image change causes a real problem, restore from backup instead (section 13) rather than trying to roll the extension back in place.

For a migration: only revert via a proper down-migration if one exists for that migration; do not manually edit already-applied schema state.

## 13. Backup / recovery references

Full procedure: `docs/operations/BACKUP_RESTORE.md`. Scripts: `scripts/backup-db.sh`, `scripts/restore-db.sh`, `scripts/dr-test.sh`, `scripts/dr-verify-restore.sh`.

🔴 Restore is inherently **PRODUCTION-IMPACTING** and can overwrite current data — always read `BACKUP_RESTORE.md`'s verification section (row-count bracketing) before running `restore-db.sh` against a live environment.

## 14. Credential / secret handling

All real secrets live in `.env` (gitignored, never committed) and are injected via Docker Compose environment variables. **Never print, log, or commit an actual credential value** — when diagnosing an auth issue, check whether a value is *set* (`grep -c "^KEY_NAME="  .env`) rather than *printing* the value itself.

PostgreSQL, Grafana admin, Node-RED credential secret, and pgAdmin credentials were all rotated in P10 (R7/R8) — see `docs/evidence/CREDENTIAL_ROTATION_P10R.md` and `docs/evidence/CREDENTIAL_ROTATION_P10R8.md` for the rotation record (metadata only, no values).

`nodered_data/flows.json`'s `pg_config` node must always show `userFieldType: "env"` / `passwordFieldType: "env"` — a `"str"` value there would mean a plaintext credential has crept back in; treat that as a security incident, not routine drift.

## 15. Security gate interpretation

Run: `node scripts/production-assurance.js --profile=security`. Read the result against `docs/evidence/FINAL_SECURITY_GATE_P12.md`, which documents this project's actual, evidence-based interpretation policy: **a raw NO-GO from this profile is not automatically a live incident** — Trivy's severity-only gate doesn't account for reachability. Cross-check any new CRITICAL/HIGH finding against the disposition table in that report before treating it as urgent. A finding is only actionable if it's reachable via a real runtime/network/authentication path in this deployment's actual configuration — see that report's methodology before escalating.

## 16. Escalation criteria

Full severity framework and worked examples: `docs/operations/INCIDENT_RESPONSE.md`. In summary: escalate immediately for anything matching that document's P0/P1 definitions — active data loss, extended production outage, or a confirmed (not merely Trivy-flagged) security exposure. Routine restarts, stale-cache symptoms (section 4), and confirmed-unreachable CVE findings (section 15) do not warrant escalation on their own.
