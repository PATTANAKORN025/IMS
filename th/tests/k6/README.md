# การทดสอบโหลด IMS ด้วย K6

> **สคริปต์ Load Testing สำหรับระบบ IMS ด้วย [K6](https://k6.io/) โดย Grafana Labs**

---

<div align="center">

<img src="../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **K6:** Load Testing
<img src="../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **สถานะ:** ผ่านการทดสอบ 1K VUs
<img src="../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **อัตราความล้มเหลว:** 0%

</div>

---

## สิ่งที่ต้องติดตั้งล่วงหน้า (Prerequisites)

```bash
# Windows (choco)
choco install k6

# macOS
brew install k6

# Linux
sudo snap install k6
```

---

## สคริปต์การทดสอบ (Test Scripts)

| สคริปต์ | วัตถุประสงค์ | โหลดเริ่มต้น |
| ------------------------- | ------------------------------------------ | -------------------------- |
| `db-write-stress.js` | ปริมาณงานเขียนฐานข้อมูลผ่าน PgBouncer | 100 เซิร์ฟเวอร์ × ความถี่ทุก 10 วินาที |
| `grafana-query-stress.js` | ประสิทธิภาพการสืบค้นแดชบอร์ด Grafana | ผู้ใช้งานพร้อมกัน 50 คน |
| `pipeline-stress.js` | ครบวงจร End-to-end: SNMP → Node-RED → DB → Grafana | 100 เซิร์ฟเวอร์ |

---

## การสั่งรันการทดสอบ (Running Tests)

### ทดสอบการเขียนฐานข้อมูล (Database Write Stress)

```bash
# ค่าเริ่มต้น: 100 เซิร์ฟเวอร์, ความถี่การเขียน 10 วินาที
k6 run tests/k6/db-write-stress.js

# กำหนดเอง: 500 เซิร์ฟเวอร์, ความถี่ 5 วินาที
k6 run tests/k6/db-write-stress.js \
 --env SERVER_COUNT=500 \
 --env WRITE_INTERVAL=5 \
 --env PGHOST=localhost \
 --env PGPORT=5432
```

### ทดสอบการสืบค้น Grafana (Grafana Query Stress)

```bash
# ค่าเริ่มต้น: ผู้ใช้พร้อมกัน 50 คน
k6 run tests/k6/grafana-query-stress.js

# กำหนดเอง: ผู้ใช้พร้อมกัน 200 คน
k6 run tests/k6/grafana-query-stress.js \
 --env CONCURRENT_USERS=200 \
 --env GRAFANA_URL=http://localhost:3000 \
 --env GRAFANA_USER=admin \
 --env GRAFANA_PASS=your-password
```

### ทดสอบไปป์ไลน์แบบครบวงจร (Full Pipeline E2E)

```bash
# ค่าเริ่มต้น: 100 เซิร์ฟเวอร์
k6 run tests/k6/pipeline-stress.js

# กำหนดเอง: 1000 เซิร์ฟเวอร์
k6 run tests/k6/pipeline-stress.js \
 --env TARGET_SERVERS=1000 \
 --env NODERED_URL=http://localhost:1880
```

---

## เป้าหมายประสิทธิภาพ (Performance Targets)

| ตัวชี้วัด | เป้าหมาย | ค่าจริงที่วัดได้ |
| --------------------- | ------- | ---------------- |
| **DB Write P95** | < 500ms | ~156ms |
| **Grafana Query P95** | < 3s | < 1s |
| **E2E Pipeline P95** | < 10s | < 2s |
| **Success Rate** | > 95% | 100% |
| **Max VUs** | 1,000 | 1,000 |
| **Total Iterations** | — | ~65,000 ครั้งใน 2 นาที |
