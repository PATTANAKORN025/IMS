# Security Policy

> **Security policy of IMS (Industrial Monitoring System)**
> Read the known limitations and their fix plans before deploying to production.

---

<div align="center">

<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **Document:** Security Policy
<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **Status:** Pre-production
<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **Updated:** 2026-09-26 (verified against `main`)

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
- production data: database dumps, CSV exports, dashboard exports containing real values;
- Floor 1 CAD files or anything derived from them: dimensions, coordinates, areas, layer names, label text;
- real machine or line identifiers, lot or job numbers, internal hostnames, internal IP addresses;
- personal data (names, e-mail addresses, phone numbers).

The CI private-data scanner (`tests/lint/private-data-leak-scanner.js`) matches **file paths only**, so review every diff for the content above before pushing.

---

## Known Limitations

| # | Issue | Severity | Status | Fix plan |
| --- | --- | --- | --- | --- |
| 1 | Every value in `.env.example` is public | High | Known | Generate new values for every secret before any real deployment (see [Admin Manual](docs/admin/ADMIN_MANUAL.md#pre-production-security-checklist)) |
| 2 | pgAdmin published on port `5050` on all interfaces, image tag `latest` | Medium | Known | Bind to `127.0.0.1` or firewall it; pin the image tag |
| 3 | nginx front door serves plain HTTP | Medium | Known | Terminate TLS in front of, or inside, `ims-proxy` |
| 4 | SNMP v2c community strings stored per device in `public.devices` (plain text) | Medium | Known | Move production devices to SNMPv3 (authPriv) |
| 5 | PgBouncer uses `auth_type = plain` | Medium | Known (trade-off) | Internal network only; consider SCRAM end to end |
| 6 | `observability-archiver` mounts `/var/run/docker.sock` | Medium | Known | The `:ro` flag does not restrict Docker API calls; treat the container as privileged or replace the mount |
| 7 | CI secret scan is non-blocking and working-tree only (`gitleaks --no-git ... \|\| true`) | Medium | Known | Make it blocking and scan history (`gitleaks detect` without `--no-git`); run a full-history scan locally before pushing |
| 8 | Grafana image renderer image tag `latest` | Low | Known | Pin the image tag |
| — | PgBouncer port exposed on the host | — | **Resolved** | The base `docker-compose.yaml` never publishes a PgBouncer port |
| — | Node-RED editor without authentication | — | **Resolved** | `nodered_data/settings.js` refuses to start unless `NODE_RED_ADMIN_PASSWORD_HASH` is set; the editor port is bound to `127.0.0.1` |

---

## Production Hardening Checklist

### Before Granting Network Access

- [x] PgBouncer has no host port binding
- [x] Node-RED editor requires an admin password hash and binds to `127.0.0.1`
- [x] Grafana has no host port; the `proxy` service (nginx) is the single UI entry point on port 3000, fronting Grafana, `alarm-api`, the Factory Twin and the LDI ingest endpoints, and gating `alarm-api` and the twin behind an `auth_request` check against Grafana's own session (see `docs/architecture/SECURITY_MODEL.md`)
- [ ] Replace every value copied from `.env.example` with a newly generated secret
- [ ] Restrict pgAdmin (`5050`) to the host or an administration network
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
| **Minimal host exposure** | Only the nginx front door (3000) and pgAdmin (5050) listen on all interfaces; Node-RED, Prometheus, Alertmanager and Blackbox bind to `127.0.0.1` |
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
