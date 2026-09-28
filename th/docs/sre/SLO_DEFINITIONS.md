<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>วิศวกรรมความน่าเชื่อถือของระบบ IMS (SRE): ข้อกำหนด SLI และ SLO</h1>
  <p><b>ตัวชี้วัดระดับบริการที่สร้างจาก metric ที่ระบบส่งออกจริงในปัจจุบันเท่านั้น พร้อมเป้าหมาย และสิ่งที่ยังไม่ได้วัด</b></p>
  <p>
    <a href="../../../docs/sre/SLO_DEFINITIONS.md">English</a> |
    <a href="SLO_DEFINITIONS.md">ไทย</a> |
    <a href="../../../zh-CN/docs/sre/SLO_DEFINITIONS.md">简体中文</a>
  </p>
</div>

---

> **กติกาของหน้านี้:** ทุก query ด้านล่างรันได้กับระบบตามที่ติดตั้งจริง Prometheus เก็บ metric จาก blackbox probe และ `/metrics` ของ Node-RED ส่วนความหน่วงของการรับข้อมูลอยู่ใน TimescaleDB (`ingest_ts`, migration 081) ไม่มีการเก็บ metric จากที่อื่น Grafana, nginx และ PgBouncer ไม่ได้ส่ง metric ให้ Prometheus SLI ที่ต้องใช้ metric เหล่านั้นจึงอยู่ในหัวข้อที่ 4 ในฐานะ **ยังไม่ได้วัด**

---

## 1. SLI ที่วัดได้และเป้าหมาย

เป้าหมายใช้หน้าต่างเวลาย้อนหลัง 30 วันแบบเลื่อน เป็นเป้าที่ตั้งสำหรับโรงงานนี้ ไม่ใช่การรับประกันตามสัญญา

| SLI | แหล่งข้อมูล | เป้าหมาย (SLO) | งบประมาณความผิดพลาด 30 วัน |
| --- | --- | --- | --- |
| **ความพร้อมใช้งานของแพลตฟอร์ม**: blackbox HTTP probe ไปยัง Grafana, Node-RED, Prometheus และ Alertmanager สำเร็จ | Prometheus `probe_success{job="blackbox-http"}` | ≥ 99.9% | probe ล้มเหลวได้ 43.2 นาทีต่อเป้าหมาย |
| **การเขียนสำเร็จ**: insert ของการรับข้อมูลที่ไม่ล้มเหลว | Prometheus `ims_pipeline_inserts_total`, `ims_pipeline_inserts_failed_total` | ≥ 99.9% | 0.1% ของ insert |
| **ความสดของไปป์ไลน์**: จำนวนวินาทีนับจากการ flush สำเร็จครั้งล่าสุด | Prometheus `ims_pipeline_last_flush_timestamp_seconds` | < 120 วินาทีใน 99% ของนาที | เกิน 120 วินาทีได้ 432 นาที |
| **ความหน่วงการรับข้อมูล**: จากเวลาต้นทางถึงเวลาบันทึกลงฐานข้อมูล สำหรับแถว LDI | TimescaleDB `ldi_data.ingest_ts - ldi_data.time` | p99 < 2 วินาที | แถวที่ช้ากว่าได้ 1% |
| **การ poll SNMP ยังทำงาน**: มีการ poll อุปกรณ์เกิดขึ้น | Prometheus `ims_pipeline_devices_polled_total` | อัตรา > 0 ตลอดเวลา | ใช้เป็นการแจ้งเตือน ไม่ได้ตั้งงบประมาณ |

---

## 2. Query

### 2.1 ความพร้อมใช้งานของแพลตฟอร์ม

```promql
avg_over_time(probe_success{job="blackbox-http"}[30d]) * 100
```

### 2.2 การเขียนสำเร็จ

$$\text{SLI}_{\text{write}} = 1 - \frac{\Delta\,\text{inserts\_failed}}{\Delta\,\text{inserts}}$$

```promql
(1 - sum(increase(ims_pipeline_inserts_failed_total[30d]))
     / clamp_min(sum(increase(ims_pipeline_inserts_total[30d])), 1)) * 100
```

### 2.3 ความสดของไปป์ไลน์

```promql
time() - max(ims_pipeline_last_flush_timestamp_seconds)
```

### 2.4 ความหน่วงการรับข้อมูล (SQL ไม่ใช่ PromQL)

```sql
SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY extract(epoch FROM ingest_ts - time)) AS p99_seconds,
       count(*) AS rows
FROM public.ldi_data
WHERE time > now() - interval '1 hour' AND ingest_ts IS NOT NULL;
```

แดชบอร์ด "Platform — 04 Ingestion Pipeline Latency & Telemetry SLO" แสดงค่าที่วัดแบบเดียวกันนี้

### 2.5 การ poll SNMP ยังทำงาน

```promql
sum(rate(ims_pipeline_devices_polled_total[5m]))
```

---

## 3. การแจ้งเตือนที่ป้องกัน SLI เหล่านี้อยู่แล้ว

กฎใน `monitoring/prometheus/rules/ims-alerts.yml` ที่มีอยู่แล้ว:

| กฎ | เงื่อนไข | ป้องกัน |
| --- | --- | --- |
| `ServiceDown` | `probe_success == 0` | ความพร้อมใช้งาน |
| `SLABreachWarning` | `(1 - avg_over_time(probe_success[1h])) * 100 > 0.01` | ความพร้อมใช้งาน |
| `PipelineDataStalled` | `rate(ims_pipeline_inserts_total[5m]) == 0` | ความสด |
| `PipelineHighErrorRate` | `rate(ims_pipeline_inserts_failed_total[5m]) > 0.1` | การเขียนสำเร็จ |
| `PipelineDataDegraded` | อัตรา insert ต่ำกว่าครึ่งหนึ่งของค่าเฉลี่ย 1 ชั่วโมง | ปริมาณการเขียน |

การแจ้งเตือนอัตราการใช้งบประมาณแบบหลายหน้าต่างเวลา (เช่น 14.4 เท่าในช่วง 1 ชั่วโมงและ 5 นาที) เป็นขั้นตอนถัดไปที่ **เสนอไว้** ยังไม่มีไฟล์กฎ burn-rate ให้สร้างจาก query ในหัวข้อที่ 2 และห้ามใช้ metric ที่ระบบไม่ได้ส่งออก

---

## 4. สิ่งที่ยังไม่ได้วัด

| SLI ที่ต้องการ | สิ่งที่ยังขาด |
| --- | --- |
| ความหน่วงของ query บนแดชบอร์ด | ไม่ได้เก็บ `/metrics` ของ Grafana |
| อัตราความผิดพลาด HTTP ของทางเข้าหลัก | nginx ไม่ได้ส่งออก metric (ไม่มี `stub_status` หรือ exporter) |
| ความอิ่มตัวของ connection pool | ไม่มี exporter ของ PgBouncer |
| ความหน่วงการส่งการแจ้งเตือน (LINE / Teams) | Prometheus เก็บ metric การแจ้งเตือนของ Alertmanager อยู่แล้ว แต่ยังไม่ได้กำหนด SLI |

---

## 5. นโยบายงบประมาณความผิดพลาด

| งบประมาณคงเหลือ (30 วัน) | การตอบสนอง |
| --- | --- |
| > 50% | เปลี่ยนแปลงได้ตามปกติ |
| 25–50% | การแก้ flow ของ Node-RED และ migration ต้องมีผู้ตรวจคนที่สอง |
| < 25% | รับเฉพาะการแก้ไขข้อบกพร่อง งานที่ไม่เร่งด่วนต้องรอ |
| หมดแล้ว | หยุดงานพัฒนาฟีเจอร์จนกว่า SLI จะกลับมา และเขียน postmortem ภายใน 48 ชั่วโมง (`docs/sre/postmortems/TEMPLATE.md`) |

---

## 6. ตรวจจาก command line

```bash
curl -s -G http://127.0.0.1:9090/api/v1/query \
  --data-urlencode 'query=time() - max(ims_pipeline_last_flush_timestamp_seconds)' | jq '.data.result[0].value[1]'

curl -s -G http://127.0.0.1:9090/api/v1/query \
  --data-urlencode 'query=avg_over_time(probe_success{job="blackbox-http"}[1h])' \
  | jq -r '.data.result[] | "\(.metric.instance) \(.value[1])"'
```

Prometheus ผูกกับ `127.0.0.1` เท่านั้น ให้รันคำสั่งเหล่านี้บนเครื่องที่ติดตั้งระบบ
