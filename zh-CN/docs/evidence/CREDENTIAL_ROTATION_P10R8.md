> [!NOTE]
> **自动翻译 / 深度技术数据**
> 本文档为深度技术审计/证据报告。为了保持专业术语的准确性，目前主要以英文原文为准。

<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Secret-Reuse Rotation — Grafana admin, Node-RED credential secret, pgAdmin (P10, Phase R8)

Run: 2026-08-24, ~04:50-05:00 UTC. Follows the R1-R6 audit and the R7 `ims_admin` PostgreSQL rotation
(`f00ce92`). The R1 audit found 3 more secrets in the real, local `.env` still equal to the same
documented example placeholder `POSTGRES_PASSWORD` had before R7 -- this phase rotates those 3.
No secret value (old or new) is recorded anywhere in this document, git, logs, or evidence JSON.

## What was rotated

| Secret | Consumer | Method | New value |
| --- | --- | --- | --- |
| `GRAFANA_ADMIN_PASSWORD` | Grafana `admin` user | Grafana's own self-service API (`PUT /api/user/password`), authenticated with the current password -- **not** just an env var change, since `GF_SECURITY_ADMIN_PASSWORD` only applies at first-ever container init and this Grafana instance already has real accumulated state | 48-char random hex |
| `NODE_RED_CREDENTIAL_SECRET` | Node-RED's `credentialSecret` (encrypts any node-level "credentials"-type fields) | `.env` value change + `node-red` recreate | 48-char random hex |
| `PGADMIN_DEFAULT_PASSWORD` | pgAdmin web UI login | `.env` value change only | 48-char random hex |

`pgadmin`'s container has never actually been created on this host (`docker ps -a` shows no entry) --
rotating its `.env` value has zero runtime impact today; it takes effect whenever the container is first
started.

`nodered_data/flows_cred.json` (Node-RED's encrypted-credential store) does not exist -- confirmed before
rotating `NODE_RED_CREDENTIAL_SECRET`, meaning there is nothing to re-encrypt or lose. This rotation is a
config change with no data-migration risk.

## Deviation from plan, disclosed (second occurrence of the same class of issue as R7)

Recreating `node-red` alone (`docker compose up -d node-red`) also recreated `ims-grafana`, because
`GRAFANA_ADMIN_PASSWORD` had just changed in `.env` and Grafana's own `environment:` block references it
-- same root cause as R7's unintended `timescaledb` recreate (Compose reconciles every service whose
resolved config changed, not just the named target).

**That recreate then broke live Grafana access via nginx** (`502 Bad Gateway` on `http://127.0.0.1:3000/*`)
for a real, if brief, window. Root cause: nginx resolves and caches the `grafana` upstream hostname's IP at
its own startup/connection-pool level; when the Grafana container was recreated it got a new internal
Docker IP, and nginx kept trying the old one. Grafana itself was healthy internally the whole time
(confirmed via `docker exec ims-grafana wget .../api/health` -> `200` while nginx still returned `502`).

**Fixed immediately**: restarted only `ims-proxy` (nginx), which forced fresh DNS resolution of the
`grafana` upstream. Confirmed working within seconds (`200` via the real proxy path, both `/api/health`
and an authenticated `/api/user` call with the rotated password). No data lost, no extended outage --
disclosed here as a real, repeatable operational lesson: **any credential rotation that triggers a
container recreate for a service nginx proxies to should be followed by a check (and if needed, an nginx
restart) to confirm the proxy's upstream resolution is current** -- not something Compose or nginx handles
automatically.

## Verification (real, not assumed)

- Grafana: old admin password rejected (`401`) immediately after the API-based change; new password
  authenticated (`200`) both directly against the container and, after the proxy-restart fix, through the
  real `nginx` path.
- Node-RED: recreated cleanly, no startup errors, flows loaded, `db_insert`/global `pgPool` continued
  writing successfully (unaffected by this rotation -- different credential entirely).
- Real telemetry: flowing normally after all recreates settled (`90` rows in the prior 2-minute window).
- All 13 containers healthy after the dust settled.

## Regression (post-rotation, against the live stack)

| Suite | Result |
| --- | --- |
| `tests/fleet/runner.js` (9 checks) | 9/9 PASS, teardown verified clean |
| `node scripts/production-assurance.js --profile=load` | GO, 9/9 PASS |

## Security state after R7 + R8

All 7 secrets checked in the R1-R6 audit are now distinct values -- none share the original example
placeholder any more (`GRAFANA_DB_PASSWORD` and `ALARM_API_DB_PASSWORD` were already properly rotated
before this session; `POSTGRES_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`, `NODE_RED_CREDENTIAL_SECRET`, and
`PGADMIN_DEFAULT_PASSWORD` are rotated by R7+R8). `.env` remains gitignored and untracked throughout.

**System-wide Production Assurance gate remains NO-GO, unchanged and correctly so.** R7 and R8 close a
real credential-exposure/secret-reuse risk; they do not touch the 9 unrelated CRITICAL CVE findings
(`node:22-alpine` tar, TimescaleDB's compiled-in Go stdlib/pgx, Alertmanager -- all confirmed no-fix-
available upstream as of the last live check). Rotating credentials was never going to change that, and
reporting otherwise would be exactly the PASS-driven behavior this framework exists to prevent.

## Verdict

**Rotation complete and verified for all 3 secrets in scope.** One real operational issue (nginx stale
upstream IP after a triggered Grafana recreate) encountered, diagnosed, and fixed within the same
response -- disclosed in full rather than smoothed over, matching the same standard applied to R7's
TimescaleDB-recreate deviation.
