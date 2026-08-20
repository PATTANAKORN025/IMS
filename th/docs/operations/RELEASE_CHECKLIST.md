<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Release Checklist

> ตรวจสอบตามรายการนี้ก่อนการทำ tag สำหรับ production release (เช่น ก่อนการ merge เข้า `main` ในลักษณะที่ทริกเกอร์ `semantic-release` หรือก่อนการตัด tag ด้วยตนเอง) นี่คือด่านตรวจสอบที่เกิดขึ้นเป็นประจำว่า "commit นี้ปลอดภัยที่จะเผยแพร่หรือไม่" — สำหรับการเปิดตัว production เริ่มต้นในครั้งแรก โปรดดูรายการตรวจสอบ Go-Live ใน [`DEPLOYMENT_READINESS.md`](DEPLOYMENT_READINESS.md)

---

## 1. การทดสอบและการตรวจสอบ (Tests and lints) ผ่านทั้งหมด (สีเขียว)

```bash
node tests/lint/dashboard-linter.js
node tests/lint/orphan-object-linter.js
node tests/lint/query-budget-linter.js
node tests/lint/rca-mapping-coverage.js
node tests/lint/alarm-sync-linter.js
node tests/unit/parser.test.js
node tests/unit/v2-parser.test.js
node tests/unit/counter-wraparound.test.js
node tests/unit/boundary-validation.test.js
```

หรือเพียงแค่ push/เปิด PR — `.github/workflows/ci.yml` จะรันสิ่งเหล่านี้ทั้งหมด (รวมถึงการตรวจสอบ schema-drift, การตรวจสอบ orphan-object, การตรวจสอบ golden-dataset SPC validation, การทดสอบ chaos stress และงานการทดสอบการถดถอย LDI visual/layout) โดยอัตโนมัติ **ห้ามทำ tag release หากผลการรัน CI เป็นสีแดงโดยเด็ดขาด**

- [ ] ผลรัน CI เป็นสีเขียวบน commit ที่กำลังจะปล่อยออกไป

## 2. เอกสาร Governance ตรงกับความเป็นจริง (ไม่มี silent drift)

```bash
node scripts/generate-dashboard-inventory.js --check # ไม่ต้องการฐานข้อมูล
node scripts/generate-schema-inventory.js --check  # ต้องการ timescaledb ที่ทำงานอยู่และทำ migration แล้ว
```

ทั้งสองส่วนนี้ถูกรันอยู่ใน CI (งาน `lint` และ `integration-chaos` ตามลำดับ) — หากผลการรัน CI เป็นสีแดงจะเป็นการครอบคลุมเรื่องนี้อยู่แล้ว แต่ถ้าคุณกำลัง release จาก branch ที่ข้ามการทำ CI ไม่ว่าจะด้วยเหตุผลใดก็ตาม ให้รันคำสั่งเหล่านี้บนเครื่องแบบโลคัลก่อน หากมีรายการใดรายงานถึง drift (ความคลาดเคลื่อน) ให้ทำการสร้างใหม่ (ลบ `--check` ออก) และ commit ผลลัพธ์ที่ได้ _ก่อน_ ที่จะทำการ tag ไม่ใช่ทำหลังจากนั้น

- [ ] Dashboard inventory (`docs/architecture/DASHBOARD_INVENTORY.md`) เป็นปัจจุบัน
- [ ] Database schema inventory (`docs/architecture/DATABASE_SCHEMA.md`) เป็นปัจจุบัน

## 3. Database migrations ถูกนำไปใช้ทั้งหมดและมีความเป็น idempotent

```bash
bash scripts/migrate.sh
# คาดหวังว่า: Pending: 0 Applied: 0 Failed: 0
```

หากรายงานแจ้งว่า `Pending: N > 0` นั่นหมายความว่า migration ยังไม่ได้ถูกนำไปใช้กับฐานข้อมูลที่คุณเพิ่งทำการตรวจสอบ หรือมีการเพิ่มไฟล์ migration ใหม่เข้ามาโดยที่ยังไม่ได้รัน — ให้แก้ไขก่อนที่จะทำการ tag ทุกๆ migration ควรเป็น idempotent อยู่แล้ว (มีการป้องกันในรูปแบบ `CREATE ... IF NOT EXISTS`); หากคุณเขียนตัวที่ไม่เป็นเช่นนั้น ให้ทำการแก้ไขตอนนี้ ไม่ใช่ไปแก้หลังจากที่ทำการ tag ไปแล้วและมีคนอื่นมารันซ้ำอีกรอบ

- [ ] `scripts/migrate.sh` รายงานผลเป็น 0 สำหรับ pending/failed บนฐานข้อมูลปลายทาง

## 4. ไม่มีข้อมูลความลับ (secrets) ไม่มี credential เริ่มต้นในสิ่งที่กำลังจะถูกจัดส่ง

```bash
docker run --rm -v "$(pwd):/repo" zricethezav/gitleaks:latest \
 detect --source=/repo --no-git --redact --verbose --config=/repo/.gitleaks.toml
```

ขั้นตอนนี้จะรันในงาน `lint` ของ CI เช่นกัน หากนี่คือ tag สำหรับ production (ไม่ใช่แค่ build สำหรับ dev/staging) ให้ทำการตรวจสอบแยกต่างหากว่าไฟล์ `.env` ของสภาพแวดล้อมปลายทางมีค่าจริงสำหรับ `INGEST_API_KEY`, `POSTGRES_PASSWORD` และ `GRAFANA_ADMIN_PASSWORD` แล้วหรือไม่ — ดูรายการตรวจสอบ Pre-Production Security ใน `docs/admin/ADMIN_MANUAL.md` รีโพสิทอรีนี้ไม่สามารถจัดส่ง credential จริงได้; การตรวจสอบนั้นจะต้องเกิดขึ้นโดยอิงตามเป้าหมายในการ deploy จริง ไม่ใช่ที่รีโพสิทอรี

- [ ] การสแกนด้วย Gitleaks ไม่พบปัญหา
- [ ] (สำหรับ production เท่านั้น) credential เริ่มต้นของสภาพแวดล้อมปลายทางถูกสลับเปลี่ยน (rotated) แล้ว

## 5. เวอร์ชันและ changelog สอดคล้องกับสิ่งที่กำลังจะทำการ tag จริงๆ

`version` ของ `package.json` และ `CHANGELOG.md` ทั้งสองส่วนนี้ต้องดูแลรักษาด้วยตนเอง; `semantic-release` (กำหนดค่าไว้ใน `package.json`) จะทำการเพิ่มเวอร์ชัน/ทำ tag โดยอัตโนมัติตามข้อความ conventional-commit บน `main` แต่ **จะไม่** ย้อนกลับไปแก้ไขความขัดแย้งของ `CHANGELOG.md` ที่มีความคลาดเคลื่อนไปจากสิ่งที่เผยแพร่ไปแล้ว ก่อนที่จะทำการ tag:

- [ ] เวอร์ชันและวันที่ของรายการล่าสุดใน `CHANGELOG.md` ตรงกับสิ่งที่กำลังจะถูก tag (ไม่ใช่รายการเก่าจากการ release ครั้งก่อน)
- [ ] ข้อความ commit นับตั้งแต่ tag ครั้งล่าสุดเป็นประเภท conventional-commit ที่ถูกต้อง (`feat`/`fix`/`perf`/`docs`/`chore`) — การเพิ่มเวอร์ชันของ `semantic-release` ถูกดึงมาจากข้อความเหล่านี้โดยตรง

## 6. (หาก release นี้เปลี่ยนแปลงสิ่งใดที่ผู้ใช้หรือแอดมินมองเห็น) คู่มือสะท้อนให้เห็นถึงการเปลี่ยนแปลงนั้น

`docs/user/USER_MANUAL.md` และ `docs/admin/ADMIN_MANUAL.md` เป็นข้อความที่ดูแลรักษาด้วยตนเอง ไม่ได้ถูกสร้างขึ้นอัตโนมัติ — เอกสารเหล่านี้จะไม่แก้ไขตัวเองเหมือนที่เอกสาร inventory ทั้งสองทำได้ หาก release นี้มีการเพิ่ม/ลบ dashboard, เปลี่ยนแปลงคอนเทนเนอร์/บริการ, เปลี่ยนแปลงขั้นตอนการลงทะเบียนอุปกรณ์ หรือเปลี่ยนแปลงชื่อการแจ้งเตือน ให้ทำการอัปเดตส่วนที่เกี่ยวข้องในคู่มือภายใน release เดียวกัน ไม่ใช่ "ทำทีหลัง"

- [ ] ตรวจสอบ USER_MANUAL.md เทียบกับการเปลี่ยนแปลง dashboard ใน release นี้แล้ว
- [ ] ตรวจสอบ ADMIN_MANUAL.md เทียบกับการเปลี่ยนแปลง docker-compose/migration ใน release นี้แล้ว

## 7. (ทางเลือก แต่แนะนำสำหรับเวอร์ชันหลัก/การขึ้น production) ทำการทดสอบระบบระยะยาว (Soak test)

`scripts/soak-test-report.sh` จะบันทึกความล้มเหลวของการนำเข้าข้อมูล, ปัญหา buffer overflow, การรีสตาร์ทของคอนเทนเนอร์ และการแจ้งเตือนที่เกิดขึ้นเมื่อเวลาผ่านไป; การใช้ `--summarize` จะให้ผลตัดสินว่าผ่าน/ไม่ผ่าน เมื่อล็อกครอบคลุมช่วงเวลาที่คุณสนใจ ไม่จำเป็นต้องรันสำหรับทุกๆ release แต่ก็คุ้มค่าที่จะรันก่อนที่จะทำ tag สำหรับเหตุการณ์สำคัญบน production ไม่ใช่แค่ก่อนการ go-live ครั้งแรกสุดเท่านั้น

- [ ] (สำหรับเวอร์ชันหลัก/เหตุการณ์สำคัญบน production เท่านั้น) รันและสรุปผล soak test ด้วยผลการตัดสินที่ไม่มีปัญหา

---

## หลังจากทำ tag

- [ ] ยืนยันว่า GitHub Release / tag ถูกสร้างขึ้นด้วยเวอร์ชันที่คาดไว้
- [ ] ยืนยันว่า CI รัน (หรือรันซ้ำ) จนสำเร็จสำหรับ commit ที่ถูก tag ไม่ใช่แค่ปลาย branch ก่อนหน้านั้น
- [ ] ประกาศให้ผู้มีส่วนได้ส่วนเสียทราบตามรายการตรวจสอบ Go-Live ใน `DEPLOYMENT_READINESS.md` หากนี่คือการ deploy บน production
