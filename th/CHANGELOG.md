# Changelog

> **บันทึกการเปลี่ยนแปลง IMS (Industrial Monitoring System)**
> รูปแบบอ้างอิงจาก [Keep a Changelog](https://keepachangelog.com/)

---

<div align="center">

<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Version:** 1.0.1
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Release:** Production
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Date:** 2026-08-21

</div>

---

## [Unreleased] — `main` ณ 2026-09-28

### เพิ่มเข้ามา (รวมเข้า `main` ระหว่าง 2026-09-10 ถึง 2026-09-28)
- **PR #20** — EAP SCADA ชั้น 1: แผนที่การทำงานแสดงสถานะ REAL/UNAVAILABLE เป็นค่าเริ่มต้นแทนสถานะจำลอง พร้อมผลตรวจสอบฉบับเต็ม
- **PR #21** — CSS/UI/UX: design token, ตัวอักษร, เลย์เอาต์ responsive, motion และ baseline ของ visual regression ที่ commit ไว้ พร้อม lint ตรวจความตรงกันของ token และการคลาดเคลื่อนของสีสถานะใน pre-commit และ CI
- **PR #22** — `integration/andon-layout-safe` → `main`: รวมงาน Factory Twin 3D และ EAP เข้าสู่ `main` (แก้ conflict 13 จุด และคง commit ที่มีเฉพาะใน main ไว้) บอร์ด Operator Andon แสดงได้พอดีโดยไม่ต้องเลื่อนที่ 1920×1080 และ 3840×2160 และประกาศไม่รองรับ 1280×720
- **PR #23** — ตรวจสอบเชิงลึกขณะรันของ Factory Twin 3D (render loop, วงจรชีวิต WebGL, ประสิทธิภาพที่วัดได้) และ cache การอ่านไฟล์ geometry/mapping/zone ที่เป็นข้อมูลลับ
- **งานเจาะและงานชุบ VCP** — แดชบอร์ด 7 ชุดในโฟลเดอร์ Grafana ใหม่สองโฟลเดอร์ (01 งานเจาะ, 04 VCP), กฎแจ้งเตือน VCP 7 ข้อ, data source `drilling-timescaledb` สำหรับฐานข้อมูล `eap_backup` และ migration 083–086:
  - 083: ตัวป้องกันฐานข้อมูล;
  - 084–086: view ของงานเจาะ, index และ schema แยกตามโดเมนพร้อมแค็ตตาล็อกข้อมูล ใช้ view เท่านั้นและไม่เปลี่ยนชื่อสิ่งใด

  โฟลเดอร์ Grafana ทั้งสี่โฟลเดอร์ใช้หมายเลข 01–04 แล้ว

  สำหรับฐานข้อมูลที่ไม่มีข้อมูลโรงงาน มีตัวสร้างข้อมูลสังเคราะห์ที่สร้าง `eap_backup` ให้ (`docs/data/MOCK_DATA.md`) และมี unit test ครอบคลุมตัวสร้างนี้ ซึ่งรันใน pre-commit และ CI

  ตัวป้องกันขณะรัน:
  - ตั้ง `jit=off` และค่าจำนวน worker, timeout และการบันทึก query ที่ช้าบน TimescaleDB;
  - ผูก pgAdmin ไว้ที่ `127.0.0.1`;
  - เพิ่มเส้นทาง nginx สำหรับการตรวจสุขภาพของ Grafana และ WebSocket ของ Grafana Live;
  - หยุดกฎแจ้งเตือน Cpk ของ LDI สองข้อไว้ชั่วคราวจนกว่าจะแก้ `v_machine_spc_ranking`

### การแก้ไขด้านความปลอดภัยและความถูกต้อง
- **การตรวจ role ของ alarm-api:**
  - เดิมอ่าน role จาก `/api/user` ของ Grafana ซึ่งไม่มี `orgRole` ทำให้ทุกคำสั่ง acknowledge/resolve ได้ 403 แม้แต่ Admin ตอนนี้อ่านจาก `/api/user/orgs` ขององค์กรปัจจุบันของ session
  - Viewer ยังได้ 403 ส่วน Grafana server admin เขียนได้
  - ตรวจแบบ end to end ผ่าน nginx กับ Grafana 13.1.2 แล้ว และเทสต์รันใน pre-commit และ CI แล้ว (`scripts/run-alarm-api-tests.js`)
- **header ของ nginx:**
  - ตั้ง `X-XSS-Protection: 0` ตามแนวทางปัจจุบัน
  - เพิ่ม `Permissions-Policy`
  - ซ่อน header `X-Frame-Options` / `X-XSS-Protection` / `X-Content-Type-Options` ที่ Grafana ส่งซ้ำ ให้แต่ละ header ถึง browser เพียงค่าเดียว
- **ตรึงเวอร์ชัน image:** `grafana-image-renderer` เป็น `v5.11.1` และ `pgadmin4` เป็น `9.18` จากเดิมที่เป็น `:latest` ทั้งสองเป็นเวอร์ชันที่พิสูจน์แล้วในระบบที่รันอยู่
- **Dependabot:**
  - ครอบคลุม Dockerfile ใน `nodered_data`, `pgbouncer` และ `services/*` รวมถึง image ใน `docker-compose.yaml` แล้ว ค่า `docker` ที่ `/` แบบเดิมไม่ครอบคลุมอะไรเลย
  - รวมการอัปเดต minor/patch เป็นกลุ่มเดียว
- **dependency ของ npm:** แก้ `express`, `qs`, `body-parser`, `fast-uri`, `js-yaml` และ `svgo` ภายในช่วงเวอร์ชันที่อนุญาต ตอนนี้ `npm audit` รายงาน 0 ทั้งที่ root, `alarm-api` และ `factory-twin-3d`
- **แก้ไขเอกสาร (en/th/zh-CN):**
  - ซ่อมสูตร LaTeX ใน 18 ไฟล์ที่บั๊ก escape ทำให้กลายเป็นอักขระ TAB/form-feed
  - เขียน `BACKUP_RESTORE`, `DATA_GOVERNANCE` และ `SLO_DEFINITIONS` ใหม่ให้ตรงกับสคริปต์, role, retention policy ที่ใช้จริง และ metric ที่ส่งออกจริง เดิมเอกสารอธิบายการสำรองแบบ AES-256, ฐานข้อมูล `factory_telemetry`, role และ metric PromQL ที่ไม่มีอยู่จริง และการปฏิบัติตามมาตรฐานที่ไม่เคยได้รับการรับรอง
  - แก้เอกสารอ้างอิง alarm-api: ผู้ดำเนินการมาจาก session, มี 401/403, ไม่มี port บนเครื่อง
  - แก้ขอบเขตความปลอดภัยของ EAP: ปัจจุบันเป็น HTTP ธรรมดา

### การแก้ไขตามผลตรวจ (2026-09-29)
- **นำข้อมูลโรงงานออกจาก tree สาธารณะ:**
  - ปัดค่า recipe ใน simulator (dosage, scan speed, อุณหภูมิ, ความชื้น, vacuum, PE/JE)
  - แทนชื่อเครื่องจริงด้วย `LDI-nn` และล้างค่า default ของ `log_id` ใน Machine Snapshot
  - เรียบเรียงข้อความ alarm ของ vendor ใหม่ (คง code เดิม) และเบลอ screenshot สองภาพใน README
  - เปลี่ยน ID เครื่องเจาะใน mock เป็น `MOCK-DRL-nnn`
  - ประวัติ git ยังมีค่าเดิมอยู่
- **Fleet Availability:** หารด้วยจำนวนเครื่องที่ส่งข้อมูลอยู่ ไม่ใช่ทุกแถวอุปกรณ์ที่เปิดใช้งาน แถวอุปกรณ์ legacy จึงไม่ดึงตัวเลขลงอีก
- **Guardrail ที่เคยผ่านทั้งที่พัง:**
  - `repo-hygiene-linter` crash บน Linux (`%(objectsize)` ไม่ได้ quote)
  - `panel-data-check` เคยนับ SQL error เป็น "0 แถว" ตอนนี้หยุดเมื่อ error, รันแต่ละ dashboard กับฐานข้อมูลของตัวเอง, แทนค่า template variable และ repeat panel และนับการ skip เป็น fail ในโหมด strict
  - `orphan-object-linter` fail ใน CI เมื่อต่อฐานข้อมูลไม่ได้
- **Migration:** runner หยุดที่ไฟล์แรกที่ fail migration ที่ต้องใช้ `eap_backup` แต่ไม่พบจะถูกรายงานว่า deferred และรันใหม่ในการ start ครั้งถัดไป แทนที่จะถูกบันทึกว่า applied
- **CI:** สร้าง `eap_backup` สังเคราะห์ก่อน panel check test ที่ไม่เคยรันทั้งใน pre-commit และ CI ตอนนี้รันทั้งสองที่ และ `promtool` ตรงกับเวอร์ชัน Prometheus ที่ใช้งานจริง
- **VCP alert rule:** `execErrState: KeepLast` เมื่อยังไม่มี `eap_backup` จึงไม่แจ้งเตือนตั้งแต่วันแรก
- **LDI ingestion:**
  - `"0"` คงเป็น 0 และ `state` ที่หายไปเป็น NULL ไม่ใช่ "running"
  - แถวที่ไม่มี `eqp_id`/`log_id` ถูกปฏิเสธพร้อม index และ batch เกิน 1,000 แถวได้ 413
  - DB pool ที่ค้างถูกสร้างใหม่แทนการปิด Node-RED
- **LDI simulator:**
  - alarm ใช้ process และ factory ของเครื่องนั้น
  - ลด noise พื้นหลัง และเพิ่มความถี่ของ fault ด้าน vacuum/alignment ให้ alarm ที่เกิดจากเงื่อนไขจริงเป็นส่วนใหญ่
  - ความผันผวนของสภาพแวดล้อมตรงกับ standard deviation ใน profile
  - alarm จำลองถูก acknowledge และ resolve โดย actor `simulator` (`LDI_SIM_AUTO_LIFECYCLE`)
  - มี test replay 24 ชั่วโมงครอบคลุม
- **Dashboard:** กราฟ SPC moving-average แยก series ต่อเครื่อง panel scan speed และ judgment error ใน Engineering Drill-Down มีชื่อและหน่วยที่ถูกต้อง
- **การ deploy:** `make verify` fail ถ้า secret ใดใน `.env` ยังเท่ากับค่าสาธารณะใน `.env.example` (แสดงเฉพาะชื่อ)
- **เครื่องมือ:**
  - `make doctor`, `deploy-flows` และ `test-unit` รันได้จาก make ทุก shell และ `test-unit` รัน unit test ทั้งหมด
  - ไม่ติดตั้ง Grafana plugin ที่ไม่ได้ใช้แล้ว
  - init script ไม่ hardcode ชื่อฐานข้อมูลและ owner อีก

### แถบการ์ดของ Drilling Fleet (2026-09-30)
- **ไม่กระโดดกลับต้นแถบเมื่อ refresh อีกต่อไป** ทุกครั้งที่ refresh แผง Business Text สร้าง HTML ใหม่ แถบการ์ดจึงเริ่มที่ตำแหน่ง 0 และตำแหน่งเดิมถูกใส่กลับหลังจากหน้าจอวาดไปแล้วหนึ่งเฟรม จึงเห็นการกระโดด 5 ใน 6 ครั้งที่ refresh ทุก 5 วินาที (วัดจริง) ตอนนี้แถบถูกควบคุมโดยตัวเลื่อนตัวเดียวที่อยู่นอกการ render และใส่ตำแหน่งคืนใน MutationObserver ก่อน browser วาดหน้าจอ ผลคือไม่กระโดดเลยตลอด 12 ครั้งที่ refresh และเลื่อนคงที่ 25 px/วินาที
- การหยุดเมื่อวางเมาส์ การลาก การหมุนล้อ และการเลื่อนกลับที่ปลายแถบ ไม่หายไปเมื่อ refresh (เดิมหลัง refresh จะไม่รู้ว่าเมาส์วางอยู่บนการ์ด แถบจึงเลื่อนไปใต้เมาส์) การลากที่ปล่อยบนการ์ดไม่เปิดหน้าเครื่องนั้นแล้ว โฟกัสคีย์บอร์ดและการตั้งค่าลดการเคลื่อนไหวของระบบปฏิบัติการหยุดการเลื่อนอัตโนมัติ

### การตั้งค่าแดชบอร์ด (2026-09-30)
- **แดชบอร์ดทั้ง 22 ตัว** ใช้การตั้งค่าระดับแดชบอร์ดชุดเดียวกัน บังคับด้วย `dashboard-linter` Check 20: timezone และวันเริ่มสัปดาห์รับจาก `grafana.ini` (`Asia/Bangkok`, วันจันทร์) แทนที่จะปนกันระหว่าง browser, UTC และ Asia/Bangkok, ใช้ shared crosshair, `editable: false`, มีชั้น "Annotations & Alerts" ในตัว (เดิม 5 ตัวไม่มี), มีลิงก์ไปแดชบอร์ดทั้งโฟลเดอร์ (เดิม 8 ตัวไม่มีลิงก์เลย) และ panel id ไม่ซ้ำ (เดิม 19 panel ไม่มี id)
- **แดชบอร์ด LDI และ Platform** แสดงเวลาโรงงานแล้ว เดิมแสดง UTC ช้ากว่านาฬิกาหน้างาน 7 ชั่วโมง
- **Drilling 02–04:** ตัวกรอง Factory เดิมแสดง "2" แต่ไม่กรองอะไรเลย ตอนนี้แสดงรายการ factory จาก `machine_master` และจำกัดรายการเครื่องเหมือนหน้า 01 รายการเครื่องของ Machine Investigation เลิกสแกนตาราง event ทั้งตาราง (จาก 209 ms เหลือ 21 ms บนข้อมูลโรงงาน) และ refresh ทุก 30 วินาทีแทน 5 วินาทีบนช่วง 30 วัน
- **สิทธิ์โฟลเดอร์:** `scripts/grafana-folder-permissions.js` ตั้ง Editor และ Viewer เป็น View บนโฟลเดอร์ที่ provision แดชบอร์ดจึงเกิดขึ้นนอก git ไม่ได้
- ลบตัวแปร data source ที่ไม่ได้ใช้ (Meta-Monitoring) และ `time_options` ที่เลิกใช้แล้ว ป้ายตัวกรอง VCP เป็น Factory, Status, Error type

### การตั้งค่า Grafana (2026-09-30)
- **`monitoring/grafana/grafana.ini`** เป็นแหล่งค่าเดียว ส่วน compose ส่งเฉพาะความลับและค่าที่ต่างกันแต่ละ deployment มี 3 key ที่ Grafana ข้ามไปเงียบๆ (`hide_version` และ `disable_sanitize_html` ใต้ `[security]` และ `hide_new_plugins`) และ path ของแดชบอร์ดหน้าแรกชี้ไปไฟล์ที่ไม่มีอยู่
- **ปิดข้อมูลที่เปิดเผย:** `/api/health` ไม่แสดงเวอร์ชันและ commit เมื่อไม่ login, nginx ปฏิเสธ `/metrics` และปิด snapshot ภายนอก (`snapshots.raintank.io`) กับ public dashboard
- **ความปลอดภัยฝั่ง browser:** Content-Security-Policy พร้อม nonce ต่อ request และ `frame-ancestors 'self'` เลิกเรียก gravatar, ข่าวจาก grafana.com, analytics และการตรวจอัปเดต
- **บัญชีผู้ใช้:** รหัสผ่านใหม่หรือที่เปลี่ยนต้องผ่าน password policy ของ Grafana ห้ามสร้าง org และระบุอายุ session ชัดเจน
- **Plugin:** ติดตั้งจาก `preinstall_sync` แบบล็อกเวอร์ชันก่อน start ปิดการจัดการ plugin จาก UI และปิด plugin ค่าเริ่มต้นที่ไม่ได้ใช้ การ start จึงไม่ต้องใช้อินเทอร์เน็ตนอกจาก panel 2 ตัวที่ล็อกไว้
- **Provisioning:** ลบแดชบอร์ดที่ provision ผ่าน UI ไม่ได้แล้ว และถอด data source Mentor LDI ที่ไม่เคยได้รับค่าการเชื่อมต่อ ส่วน renderer callback ใช้พอร์ตใน container ของ Grafana แทนพอร์ตของ host

### การเสริมความปลอดภัย (2026-09-29 รอบที่สาม)
- **PgBouncer:** client ยืนยันตัวตนด้วย `scram-sha-256` แทน `plain` รหัสผ่านจึงไม่วิ่งเป็นข้อความธรรมดาในเครือข่าย Docker อีก รหัสผิดจะได้ `SASL authentication failed`
- **คอนเทนเนอร์:** ทุก service ยกเว้น pgAdmin รันด้วย `no-new-privileges` ส่วน pgAdmin ยกเว้นไว้เพราะอาจต้องใช้ file capability เพื่อ bind พอร์ต 80
- **`docker-compose.prod.yaml`:** เลิกตั้งค่า `GF_SECURITY_COOKIE_SECURE`, HSTS และการ sanitize HTML เพราะบนประตูหน้าที่เป็น HTTP ธรรมดา Secure cookie ทำให้ login จากเครื่องอื่นไม่ได้เลย และการ sanitize ทำให้แดชบอร์ด Business Text ใช้ไม่ได้ ตอนนี้ overlay ตั้งเฉพาะข้อจำกัดทรัพยากรและระดับ log ตามที่เอกสารบอก
- **การสแกน secret:** ระบุ gitleaks เป็น v8.28.0 และสแกน flow, เอกสาร และ README ด้วย ส่วน `scripts/pre-commit.js` ไม่ยอมให้ commit ไฟล์ `.env` (เดิมแค่ข้ามไป)
- **`SECURITY.md`:** ตารางข้อจำกัดที่ทราบตรงกับการตั้งค่าที่รันอยู่จริงแล้ว

### การเสริมความปลอดภัย (2026-09-29 รอบที่สอง)
- **ยืนยันตัวตนของ alert webhook:** `/alert-webhook` ต้องมี `Authorization: Bearer <ALERT_WEBHOOK_TOKEN>` (ไม่มีได้ 401 และได้ 503 ถ้าไม่ได้ตั้ง token) Alertmanager ส่ง token จาก compose secret และ contact point ของ Grafana ก็ส่งด้วย ตอนนี้ `ALERT_WEBHOOK_TOKEN` บังคับต้องมี
- **Role ฐานข้อมูลสิทธิ์ต่ำสุด (migration 087):** Node-RED เขียนข้อมูลด้วย `nodered_writer` และ observability archiver ด้วย `observability_archiver` แต่ละ role ได้สิทธิ์เฉพาะตารางที่ใช้ ไม่มีตัวไหนเป็น superuser แล้ว คีย์ใหม่ที่บังคับใน `.env`: `NODERED_DB_PASSWORD`, `ARCHIVER_DB_PASSWORD`
- **Docker socket:** archiver ไม่ mount `/var/run/docker.sock` แล้ว อ่าน event ของ container ผ่าน `docker-socket-proxy` ที่อนุญาตเฉพาะ endpoint แบบอ่าน (ปฏิเสธ POST) บน network ภายใน และติดตั้งเครื่องมือไว้ใน image ของตัวเองแทนการติดตั้งทุกครั้งที่เริ่ม
- **การแทรกสคริปต์ในแดชบอร์ด:** ปุ่ม acknowledge/resolve ของ Alarm Console และลิงก์เครื่องของ drilling fleet ไม่ใส่ค่าจากฐานข้อมูลลงใน JavaScript ของ `onclick` แล้ว และ VCP wall ไม่เขียนตัวแปรจาก URL ลงในลิงก์โดยไม่ escape อีก `dashboard-linter` ปฏิเสธทั้งสองรูปแบบ
- **Operator Andon:** tile เปลี่ยนเป็นสีเทา STALE เมื่อข้อมูลเก่ากว่า 5 นาทีเทียบกับนาฬิกาจริง pipeline ที่หยุดจึงไม่ทำให้ค้างสีเขียว ใช้ `?var-clock=replay` เพื่อกลับไปแบบ replay เดิม
- **สถานะ LDI ล่าสุดต่อเครื่อง (migration 088):** เก็บใน `ldi_machine_last_state` ด้วย trigger ตอน insert และ `v_ldi_machine_latest_full` อ่านจากตารางนี้โดยคอลัมน์เหมือนเดิม ต้นทุนจึงไม่โตตามขนาด `ldi_data` อีก
- **Drilling Fleet Overview:** การ์ดแต่ละใบแสดงโรงงาน ("F3 - DRL001-M") จากตาราง `machine_master` ใหม่ (migration 089 สร้างเฉพาะโครงสร้าง) และตัวกรอง Factory มีผลกับการ์ดและ KPI แล้ว เครื่องที่ไม่มีในตารางยังแสดงอยู่ในชื่อ "F?" ตำแหน่ง scroll แนวนอนคงอยู่หลัง auto-refresh และหลังโหลดหน้าใหม่
- **การหมุนเวียน credential:** ขั้นตอนในเอกสารปิด statement logging ของ session ก่อน เพราะเมื่อเปิด DDL logging คำสั่ง `ALTER ROLE ... PASSWORD` จะไปอยู่ใน log ของเซิร์ฟเวอร์

### เอกสารและการจัดระเบียบคลังโค้ด (Documentation & Repository Hygiene)
- ตรวจทานเอกสารและรายการแสดงสถานะระบบทั้งหมดเทียบกับระบบจริง (`main`) ณ 2026-09-28 ครบทั้ง 3 ภาษา (EN/TH/ZH-CN)
- ซิงค์ป้ายเวอร์ชันเป็น `v1.0.1` ครบทุกภาษา และนำเอกสารกฎเกณฑ์หลัก (`AGENTS.md`) ออกจาก `.gitignore`
- อัปเดตและตรวจสอบรายการแดชบอร์ด (`DASHBOARD_INVENTORY.md` 22 แดชบอร์ด 225 พาเนล) และสคีมาฐานข้อมูล (`DATABASE_SCHEMA.md` 61 ไมเกรต 013–086) ให้ตรงกับระบบจริง 100% ปราศจากความคลาดเคลื่อน
- ยกระดับกฎ `.gitignore` ครอบคลุมการบล็อกไฟล์บีบอัดและไฟล์สำรองชั่วคราว (`*.zip`, `*.tar.gz`, `*.tgz`)
- ตรวจทานเอกสารที่ใช้งานอยู่เทียบกับ `main` ใหม่ทั้งภาษาอังกฤษ ไทย และจีนตัวย่อ: README, `CLAUDE.md`, ดัชนีเอกสาร, คู่มือผู้ดูแลระบบและคู่มือผู้ใช้, runbook งานปฏิบัติการ, สถาปัตยกรรม, นโยบายความปลอดภัย, แนวทางการมีส่วนร่วม
- ไม่เปิดเผยขนาดของอาคารชั้น 1 ในเอกสารสาธารณะ และลบชื่อ host ของเซิร์ฟเวอร์จริงกับไฟล์ข้อมูลส่วนบุคคลที่ถูกคัดลอกเป็นฉบับแปลออก
- ปรับมาตรฐานแถบนำทางสากล (`GLOBAL_NAV`) 3 ภาษาพร้อมข้อความท้องถิ่นและพาธสัมพัทธ์ในเอกสาร Markdown กว่า 600 ไฟล์
- ยกระดับกฎ `.gitignore` เพื่อป้องกันข้อมูล Telemetry ดิบโรงงานหลุดสู่สาธารณะ (`*.csv`, `*.parquet`, `*.dump`, `/vcp/`)
- ปรับแก้คำอธิบายพอร์ตภายในของ TimescaleDB ในคู่มือผู้ดูแลระบบ สถาปัตยกรรม และนโยบายความปลอดภัยให้ตรงกับ docker-compose ทั้ง 3 ภาษา (EN/TH/ZH-CN)
- เพิ่มแท็กภาษา (syntax highlighting) ให้กับบล็อกโค้ดในเอกสารครบ 100% แก้ไข bare code fences ทั้งหมดตามมาตรฐาน CommonMark/GFM
- เพิ่มฉบับแปลภาษาไทยและจีนตัวย่อสำหรับคู่มือ `CLAUDE.md` ครบถ้วน
- บันทึกหลักฐานและผลตรวจสอบที่ระบุวันที่ใช้หน้าชี้ไปยังต้นฉบับภาษาอังกฤษใน `th/` และ `zh-CN/` และลิงก์สัมพัทธ์กับ anchor ทุกตัวใช้งานได้

### การแก้ไขข้อความใน 1.0.1
- *"ปลอดภัยระดับโลก 100% … กวาดล้างประวัติ Git ทั้งหมด"*: การทำความสะอาดครอบคลุมเฉพาะสิ่งที่ทราบในขณะนั้น ไม่ใช่การรับประกัน ให้ถือว่าประวัติทั้งหมดเป็นข้อมูลสาธารณะ และเปลี่ยน secret ใดก็ตามที่เคยเข้าไปอยู่ใน commit
- *"แปลเอกสารทั้งหมด"*: ไม่ใช่ทุกเอกสารที่ได้รับการแปล นโยบายปัจจุบันอธิบายไว้ใน `docs/README.md`

## [1.0.1] - 2026-08-21 (World-Class Open Source Edition)

### จุดเด่น (Highlights)
- **ปลอดภัยระดับโลก 100% (Security Compliance)**: กวาดล้างประวัติ Git ย้อนหลังทั้งหมด 1,100+ Commits ลบข้อมูล IP จริง, ชื่อเครื่องจักร และรหัส Error ของ Vendor ออกแบบถอนรากถอนโคน
- **สถาปัตยกรรม V2 (V2 Normalized Architecture)**: ย้ายระบบนำเข้าข้อมูล Node-RED สู่โครงสร้าง JSON แบบบรรทัดฐาน และผูก Schema SQL Insert
- **ระบบตรวจสอบก่อน Commit (Pre-commit Suite)**: เพิ่ม Husky Hooks ที่บังคับผ่าน Unit tests, E2E tests, Dashboard Linters, Security Exceptions และการอัปเดตเอกสาร
- **รองรับทุกระบบปฏิบัติการ (Cross-Platform)**: แก้ไขบั๊ก CRLF ระหว่าง Windows/Linux ที่ทำให้ Node-RED แครช และปรับมาตรฐาน Path
- **เอกสาร 3 ภาษา (Multilingual Excellence)**: แปลและปรับปรุงเอกสารทั้งหมด รวมถึง README ให้ตรงกันทุกประการทั้ง อังกฤษ, ไทย และจีนตัวย่อ
- **กราฟิกระดับ NOC (Cyberpunk NOC UI)**: เปลี่ยนรูปภาพสแตติกเป็นภาพ GIF แอนิเมชันสแกนเนอร์ 60 FPS สุดล้ำสำหรับหน้าจอบริหาร

### ความปลอดภัย (Security)
- **ระบบจัดการ CVE (CVE Exceptions Engine)**: สร้างกลไกจัดการช่องโหว่ (เช่น Grafana Go stdlib DoS) แบบมีวันหมดอายุที่ทำงานด้วยโค้ด (Programmatic Gate)
- **ทำลายข้อมูลจริง (Physical Data Scrub)**: ลบ Database Dumps และ Logs เก่าที่เก็บในเครื่อง (แม้จะอยู่ใน `.gitignore`) เพื่อป้องกันการหลุดรอดจากการก๊อปปี้ไฟล์
- **เสริมแกร่ง Nginx (Nginx Hardening)**: บังคับจำกัด Rate-limiting (`100r/s`) และขนาด Header (`16k`) บน Reverse Proxy

### การแก้ไขบั๊ก (Fixed)
- ปัญหา Script ตรวจสอบ `verify-deployment.ps1` ค้างบน Windows จากการ Resolve IPv6 `localhost`
- ปัญหา Dashboard ของ Grafana ทับซ้อนกัน (บังคับใช้กฎ Grid-24)
- ปัญหา Barrier Timeout ภายใน Node-RED AIOps Parser
- ปัญหานโยบาย Refresh ของ Continuous Aggregate (`sys_hourly`) ไม่ทำงาน
- แปลงโค้ดทดสอบที่ใช้ `as` ไปเป็น `@total-typescript/shoehorn`

## [1.0.0] — 2026-06-29 (Production Release)

### Highlights

- **5-Thread Parallel Walker** — CPU, Storage, Network, Temperature, LDI
- **Device Registry** — การจัดการเครื่องแบบใช้ฐานข้อมูล (1-1000+ เครื่อง)
- **4 Grafana Dashboards** — NOC, System, Engineering, Capacity Planning
- **38 Alert Rules** — มาตรฐาน AIOps, Predictive, SRE
- **K6 Load Test** — 1,000 VUs, ล้มเหลว 0%, p95 < 80ms
- **CI/CD Pipeline** — GitHub Actions พร้อมการสแกนความปลอดภัย

### Fixed

- OID ระดับองค์กรของ LDI ไม่ตรงกัน (9999 vs 99999)
- เส้นเชื่อมโหนด `bypass_error` ไม่เชื่อมต่อ (ทำให้เกิดปัญหา barrier timeout)
- `walk_ldi` ขาดหายไปจากขอบเขต `catch_walker`
- คำนวณ `ldiTemp` แล้วแต่ไม่ได้บันทึกลงฐานข้อมูล
- อัลกอริทึม heuristic การนับรอบ (wraparound) ของเคาน์เตอร์ไม่ถูกต้องสำหรับเคาน์เตอร์แบบ 64 บิต
- ข้อผิดพลาดของ escape sequence สำหรับอีโมจิในข้อความแจ้งเตือน
- พอร์ตโฮสต์ Docker ชนกัน (snmpsim 1161, pgbouncer 6432)
- ธุรกรรมการไมเกรตของ TimescaleDB ไม่รองรับ
- ปัญหาไฟล์ข้อมูลรับรองที่ตกค้างยังคงอยู่หลังจากใช้คำสั่ง `docker compose down -v`

### Added

- **Device Registry Pattern** — ตาราง `public.machines` รวมเข้ากับ SNMP walker
- **LINE Notify / MS Teams Webhooks** — การแจ้งเตือนที่แท้จริง
- **Database Migration System** — `database/migrations/` พร้อม SQL แบบ idempotent
- **23 Unit Tests** — ผ่านทั้งหมด, ครอบคลุมตรรกะการแยกข้อมูล (parsing logic)
- **CI/CD Secret Stubs** — ตรวจสอบ Compose ได้โดยไม่ต้องใช้ข้อมูลรับรองจริง
- **Gitleaks Allowlist** — `.env`, `.playwright-mcp/`, `nodered_data/`
- **Backup/Restore Scripts** — `scripts/backup-db.sh`, `scripts/restore-db.sh`
- **SECURITY.md** — ข้อจำกัดที่ทราบและรายการตรวจสอบเพื่อเสริมความปลอดภัย
- **CHANGELOG.md** — ไฟล์นี้
- **CONTRIBUTING.md** — แนวทางการพัฒนา
- **LICENSE** — สัญญาอนุญาต MIT
- **Makefile** — 8 เป้าหมาย (up, down, restart, verify, backup, restore, logs, test)
- **docker-compose.override.yaml** — ใช้สำหรับการพัฒนา (snmpsim)
- **docker-compose.prod.yaml** — ใช้สำหรับโปรดักชัน
- **Incident Response Runbook** — `docs/runbooks/incident-response.md`
- **Deployment Readiness Assessment** — `docs/deployment-readiness.md`
- **Scaling Plan** — `docs/scaling-plan.md`
- **Prometheus Exporter** — การกำหนดค่าการตรวจสอบตัวเองของ Node-RED

### Changed

- แยก `docker-compose.yaml` ออกเป็น base/dev/prod
- แหล่งที่มาหลักของ Flow: `node-red/flows/ingestion.json` + `alerting.json`
- walkers ทั้งหมดใช้ `msg.host`/`msg.community` แทนค่าแบบฮาร์ดโค้ด
- `walk_storage` อัปเกรดเป็นเครื่องยนต์คู่ (ใช้ subtree ในโปรดักชัน, ใช้ GET ในการพัฒนา)
- เพิ่ม `sysUpTime` OID ไปยัง `walk_net_get` สำหรับการตรวจจับการนับรอบของเคาน์เตอร์ (counter wraparound)
- ประเภทคอลัมน์ของ LDI เปลี่ยนจาก INT เป็น DOUBLE PRECISION
- สถาปัตยกรรมอัปเกรดเป็น 5-Thread Parallel Walker
- บริการทั้งหมดใช้ภายในเท่านั้น (ไม่มีการผูกพอร์ตโฮสต์)

### Security

- ยกเลิกการติดตาม `.mimocode/` และ `.playwright-mcp/` จาก git
- ลบ GitHub PAT ออกจากไฟล์ที่มีการติดตาม
- การตั้งค่า Node-RED adminAuth พร้อมใช้งาน
- พอร์ต PgBouncer ไม่ถูกเปิดเผยบนโฮสต์อีกต่อไป

---

## [0.9.0] — 2026-06-24 (Pre-Refactor Baseline)

### Added

- 5-Thread Bulletproof AIOps Parser v7
- Dual-Engine SNMP Walker (เฉพาะเครือข่าย)
- กฎการระงับของ Alertmanager (inhibition rules)

---

<div align="center">

**IMS Changelog — Version 1.0**

_รูปแบบอ้างอิงจาก [Keep a Changelog](https://keepachangelog.com/)_

</div>
