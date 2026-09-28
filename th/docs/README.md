<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <img src="../../docs/assets/icons/book.svg" width="64" alt="Docs Logo" style="filter: drop-shadow(0 0 12px rgba(0, 242, 254, 0.6));" />
  <h1>ดัชนีเอกสาร IMS</h1>
  <p><b>ศูนย์กลางฐานความรู้ของ Industrial Monitoring System</b></p>
  <p>
    <a href="../../docs/README.md"><img src="../../docs/assets/icons/gb-us.svg" width="16" align="center"/> English</a> |
    <a href="README.md"><img src="../../docs/assets/icons/th.svg" width="16" align="center"/> ไทย</a> |
    <a href="../../zh-CN/docs/README.md"><img src="../../docs/assets/icons/tw.svg" width="16" align="center"/> 简体中文</a>
  </p>
</div>

---

> [!TIP]
> **ดัชนีนี้จัดเรียงอย่างไร** เอกสารเรียงจากภาพรวมลงไปสู่รายละเอียด **เอกสารที่ใช้งานอยู่** (คู่มือ runbook สถาปัตยกรรม) อธิบายสถานะปัจจุบันของ branch `main` ส่วน **บันทึกหลักฐานและผลการตรวจสอบ** (`evidence/`, `audit/`, `archive/`) เป็นภาพ ณ วันที่บันทึก คือเก็บสิ่งที่วัดได้ในวันนั้นและไม่แก้ย้อนหลัง โฟลเดอร์ภาษาไทย (`th/`) และภาษาจีนตัวย่อ (`zh-CN/`) จำลองโครงสร้างเดียวกับฉบับภาษาอังกฤษ เอกสารที่ใช้งานอยู่แปลครบทั้งฉบับ ส่วนบันทึกที่ระบุวันที่คงเนื้อหาภาษาอังกฤษไว้พร้อมหมายเหตุภาษาท้องถิ่น

## <img src="../../docs/assets/icons/book.svg" width="18" align="center" /> สารบัญ

### 1. ผลิตภัณฑ์และสถาปัตยกรรม

การออกแบบระดับสูง คุณค่าทางธุรกิจ และความสามารถของผลิตภัณฑ์

- **[ภาพรวมผลิตภัณฑ์](product/README.md)** - ฟีเจอร์และภาพรวมระบบ
- **[ระบบนิเวศแดชบอร์ด](product/DASHBOARD_ECOSYSTEM.md)** - แดชบอร์ด Grafana ที่ provision ไว้ 22 ชุดทำงานร่วมกันอย่างไร
- **[Architecture Book](architecture/IMS_PLATFORM_BOOK.md)** - สถาปัตยกรรมทางเทคนิคทั้ง stack พร้อมอภิธานศัพท์
- **[สถาปัตยกรรม](architecture/ARCHITECTURE.md)** - บริบทระบบ บริการ ข้อจำกัด และการตัดสินใจเชิงสถาปัตยกรรม
- **[การไหลของข้อมูล](architecture/DATA_FLOW.md)** - ไปป์ไลน์ telemetry ตั้งแต่ต้นทางจนถึงการแสดงผล
- **[โครงสร้างฐานข้อมูล](architecture/DATABASE_SCHEMA.md)** - โครงสร้าง hypertable ของ TimescaleDB (สร้างอัตโนมัติ)
- **[Dashboard Inventory](architecture/DASHBOARD_INVENTORY.md)** - รายการแดชบอร์ดทุกชุดพร้อมจำนวน panel (สร้างอัตโนมัติ)
- **[ROI ทางธุรกิจ](business/BUSINESS_VALUE_ROI.md)** - ผลกระทบทางธุรกิจและผลตอบแทนการลงทุน

### 2. Factory Twin และการเชื่อมต่ออุปกรณ์ (EAP)

ดิจิทัลทวินชั้น 1 โมเดลหลักฐาน และแผนที่การทำงานของอุปกรณ์ เอกสารกลุ่มนี้ไม่มีข้อมูล CAD ที่เป็นความลับขององค์กร เผยแพร่เฉพาะจำนวน กฎ และข้อสรุปเท่านั้น

- **[คู่มือผู้ปฏิบัติงาน Factory Twin](architecture/FACTORY_TWIN_OPERATOR_GUIDE.md)** - วิธีอ่านทวินโดยไม่ตีความเกินข้อมูล: มุมมอง เลเยอร์ คำอธิบายสถานะหลักฐาน และตัวตรวจสอบ
- **[สถาปัตยกรรมขณะรันของ Factory Twin](architecture/FACTORY_TWIN_ARCHITECTURE.md)** - เส้นทาง request แผนผังโมดูล HTTP surface การเรนเดอร์ และความหมายของแต่ละมุมมอง
- **[สถาปัตยกรรมบริการของ Factory Twin](architecture/FACTORY_TWIN_SERVICE_ARCHITECTURE.md)** - คอนเทนเนอร์ใดให้บริการทวิน และวิธีทดสอบแบบ direct-mode อย่างปลอดภัย
- **[โมเดลความปลอดภัยของ Factory Twin](architecture/FACTORY_TWIN_SECURITY_MODEL.md)** - ขอบเขตความเชื่อถือ ข้อกำหนด 401 การจัดรูป response และการจัดการ geometry ที่เป็นข้อมูลลับ
- **[ข้อกำหนดหลักฐานของ Factory Twin](architecture/FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)** - สิ่งที่ยังถูกบล็อก สิ่งที่จะปลดล็อก และสัญญาการยกระดับหลักฐาน
- **[การสร้างใหม่ของ Factory Twin](architecture/FACTORY_TWIN_RECONSTRUCTION.md)** - ทวินชั้น 1 ถูกสร้างขึ้นใหม่อย่างไร และข้ออ้างใดที่ทวินกล่าวไม่ได้
- **[โมเดลการนำเสนอของ Factory Twin](architecture/FACTORY_TWIN_PRESENTATION_MODEL.md)** - geometry ที่วาดเพื่อให้เข้าใจง่าย และเหตุผลที่ไม่มีวันนับเป็นหลักฐาน
- **[ที่มาของข้อมูล Factory Twin](architecture/FACTORY_TWIN_PROVENANCE.md)** - namespace ทั้งสี่ คำศัพท์การจัดประเภท และเหตุผลที่ยังไม่มีการจับคู่ตำแหน่งกับ IMS
- **[ความเที่ยงตรงเชิงภาพของ Factory Twin](architecture/FACTORY_TWIN_VISUAL_FIDELITY.md)** - มุมมองแผนผังเหมือนภาพอ้างอิงเพียงใด
- **[Visual QA ของ Factory Twin](architecture/FACTORY_TWIN_VISUAL_QA.md)** - ขั้นตอน QA ด้านภาพและประสิทธิภาพที่ทำซ้ำได้ พร้อม baseline
- **[Floor 1 DXF Forensic Audit](architecture/FLOOR1_DXF_FORENSIC_AUDIT.md)** - ไฟล์ CAD ต้นฉบับมีอะไร และระบบพิกัดได้มาอย่างไร (ไม่เปิดเผยขนาดจริง)
- **[สถาปัตยกรรมการเชื่อมต่ออุปกรณ์ (EAP)](architecture/EAP_ARCHITECTURE.md)** - สัญญาของ adapter แบบ SNMP, HTTP/JSON และ SECS/GEM
- **แผนที่การทำงานของ EAP** - ข้อกำหนด lineage และผลตรวจรับอยู่ใน [`eap/`](eap/) ส่วนเอกสาร node model, census และ renderer ของชั้น 1 อยู่ในโฟลเดอร์นี้ (`eap-*.md`, `equipment-*.md`, `machine-node-census-floor1.md`)

### 3. งานปฏิบัติการและการดูแลระบบ

คู่มือการรัน ดูแลรักษา และขยายระบบในสภาพแวดล้อมจริง

- **[Runbook งานปฏิบัติการ](operations-runbook.md)** - คำสั่งดูแล stack และกู้คืนระบบประจำวัน
- **[คู่มือผู้ดูแลระบบ](admin/ADMIN_MANUAL.md)** - Docker การตั้งค่าแพลตฟอร์ม และงานดูแลระบบ
- **[SOP ผู้ปฏิบัติงาน](operations/SOP_OPERATOR.md)** - ขั้นตอนปฏิบัติมาตรฐานสำหรับผู้ปฏิบัติงาน NOC
- **[Alarm Playbook](operations/ALARM_PLAYBOOK.md)** - แนวทางรับมือเหตุการณ์และจัดการ alarm
- **[การรับมือเหตุการณ์](operations/INCIDENT_RESPONSE.md)** - กรอบระดับความรุนแรงและตัวอย่างเหตุการณ์จริง
- **[คู่มือแก้ไขปัญหา](operations/TROUBLESHOOTING.md)** - ปัญหาที่พบบ่อยและวิธีแก้
- **[สำรองและกู้คืนข้อมูล](operations/BACKUP_RESTORE.md)** และ **[แผนทดสอบ DR](operations/DR_TEST_PLAN.md)** - ขั้นตอนกู้คืนและการซ้อม
- **[ความพร้อมในการ Deploy](operations/DEPLOYMENT_READINESS.md)** และ **[รายการตรวจก่อน Release](operations/RELEASE_CHECKLIST.md)** - รายการตรวจก่อนขึ้นระบบจริง
- **[แผนการขยายระบบ](operations/SCALING_PLAN.md)** - ขีดจำกัดที่วัดได้และขั้นตอนขยายระบบถัดไป
- **[ความพร้อมใช้งานจริง](../PRODUCTION-READINESS.md)** - สถานะ release gate และความเสี่ยงที่ยังเปิดอยู่

### 4. คู่มือผู้ใช้

เอกสารสำหรับผู้ใช้ปลายทางที่ทำงานกับหน้าจอแสดงผล

- **[คู่มือผู้ใช้](user/USER_MANUAL.md)** - วิธีใช้งานและนำทางในหน้าจอ Grafana ของ IMS
- **[คู่มือ LDI SPC](architecture/LDI_SPC_GUIDE.md)** - ระเบียบวิธีการควบคุมกระบวนการเชิงสถิติ
- **[คู่มือ LDI RCA](architecture/LDI_RCA_GUIDE.md)** - ระเบียบวิธีหาความสัมพันธ์ของสาเหตุราก
- **ข้อกำหนดด้านการวิเคราะห์การผลิต** - ข้อกำหนดของ Command Center, SPC, predictive และ decision-UX พร้อมรายงานตรวจรับ อยู่ใน [`analytics/`](analytics/)

### 5. วิศวกรรมและหลักฐาน

ขั้นตอนทดสอบ ผลตรวจรับ และหลักฐานความน่าเชื่อถือของระบบ

- **[ดัชนีหลักฐาน](evidence/INDEX.md)** - บันทึกหลักฐานที่ระบุวันที่ทั้งหมดในรายการเดียว
- **[Evidence Pack](evidence/EVIDENCE_PACK.md)** - หลักฐานการทดสอบประสิทธิภาพและ soak test
- **[โปรโตคอลตรวจรับ LDI](operations/LDI_VALIDATION_PROTOCOL.md)** - ขั้นตอนทดสอบเพื่อยอมรับระบบ
- **[บันทึก Scale Test](evidence/SCALE_TEST_2026-08-15.md)** - scale test ด้วย k6 แบบควบคุม: สำเร็จ 100 % จนถึง 250 อุปกรณ์จำลอง และเริ่มล้มเหลวที่ 500 (คอขวดคือ CPU ของ Node-RED)
- **[โมเดลความปลอดภัย](architecture/SECURITY_MODEL.md)** - ช่องทางภัยคุกคามและมาตรการป้องกัน
- **ข้อกำหนดและผลตรวจสอบด้าน UX** - อยู่ใน [`ux/`](ux/)

### 6. ผลตรวจสอบและเอกสารเก็บถาวร

ผลตรวจสอบในอดีตและภาพรวมระบบ ณ ช่วงเวลาต่าง ๆ

- **[ดัชนีผลตรวจสอบ](audit/README.md)** - รายงานการตรวจสอบที่ระบุวันที่
- **[Full System Audit](archive/IMS_FULL_SYSTEM_AUDIT.md)** - ผลตรวจสอบพื้นฐานของทั้งระบบ
- **[System Trust Report](evidence/SYSTEM_TRUST_REPORT.md)** - ผลตรวจความเที่ยงตรงของตัวชี้วัด
- **[บันทึกการเปลี่ยนแปลง](../CHANGELOG.md)** - ประวัติ release และการรวมโค้ด

### 7. นักพัฒนาและการเชื่อมต่อระบบ

แนวทางด้านวิศวกรรม การดูแล และการเชื่อมต่อกับระบบ

- **[คู่มือนักพัฒนา](developer/LOCAL_DEVELOPMENT.md)** - การเตรียมสภาพแวดล้อมบนเครื่อง
- **[API Reference](api/API_REFERENCE.md)** - สัญญา API สำหรับรับข้อมูลและ webhook
- **[บันทึกการตัดสินใจเชิงสถาปัตยกรรม (ADR)](architecture/decisions/)** - ที่มาของการเลือกเทคโนโลยี
- **[Service Level Objectives (SLO)](sre/SLO_DEFINITIONS.md)** - ความน่าเชื่อถือ error budget และ SLI
- **[Telemetry Ontology](data/TELEMETRY_ONTOLOGY.md)** - พจนานุกรมข้อมูลและมาตรฐาน payload
- **[ข้อมูลสังเคราะห์งานเจาะและ VCP](data/MOCK_DATA.md)** - รันแดชบอร์ดงานเจาะและ VCP ด้วยข้อมูลที่สร้างขึ้น โดยไม่ใช้ข้อมูลโรงงาน

### 8. ธรรมาภิบาล

กรอบงานด้านความปลอดภัย การเรียนรู้จากเหตุการณ์ และคุณภาพเอกสาร

- **[ธรรมาภิบาลข้อมูล](data/DATA_GOVERNANCE.md)** - วงจรชีวิตข้อมูล การปกปิด PII และการปฏิบัติตามข้อกำหนด
- **[ความปลอดภัยของ Supply Chain](security/SUPPLY_CHAIN_POLICY.md)** - นโยบาย SBOM และ dependency
- **[กรอบ Post-Mortem](sre/postmortems/TEMPLATE.md)** - แม่แบบ RCA ของเหตุการณ์แบบไม่กล่าวโทษ
- **[แนวทางการเขียนเอกสาร](DOCUMENTATION_STYLE_GUIDE.md)** - มาตรฐานการเขียนของฐานความรู้

---

<div align="center">
  <p><i>ดูแลเอกสารโดยทีม IMS Core Engineering</i></p>
  <p><b>Precision • Fidelity • Velocity</b></p>
</div>
