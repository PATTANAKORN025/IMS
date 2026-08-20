<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="./README.md"><img src="../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <img src="./assets/icons/book.svg" width="64" alt="Docs Logo" style="filter: drop-shadow(0 0 12px rgba(0, 242, 254, 0.6));" />
  <h1>สารบัญเอกสาร IMS</h1>
  <p><b>ศูนย์กลางฐานความรู้ระบบติดตามอุตสาหกรรม (Industrial Monitoring System)</b></p>
</div>

---

> [!TIP]
> **ยินดีต้อนรับสู่ฐานความรู้ IMS** พื้นที่เก็บข้อมูลนี้ประกอบด้วยเอกสารระดับวิศวกรรมมาตรฐานโลกสำหรับทุกแง่มุมของระบบติดตามอุตสาหกรรม APEX Circuit เอกสารทั้งหมดถูกเขียนโดยไม่มีการกล่าวเกินจริง ปรับให้เหมาะสมเพื่อลดภาระทางปัญญา และจัดโครงสร้างจากระดับมหภาคไปสู่ระดับจุลภาค

## <img src="../docs/assets/icons/book.svg" width="18" align="center" /> สารบัญ

### 1. ผลิตภัณฑ์และสถาปัตยกรรม (Product & Architecture)

การออกแบบระดับสูง มูลค่าทางธุรกิจ และความสามารถของผลิตภัณฑ์

- **[ภาพรวมผลิตภัณฑ์](./product/README.md)** - คุณสมบัติและระบบนิเวศ
- **[ระบบนิเวศแดชบอร์ด](./product/DASHBOARD_ECOSYSTEM.md)** - แดชบอร์ด Grafana บังคับ 15 รายการ
- **[หนังสือสถาปัตยกรรม](./architecture/IMS_PLATFORM_BOOK.md)** - สถาปัตยกรรมทางเทคนิคแบบฟูลสแต็ก
- **[การไหลของข้อมูล](./architecture/DATA_FLOW.md)** - ไปป์ไลน์การวัดและส่งข้อมูลทางไกล (Telemetry pipeline) จากเอดจ์สู่การแสดงผล
- **[สกีมาฐานข้อมูล](./architecture/DATABASE_SCHEMA.md)** - โครงสร้างไฮเปอร์เทเบิล (Hypertable) ของ TimescaleDB
- **[ROI ทางธุรกิจ](./business/BUSINESS_VALUE_ROI.md)** - ผลกระทบทางธุรกิจและผลตอบแทนจากการลงทุน

### 2. การปฏิบัติการและการจัดการ (Operations & Administration)

คู่มือสำหรับการรัน บำรุงรักษา และขยายระบบในสภาพแวดล้อมการผลิต (Production)

- **[คู่มือผู้ดูแลระบบ](./admin/ADMIN_MANUAL.md)** - Docker, การกำหนดค่าแพลตฟอร์ม และการดำเนินการระบบ
- **[ขั้นตอนการปฏิบัติงานมาตรฐาน (SOP) สำหรับผู้ปฏิบัติงาน](./operations/SOP_OPERATOR.md)** - ขั้นตอนการปฏิบัติงานมาตรฐานสำหรับผู้ปฏิบัติงาน NOC
- **[คู่มือจัดการการแจ้งเตือน](./operations/ALARM_PLAYBOOK.md)** - การตอบสนองต่อเหตุการณ์และโปรโตคอลการจัดการการแจ้งเตือน
- **[คู่มือการแก้ไขปัญหา](./operations/TROUBLESHOOTING.md)** - ปัญหาที่พบบ่อยและการแก้ไข
- **[ความพร้อมในการติดตั้งใช้งาน](./operations/DEPLOYMENT_READINESS.md)** - รายการตรวจสอบก่อนการใช้งานจริงในโปรดักชัน

### 3. คู่มือผู้ใช้ (User Guides)

เอกสารสำหรับผู้ใช้ปลายทางที่โต้ตอบกับเลเยอร์ภาพ

- **[คู่มือผู้ใช้](./user/USER_MANUAL.md)** - วิธีการนำทางและใช้อินเทอร์เฟซ IMS Grafana
- **[คู่มือ LDI SPC](./architecture/LDI_SPC_GUIDE.md)** - ระเบียบวิธีการควบคุมกระบวนการทางสถิติ (Statistical Process Control)

### 4. วิศวกรรมและหลักฐาน (Engineering & Evidence)

โปรโตคอลการทดสอบ การตรวจสอบความถูกต้อง และหลักฐานความน่าเชื่อถือของระบบ

- **[ชุดหลักฐาน](./evidence/EVIDENCE_PACK.md)** - หลักฐานประสิทธิภาพและการทดสอบแบบแช่ (Soak testing)
- **[โปรโตคอลการตรวจสอบ LDI](./operations/LDI_VALIDATION_PROTOCOL.md)** - ขั้นตอนการทดสอบการยอมรับ (Acceptance test)
- **[บันทึกการทดสอบการขยายระบบ](./evidence/SCALE_TEST_2026-08-15.md)** - ผลการทดสอบโหลดขั้นสูงสุดที่ 100,000 EPS
- **[แบบจำลองความปลอดภัย](./architecture/SECURITY_MODEL.md)** - เวกเตอร์ภัยคุกคามและการบรรเทาผลกระทบ

### 5. การตรวจสอบและคลังเก็บเอกสาร (Audit & Archives)

การตรวจสอบย้อนหลังและภาพรวมระบบ (System snapshots)

- **[การตรวจสอบระบบทั้งหมด](./archive/IMS_FULL_SYSTEM_AUDIT.md)** - การตรวจสอบพื้นฐานแบบครอบคลุม
- **[รายงานความเชื่อมั่นของระบบ](./evidence/SYSTEM_TRUST_REPORT.md)** - การตรวจสอบความถูกต้องของเมตริก (Metric fidelity)

---

<div align="center">
  <p><i>เอกสารได้รับการดูแลโดยทีมวิศวกรรมหลักของ IMS</i></p>
  <p><b>ความแม่นยำ • ความถูกต้อง • ความรวดเร็ว (Precision • Fidelity • Velocity)</b></p>
</div>
