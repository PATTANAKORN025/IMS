# IMS — คู่มือผู้ใช้งาน (User Manual)

> **สำหรับทีม IT Support และ NOC Team**
> คู่มือนี้ครอบคลุมการใช้งาน Dashboard, การอ่านค่า Metrics, และขั้นตอนการรับมือกับการแจ้งเตือน (Alerts)

---

<div align="center">

![Manual](https://img.shields.io/badge/Manual-User%20Guide-green)
![Version](https://img.shields.io/badge/Version-1.1-blue)
![Audience](https://img.shields.io/badge/Audience-IT%20Support-purple)
![Translation](https://img.shields.io/badge/Translation-In%20Progress-yellow)

</div>

---

## ⚠️ สถานะการแปลเอกสาร

เอกสารฉบับเต็ม (ความยาวกว่า 30KB) กำลังอยู่ในระหว่างการแปลและคอมไพล์โดยระบบอัตโนมัติในพื้นหลัง กรุณาอ้างอิงเอกสารต้นฉบับภาษาอังกฤษที่ [USER_MANUAL.md](USER_MANUAL.md) ในระหว่างนี้

## 📚 สารบัญเบื้องต้น

1. **เริ่มต้นการใช้งาน (Getting Started)**
   - ข้อมูลการเข้าสู่ระบบ: Grafana (`localhost:3000`), Node-RED (`localhost:1880`), Prometheus, Alertmanager
2. **การใช้งาน Grafana Dashboard**
   - โครงสร้างและลำดับชั้นของ Dashboard ทั้ง 12 หน้า
3. **การอ่านค่า Metrics**
   - การแปลความหมายของกราฟ สี และตัวบ่งชี้สถานะต่างๆ
4. **ขั้นตอนการตอบสนองต่อการแจ้งเตือน (Alerts)**
   - ระเบียบปฏิบัติเมื่อระบบแจ้งเตือน Service Down, Disk Full, High CPU
5. **การทำงานพื้นฐาน (Common Operations)**
   - คำสั่งที่ใช้บ่อยสำหรับการตรวจสอบและการรีสตาร์ทเซอร์วิส
6. **การแก้ไขปัญหาเบื้องต้น (Troubleshooting)**

---
<div align="center">
<b>ระบบตรวจสอบสถานะระดับอุตสาหกรรม (IMS)</b>
</div>
