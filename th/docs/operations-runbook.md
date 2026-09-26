<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# Runbook งานปฏิบัติการ IMS

**ขอบเขต:** คู่มืออ้างอิงสำหรับงานประจำวัน การแก้ไขปัญหา และการกู้คืนอย่างปลอดภัยของ stack Docker Compose ที่ใช้งานจริง ทุกคำสั่งด้านล่างติดป้ายระดับความเสี่ยงไว้ — อ่านป้ายก่อนรันทุกครั้ง

**ระดับความเสี่ยงของคำสั่ง:**
- 🟢 **อ่านอย่างเดียว (READ-ONLY)** — ตรวจดูสถานะ ไม่เปลี่ยนแปลงอะไร รันได้ทุกเมื่อ
- 🟡 **การกระทำที่ปลอดภัย (SAFE ACTION)** — ย้อนกลับได้ จำกัดขอบเขต ไม่มีข้อมูลสูญหาย (เช่น สร้างคอนเทนเนอร์ที่ไม่มีสถานะขึ้นใหม่หนึ่งตัว)
- 🔴 **กระทบระบบจริง (PRODUCTION-IMPACTING)** — ทำให้บริการหยุดชะงัก แตะต้องข้อมูลถาวร หรือย้อนกลับได้ไม่ง่าย ต้องใช้วิจารณญาณอย่างรอบคอบ ไม่ใช่งานประจำ

เอกสารนี้ไม่มีค่า credential จริงใด ๆ ดูหัวข้อ "การจัดการ credential/secret" ด้านล่างว่าค่าลับจริงเก็บไว้ที่ใดและจะวิเคราะห์ปัญหาโดยไม่ต้องพิมพ์ค่าออกมาได้อย่างไร

---

## 1. ภาพรวมสถาปัตยกรรมระบบ

การไหลของข้อมูล: `SNMP/HTTP → Node-RED → PgBouncer (transaction pooling) → TimescaleDB (hypertables/CAGGs) → Grafana` ตัวชี้วัดยังไหลตามเส้นทาง `Prometheus (scrape targets) → Alertmanager` และ `nginx` (`ims-proxy`) เป็นด่านหน้าให้ Grafana และ HTTP endpoint `/ldi-telemetry` ของ Node-RED

รายละเอียดสถาปัตยกรรมทั้งหมด: `docs/architecture/` (ดู `IMS_PLATFORM_BOOK.md` เป็นเอกสารอ้างอิงหลัก, `SECURITY_MODEL.md` สำหรับขอบเขตความเชื่อถือ, `DATA_FLOW.md` สำหรับไปป์ไลน์รับข้อมูล)

## 2. รายการคอนเทนเนอร์ / Service

| คอนเทนเนอร์ | บทบาท | มี healthcheck |
|---|---|---|
| `ims-timescaledb` | ฐานข้อมูลหลัก (PostgreSQL 16 + TimescaleDB) | มี |
| `ims-pgbouncer` | connection pooler หน้า TimescaleDB | มี |
| `ims-node-red` | ไปป์ไลน์รับข้อมูล (poll SNMP, HTTP `/ldi-telemetry`, batching, insert) | มี |
| `ims-proxy` | nginx — ด่านหน้าของ Grafana และ HTTP endpoint ของ Node-RED | มี |
| `ims-grafana` | แดชบอร์ด | มี |
| `ims-grafana-renderer` | service เรนเดอร์แบบ headless สำหรับ export ภาพและการแจ้งเตือนของ Grafana | มี |
| `ims-prometheus` | scrape และจัดเก็บตัวชี้วัด | ไม่มี (ตรวจผ่าน `/-/healthy`) |
| `ims-alertmanager` | กำหนดเส้นทางการแจ้งเตือน | ไม่มี (ตรวจผ่าน API) |
| `ims-blackbox` | Prometheus blackbox exporter (probe แบบ HTTP/TCP/ICMP) | ไม่มี |
| `ims-snmpsim` | ตัวจำลอง SNMP (อุปกรณ์เป้าหมายที่ไม่ใช่ของจริง) | ไม่มี |
| `ims-alarm-api` | service Node.js ที่พัฒนาเอง — API ด้าน alarm | มี |
| `ims-factory-twin-3d` | service Node.js ที่พัฒนาเอง — ดิจิทัลทวิน 3 มิติ | มี |
| `ims-observability-archiver` | งานเก็บถาวรเบื้องหลัง | ไม่มี |
| `ims-db-migrate` | ตัวรัน migration แบบครั้งเดียว (จบการทำงานหลัง apply migration ไม่ได้รันค้างไว้) | ไม่เกี่ยวข้อง |
| `ims-pgadmin4` | pgAdmin — หน้าจอจัดการฐานข้อมูล (ไม่อยู่บนเส้นทางข้อมูลขณะรัน) | โดยปกติไม่จำเป็นสำหรับงานปฏิบัติการ |

## 3. การตรวจสุขภาพ

🟢 **อ่านอย่างเดียว**

```bash
docker ps --format "{{.Names}}\t{{.Status}}"          # all containers, at a glance
docker inspect <container> --format "{{.State.Health.Status}}"
```

หรือใช้สคริปต์ตรวจสอบของ repository:

```bash
make verify                                                      # picks the right script for the OS
./scripts/verify-deployment.sh                                   # Linux / Git Bash — full deployment sanity check
powershell -ExecutionPolicy Bypass -File scripts\verify-deployment.ps1   # Windows — same
./scripts/verify-db-health.sh                                    # TimescaleDB-specific
powershell -ExecutionPolicy Bypass -File scripts\verify-db-health.ps1
```

หากต้องการผลประเมินความพร้อมแบบมีหลักฐานครบถ้วน (ไม่ใช่แค่ "ระบบขึ้นหรือยัง") ให้ใช้ `scripts/production-assurance.js` — ดูหัวข้อ 15 ด้านล่าง

## 4. การแก้ปัญหา Grafana

🟢 ตรวจ: `curl -o /dev/null -w "%{http_code}" http://127.0.0.1:${GRAFANA_PORT:-3000}/login` (ต้องได้ `200`)
🟢 ดู log: `docker logs ims-grafana --tail 100`
🟢 ตรวจการเชื่อมต่อ datasource: หน้า Grafana → Connections → Data sources → Test

อาการที่พบบ่อย: Grafana ตอบ `502` ผ่าน nginx หลังจากมีการสร้างคอนเทนเนอร์อื่นใหม่ (มักเป็น `ims-timescaledb`) เพราะ nginx จำ IP ของ upstream ที่ resolve ไว้ และไม่ resolve ใหม่เอง

🟡 **การกระทำที่ปลอดภัย** — วิธีแก้: `docker compose -p ims restart proxy` (เฉพาะ nginx ไม่มีสถานะ ไม่กระทบข้อมูล; `-p ims` ตรงกับ `COMPOSE_PROJECT_NAME` ใน `.env.example`) คำสั่ง `docker exec ims-proxy nginx -s reload` ให้ผลเหมือนกันโดยไม่ต้องรีสตาร์ต process

## 5. การแก้ปัญหา Node-RED

🟢 ดู log การเริ่มระบบ/flow: `docker logs ims-node-red --tail 100` — มองหา `Started flows` และบรรทัด `[error]`
🟢 ตรวจความสมบูรณ์ของ flow (ไม่มี node ID ซ้ำ): regression แบบ stack ทิ้งได้ `tests/fleet/runner.js` ทดสอบเรื่องนี้ตั้งแต่ต้นจนจบ (ดูหัวข้อ 11)
🟢 ตรวจการยืนยันตัวตน: หาก `/ldi-telemetry` ตอบ `401 Unauthorized` ทั้งที่ส่ง key ถูก แสดงว่า `INGEST_API_KEY` ใน `.env` กับฝั่งผู้เรียกไม่ตรงกัน — ห้ามวินิจฉัยด้วยการพิมพ์ค่า key ออกมา

🔴 **กระทบระบบจริง** — การสร้าง `ims-node-red` ใหม่ทำให้ข้อมูลขาดช่วงระหว่างที่ flow engine เริ่มต้นใหม่ (ในทางปฏิบัติสังเกตได้ประมาณ 2 นาที) ทำเฉพาะเมื่อต้องแก้จริง (เช่น เปลี่ยน flow หรือ image) ไม่ใช่เพื่อแก้ปัญหาทั่วไป:

```bash
docker compose -p ims up -d --no-deps node-red
```

## 6. การแก้ปัญหา PostgreSQL / TimescaleDB

🟢 การเชื่อมต่อ: `docker exec ims-timescaledb pg_isready -U $POSTGRES_USER -d $POSTGRES_DB`
🟢 connection ที่ active: `docker exec ims-timescaledb psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT count(*) FROM pg_stat_activity;"`
🟢 เวอร์ชัน extension (หลังเปลี่ยน image ของ TimescaleDB ทุกครั้ง): `SELECT extversion FROM pg_extension WHERE extname='timescaledb';`
🟢 สถานะ migration: `SELECT count(*) FROM public.schema_migrations;`

🔴 **กระทบระบบจริง** — การสร้าง `ims-timescaledb` ใหม่จะตัด connection ของทุก service ที่พึ่งพา (pgbouncer, Node-RED, Grafana, alarm-api) จนกว่าจะเชื่อมต่อใหม่ ในทางปฏิบัติมักกลับมาเองภายในไม่กี่วินาทีถึงประมาณ 30 วินาที แต่ต้องตรวจทุกครั้งว่า telemetry กลับมาไหลแล้ว (หัวข้อ 10) **หลังเปลี่ยนเวอร์ชัน image ของ TimescaleDB ต้องรัน `ALTER EXTENSION timescaledb UPDATE;` ด้วยตนเองทุกครั้ง** — การสลับ image อย่างเดียวไม่ได้อัปเดตเวอร์ชันใน catalog ของ extension ที่ติดตั้งอยู่

🔴 การ apply migration ใหม่: `./scripts/migrate.sh` — ทบทวนไฟล์ migration ก่อน เพราะเป็นการเปลี่ยน schema และย้อนกลับไม่ได้ง่าย ๆ หากไม่มี down-migration คู่กัน

## 7. การแก้ปัญหา Prometheus

🟢 สุขภาพ: `curl http://127.0.0.1:${PROMETHEUS_PORT:-9090}/-/healthy`
🟢 สถานะ target: `curl http://127.0.0.1:${PROMETHEUS_PORT:-9090}/api/v1/targets` — มองหารายการ `"health":"down"`
🟢 การเชื่อมกับ Alertmanager: `curl http://127.0.0.1:${PROMETHEUS_PORT:-9090}/api/v1/alertmanagers`

🟡 สร้างใหม่ (สลับแบบไม่มีสถานะ เช่น หลังแก้การตั้งค่า): `docker compose -p ims up -d --no-deps prometheus` สถานะการ scrape จะเริ่มใหม่ และ target ใช้เวลาหนึ่งรอบ scrape กว่าจะรายงานว่าปกติ — เป็นเรื่องที่คาดไว้ ไม่ใช่ความผิดพลาด

## 8. การแก้ปัญหา Alertmanager

🟢 สุขภาพ: `curl http://127.0.0.1:${ALERTMANAGER_PORT:-9093}/-/healthy`
🟢 การแจ้งเตือนที่ active: `curl http://127.0.0.1:${ALERTMANAGER_PORT:-9093}/api/v2/alerts`

bind ไว้ที่ `127.0.0.1` เท่านั้นตาม `docker-compose.yaml` — ตั้งใจไม่ให้เข้าถึงจากนอกเครื่อง host

## 9. การแก้ปัญหา nginx / proxy

🟢 ตรวจว่าโหลดการตั้งค่าได้โดยไม่มีข้อผิดพลาด: `docker logs ims-proxy --tail 50`
🟡 reload หลังแก้ไฟล์ตั้งค่า: ตรวจก่อนด้วย `docker exec ims-proxy nginx -t` แล้วจึง `docker exec ims-proxy nginx -s reload` (ไม่มีสถานะ; `proxy/nginx.conf` ถูก bind-mount ไว้)

ดูหัวข้อ 4 สำหรับอาการ IP ของ upstream ค้าง ซึ่งเป็นปัญหา nginx ที่พบบ่อยที่สุดใน stack นี้

## 10. การแก้ปัญหาการรับ Telemetry

🟢 จำนวนแถวล่าสุด (ใช้ตรวจความสมเหตุสมผล ไม่ใช่เกณฑ์เข้มงวด):

```sql
SELECT 'ldi_data', count(*) FROM public.ldi_data WHERE ingest_ts > now() - interval '5 minutes'
UNION ALL SELECT 'sys_metrics', count(*) FROM public.sys_metrics WHERE time > now() - interval '5 minutes'
UNION ALL SELECT 'net_metrics', count(*) FROM public.net_metrics WHERE time > now() - interval '5 minutes';
```

🟢 ตรวจข้อมูลซ้ำ: `SELECT log_id, count(*) FROM public.ldi_data WHERE ingest_ts > now() - interval '30 minutes' GROUP BY log_id HAVING count(*) > 1;` — ต้องได้ศูนย์แถว
🟢 แดชบอร์ด **IMS Pipeline Health & Meta-Monitoring** (`ims-meta-monitoring`) แสดงอัตรา insert อัตรา batch สำเร็จ ความลึกของคิว retry และสถานะ circuit breaker เป็นภาพ — ดูที่นี่ก่อน query ด้วยตนเอง

## อาการที่พบบ่อย → สาเหตุที่น่าจะเป็น

| อาการ | สาเหตุที่น่าจะเป็น | จุดที่ต้องดู |
|---|---|---|
| Grafana ตอบ `502` ผ่าน nginx | IP ของ upstream ใน nginx ค้างหลังคอนเทนเนอร์ที่พึ่งพาถูกสร้างใหม่ | หัวข้อ 4 |
| `/ldi-telemetry` ตอบ `401` | `INGEST_API_KEY` ไม่ตรงกัน | หัวข้อ 5 |
| `/ldi-telemetry` ตอบ `502` กับ batch จริง | ละเมิด FK — อุปกรณ์ยังไม่ได้ลงทะเบียนใน `public.devices` | ดู `docker logs ims-node-red` เพื่อหาชื่อ constraint ที่แน่นอน |
| `/ldi-telemetry` ตอบ `503` | insert ลง staging ล้มเหลว — เข้าถึง TimescaleDB/pgbouncer ไม่ได้ | หัวข้อ 6 แล้วตามด้วยหัวข้อ 9 |
| จำนวนแถว telemetry ไม่เพิ่ม | ไปป์ไลน์รับข้อมูลหยุดนิ่ง หรือ TimescaleDB/pgbouncer ล่ม | หัวข้อ 10 แล้วตามด้วยหัวข้อ 5–6 |
| มีแถว `log_id` ซ้ำ | regression จริง — ไม่ควรเกิดขึ้นเลย และ fleet regression แบบ stack ทิ้งได้ (หัวข้อ 11) ป้องกันเรื่องนี้ไว้โดยตรง | ยกระดับเหตุการณ์ — ดูหัวข้อ 16 |

## 11. ลำดับการรีสตาร์ตที่ปลอดภัย

เมื่อหลาย service ต้องได้รับการดูแล ให้รีสตาร์ตตามลำดับการพึ่งพา เพื่อหลีกเลี่ยงการเชื่อมต่อใหม่พร้อมกันแบบลูกโซ่:

1. `ims-timescaledb` (หากจำเป็นจริง — ดูหัวข้อ 6 ซึ่งกระทบระบบจริง)
2. `ims-pgbouncer`
3. `ims-node-red`
4. `ims-proxy` (ท้ายสุด เพื่อให้ได้ IP ของ upstream ใหม่ของทุกตัวข้างต้น)

**ห้ามรีสตาร์ตหลาย service ที่ไม่เกี่ยวข้องกันในคำสั่งเดียว** — สร้างคอนเทนเนอร์ใหม่ทีละตัว (ใช้ flag `--no-deps`) และตรวจสุขภาพก่อนไปตัวถัดไป

หลังการเปลี่ยนแปลงใด ๆ บนระบบจริง ให้รัน regression จริงซ้ำ:

```bash
node tests/fleet/runner.js
```

คำสั่งนี้สร้าง stack ที่แยกขาดและทิ้งได้ทั้งหมด (ชื่อ project พอร์ต และคอนเทนเนอร์แยกต่างหาก — ไม่แตะข้อมูลจริงเลย) และต้องผ่านครบ 9/9 รายการ: การรับอุปกรณ์ ความสมบูรณ์ของข้อมูล ข้อมูลซ้ำ ความต่อเนื่องของลำดับ ข้อมูลเสียหาย อัตราข้อผิดพลาด การบังคับยืนยันตัวตน การหมุนเวียน key และ HTTP status code ในเส้นทางที่ล้มเหลว

## 12. แนวทางการย้อนกลับ (Rollback)

สำหรับการเปลี่ยน tag ของ image (Node-RED, TimescaleDB, Prometheus ฯลฯ): เปลี่ยน tag ใน `docker-compose.yaml` กลับเป็นค่าที่ใช้งานได้ดีก่อนหน้า แล้วสร้างใหม่เฉพาะคอนเทนเนอร์นั้น (`--no-deps`) สำหรับ TimescaleDB โดยเฉพาะ ห้ามพยายามลดเวอร์ชัน extension ด้วย `ALTER EXTENSION` — การลดเวอร์ชัน extension ไม่ใช่การทำงานที่รองรับหรือย้อนกลับได้อย่างน่าเชื่อถือ หากการเปลี่ยน image ของ TimescaleDB ก่อปัญหาจริง ให้กู้คืนจาก backup แทน (หัวข้อ 13) แทนที่จะพยายามย้อนเวอร์ชัน extension ในที่เดิม

สำหรับ migration: ย้อนกลับได้ผ่าน down-migration ที่ถูกต้องเท่านั้นหากมีสำหรับ migration นั้น ห้ามแก้สถานะ schema ที่ apply ไปแล้วด้วยมือ

## 13. เอกสารอ้างอิงการสำรอง / กู้คืน

ขั้นตอนฉบับเต็ม: `docs/operations/BACKUP_RESTORE.md` สคริปต์: `scripts/backup-db.sh`, `scripts/restore-db.sh`, `scripts/dr-test.sh`, `scripts/dr-verify-restore.sh`

🔴 การกู้คืน **กระทบระบบจริง** โดยธรรมชาติและอาจเขียนทับข้อมูลปัจจุบัน — อ่านหัวข้อการตรวจสอบของ `BACKUP_RESTORE.md` (การเทียบจำนวนแถวก่อน/หลัง) ทุกครั้งก่อนรัน `restore-db.sh` กับสภาพแวดล้อมที่ใช้งานอยู่

## 14. การจัดการ Credential / Secret

ค่าลับจริงทั้งหมดอยู่ใน `.env` (อยู่ใน .gitignore และไม่เคย commit) และส่งเข้าคอนเทนเนอร์ผ่านตัวแปรสภาพแวดล้อมของ Docker Compose **ห้ามพิมพ์ บันทึกลง log หรือ commit ค่า credential จริง** — เมื่อวินิจฉัยปัญหาการยืนยันตัวตน ให้ตรวจว่ามีการ *ตั้งค่า* ไว้หรือไม่ (`grep -c "^KEY_NAME="  .env`) แทนการ *พิมพ์* ค่าออกมา

credential ของ PostgreSQL, ผู้ดูแล Grafana, credential secret ของ Node-RED และ pgAdmin ถูกเปลี่ยนแล้วทั้งหมดใน P10 (R7/R8) — ดู `docs/evidence/CREDENTIAL_ROTATION_P10R.md` และ `docs/evidence/CREDENTIAL_ROTATION_P10R8.md` สำหรับบันทึกการเปลี่ยน (มีแต่ metadata ไม่มีค่าจริง)

node `pg_config` ใน `nodered_data/flows.json` ต้องแสดง `userFieldType: "env"` / `passwordFieldType: "env"` เสมอ — หากเป็น `"str"` แปลว่ามี credential แบบ plaintext หลุดกลับเข้ามา ให้ถือเป็นเหตุการณ์ด้านความปลอดภัย ไม่ใช่การคลาดเคลื่อนทั่วไป

## 15. การตีความผล Security Gate

รัน: `node scripts/production-assurance.js --profile=security` แล้วอ่านผลเทียบกับ `docs/evidence/FINAL_SECURITY_GATE_P12.md` ซึ่งบันทึกนโยบายการตีความที่อิงหลักฐานจริงของโปรเจกต์นี้: **ผล NO-GO ดิบจาก profile นี้ไม่ได้แปลว่าเป็นเหตุการณ์จริงเสมอไป** — เกณฑ์ของ Trivy ดูแค่ระดับความรุนแรง ไม่ได้พิจารณาว่าเข้าถึงช่องโหว่ได้จริงหรือไม่ ให้เทียบทุกผลใหม่ระดับ CRITICAL/HIGH กับตาราง disposition ในรายงานนั้นก่อนถือว่าเร่งด่วน ผลตรวจจะต้องดำเนินการก็ต่อเมื่อเข้าถึงได้จริงผ่านเส้นทาง runtime/เครือข่าย/การยืนยันตัวตนในการตั้งค่าจริงของระบบนี้ — อ่านระเบียบวิธีของรายงานนั้นก่อนยกระดับ

## 16. เกณฑ์การยกระดับเหตุการณ์

กรอบระดับความรุนแรงฉบับเต็มและตัวอย่าง: `docs/operations/INCIDENT_RESPONSE.md` โดยสรุป: ยกระดับทันทีสำหรับทุกกรณีที่ตรงกับนิยาม P0/P1 ในเอกสารนั้น — ข้อมูลสูญหายอยู่ ระบบจริงหยุดทำงานเป็นเวลานาน หรือช่องโหว่ด้านความปลอดภัยที่ยืนยันแล้ว (ไม่ใช่แค่ Trivy แจ้ง) การรีสตาร์ตตามปกติ อาการ cache ค้าง (หัวข้อ 4) และผล CVE ที่ยืนยันแล้วว่าเข้าถึงไม่ได้ (หัวข้อ 15) ไม่ต้องยกระดับด้วยตัวเอง

## 17. การแก้ปัญหา Factory Twin (3D)

ที่มาของการออกแบบ: `docs/architecture/FACTORY_TWIN_ARCHITECTURE.md` ขอบเขตความปลอดภัย: `docs/architecture/FACTORY_TWIN_SECURITY_MODEL.md`

🟢 สุขภาพภาพรวมที่แชร์ได้อย่างปลอดภัย: `docker exec ims-factory-twin-3d wget -qO- http://localhost:4100/api/diagnostics` ให้ผลเป็นจำนวน ค่า boolean และ enum ที่กำหนดตายตัวเท่านั้น — ไม่มีพิกัด ตัวระบุ path ชื่อกระบวนการ หรือชื่อผู้ผลิต จึงวางลงใน ticket ได้ ให้ดู `requestsFailed`, `geometryParseFailures` และ `geometryLoadMs`
🟢 liveness รวมการเชื่อมต่อฐานข้อมูลไป-กลับ: `docker exec ims-factory-twin-3d wget -qO- http://localhost:4100/healthz`

> **คอนเทนเนอร์นี้ไม่มีพอร์ตบน host โดยตั้งใจ** เข้าถึงผ่าน `docker exec` ตามข้างต้น หรือผ่าน proxy ที่ `/factory-twin-3d/` พร้อม session ของ Grafana ที่ถูกต้อง ห้ามเปิดพอร์ตบน host เพื่อให้สืบสวนง่ายขึ้น — เพราะจะข้ามด่าน `auth_request` ที่โมเดลการเปิดเผยข้อมูลของทวินพึ่งพา

| อาการ | สาเหตุที่น่าจะเป็น |
|---|---|
| 401 ที่ `/factory-twin-3d/` | เป็นเรื่องปกติหากไม่มี session ของ Grafana ที่ถูกต้อง แปลว่าด่านทำงาน ให้ล็อกอินก่อน อย่าแก้ middleware |
| 502 ที่ `/factory-twin-3d/` หลัง rebuild | nginx จำ IP ของ upstream เก่า ให้รัน `docker exec ims-proxy nginx -s reload` หนึ่งครั้ง (ดูหัวข้อ 4) |
| ฉากเรนเดอร์ได้แต่ไม่มีโครงสร้างอาคาร | ไม่มี geometry ส่วนที่เป็นข้อมูลลับ เป็นเรื่องปกติกับการ clone ใหม่ API จะส่งรูปทรงว่างที่ถูกต้องแทนการตอบ error ให้ยืนยันว่า bind mount `private/` บนเครื่องนี้มีข้อมูล |
| ปุ่มมุมมอง Building / Overview ถูกปิดใช้งาน | สาเหตุเดียวกัน: ยังไม่ได้โหลดขอบเขตอาคารที่วัดได้ |
| `geometryParseFailures` เพิ่มขึ้น | ไฟล์ส่วนที่เป็นข้อมูลลับมีรูปแบบผิด ระบบถือเป็นไม่มีไฟล์โดยออกแบบไว้ service จึงยังทำงานต่อ ต้องแก้ข้อมูลที่ต้นทาง |
| แก้ `public/` แล้วไม่เห็นการเปลี่ยนแปลง | โค้ดแอปพลิเคชันถูก bake อยู่ใน image มีเพียง `private/` ที่ mount แบบสด ให้ rebuild และสร้าง service ใหม่ แล้ว reload nginx |
| จำนวนในโซนเปลี่ยน | จะเรนเดอร์เฉพาะระดับที่ผ่านการยืนยันแล้ว การเปลี่ยนแปลงตรงนี้แปลว่ามีหลักฐานใหม่หรือเกิด regression — ทั้งสองกรณีต้องตรวจสอบ และไม่มีกรณีใดแก้ได้ด้วยการปรับ geometry |

🟢 ความหน่วงในรูป histogram แทน log เวลา: `runtime.latency_buckets` ใน response ของ diagnostics นับ request ที่ต่ำกว่า 10 ms / 50 ms / 100 ms / 500 ms และตั้งแต่ 500 ms ขึ้นไป ชื่อ bucket กำหนดตายตัวในโค้ด สิ่งที่ผู้เรียกส่งมาจึงเพิ่มฟิลด์ไม่ได้ ระดับการเปิดเผยของทุกฟิลด์ใน diagnostics อยู่ในตารางของ `docs/architecture/FACTORY_TWIN_SECURITY_MODEL.md` — ต้องจัดประเภทฟิลด์ใหม่ในนั้นก่อนเพิ่มทุกครั้ง

### เกณฑ์การออก Release

ก่อนนำการเปลี่ยนแปลงของทวินขึ้นระบบ ทุกข้อต่อไปนี้ต้องเป็นจริง และห้ามยกเว้นข้อใดด้วยการลดเกณฑ์ของ assertion

| Gate | ตรวจที่ |
|---|---|
| ชุดทดสอบสัญญาของ factory twin ผ่านทั้งหมด (mapping, telemetry overlay, alarm/RCA, analytics, MES boundary, geometry mutation, diagnostics, evidence, wire, schematic, floor registry, operational status) | pre-commit hook และ job `unit-tests` ของ CI |
| geometry validator ได้ 0 errors / 0 warnings หรือข้ามอย่างเรียบร้อยเมื่อไม่มีข้อมูลลับ | job `lint` ของ CI |
| การสแกนข้อมูลลับรั่วไหลพบ 0 รายการ (ตัวสแกนจับเฉพาะ path ของไฟล์ จึงต้องทบทวน diff ด้วยตาเพื่อหาตัวเลขที่มาจาก CAD รหัสเครื่องจักร และเลข lot ด้วย) | job `lint` ของ CI ขั้นตอนแรก |
| browser regression ผ่านทั้ง 5 viewport โดยรายงานและอ่านทุก SKIP | job `factory-twin-regression` ของ CI |
| regression ของโหมดล้มเหลวผ่าน | job `factory-twin-regression` ของ CI |
| ขอบเขตที่ไม่ยืนยันตัวตนตอบ 401 ทุก route ของทวิน | browser regression โหมด proxy |
| การจับคู่ทางกายภาพที่ยืนยันแล้วยังเป็น 0 เว้นแต่มีบันทึกที่เชื่อถือได้เข้ามา | หัวข้อ evidence semantics ของ regression |

SKIP ไม่ใช่ PASS หากการรันรายงานว่ามีการข้าม ต้องอ่านเหตุผลก่อนออก release เหตุผลที่พบบ่อยคือสภาพแวดล้อมไม่มี geometry ที่เป็นข้อมูลลับหรือไม่มีอุปกรณ์ที่ถูกเฝ้าระวัง ซึ่งเป็นเหตุผลที่ถูกต้องทั้งคู่ — และทั้งคู่แปลว่าการรันครั้งนั้นไม่ได้ยืนยันคุณสมบัติเหล่านั้น

### การย้อนกลับ

🟡 ทวินไม่มีสถานะและอ่านอย่างเดียว: ไม่เขียนอะไรลงฐานข้อมูลหรือดิสก์ การย้อนกลับจึงเป็นแค่การทำงานกับ image ของคอนเทนเนอร์โดยไม่มีผลต่อข้อมูล

1. deploy image ก่อนหน้าอีกครั้ง และสร้างใหม่เฉพาะ service นี้
2. reload proxy หนึ่งครั้ง — nginx จำที่อยู่ของ upstream ตอนเริ่ม คอนเทนเนอร์ที่สร้างใหม่จึงจะตอบ 502 หากไม่ reload
3. ยืนยัน `/healthz` แล้วตามด้วยตัวเลขใน diagnostics

🔴 **ห้าม** ย้อนกลับด้วยการแก้ไฟล์ใน `private/` ไฟล์เหล่านั้นเป็นหลักฐาน ไม่ใช่การตั้งค่า การเปลี่ยน geometry คือการเปลี่ยนข้อมูล และเป็นความรับผิดชอบของเจ้าของต้นฉบับ ไม่ใช่ของการ deploy

🔴 ห้ามถือค่าที่ทวินแสดงเป็นข้อเท็จจริงเชิงปฏิบัติการของเครื่องจักรจริง **สถานะ** ของเครื่องคือ telemetry สด ส่วน **ตำแหน่ง** ของอุปกรณ์มาจากแบบ CAD แต่ยังไม่มีอุปกรณ์ที่ถูกเฝ้าระวังตัวใดจับคู่กับตำแหน่งใดเลย (การจับคู่ที่ยืนยันแล้ว 0 รายการ) บนผังจึงไม่มีสิ่งใดบอกว่าเครื่องหนึ่ง ๆ อยู่ตรงไหน อ่านคู่มือผู้ปฏิบัติงานก่อนตัดสินใจจากสิ่งที่เห็นในมุมมองนี้: `docs/architecture/FACTORY_TWIN_OPERATOR_GUIDE.md`
