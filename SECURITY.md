# Security Policy

> **นโยบายความปลอดภัยของ IMS (Infrastructure Monitoring System)**
> ทราบข้อจำกัดและแผนแก้ไขก่อน deploy ไปยัง Production

---

<div align="center">

<img src="https://thesvg.org/icons/check-circle/default.svg" width="14" align="center"/> **Security:** Policy
<img src="https://thesvg.org/icons/check-circle/default.svg" width="14" align="center"/> **Status:** Staging
<img src="https://thesvg.org/icons/check-circle/default.svg" width="14" align="center"/> **Updated:** 2026

</div>

---

## Known Limitations

| #   | Issue                                                              | Severity | Status            | Fix Plan                                                                               |
| --- | ------------------------------------------------------------------ | -------- | ----------------- | -------------------------------------------------------------------------------------- |
| 1   | PgBouncer port exposed on host                                     | ️ Medium  | Known             | Bind localhost-only or use reverse proxy                                               |
| 2   | Node-RED Admin UI has no auth                                      | High     | Known             | Add `adminAuth` in settings.js before production                                       |
| 3   | SNMP community string in plain text                                | ️ Medium  | Known             | Move to environment variable                                                           |
| 4   | PgBouncer uses AUTH_TYPE: plain                                    | ️ Medium  | Known (trade-off) | Consider password hashing at source                                                    |
| 5   | GitHub PAT hardcoded in `.mimocode/mimocode.json` (AI tool config) | High     | Known             | Revoke token at GitHub; replace with `${GITHUB_PERSONAL_ACCESS_TOKEN}` env placeholder |

---

## Production Hardening Checklist

### Before Granting Network Access

- [x] PgBouncer has no host port binding — never published one in the base `docker-compose.yaml`, not a prod-overlay change
- [ ] Enable Node-RED adminAuth (generate bcrypt hash)
- [x] Grafana is not directly reachable from the host — `docker-compose.yaml` gives it no host port at all; the `proxy` service (nginx) is the only published entry point (3000), fronting both Grafana and `alarm-api` and gating the latter behind an `auth_request` check against Grafana's own session (see `docs/architecture/SECURITY_MODEL.md`)
- [ ] Review all Docker secrets in `secrets/` directory
- [ ] Enable SNMPv3 for production devices (replacing v2c)

### Before Connecting to Real Machines

- [ ] Verify SNMPv3 authentication and encryption
- [ ] Test community string rotation procedure
- [ ] Audit all OID access permissions
- [ ] Enable audit logging on target devices

### Ongoing Security Practices

- [ ] Rotate Docker secrets quarterly
- [ ] Monitor for CVE updates in base images
- [ ] Review Gitleaks scanning results weekly
- [ ] Audit Prometheus/Alertmanager access logs

---

## ️ Security Controls

### Network Security

| Control                   | Implementation                                          |
| ------------------------- | ------------------------------------------------------- |
| **Container Isolation**   | Docker bridge network — services communicate via DNS    |
| **No Host Port Exposure** | Internal services only accessible within Docker network |
| **SNMP Community**        | File-based community string (not hardcoded in flows)    |
| **Secrets Management**    | Docker secrets in `secrets/` directory (gitignored)     |

### Application Security

| Control                      | Implementation                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| **SQL Injection Prevention** | `safeStr()` escaping on all user inputs                                                                 |
| **Credential Rotation**      | Manual rotation required for stale `flows_cred.json`                                                    |
| **CI/CD Security**           | Gitleaks scanning, stub secrets for validation                                                          |
| **Plugin Policy**            | Only open-source plugins/MCP/skills (MIT/ISC/BSD/Apache-2.0) — verified against current inventory below |

### Data Security

| Control               | Implementation                                    |
| --------------------- | ------------------------------------------------- |
| **Database Access**   | PgBouncer connection pooling with authentication  |
| **Backup Encryption** | Database dumps should be encrypted before storage |
| **Log Sanitization**  | No secrets logged in Docker container logs        |

---

## AI Tooling Security (MCP / Skills / Plugins)

### Agent Supply Chain Inventory

All AI tooling is open-source (MIT / Apache-2.0), per the Plugin Policy. Install locations: `.agents/skills/` (universal), `.mimocode/` (MiMo Code), `.claude/skills/` + `.github/skills/` (Claude Code / Copilot symlinks).

| Item                 | Inventory                                                                                                                                                                                                                         | Sources                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **MCP servers (12)** | context7, playwright, puppeteer, github, filesystem, everything, sequential-thinking, memory, fetch, postgres, git, time — mirrored in `.mimocode/mimocode.json`, `.mcp.json`, `.opencode/opencode.json`, `.vscode/settings.json` | modelcontextprotocol/servers, PyPI (`mcp-server-fetch/time/git`), npm (`@modelcontextprotocol/server-*`) |
| **Skills (90)**      | 26 local (IMS-specific) + 41 mattpocock/skills + 9 vercel-labs/agent-skills + 14 obra/superpowers                                                                                                                                 | github.com/mattpocock/skills, vercel-labs/agent-skills, obra/superpowers (all MIT)                       |
| **Plugins (8)**      | `superpowers@git+…` entries in `.mimocode/mimocode.json` (obra, mattpocock, vercel-labs, garrytan/gstack, addyosmani, wshobson/agents, affaan-m/ECC, pcvelz)                                                                      | All MIT, open-source                                                                                     |

### Secrets in AI Tooling Configs

- `.mimocode/mimocode.json` and `.vscode/settings.json` are **gitignored** — local tokens may live here, but still treat them as secrets and rotate if shared.
- `.mcp.json` and `.opencode/opencode.json` are **tracked by git** — MUST use `${VAR}` placeholders (e.g. `${GITHUB_PERSONAL_ACCESS_TOKEN}`, `${POSTGRES_PASSWORD}`), never literal credentials.
- MCP Python servers require **pinned `mcp==X.Y.Z` SDK versions** in the launch args (see `knowledge.md`) — pinning prevents supply-chain drift from breaking or hijacking the toolchain.

### ️ Typosquat / Canary Packages — NEVER Install

npm packages `mcp-server-fetch` and `mcp-server-git` are **security-research canaries** (`node-canaries` / `npx-canary`) masquerading as real MCP servers. Do NOT install them under any circumstances — use the official PyPI (`uvx mcp-server-*`) or `@modelcontextprotocol/server-*` npm packages instead. Always verify a package's maintainer + repository before adding to any AI config.

---

## Reporting Vulnerabilities

If you discover a security vulnerability:

1. **Do NOT** open a public GitHub Issue
2. Email the security team directly or use GitHub's private vulnerability reporting
3. Include: description, steps to reproduce, potential impact
4. Allow 48 hours for initial response

---

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/auth.html)
- [SNMPv3 Security](https://datatracker.ietf.org/doc/html/rfc3411)
- [Grafana Security](https://grafana.com/docs/grafana/latest/setup-grafana/security/)

---

<div align="center">

**IMS Security Policy — Version 1.0**

_Review before every production deployment_

</div>
