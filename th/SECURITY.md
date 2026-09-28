# นโยบายความปลอดภัย

> **นโยบายความปลอดภัยของ IMS (Industrial Monitoring System)**
> อ่านข้อจำกัดที่ทราบและแผนแก้ไขก่อน deploy ขึ้นระบบจริง

---

<div align="center">

<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **เอกสาร:** นโยบายความปลอดภัย
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **สถานะ:** ก่อนใช้งานจริง (Pre-production)
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **ปรับปรุงล่าสุด:** 2026-09-28 (ตรวจทานเทียบกับ `main`)

</div>

---

## การรายงานช่องโหว่

หากพบช่องโหว่ด้านความปลอดภัย:

1. **ห้าม** เปิด issue, pull request หรือ discussion สาธารณะบน GitHub
2. รายงานแบบส่วนตัวผ่านแท็บ **Security** ของ repository (GitHub private vulnerability reporting) หรือติดต่อผู้ดูแลโดยตรง
3. ระบุคำอธิบาย ขั้นตอนทำซ้ำ ส่วนประกอบที่ได้รับผลกระทบ และผลกระทบที่อาจเกิด ห้ามแนบ credential จริงหรือข้อมูลการผลิตในรายงาน
4. จะได้รับการตอบกลับครั้งแรกภายใน 48 ชั่วโมง

เฉพาะ branch `main` เท่านั้นที่ได้รับการแก้ไขด้านความปลอดภัย

---

## Repository นี้เป็นแบบสาธารณะ

ทุกสิ่งที่ commit ไว้ที่นี่ — รวมถึงประวัติ git ทั้งหมดและทุก branch ที่ push — เป็นข้อมูลสาธารณะ และอาจถูก cache หรือ fork ไปแล้ว การลบในภายหลังไม่ได้ทำให้กลับเป็นข้อมูลส่วนตัว ห้าม commit สิ่งต่อไปนี้:

- `.env` หรือ credential, token, key หรือรหัสผ่านจริงใด ๆ (หากหลุดเข้า commit แม้ครั้งเดียว ต้องเปลี่ยนทันที)
- ข้อมูลการผลิต: dump ฐานข้อมูล, ไฟล์ CSV ที่ export, ไฟล์ export ของแดชบอร์ดที่มีค่าจริง (ถูกกันโดย .gitignore: `*.csv`, `*.parquet`, `*.dump`, `/vcp/`)
- ไฟล์ CAD ของชั้น 1 หรือสิ่งใดที่ได้มาจากไฟล์เหล่านั้น: ขนาด พิกัด พื้นที่ ชื่อ layer ข้อความบนป้าย
- รหัสเครื่องจักรหรือรหัสไลน์จริง เลข lot หรือเลข job ชื่อ host ภายใน และ IP address ภายใน
- ข้อมูลส่วนบุคคล (ชื่อ อีเมล หมายเลขโทรศัพท์)

ตัวสแกนข้อมูลลับใน CI (`tests/lint/private-data-leak-scanner.js`) ตรวจจับจาก **path ของไฟล์เท่านั้น** จึงต้องทบทวนทุก diff เพื่อหาเนื้อหาข้างต้นก่อน push

---

## ข้อจำกัดที่ทราบ

| # | ปัญหา | ความรุนแรง | สถานะ | แผนแก้ไข |
| --- | --- | --- | --- | --- |
| 1 | ค่าทุกค่าใน `.env.example` เป็นข้อมูลสาธารณะ | สูง | ทราบแล้ว | สร้างค่าใหม่ให้ทุก secret ก่อนการติดตั้งจริงทุกครั้ง (ดู [คู่มือผู้ดูแลระบบ](docs/admin/ADMIN_MANUAL.md#รายการตรวจความปลอดภัยก่อนใช้งานจริง)) |
| 2 | pgAdmin เปิดพอร์ต `5050` บนทุก interface และใช้ image tag `latest` | ปานกลาง | ทราบแล้ว | bind ไว้ที่ `127.0.0.1` หรือกั้นด้วยไฟร์วอลล์ และระบุ image tag ตายตัว |
| 3 | ประตูหน้า nginx ให้บริการเป็น HTTP ธรรมดา | ปานกลาง | ทราบแล้ว | ทำ TLS termination หน้าหรือภายใน `ims-proxy` |
| 4 | SNMP v2c community string เก็บรายอุปกรณ์ใน `public.devices` เป็นข้อความธรรมดา | ปานกลาง | ทราบแล้ว | ย้ายอุปกรณ์ที่ใช้งานจริงไปใช้ SNMPv3 (authPriv) |
| 5 | PgBouncer ใช้ `auth_type = plain` | ปานกลาง | ทราบแล้ว (ข้อแลกเปลี่ยน) | ใช้เฉพาะเครือข่ายภายใน และพิจารณาใช้ SCRAM ตลอดเส้นทาง |
| 6 | `observability-archiver` mount `/var/run/docker.sock` | ปานกลาง | ทราบแล้ว | flag `:ro` ไม่ได้จำกัดการเรียก Docker API ให้ถือว่าคอนเทนเนอร์นี้มีสิทธิ์สูง หรือเลิก mount |
| 7 | การสแกน secret ใน CI ไม่บล็อกการ build และตรวจเฉพาะ working tree (`gitleaks --no-git ... \|\| true`) | ปานกลาง | ทราบแล้ว | ทำให้บล็อกได้และสแกนประวัติ (`gitleaks detect` โดยไม่ใช้ `--no-git`) และสแกนประวัติเต็มบนเครื่องก่อน push |
| 8 | image ของ Grafana image renderer ใช้ tag `latest` | ต่ำ | ทราบแล้ว | ระบุ image tag ตายตัว |
| — | พอร์ต TimescaleDB เปิดบน host | — | **แก้แล้ว** | `docker-compose.yaml` หลักปิดคอมเมนต์การเปิดพอร์ตของ TimescaleDB ไว้; ฐานข้อมูลทำงานเฉพาะภายในเครือข่าย Docker |
| — | พอร์ต PgBouncer เปิดบน host | — | **แก้แล้ว** | `docker-compose.yaml` หลักไม่เคยเปิดพอร์ตของ PgBouncer |
| — | Node-RED editor ไม่มีการยืนยันตัวตน | — | **แก้แล้ว** | `nodered_data/settings.js` ไม่ยอมเริ่มหากไม่ได้ตั้ง `NODE_RED_ADMIN_PASSWORD_HASH` และพอร์ต editor bind ไว้ที่ `127.0.0.1` |

---

## รายการตรวจการเสริมความปลอดภัยก่อนใช้งานจริง

### ก่อนเปิดให้เข้าถึงผ่านเครือข่าย

- [x] TimescaleDB และ PgBouncer ไม่มีการ bind พอร์ตบน host (ทำงานเฉพาะเครือข่ายภายใน)
- [x] Node-RED editor ต้องมี hash รหัสผ่านผู้ดูแลและ bind ไว้ที่ `127.0.0.1`
- [x] Grafana ไม่มีพอร์ตบน host; service `proxy` (nginx) เป็นทางเข้า UI เพียงทางเดียวที่พอร์ต 3000 เป็นด่านหน้าของ Grafana, `alarm-api`, Factory Twin และ endpoint รับข้อมูล LDI โดย `alarm-api` และทวินต้องผ่านการตรวจ `auth_request` กับ session ของ Grafana (ดู `docs/architecture/SECURITY_MODEL.md`)
- [ ] แทนค่าทุกค่าที่คัดลอกจาก `.env.example` ด้วย secret ที่สร้างใหม่
- [ ] จำกัด pgAdmin (`5050`) ไว้เฉพาะ host หรือเครือข่ายผู้ดูแลระบบ
- [ ] เพิ่ม TLS หน้าประตูหน้า nginx
- [ ] เปิดใช้ SNMPv3 กับอุปกรณ์ที่ใช้งานจริง (แทน v2c)

### ก่อนเชื่อมต่อกับเครื่องจักรจริง

- [ ] ตรวจการยืนยันตัวตนและการเข้ารหัสของ SNMPv3
- [ ] ทดสอบขั้นตอนเปลี่ยน community string / credential
- [ ] ตรวจสิทธิ์การเข้าถึง OID ทั้งหมด
- [ ] เปิด audit log บนอุปกรณ์ปลายทาง

### แนวปฏิบัติด้านความปลอดภัยต่อเนื่อง

- [ ] เปลี่ยน secret อย่างน้อยทุกไตรมาส และทันทีเมื่อสงสัยว่าถูกเปิดเผย
- [ ] เฝ้าระวัง CVE ของ base image (`node scripts/production-assurance.js --profile=security`)
- [ ] ทบทวนผลการสแกน secret ในทุก pull request
- [ ] ตรวจ access log ของ Prometheus/Alertmanager

---

## มาตรการควบคุมความปลอดภัย

### ความปลอดภัยของเครือข่าย

| มาตรการ | การนำไปใช้ |
| --- | --- |
| **การแยกคอนเทนเนอร์** | เครือข่าย Docker bridge (`ims-internal`, `ims-monitoring`); service สื่อสารกันด้วยชื่อ DNS |
| **เปิดสู่ host ให้น้อยที่สุด** | มีเพียงประตูหน้า nginx (3000) และ pgAdmin (5050) ที่รับการเชื่อมต่อบนทุก interface ส่วน Node-RED, Prometheus, Alertmanager และ Blackbox bind ไว้ที่ `127.0.0.1` โดย TimescaleDB และ PgBouncer ไม่มีการเปิดพอร์ตสู่ host |
| **การรับข้อมูลที่ยืนยันตัวตน** | `/ldi-telemetry` และ `/inject` ต้องส่ง header `x-api-key` ที่ตรงกับ `INGEST_API_KEY` |
| **การจัดการ secret** | `.env` (อยู่ใน .gitignore) ส่งผ่านตัวแปรบังคับ `${VAR:?}` ของ Docker Compose ไม่มีการอ่านจากไดเรกทอรี `secrets/` |

### ความปลอดภัยของแอปพลิเคชัน

| มาตรการ | การนำไปใช้ |
| --- | --- |
| **ป้องกัน SQL injection** | ใช้ parameterised query ใน service; ใช้ `safeStr()` escape ใน function node ของ Node-RED |
| **role ฐานข้อมูลสิทธิ์น้อยที่สุด** | `grafana_reader` (อ่านอย่างเดียว) สำหรับ Grafana, `alarm_api_writer` (`SELECT`+`UPDATE` บน `ldi_alarm_lifecycle` เท่านั้น) สำหรับ `alarm-api` |
| **credential ของ Node-RED** | `pg_config` ใช้ฟิลด์ผู้ใช้/รหัสผ่านแบบ environment; credential ของ flow เข้ารหัสด้วย `NODE_RED_CREDENTIAL_SECRET` |
| **ความปลอดภัยของ CI/CD** | ตัวสแกน path ข้อมูลลับ, linter ความสะอาดของ repository, gitleaks (ดูข้อจำกัดข้อ 7), secret ตัวอย่างสำหรับตรวจ compose |
| **นโยบาย plugin** | ใช้เฉพาะ plugin, MCP server และ skill แบบโอเพนซอร์ส (MIT/ISC/BSD/Apache-2.0) |

### ความปลอดภัยของข้อมูล

| มาตรการ | การนำไปใช้ |
| --- | --- |
| **การเข้าถึงฐานข้อมูล** | connection pooling ผ่าน PgBouncer พร้อมการยืนยันตัวตน ไม่มีพอร์ตฐานข้อมูลเปิดบน host |
| **การสำรองข้อมูล** | `scripts/backup-db.sh` เขียนลง `./backups/` (อยู่ใน .gitignore) ต้องเข้ารหัส dump ก่อนนำออกจาก host |
| **การกรองข้อมูลใน log** | ไม่มี secret ใน log ของคอนเทนเนอร์ วินิจฉัยปัญหาการยืนยันตัวตนด้วยการตรวจว่าตั้งค่าตัวแปรไว้หรือไม่ ห้ามพิมพ์ค่าออกมา |

---

## ความปลอดภัยของเครื่องมือ AI (MCP / Skills / Plugins)

### ตำแหน่งการตั้งค่าเครื่องมือ AI

| ตำแหน่ง | git ติดตามหรือไม่ | กฎ |
| --- | --- | --- |
| `.agents/skills/`, `.clinerules/`, `.cursor/`, `.windsurf/`, `.superpowers/`, `skills-lock.json`, `AGENTS.md`, `CLAUDE.md` | ติดตาม — เป็นสาธารณะ | ใส่ได้เฉพาะคำสั่ง ห้ามใส่ token ชื่อ host credential ข้อมูลโรงงาน หรือข้อมูลส่วนบุคคล |
| `.mimocode/`, `.opencode/`, `.mcp.json`, `.claude/`, `.vscode/settings.json`, `ABOUT-ME.md`, `START.md`, `CONTEXT.md` | ไม่ติดตาม — อยู่ใน .gitignore | token บนเครื่องอาจอยู่ที่นี่ได้ แต่ต้องถือเป็น secret ห้าม force-add ไฟล์เหล่านี้ และต้องเปลี่ยน token ที่เคยแชร์ |

MCP server ที่เขียนด้วย Python ควรเริ่มด้วย SDK ที่ระบุเวอร์ชันตายตัว `mcp==X.Y.Z` เพื่อไม่ให้การเปลี่ยนแปลงใน supply chain เปลี่ยนเครื่องมือโดยไม่รู้ตัว

### แพ็กเกจ Typosquat / Canary — ห้ามติดตั้งเด็ดขาด

แพ็กเกจ npm `mcp-server-fetch` และ `mcp-server-git` เป็น **canary สำหรับงานวิจัยด้านความปลอดภัย** (`node-canaries` / `npx-canary`) ที่ปลอมเป็น MCP server จริง ห้ามติดตั้งไม่ว่ากรณีใด — ให้ใช้แพ็กเกจทางการจาก PyPI (`uvx mcp-server-*`) หรือ npm `@modelcontextprotocol/server-*` แทน และตรวจผู้ดูแลกับ repository ของแพ็กเกจทุกครั้งก่อนเพิ่มลงในการตั้งค่า AI ใด ๆ

---

## ข้อมูลอ้างอิง

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [PostgreSQL Client Authentication](https://www.postgresql.org/docs/current/auth.html)
- [SNMPv3 Architecture (RFC 3411)](https://datatracker.ietf.org/doc/html/rfc3411)
- [Grafana Security](https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/)

---

<div align="center">

**IMS Security Policy — เวอร์ชัน 1.1**

_ทบทวนก่อน deploy ขึ้นระบบจริงทุกครั้ง_

</div>
