# Business Value & ROI Analysis

> **เอกสารสรุปผลกระทบทางธุรกิจสำหรับผู้บริหาร**
> โครงการ IMS — APEX Circuit
>
> **Corrected 2026-08-10:** the technical figures below (dashboard count, container count, alert rule count, load-test results, documentation count) have been updated to match the current system — the original figures were written before the LDI manufacturing dashboard suite existed and significantly undersold the platform as a result. The financial/ROI figures (staff hours, ฿ savings, payback period) are the original business inputs from this report's authors and are outside what this documentation pass can independently verify — treat them as the original business case, not re-audited numbers.

---

<div align="center">

![Value](https://img.shields.io/badge/Value-High%20Impact-brightgreen)
![ROI](https://img.shields.io/badge/ROI-850%25+-blue)
![License](https://img.shields.io/badge/Cost-Zero%20License-purple)

</div>

---

## 1. Executive Summary

**IMS** คือการเปลี่ยนผ่านจากระบบ **Manual Monitoring** สู่ **Real-time Automated Monitoring with AIOps** สำหรับเครื่องจักร YSPhotec / LDI ในสายการผลิต PCB

ระบบใช้สถาปัตยกรรม **Open-Source Stack** ที่ผ่าน Load Testing ระดับ **1,000 VUs** แบบ Zero Data Loss

---

## 2. Problem → Solution Matrix

### Before (ปัญหาเดิม)

| Problem                     | Impact                      | Daily Cost                     |
| --------------------------- | --------------------------- | ------------------------------ |
| **No Real-time Visibility** | ต้องเดินดูหน้าปัดเอง        | 2 staff × 4 rounds = 8 hrs/day |
| **Slow Downtime Detection** | 2-4 hours to detect failure | ของเสียสะสม                    |
| **Manual Data Entry**       | Human error ~15%            | ไม่สามารถ trend ได้            |
| **Reactive Maintenance**    | รอของเสียก่อนค่อยซ่อม       | Unplanned downtime             |

### ![Healthy](https://img.shields.io/badge/Status-Healthy-brightgreen) After (วิธีแก้ปัญหา)

| Solution                         | Result                                                                                                                                                                                                                                                  | Impact                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Real-time SNMP Polling**       | ทุก 30 วินาที อัตโนมัติ 100%                                                                                                                                                                                                                            | Zero manual effort                                                           |
| **Z-Score Statistical Alerting** | ตรวจจับ 3σ anomaly ก่อนเครื่องเสีย                                                                                                                                                                                                                      | Proactive maintenance                                                        |
| **13 Dashboards**                | 5 infrastructure (NOC, Engineering Drill-Down, Capacity, Meta-Monitoring, Ingestion Latency) + 8 manufacturing (Easy Overview, Alarm Console, Alarm Dictionary, Engineering Analytics, Machine Snapshot, Manufacturing, Operator Andon, Data Readiness) | Full visibility across both infrastructure and the manufacturing line itself |
| **LINE/Teams Webhooks**          | Alert formatting and delivery-attempt logic is complete and correct; real delivery requires operator-configured credentials (`LINE_CHANNEL_ACCESS_TOKEN`, `TEAMS_WEBHOOK_URL`) not shipped in this repo                                                 | Faster response once configured                                              |
| **Predictive Analytics**         | Linear regression forecasting                                                                                                                                                                                                                           | Prevent failures                                                             |

---

## 3. ROI Metrics

### Before vs After Comparison

| Metric                  | Before (Manual)            | After (IMS)              | Improvement             |
| ----------------------- | -------------------------- | ------------------------ | ----------------------- |
| **Time to Detect**      | 1-4 hours                  | **< 10 seconds**         | 99.97% faster           |
| **Mean Time to Repair** | > 2 hours                  | **~15 minutes**          | 87.5% reduction         |
| **Manual Labor**        | 8 hrs/day (2 staff)        | **0 hrs/day**            | 2,920 hrs/year saved    |
| **Data Accuracy**       | ~85% (human error)         | **99.9%**                | +17.5% accuracy         |
| **Data Granularity**    | 6 readings/day             | **2,880 readings/day**   | 480x more data          |
| **Maintenance Mode**    | Reactive (fix when broken) | **Predictive (prevent)** | Zero unplanned downtime |

### Annual Cost Savings

| Category                 | Before                      | After            | Savings/Year   |
| ------------------------ | --------------------------- | ---------------- | -------------- |
| **License Fees**         | ฿3,000,000-10,000,000       | ฿0 (Open-Source) | **฿3-10M**     |
| **Manual Labor**         | ฿730,000 (2,920 hrs × ฿250) | ฿0               | **฿730K**      |
| **Downtime Cost**        | ฿500,000/incident × N       | Near zero        | **฿2-5M**      |
| **Total Annual Savings** |                             |                  | **฿5.7-15.7M** |

### Payback Period

```text
Initial Investment: ~฿200,000 (intern labor + compute)
Annual Savings: ~฿5,700,000 (conservative)
Payback Period: < 1 month
ROI: 2,750% (Year 1)
```

---

## 4. Technical Achievements

| Component            | Delivered                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Docker Stack**     | 10 containers, fully orchestrated                                                                                                                                                                                                                |
| **Telemetry Schema** | Two independent pipelines — infrastructure (`sys_metrics`/`net_metrics`/`ldi_metrics`) and LDI manufacturing (`ldi_data`, 34 columns: PE1-6, JE1-4, thickness, scan_speed, resist_dosage, and more) — see `docs/architecture/DATABASE_SCHEMA.md` |
| **Alert Rules**      | 30 rules: 6 LDI-specific + 11 infrastructure (Grafana native), 13 pipeline/platform meta-monitoring rules (Prometheus/Alertmanager)                                                                                                              |
| **Dashboards**       | 13 dashboards (5 infrastructure + 8 manufacturing)                                                                                                                                                                                               |
| **Load Test**        | Up to 1,000 VUs (`chaos-stress.js`, deliberate 5% fault injection, >90% success threshold); `pipeline-stress.js` targets >95% success — not a 0%-failure guarantee, a defined acceptable-failure budget                                          |
| **CI/CD**            | GitHub Actions with security scanning (Gitleaks)                                                                                                                                                                                                 |
| **Documentation**    | 40+ documents across architecture, operations, user/admin manuals, and enterprise guides                                                                                                                                                         |

---

## 5. Internship Learning Outcomes

### Skills Acquired by Interns

| Category          | Skills                                                     |
| ----------------- | ---------------------------------------------------------- |
| **Architecture**  | 4-Layer Architecture, Microservices, Docker                |
| **Network**       | SNMP Protocol, MIB/OID, Counter Wrap Management            |
| **Database**      | TimescaleDB, PostgreSQL, Continuous Aggregates, PgBouncer  |
| **Visualization** | Grafana Dashboard Design, SRE Color Convention             |
| **Alerting**      | Prometheus, Alertmanager, Z-Score, Predictive Analytics    |
| **CI/CD**         | GitHub Actions, Automated Testing, Security Scanning       |
| **Testing**       | K6 Load Testing, Chaos Engineering, Performance Tuning     |
| **DevOps**        | Infrastructure as Code, Monitoring-as-Code, SRE Principles |

### Value of Trained Personnel

> นักศึกษาฝึกงานได้เรียนรู้ **กระบวนการพัฒนาซอฟต์แวร์ทางวิศวกรรมเต็มรูปแบบ** ตั้งแต่ Architecture → Development → Testing → Deployment → Monitoring

---

## 6. Strategic Value

| Dimension       | Value                               |
| --------------- | ----------------------------------- |
| **Operational** | ลด MTTR จาก 2 ชั่วโมง เหลือ 15 นาที |
| **Financial**   | ประหยัด ฿5.7-15.7M ต่อปี            |
| **Knowledge**   | สร้าง documentation suite ครบถ้วน   |
| **Scalability** | รองรับ 1-1,000+ machines            |
| **Compliance**  | Audit trail, SLA reporting ready    |

---

<div align="center">

**Prepared by:** MIS-G Department & Internship Team
**Project:** IMS (Infrastructure Monitoring System) — APEX Circuit
**Date:** June 2026

</div>
