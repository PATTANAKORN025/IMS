# คู่มือการพัฒนาและตั้งค่าระบบในเครื่อง (Local Development)

ยินดีต้อนรับสู่ IMS Core Team คู่มือนี้จะช่วยให้คุณสามารถรันระบบ Telemetry Stack แบบเต็มรูปแบบในเครื่องของคุณได้ภายในไม่กี่นาที

## 1. สิ่งที่ต้องมี (Prerequisites)
- Docker & Docker Compose (v2)
- GNU Make
- Node.js (สำหรับ linting/tests)

## 2. การตั้งค่าสภาพแวดล้อม (Environment Setup)
1. Clone repository
2. คัดลอกไฟล์ environment: `cp .env.example .env` (ใส่ข้อมูล Secrets ตามต้องการ)
3. เริ่มต้น Dev Stack:
   ```bash
   make up
   ```
   *(คำสั่งนี้จะรัน Node-RED, TimescaleDB, Grafana และ local Simulators)*

## 3. ขั้นตอนการพัฒนา (Development Workflow)
- **Node-RED**: เข้าถึง `http://localhost:1880` การแก้ไขใน UI เป็นแบบชั่วคราว! คุณต้อง Export flow ไปยัง `nodered_data/flows/*.json` เสมอ
- **Grafana**: เข้าถึง `http://localhost:3000` (admin / change-me-please) หลังจากแก้ไข Dashboard ให้เซฟเป็นไฟล์ JSON กลับมาที่ `monitoring/grafana/dashboards/`
- **การตรวจสอบ (Validation)**: รัน `make verify` ก่อนทำการ commit

## 4. ธรรมเนียมปฏิบัติของ Git (Git Conventions)
- Branches: `feat/*`, `fix/*`, `perf/*`, `docs/*`
- Commits: Conventional Commits (เช่น `feat(ldi): add spindle metric`)
