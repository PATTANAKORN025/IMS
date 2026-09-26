<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# นโยบายความปลอดภัย Supply Chain และ Dependency

เอกสารนี้กำหนดมาตรฐานความปลอดภัยสำหรับไลบรารี, Base Images, และปลั๊กอินของบุคคลที่สามทั้งหมดที่ใช้ใน IMS

## 1. SBOM (Software Bill of Materials)
- IMS ใช้มาตรฐาน **CycloneDX** สำหรับการสร้าง SBOM
- SBOM จะถูกสร้างขึ้นโดยอัตโนมัติทุกครั้งที่มีการ Build ใน CI/CD

## 2. นโยบายลิขสิทธิ์ (License Compliance)
- **อนุญาต**: MIT, Apache 2.0, BSD, ISC
- **ห้ามเด็ดขาด**: GPLv3, AGPL (เว้นแต่จะแยกการทำงานผ่าน Network API อย่างเด็ดขาด)

## 3. การจัดการช่องโหว่ (Vulnerability SLA)
- **CRITICAL**: ต้องแก้ไข (Patch) ภายใน 24 ชั่วโมง
- **HIGH**: ต้องแก้ไขภายใน 7 วัน
- **MEDIUM/LOW**: ตรวจสอบและแก้ไขในรอบ Maintenance ประจำเดือน
