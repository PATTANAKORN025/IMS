<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# IMS — Comprehensive Audit Report

> **ARCHIVED — historical snapshot, dated 2026-08-04.** ไม่ใช่เอกสารที่ใช้งานอยู่ (living documentation); ตัวเลขด้านล่าง (จำนวนแดชบอร์ด จำนวนการไมเกรชัน จำนวนพาเนล ฯลฯ) สะท้อนถึงระบบที่ดำรงอยู่ ณ วันที่ดังกล่าว และเป็นที่ทราบว่าล้าสมัยแล้วเมื่อเทียบกับระบบปัจจุบัน ถูกเก็บไว้เพื่อเป็นบันทึกทางประวัติศาสตร์ตาม docs/archive/README.md สำหรับข้อมูลปัจจุบัน โปรดดูที่ docs/architecture/ARCHITECTURE.md และ docs/architecture/DASHBOARD_INVENTORY.md

> วันที่: 2026-08-04
> ตรวจสอบโดย: Buffy (Freebuff AI) — การตรวจสอบโปรเจกต์แบบครอบคลุม
> ขอบเขต: Security, Database, Node-RED, Grafana, CI/CD, Docker, Tests

---

## Executive Summary

การตรวจสอบแบบครอบคลุมใน 7 โดเมนของโปรเจกต์พบปัญหาทั้งหมด **12 ปัญหา** ซึ่งแบ่งเป็นประเภทต่างๆ ดังนี้:

| Severity | Count | Status                                      |
| -------- | ----- | ------------------------------------------- |
| CRITICAL | 1     | ต้องแก้ไขทันที                              |
| HIGH     | 2     | ต้องแก้ไขก่อนที่จะปรับใช้ในขั้นตอนการผลิต   |
| MEDIUM   | 4     | แก้ไขตามความสำคัญ                           |
| LOW      | 5     | บันทึกเป็นเอกสาร, ไม่เร่งด่วน               |

**คะแนนรวม: 7/10** — ระบบมีความเสถียรที่ดี แต่มีช่องโหว่ด้านความปลอดภัยที่จำเป็นต้องได้รับการแก้ไข

---

## 1. CRITICAL: Security — Leaked GitHub Token

**ปัญหา:** GitHub Personal Access Token ถูกเปิดเผยในไฟล์ `.mimocode/mimocode.json`

```text
"GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_***REDACTED***"
```

**ความเสี่ยง:**

- ไฟล์นี้ถูก gitignore — อย่างไรก็ตาม หากพื้นที่เก็บข้อมูล (repository) ถูกแชร์หรือรั่วไหล โทเค็นสามารถถูกนำไปใช้หาผลประโยชน์ได้ทันที
- โทเค็นนี้ให้สิทธิ์การเข้าถึงพื้นที่เก็บข้อมูลบน GitHub
- หากโทเค็นยังคงทำงานอยู่ บุคคลที่ไม่ได้รับอนุญาตสามารถนำไปใช้ได้

**แผนการแก้ไข:**

1. **การดำเนินการทันที:** เพิกถอนโทเค็นบน GitHub (Settings → Developer settings → Personal access tokens → Delete)
2. **การดำเนินการทันที:** แทนที่ด้วย placeholder `${GITHUB_PERSONAL_ACCESS_TOKEN}` ใน `mimocode.json`
3. **การตรวจสอบ:** ตรวจสอบว่าโทเค็นนี้ถูกใช้งานอย่างประสงค์ร้ายหรือไม่ (ตรวจสอบ GitHub audit log)

**สถานะ:** ยังไม่ได้รับการแก้ไข

---

## 2. HIGH: No Auto-Rollback in CI/CD

**ปัญหา:** ไปป์ไลน์ CI/CD (`ci.yml`) ขาดกลไกการย้อนกลับอัตโนมัติ (auto-rollback) เมื่อการตรวจสอบล้มเหลว

**สถานะปัจจุบัน:**

- Lint → Unit Tests → Integration/Chaos → Summary
- ไม่มีงาน deployment (การ deployment ดำเนินการด้วยตนเองผ่าน `make deploy-flows`)
- ไม่มีงาน rollback

**ความเสี่ยง:**

- หากมีการดำเนินการ deployment และการตรวจสอบล้มเหลว จำเป็นต้องทำการ rollback ด้วยตนเอง → ช้า เสี่ยงต่อข้อผิดพลาดของมนุษย์
- ขาด audit trail (บันทึกการตรวจสอบ) ว่าอะไรถูก deploy ไปและเมื่อใด

**แผนการแก้ไข:**

1. ใช้งาน (implement) deployment job ที่ทริกเกอร์เมื่อมีการพุชไปที่ branch `main` โดยมีการเปลี่ยนแปลงในพาธ `nodered_data/flows/*.json`
2. ใช้งาน auto-rollback job ที่จะทำงานเมื่อพบว่าการตรวจสอบล้มเหลว
3. บันทึกประวัติการ deployment ภายใน GitHub Actions

**สถานะ:** ยังไม่ได้รับการแก้ไข

---

## 3. HIGH: Missing Node-RED Auth in `.env`

**ปัญหา:** `NODE_RED_ADMIN_PASSWORD_HASH` ว่างเปล่าใน `.env.example` → Node-RED จะทำงานล้มเหลวหากไม่ได้รับการกำหนดค่า

**สถานะปัจจุบัน:**

- `settings.js` ประกอบด้วย `adminAuth` + ลอจิก fail-safe (ปฏิเสธที่จะเริ่มต้นระบบหากไม่มี hash)
- `.env.example` ขาดค่าเริ่มต้น → ต้องทำการสร้าง hash ก่อนเริ่มการทำงาน

**ความเสี่ยง:**

- การดำเนินการ `make up` โดยไม่มีการกำหนดค่า → Node-RED ค้าง
- หากใช้รหัสผ่านที่ง่ายเกินไป → เสี่ยงต่อการเข้าถึงโดยไม่ได้รับอนุญาต

**แผนการแก้ไข:**

1. เพิ่มคำแนะนำใน `README.md` โดยระบุข้อกำหนดในการสร้าง hash ก่อนการดำเนินการ `make up`
2. พิจารณากำหนด default hash (สำหรับโหมดการพัฒนาเท่านั้น) ใน `.env.example`

**สถานะ:** บรรเทาลงบางส่วนแล้ว (มีระบบ fail-safe อยู่แล้ว)

---

## 4. MEDIUM: Hardcoded Test Keys in CI

**ปัญหา:** มีการฮาร์ดโค้ด `INGEST_API_KEY: ims-secret-key` ใน `.github/workflows/ci.yml`

**สถานะปัจจุบัน:**

- ถูกใช้งานเฉพาะใน CI integration tests
- ไม่ใช่คีย์สำหรับการผลิต (production key)

**ความเสี่ยง:**

- ต่ำ — สภาพแวดล้อม CI แยกออกจาก production
- อย่างไรก็ตาม หากที่เก็บข้อมูล GitHub กลายเป็นสาธารณะ (public) คีย์นี้ก็จะถูกเปิดเผย

**แผนการแก้ไข:**

1. ใช้ GitHub Secrets แทน: `${{ secrets.INGEST_API_KEY }}`
2. หรือ ยอมรับให้เป็นคีย์ทดสอบเฉพาะ ซึ่งถูกแยกออกจากการผลิตอย่างเคร่งครัด

**สถานะ:** รับทราบแล้ว ยอมรับได้สำหรับ CI

---

## 5. MEDIUM: K6 Test Hardcoded Passwords

**ปัญหา:** `.github/workflows/k6-test.yml` มีรหัสผ่านสำหรับทดสอบแบบฮาร์ดโค้ด

```yaml
echo "test-password" > secrets/postgres_password.txt
echo "test-password" > secrets/grafana_admin_password.txt
```

**สถานะปัจจุบัน:**

- ถูกใช้งานเฉพาะใน CI K6 tests
- ไม่ใช่รหัสผ่านสำหรับการผลิต

**ความเสี่ยง:**

- ต่ำ — ถูกจำกัดอยู่ภายในสภาพแวดล้อม CI
- อย่างไรก็ตาม หากที่เก็บข้อมูล GitHub กลายเป็นสาธารณะ (public) รหัสผ่านเหล่านี้ก็จะถูกเปิดเผย

**สถานะ:** รับทราบแล้ว ยอมรับได้สำหรับ CI

---

## 6. MEDIUM: `dashboard.html` XSS Risk

**ปัญหา:** `dashboard.html` มีการใช้งาน `innerHTML` มากกว่า 24 ครั้ง

**สถานะปัจจุบัน:**

- ทำงานเป็นไฟล์ HTML แบบ standalone สำหรับจัดการแดชบอร์ด
- ไม่ใช่แอปพลิเคชันเว็บที่ประมวลผลอินพุตของผู้ใช้
- ทำงานบน localhost เท่านั้น

**ความเสี่ยง:**

- ต่ำ — ไม่มีเส้นทางอินพุตของผู้ใช้ที่จะฉีด (inject) เพย์โหลด XSS
- อย่างไรก็ตาม หากมีการปรับเปลี่ยนให้รับอินพุตจากผู้ใช้ในอนาคต มันจะก่อให้เกิดความเสี่ยงด้านความปลอดภัย

**สถานะ:** ความเสี่ยงต่ำ บันทึกไว้แล้ว

---

## 7. MEDIUM: SNMP Simulator Exposed on 0.0.0.0

**ปัญหา:** `docker-compose.yaml` มีการกำหนด `--agent-udpv4-endpoint=0.0.0.0:${SNMP_PORT:-161}`

**สถานะปัจจุบัน:**

- โปรแกรมจำลอง SNMP ทำงานเฉพาะภายในเครือข่าย Docker
- พอร์ตไม่ได้ถูกเชื่อมโยง (mapped) ไปยังเครื่องโฮสต์

**ความเสี่ยง:**

- ต่ำ — ถูกกักกันอยู่ภายในเครือข่ายภายในของ Docker
- อย่างไรก็ตาม หากมีการเปิดพอร์ต (port mapping) ในอนาคต มันจะก่อให้เกิดความเสี่ยงด้านความปลอดภัย

**สถานะ:** ความเสี่ยงต่ำ บันทึกไว้แล้ว

---

## 8. LOW: Database Migration Gaps

**ปัญหา:** ไมเกรชันบางตัวมี statement ที่อ่านไม่ได้เป็นจำนวน 0 ตัว

**สถานะปัจจุบัน:**

- `028-ldi-spc-nelson-rules.sql` — 0 statements
- `030-ldi-machine-snapshot-view.sql` — 0 statements
- `031-ldi-event-timeline.sql` — 0 statements
- `040-register-ldi-devices.sql` — 0 statements

**ความเสี่ยง:**

- ต่ำ — เหล่านี้อาจประกอบด้วยคอมเมนต์ หรือโครงสร้าง SQL ที่ซับซ้อนซึ่ง parser ไม่สามารถจับได้
- อย่างไรก็ตาม จำเป็นต้องตรวจสอบให้แน่ใจว่าไมเกรชันเหล่านี้สามารถทำงานได้อย่างถูกต้อง

**สถานะ:** บันทึกไว้แล้ว ควรทำการตรวจสอบ

---

## 9. LOW: `.opencode/opencode.json` Untracked

**ปัญหา:** `.opencode/opencode.json` เป็นไฟล์ใหม่ที่ถูกสร้างขึ้นโดยไม่มีการติดตาม (untracked) ใน git

**สถานะปัจจุบัน:**

- ถูกสร้างขึ้นในระหว่างเซสชันปัจจุบัน
- ไม่มีข้อมูลความลับ (ใช้ตัวแทน `${VAR}`)

**ความเสี่ยง:**

- ต่ำ — การ commit โดยไม่ตั้งใจจะนำเข้าไฟล์ที่ไม่จำเป็น
- ไม่มีความเสี่ยงด้านความปลอดภัยโดยตรง

**สถานะ:** บันทึกไว้แล้ว ควรทำ gitignore

---

## 10. LOW: `.mcp.json` Untracked

**ปัญหา:** `.mcp.json` เป็นไฟล์ใหม่ที่ถูกสร้างขึ้นโดยไม่มีการติดตามใน git

**สถานะปัจจุบัน:**

- ถูกสร้างขึ้นในระหว่างเซสชันปัจจุบัน
- ไม่มีข้อมูลความลับ (ใช้ตัวแทน `${VAR}`)

**ความเสี่ยง:**

- ต่ำ — การ commit โดยไม่ตั้งใจจะนำเข้าไฟล์ที่ไม่จำเป็น
- ไม่มีความเสี่ยงด้านความปลอดภัยโดยตรง

**สถานะ:** บันทึกไว้แล้ว ควรทำ gitignore

---

## 11. LOW: Gitleaks Scan Has `|| true`

**ปัญหา:** `.github/workflows/ci.yml` มีคำสั่ง `|| true` ต่อท้ายจากขั้นตอนสแกนของ gitleaks

```yaml
docker run --rm ... gitleaks detect ... || true
```

**สถานะปัจจุบัน:**

- การสแกน Gitleaks จะไม่ทำให้ pipeline ล้มเหลวหากตรวจพบข้อมูลรั่วไหล
- นี่คือความตั้งใจ — กำหนดค่าเพื่อให้ pipeline ทำงานต่อไปได้

**ความเสี่ยง:**

- ต่ำ — การสแกน gitleaks ยังคงทำงานปกติ เพียงแต่มันหลีกเลี่ยงที่จะทำให้ build ล้มเหลว
- อย่างไรก็ตาม การรั่วไหลจริงจะไม่ทำให้ pipeline หยุดชะงักในทันที

**สถานะ:** บันทึกไว้แล้ว เป็นการตัดสินใจในการออกแบบ (design choice)

---

## 12. LOW: CI Summary Shows `|| true` for Chaos

**ปัญหา:** `.github/workflows/ci.yml` มีคำสั่ง `|| true` ต่อท้ายจากการทดสอบ chaos (K6)

```yaml
/scripts/chaos-stress.js ... || true
```

**สถานะปัจจุบัน:**

- การทดสอบ Chaos จะไม่ทำให้ pipeline ล้มเหลวแม้อัตราข้อผิดพลาด (error rate) จะสูงก็ตาม
- นี่คือความตั้งใจ — กำหนดค่าเพื่อให้ pipeline ทำงานต่อไปได้

**ความเสี่ยง:**

- ต่ำ — การทดสอบยังคงทำงานปกติ เพียงแต่มันหลีกเลี่ยงที่จะทำให้ build ล้มเหลว
- อย่างไรก็ตาม อัตราข้อผิดพลาดที่สำคัญ จะไม่ทำให้ pipeline หยุดชะงักในทันที

**สถานะ:** บันทึกไว้แล้ว เป็นการตัดสินใจในการออกแบบ

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

| #   | Issue                            | Severity | Effort | Impact                                                                                                                |
| --- | -------------------------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Revoke leaked GitHub token       | CRITICAL | 5 min  | ป้องกันการเข้าถึงโดยไม่ได้รับอนุญาต                                                                                       |
| 2   | Add auto-rollback to CI/CD       | HIGH     | 2 hrs  | ป้องกัน deployment ที่เสียหาย                                                                                          |
| 3   | Add `.env.example` instructions  | HIGH     | 10 min | <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> ป้องกัน Node-RED ค้าง    |
| 4   | Move CI keys to GitHub Secrets   | MEDIUM   | 30 min | <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> แนวปฏิบัติที่ดีด้านความปลอดภัย |
| 5   | Add `.opencode/` to .gitignore   | MEDIUM   | 5 min  | <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> สถานะ git สะอาด          |
| 6   | Add `.mcp.json` to .gitignore    | MEDIUM   | 5 min  | <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> สถานะ git สะอาด          |
| 7   | Verify zero-statement migrations | LOW      | 30 min | <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> ความสมบูรณ์ของข้อมูล      |
| 8   | Review gitleaks `\|\| true`      | LOW      | 15 min | <img src="../../../docs/assets/icons/circle-check.svg" width="18" height="18" align="center" /> การมองเห็นด้านความปลอดภัย  |

---

## Recommendations

### Immediate (This Week)

1. **Revoke GitHub token** — ดำเนินการทันที (5 นาที)
2. **Add auto-rollback** — สร้าง rollback job ใน `ci.yml`
3. **Update .env.example** — เพิ่มคำแนะนำเกี่ยวกับ `NODE_RED_ADMIN_PASSWORD_HASH`

### Short-term (This Month)

1. **Move CI secrets** — ใช้ GitHub Secrets แทนค่าฮาร์ดโค้ด
2. **Gitignore new files** — เพิ่ม `.opencode/` และ `.mcp.json` ลงใน `.gitignore`
3. **Verify migrations** — ดำเนินการไมเกรชัน 028, 030, 031, 040 แบบ manual

### Long-term (Next Quarter)

1. **Add E2E tests** — รวมการทดสอบ end-to-end เข้าไว้ใน CI pipeline
2. **SNMPv3 migration** — เปลี่ยนผ่านจาก v2c ไปสู่ v3
3. **Audit logging** — ใช้งานระบบติดตามผลแบบ audit trail สำหรับการทำงานของผู้ดูแลระบบ

---

<div align="center">

**IMS Audit Report — Version 1.0**

_Created: 2026-08-04 | Auditor: Buffy (Freebuff AI)_

_Next audit: 2026-11-04 (quarterly)_

</div>
