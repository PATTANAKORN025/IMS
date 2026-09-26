<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# 2. เลือกใช้ TimescaleDB สำหรับเก็บข้อมูล Time-Series

วันที่: 2026-08-26

## สถานะ (Status)
ยอมรับ (Accepted)

## บริบท (Context)
IMS ต้องสามารถนำเข้าข้อมูลจากเครื่องจักร LDI ได้มากกว่า 100,000 เหตุการณ์ต่อวินาที และเก็บรักษาไว้สำหรับการวิเคราะห์ระยะยาว เราได้ประเมิน InfluxDB และ TimescaleDB แล้ว

## การตัดสินใจ (Decision)
เราเลือก **TimescaleDB**

## ผลที่ตามมา (Consequences)
- **ข้อดี**: รองรับ SQL สมบูรณ์แบบ มีฟีเจอร์ Continuous aggregates ในตัว และสามารถผสานกับเครื่องมือ PostgreSQL ที่มีอยู่ของเราได้อย่างไร้รอยต่อ (PgBouncer, pgAdmin)
- **ข้อเสีย**: มี overhead ในการใช้พื้นที่ดิสก์สูงกว่าเมื่อเทียบกับ InfluxDB
- **การบรรเทาปัญหา (Mitigation)**: เราจะบังคับใช้นโยบายการจัดการ chunk time intervals และระยะเวลาการเก็บรักษาข้อมูล (Data Retention) อย่างเคร่งครัด
