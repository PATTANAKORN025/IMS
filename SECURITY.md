# Security Policy

## Known Limitations (สถานะปัจจุบัน — อัปเดตล่าสุด: 2026-06-27)

ระบบนี้อยู่ระหว่างการพัฒนา (Staging) มีข้อจำกัดด้านความปลอดภัยที่ทราบแล้ว
และอยู่ใน roadmap การแก้ไข:

| รายการ | สถานะ | แผนแก้ไข |
|---|---|---|
| PgBouncer port เปิด public บน host | ทราบแล้ว | bind localhost-only หรือใส่ reverse proxy |
| Node-RED Admin UI ไม่มี authentication | ทราบแล้ว | เพิ่ม adminAuth ใน settings.js ก่อน deploy จริง |
| SNMP community string เป็น plain text ใน flow config | ทราบแล้ว | ย้ายไป environment variable |
| PgBouncer ใช้ AUTH_TYPE: plain | ทราบแล้ว (trade-off เพื่อความเข้ากันได้) | พิจารณาเปลี่ยน password hashing method ที่ต้นทาง |

## การรายงานปัญหาความปลอดภัย

ถ้าพบช่องโหว่เพิ่มเติม โปรดรายงานผ่าน GitHub Issue พร้อม label `security`
หรือติดต่อผู้ดูแลโปรเจคโดยตรงสำหรับปัญหาที่ sensitive

## ห้ามใช้งานในเครือข่ายโรงงานจริง จนกว่าจะ

- [ ] ปิด public exposure ของทุก admin port (PgBouncer, Node-RED, Grafana)
- [ ] เพิ่ม authentication ให้ Node-RED Editor
- [ ] ย้าย credential ทั้งหมดออกจาก plain text config
