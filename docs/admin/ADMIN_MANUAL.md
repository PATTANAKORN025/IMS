# 🛠️ System Administration & SRE Guide

คู่มือสำหรับทีม IT (MIS-G) ในการดูแลระบบ **IMS (Infrastructure Monitoring System)**

---

## 1. System Management (Docker Management)

ระบบทำงานบน Docker Compose ทั้งหมด 8 containers:

```bash
# ตรวจสอบสถานะทั้งหมด
docker-compose ps

# เริ่มต้นระบบทั้งหมด
docker-compose up -d

# ปิดระบบทั้งหมด
docker-compose down

# Clean Restart (ทำลายข้อมูลทั้งหมด เริ่มใหม่)
docker-compose down -v && docker-compose up -d

# Restart เฉพาะ service ที่มีปัญหา
docker-compose restart node-red
docker-compose restart pgbouncer
docker-compose restart grafana
docker-compose restart prometheus alertmanager

# ดู Real-time Log (Last 50 lines)
docker logs -f --tail 50 node-red
docker logs -f --tail 50 pgbouncer

# ตรวจสอบ Resource Usage
docker stats --no-stream
```

> 💡 **Note:** หลัง `docker-compose down -v` ต้องรอ 40 วินาทีให้ระบบทั้งหมด startup ก่อนตรวจสอบ

---

## 2. Adding New Devices (Network/Server)

### 2.1 เพิ่ม IP ของอุปกรณ์ใหม่

1. **เพิ่ม IP ในตาราง machine_telemetry:**
```sql
INSERT INTO public.machine_telemetry (machine_id, time, cpu_load_percent)
VALUES ('NEW-MACHINE-01', NOW(), 0);
```

2. **เพิ่ม Inject Node ใน Node-RED UI:**
   - เปิด http://localhost:1880
   - คัดลอก Inject Node ที่มีอยู่
   - เปลี่ยน `machine_id` เป็นชื่อเครื่องใหม่
   - เปลี่ยน `topic` เป็น IP ของเครื่องใหม่
   - ต่อเข้า `fork_5_ways` node

3. **Restart Node-RED:**
```bash
docker-compose restart node-red
```

### 2.2 ค้นหา SNMP OID ของอุปกรณ์ใหม่

ใช้ MIB Browser (iReasoning หรือ SnmpB):
1. ต่อสาย LAN เข้าวงเน็ตเวิร์กของเครื่องจักร
2. เปิด MIB Browser → ใส่ IP ของเครื่อง
3. กด "Walk" เพื่อกวาด OID ทั้งหมด
4. ค้นหา OID ที่ต้องการ (อุณหภูมิ, CPU, etc.)

### 2.3 จำลองอุปกรณ์ด้วย SNMP Simulator

แก้ไขไฟล์ `monitoring/snmpsim/Netk@.snmprec`:

```bash
# รูปแบบ: OID|Type|Parameters
# Type: 2=integer, 4=string, 65=counter64

# ตัวอย่าง: เพิ่ม OID สำหรับอุปกรณ์ใหม่
1.3.6.1.4.1.9999.1.1.0|2:numeric|min=20,max=180,rate=2
1.3.6.1.4.1.9999.1.2.0|2:numeric|min=2210,max=2270,rate=1
1.3.6.1.4.1.9999.1.3.0|2:numeric|min=5300,max=6000,rate=1
```

```bash
# Restart SNMP Simulator
docker restart ims-snmpsim

# ตรวจสอบ log
docker logs --tail=10 ims-snmpsim
```

---

## 3. Alert Management

### 3.1 แก้ไข Alert Rules

ไฟล์: `monitoring/prometheus/rules/ims-alerts.yml`

**ตัวอย่าง: แก้ไข Threshold ของ WiFi Signal Degradation:**

```yaml
- alert: WiFi_Signal_Degradation
  # เปลี่ยนจาก 50 drops เป็น 100 drops
  expr: rate(network_rx_drops{interface="wlan0"}[5m]) > 100
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "Wi-Fi signal degraded on {{ $labels.machine_id }}"
```

**ตัวอย่าง: เพิ่ม Alert ใหม่สำหรับ LDI Vibration:**

```yaml
- alert: LDI_Vibration_Critical
  expr: ldi_vibration > 10.0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "LDI vibration critical on {{ $labels.machine_id }}"
    description: "Vibration {{ $value }} mm/s exceeds threshold 10.0"
```

> ⚠️ **Warning:** หลังแก้ไขไฟล์ .yml ต้อง reload Prometheus:
> ```bash
> curl -X POST http://localhost:9090/-/reload
> ```

### 3.2 ตรวจสอบ Alert Rules

```bash
# ตรวจสอบ syntax
docker run --rm --entrypoint promtool \
  -v $(pwd)/monitoring/prometheus/rules:/etc/prometheus/rules \
  prom/prometheus:v2.55.1 \
  check rules /etc/prometheus/rules/ims-alerts.yml
```

### 3.3 Inhibition Rules

ระบบมี Inhibition Rules อัตโนมัติ:
- `InterfaceDown` (critical) → ระงับ Warning ทั้งหมดสำหรับเครื่องเดียวกัน
- `ServiceDown` (critical) → ระงับ Warning ทั้งหมดสำหรับเครื่องเดียวกัน
- `NodeREDDown` → ระงับ `TelemetryGap`

---

## 4. Troubleshooting & Maintenance

### ปัญหายอดฮิตและวิธีแก้

| ปัญหา | สาเหตุที่เป็นไปได้ | วิธีแก้ |
|--------|-------------------|--------|
| Grafana แสดง "No Data" | PgBouncer connection เต็ม หรือ DB ล่ม | `docker restart ims-pgbouncer` + เช็ค disk space |
| Alert ไม่ส่งไป LINE/Teams | Alertmanager Webhook ขาด | เช็ค Node-RED log ที่ `POST/alert-webhook` node |
| กราฟ Bandwidth กระโดดเป็น Tbps | 32-bit Counter Wrap | Parser จัดการแล้ว แต่ถ้ายังเจอ เช็คว่าอุปกรณ์รองรับ 64-bit HC |
| Node-RED ไม่เริ่มทำงาน | Syntax Error ใน Flow JSON | เช็ค log: `docker logs --tail=50 node-red` |
| Continuous Aggregate ไม่มีข้อมูล | ต้อง refresh ด้วยมือ | `CALL refresh_continuous_aggregate('public.telemetry_minute_summary', NULL, NULL);` |
| Container ไม่ขึ้น "Restarting" | Config ผิด หรือ port ชน | เช็ค log ของ container นั้นๆ |

### SRE Verification Protocol

```bash
# 1. Clean Restart
docker-compose down -v && docker-compose up -d

# 2. รอ 40 วินาที
Start-Sleep -Seconds 40

# 3. ตรวจสอบ 8 containers
docker-compose ps

# 4. ตรวจสอบข้อมูลไหล
docker exec ims-timescaledb psql -U ims_admin -d ims -c "
SELECT machine_id, COUNT(*) as rows, MAX(time) as latest
FROM public.machine_telemetry
WHERE time > NOW() - INTERVAL '5 minutes'
GROUP BY machine_id;"

# 5. ตรวจสอบ Continuous Aggregates
docker exec ims-timescaledb psql -U ims_admin -d ims -c "
SELECT bucket, avg_cpu_load, avg_temp
FROM public.telemetry_minute_summary
ORDER BY bucket DESC LIMIT 4;"

# 6. ตรวจสอบ Grafana
curl -sf http://localhost:3000/api/health

# 7. ตรวจสอบ Prometheus Targets
curl -sf http://localhost:9090/api/v1/targets | python3 -c "
import sys, json
data = json.load(sys.stdin)
ups = sum(1 for t in data['data']['activeTargets'] if t['health'] == 'up')
total = len(data['data']['activeTargets'])
print(f'Prometheus: {ups}/{total} targets UP')
"
```

---

## 5. Backup & Recovery

### Database Backup
```bash
# Backup ทั้ง database
docker exec ims-timescaledb pg_dump -U ims_admin ims > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260627.sql | docker exec -i ims-timescaledb psql -U ims_admin -d ims
```

### Flow Backup
```bash
# flows-ubuntu.json คือ source of truth ที่ git ดูแลอยู่แล้ว
# สำรอง nodered_data/flows.json (runtime copy)
cp nodered_data/flows.json nodered_data/flows.json.bak
```
