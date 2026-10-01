# scripts/ (สคริปต์การทำงาน)

สคริปต์สำหรับการปฏิบัติการและบิลด์ระบบ ให้รันจากรากของคลังโค้ด (repository root) สคริปต์ส่วนใหญ่ถูกห่อหุ้มไว้ด้วยเป้าหมายของ `make` (ดูคำสั่งทั้งหมดได้ที่ `make help`) ส่วนสคริปต์ที่เหลือสามารถรันได้โดยตรง

สคริปต์ที่สร้างขึ้นเพื่อแก้ปัญหาในอดีตเพียงครั้งเดียวจะไม่เก็บไว้ที่นี่: ให้ลบทิ้งเมื่อรันเสร็จ และปล่อยให้ git history เป็นผู้เก็บบันทึกประวัติ

## วงจรชีวิตของคอนเทนเนอร์ (Stack lifecycle)

| สคริปต์ | วัตถุประสงค์ | จุดเรียกใช้งาน (Entry point) |
| --- | --- | --- |
| `check-env.js` | ปฏิเสธการเริ่มระบบหากขาดคีย์จำเป็นใน `docker-compose.yaml`; อ็อปชัน `--strict` จะปฏิเสธค่าตัวอย่างสาธารณะ | `make up`, `make up-prod`, `make check-env` |
| `migrate-entrypoint.sh` | ตัวรันไมเกรชันหลักมาตรฐานเพียงตัวเดียว รันผ่านคอนเทนเนอร์แบบครั้งเดียว `db-migrate` | `docker compose up` |
| `migrate.sh` | สั่งรัน `db-migrate` ซ้ำด้วยตนเอง | เรียกตรง (direct) |
| `verify-deployment.sh` / `.ps1` | ตรวจสอบสุขภาพระบบ: คอนเทนเนอร์, ฐานข้อมูล, ไปป์ไลน์, การแจ้งเตือน | `make verify` |
| `verify-db-health.sh` / `.ps1` | ตรวจสอบความสมบูรณ์ของฐานข้อมูล | เรียกตรง (direct) |
| `container-watchdog.sh` | รีสตาร์ตคอนเทนเนอร์ที่หยุดทำงานซึ่ง restart policy ของ Docker Desktop ตรวจไม่พบ | เรียกตรง / ตั้งเวลา |
| `observability-archiver.sh` | ทำงานภายในคอนเทนเนอร์ `observability-archiver` | compose |
| `switch-data-mode.sh` | สลับโหมดข้อมูลระหว่างข้อมูลจริงกับข้อมูลสังเคราะห์ | เรียกตรง (direct) |
| `import-real-data.sh` | ตัดรอบนำเข้าข้อมูลจริงสำหรับ LDI telemetry และการแจ้งเตือน | เรียกตรง (direct) |

## การสำรองข้อมูลและการกู้คืนจากภัยพิบัติ (Backup and disaster recovery)

| สคริปต์ | วัตถุประสงค์ | จุดเรียกใช้งาน (Entry point) |
| --- | --- | --- |
| `backup-db.sh` / `.ps1` | ทำ `pg_dump -Z` ภายในคอนเทนเนอร์ และคัดลอกออกมาด้วย `docker cp` | `make backup` |
| `restore-db.sh` | กู้คืนไฟล์ดัมพ์ `.sql.gz` กลับเข้าสู่ฐานข้อมูลที่กำลังทำงาน | `make restore FILE=…` |
| `dr-test.sh`, `dr-verify-restore.sh`, `dr-restore-table-data.py` | ซักซ้อมกู้ภัยพิบัติและตรวจสอบผลการกู้คืน | เรียกตรง (direct) |

ดูรายละเอียดเพิ่มเติมที่ [การสำรองและกู้คืนข้อมูล](../docs/operations/BACKUP_RESTORE.md)

## การบิลด์และการดีพลอย (Build and deploy)

| สคริปต์ | วัตถุประสงค์ | จุดเรียกใช้งาน (Entry point) |
| --- | --- | --- |
| `make-help.js` | แสดงรายการเป้าหมายของ Makefile พร้อมคำอธิบาย `## ` | `make`, `make help` |
| `build-flows.js` | รวมไฟล์โฟลว์ `nodered_data/flows/*.json` เข้าสู่ `flows.json` | `make build-flows` |
| `provision-library-panels.sh` | จัดการ Library panels ของ Grafana ผ่าน HTTP API | เรียกตรง (direct) |
| `grafana-folder-permissions.js` | จัดการสิทธิ์การเข้าถึงโฟลเดอร์แดชบอร์ดที่ provision ไว้ | เรียกตรง (direct) |
| `create-playlist.sh` | จัดการเพลย์ลิสต์สำหรับจอแสดงผลผนังห้องปฏิบัติการ NOC | เรียกตรง (direct) |
| `snmp-discover.js` | สำรวจค่า SNMP OID สำหรับอุปกรณ์ตัวใหม่ | เรียกตรง (direct) |
| `unwrap-pgadmin-export.py` | คลี่ไฟล์ส่งออก "Copy with SQL INSERT" ของ pgAdmin | เรียกตรง (direct) |

## เกตควบคุมคุณภาพและการรับประกัน (Quality gates and assurance)

| สคริปต์ | วัตถุประสงค์ | จุดเรียกใช้งาน (Entry point) |
| --- | --- | --- |
| `pre-commit.js` | รันชุดทดสอบ unit test, linters และตรวจสอบ JSON ของแดชบอร์ด/โฟลว์ | husky hook, CI, `make check` |
| `run-alarm-api-tests.js` | ทดสอบ alarm-api โดยใช้ dependencies ภายในเซอร์วิสเอง | `make test-unit` |
| `production-assurance.js`, `assurance-schema.js`, `gate.js` | รันการรับประกันคุณภาพตามโปรไฟล์และตัดสินผลเกต | เรียกตรง (direct) |
| `production-readiness-render.js`, `failure-detection-matrix-render.js` | เรนเดอร์เอกสารหลักฐานจากผลลัพธ์ของระบบรับประกัน | เรียกตรง (direct) |
| `kiosk-load-test.sh`, `soak-test-report.sh`, `soak-test-report-hidden.vbs` | ทดสอบโหลดและ Soak test (`.vbs` รันรายงาน soak จาก Task Scheduler แบบซ่อนหน้าต่างคอนโซล) | เรียกตรง (direct) |
| `find-broken-links.js` | ตรวจสอบ relative link ในเอกสาร Markdown ทั้งหมด | เรียกตรง (direct) |

## ตัวสร้างเอกสารอัตโนมัติ (Generators)

| สคริปต์ | ผลลัพธ์ | จุดเรียกใช้งาน (Entry point) |
| --- | --- | --- |
| `generate-dashboard-inventory.js` | บัญชีรายการแดชบอร์ด (`--check` ใน CI) | เรียกตรง (direct) |
| `generate-schema-inventory.js` | บัญชีรายการสคีมาฐานข้อมูล | เรียกตรง (direct) |
| `generate-docs-readme-index.js` | แผนที่ไดเรกทอรีใน README แต่ละโฟลเดอร์ของเอกสาร (`--check`) | เรียกตรง (direct) |
| `generate-showcase.sh` | ภาพหน้าจอแดชบอร์ดสำหรับ README | เรียกตรง (direct) |
| `generate-banner-gif.py`, `icon-engine.mjs` | แบนเนอร์และไอคอนสำหรับ README | เรียกตรง (direct) |

## ดิจิทัลทวินชั้น 1 (Factory Twin - ต้องใช้ข้อมูล CAD ส่วนตัวภายนอก git)

| สคริปต์ | วัตถุประสงค์ |
| --- | --- |
| `extract-floor1-cad.js`, `extract-floor1-raw-cad.js`, `extract-floor1-equipment.js` | สกัดข้อมูลรูปทรงเรขาคณิตจากไฟล์ส่งออก CAD ส่วนตัว |
| `apply-floor1-canonical-frame.js`, `recover-floor1-outside-envelope-equipment.js` | ปรับข้อมูลให้อยู่ในรูปแบบมาตรฐานและซ่อมแซมระเบียนที่สกัดมา |
| `twin-direct-container.sh` / `.ps1` | รันคอนเทนเนอร์ Factory Twin ชั่วคราวเพื่อตรวจสอบความถูกต้องของฉาก 3 มิติ |

## โค้ดที่ใช้ร่วมกัน (Shared code)

- `lib/`: โมดูลตัวช่วยที่ใช้ร่วมกันระหว่างสคริปต์ต่างๆ ข้างต้น
- `mock/`: ตัวสร้างข้อมูลสังเคราะห์สำหรับทดสอบ (`docs/data/MOCK_DATA.md`)
