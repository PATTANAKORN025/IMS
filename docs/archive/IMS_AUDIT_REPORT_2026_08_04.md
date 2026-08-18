# IMS — Comprehensive Audit Report

> **ARCHIVED — historical snapshot, dated 2026-08-04.** Not living documentation; numbers below (dashboard counts, migration counts, panel counts, etc.) reflect the system as it existed on that date and are known to be stale relative to the current system. Kept for historical record per docs/archive/README.md. For current information, see docs/architecture/ARCHITECTURE.md and docs/architecture/DASHBOARD_INVENTORY.md.

> Date: 2026-08-04
> Audited by: Buffy (Freebuff AI) — Comprehensive project audit
> Scope: Security, Database, Node-RED, Grafana, CI/CD, Docker, Tests

---

## Executive Summary

A comprehensive audit across 7 project domains identified a total of **12 issues**, categorized as follows:

| Severity | Count | Status |
| -------- | ----- | ------------------------- |
| CRITICAL | 1 | Immediate resolution required |
| HIGH | 2 | Must resolve prior to production deployment |
| MEDIUM | 4 | Resolve according to priority |
| LOW | 5 | Documented, non-urgent |

**Overall Score: 7/10** — The system exhibits solid stability, but contains security vulnerabilities that require remediation.

---

## 1. CRITICAL: Security — Leaked GitHub Token

**Issue:** A GitHub Personal Access Token is leaked in `.mimocode/mimocode.json`.

```text
"GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_***REDACTED***"
```

**Risks:**

- This file is gitignored — however, if the repository is shared or leaked, the token can be exploited immediately.
- This token grants access permissions to GitHub repositories.
- If the token remains active, it can be utilized by unauthorized parties.

**Remediation Plan:**

1. **Immediate Action:** Revoke the token on GitHub (Settings → Developer settings → Personal access tokens → Delete).
2. **Immediate Action:** Replace it with the `${GITHUB_PERSONAL_ACCESS_TOKEN}` placeholder in `mimocode.json`.
3. **Verification:** Verify whether this token has been utilized maliciously (check the GitHub audit log).

**Status:** Unresolved

---

## 2. HIGH: No Auto-Rollback in CI/CD

**Issue:** The CI/CD pipeline (`ci.yml`) lacks an auto-rollback mechanism upon verification failure.

**Current State:**

- Lint → Unit Tests → Integration/Chaos → Summary
- No deployment job exists (deployment is executed manually via `make deploy-flows`).
- No rollback job exists.

**Risks:**

- If a deployment is executed and verification fails, manual rollback is required → slow, susceptible to human error.
- Lack of an audit trail regarding what was deployed and when.

**Remediation Plan:**

1. Implement a deployment job triggered upon a push to the `main` branch with changes to the path `nodered_data/flows/*.json`.
2. Implement an auto-rollback job following a verification failure.
3. Record deployment history within GitHub Actions.

**Status:** Unresolved

---

## 3. HIGH: Missing Node-RED Auth in `.env`

**Issue:** `NODE_RED_ADMIN_PASSWORD_HASH` is empty in `.env.example` → Node-RED will fail if not configured.

**Current State:**

- `settings.js` contains `adminAuth` + fail-safe logic (refuses to start if the hash is absent).
- `.env.example` lacks a default value → requires generating a hash prior to execution.

**Risks:**

- Executing `make up` without configuration → Node-RED crashes.
- Utilizing an overly simplistic password → risk of unauthorized access.

**Remediation Plan:**

1. Add instructions in `README.md` specifying the requirement to generate a hash prior to executing `make up`.
2. Consider implementing a default hash (for development only) in `.env.example`.

**Status:** Partially mitigated (fail-safe is already in place)

---

## 4. MEDIUM: Hardcoded Test Keys in CI

**Issue:** `INGEST_API_KEY: ims-secret-key` is hardcoded in `.github/workflows/ci.yml`.

**Current State:**

- Utilized exclusively for CI integration tests.
- Not a production key.

**Risks:**

- Low — The CI environment is isolated from production.
- However, if the GitHub repository becomes public, this key will be exposed.

**Remediation Plan:**

1. Utilize GitHub Secrets instead: `${{ secrets.INGEST_API_KEY }}`.
2. Alternatively, accept this as a designated test key strictly decoupled from production.

**Status:** Known, acceptable for CI

---

## 5. MEDIUM: K6 Test Hardcoded Passwords

**Issue:** `.github/workflows/k6-test.yml` contains hardcoded test passwords.

```yaml
echo "test-password" > secrets/postgres_password.txt
echo "test-password" > secrets/grafana_admin_password.txt
```

**Current State:**

- Utilized exclusively for CI K6 tests.
- Not production passwords.

**Risks:**

- Low — Isolated to the CI environment.
- However, if the repository becomes public, these passwords will be exposed.

**Status:** Known, acceptable for CI

---

## 6. MEDIUM: `dashboard.html` XSS Risk

**Issue:** `dashboard.html` utilizes `innerHTML` 24+ times.

**Current State:**

- Functions as a standalone HTML file for dashboard management.
- Not a web application that processes user input.
- Executed exclusively on localhost.

**Risks:**

- Low — No user input vectors exist to inject XSS payloads.
- However, if modified to accept user input in the future, it will pose a security risk.

**Status:** Low risk, noted

---

## 7. MEDIUM: SNMP Simulator Exposed on 0.0.0.0

**Issue:** `docker-compose.yaml` contains `--agent-udpv4-endpoint=0.0.0.0:${SNMP_PORT:-161}`.

**Current State:**

- The SNMP simulator operates exclusively within the Docker network.
- The port is not mapped to the host machine.

**Risks:**

- Low — Contained within the internal Docker network.
- However, if port mapping is introduced in the future, it will pose a security risk.

**Status:** Low risk, noted

---

## 8. LOW: Database Migration Gaps

**Issue:** Certain migrations contain 0 parsable statements.

**Current State:**

- `028-ldi-spc-nelson-rules.sql` — 0 statements
- `030-ldi-machine-snapshot-view.sql` — 0 statements
- `031-ldi-event-timeline.sql` — 0 statements
- `040-register-ldi-devices.sql` — 0 statements

**Risks:**

- Low — These may consist of comments or complex SQL constructs not captured by the parser.
- However, it is necessary to verify that these migrations execute correctly.

**Status:** Noted, should verify

---

## 9. LOW: `.opencode/opencode.json` Untracked

**Issue:** `.opencode/opencode.json` is a newly generated file untracked in git.

**Current State:**

- Created during the current session.
- Contains no secrets (utilizes `${VAR}` placeholders).

**Risks:**

- Low — Accidental commits will introduce unnecessary files.
- No direct security risk.

**Status:** Noted, should gitignore

---

## 10. LOW: `.mcp.json` Untracked

**Issue:** `.mcp.json` is a newly generated file untracked in git.

**Current State:**

- Created during the current session.
- Contains no secrets (utilizes `${VAR}` placeholders).

**Risks:**

- Low — Accidental commits will introduce unnecessary files.
- No direct security risk.

**Status:** Noted, should gitignore

---

## 11. LOW: Gitleaks Scan Has `|| true`

**Issue:** `.github/workflows/ci.yml` contains `|| true` following the gitleaks scan.

```yaml
docker run --rm ... gitleaks detect ... || true
```

**Current State:**

- The Gitleaks scan does not fail the pipeline if a leak is detected.
- This is intentional — configured to allow the pipeline to proceed.

**Risks:**

- Low — The gitleaks scan is still operational, it simply avoids failing the build.
- However, actual leaks will not trigger immediate pipeline halts.

**Status:** Noted, design choice

---

## 12. LOW: CI Summary Shows `|| true` for Chaos

**Issue:** `.github/workflows/ci.yml` contains `|| true` following the K6 chaos test.

```yaml
/scripts/chaos-stress.js ... || true
```

**Current State:**

- The Chaos test does not fail the pipeline if the error rate is high.
- This is intentional — configured to allow the pipeline to proceed.

**Risks:**

- Low — The test remains operational, it simply avoids failing the build.
- However, significant error rates will not trigger immediate pipeline halts.

**Status:** Noted, design choice

---

## Audit Summary by Category

### Security Score: 6/10

- Secrets management (Docker secrets)
- Gitleaks scanning
- Node-RED admin auth
- Leaked GitHub token
- Hardcoded test keys (acceptable for CI)
- No audit logging

### Database Score: 8/10

- Idempotent migrations (IF NOT EXISTS)
- Continuous Aggregates
- Retention policies
- Some migrations with 0 statements (should verify)
- Column type changes (REAL vs DOUBLE PRECISION)

### Node-RED Score: 8/10

- Circuit breaker
- Retry queue
- Error handlers
- 5 walkers per device
- Parser complexity (stateful, hard to debug)

### Grafana Score: 9/10

- Correct datasource UIDs
- Proper panel counts
- No gridPos overlap (linter checks)
- Some dashboards use `-- Grafana --` datasource (internal)

### CI/CD Score: 7/10

- 4-stage pipeline
- Unit tests
- Integration tests
- K6 stress test
- No auto-deploy
- No auto-rollback
- `|| true` on chaos tests

### Docker Score: 9/10

- Localhost-only port binding
- Health checks
- Restart policies
- Logging configuration
- SNMP simulator on 0.0.0.0 (internal only)

### Tests Score: 7/10

- Unit tests (parser, counter, boundary, v2-parser)
- K6 stress tests
- Dashboard linter
- Visual regression (Playwright)
- No E2E tests in CI (only smoke)
- No integration tests with real DB

---

## Priority Fix Order

| # | Issue | Severity | Effort | Impact |
| --- | -------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| 1 | Revoke leaked GitHub token | CRITICAL | 5 min | Prevent unauthorized access |
| 2 | Add auto-rollback to CI/CD | HIGH | 2 hrs | Prevent broken deployments |
| 3 | Add `.env.example` instructions | HIGH | 10 min | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> Prevent Node-RED crashes |
| 4 | Move CI keys to GitHub Secrets | MEDIUM | 30 min | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> Security best practice |
| 5 | Add `.opencode/` to .gitignore | MEDIUM | 5 min | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> Clean git state |
| 6 | Add `.mcp.json` to .gitignore | MEDIUM | 5 min | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> Clean git state |
| 7 | Verify zero-statement migrations | LOW | 30 min | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> Data integrity |
| 8 | Review gitleaks `\|\| true` | LOW | 15 min | <img src="docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> Security visibility |

---

## Recommendations

### Immediate (This Week)

1. **Revoke GitHub token** — Execute immediately (5 min)
2. **Add auto-rollback** — Implement rollback job in `ci.yml`
3. **Update .env.example** — Append instructions regarding `NODE_RED_ADMIN_PASSWORD_HASH`

### Short-term (This Month)

1. **Move CI secrets** — Utilize GitHub Secrets instead of hardcoded values
2. **Gitignore new files** — Append `.opencode/` and `.mcp.json` to `.gitignore`
3. **Verify migrations** — Execute migrations 028, 030, 031, 040 manually

### Long-term (Next Quarter)

1. **Add E2E tests** — Incorporate end-to-end tests into the CI pipeline
2. **SNMPv3 migration** — Transition from v2c to v3
3. **Audit logging** — Implement an audit trail for administrative actions

---

<div align="center">

**IMS Audit Report — Version 1.0**

_Created: 2026-08-04 | Auditor: Buffy (Freebuff AI)_

_Next audit: 2026-11-04 (quarterly)_

</div>
