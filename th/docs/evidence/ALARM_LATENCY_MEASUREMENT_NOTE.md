<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../../docs/README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# บันทึกการวัดความหน่วงของระบบแจ้งเตือน (Alarm Latency Measurement Note)

## ข้อค้นพบ (2026-08-14)

หลักฐานความหน่วงเบื้องต้นของเส้นทางระบบแจ้งเตือน (`ldi_alarm_log`, ทุกแถว) แสดง
P50=4654ms, P95=7875ms, P99=8027ms -- ซึ่งสูงกว่าตารางข้อมูลโทรมาตร (telemetry tables)
(`ldi_data`, `sys_metrics`, `net_metrics`, `ldi_metrics`) อย่างมาก ที่ทั้งหมดอยู่ที่ระดับ ~1ms

นี่**ไม่ใช่ปัญหาความหน่วงที่แท้จริง** แต่เป็นความคลาดเคลื่อนจากการวัด
ซึ่งเกิดจากวิธีการที่ตัวจำลองเสมือน (mock simulator) กำหนดค่า `logdate` ให้กับการแจ้งเตือนแบบ
noise-code ในพื้นหลัง (background noise-code alarms)

## สาเหตุที่แท้จริง (Root cause)

`nodered_data/flows.json`, โหนด `almsim_gen`, ฟังก์ชัน `generate()`:

```js
rows.push(
  newRow(
    eq,
    code,
    new Date(now - Math.floor(Math.random() * 9000)),
    null,
    "nearest",
  ),
);
```

การแจ้งเตือนแบบ noise-code ในพื้นหลัง (`link_basis = 'nearest'`) จะได้รับ `logdate`
ที่ถูกย้อนเวลาแบบสุ่ม 0-9000ms เพื่อจำลองสถานการณ์ "เงื่อนไขการแจ้งเตือนเกิดขึ้นก่อนที่จะถูกบันทึกเล็กน้อย"
ส่วนการแจ้งเตือนแบบอิงตามเงื่อนไข (Condition-driven alarms)
(`link_basis = 'causal'`) จะใช้ `logdate = new Date()` ในช่วงเวลาที่
การสอบถามข้อมูลโทรมาตร (telemetry query) ที่สัมพันธ์กันเสร็จสิ้น -- ไม่มีการย้อนเวลา

ดังนั้น `ingest_ts - logdate` จึงเป็นการวัดสองสิ่งที่แตกต่างกัน
ขึ้นอยู่กับ `link_basis`:

| link_basis | ความหมายของ logdate | (ingest_ts - logdate) วัดค่าของ |
| ---------- | --------------------------------- | --------------------------------------- |
| `causal`   | เวลาที่ตรวจพบจริง | ความหน่วงจริงของไปป์ไลน์ |
| `nearest`  | เวลาที่ตรวจพบลบด้วยเวลาสุ่ม (0-9s) | เวลาหน่วงที่จำลองขึ้น + ความหน่วงจริงของไปป์ไลน์ |

## หลักฐาน เมื่อแยกข้อมูลอย่างถูกต้อง

```text
$ node tests/e2e/ingestion-latency-check.js
ldi_alarm_log (causal)   n=5  P50= 3.6ms P95= 9.0ms P99= 13.2ms <- ความหน่วงจริงของไปป์ไลน์
ldi_alarm_log (nearest)  n=15 P50=5883ms  P95=7811ms P99=8065ms <- รวมเวลาหน่วงที่จำลองขึ้น ไม่ใช่ความหน่วงของไปป์ไลน์
```

ความหน่วงแบบ `causal` ตรงกับตารางข้อมูลโทรมาตร (ms ระดับเลขหลักเดียว) ไปป์ไลน์
นำเข้าข้อมูลการแจ้งเตือนไม่ได้ทำงานช้า ตัวจำลอง noise-code 
จงใจย้อนเวลาของ timestamps (backdating) เพื่อความสมจริง

## สิ่งที่เปลี่ยนแปลงเพื่อแก้ไขการวัด (ไม่ใช่ที่ไปป์ไลน์ ไม่ใช่ที่ตัวจำลอง)

- `tests/e2e/ingestion-latency-check.js`: รายงาน `ldi_alarm_log` เป็น
  สองบรรทัด (`causal` / `nearest`) แทนที่จะเป็นตัวเลขรวมค่าเดียว
- `monitoring/grafana/dashboards/infrastructure/ims-ingestion-latency.json`:
  แยกแผงสถิติ "ldi_alarm_log" แผงเดียวเป็น "ldi_alarm_log
  (causal)" (เกณฑ์จริง สีเขียว/เหลือง/แดง เหมือนโทรมาตร) และ
  "ldi_alarm_log (nearest)" (ไม่มีเกณฑ์ผ่าน/ไม่ผ่าน -- ให้ข้อมูล
  เท่านั้น คำอธิบาย (tooltip) ระบุว่ารวมเวลาหน่วงที่จำลองขึ้น)

การแก้ไขนี้ไม่มีการเปลี่ยนแปลงเส้นทางการเขียนข้อมูล, โค้ดของตัวจำลอง, หรือการสัมผัส/รีสตาร์ทคอนเทนเนอร์ที่กำลังทำงานอยู่ -- แดชบอร์ด JSON จะรีโหลดตัวเอง(hot-reloads) ภายใน 30 วินาทีตามที่กำหนดใน
`monitoring/grafana/provisioning/dashboards/dashboards.yml` ไม่
กระทบต่อ Soak Attempt 6

## ถูกเลื่อนออกไป ไม่ได้ทำในที่นี้ (Deferred)

การลบการย้อนเวลาที่สร้างขึ้น (artificial backdating) ออกจาก `almsim_gen` โดยตรง (เพื่อให้
การแจ้งเตือนเส้นทาง `nearest` มี `logdate` ที่แท้จริง ไม่ถูกย้อนเวลา) ถือเป็นการเปลี่ยนแปลงเพื่อ
ความสมจริงของตัวจำลอง (simulator-realism) ซึ่งอยู่นอกเหนือขอบเขตในตอนนี้ จนกว่าจะผ่าน
รอบ soak/realism ซึ่ง repository นี้ได้เลื่อนกำหนดการเหล่านั้นออกไปแล้ว
