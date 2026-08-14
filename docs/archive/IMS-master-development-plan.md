# IMS — Master Development Plan

> **ARCHIVED — historical snapshot, dated 2026-08-04.** Not living documentation; numbers below (dashboard counts, migration counts, panel counts, etc.) reflect the system as it existed on that date and are known to be stale relative to the current system. Kept for historical record per docs/archive/README.md. For current information, see docs/architecture/ARCHITECTURE.md and docs/architecture/DASHBOARD_INVENTORY.md.

> แผนพัฒนาครอบคลุมทุกด้าน — จากข้อมูลจริงของโปรเจค ณ วันที่ 2026-08-04
> สร้างโดยใช้ `/brainstorming` skill + ข้อมูลจาก PRODUCT.md, TASKS.md, ARCHITECTURE.md, SECURITY.md, knowledge.md

---

## 1. Executive Summary

**IMS (Industrial Monitoring System)** คือระบบ NOC monitoring ระดับ Enterprise สำหรับ APEX Circuit — ปัจจุบันอยู่ใน **Phase 12 (Apex SRE Optimization)** ซึ่งเป็นสถานะ **Production-ready / Stable** แล้ว

### สถานะปัจจุบัน (2026-08-04)

| สถานะ            | รายละเอียด                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------- |
| **Architecture** | SNMP v2c → Node-RED → PgBouncer → TimescaleDB → Grafana + Prometheus/Alertmanager         |
| **Devices**      | 1000+ devices (Linux servers, Juniper EX4000 switches, LDI PCB machines)                  |
| **Dashboards**   | 9 dashboards (NOC Overview, Engineering, Capacity, Meta-Monitoring, 5× LDI Manufacturing) |
| **Alerting**     | Prometheus + Alertmanager → LINE Notify + MS Teams                                        |
| **AI Tooling**   | 12 MCP servers, 90 skills, 8 plugins (MiMo Code + Claude Code + OpenCode + Copilot)       |
| **Tests**        | Unit tests, K6 stress tests, Playwright visual regression, dashboard linter               |
| **CI/CD**        | ยังไม่มี — flows.json deploy ด้วยมือ                                                      |

---

## 2. Current State Assessment

### 2.1 สิ่งที่ทำเสร็จแล้ว

| Category       | Item                                                                  | Status |
| -------------- | --------------------------------------------------------------------- | ------ |
| **Pipeline**   | Zero-Leak Pipeline (4-thread parallel SNMP walker)                    | Done   |
| **Pipeline**   | Network 64-bit Analytics (eth0/wlan0 Mbps)                            | Done   |
| **Pipeline**   | Stateful Parser v9 (per-device flow context)                          | Done   |
| **Pipeline**   | Circuit Breaker (2 failures → HALF_OPEN probe)                        | Done   |
| **Pipeline**   | Retry Queue with age-based eviction                                   | Done   |
| **Storage**    | TimescaleDB V2 Normalized Schema (sys_metrics, net_metrics, ldi_data) | Done   |
| **Storage**    | Continuous Aggregates (hourly → daily → weekly)                       | Done   |
| **Storage**    | Retention Policies (raw 14d, hourly 90d, daily 2yr, weekly forever)   | Done   |
| **Storage**    | PgBouncer Transaction Pooling                                         | Done   |
| **Dashboards** | NOC Overview (fleet envelope, health score)                           | Done   |
| **Dashboards** | Engineering Drill-Down (per-machine diagnostics)                      | Done   |
| **Dashboards** | Capacity Planning (forecasting, Z-Score)                              | Done   |
| **Dashboards** | Meta-Monitoring (pipeline health)                                     | Done   |
| **Dashboards** | 5× LDI Manufacturing (analytics, snapshot, operator, data readiness)  | Done   |
| **Alerting**   | Prometheus Alert Rules (14 rules)                                     | Done   |
| **Alerting**   | Alertmanager Inhibition Rules                                         | Done   |
| **Alerting**   | LINE Notify + MS Teams Webhook                                        | Done   |
| **LDI**        | LDI Production Schema (ldi_data, ldi_alarm_log, SPC engine)           | Done   |
| **LDI**        | LDI Device Simulator + Alarm Simulator                                | Done   |
| **Security**   | Gitleaks scanning                                                     | Done   |
| **Security**   | Docker secrets management                                             | Done   |
| **Tooling**    | 90 skills (26 local + 41 mattpocock + 9 vercel + 14 superpowers)      | Done   |
| **Tooling**    | 12 MCP servers (MiMo/Claude/OpenCode/Copilot)                         | Done   |

### 2.2 สิ่งที่ต้องทำต่อ (Backlog)

| #   | Item                                                                   | Priority | Effort | Impact                                                                                |
| --- | ---------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------- |
| 1   | **CI/CD Pipeline** — GitHub Actions สำหรับ flows.json deploy           | P0       | Medium | สูงมาก                                                                                |
| 2   | **K6 Stress Test** — 10,000 req/sec → PgBouncer throughput ceiling     | P0       | Medium | สูงมาก                                                                                |
| 3   | **Disk Forecasting** — predictive disk-full panel ใน Capacity Planning | ️ P1      | Low    | <img src="docs/assets/icons/target.svg" width="18" height="18" align="center" /> กลาง |
| 4   | **Connect Real Servers** — swap simulator IPs ใน Node-RED              | ️ P1      | High   | สูงมาก                                                                                |
| 5   | **Webhook Alerts** — configure real LINE Notify / Slack webhook        | ️ P1      | Low    | <img src="docs/assets/icons/target.svg" width="18" height="18" align="center" /> กลาง |

### 2.3 Known Issues (จาก SECURITY.md)

| #   | Issue                                 | Severity | Status            |
| --- | ------------------------------------- | -------- | ----------------- |
| 1   | PgBouncer port exposed on host        | ️ Medium  | Known             |
| 2   | Node-RED Admin UI has no auth         | High     | Known             |
| 3   | SNMP community string in plain text   | ️ Medium  | Known             |
| 4   | PgBouncer uses AUTH_TYPE: plain       | ️ Medium  | Known (trade-off) |
| 5   | GitHub PAT hardcoded in mimocode.json | High     | Known             |

---

## 3. Master Development Roadmap

### Phase 13: Production Hardening (สัปดาห์ที่ 1–2)

**เป้าหมาย:** ทำให้ระบบ production-ready จริงๆ ไม่ใช่แค่ dev-ready

#### 3.1 CI/CD Pipeline — GitHub Actions

**ปัญหา:** ปัจจุบัน deploy flows.json ด้วยมือ (`make deploy-flows`) ไม่มี automation → human error, slow rollback, ไม่มี audit trail

**แผนงาน:**

| Step | งาน                                        | ไฟล์ที่เกี่ยวข้อง | รายละเอียด                                                     |
| ---- | ------------------------------------------ | ----------------- | -------------------------------------------------------------- |
| 1    | สร้าง `.github/workflows/deploy-flows.yml` | ใหม่              | Trigger: push to `main` ที่เปลี่ยน `nodered_data/flows/*.json` |
| 2    | เพิ่ม job `validate-flows`                 | workflows         | รัน `make validate-flows` ก่อน deploy                          |
| 3    | เพิ่ม job `snapshot-flows`                 | workflows         | backup flows.json ก่อน deploy (`make snapshot-flows`)          |
| 4    | เพิ่ม job `deploy-flows`                   | workflows         | `make deploy-flows` ผ่าน SSH หรือ API                          |
| 5    | เพิ่ม job `verify-pipeline`                | workflows         | `make verify` หลัง deploy → fail = rollback                    |
| 6    | เพิ่ม rollback job                         | workflows         | ถ้า verify fail → restore จาก snapshot อัตโนมัติ               |

**Architecture:**

```text
push to main (flows/*.json changed)
  → validate-flows (make validate-flows)
  → snapshot-flows (make snapshot-flows)
  → deploy-flows (make deploy-flows)
  → verify-pipeline (make verify)
  → [if fail] rollback (restore snapshot)
```

**Success Criteria:**

- flows.json deploy อัตโนมัติทุกครั้งที่ push
- validate + snapshot + verify สำเร็จก่อน deploy
- rollback อัตโนมัติถ้า verify fail
- deploy history มี audit trail ใน GitHub Actions

---

#### 3.2 Node-RED Admin Auth

**ปัญหา:** Node-RED Editor UI ไม่มี auth → ใครก็เข้าถึงได้ที่ port 1880

**แผนงาน:**

| Step | งาน                                            | ไฟล์ที่เกี่ยวข้อง          | รายละเอียด                                                               |
| ---- | ---------------------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| 1    | Generate bcrypt hash                           | shell                      | `docker run --rm nodered/node-red npx node-red-admin hash-pw <password>` |
| 2    | ตั้งค่า `NODE_RED_ADMIN_USER=admin`            | `.env`                     | ใส่ username                                                             |
| 3    | ตั้งค่า `NODE_RED_ADMIN_PASSWORD_HASH=$2b$...` | `.env`                     | ใส่ bcrypt hash                                                          |
| 4    | แก้ `settings.js`                              | `nodered_data/settings.js` | เพิ่ม `adminAuth` block ที่อ่านจาก env                                   |
| 5    | Restart Node-RED                               | `make restart`             | ทดสอบ login                                                              |

**Success Criteria:**

- Node-RED Editor ต้อง login ก่อนเข้าถึง
- ยังเข้าถึงผ่าน Docker network ได้ (ไม่ต้อง login สำหรับ pipeline)

---

### Phase 14: Production Readiness (สัปดาห์ที่ 3–4)

**เป้าหมาย:** ทดสอบ performance จริง + เตรียมต่อ production servers

#### 3.3 K6 Stress Test — 10,000 req/sec

**ปัญหา:** ยังไม่รู้ PgBouncer throughput ceiling → ไม่รู้ว่าระบบรับ load ได้แค่ไหน

**แผนงาน:**

| Step | งาน                           | ไฟล์ที่เกี่ยวข้อง               | รายละเอียด                                     |
| ---- | ----------------------------- | ------------------------------- | ---------------------------------------------- |
| 1    | สร้าง K6 script สำหรับ 10K VU | `tests/k6/throughput-stress.js` | Ramp: 50 → 200 → 1000 → 5000 → 10000 VU        |
| 2    | วัด metrics หลัก              | —                               | p95 latency, error rate, throughput (rows/sec) |
| 3    | ปรับ PgBouncer config         | `docker-compose.yaml`           | MAX_CLIENT_CONN=500, DEFAULT_POOL_SIZE=50      |
| 4    | ปรับ TimescaleDB config       | `database/migrations/`          | shared_buffers=2GB, work_mem=256MB             |
| 5    | Re-run stress test หลัง tune  | `tests/k6/throughput-stress.js` | วัด improvement                                |
| 6    | บันทึกผลลัพธ์                 | `docs/PERFORMANCE.md`           | baseline + optimized metrics                   |

**Success Criteria:**

- ผ่าน 10,000 req/sec โดยไม่ error > 0.1%
- p95 latency < 500ms
- PgBouncer connection pool ไม่ overflow

---

#### 3.4 Connect Real Servers

**ปัญหา:** ปัจจุบันใช้ SNMP simulator → ยังไม่ได้ทดสอบกับ server จริง

**แผนงาน:**

| Step | งาน                            | ไฟล์ที่เกี่ยวข้อง                                                       | รายละเอียด                                |
| ---- | ------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------- |
| 1    | สร้าง `.env.production`        | ใหม่                                                                    | SNMP_COMMUNITY, device IPs จริง           |
| 2    | แก้ `docker-compose.prod.yaml` | `docker-compose.prod.yaml`                                              | ใช้ production env                        |
| 3    | แก้ device registry            | `database/migrations/`                                                  | INSERT ข้อมูล server จริง                 |
| 4    | ทดสอบ SNMP connection          | `scripts/snmp-discover.js`                                              | ยืนยันว่า SNMP v2c ใช้ได้กับ server จริง  |
| 5    | Deploy แบบ canary              | —                                                                       | เปิด 5 เครื่องก่อน → verify → เปิดทั้งหมด |
| 6    | Monitor pipeline health        | `monitoring/grafana/dashboards/infrastructure/ims-meta-monitoring.json` | ดู ingestion rate, error rate             |

**Success Criteria:**

- SNMP polling ใช้ได้กับ server จริง
- ไม่มี data loss ในช่วง transition
- Circuit breaker ทำงานถูกต้องกับ server จริง

---

### Phase 15: Advanced Features (เดือนที่ 2)

**เป้าหมาย:** เพิ่ม predictive analytics + improve alerting

#### 3.5 Disk Forecasting Panel

**ปัญหา:** ไม่มี predictive disk-full panel → ไม่รู้ล่วงหน้าว่า disk จะเต็มเมื่อไหร่

**แผนงาน:**

| Step | งาน                                      | ไฟล์ที่เกี่ยวข้อง                                                         | รายละเอียด                                |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| 1    | สร้าง SQL query สำหรับ linear regression | `monitoring/grafana/dashboards/infrastructure/ims-capacity-planning.json` | คำนวณ slope + intercept จากข้อมูล 7 วัน   |
| 2    | สร้าง panel "Days Until Full"            | —                                                                         | แสดงจำนวนวันที่ disk จะเต็ม               |
| 3    | เพิ่ม threshold alert                    | —                                                                         | <7 วัน = Warning, <3 วัน = Critical       |
| 4    | เพิ่ม panel "Disk Usage Forecast Chart"  | —                                                                         | กราฟ show trend + projection line         |
| 5    | ทดสอบกับข้อมูลจำลอง                      | —                                                                         | สร้าง synthetic data ที่ disk กำลังจะเต็ม |

**Success Criteria:**

- Panel แสดง "Days Until Full" ได้ถูกต้อง
- Alert ทำงานเมื่อ forecast <7 วัน
- กราฟ show projection line ชัดเจน

---

#### 3.6 Real Webhook Alerts

**ปัญหา:** LINE Notify / Slack ยังเป็น placeholder → ไม่ได้รับ alert จริง

**แผนงาน:**

| Step | งาน                           | ไฟล์ที่เกี่ยวข้อง       | รายละเอียด                   |
| ---- | ----------------------------- | ----------------------- | ---------------------------- |
| 1    | สร้าง LINE Notify token จริง  | LINE Developers         | สร้าง channel + token        |
| 2    | ตั้งค่า `ALERT_WEBHOOK_TOKEN` | `.env`                  | ใส่ token จริง               |
| 3    | สร้าง Slack webhook จริง      | Slack App               | สร้าง Incoming Webhook       |
| 4    | ตั้งค่า `TEAMS_WEBHOOK_URL`   | `.env`                  | ใส่ URL จริง                 |
| 5    | ทดสอบ alert                   | `scripts/test-alert.sh` | ส่ง test alert ผ่าน webhook  |
| 6    | ตรวจสอบ notification          | LINE/Slack app          | ยืนยันว่าได้รับ notification |

**Success Criteria:**

- Alert ส่งถึง LINE Notify จริง
- Alert ส่งถึง Slack จริง
- Runbook link ทำงานถูกต้อง

---

### Phase 16: Observability & Documentation (เดือนที่ 3)

**เป้าหมาย:** ทำให้ระบบ self-documenting + monitor ตัวเองได้

#### 3.7 Pipeline Self-Monitoring Dashboard

**แผนงาน:**

| Step | งาน                             | รายละเอียด                               |
| ---- | ------------------------------- | ---------------------------------------- |
| 1    | เพิ่ม Node-RED metrics endpoint | `/metrics` endpoint สำหรับ Prometheus    |
| 2    | เพิ่ม Prometheus scrape config  | scrape Node-RED ทุก 10s                  |
| 3    | สร้าง pipeline health dashboard | แสดง ingestion rate, error rate, latency |
| 4    | เพิ่ม deadman alert             | ถ้าไม่มี data 3 นาที → alert             |

#### 3.8 Documentation Overhaul

**แผนงาน:**

| Step | งาน                    | รายละเอียด                        |
| ---- | ---------------------- | --------------------------------- |
| 1    | อัปเดท ARCHITECTURE.md | สะท้อนสถานะปัจจุบันจริง           |
| 2    | สร้าง RUNBOOK.md       | ขั้นตอนแก้ปัญหา common issues     |
| 3    | สร้าง ONBOARDING.md    | สำหรับ engineer ใหม่              |
| 4    | สร้าง API.md           | สำหรับ Node-RED webhook endpoints |

---

## 4. Risk Assessment

### 4.1 Technical Risks

| Risk                                       | Probability | Impact | Mitigation                            |
| ------------------------------------------ | ----------- | ------ | ------------------------------------- |
| PgBouncer bottleneck ที่ 10K+ req/sec      | Medium      | High   | Phase 14 stress test + tune           |
| SNMP v2c ไม่ secure พอสำหรับ production    | High        | Medium | Migrate ไป SNMPv3 ใน Phase 17         |
| Node-RED single point of failure           | Low         | High   | Docker restart policy + health checks |
| TimescaleDB storage growth เร็วเกินไป      | Medium      | Medium | Retention policies + compression      |
| Grafana dashboard ซ่อน data จาก CAGG query | Low         | Medium | Review all queries ก่อน deploy        |

### 4.2 Operational Risks

| Risk                                 | Probability | Impact   | Mitigation                        |
| ------------------------------------ | ----------- | -------- | --------------------------------- |
| Deploy flow.json ผิด → pipeline down | Medium      | High     | CI/CD + snapshot + auto-rollback  |
| Secret leak จาก .env                 | Low         | Critical | Gitleaks + .gitignore + audit     |
| ไม่มี alert จริง → ไม่รู้ปัญหา       | High        | Critical | Phase 14: configure real webhooks |
| Server connection ไม่ stable         | Medium      | Medium   | Circuit breaker + retry queue     |

---

## 5. Success Metrics

### 5.1 System Performance

| Metric               | Current       | Target (Phase 14) | Target (Phase 16) |
| -------------------- | ------------- | ----------------- | ----------------- |
| Devices monitored    | 1000+ (sim)   | 1000+ (real)      | 5000+             |
| Polling interval     | 30s           | 30s               | 10s               |
| Ingestion throughput | ~330 rows/min | ~3300 rows/min    | ~16500 rows/min   |
| p95 query latency    | Unknown       | <500ms            | <200ms            |
| Dashboard refresh    | 10s           | 10s               | 5s                |
| Alert response time  | Unknown       | <30s              | <15s              |

### 5.2 Operational Metrics

| Metric                   | Current          | Target                            |
| ------------------------ | ---------------- | --------------------------------- |
| CI/CD pipeline           | None             | GitHub Actions                    |
| Deploy time (flows.json) | ~5 min (manual)  | <1 min (automated)                |
| Rollback time            | ~10 min (manual) | <30s (automated)                  |
| Alert channels           | Placeholder      | LINE + Slack + Teams              |
| Documentation coverage   | Partial          | Full (RUNBOOK + ONBOARDING + API) |

### 5.3 Security Metrics

| Metric            | Current           | Target           |
| ----------------- | ----------------- | ---------------- |
| Node-RED auth     | None              | bcrypt adminAuth |
| SNMP version      | v2c               | v3 (Phase 17)    |
| Secret exposure   | GitHub PAT leaked | All rotated      |
| CVE response time | Unknown           | <24h             |

---

## 6. Implementation Priority Matrix

```text
                        HIGH IMPACT
                            │
           ┌────────────────┼────────────────┐
           │  P0: CI/CD     │  P0: K6 Stress │
           │  P0: Node-RED  │  P1: Real      │
           │    Auth        │    Servers     │
    EASY ──┼────────────────┼────────────────┼── HARD
           │  P1: Disk      │  P2: Pipeline  │
           │    Forecasting │    Self-Monitor│
           │  P1: Webhook   │  P2: SNMPv3    │
           │    Alerts      │                │
           └────────────────┼────────────────┘
                            │
                        LOW IMPACT
```

---

## 7. Timeline

| Phase        | ระยะเวลา    | งานหลัก                              | Deliverable                                |
| ------------ | ----------- | ------------------------------------ | ------------------------------------------ |
| **Phase 13** | สัปดาห์ 1–2 | CI/CD + Node-RED Auth                | GitHub Actions workflow + secure Node-RED  |
| **Phase 14** | สัปดาห์ 3–4 | K6 Stress + Real Servers + Webhooks  | Performance report + production deployment |
| **Phase 15** | เดือน 2     | Disk Forecasting + Advanced Features | Predictive panels + real alerts            |
| **Phase 16** | เดือน 3     | Self-Monitoring + Documentation      | Pipeline dashboard + full docs             |

---

## 8. Next Immediate Actions (สัปดาห์นี้)

| #   | Action                                     | Assignee | Due         | Blockers           |
| --- | ------------------------------------------ | -------- | ----------- | ------------------ |
| 1   | สร้าง `.github/workflows/deploy-flows.yml` | —        | วันจันทร์   | GitHub repo access |
| 2   | Generate bcrypt hash สำหรับ Node-RED       | —        | วันจันทร์   | Docker access      |
| 3   | ตั้งค่า `NODE_RED_ADMIN_*` ใน `.env`       | —        | วันอังคาร   | bcrypt hash จาก #2 |
| 4   | สร้าง K6 throughput stress script          | —        | วันพุธ      | —                  |
| 5   | รัน K6 stress test baseline                | —        | วันพฤหัสบดี | script จาก #4      |
| 6   | สร้าง `.env.production` template           | —        | วันศุกร์    | server IPs จริง    |

---

<div align="center">

**IMS Master Development Plan — Version 1.0**

_Created: 2026-08-04 | Author: Buffy (Freebuff AI)_

_Reviewed by: /brainstorming skill + project context analysis_

</div>
