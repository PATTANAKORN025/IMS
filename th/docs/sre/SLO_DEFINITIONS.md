# เป้าหมายระดับการให้บริการ (SLO) และตัวชี้วัด (SLI)

เอกสารนี้กำหนดเป้าหมายความน่าเชื่อถือสำหรับแพลตฟอร์ม IMS (Industrial Monitoring System)

## 1. ความพร้อมใช้งาน (Availability/Uptime)
- **SLI**: เปอร์เซ็นต์ของการตอบกลับ HTTP ที่สำเร็จ (200 OK) จาก Ingestion Endpoints ของ Node-RED และ Grafana UI ซึ่งวัดผลในรอบ 30 วันผ่าน Synthetic Monitoring
- **SLO**: `99.95%` (อนุญาตให้ระบบล่มได้ประมาณ 21.6 นาทีต่อเดือน)
- **นโยบาย Error Budget**: หากงบประมาณหมด จะทำการระงับการปล่อยฟีเจอร์ใหม่ (Feature Freeze) และเปลี่ยนเวลาของวิศวกร 100% ไปที่งานเพิ่มความเสถียรของระบบ

## 2. ความหน่วงในการนำเข้าข้อมูล (Ingestion Latency)
- **SLI**: เวลาที่ใช้ตั้งแต่ Node-RED ได้รับ Telemetry Payload จนถึงตอนที่สามารถคิวรีได้ใน TimescaleDB
- **SLO**: `99th percentile < 2.0 วินาที`

## 3. ประสิทธิภาพการคิวรีข้อมูล (Query Performance)
- **SLI**: เวลาในการคิวรี SQL ของ Grafana ที่ดึงข้อมูลจาก TimescaleDB (ทั้ง Continuous Aggregates และตารางดิบ)
- **SLO**: `95th percentile < 1.0 วินาที`; `99th percentile < 3.0 วินาที`

## 4. ความหน่วงในการส่งแจ้งเตือน (Alarm Delivery Latency)
- **SLI**: เวลาที่ใช้ตั้งแต่ Prometheus เริ่มส่ง Alert จนกระทั่งส่ง Webhook สำเร็จ (LINE/MS Teams)
- **SLO**: `99.9th percentile < 5.0 วินาที`
