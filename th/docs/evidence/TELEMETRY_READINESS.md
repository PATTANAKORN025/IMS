> [!NOTE]
> **การแปลอัตโนมัติ / ข้อมูลเชิงลึกทางเทคนิค**
> เอกสารฉบับนี้เป็นรายงานหลักฐาน/การตรวจสอบทางเทคนิคเชิงลึก (Audit/Evidence) ซึ่งปัจจุบันอ้างอิงเนื้อหาต้นฉบับภาษาอังกฤษเป็นหลัก (English-first) เพื่อรักษาความถูกต้องของคำศัพท์เฉพาะทาง 

<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Real 23-Device Telemetry Readiness

Run: 2026-08-21. HEAD at time of check: `607631a`.

## The question

23 LDI devices are registered (`public.devices`, `device_type='ldi', enabled=true`); only 10
(`LDI-01`..`LDI-10`) currently produce telemetry, via `nodered_data/flows/ldi_simulator.json`'s embedded
calibration table, which only knows those 10 IDs. That's the simulator -- intentionally not extended or
touched, since fabricating data for the other 13 would misrepresent them as real. The real question: if
actual factory hardware started sending real telemetry for the other 13 devices today, would it flow
through the existing pipeline correctly, or is there a hardcoded blocker somewhere that would need a code
change first?

No telemetry was fabricated or inserted anywhere -- live or isolated -- to answer this. This is a structural
verification of the pipeline's own code and constraints, not a data-generation exercise.

## Findings

**Real ingestion entry point:** `nodered_data/flows/ldi_ingestion.json`, HTTP POST `/ldi-telemetry`, handled
by the `ldi_auth_check` function node -- a separate flow from the simulator. The simulator itself is just
one client that POSTs to this same endpoint with the same `x-api-key` header real hardware would use; it has
no special-cased path. The only per-item validation is `if (!item || !item.eqp_id) continue;` -- any string
`eqp_id` is accepted and batched for insert. **No device-ID allowlist or mapping exists in the ingestion
code.**

**The real gate is the database FK constraint**, `database/migrations/055-ldi-device-fk-constraints.sql`:
`ldi_data.eqp_id → public.devices(device_id)` and `ldi_alarm_log.equipmentid → public.devices(device_id)`
(confirmed independently against the live schema: `ldi_data_eqp_id_fkey FOREIGN KEY (eqp_id) REFERENCES
devices(device_id) ON DELETE CASCADE`). Since all 23 devices are already registered, this FK accepts
telemetry for any of them; a genuinely unregistered device gets a clean FK-violation error, not silent
dropping.

**Secondary ingestion path** (`nodered_data/flows/ingestion.json`, SNMP polling) also has no hardcoded
device list -- its `device_registry` function node reloads targets every 5 minutes via `SELECT device_id ...
FROM public.devices WHERE enabled = true`.

**Consumers checked, no blockers:**
- `services/factory-twin-3d/server.js` -- fixed this session (`94c7999`), dynamic discovery.
- `services/alarm-api/server.js` -- no device filtering at all.
- Grafana dashboards' `machine_id` template variable -- `SELECT DISTINCT eqp_id FROM public.ldi_data`,
  self-populating, picks up new devices automatically once they report.

**One disclosed, deliberately untouched exception:** `monitoring/grafana/dashboards/manufacturing/
ims-ldi-factory-digital-twin.json` (the 2D Digital Twin, not the 3D app fixed this session) hardcodes 10
static panel shapes named `machine-LDI-01-body` through `machine-LDI-10-body`. This is a Grafana dashboard
layout -- explicitly out of scope this session ("do not change Grafana layout," "preserve the existing
1080p/TV-wall no-scroll design"). It would need dedicated design work to extend to 13 more machines
visually; it does not affect ingestion, storage, or any other dashboard/consumer.

## Verdict

**GO for pipeline readiness.** For all 13 currently-silent devices, real telemetry POSTed with their
registered `eqp_id` would be accepted and stored correctly today, with zero pipeline code changes. The only
remaining gap is the real factory data source itself (hardware/integration, not code) and the one disclosed
2D-twin visual limit (a design task, explicitly deferred, not a pipeline defect).
