# IMS — Comprehensive Audit Report

> **ARCHIVED — historical snapshot, dated 2026-08-04.** Not living documentation; numbers below (dashboard counts, migration counts, panel counts, etc.) reflect the system as it existed on that date and are known to be stale relative to the current system. Kept for historical record per docs/archive/README.md. For current information, see docs/architecture/ARCHITECTURE.md and docs/architecture/DASHBOARD_INVENTORY.md.

> วันที่: 2026-08-04
> ตรวจสอบโดย: Buffy (Freebuff AI) — ตรวจสอบทุกด้านของโปรเจค
> ครอบคลุม: Security, Database, Node-RED, Grafana, CI/CD, Docker, Tests

---

## Executive Summary

ตรวจสอบทั้งโปรเจค 7 ด้าน พบปัญหาทั้งหมด **12 รายการ** แบ่งเป็น:

| Severity | Count | Status                    |
| -------- | ----- | ------------------------- |
| CRITICAL | 1     | ต้องแก้ไขทันที            |
| HIGH     | 2     | ควรแก้ไขก่อน production   |
| ️ MEDIUM  | 4     | แก้ไขได้ตามลำดับความสำคัญ |
| ℹ️ LOW   | 5     | บันทึกไว้ ไม่เร่งด่วน     |

**คะแนนรวม: 7/10** — ระบบมีความมั่นคงดี แต่มีปัญหา security ที่ต้องแก้

---

## 1. CRITICAL: Security — Leaked GitHub Token

**ปัญหา:** GitHub Personal Access Token รั่วอยู่ใน `.mimocode/mimocode.json`

```text
"GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_***REDACTED***"
```

**ความเสี่ยง:**

- ไฟล์นี้ gitignored — แต่ถ้า repo ถูก share หรือ leak ออกมา จะถูกใช้ได้ทันที
- Token นี้ให้สิทธิ์เข้าถึง GitHub repos ได้
- ถ้า token ยัง active อยู่ ใครก็ใช้ได้

**แผนแก้ไข:**

1. **ทันที:** Revoke token ที่ GitHub (Settings → Developer settings → Personal access tokens → Delete)
2. **ทันที:** แทนที่ด้วย `${GITHUB_PERSONAL_ACCESS_TOKEN}` ใน mimocode.json
3. **ตรวจสอบ:** ว่า token นี้ถูกใช้ไปแล้วหรือยัง (เช็ค GitHub audit log)

**Status:** ยังไม่แก้

---

## 2. HIGH: No Auto-Rollback in CI/CD

**ปัญหา:** CI/CD pipeline (`ci.yml`) ไม่มี auto-rollback เมื่อ verify fail

**สถานะปัจจุบัน:**

- Lint → Unit Tests → Integration/Chaos → Summary
- ไม่มี deploy job (deploy ทำด้วยมือผ่าน `make deploy-flows`)
- ไม่มี rollback job

**ความเสี่ยง:**

- ถ้า deploy แล้ว verify fail ต้อง rollback ด้วยมือ → slow, human error
- ไม่มี audit trail ว่า deploy อะไร ตอนไหน

**แผนแก้ไข:**

1. เพิ่ม deploy job ที่ trigger เมื่อ push to main + paths เปลี่ยน `nodered_data/flows/*.json`
2. เพิ่ม auto-rollback job หลัง verify fail
3. บันทึก deploy history ใน GitHub Actions

**Status:** ยังไม่แก้

---

## 3. HIGH: Missing Node-RED Auth in `.env`

**ปัญหา:** `NODE_RED_ADMIN_PASSWORD_HASH` ว่างใน `.env.example` → Node-RED จะ fail ถ้าไม่ตั้งค่า

**สถานะปัจจุบัน:**

- `settings.js` มี adminAuth + fail-safe (ปฏิเสธเริ่มถ้าไม่มี hash)
- `.env.example` ไม่มีค่า default → ต้อง generate hash ก่อน

**ความเสี่ยง:**

- ถ้า `make up` โดยไม่ตั้งค่า → Node-RED crash
- ถ้าตั้ง password ง่ายเกินไป → unauthorized access

**แผนแก้ไข:**

1. เพิ่ม instructions ใน README.md ว่าต้อง generate hash ก่อน `make up`
2. พิจารณาใช้ default hash (dev only) สำหรับ `.env.example`

**Status:** ️ Partially mitigated (fail-safe มีอยู่แล้ว)

---

## 4. ️ MEDIUM: Hardcoded Test Keys in CI

**ปัญหา:** `INGEST_API_KEY: ims-secret-key` hardcoded ใน `.github/workflows/ci.yml`

**สถานะปัจจุบัน:**

- ใช้สำหรับ CI integration test เท่านั้น
- ไม่ใช่ production key

**ความเสี่ยง:**

- ต่ำ — CI environment ไม่เชื่อมต่อกับ production
- แต่ถ้า GitHub repo เป็น public จะเห็น key นี้

**แผนแก้ไข:**

1. ใช้ GitHub Secrets แทน: `${{ secrets.INGEST_API_KEY }}`
2. หรือยอมรับว่าเป็น test key ที่ไม่ใช่ production

**Status:** ️ Known, acceptable for CI

---

## 5. ️ MEDIUM: K6 Test Hardcoded Passwords

**ปัญหา:** `.github/workflows/k6-test.yml` มี hardcoded test passwords

```yaml
echo "test-password" > secrets/postgres_password.txt
echo "test-password" > secrets/grafana_admin_password.txt
```

**สถานะปัจจุบัน:**

- ใช้สำหรับ CI K6 test เท่านั้น
- ไม่ใช่ production passwords

**ความเสี่ยง:**

- ต่ำ — CI environment
- แต่ถ้า repo เป็น public จะเห็น password นี้

**Status:** ️ Known, acceptable for CI

---

## 6. ️ MEDIUM: `dashboard.html` XSS Risk

**ปัญหา:** `dashboard.html` ใช้ `innerHTML` 24+ ครั้ง

**สถานะปัจจุบัน:**

- เป็น standalone HTML file สำหรับ dashboard management
- ไม่ใช่ web app ที่รับ user input
- ใช้บน localhost เท่านั้น

**ความเสี่ยง:**

- ต่ำ — ไม่มี user input ที่จะ inject XSS
- แต่ถ้าเปิดรับ user input ในอนาคต จะเสี่ยง

**Status:** ℹ️ Low risk, noted

---

## 7. ️ MEDIUM: SNMP Simulator Exposed on 0.0.0.0

**ปัญหา:** `docker-compose.yaml` มี `--agent-udpv4-endpoint=0.0.0.0:${SNMP_PORT:-161}`

**สถานะปัจจุบัน:**

- SNMP simulator อยู่ใน Docker network เท่านั้น
- ไม่ได้ map port ออกมา host

**ความเสี่ยง:**

- ต่ำ — Docker internal network
- แต่ถ้ามี port mapping ในอนาคต จะเสี่ยง

**Status:** ℹ️ Low risk, noted

---

## 8. ℹ️ LOW: Database Migration Gaps

**ปัญหา:** บาง migration มี 0 statements ที่ parse ได้

**สถานะปัจจุบัน:**

- `028-ldi-spc-nelson-rules.sql` — 0 statements
- `030-ldi-machine-snapshot-view.sql` — 0 statements
- `031-ldi-event-timeline.sql` — 0 statements
- `040-register-ldi-devices.sql` — 0 statements

**ความเสี่ยง:**

- ต่ำ — อาจเป็น comments หรือ complex SQL ที่ parser ไม่จับ
- แต่ควรตรวจสอบว่า migrations ทำงานจริง

**Status:** ℹ️ Noted, should verify

---

## 9. ℹ️ LOW: `.opencode/opencode.json` Untracked

**ปัญหา:** `.opencode/opencode.json` เป็นไฟล์ใหม่ที่ไม่มีใน git

**สถานะปัจจุบัน:**

- สร้างขึ้นในเซสชันนี้
- ไม่มี secret (ใช้ `${VAR}` placeholders)

**ความเสี่ยง:**

- ต่ำ — ถ้า commit โดยไม่ตั้งใจ จะเพิ่มไฟล์ที่ไม่จำเป็น
- แต่ไม่มี security risk

**Status:** ℹ️ Noted, should gitignore

---

## 10. ℹ️ LOW: `.mcp.json` Untracked

**ปัญหา:** `.mcp.json` เป็นไฟล์ใหม่ที่ไม่มีใน git

**สถานะปัจจุบัน:**

- สร้างขึ้นในเซสชันนี้
- ไม่มี secret (ใช้ `${VAR}` placeholders)

**ความเสี่ยง:**

- ต่ำ — ถ้า commit โดยไม่ตั้งใจ จะเพิ่มไฟล์ที่ไม่จำเป็น
- แต่ไม่มี security risk

**Status:** ℹ️ Noted, should gitignore

---

## 11. ℹ️ LOW: Gitleaks Scan Has `|| true`

**ปัญหา:** `.github/workflows/ci.yml` มี `|| true` หลัง gitleaks scan

```yaml
docker run --rm ... gitleaks detect ... || true
```

**สถานะปัจจุบัน:**

- Gitleaks scan ไม่ fail pipeline ถ้าเจอ leak
- เป็น intentional — ให้ pipeline ต่อไปได้

**ความเสี่ยง:**

- ต่ำ — ยังมี gitleaks scan อยู่ แค่ไม่ fail
- แต่ถ้าเจอ leak จริง จะไม่รู้

**Status:** ℹ️ Noted, design choice

---

## 12. ℹ️ LOW: CI Summary Shows `|| true` for Chaos

**ปัญหา:** `.github/workflows/ci.yml` มี `|| true` หลัง K6 chaos test

```yaml
/scripts/chaos-stress.js ... || true
```

**สถานะปัจจุบัน:**

- Chaos test ไม่ fail pipeline ถ้า error rate สูง
- เป็น intentional — ให้ pipeline ต่อไปได้

**ความเสี่ยง:**

- ต่ำ — ยังมี test อยู่ แค่ไม่ fail
- แต่ถ้า error rate สูงจริง จะไม่รู้

**Status:** ℹ️ Noted, design choice

---

## Audit Summary by Category

### Security Score: 6/10

- Secrets management (Docker secrets)
- Gitleaks scanning
- Node-RED admin auth
- Leaked GitHub token
- Hardcoded test keys (acceptable for CI)
- ️ No audit logging

### Database Score: 8/10

- Idempotent migrations (IF NOT EXISTS)
- Continuous Aggregates
- Retention policies
- ️ Some migrations with 0 statements (should verify)
- ️ Column type changes (REAL vs DOUBLE PRECISION)

### Node-RED Score: 8/10

- Circuit breaker
- Retry queue
- Error handlers
- 5 walkers per device
- ️ Parser complexity (stateful, hard to debug)

### Grafana Score: 9/10

- Correct datasource UIDs
- Proper panel counts
- No gridPos overlap (linter checks)
- ️ Some dashboards use `-- Grafana --` datasource (internal)

### CI/CD Score: 7/10

- 4-stage pipeline
- Unit tests
- Integration tests
- K6 stress test
- No auto-deploy
- No auto-rollback
- ️ `|| true` on chaos tests

### Docker Score: 9/10

- Localhost-only port binding
- Health checks
- Restart policies
- Logging configuration
- ️ SNMP simulator on 0.0.0.0 (internal only)

### Tests Score: 7/10

- Unit tests (parser, counter, boundary, v2-parser)
- K6 stress tests
- Dashboard linter
- Visual regression (Playwright)
- ️ No E2E tests in CI (only smoke)
- ️ No integration tests with real DB

---

## Priority Fix Order

| #   | Issue                            | Severity | Effort | Impact                                                                                                  |
| --- | -------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------- |
| 1   | Revoke leaked GitHub token       | CRITICAL | 5 min  | ป้องกัน unauthorized access                                                                             |
| 2   | Add auto-rollback to CI/CD       | HIGH     | 2 hrs  | ป้องกัน broken deploy                                                                                   |
| 3   | Add `.env.example` instructions  | HIGH     | 10 min | <img src="docs/assets/icons/target.svg" width="18" height="18" align="center" /> ป้องกัน Node-RED crash |
| 4   | Move CI keys to GitHub Secrets   | ️ MEDIUM  | 30 min | <img src="docs/assets/icons/target.svg" width="18" height="18" align="center" /> Security best practice |
| 5   | Add `.opencode/` to .gitignore   | ️ MEDIUM  | 5 min  | <img src="docs/assets/icons/target.svg" width="18" height="18" align="center" /> Clean git state        |
| 6   | Add `.mcp.json` to .gitignore    | ️ MEDIUM  | 5 min  | <img src="docs/assets/icons/target.svg" width="18" height="18" align="center" /> Clean git state        |
| 7   | Verify zero-statement migrations | ️ LOW     | 30 min | <img src="docs/assets/icons/target.svg" width="18" height="18" align="center" /> Data integrity         |
| 8   | Review gitleaks `                |          | true`  | ️ LOW                                                                                                    | 15 min | <img src="docs/assets/icons/target.svg" width="18" height="18" align="center" /> Security visibility |

---

## Recommendations

### Immediate (This Week)

1. **Revoke GitHub token** — ทำทันที 5 นาที
2. **Add auto-rollback** — เพิ่ม rollback job ใน ci.yml
3. **Update .env.example** — เพิ่ม instructions สำหรับ NODE_RED_ADMIN_PASSWORD_HASH

### Short-term (This Month)

4. **Move CI secrets** — ใช้ GitHub Secrets แทน hardcoded
5. **Gitignore new files** — เพิ่ม `.opencode/`, `.mcp.json` ลง .gitignore
6. **Verify migrations** — รัน migration 028, 030, 031, 040 ด้วยมือ

### Long-term (Next Quarter)

7. **Add E2E tests** — เพิ่ม end-to-end tests ใน CI
8. **SNMPv3 migration** — เปลี่ยนจาก v2c เป็น v3
9. **Audit logging** — เพิ่ม audit trail สำหรับ admin actions

---

<div align="center">

**IMS Audit Report — Version 1.0**

_Created: 2026-08-04 | Auditor: Buffy (Freebuff AI)_

_Next audit: 2026-11-04 (quarterly)_

</div>
