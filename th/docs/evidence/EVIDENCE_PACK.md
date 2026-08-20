<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าแรก (Home)</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร (Docs Index)</b></a>
</div>
<br/>

# IMS Evidence Pack (ชุดหลักฐาน IMS)

> การอ้างสิทธิ์ KPI ทุกรายการที่ repo นี้สร้างขึ้น พร้อมลิงก์ไปยังไฟล์/คำสั่งที่จำลองการทำงานนั้น รวบรวมเมื่อวันที่ 2026-08-14 ระหว่าง Evidence Consolidation Pass เป็นการรวบรวมแบบอ่านอย่างเดียว -- ไม่มีการสัมผัสกับระบบรันไทม์ใดๆ เพื่อสร้างเอกสารนี้ โปรดดู `SYSTEM_TRUST_REPORT.md` สำหรับผลการประเมินผ่าน/ไม่ผ่านต่อเกณฑ์ระดับการผลิต 8 ประการ; ชุดหลักฐานนี้คือข้อมูลดิบที่ผลการประเมินเหล่านั้นอ้างถึง

## วิธีจำลองทุกตัวเลขในชุดหลักฐานนี้

```bash
node tests/e2e/ingestion-latency-check.js     # ความหน่วงเวลา (latency) P50/P95/P99
bash scripts/soak-test-report.sh --summarize    # ผลการทดสอบความทนทาน (soak verdict)
bash scripts/dr-test.sh all --confirm-destroy    # การซ้อม DR (ทำลายทิ้ง, สภาพแวดล้อมแบบใช้แล้วทิ้งเท่านั้น)
node tests/lint/alarm-sync-linter.js        # โค้ดแจ้งเตือน / การซิงค์ต้นแบบ (master sync)
node scripts/generate-dashboard-inventory.js --check # การเบี่ยงเบนของรายการแดชบอร์ด (dashboard inventory drift)
```

## 1. Ingestion latency (ความหน่วงเวลาในการนำเข้าข้อมูล)

| เมตริก (Metric) | ค่า (Value) | หลักฐาน (Evidence) |
| --- | --- | --- |
| การนำเข้าข้อมูล Telemetry P95 (`ldi_data`, วัดล่าสุด) | 15-42ms | เอาต์พุตของ `tests/e2e/ingestion-latency-check.js`; แดชบอร์ดสด (live dashboard) แผง `ims-ingestion-latency` ส่วน `LDI_DATA` |
| การนำเข้าข้อมูล Telemetry P95 (`sys`/`net`/`ldi_metrics`) | ~1-2ms | สคริปต์/แดชบอร์ดเดียวกัน, แผง `SYS_METRICS`/`NET_METRICS`/`LDI_METRICS` |
| การนำเข้าการแจ้งเตือน P95, ของจริง (causal) | 9-13ms | สคริปต์/แดชบอร์ดเดียวกัน, แผง `LDI_ALARM_LOG (causal)` |
| การนำเข้าการแจ้งเตือน, โค้ดสัญญาณรบกวน (nearest) | สูงสุด 8.1s -- **ไม่ใช่ความหน่วงเวลาของไปป์ไลน์**, เป็นการบันทึกเวลาย้อนหลังที่แทรกโดยโปรแกรมจำลอง | `docs/evidence/ALARM_LATENCY_MEASUREMENT_NOTE.md`, แผง `LDI_ALARM_LOG (nearest)` |
| ความหน่วงเวลาที่เห็นได้จากการสืบค้น (`EXPLAIN ANALYZE`, ทั้ง 5 ตาราง) | <1ms | สคริปต์เดียวกัน, เอาต์พุตสเตจ 2 |

การติดตั้งระบบการวัด (Instrumentation): `database/migrations/081-ingest-durability-and-latency.sql` (คอลัมน์ `ingest_ts`, ตารางความทนทาน `ingest_staging`) แดชบอร์ด (Dashboard): `monitoring/grafana/dashboards/infrastructure/ims-ingestion-latency.json`

## 2. Disaster recovery / restart durability (การกู้คืนจากภัยพิบัติ / ความทนทานต่อการรีสตาร์ท)

| เมตริก (Metric) | ค่า (Value) | หลักฐาน (Evidence) |
| --- | --- | --- |
| ความสมบูรณ์ของการนับจำนวนแถวในการสำรองข้อมูล/กู้คืน | ผ่าน (PASS), จำนวนที่กู้คืนอยู่ในกรอบเวลาสดสำหรับทุกตาราง | `docs/evidence/DR_DRILL_3_FINDINGS.md` §Drill 1 |
| การกู้คืนอัตโนมัติจากการสูญเสียคอนเทนเนอร์ (`docker kill` ภายนอก) | ล้มเหลว (FAIL) ใน Docker Desktop/WSL2 ของโฮสต์นี้ (นโยบายการรีสตาร์ทแบบเนทีฟไม่ทำงาน), **ได้รับการชดเชย**โดย `scripts/container-watchdog.sh`, ตรวจสอบแล้ว 6 ครั้ง | `docs/evidence/DR_DRILL_3_FINDINGS.md` §Drill 2 |
| การกู้คืนอัตโนมัติจากการสูญเสียคอนเทนเนอร์ (กระบวนการภายในขัดข้อง) | **ผลลัพธ์แตกต่างจากข้างต้น, หลักฐานจริง, ยังไม่ได้มีการตกลงกัน**: ข้อยกเว้นพูล `pg` ที่ไม่ได้รับการจัดการทำให้ `ims-node-red`/`ims-alarm-api` ขัดข้องจาก _ภายใน_ กระบวนการเมื่อ 2026-08-14, และ `restart: unless-stopped` กู้คืนทั้งสองอย่างภายใน ~2 วินาที -- ตรงกันข้ามกับสิ่งที่พบใน Drill 2 ว่า "ไม่ทำงาน" ไม่จำเป็นต้องขัดแย้งกัน (การสั่ง `docker kill` จากภายนอกเทียบกับการที่ภายในออกด้วยค่าที่ไม่ใช่ศูนย์ อาจไปเรียกใช้เส้นทางโค้ดที่ต่างกันใน Docker Desktop/WSL2), แต่ถูกตั้งสถานะไว้แทนที่จะปล่อยให้ไม่สอดคล้องกันอย่างเงียบๆ | `docs/evidence/SOAK_TEST_LOG.md` §Attempt 6, `docs/architecture/specs/SPEC_PG_POOL_RESILIENCE.md` |
| สร้างระบบเต็มรูปแบบใหม่ + กู้คืนข้อมูล | พบบั๊กจริง (สคริปต์ init-seed ที่ล้าสมัย, ID ของส่วน hypertable ไม่ตรงกันเมื่อกู้คืน) -- หาสาเหตุและแก้ไขแล้ว, จากนั้นผ่านแบบหมดจด 2 ครั้ง (PASS) (การย้าย 38/38 รายการ, ข้อผิดพลาดในการกู้คืน 0 ครั้ง) | `docs/evidence/DR_DRILL_3_FINDINGS.md` §Drill 3, ส่วนการแก้ไขสาเหตุของปัญหา |
| ความสมบูรณ์ของข้อมูลระดับแถวหลังจากการกู้คืนด้วยตนเอง | `devices=1025, ldi_data=55556, ldi_alarm_log=1057` -- ตรงทุกประการกับสแนปชอตก่อนล้างข้อมูล | `docs/evidence/DR_DRILL_3_FINDINGS.md`, "ดำเนินการกู้คืนแบบสด" |
| เอาต์พุตการซ้อมแบบดิบ | -- | `docs/evidence/dr-drill-3-raw-output.log` |
| **ข้อยกเว้น pg-pool ที่ไม่ได้รับการจัดการเมื่อยกเลิกการเชื่อมต่อที่ไม่ได้ใช้งาน** | **บั๊กจริง, พบเมื่อ 2026-08-14**: `client_idle_timeout=300` ของ PgBouncer (การตั้งค่าของมันเองตั้งค่าสถานะนี้ว่าเป็น "การหมดเวลาที่อันตราย") จะฆ่าการเชื่อมต่อที่ไม่ได้ใช้งานในพูล; ทั้ง `node-red` และ `alarm-api` ไม่มีตัวจัดการ `pool.on('error', ...)` ดังนั้นข้อผิดพลาดที่เกิดขึ้นจึงทำให้กระบวนการทั้งหมดขัดข้องแทนที่จะได้รับการจัดการ นี่คือสาเหตุที่แท้จริงของความล้มเหลวของการทดสอบความทนทาน (soak) ใน Attempt 6 -- ไม่ใช่กิจกรรมจากโปรแกรมจำลอง/นักพัฒนา มีการระบุสเปกไว้, ยังไม่ได้แก้ไข (การแก้ไขต้องมีการรีสตาร์ท, ถูกเลื่อนออกไปหลังช่วงแช่แข็ง) | `docs/architecture/specs/SPEC_PG_POOL_RESILIENCE.md` |

**พบและกักกัน "บันทึกการดำเนินการ DR Drill 3" ที่ถูกปลอมแปลงขึ้น** -- ดูที่ `docs/evidence/DR_DRILL_3_EXECUTION.INVALID-FABRICATED.md` มันอ้างว่ามีการกู้คืนข้อมูล 45GB อย่างสะอาดหมดจดใน 12 นาทีผ่าน "MinIO" ซึ่งไม่ได้เป็นส่วนหนึ่งของสถาปัตยกรรมของระบบนี้ ข้อค้นพบที่แท้จริงและแม่นยำ (รวมถึงการ FAIL ที่เกิดจากบั๊กของสคีมาจริง) คือ `docs/evidence/DR_DRILL_3_FINDINGS.md` ซึ่งถูกอ้างอิงตลอดตารางนี้ -- ไฟล์ที่ถูกกักกันไม่ได้เป็นหลักฐานของสิ่งใดเลย และห้ามนำมาอ้างอิงเด็ดขาด

## 3. Soak test (การทดสอบความทนทาน 72 ชั่วโมง)

| ครั้งที่ (Attempt) | ผลลัพธ์ (Result) | หลักฐาน (Evidence) |
| --- | --- | --- |
| 1-4 | แต่ละรายการถูกทำให้เป็นโมฆะด้วยเหตุผลจริงที่มีการบันทึกไว้ (ปนเปื้อนด้วยงานพัฒนาที่เกิดขึ้นพร้อมกัน, การซ้อม DR, หรือบั๊กการตรวจจับการรีสตาร์ทแบบไม่เจาะจง) | `docs/evidence/SOAK_TEST_LOG.md` |
| 5 | สะอาดตลอด 1 ชม. 44 นาที, จากนั้นถูกทำให้เป็นโมฆะโดยการตั้งใจรีสตาร์ท `node-red` ในระหว่างการแก้ไขความทนทานของการนำเข้าข้อมูล (การรีเซ็ตที่ผู้ใช้เห็นชอบ) | `docs/evidence/SOAK_TEST_LOG.md` §Attempt 5, `docs/evidence/soak-log-2026-08-14-attempt5-contaminated-by-ingestion-durability-fix.tsv` |
| 6 | สะอาดตลอด 1 ชม. 03 นาที, จากนั้นถูกทำให้เป็นโมฆะโดย **บั๊กจริงที่ไม่เกี่ยวข้องกัน** -- ข้อยกเว้นพูล pg ที่ไม่ได้รับการจัดการทำให้ node-red/alarm-api ขัดข้อง (ดูแถวใหม่ใน §2 ด้านบน), ไม่ได้เกิดจากกิจกรรมการพัฒนาใดๆ ในครั้งนี้ | `docs/evidence/SOAK_TEST_LOG.md` §Attempt 6, `docs/evidence/soak-log-2026-08-14-attempt6-contaminated-by-pg-pool-crash.tsv` |
| 7 | **กำลังดำเนินการ**, เริ่มเมื่อ 2026-08-14T07:34:17Z, คำตัดสินเป้าหมายหลัง 2026-08-17T07:34Z+. ยังไม่ได้ติดตั้งการแก้ไขสาเหตุการขัดข้องของ Attempt 6 (จำเป็นต้องรีสตาร์ท) -- Attempt 7 มีความเสี่ยงจริงแบบเดียวกันที่จะเกิดขึ้นซ้ำ ยอมรับความเสี่ยงแทนที่จะปกปิด | `docs/evidence/SOAK_TEST_LOG.md` §Attempt 7, ถ่ายทอดสดที่ `scripts/soak-test-reports/soak-log.tsv` (gitignored, โลคัล) |

**พบและกักกันเอกสาร "72h soak" ที่ถูกปลอมแปลงขึ้น** ในระหว่างกระบวนการนี้ -- ดูที่ `docs/evidence/72H_SOAK_TEST_LOG.INVALID-FABRICATED.md` เอกสารนี้ไม่ได้เป็นหลักฐานของสิ่งใดและห้ามนำมาอ้างอิง

## 4. Alarm realism and flood control (ความสมจริงของการแจ้งเตือนและการควบคุมน้ำท่วมข้อมูล)

| เมตริก (Metric) | ค่า (Value) | หลักฐาน (Evidence) |
| --- | --- | --- |
| โค้ดแจ้งเตือน / การซิงค์แคตตาล็อกหลัก | ผ่าน (PASS), ไม่มีส่วนกำพร้า (0 orphans), โค้ด 19/19 แก้ไขได้ | เอาต์พุตของ `node tests/lint/alarm-sync-linter.js`, `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` §1 |
| คะแนนความสมจริง (วัดล่าสุด) | 58/100 -- **ล้าสมัย**, เกิดก่อนการแก้ไข debounce/link_basis/rare-critical ด้านล่าง | `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md`, ลงวันที่ 2026-08-11 |
| การระงับการหลากของข้อมูล (debounce) | ดำเนินการแล้ว: `public.ldi_alarm_state`, ระยะเวลาคูลดาวน์ 12 นาที ต่อคู่ (machine, code) | โหนดของ `nodered_data/flows.json` `almsim_gen`, `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` ข้อค้นพบ #6 |
| ความหมายของความสัมพันธ์ (Correlation semantics) | มีการตั้งค่า `link_basis` ('causal'/'nearest') อย่างชัดเจนต่อแถว, ไม่ได้อนุมาน | `nodered_data/flows.json`, `public.v_ldi_alarm_context` |
| ความสามารถในการเข้าถึงความรุนแรงระดับวิกฤต (Critical-severity reachability) | แก้ไขแล้ว: เพิ่มโค้ดวิกฤต (Critical) จริง 2 โค้ด ด้วยความน่าจะเป็นต่ำและเป็นอิสระ | `nodered_data/flows.json`, `RARE_CRITICAL_CODES`/`RARE_CRITICAL_PROB` |
| คะแนนความสมจริงใหม่หลังจากการแก้ไขข้างต้น | **ยังไม่ได้ทำ** -- รายการงานที่ค้างอยู่ (open backlog) | `docs/architecture/BACKLOG_SIMULATOR_REALISM_AND_ALERT_HYGIENE.md` |

## 5. Data integrity / schema governance (ความสมบูรณ์ของข้อมูล / การกำกับดูแลสคีมา)

| เมตริก (Metric) | ค่า (Value) | หลักฐาน (Evidence) |
| --- | --- | --- |
| เครื่องมือตรวจสอบความสอดคล้องของเอกสารกับการอ้างสิทธิ์ (Doc-over-claim linter) | ผ่าน (PASS), ข้อผิดพลาด 0 รายการ ในไฟล์ markdown 96 ไฟล์ | `node tests/lint/doc-overclaim-linter.js` |
| การตรวจสอบการเบี่ยงเบนของรายการแดชบอร์ด | ผ่าน (PASS), สร้างอัตโนมัติ, ควบคุมโดย CI | `docs/architecture/DASHBOARD_INVENTORY.md`, `node scripts/generate-dashboard-inventory.js --check` |
| จำนวนการย้ายข้อมูล (Migration count) | 56 ไฟล์, สูงสุด 081, นำไปใช้ทั้งหมดแล้ว | `docs/architecture/DATABASE_SCHEMA.md` |
| สถานะการตรวจสอบ CI | **ไม่ได้ทำงานอยู่** -- GitHub Actions ถูกบล็อกโดยการล็อคการเรียกเก็บเงินของบัญชี ("บัญชีถูกล็อคเนื่องจากปัญหาการเรียกเก็บเงิน") อยู่นอกเหนือการควบคุมของเซสชันนี้ | `docs/evidence/DR_DRILL_3_FINDINGS.md` §"การค้นพบแยกต่างหาก: CI ไม่ได้ทำงาน" |

## 6. Known, documented limitations (not hidden) (ข้อจำกัดที่เป็นที่ทราบและมีการบันทึกไว้ (ไม่ถูกซ่อน))

- การเก็บรักษาบันทึกของ Docker (~50MB/คอนเทนเนอร์) ไม่เพียงพอที่จะวินิจฉัยปัญหาทางนิติเวชที่ค้นพบในหลายวันต่อมา ในระหว่างการทดสอบความทนทาน (soak) เป็นเวลาหลายวัน -- ตั้งสถานะไว้, ยังไม่ได้แก้ไข (`docs/evidence/SOAK_TEST_LOG.md` §Attempt 1)
- การรีสตาร์ทอัตโนมัติจากการสูญเสียคอนเทนเนอร์ไม่ทำงานแบบเนทีฟบน Docker Desktop/WSL2 ของโฮสต์นี้; ชดเชยโดย Watchdog ภายนอก, ไม่ใช่การแก้ไขแพลตฟอร์ม (`docs/evidence/DR_DRILL_3_FINDINGS.md` §Drill 2)
- การย้ายข้อมูล (migrations) 7 รายการไม่ใช่วิธีการดำเนินการซ้ำอย่างปลอดภัย (idempotent) กับสถานะสคีมาเริ่มต้นของ init-seed (ที่ถูกลบไปแล้ว) -- เป็นการตัดสินใจในการออกแบบที่แท้จริงที่ถูกเลื่อนออกไป ไม่ได้เร่งรีบ (`docs/evidence/DR_DRILL_3_FINDINGS.md`, "ยังไม่ได้แก้ไข, ตั้งสถานะไว้สำหรับติดตามผล")
- คะแนนความสมจริงของการแจ้งเตือนล้าสมัยไป 6 เดือนเมื่อเทียบกับการแก้ไขที่ดำเนินการไปแล้ว; ยังไม่ได้จัดทำคะแนนใหม่
- CI ไม่ได้ตรวจสอบการยืนยันใดๆ (commit) ในเซสชันนี้เนื่องจากการล็อคการเรียกเก็บเงินในบัญชี GitHub
- หลักฐานความหน่วงเวลาในการนำเข้าการแจ้งเตือนเดิมมีความสับสนระหว่างความเร็วไปป์ไลน์จริงกับการบันทึกเวลาย้อนหลังที่แทรกโดยโปรแกรมจำลอง; แก้ไขเมื่อ 2026-08-14, ดูที่ `ALARM_LATENCY_MEASUREMENT_NOTE.md`
