# คู่มือแก้ปัญหา IMS

> Runbook สำหรับ SRE เพื่อดูแลระบบมอนิเตอร์ IMS ตอนตี 3

## ตรวจสอบสถานะเบื้องต้น

รันคำสั่งตามลำดับเพื่อประเมินสถานะระบบ:

```bash
# 1. สถานะคอนเทนเนอร์
docker compose ps

# 2. ยืนยันการเริ่มทำงาน Node-RED
docker logs ims-node-red 2>&1 | tail -5

# 3. โฟลว์ข้อมูล (ควรแสดงแถวสำหรับแต่ละเครื่อง)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest \
 FROM public.sys_metrics s JOIN public.devices d ON d.device_id = s.device_id \
 WHERE s.time > NOW() - INTERVAL '5 minutes' GROUP BY device_id;"

# 4. เป้าหมาย Prometheus (ทั้งหมดควรเป็น UP)
curl -s http://localhost:9090/api/v1/targets | python3 -c \
 "import sys,json; d=json.load(sys.stdin); \
 up=sum(1 for t in d['data']['activeTargets'] if t['health']=='up'); \
 print(f'{up}/{len(d[\"data\"][\"activeTargets\"])} targets UP')"
```

## โหมดความล้มเหลว

| อาการ                                                | สาเหตุที่เป็นไปได้                                                                           | การวินิจฉัย                                                                                                                                                                                           | การแก้ไข                                                                                                                                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node-RED crash-looping**                           | เชื่อมต่อ DB ล้มเหลว หรือขาด npm modules                                                     | `docker logs ims-node-red --tail=50`                                                                                                                                                                  | ตรวจสอบ PgBouncer: `docker logs ims-pgbouncer --tail=20`. ยืนยันว่า `.env` มี `POSTGRES_PASSWORD`. บิวด์ใหม่ถ้าขาด modules: `docker compose build --no-cache node-red && docker compose up -d node-red` |
| **Node-RED "Started flows" แต่ไม่มีข้อมูล**          | ติดต่อเป้าหมาย SNMP ไม่ได้ หรือ community string ผิด                                         | `docker exec ims-node-red node -e "const s=require('net-snmp').createSession('ims-snmpsim','Netk@',{port:161,version:2});s.get(['1.3.6.1.2.1.1.3.0'],(e,v)=>{console.log(e                            |                                                                                                                                                                                                         | v);s.close()})"` | ยืนยัน snmpsim ทำงาน: `docker logs ims-snmpsim --tail=5`. ตรวจสอบ community string ว่าตรงกับโปรไฟล์ (`ubuntu` หรือ `windows`) |
| **Grafana "No Data" บนพาเนล**                        | CAGG ยังไม่รีเฟรช หรือช่วงเวลาผิด                                                            | `docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT COUNT(*) FROM public.sys_hourly WHERE bucket > NOW() - INTERVAL '1 hour';"`                                                      | CAGGs ใช้เวลาประมาณ 3 นาทีเพื่อเติมข้อมูลหลังรีสตาร์ท. รอและรีเฟรช. ถ้า count=0, ตรวจสอบ logs ของ Node-RED สำหรับ error การ INSERT                                                                      |
| **Grafana "Panel plugin not found: clock"**          | ไม่ได้ติดตั้งปลั๊กอิน หรือวอลุ่มค้าง                                                         | `docker compose exec grafana grafana-cli plugins ls`                                                                                                                                                  | ลบวอลุ่ม Grafana: `docker compose rm -fs grafana && docker volume rm ims_grafana_data && docker compose up -d grafana`                                                                                  |
| **High CPU บน TimescaleDB**                          | รีเฟรช CAGG พร้อมกัน หรือ query ไม่ได้ปรับแต่ง                                               | `docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5;"`                                     | ตรวจสอบอัตราการรีเฟรชแดชบอร์ด Grafana. Capacity dashboard ควรเป็น 5m, ไม่ใช่ 10s. ฆ่า long queries: `SELECT pg_terminate_backend(pid);`                                                                 |
| **PgBouncer "server login has been failing"**        | auth cache ค้างหลังเปลี่ยนรหัสผ่าน                                                           | `docker logs ims-pgbouncer --tail=20 \| grep -i "login\|error"`                                                                                                                                       | รีสตาร์ท PgBouncer: `docker compose restart pgbouncer`. ยืนยัน `DATABASE_URL` env var ว่าตรงกับ credentials ของ TimescaleDB                                                                             |
| **Retry queue เพิ่มขึ้น** (`/data/retry_queue.json`) | การ INSERT ข้อมูลล้มเหลวซ้ำๆ                                                                 | `docker exec ims-node-red cat /data/retry_queue.json \| python3 -c "import sys,json; q=json.load(sys.stdin); print(f'Queue: {len(q)} entries, latest error: {q[-1][\"error\"] if q else \"none\"}')"` | ตรวจสอบการเชื่อมต่อ PgBouncer. ลองใหม่สูงสุด 5 ครั้งต่อ entry, สูงสุด 500 entries. Queue ระบายออกอัตโนมัติทุก 30 วินาที                                                                                 |
| **Alertmanager "TargetDown" สำหรับ blackbox**        | ชื่อ Docker DNS ใน prometheus.yml ผิด                                                        | `curl -s http://localhost:9090/api/v1/targets \| python3 -c "import sys,json; [print(t['labels'].get('job','?'), t['health']) for t in json.load(sys.stdin)['data']['activeTargets']]"`               | เป้าหมาย Blackbox MUST ใช้ชื่อเซอร์วิส `blackbox-exporter:9115`, NOT ชื่อคอนเทนเนอร์ `ims-blackbox` หรือ `blackbox:9115`                                                                                |
| **Docker "port already in use"**                     | Windows NAT port ชนกัน                                                                       | `netstat -ano \| findstr :1880`                                                                                                                                                                       | รัน: `net stop winnat && net start winnat` เพื่อรีเซ็ต Windows NAT                                                                                                                                      |
| **เข้าถึง Grafana ที่ :3000 ไม่ได้**                 | `proxy` (nginx) ดาวน์ — เป็นจุดเข้าเดียวที่โฮสต์พับลิช, Grafana เลิกพับลิชพอร์ตของตัวเองแล้ว | `docker logs ims-proxy --tail=20`                                                                                                                                                                     | รีสตาร์ท: `docker compose restart proxy`. ถ้า `proxy` ปกติแต่ Grafana ดาวน์, ตรวจสอบ `docker logs ims-grafana`                                                                                          |
| **Alarm Console Ack/Resolve ล้มเหลว (403)**          | `auth_request` ของ `proxy` ไปยัง `/api/user` ของ Grafana ล้มเหลว, หรือเซสชั่นหมดอายุ         | `docker logs ims-proxy --tail=20`; ยืนยันว่าล็อกอิน Grafana ในเบราว์เซอร์เดียวกัน                                                                                                                     | ล็อกอิน Grafana ใหม่. ถ้ายังเป็นอยู่, ตรวจสอบ `/auth-check` location ใน `proxy/nginx.conf` ว่า proxy ไปที่ `grafana:3000` ถูกต้อง                                                                       |
| **Alarm Console Ack/Resolve ล้มเหลว (500)**          | `alarm-api` ติดต่อ Postgres ไม่ได้, หรือขาด role/grants `alarm_api_writer`                   | `docker logs ims-alarm-api --tail=20`                                                                                                                                                                 | รีสตาร์ท: `docker compose restart alarm-api`. ยืนยันว่า migration `078-alarm-api-writer-role.sql` ถูกใช้งาน: `bash scripts/migrate.sh`                                                                  |

## การทำงานทั่วไป

### รีสตาร์ทเซอร์วิสเดียว

```bash
docker compose restart node-red # รีสตาร์ท pipeline
docker compose restart grafana  # โหลด dashboard JSON ใหม่
docker compose restart prometheus # โหลด alert rules ใหม่
docker compose restart proxy  # โหลด nginx config ใหม่ (proxy/nginx.conf)
docker compose restart alarm-api # รีสตาร์ทเซอร์วิสเขียนข้อมูล alarm ack/resolve
```

### ดีพลอยการเปลี่ยนแปลง Flow

```bash
make deploy-flows # รวม split flows → POST ไปที่ Admin API
```

### ตรวจสอบสถานะ Database

```bash
# จำนวนแถวต่อเครื่อง (5 นาทีล่าสุด)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) FROM public.sys_metrics \
 WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY device_id;"

# ความใหม่ของ CAGG
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT MAX(bucket) as latest FROM public.sys_hourly;"
```

### สำรองและกู้คืน

```bash
make backup     # สำรองไปยัง backups/backup_YYYYMMDD.sql
make restore FILE=backups/backup_20260701.sql
```

### รีสตาร์ทแบบล้างข้อมูลทั้งหมด (ทำลายข้อมูลทั้งหมด)

```bash
docker compose down -v && docker compose up -d
# รอ 40 วินาทีให้เริ่มทำงาน, จากนั้น:
make deploy-flows
```

## ตัวแปรสภาพแวดล้อม

| ตัวแปร                       | จำเป็น | ค่าเริ่มต้น | วัตถุประสงค์                             |
| ---------------------------- | ------ | ----------- | ---------------------------------------- |
| `POSTGRES_DB`                | ใช่    | `ims`       | ชื่อ Database                            |
| `POSTGRES_USER`              | ใช่    | `ims_admin` | ผู้ใช้ Database                          |
| `POSTGRES_PASSWORD`          | ใช่    | —           | รหัสผ่าน Database                        |
| `GRAFANA_ADMIN_USER`         | ใช่    | `admin`     | ชื่อผู้ใช้ admin Grafana                 |
| `GRAFANA_ADMIN_PASSWORD`     | ใช่    | —           | รหัสผ่าน admin Grafana                   |
| `NODE_RED_CREDENTIAL_SECRET` | ใช่    | —           | เข้ารหัส credentials ของ flow ที่เก็บไว้ |
| `LINE_CHANNEL_ACCESS_TOKEN`  | ไม่    | —           | token ของ LINE Messaging API             |
| `LINE_USER_ID`               | ไม่    | —           | user ID ของ LINE สำหรับ alerts           |
| `TEAMS_WEBHOOK_URL`          | ไม่    | —           | URL incoming webhook ของ MS Teams        |

## เส้นทางการยกระดับปัญหา

1. ตรวจสอบ `docker compose ps` — มีคอนเทนเนอร์ไหนไม่รันไหม?
2. ตรวจสอบ logs ของคอนเทนเนอร์ที่ล้มเหลว — `docker logs <container> --tail=50`
3. ตรวจสอบการเชื่อมต่อ DB — `docker compose exec timescaledb pg_isready`
4. ตรวจสอบเครือข่าย — `docker compose exec node-red ping pgbouncer`
5. ถ้าทุกอย่างล้มเหลว: `docker compose down -v && docker compose up -d && make deploy-flows`

## การตอบสนองต่อเหตุการณ์

ไฟล์นี้สำหรับคำสั่งดีบักระดับ SRE เท่านั้น. สำหรับการจัดระดับความรุนแรง, การยกระดับปัญหา, และ playbooks ตอบสนองเหตุการณ์แบบทีละขั้นตอน, ดูที่ `docs/operations/INCIDENT_RESPONSE.md` — runbook หลักที่ใช้อ้างอิง, พร้อมตัวอย่างการทำงานจริงจากประวัติระบบ. (ไฟล์นี้เวอร์ชั่นเก่ามีเนื้อหาซ้ำซ้อนโดยใช้ระดับความรุนแรงที่ขัดแย้งกัน; ลบออกเมื่อ 2026-08-13 เพื่อหยุดการขัดแย้งของสองเอกสาร)
