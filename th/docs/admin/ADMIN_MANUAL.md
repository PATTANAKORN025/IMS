<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# คู่มือการดูแลระบบและ SRE

> **คู่มือการดูแลระบบสำหรับทีม IT (MIS-G) ในการบำรุงรักษา IMS**
> ครอบคลุมการจัดการ Docker, การลงทะเบียนอุปกรณ์, การจัดการการแจ้งเตือน, และการแก้ปัญหา.

---

<div align="center">

<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Admin:** คู่มือ SRE
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Version:** 1.1
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Audience:** ทีม IT

</div>

---

## สารบัญ

1. [การจัดการระบบ](#การจัดการระบบ)
2. [การเพิ่มอุปกรณ์ใหม่](#การเพิ่มอุปกรณ์ใหม่)
3. [การจัดการการแจ้งเตือน](#การจัดการการแจ้งเตือน)
4. [การแก้ปัญหา](#การแก้ปัญหา)
5. [การสำรองข้อมูลและการกู้คืน](#การสำรองข้อมูลและการกู้คืน)
6. [การตรวจสอบประสิทธิภาพ](#การตรวจสอบประสิทธิภาพ)

---

## การจัดการระบบ

### ภาพรวม Container

ระบบทำงานบน Docker Compose ทั้งหมด ประกอบด้วยเซอร์วิสรวม 14 ตัว (13 เซอร์วิสที่ทำงานต่อเนื่อง และ 1 เซอร์วิสสำหรับรัน migration แบบครั้งเดียว (one-shot) ซึ่งจะจบการทำงานเมื่อเสร็จสิ้น):

| คอนเทนเนอร์              | บริการ                  | พอร์ต                        | วัตถุประสงค์                                                                                                                                           |
| ---------------------- | ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ims-timescaledb`      | TimescaleDB            | 5432 (loopback only)        | ฐานข้อมูล Time-series                                                                                                                              |
| `ims-pgbouncer`        | PgBouncer              | 5432 (ภายใน)                 | Connection pooler                                                                                                                                 |
| `ims-db-migrate`       | ตัวรัน Migration       | — (one-shot)                | นำ `database/migrations/*.sql` ไปใช้ เป็นตัวเปิดทางให้ `node-red` และ `alarm-api` เริ่มทำงาน                                                                     |
| `ims-node-red`         | Node-RED               | 1880 (loopback only)        | ท่อส่งข้อมูล (Data pipeline)                                                                                                                      |
| `ims-proxy`            | nginx reverse proxy    | **3000**                    | เป็นช่องทางเข้าถึงจากโฮสต์เพียงช่องทางเดียวสู่ Grafana และ `alarm-api`. กั้น `/alarm-api/` ไว้หลังการตรวจสอบ `auth_request` เทียบกับ session ของ Grafana เอง. |
| `ims-grafana`          | Grafana                | ภายในเท่านั้น, ไม่มีพอร์ตโฮสต์      | แดชบอร์ด — เข้าถึงได้ผ่าน `ims-proxy` เท่านั้น ไม่สามารถเข้าถึงได้โดยตรงอีกต่อไป                                                                                  |
| `ims-alarm-api`        | alarm-api              | ภายในเท่านั้น, ไม่มีพอร์ตโฮสต์      | เส้นทางการเขียนสำหรับ `public.ldi_alarm_lifecycle` (ตอบรับ/แก้ไข จาก `IMS LDI - Alarm Console`). เข้าถึงได้ผ่าน `ims-proxy` เท่านั้น.             |
| `ims-grafana-renderer` | Grafana Image Renderer | 8081 (ภายใน)                 | เรนเดอร์ PNG สำหรับนำออกภาพหรือแนบในการแจ้งเตือน                                                                                                             |
| `ims-prometheus`       | Prometheus             | 9090 (loopback only)        | ตัวชี้วัด & การแจ้งเตือน                                                                                                                                |
| `ims-alertmanager`     | Alertmanager           | 9093 (loopback only)        | กำหนดเส้นทางการแจ้งเตือน                                                                                                                                     |
| `ims-blackbox`         | Blackbox Exporter      | 9115 (loopback only)        | การตรวจสอบ SLA (SLA probes)                                                                                                                                        |
| `ims-snmpsim`          | SNMP Simulator         | 161/udp                     | สำหรับการทดสอบ (Dev testing)                                                                                                                                       |

> `ims-db-migrate` จะจบการทำงานด้วยสถานะ 0 หลังจากอัปเดต migration ค้างสำเร็จ -- การเห็นสถานะ `Exited (0)` ใน `docker compose ps` เป็นสิ่งที่คาดหวัง ไม่ใช่ข้อผิดพลาด. `node-red` และ `alarm-api` จะไม่เริ่มทำงานจนกว่าการ migration จะเสร็จสมบูรณ์.

### การดำเนินการทั่วไป

```bash
# ตรวจสอบสถานะของคอนเทนเนอร์ทั้งหมด
docker compose ps

# เริ่มระบบทั้งหมด
docker compose up -d

# ปิดระบบทั้งหมด
docker compose down

# รีสตาร์ทแบบสะอาด (ทำลายข้อมูลทั้งหมดและเริ่มใหม่แต่ต้น)
docker compose down -v && docker compose up -d

# รีสตาร์ทเฉพาะบริการที่มีปัญหา
docker compose restart node-red
docker compose restart pgbouncer
docker compose restart grafana
docker compose restart proxy
docker compose restart alarm-api
docker compose restart prometheus alertmanager

# ดูบันทึกแบบเรียลไทม์ (50 บรรทัดล่าสุด)
docker compose logs -f --tail 50 node-red
docker compose logs -f --tail 50 pgbouncer

# ตรวจสอบการใช้ทรัพยากร
docker stats --no-stream
```

> [!NOTE]
>
> > หลังจากการใช้คำสั่ง `docker compose down -v`, จะต้องรอ 40 วินาที เพื่อให้ระบบทั้งหมดเริ่มทำงานเสร็จสมบูรณ์ก่อนจะทำการตรวจสอบ.

### การตรวจสอบสถานะบริการ (Health Checks)

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

### การทำ Database Migrations

`database/migrations/` ในปัจจุบันมีไฟล์ที่มีลำดับ 57 ไฟล์ (`013` ถึง `082`, โดยมีการข้ามตัวเลขหรือเก็บถาวรบางตัวเลข — ตัวเลขก่อนหน้า `001-012` ถูกรวมเข้าใน `postgres/init/001-init-timescaledb.sql` ซึ่งเป็นเส้นทางการเริ่มต้นใช้งานใหม่). นำไปใช้โดยอัตโนมัติผ่านบริการ one-shot `ims-db-migrate` ทุกครั้งที่มีการรัน `docker compose up`; `node-red` และ `alarm-api` จะไม่เริ่มทำงานจนกว่าเซอร์วิสนี้จะจบการทำงานสำเร็จ.

```bash
# เรียกใช้ migrations ด้วยตนเองโดยไม่เริ่มระบบย่อยส่วนอื่นๆ
bash scripts/migrate.sh

# เมื่อฐานข้อมูลปกติและเป็นปัจจุบัน จะแสดงข้อความนี้:
# Pending: 0 Applied: 0 Failed: 0
# "Pending: N" หมายความว่ามีไฟล์ migration จำนวน N ไฟล์ที่ตาราง schema_migrations
# ยังไม่มีการบันทึกแถวข้อมูล — scripts/migrate.sh จะนำไปใช้ตามลำดับ

# ตรวจสอบว่ามีอะไรถูกประยุกต์ใช้ไปแล้วบ้าง
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT version, filename, applied_at FROM public.schema_migrations ORDER BY version DESC LIMIT 10;"
```

Migrations ทั้งหมดถูกเขียนขึ้นในลักษณะ idempotent (`CREATE ... IF NOT EXISTS`, ป้องกันด้วยบล็อก `DO $$ ... $$`) ดังนั้นการรัน `scripts/migrate.sh` ซ้ำบนฐานข้อมูลที่เป็นปัจจุบันอยู่แล้ว ย่อมปลอดภัยไม่มีผลข้างเคียง ดูหัวข้อ "Migration Governance" ใน `docs/architecture/ARCHITECTURE.md` สำหรับเหตุผลที่มีตัวรัน migration เพียงตัวเดียว ไม่ใช่สามตัว

---

## รายการตรวจสอบความปลอดภัยก่อนนำไปใช้งานจริง (Pre-Production)

> [!CAUTION]
> ก่อนนำไปใช้งานจริง ข้อมูลรับรองที่เป็นค่าเริ่มต้นทั้งหมดต้องถูกเปลี่ยน มิฉะนั้นระบบจะเปิดรับการเข้าถึงโดยไม่ได้รับอนุญาต.

| ข้อมูลประจำตัว             | ค่าเริ่มต้น           | ตำแหน่ง                                             | สิ่งที่ต้องทำ                                                                                                                                                                                |
| ------------------------ | ------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INGEST_API_KEY`         | `ims-secret-key`   | `.env` + `docker-compose.yaml` (`ims-node-red` env) | **ต้องเปลี่ยน** — ผู้ใช้ที่ไม่ได้รับอนุญาตสามารถแทรกข้อมูลที่ถูกปลอมแปลงผ่าน `POST /inject` ได้                                                                                                                |
| `POSTGRES_PASSWORD`      | `change-me-please` | `.env`                                              | **ต้องเปลี่ยน** — สิทธิการเข้าถึงของผู้ใช้สูงสุดในฐานข้อมูล                                                                                                                                                         |
| `GRAFANA_ADMIN_PASSWORD` | `change-me-please` | `.env`                                              | **ต้องเปลี่ยน** — สิทธิการแก้ไขแดชบอร์ด + การเข้าถึงแหล่งข้อมูล                                                                                                                                                |
| `ALARM_API_DB_PASSWORD`  | `change-me-please` | `.env`                                              | **ต้องเปลี่ยน** — ข้อมูลประจำตัวสำหรับ role `alarm_api_writer` (migration `078-alarm-api-writer-role.sql`); จำกัดขอบเขตแค่ `SELECT`+`UPDATE` บน `ldi_alarm_lifecycle` เท่านั้น แต่ก็เป็น credential DB ของจริง |

### วิธีหมุนเวียน (Rotate)

```bash
# 1. สร้างความลับ (secrets) ชุดใหม่
NEW_API_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
NEW_DB_PASS=$(python -c "import secrets; print(secrets.token_urlsafe(24))")
NEW_GRAFANA_PASS=$(python -c "import secrets; print(secrets.token_urlsafe(24))")
NEW_ALARM_API_DB_PASS=$(python -c "import secrets; print(secrets.token_urlsafe(24))")

# 2. อัปเดต .env
sed -i "s/^INGEST_API_KEY=.*/INGEST_API_KEY=$NEW_API_KEY/" .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_DB_PASS/" .env
sed -i "s/^GRAFANA_ADMIN_PASSWORD=.*/GRAFANA_ADMIN_PASSWORD=$NEW_GRAFANA_PASS/" .env
sed -i "s/^ALARM_API_DB_PASSWORD=.*/ALARM_API_DB_PASSWORD=$NEW_ALARM_API_DB_PASS/" .env

# 3. อัปเดตรหัสผ่าน DB ของ grafana_reader และ alarm_api_writer
docker compose exec -T timescaledb psql -U ims_admin -d ims \
 -c "ALTER ROLE grafana_reader WITH PASSWORD '$NEW_DB_PASS';"
docker compose exec -T timescaledb psql -U ims_admin -d ims \
 -c "ALTER ROLE alarm_api_writer WITH PASSWORD '$NEW_ALARM_API_DB_PASS';"

# 4. รีสตาร์ทบริการทั้งหมด (pgbouncer จะโหลด userlist.txt ใหม่จาก .env ในตอนเริ่มทำงาน)
docker compose up -d

# 5. ตรวจสอบ
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
curl -s -X POST http://localhost:1880/inject \
 -H "Content-Type: application/json" \
 -H "x-api-key: $NEW_API_KEY" \
 -d '{"machine_id":"TEST"}'
```

### คำสั่งสำหรับตรวจสอบ (Verification Commands)

```bash
# ยืนยันว่ามีการบังคับใช้ INGEST_API_KEY (ควรส่งคืน 401 เมื่อไม่มี key)
curl -s -w "\nHTTP: %{http_code}" -X POST http://localhost:1880/inject \
 -H "Content-Type: application/json" -d '{"machine_id":"TEST"}'
# ควรได้รับ: HTTP 401

# ยืนยันว่า Grafana ต้องการให้ล็อกอิน
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/dashboards
# ควรได้รับ: 401 (ไม่ใช่ 200)
```

---

## การเพิ่มอุปกรณ์ใหม่

### ขั้นตอนที่ 1: ลงทะเบียนในฐานข้อมูล

ตาราง `public.devices` จัดประเภท `device_type` อย่างเคร่งครัดระหว่าง `'server'` (โครงสร้างพื้นฐานที่มีการตรวจสอบผ่าน SNMP, ซึ่งเป็นค่าเริ่มต้น) และ `'ldi'` (เครื่องผลิต LDI). ตรวจสอบให้แน่ใจว่าได้ระบุประเภทที่เหมาะสม มิฉะนั้นจะเปลี่ยนเป็น `'server'` โดยค่าเริ่มต้น และจะไม่ปรากฏในแดชบอร์ด LDI ใดๆ:

```sql
-- เพิ่มโครงสร้างพื้นฐานเซิร์ฟเวอร์ใหม่ (สืบค้นผ่าน SNMP)
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, snmp_community, snmp_port, enabled)
VALUES ('NEW-MACHINE-01', '192.168.1.100', '192.168.1.100', 'server', 'public', 161, true);

-- เพิ่มเครื่อง LDI ใหม่ (ข้าม SNMP — ป้อนข้อมูลผ่าน ldi_ingestion.json / เครื่องจำลอง)
INSERT INTO public.devices (device_id, hostname, ip_address, device_type, enabled)
VALUES ('LDI-11', 'LDI-11', '', 'ldi', true);

-- การยืนยัน
SELECT device_id, hostname, device_type, snmp_community, enabled FROM public.devices WHERE device_id IN ('NEW-MACHINE-01', 'LDI-11');
```

### ขั้นตอนที่ 2: ตรวจสอบการเชื่อมต่อ SNMP

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

### ขั้นตอนที่ 3: ตรวจสอบเส้นทางข้อมูล

```bash
# รอ 30 วินาทีเพื่อให้รอบการทำงานของการรวบรวมข้อมูลเสร็จสิ้น
sleep 30

# ตรวจสอบการรับข้อมูล
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
 FROM public.sys_metrics s
 WHERE device_id = 'NEW-MACHINE-01'
 GROUP BY device_id;"
```

### ขั้นตอนที่ 4: เพิ่มหน้าแดชบอร์ด (ไม่จำเป็น)

หากเครื่องใหม่ต้องใช้หน้าแดชบอร์ดโดยเฉพาะ:

1. เปิด Grafana → Dashboard → Edit
2. เพิ่มพาเนล (Panel) ใหม่
3. ใช้แบบสอบถาม: `SELECT time, cpu_load_percent FROM public.sys_metrics WHERE device_id IN (\${machine_id:sqlstring}) ORDER BY time DESC`
4. บันทึกแดชบอร์ด

---

## การจัดการการแจ้งเตือน

### ที่ตั้งของกฎการแจ้งเตือน

ไฟล์: `monitoring/prometheus/rules/ims-alerts.yml`

### การแก้ไขกฎการแจ้งเตือน

**ตัวอย่าง: การปรับเปลี่ยนเกณฑ์ High CPU Load:**

```yaml
- alert: HighCpuLoad
 # เปลี่ยนจาก 80% เป็น 85%
 expr: avg_over_time(cpu_load_percent[5m]) > 85
 for: 5m
 labels:
 severity: warning
 annotations:
 summary: "High CPU load on {{ $labels.machine_id }}"
 description: "CPU load {{ $value }}% exceeds threshold 85%"
```

**ตัวอย่าง: การเพิ่มการแจ้งเตือนใหม่สำหรับการสั่นสะเทือน (Vibration) ของ LDI:**

```yaml
- alert: LDI_Vibration_Critical
 expr: ldi_vibration > 10.0
 for: 5m
 labels:
 severity: critical
 annotations:
 summary: "LDI vibration critical on {{ $labels.machine_id }}"
 description: "Vibration {{ $value }} mm/s exceeds threshold 10.0"
```

### โหลดค่าปรับแต่งใหม่ (Reload Configuration)

```bash
# หลังจากแก้ไขกฎการแจ้งเตือน จะต้องโหลดข้อมูลใหม่เสมอ
curl -X POST http://localhost:9090/-/reload

# ตรวจสอบไวยากรณ์ (Syntax)
docker compose exec prometheus promtool check rules /etc/prometheus/rules/ims-alerts.yml
```

### กฎการระงับ (Inhibition Rules)

ระบบใช้กฎการระงับ (Inhibition Rules) แบบอัตโนมัติ:

| การแจ้งเตือนต้นทาง           | การแจ้งเตือนที่ถูกระงับ | ขอบเขต                   |
| -------------------------- | ----------------- | ------------------------ |
| `InterfaceDown` (critical) | คำเตือนทั้งหมด        | ในเครื่องเดียวกัน             |
| `ServiceDown` (critical)   | คำเตือนทั้งหมด        | ในเครื่องเดียวกัน             |
| `NodeREDDown`              | `TelemetryGap`    | แบบวงกว้างทั้งหมด          |
| `Critical`                 | `Warning`, `Info` | alertname และ เครื่องเดียวกัน |

---

## การแก้ปัญหา

### ปัญหาที่พบบ่อยและวิธีการแก้ไข

| ปัญหา                                 | สาเหตุ                                     | วิธีแก้ไข                                                               |
| ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Grafana แสดง "No Data"              | PgBouncer การเชื่อมต่อเต็มหรือฐานข้อมูลล่ม            | พิมพ์คำสั่ง `docker restart ims-pgbouncer` และเช็คพื้นที่ว่างของดิสก์              |
| ไม่มีการแจ้งเตือนส่งไปยัง LINE/Teams      | Alertmanager Webhook หายไป                 | ตรวจสอบ log ของ Node-RED ที่โหนด `POST/alert-webhook`                   |
| กราฟแบนด์วิธพุ่งสูงถึง Tbps              | 32-bit Counter Wrap                        | ถูกจัดการแล้วโดย parser, หากเจอปัญหา ให้เช็คว่าอุปกรณ์รองรับ HC (64-bit) หรือไม่ |
| Node-RED เริ่มทำงานไม่ได้               | มีไวยากรณ์ผิดพลาดใน Flow JSON                  | ตรวจสอบ log: `docker compose logs --tail=50 node-red`                   |
| Continuous Aggregate ขาดหายข้อมูล       | จำเป็นต้องรีเฟรชข้อมูลด้วยตนเอง                      | พิมพ์คำสั่ง `CALL refresh_continuous_aggregate('sys_hourly', NULL, NULL);`  |
| คอนเทนเนอร์ค้างอยู่ที่สถานะ "Restarting" | การกำหนดค่าขัดแย้งหรือมีพอร์ตทับซ้อน                | เช็ค log สำหรับคอนเทนเนอร์ตัวนั้น                                             |

### โปรโตคอลการตรวจสอบ SRE

```bash
# 1. รีสตาร์ทแบบสะอาด
docker compose down -v && docker compose up -d

# 2. รอ 40 วินาที
sleep 40

# 3. ตรวจสอบคอนเทนเนอร์ (13 ตัวรันต่อเนื่อง + ims-db-migrate ที่ควรขึ้นว่า Exited (0))
docker compose ps

# 4. ตรวจสอบข้อมูลเข้า
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest
FROM public.sys_metrics s JOIN public.devices d ON d.device_id = s.device_id
WHERE s.time > NOW() - INTERVAL '5 minutes'
GROUP BY device_id;"

# 5. ตรวจสอบ Continuous Aggregates
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT bucket, avg_cpu, max_temp
FROM public.sys_hourly
ORDER BY bucket DESC LIMIT 4;"

# 6. ตรวจสอบ Grafana
curl -sf http://localhost:3000/api/health

# 7. ตรวจสอบ Prometheus Targets
curl -sf http://localhost:9090/api/v1/targets | python3 -c "
import sys, json
data = json.load(sys.stdin)
ups = sum(1 for t in data['data']['activeTargets'] if t['health'] == 'up')
total = len(data['data']['activeTargets'])
print(f'Prometheus: {ups}/{total} targets UP')
"
```

---

## การสำรองข้อมูลและการกู้คืน

### การสำรองฐานข้อมูล (Database Backup)

```bash
# ทำการสำรองฐานข้อมูลเต็มรูปแบบ
docker compose exec timescaledb pg_dump -U ims_admin ims > backup_$(date +%Y%m%d).sql

# กู้คืนจากข้อมูลสำรอง
cat backup_20260627.sql | docker compose exec -T timescaledb psql -U ims_admin -d ims

# สำรองอัตโนมัติ (cron)
0 2 * * * docker compose exec timescaledb pg_dump -U ims_admin ims > /backup/ims_$(date +\%Y\%m\%d).sql
```

### การสำรอง Flow

```bash
# nodered_data/flows/*.json คือแหล่งความจริง (source of truth) ที่ได้รับการดูแลโดย git
# (ซึ่งจะถูกรวมเป็น nodered_data/flows.json โดยสคริปต์ scripts/build-flows.js -- ห้ามแก้ไขไฟล์ flows.json ด้วยตนเอง)
# สำรองข้อมูลไฟล์ nodered_data/flows.json (ไฟล์ที่ใช้ตอนรัน)
cp nodered_data/flows.json nodered_data/flows.json.bak

# กู้คืนจากข้อมูลสำรอง
cp nodered_data/flows.json.bak nodered_data/flows.json
docker compose restart node-red
```

### การสำรองการกำหนดค่า (Configuration Backup)

```bash
# สำรองไฟล์ docker-compose
cp docker-compose.yaml docker-compose.yaml.bak
cp docker-compose.prod.yaml docker-compose.prod.yaml.bak
cp proxy/nginx.conf proxy/nginx.conf.bak

# สำรอง Prometheus config
cp monitoring/prometheus/prometheus.yml monitoring/prometheus/prometheus.yml.bak
cp monitoring/prometheus/rules/ims-alerts.yml monitoring/prometheus/rules/ims-alerts.yml.bak

# สำรองแดชบอร์ด Grafana
cp -r monitoring/grafana/dashboards/ monitoring/grafana/dashboards.bak/
```

---

## การตรวจสอบประสิทธิภาพ

### ตัวชี้วัดระบบ

```bash
# การใช้ทรัพยากรของ Container
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# การเชื่อมต่อฐานข้อมูล
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT count(*) as active_connections
FROM pg_stat_activity
WHERE state = 'active';"

# การใช้ดิสก์
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT pg_size_pretty(pg_database_size('ims')) as database_size;"

# ขนาดของตาราง
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;"
```

### ตัวชี้วัดของ Prometheus

```bash
# ระยะเวลาการกวาดข้อมูล (Scrape duration)
curl -s http://localhost:9090/api/v1/query?query=prometheus_scrape_duration_seconds

# จำนวนข้อมูลที่ได้รับ
curl -s http://localhost:9090/api/v1/query?query=prometheus_tsdb_head_samples_appended_total

# จำนวนการแจ้งเตือน
curl -s http://localhost:9090/api/v1/alerts | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'Active alerts: {len(data[\"data\"][\"alerts\"])}')
"
```

### การวิเคราะห์ Log (Log Analysis)

```bash
# ข้อผิดพลาด Node-RED
docker compose logs node-red 2>&1 | grep -i "error" | tail -20

# ข้อผิดพลาด Prometheus
docker compose logs prometheus 2>&1 | grep -i "error" | tail -20

# ข้อผิดพลาด Alertmanager
docker compose logs alertmanager 2>&1 | grep -i "error" | tail -20

# คำสั่งฐานข้อมูลที่ช้า
docker compose exec timescaledb psql -U ims_admin -d ims -c "
SELECT query, calls, mean_time, total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;"
```

---

<div align="center">

**IMS Admin Manual — Version 1.1**

_สำหรับทีม IT & MIS-G_

</div>
