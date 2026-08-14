# Incident Response

> **Audience:** SRE/operations.
>
> **Provenance:** the worked examples below are real incidents from this system's own operational history (root-caused and, where noted, fixed) — not hypothetical scenarios.

---

## Severity framework

| Severity | Definition | Example | Response target |
|---|---|---|---|
| **SEV-1** | Production data loss or complete ingestion stop, both pipelines | Both `ldi_data` and `sys_metrics` stop receiving writes | Immediate — all hands |
| **SEV-2** | One pipeline down, or a container won't recover | LDI ingestion stalled, infra pipeline unaffected | Within the shift |
| **SEV-3** | Degraded but functioning | Elevated query latency, one machine's telemetry stale | Next business day |
| **SEV-4** | Cosmetic / non-functional | A dashboard panel shows a stale color token | Backlog |

## First response, any severity

1. **Check the Meta-Monitoring dashboard** — pipeline health, ingestion rate, error rate.
2. **Check `docker ps`** — is every container `Up` and `healthy`?
3. **Check `SELECT max(time) FROM public.ldi_data;`** (and the equivalent for `sys_metrics`) — how stale is the data, actually?
4. **Check Alertmanager/Grafana for firing alerts** — see `docs/architecture/ALARM_PLAYBOOK.md` for what each one means. Remember `Watchdog` always fires and isn't a real incident.

---

## Worked example 1: TimescaleDB restart doesn't bring ingestion back

**What happened (2026-08-10, discovered during DR testing):** after a TimescaleDB container is killed and restarted (whether manually or by an orchestrator), LDI ingestion can stay stalled for several minutes even after the database itself is healthy again — `docker exec ims-timescaledb psql ... SELECT max(time) FROM ldi_data` stays frozen at the outage timestamp.

**Root cause:** PgBouncer's `server_login_retry` failure-caching behavior. After the backend goes down, PgBouncer caches the connection failure and won't retry immediately even once the backend is back — Node-RED's own `pg.Pool` can also get stuck in a failed state that doesn't self-clear (`server login has been failing, cached error: connect failed` in Node-RED's logs is the signature to look for).

**A watchdog exists but isn't fully reliable yet:** `ldi_ingestion.json`'s `ldi_auth_check` counts consecutive connection failures (`ldiDbConnFailureStreak`) and calls `process.exit(1)` after 5 in a row, relying on Docker's `restart: unless-stopped` to bring Node-RED back with a fresh pool. **Live-verified during DR testing that this did not trigger within ~6 minutes** for this specific cascade — the counter's real-world trigger rate for this failure mode needs further investigation (see `ARCHITECTURE.md`'s Known Gaps).

**Manual recovery (works immediately):**

```bash
docker restart ims-node-red
```

Confirm recovery: `SELECT max(time) FROM public.ldi_data;` should advance within a few seconds.

## Worked example 2: a specific machine's telemetry silently stops

**What happened:** two real machines (device IDs containing a space character, e.g. `"LDI-A01"`) stopped reporting entirely, with no error visible in the normal alert surface.

**Root cause:** Node-RED's flow-context (`flow.get()`/`global.get()`) parses string keys as property-expressions — a bare space in a key throws `Invalid property expression`. The device ID was used directly as a context key in two places (the inline parser in `ingestion.json` and `circuit-breaker.js`), silently dropping every poll cycle for any device whose ID contains a space or other punctuation.

**Fix (already applied):** both call sites now sanitize the device ID into a safe context key (`safeKey()` in `nodered_data/lib/parser.js`) before using it for `flow`/`global` storage, while preserving the real device ID for display and joins. Regression coverage: `tests/unit/circuit-breaker.test.js`.

**Diagnostic signature to watch for:** `Invalid property expression` in Node-RED logs, or a specific device's row simply never advancing in `ldi_data`/`sys_metrics` while others do.

## Worked example 3: container doesn't auto-recover from being killed

**What happened (DR testing, 2026-08-10):** `docker kill ims-timescaledb` did not trigger Docker's `restart: unless-stopped` policy — confirmed twice via live `docker events` streaming (only `kill`/`die` events, no automatic `start`), despite the policy being correctly configured on the container.

**Status:** open, unresolved gap — root cause not fully isolated (possibly Docker Desktop/WSL2-specific; unverified on a production Linux host).

**Manual recovery:**

```bash
docker start ims-timescaledb # if the container exists but isn't running
# or, if that doesn't work:
docker compose up -d timescaledb
```

Then follow Worked Example 1's steps — a TimescaleDB restart cascades into the same ingestion-stall pattern.

---

## Escalation

For anything not covered by the worked examples above, or a SEV-1/SEV-2 that isn't resolving:

1. Check `docs/architecture/ARCHITECTURE.md`'s Known Gaps — the issue may already be documented with more context than fits here.
2. Check `docs/operations/TROUBLESHOOTING.md` for broader SRE debugging commands.
3. If it's genuinely new, root-cause it the way the three examples above were: reproduce deliberately if safe to do so (see `docs/operations/DR_TEST_PLAN.md`'s pattern of controlled, evidence-gathering drills), document what you find — including in `ARCHITECTURE.md`'s Known Gaps if it's a real unresolved gap, not a one-off.

## Related documents

- `docs/architecture/ARCHITECTURE.md` — Known Gaps section, the authoritative list of unresolved issues.
- `docs/operations/ALARM_PLAYBOOK.md` — what each alert means.
- `docs/operations/DR_TEST_PLAN.md` — controlled failure drills and their real evidence.
- `docs/operations/BACKUP_RESTORE.md` — when the incident is data-loss-adjacent.
- `docs/operations/TROUBLESHOOTING.md` — general SRE debugging commands.
