<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>ขั้นตอนการสำรองข้อมูล การกู้คืน และการตรวจสอบความถูกต้องฐานข้อมูล IMS</h1>
  <p><b>สิ่งที่ repository มีให้จริงในตอนนี้ วิธีพิสูจน์ว่าการกู้คืนถูกต้อง และสิ่งที่ต้องเพิ่มก่อนนำไฟล์สำรองออกจากเครื่อง</b></p>
  <p>
    <a href="../../../docs/operations/BACKUP_RESTORE.md">English</a> |
    <a href="BACKUP_RESTORE.md">ไทย</a> |
    <a href="../../../zh-CN/docs/operations/BACKUP_RESTORE.md">简体中文</a>
  </p>
</div>

---

> **กลุ่มผู้อ่าน:** SRE / ทีมปฏิบัติการ และวิศวกรฐานข้อมูล
> **ขอบเขต:** ฐานข้อมูล `ims` ใน `ims-timescaledb` ส่วนฐานข้อมูล `eap_backup` เป็นสำเนาข้อมูลโรงงานที่กู้คืนมา และสคริปต์เหล่านี้ไม่ครอบคลุม
> **เป้าหมายการกู้คืน:** RTO ต่ำกว่า 15 นาที และ RPO ต่ำกว่า 1 ชั่วโมง เป็น **เป้าหมาย** ยังไม่ได้วัดจริง เมื่อใช้ `pg_dump` ที่ repository มีให้ (รันเองหรือรันวันละครั้ง) RPO ที่ได้จริงคือเวลานับจากการสำรองครั้งล่าสุด

---

## 1. สิ่งที่มีให้ในปัจจุบัน

| คำสั่ง | สคริปต์ | หน้าที่ |
| --- | --- | --- |
| `make backup` | `scripts/backup-db.sh` | รัน `pg_dump` ฐานข้อมูล `ims` ด้วย role `ims_admin` ไปที่ `./backups/ims_backup_<timestamp>.sql` แล้วบีบอัดด้วย `gzip` และลบไฟล์ `*.sql.gz` ใน `./backups` ที่เก่ากว่า 30 วัน |
| `make restore FILE=<path>` | `scripts/restore-db.sh` | ถามยืนยันก่อน แล้วส่งไฟล์ dump ที่คลายแล้วเข้า `psql` ของฐานข้อมูล `ims` **ที่ใช้งานจริง** |
| `./scripts/dr-test.sh backup-restore` | `scripts/dr-test.sh` | สำรอง `ims` แล้วกู้คืนลงฐานข้อมูลชั่วคราว `ims_dr_test` เพื่อเปรียบเทียบ ไม่แตะฐานข้อมูลที่ใช้งานจริง |
| `./scripts/dr-verify-restore.sh …` | `scripts/dr-verify-restore.sh` | เปรียบเทียบตาราง คอลัมน์ index constraint trigger extension continuous aggregate และ policy ระหว่างสองฐานข้อมูล พร้อมตรวจช่วงจำนวนแถว และจบด้วยสถานะไม่เป็นศูนย์เมื่อพบความต่างใด ๆ |
| `node scripts/production-assurance.js --profile=dr` | `scripts/production-assurance.js` | รันการซ้อม DR และเขียนผลเป็น JSON ไฟล์เดียวไว้ที่ `docs/evidence/runtime/` |

**สิ่งที่ยังไม่มี:** ไฟล์สำรอง **ไม่ได้เข้ารหัส** **ไม่ได้คัดลอกออกนอกเครื่อง** และ **ไม่มี WAL archiving หรือการกู้คืนแบบเจาะจงจุดเวลา (PITR)** โฟลเดอร์ `./backups/` อยู่ใน `.gitignore` ผู้ที่อ่านไฟล์บนเครื่องได้ก็อ่าน dump ได้ ดูสิ่งที่ควรเพิ่มในหัวข้อที่ 4

---

## 2. สำรองข้อมูล

```bash
make backup                       # หรือ: bash scripts/backup-db.sh
ls -lh backups/                   # ims_backup_YYYYmmdd_HHMMSS.sql.gz
```

`backup-db.sh` ใช้ role `ims_admin` และฐานข้อมูล `ims` ตามค่าเริ่มต้นใน `.env.example` ถ้า `.env` ใช้ชื่ออื่น ให้แก้สคริปต์ หรือรัน `pg_dump` เองด้วย flag เดียวกัน

---

## 3. กู้คืนและพิสูจน์ความถูกต้อง

### 3.1 ซ้อมก่อน (ปลอดภัย)

```bash
./scripts/dr-test.sh backup-restore
```

การซ้อมจะกู้คืนลง `ims_dr_test` แล้วรัน `dr-verify-restore.sh` จำนวนแถวอย่างเดียวพิสูจน์การกู้คืนไม่ได้ เพราะการกู้คืน TimescaleDB อาจทำ constraint, index หรือ continuous aggregate หายไป ทั้งที่จำนวนแถวยังตรง ตัวตรวจจึงเปรียบเทียบ catalog

ระหว่าง dump ฐานข้อมูลจริงยังรับข้อมูลเข้าอยู่ จำนวนแถวจึงไม่จำเป็นต้องเท่ากันพอดี สำหรับ hypertable ที่มีการเขียนต่อเนื่อง จำนวนแถวหลังกู้คืนต้องอยู่ระหว่างจำนวนที่นับก่อนและหลัง dump:

$$\text{Count}_{\text{before}} \le \text{Count}_{\text{restored}} \le \text{Count}_{\text{after}}$$

### 3.2 กู้คืนทับฐานข้อมูลที่ใช้งานจริง (ทำลายข้อมูลเดิม)

```bash
make restore FILE=backups/ims_backup_YYYYmmdd_HHMMSS.sql.gz
```

คำสั่งนี้เขียนทับ `ims` ให้หยุดตัวที่เขียนข้อมูล (`node-red`, `alarm-api`) ก่อน เพื่อไม่ให้มีการเขียนระหว่างกู้คืน แล้วค่อยเปิดกลับและตรวจด้วย `make verify`

---

## 4. ก่อนนำไฟล์สำรองออกจากเครื่อง (แนะนำ ยังไม่มีในระบบ)

แต่ละข้อด้านล่างเป็นงานที่ต้องทำและทดสอบก่อนนำไปใช้จริง ยังไม่มีข้อใดอยู่ในระบบตอนนี้

1. **เข้ารหัสไฟล์ dump** ด้วยกุญแจที่ไม่ได้เก็บไว้คู่กับไฟล์ ตัวอย่าง:

   ```bash
   docker compose exec -T timescaledb pg_dump -U ims_admin ims \
     | gzip -9 \
     | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY \
     > "backups/ims_backup_$(date -u +%Y%m%dT%H%M%SZ).sql.gz.enc"
   ```

   ห้ามเก็บ `BACKUP_ENCRYPTION_KEY` ไว้ใน `.env` หรือใน git และให้ทดสอบการถอดรหัสด้วย `openssl enc -d …` ในการซ้อมเดียวกับที่ทดสอบการกู้คืน
2. **คัดลอกออกนอกเครื่อง** ไปยังที่เก็บที่ credential ของเครื่องนี้ลบไม่ได้ และเก็บ checksum (`sha256sum`) คู่กับทุกไฟล์
3. **ตั้งเวลารันอัตโนมัติ** ใน repository ยังไม่มีอะไรตั้งเวลารัน `make backup` ให้ใช้ cron หรือ systemd timer บนเครื่อง และตั้งแจ้งเตือนเมื่อไฟล์สำรองล่าสุดเก่ากว่าเป้าหมาย RPO
4. **การกู้คืนแบบเจาะจงจุดเวลา (PITR)** ทำเมื่อเป้าหมาย RPO หนึ่งชั่วโมงไม่พอเท่านั้น ต้องเพิ่ม `wal_level=replica`, `archive_mode=on` และ `archive_command` ใน command line ของ TimescaleDB ใน `docker-compose.yaml` และต้องมี base backup (`pg_basebackup`) กับที่เก็บ archive ด้วย ตอนนี้ยังไม่ได้ตั้งค่า

---

## 5. เอกสารที่เกี่ยวข้อง

- `docs/operations/DR_TEST_PLAN.md`: แผนการซ้อมและเกณฑ์ผ่าน
- `docs/operations-runbook.md`: งานปฏิบัติการประจำวันที่เกี่ยวข้องกับการกู้คืน

---

[⬅️ กลับสู่คู่มือปฏิบัติการ Runbook](../operations-runbook.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> หน้าหลักคลังข้อมูล](../../README.md)
