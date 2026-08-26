# คู่มืออ้างอิง IMS API

เอกสารนี้สรุป HTTP Endpoints ที่เปิดให้ใช้งานสำหรับการรวมเครื่องจักรและบริการภายนอกเข้ากับแพลตฟอร์ม IMS

## 1. Telemetry Ingestion API
รับข้อมูล Time-series จากเครื่องจักร LDI

**POST** `/ingest/ldi`
- **Host**: `node-red-internal:1880` (หรือผ่าน reverse proxy)
- **Headers**:
  - `Content-Type: application/json`
  - `X-API-Key: <SECRET>`
- **Body**: ดูที่ [Telemetry Ontology](../data/TELEMETRY_ONTOLOGY.md)
- **Responses**:
  - `202 Accepted`: รับ Payload เข้าคิวเพื่อประมวลผลแล้ว
  - `400 Bad Request`: รูปแบบ JSON schema ไม่ถูกต้อง
  - `401 Unauthorized`: ขาด API key หรือ API key ไม่ถูกต้อง

## 2. Alarm Webhook API
รับทริกเกอร์แจ้งเตือนจากภายนอกเพื่อประมวลผลผ่าน Alertmanager

**POST** `/alarms/external`
- **Host**: `alertmanager:9093`
- **Body**: Standard Prometheus Alertmanager webhook payload
- **Responses**:
  - `200 OK`: รับและจัดการการแจ้งเตือนแล้ว
