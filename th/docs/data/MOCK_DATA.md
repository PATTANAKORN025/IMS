<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# ข้อมูลสังเคราะห์สำหรับงานเจาะ (Drilling) และ VCP

แดชบอร์ดงานเจาะและ VCP อ่านข้อมูลจากฐานข้อมูล `eap_backup` บนเซิร์ฟเวอร์โรงงาน ฐานข้อมูลนี้คือข้อมูลโรงงานที่กู้คืนมาจากสำรอง และไม่ได้อยู่ใน git หน้านี้อธิบายวิธีสร้าง `eap_backup` ทดแทนจากข้อมูลที่สร้างขึ้นเอง เพื่อให้โฟลเดอร์ Drilling, โฟลเดอร์ VCP, กฎแจ้งเตือนของ VCP และ migration 084–086 ทำงานได้ครบโดยไม่ต้องใช้ข้อมูลโรงงาน

## องค์ประกอบ

| ส่วน | พาธ | หน้าที่ |
| --- | --- | --- |
| Schema | `database/mock/eap_backup-schema.sql` | สร้างตารางและ view ที่แดชบอร์ด กฎแจ้งเตือน และ migration 084–086 อ่าน |
| ตัวสร้างข้อมูล | `scripts/mock/eap-mock-data.js` | เขียนข้อมูลเหตุการณ์ของเครื่องเจาะและข้อมูลสายการผลิต VCP ที่สร้างขึ้น |
| ตัวตรวจสอบ | `scripts/mock/verify-mock-dashboards.js` | รัน query ของทุก panel ในโฟลเดอร์ Drilling และ VCP และ query ของกฎแจ้งเตือน VCP ทุกข้อ แล้วรายงานจำนวนแถวของแต่ละ panel |
| Unit test | `tests/unit/eap-mock-data.test.js` | ตรวจตัวสร้างข้อมูลโดยไม่ต้องใช้ฐานข้อมูล รันทั้งใน pre-commit และ CI |

ทุกค่าเป็นค่าสมมติ ได้แก่ จำนวนเครื่อง ค่าตั้ง (setpoint) สูตรการผลิต ขนาดแผ่นงาน รหัสล็อต และข้อความแจ้งเตือน ไม่มีค่าใดวัดจากโรงงานจริง

ตัวสร้างข้อมูลคงไว้เฉพาะรูปแบบที่แดชบอร์ดใช้แยกวิเคราะห์ ได้แก่:
- รหัสเหตุการณ์และรูปแบบข้อความ
- รูปแบบรหัสเครื่อง `-VCP`
- ชื่อแท็กบ่อที่สลับกันที่ต้นทาง (`preset_<bath>` คือค่าที่อ่านได้ ส่วน `actual_<bath>` คือค่าตั้ง)
- ความสัมพันธ์ `plating_time × line_speed = 54`
- การแจ้งเตือนที่มาเป็นคู่ Triggered/Reset

## ความปลอดภัย

- ไฟล์ schema จะไม่ยอมทำงานบนฐานข้อมูลที่มีตาราง `machine_event` หรือ `vcp_upp` อยู่แล้วแต่ไม่มีตารางเครื่องหมาย `public.mock_dataset` จึงรันบนฐานข้อมูลโรงงานที่กู้คืนมาไม่ได้
- `--apply` ทำงานเป็นทรานแซกชันเดียว และตรวจว่ามีตารางเครื่องหมายก่อนเขียนแถวแรก
- ทุกแถวที่สร้างขึ้นมีรหัสขึ้นต้นด้วย `MOCK-` คำสั่ง `--undo --apply` ลบเฉพาะแถวเหล่านี้

## รันบนสแตกที่ยังไม่มีข้อมูล

ใช้เมื่อยังไม่มีฐานข้อมูล `eap_backup` เช่น หลังติดตั้งใหม่ ให้รันจาก Git Bash ที่รากของ repository:

```bash
docker exec -i ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE eap_backup"'
docker exec -i ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d eap_backup -v ON_ERROR_STOP=1' < database/mock/eap_backup-schema.sql
for m in 084 085 086; do                                 # ดูหมายเหตุด้านล่าง
  docker exec -i ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < database/migrations/$m-*.sql
done
node scripts/mock/eap-mock-data.js --hours=168 --apply   # ข้อมูลหนึ่งสัปดาห์
```

ต้องรัน 084–086 เองตามข้างต้น การรัน `db-migrate` ซ้ำจะไม่รันไฟล์เหล่านี้ให้ บนระบบที่ติดตั้งโดยยังไม่มี `eap_backup` ตัวรัน migration รันสามไฟล์นี้ไปแล้ว แต่ละไฟล์ข้ามงานของตัวเองแต่ยังถูกบันทึกใน `public.schema_migrations` ว่ารันแล้ว ทั้งสามไฟล์รันซ้ำได้อย่างปลอดภัย เพราะใช้เฉพาะ `CREATE OR REPLACE`, `IF NOT EXISTS` และ `COMMENT`

ตัวสร้างข้อมูลเขียนแถวเพียงครั้งเดียวและไม่เพิ่มข้อมูลต่อเนื่อง panel แบบ "15 นาทีล่าสุด" จึงจะว่างลงเมื่อเวลาผ่านไป เมื่อต้องการข้อมูลใหม่ให้รันอีกครั้ง แต่ละครั้งจะเพิ่มช่วงเวลาใหม่ และใช้ `--undo --apply` ล้างช่วงเก่าได้

## รันในคอนเทนเนอร์ชั่วคราว

การพิสูจน์นี้ไม่ใช้สแตกและไม่เปิดพอร์ตใด:

```bash
docker run -d --name ims-mock-verify -e POSTGRES_PASSWORD=mockonly -e POSTGRES_DB=ims timescale/timescaledb:2.29.2-pg16
docker exec ims-mock-verify psql -U postgres -d ims -c "CREATE DATABASE eap_backup"
docker exec -i ims-mock-verify psql -U postgres -d eap_backup -v ON_ERROR_STOP=1 < database/mock/eap_backup-schema.sql
for m in 084 085 086; do docker exec -i ims-mock-verify psql -U postgres -d ims -v ON_ERROR_STOP=1 < database/migrations/$m-*.sql; done
node scripts/mock/eap-mock-data.js --hours=168 --apply --container=ims-mock-verify --psql-user=postgres
node scripts/mock/verify-mock-dashboards.js --container=ims-mock-verify --psql-user=postgres
docker rm -f ims-mock-verify
```

ตัวตรวจสอบต้องระบุ `--container` เสมอ จึงไม่รันกับสแตกที่ใช้งานจริงโดยปริยาย

## ตัวเลือก

| ตัวเลือก | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `--hours=N` | 24 | ความยาวของช่วงเวลาที่สิ้นสุด ณ ตอนนี้ |
| `--seed=N` | 20260928 | seed และเวลาสิ้นสุดเดียวกันให้แถวข้อมูลชุดเดียวกัน |
| `--drilling=N` | 12 | จำนวนเครื่องเจาะ (3–200) |
| `--incidents` | ปิด | ช่วง 35 นาทีสุดท้ายทำให้กฎแจ้งเตือน VCP ทุกข้อถูกละเมิดข้อละหนึ่งครั้ง |
| `--apply` | ปิด | เขียนลงฐานข้อมูล ถ้าไม่ระบุ SQL จะถูกเขียนลงไฟล์แทน |
| `--undo` | ปิด | ใช้คู่กับ `--apply` เพื่อลบทุกแถวที่มีรหัส `MOCK-` |
| `--container`, `--database`, `--psql-user` | `ims-timescaledb`, `eap_backup`, อ่านจาก `.env` | ปลายทางที่เขียนแถวข้อมูล |

## ข้อมูลที่แสดง

**งานเจาะ:**
- ทุกเครื่องทำงานเป็นงาน (job) ประกอบด้วย การเริ่มโปรแกรม การเปลี่ยน rpm/feed มาสก์ spindle การเริ่มรอบ การเปลี่ยนดอกสว่าน การแจ้งเตือนพร้อมเวลากู้คืน การจบงานพร้อมจำนวน hit และรายงานกะเวลา 08:00 และ 20:00 ตามเวลากรุงเทพฯ
- การแจ้งเตือนครอบคลุมทุกหมวดบนแดชบอร์ดวิเคราะห์ความผิดปกติ
- เครื่องสุดท้ายหยุดส่งข้อมูล 3 ชั่วโมงก่อนเวลาสิ้นสุด จึงแสดงเป็น COMM LOSS
- เครื่องก่อนหน้านั้นเงียบไประหว่างรอบการทำงาน 75 นาทีก่อนเวลาสิ้นสุด จึงแสดงเป็น STALE RUN

**VCP:**
- มีสามสายการผลิต สายละหนึ่งแถวต่อนาที แต่ละสายเปลี่ยนสถานะระหว่าง RUN, IDLE และ DOWN
- สถานีจ่ายกระแสเฉพาะขณะสายกำลังชุบ
- อุณหภูมิบ่อตามค่าตั้ง และเย็นลงเมื่อสายหยุด
- การแจ้งเตือนเกิดขึ้นแบบสุ่ม และแต่ละรายการถูก Reset หลังผ่านไประยะหนึ่ง

**กฎแจ้งเตือน:**
- **ไม่ใช้ `--incidents`:** โรงงานอยู่ในสภาพปกติ กฎ VCP ทั้งเจ็ดข้อไม่คืนแถวใด กฎเหล่านี้แสดงรายการการละเมิด การไม่มีแถวจึงหมายถึงปกติ
- **ใช้ `--incidents` ในช่วง 35 นาทีสุดท้าย:**
  - VCP01 หยุดส่งข้อมูล
  - VCP02 ชุบโดยกระแสของสถานีหนึ่งด้านเกินค่าตั้ง 8 A และ `preset_amp_1a` เป็นศูนย์ ปั๊ม 9 อ่านค่าได้ 0 และแฟล็ก QC สองตัวไม่ตรงกัน
  - VCP03 มีอุณหภูมิบ่อ copperplating2 สูงกว่าค่าตั้ง 6 °C และบ่อ hotwater สูงกว่าค่าตั้ง 12 °C
- ถ้าสแตกใดตั้งค่าช่องทางแจ้งเตือนจริงไว้ การโหลด incidents บนสแตกนั้นจะส่งการแจ้งเตือนจริงออกไป

## ผลการตรวจสอบ

ผลจากวันที่ 2026-09-28 บน TimescaleDB 2.29.2-pg16 ในคอนเทนเนอร์ชั่วคราว:
- schema และ migration 084, 085, 086 ติดตั้งได้โดยไม่มีข้อผิดพลาด ก่อนมี `eap_backup` migration 084 แสดงข้อความว่าข้ามการทำงาน
- ข้อมูลปกติ 168 ชั่วโมง: รัน 41 query ไม่มีข้อผิดพลาด ทั้ง 34 panel คืนข้อมูล และ query ของกฎแจ้งเตือนทั้ง 7 ข้อไม่คืนแถวใด
- ใช้ `--incidents`: รัน 41 query ไม่มีข้อผิดพลาด และทุก query คืนแถว รวมถึงกฎแจ้งเตือนทั้ง 7 ข้อ
- ทดสอบซ้ำด้วย seed 1 ถึง 6 ทั้งสองโหมด ได้ผลเหมือนกัน

## ข้อจำกัด

- ชนิดข้อมูลของคอลัมน์สร้างขึ้นใหม่จากวิธีที่แดชบอร์ดและ migration ใช้แต่ละคอลัมน์ ไม่ได้ dump มาจากเซิร์ฟเวอร์โรงงาน
- schema ไม่ได้สร้าง derived view และ schema `plc_mqtt` ที่ฐานข้อมูลโรงงานมี ผลคือ `catalog.object_registry` บนฐานข้อมูลจำลองมี 12 แถวที่แสดง `physical_missing = true`
