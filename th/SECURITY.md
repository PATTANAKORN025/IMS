# นโยบายความปลอดภัย (Security Policy)

> **นโยบายความปลอดภัยของ IMS (Infrastructure Monitoring System)**
> ทราบข้อจำกัดและแผนแก้ไขก่อน deploy ไปยัง Production

---

<div align="center">

<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Security:** Policy
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Status:** Staging
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Updated:** 2026-08-04

</div>

---

## ข้อจำกัดที่ทราบ (Known Limitations)

| #   | ปัญหา (Issue)                                                         | ความรุนแรง (Severity) | สถานะ (Status)       | แผนการแก้ไข (Fix Plan)                                                                              |
| --- | --------------------------------------------------------------------- | --------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | พอร์ต PgBouncer ถูกเปิดเผยบนโฮสต์                                     | ️ ปานกลาง (Medium)     | ทราบแล้ว (Known)     | ผูกเฉพาะ localhost หรือใช้ reverse proxy                                                            |
| 2   | Node-RED Admin UI ไม่มีระบบยืนยันตัวตน                                | สูง (High)            | ทราบแล้ว (Known)     | เพิ่ม `adminAuth` ใน settings.js ก่อนขึ้น production                                                |
| 3   | SNMP community string อยู่ในรูปแบบข้อความธรรมดา (plain text)          | ️ ปานกลาง (Medium)     | ทราบแล้ว (Known)     | ย้ายไปไว้ในตัวแปรสภาพแวดล้อม (environment variable)                                                 |
| 4   | PgBouncer ใช้ AUTH_TYPE: plain                                        | ️ ปานกลาง (Medium)     | ทราบแล้ว (trade-off) | พิจารณาการทำแฮชรหัสผ่านที่ต้นทาง                                                                    |
| 5   | มีการฝัง GitHub PAT ใน `.mimocode/mimocode.json` (การตั้งค่า AI tool) | สูง (High)            | ทราบแล้ว (Known)     | ยกเลิก token ที่ GitHub; แทนที่ด้วย placeholder ตัวแปรสภาพแวดล้อม `${GITHUB_PERSONAL_ACCESS_TOKEN}` |

---

## รายการตรวจสอบการเสริมความปลอดภัยสำหรับ Production

### ก่อนให้สิทธิ์การเข้าถึงเครือข่าย

- [x] PgBouncer ไม่มีการผูกพอร์ตกับโฮสต์ — ไม่เคยมีการเปิดเผยใน `docker-compose.yaml` หลัก ไม่ใช่การเปลี่ยนแปลงใน prod-overlay
- [ ] เปิดใช้งาน Node-RED adminAuth (สร้าง bcrypt hash)
- [x] Grafana ไม่สามารถเข้าถึงได้โดยตรงจากโฮสต์ — `docker-compose.yaml` ไม่ได้กำหนดพอร์ตโฮสต์ให้กับมันเลย; บริการ `proxy` (nginx) เป็นเพียงจุดเข้าถึงเดียวที่เปิดเผย (พอร์ต 3000) ซึ่งจะอยู่หน้าทั้ง Grafana และ `alarm-api` และควบคุมการเข้าถึงส่วนหลังผ่านการตรวจสอบ `auth_request` กับ session ของ Grafana เอง (ดูที่ `docs/architecture/SECURITY_MODEL.md`)
- [ ] ทบทวน Docker secrets ทั้งหมดในไดเรกทอรี `secrets/`
- [ ] เปิดใช้งาน SNMPv3 สำหรับอุปกรณ์ production (แทนที่ v2c)

### ก่อนเชื่อมต่อกับเครื่องจักรจริง

- [ ] ตรวจสอบการยืนยันตัวตนและการเข้ารหัสของ SNMPv3
- [ ] ทดสอบขั้นตอนการหมุนเวียน community string
- [ ] ตรวจสอบสิทธิ์การเข้าถึง OID ทั้งหมด
- [ ] เปิดใช้งาน audit logging บนอุปกรณ์เป้าหมาย

### แนวทางปฏิบัติด้านความปลอดภัยอย่างต่อเนื่อง

- [ ] หมุนเวียน Docker secrets ทุกไตรมาส
- [ ] ติดตามการอัปเดต CVE ใน base images
- [ ] ทบทวนผลการสแกน Gitleaks ทุกสัปดาห์
- [ ] ตรวจสอบบันทึกการเข้าถึง (access logs) ของ Prometheus/Alertmanager

---

## ️ การควบคุมความปลอดภัย

### ความปลอดภัยเครือข่าย

| การควบคุม (Control)              | การดำเนินการ (Implementation)                                  |
| -------------------------------- | -------------------------------------------------------------- |
| **การแยก Container (Isolation)** | Docker bridge network — บริการต่างๆ สื่อสารกันผ่าน DNS         |
| **ไม่เปิดเผยพอร์ตโฮสต์**         | บริการภายในสามารถเข้าถึงได้เฉพาะภายในเครือข่าย Docker เท่านั้น |
| **SNMP Community**               | ใช้ community string แบบอิงไฟล์ (ไม่ได้ฝังโค้ดไว้ใน flows)     |
| **การจัดการความลับ (Secrets)**   | ใช้ Docker secrets ในไดเรกทอรี `secrets/` (อยู่ใน gitignore)   |

### ความปลอดภัยแอปพลิเคชัน

| การควบคุม (Control)            | การดำเนินการ (Implementation)                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **การป้องกัน SQL Injection**   | ใช้ `safeStr()` escape การป้อนข้อมูลจากผู้ใช้ทั้งหมด                                                                 |
| **การหมุนเวียนข้อมูลประจำตัว** | ต้องหมุนเวียนด้วยตนเองสำหรับ `flows_cred.json` ที่หมดอายุ                                                            |
| **ความปลอดภัย CI/CD**          | การสแกนด้วย Gitleaks, ใช้ stub secrets สำหรับการตรวจสอบ                                                              |
| **นโยบายปลั๊กอิน**             | ใช้เฉพาะ plugins/MCP/skills ที่เป็น open-source เท่านั้น (MIT/ISC/BSD/Apache-2.0) — ตรวจสอบกับรายการปัจจุบันด้านล่าง |

### ความปลอดภัยข้อมูล

| การควบคุม (Control)           | การดำเนินการ (Implementation)                       |
| ----------------------------- | --------------------------------------------------- |
| **การเข้าถึงฐานข้อมูล**       | PgBouncer connection pooling พร้อมการยืนยันตัวตน    |
| **การเข้ารหัสการสำรองข้อมูล** | ฐานข้อมูลที่ถูกดัมพ์ควรได้รับการเข้ารหัสก่อนจัดเก็บ |
| **การทำความสะอาด Log**        | ไม่มีการบันทึกข้อมูลความลับใน Docker container logs |

---

## ความปลอดภัยเครื่องมือ AI (MCP / Skills / Plugins)

### รายการห่วงโซ่อุปทานของ Agent

เครื่องมือ AI ทั้งหมดเป็น open-source (MIT / Apache-2.0) ตามนโยบายปลั๊กอิน (Plugin Policy) ตำแหน่งการติดตั้ง: `.agents/skills/` (universal), `.mimocode/` (MiMo Code), `.claude/skills/` + `.github/skills/` (Claude Code / Copilot symlinks)

| รายการ (Item)        | รายละเอียด (Inventory)                                                                                                                                                                                                            | แหล่งที่มา (Sources)                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **MCP servers (12)** | context7, playwright, puppeteer, github, filesystem, everything, sequential-thinking, memory, fetch, postgres, git, time — mirrored in `.mimocode/mimocode.json`, `.mcp.json`, `.opencode/opencode.json`, `.vscode/settings.json` | modelcontextprotocol/servers, PyPI (`mcp-server-fetch/time/git`), npm (`@modelcontextprotocol/server-*`) |
| **Skills (90)**      | 26 ภายใน (เฉพาะ IMS) + 41 mattpocock/skills + 9 vercel-labs/agent-skills + 14 obra/superpowers                                                                                                                                    | github.com/mattpocock/skills, vercel-labs/agent-skills, obra/superpowers (ทั้งหมดเป็น MIT)               |
| **Plugins (8)**      | `superpowers@git+…` entries ใน `.mimocode/mimocode.json` (obra, mattpocock, vercel-labs, garrytan/gstack, addyosmani, wshobson/agents, affaan-m/ECC, pcvelz)                                                                      | ทั้งหมดเป็น MIT, open-source                                                                             |

### ข้อมูลความลับในการตั้งค่าเครื่องมือ AI

- `.mimocode/mimocode.json` และ `.vscode/settings.json` **อยู่ใน gitignore** — local tokens อาจอยู่ที่นี่ แต่ยังคงต้องปฏิบัติต่อสิ่งเหล่านี้เหมือนเป็นข้อมูลความลับและหมุนเวียนหากมีการแชร์
- `.mcp.json` และ `.opencode/opencode.json` **ถูกติดตามโดย git** — ต้องใช้ placeholders ตัวแปรสภาพแวดล้อม `${VAR}` (เช่น `${GITHUB_PERSONAL_ACCESS_TOKEN}`, `${POSTGRES_PASSWORD}`) ห้ามใส่ข้อมูลประจำตัว (credentials) โดยตรง
- MCP Python servers จำเป็นต้อง **กำหนดเวอร์ชัน SDK เป็น `mcp==X.Y.Z`** อย่างชัดเจนใน launch args (ดู `knowledge.md`) — การกำหนดเวอร์ชันอย่างชัดเจนช่วยป้องกันไม่ให้ความคลาดเคลื่อนของห่วงโซ่อุปทานมาทำลายหรือแย่งการควบคุม toolchain

### ️ แพ็กเกจ Typosquat / Canary — ห้ามติดตั้งเด็ดขาด

แพ็กเกจ npm ชื่อ `mcp-server-fetch` และ `mcp-server-git` เป็น **canaries สำหรับงานวิจัยด้านความปลอดภัย** (`node-canaries` / `npx-canary`) ที่ปลอมตัวเป็น MCP servers ของจริง ห้ามติดตั้งแพ็กเกจเหล่านี้ไม่ว่าในกรณีใดๆ — ให้ใช้แพ็กเกจอย่างเป็นทางการของ PyPI (`uvx mcp-server-*`) หรือแพ็กเกจ npm `@modelcontextprotocol/server-*` แทน ตรวจสอบผู้ดูแลแพ็กเกจ (maintainer) + พื้นที่เก็บข้อมูล (repository) เสมอก่อนเพิ่มลงในการตั้งค่า AI ใดๆ

---

## การรายงานช่องโหว่ (Reporting Vulnerabilities)

หากคุณค้นพบช่องโหว่ด้านความปลอดภัย:

1. **ห้าม** เปิด Issue บน GitHub แบบสาธารณะ
2. ส่งอีเมลถึงทีมรักษาความปลอดภัยโดยตรง หรือใช้การรายงานช่องโหว่แบบส่วนตัวของ GitHub
3. รวมข้อมูลดังนี้: คำอธิบาย ขั้นตอนในการจำลองปัญหา (steps to reproduce) และผลกระทบที่อาจเกิดขึ้น
4. โปรดให้เวลา 48 ชั่วโมงสำหรับการตอบกลับในเบื้องต้น

---

## เอกสารอ้างอิง (References)

- [แนวทางปฏิบัติด้านความปลอดภัยของ Docker](https://docs.docker.com/engine/security/)
- [ความปลอดภัยของ PostgreSQL](https://www.postgresql.org/docs/current/auth.html)
- [ความปลอดภัยของ SNMPv3](https://datatracker.ietf.org/doc/html/rfc3411)
- [ความปลอดภัยของ Grafana](https://grafana.com/docs/grafana/latest/setup-grafana/security/)

---

<div align="center">

**นโยบายความปลอดภัยของ IMS — เวอร์ชัน 1.0**

_กรุณาทบทวนก่อนการ deploy ขึ้น production ทุกครั้ง_

</div>
