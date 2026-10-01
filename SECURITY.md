# Security Policy

> **Security policy of IMS (Industrial Monitoring System)**
> Read the known limitations and their fix plans before deploying to production.

---

<div align="center">

<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **Document:** Security Policy
<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **Status:** Pre-production
<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **Updated:** 2026-09-28 (verified against `main`)

</div>

---

## Reporting Vulnerabilities

If you discover a security vulnerability:

1. **Do NOT** open a public GitHub issue, pull request or discussion.
2. Report it privately through the repository's **Security** tab (GitHub private vulnerability reporting), or contact a maintainer directly.
3. Include a description, steps to reproduce, affected component and potential impact. Never include real credentials or production data in the report.
4. Expect an initial response within 48 hours.

Only the `main` branch receives security fixes.

---

## This Repository Is Public

Everything committed here — including the full git history and every pushed branch — is public and may already be cached or forked. A later deletion does not make it private again. Never commit:

- `.env` or any real credential, token, key or password (rotate immediately if one ever reaches a commit);
- production data: database dumps, CSV exports, dashboard exports containing real values (gitignored: `*.csv`, `*.parquet`, `*.dump`, `/vcp/`);
- Floor 1 CAD files or anything derived from them: dimensions, coordinates, areas, layer names, label text;
- real machine or line identifiers, lot or job numbers, internal hostnames, internal IP addresses;
- personal data (names, e-mail addresses, phone numbers).

The CI private-data scanner (`tests/lint/private-data-leak-scanner.js`) matches **file paths only**, so review every diff for the content above before pushing.

---

## Known Limitations

| # | Issue | Severity | Status | Fix plan |
| --- | --- | --- | --- | --- |
| 1 | Every value in `.env.example` is public | High | Known | Generate new values for every secret before any real deployment (see [Admin Manual](docs/admin/ADMIN_MANUAL.md#pre-production-security-checklist)) |
| 2 | nginx front door serves plain HTTP | Medium | Known | Terminate TLS in front of, or inside, `ims-proxy`; only then set `GF_SECURITY_COOKIE_SECURE` and HSTS |
| 3 | SNMP v2c community strings stored per device in `public.devices` (plain text) | Medium | Known | Move production devices to SNMPv3 (authPriv) |
| 4 | Grafana HTML sanitizing is off (`[panels] disable_sanitize_html = true` in `monitoring/grafana/grafana.ini`), because the Business Text dashboards run JavaScript | Medium | Known | Give the Editor role only to trusted people. Templates escape every data value, and `dashboard-linter` rejects `{{{ }}}` and values inside `on*=` handlers |
| 5 | `/ldi-telemetry` and `/inject` are reachable through the front door and protected only by the `x-api-key` check in Node-RED | Medium | Known | Keep `INGEST_API_KEY` secret and rotated; restrict the port with a firewall |
| 6 | The CI secret scan checks the working tree, not history; an old `.env` (credentials since rotated) is in history | Low | Known | The scan blocks and its image is pinned; `scripts/pre-commit.js` refuses to commit any `.env` |
| — | TimescaleDB port exposed on the host | — | **Resolved** | The base `docker-compose.yaml` comments out host port exposure for TimescaleDB; database is internal only |
| — | PgBouncer port exposed on the host | — | **Resolved** | The base `docker-compose.yaml` never publishes a PgBouncer port |
| — | Node-RED editor without authentication | — | **Resolved** | `nodered_data/settings.js` refuses to start unless `NODE_RED_ADMIN_PASSWORD_HASH` is set; the editor port is bound to `127.0.0.1` |
| — | pgAdmin on all interfaces, image `latest` | — | **Resolved** | Bound to `127.0.0.1:5050`, image pinned to `9.18` |
| — | PgBouncer `auth_type = plain` (cleartext passwords on the Docker network) | — | **Resolved** | `AUTH_TYPE: scram-sha-256` |
| — | `observability-archiver` mounted `/var/run/docker.sock` | — | **Resolved** | It reaches Docker through `docker-socket-proxy`, which allows read endpoints only, on an internal network |
| — | Services connected to the database as the superuser | — | **Resolved** | Node-RED uses `nodered_writer`, the archiver `observability_archiver`, alarm-api `alarm_api_writer`, Grafana `grafana_reader`; each has grants only on what it uses |
| — | `/alert-webhook` accepted any request | — | **Resolved** | It requires `Authorization: Bearer <ALERT_WEBHOOK_TOKEN>` |
| — | Grafana image renderer image `latest` | — | **Resolved** | Pinned to `v5.11.1` |
| — | Grafana `/metrics` and the version and commit in `/api/health` were readable without a login through the front door | — | **Resolved** | nginx returns 404 for `/metrics`; `[auth.anonymous] hide_version = true` (the key had been set in the wrong section) |
| — | One click could publish a dashboard snapshot to `snapshots.raintank.io`, or share a dashboard publicly without a login | — | **Resolved** | `[snapshots] external_enabled = false`, `[public_dashboards] enabled = false` |
| — | Plugins could be installed from the UI and floated to the latest version at start | — | **Resolved** | `plugin_admin_enabled = false`; `preinstall_sync` pins the two panels in use; unused default plugins are disabled |
| — | No Content-Security-Policy, no password policy, phone-home to grafana.com and gravatar.com | — | **Resolved** | CSP with a per-request nonce, `password_policy = true`, analytics, update checks, news and gravatar off |
| — | alarm-api accepted cookie-authenticated writes from any origin on the same site, unbounded input, and answered errors with stack traces (no `NODE_ENV`) | — | **Resolved** | Origin / `Sec-Fetch-Site` check, 8 kB body limit, bounded `logid` and note, JSON error handler, `NODE_ENV=production`, nginx rate limit on `/alarm-api/` |
| — | Node-RED could install npm modules and palette nodes at runtime; no audit log | — | **Resolved** | `functionExternalModules: false`, `externalModules` installs off, audit logging on, credential secret mandatory |
| — | Node-RED image built without a lockfile; services built with `npm install` | — | **Resolved** | Committed `nodered_data/package-lock.json`, `npm ci` in every image; two unused Node-RED packages removed |
| — | Containers kept Docker's default Linux capabilities | — | **Resolved** | `cap_drop: ALL` on 13 services (blackbox keeps `NET_RAW`, snmpsim `NET_BIND_SERVICE`/`SETUID`/`SETGID`); alarm-api and factory-twin-3d run with a read-only root filesystem |
| — | CI workflows ran with the default token scope and actions referenced by mutable tags | — | **Resolved** | `permissions: contents: read`; every action pinned to a commit SHA (Dependabot updates the pins) |

---

## Production Hardening Checklist

### Before Granting Network Access

- [x] TimescaleDB and PgBouncer have no host port bindings (internal-only network)
- [x] Node-RED editor requires an admin password hash and binds to `127.0.0.1`
- [x] Grafana has no host port; the `proxy` service (nginx) is the single UI entry point on port 3000, fronting Grafana, `alarm-api`, the Factory Twin and the LDI ingest endpoints, and gating `alarm-api` and the twin behind an `auth_request` check against Grafana's own session (see `docs/architecture/SECURITY_MODEL.md`)
- [ ] Replace every value copied from `.env.example` with a newly generated secret
- [x] pgAdmin (`5050`) bound to `127.0.0.1` loopback only
- [ ] Add TLS in front of the nginx front door
- [ ] Enable SNMPv3 for production devices (replacing v2c)

### Before Connecting to Real Machines

- [ ] Verify SNMPv3 authentication and encryption
- [ ] Test the community-string / credential rotation procedure
- [ ] Audit all OID access permissions
- [ ] Enable audit logging on target devices

### Ongoing Security Practices

- [ ] Rotate secrets at least quarterly, and immediately after any suspected exposure
- [ ] Monitor base images for CVEs (`node scripts/production-assurance.js --profile=security`)
- [ ] Review secret-scan results for every pull request
- [ ] Audit Prometheus/Alertmanager access logs

---

## Security Controls

### Network Security

| Control | Implementation |
| --- | --- |
| **Container isolation** | Docker bridge networks (`ims-internal`, `ims-monitoring`); services communicate by DNS name |
| **Minimal host exposure** | Only the nginx front door (3000) listens on external interfaces; pgAdmin (5050), Node-RED, Prometheus, Alertmanager and Blackbox bind to `127.0.0.1` loopback; TimescaleDB and PgBouncer have no host port exposure |
| **Authenticated ingest** | `/ldi-telemetry` and `/inject` require the `x-api-key` header to match `INGEST_API_KEY` |
| **Secrets management** | `.env` (gitignored) injected through Docker Compose `${VAR:?}` required variables; nothing is read from a `secrets/` directory |

### Application Security

| Control | Implementation |
| --- | --- |
| **SQL injection prevention** | Parameterised queries in the services; `safeStr()` escaping in Node-RED function nodes |
| **Least-privilege DB roles** | `grafana_reader` (read-only) for Grafana, `alarm_api_writer` (`SELECT`+`UPDATE` on `ldi_alarm_lifecycle` only) for `alarm-api` |
| **Node-RED credentials** | `pg_config` uses environment-typed user/password fields; flow credentials are encrypted with `NODE_RED_CREDENTIAL_SECRET` |
| **CI/CD security** | Private-data path scanner, repository hygiene linter, gitleaks (see limitation 7), stub secrets for compose validation |
| **Plugin policy** | Only open-source plugins, MCP servers and skills (MIT/ISC/BSD/Apache-2.0) |

### Data Security

| Control | Implementation |
| --- | --- |
| **Database access** | PgBouncer connection pooling with authentication; no database port published on the host |
| **Backups** | `scripts/backup-db.sh` writes to the gitignored `./backups/`; encrypt dumps before they leave the host |
| **Log sanitisation** | No secrets in container logs; diagnose authentication problems by checking whether a variable is set, never by printing it |

---

## AI Tooling Security (MCP / Skills / Plugins)

### Where AI Tooling Configuration Lives

| Location | Tracked by git | Rule |
| --- | --- | --- |
| `.agents/skills/`, `.clinerules/`, `.cursor/`, `.windsurf/`, `.superpowers/`, `skills-lock.json`, `AGENTS.md`, `CLAUDE.md` | Yes — public | Instructions only. Never place a token, hostname, credential, plant data or personal data here. |
| `.mimocode/`, `.opencode/`, `.mcp.json`, `.claude/`, `.vscode/settings.json`, `ABOUT-ME.md`, `START.md`, `CONTEXT.md` | No — gitignored | Local tokens may live here; still treat them as secrets, never force-add these files, and rotate any token that was shared. |

MCP Python servers should be launched with pinned `mcp==X.Y.Z` SDK versions so that supply-chain drift cannot silently change the toolchain.

### Typosquat / Canary Packages — NEVER Install

npm packages `mcp-server-fetch` and `mcp-server-git` are **security-research canaries** (`node-canaries` / `npx-canary`) masquerading as real MCP servers. Do not install them under any circumstances — use the official PyPI (`uvx mcp-server-*`) or `@modelcontextprotocol/server-*` npm packages instead. Always verify a package's maintainer and repository before adding it to any AI configuration.

---

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [PostgreSQL Client Authentication](https://www.postgresql.org/docs/current/auth.html)
- [SNMPv3 Architecture (RFC 3411)](https://datatracker.ietf.org/doc/html/rfc3411)
- [Grafana Security](https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/)

---

<div align="center">

**IMS Security Policy — Version 1.1**

_Review before every production deployment_

</div>
