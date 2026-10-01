# การทดสอบโหลด K6 — คำสั่งเฝ้าสังเกตการณ์ระบบ

เปิดรันคำสั่งเหล่านี้ในเทอร์มินัลแยกต่างหากในระหว่างที่รันการทดสอบ K6

## เทอร์มินัล 1: การเชื่อมต่อและคิวของ PgBouncer

```bash
# ตรวจสอบการเชื่อมต่อที่กำลังทำงานใน PgBouncer
docker exec ims-pgbouncer psql -p 5432 -U pgbouncer pgbouncer -c "SHOW POOLS;" 2>/dev/null

# เฝ้าดูการเชื่อมต่อทุก 2 วินาที
watch -n 2 "docker exec ims-pgbouncer psql -p 5432 -U pgbouncer pgbouncer -c 'SHOW POOLS;' 2>/dev/null"

# สถิติการเชื่อมต่อ
docker exec ims-pgbouncer psql -p 5432 -U pgbouncer pgbouncer -c "SHOW STATS;" 2>/dev/null
```

## เทอร์มินัล 2: CPU/RAM และคิวรีที่กำลังทำงานของ TimescaleDB

```bash
# จำนวนคิวรีที่กำลังทำงานและคิวรีที่รันนานที่สุด
watch -n 2 "docker exec ims-timescaledb psql -U ims_admin -d ims -c \"
SELECT count(*) as active_queries,
  max(now() - query_start) as longest_running
FROM pg_stat_activity
WHERE state = 'active' AND datname = 'ims';
\""

# จำนวนแถวในตารางแบบสดๆ ระหว่างทดสอบ
watch -n 5 "docker exec ims-timescaledb psql -U ims_admin -d ims -c \"
SELECT 'sys_metrics' as tbl, count(*) FROM public.sys_metrics WHERE time > now() - interval '1 minute'
UNION ALL
SELECT 'net_metrics', count(*) FROM public.net_metrics WHERE time > now() - interval '1 minute'
UNION ALL
SELECT 'ldi_metrics', count(*) FROM public.ldi_metrics WHERE time > now() - interval '1 minute';
\""

# ขนาดของฐานข้อมูล
docker exec ims-timescaledb psql -U ims_admin -d ims -c "SELECT pg_size_pretty(pg_database_size('ims'));"
```

## เทอร์มินัล 3: ทรัพยากรคอนเทนเนอร์ Docker

```bash
# เฝ้าดู CPU/RAM ของทุกคอนเทนเนอร์
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" --no-stream

# ติดตามต่อเนื่องทุก 2 วินาที
watch -n 2 "docker stats --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}' --no-stream"
```

## เทอร์มินัล 4: สุขภาพของไปป์ไลน์ Node-RED

```bash
# ตรวจดูเมตริกไปป์ไลน์ (การ insert/วินาที, ข้อผิดพลาด, circuit breaker)
curl -s http://localhost:1880/metrics 2>/dev/null | grep -E "ims_pipeline|ims_circuit"

# ล็อกของ Node-RED (กรองเฉพาะข้อผิดพลาด)
docker logs ims-node-red --tail 50 2>&1 | grep -i "error\|fail\|timeout"

# เฝ้าดูการตัดวงจรของ circuit breaker
watch -n 5 "curl -s http://localhost:1880/metrics 2>/dev/null | grep ims_circuit_breaker"
```

## ผลลัพธ์ที่คาดหวังในแต่ละเฟส

| เฟส | VUs | ระยะเวลาที่คาดหมาย | อัตราความสำเร็จที่คาดหมาย |
| ----------------- | ------ | ----------------- | --------------------- |
| Warm-up (0→50) | 1-50 | < 200ms | > 99% |
| Sustained (50) | 50 | < 300ms | > 99% |
| Stress (50→200) | 50-200 | < 500ms | > 95% |
| Peak (200) | 200 | < 800ms | > 95% |
| Cool-down (200→0) | 200→0 | < 500ms | > 95% |

## ตัวบ่งชี้คอขวด (Bottleneck Indicators)

| อาการ | คอขวดที่มีโอกาสเป็นไปได้ | วิธีแก้ไข |
| ------------------------ | ------------------------- | --------------------------- |
| ระยะเวลาพุ่งสูง > 2s | การเชื่อมต่อ PgBouncer เต็ม | ปรับเพิ่ม `MAX_CLIENT_CONN` |
| CPU > 80% บน timescaledb | ภาระคิวรีหนักเกินไป | เพิ่ม Index หรือปรับแต่ง `work_mem` |
| Circuit breaker ตัดวงจร | อุปกรณ์หมดเวลาเชื่อมต่อต่อเนื่อง | ระบบปรับแต่งแล้ว (เกณฑ์ตัดวงจร = 2) |
| Net IO พุ่งบน node-red | CPU ติดขัดที่ Parser | ตรวจสอบประสิทธิภาพฟังก์ชัน `parseAll` |
