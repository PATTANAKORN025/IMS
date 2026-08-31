> [!NOTE]
> **自动翻译 / 深度技术数据**
> 本文档为深度技术审计/证据报告。为了保持专业术语的准确性，目前主要以英文原文为准。

<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# PostgreSQL Credential Rotation — `ims_admin` (P10, Phase R7)

Run: 2026-08-24, ~04:35-04:44 UTC. Follows the P10A source-of-truth reconciliation and the Phase E
`pg_config` fix (`439b3a4`), which removed a hardcoded, git-history-exposed plaintext credential for the
`ims_admin` role (Postgres superuser) from `nodered_data/flows.json`. This phase rotates the actual
credential value, since fixing the *mechanism* (env-based config) doesn't invalidate a value already
sitting in git history.

**No secret value (old or new) is recorded anywhere in this document, in git, in logs, or in evidence
JSON.** Metadata only, per explicit instruction for this phase.

## What was rotated

| Item | Value |
| --- | --- |
| Role | `ims_admin` (PostgreSQL superuser, login-enabled) |
| Method | `ALTER ROLE ims_admin WITH PASSWORD '<generated>'` — in place, no role drop/recreate |
| New credential | 64-character random hex string, generated via `openssl rand -hex 32` |
| Consumers updated | local `.env` (`POSTGRES_PASSWORD`, gitignored, never committed) |
| Services recreated | `pgbouncer`, `node-red` (intentional) |

## Deviation from plan (disclosed, not smoothed over)

Recreating `pgbouncer`/`node-red` via `docker compose up -d pgbouncer node-red` **also recreated
`ims-timescaledb`**, which was explicitly out of scope for this phase. Root cause: `POSTGRES_PASSWORD`
appears in `timescaledb`'s own `environment:` block too, so changing `.env` changed that service's
*resolved* Compose config as well — Compose recreates any service whose resolved config changed,
project-wide, regardless of which services are named on the command line. This was not anticipated
before running the command.

**Real impact, checked immediately, not assumed:** all 3 recreated containers came back healthy within
seconds; the named data volume was untouched (`219455` total rows in `ldi_data` before and after,
nothing lost); real telemetry resumed on its own. Reported to the user before proceeding further; user
reviewed and approved continuing.

## First rotation attempt had a self-caught bug

The first `ALTER ROLE` + `.env` write pass produced a value that did **not** authenticate over the real
(`scram-sha-256`-enforced) network path — caught by testing against the real docker-network path rather
than trusting the initial `docker exec` check, which (unrelated to this rotation) connects over loopback
and is subject to this deployment's `pg_hba.conf` `trust` rule for local connections — meaning that first
check would have reported success for *any* password, including garbage, and was not a valid test.
Confirmed via a deliberate garbage-password probe over the same loopback path also "succeeding."

Root-caused before proceeding: a second, atomic pass generated a fresh credential, ran `ALTER ROLE`, wrote
`.env`, then **re-read `.env` back and verified that exact re-read value** over the real network path
(`docker run --rm --network ims_ims-internal ... psql -h ims-timescaledb ...`) before considering rotation
complete. This round-trip check is what actually proved correctness; the original single-pass approach
did not.

## Verification (real, not assumed)

- New credential authenticates via the real network path (`scram-sha-256`): confirmed.
- Prior credential rejected via the same real network path: confirmed (`FATAL: password authentication
  failed`).
- `pg_config` in `nodered_data/flows.json` and `nodered_data/flows/ingestion.json`: both `userFieldType`/
  `passwordFieldType` = `env` (unchanged by this phase — that fix already landed at `439b3a4`).
- `db_insert` (ims-tab-v5, live-reachable) and the global `pgPool` (used by `ldi_auth_check`, alarm
  simulator, etc.): both confirmed writing successfully post-rotation via real Node-RED logs (`Batch
  INSERT [sys]/[net]/[ldi] ok`, `Insert to ldi_alarm_log`).
- `ldi_auth_check` still enforcing auth correctly: real `401 {"error":"Unauthorized"}` on a wrong-key
  probe via the live `/ldi-telemetry` endpoint (through nginx, port 3000).
- 0 duplicate `log_id` in `ldi_data` across the rotation window (15-minute check).
- Max ingestion gap across the full rotation window (timescaledb + pgbouncer + node-red all recreated):
  **54.0 seconds** — a real, bounded, one-time transient gap, not sustained loss or ongoing failure.
- No unexpected application errors in Node-RED logs post-rotation (excluding the pre-existing, unrelated
  SNMP timeout warnings for 2 known devices, and normal alarm-message text containing the word "error").
- Other secrets in `.env` (`GRAFANA_DB_PASSWORD`, `ALARM_API_DB_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`,
  `NODE_RED_CREDENTIAL_SECRET`, `PGADMIN_DEFAULT_PASSWORD`, `GRAFANA_RENDERER_TOKEN`): unchanged (checked
  by key presence + length only, before/after this rotation — all identical, only `POSTGRES_PASSWORD`
  changed).
- `.env`: confirmed still gitignored, not staged, not committed.
- Git: `HEAD` unchanged by this phase (`439b3a4`, same as before rotation started) — no history rewrite,
  no force-push, nothing to commit here since the only changed file is gitignored.

## Regression (all run post-rotation, against the live stack)

| Suite | Result |
| --- | --- |
| `tests/fleet/runner.js` (disposable stack, 9 checks) | 9/9 PASS, teardown verified clean |
| `node scripts/production-assurance.js --profile=load` | GO, 9/9 PASS |
| `node scripts/production-assurance.js --profile=fast` | GO (data-quality, integration all PASS; e2e query-timing correctly NOT_TESTED under fast per its own documented flakiness-at-small-n exclusion, unrelated to this rotation) |

## Not in scope for this phase (unchanged, deliberately)

Grafana's `grafana_reader` credential, Node-RED's `NODE_RED_CREDENTIAL_SECRET`, and pgAdmin's default
password were **not** rotated here — separate roles/values, separate follow-up if desired. Notably,
`GRAFANA_ADMIN_PASSWORD`, `NODE_RED_CREDENTIAL_SECRET`, and `PGADMIN_DEFAULT_PASSWORD` were found (during
the R1-R6 audit) to still equal the same documented example placeholder as `POSTGRES_PASSWORD` did before
this rotation — flagged as a related, out-of-scope finding for separate follow-up, not addressed here.

System-wide Production Assurance gate remains **NO-GO** — this rotation closes a real credential-exposure
risk but does not touch the 9 unrelated CRITICAL CVE findings blocking the system-wide gate.

## Verdict

**Rotation complete and verified.** Old credential confirmed invalid, new credential confirmed active
through every real consumer, zero data loss, one disclosed process deviation (unintended TimescaleDB
recreate) with benign, checked impact, and a self-caught methodology bug in the first rotation attempt
fixed before being reported as done.
