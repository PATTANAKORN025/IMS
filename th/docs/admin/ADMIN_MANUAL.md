<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# คู่มือการดูแลระบบและ SRE

> **คู่มือการดูแลระบบสำหรับทีม IT (MIS-G) ในการบำรุงรักษา IMS**
> ครอบคลุมการจัดการ Docker การลงทะเบียนอุปกรณ์ การจัดการการแจ้งเตือน และการแก้ไขปัญหา

---

<div align="center">

<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **ผู้ดูแลระบบ:** คู่มือ SRE
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **เวอร์ชัน:** 1.2
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **ผู้อ่าน:** ทีม IT

</div>

---

## สารบัญ

1. [การจัดการระบบ](#การจัดการระบบ)
2. [การเพิ่มอุปกรณ์ใหม่](#การเพิ่มอุปกรณ์ใหม่)
3. [การจัดการการแจ้งเตือน](#การจัดการการแจ้งเตือน)
4. [การแก้ไขปัญหา](#การแก้ไขปัญหา)
5. [การสำรองและกู้คืนข้อมูล](#การสำรองและกู้คืนข้อมูล)
6. [การติดตามประสิทธิภาพ](#การติดตามประสิทธิภาพ)

---

## การจัดการระบบ

### ภาพรวมคอนเทนเนอร์

ระบบทำงานบน Docker Compose ทั้งหมด: `docker-compose.yaml` กำหนด 15 service (service ที่ทำงานต่อเนื่อง 14 ตัว และตัวรัน migration แบบครั้งเดียว 1 ตัวซึ่งจะจบการทำงานเมื่อเสร็จ) ไม่มีการแบ่งด้วย `profiles:` ดังนั้น `make up` และ `make up-prod` จะเริ่มทุก service รวมถึงตัวจำลอง SNMP และ pgAdmin:

| คอนเทนเนอร์ | Service | พอร์ต | หน้าที่ |
| --- | --- | --- | --- |
| `ims-timescaledb` | TimescaleDB | 5432 (loopback เท่านั้น) | ฐานข้อมูลอนุกรมเวลา |
| `ims-pgbouncer` | PgBouncer | 5432 (ภายใน) | ตัวจัดการ connection pool |
| `ims-db-migrate` | ตัวรัน migration | — (ครั้งเดียว) | apply `database/migrations/*.sql` และกั้นไม่ให้ `node-red` กับ `alarm-api` เริ่มก่อน migration เสร็จ |
| `ims-node-red` | Node-RED | 1880 (loopback เท่านั้น) | ไปป์ไลน์ข้อมูล |
| `ims-proxy` | nginx reverse proxy | **3000** | ทางเข้า UI เพียงทางเดียว: ส่ง `/` ไป Grafana, `/alarm-api/`, `/factory-twin-3d/` และส่ง `/ldi-telemetry` + `/inject` ไป Node-RED โดย `/alarm-api/` ต้องผ่านการตรวจ `auth_request` กับ session ของ Grafana ก่อน |
| `ims-grafana` | Grafana | ภายในเท่านั้น ไม่มีพอร์ตบน host | แดชบอร์ด — เข้าถึงได้ผ่าน `ims-proxy` เท่านั้น |
| `ims-alarm-api` | alarm-api | ภายในเท่านั้น ไม่มีพอร์ตบน host | เส้นทางเขียนข้อมูลลง `public.ldi_alarm_lifecycle` (Acknowledge/Resolve จาก `IMS LDI - Alarm Console`) เข้าถึงได้ผ่าน `ims-proxy` เท่านั้น |
| `ims-grafana-renderer` | Grafana Image Renderer | 8081 (ภายใน) | เรนเดอร์ภาพ PNG สำหรับ export panel และการแจ้งเตือน |
| `ims-prometheus` | Prometheus | 9090 (loopback เท่านั้น) | ตัวชี้วัดและการแจ้งเตือน |
| `ims-alertmanager` | Alertmanager | 9093 (loopback เท่านั้น) | กำหนดเส้นทางการแจ้งเตือน |
| `ims-blackbox` | Blackbox Exporter | 9115 (loopback เท่านั้น) | probe วัด SLA |
| `ims-snmpsim` | SNMP Simulator | 161/udp (ภายใน) | อุปกรณ์ SNMP จำลองสำหรับการพัฒนาและสาธิต |
| `ims-factory-twin-3d` | Factory Twin 3D | 4100 (ภายใน) | ดิจิทัลทวินชั้น 1 ให้บริการผ่าน `ims-proxy` ที่ `/factory-twin-3d/` |
| `ims-observability-archiver` | ตัวเก็บถาวร log/ตัวชี้วัด | — (ไม่มีพอร์ต) | เก็บ snapshot ด้าน observability ของคอนเทนเนอร์และฐานข้อมูลลง `./ops-logs` เป็นระยะ มีการ mount `/var/run/docker.sock` แบบอ่านอย่างเดียว — ให้ถือว่าเป็นคอนเทนเนอร์สิทธิ์สูง |
| `ims-pgadmin4` | pgAdmin 4 | **5050 ทุก interface** | หน้าจอจัดการฐานข้อมูล เป็น service เดียวนอกจาก `ims-proxy` ที่เปิดพอร์ตบนทุก interface — นอกห้องทดลองต้องกั้นด้วยไฟร์วอลล์หรือ bind ไว้ที่ `127.0.0.1` |

> `ims-db-migrate` จะจบการทำงานด้วยสถานะ 0 หลัง apply migration ที่ค้างอยู่ การเห็นสถานะ `Exited (0)` ใน `docker compose ps` จึงเป็นเรื่องปกติ ไม่ใช่ความผิดพลาด `node-red` และ `alarm-api` จะไม่เริ่มจนกว่า migration จะสำเร็จ

### งานประจำที่ใช้บ่อย

```bash
# ตรวจสถานะคอนเทนเนอร์ทั้งหมด
docker compose ps

# เริ่มทั้งระบบ
docker compose up -d

# ปิดทั้งระบบ
docker compose down

# รีสตาร์ตแบบล้างทั้งหมด -- ลบข้อมูลทุก volume ใช้กับสภาพแวดล้อมทดลองเท่านั้น
docker compose down -v && docker compose up -d

# รีสตาร์ตเฉพาะ service ที่มีปัญหา
docker compose restart node-red
docker compose restart pgbouncer
docker compose restart grafana
docker compose restart proxy
docker compose restart alarm-api
docker compose restart prometheus alertmanager

# ดู log แบบเรียลไทม์ (50 บรรทัดล่าสุด)
docker compose logs -f --tail 50 node-red
docker compose logs -f --tail 50 pgbouncer

# ดูการใช้ทรัพยากร
docker stats --no-stream
```

> [!NOTE]
>
> > หลัง `docker compose down -v` ต้องรอประมาณ 40 วินาทีให้ทุก service เริ่มทำงานครบก่อนตรวจสอบ

### การตรวจสุขภาพของ Service

```bash
# ฐานข้อมูล
docker compose exec timescaledb pg_isready -U ims_admin -d ims

# Node-RED
curl -s http://localhost:1880/

# Grafana
curl -s http://localhost:3000/api/health

# Prometheus
curl -s http://localhost:9090/-/healthy

# Alertmanager
curl -s http://localhost:9093/-/healthy
```

### Database Migrations

ปัจจุบัน `database/migrations/` มีไฟล์ 57 ไฟล์ตามลำดับ (`013` ถึง `082` โดยมีบางหมายเลขที่ข้ามหรือย้ายไปเก็บถาวร — หมายเลข `001-012` ถูกรวมเข้าไปใน `postgres/init/001-init-timescaledb.sql` ซึ่งเป็นเส้นทาง bootstrap สำหรับการติดตั้งใหม่) service `ims-db-migrate` แบบครั้งเดียวจะ apply ให้อัตโนมัติทุกครั้งที่รัน `docker compose up` และ `node-red` กับ `alarm-api` จะไม่เริ่มจนกว่าจะจบการทำงานสำเร็จ

```bash
# รัน migration ซ้ำด้วยตนเองโดยไม่ต้องเปิดส่วนอื่นของ stack
bash scripts/migrate.sh

# บนฐานข้อมูลที่ปกติและเป็นปัจจุบัน ต้องเห็นบรรทัดนี้ตรงทุกตัวอักษร:
# Pending: 0 Applied: 0 Failed: 0
# "Pending: N" หมายถึงมีไฟล์ migration N ไฟล์ที่ยังไม่มีแถวใน schema_migrations
# -- scripts/migrate.sh จะ apply ให้ตามลำดับ

# ดูว่า apply อะไรไปแล้วจริง
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT version, filename, applied_at FROM public.schema_migrations ORDER BY version DESC LIMIT 10;"
```

migration ทุกไฟล์เขียนให้รันซ้ำได้อย่างปลอดภัย (`CREATE ... IF NOT EXISTS` และบล็อก `DO $$ ... $$` ที่มีเงื่อนไขป้องกัน) การรัน `scripts/migrate.sh` ซ้ำกับฐานข้อมูลที่เป็นปัจจุบันแล้วจึงไม่เปลี่ยนแปลงอะไรเสมอ ดูหัวข้อ "Migration Governance" ใน `docs/architecture/ARCHITECTURE.md` เพื่อดูเหตุผลที่ตั้งใจให้มีตัวรัน migration เพียงตัวเดียว ไม่ใช่สามตัว

---

## รายการตรวจความปลอดภัยก่อนใช้งานจริง

> [!CAUTION]
> ก่อนนำขึ้นใช้งานจริง ต้องเปลี่ยน credential ค่าเริ่มต้นทั้งหมด มิฉะนั้นระบบจะเปิดช่องให้ผู้ไม่มีสิทธิ์เข้าถึงได้

| Credential | ค่าเริ่มต้น | ตำแหน่ง | สิ่งที่ต้องทำ |
| --- | --- | --- | --- |
| `INGEST_API_KEY` | ค่าตัวอย่างที่เป็นสาธารณะ | `.env` → env ของ `ims-node-red` | **เปลี่ยน** — ใครก็ตามที่เข้าถึง `/ldi-telemetry` หรือ `/inject` ได้ (พอร์ต 3000 ของ host ผ่าน nginx หรือ 1880 บน loopback) สามารถส่ง telemetry ปลอมเข้ามาได้ |
| `POSTGRES_PASSWORD` | ค่าตัวอย่างที่เป็นสาธารณะ | `.env` | **เปลี่ยน** — superuser ของฐานข้อมูล (`POSTGRES_USER`) |
| `GRAFANA_DB_PASSWORD` | ค่าตัวอย่างที่เป็นสาธารณะ | `.env` → role `grafana_reader` และ userlist ของ PgBouncer | **เปลี่ยน** — มีสิทธิ์อ่านทุกตารางที่ Grafana query ได้ |
| `ALARM_API_DB_PASSWORD` | ค่าตัวอย่างที่เป็นสาธารณะ | `.env` → role `alarm_api_writer` (migration `078-alarm-api-writer-role.sql`) | **เปลี่ยน** — จำกัดสิทธิ์แค่ `SELECT`+`UPDATE` บน `ldi_alarm_lifecycle` แต่ยังเป็น credential ของฐานข้อมูลจริง |
| `GRAFANA_ADMIN_PASSWORD` | ค่าตัวอย่างที่เป็นสาธารณะ | `.env` → ผู้ดูแล Grafana | **เปลี่ยน** — แก้ไขแดชบอร์ดและ datasource ได้ |
| `ALERT_WEBHOOK_TOKEN`, `GRAFANA_RENDERER_TOKEN` | ค่าตัวอย่างที่เป็นสาธารณะ | `.env` | **เปลี่ยน** — shared secret ของ webhook และ renderer |
| `NODE_RED_CREDENTIAL_SECRET`, `NODE_RED_ADMIN_PASSWORD_HASH` | ค่าตัวอย่างที่เป็นสาธารณะ / ค่าว่าง | `.env` → Node-RED | **เปลี่ยน** ก่อนเก็บ credential ใด ๆ ใน flow หาก hash ว่าง editor จะไม่มีการยืนยันตัวตนผู้ดูแล |
| `PGADMIN_DEFAULT_PASSWORD` | ค่าตัวอย่างที่เป็นสาธารณะ | `.env` → pgAdmin | **เปลี่ยน** — pgAdmin เปิดพอร์ตบนทุก interface |

ค่าทุกค่าใน `.env.example` เป็นข้อมูลสาธารณะ (repository เป็นแบบสาธารณะ) ให้ถือว่าทุกค่าถูกเปิดเผยแล้ว และห้ามนำไปใช้งานจริง

### วิธีเปลี่ยน (Rotate) Credential

```bash
# 1. สร้างค่าลับใหม่ (อย่าพิมพ์ค่าออกมาใน terminal log ที่ใช้ร่วมกัน)
gen() { python -c "import secrets; print(secrets.token_urlsafe($1))"; }
NEW_API_KEY=$(gen 32); NEW_PG_PASS=$(gen 24); NEW_GRAFANA_DB_PASS=$(gen 24)
NEW_ALARM_API_DB_PASS=$(gen 24); NEW_GRAFANA_ADMIN_PASS=$(gen 24)

# 2. เปลี่ยนรหัสผ่านของ role ในฐานข้อมูล "ก่อน" ขณะที่ credential เดิมยังใช้ได้
#    การแก้ .env ไม่ได้เปลี่ยนรหัสผ่าน superuser ใน data volume ที่มีอยู่แล้ว
docker compose exec -T timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<SQL
ALTER ROLE CURRENT_USER WITH PASSWORD '$NEW_PG_PASS';
ALTER ROLE grafana_reader WITH PASSWORD '$NEW_GRAFANA_DB_PASS';
ALTER ROLE alarm_api_writer WITH PASSWORD '$NEW_ALARM_API_DB_PASS';
SQL

# 3. แก้ .env ให้ตรงกัน
sed -i "s/^INGEST_API_KEY=.*/INGEST_API_KEY=$NEW_API_KEY/" .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_PG_PASS/" .env
sed -i "s/^GRAFANA_DB_PASSWORD=.*/GRAFANA_DB_PASSWORD=$NEW_GRAFANA_DB_PASS/" .env
sed -i "s/^ALARM_API_DB_PASSWORD=.*/ALARM_API_DB_PASSWORD=$NEW_ALARM_API_DB_PASS/" .env
sed -i "s/^GRAFANA_ADMIN_PASSWORD=.*/GRAFANA_ADMIN_PASSWORD=$NEW_GRAFANA_ADMIN_PASS/" .env

# 4. สร้างคอนเทนเนอร์ใหม่เพื่อให้รับ environment ใหม่
#    (pgbouncer สร้าง userlist.txt ใหม่จาก .env ตอนเริ่ม)
docker compose up -d --force-recreate pgbouncer node-red grafana alarm-api factory-twin-3d observability-archiver

# 5. GF_SECURITY_ADMIN_PASSWORD มีผลเฉพาะกับฐานข้อมูล Grafana ที่สร้างใหม่เท่านั้น
#    กับฐานข้อมูลที่มีอยู่แล้ว ต้องรีเซ็ตรหัสผ่านผู้ดูแลโดยตรง:
docker compose exec grafana grafana cli admin reset-admin-password "$NEW_GRAFANA_ADMIN_PASS"

# 6. ตรวจสอบ
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
curl -s -X POST http://localhost:1880/inject \
 -H "Content-Type: application/json" \
 -H "x-api-key: $NEW_API_KEY" \
 -d '{"machine_id":"TEST"}'
```

### คำสั่งตรวจสอบ

```bash
# ยืนยันว่า INGEST_API_KEY ถูกบังคับใช้ (ต้องได้ 401 เมื่อไม่ส่ง key)
curl -s -w "\nHTTP: %{http_code}" -X POST http://localhost:1880/inject \
 -H "Content-Type: application/json" -d '{"machine_id":"TEST"}'
# ผลที่คาดหวัง: HTTP 401

# ยืนยันว่า Grafana ต้องล็อกอิน
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/dashboards
# ผลที่คาดหวัง: 401 (ไม่ใช่ 200)
```

---

## การเพิ่มอุปกรณ์ใหม่

### ขั้นตอนที่ 1: ลงทะเบียนในฐานข้อมูล

ตาราง `public.devices` แบ่ง `device_type` เป็น `'server'` (โครงสร้างพื้นฐานที่ตรวจด้วย SNMP ซึ่งเป็นค่าเริ่มต้น) และ `'ldi'` (เครื่องผลิต LDI) เท่านั้น ต้องระบุประเภทให้ถูกต้อง มิฉะนั้นจะถูกตั้งเป็น `'server'` และจะไม่แสดงบนแดชบอร์ด LDI ใด ๆ:

```sql
-- เพิ่มเซิร์ฟเวอร์โครงสร้างพื้นฐานใหม่ (poll ด้วย SNMP)
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, snmp_community, snmp_port, enabled)
VALUES ('NEW-MACHINE-01', '192.168.1.100', '192.168.1.100', 'server', 'public', 161, true);

-- เพิ่มเครื่อง LDI ใหม่ (ไม่ใช้ SNMP — ข้อมูลเข้าผ่าน ldi_ingestion.json / ตัวจำลอง)
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, enabled)
VALUES ('LDI-11', 'LDI-11', '', 'ldi', true);

-- ตรวจสอบ
SELECT device_id, hostname, device_type, snmp_community, enabled FROM public.devices WHERE device_id IN ('NEW-MACHINE-01', 'LDI-11');
```

### ขั้นตอนที่ 2: ตรวจการเชื่อมต่อ SNMP

```bash
# ทดสอบ SNMP จากคอนเทนเนอร์ Node-RED
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const session = snmp.createSession('192.168.1.100', 'public', {port: 161, timeout: 5000});
session.get(['1.3.6.1.2.1.1.1.0'], (err, varbinds) => {
 if (err) console.error('ERROR:', err.message);
 else console.log('OK:', varbinds[0].value.toString());
 session.close();
});
"
```

### ขั้นตอนที่ 3: ตรวจเส้นทางข้อมูล

```bash
# รอ 30 วินาทีให้รอบการ poll ทำงาน
sleep 30

# ตรวจว่ามีข้อมูลเข้ามา
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
 FROM public.sys_metrics s
 WHERE device_id = 'NEW-MACHINE-01'
 GROUP BY device_id;"
```

### ขั้นตอนที่ 4: เพิ่ม Panel ในแดชบอร์ด (ไม่บังคับ)

หากต้องการแดชบอร์ดเฉพาะสำหรับเครื่องใหม่:

1. เปิด Grafana → Dashboard → Edit
2. เพิ่ม panel ใหม่
3. ใช้ query: `SELECT time, cpu_load_percent FROM public.sys_metrics WHERE device_id IN (\${machine_id:sqlstring}) ORDER BY time DESC`
4. บันทึกแดชบอร์ด

---

## การจัดการการแจ้งเตือน

### ตำแหน่งของกฎการแจ้งเตือน

- Prometheus (แพลตฟอร์มและไปป์ไลน์): `monitoring/prometheus/rules/ims-alerts.yml`
- กฎที่ Grafana จัดการ (เงื่อนไขของเครื่องและ LDI): `monitoring/grafana/provisioning/alerting/rules.yml` และ `ldi-rules.yml` ส่วน contact point และการ route อยู่ใน `contactpoints.yml` / `policies.yml` กฎที่ provision ไว้แก้ใน UI ของ Grafana ไม่ได้ ให้แก้ที่ไฟล์แล้วรีสตาร์ต Grafana

### การแก้ไขกฎการแจ้งเตือน

กฎของ Prometheus ครอบคลุมตัวแพลตฟอร์มเอง (Prometheus/Alertmanager/targets, `ServiceDown`/latency/SLA/TLS จาก blackbox, `Watchdog` และตัวชี้วัดไปป์ไลน์ Node-RED `ims_pipeline_*` กับ `ims_circuit_breaker_state`) ส่วนเงื่อนไขระดับเครื่อง (CPU, อุณหภูมิ, พารามิเตอร์ LDI) ประเมินด้วยกฎแจ้งเตือน SQL ของ Grafana และแดชบอร์ดบน TimescaleDB ไม่ใช่ Prometheus

**ตัวอย่าง: ปรับกฎที่มีอยู่ให้เข้มขึ้น** (`PipelineHighErrorRate` ปัจจุบันคือ `> 0.1` ครั้ง/วินาที ต่อเนื่อง 5 นาที):

```yaml
      - alert: PipelineHighErrorRate
        expr: rate(ims_pipeline_inserts_failed_total[5m]) > 0.05   # was 0.1
        for: 5m
        labels:
          severity: warning
          service: node-red
        annotations:
          summary: "High INSERT failure rate on Node-RED pipeline"
          description: "{{ $value | humanize }} failures/sec over 5 minutes."
```

กฎใหม่ทุกกฎต้องมี label `severity` และ `service` (การ route และ inhibition ของ Alertmanager อ้างอิง label เหล่านี้) และต้องผ่าน `promtool check rules` ก่อน reload

### Reload การตั้งค่า

```bash
# 1. ตรวจ syntax ก่อน (ไดเรกทอรี rules ถูก mount แบบอ่านอย่างเดียวที่ /etc/prometheus/rules)
docker compose exec prometheus promtool check rules /etc/prometheus/rules/ims-alerts.yml

# 2. Reload (Prometheus รันด้วย --web.enable-lifecycle และพอร์ต bind ไว้ที่ 127.0.0.1)
curl -X POST http://localhost:9090/-/reload
```

> [!WARNING]
> การ reload จะประเมินทุกกฎใหม่ทันที หากตั้งค่า credential ของ LINE/Teams ไว้แล้ว กฎที่กำลัง firing อยู่จะส่งการแจ้งเตือนจริงออกไป

### กฎการระงับการแจ้งเตือน (Inhibition Rules)

`monitoring/alertmanager/alertmanager.yml` กำหนดกฎ inhibition ไว้ 3 ข้อ:

| การแจ้งเตือนต้นทาง | การแจ้งเตือนที่ถูกระงับ | ต้องตรงกันที่ |
| --- | --- | --- |
| `ServiceDown` | `ServiceHighLatency`, `SLABreachWarning` | `instance` |
| `severity="critical"` ใด ๆ | `severity="warning"` ใด ๆ | `device_id` |
| `InterfaceDown` | `BandwidthSaturation` | `device_id` |

---

## การแก้ไขปัญหา

### ปัญหาที่พบบ่อยและวิธีแก้

| ปัญหา | สาเหตุ | วิธีแก้ |
| --- | --- | --- |
| Grafana แสดง "No Data" | connection ของ PgBouncer เต็ม หรือฐานข้อมูลล่ม | รัน `docker restart ims-pgbouncer` และตรวจพื้นที่ดิสก์ |
| การแจ้งเตือนไม่ถูกส่งไป LINE/Teams | credential ใน `.env` ว่าง หรือ webhook token ไม่ตรงกัน | ตรวจ `LINE_CHANNEL_ACCESS_TOKEN` / `TEAMS_WEBHOOK_URL` / `ALERT_WEBHOOK_TOKEN` แล้วดู log ของ Node-RED ที่ node `POST /alert-webhook` |
| กราฟ bandwidth พุ่งถึงระดับ Tbps | counter แบบ 32 บิตวนกลับ (wrap) | parser จัดการให้แล้ว แต่หากยังเกิด ให้ตรวจว่าอุปกรณ์รองรับ counter แบบ 64 บิต (HC) |
| Node-RED เริ่มไม่ขึ้น | JSON ของ flow มี syntax ผิด | ดู log: `docker compose logs --tail=50 node-red` |
| Continuous Aggregate ไม่มีข้อมูล | ต้อง refresh ด้วยตนเอง | รัน `CALL refresh_continuous_aggregate('sys_hourly', NULL, NULL);` |
| คอนเทนเนอร์ค้างอยู่ที่ "Restarting" | ตั้งค่าไม่ตรงกันหรือพอร์ตชนกัน | ดู log ของคอนเทนเนอร์นั้น |

### ขั้นตอนตรวจสอบแบบ SRE

> [!CAUTION]
> `docker compose down -v` ลบ named volume ทุกตัว รวมถึงข้อมูลของ TimescaleDB ใช้กับสภาพแวดล้อมทดลองที่ทิ้งได้เท่านั้น ห้ามใช้กับ stack ที่มีข้อมูลจริง

```bash
# 1. เริ่ม (หรือปรับให้ตรง) stack
docker compose up -d

# 2. รอ 40 วินาที
sleep 40

# 3. ตรวจคอนเทนเนอร์ (ทำงานต่อเนื่อง 14 ตัว + ims-db-migrate ซึ่งต้องเป็น Exited (0))
docker compose ps

# 4. ตรวจการไหลของข้อมูล
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
FROM public.sys_metrics s JOIN public.devices d ON d.device_id = s.device_id
WHERE s.time > NOW() - INTERVAL '5 minutes'
GROUP BY device_id;"

# 5. ตรวจ Continuous Aggregates
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT bucket, avg_cpu, max_temp
FROM public.sys_hourly
ORDER BY bucket DESC LIMIT 4;"

# 6. ตรวจ Grafana
curl -sf http://localhost:3000/api/health

# 7. ตรวจ target ของ Prometheus
curl -sf http://localhost:9090/api/v1/targets | python3 -c "
import sys, json
data = json.load(sys.stdin)
ups = sum(1 for t in data['data']['activeTargets'] if t['health'] == 'up')
total = len(data['data']['activeTargets'])
print(f'Prometheus: {ups}/{total} targets UP')
"
```

---

## การสำรองและกู้คืนข้อมูล

### การสำรองฐานข้อมูล

ใช้เส้นทางที่มีสคริปต์รองรับ (`make backup` → `scripts/backup-db.sh`, `make restore FILE=<path>` → `scripts/restore-db.sh`) ขั้นตอนและข้อควรระวังที่ทดสอบแล้วอยู่ใน [การสำรองและกู้คืนข้อมูล](../operations/BACKUP_RESTORE.md) หากต้อง dump ด้วยตนเอง:

```bash
# ต้องมี -T: หากไม่มี docker จะจัดสรร TTY และทำให้ไฟล์ dump ที่ redirect ออกมาเสียหาย
docker compose exec -T timescaledb sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_$(date +%Y%m%d).sql

# กู้คืนลงฐานข้อมูลที่มีอยู่
docker compose exec -T timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backup_YYYYMMDD.sql

# สำรองอัตโนมัติ (cron รันจากไดเรกทอรีของ repository)
0 2 * * * cd /path/to/IMS && bash scripts/backup-db.sh
```

`scripts/backup-db.sh` เขียนไฟล์ dump แบบ gzip ลง `./backups/` (อยู่ใน .gitignore) และลบไฟล์ที่เก่ากว่า 30 วัน ไฟล์ dump มีข้อมูลการผลิตจริง ห้ามย้ายไปไว้ใน path ที่ git ติดตาม และต้องจำกัดสิทธิ์เข้าถึงไดเรกทอรีสำรอง

### การสำรอง Flow

```bash
# nodered_data/flows/*.json เป็นต้นฉบับที่ git ดูแล
# (scripts/build-flows.js รวมเป็น nodered_data/flows.json -- ห้ามแก้ flows.json ด้วยมือ)
# สำรอง nodered_data/flows.json (สำเนาที่ runtime ใช้)
cp nodered_data/flows.json nodered_data/flows.json.bak

# กู้คืนจากสำเนา
cp nodered_data/flows.json.bak nodered_data/flows.json
docker compose restart node-red
```

### การสำรองการตั้งค่า

```bash
# สำรองไฟล์ docker-compose
cp docker-compose.yaml docker-compose.yaml.bak
cp docker-compose.prod.yaml docker-compose.prod.yaml.bak
cp proxy/nginx.conf proxy/nginx.conf.bak

# สำรองการตั้งค่า Prometheus
cp monitoring/prometheus/prometheus.yml monitoring/prometheus/prometheus.yml.bak
cp monitoring/prometheus/rules/ims-alerts.yml monitoring/prometheus/rules/ims-alerts.yml.bak

# สำรองแดชบอร์ด Grafana
cp -r monitoring/grafana/dashboards/ monitoring/grafana/dashboards.bak/
```

---

## การติดตามประสิทธิภาพ

### ตัวชี้วัดของระบบ

```bash
# การใช้ทรัพยากรของคอนเทนเนอร์
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# จำนวน connection ของฐานข้อมูล
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT count(*) as active_connections
FROM pg_stat_activity
WHERE state = 'active';"

# ขนาดดิสก์
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT pg_size_pretty(pg_database_size('ims')) as database_size;"

# ขนาดของแต่ละตาราง
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;"
```

### ตัวชี้วัดของ Prometheus

```bash
# ระยะเวลา scrape
curl -s http://localhost:9090/api/v1/query?query=prometheus_scrape_duration_seconds

# จำนวน sample ที่รับเข้า
curl -s http://localhost:9090/api/v1/query?query=prometheus_tsdb_head_samples_appended_total

# จำนวนการแจ้งเตือน
curl -s http://localhost:9090/api/v1/alerts | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'Active alerts: {len(data[\"data\"][\"alerts\"])}')
"
```

### การวิเคราะห์ Log

```bash
# ข้อผิดพลาดของ Node-RED
docker compose logs node-red 2>&1 | grep -i "error" | tail -20

# ข้อผิดพลาดของ Prometheus
docker compose logs prometheus 2>&1 | grep -i "error" | tail -20

# ข้อผิดพลาดของ Alertmanager
docker compose logs alertmanager 2>&1 | grep -i "error" | tail -20

# query ที่ช้าในฐานข้อมูล
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;"
```

---

<div align="center">

**IMS Admin Manual — เวอร์ชัน 1.2 (ตรวจทานเทียบกับ `main` เมื่อ 2026-09-26)**

_สำหรับทีม IT และ MIS-G_

</div>
