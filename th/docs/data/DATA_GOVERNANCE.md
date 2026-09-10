# นโยบายการกำกับดูแลข้อมูล (Data Governance & Compliance)

## 1. การจัดระดับชั้นข้อมูล (Data Classification)
- **สาธารณะ (Public)**: เอกสารสถาปัตยกรรม, โครงสร้าง Schema ทั่วไป
- **ภายใน (Internal)**: การตั้งค่าเครื่องจักร, ข้อมูล Telemetry ทั่วไป
- **ความลับ (Confidential/PII)**: รหัสพนักงาน (Operator ID), ข้อมูลกะทำงาน, IP Address ภายใน

## 2. การปกปิดข้อมูลส่วนบุคคล (PII Masking & PDPA)
- รหัสพนักงานที่อยู่ในระบบแจ้งเตือน ต้องถูก Mask หรือทำ Pseudonymization ก่อนเก็บลงฐานข้อมูลระยะยาว
- Raw Telemetry ต้องถูกลบอัตโนมัติ (Retention) หลัง 90 วัน ส่วน Continuous Aggregates (ซึ่งตัด PII ทิ้งแล้ว) จะถูกเก็บไว้ 3 ปี

## 3. สิทธิ์การเข้าถึง (RBAC)
- **NOC Operators**: สิทธิ์ Read-only ใน Grafana
- **Engineers**: สิทธิ์แก้ไข Dashboard, ห้ามเข้าถึง DB โดยตรง
- **Admins**: เข้าถึง DB โดยตรง (ต้องถูกตรวจสอบผ่าน Log ของ PgBouncer)
