# Dashboard Performance Final

**Owner:** Person 1 — Dashboard / Grafana / UX / Traceability  
**Environment:** Friend IMS isolated preview (`http://localhost:3300`)  
**Status:** NOT YET SIGNED OFF  
**Last verified:** 2026-08-21

## Objective

วัดเวลาตอบสนองของ Dashboard และ Query โดยรายงาน p50, p95 และ max พร้อมหลักฐานจาก Browser session, Grafana logs และฐานข้อมูล

## Acceptance targets

| Test | Target |
|---|---:|
| Dashboard status visible | ภายใน 3 วินาที |
| Query p50 | กำหนดหลังเก็บ baseline |
| Query p95 | กำหนดหลังเก็บ baseline |
| Query max | ต้องไม่มี timeout |
| Browser console | ไม่มี datasource/plugin/runtime error |
| Grafana server | ไม่มี HTTP 5xx จาก Dashboard query |

## Test matrix

| Viewport | Status | Evidence |
|---|---|---|
| 1280 px | PENDING | — |
| 1366 px | PENDING | — |
| 1440 px | PENDING | — |
| 4K | PENDING | — |
| TV Wall / kiosk | PENDING | — |

## Runtime baseline

- Grafana health: `database=ok`
- Grafana version: `13.1.1`
- Core containers: healthy/running at the latest inspection
- Recent Grafana logs: no Dashboard query HTTP 500 detected during the inspected window

## Measurements

| Dashboard | p50 | p95 | max | Result |
|---|---:|---:|---:|---|
| IMS NOC Overview | PENDING | PENDING | PENDING | NOT TESTED |
| IMS Engineering Drill-Down | PENDING | PENDING | PENDING | NOT TESTED |
| IMS AIOps & Capacity Forecast | PENDING | PENDING | PENDING | NOT TESTED |
| IMS Pipeline Health & Meta-Monitoring | PENDING | PENDING | PENDING | NOT TESTED |
| IMS Ingestion Latency | PENDING | PENDING | PENDING | NOT TESTED |
| Manufacturing dashboards | PENDING | PENDING | PENDING | NOT TESTED |

## Required evidence before sign-off

- [ ] Raw query timing export
- [ ] Browser navigation/load timing
- [ ] Grafana server logs covering the test window
- [ ] Screenshot at every required viewport
- [ ] Test date, commit SHA and database snapshot time
- [ ] Retest after cache-cold restart

> This document intentionally does not claim a performance PASS until measurements and evidence are attached.
