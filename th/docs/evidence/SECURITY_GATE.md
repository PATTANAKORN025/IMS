> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Security Final Gate

Run: 2026-08-21. HEAD at time of test: `60bdcc6`.

## Secret exposure

- **`.env` was tracked in git history** for 5 days (`ab08ee0` add, `25c9654` modify, `1fdc83b` delete, all
  2026-06-22..06-27) before this session, currently gitignored (`.gitignore:7`). Forensically inspected both
  committed versions (`git show <commit>:.env`) rather than assuming severity: both contained only
  placeholder values (`GRAFANA_ADMIN_PASSWORD=admin`, `POSTGRES_PASSWORD=password`/`change-me-please`,
  `ALERT_WEBHOOK_URL=https://example.com/webhook`) -- no real credential was ever committed.
- **Full-history secret scan actually run** (not reasoned about): `docker run zricethezav/gitleaks:latest
  detect --source=/repo --config=/repo/.gitleaks.toml` against this repo's own 1003-commit history --
  **0 leaks found**.
- **Verdict: PASS.** `.env` shouldn't have been tracked, but no real secret was ever exposed by it, and a
  real scan of the full history confirms no other leak exists.

## Dependency vulnerabilities

- `services/factory-twin-3d`: `npm audit --production` -- 0 vulnerabilities.
- `services/alarm-api`: had **no `package-lock.json`** -- `npm audit` couldn't run at all
  (`ENOLOCK`/`loadVirtual requires existing shrinkwrap file`), meaning this service's real dependency
  vulnerabilities have never actually been checked. Generated the lockfile
  (`npm install --package-lock-only`, non-destructive) and re-ran: 0 vulnerabilities. Lockfile committed --
  this service can now actually be audited going forward (by hand or in CI once billing is restored),
  instead of the check silently being a no-op.
- **Verdict: PASS**, with the lockfile gap fixed as part of this pass.

## alarm-api CORS default (fixed, defense-in-depth)

`services/alarm-api/server.js` defaulted `Access-Control-Allow-Origin` to `'*'` when
`ALARM_API_ALLOWED_ORIGIN` was unset. Checked whether this was live-exploitable in the actual running
deployment before assuming severity: `docker-compose.yaml:395` already sets
`ALARM_API_ALLOWED_ORIGIN: ${GRAFANA_ROOT_URL:-http://localhost:3000}` explicitly, so **the wildcard
fallback was never actually reached in this deployment** -- confirmed live via a direct in-container request
(`Access-Control-Allow-Origin: http://localhost:3000`, not `*`). This is a hardening fix for an
insecure-by-default fallback (any future/alternate deployment that omits this compose override would have
been wide open), not a fix for an actively-exploited gap.

Fixed: default changed from `'*'` to omitting the header entirely when unset (`null`), which denies
cross-origin reads by default instead of allowing them. Verified after rebuild: `docker compose build
alarm-api && docker compose up -d --no-deps alarm-api`, container healthy, OPTIONS preflight still returns
`204` with the correct `Access-Control-Allow-Origin: http://localhost:3000` / `Access-Control-Allow-Methods:
GET, POST, OPTIONS` for the real configured origin -- no functional regression.

## Auth gate (re-verified live, not from memory)

- `services/alarm-api/server.js`'s write endpoints (`POST /alarms/ack`, `POST /alarms/resolve`) have no
  app-level auth middleware of their own -- confirmed again this pass, unchanged from prior audits.
- Re-verified the two mitigations still hold: `proxy/nginx.conf`'s `/alarm-api/` location still has
  `auth_request /auth-check;` (confirmed live: unauthenticated `curl -X OPTIONS
  http://localhost:3000/alarm-api/alarms/ack` returns `401` at the proxy, never reaching alarm-api), and
  `docker-compose.yaml`'s `alarm-api` service still has no host port mapping (only `4000/tcp` exposed
  internally, per `docker compose ps`) -- not directly reachable, bypassing the proxy gate is not currently
  possible from outside the docker network.
- **Verdict: mitigated at the network layer, app-layer auth still absent.** Unchanged finding from prior
  audits -- not fixed this pass (adding real app-level session/token auth is a design decision -- what
  identity system, how operators authenticate -- not a one-line fix, and no evidence surfaced this session
  that the existing proxy-layer mitigation has actually failed).

## TLS / transport

- `proxy/nginx.conf` listens on plain HTTP only (`listen 80;`), no TLS termination configured anywhere in
  the stack. No HSTS, CSP, X-Frame-Options, or other hardening headers set.
- **Disclosed, not fixed.** This is consistent with the system's stated deployment context (an internal
  factory-floor kiosk/TV-wall network, not internet-facing), but that's an assumption this session has no
  direct evidence to confirm or deny -- flagged explicitly rather than silently accepted or silently
  "fixed" by inventing a TLS setup (certificates, hostnames, and the operator's actual network boundary are
  decisions outside this session's evidence).

## Credentials still placeholder (unchanged, disclosed again)

`GRAFANA_ADMIN_PASSWORD=change-me-please` in `.env` -- unchanged since first disclosed in the prior audit.
Not fixed here: rotating it to a real secret is a deployment/credential decision for whoever operates this
instance, not something this session can invent a value for.

## Verdict

| Check | Result |
| --- | --- |
| Secret exposure (full history scan) | PASS (0 leaks, gitleaks, 1003 commits) |
| Dependency vulnerabilities | PASS (0 across both services, alarm-api lockfile gap fixed) |
| CORS default | FIXED (hardened; was never live-exploitable due to existing compose override) |
| Write-endpoint auth | MITIGATED at network layer; app-layer gap disclosed, unchanged, not fixed |
| TLS/transport hardening | NOT PRESENT; disclosed, not fixed (deployment-context assumption, not this session's call) |
| Admin credential rotation | NOT DONE; disclosed, not fixed (needs a real secret from the operator) |

**CONDITIONAL GO.** No newly-found live-exploitable defect. Two real gaps remain open and are explicitly
the operator's decision, not a code fix: rotate `GRAFANA_ADMIN_PASSWORD` before any real deployment, and
decide whether this network boundary genuinely doesn't need TLS or whether it does.
