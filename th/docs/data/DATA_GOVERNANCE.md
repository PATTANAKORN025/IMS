<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>การกำกับดูแลข้อมูล IMS: การจัดระดับชั้น อายุการเก็บรักษา และสิทธิ์การเข้าถึง</h1>
  <p><b>ระบบเก็บข้อมูลอะไร เก็บนานเท่าไร ใครอ่านหรือเขียนได้ และช่องโหว่ที่ยังเปิดอยู่</b></p>
  <p>
    <a href="../../../docs/data/DATA_GOVERNANCE.md">English</a> |
    <a href="DATA_GOVERNANCE.md">ไทย</a> |
    <a href="../../../zh-CN/docs/data/DATA_GOVERNANCE.md">简体中文</a>
  </p>
</div>

---

> **ขอบเขต:** ฐานข้อมูล `ims` และ service ใน `docker-compose.yaml` ตัวเลขอายุการเก็บรักษาและ role ทั้งหมดในหน้านี้นำมาจาก migration และ catalog ของฐานข้อมูลจริง (`timescaledb_information.jobs`) ไม่ใช่ค่าเป้าหมาย
> **มาตรฐาน:** IEC 62443 (ความมั่นคงปลอดภัยระบบอุตสาหกรรม) และ ISO/IEC 27001:2022 เป็นแนวอ้างอิงที่ดีสำหรับมาตรการในหน้านี้ แต่ IMS **ไม่ได้** รับการรับรองตามมาตรฐานใดเลย และหน้านี้ไม่ได้อ้างว่าปฏิบัติตามครบถ้วน ส่วน PDPA ของไทยมีผลกับข้อมูลระบุตัวบุคคลไม่กี่อย่างที่ระบบเก็บไว้ (หัวข้อที่ 3)

---

## 1. การจัดระดับชั้นข้อมูล

| ระดับ | ตัวอย่างใน IMS | ที่เก็บ | การป้องกันในปัจจุบัน |
| --- | --- | --- | --- |
| **สาธารณะ** | เอกสารสถาปัตยกรรม, นิยาม schema, JSON ของแดชบอร์ด | Git repository | repository สาธารณะ |
| **ภายใน** | ข้อมูลสรุป (`*_hourly`, `ldi_data_1m/15m/1h`), กฎแจ้งเตือน, metric ของ container | TimescaleDB, Prometheus | port บนเครื่องผูกกับ `127.0.0.1` ทั้งหมด ยกเว้น nginx ที่เป็นทางเข้าหลัก และไม่มีการเข้ารหัสข้อมูลที่จัดเก็บ |
| **ลับ** | telemetry ดิบของเครื่องจักร (`ldi_data`, `ldi_metrics`), ข้อมูลโรงงานใน `eap_backup`, ข้อมูล CAD ของชั้น 1 | volume ของ TimescaleDB; ข้อมูล CAD เก็บนอก git | ต้อง login Grafana และไม่มีการเข้ารหัสข้อมูลที่จัดเก็บ; leak scanner กันข้อมูล CAD ไม่ให้เข้า git |
| **จำกัดสิทธิ์** | credential ใน `.env`; ชื่อ login Grafana ที่บันทึกใน `acknowledged_by` / `resolved_by` | `.env` บนเครื่อง; ตาราง `ldi_alarm_lifecycle` | `.env` อยู่ใน `.gitignore` และตรวจด้วย gitleaks ส่วนชื่อ login เก็บเป็นข้อความธรรมดา |

การสื่อสารระหว่าง service อยู่บนเครือข่ายภายในของ Docker ส่วนทางเข้าหลัก (nginx ที่ `${GRAFANA_PORT:-3000}`) ให้บริการเป็น **HTTP ธรรมดา** ต้องติดตั้ง TLS ไว้ด้านหน้าก่อนเปิดใช้งานนอกเครือข่ายโรงงานที่เชื่อถือได้

---

## 2. อายุการเก็บรักษาและการบีบอัด (policy ที่ใช้งานจริง)

| Object | ประเภท | บีบอัดหลังจาก | ลบหลังจาก |
| --- | --- | --- | --- |
| `ldi_data` | hypertable | 7 วัน | 180 วัน |
| `ldi_metrics`, `sys_metrics`, `net_metrics` | hypertable | 7 วัน | 30 วัน |
| `ldi_alarm_log` | hypertable | — (บีบอัดไม่ได้ เพราะ `ldi_alarm_lifecycle` มี foreign key ชี้เข้ามา ดู migration 083) | 365 วัน |
| `ldi_data_1m` | continuous aggregate | — | 30 วัน |
| `ldi_data_15m` | continuous aggregate | — | 90 วัน |
| `ldi_data_1h`, `ldi_data_hourly` | continuous aggregate | — | 2 ปี |
| `sys_hourly`, `net_hourly`, `ldi_hourly` | continuous aggregate | — | ไม่ลบ |
| `ldi_alarm_lifecycle`, `container_restart_audit`, `devices` | ตารางปกติ | — | ไม่ลบ |

ตรวจสถานะจริงได้ทุกเมื่อ:

```bash
docker exec ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT proc_name, hypertable_name, config
FROM timescaledb_information.jobs
WHERE proc_name IN ('\''policy_retention'\'','\''policy_compression'\'')
ORDER BY 1, 2;"'
```

การเปลี่ยน policy ต้องทำผ่าน migration ใหม่ที่มีเลขลำดับใน `database/migrations/` เท่านั้น ห้ามแก้ด้วยมือบนเซิร์ฟเวอร์ เพราะการแก้ด้วยมือจะหายไปเมื่อติดตั้งใหม่

---

## 3. ข้อมูลส่วนบุคคล

- **สิ่งที่เก็บ:** ชื่อ login Grafana ของผู้ที่ acknowledge หรือ resolve การแจ้งเตือน (`ldi_alarm_lifecycle.acknowledged_by`, `resolved_by`) ซึ่ง `alarm-api` ดึงจาก session ของ Grafana และเก็บไว้โดยไม่มีกำหนดลบ
- **สิ่งที่ไม่ได้เก็บ:** รหัสบัตรหรือชื่อผู้ปฏิบัติงานจากเครื่องจักร ไม่มี flow การรับข้อมูลใดอ่าน field แบบนี้ และไม่มีไปป์ไลน์แปลงข้อมูลให้ระบุตัวตนไม่ได้
- **ถ้าจะรับรหัสบัตรในอนาคต** ให้ hash ด้วย keyed hash ก่อน insert โดยใช้กุญแจจาก `.env` ห้ามมีค่าเริ่มต้นในโค้ด และให้เพิ่ม retention policy ให้ตารางนั้นด้วย

---

## 4. Role ของฐานข้อมูล (ให้สิทธิ์เท่าที่จำเป็น)

| Role | สร้างโดย | สิทธิ์ | ผู้ใช้ |
| --- | --- | --- | --- |
| `grafana_reader` | `postgres/init` และ migration | `SELECT` ใน `public`; `statement_timeout` 60 วินาที (migration 083) | data source ของ Grafana, `factory-twin-3d` |
| `alarm_api_writer` | migration 078 | `SELECT, UPDATE` เฉพาะ `public.ldi_alarm_lifecycle` | `alarm-api` |
| `${POSTGRES_USER}` (`ims_admin` ใน `.env.example`) | init ของ container | superuser | migration, การสำรองข้อมูล **และการรับข้อมูลของ Node-RED** |

**ช่องโหว่ที่ยังเปิดอยู่:** Node-RED เขียนข้อมูลด้วย role superuser การมี role ที่ insert ได้อย่างเดียวสำหรับตารางรับข้อมูลจะจำกัดความเสียหายได้ ถ้า flow ถูกเจาะ ยังไม่ได้ทำ

---

## 5. การตรวจสอบย้อนหลัง

```bash
# ใครมี role อะไร และ login ได้หรือไม่
docker exec ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\du"'

# การดำเนินการกับการแจ้งเตือน และผู้ที่ดำเนินการ
docker exec ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT logid, status, acknowledged_by, acknowledged_at, resolved_by, resolved_at
FROM public.ldi_alarm_lifecycle ORDER BY coalesce(resolved_at, acknowledged_at) DESC NULLS LAST LIMIT 20;"'

# การรีสตาร์ท container ที่ observability-archiver บันทึกไว้
docker exec ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT * FROM public.container_restart_audit ORDER BY 1 DESC LIMIT 20;"'
```

---

[⬅️ กลับสู่ Telemetry Ontology](TELEMETRY_ONTOLOGY.md) | [<img src="../../../docs/assets/icons/home.svg" width="18" align="center" /> หน้าหลักคลังข้อมูล](../../README.md)
