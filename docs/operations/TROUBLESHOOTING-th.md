<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# คู่มือการแก้ไขปัญหา IMS

> **กลุ่มเป้าหมาย:** SRE/ฝ่ายปฏิบัติการ, วิศวกรที่เข้าเวร (On-call)
> **วัตถุประสงค์:** คู่มือ SRE (Runbook) สำหรับการปฏิบัติงานและวินิจฉัยสแต็กการตรวจสอบ (monitoring stack) ของ IMS
> **ที่มา:** ตรวจสอบกับ docker-compose และสแต็กการตรวจสอบในระบบจริงเมื่อวันที่ 2026-08-10

## การตรวจสอบสถานะเบื้องต้น (Quick Health Check)

รันคำสั่งเหล่านี้ตามลำดับเพื่อประเมินสถานะของระบบ:

```bash
# 1. สถานะคอนเทนเนอร์
docker compose ps

# 2. ยืนยันการเริ่มระบบ Node-RED
docker logs ims-node-red 2>&1 | tail -5

# 3. กระแสข้อมูล Telemetry (ควรแสดงจำนวนแถวของแต่ละเครื่อง)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) as rows, MAX(s.time) as latest \
 FROM public.sys_metrics s JOIN public.devices d ON d.device_id = s.device_id \
 WHERE s.time > NOW() - INTERVAL '5 minutes' GROUP BY device_id;"

# 4. เป้าหมาย Prometheus (ทั้งหมดควรมีสถานะเป็น UP)
curl -s http://localhost:9090/api/v1/targets | python3 -c \
 "import sys,json; d=json.load(sys.stdin); \
 up=sum(1 for t in d['data']['activeTargets'] if t['health']=='up'); \
 print(f'{up}/{len(d[\"data\"][\"activeTargets\"])} targets UP')"
```

## รูปแบบความล้มเหลว (Failure Modes)

| อาการ (Symptom) | สาเหตุที่เป็นไปได้ (Likely Cause) | วิธีวินิจฉัย (Diagnostic) | การแก้ไข (Resolution) |
| --- | --- | --- | --- |
| **Node-RED เกิดการวนลูปการล่ม (crash-looping)** | การเชื่อมต่อฐานข้อมูลล้มเหลว หรือขาดโมดูล npm | `docker logs ims-node-red --tail=50` | ตรวจสอบ PgBouncer: `docker logs ims-pgbouncer --tail=20` ยืนยันว่า `.env` มี `POSTGRES_PASSWORD` หากขาดโมดูลให้สร้างใหม่: `docker compose build --no-cache node-red && docker compose up -d node-red` |
| **Node-RED ขึ้น "Started flows" แต่ไม่มีข้อมูล** | เป้าหมาย SNMP ไม่สามารถเข้าถึงได้ หรือค่า community string ผิดพลาด | `docker exec ims-node-red node -e "const s=require('net-snmp').createSession('ims-snmpsim','apex_mock',{port:161,version:2});s.get(['1.3.6.1.2.1.1.3.0'],(e,v)=>{console.log(e\|\|v);s.close()})"` | ตรวจสอบว่า snmpsim ทำงานอยู่หรือไม่: `docker logs ims-snmpsim --tail=5` ตรวจสอบให้แน่ใจว่า community string ตรงกับโปรไฟล์ (`ubuntu` หรือ `windows`) |
| **Grafana แสดง "No Data" บนพาเนล** | CAGG ยังไม่ถูกรีเฟรช หรือช่วงเวลาไม่ถูกต้อง | `docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT COUNT(*) FROM public.sys_hourly WHERE bucket > NOW() - INTERVAL '1 hour';"` | CAGG จะใช้เวลาประมาณ 3 นาทีในการโหลดข้อมูลหลังจากการรีสตาร์ท โปรดรอและรีเฟรช หาก count=0 ให้ตรวจสอบข้อผิดพลาด INSERT ในล็อกของ Node-RED |
| **Grafana ขึ้นข้อความ "Panel plugin not found: clock"** | ไม่ได้ติดตั้งปลั๊กอิน หรือวอลุ่มค้าง (stale volume) | `docker compose exec grafana grafana-cli plugins ls` | ล้างวอลุ่ม Grafana: `docker compose rm -fs grafana && docker volume rm ims_grafana_data && docker compose up -d grafana` |
| **TimescaleDB มีการใช้ CPU สูง** | เกิดการรีเฟรช CAGG พร้อมกันจำนวนมาก (refresh storm) หรือคิวรีที่ไม่ได้รับการปรับปรุงประสิทธิภาพ | `docker compose exec timescaledb psql -U ims_admin -d ims -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 5;"` | ตรวจสอบอัตราการรีเฟรชแดชบอร์ด Grafana แดชบอร์ด Capacity ควรอยู่ที่ 5 นาที ไม่ใช่ 10 วินาที ยกเลิกคิวรีที่ใช้เวลานาน: `SELECT pg_terminate_backend(pid);` |
| **PgBouncer ขึ้นข้อความ "server login has been failing"** | แคชการรับรองความถูกต้องค้างหลังจากการเปลี่ยนรหัสผ่าน | `docker logs ims-pgbouncer --tail=20 \| grep -i "login\|error"` | รีสตาร์ท PgBouncer: `docker compose restart pgbouncer` ยืนยันว่าตัวแปรสภาพแวดล้อม `DATABASE_URL` ตรงกับข้อมูลประจำตัวของ TimescaleDB |
| **คิวการลองใหม่เพิ่มขึ้น** (`/data/retry_queue.json`) | การแทรกฐานข้อมูลล้มเหลวซ้ำๆ | `docker exec ims-node-red cat /data/retry_queue.json \| python3 -c "import sys,json; q=json.load(sys.stdin); print(f'Queue: {len(q)} entries, latest error: {q[-1][\"error\"] if q else \"none\"}')"` | ตรวจสอบการเชื่อมต่อ PgBouncer สามารถลองใหม่ได้สูงสุด 5 ครั้งต่อรายการ รวมสูงสุด 500 รายการ คิวจะถูกระบายอัตโนมัติทุกๆ 30 วินาที |
| **Alertmanager แสดงเป้าหมาย blackbox เป็น "TargetDown"** | ชื่อ Docker DNS ใน prometheus.yml ไม่ถูกต้อง | `curl -s http://localhost:9090/api/v1/targets \| python3 -c "import sys,json; [print(t['labels'].get('job','?'), t['health']) for t in json.load(sys.stdin)['data']['activeTargets']]"` | เป้าหมาย Blackbox ต้องใช้ชื่อบริการ `blackbox-exporter:9115` ห้ามใช้ชื่อคอนเทนเนอร์ `ims-blackbox` หรือ `blackbox:9115` |
| **Docker แจ้งข้อผิดพลาด "port already in use"** | เกิดความขัดแย้งของพอร์ต Windows NAT | `netstat -ano \| findstr :1880` | รันคำสั่ง: `net stop winnat && net start winnat` เพื่อรีเซ็ต Windows NAT |
| **ไม่สามารถเข้าถึง Grafana ที่พอร์ต :3000** | `proxy` (nginx) ดาวน์ — นี่เป็นทางเข้าจุดเดียวที่มีการเผยแพร่ผ่านโฮสต์ Grafana ไม่ได้เผยแพร่พอร์ตของตัวเองอีกต่อไป | `docker logs ims-proxy --tail=20` | รีสตาร์ท: `docker compose restart proxy` หาก `proxy` ทำงานปกติแต่ Grafana ดาวน์ ให้ตรวจสอบ `docker logs ims-grafana` |
| **คอนโซลการแจ้งเตือน Ack/Resolve ล้มเหลว (403)** | `auth_request` ของ `proxy` ที่ส่งไปยัง `/api/user` ของ Grafana ล้มเหลว หรือเซสชันหมดอายุ | `docker logs ims-proxy --tail=20`; ยืนยันว่าเข้าสู่ระบบ Grafana ในเบราว์เซอร์เดียวกันแล้ว | เข้าสู่ระบบ Grafana ใหม่อีกครั้ง หากยังพบปัญหา ให้ตรวจสอบ `/auth-check` location ของ `proxy/nginx.conf` ว่าตั้งค่าพร็อกซีไปยัง `grafana:3000` ถูกต้องหรือไม่ |
| **คอนโซลการแจ้งเตือน Ack/Resolve ล้มเหลว (500)** | `alarm-api` ไม่สามารถเชื่อมต่อกับ Postgres หรือขาดบทบาท/การให้สิทธิ์ `alarm_api_writer` | `docker logs ims-alarm-api --tail=20` | รีสตาร์ท: `docker compose restart alarm-api` ตรวจสอบว่าใช้งาน migration `078-alarm-api-writer-role.sql` แล้ว: `bash scripts/migrate.sh` |

## การปฏิบัติงานทั่วไป (Common Operations)

### การรีสตาร์ทบริการเดียว

```bash
docker compose restart node-red # รีสตาร์ทไปป์ไลน์
docker compose restart grafana  # โหลด JSON ของแดชบอร์ดใหม่
docker compose restart prometheus # โหลดกฎการแจ้งเตือนใหม่
docker compose restart proxy  # โหลดคอนฟิก nginx ใหม่ (proxy/nginx.conf)
docker compose restart alarm-api # รีสตาร์ทบริการเส้นทางการเขียน (write-path) เพื่อรับทราบ/แก้ไขการแจ้งเตือน
```

### การติดตั้งการเปลี่ยนแปลงโฟลว์ (Deploy flow changes)

```bash
make deploy-flows # รวมโฟลว์ที่แยกไว้ → POST ไปยัง Admin API
```

### ตรวจสอบสถานะฐานข้อมูล

```bash
# จำนวนแถวต่อเครื่อง (5 นาทีล่าสุด)
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT device_id, COUNT(*) FROM public.sys_metrics \
 WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY device_id;"

# ความสดใหม่ของข้อมูล CAGG
docker compose exec timescaledb psql -U ims_admin -d ims -c \
 "SELECT MAX(bucket) as latest FROM public.sys_hourly;"
```

### การสำรองและการคืนค่า (Backup and restore)

```bash
make backup     # สำรองข้อมูลไปที่ backups/backup_YYYYMMDD.sql
make restore FILE=backups/backup_20260701.sql
```

### การรีสตาร์ทแบบล้างข้อมูลทั้งหมด (ทำลายข้อมูลทั้งหมด)

```bash
docker compose down -v && docker compose up -d
# รอ 40 วินาทีเพื่อให้ระบบเริ่มทำงาน, จากนั้น:
make deploy-flows
```

## ตัวแปรสภาพแวดล้อม (Environment Variables)

| ตัวแปร (Variable) | จำเป็น (Required) | ค่าเริ่มต้น (Default) | วัตถุประสงค์ (Purpose) |
| --- | --- | --- | --- |
| `POSTGRES_DB` | ใช่ | `ims` | ชื่อฐานข้อมูล |
| `POSTGRES_USER` | ใช่ | `ims_admin` | ผู้ใช้ฐานข้อมูล |
| `POSTGRES_PASSWORD` | ใช่ | — | รหัสผ่านฐานข้อมูล |
| `GRAFANA_ADMIN_USER` | ใช่ | `admin` | ชื่อผู้ใช้ผู้ดูแลระบบ Grafana |
| `GRAFANA_ADMIN_PASSWORD` | ใช่ | — | รหัสผ่านผู้ดูแลระบบ Grafana |
| `NODE_RED_CREDENTIAL_SECRET` | ใช่ | — | เข้ารหัสข้อมูลประจำตัวของโฟลว์ที่เก็บไว้ |
| `LINE_CHANNEL_ACCESS_TOKEN` | ไม่ | — | โทเค็น LINE Messaging API |
| `LINE_USER_ID` | ไม่ | — | LINE user ID สำหรับการแจ้งเตือน |
| `TEAMS_WEBHOOK_URL` | ไม่ | — | MS Teams incoming webhook URL |

## เส้นทางการยกระดับปัญหา (Escalation Path)

1. ตรวจสอบ `docker compose ps` — มีคอนเทนเนอร์ใดที่ไม่ทำงานหรือไม่?
2. ตรวจสอบล็อกของคอนเทนเนอร์ที่ล้มเหลว — `docker logs <container> --tail=50`
3. ตรวจสอบการเชื่อมต่อฐานข้อมูล — `docker compose exec timescaledb pg_isready`
4. ตรวจสอบเครือข่าย — `docker compose exec node-red ping pgbouncer`
5. หากวิธีอื่นล้มเหลวทั้งหมด: `docker compose down -v && docker compose up -d && make deploy-flows`

## การตอบสนองต่อเหตุการณ์ (Incident Response)

ไฟล์นี้ใช้สำหรับคำสั่งการดีบักของ SRE เท่านั้น สำหรับการจัดประเภทความรุนแรง, การยกระดับปัญหา, และคู่มือการจัดการเหตุการณ์แบบทีละขั้นตอน โปรดดูที่ `docs/operations/INCIDENT_RESPONSE.md` — คู่มือดำเนินการอย่างเป็นทางการ ที่มีตัวอย่างการปฏิบัติงานจากประวัติการทำงานจริงของระบบ (ไฟล์เวอร์ชันก่อนหน้านี้มีการทำซ้ำเนื้อหาดังกล่าวด้วยระดับความรุนแรงที่ขัดแย้งกัน จึงได้ถูกนำออกไปเมื่อวันที่ 2026-08-13 เพื่อป้องกันไม่ให้เอกสารทั้งสองมีความไม่สอดคล้องกัน)

---

[⬅️ กลับสู่คู่มือแพลตฟอร์ม IMS](../architecture/IMS_PLATFORM_BOOK.md) | [<img src="../../docs/assets/icons/home.svg" width="18" align="center" /> คลังเก็บโค้ดหลัก](../../README.md)
